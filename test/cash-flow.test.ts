import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { Treasury } from "../server/treasury/banks";
import {
  createEntry, generateForecast, saveForecast, listSavedForecasts,
} from "../server/services/cash-flow";

neonConfig.webSocketConstructor = ws;

/**
 * Cash flow forecast:
 *   - Buckets semanales correctamente formados
 *   - AR/AP se asignan al bucket correcto por due_date
 *   - Entries recurrentes se expanden por regla de frecuencia
 *   - Balance acumulado y min_balance se calculan bien
 *   - Snapshot se persiste
 */

describeIntegration("cash flow forecast", () => {
  let pool: Pool;
  let companyId: number;
  let bankAccountId: number;
  const RNC = "146000922";

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    await pool.query(`DELETE FROM companies WHERE rnc = $1`, [RNC]);
    const c = await pool.query(
      `INSERT INTO companies (legal_name, rnc) VALUES ('CF Test SRL', $1) RETURNING id`,
      [RNC],
    );
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);

    const client = await pool.connect();
    try {
      bankAccountId = await new Treasury(client).openAccount({
        companyId, code: "MAIN", name: "Cuenta principal",
      });
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (companyId) {
      await pool.query(`DELETE FROM cash_flow_forecasts WHERE company_id = $1`, [companyId]);
      await pool.query(`DELETE FROM cash_flow_entries WHERE company_id = $1`, [companyId]);
      await pool.query(`DELETE FROM ar_open_items WHERE company_id = $1`, [companyId]);
      await pool.query(`DELETE FROM ap_open_items WHERE company_id = $1`, [companyId]);
      await pool.query(`DELETE FROM bank_transactions WHERE company_id = $1`, [companyId]);
      await pool.query(`DELETE FROM bank_accounts WHERE company_id = $1`, [companyId]);
      await pool.query(`DELETE FROM journal_entries WHERE company_id = $1`, [companyId]);
      await pool.query(`DELETE FROM account_period_balances WHERE company_id = $1`, [companyId]);
      await pool.query(`DELETE FROM companies WHERE id = $1`, [companyId]);
    }
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM cash_flow_forecasts WHERE company_id = $1`, [companyId]);
    await pool.query(`DELETE FROM cash_flow_entries WHERE company_id = $1`, [companyId]);
    await pool.query(`DELETE FROM ar_open_items WHERE company_id = $1`, [companyId]);
    await pool.query(`DELETE FROM ap_open_items WHERE company_id = $1`, [companyId]);
    await pool.query(`DELETE FROM bank_transactions WHERE company_id = $1`, [companyId]);
  });

  async function seedBankBalance(amount: number, date: string) {
    const client = await pool.connect();
    try {
      await new Treasury(client).recordMovement({
        companyId, bankAccountId, txnDate: date, direction: "in",
        amount: String(amount), counterpartyAccountRef: "3.1.01.001",
      });
    } finally {
      client.release();
    }
  }

  async function seedAR(amount: number, dueDate: string) {
    await pool.query(
      `INSERT INTO ar_open_items (company_id, issue_date, due_date, currency, original_amount, balance)
       VALUES ($1, $2::date - INTERVAL '7 days', $2::date, 'DOP', $3, $3)`,
      [companyId, dueDate, String(amount)],
    );
  }

  async function seedAP(amount: number, dueDate: string) {
    await pool.query(
      `INSERT INTO ap_open_items (company_id, issue_date, due_date, currency, original_amount, balance)
       VALUES ($1, $2::date - INTERVAL '7 days', $2::date, 'DOP', $3, $3)`,
      [companyId, dueDate, String(amount)],
    );
  }

  it("genera 13 buckets semanales por defecto", async () => {
    const f = await generateForecast(pool, {
      companyId, forecastDate: "2026-08-01",
    });
    expect(f.buckets).toHaveLength(13);
    expect(f.buckets[0].weekStart).toBe("2026-08-01");
    expect(f.buckets[0].weekEnd).toBe("2026-08-07");
    expect(f.buckets[12].weekStart).toBe("2026-10-24");
  });

  it("startingBalance refleja saldo bancario a la fecha", async () => {
    await seedBankBalance(50000, "2026-07-15");
    const f = await generateForecast(pool, { companyId, forecastDate: "2026-08-01" });
    expect(f.startingBalance).toBe(50000);
  });

  it("AR se asigna al bucket de su due_date", async () => {
    await seedAR(10000, "2026-08-10"); // bucket 1 (Aug 8-14)
    const f = await generateForecast(pool, { companyId, forecastDate: "2026-08-01" });
    expect(f.buckets[1].inflowAR).toBe(10000);
    expect(f.totalInflow).toBe(10000);
  });

  it("AP se asigna al bucket correcto y suma outflow", async () => {
    await seedAP(5000, "2026-08-20"); // bucket 2 (Aug 15-21)
    const f = await generateForecast(pool, { companyId, forecastDate: "2026-08-01" });
    expect(f.buckets[2].outflowAP).toBe(5000);
    expect(f.totalOutflow).toBe(5000);
  });

  it("balance acumulado corre correctamente semana a semana", async () => {
    await seedBankBalance(20000, "2026-07-15");
    await seedAR(10000, "2026-08-10");
    await seedAP(5000, "2026-08-20");
    const f = await generateForecast(pool, { companyId, forecastDate: "2026-08-01" });
    // Bucket 0: 20000 opening, sin flujos → 20000
    expect(f.buckets[0].closingBalance).toBe(20000);
    // Bucket 1: +10000 → 30000
    expect(f.buckets[1].closingBalance).toBe(30000);
    // Bucket 2: -5000 → 25000
    expect(f.buckets[2].closingBalance).toBe(25000);
    expect(f.endingBalance).toBe(25000);
    expect(f.netFlow).toBe(5000);
  });

  it("entry mensual se expande a lo largo del horizonte", async () => {
    // Alquiler de 15000 el día 5 de cada mes, empezando 5 de julio.
    await createEntry(pool, {
      companyId, createdBy: 1,
      name: "Alquiler", direction: "outflow", category: "rent",
      amount: 15000, frequency: "monthly", startDate: "2026-07-05",
    });
    const f = await generateForecast(pool, { companyId, forecastDate: "2026-08-01" });
    // Debe aparecer el 5 de agosto, 5 de septiembre, y 5 de octubre.
    const totalRentOut = f.buckets.reduce((s, b) => s + b.outflowOther, 0);
    expect(totalRentOut).toBe(45000);
  });

  it("entry weekly con intervalCount=2 = biweekly", async () => {
    // Nómina de 30000 cada 2 semanas, empezando 1 de agosto.
    await createEntry(pool, {
      companyId, createdBy: 1,
      name: "Nómina", direction: "outflow", category: "payroll",
      amount: 30000, frequency: "biweekly", startDate: "2026-08-01",
    });
    const f = await generateForecast(pool, { companyId, forecastDate: "2026-08-01" });
    // En 13 semanas: 1-ago, 15-ago, 29-ago, 12-sep, 26-sep, 10-oct, 24-oct → 7 ocurrencias
    const total = f.buckets.reduce((s, b) => s + b.outflowOther, 0);
    expect(total).toBe(30000 * 7);
  });

  it("entry one_time solo aparece una vez", async () => {
    await createEntry(pool, {
      companyId, createdBy: 1,
      name: "Impuesto anual", direction: "outflow", category: "tax",
      amount: 100000, frequency: "one_time", startDate: "2026-09-15",
    });
    const f = await generateForecast(pool, { companyId, forecastDate: "2026-08-01" });
    const total = f.buckets.reduce((s, b) => s + b.outflowOther, 0);
    expect(total).toBe(100000);
  });

  it("entry con endDate deja de proyectarse tras ese día", async () => {
    // Préstamo con 3 cuotas mensuales terminando 31 de agosto.
    await createEntry(pool, {
      companyId, createdBy: 1,
      name: "Cuota préstamo", direction: "outflow", category: "loan",
      amount: 10000, frequency: "monthly",
      startDate: "2026-06-01", endDate: "2026-08-31",
    });
    const f = await generateForecast(pool, { companyId, forecastDate: "2026-08-01" });
    const total = f.buckets.reduce((s, b) => s + b.outflowOther, 0);
    // Solo 1 cuota cae en el horizonte (Aug 1).
    expect(total).toBe(10000);
  });

  it("minBalance detecta el punto más bajo del horizonte", async () => {
    await seedBankBalance(10000, "2026-07-15");
    await seedAP(15000, "2026-08-10"); // hace balance negativo
    await seedAR(20000, "2026-08-25"); // recupera
    const f = await generateForecast(pool, { companyId, forecastDate: "2026-08-01" });
    expect(f.minBalance).toBeLessThan(0);
    expect(f.minBalance).toBe(-5000); // 10000 - 15000
    expect(f.endingBalance).toBe(15000); // -5000 + 20000
  });

  it("saveForecast persiste snapshot y listSavedForecasts lo recupera", async () => {
    const f = await generateForecast(pool, { companyId, forecastDate: "2026-08-01" });
    const id = await saveForecast(pool, companyId, f, 1, "Test snapshot");
    expect(id).toBeGreaterThan(0);
    const list = await listSavedForecasts(pool, companyId);
    expect(list).toHaveLength(1);
    expect(list[0].notes).toBe("Test snapshot");
  });
});
