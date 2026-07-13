import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";

neonConfig.webSocketConstructor = ws;

/**
 * Row-level security is the last line of defence between two Dominican
 * taxpayers' books. These tests drive it the way the server does — a
 * transaction-local GUC plus `SET LOCAL ROLE app_rls` — and then try to break
 * out of it.
 *
 * Deliberately exercised on a pool with a single connection, so every test
 * reuses the same physical backend. That is precisely the condition under which
 * a session-level `SET` would leak one tenant's scope into the next request.
 */
describeIntegration("tenant isolation (row-level security)", () => {
  let pool: Pool;
  let companyA: number;
  let companyB: number;

  const RNC_A = "999000444";
  const RNC_B = "999000555";

  beforeAll(async () => {
    // max: 1 guarantees connection reuse across every query below.
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });

    for (const rnc of [RNC_A, RNC_B]) {
      await pool.query(`DELETE FROM companies WHERE rnc = $1`, [rnc]);
    }
    const a = await pool.query(
      `INSERT INTO companies (legal_name, rnc) VALUES ('Alpha SRL', $1) RETURNING id`,
      [RNC_A],
    );
    const b = await pool.query(
      `INSERT INTO companies (legal_name, rnc) VALUES ('Beta SRL', $1) RETURNING id`,
      [RNC_B],
    );
    companyA = a.rows[0].id;
    companyB = b.rows[0].id;

    // One cost centre each, written as the owner (RLS bypassed).
    await pool.query(
      `INSERT INTO cost_centers (company_id, code, name) VALUES ($1,'CC-A','Alpha CC')`,
      [companyA],
    );
    await pool.query(
      `INSERT INTO cost_centers (company_id, code, name) VALUES ($1,'CC-B','Beta CC')`,
      [companyB],
    );
  });

  afterAll(async () => {
    for (const id of [companyA, companyB]) {
      if (id) await pool.query(`DELETE FROM companies WHERE id = $1`, [id]);
    }
    await pool.end();
  });

  /** Mirrors server/tenant-context.ts `withCompany`. */
  async function asTenant<T>(
    companyId: number,
    fn: (q: (text: string, params?: unknown[]) => Promise<any>) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.company_id', $1, true)`, [String(companyId)]);
      await client.query("SET LOCAL ROLE app_rls");
      const out = await fn((t, p) => client.query(t, p as any[]));
      await client.query("COMMIT");
      return out;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  it("the app role really loses BYPASSRLS", async () => {
    const who = await asTenant(companyA, (q) =>
      q(`SELECT current_user, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass`),
    );
    expect(who.rows[0].current_user).toBe("app_rls");
    expect(who.rows[0].bypass).toBe(false);
  });

  it("a tenant sees only its own rows", async () => {
    const seenByA = await asTenant(companyA, (q) => q(`SELECT code FROM cost_centers ORDER BY code`));
    expect(seenByA.rows.map((r: any) => r.code)).toEqual(["CC-A"]);

    const seenByB = await asTenant(companyB, (q) => q(`SELECT code FROM cost_centers ORDER BY code`));
    expect(seenByB.rows.map((r: any) => r.code)).toEqual(["CC-B"]);
  });

  it("an explicit WHERE naming another tenant still returns nothing", async () => {
    // The query is not wrong; the policy is what stops it.
    const r = await asTenant(companyA, (q) =>
      q(`SELECT code FROM cost_centers WHERE company_id = $1`, [companyB]),
    );
    expect(r.rows).toHaveLength(0);
  });

  it("a tenant sees only its own company row", async () => {
    const r = await asTenant(companyA, (q) => q(`SELECT id FROM companies`));
    expect(r.rows.map((x: any) => x.id)).toEqual([companyA]);
  });

  it("a tenant cannot write a row belonging to another tenant", async () => {
    await expect(
      asTenant(companyA, (q) =>
        q(`INSERT INTO cost_centers (company_id, code, name) VALUES ($1,'CC-X','stolen')`, [
          companyB,
        ]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("a tenant cannot reassign its own row to another tenant", async () => {
    await expect(
      asTenant(companyA, (q) =>
        q(`UPDATE cost_centers SET company_id = $1 WHERE code = 'CC-A'`, [companyB]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("scope does not leak into the next transaction on the same connection", async () => {
    // Same physical connection (max: 1). If `SET` were used instead of `SET LOCAL`,
    // this second block would still be scoped to companyA.
    await asTenant(companyA, (q) => q(`SELECT 1`));

    const client = await pool.connect();
    try {
      const who = await client.query(`SELECT current_user`);
      expect(who.rows[0].current_user).toBe("neondb_owner"); // role reverted at COMMIT

      // The raw GUC reverts to '' rather than NULL — that is exactly why the
      // policies go through current_company_id(), which normalises it.
      const raw = await client.query(`SELECT current_setting('app.company_id', true) AS c`);
      expect(raw.rows[0].c).toBe("");
      const norm = await client.query(`SELECT current_company_id() AS c`);
      expect(norm.rows[0].c).toBeNull();
    } finally {
      client.release();
    }
  });

  it("fails closed: with no tenant established, the app role sees nothing", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE app_rls"); // GUC deliberately not set
      const r = await client.query(`SELECT count(*)::int c FROM cost_centers`);
      expect(r.rows[0].c).toBe(0);
      await client.query("COMMIT");
    } finally {
      client.release();
    }
  });

  it("the owner still bypasses RLS, so migrations and seeds keep working", async () => {
    const r = await pool.query(`SELECT count(*)::int c FROM cost_centers WHERE company_id = ANY($1)`, [
      [companyA, companyB],
    ]);
    expect(r.rows[0].c).toBe(2);
  });
});
