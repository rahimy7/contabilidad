import type { Pool } from "@neondatabase/serverless";
import { requestApproval, getById as getApproval } from "./approvals";

/**
 * Asistencia y vacaciones/permisos.
 *
 * Asistencia: cada empleado tiene una fila por día. Marcar entrada crea la fila,
 * marcar salida la completa y calcula horas trabajadas y tardanza. Un cierre de
 * período congela las filas para nómina.
 *
 * Vacaciones/permisos: la solicitud crea una `approval_requests`; al aprobarse
 * baja el balance y crea filas de asistencia con estado `leave`. Sin este
 * enlace, un supervisor da vacaciones sin ver quién más quedó sin cobertura.
 */

// ── Asistencia ──────────────────────────────────────────────────────────────

const STANDARD_WORK_MINUTES = 8 * 60;
const LATE_THRESHOLD_MINUTES = 5;

export async function clockIn(pool: Pool, input: {
  storeId: number;
  employeeId: number;
  workDate?: string;
  clockInAt?: Date;
  checkMethod?: "manual" | "biometric" | "geolocated" | "system";
  ipAddress?: string;
  locationLat?: number;
  locationLng?: number;
  expectedStartTime?: string;
}) {
  const workDate = input.workDate ?? new Date().toISOString().slice(0, 10);
  const clockInAt = input.clockInAt ?? new Date();

  let isLate = false;
  let lateMinutes = 0;
  if (input.expectedStartTime) {
    const expected = new Date(`${workDate}T${input.expectedStartTime}`);
    const diff = Math.round((clockInAt.getTime() - expected.getTime()) / 60000);
    if (diff > LATE_THRESHOLD_MINUTES) {
      isLate = true;
      lateMinutes = diff;
    }
  }

  const r = await pool.query(
    `INSERT INTO hr_attendance_records
       (store_id, employee_id, work_date, clock_in, is_late, late_minutes,
        status, check_method, ip_address, location_lat, location_lng)
     VALUES ($1, $2, $3::date, $4, $5, $6, 'present', $7, $8, $9, $10)
     ON CONFLICT (employee_id, work_date) DO UPDATE
       SET clock_in = COALESCE(hr_attendance_records.clock_in, EXCLUDED.clock_in),
           is_late = EXCLUDED.is_late,
           late_minutes = EXCLUDED.late_minutes,
           updated_at = now()
     RETURNING id`,
    [
      input.storeId, input.employeeId, workDate, clockInAt.toISOString(),
      isLate, lateMinutes, input.checkMethod ?? "manual",
      input.ipAddress ?? null, input.locationLat ?? null, input.locationLng ?? null,
    ],
  );
  return { attendanceId: r.rows[0].id, isLate, lateMinutes };
}

export async function clockOut(pool: Pool, input: {
  employeeId: number;
  workDate?: string;
  clockOutAt?: Date;
  breakMinutes?: number;
}) {
  const workDate = input.workDate ?? new Date().toISOString().slice(0, 10);
  const clockOutAt = input.clockOutAt ?? new Date();
  const breakMin = input.breakMinutes ?? 0;

  const cur = await pool.query(
    `SELECT id, clock_in FROM hr_attendance_records
      WHERE employee_id = $1 AND work_date = $2::date`,
    [input.employeeId, workDate],
  );
  if (!cur.rowCount || !cur.rows[0].clock_in) {
    throw new Error("no hay marca de entrada para hoy");
  }
  const clockIn = new Date(cur.rows[0].clock_in);
  const minutes = Math.max(0, Math.round((clockOutAt.getTime() - clockIn.getTime()) / 60000) - breakMin);
  const hoursWorked = +(minutes / 60).toFixed(2);
  const overtimeMinutes = Math.max(0, minutes - STANDARD_WORK_MINUTES);
  const overtimeHours = +(overtimeMinutes / 60).toFixed(2);

  await pool.query(
    `UPDATE hr_attendance_records
        SET clock_out = $2, break_minutes = $3, hours_worked = $4,
            overtime_hours = $5, updated_at = now()
      WHERE id = $1`,
    [
      cur.rows[0].id, clockOutAt.toISOString(), breakMin,
      String(hoursWorked), String(overtimeHours),
    ],
  );
  return { attendanceId: cur.rows[0].id, hoursWorked, overtimeHours };
}

export async function attendanceSummary(pool: Pool, input: {
  storeId: number;
  from: string;
  to: string;
  employeeId?: number;
}) {
  const params: unknown[] = [input.storeId, input.from, input.to];
  let where = "store_id = $1 AND work_date BETWEEN $2::date AND $3::date";
  if (input.employeeId != null) {
    params.push(input.employeeId);
    where += ` AND employee_id = $${params.length}`;
  }
  const r = await pool.query(
    `SELECT employee_id AS "employeeId",
            count(*)::int AS "totalDays",
            count(*) FILTER (WHERE status = 'present')::int AS "presentDays",
            count(*) FILTER (WHERE status = 'absent')::int AS "absentDays",
            count(*) FILTER (WHERE is_late = true)::int AS "lateDays",
            count(*) FILTER (WHERE status = 'leave')::int AS "leaveDays",
            coalesce(sum(hours_worked), 0)::text AS "hoursWorked",
            coalesce(sum(overtime_hours), 0)::text AS "overtimeHours",
            coalesce(sum(late_minutes), 0)::int AS "lateMinutesTotal"
       FROM hr_attendance_records
      WHERE ${where}
      GROUP BY employee_id
      ORDER BY employee_id`,
    params,
  );
  return { rows: r.rows };
}

export async function closeAttendancePeriod(pool: Pool, input: {
  storeId: number;
  periodStart: string;
  periodEnd: string;
  closedBy: number;
}) {
  const r = await pool.query(
    `INSERT INTO hr_attendance_periods
       (store_id, period_start, period_end, status, closed_by, closed_at)
     VALUES ($1, $2::date, $3::date, 'closed', $4, now())
     ON CONFLICT (store_id, period_start, period_end)
     DO UPDATE SET status = 'closed', closed_by = EXCLUDED.closed_by, closed_at = now()
     RETURNING id`,
    [input.storeId, input.periodStart, input.periodEnd, input.closedBy],
  );
  return { periodId: r.rows[0].id };
}

// ── Vacaciones / permisos ──────────────────────────────────────────────────

export async function seedDefaultTimeOffTypes(pool: Pool, storeId: number) {
  const defaults = [
    { code: "vacation", name: "Vacaciones", accrualDays: 14, requiresApproval: true, isPaid: true },
    { code: "sick", name: "Licencia médica", accrualDays: 0, requiresApproval: true, isPaid: true, requiresMedical: true },
    { code: "maternity", name: "Licencia de maternidad", accrualDays: 0, requiresApproval: true, isPaid: true },
    { code: "paternity", name: "Licencia de paternidad", accrualDays: 0, requiresApproval: true, isPaid: true },
    { code: "bereavement", name: "Duelo", accrualDays: 3, requiresApproval: false, isPaid: true },
    { code: "personal", name: "Permiso personal", accrualDays: 0, requiresApproval: true, isPaid: false },
  ];
  let inserted = 0;
  for (const t of defaults) {
    const r = await pool.query(
      `INSERT INTO hr_time_off_types
         (store_id, code, name, is_paid, requires_approval,
          accrual_days_per_year, requires_medical_certificate)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING RETURNING id`,
      [
        storeId, t.code, t.name, t.isPaid, t.requiresApproval,
        String(t.accrualDays), t.requiresMedical ?? false,
      ],
    );
    if (r.rowCount) inserted++;
  }
  return { inserted };
}

/**
 * Solicita días libres. Si el tipo requiere aprobación, arma la `approval_requests`
 * con `documentType='time_off'`; el motor decide el aprobador según reglas del
 * store. El balance no se descuenta hasta que apruebe.
 */
export async function requestTimeOff(pool: Pool, input: {
  storeId: number;
  employeeId: number;
  typeId: number;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason?: string;
  medicalCertificateUrl?: string;
}) {
  const type = await pool.query(`SELECT * FROM hr_time_off_types WHERE id = $1`, [input.typeId]);
  if (!type.rowCount) throw new Error("tipo de permiso no existe");
  const t = type.rows[0];
  if (t.requires_medical_certificate && !input.medicalCertificateUrl) {
    throw new Error("este tipo requiere certificado médico");
  }

  const requiresApproval = t.requires_approval === true;
  const status = requiresApproval ? "pending" : "approved";

  const r = await pool.query(
    `INSERT INTO hr_time_off_requests
       (store_id, employee_id, type_id, start_date, end_date, total_days,
        reason, medical_certificate_url, status)
     VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,$8,$9) RETURNING id`,
    [
      input.storeId, input.employeeId, input.typeId, input.startDate,
      input.endDate, String(input.totalDays), input.reason ?? null,
      input.medicalCertificateUrl ?? null, status,
    ],
  );
  const requestId = r.rows[0].id;

  // Anotar como pendiente en el balance mientras se decide.
  if (requiresApproval) {
    await pool.query(
      `INSERT INTO hr_time_off_balances (employee_id, type_id, fiscal_year, days_pending)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (employee_id, type_id, fiscal_year)
       DO UPDATE SET days_pending = hr_time_off_balances.days_pending + EXCLUDED.days_pending,
                     updated_at = now()`,
      [input.employeeId, input.typeId, new Date(input.startDate).getFullYear(), String(input.totalDays)],
    );

    // Motor genérico de aprobaciones.
    const approval = await requestApproval(pool, {
      storeId: input.storeId,
      documentType: "time_off",
      documentId: String(requestId),
      documentRef: `TO-${requestId}`,
      amount: input.totalDays,
      currency: "days",
      reason: input.reason,
      requestedBy: input.employeeId,
    });
    await pool.query(
      `UPDATE hr_time_off_requests SET approval_request_id = $2 WHERE id = $1`,
      [requestId, approval.id],
    );
  } else {
    // Sin aprobación: baja el balance directo.
    await consumeBalance(pool, input.employeeId, input.typeId, input.totalDays, input.startDate);
  }

  return { requestId, requiresApproval };
}

async function consumeBalance(
  pool: Pool,
  employeeId: number,
  typeId: number,
  days: number,
  startDate: string,
) {
  const year = new Date(startDate).getFullYear();
  await pool.query(
    `INSERT INTO hr_time_off_balances (employee_id, type_id, fiscal_year, days_used)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (employee_id, type_id, fiscal_year)
     DO UPDATE SET days_used = hr_time_off_balances.days_used + EXCLUDED.days_used,
                   updated_at = now()`,
    [employeeId, typeId, year, String(days)],
  );
}

/** Sincroniza el estado de la solicitud con el motor de aprobaciones. */
export async function syncTimeOffApproval(pool: Pool, requestId: number) {
  const cur = await pool.query(
    `SELECT id, employee_id, type_id, total_days, start_date::text AS start_date,
            status, approval_request_id
       FROM hr_time_off_requests WHERE id = $1`,
    [requestId],
  );
  if (!cur.rowCount) return null;
  const req = cur.rows[0];
  if (!req.approval_request_id) return req;
  if (["approved", "rejected", "cancelled"].includes(req.status)) return req;

  const approval = await getApproval(pool, req.approval_request_id);
  if (approval.status === "approved" && req.status === "pending") {
    await pool.query(`UPDATE hr_time_off_requests SET status = 'approved', reviewed_at = now() WHERE id = $1`, [req.id]);
    await pool.query(
      `UPDATE hr_time_off_balances
          SET days_pending = greatest(0, days_pending - $4::numeric),
              days_used = days_used + $4::numeric,
              updated_at = now()
        WHERE employee_id = $1 AND type_id = $2 AND fiscal_year = $3`,
      [req.employee_id, req.type_id, new Date(req.start_date).getFullYear(), req.total_days],
    );
  } else if (approval.status === "rejected" && req.status === "pending") {
    await pool.query(`UPDATE hr_time_off_requests SET status = 'rejected', reviewed_at = now() WHERE id = $1`, [req.id]);
    await pool.query(
      `UPDATE hr_time_off_balances
          SET days_pending = greatest(0, days_pending - $4::numeric),
              updated_at = now()
        WHERE employee_id = $1 AND type_id = $2 AND fiscal_year = $3`,
      [req.employee_id, req.type_id, new Date(req.start_date).getFullYear(), req.total_days],
    );
  }
  return getTimeOffRequest(pool, requestId);
}

export async function getTimeOffRequest(pool: Pool, id: number) {
  const r = await pool.query(
    `SELECT id, employee_id AS "employeeId", type_id AS "typeId",
            start_date::text AS "startDate", end_date::text AS "endDate",
            total_days::text AS "totalDays", reason, status,
            approval_request_id AS "approvalRequestId",
            reviewed_at::text AS "reviewedAt", review_notes AS "reviewNotes"
       FROM hr_time_off_requests WHERE id = $1`,
    [id],
  );
  return r.rows[0] ?? null;
}

export async function getBalances(pool: Pool, employeeId: number, fiscalYear?: number) {
  const year = fiscalYear ?? new Date().getFullYear();
  const r = await pool.query(
    `SELECT b.id, b.type_id AS "typeId", t.code, t.name,
            b.fiscal_year AS "fiscalYear",
            b.days_entitled::text AS "daysEntitled",
            b.days_carried_over::text AS "daysCarriedOver",
            b.days_used::text AS "daysUsed",
            b.days_pending::text AS "daysPending",
            (b.days_entitled + b.days_carried_over - b.days_used - b.days_pending)::text AS "daysRemaining"
       FROM hr_time_off_balances b
       JOIN hr_time_off_types t ON t.id = b.type_id
      WHERE b.employee_id = $1 AND b.fiscal_year = $2
      ORDER BY t.code`,
    [employeeId, year],
  );
  return { rows: r.rows };
}

/**
 * Asigna el balance anual a un empleado (típicamente al inicio del año o al
 * contratar). Se hace con base en el catálogo de tipos y sus días de
 * acumulación.
 */
export async function grantAnnualBalance(pool: Pool, employeeId: number, storeId: number, fiscalYear: number) {
  const types = await pool.query(
    `SELECT id, accrual_days_per_year FROM hr_time_off_types
      WHERE store_id = $1 AND is_active = true AND accrual_days_per_year > 0`,
    [storeId],
  );
  for (const t of types.rows) {
    await pool.query(
      `INSERT INTO hr_time_off_balances (employee_id, type_id, fiscal_year, days_entitled)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (employee_id, type_id, fiscal_year)
       DO UPDATE SET days_entitled = EXCLUDED.days_entitled, updated_at = now()`,
      [employeeId, t.id, fiscalYear, String(t.accrual_days_per_year)],
    );
  }
  return { granted: types.rowCount ?? 0 };
}
