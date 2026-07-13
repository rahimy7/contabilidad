-- Tenant isolation for the budget tables.
SELECT apply_tenant_policy('budgets');
--> statement-breakpoint
SELECT apply_tenant_policy('budget_lines');
