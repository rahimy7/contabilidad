-- Bring the AR/AP subledger tables under tenant isolation.
--
-- Each carries a company_id, so the standard policy applies. Using the
-- apply_tenant_policy helper from 0005 keeps a new tenant table one line, and
-- guarantees it is never shipped unprotected.

SELECT apply_tenant_policy('ar_open_items');
--> statement-breakpoint
SELECT apply_tenant_policy('ar_receipts');
--> statement-breakpoint
SELECT apply_tenant_policy('ar_applications');
--> statement-breakpoint
SELECT apply_tenant_policy('ap_open_items');
--> statement-breakpoint
SELECT apply_tenant_policy('ap_payments');
--> statement-breakpoint
SELECT apply_tenant_policy('ap_applications');
