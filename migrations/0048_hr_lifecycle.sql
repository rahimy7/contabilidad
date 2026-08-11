-- Fase 05 · RRHH — Reclutamiento, beneficios, seguridad y desvinculación.
--
-- Desvinculación DR es lo que diferencia una tabla más de un módulo laboral
-- serio: prestaciones laborales (preaviso, cesantía, vacaciones proporcionales,
-- regalía pascual) según el Código de Trabajo dominicano. El cálculo se hace
-- en el servicio; esta migración guarda los valores del cálculo con desglose
-- para auditoría.

-- ── Reclutamiento y selección ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hr_job_openings (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    opening_number text NOT NULL,
    title text NOT NULL,
    department text,
    position_type text DEFAULT 'full_time' NOT NULL,
    /* Nivel del puesto: junior, mid, senior, gerencia, dirección. */
    seniority_level text,
    location text,
    is_remote boolean DEFAULT false NOT NULL,
    salary_min numeric(14, 2),
    salary_max numeric(14, 2),
    currency text DEFAULT 'DOP' NOT NULL,
    description text NOT NULL,
    requirements text,
    responsibilities text,
    /* Vacantes disponibles; una convocatoria puede contratar varias personas. */
    positions_available integer DEFAULT 1 NOT NULL,
    positions_filled integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft' NOT NULL,
    posted_at timestamp with time zone,
    closes_at timestamp with time zone,
    hiring_manager_id integer REFERENCES hr_employees(id) ON DELETE SET NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_job_openings_status_ck CHECK (status IN ('draft','open','on_hold','filled','closed','cancelled')),
    CONSTRAINT hr_job_openings_type_ck CHECK (position_type IN ('full_time','part_time','contract','internship','temporary')),
    CONSTRAINT hr_job_openings_positions_ck CHECK (positions_available > 0 AND positions_filled >= 0 AND positions_filled <= positions_available)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS hr_job_openings_number_uq
    ON hr_job_openings (store_id, opening_number);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hr_job_openings_status_idx
    ON hr_job_openings (store_id, status, posted_at DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS hr_job_applications (
    id serial PRIMARY KEY,
    opening_id integer NOT NULL REFERENCES hr_job_openings(id) ON DELETE CASCADE,
    /* Datos del candidato; puede que no exista todavía como empleado. */
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text,
    phone text,
    cedula text,
    /* Fuente: portal web, referido, LinkedIn, portales de empleo. */
    source text,
    resume_url text,
    cover_letter_url text,
    current_stage text DEFAULT 'received' NOT NULL,
    stage_order integer DEFAULT 0 NOT NULL,
    /* Al contratarse queda enlazado al empleado creado. */
    hired_employee_id integer REFERENCES hr_employees(id) ON DELETE SET NULL,
    /* Motivo si se rechaza. */
    rejection_reason text,
    /* Puntaje agregado de las evaluaciones. */
    overall_score numeric(5, 2),
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    decided_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_job_applications_stage_ck CHECK (current_stage IN ('received','screening','interview','technical','offer','hired','rejected','withdrawn'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS hr_job_applications_opening_idx
    ON hr_job_applications (opening_id, current_stage);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hr_job_applications_email_idx
    ON hr_job_applications (email) WHERE email IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS hr_candidate_evaluations (
    id serial PRIMARY KEY,
    application_id integer NOT NULL REFERENCES hr_job_applications(id) ON DELETE CASCADE,
    stage text NOT NULL,
    evaluator_id integer REFERENCES hr_employees(id) ON DELETE SET NULL,
    evaluation_date date NOT NULL DEFAULT CURRENT_DATE,
    score numeric(5, 2),
    strengths text,
    concerns text,
    recommendation text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_candidate_eval_rec_ck CHECK (recommendation IS NULL OR recommendation IN ('strong_hire','hire','no_hire','strong_no_hire'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS hr_candidate_evaluations_app_idx
    ON hr_candidate_evaluations (application_id);
--> statement-breakpoint

-- ── Beneficios ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hr_benefit_types (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    /* Tipos: seguro médico, dental, seguro de vida, bono, préstamo empleado,
       transporte, gastos representación. */
    category text NOT NULL,
    is_taxable boolean DEFAULT false NOT NULL,
    provider text,
    /* Costo periódico; empresa/empleado puede pagar total o parcial. */
    monthly_cost_employer numeric(14, 2) DEFAULT 0 NOT NULL,
    monthly_cost_employee numeric(14, 2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'DOP' NOT NULL,
    coverage_amount numeric(14, 2),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS hr_benefit_types_code_uq
    ON hr_benefit_types (store_id, code);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS hr_employee_benefits (
    id serial PRIMARY KEY,
    employee_id integer NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    benefit_type_id integer NOT NULL REFERENCES hr_benefit_types(id) ON DELETE RESTRICT,
    enrolled_at date NOT NULL DEFAULT CURRENT_DATE,
    /* Cobertura efectiva. Al terminar el empleado se cierra. */
    active_from date NOT NULL DEFAULT CURRENT_DATE,
    active_to date,
    /* Extienden cobertura a los dependientes marcados. */
    covers_dependents boolean DEFAULT false NOT NULL,
    policy_number text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS hr_employee_benefits_emp_idx
    ON hr_employee_benefits (employee_id) WHERE is_active = true;
--> statement-breakpoint

-- ── Seguridad y salud ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hr_workplace_incidents (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    incident_number text NOT NULL,
    incident_date timestamp with time zone NOT NULL,
    location text,
    employee_id integer REFERENCES hr_employees(id) ON DELETE SET NULL,
    /* Otros afectados; para incidentes grupales o de terceros. */
    other_affected text,
    /* Categoría: accidente laboral, cuasi-accidente, enfermedad profesional,
       violencia, incendio. */
    category text NOT NULL,
    severity text DEFAULT 'low' NOT NULL,
    description text NOT NULL,
    injuries text,
    medical_attention_required boolean DEFAULT false NOT NULL,
    days_off_work integer DEFAULT 0 NOT NULL,
    reported_by integer,
    reported_at timestamp with time zone DEFAULT now() NOT NULL,
    corrective_actions text,
    status text DEFAULT 'open' NOT NULL,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_incidents_severity_ck CHECK (severity IN ('low','medium','high','critical','fatal')),
    CONSTRAINT hr_incidents_status_ck CHECK (status IN ('open','investigating','resolved','closed'))
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS hr_incidents_number_uq
    ON hr_workplace_incidents (store_id, incident_number);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hr_incidents_emp_idx
    ON hr_workplace_incidents (employee_id) WHERE employee_id IS NOT NULL;
--> statement-breakpoint

-- ── Desvinculación con prestaciones (Código de Trabajo DR) ─────────────────

CREATE TABLE IF NOT EXISTS hr_terminations (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    employee_id integer NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    termination_date date NOT NULL,
    /* Tipo: art. 87 (desahucio del empleador), art. 76 (desahucio del
       trabajador), art. 88 (despido justificado), art. 93 (dimisión
       justificada), muerte del trabajador, mutuo consentimiento, jubilación.
       Cada uno tiene reglas distintas para las prestaciones. */
    termination_type text NOT NULL,
    reason_code text,
    reason text,
    /* Datos base al momento de la salida — se congelan aquí porque el sueldo
       o los años de servicio pueden cambiar después y el cálculo debe ser
       reproducible. */
    hire_date date NOT NULL,
    monthly_salary numeric(14, 2) NOT NULL,
    /* Salario diario legal DR = sueldo_mensual / 23.83 */
    daily_wage numeric(14, 4) NOT NULL,
    /* Años completos y meses adicionales de servicio. */
    years_of_service integer NOT NULL,
    months_extra integer NOT NULL,
    /* Prestaciones — cada componente separado para desglose y auditoría. */
    notice_days integer DEFAULT 0 NOT NULL,
    notice_amount numeric(14, 2) DEFAULT 0 NOT NULL,
    severance_days integer DEFAULT 0 NOT NULL,
    severance_amount numeric(14, 2) DEFAULT 0 NOT NULL,
    /* Cesantía por antigüedad (auxilio de cesantía) — sólo cuando el empleador
       desahucia sin causa (art. 80) o despide sin justa causa (art. 88 sin
       probar la causa). */
    proportional_vacation_days numeric(5, 2) DEFAULT 0 NOT NULL,
    proportional_vacation_amount numeric(14, 2) DEFAULT 0 NOT NULL,
    proportional_christmas_bonus numeric(14, 2) DEFAULT 0 NOT NULL,
    /* Salario pendiente hasta la fecha de salida. */
    pending_salary numeric(14, 2) DEFAULT 0 NOT NULL,
    /* Beneficios adicionales acumulados por política interna. */
    other_benefits numeric(14, 2) DEFAULT 0 NOT NULL,
    /* Total antes de deducciones. */
    gross_total numeric(14, 2) NOT NULL,
    /* Deducciones: préstamos pendientes, adelantos, ISR sobre parte gravable. */
    deductions_amount numeric(14, 2) DEFAULT 0 NOT NULL,
    net_total numeric(14, 2) NOT NULL,
    /* Copia del desglose completo en JSON para auditoría posterior; los
       componentes viven arriba para consultas rápidas. */
    calculation_breakdown jsonb,
    status text DEFAULT 'draft' NOT NULL,
    prepared_by integer,
    approved_by integer,
    approved_at timestamp with time zone,
    paid_at timestamp with time zone,
    payment_method text,
    reference_number text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_terminations_type_ck CHECK (termination_type IN (
        'employer_dismissal_no_cause','employer_dismissal_with_cause',
        'employee_resignation','employee_resignation_justified',
        'mutual_agreement','death','retirement','end_of_contract'
    )),
    CONSTRAINT hr_terminations_status_ck CHECK (status IN ('draft','pending_approval','approved','paid','cancelled')),
    CONSTRAINT hr_terminations_service_ck CHECK (years_of_service >= 0 AND months_extra >= 0 AND months_extra < 12)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS hr_terminations_emp_uq
    ON hr_terminations (employee_id) WHERE status <> 'cancelled';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hr_terminations_status_idx
    ON hr_terminations (store_id, status, termination_date DESC);
--> statement-breakpoint

-- ── Contadores de secuencia ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hr_job_opening_sequences (
    store_id integer PRIMARY KEY,
    prefix text DEFAULT 'JOB' NOT NULL,
    next_number integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS hr_incident_sequences (
    store_id integer PRIMARY KEY,
    prefix text DEFAULT 'INC' NOT NULL,
    next_number integer DEFAULT 1 NOT NULL
);
