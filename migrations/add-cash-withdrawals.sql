-- Migration: Add cash_withdrawals table
-- Description: Stores cash withdrawal transactions from the register
-- Date: 2026-05-04

CREATE TABLE IF NOT EXISTS cash_withdrawals (
  id                      SERIAL PRIMARY KEY,
  store_id                INTEGER NOT NULL,
  cashier_id              INTEGER NOT NULL REFERENCES users(id),
  authorized_by_user_id   INTEGER NOT NULL REFERENCES users(id),
  concept                 TEXT NOT NULL,
  amount                  DECIMAL(12,2) NOT NULL,
  currency                TEXT NOT NULL DEFAULT 'DOP',
  notes                   TEXT,
  session_type            TEXT NOT NULL DEFAULT 'day',
  voided                  BOOLEAN NOT NULL DEFAULT FALSE,
  voided_at               TIMESTAMP,
  voided_by_user_id       INTEGER REFERENCES users(id),
  void_reason             TEXT,
  created_at              TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_store_id   ON cash_withdrawals(store_id);
CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_created_at ON cash_withdrawals(created_at);
CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_cashier_id ON cash_withdrawals(cashier_id);
CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_voided     ON cash_withdrawals(voided);
