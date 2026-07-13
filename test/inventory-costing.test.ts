import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { InventoryCosting, InventoryCostingError } from "../server/inventory/costing";

neonConfig.webSocketConstructor = ws;

describeIntegration("Inventory costing (weighted average)", () => {
  let pool: Pool;
  let companyId: number;
  const RNC = "151000001";
  const YEAR = new Date().getUTCFullYear();
  const M = String(new Date().getUTCMonth() + 1).padStart(2, "0");
  const DATE = `${YEAR}-${M}-12`;
  const INVENTORY = "1.1.03.001";
  const COGS = "5.1.01.001";

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(`INSERT INTO companies (legal_name, rnc) VALUES ('Inv SRL',$1) RETURNING id`, [RNC]);
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
    for (const t of ["inventory_cost_movements", "inventory_valuation", "journal_entries"]) {
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
  const totalValuation = async () => {
    const r = await pool.query(`SELECT coalesce(sum(total_value),0)::text v FROM inventory_valuation WHERE company_id=$1`, [companyId]);
    return Number(r.rows[0].v);
  };

  it("re-averages on receipt, books COGS at that average, and ties to the inventory account", async () => {
    const P = 9001;
    // Receive 10 @ 100, then 10 @ 120 → average 110.
    await inTx((c) => new InventoryCosting(c).receive({ companyId, productId: P, date: DATE, quantity: "10", unitCost: "100" }));
    await inTx((c) => new InventoryCosting(c).receive({ companyId, productId: P, date: DATE, quantity: "10", unitCost: "120" }));

    const val = await pool.query(`SELECT quantity_on_hand::text q, average_cost::text a, total_value::text v FROM inventory_valuation WHERE company_id=$1 AND product_id=$2`, [companyId, P]);
    expect(Number(val.rows[0].q)).toBe(20);
    expect(Number(val.rows[0].a)).toBe(110);
    expect(Number(val.rows[0].v)).toBe(2200);
    expect(await balanceOf(INVENTORY)).toBe(2200);
    expect(await totalValuation()).toBe(2200);

    // Issue 5 → COGS 5 × 110 = 550.
    const r = await inTx((c) => new InventoryCosting(c).issue({ companyId, productId: P, date: DATE, quantity: "5" }));
    expect(Number(r.cogs)).toBe(550);
    expect(await balanceOf(COGS)).toBe(550);
    expect(await balanceOf(INVENTORY)).toBe(1650); // 2200 − 550
    expect(await totalValuation()).toBe(1650); // valuation still ties to the ledger

    // Issue the remaining 15 → COGS 15 × 110 = 1650; inventory lands on zero.
    await inTx((c) => new InventoryCosting(c).issue({ companyId, productId: P, date: DATE, quantity: "15" }));
    expect(await balanceOf(COGS)).toBe(2200); // 550 + 1650
    expect(await balanceOf(INVENTORY)).toBe(0);
    expect(await totalValuation()).toBe(0);
  });

  it("absorbs rounding residual into the final issue so valuation equals the ledger exactly", async () => {
    const P = 9002;
    // 3 @ 100 and 4 @ 110 → 740 / 7 = 105.71428571…, an average that does not divide evenly.
    await inTx((c) => new InventoryCosting(c).receive({ companyId, productId: P, date: DATE, quantity: "3", unitCost: "100" }));
    await inTx((c) => new InventoryCosting(c).receive({ companyId, productId: P, date: DATE, quantity: "4", unitCost: "110" }));
    expect(await balanceOf(INVENTORY)).toBe(740);

    // Issue 2, then the remaining 5. Total COGS must equal the 740 received, to the cent.
    await inTx((c) => new InventoryCosting(c).issue({ companyId, productId: P, date: DATE, quantity: "2" }));
    await inTx((c) => new InventoryCosting(c).issue({ companyId, productId: P, date: DATE, quantity: "5" }));

    expect(await balanceOf(COGS)).toBe(740);
    expect(await balanceOf(INVENTORY)).toBe(0);
    expect(await totalValuation()).toBe(0);
  });

  it("rejects issuing more than is on hand", async () => {
    const P = 9003;
    await inTx((c) => new InventoryCosting(c).receive({ companyId, productId: P, date: DATE, quantity: "5", unitCost: "10" }));
    await expect(
      inTx((c) => new InventoryCosting(c).issue({ companyId, productId: P, date: DATE, quantity: "6" })),
    ).rejects.toThrow(InventoryCostingError);
  });
});
