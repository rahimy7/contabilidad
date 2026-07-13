import { SqlClient } from "./types";
import { FinancialStatements } from "./financial-statements";

/**
 * The figures behind the home dashboard.
 *
 * Everything here is derived from the same `account_period_balances` cache the
 * trial balance and the financial statements read, so the dashboard can never
 * quietly disagree with them — if the balance sheet says the company owns
 * 1.2M, so does the tile. Nothing is estimated and nothing is cached separately.
 *
 * It is one endpoint on purpose. A dashboard that fires six queries from the
 * browser shows six different instants of the ledger; served from a single
 * scoped transaction, every tile is the same instant.
 *
 * All arithmetic that divides (percentages, margins) is done in SQL `numeric` or
 * on values already rounded to cents — money never rides a JS float.
 */

/** The chart's "Efectivo y equivalentes" node. Cash is its subtree, walked via
 *  parent_id — so a bank account added under it counts with no code change. */
const CASH_ROOT_CODE = "1.1.01";

/** Expense lines shown individually in the doughnut; the rest roll into "Otros". */
const EXPENSE_SLICES = 5;

export interface MonthPoint {
  period: number;
  income: string;
  expense: string;
  cash: string;
}

export interface Kpi {
  value: string;
  /** Change vs the previous month, in percent. Null when there is no base to compare. */
  changePct: string | null;
}

export interface PartyBalance {
  name: string;
  balance: string;
  /** Days past due of the oldest open item. Negative means not yet due. */
  daysOverdue: number;
}

export interface DashboardData {
  year: number;
  month: number;
  currency: string;
  kpis: {
    income: Kpi;
    expense: Kpi;
    netIncome: Kpi;
    cashFlow: Kpi;
  };
  /** 12 points, one per period, for the income-vs-expense chart. */
  monthly: MonthPoint[];
  expenseBreakdown: { name: string; amount: string; pct: string }[];
  expenseTotal: string;
  receivables: { items: PartyBalance[]; total: string; othersCount: number; othersBalance: string };
  payables: { items: PartyBalance[]; total: string; othersCount: number; othersBalance: string };
  summary: {
    assets: string;
    liabilities: string;
    equity: string;
    netIncome: string;
    /** netIncome / income, in percent. Null when there was no income. */
    marginPct: string | null;
  };
}

export class Dashboard {
  constructor(private readonly client: SqlClient) {}

  async build(companyId: number, year: number, month: number): Promise<DashboardData> {
    const [monthly, expenseBreakdown, receivables, payables, balanceSheet] = await Promise.all([
      this.monthlySeries(companyId, year),
      this.expenses(companyId, year, month),
      this.openItems(companyId, "ar"),
      this.openItems(companyId, "ap"),
      new FinancialStatements(this.client).balanceSheet(companyId, year, month),
    ]);

    const at = (m: number) => monthly.find((p) => p.period === m);
    const cur = at(month);
    const prev = at(month - 1);

    const kpi = (now?: string, before?: string): Kpi => ({
      value: now ?? "0.00",
      changePct: pctChange(now, before),
    });

    const income = cur?.income ?? "0.00";
    const expense = cur?.expense ?? "0.00";
    const net = subtract(income, expense);
    const prevNet = prev ? subtract(prev.income, prev.expense) : undefined;

    return {
      year,
      month,
      currency: "DOP",
      kpis: {
        income: kpi(income, prev?.income),
        expense: kpi(expense, prev?.expense),
        netIncome: kpi(net, prevNet),
        cashFlow: kpi(cur?.cash, prev?.cash),
      },
      monthly,
      expenseBreakdown: expenseBreakdown.slices,
      expenseTotal: expenseBreakdown.total,
      receivables,
      payables,
      summary: {
        assets: balanceSheet.assets.total,
        liabilities: balanceSheet.liabilities.total,
        equity: balanceSheet.equity.total,
        netIncome: balanceSheet.netIncome,
        marginPct: ratioPct(balanceSheet.netIncome, ytdIncome(monthly, month)),
      },
    };
  }

  /**
   * Income, expense and cash movement for every period of the year.
   *
   * `closing_func` is a period's net movement (debit − credit), not a running
   * balance, so no window function is needed: each period stands alone. Income
   * is credit-natural, hence the sign flip; cash is debit-natural, so a positive
   * figure means money came in.
   */
  private async monthlySeries(companyId: number, year: number): Promise<MonthPoint[]> {
    const { rows }: { rows: { period: number; income: string; expense: string; cash: string }[] } =
      await this.client.query(
      `WITH RECURSIVE cash_tree AS (
         SELECT id FROM chart_of_accounts WHERE company_id = $1 AND code = $3
         UNION ALL
         SELECT c.id FROM chart_of_accounts c JOIN cash_tree t ON c.parent_id = t.id
       )
       SELECT p.period_no AS period,
              round(coalesce(-sum(b.closing_func) FILTER (WHERE a.account_type = 'income'), 0), 2)::text  AS income,
              round(coalesce( sum(b.closing_func) FILTER (WHERE a.account_type = 'expense'), 0), 2)::text AS expense,
              round(coalesce( sum(b.closing_func) FILTER (WHERE b.account_id IN (SELECT id FROM cash_tree)), 0), 2)::text AS cash
         FROM accounting_periods p
         LEFT JOIN account_period_balances b ON b.period_id = p.id AND b.company_id = p.company_id
         LEFT JOIN chart_of_accounts a ON a.id = b.account_id
        -- Período 13 es el de ajustes de cierre: no es un mes y no va en la serie.
        WHERE p.company_id = $1 AND p.fiscal_year = $2 AND p.period_no <= 12
        GROUP BY p.period_no
        ORDER BY p.period_no`,
      [companyId, year, CASH_ROOT_CODE],
    );
    return rows.map((r) => ({
      period: Number(r.period),
      income: r.income,
      expense: r.expense,
      cash: r.cash,
    }));
  }

  /**
   * The month's expenses by account, biggest first. Everything past the top few
   * is folded into "Otros" rather than dropped — the slices must add up to the
   * total or the doughnut lies.
   */
  private async expenses(
    companyId: number,
    year: number,
    month: number,
  ): Promise<{ slices: { name: string; amount: string; pct: string }[]; total: string }> {
    const { rows }: { rows: { name: string; amount: string }[] } = await this.client.query(
      `SELECT a.name,
              round(sum(b.closing_func), 2)::text AS amount
         FROM account_period_balances b
         JOIN chart_of_accounts a  ON a.id = b.account_id
         JOIN accounting_periods p ON p.id = b.period_id
        WHERE b.company_id = $1 AND p.fiscal_year = $2 AND p.period_no = $3
          AND a.account_type = 'expense'
        GROUP BY a.name
       HAVING sum(b.closing_func) > 0
        ORDER BY sum(b.closing_func) DESC`,
      [companyId, year, month],
    );

    const total = rows.reduce((acc, r) => addCents(acc, r.amount), "0.00");
    const head = rows.slice(0, EXPENSE_SLICES);
    const tail = rows.slice(EXPENSE_SLICES);

    const slices = head.map((r) => ({ name: r.name, amount: r.amount, pct: ratioPct(r.amount, total) ?? "0.0" }));
    if (tail.length > 0) {
      const rest = tail.reduce((acc, r) => addCents(acc, r.amount), "0.00");
      slices.push({ name: "Otros", amount: rest, pct: ratioPct(rest, total) ?? "0.0" });
    }
    return { slices, total };
  }

  /**
   * Who owes us (`ar`) or who we owe (`ap`), biggest exposure first.
   *
   * Grouped by counterparty, not by document: what a dashboard answers is "who",
   * and a supplier with eight small invoices is one relationship, not eight.
   * `daysOverdue` is that of the *oldest* open item, since that is the one that
   * actually hurts.
   */
  private async openItems(
    companyId: number,
    kind: "ar" | "ap",
  ): Promise<{ items: PartyBalance[]; total: string; othersCount: number; othersBalance: string }> {
    const table = kind === "ar" ? "ar_open_items" : "ap_open_items";
    const party = kind === "ar" ? "customers" : "suppliers";
    const fk = kind === "ar" ? "customer_id" : "supplier_id";
    const fallback = kind === "ar" ? "Cliente sin registrar" : "Proveedor sin registrar";

    const { rows }: { rows: { name: string; balance: string; days_overdue: string }[] } =
      await this.client.query(
      // The table name is interpolated but never comes from a caller — it is one
      // of two literals chosen above, so there is nothing here to inject.
      `SELECT coalesce(pt.name, $2)                              AS name,
              round(sum(o.balance), 2)::text                     AS balance,
              max(current_date - o.due_date)::text               AS days_overdue
         FROM ${table} o
         LEFT JOIN ${party} pt ON pt.id = o.${fk}
        WHERE o.company_id = $1 AND o.status <> 'paid' AND o.balance > 0
        GROUP BY coalesce(pt.name, $2)
        ORDER BY sum(o.balance) DESC`,
      [companyId, fallback],
    );

    const total = rows.reduce((acc, r) => addCents(acc, r.balance), "0.00");
    const head = rows.slice(0, 4);
    const tail = rows.slice(4);

    return {
      items: head.map((r) => ({
        name: r.name,
        balance: r.balance,
        daysOverdue: Number(r.days_overdue),
      })),
      total,
      othersCount: tail.length,
      othersBalance: tail.reduce((acc, r) => addCents(acc, r.balance), "0.00"),
    };
  }
}

// ── Aritmética en centavos ───────────────────────────────────────────────────
// Los montos llegan de Postgres como texto ya redondeado a 2 decimales. Se
// operan como enteros de centavos: sumar dos strings de dinero con `Number` es
// exactamente cómo se pierde un centavo.

const cents = (v: string | undefined): bigint => {
  if (!v) return 0n;
  const neg = v.trim().startsWith("-");
  const [whole, frac = ""] = v.trim().replace("-", "").split(".");
  const n = BigInt(whole || "0") * 100n + BigInt((frac + "00").slice(0, 2));
  return neg ? -n : n;
};

const fromCents = (n: bigint): string => {
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const s = `${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
  return neg ? `-${s}` : s;
};

const addCents = (a: string, b: string): string => fromCents(cents(a) + cents(b));
const subtract = (a: string, b: string): string => fromCents(cents(a) - cents(b));

/** Percentage change from `before` to `now`, one decimal. Null if there is no base. */
function pctChange(now: string | undefined, before: string | undefined): string | null {
  const b = cents(before);
  if (b === 0n) return null;
  const delta = cents(now) - b;
  const abs = b < 0n ? -b : b;
  // ×1000 then divide keeps one decimal without touching a float.
  const scaled = (delta * 1000n) / abs;
  return (Number(scaled) / 10).toFixed(1);
}

/** `part / whole` as a percentage with one decimal. Null when whole is zero. */
function ratioPct(part: string, whole: string): string | null {
  const w = cents(whole);
  if (w === 0n) return null;
  const scaled = (cents(part) * 1000n) / w;
  return (Number(scaled) / 10).toFixed(1);
}

/** Income accumulated from January through `month`, for the margin. */
function ytdIncome(monthly: MonthPoint[], month: number): string {
  return monthly
    .filter((p) => p.period <= month)
    .reduce((acc, p) => addCents(acc, p.income), "0.00");
}
