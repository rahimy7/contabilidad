import { SqlClient } from "../accounting/types";
import { prepareRun, calculateRun, postRun, PayrollRunError } from "../payroll/runs";
import { Decimal, add, sub, mul, sum, cmp, roundTo, toMoney } from "../accounting/decimal";

/**
 * Dominican payroll: statutory deductions, employer contributions, and the
 * journal entry for a run.
 *
 * The rates and ISR brackets below are the DR statutory values (TSS resolution
 * and the DGII ISR scale). They are constants here for clarity, but every one
 * is a parameter a SaaS tenant may eventually override — they change by
 * resolution, and the ISR scale is indexed yearly. Treat this module as the
 * calculation, not the policy store.
 *
 * TSS (social security) is computed on salary capped at a multiple of the
 * minimum wage; ISR is computed on salary net of the employee's TSS, against a
 * monthly scale (the annual scale / 12).
 */

// Employee deductions.
const AFP_EMPLOYEE = "0.0287"; // pension, 2.87%
const SFS_EMPLOYEE = "0.0304"; // health (SFS/ARS), 3.04%
// Employer contributions.
const AFP_EMPLOYER = "0.0710"; // 7.10%
const SFS_EMPLOYER = "0.0709"; // 7.09%
const INFOTEP = "0.0100"; // 1% of gross

// Contribution ceilings, as multiples of the (illustrative) minimum wage.
const AFP_CEILING = "434880.00"; // ~20 SM
const SFS_CEILING = "217440.00"; // ~10 SM

/** Monthly ISR scale (annual DGII scale / 12), 2026 illustrative values. */
const ISR_BRACKETS = [
  { upTo: "34685.00", rate: "0", base: "0" }, // exempt
  { upTo: "52027.00", rate: "0.15", base: "0", from: "34685.00" },
  { upTo: "72260.00", rate: "0.20", base: "2601.30", from: "52027.00" },
  { upTo: null, rate: "0.25", base: "6647.90", from: "72260.00" },
];

export interface PayslipResult {
  grossSalary: Decimal;
  afpEmployee: Decimal;
  sfsEmployee: Decimal;
  isr: Decimal;
  afpEmployer: Decimal;
  sfsEmployer: Decimal;
  infotep: Decimal;
  netPay: Decimal;
}

export class PayrollError extends Error {}

export class Payroll {
  constructor(private readonly client: SqlClient) {}

  /** Computes one payslip from a gross monthly salary — the DR calculation. */
  computePayslip(gross: Decimal): PayslipResult {
    const afpBase = cmp(gross, AFP_CEILING) > 0 ? AFP_CEILING : gross;
    const sfsBase = cmp(gross, SFS_CEILING) > 0 ? SFS_CEILING : gross;

    const afpEmployee = roundTo(mul(afpBase, AFP_EMPLOYEE), 2);
    const sfsEmployee = roundTo(mul(sfsBase, SFS_EMPLOYEE), 2);
    const afpEmployer = roundTo(mul(afpBase, AFP_EMPLOYER), 2);
    const sfsEmployer = roundTo(mul(sfsBase, SFS_EMPLOYER), 2);
    const infotep = roundTo(mul(gross, INFOTEP), 2);

    // ISR is charged on salary net of the employee's own TSS contributions.
    const isrBase = sub(gross, add(afpEmployee, sfsEmployee));
    const isr = this.computeIsr(isrBase);

    const netPay = sub(gross, sum([afpEmployee, sfsEmployee, isr]));

    return { grossSalary: gross, afpEmployee, sfsEmployee, isr, afpEmployer, sfsEmployer, infotep, netPay };
  }

  /** Progressive monthly ISR against the DGII scale. */
  computeIsr(monthlyBase: Decimal): Decimal {
    for (const b of ISR_BRACKETS) {
      const withinUpper = b.upTo === null || cmp(monthlyBase, b.upTo) <= 0;
      if (withinUpper) {
        if (b.rate === "0") return "0";
        const excess = sub(monthlyBase, b.from!);
        return roundTo(add(b.base, mul(excess, b.rate)), 2);
      }
    }
    return "0";
  }

  /**
   * Runs payroll for a month in one call: prepare, calculate from the concept
   * catalog (salary plus any variable inputs already captured for the run) and
   * post one entry. The stepwise API in `server/payroll/runs.ts` is what screens
   * use to capture overtime, commissions and bonuses between those steps.
   */
  async run(
    companyId: number,
    year: number,
    month: number,
    entryDate: string,
    postedBy?: number,
  ): Promise<{ runId: number; grossTotal: Decimal; netTotal: Decimal; employees: number }> {
    const { runId } = await prepareRun(this.client, { companyId, year, month });
    let calc;
    try {
      calc = await calculateRun(this.client, { companyId, runId });
    } catch (err) {
      if (err instanceof PayrollRunError) throw new PayrollError(err.message);
      throw err;
    }
    await postRun(this.client, { companyId, runId, entryDate, postedBy });
    return { runId, grossTotal: calc.grossTotal, netTotal: calc.netTotal, employees: calc.employees };
  }

  private async periodId(companyId: number, date: string): Promise<number> {
    const { rows } = await this.client.query(
      `SELECT id FROM accounting_periods WHERE company_id=$1 AND $2::date BETWEEN start_date AND end_date AND period_no <= 12 ORDER BY period_no LIMIT 1`,
      [companyId, date],
    );
    if (rows.length === 0) throw new PayrollError(`no hay período que cubra ${date}`);
    return Number(rows[0].id);
  }
}
