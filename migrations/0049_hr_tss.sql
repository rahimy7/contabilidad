-- Fase 05 · RRHH — TSS (Tesorería de la Seguridad Social).
--
-- La nómina calcula AFP/SFS/INFOTEP como montos en `payslips`, pero eso no
-- reporta a TSS: el SUIR+ pide qué AFP y ARS eligió cada empleado, qué
-- novedades ocurrieron en el período (altas, bajas, licencias, cambios de
-- salario) y el histórico de envíos. Sin este detalle, la nómina no puede
-- imprimirse en el sistema SUIR+ para que el Estado reciba los aportes.
--
-- Escala salarial DR (2026): base cotizable AFP capada en 20 salarios mínimos
-- del sector no sectorizado y SFS capada en 10. El monto de la aportación
-- depende de la base, no del sueldo completo cuando éste supera el techo.

-- ── Catálogos ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hr_afp_funds (
    id serial PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    /* Número asignado por la SIPEN para reporte. */
    sipen_code text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Semilla del catálogo de AFPs activas en DR.
INSERT INTO hr_afp_funds (code, name, sipen_code) VALUES
    ('reservas', 'AFP Reservas', '02'),
    ('siembra', 'AFP Siembra', '05'),
    ('popular', 'AFP Popular', '06'),
    ('jmmb_bdi', 'AFP JMMB BDI', '11'),
    ('crecer', 'AFP Crecer', '01'),
    ('romana', 'AFP Romana', '04')
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS hr_ars_providers (
    id serial PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    /* Código asignado por la SISALRIL para reporte. */
    sisalril_code text,
    is_public boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

INSERT INTO hr_ars_providers (code, name, sisalril_code, is_public) VALUES
    ('senasa', 'SeNaSa', '01', true),
    ('humano', 'ARS Humano', '02', false),
    ('universal', 'ARS Universal', '03', false),
    ('palic_salud', 'Palic Salud', '04', false),
    ('colonial', 'ARS Colonial', '05', false),
    ('yunen', 'ARS Yunen', '06', false),
    ('reservas_salud', 'ARS Reservas', '07', false),
    ('meta_salud', 'Meta Salud', '08', false),
    ('renacer', 'ARS Renacer', '09', false),
    ('futuro', 'ARS Futuro', '10', false)
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint

-- ── Selecciones del empleado ───────────────────────────────────────────────

ALTER TABLE hr_employees
    ADD COLUMN IF NOT EXISTS afp_fund_id integer REFERENCES hr_afp_funds(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS ars_provider_id integer REFERENCES hr_ars_providers(id) ON DELETE SET NULL,
    /* Empleado con dependientes por salud paga adicional en el SFS (arts.
       125+ Ley 87-01); el porcentaje lo aplica el módulo de nómina. */
    ADD COLUMN IF NOT EXISTS ars_covers_dependents boolean DEFAULT false NOT NULL,
    /* Alta a TSS: fecha en que el empleado fue inscrito al Sistema Único de
       Recaudo. Si es null, se debe incluir como "alta" en la próxima novedad. */
    ADD COLUMN IF NOT EXISTS tss_registered_at date,
    /* Cuando la SIPEN retorna el número TSS confirmado. */
    ADD COLUMN IF NOT EXISTS tss_status text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint

-- ── Novedades del período ─────────────────────────────────────────────────
--
-- Cada quincena (o mes) se reportan a TSS las novedades ocurridas: nuevos
-- empleados (alta), salidas (baja), cambios de sueldo, licencias médicas,
-- suspensiones. Las novedades tienen tipos oficiales (códigos SUIR+).

CREATE TABLE IF NOT EXISTS hr_tss_novedades (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    employee_id integer NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    /* Códigos oficiales SUIR+: 1=alta, 2=baja, 3=cambio_salario,
       4=licencia_médica, 5=maternidad/lactancia, 6=suspensión, 7=vacaciones,
       8=reingreso, 9=corrección. */
    novedad_code text NOT NULL,
    period_year integer NOT NULL,
    period_month smallint NOT NULL,
    effective_date date NOT NULL,
    /* Salario anterior y nuevo, para cambios de sueldo. */
    old_salary numeric(14, 2),
    new_salary numeric(14, 2),
    /* Días de licencia o suspensión. */
    days_off integer,
    reason text,
    /* Cuando aún no se ha reportado a TSS. */
    reported_at timestamp with time zone,
    reported_by integer,
    /* Estado interno: pendiente → reportado → aceptado por TSS. */
    status text DEFAULT 'pending' NOT NULL,
    tss_receipt_id text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_tss_novedades_code_ck CHECK (novedad_code IN ('1','2','3','4','5','6','7','8','9')),
    CONSTRAINT hr_tss_novedades_month_ck CHECK (period_month BETWEEN 1 AND 12),
    CONSTRAINT hr_tss_novedades_status_ck CHECK (status IN ('pending','reported','accepted','rejected','cancelled'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS hr_tss_novedades_period_idx
    ON hr_tss_novedades (store_id, period_year, period_month, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hr_tss_novedades_emp_idx
    ON hr_tss_novedades (employee_id);
--> statement-breakpoint

-- ── Envíos SUIR+ ────────────────────────────────────────────────────────────
--
-- Cada envío al SUIR+ es un archivo (o corrida en el portal) que incluye la
-- planilla del período y las novedades pendientes. Se guarda el estado, el
-- número de recibo TSS y el hash del contenido para reproducibilidad.

CREATE TABLE IF NOT EXISTS hr_tss_submissions (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    period_year integer NOT NULL,
    period_month smallint NOT NULL,
    submission_type text NOT NULL,
    /* Totales del envío. */
    employee_count integer DEFAULT 0 NOT NULL,
    total_gross numeric(16, 2) DEFAULT 0 NOT NULL,
    /* Aportes empleado. */
    total_afp_employee numeric(16, 2) DEFAULT 0 NOT NULL,
    total_sfs_employee numeric(16, 2) DEFAULT 0 NOT NULL,
    /* Aportes empleador. */
    total_afp_employer numeric(16, 2) DEFAULT 0 NOT NULL,
    total_sfs_employer numeric(16, 2) DEFAULT 0 NOT NULL,
    total_infotep numeric(16, 2) DEFAULT 0 NOT NULL,
    /* Riesgos laborales (art. 187 Ley 87-01) — porcentaje variable por sector. */
    total_srl numeric(16, 2) DEFAULT 0 NOT NULL,
    total_to_tss numeric(16, 2) DEFAULT 0 NOT NULL,
    file_url text,
    file_hash text,
    tss_receipt_id text,
    status text DEFAULT 'draft' NOT NULL,
    submitted_at timestamp with time zone,
    submitted_by integer,
    accepted_at timestamp with time zone,
    payment_reference text,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_tss_submissions_type_ck CHECK (submission_type IN ('planilla','novedades','ambos','corrección')),
    CONSTRAINT hr_tss_submissions_month_ck CHECK (period_month BETWEEN 1 AND 12),
    CONSTRAINT hr_tss_submissions_status_ck CHECK (status IN ('draft','submitted','accepted','rejected','paid','cancelled'))
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS hr_tss_submissions_uq
    ON hr_tss_submissions (store_id, period_year, period_month, submission_type)
    WHERE status <> 'cancelled';
--> statement-breakpoint

-- Detalle por empleado del envío: usado para reproducir la planilla y
-- auditar diferencias con el próximo período.
CREATE TABLE IF NOT EXISTS hr_tss_submission_lines (
    id bigserial PRIMARY KEY,
    submission_id integer NOT NULL REFERENCES hr_tss_submissions(id) ON DELETE CASCADE,
    employee_id integer NOT NULL REFERENCES hr_employees(id) ON DELETE RESTRICT,
    /* Copia de la selección de AFP/ARS al momento del envío. */
    afp_fund_code text,
    ars_provider_code text,
    gross_salary numeric(14, 2) NOT NULL,
    afp_employee numeric(14, 2) DEFAULT 0 NOT NULL,
    sfs_employee numeric(14, 2) DEFAULT 0 NOT NULL,
    afp_employer numeric(14, 2) DEFAULT 0 NOT NULL,
    sfs_employer numeric(14, 2) DEFAULT 0 NOT NULL,
    infotep numeric(14, 2) DEFAULT 0 NOT NULL,
    srl numeric(14, 2) DEFAULT 0 NOT NULL,
    days_worked numeric(5, 2) DEFAULT 30 NOT NULL,
    covers_dependents boolean DEFAULT false NOT NULL,
    novedades text[]
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS hr_tss_submission_lines_sub_idx
    ON hr_tss_submission_lines (submission_id, employee_id);
