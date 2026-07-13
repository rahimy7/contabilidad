-- ================================
-- MIGRACIÓN COMPLETA: Sistema de Gestión de Clientes
-- Este script debe ejecutarse en cada esquema de tienda
-- ================================

-- INSTRUCCIONES:
-- Reemplaza 'store_X' con el nombre del esquema de cada tienda
-- Ejecuta este script para cada tienda: store_6, store_16, store_17, store_18

-- ================================
-- CAMBIAR EL ESQUEMA AQUÍ
-- ================================
SET search_path TO store_16, public;  -- ⚠️ CAMBIA 'store_16' por el esquema correspondiente

-- ================================
-- 1. CREAR TABLA DE TIPOS DE CLIENTES
-- ================================
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

-- ================================
-- 2. AGREGAR CAMPOS A LA TABLA CUSTOMERS
-- ================================
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS customer_type_id INTEGER REFERENCES customer_types(id),
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'regular',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Índices para nuevos campos de customers
CREATE INDEX IF NOT EXISTS idx_customers_customer_type_id ON customers(customer_type_id);
CREATE INDEX IF NOT EXISTS idx_customers_category ON customers(category);
CREATE INDEX IF NOT EXISTS idx_customers_is_active ON customers(is_active);

-- ================================
-- 3. CREAR TABLA DE BALANCE DE PUNTOS DE LEALTAD
-- ================================
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

-- ================================
-- 4. CREAR TABLA DE TRANSACCIONES DE PUNTOS DE LEALTAD
-- ================================
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

-- ================================
-- 5. INSERTAR TIPOS DE CLIENTES POR DEFECTO
-- ================================
-- ⚠️ IMPORTANTE: Cambia el store_id según la tienda que estés migrando
-- Para store_6 usa 6, para store_16 usa 16, etc.

INSERT INTO customer_types (store_id, name, description, discount_percentage, color, sort_order)
VALUES
  (16, 'Minorista', 'Cliente minorista estándar', 0.00, '#3b82f6', 1),
  (16, 'Mayorista', 'Cliente que compra al por mayor', 10.00, '#10b981', 2),
  (16, 'Revendedor', 'Socio revendedor autorizado', 15.00, '#f59e0b', 3),
  (16, 'Distribuidor', 'Distribuidor oficial', 20.00, '#8b5cf6', 4)
ON CONFLICT DO NOTHING;

-- ================================
-- 6. ACTUALIZAR CLIENTES EXISTENTES
-- ================================
UPDATE customers
SET
  category = COALESCE(category, 'regular'),
  is_active = COALESCE(is_active, true)
WHERE category IS NULL OR is_active IS NULL;

-- ================================
-- VERIFICACIÓN
-- ================================
-- Ejecuta estas consultas para verificar que todo se creó correctamente:

-- Ver tipos de clientes creados
SELECT * FROM customer_types ORDER BY sort_order;

-- Ver estructura de customers
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'customers'
AND column_name IN ('customer_type_id', 'category', 'is_active');

-- Contar clientes actualizados
SELECT
  COUNT(*) as total_clientes,
  COUNT(CASE WHEN is_active = true THEN 1 END) as activos,
  COUNT(CASE WHEN category = 'regular' THEN 1 END) as regulares
FROM customers;

-- ================================
-- FIN DE LA MIGRACIÓN
-- ================================

-- Para migrar otra tienda:
-- 1. Cambia la línea "SET search_path TO store_X" al inicio
-- 2. Cambia los store_id en los INSERT de customer_types
-- 3. Ejecuta todo el script nuevamente

COMMIT;

-- Mensaje de éxito
DO $$
BEGIN
  RAISE NOTICE '✅ Migración completada exitosamente!';
  RAISE NOTICE 'Tablas creadas: customer_types, customer_loyalty_balance, loyalty_points_transactions';
  RAISE NOTICE 'Campos agregados a customers: customer_type_id, category, is_active';
END $$;
