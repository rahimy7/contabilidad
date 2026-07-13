import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { Payables } from "../server/subledgers/payables";
import { FiscalDocumentService } from "../server/fiscal/document-service";

neonConfig.webSocketConstructor = ws;

describeIntegration("Purchase feeds inventory costing", () => {
  let pool: Pool;
  let companyId: number;
  let p1: number;
  let p2: number;
  const RNC = "155000001";
  const YEAR = new Date().getUTCFullYear();
  const M = String(new Date().getUTCMonth() + 1).padStart(2, "0");
  const DATE = `${YEAR}-${M}-09`;
  const INVENTORY = "1.1.03.001";
  const COGS = "5.1.01.001";

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(`INSERT INTO companies (legal_name, rnc) VALUES ('PurchInv SRL',$1) RETURNING id`, [RNC]);
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);
    await pool.query(`INSERT INTO ncf_sequences (company_id, ncf_type, range_from, range_to, next_number) VALUES ($1,'B01',1,100,1)`, [companyId]);
    p1 = (await pool.query(`INSERT INTO products (name, base_currency, price, category, store_id) VALUES ('Producto 1','DOP','100','general',1) RETURNING id`)).rows[0].id;
    p2 = (await pool.query(`INSERT INTO products (name, base_currency, price, category, store_id) VALUES ('Producto 2','DOP','150','general',1) RETURNING id`)).rows[0].id;
  });

  afterAll(async () => {
    if (companyId) {
      await cleanup();
      await pool.query(`DELETE FROM products WHERE id = ANY($1)`, [[p1, p2]]);
      await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    await pool.end();
  });

  async function cleanup() {
    // FK order: ap_open_items and cost movements point at documents/entries.
    for (const t of ["ap_open_items", "inventory_cost_movements", "inventory_lots", "inventory_valuation", "fiscal_documents", "journal_entries"]) {
      await pool.query(`DELETE FROM ${t} WHERE company_id=$1`, [companyId]);
    }
    await pool.query(`UPDATE ncf_sequences SET next_number=1 WHERE company_id=$1`, [companyId]);
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
  const valuationOf = async (p: number) => {
    const r = await pool.query(`SELECT quantity_on_hand::text q, total_value::text v FROM inventory_valuation WHERE company_id=$1 AND product_id=$2`, [companyId, p]);
    return r.rows.length ? { qty: Number(r.rows[0].q), value: Number(r.rows[0].v) } : null;
  };
  const totalValuation = async () => Number((await pool.query(`SELECT coalesce(sum(total_value),0)::text v FROM inventory_valuation WHERE company_id=$1`, [companyId])).rows[0].v);

  it("a purchase re-values inventory and reconciles to the inventory account, then a sale draws it down", async () => {
    // Buy 10 of p1 @ 60 and 5 of p2 @ 100, feeding inventory.
    await inTx((c) =>
      new Payables(c).registerInvoice({
        companyId, supplierRnc: "130456789", ncf: "B0100000123", ncfType: "B01", date: DATE, dueDate: DATE,
        receiveToInventory: true,
        lines: [
          { description: "Producto 1", productId: p1, quantity: "10", unitPrice: "60.00", taxCode: "ITBIS18" },
          { description: "Producto 2", productId: p2, quantity: "5", unitPrice: "100.00", taxCode: "ITBIS18" },
        ],
      }),
    );

    // GL inventory = goods 1100; valuation matches, split by product.
    expect(await balanceOf(INVENTORY)).toBe(1100);
    expect(await totalValuation()).toBe(1100);
    expect(await valuationOf(p1)).toEqual({ qty: 10, value: 600 });
    expect(await valuationOf(p2)).toEqual({ qty: 5, value: 500 });

    // Sell 4 of p1 @ 100 with COGS → COGS 4 × 60 = 240, inventory drops to 860.
    const doc = await inTx((c) =>
      new FiscalDocumentService(c).issueInvoice({
        companyId, issuerRnc: RNC, ncfType: "B01", date: DATE,
        lines: [{ description: "Producto 1", productId: p1, quantity: "4", unitPrice: "100.00", taxCode: "ITBIS18" }],
        bookCogs: true,
      }),
    );
    expect(Number(doc.cogsTotal)).toBe(240);
    expect(await balanceOf(COGS)).toBe(240);
    expect(await balanceOf(INVENTORY)).toBe(860);
    expect(await totalValuation()).toBe(860);
    expect(await valuationOf(p1)).toEqual({ qty: 6, value: 360 });
  });

  it("values a discounted purchase at what was actually paid, matching the ledger", async () => {
    // 10 @ 100 with a 200 discount → the line is worth 800, not 1000.
    await inTx((c) =>
      new Payables(c).registerInvoice({
        companyId, supplierRnc: "130456789", ncf: "B0100000124", ncfType: "B01", date: DATE, dueDate: DATE,
        receiveToInventory: true,
        lines: [{ description: "Producto 1", productId: p1, quantity: "10", unitPrice: "100.00", discount: "200.00", taxCode: "ITBIS18" }],
      }),
    );

    // The ledger debited 800; the stock ledger must agree, or the two drift apart
    // by exactly the discount.
    expect(await balanceOf(INVENTORY)).toBe(800);
    expect(await valuationOf(p1)).toEqual({ qty: 10, value: 800 });
    expect(await totalValuation()).toBe(800);

    const avg = await pool.query(`SELECT average_cost::text a FROM inventory_valuation WHERE company_id=$1 AND product_id=$2`, [companyId, p1]);
    expect(Number(avg.rows[0].a)).toBe(80); // 800 / 10, the real unit cost
  });
});
