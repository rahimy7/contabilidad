import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { InventoryCosting } from "../server/inventory/costing";
import { FiscalDocumentService } from "../server/fiscal/document-service";
import { marginReport } from "../server/inventory/margin";

neonConfig.webSocketConstructor = ws;

describeIntegration("Inventory margin and returns", () => {
  let pool: Pool;
  let companyId: number;
  let productId: number;
  const RNC = "156000001";
  const YEAR = new Date().getUTCFullYear();
  const MONTH = new Date().getUTCMonth() + 1;
  const M = String(MONTH).padStart(2, "0");
  const DATE = `${YEAR}-${M}-08`;
  const INVENTORY = "1.1.03.001";
  const COGS = "5.1.01.001";
  const VENTAS = "4.1.01.001";

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(`INSERT INTO companies (legal_name, rnc) VALUES ('Margin SRL',$1) RETURNING id`, [RNC]);
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);
    await pool.query(`INSERT INTO ncf_sequences (company_id, ncf_type, range_from, range_to, next_number) VALUES ($1,'B01',1,100,1)`, [companyId]);
    await pool.query(`INSERT INTO ncf_sequences (company_id, ncf_type, range_from, range_to, next_number) VALUES ($1,'B04',1,100,1)`, [companyId]);
    productId = (await pool.query(`INSERT INTO products (name, base_currency, price, category, store_id) VALUES ('Producto M','DOP','100','general',1) RETURNING id`)).rows[0].id;
  });

  afterAll(async () => {
    if (companyId) {
      await cleanup();
      await pool.query(`DELETE FROM products WHERE id=$1`, [productId]);
      await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    await pool.end();
  });

  async function cleanup() {
    for (const t of ["inventory_cost_movements", "inventory_lots", "inventory_valuation", "fiscal_documents", "journal_entries"]) {
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
  const valuationOf = async () => {
    const r = await pool.query(`SELECT quantity_on_hand::text q, total_value::text v FROM inventory_valuation WHERE company_id=$1 AND product_id=$2`, [companyId, productId]);
    return { qty: Number(r.rows[0].q), value: Number(r.rows[0].v) };
  };

  it("reports gross margin, and a credit note with restock reverses the sale to zero", async () => {
    // Stock 10 @ 60; sell 4 @ 100 recognising COGS.
    await inTx((c) => new InventoryCosting(c).receive({ companyId, productId, date: DATE, quantity: "10", unitCost: "60" }));
    const sale = await inTx((c) =>
      new FiscalDocumentService(c).issueInvoice({
        companyId, issuerRnc: RNC, ncfType: "B01", date: DATE,
        lines: [{ description: "Producto M", productId, quantity: "4", unitPrice: "100.00", taxCode: "ITBIS18" }],
        bookCogs: true,
      }),
    );

    // Margin: revenue 400, COGS 240, margin 160 = 40%.
    const m1 = await marginReport(pool, { companyId, year: YEAR, month: MONTH });
    const row = m1.lines.find((l) => l.product_id === productId)!;
    expect(Number(row.revenue)).toBe(400);
    expect(Number(row.cogs)).toBe(240);
    expect(Number(row.margin)).toBe(160);
    expect(row.marginPct).toBe("40.00");

    // Credit note for the 4 units, putting the goods back in stock.
    await inTx((c) =>
      new FiscalDocumentService(c).issueCreditNote({
        companyId, issuerRnc: RNC, ncfType: "B04", date: DATE, modifiesDocId: sale.documentId,
        lines: [{ description: "Devolución Producto M", productId, quantity: "4", unitPrice: "100.00", taxCode: "ITBIS18" }],
        restockInventory: true,
      }),
    );

    // Inventory and COGS are back where they started; the sale is fully undone.
    expect(await valuationOf()).toEqual({ qty: 10, value: 600 });
    expect(await balanceOf(INVENTORY)).toBe(600);
    expect(await balanceOf(COGS)).toBe(0);
    expect(await balanceOf(VENTAS)).toBe(0);

    // Net margin for the month is now zero: revenue 0, COGS 0.
    const m2 = await marginReport(pool, { companyId, year: YEAR, month: MONTH });
    const row2 = m2.lines.find((l) => l.product_id === productId)!;
    expect(Number(row2.revenue)).toBe(0);
    expect(Number(row2.cogs)).toBe(0);
  });
});
