-- Fase 05 · RRHH — Vida laboral: asistencia, vacaciones/permisos,
-- capacitación y desempeño.
--
-- Asistencia: cada empleado marca entrada y salida por día. Del par se derivan
-- las horas trabajadas, tardanzas y horas extra. Los cierres semanales/mensuales
-- alimentan la corrida de nómina.
--
-- Vacaciones y permisos: catálogo de tipos (vacaciones, licencia médica,
-- maternidad, luto, permiso sin sueldo), balance por empleado por año, y
-- solicitudes que pasan por el motor de aprobaciones — un empleado no elige
-- cuándo se va de vacaciones sin autorización.

-- ── Asistencia ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hr_attendance_records (
    id bigserial PRIMARY KEY,
    store_id integer NOT NULL,
    employee_id integer NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    work_date date NOT NULL,
    clock_in timestamp with time zone,
    clock_out timestamp with time zone,
    break_minutes integer DEFAULT 0 NOT NULL,
    /* Horas trabajadas efectivas = (clock_out - clock_in) - break_minutes. */
    hours_worked numeric(5, 2),
    is_late boolean DEFAULT false NOT NULL,
    late_minutes integer DEFAULT 0 NOT NULL,
    overtime_hours numeric(5, 2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'present' NOT NULL,
    notes text,
    /* Método de marcaje: manual, biométrico, geolocalizado. */
    check_method text DEFAULT 'manual' NOT NULL,
    ip_address text,
    location_lat numeric(10, 8),
    location_lng numeric(11, 8),
    approved_by integer,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_attendance_status_ck CHECK (status IN ('present','absent','late','half_day','holiday','leave','sick')),
    CONSTRAINT hr_attendance_break_ck CHECK (break_minutes >= 0),
    CONSTRAINT hr_attendance_method_ck CHECK (check_method IN ('manual','biometric','geolocated','system'))
);
--> statement-breakpoint

-- Un empleado tiene una fila por día como máximo; si necesita marcar dos turnos
-- lo hace ampliando la fila o con un movimiento manual del supervisor.
CREATE UNIQUE INDEX IF NOT EXISTS hr_attendance_day_uq
    ON hr_attendance_records (employee_id, work_date);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hr_attendance_store_date_idx
    ON hr_attendance_records (store_id, work_date DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hr_attendance_status_idx
    ON hr_attendance_records (store_id, work_date, status);
--> statement-breakpoint

-- Cierre de asistencia: cuando un supervisor da por buenos los marcajes del
-- período, se congelan para alimentar la nómina. `hr_attendance_periods`
-- lleva ese cierre.
CREATE TABLE IF NOT EXISTS hr_attendance_periods (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    status text DEFAULT 'open' NOT NULL,
    closed_by integer,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_attendance_periods_status_ck CHECK (status IN ('open','closed','locked')),
    CONSTRAINT hr_attendance_periods_range_ck CHECK (period_end >= period_start)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS hr_attendance_periods_uq
    ON hr_attendance_periods (store_id, period_start, period_end);
--> statement-breakpoint

-- ── Vacaciones y permisos ───────────────────────────────────────────────────

-- Catálogo de tipos: cada empresa arma el suyo, con la política de acumulación.
-- Un tipo puede tener o no requerir aprobación; permiso pagado o no; deducir
-- del balance de vacaciones o de un balance propio.
CREATE TABLE IF NOT EXISTS hr_time_off_types (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    is_paid boolean DEFAULT true NOT NULL,
    requires_approval boolean DEFAULT true NOT NULL,
    /* Días de acumulación anual. Vacaciones DR: 14 días desde el año 1 al
       año 5; 18 días desde el 6. Los detalles los pone el caller cuando cree
       el catálogo por primera vez para la empresa. */
    accrual_days_per_year numeric(5, 2) DEFAULT 0 NOT NULL,
    max_consecutive_days integer,
    requires_medical_certificate boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS hr_time_off_types_code_uq
    ON hr_time_off_types (store_id, code);
--> statement-breakpoint

-- Balance anual por empleado y tipo: días asignados, usados, pendientes.
CREATE TABLE IF NOT EXISTS hr_time_off_balances (
    id serial PRIMARY KEY,
    employee_id integer NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    type_id integer NOT NULL REFERENCES hr_time_off_types(id) ON DELETE RESTRICT,
    fiscal_year integer NOT NULL,
    days_entitled numeric(6, 2) DEFAULT 0 NOT NULL,
    days_carried_over numeric(6, 2) DEFAULT 0 NOT NULL,
    days_used numeric(6, 2) DEFAULT 0 NOT NULL,
    days_pending numeric(6, 2) DEFAULT 0 NOT NULL,
    /* Days remaining = entitled + carried_over - used - pending. */
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_time_off_balances_qty_ck CHECK (days_used >= 0 AND days_pending >= 0)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS hr_time_off_balances_uq
    ON hr_time_off_balances (employee_id, type_id, fiscal_year);
--> statement-breakpoint

-- Solicitudes: fecha inicio/fin, tipo, motivo, aprobación. Al aprobarse baja
-- el balance y se marca la asistencia de esos días como `leave`.
CREATE TABLE IF NOT EXISTS hr_time_off_requests (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    employee_id integer NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    type_id integer NOT NULL REFERENCES hr_time_off_types(id) ON DELETE RESTRICT,
    start_date date NOT NULL,
    end_date date NOT NULL,
    /* Redondeo a medio día para permisos parciales; entero para vacaciones. */
    total_days numeric(5, 1) NOT NULL,
    reason text,
    medical_certificate_url text,
    status text DEFAULT 'pending' NOT NULL,
    approval_request_id integer REFERENCES approval_requests(id) ON DELETE SET NULL,
    reviewed_by integer,
    reviewed_at timestamp with time zone,
    review_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_time_off_requests_status_ck CHECK (status IN ('pending','approved','rejected','cancelled','partial')),
    CONSTRAINT hr_time_off_requests_range_ck CHECK (end_date >= start_date),
    CONSTRAINT hr_time_off_requests_days_ck CHECK (total_days > 0)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS hr_time_off_requests_emp_idx
    ON hr_time_off_requests (employee_id, start_date DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hr_time_off_requests_status_idx
    ON hr_time_off_requests (store_id, status, start_date);
--> statement-breakpoint

-- ── Capacitación ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hr_training_programs (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    provider text,
    is_certification boolean DEFAULT false NOT NULL,
    validity_months integer,
    duration_hours numeric(6, 2),
    cost numeric(14, 2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'DOP' NOT NULL,
    category text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS hr_training_programs_code_uq
    ON hr_training_programs (store_id, code);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS hr_training_enrollments (
    id serial PRIMARY KEY,
    employee_id integer NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    program_id integer NOT NULL REFERENCES hr_training_programs(id) ON DELETE RESTRICT,
    enrollment_date date NOT NULL DEFAULT CURRENT_DATE,
    start_date date,
    completion_date date,
    /* Cuando la capacitación es una certificación con vigencia, `expires_at`
       marca cuándo hay que recertificar. Nulo si no expira. */
    expires_at date,
    status text DEFAULT 'enrolled' NOT NULL,
    /* Nota de aprobación 0-100; el proveedor la reporta. */
    score numeric(5, 2),
    certificate_url text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_training_status_ck CHECK (status IN ('enrolled','in_progress','completed','failed','cancelled')),
    CONSTRAINT hr_training_score_ck CHECK (score IS NULL OR (score >= 0 AND score <= 100))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS hr_training_enrollments_emp_idx
    ON hr_training_enrollments (employee_id, enrollment_date DESC);
--> statement-breakpoint

-- ── Evaluación de desempeño ────────────────────────────────────────────────

-- Un ciclo puede ser anual, semestral o por proyecto. Cada empleado tiene una
-- evaluación por ciclo.
CREATE TABLE IF NOT EXISTS hr_performance_cycles (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    name text NOT NULL,
    fiscal_year integer NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    review_deadline date,
    status text DEFAULT 'planning' NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_performance_cycles_status_ck CHECK (status IN ('planning','active','review','closed','archived')),
    CONSTRAINT hr_performance_cycles_range_ck CHECK (period_end >= period_start)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS hr_performance_cycles_year_idx
    ON hr_performance_cycles (store_id, fiscal_year, status);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS hr_performance_reviews (
    id serial PRIMARY KEY,
    cycle_id integer NOT NULL REFERENCES hr_performance_cycles(id) ON DELETE CASCADE,
    employee_id integer NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    reviewer_id integer NOT NULL REFERENCES hr_employees(id) ON DELETE RESTRICT,
    /* Calificación global 0-100 o A-D según política; se guarda como texto
       para no forzar un modelo. */
    overall_rating text,
    overall_score numeric(5, 2),
    strengths text,
    areas_to_improve text,
    goals_next_period text,
    employee_comments text,
    status text DEFAULT 'draft' NOT NULL,
    submitted_at timestamp with time zone,
    acknowledged_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_performance_reviews_status_ck CHECK (status IN ('draft','submitted','acknowledged','disputed','closed'))
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS hr_performance_reviews_uq
    ON hr_performance_reviews (cycle_id, employee_id);
--> statement-breakpoint

-- Criterios evaluados en cada revisión: puntualidad, cumplimiento de metas,
-- trabajo en equipo, etc. Configurable por empresa.
CREATE TABLE IF NOT EXISTS hr_performance_criteria (
    id serial PRIMARY KEY,
    review_id integer NOT NULL REFERENCES hr_performance_reviews(id) ON DELETE CASCADE,
    criterion text NOT NULL,
    weight numeric(5, 2) DEFAULT 0 NOT NULL,
    score numeric(5, 2),
    comments text,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT hr_performance_criteria_weight_ck CHECK (weight >= 0 AND weight <= 100)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS hr_performance_criteria_review_idx
    ON hr_performance_criteria (review_id, sort_order);
