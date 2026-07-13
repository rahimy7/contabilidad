import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { PostingEngine } from "../server/accounting/posting-engine";
import { enqueue, drainOutbox } from "../server/accounting/outbox";
import { AccountingEvent } from "../server/accounting/types";

neonConfig.webSocketConstructor = ws;

describeIntegration("outbox and balance cache", () => {
  let pool: Pool;
  let companyId: number;
  let periodId: number;

  const RNC = "999001111";
  const YEAR = new Date().getUTCFullYear();
  const MONTH = new Date().getUTCMonth() + 1;
  const DATE = `${YEAR}-${String(MONTH).padStart(2, "0")}-10`;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(
      `INSERT INTO companies (legal_name, rnc) VALUES ('Outbox SRL', $1) RETURNING id`,
      [RNC],
    );
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);
    const p = await pool.query(
      `SELECT id FROM accounting_periods WHERE company_id=$1 AND fiscal_year=$2 AND period_no=$3`,
      [companyId, YEAR, MONTH],
    );
    periodId = p.rows[0].id;
  });

  afterAll(async () => {
    if (companyId) {
      await pool.query(`DELETE FROM accounting_outbox WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM account_period_balances WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM accounting_outbox WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM account_period_balances WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId]);
  });

  const event = (sourceId: string, revenue = "1000.00"): AccountingEvent => ({
    companyId,
    eventType: "pos_sale",
    sourceType: "order",
    sourceId,
    entryDate: DATE,
    currency: "DOP",
    measures: [
      { role: "revenue", amount: revenue },
      { role: "itbis", amount: "180.00" },
    ],
  });

  async function inTx<T>(fn: (c: any) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  // ── Outbox ────────────────────────────────────────────────────────────────

  it("drains a queued event into the ledger", async () => {
    await inTx((c) => enqueue(c, event("order-1"), "invoice"));

    const r = await drainOutbox(pool);
    expect(r.processed).toBe(1);
    expect(r.failed).toBe(0);

    const e = await pool.query(
      `SELECT count(*)::int c FROM journal_entries WHERE company_id=$1 AND status='posted'`,
      [companyId],
    );
    expect(e.rows[0].c).toBe(1);

    const o = await pool.query(`SELECT status FROM accounting_outbox WHERE company_id=$1`, [companyId]);
    expect(o.rows[0].status).toBe("processed");
  });

  it("a redelivered event posts nothing the second time", async () => {
    await inTx((c) => enqueue(c, event("order-2"), "invoice"));
    await drainOutbox(pool);

    // Simulate a crash after posting but before the row was marked processed.
    await pool.query(
      `UPDATE accounting_outbox SET status='pending', processed_at=NULL WHERE company_id=$1`,
      [companyId],
    );

    const second = await drainOutbox(pool);
    expect(second.processed).toBe(0);
    expect(second.alreadyPosted).toBe(1); // idempotency key held

    const n = await pool.query(
      `SELECT count(*)::int c FROM journal_entries WHERE company_id=$1`,
      [companyId],
    );
    expect(n.rows[0].c).toBe(1);
  });

  it("enqueueing the same event twice queues it once", async () => {
    await inTx(async (c) => {
      await enqueue(c, event("order-3"), "invoice");
      await enqueue(c, event("order-3"), "invoice");
    });
    const n = await pool.query(`SELECT count(*)::int c FROM accounting_outbox WHERE company_id=$1`, [
      companyId,
    ]);
    expect(n.rows[0].c).toBe(1);
  });

  it("a failing event records its error and does not stall the queue", async () => {
    await inTx(async (c) => {
      // No rule maps 'nonsense', so this event can never post.
      await enqueue(
        c,
        { ...event("bad"), measures: [{ role: "nonsense", amount: "1.00" }] },
        "invoice",
      );
      await enqueue(c, event("good"), "invoice");
    });

    const r = await drainOutbox(pool, { maxAttempts: 2 });
    expect(r.failed).toBe(1); // attempted once, then backed off out of this pass
    expect(r.processed).toBe(1); // the good one still went through

    const bad = await pool.query(
      `SELECT status, attempts, last_error, next_attempt_at > now() AS backed_off
         FROM accounting_outbox WHERE company_id=$1 AND source_id='bad'`,
      [companyId],
    );
    expect(bad.rows[0].attempts).toBe(1);
    expect(bad.rows[0].status).toBe("pending");
    expect(bad.rows[0].backed_off).toBe(true);
    expect(bad.rows[0].last_error).toMatch(/no posting rule matches/);

    // A drain now finds nothing due: the backoff is holding it.
    const immediate = await drainOutbox(pool, { maxAttempts: 2 });
    expect(immediate).toEqual({ processed: 0, alreadyPosted: 0, failed: 0 });

    // Once the backoff elapses, the last attempt parks it for good.
    await pool.query(
      `UPDATE accounting_outbox SET next_attempt_at = now() WHERE company_id=$1 AND source_id='bad'`,
      [companyId],
    );
    await drainOutbox(pool, { maxAttempts: 2 });
    const parked = await pool.query(
      `SELECT status FROM accounting_outbox WHERE company_id=$1 AND source_id='bad'`,
      [companyId],
    );
    expect(parked.rows[0].status).toBe("failed");
  });

  it("posts through the outbox under tenant scope, not as the owner", async () => {
    await inTx((c) => enqueue(c, event("order-scoped"), "invoice"));
    await drainOutbox(pool);
    const n = await pool.query(
      `SELECT count(*)::int c FROM journal_entries WHERE company_id=$1 AND status='posted'`,
      [companyId],
    );
    expect(n.rows[0].c).toBe(1);
  });

  // ── Balance cache ─────────────────────────────────────────────────────────

  /** The whole point of the cache: it must equal what the lines say. */
  async function assertCacheMatchesLines() {
    const fromLines = await pool.query(
      `SELECT l.account_id, e.period_id, coalesce(l.cost_center_id,0) cc, l.currency,
              sum(l.debit)::text d, sum(l.credit)::text c,
              (sum(l.debit_func) - sum(l.credit_func))::text closing
         FROM journal_entry_lines l
         JOIN journal_entries e ON e.id = l.entry_id
        WHERE l.company_id=$1 AND e.status='posted'
        GROUP BY l.account_id, e.period_id, coalesce(l.cost_center_id,0), l.currency
        ORDER BY 1,2,3,4`,
      [companyId],
    );
    const cached = await pool.query(
      `SELECT account_id, period_id, cost_center_id cc, currency,
              debit_total::text d, credit_total::text c, closing_func::text closing
         FROM account_period_balances WHERE company_id=$1 ORDER BY 1,2,3,4`,
      [companyId],
    );
    expect(cached.rows).toEqual(fromLines.rows);
    return cached.rows.length;
  }

  it("the trigger folds a posted entry into the cache exactly once", async () => {
    await inTx((c) => new PostingEngine(c).post(event("bal-1"), "invoice"));

    const cache = await pool.query(
      `SELECT a.code, b.debit_total::text d, b.credit_total::text c
         FROM account_period_balances b JOIN chart_of_accounts a ON a.id=b.account_id
        WHERE b.company_id=$1 ORDER BY a.code`,
      [companyId],
    );
    const m = Object.fromEntries(cache.rows.map((r) => [r.code, [r.d, r.c]]));
    expect(m["1.1.01.001"]).toEqual(["1180.0000", "0.0000"]); // Caja, both measures
    expect(m["4.1.01.001"]).toEqual(["0.0000", "1000.0000"]);
    expect(m["2.1.02.001"]).toEqual(["0.0000", "180.0000"]);

    await assertCacheMatchesLines();
  });

  it("touching a posted entry again does not double count", async () => {
    const posted = await inTx((c) => new PostingEngine(c).post(event("bal-2"), "invoice"));

    // Any UPDATE re-fires the deferred trigger. The flag is what stops it.
    await pool.query(`UPDATE journal_entries SET memo='touched' WHERE id=$1`, [posted.entryId]);
    await pool.query(`UPDATE journal_entries SET memo='touched again' WHERE id=$1`, [posted.entryId]);

    const caja = await pool.query(
      `SELECT b.debit_total::text d FROM account_period_balances b
         JOIN chart_of_accounts a ON a.id=b.account_id
        WHERE b.company_id=$1 AND a.code='1.1.01.001'`,
      [companyId],
    );
    expect(caja.rows[0].d).toBe("1180.0000"); // not 3540
    await assertCacheMatchesLines();
  });

  it("a reversal folds in as its own entry and nets the cache to zero", async () => {
    const posted = await inTx((c) => new PostingEngine(c).post(event("bal-3"), "invoice"));
    await inTx((c) => new PostingEngine(c).reverse(posted.entryId, "devolución"));

    const net = await pool.query(
      `SELECT coalesce(sum(closing_func),0)::text n FROM account_period_balances WHERE company_id=$1`,
      [companyId],
    );
    expect(Number(net.rows[0].n)).toBe(0);

    const caja = await pool.query(
      `SELECT b.closing_func::text f FROM account_period_balances b
         JOIN chart_of_accounts a ON a.id=b.account_id
        WHERE b.company_id=$1 AND a.code='1.1.01.001'`,
      [companyId],
    );
    expect(Number(caja.rows[0].f)).toBe(0);

    await assertCacheMatchesLines();
  });

  it("a rolled-back posting leaves the cache untouched", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await new PostingEngine(client).post(event("bal-rollback"), "invoice");
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    const n = await pool.query(
      `SELECT count(*)::int c FROM account_period_balances WHERE company_id=$1`,
      [companyId],
    );
    expect(n.rows[0].c).toBe(0);
  });

  it("golden: the incremental cache equals a full rebuild, entry for entry", async () => {
    // A month of activity: sales, a credit sale, COGS, a reversal.
    await inTx(async (c) => {
      const e = new PostingEngine(c);
      await e.post(event("g-1", "1000.00"), "invoice");
      await e.post(event("g-2", "2500.50"), "invoice");
      await e.post({ ...event("g-3"), context: { paymentMethod: "credit" } }, "invoice");
      await e.post(
        { ...event("g-4"), measures: [{ role: "cogs", amount: "600.00" }] },
        "cogs",
      );
    });
    const toReverse = await inTx((c) => new PostingEngine(c).post(event("g-5", "99.99"), "invoice"));
    await inTx((c) => new PostingEngine(c).reverse(toReverse.entryId, "error"));

    const incremental = await pool.query(
      `SELECT account_id, period_id, cost_center_id, currency,
              debit_total::text, credit_total::text, closing_func::text
         FROM account_period_balances WHERE company_id=$1 ORDER BY 1,2,3,4`,
      [companyId],
    );

    await pool.query(`SELECT rebuild_account_period_balances($1, $2)`, [companyId, periodId]);

    const rebuilt = await pool.query(
      `SELECT account_id, period_id, cost_center_id, currency,
              debit_total::text, credit_total::text, closing_func::text
         FROM account_period_balances WHERE company_id=$1 ORDER BY 1,2,3,4`,
      [companyId],
    );

    expect(incremental.rows.length).toBeGreaterThan(0);
    expect(rebuilt.rows).toEqual(incremental.rows);
  });
});
