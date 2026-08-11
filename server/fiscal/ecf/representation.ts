import { SqlClient } from "../../accounting/types";
import { loadEcfSettings } from "./ecf-config";
import { ecfSpec, PAYMENT_METHODS } from "./ecf-types";

/**
 * The representación impresa.
 *
 * When an e-CF is issued, the legal document is the signed XML — but a customer
 * at a counter needs paper, and DGII regulates what that paper must carry: the
 * eNCF, the security code, the signature timestamp, and a QR pointing at DGII's
 * own consulta so anyone can verify the document independently of the seller.
 *
 * This returns the *data*; the rendering lives in the client, which already has
 * a QR component and the print stylesheet. Building HTML on the server would put
 * two print layouts in the codebase — this one, and the POS ticket that already
 * exists — and they would drift.
 *
 * The one thing worth being strict about: a document that has not been signed
 * has no security code and no QR, and printing it as though it did would produce
 * a piece of paper that fails verification. So the representation says plainly
 * whether it is a fiscal original or a draft.
 */

export interface RepresentationData {
  /** True only once signed: a draft prints watermarked, not as a comprobante. */
  isFiscal: boolean;
  documentId: number;
  encf: string | null;
  ecfType: string;
  ecfTypeName: string;
  ecfStatus: string | null;
  securityCode: string | null;
  signedAt: string | null;
  qrUrl: string | null;
  trackId: string | null;
  environment: string;
  /** A non-producción document must say so on its face. */
  environmentNotice?: string;

  issuer: {
    rnc: string;
    name: string;
    tradeName?: string;
    address?: string;
    phone?: string;
    email?: string;
    logoUrl?: string;
  };
  buyer: {
    rnc?: string;
    name?: string;
  };

  emittedAt: string | null;
  dueDate: string | null;
  currency: string;
  paymentMethodLabel?: string;
  modifiesNcf?: string;

  lines: Array<{
    lineNo: number;
    description: string;
    quantity: string;
    unitPrice: string;
    discount: string;
    itbisAmount: string;
    lineTotal: string;
    isExempt: boolean;
  }>;

  totals: {
    subtotalTaxed: string;
    subtotalExempt: string;
    itbis18: string;
    itbis16: string;
    itbis0: string;
    totalItbis: string;
    isc: string;
    tipLegal: string;
    retentionItbis: string;
    retentionIsr: string;
    total: string;
  };
}

const ENV_NOTICE: Record<string, string> = {
  simulated: "DOCUMENTO SIMULADO — SIN VALIDEZ FISCAL",
  test: "AMBIENTE DE PRUEBAS (TesteCF) — SIN VALIDEZ FISCAL",
  cert: "AMBIENTE DE CERTIFICACIÓN (CerteCF) — SIN VALIDEZ FISCAL",
};

export async function representationOf(
  client: SqlClient,
  companyId: number,
  documentId: number,
): Promise<RepresentationData> {
  const { rows } = await client.query(
    `SELECT * FROM fiscal_documents WHERE company_id=$1 AND id=$2`,
    [companyId, documentId],
  );
  if (rows.length === 0) throw new Error("documento fiscal no encontrado");
  const d = rows[0];

  const lines = await client.query(
    `SELECT line_no, description, quantity::text, unit_price::text, discount::text,
            itbis_amount::text, line_total::text, is_exempt
       FROM fiscal_document_lines WHERE company_id=$1 AND document_id=$2 ORDER BY line_no`,
    [companyId, documentId],
  );

  const settings = await loadEcfSettings(client, companyId);
  const spec = ecfSpec(d.ncf_type);

  return {
    // Signed *and* not rejected: a comprobante DGII refused is not a valid
    // document to hand a customer, however good the paper looks.
    isFiscal: Boolean(d.xml_signed) && d.status === "issued" && d.ecf_status !== "rechazado",
    documentId,
    encf: d.ncf,
    ecfType: d.ncf_type,
    ecfTypeName: spec?.name ?? d.ncf_type,
    ecfStatus: d.ecf_status,
    securityCode: d.security_code,
    signedAt: d.signature_datetime ? new Date(d.signature_datetime).toISOString() : null,
    qrUrl: d.qr_url,
    trackId: d.track_id,
    environment: settings.environment,
    environmentNotice: ENV_NOTICE[settings.environment],

    issuer: {
      rnc: d.issuer_rnc || settings.issuerRnc,
      name: settings.issuerName,
      tradeName: settings.tradeName,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      logoUrl: settings.logoUrl,
    },
    buyer: { rnc: d.buyer_rnc ?? undefined, name: d.buyer_name ?? undefined },

    emittedAt: d.emitted_at ? new Date(d.emitted_at).toISOString() : null,
    dueDate: d.due_date ? String(d.due_date) : null,
    currency: d.currency,
    paymentMethodLabel: PAYMENT_METHODS[d.payment_method] ?? undefined,
    modifiesNcf: d.modifies_ncf ?? undefined,

    lines: lines.rows.map((l: any) => ({
      lineNo: l.line_no,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unit_price,
      discount: l.discount,
      itbisAmount: l.itbis_amount,
      lineTotal: l.line_total,
      isExempt: l.is_exempt,
    })),

    totals: {
      subtotalTaxed: String(d.subtotal_taxed),
      subtotalExempt: String(d.subtotal_exempt),
      itbis18: String(d.itbis_18),
      itbis16: String(d.itbis_16),
      itbis0: String(d.itbis_0),
      totalItbis: String(
        Number(d.itbis_18 ?? 0) + Number(d.itbis_16 ?? 0) + Number(d.itbis_0 ?? 0),
      ),
      isc: String(d.isc ?? "0"),
      tipLegal: String(d.tip_legal ?? "0"),
      retentionItbis: String(d.retention_itbis ?? "0"),
      retentionIsr: String(d.retention_isr ?? "0"),
      total: String(d.total),
    },
  };
}

/**
 * The e-CF dashboard: what is stuck, what is overdue, what needs a person.
 *
 * Built as one query set rather than one per card because these numbers are only
 * meaningful together — "12 en contingencia" means something different when 40
 * were issued today than when 12 were.
 */
export async function ecfDashboard(client: SqlClient, companyId: number) {
  const byStatus = await client.query(
    `SELECT coalesce(ecf_status::text,'sin_estado') AS status, count(*)::int AS n,
            coalesce(sum(total),0)::text AS total
       FROM fiscal_documents
      WHERE company_id=$1 AND is_ecf AND status <> 'draft'
      GROUP BY 1 ORDER BY 1`,
    [companyId],
  );

  const queue = await client.query(
    `SELECT state, count(*)::int AS n, min(next_attempt_at) AS next_attempt
       FROM ecf_transmissions WHERE company_id=$1 GROUP BY state`,
    [companyId],
  );

  // Documents nobody is going to rescue automatically — the ones a person has
  // to decide about. This is the only number on the page that is a to-do list.
  const stuck = await client.query(
    `SELECT d.id, d.ncf, d.ncf_type, d.total::text, d.emitted_at, d.ecf_status::text,
            t.attempts, t.last_error, t.state
       FROM fiscal_documents d
       JOIN ecf_transmissions t ON t.document_id = d.id
      WHERE d.company_id=$1 AND t.state IN ('failed','abandoned')
      ORDER BY d.emitted_at DESC LIMIT 50`,
    [companyId],
  );

  const inbox = await client.query(
    `SELECT count(*) FILTER (WHERE approval_status='pendiente')::int AS pending,
            count(*) FILTER (WHERE approval_status='pendiente'
                             AND received_at < now() - interval '3 days')::int AS overdue,
            count(*)::int AS total
       FROM ecf_received WHERE company_id=$1`,
    [companyId],
  );

  const sequences = await client.query(
    `SELECT ncf_type, range_to - next_number + 1 AS remaining, alert_threshold, expiry_date
       FROM ncf_sequences
      WHERE company_id=$1 AND is_ecf AND is_active
        AND (range_to - next_number + 1 <= alert_threshold
             OR (expiry_date IS NOT NULL AND expiry_date <= current_date + 30))
      ORDER BY remaining`,
    [companyId],
  );

  const settings = await loadEcfSettings(client, companyId);

  return {
    settings: {
      environment: settings.environment,
      isEnabled: settings.isEnabled,
      hasCertificate: settings.hasCertificate,
      certificateExpiresAt: settings.certificateExpiresAt,
    },
    byStatus: byStatus.rows,
    queue: queue.rows,
    stuck: stuck.rows,
    inbox: inbox.rows[0],
    sequenceAlerts: sequences.rows,
  };
}
