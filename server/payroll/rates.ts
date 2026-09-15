import { Decimal } from "../accounting/decimal";

/**
 * Dominican payroll parameters — one source of truth.
 *
 * Before this module the payroll run and the TSS service each kept their own
 * copy of the rates and disagreed on the ceilings (payroll capped SFS at
 * 217,440, TSS at 150,000), so a salary above 150k produced two different
 * contributions depending on which screen you asked. Both now read from here.
 *
 * Parameters are effective-dated: a CNSS resolution or a new DGII scale adds a
 * row with a later `validFrom`, and documents computed before it keep the rates
 * they were computed with. A company can override any value through
 * `companies.settings.payroll` (for example its SRL rate, which depends on the
 * risk category of its activity).
 *
 * VALIDAR CON EL CONTADOR antes de producción: salario mínimo cotizable vigente,
 * tasa SRL de la empresa y tramos de ISR del año.
 */
export interface IsrBracket {
  /** Upper bound of the monthly taxable base; null = no upper bound. */
  upTo: Decimal | null;
  rate: Decimal;
  /** Fixed tax at the start of the bracket. */
  base: Decimal;
  /** Where the bracket starts. */
  from: Decimal;
}

export interface PayrollRates {
  validFrom: string;
  afpEmployee: Decimal;
  afpEmployer: Decimal;
  sfsEmployee: Decimal;
  sfsEmployer: Decimal;
  /** Seguro de riesgos laborales, employer only. */
  srl: Decimal;
  infotep: Decimal;
  /** Salario mínimo cotizable used to derive the contribution ceilings. */
  minContributableWage: Decimal;
  afpCapMultiplier: number;
  sfsCapMultiplier: number;
  srlCapMultiplier: number;
  /** Monthly ISR scale (the annual DGII scale / 12). */
  isrBrackets: IsrBracket[];
  /** Código de Trabajo: monthly salary / 23.83 = daily wage. */
  dailyDivisor: Decimal;
  hoursPerDay: Decimal;
  /** Overtime premiums over the hourly rate (art. 203): +35% and +100%. */
  overtime35: Decimal;
  overtime100: Decimal;
}

const RATES: PayrollRates[] = [
  {
    validFrom: "2024-01-01",
    afpEmployee: "0.0287",
    afpEmployer: "0.0710",
    sfsEmployee: "0.0304",
    sfsEmployer: "0.0709",
    srl: "0.0130",
    infotep: "0.0100",
    // 434,880 / 20 = 217,440 / 10 = 21,744: the ceilings the payroll run has
    // always used, now expressed as the wage they derive from.
    minContributableWage: "21744.00",
    afpCapMultiplier: 20,
    sfsCapMultiplier: 10,
    srlCapMultiplier: 4,
    isrBrackets: [
      { upTo: "34685.00", rate: "0", base: "0", from: "0" },
      { upTo: "52027.00", rate: "0.15", base: "0", from: "34685.00" },
      { upTo: "72260.00", rate: "0.20", base: "2601.30", from: "52027.00" },
      { upTo: null, rate: "0.25", base: "6647.90", from: "72260.00" },
    ],
    dailyDivisor: "23.83",
    hoursPerDay: "8",
    overtime35: "1.35",
    overtime100: "2.00",
  },
];

/** The parameters in force on a date, with any company override applied. */
export function ratesFor(date: string, override?: Partial<PayrollRates>): PayrollRates {
  const applicable = RATES.filter((r) => r.validFrom <= date).sort((a, b) => b.validFrom.localeCompare(a.validFrom));
  const base = applicable[0] ?? RATES[0];
  return override ? { ...base, ...override } : base;
}

export const ceilings = (r: PayrollRates) => ({
  afp: (Number(r.minContributableWage) * r.afpCapMultiplier).toFixed(2),
  sfs: (Number(r.minContributableWage) * r.sfsCapMultiplier).toFixed(2),
  srl: (Number(r.minContributableWage) * r.srlCapMultiplier).toFixed(2),
});

/** The same parameters in the numeric shape the TSS service consumes. */
export function toTssRates(r: PayrollRates) {
  return {
    afpEmployee: Number(r.afpEmployee),
    afpEmployer: Number(r.afpEmployer),
    sfsEmployee: Number(r.sfsEmployee),
    sfsEmployer: Number(r.sfsEmployer),
    infotep: Number(r.infotep),
    srl: Number(r.srl),
    afpCapMultiplier: r.afpCapMultiplier,
    sfsCapMultiplier: r.sfsCapMultiplier,
    srlCapMultiplier: r.srlCapMultiplier,
    minSalary: Number(r.minContributableWage),
  };
}
