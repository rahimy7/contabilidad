import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { FixedAssets, FixedAssetError } from "../server/modules/fixed-assets";

neonConfig.webSocketConstructor = ws;

describeIntegration("fixed assets and depreciation", () => {
  let pool: Pool;
  let companyId: number;
  const YEAR = 2031;
  const RNC = "144000001";

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(`INSERT INTO companies (legal_name, rnc) VALUES ('FA SRL',$1) RETURNING id`, [RNC]);
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);
    for (let m = 1; m <= 12; m++) {
      const start = `${YEAR}-${String(m).padStart(2, "0")}-01`;
      const end = new Date(Date.UTC(YEAR, m, 0)).toISOString().slice(0, 10);
      await pool.query(
        `INSERT INTO accounting_periods (company_id, fiscal_year, period_no, start_date, end_date, status)
         VALUES ($1,$2,$3,$4,$5,'open') ON CONFLICT DO NOTHING`,
        [companyId, YEAR, m, start, end],
      );
    }
  });

  afterAll(async () => {
    if (companyId) {
      await pool.query(`DELETE FROM depreciation_entries WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM fixed_assets WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM depreciation_entries WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM fixed_assets WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId]);
  });

  const balanceOf = async (code: string) => {
    const r = await pool.query(
      `SELECT coalesce(sum(l.debit_func - l.credit_func),0)::text b
         FROM journal_entry_lines l JOIN chart_of_accounts a ON a.id=l.account_id
        WHERE l.company_id=$1 AND a.code=$2`,
      [companyId, code],
    );
    return Number(r.rows[0].b);
  };

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

  it("computes the straight-line monthly charge", () => {
    const fa = new FixedAssets({} as any);
    // (12000 − 0) / 24 = 500/month.
    expect(fa.monthlyCharge("12000", "0", 24, "0")).toBe("500.0000");
    // With residual: (12000 − 2400) / 24 = 400/month.
    expect(fa.monthlyCharge("12000", "2400", 24, "0")).toBe("400.0000");
    // Nothing left once accumulated hits the base.
    expect(fa.monthlyCharge("12000", "0", 24, "12000")).toBe("0");
  });

  it("posts monthly depreciation: Dr expense / Cr accumulated", async () => {
    await inTx((c) =>
      new FixedAssets(c).register({
        companyId,
        code: "EQ-001",
        name: "Equipo",
        acquisitionDate: `${YEAR}-01-05`,
        cost: "12000.00",
        usefulLifeMonths: 24,
      }),
    );
    const res = await inTx((c) => new FixedAssets(c).runDepreciation(companyId, YEAR, 1, `${YEAR}-01-31`));
    expect(res.charged).toBe(1);
    expect(res.total).toBe("500");
    expect(await balanceOf("5.2.03.001")).toBe(500); // gasto de depreciación
    expect(await balanceOf("1.2.01.003")).toBe(-500); // depreciación acumulada (contra-activo)

    const asset = await pool.query(`SELECT accumulated_depreciation::text FROM fixed_assets WHERE company_id=$1`, [companyId]);
    expect(Number(asset.rows[0].accumulated_depreciation)).toBe(500);
  });

  it("does not depreciate the same month twice", async () => {
    await inTx((c) =>
      new FixedAssets(c).register({ companyId, code: "EQ-002", name: "Equipo", acquisitionDate: `${YEAR}-01-05`, cost: "12000.00", usefulLifeMonths: 24 }),
    );
    await inTx((c) => new FixedAssets(c).runDepreciation(companyId, YEAR, 1, `${YEAR}-01-31`));
    const again = await inTx((c) => new FixedAssets(c).runDepreciation(companyId, YEAR, 1, `${YEAR}-01-31`));
    expect(again.charged).toBe(0); // already charged
    expect(await balanceOf("5.2.03.001")).toBe(500); // not 1000
  });

  it("the final charge lands accumulated exactly on the base, never over", async () => {
    // A cost that does not divide evenly: 10000 / 3 = 3333.33…
    await inTx((c) =>
      new FixedAssets(c).register({ companyId, code: "EQ-003", name: "Equipo", acquisitionDate: `${YEAR}-01-05`, cost: "10000.00", usefulLifeMonths: 3 }),
    );
    await inTx((c) => new FixedAssets(c).runDepreciation(companyId, YEAR, 1, `${YEAR}-01-31`));
    await inTx((c) => new FixedAssets(c).runDepreciation(companyId, YEAR, 2, `${YEAR}-02-28`));
    await inTx((c) => new FixedAssets(c).runDepreciation(companyId, YEAR, 3, `${YEAR}-03-31`));

    const asset = await pool.query(`SELECT accumulated_depreciation::text, status FROM fixed_assets WHERE company_id=$1`, [companyId]);
    expect(Number(asset.rows[0].accumulated_depreciation)).toBe(10000); // exactly, not 9999.99
    expect(asset.rows[0].status).toBe("fully_depreciated");
    expect(await balanceOf("1.2.01.003")).toBe(-10000);
  });

  it("stops charging a fully depreciated asset", async () => {
    await inTx((c) =>
      new FixedAssets(c).register({ companyId, code: "EQ-004", name: "Equipo", acquisitionDate: `${YEAR}-01-05`, cost: "600.00", usefulLifeMonths: 2 }),
    );
    await inTx((c) => new FixedAssets(c).runDepreciation(companyId, YEAR, 1, `${YEAR}-01-31`));
    await inTx((c) => new FixedAssets(c).runDepreciation(companyId, YEAR, 2, `${YEAR}-02-28`));
    const third = await inTx((c) => new FixedAssets(c).runDepreciation(companyId, YEAR, 3, `${YEAR}-03-31`));
    expect(third.charged).toBe(0);
    expect(await balanceOf("1.2.01.003")).toBe(-600);
  });

  it("rejects an asset whose residual exceeds its cost", async () => {
    await expect(
      inTx((c) =>
        new FixedAssets(c).register({ companyId, code: "BAD", name: "x", acquisitionDate: `${YEAR}-01-05`, cost: "100.00", residualValue: "200.00", usefulLifeMonths: 12 }),
      ),
    ).rejects.toThrow(FixedAssetError);
  });
});
