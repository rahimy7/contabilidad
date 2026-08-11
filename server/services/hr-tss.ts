import type { Pool } from "@neondatabase/serverless";

/**
 * TSS (Tesorería de la Seguridad Social).
 *
 * Calcula aportes según la Ley 87-01 y su normativa vigente. Los porcentajes
 * y topes son parámetros para poder ajustarse en el tiempo sin recompilar.
 *
 * Escala vigente al 2026:
 *   AFP  empleado: 2.87% (art. 45)      empleador: 7.10%
 *   SFS  empleado: 3.04% (art. 137)     empleador: 7.09%
 *   INFOTEP: 1.00% (empleador únicamente)
 *   Riesgos Laborales (SRL): 1.30% base + variable por sector (empleador)
 *
 * Topes 2026 (aproximados; se ajustan por resolución de la CNSS):
 *   AFP  cotiza hasta 20 salarios mínimos del sector no sectorizado
 *   SFS  cotiza hasta 10 salarios mínimos del sector no sectorizado
 *
 * Como el salario mínimo cambia, el llamador puede pasarlo explícitamente
 * (`minSalary`) — por defecto usa el vigente para el año.
 */

export interface TssRates {
  afpEmployee: number;   // 0.0287
  afpEmployer: number;   // 0.0710
  sfsEmployee: number;   // 0.0304
  sfsEmployer: number;   // 0.0709
  infotep: number;       // 0.0100
  srl: number;           // 0.0130
  afpCapMultiplier: number;  // 20 salarios mínimos
  sfsCapMultiplier: number;  // 10 salarios mínimos
  /** Sueldo mínimo del sector no sectorizado; ajustable por resolución CNSS. */
  minSalary: number;
}

/** Tasas al 2026. Actualizar cuando la CNSS publique nuevo salario mínimo. */
export const DEFAULT_RATES_2026: TssRates = {
  afpEmployee: 0.0287,
  afpEmployer: 0.0710,
  sfsEmployee: 0.0304,
  sfsEmployer: 0.0709,
  infotep: 0.0100,
  srl: 0.0130,
  afpCapMultiplier: 20,
  sfsCapMultiplier: 10,
  minSalary: 15000,
};

export interface TssContributions {
  grossSalary: number;
  afpBase: number;
  sfsBase: number;
  afpEmployee: number;
  afpEmployer: number;
  sfsEmployee: number;
  sfsEmployer: number;
  infotep: number;
  srl: number;
  totalEmployee: number;
  totalEmployer: number;
  totalToTss: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Aportes a la TSS a partir de un salario bruto mensual. Usa topes y tasas
 * pasados; devuelve el desglose exacto para poder reportar.
 */
export function computeTssContributions(
  grossSalary: number,
  rates: TssRates = DEFAULT_RATES_2026,
): TssContributions {
  const afpCap = rates.minSalary * rates.afpCapMultiplier;
  const sfsCap = rates.minSalary * rates.sfsCapMultiplier;
  const afpBase = Math.min(grossSalary, afpCap);
  const sfsBase = Math.min(grossSalary, sfsCap);

  const afpEmployee = round2(afpBase * rates.afpEmployee);
  const afpEmployer = round2(afpBase * rates.afpEmployer);
  const sfsEmployee = round2(sfsBase * rates.sfsEmployee);
  const sfsEmployer = round2(sfsBase * rates.sfsEmployer);
  const infotep = round2(grossSalary * rates.infotep);
  const srl = round2(grossSalary * rates.srl);

  const totalEmployee = round2(afpEmployee + sfsEmployee);
  const totalEmployer = round2(afpEmployer + sfsEmployer + infotep + srl);
  const totalToTss = round2(totalEmployee + totalEmployer);

  return {
    grossSalary: round2(grossSalary),
    afpBase: round2(afpBase),
    sfsBase: round2(sfsBase),
    afpEmployee, afpEmployer, sfsEmployee, sfsEmployer, infotep, srl,
    totalEmployee, totalEmployer, totalToTss,
  };
}

// ── Novedades ───────────────────────────────────────────────────────────────

export type NovedadCode = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
export const NOVEDAD_LABELS: Record<NovedadCode, string> = {
  "1": "Alta",
  "2": "Baja",
  "3": "Cambio de salario",
  "4": "Licencia médica",
  "5": "Maternidad/lactancia",
  "6": "Suspensión",
  "7": "Vacaciones",
  "8": "Reingreso",
  "9": "Corrección",
};

export interface RegisterNovedadInput {
  storeId: number;
  employeeId: number;
  novedadCode: NovedadCode;
  periodYear: number;
  periodMonth: number;
  effectiveDate: string;
  oldSalary?: number;
  newSalary?: number;
  daysOff?: number;
  reason?: string;
}

export async function registerNovedad(pool: Pool, input: RegisterNovedadInput) {
  const r = await pool.query(
    `INSERT INTO hr_tss_novedades
       (store_id, employee_id, novedad_code, period_year, period_month,
        effective_date, old_salary, new_salary, days_off, reason)
     VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10)
     RETURNING id`,
    [
      input.storeId, input.employeeId, input.novedadCode, input.periodYear,
      input.periodMonth, input.effectiveDate,
      input.oldSalary != null ? String(input.oldSalary) : null,
      input.newSalary != null ? String(input.newSalary) : null,
      input.daysOff ?? null, input.reason ?? null,
    ],
  );
  return { novedadId: r.rows[0].id };
}

/**
 * Cambio de salario detectado por el sistema: automáticamente genera la
 * novedad tipo 3 para que aparezca en el SUIR+ del período correspondiente.
 */
export async function autoNovedadOnSalaryChange(
  pool: Pool,
  storeId: number,
  employeeId: number,
  oldSalary: number,
  newSalary: number,
  effectiveDate: string,
) {
  if (oldSalary === newSalary) return null;
  const dt = new Date(effectiveDate);
  return registerNovedad(pool, {
    storeId, employeeId, novedadCode: "3",
    periodYear: dt.getUTCFullYear(),
    periodMonth: dt.getUTCMonth() + 1,
    effectiveDate,
    oldSalary, newSalary,
    reason: "Cambio automático detectado por el sistema",
  });
}

export async function listPendingNovedades(pool: Pool, storeId: number, year: number, month: number) {
  const r = await pool.query(
    `SELECT n.id, n.employee_id AS "employeeId", e.employee_code AS "employeeCode",
            e.first_name AS "firstName", e.last_name AS "lastName",
            n.novedad_code AS "novedadCode",
            n.effective_date::text AS "effectiveDate",
            n.old_salary::text AS "oldSalary", n.new_salary::text AS "newSalary",
            n.days_off AS "daysOff", n.reason
       FROM hr_tss_novedades n
       JOIN hr_employees e ON e.id = n.employee_id
      WHERE n.store_id = $1 AND n.period_year = $2 AND n.period_month = $3
        AND n.status = 'pending'
      ORDER BY n.novedad_code, e.employee_code`,
    [storeId, year, month],
  );
  return { rows: r.rows };
}

// ── SUIR+ (planilla) ────────────────────────────────────────────────────────

/**
 * Genera el envío del período: totaliza aportes de todos los empleados
 * activos, adjunta las novedades pendientes y devuelve el resumen listo
 * para revisar antes de reportar al portal SUIR+.
 */
export async function prepareTssSubmission(
  pool: Pool,
  storeId: number,
  year: number,
  month: number,
  rates: TssRates = DEFAULT_RATES_2026,
) {
  // Empleados activos en el período; se lista con AFP/ARS.
  const employees = await pool.query(
    `SELECT e.id, e.employee_code AS "employeeCode",
            e.first_name AS "firstName", e.last_name AS "lastName",
            e.monthly_salary::numeric AS "monthlySalary",
            e.ars_covers_dependents AS "coversDependents",
            afp.code AS "afpFundCode", ars.code AS "arsProviderCode"
       FROM hr_employees e
       LEFT JOIN hr_afp_funds afp ON afp.id = e.afp_fund_id
       LEFT JOIN hr_ars_providers ars ON ars.id = e.ars_provider_id
      WHERE e.store_id = $1
        AND e.employment_status IN ('active','on_leave')
      ORDER BY e.employee_code`,
    [storeId],
  );

  const lines = employees.rows.map((r) => {
    const gross = Number(r.monthlySalary);
    const c = computeTssContributions(gross, rates);
    return {
      employeeId: r.id,
      employeeCode: r.employeeCode,
      firstName: r.firstName,
      lastName: r.lastName,
      afpFundCode: r.afpFundCode,
      arsProviderCode: r.arsProviderCode,
      coversDependents: r.coversDependents,
      ...c,
    };
  });

  const totals = lines.reduce((acc, l) => ({
    employees: acc.employees + 1,
    gross: acc.gross + l.grossSalary,
    afpEmp: acc.afpEmp + l.afpEmployee,
    afpEr: acc.afpEr + l.afpEmployer,
    sfsEmp: acc.sfsEmp + l.sfsEmployee,
    sfsEr: acc.sfsEr + l.sfsEmployer,
    infotep: acc.infotep + l.infotep,
    srl: acc.srl + l.srl,
  }), { employees: 0, gross: 0, afpEmp: 0, afpEr: 0, sfsEmp: 0, sfsEr: 0, infotep: 0, srl: 0 });

  const totalToTss = round2(totals.afpEmp + totals.sfsEmp + totals.afpEr + totals.sfsEr + totals.infotep + totals.srl);

  const novedades = await listPendingNovedades(pool, storeId, year, month);

  return {
    period: { year, month },
    employeeCount: totals.employees,
    totals: {
      grossSalaries: round2(totals.gross),
      afpEmployee: round2(totals.afpEmp),
      afpEmployer: round2(totals.afpEr),
      sfsEmployee: round2(totals.sfsEmp),
      sfsEmployer: round2(totals.sfsEr),
      infotep: round2(totals.infotep),
      srl: round2(totals.srl),
      totalToTss,
    },
    lines,
    novedades: novedades.rows,
  };
}

/**
 * Crea la fila de envío en la BD con los detalles calculados. El archivo
 * SUIR+ real se genera aparte (formato del portal); esto guarda el trazo
 * interno para reproducir.
 */
export async function saveTssSubmission(
  pool: Pool,
  storeId: number,
  year: number,
  month: number,
  submittedBy: number,
  rates: TssRates = DEFAULT_RATES_2026,
) {
  const prep = await prepareTssSubmission(pool, storeId, year, month, rates);

  const sub = await pool.query(
    `INSERT INTO hr_tss_submissions
       (store_id, period_year, period_month, submission_type, employee_count,
        total_gross, total_afp_employee, total_sfs_employee, total_afp_employer,
        total_sfs_employer, total_infotep, total_srl, total_to_tss, status,
        submitted_by)
     VALUES ($1, $2, $3, 'ambos', $4, $5, $6, $7, $8, $9, $10, $11, $12,
             'draft', $13)
     RETURNING id`,
    [
      storeId, year, month, prep.employeeCount,
      String(prep.totals.grossSalaries),
      String(prep.totals.afpEmployee), String(prep.totals.sfsEmployee),
      String(prep.totals.afpEmployer), String(prep.totals.sfsEmployer),
      String(prep.totals.infotep), String(prep.totals.srl),
      String(prep.totals.totalToTss),
      submittedBy,
    ],
  );
  const subId = sub.rows[0].id;

  for (const l of prep.lines) {
    await pool.query(
      `INSERT INTO hr_tss_submission_lines
         (submission_id, employee_id, afp_fund_code, ars_provider_code,
          gross_salary, afp_employee, sfs_employee, afp_employer,
          sfs_employer, infotep, srl, covers_dependents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        subId, l.employeeId, l.afpFundCode, l.arsProviderCode,
        String(l.grossSalary), String(l.afpEmployee), String(l.sfsEmployee),
        String(l.afpEmployer), String(l.sfsEmployer), String(l.infotep),
        String(l.srl), l.coversDependents,
      ],
    );
  }

  return { submissionId: subId, prep };
}

export async function markSubmissionSubmitted(pool: Pool, submissionId: number, receiptId?: string) {
  await pool.query(
    `UPDATE hr_tss_submissions
        SET status = 'submitted', submitted_at = now(),
            tss_receipt_id = $2, updated_at = now()
      WHERE id = $1 AND status = 'draft'`,
    [submissionId, receiptId ?? null],
  );
  await pool.query(
    `UPDATE hr_tss_novedades
        SET status = 'reported', reported_at = now()
      WHERE store_id = (SELECT store_id FROM hr_tss_submissions WHERE id = $1)
        AND period_year = (SELECT period_year FROM hr_tss_submissions WHERE id = $1)
        AND period_month = (SELECT period_month FROM hr_tss_submissions WHERE id = $1)
        AND status = 'pending'`,
    [submissionId],
  );
}
