-- Tenant isolation for the payroll tables.
SELECT apply_tenant_policy('payroll_employees');
--> statement-breakpoint
SELECT apply_tenant_policy('payroll_runs');
--> statement-breakpoint
SELECT apply_tenant_policy('payslips');
