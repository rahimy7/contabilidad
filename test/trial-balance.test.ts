import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";

neonConfig.webSocketConstructor = ws;

/**
 * A golden trial balance over the seeded Dominican chart of accounts.
 *
 * This exercises the seeder and the ledger together: if `seedCompanyDefaults`
 * marks a roll-up account as postable, or gets a contra account's normal side
 * backwards, the postings below fail or the balance comes out wrong. It is also
 * the reference the incremental balance trigger will be checked against when it
 * lands.
 */
describeIntegration("trial balance over the seeded chart of accounts", () => {
  let pool: Pool;
  let companyId: number;
  let periodId: number;
  const acct: Record<string, number> = {};

  const RNC = "999000333";
  const YEAR = new Date().getUTCFullYear();
  const MONTH = new Date().getUTCMonth() + 1;
  const ENTRY_DATE = `${YEAR}-${String(MONTH).padStart(2, "0")}-15`;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc = $1`, [RNC]);

    const c = await pool.query(
      `INSERT INTO companies (legal_name, rnc) VALUES ('Golden SRL', $1) RETURNING id`,
      [RNC],
    );
    companyId = c.rows[0].id;

    await seedCompanyDefaults(pool, companyId);

    const p = await pool.query(
      `SELECT id FROM accounting_periods WHERE company_id=$1 AND fiscal_year=$2 AND period_no=$3`,
      [companyId, YEAR, MONTH],
    );
    periodId = p.rows[0].id;

    const codes = [
      "1.1.01.001", // Caja general
      "1.1.03.001", // Inventario
      "2.1.02.001", // ITBIS por pagar
      "4.1.01.001", // Ventas de mercancías
      "5.1.01.001", // Costo de mercancías vendidas
      "2.1.01.001", // Proveedores
      "1.1.04.001", // ITBIS adelantado
    ];
    const rows = await pool.query(
      `SELECT code, id FROM chart_of_accounts WHERE company_id=$1 AND code = ANY($2)`,
      [companyId, codes],
    );
    for (const r of rows.rows) acct[r.code] = r.id;
    expect(Object.keys(acct)).toHaveLength(codes.length);
  });

  afterAll(async () => {
    if (companyId) {
      await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    await pool.end();
  });

  async function post(
    sourceId: string,
    sourceEvent: string,
    lines: Array<[code: string, debit: string, credit: string]>,
  ) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const e = await client.query(
        `INSERT INTO journal_entries (company_id, period_id, entry_date, currency, status, source_type, source_id, source_event)
         VALUES ($1,$2,$3,'DOP','posted','test',$4,$5) RETURNING id`,
        [companyId, periodId, ENTRY_DATE, sourceId, sourceEvent],
      );
      const entryId = e.rows[0].id;
      let n = 1;
      for (const [code, debit, credit] of lines) {
        await client.query(
          `INSERT INTO journal_entry_lines
             (entry_id, company_id, line_no, account_id, debit, credit, currency, fx_rate, debit_func, credit_func)
           VALUES ($1,$2,$3,$4,$5,$6,'DOP',1,$5,$6)`,
          [entryId, companyId, n++, acct[code], debit, credit],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  it("posts a month of sales and purchases that balance", async () => {
    // A cash sale of 1,000 + 18% ITBIS.
    await post("order-1", "invoice", [
      ["1.1.01.001", "1180.00", "0"],
      ["4.1.01.001", "0", "1000.00"],
      ["2.1.02.001", "0", "180.00"],
    ]);
    // Its cost of goods sold.
    await post("order-1", "cogs", [
      ["5.1.01.001", "600.00", "0"],
      ["1.1.03.001", "0", "600.00"],
    ]);
    // A credit purchase of 2,000 + 18% ITBIS adelantado.
    await post("po-1", "invoice", [
      ["1.1.03.001", "2000.00", "0"],
      ["1.1.04.001", "360.00", "0"],
      ["2.1.01.001", "0", "2360.00"],
    ]);

    const n = await pool.query(
      `SELECT count(*)::int c FROM journal_entries WHERE company_id=$1 AND status='posted'`,
      [companyId],
    );
    expect(n.rows[0].c).toBe(3);
  });

  it("produces a trial balance where total debits equal total credits", async () => {
    const tb = await pool.query(
      `SELECT coalesce(sum(l.debit_func),0) d, coalesce(sum(l.credit_func),0) c
         FROM journal_entry_lines l
         JOIN journal_entries e ON e.id = l.entry_id
        WHERE l.company_id=$1 AND e.status='posted'`,
      [companyId],
    );
    expect(tb.rows[0].d).toBe(tb.rows[0].c);
    expect(Number(tb.rows[0].d)).toBe(1180 + 600 + 2360);
  });

  it("produces the expected balance per account", async () => {
    const rows = await pool.query(
      `SELECT a.code, sum(l.debit_func) - sum(l.credit_func) AS balance
         FROM journal_entry_lines l
         JOIN journal_entries e ON e.id = l.entry_id
         JOIN chart_of_accounts a ON a.id = l.account_id
        WHERE l.company_id=$1 AND e.status='posted'
        GROUP BY a.code ORDER BY a.code`,
      [companyId],
    );
    const bal = Object.fromEntries(rows.rows.map((r) => [r.code, Number(r.balance)]));

    expect(bal["1.1.01.001"]).toBe(1180); // Caja: debit balance
    expect(bal["1.1.03.001"]).toBe(1400); // Inventario: 2000 in, 600 out
    expect(bal["1.1.04.001"]).toBe(360); // ITBIS adelantado
    expect(bal["5.1.01.001"]).toBe(600); // CMV
    expect(bal["4.1.01.001"]).toBe(-1000); // Ventas: credit balance, so negative
    expect(bal["2.1.02.001"]).toBe(-180); // ITBIS por pagar
    expect(bal["2.1.01.001"]).toBe(-2360); // Proveedores

    // Every account, summed, nets to zero. That is double entry.
    const total = Object.values(bal).reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });

  it("rebuild_account_period_balances reproduces the balances from the lines", async () => {
    await pool.query(`SELECT rebuild_account_period_balances($1, $2)`, [companyId, periodId]);

    const cached = await pool.query(
      `SELECT a.code, b.closing_func FROM account_period_balances b
         JOIN chart_of_accounts a ON a.id = b.account_id
        WHERE b.company_id=$1 ORDER BY a.code`,
      [companyId],
    );
    const fromLines = await pool.query(
      `SELECT a.code, sum(l.debit_func) - sum(l.credit_func) AS balance
         FROM journal_entry_lines l
         JOIN journal_entries e ON e.id = l.entry_id
         JOIN chart_of_accounts a ON a.id = l.account_id
        WHERE l.company_id=$1 AND e.status='posted'
        GROUP BY a.code ORDER BY a.code`,
      [companyId],
    );

    expect(cached.rows).toHaveLength(fromLines.rows.length);
    cached.rows.forEach((row, i) => {
      expect(row.code).toBe(fromLines.rows[i].code);
      expect(Number(row.closing_func)).toBe(Number(fromLines.rows[i].balance));
    });
  });

  it("a reversing entry nets every account back to zero", async () => {
    // Reverse the cash sale by swapping debits and credits.
    await post("order-1", "invoice-reversal", [
      ["1.1.01.001", "0", "1180.00"],
      ["4.1.01.001", "1000.00", "0"],
      ["2.1.02.001", "180.00", "0"],
    ]);

    const rows = await pool.query(
      `SELECT sum(l.debit_func) - sum(l.credit_func) AS balance
         FROM journal_entry_lines l
         JOIN journal_entries e ON e.id = l.entry_id
        WHERE l.company_id=$1 AND e.status='posted'
          AND l.account_id = ANY($2)`,
      [companyId, [acct["1.1.01.001"], acct["4.1.01.001"], acct["2.1.02.001"]]],
    );
    expect(Number(rows.rows[0].balance)).toBe(0);
  });
});
