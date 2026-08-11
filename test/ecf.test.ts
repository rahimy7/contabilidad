import { beforeAll, afterAll, beforeEach, it, expect, describe } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { FiscalDocumentService } from "../server/fiscal/document-service";
import { buildEcfXml, buildQrUrl } from "../server/fiscal/ecf/xml-builder";
import { DevEcfSigner } from "../server/fiscal/ecf/dev-signer";
import { DgiiTestGateway } from "../server/fiscal/ecf/test-gateway";
import { EcfService } from "../server/fiscal/ecf/ecf-service";
import type { EcfDocument } from "../server/fiscal/ecf/types";

neonConfig.webSocketConstructor = ws;

// ── pure units: no database ─────────────────────────────────────────────────

describe("e-CF XML builder and signer (pure)", () => {
  const doc: EcfDocument = {
    tipoECF: "31",
    eNCF: "E310000000001",
    issuerRnc: "130999888",
    issuerName: "HTTP <SRL> & Co", // characters that must be escaped
    buyerRnc: "131000001",
    buyerName: "Cliente Uno",
    emittedAt: "2026-03-14",
    currency: "DOP",
    totals: {
      gravadoTotal: "1000.00",
      gravado18: "1000.00",
      gravado16: "0",
      exento: "0",
      itbis18: "180.00",
      itbis16: "0",
      totalItbis: "180.00",
      montoTotal: "1180.00",
    },
    lines: [
      { lineNo: 1, name: "Producto A", indicadorFacturacion: 1, quantity: "2", unitPrice: "500.00", amount: "1000.00" },
    ],
  };

  it("builds well-formed XML with escaped content and DGII date format", () => {
    const xml = buildEcfXml(doc);
    expect(xml).toContain("<eNCF>E310000000001</eNCF>");
    expect(xml).toContain("<RNCEmisor>130999888</RNCEmisor>");
    expect(xml).toContain("<FechaEmision>14-03-2026</FechaEmision>"); // dd-MM-yyyy
    expect(xml).toContain("<MontoTotal>1180.00</MontoTotal>");
    expect(xml).toContain("HTTP &lt;SRL&gt; &amp; Co"); // escaped
    // Every opened tag closes: a crude balance check catches gross malformation.
    // `<[A-Za-z]` matches opening tags only (a closing tag is `</`), so in
    // well-formed XML the two counts are equal.
    const opens = (xml.match(/<[A-Za-z]/g) || []).length;
    const closes = (xml.match(/<\//g) || []).length;
    expect(opens).toBe(closes);
  });

  it("signs and the signature verifies against the signing key", async () => {
    const signer = new DevEcfSigner();
    const xml = buildEcfXml(doc);
    const signed = await signer.sign(xml, {});
    expect(signed.securityCode).toMatch(/^[A-Za-z0-9]{6}$/);
    expect(signed.xml).toContain("<SignatureValue>");
    expect(signed.xml).toContain(`<CodigoSeguridad>${signed.securityCode}</CodigoSeguridad>`);
    expect(signer.verify(signed.xml)).toBe(true);
  });

  it("detects a tampered document: the signature no longer verifies", async () => {
    const signer = new DevEcfSigner();
    const signed = await signer.sign(buildEcfXml(doc), {});
    const tampered = signed.xml.replace("1180.00", "9999.00");
    expect(signer.verify(tampered)).toBe(false);
  });

  it("builds a QR URL carrying the fields a recipient verifies", () => {
    const url = buildQrUrl({
      baseUrl: "https://ecf.dgii.gov.do/consulta",
      issuerRnc: "130999888",
      buyerRnc: "131000001",
      eNCF: "E310000000001",
      montoTotal: "1180.00",
      fechaEmision: "2026-03-14",
      securityCode: "AB12cd",
    });
    expect(url).toContain("RncEmisor=130999888");
    expect(url).toContain("ENCF=E310000000001");
    expect(url).toContain("CodigoSeguridad=AB12cd");
    expect(url).toContain("FechaEmision=14-03-2026");
  });
});

// ── integration: the state machine over a real document ─────────────────────

describeIntegration("e-CF transmission lifecycle", () => {
  let pool: Pool;
  let companyId: number;
  const RNC = "130555444";
  const YEAR = new Date().getUTCFullYear();
  const MONTH = new Date().getUTCMonth() + 1;
  const DATE = `${YEAR}-${String(MONTH).padStart(2, "0")}-16`;

  const deps = (gateway: DgiiTestGateway) => ({
    signer: new DevEcfSigner(),
    gateway,
    identity: {},
    qrBaseUrl: "https://ecf.dgii.gov.do/consulta",
  });

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(
      `INSERT INTO companies (legal_name, rnc) VALUES ('ECF SRL', $1) RETURNING id`,
      [RNC],
    );
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);
  });

  afterAll(async () => {
    if (companyId) {
      await pool.query(`DELETE FROM fiscal_documents WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM fiscal_documents WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM ncf_sequences WHERE company_id=$1`, [companyId]);
    // E31 = crédito fiscal electrónico; 10-digit sequence.
    await pool.query(
      `INSERT INTO ncf_sequences (company_id, ncf_type, is_ecf, range_from, range_to, next_number)
       VALUES ($1,'E31',true,1,100,1)`,
      [companyId],
    );
  });

  async function issueEcf() {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const doc = await new FiscalDocumentService(client).issueInvoice({
        companyId,
        issuerRnc: RNC,
        ncfType: "E31",
        date: DATE,
        buyerRnc: "131000001",
        buyerName: "Cliente Uno",
        lines: [{ description: "Servicio X", quantity: "1", unitPrice: "1000.00", taxCode: "ITBIS18" }],
      });
      await client.query("COMMIT");
      return doc;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  it("issuing an e-CF marks it pendiente and formats a 13-char eNCF", async () => {
    const doc = await issueEcf();
    expect(doc.ncf).toBe("E310000000001");
    expect(doc.ncf).toHaveLength(13);
    const row = await pool.query(`SELECT is_ecf, ecf_status FROM fiscal_documents WHERE id=$1`, [
      doc.documentId,
    ]);
    expect(row.rows[0].is_ecf).toBe(true);
    expect(row.rows[0].ecf_status).toBe("pendiente");
  });

  it("transmits to an accepting DGII and records the transitions", async () => {
    const doc = await issueEcf();
    const svc = new EcfService(pool, deps(new DgiiTestGateway({ outcome: "aceptado" })));
    const { ecfStatus, trackId } = await svc.transmit(companyId, doc.documentId);
    expect(ecfStatus).toBe("aceptado");
    expect(trackId).toBeTruthy();

    const row = await pool.query(
      `SELECT ecf_status, xml_signed IS NOT NULL AS signed, security_code, track_id, qr_url
         FROM fiscal_documents WHERE id=$1`,
      [doc.documentId],
    );
    expect(row.rows[0].ecf_status).toBe("aceptado");
    expect(row.rows[0].signed).toBe(true);
    expect(row.rows[0].security_code).toMatch(/^[A-Za-z0-9]{6}$/);
    expect(row.rows[0].track_id).toBeTruthy();
    expect(row.rows[0].qr_url).toContain("E310000000001");

    const events = await pool.query(
      `SELECT to_status FROM fiscal_document_events WHERE document_id=$1 ORDER BY id`,
      [doc.documentId],
    );
    expect(events.rows.map((r) => r.to_status)).toEqual(["firmado", "aceptado"]);
  });

  it("records a DGII rejection", async () => {
    const doc = await issueEcf();
    const svc = new EcfService(pool, deps(new DgiiTestGateway({ rejectIfContains: "E310000000001" })));
    const { ecfStatus } = await svc.transmit(companyId, doc.documentId);
    expect(ecfStatus).toBe("rechazado");
    const row = await pool.query(`SELECT ecf_status FROM fiscal_documents WHERE id=$1`, [doc.documentId]);
    expect(row.rows[0].ecf_status).toBe("rechazado");
  });

  it("falls to contingency when DGII is unreachable, without losing the signature", async () => {
    const doc = await issueEcf();
    const svc = new EcfService(pool, deps(new DgiiTestGateway({ unavailable: true })));
    const { ecfStatus } = await svc.transmit(companyId, doc.documentId);
    expect(ecfStatus).toBe("en_contingencia");

    const row = await pool.query(
      `SELECT ecf_status, contingency, xml_signed IS NOT NULL AS signed FROM fiscal_documents WHERE id=$1`,
      [doc.documentId],
    );
    expect(row.rows[0].contingency).toBe(true);
    // The document was signed before the outage; a retry must not re-sign.
    expect(row.rows[0].signed).toBe(true);
  });

  it("recovers from contingency: a retry against a healthy DGII gets accepted", async () => {
    const doc = await issueEcf();
    await new EcfService(pool, deps(new DgiiTestGateway({ unavailable: true }))).transmit(companyId, doc.documentId);

    const before = await pool.query(`SELECT security_code FROM fiscal_documents WHERE id=$1`, [doc.documentId]);
    const { ecfStatus } = await new EcfService(pool, deps(new DgiiTestGateway({ outcome: "aceptado" }))).transmit(
      companyId,
      doc.documentId,
    );
    const after = await pool.query(`SELECT security_code FROM fiscal_documents WHERE id=$1`, [doc.documentId]);

    expect(ecfStatus).toBe("aceptado");
    // Same signature reused across the retry — the security code did not change.
    expect(after.rows[0].security_code).toBe(before.rows[0].security_code);
  });

  it("does not re-transmit a document already accepted", async () => {
    const doc = await issueEcf();
    const svc = new EcfService(pool, deps(new DgiiTestGateway({ outcome: "aceptado" })));
    await svc.transmit(companyId, doc.documentId);
    const again = await svc.transmit(companyId, doc.documentId);
    expect(again.ecfStatus).toBe("aceptado");
    const events = await pool.query(
      `SELECT count(*)::int c FROM fiscal_document_events WHERE document_id=$1 AND to_status='aceptado'`,
      [doc.documentId],
    );
    expect(events.rows[0].c).toBe(1); // not accepted twice
  });
});
