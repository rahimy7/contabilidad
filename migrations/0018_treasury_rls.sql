-- Tenant isolation for the treasury tables.
SELECT apply_tenant_policy('bank_accounts');
--> statement-breakpoint
SELECT apply_tenant_policy('bank_reconciliations');
--> statement-breakpoint
SELECT apply_tenant_policy('bank_transactions');