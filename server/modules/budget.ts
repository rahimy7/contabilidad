import { SqlClient } from "../accounting/types";
import { Decimal, add, sub, toMoney } from "../accounting/decimal";

/**
 * Budgets and budget-vs-actual.
 *
 * The comparison joins budget lines to the posted ledger on the same account,
 * so "actual" is exactly what the financial statements show — there is no
 * separate accumulation to drift out of sync. For income and expense accounts
 * the actual is the period's net movement; the variance is budget − actual, and
 * whether that is favourable depends on the account's nature.
 */
export class BudgetError extends Error {}

export interface BudgetLineInput {
  accountCode: string;
  costCenterId?: number;
  periodNo: number;
  amount: Decimal;
}

export interface VarianceRow {
  code: string;
  name: string;
  accountType: string;
  budget: Decimal;
  actual: Decimal;
  variance: Decimal;
}

export class Budgets {
  constructor(private readonly client: SqlClient) {}

  async create(companyId: number, name: string, fiscalYear: number, lines: BudgetLineInput[]): Promise<number> {
    const budget = await this.client.query(
      `INSERT INTO budgets (company_id, name, fiscal_year) VALUES ($1,$2,$3) RETURNING id`,
      [companyId, name, fiscalYear],
    );
    const budgetId = Number(budget.rows[0].id);

    for (const l of lines) {
      if (l.periodNo < 1 || l.periodNo > 12) throw new BudgetError(`período inválido: ${l.periodNo}`);
      const acc = await this.client.query(`SELECT id FROM chart_of_accounts WHERE company_id=$1 AND code=$2`, [companyId, l.accountCode]);
      if (acc.rows.length === 0) throw new BudgetError(`cuenta ${l.accountCode} no existe`);
      await this.client.query(
        `INSERT INTO budget_lines (company_id, budget_id, account_id, cost_center_id, period_no, amount)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (budget_id, account_id, cost_center_id, period_no)
         DO UPDATE SET amount = EXCLUDED.amount`,
        [companyId, budgetId, acc.rows[0].id, l.costCenterId ?? null, l.periodNo, toMoney(l.amount)],
      );
    }
    return budgetId;
  }

  /**
   * Budget vs actual for a period range. Budget is the sum of budget lines;
   * actual is the net ledger movement of the same accounts, presented with the
   * account's natural sign (income and expense positive).
   */
  async varianceReport(
    companyId: number,
    budgetId: number,
    fromPeriod = 1,
    toPeriod = 12,
  ): Promise<{ rows: VarianceRow[]; totalBudget: Decimal; totalActual: Decimal }> {
    // Resolve the budget's year up front rather than via a correlated subquery
    // inside the CTE — the subquery form proved fragile, and this is clearer.
    const b = await this.client.query(`SELECT fiscal_year FROM budgets WHERE id=$1 AND company_id=$2`, [budgetId, companyId]);
    if (b.rows.length === 0) throw new BudgetError(`presupuesto ${budgetId} no existe`);
    const fiscalYear = b.rows[0].fiscal_year;

    const { rows } = await this.client.query(
      `WITH bud AS (
         SELECT account_id, sum(amount) AS budget
           FROM budget_lines
          WHERE company_id=$1 AND budget_id=$2 AND period_no BETWEEN $3 AND $4
          GROUP BY account_id
       ), act AS (
         SELECT b.account_id,
                sum(CASE WHEN a.account_type='income' THEN -b.closing_func ELSE b.closing_func END) AS actual
           FROM account_period_balances b
           JOIN accounting_periods p ON p.id=b.period_id
           JOIN chart_of_accounts a ON a.id=b.account_id
          WHERE b.company_id=$1 AND p.fiscal_year=$5
            AND p.period_no BETWEEN $3 AND $4
          GROUP BY b.account_id
       )
       SELECT a.code, a.name, a.account_type,
              coalesce(bud.budget,0)::text AS budget,
              coalesce(act.actual,0)::text AS actual
         FROM chart_of_accounts a
         LEFT JOIN bud ON bud.account_id=a.id
         LEFT JOIN act ON act.account_id=a.id
        WHERE a.company_id=$1
          -- Budget vs actual is a P&L comparison; balance-sheet accounts (the
          -- cash that funded a payment, say) are not what a budget tracks.
          AND a.account_type IN ('income','expense')
          AND (bud.budget IS NOT NULL OR act.actual IS NOT NULL)
        ORDER BY a.code`,
      [companyId, budgetId, fromPeriod, toPeriod, fiscalYear],
    );

    let totalBudget: Decimal = "0";
    let totalActual: Decimal = "0";
    const out: VarianceRow[] = rows.map((r) => {
      const budget = add(r.budget, "0");
      const actual = add(r.actual, "0");
      totalBudget = add(totalBudget, budget);
      totalActual = add(totalActual, actual);
      return { code: r.code, name: r.name, accountType: r.account_type, budget, actual, variance: sub(budget, actual) };
    });

    return { rows: out, totalBudget, totalActual };
  }
}
