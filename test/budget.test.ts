import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { PostingEngine } from "../server/accounting/posting-engine";
import { Budgets } from "../server/modules/budget";

neonConfig.webSocketConstructor = ws;

describeIntegration("budget vs actual", () => {
  let pool: Pool;
  let companyId: number;
  const YEAR = new Date().getUTCFullYear();
  const MONTH = new Date().getUTCMonth() + 1;
  const DATE = `${YEAR}-${String(MONTH).padStart(2, "0")}-15`;
  const RNC = "146000001";

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(`INSERT INTO companies (legal_name, rnc) VALUES ('Bud SRL',$1) RETURNING id`, [RNC]);
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);

    // Actual rent expense of 300 this month.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await new PostingEngine(client).postManual({
        companyId,
        entryDate: DATE,
        reference: "rent-actual",
        lines: [
          { accountCode: "5.2.02.001", debit: "300.00" },
          { accountCode: "1.1.01.001", credit: "300.00" },
        ],
      });
      await client.query("COMMIT");
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (companyId) {
      await pool.query(`DELETE FROM budget_lines WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM budgets WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM account_period_balances WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    await pool.end();
  });

  it("creates a budget and compares it to the posted ledger", async () => {
    const budgetId = await new Budgets(pool).create(companyId, "Presupuesto 2026", YEAR, [
      { accountCode: "5.2.02.001", periodNo: MONTH, amount: "500.00" }, // budgeted rent
      { accountCode: "5.2.02.002", periodNo: MONTH, amount: "200.00" }, // budgeted utilities (no actual)
    ]);

    const report = await new Budgets(pool).varianceReport(companyId, budgetId, MONTH, MONTH);

    const rent = report.rows.find((r) => r.code === "5.2.02.001")!;
    expect(rent.budget).toBe("500");
    expect(rent.actual).toBe("300");
    expect(rent.variance).toBe("200"); // under budget by 200

    const util = report.rows.find((r) => r.code === "5.2.02.002")!;
    expect(util.budget).toBe("200");
    expect(util.actual).toBe("0"); // nothing spent
    expect(util.variance).toBe("200");

    expect(report.totalBudget).toBe("700");
    expect(report.totalActual).toBe("300");
  });

  it("shows actual with no budget as a negative variance", async () => {
    // A budget that omits rent entirely; the 300 actual becomes an overrun.
    const budgetId = await new Budgets(pool).create(companyId, "Presupuesto parcial", YEAR, [
      { accountCode: "5.2.02.002", periodNo: MONTH, amount: "100.00" },
    ]);
    const report = await new Budgets(pool).varianceReport(companyId, budgetId, MONTH, MONTH);
    const rent = report.rows.find((r) => r.code === "5.2.02.001")!;
    expect(rent.budget).toBe("0");
    expect(rent.actual).toBe("300");
    expect(rent.variance).toBe("-300"); // spent with nothing budgeted
  });
});
