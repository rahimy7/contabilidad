import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { PostingEngine } from "../server/accounting/posting-engine";
import { Consolidation } from "../server/consolidation/consolidate";

neonConfig.webSocketConstructor = ws;

describeIntegration("Group consolidation", () => {
  let pool: Pool;
  let groupId: number;
  let companyA: number;
  let companyB: number;
  const RNC_A = "153000001";
  const RNC_B = "153000002";
  const YEAR = new Date().getUTCFullYear();
  const M = String(new Date().getUTCMonth() + 1).padStart(2, "0");
  const DATE = `${YEAR}-${M}-11`;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc = ANY($1)`, [[RNC_A, RNC_B]]);
    await pool.query(`DELETE FROM groups WHERE name='Grupo Test'`);

    const g = await pool.query(`INSERT INTO groups (name, base_currency) VALUES ('Grupo Test','DOP') RETURNING id`);
    groupId = g.rows[0].id;

    companyA = await mkCompany("Filial A SRL", RNC_A);
    companyB = await mkCompany("Filial B SRL", RNC_B);

    // Company A: a cash sale of 1000.
    await post(companyA, [
      { accountCode: "1.1.01.001", debit: "1000" },
      { accountCode: "4.1.01.001", credit: "1000" },
    ]);
    // Company B: a cash sale of 1000, then pays 500 rent.
    await post(companyB, [
      { accountCode: "1.1.01.001", debit: "1000" },
      { accountCode: "4.1.01.001", credit: "1000" },
    ]);
    await post(companyB, [
      { accountCode: "5.2.02.001", debit: "500" },
      { accountCode: "1.1.01.001", credit: "500" },
    ]);
  });

  afterAll(async () => {
    if (groupId) {
      await pool.query(`DELETE FROM consolidation_runs WHERE group_id=$1`, [groupId]);
      await pool.query(`DELETE FROM company_consolidation_map WHERE group_id=$1`, [groupId]);
    }
    for (const id of [companyA, companyB]) {
      if (id) await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [id]);
    }
    await pool.query(`DELETE FROM companies WHERE rnc = ANY($1)`, [[RNC_A, RNC_B]]);
    if (groupId) await pool.query(`DELETE FROM groups WHERE id=$1`, [groupId]);
    await pool.end();
  });

  async function mkCompany(name: string, rnc: string): Promise<number> {
    const c = await pool.query(`INSERT INTO companies (legal_name, rnc, group_id) VALUES ($1,$2,$3) RETURNING id`, [name, rnc, groupId]);
    const id = c.rows[0].id;
    await seedCompanyDefaults(pool, id);
    return id;
  }

  async function post(companyId: number, lines: any[]) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await new PostingEngine(client).postManual({ companyId, entryDate: DATE, memo: "test", lines });
      await client.query("COMMIT");
    } finally {
      client.release();
    }
  }

  async function setMap(companyId: number, pct: string, method = "full") {
    await pool.query(
      `INSERT INTO company_consolidation_map (group_id, company_id, ownership_pct, consol_method)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (group_id, company_id) DO UPDATE SET ownership_pct=$3, consol_method=$4`,
      [groupId, companyId, pct, method],
    );
  }

  const lineOf = (res: any, code: string) => res.lines.find((l: any) => l.account_code === code);

  it("consolidates two wholly-owned companies into a balanced trial balance", async () => {
    await setMap(companyA, "1.0");
    await setMap(companyB, "1.0");

    const { runId, memberCount } = await new Consolidation(pool).run({ groupId, fiscalYear: YEAR });
    expect(memberCount).toBe(2);
    const res = await new Consolidation(pool).getRun(runId);

    // Caja: A 1000 + B (1000 − 500) = 1500. Ventas: 2000. Alquileres: 500.
    expect(Number(lineOf(res, "1.1.01.001").debit)).toBe(1500);
    expect(Number(lineOf(res, "4.1.01.001").credit)).toBe(2000);
    expect(Number(lineOf(res, "5.2.02.001").debit)).toBe(500);

    // The consolidated trial balance balances: 2000 = 2000.
    expect(Number(res.totalDebit)).toBe(2000);
    expect(Number(res.totalCredit)).toBe(2000);
    expect(res.balanced).toBe(true);
  });

  it("weights each member by ownership percentage", async () => {
    await setMap(companyA, "1.0");
    await setMap(companyB, "0.5"); // 50%-owned

    const { runId } = await new Consolidation(pool).run({ groupId, fiscalYear: YEAR });
    const res = await new Consolidation(pool).getRun(runId);

    // Caja: 1000 + 0.5×500 = 1250. Ventas: 1000 + 0.5×1000 = 1500. Alquileres: 0.5×500 = 250.
    expect(Number(lineOf(res, "1.1.01.001").debit)).toBe(1250);
    expect(Number(lineOf(res, "4.1.01.001").credit)).toBe(1500);
    expect(Number(lineOf(res, "5.2.02.001").debit)).toBe(250);
    expect(res.balanced).toBe(true); // half of a balanced set is still balanced
  });

  it("excludes an equity-method member from line aggregation", async () => {
    await setMap(companyA, "1.0", "full");
    await setMap(companyB, "1.0", "equity");

    const { runId, memberCount } = await new Consolidation(pool).run({ groupId, fiscalYear: YEAR });
    expect(memberCount).toBe(1); // only A is consolidated line by line
    const res = await new Consolidation(pool).getRun(runId);
    expect(Number(lineOf(res, "1.1.01.001").debit)).toBe(1000); // only A's cash
    expect(Number(lineOf(res, "4.1.01.001").credit)).toBe(1000);
    expect(lineOf(res, "5.2.02.001")).toBeUndefined(); // B's rent excluded
  });
});
