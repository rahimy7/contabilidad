import { SqlClient } from "../../accounting/types";
import { EcfSigner, DgiiEcfGateway, EcfStatus, EcfDocument, DgiiUnavailableError, SigningIdentity } from "./types";
import { buildEcfXml, buildQrUrl } from "./xml-builder";

/**
 * Drives one e-CF through its lifecycle: build → sign → transmit → record.
 *
 * Every state change is written to `fiscal_documents.ecf_status` and appended to
 * `fiscal_document_events`, which is the audit trail a DGII inspection asks for
 * and the only way to explain, months later, why a document sits in `rechazado`.
 *
 * When the gateway is unreachable the document moves to `en_contingencia` rather
 * than failing: under DGII rules a taxpayer may keep issuing under contingency
 * and reconcile when service returns. That is a state, not an error.
 */
export interface EcfServiceDeps {
  signer: EcfSigner;
  gateway: DgiiEcfGateway;
  identity: SigningIdentity;
  /** DGII consulta base URL for the QR, per environment. */
  qrBaseUrl: string;
}

export class EcfService {
  constructor(
    private readonly client: SqlClient,
    private readonly deps: EcfServiceDeps,
  ) {}

  /**
   * Signs and transmits an issued e-CF. Idempotent on status: a document already
   * `aceptado` is returned as-is rather than re-sent.
   */
  async transmit(companyId: number, documentId: number): Promise<EcfStatus> {
    const doc = await this.load(companyId, documentId);
    if (!doc.is_ecf) throw new Error(`document ${documentId} is not an e-CF`);
    if (doc.status === "cancelled") throw new Error(`document ${documentId} is cancelled`);
    if (["aceptado", "aceptado_condicional"].includes(doc.ecf_status)) {
      return doc.ecf_status as EcfStatus;
    }

    // 1. Build + sign (only if not already signed, so a retry after a network
    //    failure reuses the same signed XML and security code).
    let signedXml = doc.xml_signed as string | null;
    let securityCode = doc.security_code as string | null;

    if (!signedXml) {
      const ecf = await this.assemble(companyId, doc);
      const xml = buildEcfXml(ecf);
      const signed = await this.deps.signer.sign(xml, this.deps.identity);
      signedXml = signed.xml;
      securityCode = signed.securityCode;

      const qrUrl = buildQrUrl({
        baseUrl: this.deps.qrBaseUrl,
        issuerRnc: doc.issuer_rnc,
        buyerRnc: doc.buyer_rnc ?? undefined,
        eNCF: doc.ncf,
        montoTotal: String(doc.total),
        fechaEmision: this.isoOf(doc.emitted_at),
        securityCode: signed.securityCode,
      });

      await this.client.query(
        `UPDATE fiscal_documents
            SET ecf_status='firmado', xml_signed=$1, security_code=$2,
                signature_datetime=$3, qr_url=$4
          WHERE id=$5 AND company_id=$6`,
        [signedXml, securityCode, signed.signedAt, qrUrl, documentId, companyId],
      );
      await this.event(documentId, doc.ecf_status, "firmado", "out", "firmado localmente");
    }

    // 2. Transmit. A network failure is contingency, not a hard error.
    let token;
    try {
      token = await this.deps.gateway.authenticate(this.deps.identity);
    } catch (err) {
      if (err instanceof DgiiUnavailableError) return this.toContingency(companyId, documentId, doc.ecf_status, err);
      throw err;
    }

    let result;
    try {
      result = await this.deps.gateway.submit(signedXml!, token);
    } catch (err) {
      if (err instanceof DgiiUnavailableError) return this.toContingency(companyId, documentId, "firmado", err);
      throw err;
    }

    // 3. Record the outcome.
    await this.client.query(
      `UPDATE fiscal_documents SET ecf_status=$1, track_id=$2, contingency=false
        WHERE id=$3 AND company_id=$4`,
      [result.status, result.trackId, documentId, companyId],
    );
    await this.event(documentId, "enviado", result.status, "in", result.message ?? `trackId ${result.trackId}`);
    return result.status;
  }

  /** Re-checks a document DGII had not yet resolved. */
  async refreshStatus(companyId: number, documentId: number): Promise<EcfStatus> {
    const doc = await this.load(companyId, documentId);
    if (!doc.track_id) throw new Error(`document ${documentId} has not been transmitted`);
    const token = await this.deps.gateway.authenticate(this.deps.identity);
    const result = await this.deps.gateway.queryStatus(doc.track_id, token);
    if (result.status !== doc.ecf_status) {
      await this.client.query(
        `UPDATE fiscal_documents SET ecf_status=$1 WHERE id=$2 AND company_id=$3`,
        [result.status, documentId, companyId],
      );
      await this.event(documentId, doc.ecf_status, result.status, "in", "consulta de estado");
    }
    return result.status as EcfStatus;
  }

  private async toContingency(
    companyId: number,
    documentId: number,
    from: string,
    err: Error,
  ): Promise<EcfStatus> {
    await this.client.query(
      `UPDATE fiscal_documents SET ecf_status='en_contingencia', contingency=true
        WHERE id=$1 AND company_id=$2`,
      [documentId, companyId],
    );
    await this.event(documentId, from, "en_contingencia", "out", err.message);
    return "en_contingencia";
  }

  private async assemble(companyId: number, doc: any): Promise<EcfDocument> {
    const issuer = await this.client.query(`SELECT legal_name FROM companies WHERE id=$1`, [companyId]);
    const lines = await this.client.query(
      `SELECT line_no, description, quantity::text, unit_price::text, line_total::text, is_exempt
         FROM fiscal_document_lines WHERE document_id=$1 AND company_id=$2 ORDER BY line_no`,
      [doc.id, companyId],
    );

    return {
      tipoECF: doc.ncf_type.replace(/^E/, ""),
      eNCF: doc.ncf,
      issuerRnc: doc.issuer_rnc,
      issuerName: issuer.rows[0]?.legal_name ?? "",
      buyerRnc: doc.buyer_rnc ?? undefined,
      buyerName: doc.buyer_name ?? undefined,
      emittedAt: this.isoOf(doc.emitted_at),
      currency: doc.currency,
      totals: {
        gravadoTotal: String(doc.subtotal_taxed),
        gravado18: String(doc.subtotal_taxed),
        gravado16: "0",
        exento: String(doc.subtotal_exempt),
        itbis18: String(doc.itbis_18),
        itbis16: String(doc.itbis_16),
        totalItbis: String(Number(doc.itbis_18) + Number(doc.itbis_16) + Number(doc.itbis_0)),
        montoTotal: String(doc.total),
      },
      lines: lines.rows.map((l) => ({
        lineNo: l.line_no,
        name: l.description,
        indicadorFacturacion: l.is_exempt ? 2 : 1,
        quantity: l.quantity,
        unitPrice: l.unit_price,
        amount: l.line_total,
      })),
    };
  }

  private async load(companyId: number, documentId: number) {
    const { rows } = await this.client.query(
      `SELECT * FROM fiscal_documents WHERE id=$1 AND company_id=$2`,
      [documentId, companyId],
    );
    if (rows.length === 0) throw new Error(`fiscal document ${documentId} not found`);
    return rows[0];
  }

  private isoOf(v: Date | string): string {
    return v instanceof Date ? v.toISOString() : String(v);
  }

  private async event(
    documentId: number,
    from: string | null,
    to: string,
    direction: "out" | "in",
    message: string,
  ) {
    await this.client.query(
      `INSERT INTO fiscal_document_events (document_id, from_status, to_status, direction, dgii_message)
       VALUES ($1,$2,$3,$4,$5)`,
      [documentId, from, to, direction, message],
    );
  }
}
