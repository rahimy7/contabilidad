import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { PostingEngine } from "../server/accounting/posting-engine";
import { Consolidation } from "../server/consolidation/consolidate";

neonConfig.webSocketConstructor = ws;

describeIntegration("Consolidation with a foreign-currency subsidiary", () => {
  let pool: Pool;
  let groupId: number;
  let local: number; // keeps DOP, the group's currency
  let foreign: number; // keeps USD
  const RNC_L = "160000001";
  const RNC_F = "160000002";
  const YEAR = new Date().getUTCFullYear();
  const M = String(new Date().getUTCMonth() + 1).padStart(2, "0");
  const DATE = `${YEAR}-${M}-04`;

  const CAJA = "1.1.01.001";
  const VENTAS = "4.1.01.001";
  const CTA = "3.1.02.003";

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc = ANY($1)`, [[RNC_L, RNC_F]]);
    await pool.query(`DELETE FROM groups WHERE name='Grupo FX Test'`);

    const g = await pool.query(`INSERT INTO groups (name, base_currency) VALUES ('Grupo FX Test','DOP') RETURNING id`);
    groupId = g.rows[0].id;

    local = await mkCompany("Matriz DOP SRL", RNC_L, "DOP");
    foreign = await mkCompany("Filial USD Inc", RNC_F, "USD");

    // Matriz: a cash sale of 1,000 DOP.
    await post(local, "DOP", [
      { accountCode: CAJA, debit: "1000" },
      { accountCode: VENTAS, credit: "1000" },
    ]);
    // Subsidiary: a cash sale of 100 USD — its books are kept in dollars.
    await post(foreign, "USD", [
      { accountCode: CAJA, debit: "100" },
      { accountCode: VENTAS, credit: "100" },
    ]);

    for (const id of [local, foreign]) {
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
    for (const id of [local, foreign]) {
      if (id) await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [id]);
    }
    await pool.query(`DELETE FROM companies WHERE rnc = ANY($1)`, [[RNC_L, RNC_F]]);
    if (groupId) await pool.query(`DELETE FROM groups WHERE id=$1`, [groupId]);
    await pool.end();
  });

  async function mkCompany(name: string, rnc: string, currency: string): Promise<number> {
    const c = await pool.query(
      `INSERT INTO companies (legal_name, rnc, group_id, functional_currency) VALUES ($1,$2,$3,$4) RETURNING id`,
      [name, rnc, groupId, currency],
    );
    const id = c.rows[0].id;
    await seedCompanyDefaults(pool, id);
    return id;
  }

  async function post(companyId: number, currency: string, lines: any[]) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await new PostingEngine(client).postManual({ companyId, entryDate: DATE, currency, memo: "test", lines });
      await client.query("COMMIT");
    } finally {
      client.release();
    }
  }

  const lineOf = (res: any, code: string) => res.lines.find((l: any) => l.account_code === code);

  it("translates the balance sheet at closing and the income statement at average, balancing with a CTA", async () => {
    // USD/DOP: 60 at the close, 58 on average over the period.
    const { runId } = await new Consolidation(pool).run({
      groupId,
      fiscalYear: YEAR,
      rates: [{ companyId: foreign, currency: "USD", closingRate: "60", averageRate: "58" }],
    });
    const res = await new Consolidation(pool).getRun(runId);

    // Cash is a balance-sheet account → closing rate: 1000 + (100 × 60) = 7000.
    expect(Number(lineOf(res, CAJA).debit)).toBe(7000);
    // Sales is an income account → average rate: 1000 + (100 × 58) = 6800.
    expect(Number(lineOf(res, VENTAS).credit)).toBe(6800);

    // The 200 the two rates disagree by is the translation adjustment, in equity.
    const cta = lineOf(res, CTA);
    expect(cta.account_type).toBe("equity");
    expect(Number(cta.credit)).toBe(200);

    // And with it, the consolidated trial balance balances.
    expect(Number(res.totalDebit)).toBe(7000);
    expect(Number(res.totalCredit)).toBe(7000);
    expect(res.balanced).toBe(true);

    // The rates are frozen with the run, so the statement is reproducible.
    const rates = await pool.query(
      `SELECT company_id, closing_rate::text c, average_rate::text a FROM consolidation_rates WHERE run_id=$1 AND company_id=$2`,
      [runId, foreign],
    );
    expect(Number(rates.rows[0].c)).toBe(60);
    expect(Number(rates.rows[0].a)).toBe(58);
  });

  it("a single-currency group needs no adjustment at all", async () => {
    // No rates given → every member translates at 1, and nothing to reconcile.
    const { runId } = await new Consolidation(pool).run({ groupId, fiscalYear: YEAR });
    const res = await new Consolidation(pool).getRun(runId);

    // Cash 1000 + 100 (untranslated), sales the same. No CTA line is written.
    expect(Number(lineOf(res, CAJA).debit)).toBe(1100);
    expect(lineOf(res, CTA)).toBeUndefined();
    expect(res.balanced).toBe(true);
  });
});
