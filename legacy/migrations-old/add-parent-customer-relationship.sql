-- ================================
-- MIGRACIÓN: Relación de Clientes Padres/Hijos
-- Agrega la capacidad de vincular clientes a un cliente padre
-- Los puntos de lealtad de los clientes hijos se acumulan al padre
-- ================================

-- 1. Agregar columna parent_customer_id a la tabla customers
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS parent_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;

-- 2. Crear índice para optimizar las búsquedas de relaciones padre-hijo
CREATE INDEX IF NOT EXISTS idx_customers_parent_customer_id ON customers(parent_customer_id);

-- 3. Agregar restricción para evitar que un cliente sea su propio padre
-- Nota: Primero verificamos si existe, si no existe la creamos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_not_self_parent'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT chk_not_self_parent CHECK (parent_customer_id IS NULL OR parent_customer_id != id);
  END IF;
END $$;

-- 4. Comentarios para documentación
COMMENT ON COLUMN customers.parent_customer_id IS 'ID del cliente padre. Los puntos de lealtad de este cliente se acumulan al padre';

-- ================================
-- FIN DE MIGRACIÓN
-- ================================
