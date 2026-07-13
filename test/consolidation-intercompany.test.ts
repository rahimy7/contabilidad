import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { InventoryCosting } from "../server/inventory/costing";
import { FiscalDocumentService } from "../server/fiscal/document-service";
import { Receivables } from "../server/subledgers/receivables";
import { Payables } from "../server/subledgers/payables";
import { Consolidation } from "../server/consolidation/consolidate";

neonConfig.webSocketConstructor = ws;

/**
 * One member sells to another at a mark-up. Consolidated, nothing happened: no
 * revenue was earned, no cost incurred, and the goods still sit at what the group
 * paid the outside world for them.
 */
describeIntegration("Consolidation eliminates intra-group trading", () => {
  let pool: Pool;
  let groupId: number;
  let seller: number;
  let buyer: number;
  let productId: number;
  const RNC_S = "161000001";
  const RNC_B = "161000002";
  const YEAR = new Date().getUTCFullYear();
  const M = String(new Date().getUTCMonth() + 1).padStart(2, "0");
  const DATE = `${YEAR}-${M}-03`;

  const VENTAS = "4.1.01.001";
  const COGS = "5.1.01.001";
  const INVENTARIO = "1.1.03.001";
  const CLIENTES = "1.1.02.001";
  const PROVEEDORES = "2.1.01.001";

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc = ANY($1)`, [[RNC_S, RNC_B]]);
    await pool.query(`DELETE FROM groups WHERE name='Grupo IC Test'`);

    const g = await pool.query(`INSERT INTO groups (name, base_currency) VALUES ('Grupo IC Test','DOP') RETURNING id`);
    groupId = g.rows[0].id;
    seller = await mkCompany("Matriz SRL", RNC_S);
    buyer = await mkCompany("Filial SRL", RNC_B);
    productId = (await pool.query(`INSERT INTO products (name, base_currency, price, category, store_id) VALUES ('Producto IC','DOP','100','general',1) RETURNING id`)).rows[0].id;

    await pool.query(`INSERT INTO ncf_sequences (company_id, ncf_type, range_from, range_to, next_number) VALUES ($1,'B01',1,100,1)`, [seller]);

    // The seller buys 10 units from the outside world at 60 (owes 600 externally).
    await inTx((c) => new InventoryCosting(c).receive({ companyId: seller, productId, date: DATE, quantity: "10", unitCost: "60" }));

    // It sells all 10 to the sister company at 100, on credit, recognising COGS.
    const sale = await inTx((c) =>
      new FiscalDocumentService(c).issueInvoice({
        companyId: seller, issuerRnc: RNC_S, ncfType: "B01", date: DATE,
        buyerRnc: RNC_B, paymentMethod: "credit", bookCogs: true,
        lines: [{ description: "Producto IC", productId, quantity: "10", unitPrice: "100.00", taxCode: "ITBIS18" }],
      }),
    );
    // The receivable it now holds on its sister.
    await inTx((c) =>
      new Receivables(c).openItem({ companyId: seller, documentId: sale.documentId, issueDate: DATE, dueDate: DATE, amount: sale.total }),
    );

    // The buyer books the same invoice as a purchase, into its own stock.
    await inTx((c) =>
      new Payables(c).registerInvoice({
        companyId: buyer, supplierRnc: RNC_S, ncf: sale.ncf, ncfType: "B01", date: DATE, dueDate: DATE,
        receiveToInventory: true,
        lines: [{ description: "Producto IC", productId, quantity: "10", unitPrice: "100.00", taxCode: "ITBIS18" }],
      }),
    );

    for (const id of [seller, buyer]) {
      await pool.query(
        `INSERT INTO company_consolidation_map (group_id, company_id, ownership_pct, consol_method)
         VALUES ($1,$2,'1.0','full') ON CONFLICT (group_id, company_id) DO NOTHING`,
        [groupId, id],
      );
    }
  });

  afterAll(async () => {
    if (groupId) {
      await pool.query(`DELETE FROM consolidation_runs WHERE group_id=$1`, [groupId]);
      await pool.query(`DELETE FROM company_consolidation_map WHERE group_id=$1`, [groupId]);
    }
    for (const id of [seller, buyer]) {
      if (!id) continue;
      for (const t of ["ar_open_items", "ap_open_items", "inventory_cost_movements", "inventory_lots", "inventory_valuation", "fiscal_documents", "journal_entries"]) {
        await pool.query(`DELETE FROM ${t} WHERE company_id=$1`, [id]);
      }
    }
    await pool.query(`DELETE FROM companies WHERE rnc = ANY($1)`, [[RNC_S, RNC_B]]);
    if (productId) await pool.query(`DELETE FROM products WHERE id=$1`, [productId]);
    if (groupId) await pool.query(`DELETE FROM groups WHERE id=$1`, [groupId]);
    await pool.end();
  });

  async function mkCompany(name: string, rnc: string): Promise<number> {
    const c = await pool.query(`INSERT INTO companies (legal_name, rnc, group_id) VALUES ($1,$2,$3) RETURNING id`, [name, rnc, groupId]);
    await seedCompanyDefaults(pool, c.rows[0].id);
    return c.rows[0].id;
  }

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

  it("cancels the intra-group sale, its cost, the unrealised margin and the debt", async () => {
    const { runId } = await new Consolidation(pool).run({ groupId, fiscalYear: YEAR });
    const res = await new Consolidation(pool).getRun(runId);

    const elim = (code: string) => res.eliminations.find((l: any) => l.account_code === code)!;

    // The sale is undone: revenue out, the seller's actual cost out, and the
    // 400 of margin taken back out of the buyer's stock.
    expect(Number(elim(VENTAS).debit)).toBe(1000);
    expect(Number(elim(COGS).credit)).toBe(600);
    expect(Number(elim(INVENTARIO).credit)).toBe(400); // 1000 − 600, unearned
    expect(elim(INVENTARIO).note).toMatch(/no realizada/);

    // The debt between sisters is cancelled on both sides.
    expect(Number(elim(PROVEEDORES).debit)).toBe(1180);
    expect(Number(elim(CLIENTES).credit)).toBe(1180);

    // Net position after eliminating: as if the trade never happened.
    const net = (code: string) => {
      let d = 0, c = 0;
      for (const l of res.allLines as any[]) {
        if (l.account_code !== code) continue;
        d += Number(l.debit); c += Number(l.credit);
      }
      return d - c;
    };
    expect(net(VENTAS)).toBe(0); // no revenue was earned by the group
    expect(net(COGS)).toBe(0); // and no cost incurred
    expect(net(INVENTARIO)).toBe(600); // the goods, at what the group paid outside
    expect(net(CLIENTES)).toBe(0); // the group owes itself nothing
    expect(net(PROVEEDORES)).toBe(-600); // only the real supplier is still owed

    // Eliminations balance among themselves, so the trial balance still ties.
    expect(res.balanced).toBe(true);
  });
});
