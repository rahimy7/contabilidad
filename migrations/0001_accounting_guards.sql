-- Accounting invariants, enforced by the database.
--
-- Application-layer validation is a usability feature: it gives the user a fast,
-- readable error. It is not a guarantee. A migration, a psql session, or a bug in
-- a service bypasses it entirely, and an unbalanced ledger discovered six months
-- later cannot be repaired from the outside. So the invariants live here.

-- ---------------------------------------------------------------------------
-- 1. A posted entry balances.
-- ---------------------------------------------------------------------------
-- Checked at COMMIT, not per statement: an entry and its lines are written
-- across several INSERTs inside one transaction, and the set is only meaningful
-- once complete. A plain CHECK cannot express this, because debits and credits
-- live on different rows.
--
-- Drafts are exempt. They exist precisely so a human can build an entry that
-- does not balance yet.

CREATE OR REPLACE FUNCTION assert_entry_balanced(p_entry_id bigint)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_status        text;
  v_line_count    integer;
  v_func_debit    numeric(18,4);
  v_func_credit   numeric(18,4);
  v_bad_currency  text;
BEGIN
  SELECT status::text INTO v_status FROM journal_entries WHERE id = p_entry_id;

  -- Entry was deleted in this transaction; its lines cascaded. Nothing to check.
  IF v_status IS NULL THEN
    RETURN;
  END IF;

  IF v_status <> 'posted' THEN
    RETURN;
  END IF;

  SELECT count(*), coalesce(sum(debit_func), 0), coalesce(sum(credit_func), 0)
    INTO v_line_count, v_func_debit, v_func_credit
    FROM journal_entry_lines
   WHERE entry_id = p_entry_id;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'journal entry % is posted with no lines', p_entry_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_func_debit <> v_func_credit THEN
    RAISE EXCEPTION
      'journal entry % does not balance in functional currency: debit %, credit %',
      p_entry_id, v_func_debit, v_func_credit
      USING ERRCODE = 'check_violation';
  END IF;

  -- Balancing in functional currency is not enough. An entry that nets to zero
  -- after FX translation can still be lopsided within a single transaction
  -- currency, which means the source document was mis-entered.
  SELECT currency INTO v_bad_currency
    FROM journal_entry_lines
   WHERE entry_id = p_entry_id
   GROUP BY currency
  HAVING sum(debit) <> sum(credit)
   LIMIT 1;

  IF v_bad_currency IS NOT NULL THEN
    RAISE EXCEPTION
      'journal entry % does not balance in currency %',
      p_entry_id, v_bad_currency
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION trg_assert_entry_balanced()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN
    PERFORM assert_entry_balanced(NEW.id);
  ELSE
    PERFORM assert_entry_balanced(COALESCE(NEW.entry_id, OLD.entry_id));
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint

-- Fires when the header flips to 'posted'…
CREATE CONSTRAINT TRIGGER journal_entries_balanced_ck
  AFTER INSERT OR UPDATE ON journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_assert_entry_balanced();
--> statement-breakpoint

-- …and when any line of an already-posted entry moves.
CREATE CONSTRAINT TRIGGER journal_entry_lines_balanced_ck
  AFTER INSERT OR UPDATE OR DELETE ON journal_entry_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_assert_entry_balanced();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Postings land on leaf accounts only.
-- ---------------------------------------------------------------------------
-- Posting to a parent account silently corrupts every roll-up that sums its
-- children, and the error stays invisible until a balance sheet is wrong.

CREATE OR REPLACE FUNCTION trg_assert_account_postable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_postable boolean;
  v_active   boolean;
  v_code     text;
BEGIN
  SELECT is_postable, is_active, code
    INTO v_postable, v_active, v_code
    FROM chart_of_accounts
   WHERE id = NEW.account_id;

  IF NOT v_postable THEN
    RAISE EXCEPTION 'account % is not postable (not a leaf)', v_code
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT v_active THEN
    RAISE EXCEPTION 'account % is inactive', v_code
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER journal_entry_lines_postable_ck
  BEFORE INSERT OR UPDATE ON journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION trg_assert_account_postable();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. Nothing posts into a closed period.
-- ---------------------------------------------------------------------------
-- A closed period has been reported to DGII and to the owners. Re-opening it is
-- a deliberate act ('reopened'), not a side effect of a late invoice.

CREATE OR REPLACE FUNCTION trg_assert_period_open()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
  v_start  date;
  v_end    date;
BEGIN
  IF NEW.status <> 'posted' THEN
    RETURN NEW;
  END IF;

  SELECT status::text, start_date, end_date
    INTO v_status, v_start, v_end
    FROM accounting_periods
   WHERE id = NEW.period_id;

  IF v_status NOT IN ('open', 'reopened') THEN
    RAISE EXCEPTION 'accounting period % is %, cannot post', NEW.period_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- An entry dated outside the period it claims would land in the wrong month
  -- of every statement.
  IF NEW.entry_date < v_start OR NEW.entry_date > v_end THEN
    RAISE EXCEPTION
      'entry_date % falls outside period % (% .. %)',
      NEW.entry_date, NEW.period_id, v_start, v_end
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER journal_entries_period_open_ck
  BEFORE INSERT OR UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION trg_assert_period_open();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. Allocating an NCF.
-- ---------------------------------------------------------------------------
-- Wrapped as a function so the correct statement cannot be re-derived wrongly at
-- each call site. The single UPDATE takes a row lock for the life of the
-- transaction: concurrent allocators serialize on the row, and Postgres
-- re-evaluates the WHERE against the latest committed tuple, so two callers
-- cannot receive the same number.
--
-- Returns NULL when the range is exhausted or expired. Callers fail over to the
-- next active sequence, or to contingency. Do not silently retry.
--
-- Call this inside the transaction that persists the document, so a rollback
-- returns the number. Gaps that survive commit (a voided document, an e-CF
-- rejected by DGII) are legal and are reported on Form 608.

CREATE OR REPLACE FUNCTION allocate_ncf(p_sequence_id integer)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_allocated bigint;
BEGIN
  UPDATE ncf_sequences
     SET next_number = next_number + 1
   WHERE id = p_sequence_id
     AND is_active
     AND next_number <= range_to
     AND (expiry_date IS NULL OR expiry_date >= current_date)
  RETURNING next_number - 1 INTO v_allocated;

  RETURN v_allocated;
END;
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 5. Rebuilding the balance cache.
-- ---------------------------------------------------------------------------
-- `account_period_balances` is a cache of sums over `journal_entry_lines`.
-- It is deliberately NOT maintained incrementally yet: an AFTER INSERT trigger
-- that double-counts on a re-post is worse than no cache at all. Until the
-- posting engine lands with its golden-balance test, the trial balance
-- aggregates from the lines (indexed on company_id, account_id) and this
-- function is the single definition of what the cache should contain.

CREATE OR REPLACE FUNCTION rebuild_account_period_balances(
  p_company_id integer,
  p_period_id  integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows integer;
BEGIN
  DELETE FROM account_period_balances
   WHERE company_id = p_company_id
     AND (p_period_id IS NULL OR period_id = p_period_id);

  INSERT INTO account_period_balances (
    company_id, account_id, period_id, cost_center_id, currency,
    debit_total, credit_total, opening_func, closing_func
  )
  SELECT
    l.company_id,
    l.account_id,
    e.period_id,
    coalesce(l.cost_center_id, 0),
    l.currency,
    sum(l.debit),
    sum(l.credit),
    0,
    sum(l.debit_func) - sum(l.credit_func)
  FROM journal_entry_lines l
  JOIN journal_entries e ON e.id = l.entry_id
  WHERE l.company_id = p_company_id
    AND e.status = 'posted'
    AND (p_period_id IS NULL OR e.period_id = p_period_id)
  GROUP BY l.company_id, l.account_id, e.period_id,
           coalesce(l.cost_center_id, 0), l.currency;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;
