-- Migración: Agregar campos para rastrear acreditación de loyalty points
-- Fecha: 2025-12-11
-- Descripción: Agrega campos para prevenir doble acreditación de puntos

-- Agregar campos a la tabla orders
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS loyalty_points_credited BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS loyalty_points_credited_at TIMESTAMP;

-- Crear índice para mejorar el rendimiento de consultas
CREATE INDEX IF NOT EXISTS idx_orders_loyalty_credited
ON orders(loyalty_points_credited);

-- Comentarios para documentación
COMMENT ON COLUMN orders.loyalty_points_credited IS 'Indica si los puntos de lealtad ya fueron acreditados al cliente';
COMMENT ON COLUMN orders.loyalty_points_credited_at IS 'Fecha y hora cuando se acreditaron los puntos de lealtad';

-- Log de migración
DO $$
BEGIN
    RAISE NOTICE '✅ Migración completada: add-loyalty-points-credited-field';
    RAISE NOTICE 'Se agregaron los campos loyalty_points_credited y loyalty_points_credited_at a la tabla orders';
END $$;
