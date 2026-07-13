import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import fc from "fast-check";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { PostingEngine } from "../server/accounting/posting-engine";
import { AccountingEvent, UnresolvedAccountError } from "../server/accounting/types";

neonConfig.webSocketConstructor = ws;

describeIntegration("posting engine", () => {
  let pool: Pool;
  let companyId: number;

  const RNC = "999000666";
  const YEAR = new Date().getUTCFullYear();
  const MONTH = String(new Date().getUTCMonth() + 1).padStart(2, "0");
  const DATE = `${YEAR}-${MONTH}-15`;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(
      `INSERT INTO companies (legal_name, rnc) VALUES ('Engine SRL', $1) RETURNING id`,
      [RNC],
    );
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);
  });

  afterAll(async () => {
    if (companyId) {
      await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId]);
  });

  /** Runs `fn` inside one transaction, as the posting engine's callers must. */
  async function inTx<T>(fn: (engine: PostingEngine) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const out = await fn(new PostingEngine(client));
      await client.query("COMMIT");
      return out;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  const saleEvent = (sourceId: string, overrides: Partial<AccountingEvent> = {}): AccountingEvent => ({
    companyId,
    eventType: "pos_sale",
    sourceType: "order",
    sourceId,
    entryDate: DATE,
    currency: "DOP",
    measures: [
      { role: "revenue", amount: "1000.00" },
      { role: "itbis", amount: "180.00" },
    ],
    ...overrides,
  });

  async function balanceOf(code: string): Promise<number> {
    const r = await pool.query(
      `SELECT coalesce(sum(l.debit_func) - sum(l.credit_func), 0) b
         FROM journal_entry_lines l
         JOIN journal_entries e ON e.id = l.entry_id
         JOIN chart_of_accounts a ON a.id = l.account_id
        WHERE l.company_id=$1 AND e.status='posted' AND a.code=$2`,
      [companyId, code],
    );
    return Number(r.rows[0].b);
  }

  it("posts a cash sale to the accounts the rules name", async () => {
    const res = await inTx((e) => e.post(saleEvent("order-1"), "invoice"));
    expect(res.created).toBe(true);
    expect(res.entryNo).toMatch(/^\d{4}-\d{8}$/);

    expect(await balanceOf("1.1.01.001")).toBe(1180); // Caja, debited by both measures
    expect(await balanceOf("4.1.01.001")).toBe(-1000); // Ventas
    expect(await balanceOf("2.1.02.001")).toBe(-180); // ITBIS por pagar
  });

  it("routes a credit sale to receivables via the higher-priority rule", async () => {
    await inTx((e) =>
      e.post(saleEvent("order-2", { context: { paymentMethod: "credit" } }), "invoice"),
    );
    expect(await balanceOf("1.1.02.001")).toBe(1180); // Clientes
    expect(await balanceOf("1.1.01.001")).toBe(0); // Caja untouched
  });

  it("posts the same source document twice under different source events", async () => {
    await inTx(async (e) => {
      await e.post(saleEvent("order-3"), "invoice");
      await e.post(
        saleEvent("order-3", { measures: [{ role: "cogs", amount: "600.00" }] }),
        "cogs",
      );
    });
    expect(await balanceOf("5.1.01.001")).toBe(600); // CMV
    expect(await balanceOf("1.1.03.001")).toBe(-600); // Inventario
  });

  it("is idempotent: replaying an event posts nothing and burns no entry number", async () => {
    const first = await inTx((e) => e.post(saleEvent("order-4"), "invoice"));
    const second = await inTx((e) => e.post(saleEvent("order-4"), "invoice"));

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.entryId).toBe(first.entryId);
    expect(second.entryNo).toBe(first.entryNo);

    const n = await pool.query(
      `SELECT count(*)::int c FROM journal_entries WHERE company_id=$1 AND source_id='order-4'`,
      [companyId],
    );
    expect(n.rows[0].c).toBe(1);
    expect(await balanceOf("1.1.01.001")).toBe(1180); // charged once, not twice
  });

  it("treats a negative measure as a swap of sides, never a negative amount", async () => {
    await inTx((e) =>
      e.post(saleEvent("order-5", { measures: [{ role: "revenue", amount: "-250.00" }] }), "invoice"),
    );
    expect(await balanceOf("4.1.01.001")).toBe(250); // revenue reversed: debit balance
    expect(await balanceOf("1.1.01.001")).toBe(-250);

    const neg = await pool.query(
      `SELECT count(*)::int c FROM journal_entry_lines WHERE company_id=$1 AND (debit < 0 OR credit < 0)`,
      [companyId],
    );
    expect(neg.rows[0].c).toBe(0);
  });

  it("skips zero measures rather than writing empty lines", async () => {
    await inTx((e) =>
      e.post(
        saleEvent("order-6", {
          measures: [
            { role: "revenue", amount: "500.00" },
            { role: "itbis", amount: "0.00" },
          ],
        }),
        "invoice",
      ),
    );
    const n = await pool.query(
      `SELECT count(*)::int c FROM journal_entry_lines l
         JOIN journal_entries e ON e.id=l.entry_id
        WHERE e.company_id=$1 AND e.source_id='order-6'`,
      [companyId],
    );
    expect(n.rows[0].c).toBe(2); // one debit/credit pair, not two
  });

  it("refuses an event whose measure no rule matches", async () => {
    await expect(
      inTx((e) =>
        e.post(saleEvent("order-7", { measures: [{ role: "unmapped_role", amount: "1.00" }] }), "invoice"),
      ),
    ).rejects.toThrow(UnresolvedAccountError);
  });

  it("refuses to post into a date no open period covers", async () => {
    await expect(
      inTx((e) => e.post(saleEvent("order-8", { entryDate: "1999-01-05" }), "invoice")),
    ).rejects.toThrow(/no accounting period covers/);
  });

  it("translates to functional currency in numeric, not in a JS float", async () => {
    await inTx((e) =>
      e.post(
        saleEvent("order-9", {
          currency: "USD",
          fxRate: "58.75000000",
          measures: [{ role: "revenue", amount: "100.10" }],
        }),
        "invoice",
      ),
    );
    const r = await pool.query(
      `SELECT debit, debit_func, credit, credit_func FROM journal_entry_lines l
         JOIN journal_entries e ON e.id=l.entry_id
        WHERE e.source_id='order-9' AND l.debit > 0`,
      [],
    );
    expect(r.rows[0].debit).toBe("100.1000");
    // 100.10 * 58.75 = 5880.875 exactly. A float would give 5880.874999999999.
    expect(r.rows[0].debit_func).toBe("5880.8750");
  });

  it("reverses an entry into its mirror image and nets the accounts to zero", async () => {
    const posted = await inTx((e) => e.post(saleEvent("order-10"), "invoice"));
    expect(await balanceOf("1.1.01.001")).toBe(1180);

    const rev = await inTx((e) => e.reverse(posted.entryId, "cliente devolvió la mercancía"));
    expect(rev.created).toBe(true);

    expect(await balanceOf("1.1.01.001")).toBe(0);
    expect(await balanceOf("4.1.01.001")).toBe(0);
    expect(await balanceOf("2.1.02.001")).toBe(0);

    const orig = await pool.query(
      `SELECT status, reversed_by_entry_id FROM journal_entries WHERE id=$1`,
      [posted.entryId],
    );
    // Still posted: its lines remain in the ledger and are offset, not removed.
    expect(orig.rows[0].status).toBe("posted");
    expect(Number(orig.rows[0].reversed_by_entry_id)).toBe(rev.entryId);
  });

  it("refuses to reverse the same entry twice", async () => {
    const posted = await inTx((e) => e.post(saleEvent("order-11"), "invoice"));
    await inTx((e) => e.reverse(posted.entryId, "primera"));
    await expect(inTx((e) => e.reverse(posted.entryId, "segunda"))).rejects.toThrow(
      /already reversed|only posted entries reverse/,
    );
  });

  it("hands out entry numbers that are unique under concurrency", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => inTx((e) => e.post(saleEvent(`concurrent-${i}`), "invoice"))),
    );
    const nums = results.map((r) => r.entryNo);
    expect(new Set(nums).size).toBe(20);
  });

  it("cannot post to another tenant's books, even given that tenant's id", async () => {
    const OTHER_RNC = "999000777";
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [OTHER_RNC]);
    const other = await pool.query(
      `INSERT INTO companies (legal_name, rnc) VALUES ('Otra SRL', $1) RETURNING id`,
      [OTHER_RNC],
    );
    const otherId = other.rows[0].id;
    await seedCompanyDefaults(pool, otherId); // real periods, real accounts, real rules

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.company_id', $1, true)`, [String(companyId)]);
      await client.query("SET LOCAL ROLE app_rls");
      const engine = new PostingEngine(client);

      // `otherId` is a real company with open periods and a seeded chart of
      // accounts. Scoped to `companyId`, the engine cannot see any of it.
      await expect(
        engine.post(
          { ...saleEvent("cross-tenant"), companyId: otherId },
          "invoice",
        ),
      ).rejects.toThrow(/no accounting period covers/);

      await client.query("ROLLBACK");
    } finally {
      client.release();
    }

    const leaked = await pool.query(
      `SELECT count(*)::int c FROM journal_entries WHERE company_id=$1`,
      [otherId],
    );
    expect(leaked.rows[0].c).toBe(0);
    await pool.query(`DELETE FROM companies WHERE id=$1`, [otherId]);
  });

  // ── Properties ────────────────────────────────────────────────────────────
  // The invariant is not "these three examples balance" but "every event
  // balances". fast-check generates the events; the ledger has to hold for all
  // of them.

  it("property: any posted event balances, and reversing it nets to zero", async () => {
    const amount = fc
      .integer({ min: 1, max: 9_999_99 })
      .map((cents) => (cents / 100).toFixed(2));

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          revenue: amount,
          itbis: amount,
          discount: amount,
          credit: fc.boolean(),
          n: fc.integer({ min: 0, max: 1_000_000 }),
        }),
        async ({ revenue, itbis, discount, credit, n }) => {
          const sourceId = `prop-${n}-${Math.random().toString(36).slice(2)}`;
          const event = saleEvent(sourceId, {
            context: credit ? { paymentMethod: "credit" } : {},
            measures: [
              { role: "revenue", amount: revenue },
              { role: "itbis", amount: itbis },
              { role: "discount", amount: discount },
            ],
          });

          const posted = await inTx((e) => e.post(event, "invoice"));

          // The entry balances. The database would have refused it at COMMIT
          // otherwise, but assert it explicitly so a failure names the reason.
          const bal = await pool.query(
            `SELECT sum(debit_func) d, sum(credit_func) c FROM journal_entry_lines WHERE entry_id=$1`,
            [posted.entryId],
          );
          expect(bal.rows[0].d).toBe(bal.rows[0].c);

          // Reversal restores every account this entry touched.
          const rev = await inTx((e) => e.reverse(posted.entryId, "property test"));
          const net = await pool.query(
            `SELECT coalesce(sum(debit_func) - sum(credit_func), 0) n
               FROM journal_entry_lines WHERE entry_id IN ($1, $2)`,
            [posted.entryId, rev.entryId],
          );
          expect(Number(net.rows[0].n)).toBe(0);
        },
      ),
      { numRuns: 12 },
    );
  });
});
