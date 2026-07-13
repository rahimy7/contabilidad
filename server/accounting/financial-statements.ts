import { SqlClient } from "./types";
import { Decimal, add, sub, neg, sum } from "./decimal";

/**
 * Balance sheet and income statement, from the materialized period balances.
 *
 * `account_period_balances.closing_func` holds the net movement of a period
 * (debit_func − credit_func), not a running balance, so a figure "through
 * period N" is the sum of that column across periods 1..N. The trial balance
 * reads the same table, which is why the statements and the trial balance can
 * never disagree.
 *
 * Sign convention for presentation: every line is shown as a positive natural
 * amount. Assets and expenses keep their debit-positive sign; liabilities,
 * equity and income are credit-natural, so their debit-minus-credit sum is
 * negative and gets flipped. The classification is driven by
 * `chart_of_accounts.account_type`, never hardcoded account codes.
 */

export interface StatementLine {
  code: string;
  name: string;
  amount: Decimal;
}

export interface StatementSection {
  title: string;
  lines: StatementLine[];
  total: Decimal;
}

export interface IncomeStatement {
  year: number;
  fromPeriod: number;
  toPeriod: number;
  income: StatementSection;
  expenses: StatementSection;
  /** income.total − expenses.total. Positive is profit. */
  netIncome: Decimal;
}

export interface BalanceSheet {
  year: number;
  throughPeriod: number;
  assets: StatementSection;
  liabilities: StatementSection;
  equity: StatementSection;
  /** Period profit not yet closed to equity; shown as a distinct equity line. */
  netIncome: Decimal;
  /** assets.total − (liabilities.total + equity.total + netIncome). Must be 0. */
  imbalance: Decimal;
  balanced: boolean;
}

export class FinancialStatements {
  constructor(private readonly client: SqlClient) {}

  /**
   * Movement of income and expense accounts over a period range. This is the
   * period's result; it does not touch the balance sheet accounts.
   */
  async incomeStatement(
    companyId: number,
    year: number,
    fromPeriod = 1,
    toPeriod = 12,
  ): Promise<IncomeStatement> {
    const rows = await this.balancesByType(companyId, year, fromPeriod, toPeriod, [
      "income",
      "expense",
    ]);

    // Income is credit-natural: flip so revenue reads positive.
    const income = this.section(
      "Ingresos",
      rows.filter((r) => r.account_type === "income").map((r) => ({ ...r, amount: neg(r.balance) })),
    );
    const expenses = this.section(
      "Gastos",
      rows.filter((r) => r.account_type === "expense").map((r) => ({ ...r, amount: r.balance })),
    );

    return {
      year,
      fromPeriod,
      toPeriod,
      income,
      expenses,
      netIncome: sub(income.total, expenses.total),
    };
  }

  /**
   * Financial position at the end of a period: assets, liabilities and equity
   * accumulated from the start of the year, plus the period's net income as a
   * separate equity line (it has not been closed to retained earnings yet).
   */
  async balanceSheet(companyId: number, year: number, throughPeriod = 12): Promise<BalanceSheet> {
    const rows = await this.balancesByType(companyId, year, 1, throughPeriod, [
      "asset",
      "liability",
      "equity",
    ]);

    const assets = this.section(
      "Activos",
      rows.filter((r) => r.account_type === "asset").map((r) => ({ ...r, amount: r.balance })),
    );
    const liabilities = this.section(
      "Pasivos",
      rows.filter((r) => r.account_type === "liability").map((r) => ({ ...r, amount: neg(r.balance) })),
    );
    const equity = this.section(
      "Patrimonio",
      rows.filter((r) => r.account_type === "equity").map((r) => ({ ...r, amount: neg(r.balance) })),
    );

    // The result of the period lives in the income/expense accounts until it is
    // closed. Surface it so the sheet balances: Activo = Pasivo + Patrimonio + Resultado.
    const is = await this.incomeStatement(companyId, year, 1, throughPeriod);
    const netIncome = is.netIncome;

    const liabPlusEquity = sum([liabilities.total, equity.total, netIncome]);
    const imbalance = sub(assets.total, liabPlusEquity);

    return {
      year,
      throughPeriod,
      assets,
      liabilities,
      equity,
      netIncome,
      imbalance,
      balanced: imbalance === "0",
    };
  }

  private section(title: string, lines: StatementLine[]): StatementSection {
    const nonZero = lines.filter((l) => l.amount !== "0");
    return { title, lines: nonZero, total: sum(nonZero.map((l) => l.amount)) };
  }

  private async balancesByType(
    companyId: number,
    year: number,
    fromPeriod: number,
    toPeriod: number,
    types: string[],
  ): Promise<Array<{ code: string; name: string; account_type: string; balance: Decimal }>> {
    const { rows } = await this.client.query(
      `SELECT a.code, a.name, a.account_type,
              coalesce(sum(b.closing_func), 0)::text AS balance
         FROM chart_of_accounts a
         JOIN account_period_balances b ON b.account_id = a.id
         JOIN accounting_periods p ON p.id = b.period_id
        WHERE a.company_id = $1
          AND a.account_type = ANY($2)
          AND p.fiscal_year = $3
          AND p.period_no BETWEEN $4 AND $5
        GROUP BY a.code, a.name, a.account_type
        HAVING coalesce(sum(b.closing_func), 0) <> 0
        ORDER BY a.code`,
      [companyId, types, year, fromPeriod, toPeriod],
    );
    // Postgres renders numeric with trailing zeros ("10880.0000"); normalise so
    // line amounts match the canonical form the decimal helpers produce.
    return rows.map((r) => ({ ...r, balance: add(r.balance, "0") }));
  }
}
