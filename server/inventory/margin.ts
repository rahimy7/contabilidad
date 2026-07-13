import { SqlClient } from "../accounting/types";
import { Decimal, add, sub, isZero } from "../accounting/decimal";

/**
 * Gross-margin report by product for a month.
 *
 * Revenue is the net sales value (each fiscal line's `line_total`, before ITBIS),
 * with credit notes subtracted. Cost is the COGS the inventory ledger recognised
 * — issues, less any returns put back on the shelf. Margin is the difference, and
 * both sides come from data already posted, so the report needs no new schema and
 * ties to the ledger it was derived from.
 */
export interface MarginLine {
  product_id: number;
  revenue: string;
  cogs: string;
  margin: string;
  marginPct: string;
}

export interface MarginReport {
  period: string;
  lines: MarginLine[];
  totalRevenue: string;
  totalCogs: string;
  totalMargin: string;
  marginPct: string;
}

export async function marginReport(
  client: SqlClient,
  req: { companyId: number; year: number; month: number },
): Promise<MarginReport> {
  const { rows } = await client.query(
    `WITH rev AS (
       SELECT fdl.product_id AS pid,
              sum(CASE WHEN fd.doc_type='credit_note' THEN -fdl.line_total ELSE fdl.line_total END) AS revenue
         FROM fiscal_document_lines fdl
         JOIN fiscal_documents fd ON fd.id = fdl.document_id
        WHERE fd.company_id = $1
          AND fd.status = 'issued'
          AND fdl.product_id IS NOT NULL
          AND fd.doc_type IN ('invoice','debit_note','credit_note')
          AND (fd.emitted_at AT TIME ZONE 'America/Santo_Domingo')::date >= make_date($2,$3,1)
          AND (fd.emitted_at AT TIME ZONE 'America/Santo_Domingo')::date < (make_date($2,$3,1) + interval '1 month')::date
        GROUP BY fdl.product_id
     ),
     cog AS (
       SELECT product_id AS pid,
              sum(CASE WHEN kind='return' THEN -total_cost ELSE total_cost END) AS cogs
         FROM inventory_cost_movements
        WHERE company_id = $1
          AND kind IN ('issue','return')
          AND movement_date >= make_date($2,$3,1)
          AND movement_date < (make_date($2,$3,1) + interval '1 month')::date
        GROUP BY product_id
     )
     SELECT coalesce(rev.pid, cog.pid) AS product_id,
            coalesce(rev.revenue,0)::text AS revenue,
            coalesce(cog.cogs,0)::text AS cogs
       FROM rev FULL OUTER JOIN cog ON rev.pid = cog.pid
      ORDER BY 1`,
    [req.companyId, req.year, req.month],
  );

  let totalRevenue: Decimal = "0";
  let totalCogs: Decimal = "0";
  const lines: MarginLine[] = rows.map((r) => {
    const revenue = add(r.revenue, "0");
    const cogs = add(r.cogs, "0");
    const margin = sub(revenue, cogs);
    totalRevenue = add(totalRevenue, revenue);
    totalCogs = add(totalCogs, cogs);
    return { product_id: Number(r.product_id), revenue, cogs, margin, marginPct: pct(margin, revenue) };
  });

  const totalMargin = sub(totalRevenue, totalCogs);
  return {
    period: `${req.year}${String(req.month).padStart(2, "0")}`,
    lines,
    totalRevenue,
    totalCogs,
    totalMargin,
    marginPct: pct(totalMargin, totalRevenue),
  };
}

/** Margin as a percentage of revenue, to two places; a display figure. */
function pct(margin: Decimal, revenue: Decimal): string {
  if (isZero(revenue)) return "0.00";
  return ((Number(margin) / Number(revenue)) * 100).toFixed(2);
}
