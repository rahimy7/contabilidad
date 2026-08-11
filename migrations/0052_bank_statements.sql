-- Bank statement lines: imported movements from bank CSV/OFX/PDF.
--
-- A statement line is a single row in the bank's report. Multiple statements
-- may cover overlapping periods (typical when a bank publishes both interim
-- and monthly reports), so uniqueness is per (bank_account_id, bank_reference)
-- when the bank provides its own reference — otherwise the line is stored raw
-- and de-duplication happens at import time via a hash on (date, amount, memo).

CREATE TABLE IF NOT EXISTS bank_statement_lines (
    id bigserial PRIMARY KEY,
    company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    bank_account_id bigint NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    /* Statement identity: allows importing many statements per account. */
    statement_import_id bigint,
    /* Movement details as reported by the bank. */
    txn_date date NOT NULL,
    value_date date,
    amount numeric(20,4) NOT NULL,
    /* 'in' = credit to us (money entering); 'out' = debit (money leaving). */
    direction text NOT NULL CHECK (direction IN ('in','out')),
    description text,
    /* Bank's internal reference (documento, referencia interna). Some banks
       give a fully-unique string; others only a running date-based counter. */
    bank_reference text,
    /* Raw dump for auditing when the parser cannot classify a column. */
    raw_line jsonb,
    /* Duplicate-detection hash: sha256(txn_date|amount|direction|description). */
    dedup_hash text NOT NULL,
    /* Matched: which one of OUR bank_transactions this line corresponds to,
       once identified either automatically or by hand. */
    matched_transaction_id bigint REFERENCES bank_transactions(id) ON DELETE SET NULL,
    match_confidence text CHECK (match_confidence IN ('exact','high','medium','low','manual')),
    matched_at timestamp with time zone,
    matched_by integer,
    /* 'pending' | 'matched' | 'ignored' | 'created' — created = we posted a
       bank_transaction from this line because there was nothing to match. */
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','matched','ignored','created')),
    created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS bank_statement_lines_account_idx
    ON bank_statement_lines (company_id, bank_account_id, txn_date);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS bank_statement_lines_dedup_uq
    ON bank_statement_lines (bank_account_id, dedup_hash);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS bank_statement_lines_status_idx
    ON bank_statement_lines (bank_account_id, status);
--> statement-breakpoint

-- Bank statement imports: header record for each batch upload.
CREATE TABLE IF NOT EXISTS bank_statement_imports (
    id bigserial PRIMARY KEY,
    company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    bank_account_id bigint NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    /* Range covered by this import. */
    period_start date NOT NULL,
    period_end date NOT NULL,
    /* Bank-reported opening/closing balances (used as reconciliation sanity check). */
    opening_balance numeric(20,4),
    closing_balance numeric(20,4),
    /* Source metadata: 'csv' | 'ofx' | 'pdf' | 'manual'. */
    source_type text NOT NULL DEFAULT 'csv',
    /* Bank code helps the parser dispatch (bhd | popular | reservas | banreservas | others). */
    bank_code text,
    file_name text,
    /* Counters populated at import time. */
    total_lines integer NOT NULL DEFAULT 0,
    duplicate_lines integer NOT NULL DEFAULT 0,
    imported_lines integer NOT NULL DEFAULT 0,
    imported_by integer NOT NULL,
    imported_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS bank_statement_imports_account_idx
    ON bank_statement_imports (company_id, bank_account_id, period_end DESC);
--> statement-breakpoint

-- Now that imports exists, wire statement_import_id.
ALTER TABLE bank_statement_lines
    ADD CONSTRAINT bank_statement_lines_import_fk
    FOREIGN KEY (statement_import_id) REFERENCES bank_statement_imports(id) ON DELETE CASCADE;
--> statement-breakpoint
