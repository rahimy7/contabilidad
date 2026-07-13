import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";

neonConfig.webSocketConstructor = ws;

/**
 * These tests attack the ledger with raw SQL, deliberately bypassing every
 * application-layer guard. That is the whole point: if an invariant only holds
 * when the posting engine is the one writing, it is not an invariant. A future
 * migration, a psql session, or a bug in an unrelated service will eventually
 * write directly to these tables.
 */
describeIntegration("accounting invariants (enforced by the database)", () => {
  let pool: Pool;
  let companyId: number;
  let periodId: number;
  let closedPeriodId: number;
  let cashAccountId: number;
  let revenueAccountId: number;
  let parentAccountId: number;

  const RNC = "999000111";

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });

    // Clean any residue from a previous failed run.
    await pool.query(`DELETE FROM companies WHERE rnc = $1`, [RNC]);

    const c = await pool.query(
      `INSERT INTO companies (legal_name, rnc, functional_currency)
       VALUES ('Test Co SRL', $1, 'DOP') RETURNING id`,
      [RNC],
    );
    companyId = c.rows[0].id;

    const p = await pool.query(
      `INSERT INTO accounting_periods (company_id, fiscal_year, period_no, start_date, end_date, status)
       VALUES ($1, 2026, 1, '2026-01-01', '2026-01-31', 'open') RETURNING id`,
      [companyId],
    );
    periodId = p.rows[0].id;

    const cp = await pool.query(
      `INSERT INTO accounting_periods (company_id, fiscal_year, period_no, start_date, end_date, status)
       VALUES ($1, 2025, 12, '2025-12-01', '2025-12-31', 'closed') RETURNING id`,
      [companyId],
    );
    closedPeriodId = cp.rows[0].id;

    // A parent (non-postable) account with a postable child, plus a revenue leaf.
    const parent = await pool.query(
      `INSERT INTO chart_of_accounts (company_id, code, name, level, account_type, normal_side, is_postable)
       VALUES ($1, '1', 'Activos', 1, 'asset', 'D', false) RETURNING id`,
      [companyId],
    );
    parentAccountId = parent.rows[0].id;

    const cash = await pool.query(
      `INSERT INTO chart_of_accounts (company_id, code, name, parent_id, level, account_type, normal_side, is_postable)
       VALUES ($1, '1.1.01', 'Caja', $2, 3, 'asset', 'D', true) RETURNING id`,
      [companyId, parentAccountId],
    );
    cashAccountId = cash.rows[0].id;

    const rev = await pool.query(
      `INSERT INTO chart_of_accounts (company_id, code, name, level, account_type, normal_side, is_postable)
       VALUES ($1, '4.1.01', 'Ventas', 3, 'income', 'C', true) RETURNING id`,
      [companyId],
    );
    revenueAccountId = rev.rows[0].id;
  });

  afterAll(async () => {
    if (companyId) {
      await pool.query(`DELETE FROM journal_entries WHERE company_id = $1`, [companyId]);
      await pool.query(`DELETE FROM companies WHERE id = $1`, [companyId]);
    }
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM journal_entries WHERE company_id = $1`, [companyId]);
  });

  /** Insert a posted entry with the given lines, inside one transaction. */
  async function postEntry(
    lines: Array<{ account: number; debit: string; credit: string; currency?: string }>,
    opts: { periodId?: number; entryDate?: string } = {},
  ) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const e = await client.query(
        `INSERT INTO journal_entries (company_id, period_id, entry_date, currency, status, source_type, source_id, source_event)
         VALUES ($1, $2, $3, 'DOP', 'posted', 'test', $4, 'main') RETURNING id`,
        [
          companyId,
          opts.periodId ?? periodId,
          opts.entryDate ?? "2026-01-15",
          `t-${Math.random().toString(36).slice(2)}`,
        ],
      );
      const entryId = e.rows[0].id;
      let lineNo = 1;
      for (const l of lines) {
        const cur = l.currency ?? "DOP";
        await client.query(
          `INSERT INTO journal_entry_lines
             (entry_id, company_id, line_no, account_id, debit, credit, currency, fx_rate, debit_func, credit_func)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $5, $6)`,
          [entryId, companyId, lineNo++, l.account, l.debit, l.credit, cur],
        );
      }
      await client.query("COMMIT");
      return entryId;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  it("accepts a balanced posted entry", async () => {
    const id = await postEntry([
      { account: cashAccountId, debit: "1180.00", credit: "0" },
      { account: revenueAccountId, debit: "0", credit: "1180.00" },
    ]);
    // bigserial arrives from pg as a string; it is an id, not an amount.
    expect(Number(id)).toBeGreaterThan(0);
  });

  it("rejects an unbalanced posted entry at COMMIT", async () => {
    await expect(
      postEntry([
        { account: cashAccountId, debit: "1000.00", credit: "0" },
        { account: revenueAccountId, debit: "0", credit: "999.00" },
      ]),
    ).rejects.toThrow(/does not balance in functional currency/);
  });

  it("rejects a posted entry that balances functionally but not within a currency", async () => {
    // debit_func == credit_func, yet the DOP lines and USD lines each stand alone.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const e = await client.query(
        `INSERT INTO journal_entries (company_id, period_id, entry_date, currency, status, source_type, source_id, source_event)
         VALUES ($1, $2, '2026-01-15', 'DOP', 'posted', 'test', 'mixed-cur', 'main') RETURNING id`,
        [companyId, periodId],
      );
      const entryId = e.rows[0].id;
      await client.query(
        `INSERT INTO journal_entry_lines (entry_id, company_id, line_no, account_id, debit, credit, currency, fx_rate, debit_func, credit_func)
         VALUES ($1,$2,1,$3,'100',0,'DOP',1,'100',0)`,
        [entryId, companyId, cashAccountId],
      );
      await client.query(
        `INSERT INTO journal_entry_lines (entry_id, company_id, line_no, account_id, debit, credit, currency, fx_rate, debit_func, credit_func)
         VALUES ($1,$2,2,$3,0,'100','USD',1,0,'100')`,
        [entryId, companyId, revenueAccountId],
      );
      await expect(client.query("COMMIT")).rejects.toThrow(/does not balance in currency/);
    } finally {
      client.release();
    }
  });

  it("rejects a posted entry with no lines", async () => {
    await expect(postEntry([])).rejects.toThrow(/posted with no lines/);
  });

  it("allows a draft entry to be unbalanced", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const e = await client.query(
        `INSERT INTO journal_entries (company_id, period_id, entry_date, currency, status, source_type, source_id, source_event)
         VALUES ($1, $2, '2026-01-15', 'DOP', 'draft', 'test', 'draft-1', 'main') RETURNING id`,
        [companyId, periodId],
      );
      await client.query(
        `INSERT INTO journal_entry_lines (entry_id, company_id, line_no, account_id, debit, credit, currency, fx_rate, debit_func, credit_func)
         VALUES ($1,$2,1,$3,'50',0,'DOP',1,'50',0)`,
        [e.rows[0].id, companyId, cashAccountId],
      );
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    const n = await pool.query(
      `SELECT count(*)::int c FROM journal_entries WHERE company_id=$1 AND status='draft'`,
      [companyId],
    );
    expect(n.rows[0].c).toBe(1);
  });

  it("rejects a posting to a non-leaf account", async () => {
    await expect(
      postEntry([
        { account: parentAccountId, debit: "10", credit: "0" },
        { account: revenueAccountId, debit: "0", credit: "10" },
      ]),
    ).rejects.toThrow(/not postable/);
  });

  it("rejects a posting into a closed period", async () => {
    await expect(
      postEntry(
        [
          { account: cashAccountId, debit: "10", credit: "0" },
          { account: revenueAccountId, debit: "0", credit: "10" },
        ],
        { periodId: closedPeriodId, entryDate: "2025-12-15" },
      ),
    ).rejects.toThrow(/cannot post/);
  });

  it("rejects an entry dated outside its period", async () => {
    await expect(
      postEntry(
        [
          { account: cashAccountId, debit: "10", credit: "0" },
          { account: revenueAccountId, debit: "0", credit: "10" },
        ],
        { entryDate: "2026-03-05" },
      ),
    ).rejects.toThrow(/falls outside period/);
  });

  it("enforces idempotency on (company, source_type, source_id, source_event)", async () => {
    const insertOnce = async () => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const e = await client.query(
          `INSERT INTO journal_entries (company_id, period_id, entry_date, currency, status, source_type, source_id, source_event)
           VALUES ($1,$2,'2026-01-15','DOP','posted','pos_sale','order-42','invoice')
           ON CONFLICT DO NOTHING RETURNING id`,
          [companyId, periodId],
        );
        if (e.rows.length === 0) {
          await client.query("ROLLBACK");
          return null;
        }
        const entryId = e.rows[0].id;
        await client.query(
          `INSERT INTO journal_entry_lines (entry_id, company_id, line_no, account_id, debit, credit, currency, fx_rate, debit_func, credit_func)
           VALUES ($1,$2,1,$3,'100',0,'DOP',1,'100',0), ($1,$2,2,$4,0,'100','DOP',1,0,'100')`,
          [entryId, companyId, cashAccountId, revenueAccountId],
        );
        await client.query("COMMIT");
        return entryId;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    };

    const first = await insertOnce();
    const second = await insertOnce();

    expect(first).not.toBeNull();
    expect(second).toBeNull(); // ON CONFLICT DO NOTHING: the replay posts nothing.

    const n = await pool.query(
      `SELECT count(*)::int c FROM journal_entries
        WHERE company_id=$1 AND source_type='pos_sale' AND source_id='order-42' AND source_event='invoice'`,
      [companyId],
    );
    expect(n.rows[0].c).toBe(1);
  });
});
