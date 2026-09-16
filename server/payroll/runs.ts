import { SqlClient } from "../accounting/types";
import { PostingEngine, ManualEntryLine } from "../accounting/posting-engine";
import { Decimal, add, sum, toMoney, isZero } from "../accounting/decimal";
import { Treasury } from "../treasury/banks";
import { calculatePayslip, DEFAULT_CONCEPTS, PayrollConcept, PayrollCalculationError } from "./engine";
import { ratesFor, PayrollRates } from "./rates";

/**
 * A payroll run, end to end: prepare the month, capture its variable inputs,
 * calculate every payslip, post one entry, pay the net salaries and, the next
 * month, the statutory liabilities.
 *
 * Each step is its own call because each is a different person's job and a
 * different moment: HR captures overtime and bonuses, sales closes commissions
 * (imported, not retyped), the accountant reviews and posts, treasury pays. A
 * draft run recalculates as often as needed; once posted it is final and a
 * correction is a reversal.
 */
export class PayrollRunError extends Error {}

const LIABILITY = {
  net_pay: "2.1.03.001",
  tss: "2.1.03.002",
  infotep: "2.1.03.003",
  isr_salaries: "2.1.03.004",
} as const;
export type LiabilityKind = keyof typeof LIABILITY;

/** Seeds the default concept catalog for a company. Idempotent. */
export async function ensurePayrollConcepts(client: SqlClient, companyId: number): Promise<void> {
  for (const c of DEFAULT_CONCEPTS) {
    await client.query(
      `INSERT INTO payroll_concepts
         (company_id, code, name, kind, calc, multiplier, tss_taxable, isr_taxable, infotep_taxable, account_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (company_id, code) DO NOTHING`,
      [companyId, c.code, c.name, c.kind, c.calc, c.multiplier ?? null, c.tssTaxable, c.isrTaxable, c.infotepTaxable, c.accountCode],
    );
  }
}

export async function loadConcepts(client: SqlClient, companyId: number): Promise<PayrollConcept[]> {
  await ensurePayrollConcepts(client, companyId);
  const { rows } = await client.query(
    `SELECT code, name, kind, calc, multiplier::text, tss_taxable, isr_taxable, infotep_taxable, account_code
       FROM payroll_concepts WHERE company_id=$1 AND is_active ORDER BY id`,
    [companyId],
  );
  return rows.map((r: any) => ({
    code: r.code, name: r.name, kind: r.kind, calc: r.calc, multiplier: r.multiplier ?? undefined,
    tssTaxable: r.tss_taxable, isrTaxable: r.isr_taxable, infotepTaxable: r.infotep_taxable, accountCode: r.account_code,
  }));
}

/**
 * Projects an HR employee into the payroll register.
 *
 * HR (`hr_employees`) is the master: hiring, salary changes and terminations
 * happen there. Payroll keeps its own row per company because runs, payslips and
 * the ledger are company-scoped; this keeps that row in step — code, name,
 * cedula, position, department, salary, dates and whether they are still paid.
 */
export async function syncPayrollEmployee(client: SqlClient, companyId: number, hrEmployeeId: number): Promise<number> {
  const hr = await client.query(
    `SELECT id, employee_code, first_name, last_name, cedula, position_title, department,
            monthly_salary::text, hire_date::text, termination_date::text, employment_status, user_id,
            company_id, payroll_employee_id
       FROM hr_employees WHERE id=$1`,
    [hrEmployeeId],
  );
  if (hr.rows.length === 0) throw new PayrollRunError(`empleado ${hrEmployeeId} no existe en RRHH`);
  const e = hr.rows[0];
  if (e.company_id !== null && Number(e.company_id) !== companyId) {
    throw new PayrollRunError(`el empleado ${e.employee_code} pertenece a otra empresa`);
  }
  const active = ["active", "on_leave", "suspended"].includes(e.employment_status);
  const { rows } = await client.query(
    `INSERT INTO payroll_employees
       (company_id, code, name, cedula, position, base_salary, is_active, hr_employee_id, hire_date,
        termination_date, department, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (company_id, code) DO UPDATE SET
       name=EXCLUDED.name, cedula=EXCLUDED.cedula, position=EXCLUDED.position, base_salary=EXCLUDED.base_salary,
       is_active=EXCLUDED.is_active, hr_employee_id=EXCLUDED.hr_employee_id, hire_date=EXCLUDED.hire_date,
       termination_date=EXCLUDED.termination_date, department=EXCLUDED.department, user_id=EXCLUDED.user_id
     RETURNING id`,
    [
      companyId, e.employee_code, `${e.first_name} ${e.last_name}`.trim(), e.cedula, e.position_title,
      e.monthly_salary, active, e.id, e.hire_date, e.termination_date,
      e.department, e.user_id,
    ],
  );
  const payrollEmployeeId = Number(rows[0].id);
  await client.query(`UPDATE hr_employees SET payroll_employee_id=$1, company_id=$2 WHERE id=$3`, [
    payrollEmployeeId, companyId, hrEmployeeId,
  ]);
  return payrollEmployeeId;
}

export async function prepareRun(
  client: SqlClient,
  input: { companyId: number; year: number; month: number; paymentDate?: string },
): Promise<{ runId: number; periodStart: string; periodEnd: string }> {
  const periodStart = `${input.year}-${String(input.month).padStart(2, "0")}-01`;
  const periodEnd = new Date(Date.UTC(input.year, input.month, 0)).toISOString().slice(0, 10);
  // The concept catalog must exist before anyone captures overtime or bonuses.
  await ensurePayrollConcepts(client, input.companyId);
  const existing = await client.query(
    `SELECT id, status FROM payroll_runs WHERE company_id=$1 AND fiscal_year=$2 AND month=$3`,
    [input.companyId, input.year, input.month],
  );
  if (existing.rows[0]?.status === "posted") {
    throw new PayrollRunError(`la nómina de ${input.year}-${input.month} ya fue procesada`);
  }
  const { rows } = await client.query(
    `INSERT INTO payroll_runs (company_id, fiscal_year, month, status, period_start, period_end, payment_date)
     VALUES ($1,$2,$3,'draft',$4,$5,$6)
     ON CONFLICT (company_id, fiscal_year, month) DO UPDATE
       SET period_start=EXCLUDED.period_start, period_end=EXCLUDED.period_end,
           payment_date=coalesce(EXCLUDED.payment_date, payroll_runs.payment_date)
     RETURNING id`,
    [input.companyId, input.year, input.month, periodStart, periodEnd, input.paymentDate ?? null],
  );
  return { runId: Number(rows[0].id), periodStart, periodEnd };
}

export async function setRunInput(
  client: SqlClient,
  input: {
    companyId: number; runId: number; employeeId: number; code: string;
    quantity?: Decimal; amount?: Decimal; source?: "manual" | "commission" | "attendance"; sourceId?: string; notes?: string;
  },
): Promise<void> {
  const run = await loadRun(client, input.companyId, input.runId);
  if (run.status !== "draft") throw new PayrollRunError("la nómina ya fue contabilizada: no admite cambios");
  await ensurePayrollConcepts(client, input.companyId);
  const concept = await client.query(`SELECT calc FROM payroll_concepts WHERE company_id=$1 AND code=$2`, [input.companyId, input.code]);
  if (concept.rows.length === 0) throw new PayrollRunError(`concepto ${input.code} no existe`);
  await client.query(
    `INSERT INTO payroll_run_inputs (company_id, run_id, employee_id, concept_code, quantity, amount, source, source_id, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (run_id, employee_id, concept_code, source, source_id)
     DO UPDATE SET quantity=EXCLUDED.quantity, amount=EXCLUDED.amount, notes=EXCLUDED.notes`,
    [
      input.companyId, input.runId, input.employeeId, input.code, input.quantity ?? null, input.amount ?? null,
      input.source ?? "manual", input.sourceId ?? "", input.notes ?? null,
    ],
  );
}

/**
 * Pulls the month's approved commissions into the run, one input per earning,
 * so a commission is paid exactly once and traceable to the calculation that
 * produced it.
 */
export async function importCommissions(
  client: SqlClient,
  input: { companyId: number; runId: number },
): Promise<{ imported: number; total: Decimal }> {
  const run = await loadRun(client, input.companyId, input.runId);
  const { rows } = await client.query(
    `SELECT ce.id, ce.total_earned::text, pe.id AS employee_id
       FROM commission_earnings ce
       JOIN payroll_employees pe ON pe.user_id = ce.user_id AND pe.company_id = $1
      WHERE ce.period_year=$2 AND ce.period_month=$3 AND ce.status='approved'
        AND (ce.company_id IS NULL OR ce.company_id = $1)`,
    [input.companyId, run.fiscal_year, run.month],
  );
  let total: Decimal = "0";
  for (const r of rows) {
    if (isZero(r.total_earned)) continue;
    await setRunInput(client, {
      companyId: input.companyId, runId: input.runId, employeeId: Number(r.employee_id), code: "COMISION",
      amount: r.total_earned, source: "commission", sourceId: String(r.id), notes: `Comisión ${run.fiscal_year}-${run.month}`,
    });
    total = add(total, r.total_earned);
  }
  return { imported: rows.length, total };
}

export async function calculateRun(
  client: SqlClient,
  input: { companyId: number; runId: number; rates?: Partial<PayrollRates> },
): Promise<{ employees: number; grossTotal: Decimal; netTotal: Decimal; employerTotal: Decimal }> {
  const run = await loadRun(client, input.companyId, input.runId);
  if (run.status !== "draft") throw new PayrollRunError("la nómina ya fue contabilizada");
  const concepts = await loadConcepts(client, input.companyId);
  const rates = ratesFor(run.period_end, input.rates);

  const emps = await client.query(
    `SELECT id, base_salary::text, hire_date::text, termination_date::text
       FROM payroll_employees
      WHERE company_id=$1
        AND (hire_date IS NULL OR hire_date <= $3::date)
        AND (termination_date IS NULL OR termination_date >= $2::date)
        AND (is_active OR (termination_date IS NOT NULL AND termination_date >= $2::date))
      ORDER BY id`,
    [input.companyId, run.period_start, run.period_end],
  );
  if (emps.rows.length === 0) throw new PayrollRunError("no hay empleados activos en el período");

  await client.query(`DELETE FROM payslips WHERE run_id=$1`, [input.runId]);
  let gross: Decimal = "0";
  let net: Decimal = "0";
  let employer: Decimal = "0";

  for (const e of emps.rows) {
    const inputs = await client.query(
      `SELECT concept_code AS code, quantity::text, amount::text
         FROM payroll_run_inputs WHERE run_id=$1 AND employee_id=$2 ORDER BY id`,
      [input.runId, e.id],
    );
    let p;
    try {
      p = calculatePayslip({
        monthlySalary: e.base_salary,
        periodStart: run.period_start,
        periodEnd: run.period_end,
        hireDate: e.hire_date,
        terminationDate: e.termination_date,
        inputs: inputs.rows.map((r: any) => ({ code: r.code, quantity: r.quantity ?? undefined, amount: r.amount ?? undefined })),
        concepts,
        rates,
      });
    } catch (err) {
      if (err instanceof PayrollCalculationError) throw new PayrollRunError(`empleado ${e.id}: ${err.message}`);
      throw err;
    }

    const slip = await client.query(
      `INSERT INTO payslips (company_id, run_id, employee_id, gross_salary, afp_employee, sfs_employee, isr,
         other_deductions, afp_employer, sfs_employer, infotep, net_pay, srl, tss_base, isr_base, days_worked, base_salary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [
        input.companyId, input.runId, e.id, toMoney(p.earningsTotal), toMoney(p.afpEmployee), toMoney(p.sfsEmployee),
        toMoney(p.isr), toMoney(p.otherDeductions), toMoney(p.afpEmployer), toMoney(p.sfsEmployer), toMoney(p.infotep),
        toMoney(p.netPay), toMoney(p.srl), toMoney(p.tssBase), toMoney(p.isrBase),
        p.daysWorked === "full" ? null : p.daysWorked, toMoney(p.baseSalary),
      ],
    );
    const payslipId = Number(slip.rows[0].id);
    for (const l of p.lines) {
      await client.query(
        `INSERT INTO payslip_lines (company_id, payslip_id, concept_code, concept_name, kind, quantity, rate, amount, account_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [input.companyId, payslipId, l.code, l.name, l.kind, l.quantity === "full" ? null : l.quantity, l.rate, toMoney(l.amount), l.accountCode],
      );
    }
    gross = add(gross, p.earningsTotal);
    net = add(net, p.netPay);
    employer = add(employer, sum([p.afpEmployer, p.sfsEmployer, p.srl, p.infotep]));
  }

  await client.query(
    `UPDATE payroll_runs SET gross_total=$2, net_total=$3, employer_total=$4 WHERE id=$1`,
    [input.runId, toMoney(gross), toMoney(net), toMoney(employer)],
  );
  return { employees: emps.rows.length, grossTotal: gross, netTotal: net, employerTotal: employer };
}

/**
 * Posts the run as one entry, grouped by account:
 *
 *   Dr each earning's expense account (salaries, overtime, commissions, bonuses…)
 *   Dr 5.2.01.002 employer AFP + SFS + SRL      Dr 5.2.01.003 INFOTEP
 *   Cr 2.1.03.001 net pay                       Cr 2.1.03.002 TSS (employee + employer + SRL)
 *   Cr 2.1.03.003 INFOTEP                       Cr 2.1.03.004 ISR withheld (IR-3)
 *   Cr each deduction's account (employee loans, purchases)
 *
 * It balances by construction: earnings − employee deductions = net.
 */
export async function postRun(
  client: SqlClient,
  input: { companyId: number; runId: number; entryDate: string; postedBy?: number },
): Promise<{ journalEntryId: number }> {
  const run = await loadRun(client, input.companyId, input.runId);
  if (run.status === "posted") throw new PayrollRunError("la nómina ya fue contabilizada");
  const slips = await client.query(`SELECT count(*)::int n FROM payslips WHERE run_id=$1`, [input.runId]);
  if (slips.rows[0].n === 0) throw new PayrollRunError("calcule la nómina antes de contabilizarla");

  const { rows } = await client.query(
    `SELECT l.kind, l.account_code, sum(l.amount)::text AS amount
       FROM payslip_lines l JOIN payslips s ON s.id = l.payslip_id
      WHERE s.run_id=$1
      GROUP BY l.kind, l.account_code`,
    [input.runId],
  );
  const debit = new Map<string, Decimal>();
  const credit = new Map<string, Decimal>();
  const bump = (m: Map<string, Decimal>, k: string, v: Decimal) => m.set(k, add(m.get(k) ?? "0", v));
  for (const r of rows) {
    if (r.kind === "earning") bump(debit, r.account_code, r.amount);
    else if (r.kind === "employer") {
      bump(debit, r.account_code, r.amount);
      bump(credit, r.account_code === "5.2.01.003" ? LIABILITY.infotep : LIABILITY.tss, r.amount);
    } else bump(credit, r.account_code, r.amount); // statutory + deductions
  }
  const totals = await client.query(`SELECT sum(net_pay)::text AS net FROM payslips WHERE run_id=$1`, [input.runId]);
  bump(credit, LIABILITY.net_pay, totals.rows[0].net);

  const lines: ManualEntryLine[] = [];
  for (const [code, amount] of debit) if (!isZero(amount)) lines.push({ accountCode: code, debit: toMoney(amount), memo: "Nómina" });
  for (const [code, amount] of credit) if (!isZero(amount)) lines.push({ accountCode: code, credit: toMoney(amount), memo: "Nómina" });

  const posted = await new PostingEngine(client).postManual({
    companyId: input.companyId,
    entryDate: input.entryDate,
    reference: String(input.runId),
    sourceType: "payroll",
    sourceEvent: "run",
    memo: `Nómina ${run.fiscal_year}-${String(run.month).padStart(2, "0")}`,
    lines,
    postedBy: input.postedBy,
  });

  await client.query(`UPDATE payroll_runs SET status='posted', journal_entry_id=$2 WHERE id=$1`, [input.runId, posted.entryId]);
  // Commissions carried by this run are now paid, linked to the payslip that paid them.
  await client.query(
    `UPDATE commission_earnings ce
        SET status='paid', paid_at=now(), payslip_id = s.id, updated_at=now()
       FROM payroll_run_inputs i
       JOIN payslips s ON s.run_id = i.run_id AND s.employee_id = i.employee_id
      WHERE i.run_id=$1 AND i.source='commission' AND ce.id::text = i.source_id`,
    [input.runId],
  );
  return { journalEntryId: posted.entryId };
}

/** Pays the net salaries of a posted run from a bank account. */
export async function payRun(
  client: SqlClient,
  input: { companyId: number; runId: number; bankAccountId: number; date: string; postedBy?: number },
): Promise<{ transactionId: number; amount: Decimal }> {
  const run = await loadRun(client, input.companyId, input.runId);
  if (run.status !== "posted") throw new PayrollRunError("contabilice la nómina antes de pagarla");
  if (run.paid_at) throw new PayrollRunError("la nómina ya fue pagada");
  const amount: Decimal = run.net_total;
  const t = await new Treasury(client).recordMovement({
    companyId: input.companyId, bankAccountId: input.bankAccountId, txnDate: input.date, direction: "out",
    amount, kind: "payroll", counterpartyAccountRef: LIABILITY.net_pay,
    memo: `Pago nómina ${run.fiscal_year}-${run.month}`, reference: `NOM-${run.fiscal_year}-${run.month}`, postedBy: input.postedBy,
  });
  await client.query(`UPDATE payroll_runs SET paid_at=now() WHERE id=$1`, [input.runId]);
  await client.query(
    `INSERT INTO payroll_liability_payments (company_id, run_id, kind, fiscal_year, month, payment_date, amount, bank_transaction_id, journal_entry_id)
     VALUES ($1,$2,'net_pay',$3,$4,$5,$6,$7,$8)`,
    [input.companyId, input.runId, run.fiscal_year, run.month, input.date, toMoney(amount), t.transactionId, t.journalEntryId],
  );
  return { transactionId: t.transactionId, amount };
}

/** What a month's run owes to each authority. */
export async function statutoryLiabilities(client: SqlClient, companyId: number, year: number, month: number) {
  const { rows } = await client.query(
    `SELECT coalesce(sum(s.afp_employee + s.sfs_employee + s.afp_employer + s.sfs_employer + s.srl),0)::text AS tss,
            coalesce(sum(s.infotep),0)::text AS infotep,
            coalesce(sum(s.isr),0)::text AS isr_salaries
       FROM payslips s JOIN payroll_runs r ON r.id = s.run_id
      WHERE r.company_id=$1 AND r.fiscal_year=$2 AND r.month=$3 AND r.status='posted'`,
    [companyId, year, month],
  );
  return rows[0] as { tss: Decimal; infotep: Decimal; isr_salaries: Decimal };
}

/** Pays the TSS, INFOTEP or IR-3 liability of a month from a bank account. */
export async function payStatutory(
  client: SqlClient,
  input: { companyId: number; year: number; month: number; kind: Exclude<LiabilityKind, "net_pay">; bankAccountId: number; date: string; postedBy?: number },
): Promise<{ transactionId: number; amount: Decimal }> {
  const owed = await statutoryLiabilities(client, input.companyId, input.year, input.month);
  const amount = owed[input.kind];
  if (isZero(amount)) throw new PayrollRunError(`no hay ${input.kind} por pagar en ${input.year}-${input.month}`);
  const label = { tss: "TSS", infotep: "INFOTEP", isr_salaries: "ISR asalariados (IR-3)" }[input.kind];
  const t = await new Treasury(client).recordMovement({
    companyId: input.companyId, bankAccountId: input.bankAccountId, txnDate: input.date, direction: "out",
    amount, kind: "tax", counterpartyAccountRef: LIABILITY[input.kind],
    memo: `Pago ${label} ${input.year}-${input.month}`, reference: `${input.kind.toUpperCase()}-${input.year}-${input.month}`,
    postedBy: input.postedBy,
  });
  await client.query(
    `INSERT INTO payroll_liability_payments (company_id, kind, fiscal_year, month, payment_date, amount, bank_transaction_id, journal_entry_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [input.companyId, input.kind, input.year, input.month, input.date, toMoney(amount), t.transactionId, t.journalEntryId],
  );
  return { transactionId: t.transactionId, amount };
}

/** IR-3: ISR withheld from salaried employees in the month. */
export async function generateIr3(client: SqlClient, companyId: number, year: number, month: number) {
  const { rows } = await client.query(
    `SELECT pe.code, pe.name, pe.cedula, s.gross_salary::text, s.isr_base::text, s.isr::text
       FROM payslips s
       JOIN payroll_runs r ON r.id = s.run_id
       JOIN payroll_employees pe ON pe.id = s.employee_id
      WHERE r.company_id=$1 AND r.fiscal_year=$2 AND r.month=$3 AND r.status='posted'
      ORDER BY pe.code`,
    [companyId, year, month],
  );
  const total = rows.reduce((s: Decimal, r: any) => add(s, r.isr), "0");
  return { period: `${year}${String(month).padStart(2, "0")}`, employees: rows, totalRetained: toMoney(total) };
}

/**
 * Every run of the company, newest month first, with what the history screen
 * needs to tell them apart without opening each one: totals, how many payslips,
 * the entry it posted and which of its obligations were already paid.
 *
 * Statutory payments are per month rather than per run (TSS and the IR-3 are
 * filed for the month), so they are matched on year/month; net pay carries the
 * run itself.
 */
export async function listRuns(client: SqlClient, companyId: number, year?: number) {
  const { rows } = await client.query(
    `SELECT r.id, r.fiscal_year, r.month, r.status,
            r.period_start::text, r.period_end::text, r.payment_date::text, r.paid_at, r.created_at,
            r.gross_total::text, r.net_total::text, r.employer_total::text,
            coalesce(s.employees, 0) AS employees, coalesce(s.isr, 0)::text AS isr_total,
            r.journal_entry_id, je.entry_no, je.entry_date::text,
            coalesce((SELECT array_agg(p.kind ORDER BY p.kind) FROM payroll_liability_payments p
                       WHERE p.company_id = r.company_id AND p.fiscal_year = r.fiscal_year AND p.month = r.month),
                     '{}') AS paid_kinds
       FROM payroll_runs r
       LEFT JOIN (SELECT run_id, count(*)::int AS employees, sum(isr) AS isr
                    FROM payslips WHERE company_id = $1 GROUP BY run_id) s ON s.run_id = r.id
       LEFT JOIN journal_entries je ON je.id = r.journal_entry_id
      WHERE r.company_id = $1 AND ($2::int IS NULL OR r.fiscal_year = $2)
      ORDER BY r.fiscal_year DESC, r.month DESC`,
    [companyId, year ?? null],
  );
  return rows;
}

/** The journal entry a posted run produced, line by line. `null` while the run is a draft. */
export async function runJournalEntry(client: SqlClient, companyId: number, runId: number) {
  const run = await client.query(
    `SELECT r.journal_entry_id, je.entry_no, je.entry_date::text, je.memo, je.status
       FROM payroll_runs r LEFT JOIN journal_entries je ON je.id = r.journal_entry_id
      WHERE r.id = $1 AND r.company_id = $2`,
    [runId, companyId],
  );
  if (run.rows.length === 0) throw new PayrollRunError(`nómina ${runId} no existe`);
  const head = run.rows[0];
  if (!head.journal_entry_id) return null;
  const { rows: lines } = await client.query(
    `SELECT l.line_no, a.code AS account_code, a.name AS account_name,
            l.debit_func::text AS debit, l.credit_func::text AS credit, l.memo
       FROM journal_entry_lines l JOIN chart_of_accounts a ON a.id = l.account_id
      WHERE l.entry_id = $1 AND l.company_id = $2
      ORDER BY l.line_no`,
    [head.journal_entry_id, companyId],
  );
  return {
    id: Number(head.journal_entry_id), entryNo: head.entry_no, entryDate: head.entry_date,
    memo: head.memo, status: head.status, lines,
  };
}

async function loadRun(client: SqlClient, companyId: number, runId: number) {
  const { rows } = await client.query(
    `SELECT id, fiscal_year, month, status, period_start::text, period_end::text, net_total::text, paid_at
       FROM payroll_runs WHERE id=$1 AND company_id=$2`,
    [runId, companyId],
  );
  if (rows.length === 0) throw new PayrollRunError(`nómina ${runId} no existe`);
  const r = rows[0];
  if (!r.period_start) {
    r.period_start = `${r.fiscal_year}-${String(r.month).padStart(2, "0")}-01`;
    r.period_end = new Date(Date.UTC(r.fiscal_year, r.month, 0)).toISOString().slice(0, 10);
  }
  return r;
}
