-- Tenant isolation for the WMS placement layer and the physical count.
--
-- Same shape as every other tenant table: the policy compares `company_id`
-- against the transaction-local GUC, and `app_rls` (the role `withCompany`
-- drops into) has no BYPASSRLS, so it bites. Grants come from the default
-- privileges installed in 0002. `inventory_count_lines` carries its own
-- `company_id` rather than reaching through `count_id` — a policy that had to
-- join would be re-evaluated per row on every read of a 3,000-line count.
SELECT apply_tenant_policy('warehouse_locations');
--> statement-breakpoint
SELECT apply_tenant_policy('inventory_placements');
--> statement-breakpoint
SELECT apply_tenant_policy('inventory_location_moves');
--> statement-breakpoint
SELECT apply_tenant_policy('inventory_counts');
--> statement-breakpoint
SELECT apply_tenant_policy('inventory_count_lines');
--> statement-breakpoint

-- A placement can never hold less than nothing, and can never promise more than
-- it holds. Enforced in the database because three different paths write here:
-- the putaway, the pick and the count.
ALTER TABLE inventory_placements
  ADD CONSTRAINT inventory_placements_qty_ck
  CHECK (quantity >= 0 AND reserved_qty >= 0 AND reserved_qty <= quantity);
