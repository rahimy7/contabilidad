import type { Pool } from "@neondatabase/serverless";

/**
 * Expediente del empleado: alta, actualización, cambio de puesto y salario,
 * documentos y contactos. Anclado a `store_id`; el enlace opcional con
 * `users.id` permite tener empleados sin acceso al sistema.
 *
 * Coherencia con nómina: cuando el empleado tiene sueldo definido y hay
 * `payroll_employees` en la misma empresa, se sincroniza el `base_salary`.
 * Se hace desde acá (best-effort) para no atar la creación a que exista un
 * `companyId` — un mensajero sin acceso al sistema igual necesita expediente.
 */

export interface HireEmployeeInput {
  storeId: number;
  userId?: number;
  firstName: string;
  lastName: string;
  cedula?: string;
  passport?: string;
  tssNumber?: string;
  nationality?: string;
  birthDate?: string;
  gender?: "M" | "F" | "O";
  maritalStatus?: string;
  personalEmail?: string;
  personalPhone?: string;
  homeAddress?: string;
  homeProvince?: string;
  homeMunicipality?: string;
  homeSector?: string;
  hireDate: string;
  contractType?: string;
  department?: string;
  positionTitle?: string;
  supervisorId?: number;
  workLocation?: string;
  monthlySalary: number;
  paymentFrequency?: "monthly" | "biweekly" | "weekly" | "daily";
  paymentMethod?: string;
  notes?: string;
}

async function nextEmployeeCode(pool: Pool, storeId: number): Promise<string> {
  await pool.query(
    `INSERT INTO hr_employee_sequences (store_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [storeId],
  );
  const r = await pool.query(
    `UPDATE hr_employee_sequences SET next_number = next_number + 1
      WHERE store_id = $1 RETURNING prefix, next_number - 1 AS n`,
    [storeId],
  );
  return `${r.rows[0].prefix}-${String(r.rows[0].n).padStart(6, "0")}`;
}

export async function hireEmployee(pool: Pool, input: HireEmployeeInput) {
  const code = await nextEmployeeCode(pool, input.storeId);
  const r = await pool.query(
    `INSERT INTO hr_employees
       (store_id, user_id, employee_code, first_name, last_name, cedula,
        passport, tss_number, nationality, birth_date, gender, marital_status,
        personal_email, personal_phone, home_address, home_province,
        home_municipality, home_sector, hire_date, contract_type, department,
        position_title, supervisor_id, work_location, monthly_salary,
        payment_frequency, payment_method, notes, employment_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
             $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,'active')
     RETURNING id`,
    [
      input.storeId, input.userId ?? null, code, input.firstName, input.lastName,
      input.cedula ?? null, input.passport ?? null, input.tssNumber ?? null,
      input.nationality ?? "DO", input.birthDate ?? null, input.gender ?? null,
      input.maritalStatus ?? null, input.personalEmail ?? null,
      input.personalPhone ?? null, input.homeAddress ?? null,
      input.homeProvince ?? null, input.homeMunicipality ?? null,
      input.homeSector ?? null, input.hireDate, input.contractType ?? "indefinite",
      input.department ?? null, input.positionTitle ?? null,
      input.supervisorId ?? null, input.workLocation ?? null,
      String(input.monthlySalary), input.paymentFrequency ?? "monthly",
      input.paymentMethod ?? null, input.notes ?? null,
    ],
  );
  const id = r.rows[0].id;

  // Contrato inicial + puesto inicial se crean para tener histórico desde el día 1.
  await pool.query(
    `INSERT INTO hr_employment_contracts
       (employee_id, contract_type, start_date, is_indefinite, monthly_salary, is_current)
     VALUES ($1, $2, $3, $4, $5, true)`,
    [
      id, input.contractType ?? "indefinite", input.hireDate,
      (input.contractType ?? "indefinite") === "indefinite",
      String(input.monthlySalary),
    ],
  );
  await pool.query(
    `INSERT INTO hr_positions
       (employee_id, position_title, department, supervisor_id, monthly_salary,
        effective_from, change_reason, is_current)
     VALUES ($1, $2, $3, $4, $5, $6, 'hiring', true)`,
    [
      id, input.positionTitle ?? "Sin definir", input.department ?? null,
      input.supervisorId ?? null, String(input.monthlySalary), input.hireDate,
    ],
  );

  return getEmployee(pool, id);
}

export async function getEmployee(pool: Pool, id: number) {
  const r = await pool.query(
    `SELECT id, store_id AS "storeId", user_id AS "userId",
            payroll_employee_id AS "payrollEmployeeId",
            employee_code AS "employeeCode",
            first_name AS "firstName", last_name AS "lastName",
            cedula, passport, tss_number AS "tssNumber", nationality,
            birth_date::text AS "birthDate", gender, marital_status AS "maritalStatus",
            personal_email AS "personalEmail", personal_phone AS "personalPhone",
            home_address AS "homeAddress", home_province AS "homeProvince",
            home_municipality AS "homeMunicipality", home_sector AS "homeSector",
            hire_date::text AS "hireDate", termination_date::text AS "terminationDate",
            employment_status AS "employmentStatus", contract_type AS "contractType",
            department, position_title AS "positionTitle",
            supervisor_id AS "supervisorId", work_location AS "workLocation",
            monthly_salary::text AS "monthlySalary",
            payment_frequency AS "paymentFrequency",
            payment_method AS "paymentMethod", notes,
            created_at::text AS "createdAt", updated_at::text AS "updatedAt"
       FROM hr_employees WHERE id = $1`,
    [id],
  );
  if (!r.rowCount) throw new Error(`empleado ${id} no existe`);
  return r.rows[0];
}

export async function listEmployees(
  pool: Pool,
  storeId: number,
  filters: { status?: string; department?: string; search?: string } = {},
) {
  const params: unknown[] = [storeId];
  const where: string[] = ["store_id = $1"];
  if (filters.status) { params.push(filters.status); where.push(`employment_status = $${params.length}`); }
  if (filters.department) { params.push(filters.department); where.push(`department = $${params.length}`); }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    where.push(`(first_name ILIKE $${params.length} OR last_name ILIKE $${params.length} OR employee_code ILIKE $${params.length} OR cedula ILIKE $${params.length})`);
  }
  const r = await pool.query(
    `SELECT id, employee_code AS "employeeCode", first_name AS "firstName",
            last_name AS "lastName", cedula, department, position_title AS "positionTitle",
            hire_date::text AS "hireDate", employment_status AS "employmentStatus",
            monthly_salary::text AS "monthlySalary"
       FROM hr_employees WHERE ${where.join(" AND ")}
       ORDER BY last_name, first_name LIMIT 500`,
    params,
  );
  return { rows: r.rows };
}

export interface UpdatePositionInput {
  employeeId: number;
  positionTitle: string;
  department?: string;
  supervisorId?: number;
  monthlySalary: number;
  effectiveFrom: string;
  changeReason: "promotion" | "demotion" | "transfer" | "raise" | "adjustment" | "other";
  notes?: string;
}

/**
 * Cambio de puesto/salario. Cierra el puesto actual con `effective_to = day
 * before` y crea el nuevo como current. Actualiza también los campos
 * denormalizados en `hr_employees`.
 */
export async function updatePosition(pool: Pool, input: UpdatePositionInput) {
  const current = await pool.query(
    `SELECT id FROM hr_positions WHERE employee_id = $1 AND is_current = true`,
    [input.employeeId],
  );
  const previousId = current.rows[0]?.id ?? null;

  if (previousId) {
    await pool.query(
      `UPDATE hr_positions
          SET is_current = false, effective_to = ($1::date - INTERVAL '1 day')::date
        WHERE id = $2`,
      [input.effectiveFrom, previousId],
    );
  }

  const r = await pool.query(
    `INSERT INTO hr_positions
       (employee_id, position_title, department, supervisor_id, monthly_salary,
        effective_from, change_reason, previous_id, is_current, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9) RETURNING id`,
    [
      input.employeeId, input.positionTitle, input.department ?? null,
      input.supervisorId ?? null, String(input.monthlySalary),
      input.effectiveFrom, input.changeReason, previousId, input.notes ?? null,
    ],
  );

  await pool.query(
    `UPDATE hr_employees
        SET position_title = $2, department = $3, supervisor_id = $4,
            monthly_salary = $5, updated_at = now()
      WHERE id = $1`,
    [
      input.employeeId, input.positionTitle, input.department ?? null,
      input.supervisorId ?? null, String(input.monthlySalary),
    ],
  );

  return { positionId: r.rows[0].id };
}

// ── Documentos ──────────────────────────────────────────────────────────────

export interface AddDocumentInput {
  storeId: number;
  employeeId: number;
  documentType: string;
  title: string;
  fileUrl: string;
  fileSizeBytes?: number;
  mimeType?: string;
  issuedAt?: string;
  expiresAt?: string;
  uploadedBy: number;
  description?: string;
}

export async function addEmployeeDocument(pool: Pool, input: AddDocumentInput) {
  const r = await pool.query(
    `INSERT INTO hr_employee_documents
       (store_id, employee_id, document_type, title, description, file_url,
        file_size_bytes, mime_type, issued_at, expires_at, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [
      input.storeId, input.employeeId, input.documentType, input.title,
      input.description ?? null, input.fileUrl, input.fileSizeBytes ?? null,
      input.mimeType ?? null, input.issuedAt ?? null, input.expiresAt ?? null,
      input.uploadedBy,
    ],
  );
  return { documentId: r.rows[0].id };
}

/** Documentos vencidos o por vencer en N días. */
export async function documentsExpiring(pool: Pool, storeId: number, days = 30) {
  const r = await pool.query(
    `SELECT d.id, d.employee_id AS "employeeId", e.employee_code AS "employeeCode",
            e.first_name AS "firstName", e.last_name AS "lastName",
            d.document_type AS "documentType", d.title,
            d.expires_at::text AS "expiresAt",
            (d.expires_at - CURRENT_DATE)::int AS "daysLeft"
       FROM hr_employee_documents d
       JOIN hr_employees e ON e.id = d.employee_id
      WHERE d.store_id = $1 AND d.is_current = true
        AND d.expires_at IS NOT NULL
        AND d.expires_at <= CURRENT_DATE + $2::int
      ORDER BY d.expires_at ASC LIMIT 500`,
    [storeId, days],
  );
  return { rows: r.rows };
}

// ── Contratos vencidos o por vencer ────────────────────────────────────────

export async function contractsExpiring(pool: Pool, storeId: number, days = 60) {
  const r = await pool.query(
    `SELECT c.id, c.employee_id AS "employeeId", e.employee_code AS "employeeCode",
            e.first_name AS "firstName", e.last_name AS "lastName",
            c.contract_type AS "contractType",
            c.start_date::text AS "startDate",
            c.end_date::text AS "endDate",
            (c.end_date - CURRENT_DATE)::int AS "daysLeft"
       FROM hr_employment_contracts c
       JOIN hr_employees e ON e.id = c.employee_id
      WHERE e.store_id = $1 AND c.is_current = true
        AND c.end_date IS NOT NULL
        AND c.end_date <= CURRENT_DATE + $2::int
      ORDER BY c.end_date ASC LIMIT 200`,
    [storeId, days],
  );
  return { rows: r.rows };
}

export async function addEmergencyContact(pool: Pool, input: {
  employeeId: number;
  name: string;
  relationship: string;
  phonePrimary: string;
  phoneSecondary?: string;
  email?: string;
  address?: string;
  isPrimary?: boolean;
}) {
  const r = await pool.query(
    `INSERT INTO hr_emergency_contacts
       (employee_id, name, relationship, phone_primary, phone_secondary,
        email, address, is_primary)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      input.employeeId, input.name, input.relationship, input.phonePrimary,
      input.phoneSecondary ?? null, input.email ?? null, input.address ?? null,
      input.isPrimary ?? false,
    ],
  );
  return { contactId: r.rows[0].id };
}

export async function getEmployeeFull(pool: Pool, id: number) {
  const employee = await getEmployee(pool, id);
  const [contracts, positions, documents, emergency, dependents, bankAccounts] = await Promise.all([
    pool.query(
      `SELECT id, contract_type AS "contractType", start_date::text AS "startDate",
              end_date::text AS "endDate", is_indefinite AS "isIndefinite",
              monthly_salary::text AS "monthlySalary", is_current AS "isCurrent",
              document_url AS "documentUrl", probation_ends_at::text AS "probationEndsAt"
         FROM hr_employment_contracts WHERE employee_id = $1
         ORDER BY start_date DESC`,
      [id],
    ),
    pool.query(
      `SELECT id, position_title AS "positionTitle", department,
              monthly_salary::text AS "monthlySalary",
              effective_from::text AS "effectiveFrom",
              effective_to::text AS "effectiveTo",
              change_reason AS "changeReason", is_current AS "isCurrent"
         FROM hr_positions WHERE employee_id = $1
         ORDER BY effective_from DESC`,
      [id],
    ),
    pool.query(
      `SELECT id, document_type AS "documentType", title, file_url AS "fileUrl",
              issued_at::text AS "issuedAt", expires_at::text AS "expiresAt",
              is_current AS "isCurrent", created_at::text AS "createdAt"
         FROM hr_employee_documents WHERE employee_id = $1 AND is_current = true
         ORDER BY created_at DESC`,
      [id],
    ),
    pool.query(
      `SELECT id, name, relationship, phone_primary AS "phonePrimary",
              phone_secondary AS "phoneSecondary", email, is_primary AS "isPrimary"
         FROM hr_emergency_contacts WHERE employee_id = $1 ORDER BY is_primary DESC, id`,
      [id],
    ),
    pool.query(
      `SELECT id, name, relationship, birth_date::text AS "birthDate", cedula,
              is_tax_dependent AS "isTaxDependent",
              is_health_beneficiary AS "isHealthBeneficiary"
         FROM hr_dependents WHERE employee_id = $1 ORDER BY id`,
      [id],
    ),
    pool.query(
      `SELECT id, bank_name AS "bankName", account_number AS "accountNumber",
              account_type AS "accountType", percentage::text AS "percentage",
              is_primary AS "isPrimary", is_active AS "isActive"
         FROM hr_bank_accounts WHERE employee_id = $1 AND is_active = true
         ORDER BY is_primary DESC, id`,
      [id],
    ),
  ]);
  return {
    employee,
    contracts: contracts.rows,
    positions: positions.rows,
    documents: documents.rows,
    emergencyContacts: emergency.rows,
    dependents: dependents.rows,
    bankAccounts: bankAccounts.rows,
  };
}
