import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { FiscalDocumentService } from "../server/fiscal/document-service";
import { InventoryCosting } from "../server/inventory/costing";

neonConfig.webSocketConstructor = ws;

describeIntegration("Sale recognises revenue and COGS together", () => {
  let pool: Pool;
  let companyId: number;
  let trackedProductId: number;
  let untrackedProductId: number;
  const RNC = "152000001";
  const YEAR = new Date().getUTCFullYear();
  const M = String(new Date().getUTCMonth() + 1).padStart(2, "0");
  const DATE = `${YEAR}-${M}-14`;

  const VENTAS = "4.1.01.001";
  const ITBIS = "2.1.02.001";
  const COGS = "5.1.01.001";
  const INVENTORY = "1.1.03.001";
  const CAJA = "1.1.01.001";

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(`INSERT INTO companies (legal_name, rnc) VALUES ('Sale SRL',$1) RETURNING id`, [RNC]);
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);
    await pool.query(`INSERT INTO ncf_sequences (company_id, ncf_type, range_from, range_to, next_number) VALUES ($1,'B01',1,100,1)`, [companyId]);
    // fiscal_document_lines.product_id has a real FK to the legacy `products`
    // table, so a sale line needs a real product (inventory costing keys on the
    // same id but without a FK).
    const p = await pool.query(`INSERT INTO products (name, base_currency, price, category, store_id) VALUES ('Producto Costeado','DOP','100','general',1) RETURNING id`);
    trackedProductId = p.rows[0].id;
    const s = await pool.query(`INSERT INTO products (name, base_currency, price, category, store_id) VALUES ('Servicio Consultoría','DOP','1000','servicios',1) RETURNING id`);
    untrackedProductId = s.rows[0].id;
  });

  afterAll(async () => {
    if (companyId) {
      await cleanup();
      await pool.query(`DELETE FROM products WHERE id = ANY($1)`, [[trackedProductId, untrackedProductId]]);
      await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    await pool.end();
  });

  async function cleanup() {
    for (const t of ["fiscal_documents", "inventory_cost_movements", "inventory_valuation", "journal_entries"]) {
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

  it("an invoice with bookCogs posts revenue, ITBIS and COGS, and draws down inventory", async () => {
    const P = trackedProductId;
    // Stock the product at cost 60.
    await inTx((c) => new InventoryCosting(c).receive({ companyId, productId: P, date: DATE, quantity: "10", unitCost: "60" }));
    expect(await balanceOf(INVENTORY)).toBe(600);

    // Sell 4 @ 100 with 18% ITBIS, recognising COGS.
    const doc = await inTx((c) =>
      new FiscalDocumentService(c).issueInvoice({
        companyId, issuerRnc: RNC, ncfType: "B01", date: DATE,
        lines: [{ description: "Producto", productId: P, quantity: "4", unitPrice: "100.00", taxCode: "ITBIS18" }],
        bookCogs: true,
      }),
    );
    expect(Number(doc.total)).toBe(472); // 400 + 72 ITBIS
    expect(Number(doc.cogsTotal)).toBe(240); // 4 × 60

    // Revenue side.
    expect(await balanceOf(VENTAS)).toBe(-400); // credited
    expect(await balanceOf(ITBIS)).toBe(-72);
    expect(await balanceOf(CAJA)).toBe(472); // cash sale

    // Cost side: COGS 240, inventory drawn down from 600 to 360.
    expect(await balanceOf(COGS)).toBe(240);
    expect(await balanceOf(INVENTORY)).toBe(360);
    const val = await pool.query(`SELECT quantity_on_hand::text q, total_value::text v FROM inventory_valuation WHERE company_id=$1 AND product_id=$2`, [companyId, P]);
    expect(Number(val.rows[0].q)).toBe(6);
    expect(Number(val.rows[0].v)).toBe(360);

    // The books balance across every entry.
    const bal = await pool.query(`SELECT coalesce(sum(debit_func)-sum(credit_func),0)::text b FROM journal_entry_lines WHERE company_id=$1`, [companyId]);
    expect(Number(bal.rows[0].b)).toBe(0);
  });

  it("skips COGS for an untracked product without blocking the sale", async () => {
    const doc = await inTx((c) =>
      new FiscalDocumentService(c).issueInvoice({
        companyId, issuerRnc: RNC, ncfType: "B01", date: DATE,
        lines: [{ description: "Servicio de consultoría", productId: untrackedProductId, quantity: "1", unitPrice: "1000.00", taxCode: "ITBIS18" }],
        bookCogs: true,
      }),
    );
    expect(Number(doc.cogsTotal)).toBe(0); // no valuation row → nothing to cost
    expect(await balanceOf(COGS)).toBe(0);
    expect(await balanceOf(VENTAS)).toBe(-1000); // sale still posts
  });
});
