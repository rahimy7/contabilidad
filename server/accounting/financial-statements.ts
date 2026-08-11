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

  /**
   * Estado de flujo de efectivo (método directo).
   *
   * Recorre los asientos del período tomando SÓLO los que tocan alguna cuenta
   * marcada como efectivo (`chart_of_accounts.is_cash = true`, o por defecto
   * el prefijo 1.1.01). Para cada movimiento identifica la contrapartida y la
   * clasifica en operación, inversión o financiamiento según el tipo de
   * cuenta contraria:
   *
   *   - Operación:    income, expense, current AR/AP, inventario.
   *   - Inversión:    fixed_asset y otros activos de largo plazo.
   *   - Financiamiento: liability de largo plazo, equity.
   *
   * Es el "cash T" enfocado: la caja se debita/acredita, y el otro lado del
   * asiento dice de dónde vino o hacia dónde fue el efectivo. Nada de
   * proyección — eso vive aparte cuando exista el módulo de tesorería.
   */
  async cashFlowStatement(
    companyId: number,
    year: number,
    fromPeriod = 1,
    toPeriod = 12,
  ): Promise<CashFlowStatement> {
    // Saldo inicial de caja (activos "cash" al final del período anterior).
    const opening = await this.cashBalanceAsOf(companyId, year, fromPeriod - 1);

    // Movimientos del período: cada línea de asiento que toca una cuenta cash,
    // con la contrapartida asignada. Un asiento simple (Dr Cash / Cr Ventas)
    // aporta una fila; uno compuesto puede aportar varias.
    const rows = await this.client.query(
      `WITH cash_accounts AS (
         SELECT id FROM chart_of_accounts
          WHERE company_id = $1
            AND (
              account_type = 'asset' AND (
                coalesce(is_cash, false) = true OR code LIKE '1.1.01.%'
              )
            )
       ),
       cash_lines AS (
         SELECT je.id AS entry_id, je.entry_date, je.memo,
                jel.line_no, jel.account_id,
                jel.debit_func::numeric - jel.credit_func::numeric AS cash_delta
           FROM journal_entries je
           JOIN journal_entry_lines jel ON jel.entry_id = je.id
           JOIN accounting_periods p ON p.id = je.period_id
          WHERE je.company_id = $1
            AND je.status = 'posted'
            AND p.fiscal_year = $2
            AND p.period_no BETWEEN $3 AND $4
            AND jel.account_id IN (SELECT id FROM cash_accounts)
       ),
       counter_totals AS (
         SELECT je.id AS entry_id,
                sum(jel.debit_func::numeric - jel.credit_func::numeric) AS total_delta
           FROM journal_entries je
           JOIN journal_entry_lines jel ON jel.entry_id = je.id
          WHERE je.company_id = $1
            AND jel.account_id NOT IN (SELECT id FROM (SELECT id FROM chart_of_accounts
                                                        WHERE company_id = $1
                                                          AND account_type = 'asset'
                                                          AND (coalesce(is_cash, false) = true OR code LIKE '1.1.01.%')) c)
          GROUP BY je.id
       ),
       counters AS (
         SELECT je.id AS entry_id, jel.account_id AS counter_id, ca.code AS counter_code,
                ca.name AS counter_name, ca.account_type AS counter_type,
                jel.debit_func::numeric - jel.credit_func::numeric AS counter_delta
           FROM journal_entries je
           JOIN journal_entry_lines jel ON jel.entry_id = je.id
           JOIN chart_of_accounts ca ON ca.id = jel.account_id
          WHERE je.company_id = $1
            AND jel.account_id NOT IN (SELECT id FROM (SELECT id FROM chart_of_accounts
                                                        WHERE company_id = $1
                                                          AND account_type = 'asset'
                                                          AND (coalesce(is_cash, false) = true OR code LIKE '1.1.01.%')) c)
       )
       SELECT counters.counter_code AS code, counters.counter_name AS name,
              counters.counter_type AS account_type,
              /* Cash aumenta cuando la contrapartida es acreditada (por eso
                 -counter_delta). */
              sum(-counters.counter_delta)::text AS amount
         FROM cash_lines
         JOIN counters ON counters.entry_id = cash_lines.entry_id
        GROUP BY counters.counter_code, counters.counter_name, counters.counter_type
        HAVING sum(-counters.counter_delta) <> 0
        ORDER BY counters.counter_code`,
      [companyId, year, fromPeriod, toPeriod],
    );

    const operating: CashLine[] = [];
    const investing: CashLine[] = [];
    const financing: CashLine[] = [];
    for (const r of rows.rows) {
      const line: CashLine = { code: r.code, name: r.name, amount: add(r.amount, "0") };
      switch (r.account_type) {
        case "income":
        case "expense":
          operating.push(line);
          break;
        case "asset":
          // Otros activos que no son efectivo = inversión.
          investing.push(line);
          break;
        case "liability":
          // Simplificación: tratamos toda liability como financiamiento. Un
          // corte fino distinguiría corto plazo (operación) de largo plazo
          // (financiamiento); mientras no exista una bandera, la ganancia
          // sobre "no clasificar" supera al costo del binario grueso.
          financing.push(line);
          break;
        case "equity":
          financing.push(line);
          break;
        default:
          operating.push(line);
      }
    }

    const operatingTotal = sum(operating.map((l) => l.amount));
    const investingTotal = sum(investing.map((l) => l.amount));
    const financingTotal = sum(financing.map((l) => l.amount));
    const netChange = sum([operatingTotal, investingTotal, financingTotal]);
    const closing = add(opening, netChange);

    return {
      year, fromPeriod, toPeriod,
      openingCash: opening,
      operating: { title: "Actividades de operación", lines: operating, total: operatingTotal },
      investing: { title: "Actividades de inversión", lines: investing, total: investingTotal },
      financing: { title: "Actividades de financiamiento", lines: financing, total: financingTotal },
      netChange,
      closingCash: closing,
    };
  }

  private async cashBalanceAsOf(companyId: number, year: number, throughPeriod: number): Promise<Decimal> {
    if (throughPeriod < 1) return "0";
    const { rows } = await this.client.query(
      `SELECT coalesce(sum(b.closing_func), 0)::text AS balance
         FROM chart_of_accounts a
         JOIN account_period_balances b ON b.account_id = a.id
         JOIN accounting_periods p ON p.id = b.period_id
        WHERE a.company_id = $1
          AND a.account_type = 'asset'
          AND (coalesce(a.is_cash, false) = true OR a.code LIKE '1.1.01.%')
          AND p.fiscal_year = $2
          AND p.period_no <= $3`,
      [companyId, year, throughPeriod],
    );
    return add(rows[0]?.balance ?? "0", "0");
  }
}

export interface CashLine {
  code: string;
  name: string;
  amount: Decimal;
}

export interface CashFlowSection {
  title: string;
  lines: CashLine[];
  total: Decimal;
}

export interface CashFlowStatement {
  year: number;
  fromPeriod: number;
  toPeriod: number;
  openingCash: Decimal;
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  netChange: Decimal;
  closingCash: Decimal;
}
