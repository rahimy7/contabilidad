import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { Payables } from "../server/subledgers/payables";
import { InventoryCosting } from "../server/inventory/costing";

neonConfig.webSocketConstructor = ws;

describeIntegration("Consumable supplies: stored apart, consumed to expense", () => {
  let pool: Pool;
  let companyId: number;
  const RNC = "158000001";
  const YEAR = new Date().getUTCFullYear();
  const M = String(new Date().getUTCMonth() + 1).padStart(2, "0");
  const DATE = `${YEAR}-${M}-06`;

  const MERCANCIA = "1.1.03.001";
  const SUMINISTROS = "1.1.03.002";
  const UTILES = "5.2.02.004";
  const COGS = "5.1.01.001";

  const SUPPLY = 9501; // e.g. printer paper
  const GOODS = 9502; // merchandise for resale

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(`INSERT INTO companies (legal_name, rnc) VALUES ('Sup SRL',$1) RETURNING id`, [RNC]);
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
    for (const t of ["ap_open_items", "inventory_cost_movements", "inventory_lots", "inventory_valuation", "fiscal_documents", "journal_entries"]) {
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
  /** Sum of the stock ledger held in one control account. */
  const stockIn = async (account: string) => {
    const r = await pool.query(
      `SELECT coalesce(sum(total_value),0)::text v FROM inventory_valuation WHERE company_id=$1 AND inventory_account=$2`,
      [companyId, account],
    );
    return Number(r.rows[0].v);
  };
  const qtyOf = async (p: number) => {
    const r = await pool.query(`SELECT quantity_on_hand::text q FROM inventory_valuation WHERE company_id=$1 AND product_id=$2`, [companyId, p]);
    return Number(r.rows[0].q);
  };

  it("buying supplies stocks them in their own account, and consuming them expenses, not COGS", async () => {
    // Buy 100 reams of paper at 5 each, as a consumable.
    await inTx((c) =>
      new Payables(c).registerInvoice({
        companyId, supplierRnc: "130456789", ncf: "B0100000201", ncfType: "B01", date: DATE, dueDate: DATE,
        purchaseType: "supply", receiveToInventory: true,
        lines: [{ description: "Papel", productId: SUPPLY, quantity: "100", unitPrice: "5.00", taxCode: "ITBIS18" }],
      }),
    );

    // Stored apart from merchandise: the supplies account holds it, and the stock
    // ledger for that account reconciles to it.
    expect(await balanceOf(SUMINISTROS)).toBe(500);
    expect(await balanceOf(MERCANCIA)).toBe(0);
    expect(await stockIn(SUMINISTROS)).toBe(500);
    expect(await qtyOf(SUPPLY)).toBe(100);

    // Consume 30 reams → expense 150 to Útiles, drawn from the supplies account.
    const used = await inTx((c) => new InventoryCosting(c).issue({ companyId, productId: SUPPLY, date: DATE, quantity: "30" }));
    expect(Number(used.cogs)).toBe(150); // 30 × 5

    expect(await balanceOf(UTILES)).toBe(150); // consumed to expense
    expect(await balanceOf(COGS)).toBe(0); // a consumable is not cost of goods sold
    expect(await balanceOf(SUMINISTROS)).toBe(350); // 500 − 150
    expect(await stockIn(SUMINISTROS)).toBe(350); // still reconciles
    expect(await qtyOf(SUPPLY)).toBe(70);
  });

  it("merchandise still books COGS, side by side with a consumable", async () => {
    await inTx((c) =>
      new Payables(c).registerInvoice({
        companyId, supplierRnc: "130456789", ncf: "B0100000202", ncfType: "B01", date: DATE, dueDate: DATE,
        purchaseType: "supply", receiveToInventory: true,
        lines: [{ description: "Papel", productId: SUPPLY, quantity: "100", unitPrice: "5.00", taxCode: "ITBIS18" }],
      }),
    );
    await inTx((c) =>
      new Payables(c).registerInvoice({
        companyId, supplierRnc: "130456789", ncf: "B0100000203", ncfType: "B01", date: DATE, dueDate: DATE,
        purchaseType: "inventory", receiveToInventory: true,
        lines: [{ description: "Mercancía", productId: GOODS, quantity: "10", unitPrice: "60.00", taxCode: "ITBIS18" }],
      }),
    );

    // Each lands in its own account.
    expect(await balanceOf(SUMINISTROS)).toBe(500);
    expect(await balanceOf(MERCANCIA)).toBe(600);

    // Issuing each routes to the right expense: supplies → Útiles, goods → COGS.
    await inTx((c) => new InventoryCosting(c).issue({ companyId, productId: SUPPLY, date: DATE, quantity: "10" }));
    await inTx((c) => new InventoryCosting(c).issue({ companyId, productId: GOODS, date: DATE, quantity: "4" }));

    expect(await balanceOf(UTILES)).toBe(50); // 10 × 5
    expect(await balanceOf(COGS)).toBe(240); // 4 × 60
    expect(await balanceOf(SUMINISTROS)).toBe(450);
    expect(await balanceOf(MERCANCIA)).toBe(360);
    expect(await stockIn(SUMINISTROS)).toBe(450);
    expect(await stockIn(MERCANCIA)).toBe(360);
  });
});
