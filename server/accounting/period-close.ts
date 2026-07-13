import { SqlClient } from "./types";

/**
 * Opening, closing and reopening accounting periods, and the year-end close.
 *
 * A closed period rejects new postings — the trigger from migration 0001
 * enforces that. Closing is therefore a control action, not just a flag: it
 * asserts that the month has been reported and must not silently change.
 *
 * The year-end close is the one entry that moves the period result into equity:
 * it debits every income account and credits every expense account (zeroing the
 * P&L), and posts the net to "Resultado del ejercicio". Retained-earnings
 * carryforward across years builds on this.
 */
export class PeriodCloseError extends Error {}

export class PeriodClose {
  constructor(private readonly client: SqlClient) {}

  async close(companyId: number, year: number, periodNo: number, userId?: number): Promise<void> {
    const period = await this.period(companyId, year, periodNo);
    if (period.status === "closed") throw new PeriodCloseError(`período ${year}-${periodNo} ya está cerrado`);

    // A period cannot close while an earlier one in the same year is still open;
    // that would let a late entry land behind a closed month.
    const earlierOpen = await this.client.query(
      `SELECT period_no FROM accounting_periods
        WHERE company_id=$1 AND fiscal_year=$2 AND period_no < $3
          AND status IN ('open','reopened') ORDER BY period_no LIMIT 1`,
      [companyId, year, periodNo],
    );
    if (earlierOpen.rows.length > 0) {
      throw new PeriodCloseError(
        `no se puede cerrar ${periodNo}: el período ${earlierOpen.rows[0].period_no} sigue abierto`,
      );
    }

    await this.client.query(
      `UPDATE accounting_periods SET status='closed', closed_at=now(), closed_by=$4
        WHERE company_id=$1 AND fiscal_year=$2 AND period_no=$3`,
      [companyId, year, periodNo, userId ?? null],
    );
  }

  async reopen(companyId: number, year: number, periodNo: number): Promise<void> {
    const period = await this.period(companyId, year, periodNo);
    if (period.status !== "closed") throw new PeriodCloseError(`período ${year}-${periodNo} no está cerrado`);
    await this.client.query(
      `UPDATE accounting_periods SET status='reopened', closed_at=NULL, closed_by=NULL
        WHERE company_id=$1 AND fiscal_year=$2 AND period_no=$3`,
      [companyId, year, periodNo],
    );
  }

  /**
   * Year-end close: zero the income and expense accounts into "Resultado del
   * ejercicio", dated on the last day of the year in period 13 (the adjustments
   * period). Idempotent on the source key, so running it twice posts once.
   *
   * Returns the entry id, or null if there was nothing to close.
   */
  async closeYear(
    companyId: number,
    year: number,
    resultAccountCode = "3.1.02.002",
    userId?: number,
  ): Promise<number | null> {
    const p13 = await this.client.query(
      `SELECT id FROM accounting_periods WHERE company_id=$1 AND fiscal_year=$2 AND period_no=13`,
      [companyId, year],
    );
    if (p13.rows.length === 0) throw new PeriodCloseError(`falta el período 13 de ${year}`);
    const periodId = p13.rows[0].id;

    const resultAccount = await this.accountId(companyId, resultAccountCode);

    // Net movement of every P&L account across the year, from the balance cache.
    const { rows } = await this.client.query(
      `SELECT a.id AS account_id, a.account_type,
              coalesce(sum(b.closing_func),0)::numeric AS balance
         FROM chart_of_accounts a
         JOIN account_period_balances b ON b.account_id=a.id
         JOIN accounting_periods p ON p.id=b.period_id
        WHERE a.company_id=$1 AND a.account_type IN ('income','expense')
          AND p.fiscal_year=$2 AND p.period_no <= 12
        GROUP BY a.id, a.account_type
        HAVING coalesce(sum(b.closing_func),0) <> 0`,
      [companyId, year],
    );
    if (rows.length === 0) return null;

    const client = this.client;
    const entry = await client.query(
      `INSERT INTO journal_entries
         (company_id, period_id, entry_date, memo, currency, status,
          source_type, source_id, source_event, posted_by, posted_at)
       VALUES ($1,$2,$3,$4,'DOP','draft','year_close',$5,'close',$6, now())
       ON CONFLICT (company_id, source_type, source_id, source_event) DO NOTHING
       RETURNING id`,
      [companyId, periodId, `${year}-12-31`, `Cierre del ejercicio ${year}`, String(year), userId ?? null],
    );
    if (entry.rows.length === 0) {
      throw new PeriodCloseError(`el ejercicio ${year} ya fue cerrado`);
    }
    const entryId = Number(entry.rows[0].id);

    let lineNo = 1;
    let net = 0; // functional; positive = profit
    for (const r of rows) {
      const bal = Number(r.balance); // debit − credit
      // Reverse each account to zero it: income has a credit balance (bal<0) so
      // we debit it; expense has a debit balance (bal>0) so we credit it.
      const debit = bal < 0 ? (-bal).toFixed(4) : "0";
      const credit = bal > 0 ? bal.toFixed(4) : "0";
      await client.query(
        `INSERT INTO journal_entry_lines
           (entry_id, company_id, line_no, account_id, debit, credit, currency, fx_rate, debit_func, credit_func)
         VALUES ($1,$2,$3,$4,$5::numeric,$6::numeric,'DOP',1,$5::numeric,$6::numeric)`,
        [entryId, companyId, lineNo++, r.account_id, debit, credit],
      );
      net += -bal; // income (bal<0) adds to profit, expense (bal>0) subtracts
    }

    // Balancing line to Resultado del ejercicio.
    const resDebit = net < 0 ? (-net).toFixed(4) : "0"; // a loss debits equity
    const resCredit = net > 0 ? net.toFixed(4) : "0"; // a profit credits equity
    await client.query(
      `INSERT INTO journal_entry_lines
         (entry_id, company_id, line_no, account_id, debit, credit, currency, fx_rate, debit_func, credit_func)
       VALUES ($1,$2,$3,$4,$5::numeric,$6::numeric,'DOP',1,$5::numeric,$6::numeric)`,
      [entryId, companyId, lineNo++, resultAccount, resDebit, resCredit],
    );

    await client.query(
      `UPDATE journal_entries SET status='posted', entry_no=allocate_entry_no($1,$2::smallint) WHERE id=$3`,
      [companyId, year, entryId],
    );

    return entryId;
  }

  private async period(companyId: number, year: number, periodNo: number) {
    const { rows } = await this.client.query(
      `SELECT status FROM accounting_periods WHERE company_id=$1 AND fiscal_year=$2 AND period_no=$3`,
      [companyId, year, periodNo],
    );
    if (rows.length === 0) throw new PeriodCloseError(`período ${year}-${periodNo} no existe`);
    return rows[0];
  }

  private async accountId(companyId: number, code: string): Promise<number> {
    const { rows } = await this.client.query(
      `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND code=$2`,
      [companyId, code],
    );
    if (rows.length === 0) throw new PeriodCloseError(`cuenta ${code} no existe`);
    return Number(rows[0].id);
  }
}
