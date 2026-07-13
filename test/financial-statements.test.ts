import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { PostingEngine } from "../server/accounting/posting-engine";
import { FinancialStatements } from "../server/accounting/financial-statements";

neonConfig.webSocketConstructor = ws;

describeIntegration("financial statements", () => {
  let pool: Pool;
  let companyId: number;
  let periodId: number;
  const RNC = "141000001";
  const YEAR = new Date().getUTCFullYear();
  const MONTH = new Date().getUTCMonth() + 1;
  const DATE = `${YEAR}-${String(MONTH).padStart(2, "0")}-15`;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(`INSERT INTO companies (legal_name, rnc) VALUES ('FS SRL',$1) RETURNING id`, [RNC]);
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);
    const p = await pool.query(
      `SELECT id FROM accounting_periods WHERE company_id=$1 AND fiscal_year=$2 AND period_no=$3`,
      [companyId, YEAR, MONTH],
    );
    periodId = p.rows[0].id;
  });

  afterAll(async () => {
    if (companyId) {
      await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM account_period_balances WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM account_period_balances WHERE company_id=$1`, [companyId]);
  });

  async function post(sourceId: string, event: string, lines: Array<[string, string, string]>) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.company_id',$1,true)`, [String(companyId)]);
      await client.query("SET LOCAL ROLE app_rls");
      await new PostingEngine(client).postManual({
        companyId,
        entryDate: DATE,
        reference: sourceId + event,
        lines: lines.map(([accountCode, debit, credit]) => ({ accountCode, debit, credit })),
      });
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  it("income statement nets revenue against expenses", async () => {
    // Capital injection: Dr Caja / Cr Capital.
    await post("s1", "cap", [
      ["1.1.01.001", "10000.00", "0"],
      ["3.1.01.001", "0", "10000.00"],
    ]);
    // Sale: Dr Caja 1180 / Cr Ventas 1000 / Cr ITBIS 180.
    await post("s2", "sale", [
      ["1.1.01.001", "1180.00", "0"],
      ["4.1.01.001", "0", "1000.00"],
      ["2.1.02.001", "0", "180.00"],
    ]);
    // Rent expense: Dr Alquiler 300 / Cr Caja 300.
    await post("s3", "rent", [
      ["5.2.02.001", "300.00", "0"],
      ["1.1.01.001", "0", "300.00"],
    ]);

    const is = await new FinancialStatements(pool).incomeStatement(companyId, YEAR, 1, 12);
    expect(is.income.total).toBe("1000"); // revenue shown positive
    expect(is.expenses.total).toBe("300");
    expect(is.netIncome).toBe("700");
    expect(is.income.lines.find((l) => l.code === "4.1.01.001")!.amount).toBe("1000");
  });

  it("balance sheet balances: Activo = Pasivo + Patrimonio + Resultado", async () => {
    await post("b1", "cap", [
      ["1.1.01.001", "10000.00", "0"],
      ["3.1.01.001", "0", "10000.00"],
    ]);
    await post("b2", "sale", [
      ["1.1.01.001", "1180.00", "0"],
      ["4.1.01.001", "0", "1000.00"],
      ["2.1.02.001", "0", "180.00"],
    ]);
    await post("b3", "rent", [
      ["5.2.02.001", "300.00", "0"],
      ["1.1.01.001", "0", "300.00"],
    ]);

    const bs = await new FinancialStatements(pool).balanceSheet(companyId, YEAR, 12);

    // Caja: 10000 + 1180 − 300 = 10880.
    expect(bs.assets.lines.find((l) => l.code === "1.1.01.001")!.amount).toBe("10880");
    expect(bs.assets.total).toBe("10880");
    // Pasivo: ITBIS por pagar 180. Patrimonio: capital 10000. Resultado: 700.
    expect(bs.liabilities.total).toBe("180");
    expect(bs.equity.total).toBe("10000");
    expect(bs.netIncome).toBe("700");
    // 10880 = 180 + 10000 + 700.
    expect(bs.balanced).toBe(true);
    expect(bs.imbalance).toBe("0");
  });

  it("presents liabilities and equity as positive natural amounts", async () => {
    await post("p1", "loan", [
      ["1.1.01.001", "5000.00", "0"], // Caja up
      ["2.1.01.001", "0", "5000.00"], // Proveedores (liability) up
    ]);
    const bs = await new FinancialStatements(pool).balanceSheet(companyId, YEAR, 12);
    const prov = bs.liabilities.lines.find((l) => l.code === "2.1.01.001")!;
    expect(prov.amount).toBe("5000"); // positive, not −5000
  });

  it("an empty year yields empty, balanced statements", async () => {
    const bs = await new FinancialStatements(pool).balanceSheet(companyId, YEAR, 12);
    expect(bs.assets.total).toBe("0");
    expect(bs.balanced).toBe(true);
  });
});
