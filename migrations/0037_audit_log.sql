-- Bitácora de auditoría interna. `system_audit_log` ya existe en producción
-- desde la migración inicial; su definición estaba comentada en el schema y
-- nadie le escribía. Esta migración normaliza la tabla, agrega la clave
-- primaria que faltaba, columnas para método/ruta/estado HTTP y una fila
-- opcional con el detalle previo/posterior, y los índices de consulta.

-- Reemplazar la tabla cruda por una versión con las columnas necesarias.
-- Usar CREATE IF NOT EXISTS + ALTER para funcionar sobre BD nuevas y
-- sobre la BD de producción que ya tiene la tabla mínima.

CREATE TABLE IF NOT EXISTS system_audit_log (
    id bigserial PRIMARY KEY,
    user_id integer,
    store_id integer,
    action text NOT NULL,
    resource text NOT NULL,
    resource_id text,
    details jsonb,
    ip_address text,
    user_agent text,
    method varchar(10),
    path text,
    status_code integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Alinear la tabla existente en producción (id integer, sin PK, sin columnas
-- nuevas) con la forma que la aplicación espera. Cada ALTER es idempotente.

DO $$
BEGIN
    -- Si `id` no es bigint, lo agrandamos; era `integer NOT NULL` sin secuencia.
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'system_audit_log' AND column_name = 'id' AND data_type <> 'bigint'
    ) THEN
        ALTER TABLE system_audit_log ALTER COLUMN id TYPE bigint USING id::bigint;
    END IF;

    -- Si no hay secuencia asociada a id, la creamos y la enganchamos.
    IF NOT EXISTS (
        SELECT 1 FROM pg_attrdef ad
        JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
        WHERE ad.adrelid = 'system_audit_log'::regclass
          AND a.attname = 'id'
          AND pg_get_expr(ad.adbin, ad.adrelid) LIKE 'nextval%'
    ) THEN
        CREATE SEQUENCE IF NOT EXISTS system_audit_log_id_seq OWNED BY system_audit_log.id;
        PERFORM setval('system_audit_log_id_seq', COALESCE((SELECT max(id) FROM system_audit_log), 0) + 1, false);
        ALTER TABLE system_audit_log ALTER COLUMN id SET DEFAULT nextval('system_audit_log_id_seq');
    END IF;

    -- PK sobre id si no existe.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'system_audit_log'::regclass AND contype = 'p'
    ) THEN
        ALTER TABLE system_audit_log ADD PRIMARY KEY (id);
    END IF;
END
$$;
--> statement-breakpoint

-- Columnas nuevas que la definición inicial no tenía. Cada una es opcional
-- para no romper filas históricas.
ALTER TABLE system_audit_log
    ADD COLUMN IF NOT EXISTS method varchar(10),
    ADD COLUMN IF NOT EXISTS path text,
    ADD COLUMN IF NOT EXISTS status_code integer;
--> statement-breakpoint

-- `details` estaba como text libre; jsonb permite consultar por payload.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'system_audit_log' AND column_name = 'details' AND data_type = 'text'
    ) THEN
        ALTER TABLE system_audit_log ALTER COLUMN details TYPE jsonb USING
            CASE WHEN details IS NULL OR details = '' THEN NULL
                 ELSE details::jsonb END;
    END IF;
END
$$;
--> statement-breakpoint

-- created_at debe ser TIMESTAMPTZ para no perder zona horaria.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'system_audit_log' AND column_name = 'created_at' AND data_type = 'timestamp without time zone'
    ) THEN
        ALTER TABLE system_audit_log ALTER COLUMN created_at TYPE timestamp with time zone USING created_at AT TIME ZONE 'UTC';
    END IF;
END
$$;
--> statement-breakpoint

-- Índices que soportan las consultas típicas: por tienda, usuario y recurso.
CREATE INDEX IF NOT EXISTS system_audit_log_store_created_idx
    ON system_audit_log (store_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS system_audit_log_user_created_idx
    ON system_audit_log (user_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS system_audit_log_resource_idx
    ON system_audit_log (resource, resource_id);
