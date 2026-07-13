import { SqlClient } from "../accounting/types";
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
   * Runs payroll for a month: computes a payslip per active employee, and posts
   * one journal entry for the whole run. Idempotent per (company, year, month).
   */
  async run(
    companyId: number,
    year: number,
    month: number,
    entryDate: string,
    postedBy?: number,
  ): Promise<{ runId: number; grossTotal: Decimal; netTotal: Decimal; employees: number }> {
    const existing = await this.client.query(
      `SELECT id, status FROM payroll_runs WHERE company_id=$1 AND fiscal_year=$2 AND month=$3`,
      [companyId, year, month],
    );
    if (existing.rows.length > 0 && existing.rows[0].status === "posted") {
      throw new PayrollError(`la nómina de ${year}-${month} ya fue procesada`);
    }

    const emps = await this.client.query(
      `SELECT id, base_salary::text FROM payroll_employees WHERE company_id=$1 AND is_active`,
      [companyId],
    );
    if (emps.rows.length === 0) throw new PayrollError("no hay empleados activos");

    const run = await this.client.query(
      `INSERT INTO payroll_runs (company_id, fiscal_year, month, status) VALUES ($1,$2,$3,'draft')
       ON CONFLICT (company_id, fiscal_year, month) DO UPDATE SET status='draft' RETURNING id`,
      [companyId, year, month],
    );
    const runId = Number(run.rows[0].id);
    await this.client.query(`DELETE FROM payslips WHERE run_id=$1`, [runId]);

    const totals = {
      gross: "0" as Decimal,
      net: "0" as Decimal,
      afpEmp: "0" as Decimal,
      sfsEmp: "0" as Decimal,
      isr: "0" as Decimal,
      afpEr: "0" as Decimal,
      sfsEr: "0" as Decimal,
      infotep: "0" as Decimal,
    };

    for (const e of emps.rows) {
      const p = this.computePayslip(e.base_salary);
      await this.client.query(
        `INSERT INTO payslips (company_id, run_id, employee_id, gross_salary, afp_employee, sfs_employee,
           isr, afp_employer, sfs_employer, infotep, net_pay)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          companyId, runId, e.id,
          toMoney(p.grossSalary), toMoney(p.afpEmployee), toMoney(p.sfsEmployee), toMoney(p.isr),
          toMoney(p.afpEmployer), toMoney(p.sfsEmployer), toMoney(p.infotep), toMoney(p.netPay),
        ],
      );
      totals.gross = add(totals.gross, p.grossSalary);
      totals.net = add(totals.net, p.netPay);
      totals.afpEmp = add(totals.afpEmp, p.afpEmployee);
      totals.sfsEmp = add(totals.sfsEmp, p.sfsEmployee);
      totals.isr = add(totals.isr, p.isr);
      totals.afpEr = add(totals.afpEr, p.afpEmployer);
      totals.sfsEr = add(totals.sfsEr, p.sfsEmployer);
      totals.infotep = add(totals.infotep, p.infotep);
    }

    const entryId = await this.postRun(companyId, year, entryDate, totals, postedBy);
    await this.client.query(
      `UPDATE payroll_runs SET status='posted', gross_total=$2, net_total=$3, journal_entry_id=$4 WHERE id=$1`,
      [runId, toMoney(totals.gross), toMoney(totals.net), entryId],
    );

    return { runId, grossTotal: totals.gross, netTotal: totals.net, employees: emps.rows.length };
  }

  /**
   * The payroll journal entry:
   *   Dr Sueldos (gross) + Dr Aportes patronales (employer AFP+SFS+INFOTEP)
   *   Cr Sueldos por pagar (net) + Cr TSS por pagar (all AFP+SFS) +
   *   Cr INFOTEP por pagar + Cr ISR retenido por pagar.
   * This balances by construction (proven in the test).
   */
  private async postRun(
    companyId: number,
    year: number,
    entryDate: string,
    t: { gross: Decimal; net: Decimal; afpEmp: Decimal; sfsEmp: Decimal; isr: Decimal; afpEr: Decimal; sfsEr: Decimal; infotep: Decimal },
    postedBy?: number,
  ): Promise<number> {
    const acc = async (code: string) => {
      const { rows } = await this.client.query(`SELECT id FROM chart_of_accounts WHERE company_id=$1 AND code=$2`, [companyId, code]);
      if (rows.length === 0) throw new PayrollError(`cuenta ${code} no existe`);
      return Number(rows[0].id);
    };
    const period = await this.periodId(companyId, entryDate);

    const salaryExpense = await acc("5.2.01.001");
    const employerContrib = await acc("5.2.01.002");
    const netPayable = await acc("2.1.03.001");
    const tssPayable = await acc("2.1.03.002");
    const infotepPayable = await acc("2.1.03.003");
    const isrPayable = await acc("2.1.02.003");

    const employerTotal = sum([t.afpEr, t.sfsEr, t.infotep]);
    const tssTotal = sum([t.afpEmp, t.sfsEmp, t.afpEr, t.sfsEr]);

    const lines: Array<[number, Decimal, Decimal]> = [
      [salaryExpense, toMoney(t.gross), "0"],
      [employerContrib, toMoney(employerTotal), "0"],
      [netPayable, "0", toMoney(t.net)],
      [tssPayable, "0", toMoney(tssTotal)],
      [infotepPayable, "0", toMoney(t.infotep)],
      [isrPayable, "0", toMoney(t.isr)],
    ];

    const entry = await this.client.query(
      `INSERT INTO journal_entries (company_id, period_id, entry_date, memo, currency, status,
         source_type, source_id, source_event, posted_by, posted_at)
       VALUES ($1,$2,$3,$4,'DOP','draft','payroll',$5,'run',$6, now())
       ON CONFLICT (company_id, source_type, source_id, source_event) DO NOTHING RETURNING id`,
      [companyId, period, entryDate, `Nómina ${entryDate}`, `${year}-${entryDate}`, postedBy ?? null],
    );
    if (entry.rows.length === 0) throw new PayrollError("asiento de nómina duplicado");
    const entryId = Number(entry.rows[0].id);

    let lineNo = 1;
    for (const [accountId, debit, credit] of lines) {
      if (debit === "0.0000" && credit === "0.0000") continue;
      await this.client.query(
        `INSERT INTO journal_entry_lines (entry_id, company_id, line_no, account_id, debit, credit, currency, fx_rate, debit_func, credit_func)
         VALUES ($1,$2,$3,$4,$5::numeric,$6::numeric,'DOP',1,$5::numeric,$6::numeric)`,
        [entryId, companyId, lineNo++, accountId, debit, credit],
      );
    }
    await this.client.query(
      `UPDATE journal_entries SET status='posted', entry_no=allocate_entry_no($1,$2::smallint) WHERE id=$3`,
      [companyId, year, entryId],
    );
    return entryId;
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
