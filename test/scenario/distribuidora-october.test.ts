import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "../helpers";
import { runOctoberScenario, resetScenarioCompany, ScenarioResult } from "../../server/scenario/distribuidora/runner";
import { EMPLOYEES } from "../../server/scenario/distribuidora/fixtures";

neonConfig.webSocketConstructor = ws;

/**
 * The whole month of a distributor, reconciled.
 *
 * One run of the October scenario (purchasing, receipts, inventory, sales,
 * returns, receivables, payables, treasury, payroll, fixed assets, DGII, close),
 * then two kinds of assertion:
 *
 *  - every month-end control agrees (subledgers vs ledger, stock views vs
 *    valuation, banks vs treasury, payroll vs ledger, forms vs ledger), and the
 *    statutory liabilities are zero once November's payments are made;
 *  - a handful of figures recomputed here by hand, independently of the code
 *    under test, so a bug that is merely self-consistent still fails.
 */
describeIntegration("Mes completo: Distribuidora Caribe, octubre 2026", () => {
  let pool: Pool;
  let result: ScenarioResult;
  const OPTS = { rnc: "131900001", prefix: "DTQ", storeId: 926_010 };

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
    // Neon closes idle pooled connections; an unhandled 'error' on one of them
    // would abort the whole month. The next query simply opens a new one.
    pool.on("error", (err) => console.warn("[pool] conexión inactiva cerrada:", err.message));
    await resetScenarioCompany(pool, OPTS);
    result = await runOctoberScenario(pool, { ...OPTS, log: (s, m) => process.env.SCENARIO_VERBOSE && console.log(s, m) });
  }, 1_800_000);

  afterAll(async () => {
    if (!process.env.SCENARIO_KEEP) await resetScenarioCompany(pool, OPTS).catch(() => undefined);
    await pool.end();
  }, 300_000);

  it("cuadra todos los controles de cierre de octubre", () => {
    const failing = result.october.checks.filter((c) => !c.ok);
    expect(failing, JSON.stringify(failing, null, 2)).toEqual([]);
    expect(result.october.ok).toBe(true);
  });

  it("deja en cero nómina, TSS, INFOTEP, IR-3, IR-17, ITBIS retenido e ITBIS tras los pagos de noviembre", () => {
    for (const [code, balance] of Object.entries(result.afterStatutoryPayments)) {
      expect(Number(balance), code).toBeCloseTo(0, 2);
    }
  });

  it("aplica los controles: aprobaciones, límites, políticas y cierre", () => {
    const f = result.facts;
    expect(f.selfApprovalRefused).toBe(true);
    expect(f.requisitionStatus).toBe("approved");
    expect(f.receiveBeforeApprovalRefused).toBe(true);
    expect(f.overReceiptRefused).toBe(true);
    expect(f.discountAbovePolicyRefused).toBe(true);
    expect(f.creditLimitRefused).toBe(true);
    expect(f.ncfNotBurnedOnRefusal).toBe(true);
    expect(f.overCreditRefused).toBe(true);
    expect(f.selfApproveCommissionRefused_vendedor1).toBe(true);
    expect(f.postingIntoClosedMonthRefused).toBe(true);
    expect(f.rec1Status).toBe("partial");
    expect(f.rec4Status).toBe("received");
  });

  it("calcula compras, ventas y retenciones como se calculan a mano", () => {
    const f = result.facts;
    // OC-1: 824,500 + ITBIS (156,000×18% + 65,000×16% + 96,000×18% + 63,000×18% + 123,000×18%).
    expect(Number(f.po1Total)).toBeCloseTo(824500 + 28080 + 10400 + 17280 + 11340 + 22140, 2);
    // OC-2: 370,000 + (360,000 − 5%) + 126,000, all at 18%.
    expect(Number(f.po2Total)).toBeCloseTo(838000 * 1.18, 2);
    // Factura OC-1 at 525 for the oil: 826,000 goods + 89,510 ITBIS.
    expect(Number(f.inv1Total)).toBeCloseTo(915510, 2);
    // S1: 58,000 exempt + 41,040×18% + 30,000×18%.
    expect(Number(f.S1Total)).toBeCloseTo(58000 + 41040 * 1.18 + 30000 * 1.18, 2);
    expect(Number(f.R1Total)).toBeCloseTo(3540, 2);
    // State withholdings on S4: 30% of the ITBIS and 5% of the base.
    expect(Number(f.govWithholdingItbis)).toBeCloseTo((34500 * 0.18 + 21600 * 0.16 + 20800 * 0.18) * 0.3, 2);
    expect(Number(f.govWithholdingIsr)).toBeCloseTo(76900 * 0.05, 2);
    // Promotions on S13: 10% off 3,600 of coffee + 2 free boxes of cookies.
    expect(Number(f.S13Discounts)).toBeCloseTo(360 + 2 * 520, 2);
    // Supplier credit note: 10 boxes at 350 + 18%, leaving at their FIFO cost.
    expect(Number(f.supplierCreditTotal)).toBeCloseTo(4130, 2);
    expect(Number(f.supplierCreditStockCost)).toBeCloseTo(3500, 2);
  });

  it("valora conteo, ajuste y depreciación al costo", () => {
    const f = result.facts;
    expect(Number(f.countShortage)).toBeCloseTo(2 * 410, 2); // 2 refrescos faltantes en Santiago
    expect(Number(f.countSurplus)).toBeCloseTo(1 * 2100, 2); // 1 licuadora sobrante
    expect(f.manualAdjustment.deficitValue).toBeCloseTo(480, 2); // 1 detergente roto
    // Camión (2,200,000 − 200,000)/60 + mobiliario 150,000/60; computers bought on the 18th start in November.
    expect(Number(f.depreciation.total)).toBeCloseTo(2000000 / 60 + 2500, 1);
  });

  it("calcula comisiones sobre ventas netas con bono por meta", () => {
    const c = result.facts.commissions;
    const v1 = 129040 - 3000 + 76900 + 34500 + 132600 + 157300;
    expect(Number(c.vendedor1.totalRevenue)).toBeCloseTo(v1, 2);
    expect(c.vendedor1.goalAchieved).toBe(true);
    expect(Number(c.vendedor1.totalEarned)).toBeCloseTo(round2(v1 * 0.03) + round2(round2(v1 * 0.03) * 0.1), 2);
    const v2 = 71425 - 2000 + 27700 + 800 + 177120 + 12000 + 88100;
    expect(Number(c.vendedor2.totalRevenue)).toBeCloseTo(v2, 2);
    expect(c.vendedor2.goalAchieved).toBe(false);
    expect(Number(c.vendedor2.totalEarned)).toBeCloseTo(round2(v2 * 0.03), 2);
  });

  it("liquida la nómina por concepto como la haría el contador", () => {
    const slips: Record<string, any> = Object.fromEntries(
      result.facts.payslips.map((s: any) => [s.code.replace(/^.*-/, ""), s]),
    );
    const byName = (first: string) => result.facts.payslips.find((s: any) => s.name.startsWith(first));
    const c = result.facts.commissions;
    const expectations: Array<[string, ReturnType<typeof oracle>]> = [
      ["Carlos", oracle({ salary: 180000 })],
      ["Félix", oracle({ salary: 22000, he35: 12, he100: 4, loan: 1500 })],
      ["Carmen", oracle({ salary: 55000, bonus: 5000 })],
      ["José", oracle({ salary: 25000, commission: Number(c.vendedor1.totalEarned) })],
      ["Rosa", oracle({ salary: 21000, incentive: 2000 })],
      ["Juan", oracle({ salary: 20000, workedDays: 13.5 })],
    ];
    for (const [name, o] of expectations) {
      const s = byName(name);
      expect(s, name).toBeTruthy();
      expect(Number(s.gross_salary), `${name} bruto`).toBeCloseTo(o.gross, 1);
      expect(Number(s.afp_employee), `${name} AFP`).toBeCloseTo(o.afp, 1);
      expect(Number(s.sfs_employee), `${name} SFS`).toBeCloseTo(o.sfs, 1);
      expect(Number(s.isr), `${name} ISR`).toBeCloseTo(o.isr, 1);
      expect(Number(s.net_pay), `${name} neto`).toBeCloseTo(o.net, 1);
      expect(Number(s.infotep), `${name} INFOTEP`).toBeCloseTo(o.infotep, 1);
    }
    expect(Object.keys(slips).length).toBe(EMPLOYEES.length);
  });

  it("produce los formatos DGII del mes con la anulación en el 608", () => {
    const d = result.facts.dgii;
    expect(d.r608.recordCount).toBe(1);
    expect(d.r607.recordCount).toBeGreaterThan(10);
    expect(d.r606.lines.some((l: string) => l.includes("B0400000501"))).toBe(true);
    expect(Number(d.ir17.totalRetained)).toBeCloseTo(6000 + 1200, 2); // alquiler + flete
    expect(Number(d.ir3.totalRetained)).toBeGreaterThan(0);
  });
});

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Dominican payslip, written out longhand with the 2026 parameters. */
function oracle(e: {
  salary: number; he35?: number; he100?: number; commission?: number; incentive?: number; bonus?: number; loan?: number; workedDays?: number;
}) {
  const daily = e.salary / 23.83;
  const hourly = daily / 8;
  const base = e.workedDays ? round2(Math.min(daily * e.workedDays, e.salary)) : e.salary;
  const he = round2((e.he35 ?? 0) * hourly * 1.35) + round2((e.he100 ?? 0) * hourly * 2);
  const tssBase = base + he + (e.commission ?? 0) + (e.incentive ?? 0);
  const gross = tssBase + (e.bonus ?? 0);
  const afp = round2(Math.min(tssBase, 434880) * 0.0287);
  const sfs = round2(Math.min(tssBase, 217440) * 0.0304);
  const isrBase = round2(gross - afp - sfs);
  const isr =
    isrBase <= 34685 ? 0
    : isrBase <= 52027 ? round2((isrBase - 34685) * 0.15)
    : isrBase <= 72260 ? round2(2601.3 + (isrBase - 52027) * 0.2)
    : round2(6647.9 + (isrBase - 72260) * 0.25);
  const net = round2(gross - afp - sfs - isr - (e.loan ?? 0));
  return { gross: round2(gross), afp, sfs, isr, net, infotep: round2(tssBase * 0.01) };
}
