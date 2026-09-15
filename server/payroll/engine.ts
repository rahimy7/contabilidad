import { Decimal, add, sub, mul, cmp, roundTo, sum, isZero, isNegative } from "../accounting/decimal";
import { PayrollRates, ceilings } from "./rates";

/**
 * The payslip calculation, as a pure function.
 *
 * No database, no clock: salary, dates, the variable inputs of the month and the
 * rates in force go in, every line of the payslip comes out. That is what lets a
 * test check a commission, an overtime hour or a mid-month hire against an
 * independent hand calculation instead of against whatever the code happened to
 * do.
 *
 * What the month pays is a list of *concepts*. Each carries three flags that
 * decide whether it counts towards the TSS contribution base, the ISR base and
 * the INFOTEP base — the part of Dominican payroll that is easy to get wrong.
 * Commissions and overtime are salary for every purpose; a bonificación is taxed
 * for ISR but does not contribute to TSS; the regalía pascual is exempt from
 * both. The flags are data on the concept, so a change of criterion is a row
 * update, not a code change.
 */

export type ConceptKind = "earning" | "deduction";
export type ConceptCalc = "system" | "input_amount" | "hours";

export interface PayrollConcept {
  code: string;
  name: string;
  kind: ConceptKind;
  calc: ConceptCalc;
  /** For `hours`: multiplier over the hourly rate (1.35, 2.00). */
  multiplier?: Decimal;
  tssTaxable: boolean;
  isrTaxable: boolean;
  infotepTaxable: boolean;
  /** Earnings: the expense account debited. Deductions: the account credited. */
  accountCode: string;
}

/** Seeded per company; the flags are the starting criterion, validate with the accountant. */
export const DEFAULT_CONCEPTS: PayrollConcept[] = [
  { code: "SUELDO", name: "Salario ordinario", kind: "earning", calc: "system", tssTaxable: true, isrTaxable: true, infotepTaxable: true, accountCode: "5.2.01.001" },
  { code: "HE35", name: "Horas extras (35%)", kind: "earning", calc: "hours", multiplier: "1.35", tssTaxable: true, isrTaxable: true, infotepTaxable: true, accountCode: "5.2.01.004" },
  { code: "HE100", name: "Horas extras (100%)", kind: "earning", calc: "hours", multiplier: "2.00", tssTaxable: true, isrTaxable: true, infotepTaxable: true, accountCode: "5.2.01.004" },
  { code: "COMISION", name: "Comisiones sobre ventas", kind: "earning", calc: "input_amount", tssTaxable: true, isrTaxable: true, infotepTaxable: true, accountCode: "5.2.01.005" },
  { code: "INCENTIVO", name: "Incentivo por desempeño", kind: "earning", calc: "input_amount", tssTaxable: true, isrTaxable: true, infotepTaxable: true, accountCode: "5.2.01.006" },
  { code: "BONIFICACION", name: "Bonificación", kind: "earning", calc: "input_amount", tssTaxable: false, isrTaxable: true, infotepTaxable: false, accountCode: "5.2.01.006" },
  { code: "REGALIA", name: "Regalía pascual", kind: "earning", calc: "input_amount", tssTaxable: false, isrTaxable: false, infotepTaxable: false, accountCode: "5.2.01.007" },
  { code: "OTROS_NO_GRAV", name: "Otros ingresos no gravados", kind: "earning", calc: "input_amount", tssTaxable: false, isrTaxable: false, infotepTaxable: false, accountCode: "5.2.01.006" },
  { code: "PRESTAMO", name: "Descuento préstamo / avance", kind: "deduction", calc: "input_amount", tssTaxable: false, isrTaxable: false, infotepTaxable: false, accountCode: "1.1.05.001" },
  { code: "DESC_COMPRAS", name: "Descuento compras de empleado", kind: "deduction", calc: "input_amount", tssTaxable: false, isrTaxable: false, infotepTaxable: false, accountCode: "1.1.05.001" },
];

export interface PayslipInput {
  /** Contract monthly salary. */
  monthlySalary: Decimal;
  periodStart: string;
  periodEnd: string;
  hireDate?: string | null;
  terminationDate?: string | null;
  /** Variable inputs for the period: hours for `hours` concepts, amounts otherwise. */
  inputs: Array<{ code: string; quantity?: Decimal; amount?: Decimal }>;
  concepts: PayrollConcept[];
  rates: PayrollRates;
}

export interface PayslipLine {
  code: string;
  name: string;
  kind: ConceptKind | "statutory" | "employer";
  quantity: Decimal | null;
  rate: Decimal | null;
  amount: Decimal;
  accountCode: string;
}

export interface PayslipCalculation {
  daysWorked: Decimal;
  baseSalary: Decimal;
  lines: PayslipLine[];
  earningsTotal: Decimal;
  tssBase: Decimal;
  isrBase: Decimal;
  afpEmployee: Decimal;
  sfsEmployee: Decimal;
  isr: Decimal;
  otherDeductions: Decimal;
  afpEmployer: Decimal;
  sfsEmployer: Decimal;
  srl: Decimal;
  infotep: Decimal;
  netPay: Decimal;
}

export class PayrollCalculationError extends Error {}

const r2 = (d: Decimal) => roundTo(d, 2);
const min = (a: Decimal, b: Decimal) => (cmp(a, b) <= 0 ? a : b);

/**
 * Working days an employee was on the books within the period, weighting
 * Saturday as half a day — the same convention behind the 23.83 divisor
 * (5.5 days × 52 weeks / 12). A full month returns null: it pays the contract
 * salary exactly, with no proration rounding.
 */
export function workedDays(periodStart: string, periodEnd: string, hireDate?: string | null, terminationDate?: string | null): Decimal | null {
  const from = hireDate && hireDate > periodStart ? hireDate : periodStart;
  const to = terminationDate && terminationDate < periodEnd ? terminationDate : periodEnd;
  if (from === periodStart && to === periodEnd) return null;
  if (from > to) return "0";
  let halfDays = 0;
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    if (dow === 0) continue;
    halfDays += dow === 6 ? 1 : 2;
  }
  return (halfDays / 2).toFixed(1);
}

export function isrFor(monthlyBase: Decimal, rates: PayrollRates): Decimal {
  if (cmp(monthlyBase, "0") <= 0) return "0";
  for (const b of rates.isrBrackets) {
    if (b.upTo === null || cmp(monthlyBase, b.upTo) <= 0) {
      if (isZero(b.rate)) return "0";
      return r2(add(b.base, mul(sub(monthlyBase, b.from), b.rate)));
    }
  }
  return "0";
}

export function calculatePayslip(input: PayslipInput): PayslipCalculation {
  const { rates } = input;
  const byCode = new Map(input.concepts.map((c) => [c.code, c]));
  const dailyWage = (monthly: Decimal) => roundTo(String(Number(monthly) / Number(rates.dailyDivisor)), 8);

  const days = workedDays(input.periodStart, input.periodEnd, input.hireDate, input.terminationDate);
  const baseSalary = days === null
    ? r2(input.monthlySalary)
    : r2(min(mul(dailyWage(input.monthlySalary), days), input.monthlySalary));
  const hourly = roundTo(String(Number(dailyWage(input.monthlySalary)) / Number(rates.hoursPerDay)), 8);

  const lines: PayslipLine[] = [];
  const salaryConcept = byCode.get("SUELDO") ?? DEFAULT_CONCEPTS[0];
  if (!isZero(baseSalary)) {
    lines.push({
      code: salaryConcept.code, name: salaryConcept.name, kind: "earning",
      quantity: days, rate: null, amount: baseSalary, accountCode: salaryConcept.accountCode,
    });
  }

  let otherDeductions: Decimal = "0";
  for (const inp of input.inputs) {
    const concept = byCode.get(inp.code);
    if (!concept) throw new PayrollCalculationError(`concepto de nómina desconocido: ${inp.code}`);
    if (concept.calc === "system") continue;
    let amount: Decimal;
    let rate: Decimal | null = null;
    if (concept.calc === "hours") {
      if (!inp.quantity) throw new PayrollCalculationError(`${concept.code} requiere cantidad de horas`);
      rate = roundTo(mul(hourly, concept.multiplier ?? "1"), 8);
      amount = r2(mul(inp.quantity, rate));
    } else {
      amount = r2(inp.amount ?? "0");
    }
    if (isNegative(amount)) throw new PayrollCalculationError(`${concept.code}: el monto no puede ser negativo`);
    if (isZero(amount)) continue;
    lines.push({
      code: concept.code, name: concept.name, kind: concept.kind,
      quantity: inp.quantity ?? null, rate, amount, accountCode: concept.accountCode,
    });
    if (concept.kind === "deduction") otherDeductions = add(otherDeductions, amount);
  }

  const earnings = lines.filter((l) => l.kind === "earning");
  const flag = (l: PayslipLine, f: "tssTaxable" | "isrTaxable" | "infotepTaxable") =>
    (byCode.get(l.code) ?? salaryConcept)[f];
  const earningsTotal = sum(earnings.map((l) => l.amount));
  const tssBase = sum(earnings.filter((l) => flag(l, "tssTaxable")).map((l) => l.amount));
  const infotepBase = sum(earnings.filter((l) => flag(l, "infotepTaxable")).map((l) => l.amount));
  const isrGross = sum(earnings.filter((l) => flag(l, "isrTaxable")).map((l) => l.amount));

  const cap = ceilings(rates);
  const afpBase = min(tssBase, cap.afp);
  const sfsBase = min(tssBase, cap.sfs);
  const srlBase = min(tssBase, cap.srl);

  const afpEmployee = r2(mul(afpBase, rates.afpEmployee));
  const sfsEmployee = r2(mul(sfsBase, rates.sfsEmployee));
  const afpEmployer = r2(mul(afpBase, rates.afpEmployer));
  const sfsEmployer = r2(mul(sfsBase, rates.sfsEmployer));
  const srl = r2(mul(srlBase, rates.srl));
  const infotep = r2(mul(infotepBase, rates.infotep));

  // ISR is charged on taxable salary net of the employee's own TSS.
  const isrBase = r2(sub(isrGross, add(afpEmployee, sfsEmployee)));
  const isr = isrFor(isrBase, rates);

  const statutory: Array<[string, string, Decimal, string]> = [
    ["AFP", "AFP empleado (2.87%)", afpEmployee, "2.1.03.002"],
    ["SFS", "SFS empleado (3.04%)", sfsEmployee, "2.1.03.002"],
    ["ISR", "ISR retenido", isr, "2.1.03.004"],
  ];
  for (const [code, name, amount, accountCode] of statutory) {
    if (!isZero(amount)) lines.push({ code, name, kind: "statutory", quantity: null, rate: null, amount, accountCode });
  }
  const employer: Array<[string, string, Decimal, string]> = [
    ["AFP_ER", "AFP empleador (7.10%)", afpEmployer, "5.2.01.002"],
    ["SFS_ER", "SFS empleador (7.09%)", sfsEmployer, "5.2.01.002"],
    ["SRL", "Riesgos laborales", srl, "5.2.01.002"],
    ["INFOTEP", "INFOTEP (1%)", infotep, "5.2.01.003"],
  ];
  for (const [code, name, amount, accountCode] of employer) {
    if (!isZero(amount)) lines.push({ code, name, kind: "employer", quantity: null, rate: null, amount, accountCode });
  }

  const netPay = r2(sub(earningsTotal, sum([afpEmployee, sfsEmployee, isr, otherDeductions])));
  if (isNegative(netPay)) {
    throw new PayrollCalculationError(
      `las deducciones (${sum([afpEmployee, sfsEmployee, isr, otherDeductions])}) superan los ingresos (${earningsTotal})`,
    );
  }

  return {
    daysWorked: days ?? "full",
    baseSalary,
    lines,
    earningsTotal,
    tssBase,
    isrBase,
    afpEmployee,
    sfsEmployee,
    isr,
    otherDeductions,
    afpEmployer,
    sfsEmployer,
    srl,
    infotep,
    netPay,
  };
}
