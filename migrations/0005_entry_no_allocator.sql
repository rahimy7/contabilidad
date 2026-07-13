-- Sequential journal entry numbers, and a reusable way to bring a new table
-- under tenant isolation.

-- ---------------------------------------------------------------------------
-- 1. Applying the tenant policy to a table.
-- ---------------------------------------------------------------------------
-- Migrations 0002 and 0003 looped over the tables that existed at the time.
-- `journal_entry_sequences` was created afterwards by 0004 and so had no policy:
-- a new table silently arrives unprotected. That is the whole class of mistake
-- worth designing out, so from here on adding a tenant table is one call.

CREATE OR REPLACE FUNCTION apply_tenant_policy(p_table text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', p_table);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON public.%I
       USING (company_id = current_company_id())
       WITH CHECK (company_id = current_company_id())', p_table);
END;
$$;
--> statement-breakpoint

SELECT apply_tenant_policy('journal_entry_sequences');
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Allocating an entry number.
-- ---------------------------------------------------------------------------
-- `SELECT max(entry_no) + 1` would hand the same number to two concurrent
-- posters. As with NCF ranges, a single UPDATE takes the row lock and Postgres
-- re-evaluates against the latest committed tuple, so contenders serialize.
--
-- The counter row is created on first use. Two transactions racing to create it
-- collide on the unique index; ON CONFLICT DO NOTHING absorbs that, and the
-- UPDATE then increments whichever row committed.

CREATE OR REPLACE FUNCTION allocate_entry_no(p_company_id integer, p_fiscal_year smallint)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_n bigint;
BEGIN
  INSERT INTO journal_entry_sequences (company_id, fiscal_year, next_number)
  VALUES (p_company_id, p_fiscal_year, 1)
  ON CONFLICT (company_id, fiscal_year) DO NOTHING;

  UPDATE journal_entry_sequences
     SET next_number = next_number + 1
   WHERE company_id = p_company_id AND fiscal_year = p_fiscal_year
  RETURNING next_number - 1 INTO v_n;

  IF v_n IS NULL THEN
    RAISE EXCEPTION 'could not allocate entry_no for company % year %',
      p_company_id, p_fiscal_year;
  END IF;

  -- '2026-00000123'. Sorts lexicographically in posting order within a year.
  RETURN p_fiscal_year::text || '-' || lpad(v_n::text, 8, '0');
END;
$$;
--> statement-breakpoint

GRANT EXECUTE ON FUNCTION allocate_entry_no(integer, smallint) TO app_rls;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION apply_tenant_policy(text) TO app_rls;
