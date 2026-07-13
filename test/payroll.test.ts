import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { Payroll } from "../server/modules/payroll";

neonConfig.webSocketConstructor = ws;

describeIntegration("Dominican payroll", () => {
  let pool: Pool;
  let companyId: number;
  const YEAR = new Date().getUTCFullYear();
  const MONTH = new Date().getUTCMonth() + 1;
  const DATE = `${YEAR}-${String(MONTH).padStart(2, "0")}-28`;
  const RNC = "147000001";

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(`INSERT INTO companies (legal_name, rnc) VALUES ('Pay SRL',$1) RETURNING id`, [RNC]);
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);
  });

  afterAll(async () => {
    if (companyId) {
      await pool.query(`DELETE FROM payslips WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM payroll_runs WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM payroll_employees WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM payslips WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM payroll_runs WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM payroll_employees WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId]);
  });

  it("computes the DR statutory deductions on a 50,000 salary", () => {
    const p = new Payroll({} as any).computePayslip("50000.00");
    // AFP 2.87%, SFS 3.04% of 50000.
    expect(p.afpEmployee).toBe("1435"); // 50000 * 0.0287
    expect(p.sfsEmployee).toBe("1520"); // 50000 * 0.0304
    // ISR base = 50000 − 1435 − 1520 = 47045; in the 15% bracket over 34685.
    // (47045 − 34685) * 0.15 = 1854.
    expect(p.isr).toBe("1854");
    // Net = 50000 − 1435 − 1520 − 1854 = 45191.
    expect(p.netPay).toBe("45191");
    // Employer side.
    expect(p.afpEmployer).toBe("3550"); // 7.10%
    expect(p.sfsEmployer).toBe("3545"); // 7.09%
    expect(p.infotep).toBe("500"); // 1%
  });

  it("exempts a low salary from ISR", () => {
    const p = new Payroll({} as any).computePayslip("25000.00");
    // ISR base = 25000 − 717.50 − 760 = 23522.50, below the 34685 exempt threshold.
    expect(p.isr).toBe("0");
  });

  it("applies the 25% top bracket on a high salary", () => {
    const p = new Payroll({} as any).computePayslip("120000.00");
    // base = 120000 − 3444 − 3648 = 112908; top bracket: 6647.90 + (112908 − 72260)*0.25.
    expect(p.isr).toBe("16809.9"); // canonical decimal drops the trailing zero
  });

  it("runs payroll and posts a balanced journal entry", async () => {
    await pool.query(
      `INSERT INTO payroll_employees (company_id, code, name, base_salary) VALUES ($1,'E1','Ana','50000.00'),($1,'E2','Luis','30000.00')`,
      [companyId],
    );

    const client = await pool.connect();
    let res;
    try {
      await client.query("BEGIN");
      res = await new Payroll(client).run(companyId, YEAR, MONTH, DATE);
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    expect(res!.employees).toBe(2);
    expect(res!.grossTotal).toBe("80000");

    // The journal entry must balance — the deferred trigger would have rejected
    // it otherwise, but assert it plainly.
    const bal = await pool.query(
      `SELECT sum(debit_func)::text d, sum(credit_func)::text c FROM journal_entry_lines l
         JOIN journal_entries e ON e.id=l.entry_id
        WHERE e.company_id=$1 AND e.source_type='payroll'`,
      [companyId],
    );
    expect(bal.rows[0].d).toBe(bal.rows[0].c);

    // Salary expense = gross.
    const salary = await pool.query(
      `SELECT sum(l.debit_func - l.credit_func)::text b FROM journal_entry_lines l
         JOIN chart_of_accounts a ON a.id=l.account_id WHERE l.company_id=$1 AND a.code='5.2.01.001'`,
      [companyId],
    );
    expect(Number(salary.rows[0].b)).toBe(80000);
  });

  it("refuses to run the same month twice", async () => {
    await pool.query(`INSERT INTO payroll_employees (company_id, code, name, base_salary) VALUES ($1,'E1','Ana','50000.00')`, [companyId]);
    await inTx((c) => new Payroll(c).run(companyId, YEAR, MONTH, DATE));
    await expect(inTx((c) => new Payroll(c).run(companyId, YEAR, MONTH, DATE))).rejects.toThrow(/ya fue procesada/);
  });

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
});
