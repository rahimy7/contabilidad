import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { Treasury, TreasuryError } from "../server/treasury/banks";

neonConfig.webSocketConstructor = ws;

describeIntegration("Treasury and bank reconciliation", () => {
  let pool: Pool;
  let companyId: number;
  let bankAccountId: number;
  const RNC = "144000001";
  const YEAR = new Date().getUTCFullYear();
  const MONTH = String(new Date().getUTCMonth() + 1).padStart(2, "0");
  const DATE = `${YEAR}-${MONTH}-10`;
  const STMT = `${YEAR}-${MONTH}-28`;

  // Chart codes the movements book against.
  const BANCOS = "1.1.01.003";
  const CAPITAL = "3.1.01.001";
  const ALQUILERES = "5.2.02.001";
  const COMISIONES = "5.3.01.002";

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(`INSERT INTO companies (legal_name, rnc) VALUES ('Treasury SRL',$1) RETURNING id`, [RNC]);
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
    for (const t of ["bank_transactions", "bank_reconciliations", "bank_accounts", "journal_entries"]) {
      await pool.query(`DELETE FROM ${t} WHERE company_id=$1`, [companyId]);
    }
  }

  beforeEach(async () => {
    await cleanup();
    bankAccountId = await inTx((c) =>
      new Treasury(c).openAccount({ companyId, code: "BCO-001", name: "Cuenta Principal" }),
    );
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

  const balanceOf = async (code: string) => {
    const r = await pool.query(
      `SELECT coalesce(sum(l.debit_func - l.credit_func),0)::text b
         FROM journal_entry_lines l JOIN chart_of_accounts a ON a.id=l.account_id
        WHERE l.company_id=$1 AND a.code=$2`,
      [companyId, code],
    );
    return Number(r.rows[0].b);
  };

  /** Books a deposit, a rent cheque and a bank charge; returns their txn ids. */
  async function threeMovements() {
    return inTx(async (c) => {
      const t = new Treasury(c);
      const deposit = await t.recordMovement({
        companyId, bankAccountId, txnDate: DATE, direction: "in", amount: "10000.00",
        kind: "deposit", counterpartyAccountRef: CAPITAL, memo: "Aporte de capital",
      });
      const rent = await t.recordMovement({
        companyId, bankAccountId, txnDate: DATE, direction: "out", amount: "3000.00",
        kind: "payment", counterpartyAccountRef: ALQUILERES, memo: "Alquiler local",
      });
      const charge = await t.recordMovement({
        companyId, bankAccountId, txnDate: DATE, direction: "out", amount: "150.00",
        kind: "charge", counterpartyAccountRef: COMISIONES, memo: "Comisión mantenimiento",
      });
      return { deposit: deposit.transactionId, rent: rent.transactionId, charge: charge.transactionId };
    });
  }

  it("a bank movement posts a balanced entry, and the bank's total ties to its control account", async () => {
    await threeMovements();

    // Ledger: Bancos holds 10000 − 3000 − 150 = 6850; the other legs balance it.
    expect(await balanceOf(BANCOS)).toBe(6850);
    expect(await balanceOf(ALQUILERES)).toBe(3000);
    expect(await balanceOf(COMISIONES)).toBe(150);
    expect(await balanceOf(CAPITAL)).toBe(-10000);

    // Sum of the bank's own movements equals the ledger balance — the reason the
    // subledger detail exists.
    const book = await pool.query(
      `SELECT coalesce(sum(CASE WHEN direction='in' THEN amount ELSE -amount END),0)::text b
         FROM bank_transactions WHERE company_id=$1 AND bank_account_id=$2`,
      [companyId, bankAccountId],
    );
    expect(Number(book.rows[0].b)).toBe(6850);
  });

  it("reconciles when the cleared total meets the statement, leaving the uncleared cheque outstanding", async () => {
    const { deposit, charge } = await threeMovements();

    // Statement shows the deposit and the charge, but not the 3000 rent cheque.
    const reconId = await inTx((c) =>
      new Treasury(c).startReconciliation(companyId, bankAccountId, STMT, "9850.00"),
    );
    await inTx((c) => new Treasury(c).clear(companyId, reconId, [deposit, charge]));

    const s = await inTx((c) => new Treasury(c).summary(companyId, reconId));
    expect(Number(s.clearedBalance)).toBe(9850); // 10000 − 150
    expect(Number(s.statementBalance)).toBe(9850);
    expect(Number(s.difference)).toBe(0);
    expect(s.reconciled).toBe(true);
    expect(Number(s.bookBalance)).toBe(6850);
    expect(Number(s.depositsInTransit)).toBe(0);
    expect(Number(s.outstandingChecks)).toBe(3000); // the uncleared rent cheque

    // The reconciliation identity closes.
    expect(Number(s.bookBalance) - Number(s.clearedBalance)).toBe(
      Number(s.depositsInTransit) - Number(s.outstandingChecks),
    );

    await inTx((c) => new Treasury(c).complete(companyId, reconId));
    const status = await pool.query(`SELECT status FROM bank_reconciliations WHERE id=$1`, [reconId]);
    expect(status.rows[0].status).toBe("completed");
  });

  it("refuses to complete a reconciliation that does not balance", async () => {
    const { deposit } = await threeMovements();
    const reconId = await inTx((c) =>
      new Treasury(c).startReconciliation(companyId, bankAccountId, STMT, "9850.00"),
    );
    // Clear only the deposit: cleared 10000 ≠ statement 9850.
    await inTx((c) => new Treasury(c).clear(companyId, reconId, [deposit]));
    await expect(inTx((c) => new Treasury(c).complete(companyId, reconId))).rejects.toThrow(TreasuryError);
  });

  it("rejects a negative movement", async () => {
    await expect(
      inTx((c) =>
        new Treasury(c).recordMovement({
          companyId, bankAccountId, txnDate: DATE, direction: "in", amount: "-5.00",
          counterpartyAccountRef: CAPITAL,
        }),
      ),
    ).rejects.toThrow(TreasuryError);
  });

  it("refuses to clear a movement from a different bank account", async () => {
    const { deposit } = await threeMovements();
    const otherAccount = await inTx((c) =>
      new Treasury(c).openAccount({ companyId, code: "BCO-002", name: "Cuenta Secundaria" }),
    );
    const reconId = await inTx((c) =>
      new Treasury(c).startReconciliation(companyId, otherAccount, STMT, "0.00"),
    );
    await expect(inTx((c) => new Treasury(c).clear(companyId, reconId, [deposit]))).rejects.toThrow(TreasuryError);
  });

  it("refuses to clear a movement dated after the statement", async () => {
    const late = await inTx((c) =>
      new Treasury(c).recordMovement({
        companyId, bankAccountId, txnDate: `${YEAR}-${MONTH}-10`, direction: "in", amount: "100.00",
        counterpartyAccountRef: CAPITAL,
      }),
    );
    // Statement dated before the movement.
    const reconId = await inTx((c) =>
      new Treasury(c).startReconciliation(companyId, bankAccountId, `${YEAR}-${MONTH}-05`, "0.00"),
    );
    await expect(
      inTx((c) => new Treasury(c).clear(companyId, reconId, [late.transactionId])),
    ).rejects.toThrow(TreasuryError);
  });
});
