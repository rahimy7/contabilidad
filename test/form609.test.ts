import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { ForeignPayments, ForeignPaymentError } from "../server/fiscal/foreign-payments";
import { generate609 } from "../server/fiscal/dgii-reports";

neonConfig.webSocketConstructor = ws;

describeIntegration("Form 609 — payments abroad", () => {
  let pool: Pool;
  let companyId: number;
  const RNC = "150000001";
  const YEAR = new Date().getUTCFullYear();
  const M = String(new Date().getUTCMonth() + 1).padStart(2, "0");
  const MONTH = new Date().getUTCMonth() + 1;
  const DATE = `${YEAR}-${M}-15`;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(`INSERT INTO companies (legal_name, rnc) VALUES ('609 SRL',$1) RETURNING id`, [RNC]);
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
    await pool.query(`DELETE FROM foreign_payments WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId]);
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

  it("posts a balanced three-leg entry withholding 27% and lands ISR in its own account", async () => {
    const res = await inTx((c) =>
      new ForeignPayments(c).record({
        companyId, beneficiaryName: "Acme Corp", country: "USA", incomeType: "servicios",
        paymentDate: DATE, grossAmount: "10000.00",
      }),
    );
    expect(Number(res.isrRetained)).toBe(2700); // 27% of 10000
    expect(Number(res.net)).toBe(7300);

    // Dr Honorarios 10000, Cr Bancos 7300, Cr ISR retenido exterior 2700.
    expect(await balanceOf("5.2.02.003")).toBe(10000);
    expect(await balanceOf("1.1.01.003")).toBe(-7300);
    expect(await balanceOf("2.1.02.005")).toBe(-2700); // credit balance on the liability
  });

  it("groups payments into the 609 and reconciles the withheld total to 2.1.02.005", async () => {
    await inTx((c) =>
      new ForeignPayments(c).record({
        companyId, beneficiaryName: "Acme Corp", incomeType: "servicios",
        paymentDate: DATE, grossAmount: "10000.00",
      }),
    );
    await inTx((c) =>
      new ForeignPayments(c).record({
        companyId, beneficiaryName: "Globex Ltd", incomeType: "intereses",
        paymentDate: DATE, grossAmount: "5000.00",
      }),
    );

    const r609 = await generate609(pool, { companyId, rnc: RNC, year: YEAR, month: MONTH });
    expect(r609.recordCount).toBe(2);
    expect(r609.header).toBe(`609|${RNC}|${YEAR}${M}|2`);

    const acme = r609.lines[0].split("|");
    expect(acme[0]).toBe("Acme Corp");
    expect(acme[1]).toBe("02"); // servicios
    expect(acme[2]).toMatch(new RegExp(`^${YEAR}${M}\\d{2}$`));
    expect(acme[3]).toBe("10000.00");
    expect(acme[4]).toBe("2700.00");

    const globex = r609.lines[1].split("|");
    expect(globex[1]).toBe("03"); // intereses
    expect(globex[4]).toBe("1350.00"); // 27% of 5000

    // The withheld total ties to the ledger: 2700 + 1350 = 4050 credited to 2.1.02.005.
    expect(await balanceOf("2.1.02.005")).toBe(-4050);
  });

  it("honours a treaty rate passed as an explicit withholding", async () => {
    await inTx((c) =>
      new ForeignPayments(c).record({
        companyId, beneficiaryName: "Treaty GmbH", incomeType: "regalias",
        paymentDate: DATE, grossAmount: "1000.00", isrRetained: "100.00", // 10% by treaty
      }),
    );
    const r609 = await generate609(pool, { companyId, rnc: RNC, year: YEAR, month: MONTH });
    expect(r609.lines[0].split("|")[4]).toBe("100.00");
    expect(await balanceOf("2.1.02.005")).toBe(-100);
  });

  it("rejects a non-positive payment and an over-withholding", async () => {
    await expect(
      inTx((c) => new ForeignPayments(c).record({ companyId, beneficiaryName: "X", paymentDate: DATE, grossAmount: "0" })),
    ).rejects.toThrow(ForeignPaymentError);
    await expect(
      inTx((c) =>
        new ForeignPayments(c).record({
          companyId, beneficiaryName: "X", paymentDate: DATE, grossAmount: "100.00", isrRetained: "150.00",
        }),
      ),
    ).rejects.toThrow(ForeignPaymentError);
  });
});
