-- Tenant isolation for the fixed-asset tables.
SELECT apply_tenant_policy('fixed_assets');
--> statement-breakpoint
SELECT apply_tenant_policy('depreciation_entries');
