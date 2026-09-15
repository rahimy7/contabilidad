-- Nómina por conceptos.
--
-- Una corrida ya no es "salario base por empleado": es la suma de conceptos del
-- mes (salario, horas extras, comisiones, bonificación, incentivos, regalía,
-- descuentos) y cada concepto dice si cotiza a la TSS, si paga ISR y si entra en
-- la base del INFOTEP. Las entradas variables del mes se capturan por corrida y
-- empleado; la volante guarda cada línea calculada con la cuenta que afecta.

CREATE TABLE IF NOT EXISTS payroll_concepts (
    id serial PRIMARY KEY,
    company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    code text NOT NULL,
    name text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('earning', 'deduction')),
    calc text NOT NULL CHECK (calc IN ('system', 'input_amount', 'hours')),
    multiplier numeric(8,4),
    tss_taxable boolean NOT NULL,
    isr_taxable boolean NOT NULL,
    infotep_taxable boolean NOT NULL,
    account_code text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS payroll_concepts_code_uq ON payroll_concepts (company_id, code);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payroll_run_inputs (
    id bigserial PRIMARY KEY,
    company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    run_id integer NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
    employee_id integer NOT NULL REFERENCES payroll_employees(id),
    concept_code text NOT NULL,
    quantity numeric(12,4),
    amount numeric(18,4),
    source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'commission', 'attendance')),
    source_id text NOT NULL DEFAULT '',
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS payroll_run_inputs_uq
    ON payroll_run_inputs (run_id, employee_id, concept_code, source, source_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payslip_lines (
    id bigserial PRIMARY KEY,
    company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    payslip_id integer NOT NULL REFERENCES payslips(id) ON DELETE CASCADE,
    concept_code text NOT NULL,
    concept_name text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('earning', 'deduction', 'statutory', 'employer')),
    quantity numeric(12,4),
    rate numeric(20,8),
    amount numeric(18,4) NOT NULL,
    account_code text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payslip_lines_payslip_idx ON payslip_lines (company_id, payslip_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS payroll_liability_payments (
    id bigserial PRIMARY KEY,
    company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    run_id integer REFERENCES payroll_runs(id),
    kind text NOT NULL CHECK (kind IN ('net_pay', 'tss', 'infotep', 'isr_salaries')),
    fiscal_year smallint NOT NULL,
    month smallint NOT NULL,
    payment_date date NOT NULL,
    amount numeric(18,4) NOT NULL,
    bank_transaction_id bigint,
    journal_entry_id bigint,
    created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS payroll_liability_payments_uq
    ON payroll_liability_payments (company_id, kind, fiscal_year, month);
--> statement-breakpoint

SELECT apply_tenant_policy('payroll_concepts');
--> statement-breakpoint
SELECT apply_tenant_policy('payroll_run_inputs');
--> statement-breakpoint
SELECT apply_tenant_policy('payslip_lines');
--> statement-breakpoint
SELECT apply_tenant_policy('payroll_liability_payments');
--> statement-breakpoint

ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS hr_employee_id integer;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS payroll_employees_hr_uq ON payroll_employees (hr_employee_id) WHERE hr_employee_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS hire_date date;
--> statement-breakpoint
ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS termination_date date;
--> statement-breakpoint
ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS department text;
--> statement-breakpoint
ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS user_id integer;
--> statement-breakpoint

ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS period_start date;
--> statement-breakpoint
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS period_end date;
--> statement-breakpoint
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS payment_date date;
--> statement-breakpoint
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS paid_at timestamptz;
--> statement-breakpoint
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS employer_total numeric(18,4) NOT NULL DEFAULT 0;
--> statement-breakpoint

ALTER TABLE payslips ADD COLUMN IF NOT EXISTS srl numeric(18,4) NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS tss_base numeric(18,4) NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS isr_base numeric(18,4) NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS days_worked numeric(6,1);
--> statement-breakpoint
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS base_salary numeric(18,4) NOT NULL DEFAULT 0;
--> statement-breakpoint

-- Comisiones calculadas por empresa, desde los comprobantes fiscales.
ALTER TABLE commission_earnings ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE commission_rules ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id) ON DELETE SET NULL;
