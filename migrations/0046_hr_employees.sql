-- Fase 05 · RRHH — Expediente del empleado, contratos, documentos y puestos.
--
-- El sistema tiene `users` (login) y `employee_profiles` (mínimo: departamento
-- y especializaciones). RRHH real necesita mucho más: datos personales
-- completos, contactos de emergencia, cuentas bancarias para nómina, historial
-- de puestos y salarios, contratos con vencimientos, y un repositorio de
-- documentos con alertas de expiración.
--
-- Anclaje: `user_id` en la tabla base `hr_employees`. Un empleado puede o no
-- tener acceso al sistema (un mensajero que no entra al sistema igual necesita
-- expediente), así que `user_id` es opcional pero único cuando existe.
--
-- Enlace con nómina: `payroll_employee_id` referencia la tabla ya construida
-- (per company_id, con AFP/SFS/ISR/INFOTEP). Se sincroniza al crear un
-- empleado con salario y al despedirlo.

CREATE TABLE IF NOT EXISTS hr_employees (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    user_id integer REFERENCES users(id) ON DELETE SET NULL,
    payroll_employee_id integer,
    employee_code text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    cedula text,
    passport text,
    tss_number text,
    nationality text DEFAULT 'DO' NOT NULL,
    birth_date date,
    gender text,
    marital_status text,
    /* Datos de contacto */
    personal_email text,
    personal_phone text,
    home_address text,
    home_province text,
    home_municipality text,
    home_sector text,
    /* Empleo */
    hire_date date NOT NULL,
    /* Se marca cuando el empleado deja la empresa; una vez marcada, el resto
       de columnas queda congelado por consistencia histórica. */
    termination_date date,
    employment_status text DEFAULT 'active' NOT NULL,
    contract_type text,
    department text,
    position_title text,
    supervisor_id integer REFERENCES hr_employees(id) ON DELETE SET NULL,
    work_location text,
    /* Sueldo actual y ciclo de pago; los históricos viven en `hr_positions`. */
    monthly_salary numeric(14, 2) DEFAULT 0 NOT NULL,
    payment_frequency text DEFAULT 'monthly' NOT NULL,
    payment_method text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_employees_status_ck CHECK (employment_status IN ('active','on_leave','terminated','retired','suspended')),
    CONSTRAINT hr_employees_gender_ck CHECK (gender IS NULL OR gender IN ('M','F','O')),
    CONSTRAINT hr_employees_freq_ck CHECK (payment_frequency IN ('monthly','biweekly','weekly','daily'))
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS hr_employees_code_uq
    ON hr_employees (store_id, employee_code);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS hr_employees_user_uq
    ON hr_employees (user_id) WHERE user_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS hr_employees_cedula_uq
    ON hr_employees (store_id, cedula) WHERE cedula IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hr_employees_status_idx
    ON hr_employees (store_id, employment_status);
--> statement-breakpoint

-- Cuentas bancarias para depósito de nómina; un empleado puede tener varias
-- (una principal + una secundaria) para divisiones internas.
CREATE TABLE IF NOT EXISTS hr_bank_accounts (
    id serial PRIMARY KEY,
    employee_id integer NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    bank_name text NOT NULL,
    account_number text NOT NULL,
    account_type text DEFAULT 'checking' NOT NULL,
    currency text DEFAULT 'DOP' NOT NULL,
    /* Porcentaje de la nómina que va a esta cuenta; suma de porcentajes de un
       empleado debe ser 100 (validación aplicativa, no BD). */
    percentage numeric(5, 2) DEFAULT 100 NOT NULL,
    is_primary boolean DEFAULT true NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_bank_accounts_type_ck CHECK (account_type IN ('checking','savings')),
    CONSTRAINT hr_bank_accounts_pct_ck CHECK (percentage > 0 AND percentage <= 100)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hr_bank_accounts_emp_idx
    ON hr_bank_accounts (employee_id) WHERE is_active = true;
--> statement-breakpoint

-- Contactos de emergencia: nombre, relación y teléfono. Un empleado
-- típicamente tiene 1-2. `is_primary` marca el que se llama primero.
CREATE TABLE IF NOT EXISTS hr_emergency_contacts (
    id serial PRIMARY KEY,
    employee_id integer NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    name text NOT NULL,
    relationship text NOT NULL,
    phone_primary text NOT NULL,
    phone_secondary text,
    email text,
    address text,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hr_emergency_contacts_emp_idx
    ON hr_emergency_contacts (employee_id);
--> statement-breakpoint

-- Dependientes: cónyuge, hijos. Sirven para deducciones ISR (menores de 18) y
-- para asignar beneficios (seguro médico familiar).
CREATE TABLE IF NOT EXISTS hr_dependents (
    id serial PRIMARY KEY,
    employee_id integer NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    name text NOT NULL,
    relationship text NOT NULL,
    birth_date date,
    cedula text,
    is_tax_dependent boolean DEFAULT false NOT NULL,
    is_health_beneficiary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_dependents_rel_ck CHECK (relationship IN ('spouse','child','parent','sibling','other'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hr_dependents_emp_idx
    ON hr_dependents (employee_id);
--> statement-breakpoint

-- Contratos laborales: histórico. Cada renovación o cambio crea una fila.
-- `superseded_by` enlaza al contrato que lo reemplazó, para reconstruir el
-- histórico sin borrar.
CREATE TABLE IF NOT EXISTS hr_employment_contracts (
    id serial PRIMARY KEY,
    employee_id integer NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    contract_type text NOT NULL,
    start_date date NOT NULL,
    end_date date,
    is_indefinite boolean DEFAULT false NOT NULL,
    probation_ends_at date,
    monthly_salary numeric(14, 2) NOT NULL,
    payment_frequency text DEFAULT 'monthly' NOT NULL,
    working_hours_per_week numeric(4, 1),
    document_url text,
    signed_by_employee_at date,
    signed_by_employer_at date,
    superseded_by integer REFERENCES hr_employment_contracts(id) ON DELETE SET NULL,
    is_current boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_contracts_type_ck CHECK (contract_type IN ('indefinite','fixed_term','probation','part_time','internship','consultant')),
    CONSTRAINT hr_contracts_dates_ck CHECK (end_date IS NULL OR end_date >= start_date)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS hr_contracts_current_uq
    ON hr_employment_contracts (employee_id) WHERE is_current = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hr_contracts_end_idx
    ON hr_employment_contracts (end_date) WHERE end_date IS NOT NULL AND is_current = true;
--> statement-breakpoint

-- Puestos y salarios: histórico. Cada promoción, aumento o cambio de puesto
-- crea una fila. `previous_id` lo enlaza con el puesto anterior.
CREATE TABLE IF NOT EXISTS hr_positions (
    id serial PRIMARY KEY,
    employee_id integer NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    position_title text NOT NULL,
    department text,
    supervisor_id integer REFERENCES hr_employees(id) ON DELETE SET NULL,
    monthly_salary numeric(14, 2) NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    change_reason text,
    previous_id integer REFERENCES hr_positions(id) ON DELETE SET NULL,
    is_current boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hr_positions_dates_ck CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT hr_positions_reason_ck CHECK (change_reason IS NULL OR change_reason IN ('hiring','promotion','demotion','transfer','raise','adjustment','other'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS hr_positions_current_uq
    ON hr_positions (employee_id) WHERE is_current = true;
--> statement-breakpoint

-- Repositorio documental del empleado: contratos firmados, cédula, currículum,
-- certificaciones, carné médico. Con vencimiento donde aplica, para alertar
-- antes de que expire.
CREATE TABLE IF NOT EXISTS hr_employee_documents (
    id bigserial PRIMARY KEY,
    store_id integer NOT NULL,
    employee_id integer NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    document_type text NOT NULL,
    title text NOT NULL,
    description text,
    file_url text NOT NULL,
    file_size_bytes integer,
    mime_type text,
    /* Vigencia del documento; una carne médica caduca cada 2 años, un curso
       de seguridad expira anualmente. Null = no expira. */
    issued_at date,
    expires_at date,
    /* Cuando el documento se actualiza, el viejo queda archivado con
       `superseded_by` apuntando al nuevo. */
    superseded_by bigint REFERENCES hr_employee_documents(id) ON DELETE SET NULL,
    is_current boolean DEFAULT true NOT NULL,
    uploaded_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hr_employee_documents_emp_idx
    ON hr_employee_documents (employee_id, document_type) WHERE is_current = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS hr_employee_documents_expiry_idx
    ON hr_employee_documents (store_id, expires_at)
    WHERE expires_at IS NOT NULL AND is_current = true;
--> statement-breakpoint

-- Contador de código de empleado por store: EMP-000001, EMP-000002…
CREATE TABLE IF NOT EXISTS hr_employee_sequences (
    store_id integer PRIMARY KEY,
    prefix text DEFAULT 'EMP' NOT NULL,
    next_number integer DEFAULT 1 NOT NULL
);
