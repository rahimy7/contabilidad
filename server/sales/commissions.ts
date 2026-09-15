import { SqlClient } from "../accounting/types";
import { Decimal, add, sub, mul, roundTo, toMoney, cmp, isZero } from "../accounting/decimal";

/**
 * Sales commissions from the fiscal documents.
 *
 * The legacy calculation read POS orders and assumed every sale carried a 30%
 * margin. What a seller actually sold is on the comprobantes: invoices and debit
 * notes attributed to them (`seller_user_id`), less the credit notes that
 * reversed part of those sales. The margin is real — revenue less the cost of
 * goods the sale issued from inventory, net of what returns put back.
 *
 * Rules (`commission_rules`) are read per store as before and now honour their
 * validity dates and role scope. A product rule beats the general rule; among
 * rules of the same kind the lowest `priority` wins. The general rule also
 * carries the monthly goal and the bonus percentage paid when it is reached.
 */
export class CommissionError extends Error {}

interface Rule {
  id: number;
  calculation_base: "revenue" | "gross_margin" | "units";
  scope_type: "all_sellers" | "by_user" | "by_role";
  product_id: number | null;
  percent_rate: string | null;
  fixed_per_unit: string | null;
  goal_amount: string | null;
  bonus_percent: string | null;
  priority: number;
}

export interface CommissionCalculation {
  userId: number;
  year: number;
  month: number;
  totalRevenue: Decimal;
  totalGrossMargin: Decimal;
  totalUnits: Decimal;
  goalAmount: Decimal;
  goalAchieved: boolean;
  commissionAmount: Decimal;
  bonusAmount: Decimal;
  totalEarned: Decimal;
  documents: number;
}

export async function calculateFiscalCommissions(
  client: SqlClient,
  input: { companyId: number; storeId: number; userId: number; year: number; month: number },
): Promise<CommissionCalculation> {
  const start = `${input.year}-${String(input.month).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(input.year, input.month, 0)).toISOString().slice(0, 10);

  const role = (await client.query(`SELECT role FROM users WHERE id=$1`, [input.userId])).rows[0]?.role ?? null;
  const rules: Rule[] = (
    await client.query(
      `SELECT id, calculation_base, scope_type, product_id, percent_rate::text, fixed_per_unit::text,
              goal_amount::text, bonus_percent::text, priority
         FROM commission_rules
        WHERE store_id=$1 AND is_active AND (company_id IS NULL OR company_id=$2)
          AND valid_from <= $4::date AND (valid_to IS NULL OR valid_to >= $3::date)
          AND (scope_type='all_sellers'
               OR (scope_type='by_user' AND $5::int = ANY(scope_user_ids))
               OR (scope_type='by_role' AND scope_role = $6))
        ORDER BY priority ASC, id ASC`,
      [input.storeId, input.companyId, start, end, input.userId, role],
    )
  ).rows;
  const productRules = new Map<number, Rule>();
  let general: Rule | null = null;
  for (const r of rules) {
    if (r.product_id) {
      if (!productRules.has(Number(r.product_id))) productRules.set(Number(r.product_id), r);
    } else if (!general) general = r;
  }

  // Net revenue, units and cost per product for the seller's documents of the month.
  const { rows } = await client.query(
    `WITH docs AS (
       SELECT d.id, d.doc_type,
              CASE WHEN d.doc_type='credit_note' THEN -1 ELSE 1 END AS sign,
              CASE WHEN d.doc_type='credit_note' THEN d.modifies_doc_id ELSE d.id END AS sale_id
         FROM fiscal_documents d
        WHERE d.company_id=$1 AND d.status='issued' AND d.document_date BETWEEN $2::date AND $3::date
          AND d.doc_type IN ('invoice','debit_note','credit_note')
          AND coalesce(d.seller_user_id,
                       (SELECT o.seller_user_id FROM fiscal_documents o WHERE o.id = d.modifies_doc_id)) = $4
     ),
     lines AS (
       SELECT l.product_id, sum(docs.sign * l.line_total) AS revenue, sum(docs.sign * l.quantity) AS units
         FROM fiscal_document_lines l JOIN docs ON docs.id = l.document_id
        GROUP BY l.product_id
     ),
     cost AS (
       SELECT m.product_id,
              sum(CASE WHEN m.kind='issue' THEN m.total_cost ELSE -m.total_cost END) AS cogs
         FROM inventory_cost_movements m
        WHERE m.company_id=$1
          AND ((m.kind='issue' AND m.source_type='fiscal_document' AND m.source_id IN (SELECT id::text FROM docs WHERE doc_type <> 'credit_note'))
            OR (m.kind='return' AND m.source_type='credit_note' AND m.source_id IN (SELECT id::text FROM docs WHERE doc_type = 'credit_note')))
        GROUP BY m.product_id
     )
     SELECT lines.product_id, coalesce(lines.revenue,0)::text AS revenue, coalesce(lines.units,0)::text AS units,
            coalesce(cost.cogs,0)::text AS cogs,
            (SELECT count(*) FROM docs)::int AS documents
       FROM lines LEFT JOIN cost ON cost.product_id IS NOT DISTINCT FROM lines.product_id`,
    [input.companyId, start, end, input.userId],
  );

  let totalRevenue: Decimal = "0";
  let totalMargin: Decimal = "0";
  let totalUnits: Decimal = "0";
  let commission: Decimal = "0";
  for (const r of rows) {
    const revenue: Decimal = r.revenue;
    const margin = sub(r.revenue, r.cogs);
    totalRevenue = add(totalRevenue, revenue);
    totalMargin = add(totalMargin, margin);
    totalUnits = add(totalUnits, r.units);
    const rule = (r.product_id && productRules.get(Number(r.product_id))) || general;
    if (!rule) continue;
    const pct = roundTo(String(Number(rule.percent_rate ?? 0) / 100), 8);
    const earned =
      rule.calculation_base === "revenue" ? mul(revenue, pct)
      : rule.calculation_base === "gross_margin" ? mul(margin, pct)
      : mul(r.units, rule.fixed_per_unit ?? "0");
    commission = add(commission, earned);
  }
  commission = roundTo(commission, 2);

  const goalAmount: Decimal = general?.goal_amount ?? "0";
  const goalAchieved = !isZero(goalAmount) && cmp(totalRevenue, goalAmount) >= 0;
  const bonus = goalAchieved && general?.bonus_percent
    ? roundTo(mul(commission, roundTo(String(Number(general.bonus_percent) / 100), 8)), 2)
    : "0";

  return {
    userId: input.userId, year: input.year, month: input.month,
    totalRevenue: toMoney(totalRevenue), totalGrossMargin: toMoney(totalMargin), totalUnits: toMoney(totalUnits),
    goalAmount: toMoney(goalAmount), goalAchieved,
    commissionAmount: toMoney(commission), bonusAmount: toMoney(bonus), totalEarned: toMoney(add(commission, bonus)),
    documents: rows[0]?.documents ?? 0,
  };
}

/**
 * Freezes the month's commission for a seller as a draft earning. Re-closing a
 * month still in draft recalculates it (a late credit note must lower it);
 * once approved or paid it is final.
 */
export async function closeFiscalCommissionPeriod(
  client: SqlClient,
  input: { companyId: number; storeId: number; userId: number; year: number; month: number },
): Promise<{ earningId: number; calculation: CommissionCalculation }> {
  const calc = await calculateFiscalCommissions(client, input);
  const existing = await client.query(
    `SELECT id, status FROM commission_earnings
      WHERE store_id=$1 AND user_id=$2 AND period_year=$3 AND period_month=$4 AND status <> 'cancelled'`,
    [input.storeId, input.userId, input.year, input.month],
  );
  if (existing.rows.length > 0 && existing.rows[0].status !== "draft") {
    throw new CommissionError(`la comisión de ${input.year}-${input.month} ya está ${existing.rows[0].status}`);
  }
  const values = [
    calc.totalRevenue, calc.totalGrossMargin, calc.totalUnits, calc.goalAmount, calc.goalAchieved,
    calc.commissionAmount, calc.bonusAmount, calc.totalEarned, input.companyId,
  ];
  if (existing.rows.length > 0) {
    await client.query(
      `UPDATE commission_earnings
          SET total_revenue=$2, total_gross_margin=$3, total_units=$4, goal_amount=$5, goal_achieved=$6,
              commission_amount=$7, bonus_amount=$8, total_earned=$9, company_id=$10, updated_at=now()
        WHERE id=$1`,
      [existing.rows[0].id, ...values],
    );
    return { earningId: Number(existing.rows[0].id), calculation: calc };
  }
  const r = await client.query(
    `INSERT INTO commission_earnings
       (store_id, user_id, period_year, period_month, total_revenue, total_gross_margin, total_units,
        goal_amount, goal_achieved, commission_amount, bonus_amount, total_earned, company_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft') RETURNING id`,
    [input.storeId, input.userId, input.year, input.month, ...values],
  );
  return { earningId: Number(r.rows[0].id), calculation: calc };
}

/** Approval by someone other than the seller who earned it. */
export async function approveFiscalCommission(
  client: SqlClient,
  input: { earningId: number; approvedBy: number },
): Promise<void> {
  const r = await client.query(`SELECT user_id, status FROM commission_earnings WHERE id=$1 FOR UPDATE`, [input.earningId]);
  if (r.rows.length === 0) throw new CommissionError(`comisión ${input.earningId} no existe`);
  if (Number(r.rows[0].user_id) === input.approvedBy) throw new CommissionError("un vendedor no puede aprobar su propia comisión");
  if (r.rows[0].status !== "draft") throw new CommissionError(`la comisión ya está ${r.rows[0].status}`);
  await client.query(
    `UPDATE commission_earnings SET status='approved', approved_by=$2, approved_at=now(), updated_at=now() WHERE id=$1`,
    [input.earningId, input.approvedBy],
  );
}
