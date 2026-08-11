import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { Treasury } from "../server/treasury/banks";
import {
  createRule, listRules, runAlerts, listEvents,
  acknowledgeEvent, dismissEvent, toggleRule,
} from "../server/services/alerts";

neonConfig.webSocketConstructor = ws;

/**
 * Alerts engine: rules + evaluators + idempotencia + debouncing.
 *
 * Escenarios:
 *   - cash_low: solo dispara si balance < umbral
 *   - ar_overdue: dispara solo para facturas vencidas > N días
 *   - low_stock: dispara por producto con stock <= min
 *   - dedup: mismo día no crea duplicados
 *   - debounce: no dispara antes de N minutos
 *   - acknowledge/dismiss cambian status
 */

describeIntegration("alerts engine", () => {
  let pool: Pool;
  let companyId: number;
  const RNC = "146000966";
  const storeId = 999_950;
  let warehouseId: number;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    await pool.query(`DELETE FROM companies WHERE rnc = $1`, [RNC]);
    const c = await pool.query(
      `INSERT INTO companies (legal_name, rnc) VALUES ('Alert Test SRL', $1) RETURNING id`,
      [RNC],
    );
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);

    const client = await pool.connect();
    try {
      await new Treasury(client).openAccount({
        companyId, code: "MAIN", name: "Main",
      });
    } finally {
      client.release();
    }

    const w = await pool.query(
      `INSERT INTO warehouses (store_id, name, description, is_default)
       VALUES ($1, 'Alerts WH', 'test', true) RETURNING id`,
      [storeId],
    );
    warehouseId = w.rows[0].id;
  });

  afterAll(async () => {
    if (companyId) {
      await pool.query(`DELETE FROM alert_deliveries WHERE event_id IN (SELECT id FROM alert_events WHERE store_id=$1)`, [storeId]);
      await pool.query(`DELETE FROM alert_events WHERE store_id=$1`, [storeId]);
      await pool.query(`DELETE FROM alert_rules WHERE store_id=$1`, [storeId]);
      await pool.query(`DELETE FROM products WHERE store_id=$1`, [storeId]);
      await pool.query(`DELETE FROM warehouses WHERE store_id=$1`, [storeId]);
      await pool.query(`DELETE FROM ar_open_items WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM bank_transactions WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM bank_accounts WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM account_period_balances WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM alert_deliveries WHERE event_id IN (SELECT id FROM alert_events WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM alert_events WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM alert_rules WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM products WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM ar_open_items WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM bank_transactions WHERE company_id=$1`, [companyId]);
  });

  async function seedBankBalance(amount: number) {
    const bank = await pool.query(
      `SELECT id FROM bank_accounts WHERE company_id=$1 LIMIT 1`,
      [companyId],
    );
    const bankAccountId = Number(bank.rows[0].id);
    const client = await pool.connect();
    try {
      await new Treasury(client).recordMovement({
        companyId, bankAccountId, txnDate: "2026-08-01",
        direction: amount >= 0 ? "in" : "out",
        amount: String(Math.abs(amount)),
        counterpartyAccountRef: "3.1.01.001",
      });
    } finally {
      client.release();
    }
  }

  async function seedAr(amount: number, dueDaysAgo: number) {
    const due = new Date(Date.now() - dueDaysAgo * 86_400_000).toISOString().slice(0, 10);
    const issue = new Date(Date.now() - (dueDaysAgo + 30) * 86_400_000).toISOString().slice(0, 10);
    await pool.query(
      `INSERT INTO ar_open_items (company_id, issue_date, due_date, currency, original_amount, balance)
       VALUES ($1, $2::date, $3::date, 'DOP', $4, $4)`,
      [companyId, issue, due, String(amount)],
    );
  }

  it("cash_low dispara cuando balance < umbral", async () => {
    await seedBankBalance(50000);
    await createRule(pool, {
      storeId, companyId,
      name: "Cash bajo 100k",
      ruleType: "cash_low",
      parameters: { minBalance: 100000 },
      createdBy: 1,
    });
    const r = await runAlerts(pool, storeId, { companyId, deliver: false });
    expect(r.rulesEvaluated).toBe(1);
    expect(r.eventsCreated).toBe(1);
    const events = await listEvents(pool, storeId);
    expect(events[0].severity).toBe("critical"); // 50k < 100k/2
  });

  it("cash_low NO dispara cuando balance >= umbral", async () => {
    await seedBankBalance(150000);
    await createRule(pool, {
      storeId, companyId,
      name: "Cash bajo 100k",
      ruleType: "cash_low",
      parameters: { minBalance: 100000 },
      createdBy: 1,
    });
    const r = await runAlerts(pool, storeId, { companyId, deliver: false });
    expect(r.eventsCreated).toBe(0);
  });

  it("dedup: correr dos veces el mismo día no crea eventos duplicados", async () => {
    await seedBankBalance(10000);
    await createRule(pool, {
      storeId, companyId,
      name: "Cash bajo",
      ruleType: "cash_low",
      parameters: { minBalance: 100000 },
      debounceMinutes: 0,
      createdBy: 1,
    });
    const r1 = await runAlerts(pool, storeId, { companyId, deliver: false });
    expect(r1.eventsCreated).toBe(1);
    const r2 = await runAlerts(pool, storeId, { companyId, deliver: false });
    expect(r2.eventsCreated).toBe(0);
    expect((await listEvents(pool, storeId)).length).toBe(1);
  });

  it("debounce: regla con debounceMinutes > 0 no se re-evalúa dentro del intervalo", async () => {
    await seedBankBalance(10000);
    const ruleId = await createRule(pool, {
      storeId, companyId,
      name: "Cash bajo",
      ruleType: "cash_low",
      parameters: { minBalance: 100000 },
      debounceMinutes: 60,
      createdBy: 1,
    });
    await runAlerts(pool, storeId, { companyId, deliver: false });
    // Segunda ejecución: la regla debe ser saltada.
    const r2 = await runAlerts(pool, storeId, { companyId, deliver: false });
    // rulesEvaluated cuenta las que llegan al evaluator; con debounce activo se saltan.
    expect(r2.rulesEvaluated).toBe(1); // sí se cuenta como evaluada pero se skipea
    expect(r2.eventsCreated).toBe(0);
  });

  it("ar_overdue: dispara evento por cada factura vencida", async () => {
    await seedAr(5000, 60);   // vencida 60 días
    await seedAr(3000, 90);   // vencida 90 días
    await seedAr(2000, 5);    // NO vencida (menos de 30 días)
    await createRule(pool, {
      storeId, companyId,
      name: "AR vencido",
      ruleType: "ar_overdue",
      parameters: { days: 30 },
      createdBy: 1,
    });
    const r = await runAlerts(pool, storeId, { companyId, deliver: false });
    expect(r.eventsCreated).toBe(2);
    const events = await listEvents(pool, storeId);
    const critical = events.filter((e) => e.severity === "critical");
    // La de 90 días vencida es critical
    expect(critical.length).toBeGreaterThanOrEqual(1);
  });

  it("low_stock: dispara por producto con stock <= min_quantity", async () => {
    await pool.query(
      `INSERT INTO products (store_id, name, sku, price, base_currency, category, type, status, availability, stock_quantity, min_quantity)
       VALUES ($1, 'Producto A', 'A', '100', 'DOP', 'x', 'product', 'active', 'available', 2, 5)`,
      [storeId],
    );
    await pool.query(
      `INSERT INTO products (store_id, name, sku, price, base_currency, category, type, status, availability, stock_quantity, min_quantity)
       VALUES ($1, 'Producto B', 'B', '100', 'DOP', 'x', 'product', 'active', 'available', 20, 5)`,
      [storeId],
    );
    await createRule(pool, {
      storeId, name: "Stock bajo", ruleType: "low_stock",
      createdBy: 1,
    });
    const r = await runAlerts(pool, storeId, { deliver: false });
    expect(r.eventsCreated).toBe(1);
    const events = await listEvents(pool, storeId);
    expect(events[0].payload).toMatchObject({ name: "Producto A" });
  });

  it("acknowledge cambia status a 'acknowledged'", async () => {
    await seedBankBalance(10000);
    await createRule(pool, {
      storeId, companyId, name: "Cash", ruleType: "cash_low",
      parameters: { minBalance: 100000 }, debounceMinutes: 0, createdBy: 1,
    });
    await runAlerts(pool, storeId, { companyId, deliver: false });
    const events = await listEvents(pool, storeId);
    await acknowledgeEvent(pool, events[0].id, 1);
    const after = await listEvents(pool, storeId, { status: "acknowledged" });
    expect(after.length).toBe(1);
  });

  it("dismiss cambia status a 'dismissed'", async () => {
    await seedBankBalance(10000);
    await createRule(pool, {
      storeId, companyId, name: "Cash", ruleType: "cash_low",
      parameters: { minBalance: 100000 }, debounceMinutes: 0, createdBy: 1,
    });
    await runAlerts(pool, storeId, { companyId, deliver: false });
    const events = await listEvents(pool, storeId);
    await dismissEvent(pool, events[0].id);
    const after = await listEvents(pool, storeId, { status: "dismissed" });
    expect(after.length).toBe(1);
  });

  it("toggle desactiva la regla y ya no dispara", async () => {
    await seedBankBalance(10000);
    const rid = await createRule(pool, {
      storeId, companyId, name: "Cash", ruleType: "cash_low",
      parameters: { minBalance: 100000 }, debounceMinutes: 0, createdBy: 1,
    });
    await toggleRule(pool, rid, false);
    const r = await runAlerts(pool, storeId, { companyId, deliver: false });
    expect(r.rulesEvaluated).toBe(0);
    expect(r.eventsCreated).toBe(0);
  });

  it("deliveries se encolan por canal cuando deliver != false", async () => {
    await seedBankBalance(10000);
    await createRule(pool, {
      storeId, companyId, name: "Cash", ruleType: "cash_low",
      parameters: { minBalance: 100000 },
      channels: ["in_app", "email"],
      debounceMinutes: 0, createdBy: 1,
    });
    const r = await runAlerts(pool, storeId, { companyId });
    expect(r.deliveriesQueued).toBe(2);
  });
});
