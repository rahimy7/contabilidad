import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { FiscalDocumentService } from "../server/fiscal/document-service";
import { EcfService, EcfValidationError } from "../server/fiscal/ecf/ecf-service";
import { DgiiSimulatorGateway } from "../server/fiscal/ecf/simulator-gateway";
import { DevEcfSigner } from "../server/fiscal/ecf/dev-signer";
import { saveEcfSettings, loadEcfSettings } from "../server/fiscal/ecf/ecf-config";
import { receiveEcf, approveReceived, buildAcknowledgement, listReceived } from "../server/fiscal/ecf/ecf-inbox";
import { voidSequenceRange, fileRfce } from "../server/fiscal/ecf/ecf-summaries";
import { buildEcfXml } from "../server/fiscal/ecf/xml-builder";
import { parseEcfXml } from "../server/fiscal/ecf/xml-parser";
import { validateEcf } from "../server/fiscal/ecf/validator";
import { representationOf } from "../server/fiscal/ecf/representation";

neonConfig.webSocketConstructor = ws;

/**
 * El ciclo completo de un e-CF contra el simulador.
 *
 * Lo que se prueba no es que el código corra, sino que el módulo se comporte
 * como se comporta DGII: que un comprobante inválido no llegue a gastar un eNCF,
 * que "recibido" no sea lo mismo que "aceptado", que un reenvío no facture dos
 * veces, y que una caída de red sea contingencia y no un error.
 */
describeIntegration("e-CF: ciclo completo contra el simulador DGII", () => {
  let pool: Pool;
  let companyId: number;
  const RNC = "130999111";
  const BUYER_RNC = "131222333";
  const YEAR = new Date().getUTCFullYear();
  const M = String(new Date().getUTCMonth() + 1).padStart(2, "0");
  const DATE = `${YEAR}-${M}-12`;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await purgeCompany(RNC);
    companyId = (
      await pool.query(
        `INSERT INTO companies (legal_name, rnc) VALUES ('eCF Pruebas SRL',$1) RETURNING id`,
        [RNC],
      )
    ).rows[0].id;
    await seedCompanyDefaults(pool, companyId);
  });

  afterAll(async () => {
    await purgeCompany(RNC);
    await pool.end();
  });

  /**
   * Borra una empresa de prueba y todo lo que cuelga de ella, en orden de
   * dependencias.
   *
   * Un simple `DELETE FROM companies` no alcanza: `journal_entries.company_id`
   * es RESTRICT, así que una corrida interrumpida —la que se mató a mitad—
   * deja asientos que bloquean el borrado y envenenan todas las corridas
   * siguientes. Que la preparación limpie los restos es lo que hace que la
   * suite se pueda volver a correr después de un crash sin intervención manual.
   */
  async function purgeCompany(rnc: string) {
    const { rows } = await pool.query(`SELECT id FROM companies WHERE rnc=$1`, [rnc]);
    for (const row of rows) {
      const id = Number(row.id);
      await purgeCompanyData(id);
      for (const t of [
        "ecf_config", "posting_rules", "accounting_periods", "retention_rules",
        "user_companies", "bank_accounts",
      ]) {
        await pool.query(`DELETE FROM ${t} WHERE company_id=$1`, [id]).catch(() => {});
      }
      // tax_rates cuelga de tax_codes, no de la empresa.
      await pool.query(
        `DELETE FROM tax_rates WHERE tax_code_id IN (SELECT id FROM tax_codes WHERE company_id=$1)`,
        [id],
      ).catch(() => {});
      await pool.query(`DELETE FROM tax_codes WHERE company_id=$1`, [id]).catch(() => {});
      await pool.query(`DELETE FROM chart_of_accounts WHERE company_id=$1`, [id]).catch(() => {});
      await pool.query(`DELETE FROM companies WHERE id=$1`, [id]);
    }
    await pool.query(`DELETE FROM ecf_simulator_inbox WHERE issuer_rnc=$1`, [rnc]);
  }

  /**
   * Los datos transaccionales, que también se limpian entre pruebas.
   *
   * Las líneas del asiento no se borran aparte: cascadean al borrar el asiento,
   * y quitarlas por su cuenta deja un asiento posteado sin líneas, que es lo que
   * el trigger diferido de balance prohíbe.
   */
  async function purgeCompanyData(id: number) {
    await pool.query(
      `DELETE FROM fiscal_document_events WHERE document_id IN
         (SELECT id FROM fiscal_documents WHERE company_id=$1)`,
      [id],
    );
    for (const t of [
      "ecf_transmissions", "ecf_received", "ecf_sequence_voids",
      "fiscal_document_lines", "fiscal_documents", "ncf_sequences", "journal_entries",
    ]) {
      await pool.query(`DELETE FROM ${t} WHERE company_id=$1`, [id]);
    }
  }

  async function cleanup() {
    await purgeCompanyData(companyId);
    await pool.query(`DELETE FROM ecf_simulator_inbox WHERE issuer_rnc=$1`, [RNC]);
  }

  beforeEach(async () => {
    await cleanup();
    await withTx(async (c) => {
      await saveEcfSettings(c, companyId, {
        environment: "simulated", isEnabled: true, issuerRnc: RNC, issuerName: "eCF Pruebas SRL",
      });
      // Un rango de E31 para que el asignador tenga de dónde sacar números.
      await c.query(
        `INSERT INTO ncf_sequences (company_id, ncf_type, is_ecf, range_from, range_to, next_number)
         VALUES ($1,'E31',true,1,1000,1)`,
        [companyId],
      );
    });
  });

  async function withTx<T>(fn: (c: any) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // El simulador y la configuración leen `current_company_id()`.
      await client.query("SELECT set_config('app.company_id', $1, true)", [String(companyId)]);
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  /** Emite una factura de crédito fiscal E31 y devuelve su id. */
  async function issueInvoice(overrides: Partial<{ buyerRnc: string; unitPrice: string }> = {}) {
    return withTx(async (c) => {
      const doc = await new FiscalDocumentService(c).issueInvoice({
        companyId,
        issuerRnc: RNC,
        ncfType: "E31",
        date: DATE,
        buyerRnc: overrides.buyerRnc ?? BUYER_RNC,
        buyerName: "Cliente Prueba SRL",
        bookCogs: false,
        lines: [
          {
            description: "Servicio de prueba",
            quantity: "1",
            unitPrice: overrides.unitPrice ?? "1000",
            taxCode: "ITBIS18",
          },
        ],
      });
      return doc.documentId;
    });
  }

  /** Un servicio con simulador configurable, para forzar caídas o veredictos. */
  const serviceWith = (c: any, opts: any = {}) =>
    new EcfService(c, {
      signer: new DevEcfSigner(),
      gateway: new DgiiSimulatorGateway(c, { resolveAfterMs: 0, ...opts }),
      identity: { rnc: RNC },
      qrBaseUrl: "https://ecf.dgii.gov.do/ecf/consultatimbrefc",
    });

  // ── XML y validación ───────────────────────────────────────────────────────

  it("el XML que construye se puede volver a leer sin perder nada", () => {
    const doc = {
      tipoECF: "31", eNCF: "E310000000001", issuerRnc: RNC, issuerName: "eCF Pruebas SRL",
      buyerRnc: BUYER_RNC, buyerName: "Cliente & Cía <SRL>", emittedAt: DATE, currency: "DOP",
      totals: {
        gravadoTotal: "1000", gravado18: "1000", gravado16: "0", exento: "0",
        itbis18: "180", itbis16: "0", totalItbis: "180", montoTotal: "1180",
      },
      lines: [{
        lineNo: 1, name: "Servicio", indicadorFacturacion: 1 as const,
        quantity: "1", unitPrice: "1000", amount: "1000",
      }],
    };
    const xml = buildEcfXml(doc);
    const back = parseEcfXml(xml)!;

    expect(back.eNCF).toBe("E310000000001");
    expect(back.issuerRnc).toBe(RNC);
    // El escape y su vuelta: si esto se rompe, el XML es inválido para DGII.
    expect(back.buyerName).toBe("Cliente & Cía <SRL>");
    expect(back.totals.montoTotal).toBe("1180.00");
    expect(back.lines).toHaveLength(1);
  });

  it("rechaza un comprobante cuyos totales no cuadran con sus líneas", () => {
    const r = validateEcf({
      tipoECF: "31", eNCF: "E310000000001", issuerRnc: RNC, issuerName: "X",
      buyerRnc: BUYER_RNC, emittedAt: DATE, currency: "DOP",
      totals: {
        gravadoTotal: "1000", gravado18: "1000", gravado16: "0", exento: "0",
        itbis18: "180", itbis16: "0", totalItbis: "180", montoTotal: "1180",
      },
      // La línea dice 500, el encabezado dice 1000.
      lines: [{ lineNo: 1, name: "S", indicadorFacturacion: 1, quantity: "1", unitPrice: "500", amount: "500" }],
    });
    expect(r.valid).toBe(false);
    expect(r.messages.some((m) => m.code === "TOT-05")).toBe(true);
  });

  it("una factura de crédito fiscal sin RNC del comprador es inválida", () => {
    const r = validateEcf({
      tipoECF: "31", eNCF: "E310000000001", issuerRnc: RNC, issuerName: "X",
      emittedAt: DATE, currency: "DOP",
      totals: {
        gravadoTotal: "100", gravado18: "100", gravado16: "0", exento: "0",
        itbis18: "18", itbis16: "0", totalItbis: "18", montoTotal: "118",
      },
      lines: [{ lineNo: 1, name: "S", indicadorFacturacion: 1, quantity: "1", unitPrice: "100", amount: "100" }],
    });
    expect(r.valid).toBe(false);
    expect(r.messages.some((m) => m.code === "COMP-01")).toBe(true);
  });

  it("una factura de consumo de RD$250,000 o más exige identificar al comprador", () => {
    const base = {
      tipoECF: "32", eNCF: "E320000000001", issuerRnc: RNC, issuerName: "X",
      emittedAt: DATE, currency: "DOP",
      totals: {
        gravadoTotal: "300000", gravado18: "300000", gravado16: "0", exento: "0",
        itbis18: "54000", itbis16: "0", totalItbis: "54000", montoTotal: "354000",
      },
      lines: [{
        lineNo: 1, name: "S", indicadorFacturacion: 1 as const,
        quantity: "1", unitPrice: "300000", amount: "300000",
      }],
    };
    expect(validateEcf(base).messages.some((m) => m.code === "COMP-02")).toBe(true);
    expect(validateEcf({ ...base, buyerRnc: BUYER_RNC }).valid).toBe(true);
  });

  // ── emisión ────────────────────────────────────────────────────────────────

  it("firma, transmite y DGII lo acepta", async () => {
    const id = await issueInvoice();
    const out = await withTx((c) => serviceWith(c).transmit(companyId, id));

    expect(out.ecfStatus).toBe("aceptado");
    expect(out.trackId).toBeTruthy();

    const { rows } = await pool.query(
      `SELECT ecf_status::text, security_code, qr_url, xml_signed IS NOT NULL AS signed, track_id
         FROM fiscal_documents WHERE id=$1`,
      [id],
    );
    expect(rows[0].ecf_status).toBe("aceptado");
    expect(rows[0].signed).toBe(true);
    expect(rows[0].security_code).toHaveLength(6);
    // El QR tiene que llevar lo que DGII necesita para la consulta.
    expect(rows[0].qr_url).toContain("RncEmisor=" + RNC);
    expect(rows[0].qr_url).toContain("CodigoSeguridad=");
  });

  it("no firma un comprobante que DGII rechazaría: el eNCF no se gasta", async () => {
    const id = await issueInvoice();
    // Le quitamos el comprador: una E31 sin RNC es inválida.
    await pool.query(`UPDATE fiscal_documents SET buyer_rnc=NULL, buyer_name=NULL WHERE id=$1`, [id]);

    await expect(withTx((c) => serviceWith(c).transmit(companyId, id))).rejects.toThrow(EcfValidationError);

    const { rows } = await pool.query(
      `SELECT xml_signed, security_code, ecf_status::text FROM fiscal_documents WHERE id=$1`,
      [id],
    );
    expect(rows[0].xml_signed).toBeNull();
    expect(rows[0].security_code).toBeNull();
  });

  it("reenviar no factura dos veces: DGII devuelve el veredicto original", async () => {
    const id = await issueInvoice();
    const first = await withTx((c) => serviceWith(c).transmit(companyId, id));
    const second = await withTx((c) => serviceWith(c).transmit(companyId, id));

    expect(second.ecfStatus).toBe("aceptado");
    expect(second.trackId).toBe(first.trackId);

    // Y en el buzón del simulador hay un solo registro de ese eNCF.
    const { rows } = await pool.query(
      `SELECT count(*)::int n FROM ecf_simulator_inbox WHERE issuer_rnc=$1`,
      [RNC],
    );
    expect(rows[0].n).toBe(1);
  });

  it("una caída de DGII es contingencia con reintento, no un error", async () => {
    const id = await issueInvoice();
    const out = await withTx((c) =>
      serviceWith(c, { unavailable: true }).transmit(companyId, id),
    );
    expect(out.ecfStatus).toBe("en_contingencia");

    const doc = await pool.query(
      `SELECT ecf_status::text, contingency, xml_signed IS NOT NULL AS signed FROM fiscal_documents WHERE id=$1`,
      [id],
    );
    expect(doc.rows[0].contingency).toBe(true);
    // Quedó firmado: el reintento reusa la misma firma y el mismo código de
    // seguridad, que puede estar ya impreso en la copia del cliente.
    expect(doc.rows[0].signed).toBe(true);

    const q = await pool.query(
      `SELECT state, attempts, next_attempt_at IS NOT NULL AS scheduled, last_error
         FROM ecf_transmissions WHERE document_id=$1`,
      [id],
    );
    expect(q.rows[0].state).toBe("queued");
    expect(q.rows[0].attempts).toBe(1);
    expect(q.rows[0].scheduled).toBe(true);
  });

  it("sale de contingencia cuando DGII vuelve, con la misma firma", async () => {
    const id = await issueInvoice();
    await withTx((c) => serviceWith(c, { unavailable: true }).transmit(companyId, id));
    const signedBefore = (
      await pool.query(`SELECT security_code FROM fiscal_documents WHERE id=$1`, [id])
    ).rows[0].security_code;

    const out = await withTx((c) => serviceWith(c).transmit(companyId, id));
    expect(out.ecfStatus).toBe("aceptado");

    const after = await pool.query(
      `SELECT security_code, contingency, ecf_status::text FROM fiscal_documents WHERE id=$1`,
      [id],
    );
    expect(after.rows[0].security_code).toBe(signedBefore);
    expect(after.rows[0].contingency).toBe(false);
  });

  it("recibido no es aceptado: mientras DGII no resuelve, queda en proceso", async () => {
    const id = await issueInvoice();
    // 60s de demora: el veredicto no llega dentro de la prueba.
    const out = await withTx((c) =>
      serviceWith(c, { resolveAfterMs: 60_000 }).transmit(companyId, id),
    );
    expect(out.ecfStatus).toBe("enviado");

    const q = await pool.query(
      `SELECT state, next_attempt_at IS NOT NULL AS scheduled FROM ecf_transmissions WHERE document_id=$1`,
      [id],
    );
    // Y queda agendado para volver a preguntar — sin esto se queda "en proceso"
    // para siempre y el operador concluye que el módulo está roto.
    expect(q.rows[0].state).toBe("sent");
    expect(q.rows[0].scheduled).toBe(true);
  });

  it("deja rastro de cada paso de la conversación con DGII", async () => {
    const id = await issueInvoice();
    await withTx((c) => serviceWith(c).transmit(companyId, id));

    const { rows } = await pool.query(
      `SELECT from_status, to_status, direction FROM fiscal_document_events
        WHERE document_id=$1 ORDER BY at, id`,
      [id],
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.some((r) => r.to_status === "firmado" && r.direction === "out")).toBe(true);
    expect(rows.some((r) => r.to_status === "aceptado" && r.direction === "in")).toBe(true);
  });

  it("la representación impresa sólo es fiscal si está firmada", async () => {
    const id = await issueInvoice();

    const before = await withTx((c) => representationOf(c, companyId, id));
    expect(before.isFiscal).toBe(false);
    expect(before.qrUrl).toBeNull();

    await withTx((c) => serviceWith(c).transmit(companyId, id));

    const after = await withTx((c) => representationOf(c, companyId, id));
    expect(after.isFiscal).toBe(true);
    expect(after.qrUrl).toContain("CodigoSeguridad=");
    expect(after.securityCode).toHaveLength(6);
    // Un ambiente que no es producción tiene que decirlo en la cara del papel.
    expect(after.environmentNotice).toContain("SIN VALIDEZ FISCAL");
  });

  // ── recepción ──────────────────────────────────────────────────────────────

  /** Un e-CF de un proveedor, firmado por él, dirigido a nosotros. */
  async function supplierEcf(encf = "E310000000777", total = "1180") {
    const xml = buildEcfXml({
      tipoECF: "31", eNCF: encf, issuerRnc: "101000555", issuerName: "Proveedor SRL",
      buyerRnc: RNC, buyerName: "eCF Pruebas SRL", emittedAt: DATE, currency: "DOP",
      totals: {
        gravadoTotal: "1000", gravado18: "1000", gravado16: "0", exento: "0",
        itbis18: "180", itbis16: "0", totalItbis: "180", montoTotal: total,
      },
      lines: [{
        lineNo: 1, name: "Insumos", indicadorFacturacion: 1,
        quantity: "1", unitPrice: "1000", amount: "1000",
      }],
    });
    const signed = await new DevEcfSigner().sign(xml, {});
    return signed.xml;
  }

  it("recibe un e-CF de proveedor, lo acusa y guarda el XML tal cual llegó", async () => {
    const xml = await supplierEcf();
    const out = await withTx((c) => receiveEcf(c, companyId, xml));

    expect(out.accepted).toBe(true);
    expect(out.duplicate).toBe(false);
    expect(out.encf).toBe("E310000000777");

    const { rows } = await pool.query(
      `SELECT xml_received, acknowledged_at, signature_valid, approval_status::text, total::text
         FROM ecf_received WHERE company_id=$1 AND encf=$2`,
      [companyId, "E310000000777"],
    );
    // Byte por byte: es el original firmado del proveedor y la única evidencia
    // de lo que realmente mandó.
    expect(rows[0].xml_received).toBe(xml);
    expect(rows[0].acknowledged_at).not.toBeNull();
    expect(rows[0].signature_valid).toBe(true);
    expect(rows[0].approval_status).toBe("pendiente");
  });

  it("una reentrega no duplica el comprobante recibido", async () => {
    const xml = await supplierEcf();
    await withTx((c) => receiveEcf(c, companyId, xml));
    const again = await withTx((c) => receiveEcf(c, companyId, xml));

    expect(again.duplicate).toBe(true);
    const { rows } = await pool.query(
      `SELECT count(*)::int n FROM ecf_received WHERE company_id=$1`,
      [companyId],
    );
    expect(rows[0].n).toBe(1);
  });

  it("rechaza un comprobante dirigido a otro contribuyente", async () => {
    const xml = buildEcfXml({
      tipoECF: "31", eNCF: "E310000000888", issuerRnc: "101000555", issuerName: "Proveedor SRL",
      buyerRnc: "999888777", emittedAt: DATE, currency: "DOP",
      totals: {
        gravadoTotal: "100", gravado18: "100", gravado16: "0", exento: "0",
        itbis18: "18", itbis16: "0", totalItbis: "18", montoTotal: "118",
      },
      lines: [{ lineNo: 1, name: "X", indicadorFacturacion: 1, quantity: "1", unitPrice: "100", amount: "100" }],
    });
    await expect(withTx((c) => receiveEcf(c, companyId, xml))).rejects.toThrow(/dirigido al RNC/);
  });

  it("la aprobación comercial se emite una sola vez y el rechazo exige motivo", async () => {
    const xml = await supplierEcf();
    const { id } = await withTx((c) => receiveEcf(c, companyId, xml));

    await expect(
      withTx((c) => approveReceived(c, companyId, id, { status: "rechazado" })),
    ).rejects.toThrow(/motivo/);

    const out = await withTx((c) =>
      approveReceived(c, companyId, id, { status: "rechazado", reason: "mercancía no recibida" }),
    );
    expect(out.approvalStatus).toBe("rechazado");
    expect(out.xml).toContain("<Estado>2</Estado>");
    expect(out.xml).toContain("mercancía no recibida");

    await expect(
      withTx((c) => approveReceived(c, companyId, id, { status: "aceptado" })),
    ).rejects.toThrow(/ya fue/);
  });

  it("el acuse de recibo se firma y dice si el comprobante entró conforme", async () => {
    const xml = await supplierEcf();
    const { id } = await withTx((c) => receiveEcf(c, companyId, xml));
    const ack = await withTx((c) => buildAcknowledgement(c, companyId, id));

    expect(ack.status).toBe("0");
    expect(ack.xml).toContain("<ARECF");
    expect(ack.xml).toContain("<Estado>0</Estado>");
    expect(ack.xml).toContain("<SignatureValue>");
  });

  it("marca vencido el plazo de aprobación comercial pasados tres días", async () => {
    const xml = await supplierEcf();
    const { id } = await withTx((c) => receiveEcf(c, companyId, xml));
    await pool.query(
      `UPDATE ecf_received SET received_at = now() - interval '4 days' WHERE id=$1`,
      [id],
    );
    const rows = await withTx((c) => listReceived(c, companyId));
    expect(rows[0].approval_overdue).toBe(true);
  });

  // ── rangos y resúmenes ─────────────────────────────────────────────────────

  it("no deja anular números que ya se emitieron", async () => {
    const id = await issueInvoice();
    const ncf = (await pool.query(`SELECT ncf FROM fiscal_documents WHERE id=$1`, [id])).rows[0].ncf;
    const used = Number(String(ncf).slice(3));

    await expect(
      withTx((c) =>
        voidSequenceRange(c, companyId, { ecfType: "E31", rangeFrom: used, rangeTo: used + 5 }),
      ),
    ).rejects.toThrow(/ya están emitidos/);
  });

  it("anula un rango no usado y desactiva la secuencia local", async () => {
    const out = await withTx((c) =>
      voidSequenceRange(c, companyId, {
        ecfType: "E31", rangeFrom: 900, rangeTo: 950, reason: "rango de prueba",
      }),
    );
    expect(out.count).toBe(51);

    const { rows } = await pool.query(
      `SELECT status, range_from, range_to FROM ecf_sequence_voids WHERE company_id=$1`,
      [companyId],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].range_from)).toBe(900);
  });

  it("el resumen de consumo no vuelve a reportar lo ya resumido", async () => {
    // Dos facturas de consumo por debajo del umbral.
    await pool.query(
      `INSERT INTO ncf_sequences (company_id, ncf_type, is_ecf, range_from, range_to, next_number)
       VALUES ($1,'E32',true,1,1000,1)`,
      [companyId],
    );
    for (const price of ["500", "700"]) {
      await withTx(async (c) => {
        await new FiscalDocumentService(c).issueInvoice({
          companyId, issuerRnc: RNC, ncfType: "E32", date: DATE, bookCogs: false,
          lines: [{ description: "Venta", quantity: "1", unitPrice: price, taxCode: "ITBIS18" }],
        });
      });
    }

    // El RFCE cubre un período de *emisión*, y `emitted_at` es el momento real
    // en que se emitió — no la fecha contable del asiento. La ventana va sobre
    // hoy, que es cuando estas facturas acaban de nacer.
    const emittedDay = new Date().toISOString().slice(0, 10);

    const first = await withTx((c) => fileRfce(c, companyId, { from: emittedDay, to: emittedDay }));
    expect(first.filed).toBe(true);
    expect(first.documentCount).toBe(2);

    // Segunda corrida: ya están reportadas, no se resumen otra vez.
    const second = await withTx((c) => fileRfce(c, companyId, { from: emittedDay, to: emittedDay }));
    expect(second.filed).toBe(false);
    expect(second.documentCount).toBe(0);
  });

  // ── configuración ──────────────────────────────────────────────────────────

  it("la llave privada nunca sale por una lectura de configuración", async () => {
    await withTx(async (c) => {
      await c.query(
        `UPDATE ecf_config SET certificate_private_key='SECRETO', certificate_pem='CERT'
          WHERE company_id=$1`,
        [companyId],
      );
    });
    const settings = await withTx((c) => loadEcfSettings(c, companyId));

    expect(settings.hasCertificate).toBe(true);
    // No hay ninguna propiedad que la contenga, ni siquiera oculta.
    expect(JSON.stringify(settings)).not.toContain("SECRETO");
  });
});
