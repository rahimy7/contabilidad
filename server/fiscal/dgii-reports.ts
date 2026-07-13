import { SqlClient } from "../accounting/types";
import { Decimal, roundTo } from "../accounting/decimal";

/**
 * DGII periodic filings, derived from `fiscal_documents`.
 *
 * These need no general ledger: they are a projection of the comprobantes a
 * taxpayer issued and received. That is why compliance can ship before the
 * financial statements do.
 *
 * Layout details that are easy to get wrong and expensive to discover late:
 *   - Fields are pipe-separated, one record per line, no trailing pipe.
 *   - The header carries the RNC, the period as YYYYMM, and the record count.
 *   - Amounts use a period as decimal separator and always two decimals.
 *   - Dates are YYYYMMDD. An empty optional field is empty, not a zero.
 */

const PIPE = "|";

/**
 * Two decimals, dot separator, no thousands grouping.
 *
 * Rounded through the exact decimal helpers, not `Number(...).toFixed(2)`: a
 * float round-trip on an invoice total is exactly how a 607 ends up a centavo
 * away from the ledger it was derived from.
 */
const amount = (v: Decimal | number | null | undefined): string => {
  if (v === null || v === undefined) return "0.00";
  const rounded = roundTo(String(v), 2);
  const negative = rounded.startsWith("-");
  const body = negative ? rounded.slice(1) : rounded;
  const [int, frac = ""] = body.split(".");
  return `${negative ? "-" : ""}${int}.${(frac + "00").slice(0, 2)}`;
};

/** `Date` from pg, or a string. Rendered YYYYMMDD. */
const dgiiDate = (d: Date | string | null | undefined): string => {
  if (!d) return "";
  const iso = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  return iso.replace(/-/g, "");
};

const period = (year: number, month: number) => `${year}${String(month).padStart(2, "0")}`;

/**
 * Month bounds evaluated in Dominican local time.
 *
 * `emitted_at` is timestamptz. `date_trunc('month', emitted_at)` would depend on
 * the connection's TimeZone setting, so an invoice issued at 22:00 on the 31st
 * could fall into the next month for one caller and not another. The Dominican
 * Republic observes no DST, so a fixed zone is exact.
 */
const MONTH_FILTER = `
  (d.emitted_at AT TIME ZONE 'America/Santo_Domingo')::date >= make_date($2, $3, 1)
  AND (d.emitted_at AT TIME ZONE 'America/Santo_Domingo')::date
      < (make_date($2, $3, 1) + interval '1 month')::date
`;

/** RNC is 9 digits, cédula 11. DGII wants the identification type alongside it. */
const idType = (rnc: string): string => (rnc.length === 11 ? "2" : "1");

export interface ReportRequest {
  companyId: number;
  rnc: string;
  year: number;
  month: number;
}

export interface DgiiReport {
  form: "606" | "607" | "608" | "609";
  period: string;
  recordCount: number;
  header: string;
  lines: string[];
  /** The complete file, ready to upload. */
  content: string;
}

function assemble(form: DgiiReport["form"], rnc: string, per: string, lines: string[]): DgiiReport {
  const header = [form, rnc, per, String(lines.length)].join(PIPE);
  return {
    form,
    period: per,
    recordCount: lines.length,
    header,
    lines,
    content: [header, ...lines].join("\n") + (lines.length ? "\n" : ""),
  };
}

/**
 * 606 — Compras de bienes y servicios.
 *
 * One record per supplier comprobante received. On a purchase document the
 * issuer is the supplier and the buyer is us, so the RNC to report is
 * `issuer_rnc` — reporting `buyer_rnc` would file our own RNC as the supplier's
 * on every line.
 */
export async function generate606(client: SqlClient, req: ReportRequest): Promise<DgiiReport> {
  const { rows } = await client.query(
    `SELECT coalesce(d.issuer_rnc, s.tax_id) AS supplier_rnc,
            d.ncf, d.modifies_ncf, d.emitted_at,
            d.subtotal_taxed::text, d.subtotal_exempt::text,
            (d.itbis_18 + d.itbis_16 + d.itbis_0)::text AS itbis,
            d.retention_itbis::text, d.retention_isr::text, d.total::text
       FROM fiscal_documents d
       LEFT JOIN suppliers s ON s.id = d.supplier_id
      WHERE d.company_id = $1
        AND d.doc_type = 'purchase'
        AND d.status <> 'cancelled'
        AND ${MONTH_FILTER}
      ORDER BY d.emitted_at, d.id`,
    [req.companyId, req.year, req.month],
  );

  const lines = rows.map((r) => {
    const rnc = r.supplier_rnc ?? "";
    return [
      rnc,
      idType(rnc),
      // Tipo de bienes y servicios comprados. '09' = compras y gastos generales,
      // the safe default until a purchase carries its own classification.
      "09",
      r.ncf ?? "",
      r.modifies_ncf ?? "",
      dgiiDate(r.emitted_at),
      amount(r.subtotal_taxed),
      amount(r.itbis),
      amount(r.retention_itbis),
      amount(r.retention_isr),
      amount(r.total),
    ].join(PIPE);
  });

  return assemble("606", req.rnc, period(req.year, req.month), lines);
}

/**
 * 607 — Ventas de bienes y servicios.
 *
 * One record per comprobante we issued. Cancelled documents are excluded: they
 * belong on the 608, and reporting them here would overstate sales.
 */
export async function generate607(client: SqlClient, req: ReportRequest): Promise<DgiiReport> {
  const { rows } = await client.query(
    `SELECT d.buyer_rnc, d.ncf, d.modifies_ncf, d.emitted_at,
            d.subtotal_taxed::text, d.subtotal_exempt::text,
            (d.itbis_18 + d.itbis_16 + d.itbis_0)::text AS itbis,
            d.retention_itbis::text, d.retention_isr::text,
            d.tip_legal::text, d.total::text
       FROM fiscal_documents d
      WHERE d.company_id = $1
        AND d.doc_type IN ('invoice','credit_note','debit_note')
        AND d.status = 'issued'
        AND ${MONTH_FILTER}
      ORDER BY d.emitted_at, d.id`,
    [req.companyId, req.year, req.month],
  );

  const lines = rows.map((r) => {
    const rnc = r.buyer_rnc ?? "";
    return [
      rnc,
      // Empty for consumo final: there is no buyer identification to report.
      rnc === "" ? "" : idType(rnc),
      r.ncf ?? "",
      r.modifies_ncf ?? "",
      dgiiDate(r.emitted_at),
      amount(r.subtotal_taxed),
      amount(r.itbis),
      amount(r.retention_itbis),
      amount(r.retention_isr),
      amount(r.subtotal_exempt),
      amount(r.tip_legal),
      amount(r.total),
    ].join(PIPE);
  });

  return assemble("607", req.rnc, period(req.year, req.month), lines);
}

/**
 * IT-1 — Declaración mensual del ITBIS.
 *
 * Not a comprobante file but a summary declaration: the ITBIS charged on sales
 * (from the 607 documents) minus the ITBIS paid on purchases (the crédito fiscal
 * from the 606 documents), giving the balance to pay DGII. Retentions we
 * suffered reduce it further. Derived entirely from the fiscal documents, so it
 * reconciles to the 606/607 by construction.
 */
export interface It1Summary {
  period: string;
  itbisCharged: string; // débito fiscal (ventas)
  itbisPaid: string; // crédito fiscal (compras)
  itbisWithheldFromUs: string; // retenciones que nos hicieron
  balanceToPay: string; // a pagar (o saldo a favor si negativo)
}

export async function generateIt1(client: SqlClient, req: ReportRequest): Promise<It1Summary> {
  const { rows } = await client.query(
    `SELECT
        coalesce(sum((itbis_18+itbis_16+itbis_0)) FILTER (
          WHERE doc_type IN ('invoice','debit_note') AND status='issued'), 0)::text AS charged,
        coalesce(sum((itbis_18+itbis_16+itbis_0)) FILTER (
          WHERE doc_type='credit_note' AND status='issued'), 0)::text AS charged_credit_notes,
        coalesce(sum((itbis_18+itbis_16+itbis_0)) FILTER (
          WHERE doc_type='purchase' AND status<>'cancelled'), 0)::text AS paid,
        coalesce(sum(retention_itbis) FILTER (
          WHERE doc_type IN ('invoice','debit_note') AND status='issued'), 0)::text AS withheld
       FROM fiscal_documents d
      WHERE company_id=$1 AND ${MONTH_FILTER}`,
    [req.companyId, req.year, req.month],
  );
  const r = rows[0];
  // Credit notes reduce the ITBIS we charged.
  const charged = num(r.charged) - num(r.charged_credit_notes);
  const paid = num(r.paid);
  const withheld = num(r.withheld);
  const balance = charged - paid - withheld;
  return {
    period: period(req.year, req.month),
    itbisCharged: money2(charged),
    itbisPaid: money2(paid),
    itbisWithheldFromUs: money2(withheld),
    balanceToPay: money2(balance),
  };
}

const num = (s: string) => Math.round(Number(s) * 100) / 100;
const money2 = (n: number) => n.toFixed(2);

/**
 * IR-17 — Retenciones y retribuciones complementarias.
 *
 * The monthly declaration of ISR withheld from third parties (not employees on
 * payroll — those go on the IR-3). Every purchase document that withheld ISR
 * carries a `retention_concept`; this groups the withholdings by that concept
 * into the IR-17's boxes. The total withheld reconciles to the credit movement
 * of "ISR retenido por pagar" (2.1.02.003) for the month, because that is the
 * account the AP posting credits.
 */
const IR17_CONCEPTS: Record<string, string> = {
  alquileres: "Alquileres",
  honorarios: "Honorarios por servicios",
  otras_rentas: "Otras rentas",
  dividendos: "Dividendos",
  intereses: "Intereses a personas físicas",
  premios: "Premios o ganancias",
  remesas_exterior: "Remesas al exterior",
  retribuciones_complementarias: "Retribuciones complementarias",
  transferencia_bienes: "Transferencia de bienes",
  proveedores_estado: "Proveedores del Estado",
};

export interface Ir17Line {
  concept: string;
  label: string;
  count: number;
  base: string; // monto sujeto a retención
  retained: string; // ISR retenido
}

export interface Ir17Summary {
  period: string;
  lines: Ir17Line[];
  totalBase: string;
  totalRetained: string; // total a pagar a la DGII
}

export async function generateIr17(client: SqlClient, req: ReportRequest): Promise<Ir17Summary> {
  const { rows } = await client.query(
    `SELECT coalesce(d.retention_concept, 'otras_rentas') AS concept,
            count(*)::int AS count,
            coalesce(sum(d.subtotal_taxed + d.subtotal_exempt), 0)::text AS base,
            coalesce(sum(d.retention_isr), 0)::text AS retained
       FROM fiscal_documents d
      WHERE d.company_id = $1
        AND d.doc_type = 'purchase'
        AND d.status <> 'cancelled'
        AND d.retention_isr > 0
        AND ${MONTH_FILTER}
      GROUP BY coalesce(d.retention_concept, 'otras_rentas')
      ORDER BY 1`,
    [req.companyId, req.year, req.month],
  );

  const lines: Ir17Line[] = rows.map((r) => ({
    concept: r.concept,
    label: IR17_CONCEPTS[r.concept] ?? r.concept,
    count: r.count,
    base: money2(num(r.base)),
    retained: money2(num(r.retained)),
  }));

  const totalBase = lines.reduce((s, l) => s + num(l.base), 0);
  const totalRetained = lines.reduce((s, l) => s + num(l.retained), 0);

  return {
    period: period(req.year, req.month),
    lines,
    totalBase: money2(totalBase),
    totalRetained: money2(totalRetained),
  };
}

/**
 * 609 — Pagos al exterior.
 *
 * Payments to non-residents and the ISR withheld on them. Unlike the 606/607,
 * the source is `foreign_payments`, not `fiscal_documents`: a payment abroad has
 * no NCF. Amounts are already in DOP, and the month filter is a plain date
 * comparison because `payment_date` is a `date`, not a timestamptz.
 *
 * The tipo de renta codes below are a working default; confirm them against the
 * current DGII 609 layout before filing.
 */
const FORM609_INCOME_CODES: Record<string, string> = {
  alquileres: "01",
  servicios: "02",
  intereses: "03",
  dividendos: "04",
  regalias: "05",
  asistencia_tecnica: "06",
  remesas: "07",
  otras_rentas: "08",
};

export async function generate609(client: SqlClient, req: ReportRequest): Promise<DgiiReport> {
  const { rows } = await client.query(
    `SELECT beneficiary_name, income_type, payment_date, gross_amount::text, isr_retained::text
       FROM foreign_payments
      WHERE company_id = $1
        AND status <> 'void'
        AND payment_date >= make_date($2, $3, 1)
        AND payment_date < (make_date($2, $3, 1) + interval '1 month')::date
      ORDER BY payment_date, id`,
    [req.companyId, req.year, req.month],
  );

  const lines = rows.map((r) =>
    [
      r.beneficiary_name ?? "",
      FORM609_INCOME_CODES[r.income_type] ?? "02",
      dgiiDate(r.payment_date),
      amount(r.gross_amount),
      amount(r.isr_retained),
    ].join(PIPE),
  );

  return assemble("609", req.rnc, period(req.year, req.month), lines);
}

/**
 * 608 — Comprobantes anulados.
 *
 * The counterpart to NCF sequences having gaps. A number allocated to a document
 * later cancelled, or to an e-CF DGII rejected, is accounted for here rather
 * than by trying to keep the sequence dense.
 */
export async function generate608(client: SqlClient, req: ReportRequest): Promise<DgiiReport> {
  const { rows } = await client.query(
    `SELECT d.ncf, d.emitted_at,
            CASE WHEN d.ecf_status = 'rechazado' THEN '05' ELSE '01' END AS reason
       FROM fiscal_documents d
      WHERE d.company_id = $1
        AND (d.status = 'cancelled' OR d.ecf_status IN ('anulado','rechazado'))
        AND ${MONTH_FILTER}
      ORDER BY d.ncf`,
    [req.companyId, req.year, req.month],
  );

  // Anulación reason codes: 01 = deterioro de factura pre-impresa,
  // 05 = comprobante rechazado. A fuller mapping belongs with the cancel UI.
  const lines = rows.map((r) => [r.ncf ?? "", dgiiDate(r.emitted_at), r.reason].join(PIPE));

  return assemble("608", req.rnc, period(req.year, req.month), lines);
}
