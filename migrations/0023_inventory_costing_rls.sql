-- Tenant isolation for the inventory costing tables.
SELECT apply_tenant_policy('inventory_valuation');
--> statement-breakpoint
SELECT apply_tenant_policy('inventory_cost_movements');