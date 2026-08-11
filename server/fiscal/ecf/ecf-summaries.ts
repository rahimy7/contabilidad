import { SqlClient } from "../../accounting/types";
import { buildRfceXml, buildSequenceVoidXml, encfOf } from "./xml-builder";
import { loadEcfSettings, signingIdentity, signerFor, gatewayFor } from "./ecf-config";

/**
 * The two filings that are about *ranges* rather than single documents.
 *
 * **RFCE** — a consumo issuer selling 400 times a day cannot make 400 API calls;
 * DGII lets everything below the threshold go as a periodic summary. The
 * individual comprobantes stay with the taxpayer, printed and produced on
 * request, and only the range and its totals travel.
 *
 * **Anulación de rangos** — numbers authorized but never used. Distinct from
 * Form 608, which reports voided *documents*; this reports numbers that will
 * never become documents at all, so they cannot resurface later as an invoice
 * nobody can explain.
 */

export class EcfSummaryError extends Error {}

/**
 * Builds and files the RFCE for a period.
 *
 * Only documents that are actually eligible go in: E32 below the threshold, in
 * the period, issued and not cancelled. An accepted document that already went
 * to DGII individually must not also appear in a summary — that is double
 * reporting, and the `ecf_status IS NULL` filter is what keeps it out.
 */
export async function fileRfce(
  client: SqlClient,
  companyId: number,
  input: { from: string; to: string },
): Promise<{
  filed: boolean;
  documentCount: number;
  trackId?: string;
  status?: string;
  totals: Record<string, string>;
  reason?: string;
}> {
  const settings = await loadEcfSettings(client, companyId);

  const { rows } = await client.query(
    `SELECT count(*)::int                          AS n,
            min(ncf)                               AS encf_from,
            max(ncf)                               AS encf_to,
            coalesce(sum(subtotal_taxed),0)::text  AS gravado,
            coalesce(sum(subtotal_exempt),0)::text AS exento,
            coalesce(sum(itbis_18 + itbis_16 + itbis_0),0)::text AS itbis,
            coalesce(sum(total),0)::text           AS total
       FROM fiscal_documents
      WHERE company_id=$1 AND ncf_type='E32' AND status='issued'
        AND emitted_at >= $2 AND emitted_at < ($3::date + interval '1 day')
        AND total < $4::numeric
        -- Already sent individually? Then it is filed; a summary would report
        -- the same sale twice.
        AND (ecf_status IS NULL OR ecf_status = 'pendiente')`,
    [companyId, input.from, input.to, settings.rfceThreshold],
  );
  const r = rows[0];

  if (r.n === 0) {
    return {
      filed: false,
      documentCount: 0,
      totals: {},
      reason: "no hay facturas de consumo pendientes de resumir en ese período",
    };
  }

  const xml = buildRfceXml({
    issuerRnc: settings.issuerRnc,
    issuerName: settings.issuerName,
    encfFrom: r.encf_from,
    encfTo: r.encf_to,
    periodFrom: input.from,
    periodTo: input.to,
    documentCount: r.n,
    totals: {
      gravadoTotal: r.gravado,
      exento: r.exento,
      totalItbis: r.itbis,
      montoTotal: r.total,
    },
  });

  const identity = await signingIdentity(client, companyId, settings);
  const signed = await signerFor(settings).sign(xml, identity);
  const gateway = gatewayFor(client, settings);
  const token = await gateway.authenticate(identity);
  const result = await gateway.submit(signed.xml, token);

  // Marking them filed is what stops the next run resummarising the same sales.
  await client.query(
    `UPDATE fiscal_documents
        SET ecf_status='aceptado', track_id=$4, updated_at=now()
      WHERE company_id=$1 AND ncf_type='E32' AND status='issued'
        AND emitted_at >= $2 AND emitted_at < ($3::date + interval '1 day')
        AND (ecf_status IS NULL OR ecf_status='pendiente')`,
    [companyId, input.from, input.to, result.trackId],
  );

  return {
    filed: true,
    documentCount: r.n,
    trackId: result.trackId,
    status: result.status,
    totals: { gravado: r.gravado, exento: r.exento, itbis: r.itbis, total: r.total },
  };
}

/**
 * Declares a range of eNCF as never to be used.
 *
 * Refuses to void numbers already spent: a number attached to an issued
 * comprobante cannot be declared unused, and letting that through would put the
 * taxpayer's own filings in contradiction with each other.
 */
export async function voidSequenceRange(
  client: SqlClient,
  companyId: number,
  input: { ecfType: string; rangeFrom: number; rangeTo: number; reason?: string; userId?: number },
): Promise<{ id: number; status: string; trackId?: string; count: number }> {
  if (input.rangeTo < input.rangeFrom) {
    throw new EcfSummaryError("el rango final no puede ser menor que el inicial");
  }
  const settings = await loadEcfSettings(client, companyId);

  const used = await client.query(
    `SELECT count(*)::int AS n FROM fiscal_documents
      WHERE company_id=$1 AND ncf_type=$2 AND ncf IS NOT NULL
        AND substring(ncf from 4)::bigint BETWEEN $3 AND $4`,
    [companyId, input.ecfType, input.rangeFrom, input.rangeTo],
  );
  if (used.rows[0].n > 0) {
    throw new EcfSummaryError(
      `${used.rows[0].n} número(s) del rango ya están emitidos; no pueden anularse como no utilizados`,
    );
  }

  const xml = buildSequenceVoidXml({
    issuerRnc: settings.issuerRnc,
    ecfType: input.ecfType,
    rangeFrom: input.rangeFrom,
    rangeTo: input.rangeTo,
    voidedAt: new Date().toISOString(),
  });

  const identity = await signingIdentity(client, companyId, settings);
  const signed = await signerFor(settings).sign(xml, identity);

  const inserted = await client.query(
    `INSERT INTO ecf_sequence_voids
       (company_id, ecf_type, range_from, range_to, reason, status, xml_signed, voided_by)
     VALUES ($1,$2,$3,$4,$5,'pendiente',$6,$7) RETURNING id`,
    [companyId, input.ecfType, input.rangeFrom, input.rangeTo, input.reason ?? null, signed.xml, input.userId ?? null],
  );
  const id = Number(inserted.rows[0].id);

  let status = "pendiente";
  let trackId: string | undefined;
  try {
    const gateway = gatewayFor(client, settings);
    const token = await gateway.authenticate(identity);
    const result = await gateway.submit(signed.xml, token);
    trackId = result.trackId;
    status = result.status === "rechazado" ? "rechazado" : "enviado";
    await client.query(
      `UPDATE ecf_sequence_voids SET status=$2, track_id=$3, sent_at=now() WHERE id=$1`,
      [id, status, trackId],
    );
  } catch (err) {
    // The declaration is recorded even when DGII is unreachable; it can be
    // resent. Losing the operator's intent because the network was down would
    // mean the range stays quietly usable.
    await client.query(`UPDATE ecf_sequence_voids SET status='pendiente' WHERE id=$1`, [id]);
  }

  // Close the local sequence too, or the allocator would keep handing out
  // numbers this declaration just told DGII would never be used.
  await client.query(
    `UPDATE ncf_sequences
        SET is_active=false
      WHERE company_id=$1 AND ncf_type=$2 AND range_from >= $3 AND range_to <= $4`,
    [companyId, input.ecfType, input.rangeFrom, input.rangeTo],
  );

  return { id, status, trackId, count: input.rangeTo - input.rangeFrom + 1 };
}

export async function listSequenceVoids(client: SqlClient, companyId: number) {
  const { rows } = await client.query(
    `SELECT v.id, v.ecf_type, v.range_from, v.range_to, v.reason, v.status, v.track_id,
            v.created_at, v.sent_at, u.name AS voided_by_name,
            (v.range_to - v.range_from + 1) AS count
       FROM ecf_sequence_voids v
       LEFT JOIN users u ON u.id = v.voided_by
      WHERE v.company_id=$1 ORDER BY v.created_at DESC LIMIT 100`,
    [companyId],
  );
  return rows;
}

/** What a summary *would* cover, so a screen can show it before filing. */
export async function previewRfce(
  client: SqlClient,
  companyId: number,
  input: { from: string; to: string },
) {
  const settings = await loadEcfSettings(client, companyId);
  const { rows } = await client.query(
    `SELECT count(*)::int AS n, min(ncf) AS encf_from, max(ncf) AS encf_to,
            coalesce(sum(total),0)::text AS total
       FROM fiscal_documents
      WHERE company_id=$1 AND ncf_type='E32' AND status='issued'
        AND emitted_at >= $2 AND emitted_at < ($3::date + interval '1 day')
        AND total < $4::numeric
        AND (ecf_status IS NULL OR ecf_status='pendiente')`,
    [companyId, input.from, input.to, settings.rfceThreshold],
  );
  return { ...rows[0], threshold: settings.rfceThreshold };
}

export { encfOf };
