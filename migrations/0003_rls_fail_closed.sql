-- Make the tenant policies fail closed.
--
-- Migration 0002 compared `company_id` against
-- `current_setting('app.company_id', true)::int`, on the assumption that an
-- unset GUC yields NULL. It does not, and only a test against a real connection
-- shows it: once `set_config('app.company_id', …, true)` has run inside any
-- transaction on a connection, the placeholder GUC exists on that session, and
-- after the transaction ends it reverts to the empty string — not to NULL.
--
--     SELECT current_setting('app.company_id', true);  -->  ''      (not NULL)
--     SELECT ''::int;                                  -->  ERROR
--
-- So a query issued as app_rls without establishing a tenant aborted the
-- transaction with `invalid input syntax for type integer: ""` instead of
-- returning zero rows. No data leaked, but the failure mode was wrong: it
-- poisons the pooled connection for whatever runs next, and it is one small
-- refactor away from someone "fixing" it by loosening the policy.
--
-- `current_company_id()` normalises the empty string to NULL. A NULL comparison
-- is false, so an unscoped query sees nothing, quietly and safely.

CREATE OR REPLACE FUNCTION current_company_id()
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.company_id', true), '')::integer;
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION current_company_id() TO app_rls;
--> statement-breakpoint

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
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I
         USING (company_id = current_company_id())
         WITH CHECK (company_id = current_company_id())', t);
  END LOOP;
END
$$;
--> statement-breakpoint

DROP POLICY IF EXISTS tenant_isolation ON public.companies;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.companies
  USING (id = current_company_id())
  WITH CHECK (id = current_company_id());
--> statement-breakpoint

DROP POLICY IF EXISTS tenant_isolation ON public.tax_rates;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON public.tax_rates
  USING (EXISTS (
    SELECT 1 FROM tax_codes tc
     WHERE tc.id = tax_rates.tax_code_id
       AND tc.company_id = current_company_id()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM tax_codes tc
     WHERE tc.id = tax_rates.tax_code_id
       AND tc.company_id = current_company_id()));
