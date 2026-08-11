-- Alertas proactivas: reglas configurables + eventos idempotentes.
--
-- Un cron-like runner evalúa todas las reglas activas y por cada match crea
-- un evento en `alert_events` (idempotente por dedup_key). El delivery a
-- canales (in-app, email, WhatsApp) sucede después: cada delivery se registra
-- separado para poder reintentar sólo el que falló.
--
-- Tipos de reglas soportadas (evaluators registrados en el servicio):
--   cash_low         — posición neta < umbral
--   ar_overdue       — cuentas por cobrar vencidas por > N días o > X%
--   ap_overdue       — cuentas por pagar vencidas
--   approvals_stale  — aprobaciones sin decisión por > N horas
--   mo_short         — órdenes de producción con componentes 'short'
--   low_stock        — productos con stock <= min_quantity
--   fx_stale         — no hay tasa de cambio actualizada del día

CREATE TABLE IF NOT EXISTS alert_rules (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    company_id integer,
    /* Nombre visible en la UI. */
    name text NOT NULL,
    /* Tipo de evaluator — mapea a una función en el servicio. */
    rule_type text NOT NULL CHECK (rule_type IN (
        'cash_low','ar_overdue','ap_overdue','approvals_stale',
        'mo_short','low_stock','fx_stale','custom'
    )),
    /* Parámetros del evaluator — cada tipo define su propio shape.
       Ejemplos:
         cash_low  → { minBalance: 100000 }
         ar_overdue → { days: 60, minAmount: 5000 }
         approvals_stale → { hoursThreshold: 24 } */
    parameters jsonb NOT NULL DEFAULT '{}',
    /* Severidad — impacta color en UI y prioridad en delivery. */
    severity text NOT NULL DEFAULT 'warning'
        CHECK (severity IN ('info','warning','critical')),
    /* Canales de delivery (array de: in_app | email | whatsapp). */
    channels text[] NOT NULL DEFAULT ARRAY['in_app']::text[],
    /* Destinatarios — user_ids que reciben. Vacío = admins del store. */
    recipient_user_ids integer[],
    /* Ventana de silencio para evitar spam: no dispara la misma alerta dos
       veces dentro de este número de minutos. */
    debounce_minutes integer NOT NULL DEFAULT 60,
    is_active boolean NOT NULL DEFAULT true,
    /* Timestamp del último trigger — sirve para debouncing. */
    last_triggered_at timestamp with time zone,
    trigger_count integer NOT NULL DEFAULT 0,
    notes text,
    created_by integer NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS alert_rules_active_idx
    ON alert_rules (store_id, is_active, rule_type);
--> statement-breakpoint

-- ── Eventos disparados ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alert_events (
    id serial PRIMARY KEY,
    rule_id integer NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
    store_id integer NOT NULL,
    /* Hash único para evitar duplicados. Típicamente:
         sha256(rule_id | rule_type | dominio_evento | window_key)
       donde window_key es el día o el turno. Ejemplos:
         cash_low → sha256(rule_id | date)
         ar_overdue → sha256(rule_id | ar_open_item.id | date) */
    dedup_key text NOT NULL,
    severity text NOT NULL,
    /* Mensaje resumido — 1 línea para in-app y push. */
    title text NOT NULL,
    /* Detalle completo — JSON con contexto (ids, valores, umbrales). */
    payload jsonb NOT NULL DEFAULT '{}',
    /* Estado del evento: new | acknowledged | resolved | dismissed */
    status text NOT NULL DEFAULT 'new'
        CHECK (status IN ('new','acknowledged','resolved','dismissed')),
    acknowledged_by integer,
    acknowledged_at timestamp with time zone,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS alert_events_dedup_uq
    ON alert_events (rule_id, dedup_key);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS alert_events_status_idx
    ON alert_events (store_id, status, created_at DESC);
--> statement-breakpoint

-- ── Deliveries ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alert_deliveries (
    id serial PRIMARY KEY,
    event_id integer NOT NULL REFERENCES alert_events(id) ON DELETE CASCADE,
    channel text NOT NULL CHECK (channel IN ('in_app','email','whatsapp')),
    recipient_user_id integer,
    recipient_address text,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','sent','failed','skipped')),
    sent_at timestamp with time zone,
    error_message text,
    retry_count integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS alert_deliveries_event_idx
    ON alert_deliveries (event_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS alert_deliveries_status_idx
    ON alert_deliveries (status, created_at) WHERE status = 'pending';
--> statement-breakpoint
