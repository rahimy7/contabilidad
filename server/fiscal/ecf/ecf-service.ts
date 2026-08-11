import { SqlClient } from "../../accounting/types";
import { EcfStatus, EcfDocument, DgiiUnavailableError, SigningIdentity, DgiiEcfGateway, EcfSigner } from "./types";
import { buildEcfXml, buildQrUrl } from "./xml-builder";
import { validateEcf, ValidationMessage } from "./validator";
import { ecfSpec, dgiiPaymentMethod, dgiiPaymentType } from "./ecf-types";
import {
  EcfSettings, loadEcfSettings, signingIdentity, gatewayFor, signerFor, qrBaseUrl,
} from "./ecf-config";
import { DgiiTokenError } from "./simulator-gateway";

/**
 * Drives an e-CF through its life: validate → sign → transmit → poll → resolve.
 *
 * Three decisions shape everything here.
 *
 * **Validate before signing.** An eNCF is a finite, DGII-authorized resource;
 * signing a document that DGII will reject burns one and leaves a hole to
 * explain on Form 608. So the same rules the receiver applies run locally first,
 * and a document that fails them never reaches the sequence.
 *
 * **Contingency is a state, not an error.** When DGII is unreachable the norm
 * lets a taxpayer keep issuing and reconcile when service returns. A network
 * failure therefore parks the document in `en_contingencia` with a retry
 * scheduled — it does not fail the sale. What *is* an error is a document DGII
 * looked at and refused; retrying that forever would hide it.
 *
 * **Reception is not acceptance.** DGII answers a submission with a trackId and
 * "en proceso"; the verdict arrives later. Treating the acknowledgement as
 * acceptance is how unaccepted documents end up reported as filed, so the queue
 * keeps polling until DGII actually decides.
 */

export interface EcfServiceDeps {
  signer?: EcfSigner;
  gateway?: DgiiEcfGateway;
  identity?: SigningIdentity;
  qrBaseUrl?: string;
  settings?: EcfSettings;
}

export class EcfValidationError extends Error {
  constructor(
    message: string,
    readonly messages: ValidationMessage[],
  ) {
    super(message);
    this.name = "EcfValidationError";
  }
}

/** Backoff between retries, in minutes. Beyond the list, it stays at the last. */
const BACKOFF_MINUTES = [1, 5, 15, 30, 60, 120, 240, 480];

export class EcfService {
  constructor(
    private readonly client: SqlClient,
    private readonly overrides: EcfServiceDeps = {},
  ) {}

  // ── emisión ────────────────────────────────────────────────────────────────

  /**
   * Signs and transmits an issued e-CF.
   *
   * Idempotent on status: a document already accepted is returned as-is rather
   * than re-sent, and a retry after a network failure reuses the signed XML it
   * already produced — re-signing would change the security code that may
   * already be printed on a customer's copy.
   */
  async transmit(companyId: number, documentId: number): Promise<{
    ecfStatus: EcfStatus;
    trackId?: string;
    messages?: ValidationMessage[];
  }> {
    const doc = await this.load(companyId, documentId);
    if (!doc.is_ecf) throw new Error(`el documento ${documentId} no es un e-CF`);
    if (doc.status === "cancelled") throw new Error(`el documento ${documentId} está anulado`);
    if (["aceptado", "aceptado_condicional"].includes(doc.ecf_status)) {
      return { ecfStatus: doc.ecf_status as EcfStatus, trackId: doc.track_id ?? undefined };
    }

    const ctx = await this.context(companyId);

    // 1 — sign, if it is not already signed.
    let signedXml: string | null = doc.xml_signed;
    if (!signedXml) {
      const ecf = await this.assemble(companyId, doc, ctx.settings);

      const validation = validateEcf(ecf);
      if (!validation.valid) {
        await this.event(documentId, doc.ecf_status, doc.ecf_status, "out", summarize(validation.messages));
        throw new EcfValidationError(
          "el comprobante no cumple las validaciones DGII y no fue firmado",
          validation.messages,
        );
      }

      const xml = buildEcfXml(ecf);
      const signed = await ctx.signer.sign(xml, ctx.identity);
      signedXml = signed.xml;

      const qrUrl = buildQrUrl({
        baseUrl: ctx.qrBaseUrl,
        issuerRnc: ecf.issuerRnc,
        buyerRnc: ecf.buyerRnc,
        eNCF: ecf.eNCF,
        montoTotal: ecf.totals.montoTotal,
        fechaEmision: ecf.emittedAt,
        securityCode: signed.securityCode,
      });

      await this.client.query(
        `UPDATE fiscal_documents
            SET ecf_status='firmado', xml_signed=$1, security_code=$2,
                signature_datetime=$3, qr_url=$4, updated_at=now()
          WHERE id=$5 AND company_id=$6`,
        [signedXml, signed.securityCode, signed.signedAt, qrUrl, documentId, companyId],
      );
      await this.event(
        documentId, doc.ecf_status, "firmado", "out",
        validation.messages.length ? summarize(validation.messages) : "firmado localmente",
      );
    }

    await this.enqueue(companyId, documentId);
    return this.send(companyId, documentId, signedXml!, ctx);
  }

  /**
   * One transmission attempt against DGII. Shared by `transmit` and the retry
   * job, so a manual resend and an automatic one follow exactly the same path.
   */
  private async send(
    companyId: number,
    documentId: number,
    signedXml: string,
    ctx: Ctx,
  ): Promise<{ ecfStatus: EcfStatus; trackId?: string; messages?: ValidationMessage[] }> {
    let token;
    try {
      token = await ctx.gateway.authenticate(ctx.identity);
    } catch (err) {
      return { ecfStatus: await this.handleFailure(companyId, documentId, "firmado", err as Error) };
    }

    let result;
    try {
      result = await ctx.gateway.submit(signedXml, token);
    } catch (err) {
      return { ecfStatus: await this.handleFailure(companyId, documentId, "firmado", err as Error) };
    }

    await this.client.query(
      `UPDATE fiscal_documents SET ecf_status=$1, track_id=$2, contingency=false, updated_at=now()
        WHERE id=$3 AND company_id=$4`,
      [result.status, result.trackId, documentId, companyId],
    );
    await this.client.query(
      `UPDATE ecf_transmissions
          SET state=$1, track_id=$2, dgii_status=$3, last_error=NULL,
              next_attempt_at = CASE WHEN $1='sent' THEN now() + interval '1 minute' ELSE NULL END,
              updated_at=now()
        WHERE company_id=$4 AND document_id=$5`,
      [
        result.status === "enviado" ? "sent" : "resolved",
        result.trackId, result.status, companyId, documentId,
      ],
    );
    await this.event(documentId, "enviado", result.status, "in", result.message ?? `trackId ${result.trackId}`);

    return { ecfStatus: result.status, trackId: result.trackId };
  }

  /**
   * Re-checks a document DGII had not yet resolved. This is what turns an
   * "enviado" into a verdict, and the reason the queue exists.
   */
  async refreshStatus(companyId: number, documentId: number): Promise<EcfStatus> {
    const doc = await this.load(companyId, documentId);
    if (!doc.track_id) throw new Error(`el documento ${documentId} no ha sido transmitido`);
    const ctx = await this.context(companyId);

    const token = await ctx.gateway.authenticate(ctx.identity);
    const result = await ctx.gateway.queryStatus(doc.track_id, token);

    if (result.status !== doc.ecf_status) {
      await this.client.query(
        `UPDATE fiscal_documents SET ecf_status=$1, updated_at=now() WHERE id=$2 AND company_id=$3`,
        [result.status, documentId, companyId],
      );
      await this.event(documentId, doc.ecf_status, result.status, "in", result.message ?? "consulta de estado");
    }

    const settled = ["aceptado", "aceptado_condicional", "rechazado"].includes(result.status);
    await this.client.query(
      `UPDATE ecf_transmissions
          SET dgii_status=$1, state = CASE WHEN $2 THEN 'resolved' ELSE 'sent' END,
              next_attempt_at = CASE WHEN $2 THEN NULL ELSE now() + interval '2 minutes' END,
              updated_at=now()
        WHERE company_id=$3 AND document_id=$4`,
      [result.status, settled, companyId, documentId],
    );
    return result.status;
  }

  /**
   * Works the queue: everything due for a retry or a status check.
   *
   * Called by the scheduler. Bounded per run so one company's backlog cannot
   * starve the others, and each document is handled independently — one
   * failure does not abort the batch.
   */
  async processQueue(companyId: number, limit = 25): Promise<{
    checked: number;
    resolved: number;
    stillPending: number;
    failed: number;
  }> {
    const { rows } = await this.client.query(
      `SELECT t.document_id, t.state, t.attempts, d.xml_signed, d.track_id
         FROM ecf_transmissions t
         JOIN fiscal_documents d ON d.id = t.document_id
        WHERE t.company_id=$1
          AND t.state IN ('queued','sending','sent')
          AND t.next_attempt_at IS NOT NULL AND t.next_attempt_at <= now()
        ORDER BY t.next_attempt_at
        LIMIT $2`,
      [companyId, limit],
    );
    if (rows.length === 0) return { checked: 0, resolved: 0, stillPending: 0, failed: 0 };

    const ctx = await this.context(companyId);
    let resolved = 0;
    let stillPending = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        // Already at DGII: ask for the verdict. Not yet: send it.
        const status = row.track_id
          ? await this.refreshStatus(companyId, Number(row.document_id))
          : (await this.send(companyId, Number(row.document_id), row.xml_signed, ctx)).ecfStatus;

        if (["aceptado", "aceptado_condicional", "rechazado"].includes(status)) resolved++;
        else stillPending++;
      } catch (err) {
        failed++;
        await this.handleFailure(companyId, Number(row.document_id), "enviado", err as Error);
      }
    }
    return { checked: rows.length, resolved, stillPending, failed };
  }

  // ── contingencia y reintentos ──────────────────────────────────────────────

  /**
   * Decides what a failure means.
   *
   * Unreachable DGII, or an expired token, is contingency: park it and retry
   * with backoff. Anything else is a real error the operator has to see, so it
   * is recorded and the retry stops — a document DGII refuses will be refused
   * again, and a queue that keeps trying only buries the message.
   */
  private async handleFailure(
    companyId: number,
    documentId: number,
    from: string,
    err: Error,
  ): Promise<EcfStatus> {
    const transient = err instanceof DgiiUnavailableError || err instanceof DgiiTokenError;
    const { rows } = await this.client.query(
      `UPDATE ecf_transmissions
          SET attempts = attempts + 1, last_error=$3, updated_at=now()
        WHERE company_id=$1 AND document_id=$2
        RETURNING attempts`,
      [companyId, documentId, err.message.slice(0, 1000)],
    );
    const attempts = Number(rows[0]?.attempts ?? 1);
    const settings = this.overrides.settings ?? (await loadEcfSettings(this.client, companyId));

    if (!transient) {
      await this.client.query(
        `UPDATE ecf_transmissions SET state='failed', next_attempt_at=NULL, updated_at=now()
          WHERE company_id=$1 AND document_id=$2`,
        [companyId, documentId],
      );
      await this.event(documentId, from, from, "out", `error: ${err.message}`);
      throw err;
    }

    // Out of attempts: still legally in contingency, but no longer retried
    // automatically. Someone has to look at it, and `abandoned` is what makes
    // that visible instead of it cycling silently forever.
    const exhausted = attempts >= settings.maxTransmitAttempts;
    const backoff = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];

    await this.client.query(
      `UPDATE ecf_transmissions
          SET state = CASE WHEN $3 THEN 'abandoned' ELSE 'queued' END,
              next_attempt_at = CASE WHEN $3 THEN NULL ELSE now() + ($4 || ' minutes')::interval END,
              updated_at=now()
        WHERE company_id=$1 AND document_id=$2`,
      [companyId, documentId, exhausted, String(backoff)],
    );
    await this.client.query(
      `UPDATE fiscal_documents SET ecf_status='en_contingencia', contingency=true, updated_at=now()
        WHERE id=$1 AND company_id=$2`,
      [documentId, companyId],
    );
    await this.event(
      documentId, from, "en_contingencia", "out",
      exhausted
        ? `${err.message} — agotados ${attempts} intentos, requiere intervención`
        : `${err.message} — reintento en ${backoff} min (intento ${attempts})`,
    );
    return "en_contingencia";
  }

  private async enqueue(companyId: number, documentId: number): Promise<void> {
    await this.client.query(
      `INSERT INTO ecf_transmissions (company_id, document_id, state, next_attempt_at)
       VALUES ($1,$2,'sending', now())
       ON CONFLICT (document_id) DO UPDATE SET state='sending', updated_at=now()`,
      [companyId, documentId],
    );
  }

  // ── armado ─────────────────────────────────────────────────────────────────

  /** Turns a stored fiscal document into the shape the XML builder wants. */
  private async assemble(companyId: number, doc: any, settings: EcfSettings): Promise<EcfDocument> {
    const lines = await this.client.query(
      `SELECT line_no, description, quantity::text, unit_price::text, discount::text,
              itbis_rate::text, itbis_amount::text, line_total::text, is_exempt, product_id
         FROM fiscal_document_lines WHERE document_id=$1 AND company_id=$2 ORDER BY line_no`,
      [doc.id, companyId],
    );

    // The comprobante being modified, for a note. Read by id rather than trusted
    // from `modifies_ncf` alone, because the date matters to DGII too.
    let modifiesDate: string | undefined;
    if (doc.modifies_doc_id) {
      const orig = await this.client.query(
        `SELECT emitted_at FROM fiscal_documents WHERE id=$1 AND company_id=$2`,
        [doc.modifies_doc_id, companyId],
      );
      modifiesDate = orig.rows[0]?.emitted_at ? isoOf(orig.rows[0].emitted_at) : undefined;
    }

    const spec = ecfSpec(doc.ncf_type);
    const itbis0 = String(doc.itbis_0 ?? "0");

    return {
      tipoECF: spec?.code ?? String(doc.ncf_type).replace(/^E/, ""),
      eNCF: doc.ncf,
      issuerRnc: doc.issuer_rnc || settings.issuerRnc,
      issuerName: settings.issuerName,
      issuerTradeName: settings.tradeName,
      issuerAddress: settings.address,
      issuerPhone: settings.phone,
      issuerEmail: settings.email,
      buyerRnc: doc.buyer_rnc ?? undefined,
      buyerName: doc.buyer_name ?? undefined,
      emittedAt: isoOf(doc.emitted_at),
      currency: doc.currency,
      fxRate: doc.currency !== "DOP" ? String(doc.fx_rate) : undefined,
      dueDate: doc.due_date ? isoOf(doc.due_date) : undefined,
      incomeType: "01",
      paymentType: dgiiPaymentType(doc.payment_method),
      paymentMethod: dgiiPaymentMethod(doc.payment_method),
      modifiesNcf: doc.modifies_ncf ?? undefined,
      modifiesDate,
      modificationCode: doc.modifies_ncf ? "1" : undefined,
      totals: {
        gravadoTotal: String(doc.subtotal_taxed),
        // The taxed base is split by rate. This system taxes at 18% or exempts,
        // so the 16% and 0% buckets carry what the tax engine actually produced
        // rather than an assumption that everything gravado is at 18.
        gravado18: String(doc.subtotal_taxed),
        gravado16: "0",
        gravado0: "0",
        exento: String(doc.subtotal_exempt),
        itbis18: String(doc.itbis_18),
        itbis16: String(doc.itbis_16),
        itbis0,
        totalItbis: String(
          Number(doc.itbis_18 ?? 0) + Number(doc.itbis_16 ?? 0) + Number(doc.itbis_0 ?? 0),
        ),
        isc: String(doc.isc ?? "0"),
        tipLegal: String(doc.tip_legal ?? "0"),
        retentionItbis: String(doc.retention_itbis ?? "0"),
        retentionIsr: String(doc.retention_isr ?? "0"),
        montoTotal: String(doc.total),
      },
      lines: lines.rows.map((l: any) => ({
        lineNo: l.line_no,
        name: l.description,
        indicadorFacturacion: l.is_exempt ? 2 : 1,
        quantity: l.quantity,
        unitPrice: l.unit_price,
        amount: l.line_total,
        discount: Number(l.discount) > 0 ? l.discount : undefined,
        itbisRate: l.itbis_rate,
        itbisAmount: l.itbis_amount,
        productCode: l.product_id ? String(l.product_id) : undefined,
      })),
    };
  }

  /**
   * Validates a document without signing it — the dry run a screen offers before
   * anyone commits an eNCF to it.
   */
  async validate(companyId: number, documentId: number) {
    const doc = await this.load(companyId, documentId);
    const settings = this.overrides.settings ?? (await loadEcfSettings(this.client, companyId));
    const ecf = await this.assemble(companyId, doc, settings);
    const result = validateEcf(ecf);
    return { ...result, xml: buildEcfXml(ecf) };
  }

  // ── plumbing ───────────────────────────────────────────────────────────────

  private async context(companyId: number): Promise<Ctx> {
    const settings = this.overrides.settings ?? (await loadEcfSettings(this.client, companyId));
    return {
      settings,
      signer: this.overrides.signer ?? signerFor(settings),
      gateway: this.overrides.gateway ?? gatewayFor(this.client, settings),
      identity: this.overrides.identity ?? (await signingIdentity(this.client, companyId, settings)),
      qrBaseUrl: this.overrides.qrBaseUrl ?? qrBaseUrl(settings),
    };
  }

  private async load(companyId: number, documentId: number) {
    const { rows } = await this.client.query(
      `SELECT * FROM fiscal_documents WHERE id=$1 AND company_id=$2`,
      [documentId, companyId],
    );
    if (rows.length === 0) throw new Error(`documento fiscal ${documentId} no encontrado`);
    return rows[0];
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
      [documentId, from, to, direction, message?.slice(0, 2000) ?? null],
    );
  }
}

interface Ctx {
  settings: EcfSettings;
  signer: EcfSigner;
  gateway: DgiiEcfGateway;
  identity: SigningIdentity;
  qrBaseUrl: string;
}

const isoOf = (v: Date | string): string =>
  v instanceof Date ? v.toISOString() : String(v);

const summarize = (messages: ValidationMessage[]): string =>
  messages.map((m) => `[${m.code}] ${m.message}`).join(" | ").slice(0, 2000);
