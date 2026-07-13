import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";

neonConfig.webSocketConstructor = ws;

/**
 * NCF allocation must be gap-free under concurrency: two cashiers ringing up
 * sales at the same instant must never be handed the same comprobante number.
 *
 * This test has to run against a real Postgres. `allocate_ncf` is correct only
 * because its single UPDATE takes a row lock and Postgres re-evaluates the WHERE
 * against the latest committed tuple. A mocked database exercises none of that
 * and would pass no matter how the allocator were written.
 */
describeIntegration("NCF allocation", () => {
  let pool: Pool;
  let companyId: number;

  const RNC = "999000222";

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc = $1`, [RNC]);
    const c = await pool.query(
      `INSERT INTO companies (legal_name, rnc) VALUES ('NCF Test SRL', $1) RETURNING id`,
      [RNC],
    );
    companyId = c.rows[0].id;
  });

  afterAll(async () => {
    if (companyId) await pool.query(`DELETE FROM companies WHERE id = $1`, [companyId]);
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM ncf_sequences WHERE company_id = $1`, [companyId]);
  });

  async function makeSequence(opts: {
    from: number;
    to: number;
    expiry?: string | null;
    active?: boolean;
  }) {
    const r = await pool.query(
      `INSERT INTO ncf_sequences (company_id, ncf_type, range_from, range_to, next_number, expiry_date, is_active)
       VALUES ($1, 'B01', $2, $3, $2, $4, $5) RETURNING id`,
      [companyId, opts.from, opts.to, opts.expiry ?? null, opts.active ?? true],
    );
    return r.rows[0].id as number;
  }

  it("hands out consecutive numbers starting at range_from", async () => {
    const seq = await makeSequence({ from: 1, to: 10 });
    const a = await pool.query(`SELECT allocate_ncf($1) n`, [seq]);
    const b = await pool.query(`SELECT allocate_ncf($1) n`, [seq]);
    expect(Number(a.rows[0].n)).toBe(1);
    expect(Number(b.rows[0].n)).toBe(2);
  });

  it("hands out N distinct, contiguous numbers to N concurrent allocators", async () => {
    const N = 50;
    const seq = await makeSequence({ from: 1000, to: 1000 + N - 1 });

    // Fire all allocations at once. Each is its own transaction, so they contend
    // on the sequence row exactly as concurrent cashiers would.
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        pool.query(`SELECT allocate_ncf($1) n`, [seq]).then((r) => Number(r.rows[0].n)),
      ),
    );

    const unique = new Set(results);
    expect(unique.size).toBe(N); // no duplicates — the row lock held
    expect(Math.min(...results)).toBe(1000);
    expect(Math.max(...results)).toBe(1000 + N - 1);

    // Contiguous: the allocated set is exactly [1000, 1049].
    const sorted = [...results].sort((x, y) => x - y);
    sorted.forEach((v, i) => expect(v).toBe(1000 + i));
  });

  it("returns null once the range is exhausted rather than overrunning it", async () => {
    const seq = await makeSequence({ from: 1, to: 2 });
    await pool.query(`SELECT allocate_ncf($1)`, [seq]);
    await pool.query(`SELECT allocate_ncf($1)`, [seq]);
    const spent = await pool.query(`SELECT allocate_ncf($1) n`, [seq]);
    expect(spent.rows[0].n).toBeNull();

    // next_number parks one past the end; the CHECK constraint permits exactly that.
    const s = await pool.query(`SELECT next_number FROM ncf_sequences WHERE id=$1`, [seq]);
    expect(Number(s.rows[0].next_number)).toBe(3);
  });

  it("refuses to allocate from an expired sequence", async () => {
    const seq = await makeSequence({ from: 1, to: 10, expiry: "2020-01-01" });
    const r = await pool.query(`SELECT allocate_ncf($1) n`, [seq]);
    expect(r.rows[0].n).toBeNull();
  });

  it("refuses to allocate from an inactive sequence", async () => {
    const seq = await makeSequence({ from: 1, to: 10, active: false });
    const r = await pool.query(`SELECT allocate_ncf($1) n`, [seq]);
    expect(r.rows[0].n).toBeNull();
  });

  it("returns the number when its transaction rolls back, leaving no gap", async () => {
    const seq = await makeSequence({ from: 500, to: 510 });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const r = await client.query(`SELECT allocate_ncf($1) n`, [seq]);
      expect(Number(r.rows[0].n)).toBe(500);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }

    // The reservation never committed, so 500 is still on offer. This is why the
    // allocator must be called inside the transaction that persists the document.
    const again = await pool.query(`SELECT allocate_ncf($1) n`, [seq]);
    expect(Number(again.rows[0].n)).toBe(500);
  });
});
