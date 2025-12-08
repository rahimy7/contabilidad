-- ================================
-- MIGRACIÓN: Sistema de Gestión de Clientes
-- Agrega tipos de clientes, categorización y sistema de puntos de lealtad
-- ================================

-- 1. Crear tabla de tipos de clientes
CREATE TABLE IF NOT EXISTS customer_types (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  discount_percentage DECIMAL(5, 2) DEFAULT 0.00,
  is_active BOOLEAN DEFAULT true,
  color TEXT DEFAULT '#3b82f6',
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para customer_types
CREATE INDEX IF NOT EXISTS idx_customer_types_store_id ON customer_types(store_id);
CREATE INDEX IF NOT EXISTS idx_customer_types_is_active ON customer_types(is_active);

-- 2. Agregar campos a la tabla customers
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS customer_type_id INTEGER REFERENCES customer_types(id),
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Índices para nuevos campos de customers
CREATE INDEX IF NOT EXISTS idx_customers_customer_type_id ON customers(customer_type_id);
CREATE INDEX IF NOT EXISTS idx_customers_category ON customers(category);
CREATE INDEX IF NOT EXISTS idx_customers_is_active ON customers(is_active);

-- 3. Crear tabla de balance de puntos de lealtad
CREATE TABLE IF NOT EXISTS customer_loyalty_balance (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL,
  total_points_earned DECIMAL(12, 2) DEFAULT 0.00,
  total_points_redeemed DECIMAL(12, 2) DEFAULT 0.00,
  current_balance DECIMAL(12, 2) DEFAULT 0.00,
  loyalty_program_name TEXT,
  points_property_name TEXT,
  last_earned_at TIMESTAMP,
  last_redeemed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para customer_loyalty_balance
CREATE INDEX IF NOT EXISTS idx_loyalty_balance_customer_id ON customer_loyalty_balance(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_balance_store_id ON customer_loyalty_balance(store_id);

-- 4. Crear tabla de transacciones de puntos de lealtad
CREATE TABLE IF NOT EXISTS loyalty_points_transactions (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  store_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('earned', 'redeemed', 'expired', 'adjusted')),
  points DECIMAL(12, 2) NOT NULL,
  balance_before DECIMAL(12, 2) NOT NULL,
  balance_after DECIMAL(12, 2) NOT NULL,
  order_id INTEGER REFERENCES orders(id),
  description TEXT NOT NULL,
  metadata TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para loyalty_points_transactions
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer_id ON loyalty_points_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_store_id ON loyalty_points_transactions(store_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_type ON loyalty_points_transactions(type);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_created_at ON loyalty_points_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_order_id ON loyalty_points_transactions(order_id);

-- 5. Insertar tipos de clientes por defecto (se insertarán solo si no existen)
-- Nota: Esto debe ejecutarse por cada tienda, reemplaza {store_id} con el ID de cada tienda

-- Ejemplo de inserción (comentado para evitar ejecución automática):
-- INSERT INTO customer_types (store_id, name, description, discount_percentage, color, sort_order)
-- VALUES
--   ({store_id}, 'Minorista', 'Cliente minorista estándar', 0.00, '#3b82f6', 1),
--   ({store_id}, 'Mayorista', 'Cliente que compra al por mayor', 10.00, '#10b981', 2),
--   ({store_id}, 'Revendedor', 'Socio revendedor autorizado', 15.00, '#f59e0b', 3),
--   ({store_id}, 'Distribuidor', 'Distribuidor oficial', 20.00, '#8b5cf6', 4)
-- ON CONFLICT DO NOTHING;

-- 6. Comentarios para documentación
COMMENT ON TABLE customer_types IS 'Tipos de clientes con configuración de descuentos';
COMMENT ON TABLE customer_loyalty_balance IS 'Balance de puntos de lealtad por cliente';
COMMENT ON TABLE loyalty_points_transactions IS 'Historial de transacciones de puntos de lealtad';

COMMENT ON COLUMN customers.customer_type_id IS 'Referencia al tipo de cliente asignado';
COMMENT ON COLUMN customers.category IS 'Categoría del cliente: regular, vip, wholesale, reseller';
COMMENT ON COLUMN customers.is_active IS 'Indica si el cliente está activo';

-- ================================
-- FIN DE MIGRACIÓN
-- ================================
