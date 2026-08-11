import { SqlClient } from "../../accounting/types";
import { buildAcknowledgementXml, buildCommercialApprovalXml } from "./xml-builder";
import { parseEcfXml, securityCodeOf, signatureValueOf } from "./xml-parser";
import { validateEcf } from "./validator";
import { loadEcfSettings, signingIdentity, signerFor } from "./ecf-config";

/**
 * The receiving half of e-CF.
 *
 * An electronic issuer is also, by law, an electronic receiver. A supplier's
 * e-CF arrives at our endpoint and two separate obligations start running:
 *
 *   **Acuse de recibo**, within one hour — a purely technical answer: the XML
 *   arrived, it parses, the signature is there. It says nothing about whether we
 *   agree with the invoice.
 *
 *   **Aprobación comercial**, within three days — the business answer: we accept
 *   the charge, or we reject it with a reason. Silence counts as acceptance,
 *   which is why the deadline matters more than it looks: an invoice nobody
 *   reviewed becomes an invoice everybody agreed to.
 *
 * These are two states, not one, and collapsing them would make it impossible to
 * say "we received it but we dispute it" — which is the whole point of having
 * three days.
 */

export class EcfInboxError extends Error {}

export interface ReceiveResult {
  id: number;
  encf: string;
  issuerRnc: string;
  accepted: boolean;
  duplicate: boolean;
  messages: { code: string; message: string; severity: string }[];
}

/**
 * Takes in a supplier's e-CF and answers the acuse de recibo.
 *
 * The XML is stored byte for byte. It is the supplier's signed original and the
 * only evidence of what they actually sent; re-serialising it from parsed fields
 * would invalidate the signature and destroy exactly the thing worth keeping.
 *
 * A redelivery — DGII retries — returns the existing row rather than creating a
 * second one. Push endpoints get called twice; a receiver that cannot tolerate
 * that duplicates its own payables.
 */
export async function receiveEcf(
  client: SqlClient,
  companyId: number,
  xml: string,
): Promise<ReceiveResult> {
  const parsed = parseEcfXml(xml);
  if (!parsed) {
    throw new EcfInboxError("el XML recibido no es un e-CF interpretable");
  }

  const settings = await loadEcfSettings(client, companyId);

  // Addressed to us? A comprobante for another taxpayer's RNC is not ours to
  // acknowledge, and silently accepting it would put a stranger's purchase in
  // our 606.
  if (parsed.buyerRnc && settings.issuerRnc && parsed.buyerRnc !== settings.issuerRnc) {
    throw new EcfInboxError(
      `el comprobante ${parsed.eNCF} está dirigido al RNC ${parsed.buyerRnc}, no a ${settings.issuerRnc}`,
    );
  }

  const existing = await client.query(
    `SELECT id, encf, issuer_rnc FROM ecf_received
      WHERE company_id=$1 AND issuer_rnc=$2 AND encf=$3`,
    [companyId, parsed.issuerRnc, parsed.eNCF],
  );
  if (existing.rows.length > 0) {
    return {
      id: Number(existing.rows[0].id),
      encf: parsed.eNCF,
      issuerRnc: parsed.issuerRnc,
      accepted: true,
      duplicate: true,
      messages: [],
    };
  }

  // The acuse is technical: is it signed, and does it parse into something
  // coherent? Business disagreement belongs to the commercial approval.
  const hasSignature = Boolean(signatureValueOf(xml));
  const validation = validateEcf(parsed);
  const structurallyOk = hasSignature && validation.valid;

  const messages = [
    ...(hasSignature ? [] : [{ code: "FIRMA-01", message: "el comprobante no viene firmado", severity: "error" }]),
    ...validation.messages,
  ];

  // El proveedor se busca aparte, no como subconsulta del INSERT. Reusar el
  // mismo parámetro para `issuer_rnc` —varchar(11)— y para `tax_id` —text—
  // deja a Postgres sin un tipo único que deducir, y rechaza la sentencia
  // entera. Una consulta más, por documento recibido, a cambio de que no haya
  // ambigüedad que resolver.
  const supplier = await client.query(
    `SELECT id FROM suppliers WHERE tax_id = $1 LIMIT 1`,
    [parsed.issuerRnc],
  );
  const supplierId = supplier.rows[0]?.id ?? null;

  const { rows } = await client.query(
    `INSERT INTO ecf_received
       (company_id, encf, ecf_type, issuer_rnc, issuer_name, buyer_rnc, emitted_at, currency,
        subtotal_taxed, subtotal_exempt, total_itbis, total, security_code, xml_received,
        signature_valid, acknowledged_at, supplier_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING id`,
    [
      companyId, parsed.eNCF, `E${parsed.tipoECF}`, parsed.issuerRnc, parsed.issuerName || null,
      parsed.buyerRnc ?? null, parsed.emittedAt || null, parsed.currency,
      parsed.totals.gravadoTotal || "0", parsed.totals.exento || "0",
      parsed.totals.totalItbis || "0", parsed.totals.montoTotal || "0",
      securityCodeOf(xml) ?? null, xml, hasSignature,
      // Acknowledged only when we could actually take it in. A malformed
      // document is acknowledged as *not received*, which is a real ARECF state.
      structurallyOk ? new Date() : null,
      supplierId,
    ],
  );

  return {
    id: Number(rows[0].id),
    encf: parsed.eNCF,
    issuerRnc: parsed.issuerRnc,
    accepted: structurallyOk,
    duplicate: false,
    messages,
  };
}

/** The signed ARECF we owe the issuer within the hour. */
export async function buildAcknowledgement(
  client: SqlClient,
  companyId: number,
  receivedId: number,
): Promise<{ xml: string; status: "0" | "1" }> {
  const row = await loadReceived(client, companyId, receivedId);
  const settings = await loadEcfSettings(client, companyId);

  const ok = row.signature_valid === true && row.acknowledged_at !== null;
  const xml = buildAcknowledgementXml({
    issuerRnc: row.issuer_rnc,
    buyerRnc: settings.issuerRnc,
    encf: row.encf,
    status: ok ? "0" : "1",
    reasonCode: ok ? undefined : "2",
    reason: ok ? undefined : "el comprobante no superó la validación de estructura o firma",
    receivedAt: isoOf(row.received_at),
  });

  const identity = await signingIdentity(client, companyId, settings);
  const signed = await signerFor(settings).sign(xml, identity);
  return { xml: signed.xml, status: ok ? "0" : "1" };
}

/**
 * Records our commercial verdict and produces the signed ACECF.
 *
 * A rejection needs a reason — not as validation ceremony, but because the
 * supplier receives it and has to act on it, and "rechazado" with no explanation
 * is a phone call rather than a resolution.
 */
export async function approveReceived(
  client: SqlClient,
  companyId: number,
  receivedId: number,
  input: { status: "aceptado" | "rechazado"; reason?: string; userId?: number },
): Promise<{ xml: string; approvalStatus: string }> {
  const row = await loadReceived(client, companyId, receivedId);
  if (row.approval_status !== "pendiente") {
    throw new EcfInboxError(
      `el comprobante ${row.encf} ya fue ${row.approval_status}; la aprobación comercial no se emite dos veces`,
    );
  }
  if (input.status === "rechazado" && !input.reason?.trim()) {
    throw new EcfInboxError("un rechazo comercial debe indicar el motivo");
  }

  const settings = await loadEcfSettings(client, companyId);
  const approvedAt = new Date().toISOString();

  const xml = buildCommercialApprovalXml({
    issuerRnc: row.issuer_rnc,
    issuerName: row.issuer_name ?? undefined,
    buyerRnc: settings.issuerRnc,
    buyerName: settings.issuerName,
    encf: row.encf,
    emittedAt: isoOf(row.emitted_at),
    montoTotal: String(row.total),
    status: input.status === "aceptado" ? "1" : "2",
    reason: input.reason,
    approvedAt,
  });

  const identity = await signingIdentity(client, companyId, settings);
  const signed = await signerFor(settings).sign(xml, identity);

  await client.query(
    `UPDATE ecf_received
        SET approval_status=$3, approval_reason=$4, approved_at=$5, approved_by=$6
      WHERE company_id=$1 AND id=$2`,
    [companyId, receivedId, input.status, input.reason ?? null, approvedAt, input.userId ?? null],
  );

  return { xml: signed.xml, approvalStatus: input.status };
}

/**
 * Links a received e-CF to the AP document we recorded for it.
 *
 * This is the reconciliation that makes Form 606 defensible: every purchase we
 * declare should correspond to a comprobante the supplier actually issued, and
 * every comprobante they issued to us should appear in our 606. The unmatched
 * lists on both sides are the interesting ones.
 */
export async function matchToPurchase(
  client: SqlClient,
  companyId: number,
  receivedId: number,
  purchaseDocumentId: number,
): Promise<{ matched: boolean; warnings: string[] }> {
  const row = await loadReceived(client, companyId, receivedId);
  const { rows } = await client.query(
    `SELECT ncf, total::text, issuer_rnc FROM fiscal_documents
      WHERE company_id=$1 AND id=$2 AND doc_type='purchase'`,
    [companyId, purchaseDocumentId],
  );
  if (rows.length === 0) throw new EcfInboxError("documento de compra no encontrado");
  const purchase = rows[0];

  // Mismatches are reported, not blocked: the operator may be matching a
  // legitimately-corrected document, and refusing would leave both sides
  // permanently unreconciled.
  const warnings: string[] = [];
  if (purchase.ncf && purchase.ncf !== row.encf) {
    warnings.push(`el NCF registrado (${purchase.ncf}) no coincide con el e-CF recibido (${row.encf})`);
  }
  if (Math.abs(Number(purchase.total) - Number(row.total)) > 0.05) {
    warnings.push(
      `el monto registrado (${Number(purchase.total).toFixed(2)}) difiere del recibido (${Number(row.total).toFixed(2)})`,
    );
  }

  await client.query(
    `UPDATE ecf_received SET purchase_document_id=$3 WHERE company_id=$1 AND id=$2`,
    [companyId, receivedId, purchaseDocumentId],
  );
  return { matched: true, warnings };
}

export async function listReceived(
  client: SqlClient,
  companyId: number,
  filters: { approvalStatus?: string; from?: string; to?: string; limit?: number } = {},
) {
  const { rows } = await client.query(
    `SELECT r.id, r.encf, r.ecf_type, r.issuer_rnc, r.issuer_name, r.emitted_at, r.currency,
            r.subtotal_taxed::text, r.subtotal_exempt::text, r.total_itbis::text, r.total::text,
            r.security_code, r.signature_valid, r.acknowledged_at,
            r.approval_status, r.approval_reason, r.approved_at,
            r.purchase_document_id, r.received_at, s.name AS supplier_name,
            u.name AS approved_by_name,
            -- Three days from receipt is the commercial-approval deadline; past
            -- it, silence has already counted as acceptance.
            (r.approval_status = 'pendiente'
             AND r.received_at < now() - interval '3 days') AS approval_overdue
       FROM ecf_received r
       LEFT JOIN suppliers s ON s.id = r.supplier_id
       LEFT JOIN users u ON u.id = r.approved_by
      WHERE r.company_id=$1
        AND ($2::text IS NULL OR r.approval_status::text = $2)
        AND ($3::date IS NULL OR r.emitted_at >= $3)
        AND ($4::date IS NULL OR r.emitted_at < ($4::date + interval '1 day'))
      ORDER BY r.received_at DESC
      LIMIT $5`,
    [companyId, filters.approvalStatus ?? null, filters.from ?? null, filters.to ?? null, filters.limit ?? 200],
  );
  return rows;
}

export async function getReceived(client: SqlClient, companyId: number, id: number) {
  const row = await loadReceived(client, companyId, id);
  const parsed = row.xml_received ? parseEcfXml(row.xml_received) : null;
  return { received: row, parsed };
}

async function loadReceived(client: SqlClient, companyId: number, id: number) {
  const { rows } = await client.query(
    `SELECT * FROM ecf_received WHERE company_id=$1 AND id=$2`,
    [companyId, id],
  );
  if (rows.length === 0) throw new EcfInboxError("comprobante recibido no encontrado");
  return rows[0];
}

const isoOf = (v: Date | string | null): string =>
  v instanceof Date ? v.toISOString() : v ? String(v) : new Date().toISOString();
