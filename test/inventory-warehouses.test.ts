import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { InventoryCosting, InventoryCostingError } from "../server/inventory/costing";
import { stockReconciliation } from "../server/inventory/stock-reconciliation";

neonConfig.webSocketConstructor = ws;

describeIntegration("Inventory costing across physical warehouses", () => {
  let pool: Pool;
  let companyId: number;
  let whA: number;
  let whB: number;
  const RNC = "159000001";
  const YEAR = new Date().getUTCFullYear();
  const M = String(new Date().getUTCMonth() + 1).padStart(2, "0");
  const DATE = `${YEAR}-${M}-05`;
  const INVENTORY = "1.1.03.001";
  const COGS = "5.1.01.001";
  /** A real catalog product: `warehouse_stock.product_id` has a FK to `products`. */
  let P: number;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(`INSERT INTO companies (legal_name, rnc) VALUES ('WH SRL',$1) RETURNING id`, [RNC]);
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);
    whA = (await pool.query(`INSERT INTO warehouses (store_id, name) VALUES (1,'Almacén Central Test') RETURNING id`)).rows[0].id;
    whB = (await pool.query(`INSERT INTO warehouses (store_id, name) VALUES (1,'Sucursal Norte Test') RETURNING id`)).rows[0].id;
    P = (await pool.query(`INSERT INTO products (name, base_currency, price, category, store_id) VALUES ('Producto WH','DOP','100','general',1) RETURNING id`)).rows[0].id;
  });

  afterAll(async () => {
    if (companyId) {
      await cleanup();
      await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    if (whA) await pool.query(`DELETE FROM warehouses WHERE id = ANY($1)`, [[whA, whB]]);
    if (P) await pool.query(`DELETE FROM products WHERE id=$1`, [P]);
    await pool.end();
  });

  async function cleanup() {
    for (const t of ["inventory_cost_movements", "inventory_lots", "inventory_valuation", "journal_entries"]) {
      await pool.query(`DELETE FROM ${t} WHERE company_id=$1`, [companyId]);
    }
    if (whA) await pool.query(`DELETE FROM warehouse_stock WHERE warehouse_id = ANY($1)`, [[whA, whB]]);
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
  const stockAt = async (wh: number) => {
    const r = await pool.query(
      `SELECT quantity_on_hand::text q, total_value::text v, average_cost::text a
         FROM inventory_valuation WHERE company_id=$1 AND product_id=$2 AND warehouse_id=$3`,
      [companyId, P, wh],
    );
    return r.rows.length ? { qty: Number(r.rows[0].q), value: Number(r.rows[0].v), avg: Number(r.rows[0].a) } : null;
  };
  const totalStock = async () =>
    Number((await pool.query(`SELECT coalesce(sum(total_value),0)::text v FROM inventory_valuation WHERE company_id=$1`, [companyId])).rows[0].v);
  const entryCount = async () =>
    Number((await pool.query(`SELECT count(*)::int c FROM journal_entries WHERE company_id=$1`, [companyId])).rows[0].c);

  it("values each bodega on its own cost, and a transfer moves value without touching the ledger", async () => {
    // Same product, different costs in each bodega.
    await inTx((c) => new InventoryCosting(c).receive({ companyId, productId: P, date: DATE, quantity: "10", unitCost: "60", warehouseId: whA }));
    await inTx((c) => new InventoryCosting(c).receive({ companyId, productId: P, date: DATE, quantity: "10", unitCost: "80", warehouseId: whB }));

    // Each warehouse keeps its own average — not one blended 70.
    expect(await stockAt(whA)).toEqual({ qty: 10, value: 600, avg: 60 });
    expect(await stockAt(whB)).toEqual({ qty: 10, value: 800, avg: 80 });
    expect(await balanceOf(INVENTORY)).toBe(1400);
    expect(await totalStock()).toBe(1400);

    // Selling from A costs A's stock, at 60 — not the company-wide average.
    const out = await inTx((c) => new InventoryCosting(c).issue({ companyId, productId: P, date: DATE, quantity: "5", warehouseId: whA }));
    expect(Number(out.cogs)).toBe(300); // 5 × 60
    expect(await balanceOf(COGS)).toBe(300);
    expect(await balanceOf(INVENTORY)).toBe(1100);

    const entriesBefore = await entryCount();

    // Move 5 units from B to A. They carry B's cost (80 each = 400) across.
    const t = await inTx((c) =>
      new InventoryCosting(c).transfer({ companyId, productId: P, date: DATE, quantity: "5", fromWarehouseId: whB, toWarehouseId: whA }),
    );
    expect(Number(t.cost)).toBe(400);

    // B gave up 400; A took it in and re-averaged: (300 + 400) / 10 = 70.
    expect(await stockAt(whB)).toEqual({ qty: 5, value: 400, avg: 80 });
    expect(await stockAt(whA)).toEqual({ qty: 10, value: 700, avg: 70 });

    // The ledger never moved: same account, so no entry and no change in balance.
    expect(await entryCount()).toBe(entriesBefore);
    expect(await balanceOf(INVENTORY)).toBe(1100);
    expect(await balanceOf(COGS)).toBe(300);

    // And the books still reconcile: every bodega's value sums to the account.
    expect(await totalStock()).toBe(1100);
  });

  it("reports where the POS count and the valued ledger disagree, priced at cost", async () => {
    // Accounting says 10 units at 60 sit in bodega A.
    await inTx((c) => new InventoryCosting(c).receive({ companyId, productId: P, date: DATE, quantity: "10", unitCost: "60", warehouseId: whA }));

    // The POS's own count says 8 — two went missing somewhere.
    await pool.query(`INSERT INTO warehouse_stock (warehouse_id, product_id, store_id, quantity) VALUES ($1,$2,1,8)`, [whA, P]);

    const rec = await stockReconciliation(pool, companyId);
    expect(rec.reconciled).toBe(false);
    expect(rec.differences).toHaveLength(1);
    const d = rec.differences[0];
    expect(Number(d.operational_qty)).toBe(8);
    expect(Number(d.valued_qty)).toBe(10);
    expect(Number(d.difference)).toBe(-2);
    expect(Number(d.value_difference)).toBe(-120); // 2 units × 60
    expect(Number(rec.netValueDifference)).toBe(-120);

    // Once the count agrees, there is nothing to report.
    await pool.query(`UPDATE warehouse_stock SET quantity=10 WHERE warehouse_id=$1 AND product_id=$2`, [whA, P]);
    const after = await stockReconciliation(pool, companyId);
    expect(after.reconciled).toBe(true);
    expect(after.differences).toHaveLength(0);
  });

  it("refuses a transfer to the same bodega and an issue from an empty one", async () => {
    await inTx((c) => new InventoryCosting(c).receive({ companyId, productId: P, date: DATE, quantity: "5", unitCost: "10", warehouseId: whA }));

    await expect(
      inTx((c) => new InventoryCosting(c).transfer({ companyId, productId: P, date: DATE, quantity: "1", fromWarehouseId: whA, toWarehouseId: whA })),
    ).rejects.toThrow(InventoryCostingError);

    // Stock sits in A, so B has nothing to give.
    await expect(
      inTx((c) => new InventoryCosting(c).issue({ companyId, productId: P, date: DATE, quantity: "1", warehouseId: whB })),
    ).rejects.toThrow(InventoryCostingError);
  });
});
