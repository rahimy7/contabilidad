import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { Payables } from "../server/subledgers/payables";
import { FixedAssets } from "../server/modules/fixed-assets";

neonConfig.webSocketConstructor = ws;

describeIntegration("Purchase classification routes to the right account", () => {
  let pool: Pool;
  let companyId: number;
  const RNC = "157000001";
  const YEAR = new Date().getUTCFullYear();
  const MONTH = new Date().getUTCMonth() + 1;
  const M = String(MONTH).padStart(2, "0");
  const DATE = `${YEAR}-${M}-07`;

  const MERCANCIA = "1.1.03.001";
  const SUMINISTROS = "1.1.03.002";
  const ACTIVO = "1.2.01.001";
  const ACCUM = "1.2.01.003";
  const DEPREC = "5.2.03.001";
  const HONORARIOS = "5.2.02.003";

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(`INSERT INTO companies (legal_name, rnc) VALUES ('Class SRL',$1) RETURNING id`, [RNC]);
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);
    await pool.query(`INSERT INTO ncf_sequences (company_id, ncf_type, range_from, range_to, next_number) VALUES ($1,'B01',1,1000,1)`, [companyId]);
  });

  afterAll(async () => {
    if (companyId) {
      await cleanup();
      await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    await pool.end();
  });

  async function cleanup() {
    for (const t of ["ap_open_items", "depreciation_entries", "fixed_assets", "inventory_cost_movements", "inventory_lots", "inventory_valuation", "fiscal_documents", "journal_entries"]) {
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

  const buy = (over: any, ncf: string) =>
    inTx((c) =>
      new Payables(c).registerInvoice({
        companyId, supplierRnc: "130456789", ncf, ncfType: "B01", date: DATE, dueDate: DATE,
        lines: [{ description: "x", quantity: "1", unitPrice: over.unitPrice ?? "500.00", taxCode: "ITBIS18" }],
        ...over,
      }),
    );

  it("merchandise (default) hits the sale-inventory account", async () => {
    await buy({ unitPrice: "500.00" }, "B0100000001");
    expect(await balanceOf(MERCANCIA)).toBe(500);
    expect(await balanceOf(SUMINISTROS)).toBe(0);
  });

  it("a consumable supply is stored apart, not in sale inventory", async () => {
    await buy({ purchaseType: "supply", unitPrice: "500.00" }, "B0100000002");
    expect(await balanceOf(SUMINISTROS)).toBe(500);
    expect(await balanceOf(MERCANCIA)).toBe(0);
  });

  it("a service posts to expense, not inventory", async () => {
    await buy({ purchaseType: "service", unitPrice: "2000.00" }, "B0100000003");
    expect(await balanceOf(HONORARIOS)).toBe(2000);
    expect(await balanceOf(MERCANCIA)).toBe(0);
  });

  it("a fixed-asset purchase capitalises the asset, opens the register, and depreciates", async () => {
    await buy(
      { purchaseType: "fixed_asset", unitPrice: "36000.00", fixedAsset: { code: "FA-1", name: "Laptop", usefulLifeMonths: 36 } },
      "B0100000004",
    );
    // Capitalised to the asset account, not inventory.
    expect(await balanceOf(ACTIVO)).toBe(36000);
    expect(await balanceOf(MERCANCIA)).toBe(0);

    // The asset is now in the register with its cost.
    const asset = await pool.query(`SELECT cost::text, useful_life_months FROM fixed_assets WHERE company_id=$1 AND code='FA-1'`, [companyId]);
    expect(Number(asset.rows[0].cost)).toBe(36000);
    expect(asset.rows[0].useful_life_months).toBe(36);

    // And it depreciates: 36000 / 36 = 1000 for the month.
    const dep = await inTx((c) => new FixedAssets(c).runDepreciation(companyId, YEAR, MONTH, DATE));
    expect(dep.charged).toBe(1);
    expect(Number(dep.total)).toBe(1000);
    expect(await balanceOf(DEPREC)).toBe(1000); // expense
    expect(await balanceOf(ACCUM)).toBe(-1000); // accumulated depreciation (credit)
  });
});
