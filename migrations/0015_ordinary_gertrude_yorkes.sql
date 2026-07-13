CREATE TABLE "payroll_employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"cedula" text,
	"position" text,
	"base_salary" numeric(18, 4) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"fiscal_year" smallint NOT NULL,
	"month" smallint NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"gross_total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"net_total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"journal_entry_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"run_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"gross_salary" numeric(18, 4) NOT NULL,
	"afp_employee" numeric(18, 4) DEFAULT '0' NOT NULL,
	"sfs_employee" numeric(18, 4) DEFAULT '0' NOT NULL,
	"isr" numeric(18, 4) DEFAULT '0' NOT NULL,
	"other_deductions" numeric(18, 4) DEFAULT '0' NOT NULL,
	"afp_employer" numeric(18, 4) DEFAULT '0' NOT NULL,
	"sfs_employer" numeric(18, 4) DEFAULT '0' NOT NULL,
	"infotep" numeric(18, 4) DEFAULT '0' NOT NULL,
	"net_pay" numeric(18, 4) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payroll_employees" ADD CONSTRAINT "payroll_employees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_run_id_payroll_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employee_id_payroll_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_employees_code_uq" ON "payroll_employees" USING btree ("company_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_runs_uq" ON "payroll_runs" USING btree ("company_id","fiscal_year","month");--> statement-breakpoint
CREATE UNIQUE INDEX "payslips_uq" ON "payslips" USING btree ("run_id","employee_id");--> statement-breakpoint
CREATE INDEX "payslips_company_idx" ON "payslips" USING btree ("company_id","run_id");