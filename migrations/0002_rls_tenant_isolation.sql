-- Tenant isolation, enforced by Postgres row-level security.
--
-- A `company_id` discriminator puts the burden of isolation on every query. One
-- forgotten `WHERE company_id = ?` shows one Dominican taxpayer another's books:
-- a compliance incident, not a bug. So isolation is a database invariant here,
-- and the query builder is only a convenience.
--
-- The subtlety that makes this work on Neon: `neondb_owner` has BYPASSRLS and
-- owns every table, so policies never apply to it — not even with FORCE ROW
-- LEVEL SECURITY. Enabling RLS and leaving the server connected as the owner
-- would look secure and isolate nothing.
--
-- Instead the server keeps connecting as the owner (migrations and seeds need
-- that) and drops into a privilege-less role for the duration of each request
-- transaction:
--
--     BEGIN;
--     SELECT set_config('app.company_id', '42', true);  -- true = transaction-local
--     SET LOCAL ROLE app_rls;
--     ...
--     COMMIT;   -- both revert here
--
-- `SET ROLE` changes current_user, and Postgres tests BYPASSRLS against the
-- current role, so the policies bite. `SET LOCAL` rather than plain `SET` is
-- mandatory: Neon pools WebSocket connections, and a session-level setting would
-- leak into the next request served by that connection — the single most
-- dangerous mistake available in this design.

-- ---------------------------------------------------------------------------
-- The application role.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    -- NOLOGIN: reachable only via SET ROLE, never as a connection identity.
    -- No BYPASSRLS, and owner of no table. Those two facts are the entire
    -- security property.
    CREATE ROLE app_rls NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint

-- The connecting role must be a member of app_rls in order to SET ROLE into it.
DO $$
BEGIN
  EXECUTE format('GRANT app_rls TO %I', current_user);
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO app_rls;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rls;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_rls;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_rls;
--> statement-breakpoint

-- Tables created by later migrations inherit the same grants.
DO $$
BEGIN
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
       GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rls', current_user);
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
       GRANT USAGE, SELECT ON SEQUENCES TO app_rls', current_user);
END
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Policies.
-- ---------------------------------------------------------------------------
-- Applied to every table carrying a `company_id`. `current_setting(..., true)`
-- returns NULL rather than raising when the GUC is unset, so a query that forgot
-- to establish a tenant sees zero rows instead of every row: it fails closed.
--
-- WITH CHECK mirrors USING, so a tenant cannot write a row belonging to another
-- tenant either.
--
-- Legacy POS tables (orders, products, warehouses…) still name their tenant
-- column `store_id` and are deliberately NOT covered here. They get policies in
-- the same change that renames the column and points it at companies(id).
-- Writing a policy against an unrenamed, un-FK'd column would create the
-- illusion of coverage.

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND a.attname = 'company_id'
       AND NOT a.attisdropped
     ORDER BY 1
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I
         USING (company_id = current_setting(''app.company_id'', true)::int)
         WITH CHECK (company_id = current_setting(''app.company_id'', true)::int)', t);
  END LOOP;
END
$$;
--> statement-breakpoint

-- `companies` keys the tenant on its own `id`, not on a `company_id` column.
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON public.companies;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.companies
  USING (id = current_setting('app.company_id', true)::int)
  WITH CHECK (id = current_setting('app.company_id', true)::int);
--> statement-breakpoint

-- `tax_rates` hangs off `tax_codes` and carries no company_id of its own.
ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON public.tax_rates;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.tax_rates
  USING (EXISTS (
    SELECT 1 FROM tax_codes tc
     WHERE tc.id = tax_rates.tax_code_id
       AND tc.company_id = current_setting('app.company_id', true)::int))
  WITH CHECK (EXISTS (
    SELECT 1 FROM tax_codes tc
     WHERE tc.id = tax_rates.tax_code_id
       AND tc.company_id = current_setting('app.company_id', true)::int));
