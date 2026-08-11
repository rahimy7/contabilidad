-- Motor de aprobaciones (Fase 01).
--
-- Cinco flujos distintos comparten la misma forma: un documento en estado
-- borrador, una regla que decide quién debe autorizarlo según monto y tipo,
-- y una bitácora de quién aprobó qué y cuándo. Construir la forma una vez y
-- especializarla desde el llamador es la diferencia entre cinco meses y uno.
--
--   - Aprobación de órdenes de compra
--   - Aprobación de precios y descuentos
--   - Requisiciones internas
--   - Vacaciones y permisos
--   - Ajustes de inventario sobre un monto
--
-- Tres tablas:
--   `approval_rules`     regla por tipo/rango de monto → aprobador (rol o usuario).
--   `approval_requests`  la solicitud viva: qué documento, quién la pidió,
--                        estado (pending/approved/rejected/cancelled), monto,
--                        moneda, cuántas aprobaciones faltan.
--   `approval_actions`   quién aprobó/rechazó/comentó cada paso. Nunca se borra.

CREATE TABLE IF NOT EXISTS approval_rules (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    document_type text NOT NULL,
    min_amount numeric(14, 2) DEFAULT 0 NOT NULL,
    max_amount numeric(14, 2),
    approver_role text,
    approver_user_id integer,
    required_approvals integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT approval_rules_target_ck CHECK (approver_role IS NOT NULL OR approver_user_id IS NOT NULL),
    CONSTRAINT approval_rules_range_ck CHECK (max_amount IS NULL OR max_amount >= min_amount),
    CONSTRAINT approval_rules_required_ck CHECK (required_approvals >= 1)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS approval_rules_lookup_idx
    ON approval_rules (store_id, document_type, is_active, priority);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS approval_requests (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    document_type text NOT NULL,
    document_id text NOT NULL,
    document_ref text,
    amount numeric(14, 2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'DOP' NOT NULL,
    requested_by integer NOT NULL,
    reason text,
    status text DEFAULT 'pending' NOT NULL,
    required_approvals integer DEFAULT 1 NOT NULL,
    received_approvals integer DEFAULT 0 NOT NULL,
    approver_role text,
    approver_user_id integer,
    rule_id integer REFERENCES approval_rules(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    CONSTRAINT approval_requests_status_ck CHECK (status IN ('pending','approved','rejected','cancelled')),
    CONSTRAINT approval_requests_required_ck CHECK (required_approvals >= 1),
    CONSTRAINT approval_requests_received_ck CHECK (received_approvals >= 0)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS approval_requests_status_idx
    ON approval_requests (store_id, status, document_type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS approval_requests_document_idx
    ON approval_requests (document_type, document_id);
--> statement-breakpoint
-- Un documento sólo puede tener una solicitud viva a la vez; reintentos crean
-- filas nuevas pero sólo tras cerrar la anterior.
CREATE UNIQUE INDEX IF NOT EXISTS approval_requests_pending_uq
    ON approval_requests (store_id, document_type, document_id)
    WHERE status = 'pending';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS approval_actions (
    id serial PRIMARY KEY,
    request_id integer REFERENCES approval_requests(id) ON DELETE CASCADE NOT NULL,
    actor_user_id integer NOT NULL,
    action text NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT approval_actions_action_ck CHECK (action IN ('approve','reject','comment','cancel'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS approval_actions_request_idx
    ON approval_actions (request_id, created_at);
