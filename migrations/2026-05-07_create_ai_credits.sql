-- Crea la tabla ai_credits en producción (idempotente)
-- Refleja la definición en shared/schema.ts (export const aiCredits)
-- Aplicar con: psql "$DATABASE_URL" -f migrations/2026-05-07_create_ai_credits.sql
--   o equivalente con DATABASE_URL apuntando a producción.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_credits (
  id                              SERIAL PRIMARY KEY,
  store_id                        INTEGER NOT NULL UNIQUE,

  total_credits                   INTEGER NOT NULL DEFAULT 0,
  used_credits                    INTEGER NOT NULL DEFAULT 0,
  available_credits               INTEGER NOT NULL DEFAULT 0,

  is_enabled                      BOOLEAN NOT NULL DEFAULT TRUE,
  auto_recharge                   BOOLEAN          DEFAULT FALSE,
  recharge_threshold              INTEGER          DEFAULT 100,
  recharge_amount                 INTEGER          DEFAULT 1000,

  cost_per_message                INTEGER          DEFAULT 1,
  cost_per_order                  INTEGER          DEFAULT 5,
  cost_per_voice_note             INTEGER          DEFAULT 10,

  fallback_when_no_credits        BOOLEAN          DEFAULT TRUE,
  notify_low_credits              BOOLEAN          DEFAULT TRUE,
  low_credit_threshold            INTEGER          DEFAULT 50,

  total_messages_processed        INTEGER          DEFAULT 0,
  total_orders_created            INTEGER          DEFAULT 0,
  total_voice_notes_transcribed   INTEGER          DEFAULT 0,

  last_recharge                   TIMESTAMP,
  last_usage                      TIMESTAMP,
  created_at                      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Índice único explícito sobre store_id (lo crea UNIQUE arriba, redundante pero seguro):
CREATE UNIQUE INDEX IF NOT EXISTS ai_credits_store_id_key
  ON public.ai_credits (store_id);

COMMIT;
