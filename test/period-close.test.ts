import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { PostingEngine } from "../server/accounting/posting-engine";
import { PeriodClose, PeriodCloseError } from "../server/accounting/period-close";
import { FinancialStatements } from "../server/accounting/financial-statements";

neonConfig.webSocketConstructor = ws;

describeIntegration("period and year-end close", () => {
  let pool: Pool;
  let companyId: number;
  // Use a fixed past year so periods 1..13 exist and are all open.
  const YEAR = 2030;
  const RNC = "142000001";

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(`INSERT INTO companies (legal_name, rnc) VALUES ('Close SRL',$1) RETURNING id`, [RNC]);
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);
    // Seed the target year's periods (the seeder seeds the current year).
    for (let m = 1; m <= 12; m++) {
      const start = `${YEAR}-${String(m).padStart(2, "0")}-01`;
      const end = new Date(Date.UTC(YEAR, m, 0)).toISOString().slice(0, 10);
      await pool.query(
        `INSERT INTO accounting_periods (company_id, fiscal_year, period_no, start_date, end_date, status)
         VALUES ($1,$2,$3,$4,$5,'open') ON CONFLICT DO NOTHING`,
        [companyId, YEAR, m, start, end],
      );
    }
    await pool.query(
      `INSERT INTO accounting_periods (company_id, fiscal_year, period_no, start_date, end_date, status)
       VALUES ($1,$2,13,$3,$3,'open') ON CONFLICT DO NOTHING`,
      [companyId, YEAR, `${YEAR}-12-31`],
    );
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
    await pool.query(
      `UPDATE accounting_periods SET status='open', closed_at=NULL, closed_by=NULL
        WHERE company_id=$1 AND fiscal_year=$2`,
      [companyId, YEAR],
    );
  });

  async function post(period: number, ref: string, lines: Array<[string, string, string]>) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await new PostingEngine(client).postManual({
        companyId,
        entryDate: `${YEAR}-${String(period).padStart(2, "0")}-15`,
        reference: ref,
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

  it("closing a period blocks further postings into it", async () => {
    await post(1, "jan", [
      ["1.1.01.001", "1000.00", "0"],
      ["4.1.01.001", "0", "1000.00"],
    ]);
    await new PeriodClose(pool).close(companyId, YEAR, 1);

    await expect(
      post(1, "jan-late", [
        ["1.1.01.001", "50.00", "0"],
        ["4.1.01.001", "0", "50.00"],
      ]),
    ).rejects.toThrow(/is closed|cannot post/i);
  });

  it("refuses to close a period while an earlier one is open", async () => {
    await expect(new PeriodClose(pool).close(companyId, YEAR, 3)).rejects.toThrow(PeriodCloseError);
  });

  it("reopening a period lets postings resume", async () => {
    await new PeriodClose(pool).close(companyId, YEAR, 1);
    await new PeriodClose(pool).reopen(companyId, YEAR, 1);
    await post(1, "jan-again", [
      ["1.1.01.001", "10.00", "0"],
      ["4.1.01.001", "0", "10.00"],
    ]);
  });

  it("year-end close zeroes the P&L and moves the result to equity", async () => {
    // Profit of 700 across the year.
    await post(2, "cap", [
      ["1.1.01.001", "10000.00", "0"],
      ["3.1.01.001", "0", "10000.00"],
    ]);
    await post(2, "sale", [
      ["1.1.01.001", "1000.00", "0"],
      ["4.1.01.001", "0", "1000.00"],
    ]);
    await post(2, "rent", [
      ["5.2.02.001", "300.00", "0"],
      ["1.1.01.001", "0", "300.00"],
    ]);

    const before = await new FinancialStatements(pool).incomeStatement(companyId, YEAR, 1, 12);
    expect(before.netIncome).toBe("700");

    const entryId = await new PeriodClose(pool).closeYear(companyId, YEAR);
    expect(entryId).toBeTruthy();

    // After closing, income and expense accounts net to zero for the year.
    const after = await new FinancialStatements(pool).incomeStatement(companyId, YEAR, 1, 13);
    expect(after.income.total).toBe("0");
    expect(after.expenses.total).toBe("0");
    expect(after.netIncome).toBe("0");

    // The 700 now sits in Resultado del ejercicio (equity, credit balance).
    const res = await pool.query(
      `SELECT coalesce(sum(l.credit_func - l.debit_func),0)::text b
         FROM journal_entry_lines l JOIN chart_of_accounts a ON a.id=l.account_id
        WHERE l.company_id=$1 AND a.code='3.1.02.002'`,
      [companyId],
    );
    expect(Number(res.rows[0].b)).toBe(700);
  });

  it("is idempotent: closing the year twice is refused, not double-posted", async () => {
    await post(2, "sale", [
      ["1.1.01.001", "1000.00", "0"],
      ["4.1.01.001", "0", "1000.00"],
    ]);
    await new PeriodClose(pool).closeYear(companyId, YEAR);
    await expect(new PeriodClose(pool).closeYear(companyId, YEAR)).rejects.toThrow(/ya fue cerrado/);
  });
});
