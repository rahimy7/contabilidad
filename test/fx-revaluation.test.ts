import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import {
  setDailyRate, getRate,
  previewRevaluation, runRevaluation,
  FxError,
} from "../server/services/fx-revaluation";

neonConfig.webSocketConstructor = ws;

/**
 * FX revaluation:
 *   - Rate management (upsert + retro-búsqueda)
 *   - Preview de AR/AP en USD
 *   - Signo contable correcto para activo (AR) vs pasivo (AP)
 *   - Postea asiento cuadrado
 *   - Rechaza cuando no hay tasa
 */

describeIntegration("FX revaluation — moneda extranjera", () => {
  let pool: Pool;
  let companyId: number;
  const RNC = "146000911";

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    await pool.query(`DELETE FROM companies WHERE rnc = $1`, [RNC]);
    const c = await pool.query(
      `INSERT INTO companies (legal_name, rnc, functional_currency) VALUES ('FX Test SRL', $1, 'DOP') RETURNING id`,
      [RNC],
    );
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);
  });

  afterAll(async () => {
    if (companyId) {
      await pool.query(`DELETE FROM fx_revaluation_items WHERE run_id IN (SELECT id FROM fx_revaluation_runs WHERE company_id=$1)`, [companyId]);
      await pool.query(`DELETE FROM fx_revaluation_runs WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM fx_daily_rates WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM ar_open_items WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM ap_open_items WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM account_period_balances WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM fx_revaluation_items WHERE run_id IN (SELECT id FROM fx_revaluation_runs WHERE company_id=$1)`, [companyId]);
    await pool.query(`DELETE FROM fx_revaluation_runs WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM fx_daily_rates WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM ar_open_items WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM ap_open_items WHERE company_id=$1`, [companyId]);
  });

  async function seedAR(currency: string, balance: number, issueDate: string) {
    const r = await pool.query(
      `INSERT INTO ar_open_items (company_id, issue_date, due_date, currency, original_amount, balance)
       VALUES ($1, $2::date, $2::date + INTERVAL '30 days', $3, $4, $4)
       RETURNING id`,
      [companyId, issueDate, currency, String(balance)],
    );
    return Number(r.rows[0].id);
  }

  async function seedAP(currency: string, balance: number, issueDate: string) {
    const r = await pool.query(
      `INSERT INTO ap_open_items (company_id, issue_date, due_date, currency, original_amount, balance)
       VALUES ($1, $2::date, $2::date + INTERVAL '30 days', $3, $4, $4)
       RETURNING id`,
      [companyId, issueDate, currency, String(balance)],
    );
    return Number(r.rows[0].id);
  }

  it("setDailyRate upserta y getRate recupera el valor", async () => {
    await setDailyRate(pool, {
      companyId, rateDate: "2026-06-01",
      fromCurrency: "USD", toCurrency: "DOP", rateType: "spot", rate: 58.5,
    });
    const r = await getRate(pool, companyId, "2026-06-01", "USD", "DOP", "spot");
    expect(r).toBe(58.5);
  });

  it("getRate hace retro-búsqueda al último rate anterior", async () => {
    await setDailyRate(pool, {
      companyId, rateDate: "2026-05-15",
      fromCurrency: "USD", toCurrency: "DOP", rateType: "spot", rate: 57,
    });
    const r = await getRate(pool, companyId, "2026-06-01", "USD", "DOP", "spot");
    expect(r).toBe(57);
  });

  it("getRate devuelve null cuando no hay ninguna tasa previa", async () => {
    const r = await getRate(pool, companyId, "2026-06-01", "EUR", "DOP", "spot");
    expect(r).toBeNull();
  });

  it("getRate misma moneda = 1", async () => {
    const r = await getRate(pool, companyId, "2026-06-01", "DOP", "DOP", "spot");
    expect(r).toBe(1);
  });

  it("previewRevaluation: AR USD sube → ganancia", async () => {
    await setDailyRate(pool, { companyId, rateDate: "2026-05-01", fromCurrency: "USD", toCurrency: "DOP", rateType: "spot", rate: 57 });
    await setDailyRate(pool, { companyId, rateDate: "2026-06-30", fromCurrency: "USD", toCurrency: "DOP", rateType: "closing", rate: 60 });
    // Cliente nos debe US$ 1000, registrado en libros a 57 (57000 DOP)
    await seedAR("USD", 1000, "2026-05-01");

    const p = await previewRevaluation(pool, companyId, "2026-06-30");
    expect(p.items).toHaveLength(1);
    const it = p.items[0];
    expect(it.subledger).toBe("ar");
    expect(it.balanceCcy).toBe(1000);
    expect(it.ledgerBalanceDop).toBe(57000);
    expect(it.revaluedDop).toBe(60000);
    expect(it.difference).toBe(3000);
    expect(p.totalGain).toBe(3000);
    expect(p.totalLoss).toBe(0);
  });

  it("previewRevaluation: AR USD baja → pérdida", async () => {
    await setDailyRate(pool, { companyId, rateDate: "2026-05-01", fromCurrency: "USD", toCurrency: "DOP", rateType: "spot", rate: 60 });
    await setDailyRate(pool, { companyId, rateDate: "2026-06-30", fromCurrency: "USD", toCurrency: "DOP", rateType: "closing", rate: 58 });
    await seedAR("USD", 500, "2026-05-01");

    const p = await previewRevaluation(pool, companyId, "2026-06-30");
    expect(p.items[0].difference).toBe(-1000);
    expect(p.totalLoss).toBe(1000);
    expect(p.totalGain).toBe(0);
  });

  it("previewRevaluation: AP USD sube → pérdida (pasivo sube en DOP)", async () => {
    await setDailyRate(pool, { companyId, rateDate: "2026-05-01", fromCurrency: "USD", toCurrency: "DOP", rateType: "spot", rate: 57 });
    await setDailyRate(pool, { companyId, rateDate: "2026-06-30", fromCurrency: "USD", toCurrency: "DOP", rateType: "closing", rate: 60 });
    // Le debemos a proveedor US$ 800, registrado a 57 → 45600 DOP
    await seedAP("USD", 800, "2026-05-01");

    const p = await previewRevaluation(pool, companyId, "2026-06-30");
    const it = p.items[0];
    expect(it.subledger).toBe("ap");
    expect(it.difference).toBe(2400); // 800 × (60 - 57)
    // Aunque diff es positivo, para AP eso es pérdida.
    expect(p.totalLoss).toBe(2400);
    expect(p.totalGain).toBe(0);
  });

  it("mix AR + AP: neto refleja la suma correcta", async () => {
    await setDailyRate(pool, { companyId, rateDate: "2026-05-01", fromCurrency: "USD", toCurrency: "DOP", rateType: "spot", rate: 57 });
    await setDailyRate(pool, { companyId, rateDate: "2026-06-30", fromCurrency: "USD", toCurrency: "DOP", rateType: "closing", rate: 60 });
    await seedAR("USD", 1000, "2026-05-01"); // ganancia 3000
    await seedAP("USD", 500, "2026-05-01");  // pérdida 1500

    const p = await previewRevaluation(pool, companyId, "2026-06-30");
    expect(p.totalGain).toBe(3000);
    expect(p.totalLoss).toBe(1500);
    expect(p.netImpact).toBe(1500);
  });

  it("sin tasa de cierre lanza FxError", async () => {
    await seedAR("USD", 1000, "2026-05-01");
    await expect(previewRevaluation(pool, companyId, "2026-06-30")).rejects.toBeInstanceOf(FxError);
  });

  it("runRevaluation persiste run + items y postea asiento cuadrado", async () => {
    await setDailyRate(pool, { companyId, rateDate: "2026-05-01", fromCurrency: "USD", toCurrency: "DOP", rateType: "spot", rate: 57 });
    await setDailyRate(pool, { companyId, rateDate: "2026-06-30", fromCurrency: "USD", toCurrency: "DOP", rateType: "closing", rate: 60 });
    await seedAR("USD", 1000, "2026-05-01");
    await seedAP("USD", 500, "2026-05-01");

    const r = await runRevaluation(pool, {
      companyId, valuationDate: "2026-06-30", createdBy: 1,
    });
    expect(r.runId).toBeGreaterThan(0);
    expect(r.journalEntryId).not.toBeNull();

    // Verificar que el asiento cuadra.
    const lines = await pool.query(
      `SELECT sum(debit)::float AS dr, sum(credit)::float AS cr
         FROM journal_entry_lines WHERE entry_id = $1`,
      [r.journalEntryId],
    );
    expect(lines.rows[0].dr).toBeCloseTo(lines.rows[0].cr, 2);
  });
});
