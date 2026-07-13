-- Migración: Agregar columnas para productos pendientes de selección
-- Fecha: 2025-12-12
-- Propósito: Permitir que el sistema persista productos pendientes cuando muestra opciones con botones

-- Agregar columnas a ai_conversations en CADA schema de tienda
DO $$
DECLARE
    schema_name text;
BEGIN
    -- Iterar sobre todos los schemas que empiecen con "store_"
    FOR schema_name IN 
        SELECT nspname 
        FROM pg_namespace 
        WHERE nspname LIKE 'store_%'
    LOOP
        -- Verificar si la tabla existe en este schema
        IF EXISTS (
            SELECT 1 
            FROM information_schema.tables 
            WHERE table_schema = schema_name 
            AND table_name = 'ai_conversations'
        ) THEN
            -- Agregar columna pending_product_selection si no existe
            IF NOT EXISTS (
                SELECT 1 
                FROM information_schema.columns 
                WHERE table_schema = schema_name 
                AND table_name = 'ai_conversations' 
                AND column_name = 'pending_product_selection'
            ) THEN
                EXECUTE format('ALTER TABLE %I.ai_conversations ADD COLUMN pending_product_selection TEXT', schema_name);
                RAISE NOTICE 'Agregada columna pending_product_selection a %.ai_conversations', schema_name;
            ELSE
                RAISE NOTICE 'Columna pending_product_selection ya existe en %.ai_conversations', schema_name;
            END IF;

            -- Agregar columna pending_products_by_index si no existe
            IF NOT EXISTS (
                SELECT 1 
                FROM information_schema.columns 
                WHERE table_schema = schema_name 
                AND table_name = 'ai_conversations' 
                AND column_name = 'pending_products_by_index'
            ) THEN
                EXECUTE format('ALTER TABLE %I.ai_conversations ADD COLUMN pending_products_by_index TEXT', schema_name);
                RAISE NOTICE 'Agregada columna pending_products_by_index a %.ai_conversations', schema_name;
            ELSE
                RAISE NOTICE 'Columna pending_products_by_index ya existe en %.ai_conversations', schema_name;
            END IF;
        ELSE
            RAISE NOTICE 'Tabla ai_conversations no existe en schema %', schema_name;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Migración completada exitosamente';
END $$;

-- Verificar las columnas agregadas
SELECT 
    table_schema,
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'ai_conversations'
AND column_name IN ('pending_product_selection', 'pending_products_by_index')
AND table_schema LIKE 'store_%'
ORDER BY table_schema;
