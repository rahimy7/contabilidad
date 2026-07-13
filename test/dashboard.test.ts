import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { PostingEngine } from "../server/accounting/posting-engine";
import { Dashboard } from "../server/accounting/dashboard";
import { FinancialStatements } from "../server/accounting/financial-statements";

neonConfig.webSocketConstructor = ws;

/**
 * The dashboard is derived, never stored. What matters is that it cannot drift
 * from the statements it summarises, and that the signs are right: income is
 * credit-natural, so a flipped sign shows a profitable month as a loss and
 * nobody notices until the accountant does.
 */
describeIntegration("dashboard", () => {
  let pool: Pool;
  let companyId: number;
  const RNC = "162000001";
  const YEAR = new Date().getUTCFullYear();
  // Fixed months, so the test does not depend on when it runs. Two months of
  // activity is the minimum that exercises the "vs. mes anterior" comparison.
  const PREV = 3;
  const CUR = 4;

  const VENTAS = "4.1.01.001";
  const COGS = "5.1.01.001";
  const SUELDOS = "5.2.01.001";
  const CAJA = "1.1.01.001";
  const CLIENTES = "1.1.02.001";
  const PROVEEDORES = "2.1.01.001";

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(
      `INSERT INTO companies (legal_name, rnc) VALUES ('Dash SRL',$1) RETURNING id`,
      [RNC],
    );
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);

    // Marzo: vende 1,000 en efectivo, con 400 de costo.
    await post(PREV, [
      [CAJA, "1000.00", "0"],
      [VENTAS, "0", "1000.00"],
    ]);
    await post(PREV, [
      [COGS, "400.00", "0"],
      [PROVEEDORES, "0", "400.00"],
    ]);

    // Abril: vende 1,500 (500 de ellas a crédito), 600 de costo y 300 de sueldos.
    await post(CUR, [
      [CAJA, "1000.00", "0"],
      [CLIENTES, "500.00", "0"],
      [VENTAS, "0", "1500.00"],
    ]);
    await post(CUR, [
      [COGS, "600.00", "0"],
      [PROVEEDORES, "0", "600.00"],
    ]);
    await post(CUR, [
      [SUELDOS, "300.00", "0"],
      [CAJA, "0", "300.00"],
    ]);
  });

  afterAll(async () => {
    if (companyId) {
      await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM account_period_balances WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    await pool.end();
  });

  let seq = 0;
  async function post(month: number, lines: Array<[string, string, string]>) {
    const date = `${YEAR}-${String(month).padStart(2, "0")}-15`;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT set_config('app.company_id',$1,true)`, [String(companyId)]);
      await client.query("SET LOCAL ROLE app_rls");
      await new PostingEngine(client).postManual({
        companyId,
        entryDate: date,
        reference: `dash-${++seq}`,
        lines: lines.map(([accountCode, debit, credit]) => ({ accountCode, debit, credit })),
      });
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  const build = (month: number) => new Dashboard(pool).build(companyId, YEAR, month);

  it("reads income as positive and nets the month's result", async () => {
    const d = await build(CUR);

    expect(d.kpis.income.value).toBe("1500.00");
    expect(d.kpis.expense.value).toBe("900.00"); // 600 costo + 300 sueldos
    expect(d.kpis.netIncome.value).toBe("600.00");

    // Efectivo del mes: entran 1,000 de la venta, salen 300 de sueldos.
    // El crédito de 500 no es efectivo — ese es justamente el punto.
    expect(d.kpis.cashFlow.value).toBe("700.00");
  });

  it("compares against the previous month, not against zero", async () => {
    const d = await build(CUR);

    // Ingresos 1000 → 1500 = +50%. Gastos 400 → 900 = +125%.
    expect(d.kpis.income.changePct).toBe("50.0");
    expect(d.kpis.expense.changePct).toBe("125.0");
    // Resultado 600 → 600: sin cambio.
    expect(d.kpis.netIncome.changePct).toBe("0.0");
  });

  it("has no base to compare in the first month with activity", async () => {
    const d = await build(PREV);
    // Febrero no tuvo movimiento: dividir entre cero no es -100%, es "no aplica".
    expect(d.kpis.income.changePct).toBeNull();
  });

  it("breaks expenses down into slices that add up to the total", async () => {
    const d = await build(CUR);

    expect(d.expenseTotal).toBe("900.00");
    const sum = d.expenseBreakdown.reduce((a, s) => a + Number(s.amount), 0);
    expect(sum).toBeCloseTo(900, 2);

    const cogs = d.expenseBreakdown.find((s) => s.name.match(/costo/i))!;
    expect(cogs.amount).toBe("600.00");
    expect(cogs.pct).toBe("66.6"); // 600/900
  });

  it("gives the twelve-month series the chart draws", async () => {
    const d = await build(CUR);

    expect(d.monthly).toHaveLength(12);
    expect(d.monthly.find((p) => p.period === PREV)!.income).toBe("1000.00");
    expect(d.monthly.find((p) => p.period === CUR)!.income).toBe("1500.00");
    // Un mes sin actividad es un cero, no un hueco: si no, la línea se corta.
    expect(d.monthly.find((p) => p.period === 1)!.income).toBe("0.00");
  });

  it("cannot disagree with the balance sheet it summarises", async () => {
    const d = await build(CUR);
    const bs = await new FinancialStatements(pool).balanceSheet(companyId, YEAR, CUR);

    expect(d.summary.assets).toBe(bs.assets.total);
    expect(d.summary.liabilities).toBe(bs.liabilities.total);
    expect(d.summary.netIncome).toBe(bs.netIncome);
    expect(bs.balanced).toBe(true);

    // Margen del año hasta abril: marzo netea 600 y abril 600 → 1,200 de
    // resultado sobre 2,500 de ingreso acumulado.
    expect(d.summary.marginPct).toBe("48.0");
  });
});
