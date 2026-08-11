import type { Pool } from "@neondatabase/serverless";

/**
 * Cálculo de prestaciones laborales — Código de Trabajo de la República
 * Dominicana.
 *
 * Base legal principal (arts. 76-95 y 176-180):
 *   • Preaviso (art. 76):
 *       - 3-6 meses de servicio: 7 días
 *       - 6 meses a 1 año:       14 días
 *       - Más de 1 año:          28 días
 *   • Auxilio de cesantía (art. 80):
 *       - 3-6 meses:          6 días por año
 *       - 6 meses a 1 año:   13 días por año
 *       - 1 a 5 años:        21 días por cada año
 *       - Más de 5 años:     23 días por cada año
 *   • Vacaciones (art. 177):
 *       - Menos de 5 años: 14 días
 *       - 5 años o más:    18 días
 *     Proporcional al tiempo trabajado si sale antes.
 *   • Regalía pascual — salario 13 (art. 219 sqq.):
 *     Doceava parte del salario ordinario devengado en el año calendario.
 *
 * Salario diario legal = salario_mensual / 23.83 (constante DR).
 *
 * Aplicación por tipo de terminación:
 *   employer_dismissal_no_cause (desahucio art. 75/80): TODO
 *   employer_dismissal_with_cause (art. 88, con causa probada): sólo lo pendiente
 *   employee_resignation (dimisión art. 77): sólo lo pendiente, sin cesantía
 *   employee_resignation_justified (art. 96/97): TODO igual que si el empleador desahució
 *   mutual_agreement: se pacta; el sistema calcula todo y el usuario ajusta
 *   death, retirement, end_of_contract: pendientes + vacaciones + regalía
 */

export const DR_DAILY_WAGE_DIVISOR = 23.83;

export type TerminationType =
  | "employer_dismissal_no_cause"
  | "employer_dismissal_with_cause"
  | "employee_resignation"
  | "employee_resignation_justified"
  | "mutual_agreement"
  | "death"
  | "retirement"
  | "end_of_contract";

export interface TerminationInput {
  storeId: number;
  employeeId: number;
  terminationDate: string; // ISO date
  terminationType: TerminationType;
  reasonCode?: string;
  reason?: string;
  /** Salario pendiente hasta la fecha de salida (si no lo pasa, es 0). */
  pendingSalary?: number;
  /** Beneficios extra por política interna. */
  otherBenefits?: number;
  deductionsAmount?: number;
  preparedBy: number;
  notes?: string;
}

export interface TerminationCalculation {
  yearsOfService: number;
  monthsExtra: number;
  dailyWage: number;
  noticeDays: number;
  noticeAmount: number;
  severanceDays: number;
  severanceAmount: number;
  proportionalVacationDays: number;
  proportionalVacationAmount: number;
  proportionalChristmasBonus: number;
  pendingSalary: number;
  otherBenefits: number;
  grossTotal: number;
  deductionsAmount: number;
  netTotal: number;
  breakdown: Record<string, unknown>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeYearsAndMonths(
  hireDate: string,
  terminationDate: string,
): { years: number; monthsExtra: number; totalMonths: number } {
  // Se leen los campos por separado para evitar que la zona horaria del proceso
  // desplace el día al parsear el string ISO.
  const [sy, sm, sd] = hireDate.split("-").map(Number);
  const [ey, em, ed] = terminationDate.split("-").map(Number);
  if (
    Number.isNaN(sy) || Number.isNaN(sm) || Number.isNaN(sd) ||
    Number.isNaN(ey) || Number.isNaN(em) || Number.isNaN(ed)
  ) {
    throw new Error("fecha inválida");
  }
  if (ey < sy || (ey === sy && em < sm) || (ey === sy && em === sm && ed < sd)) {
    throw new Error("la fecha de salida no puede ser anterior a la fecha de contratación");
  }

  let years = ey - sy;
  let months = em - sm;
  const days = ed - sd;
  if (days < 0) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  const totalMonths = years * 12 + months;
  return { years: Math.max(0, years), monthsExtra: Math.max(0, months), totalMonths };
}

/** Días de preaviso según antigüedad (art. 76). */
export function noticeDaysForTenure(totalMonths: number): number {
  if (totalMonths < 3) return 0;
  if (totalMonths < 6) return 7;
  if (totalMonths < 12) return 14;
  return 28;
}

/** Días de cesantía por año completo (art. 80). */
export function severanceDaysPerYear(totalMonths: number): number {
  if (totalMonths < 6) return 6;
  if (totalMonths < 12) return 13;
  // Superior a cinco años (más de 60 meses): tasa del 6to año en adelante.
  if (totalMonths <= 60) return 21;
  return 23;
}

/** Días de vacaciones anuales (art. 177). */
export function annualVacationDays(totalMonths: number): number {
  return totalMonths >= 60 ? 18 : 14;
}

/**
 * Cálculo puro (sin BD) — recibe los datos de entrada y devuelve el desglose.
 * `computeTermination()` los toma de la BD y llama a esta función.
 */
export function calculateBenefits(input: {
  hireDate: string;
  terminationDate: string;
  monthlySalary: number;
  terminationType: TerminationType;
  pendingSalary?: number;
  otherBenefits?: number;
  deductionsAmount?: number;
  /** Salario devengado en el año calendario para regalía (art. 219).
   *  Si no lo pasa, se aproxima usando monthlySalary × meses hasta terminación. */
  yearToDateEarnings?: number;
}): TerminationCalculation {
  const { years, monthsExtra, totalMonths } = computeYearsAndMonths(input.hireDate, input.terminationDate);
  // Sueldo diario: se guarda con 4 decimales para reportería; los cálculos
  // internos usan la razón exacta para evitar deriva de redondeo.
  const dailyWageExact = input.monthlySalary / DR_DAILY_WAGE_DIVISOR;
  const dailyWage = Math.round(dailyWageExact * 10000) / 10000;

  // Cuándo aplica CADA componente según el tipo de terminación.
  // Preaviso: sólo lo debe el empleador cuando desahucia sin causa; si no lo
  // da, lo paga en dinero. El empleado que renuncia debería darlo al patrón —
  // el sistema no lo cobra al empleado.
  // Cesantía: art. 80 la debe el empleador en desahucio sin causa y en
  // dimisión justificada del trabajador; NO se paga en despido con causa,
  // renuncia sin justa causa, fin de contrato o retiro.
  // Vacaciones y regalía siempre proporcionales.
  const owesNotice = ["employer_dismissal_no_cause", "employee_resignation_justified"].includes(input.terminationType);
  const owesSeverance = ["employer_dismissal_no_cause", "employee_resignation_justified"].includes(input.terminationType);

  // Preaviso.
  const noticeDays = owesNotice ? noticeDaysForTenure(totalMonths) : 0;
  const noticeAmount = round2(noticeDays * dailyWageExact);

  // Cesantía: la ley usa "años completos"; en 3-12 meses hay una regla especial
  // (6 o 13 días para todo el período, sin multiplicar por años).
  let severanceDays = 0;
  if (owesSeverance) {
    if (totalMonths < 3) severanceDays = 0;
    else if (totalMonths < 6) severanceDays = 6;
    else if (totalMonths < 12) severanceDays = 13;
    else {
      const rate = severanceDaysPerYear(totalMonths);
      severanceDays = rate * years;
    }
  }
  const severanceAmount = round2(severanceDays * dailyWageExact);

  // Vacaciones proporcionales (art. 177). Al empleado que sale se le paga la
  // parte de las vacaciones anuales que le corresponde.
  const annualVacation = annualVacationDays(totalMonths);
  // Si tiene menos de 1 año, la proporción es (meses trabajados / 12) × 14.
  // Si tiene más, se calcula sobre el año en curso (mes actual dentro del año).
  const monthsInCurrentYear = years === 0 ? totalMonths : ((totalMonths - years * 12) === 0 ? 12 : monthsExtra);
  const vacationProportion = years === 0
    ? Math.min(totalMonths, 12) / 12
    : monthsInCurrentYear / 12;
  const proportionalVacationDays = round2(annualVacation * vacationProportion);
  const proportionalVacationAmount = round2(proportionalVacationDays * dailyWageExact);

  // Regalía pascual (art. 219): 1/12 del salario devengado en el año calendario.
  // Si el llamador no pasa el devengado real, se aproxima con salario × meses
  // trabajados en el año hasta la fecha de salida (usando la misma lógica de
  // meses completos que el resto del módulo).
  const termYearNum = Number(input.terminationDate.slice(0, 4));
  const startOfYearIso = `${termYearNum}-01-01`;
  const hireIso = input.hireDate;
  const effectiveStartIso = hireIso > startOfYearIso ? hireIso : startOfYearIso;
  const yearScope = computeYearsAndMonths(effectiveStartIso, input.terminationDate);
  const ytd = input.yearToDateEarnings ?? (input.monthlySalary * yearScope.totalMonths);
  const proportionalChristmasBonus = round2(ytd / 12);

  const pendingSalary = input.pendingSalary ?? 0;
  const otherBenefits = input.otherBenefits ?? 0;
  const deductionsAmount = input.deductionsAmount ?? 0;

  const grossTotal = round2(
    noticeAmount + severanceAmount + proportionalVacationAmount +
    proportionalChristmasBonus + pendingSalary + otherBenefits,
  );
  const netTotal = round2(grossTotal - deductionsAmount);

  return {
    yearsOfService: years,
    monthsExtra,
    dailyWage,
    noticeDays,
    noticeAmount,
    severanceDays,
    severanceAmount,
    proportionalVacationDays,
    proportionalVacationAmount,
    proportionalChristmasBonus,
    pendingSalary,
    otherBenefits,
    grossTotal,
    deductionsAmount,
    netTotal,
    breakdown: {
      totalMonthsOfService: totalMonths,
      annualVacationDaysApplicable: annualVacation,
      vacationProportionApplied: round2(vacationProportion * 100) / 100,
      severanceDaysPerYearApplicable: severanceDaysPerYear(totalMonths),
      yearToDateEarningsUsed: ytd,
      owesNotice, owesSeverance,
    },
  };
}

// ── Persistencia ────────────────────────────────────────────────────────────

export async function computeTermination(pool: Pool, input: TerminationInput): Promise<TerminationCalculation> {
  const emp = await pool.query(
    `SELECT hire_date::text AS hire_date, monthly_salary::text AS monthly_salary
       FROM hr_employees WHERE id = $1 AND store_id = $2`,
    [input.employeeId, input.storeId],
  );
  if (!emp.rowCount) throw new Error(`empleado ${input.employeeId} no existe`);
  return calculateBenefits({
    hireDate: emp.rows[0].hire_date,
    terminationDate: input.terminationDate,
    monthlySalary: Number(emp.rows[0].monthly_salary),
    terminationType: input.terminationType,
    pendingSalary: input.pendingSalary,
    otherBenefits: input.otherBenefits,
    deductionsAmount: input.deductionsAmount,
  });
}

export async function saveTermination(pool: Pool, input: TerminationInput) {
  const emp = await pool.query(
    `SELECT hire_date::text AS hire_date, monthly_salary::text AS monthly_salary,
            employment_status
       FROM hr_employees WHERE id = $1 AND store_id = $2`,
    [input.employeeId, input.storeId],
  );
  if (!emp.rowCount) throw new Error(`empleado ${input.employeeId} no existe`);
  if (emp.rows[0].employment_status === "terminated") {
    throw new Error("el empleado ya está terminado");
  }

  const calc = calculateBenefits({
    hireDate: emp.rows[0].hire_date,
    terminationDate: input.terminationDate,
    monthlySalary: Number(emp.rows[0].monthly_salary),
    terminationType: input.terminationType,
    pendingSalary: input.pendingSalary,
    otherBenefits: input.otherBenefits,
    deductionsAmount: input.deductionsAmount,
  });

  const r = await pool.query(
    `INSERT INTO hr_terminations
       (store_id, employee_id, termination_date, termination_type, reason_code,
        reason, hire_date, monthly_salary, daily_wage, years_of_service,
        months_extra, notice_days, notice_amount, severance_days,
        severance_amount, proportional_vacation_days,
        proportional_vacation_amount, proportional_christmas_bonus,
        pending_salary, other_benefits, gross_total, deductions_amount,
        net_total, calculation_breakdown, status, prepared_by, notes)
     VALUES ($1, $2, $3::date, $4, $5, $6, $7::date, $8, $9, $10, $11, $12,
             $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
             'draft', $25, $26)
     RETURNING id`,
    [
      input.storeId, input.employeeId, input.terminationDate, input.terminationType,
      input.reasonCode ?? null, input.reason ?? null,
      emp.rows[0].hire_date, String(emp.rows[0].monthly_salary), String(calc.dailyWage),
      calc.yearsOfService, calc.monthsExtra,
      calc.noticeDays, String(calc.noticeAmount),
      calc.severanceDays, String(calc.severanceAmount),
      String(calc.proportionalVacationDays), String(calc.proportionalVacationAmount),
      String(calc.proportionalChristmasBonus),
      String(calc.pendingSalary), String(calc.otherBenefits),
      String(calc.grossTotal), String(calc.deductionsAmount),
      String(calc.netTotal),
      JSON.stringify(calc.breakdown),
      input.preparedBy, input.notes ?? null,
    ],
  );
  return { terminationId: r.rows[0].id, calculation: calc };
}

/**
 * Al aprobar el cálculo, se marca al empleado como `terminated` y se congela
 * su expediente. No se toca el histórico de contratos ni posiciones — se
 * cierran naturalmente con la fecha de salida.
 */
export async function approveTermination(pool: Pool, terminationId: number, approvedBy: number) {
  const t = await pool.query(
    `SELECT id, employee_id, termination_date, status FROM hr_terminations WHERE id = $1`,
    [terminationId],
  );
  if (!t.rowCount) throw new Error(`terminación ${terminationId} no existe`);
  if (t.rows[0].status === "approved" || t.rows[0].status === "paid") {
    return { alreadyApproved: true };
  }

  await pool.query(
    `UPDATE hr_terminations
        SET status = 'approved', approved_by = $2, approved_at = now(), updated_at = now()
      WHERE id = $1`,
    [terminationId, approvedBy],
  );
  await pool.query(
    `UPDATE hr_employees
        SET employment_status = 'terminated',
            termination_date = $2::date,
            updated_at = now()
      WHERE id = $1`,
    [t.rows[0].employee_id, t.rows[0].termination_date],
  );
  await pool.query(
    `UPDATE hr_employment_contracts
        SET is_current = false, end_date = $2::date
      WHERE employee_id = $1 AND is_current = true`,
    [t.rows[0].employee_id, t.rows[0].termination_date],
  );
  await pool.query(
    `UPDATE hr_positions
        SET is_current = false, effective_to = $2::date
      WHERE employee_id = $1 AND is_current = true`,
    [t.rows[0].employee_id, t.rows[0].termination_date],
  );
  return { alreadyApproved: false };
}

export async function markTerminationPaid(
  pool: Pool,
  terminationId: number,
  paymentMethod: string,
  referenceNumber: string,
) {
  await pool.query(
    `UPDATE hr_terminations
        SET status = 'paid', paid_at = now(),
            payment_method = $2, reference_number = $3, updated_at = now()
      WHERE id = $1 AND status = 'approved'`,
    [terminationId, paymentMethod, referenceNumber],
  );
}

export async function getTermination(pool: Pool, id: number) {
  const r = await pool.query(
    `SELECT * FROM hr_terminations WHERE id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}
