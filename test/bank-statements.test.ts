import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { Treasury } from "../server/treasury/banks";
import {
  importBankStatement, autoMatchStatement, parseCsvLines,
} from "../server/services/bank-statements";

neonConfig.webSocketConstructor = ws;

/**
 * Bank-statement import + auto-matching.
 *
 * Cubre los cuatro escenarios de confianza (exact/high/medium/ambiguous/none)
 * y la deduplicación por hash.
 */
describeIntegration("bank statements — import + auto-match", () => {
  let pool: Pool;
  let companyId: number;
  let bankAccountId: number;
  const RNC = "146000902";

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    await pool.query(`DELETE FROM companies WHERE rnc = $1`, [RNC]);
    const c = await pool.query(
      `INSERT INTO companies (legal_name, rnc) VALUES ('Bank Test SRL', $1) RETURNING id`,
      [RNC],
    );
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);

    const client = await pool.connect();
    try {
      bankAccountId = await new Treasury(client).openAccount({
        companyId, code: "BHD-001", name: "BHD Corriente",
        bankName: "BHD León", accountNumber: "1234567890",
      });
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (companyId) {
      await pool.query(`DELETE FROM bank_statement_lines WHERE company_id = $1`, [companyId]);
      await pool.query(`DELETE FROM bank_statement_imports WHERE company_id = $1`, [companyId]);
      await pool.query(`DELETE FROM bank_transactions WHERE company_id = $1`, [companyId]);
      await pool.query(`DELETE FROM bank_reconciliations WHERE company_id = $1`, [companyId]);
      await pool.query(`DELETE FROM bank_accounts WHERE company_id = $1`, [companyId]);
      await pool.query(`DELETE FROM journal_entries WHERE company_id = $1`, [companyId]);
      await pool.query(`DELETE FROM account_period_balances WHERE company_id = $1`, [companyId]);
      await pool.query(`DELETE FROM companies WHERE id = $1`, [companyId]);
    }
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM bank_statement_lines WHERE company_id = $1`, [companyId]);
    await pool.query(`DELETE FROM bank_statement_imports WHERE company_id = $1`, [companyId]);
    await pool.query(`DELETE FROM bank_transactions WHERE company_id = $1`, [companyId]);
  });

  async function recordMovement(txnDate: string, direction: "in" | "out", amount: string, reference?: string) {
    const client = await pool.connect();
    try {
      const t = await new Treasury(client).recordMovement({
        companyId, bankAccountId, txnDate, direction, amount,
        counterpartyAccountRef: "1.1.01.001",
        memo: `Test ${direction} ${amount}`,
        reference,
      });
      return t.transactionId;
    } finally {
      client.release();
    }
  }

  it("importa líneas y persiste el header con contadores", async () => {
    const result = await importBankStatement(pool, {
      companyId, bankAccountId,
      periodStart: "2026-06-01", periodEnd: "2026-06-30",
      openingBalance: 0, closingBalance: 500,
      importedBy: 1,
      fileName: "extracto-junio.csv",
      lines: [
        { txnDate: "2026-06-02", amount: 1000, direction: "in", description: "Depósito", bankReference: "DEP-001" },
        { txnDate: "2026-06-05", amount: 500, direction: "out", description: "Retiro" },
      ],
    });
    expect(result.totalLines).toBe(2);
    expect(result.importedLines).toBe(2);
    expect(result.duplicateLines).toBe(0);
  });

  it("deduplica al reimportar el mismo archivo", async () => {
    const lines = [
      { txnDate: "2026-06-10", amount: 250, direction: "in" as const, description: "Depósito ATM" },
    ];
    const r1 = await importBankStatement(pool, {
      companyId, bankAccountId,
      periodStart: "2026-06-01", periodEnd: "2026-06-30",
      importedBy: 1, lines,
    });
    expect(r1.importedLines).toBe(1);

    const r2 = await importBankStatement(pool, {
      companyId, bankAccountId,
      periodStart: "2026-06-01", periodEnd: "2026-06-30",
      importedBy: 1, lines,
    });
    expect(r2.importedLines).toBe(0);
    expect(r2.duplicateLines).toBe(1);
  });

  it("match EXACT cuando fecha + monto + dirección + referencia coinciden", async () => {
    await recordMovement("2026-06-15", "in", "1500.0000", "REF-EXACT");
    await importBankStatement(pool, {
      companyId, bankAccountId,
      periodStart: "2026-06-01", periodEnd: "2026-06-30",
      importedBy: 1,
      lines: [{ txnDate: "2026-06-15", amount: 1500, direction: "in", bankReference: "REF-EXACT" }],
    });
    const stats = await autoMatchStatement(pool, { companyId, bankAccountId, matchedBy: 1 });
    expect(stats.matched).toBe(1);
    expect(stats.matchedExact).toBe(1);
  });

  it("match HIGH cuando fecha + monto + dirección pero sin referencia", async () => {
    await recordMovement("2026-06-16", "out", "800.0000");
    await importBankStatement(pool, {
      companyId, bankAccountId,
      periodStart: "2026-06-01", periodEnd: "2026-06-30",
      importedBy: 1,
      lines: [{ txnDate: "2026-06-16", amount: 800, direction: "out", description: "Pago" }],
    });
    const stats = await autoMatchStatement(pool, { companyId, bankAccountId, matchedBy: 1 });
    expect(stats.matched).toBe(1);
    expect(stats.matchedHigh).toBe(1);
  });

  it("match MEDIUM cuando fecha difiere ±3 días", async () => {
    await recordMovement("2026-06-20", "in", "2500.0000");
    await importBankStatement(pool, {
      companyId, bankAccountId,
      periodStart: "2026-06-01", periodEnd: "2026-06-30",
      importedBy: 1,
      lines: [{ txnDate: "2026-06-22", amount: 2500, direction: "in", description: "Depósito tardío" }],
    });
    const stats = await autoMatchStatement(pool, { companyId, bankAccountId, matchedBy: 1 });
    expect(stats.matched).toBe(1);
    expect(stats.matchedMedium).toBe(1);
  });

  it("marca AMBIGUOUS cuando hay múltiples candidatos", async () => {
    await recordMovement("2026-06-25", "in", "100.0000");
    await recordMovement("2026-06-25", "in", "100.0000");
    await importBankStatement(pool, {
      companyId, bankAccountId,
      periodStart: "2026-06-01", periodEnd: "2026-06-30",
      importedBy: 1,
      lines: [{ txnDate: "2026-06-25", amount: 100, direction: "in", description: "Ambiguo" }],
    });
    const stats = await autoMatchStatement(pool, { companyId, bankAccountId, matchedBy: 1 });
    expect(stats.matched).toBe(0);
    expect(stats.ambiguous).toBe(1);
  });

  it("deja UNMATCHED cuando no hay candidatos", async () => {
    await importBankStatement(pool, {
      companyId, bankAccountId,
      periodStart: "2026-06-01", periodEnd: "2026-06-30",
      importedBy: 1,
      lines: [{ txnDate: "2026-06-28", amount: 9999, direction: "in", description: "Sin match" }],
    });
    const stats = await autoMatchStatement(pool, { companyId, bankAccountId, matchedBy: 1 });
    expect(stats.matched).toBe(0);
    expect(stats.unmatched).toBe(1);
  });

  it("no reprocesa líneas ya emparejadas en la siguiente corrida", async () => {
    await recordMovement("2026-06-10", "in", "300.0000");
    await importBankStatement(pool, {
      companyId, bankAccountId,
      periodStart: "2026-06-01", periodEnd: "2026-06-30",
      importedBy: 1,
      lines: [{ txnDate: "2026-06-10", amount: 300, direction: "in" }],
    });
    const first = await autoMatchStatement(pool, { companyId, bankAccountId, matchedBy: 1 });
    expect(first.matched).toBe(1);
    const second = await autoMatchStatement(pool, { companyId, bankAccountId, matchedBy: 1 });
    expect(second.processed).toBe(0);
  });
});

describeIntegration("parseCsvLines — CSV genérico DR", () => {
  it("parsea columnas débito/crédito y fecha DD/MM/YYYY", () => {
    const rows = [
      { fecha: "05/06/2026", descripcion: "Depósito ATM", debito: "", credito: "1,000.00", referencia: "REF-1" },
      { fecha: "10/06/2026", descripcion: "Pago servicios", debito: "500.00", credito: "", referencia: "REF-2" },
    ];
    const lines = parseCsvLines(rows);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ txnDate: "2026-06-05", amount: 1000, direction: "in", bankReference: "REF-1" });
    expect(lines[1]).toMatchObject({ txnDate: "2026-06-10", amount: 500, direction: "out", bankReference: "REF-2" });
  });

  it("parsea columna única de monto con signo", () => {
    const rows = [
      { fecha: "2026-06-15", monto: "-750.50", descripcion: "Cargo" },
      { fecha: "2026-06-16", monto: "1200.00", descripcion: "Abono" },
    ];
    const lines = parseCsvLines(rows, { amountColumn: "monto", dateFormat: "YYYY-MM-DD" });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ amount: 750.5, direction: "out" });
    expect(lines[1]).toMatchObject({ amount: 1200, direction: "in" });
  });

  it("descarta filas sin fecha válida", () => {
    const rows = [
      { fecha: "", descripcion: "Vacío", credito: "100" },
      { fecha: "5/6/2026", descripcion: "Válido", credito: "200" },
    ];
    const lines = parseCsvLines(rows);
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(200);
  });
});
