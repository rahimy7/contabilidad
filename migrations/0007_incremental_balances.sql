-- Incremental maintenance of `account_period_balances`.
--
-- The cache turns a trial balance from an aggregate over every line ever posted
-- into an indexed lookup per account. The danger is double counting: a naive
-- `AFTER INSERT ON journal_entry_lines` trigger fires while the entry is still a
-- draft, and an `AFTER UPDATE ON journal_entries` trigger fires again every time
-- the row is touched for any reason.
--
-- Two decisions make this safe.
--
-- First, the trigger is DEFERRED. The posting engine writes the header as a
-- draft, then its lines, then flips it to 'posted'. Only at COMMIT do the lines
-- exist and the status is final, so only then can the entry's contribution be
-- computed.
--
-- Second, `journal_entries.balances_applied` records that the fold happened.
-- An entry contributes exactly once no matter how often the trigger fires. The
-- flag is set with an UPDATE that re-enters this trigger; the second pass sees
-- the flag and does nothing, so the recursion terminates at depth two.
--
-- Reversals need no special case. A reversal is a new posted entry with mirrored
-- lines; folding it in nets the accounts back to zero, exactly as reading from
-- the lines would.

CREATE OR REPLACE FUNCTION trg_apply_entry_to_balances()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status <> 'posted' OR NEW.balances_applied THEN
    RETURN NULL;
  END IF;

  INSERT INTO account_period_balances AS b (
    company_id, account_id, period_id, cost_center_id, currency,
    debit_total, credit_total, opening_func, closing_func
  )
  SELECT
    l.company_id,
    l.account_id,
    NEW.period_id,
    coalesce(l.cost_center_id, 0),
    l.currency,
    sum(l.debit),
    sum(l.credit),
    0,
    sum(l.debit_func) - sum(l.credit_func)
  FROM journal_entry_lines l
  WHERE l.entry_id = NEW.id
  GROUP BY l.company_id, l.account_id, coalesce(l.cost_center_id, 0), l.currency
  ON CONFLICT (company_id, account_id, period_id, cost_center_id, currency)
  DO UPDATE SET
    debit_total  = b.debit_total  + EXCLUDED.debit_total,
    credit_total = b.credit_total + EXCLUDED.credit_total,
    closing_func = b.closing_func + EXCLUDED.closing_func;

  -- Re-enters this trigger once. That pass returns early on the flag.
  UPDATE journal_entries SET balances_applied = true WHERE id = NEW.id;

  RETURN NULL;
END;
$$;
--> statement-breakpoint

-- `account_period_balances` has a unique index but no primary key, and
-- ON CONFLICT needs a constraint to arbitrate on. Promote the index.
ALTER TABLE account_period_balances
  ADD CONSTRAINT account_period_balances_pkey
  PRIMARY KEY USING INDEX account_period_balances_pk;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER journal_entries_apply_balances
  AFTER INSERT OR UPDATE ON journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_apply_entry_to_balances();
--> statement-breakpoint

-- `rebuild_account_period_balances` recomputes the same numbers from the lines.
-- It is the reference the incremental path is tested against, and the repair
-- tool if the two ever diverge. Keep it consistent with the trigger above: it
-- must also reset the flags it invalidates.
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
