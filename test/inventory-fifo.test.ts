import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { InventoryCosting } from "../server/inventory/costing";

neonConfig.webSocketConstructor = ws;

describeIntegration("Inventory costing (FIFO by lot)", () => {
  let pool: Pool;
  let companyId: number;
  const RNC = "154000001";
  const YEAR = new Date().getUTCFullYear();
  const M = String(new Date().getUTCMonth() + 1).padStart(2, "0");
  const DATE = `${YEAR}-${M}-13`;
  const INVENTORY = "1.1.03.001";
  const COGS = "5.1.01.001";

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(`INSERT INTO companies (legal_name, rnc) VALUES ('Fifo SRL',$1) RETURNING id`, [RNC]);
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);
  });

  afterAll(async () => {
    if (companyId) {
      await cleanup();
      await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    await pool.end();
  });

  async function cleanup() {
    for (const t of ["inventory_cost_movements", "inventory_lots", "inventory_valuation", "journal_entries"]) {
      await pool.query(`DELETE FROM ${t} WHERE company_id=$1`, [companyId]);
    }
  }
  beforeEach(cleanup);

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

  const balanceOf = async (code: string) => {
    const r = await pool.query(
      `SELECT coalesce(sum(l.debit_func - l.credit_func),0)::text b
         FROM journal_entry_lines l JOIN chart_of_accounts a ON a.id=l.account_id
        WHERE l.company_id=$1 AND a.code=$2`,
      [companyId, code],
    );
    return Number(r.rows[0].b);
  };
  const lotsRemaining = async (P: number) => {
    const r = await pool.query(`SELECT unit_cost::text uc, remaining_qty::text rq FROM inventory_lots WHERE company_id=$1 AND product_id=$2 ORDER BY received_date, id`, [companyId, P]);
    return r.rows.map((x) => ({ unitCost: Number(x.uc), remaining: Number(x.rq) }));
  };

  it("drains the oldest layers first and costs COGS from them", async () => {
    const P = 9101;
    // Two lots: 10 @ 60, then 10 @ 80.
    await inTx((c) => new InventoryCosting(c).receive({ companyId, productId: P, date: DATE, quantity: "10", unitCost: "60", method: "fifo" }));
    await inTx((c) => new InventoryCosting(c).receive({ companyId, productId: P, date: DATE, quantity: "10", unitCost: "80" }));
    expect(await balanceOf(INVENTORY)).toBe(1400); // 600 + 800

    // Issue 5 → oldest lot at 60 → COGS 300 (not 350 as weighted average would give).
    const r1 = await inTx((c) => new InventoryCosting(c).issue({ companyId, productId: P, date: DATE, quantity: "5" }));
    expect(Number(r1.cogs)).toBe(300);
    expect(await balanceOf(COGS)).toBe(300);
    expect(await balanceOf(INVENTORY)).toBe(1100);
    expect(await lotsRemaining(P)).toEqual([{ unitCost: 60, remaining: 5 }, { unitCost: 80, remaining: 10 }]);

    // Issue 8 → 5 @ 60 + 3 @ 80 = 300 + 240 = 540.
    const r2 = await inTx((c) => new InventoryCosting(c).issue({ companyId, productId: P, date: DATE, quantity: "8" }));
    expect(Number(r2.cogs)).toBe(540);
    expect(await balanceOf(INVENTORY)).toBe(560); // 1100 − 540
    expect(await lotsRemaining(P)).toEqual([{ unitCost: 60, remaining: 0 }, { unitCost: 80, remaining: 7 }]);

    // Issue the last 7 → empties; COGS is the remaining value 560.
    const r3 = await inTx((c) => new InventoryCosting(c).issue({ companyId, productId: P, date: DATE, quantity: "7" }));
    expect(Number(r3.cogs)).toBe(560);
    expect(await balanceOf(COGS)).toBe(1400); // 300 + 540 + 560 = all cost received
    expect(await balanceOf(INVENTORY)).toBe(0);

    const val = await pool.query(`SELECT quantity_on_hand::text q, total_value::text v FROM inventory_valuation WHERE company_id=$1 AND product_id=$2`, [companyId, P]);
    expect(Number(val.rows[0].q)).toBe(0);
    expect(Number(val.rows[0].v)).toBe(0);
  });

  it("keeps FIFO and average distinct for different products", async () => {
    const F = 9102, A = 9103;
    for (const [P, method] of [[F, "fifo"], [A, "average"]] as const) {
      await inTx((c) => new InventoryCosting(c).receive({ companyId, productId: P, date: DATE, quantity: "10", unitCost: "60", method }));
      await inTx((c) => new InventoryCosting(c).receive({ companyId, productId: P, date: DATE, quantity: "10", unitCost: "80" }));
    }
    // FIFO issue of 5 costs 300 (oldest); average issue of 5 costs 350 (avg 70).
    const fifo = await inTx((c) => new InventoryCosting(c).issue({ companyId, productId: F, date: DATE, quantity: "5" }));
    const avg = await inTx((c) => new InventoryCosting(c).issue({ companyId, productId: A, date: DATE, quantity: "5" }));
    expect(Number(fifo.cogs)).toBe(300);
    expect(Number(avg.cogs)).toBe(350);
  });
});
