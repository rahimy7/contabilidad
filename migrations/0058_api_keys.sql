-- API keys para integraciones externas.
--
-- Cada key es un token opaco (sha256 del secret) que se emite una sola vez.
-- El servidor guarda sólo el hash y valida en cada request. Al emitir se
-- muestra el token al humano una vez; nunca más se puede recuperar.

CREATE TABLE IF NOT EXISTS api_keys (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    company_id integer,
    name text NOT NULL,
    /* SHA-256 del token — nunca guardamos el token en claro. */
    key_hash text NOT NULL,
    /* Prefijo público (primeros 8 chars) para identificar la key en logs. */
    key_prefix text NOT NULL,
    /* Scopes de acceso separados por coma: read | write | admin. */
    scopes text[] NOT NULL DEFAULT ARRAY['read']::text[],
    /* Rate limiting: requests por minuto permitidos. */
    rate_limit_per_min integer NOT NULL DEFAULT 60,
    expires_at timestamp with time zone,
    last_used_at timestamp with time zone,
    usage_count bigint NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_by integer NOT NULL,
    revoked_at timestamp with time zone,
    revoked_by integer,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_hash_uq ON api_keys (key_hash);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS api_keys_active_idx
    ON api_keys (store_id, is_active);
--> statement-breakpoint

-- Log de uso — útil para debugging y rate-limit (últimos 60 seg).
CREATE TABLE IF NOT EXISTS api_key_usage (
    id bigserial PRIMARY KEY,
    api_key_id integer NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    method text NOT NULL,
    path text NOT NULL,
    status_code integer,
    duration_ms integer,
    ip_address text,
    user_agent text,
    called_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS api_key_usage_key_idx
    ON api_key_usage (api_key_id, called_at DESC);
--> statement-breakpoint
