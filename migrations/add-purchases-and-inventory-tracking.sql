-- ================================
-- MIGRACIÓN: Sistema de Compras y Trazabilidad de Inventario
-- Agrega proveedores, órdenes de compra y mejoras al sistema de inventario
-- ================================

-- INSTRUCCIONES:
-- Reemplaza 'store_X' con el nombre del esquema de cada tienda
-- Ejecuta este script para cada tienda: store_6, store_16, store_17, store_18

-- ================================
-- CAMBIAR EL ESQUEMA AQUÍ
-- ================================
SET search_path TO store_16, public;  -- ⚠️ CAMBIA 'store_16' por el esquema correspondiente

-- ================================
-- 1. CREAR TABLA DE PROVEEDORES
-- ================================
CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  tax_id TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para suppliers
CREATE INDEX IF NOT EXISTS idx_suppliers_store_id ON suppliers(store_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON suppliers(is_active);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);

-- ================================
-- 2. CREAR TABLA DE ÓRDENES DE COMPRA
-- ================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL,
  purchase_number TEXT NOT NULL UNIQUE,
  supplier_id INTEGER REFERENCES suppliers(id),
  supplier_name TEXT,

  -- Fechas
  order_date TIMESTAMP NOT NULL DEFAULT NOW(),
  expected_delivery_date TIMESTAMP,
  received_date TIMESTAMP,

  -- Estado
  status TEXT NOT NULL DEFAULT 'pending',

  -- Montos
  subtotal DECIMAL(12, 2) DEFAULT 0.00,
  tax DECIMAL(12, 2) DEFAULT 0.00,
  discount DECIMAL(12, 2) DEFAULT 0.00,
  shipping_cost DECIMAL(12, 2) DEFAULT 0.00,
  total_amount DECIMAL(12, 2) NOT NULL,
  currency TEXT DEFAULT 'DOP',

  -- Referencias
  invoice_number TEXT,
  reference_number TEXT,

  -- Detalles
  notes TEXT,
  payment_terms TEXT,
  payment_status TEXT DEFAULT 'unpaid',

  -- Auditoría
  created_by INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT chk_purchase_status CHECK (status IN ('pending', 'received', 'partial', 'cancelled')),
  CONSTRAINT chk_payment_status CHECK (payment_status IN ('unpaid', 'partial', 'paid'))
);

-- Índices para purchase_orders
CREATE INDEX IF NOT EXISTS idx_purchase_orders_store_id ON purchase_orders(store_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_date ON purchase_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_number ON purchase_orders(purchase_number);

-- ================================
-- 3. CREAR TABLA DE ITEMS DE ÓRDENES DE COMPRA
-- ================================
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id SERIAL PRIMARY KEY,
  purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE CASCADE NOT NULL,
  store_id INTEGER NOT NULL,

  -- Producto
  product_id INTEGER REFERENCES products(id),
  product_name TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,

  -- Cantidad y unidades
  quantity DECIMAL(12, 2) NOT NULL,
  quantity_received DECIMAL(12, 2) DEFAULT 0.00,
  unit_id INTEGER,

  -- Trazabilidad
  lot_number TEXT,
  expiration_date TIMESTAMP,
  manufacturing_date TIMESTAMP,

  -- Precios
  unit_cost DECIMAL(12, 2) NOT NULL,
  tax_rate DECIMAL(5, 2) DEFAULT 0.00,
  discount_rate DECIMAL(5, 2) DEFAULT 0.00,
  total_cost DECIMAL(12, 2) NOT NULL,

  -- Notas
  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para purchase_order_items
CREATE INDEX IF NOT EXISTS idx_po_items_purchase_order_id ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_items_product_id ON purchase_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_po_items_store_id ON purchase_order_items(store_id);
CREATE INDEX IF NOT EXISTS idx_po_items_lot_number ON purchase_order_items(lot_number);

-- ================================
-- 4. ACTUALIZAR TABLA DE MOVIMIENTOS DE INVENTARIO
-- ================================
-- Agregar nuevos campos a inventory_movements si no existen
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS quantity_before DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS quantity_after DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS total_cost DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id),
  ADD COLUMN IF NOT EXISTS reason TEXT;

-- Índices adicionales para inventory_movements
CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON inventory_movements(type);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_supplier_id ON inventory_movements(supplier_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_reference ON inventory_movements(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_lot_number ON inventory_movements(lot_number);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_expiration_date ON inventory_movements(expiration_date);

-- ================================
-- 5. FUNCIÓN PARA GENERAR NÚMERO DE ORDEN DE COMPRA
-- ================================
CREATE OR REPLACE FUNCTION generate_purchase_number()
RETURNS TEXT AS $$
DECLARE
  next_number INTEGER;
  purchase_num TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(purchase_number FROM 4) AS INTEGER)), 0) + 1
  INTO next_number
  FROM purchase_orders
  WHERE purchase_number ~ '^PO-[0-9]+$';

  purchase_num := 'PO-' || LPAD(next_number::TEXT, 6, '0');
  RETURN purchase_num;
END;
$$ LANGUAGE plpgsql;

-- ================================
-- 6. TRIGGER PARA AUTO-GENERAR NÚMERO DE COMPRA
-- ================================
CREATE OR REPLACE FUNCTION set_purchase_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.purchase_number IS NULL OR NEW.purchase_number = '' THEN
    NEW.purchase_number := generate_purchase_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_purchase_number
BEFORE INSERT ON purchase_orders
FOR EACH ROW
EXECUTE FUNCTION set_purchase_number();

-- ================================
-- 7. FUNCIÓN PARA ACTUALIZAR INVENTARIO AL RECIBIR COMPRA
-- ================================
CREATE OR REPLACE FUNCTION update_inventory_on_purchase_received()
RETURNS TRIGGER AS $$
DECLARE
  item RECORD;
  current_stock DECIMAL(12, 2);
BEGIN
  -- Solo procesar cuando el estado cambia a 'received'
  IF NEW.status = 'received' AND (OLD.status IS NULL OR OLD.status != 'received') THEN

    -- Iterar sobre todos los items de la orden de compra
    FOR item IN
      SELECT * FROM purchase_order_items
      WHERE purchase_order_id = NEW.id
    LOOP
      -- Obtener stock actual
      SELECT stock_quantity INTO current_stock
      FROM products
      WHERE id = item.product_id;

      -- Crear movimiento de inventario
      INSERT INTO inventory_movements (
        store_id,
        product_id,
        type,
        quantity,
        quantity_before,
        quantity_after,
        unit_id,
        lot_number,
        expiration_date,
        unit_cost,
        total_cost,
        reference_type,
        reference_id,
        supplier_id,
        notes,
        created_by
      ) VALUES (
        NEW.store_id,
        item.product_id,
        'purchase',
        item.quantity,
        COALESCE(current_stock, 0),
        COALESCE(current_stock, 0) + item.quantity,
        item.unit_id,
        item.lot_number,
        item.expiration_date,
        item.unit_cost,
        item.total_cost,
        'purchase_order',
        NEW.id,
        NEW.supplier_id,
        'Recepción de orden de compra ' || NEW.purchase_number,
        NEW.created_by
      );

      -- Actualizar stock del producto
      UPDATE products
      SET
        stock_quantity = COALESCE(stock_quantity, 0) + item.quantity,
        updated_at = NOW()
      WHERE id = item.product_id;

    END LOOP;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_inventory_on_purchase
AFTER UPDATE ON purchase_orders
FOR EACH ROW
EXECUTE FUNCTION update_inventory_on_purchase_received();

-- ================================
-- 8. INSERTAR PROVEEDORES DE EJEMPLO (OPCIONAL)
-- ================================
-- Descomenta para insertar proveedores de ejemplo
/*
INSERT INTO suppliers (store_id, name, contact_name, phone, email, is_active)
VALUES
  (16, 'Proveedor General', 'Juan Pérez', '809-555-0001', 'contacto@proveedor1.com', true),
  (16, 'Distribuidora Nacional', 'María González', '809-555-0002', 'ventas@distribuidora.com', true),
  (16, 'Importadora ABC', 'Carlos Rodríguez', '809-555-0003', 'info@importadora.com', true)
ON CONFLICT DO NOTHING;
*/

-- ================================
-- VERIFICACIÓN
-- ================================
-- Ejecuta estas consultas para verificar que todo se creó correctamente:

-- Ver proveedores
SELECT * FROM suppliers ORDER BY name;

-- Ver estructura de purchase_orders
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'purchase_orders'
ORDER BY ordinal_position;

-- Ver nuevos campos en inventory_movements
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'inventory_movements'
AND column_name IN ('quantity_before', 'quantity_after', 'unit_cost', 'total_cost', 'supplier_id', 'reason');

-- ================================
-- FIN DE LA MIGRACIÓN
-- ================================

COMMIT;

-- Mensaje de éxito
DO $$
BEGIN
  RAISE NOTICE '✅ Migración de sistema de compras completada exitosamente!';
  RAISE NOTICE 'Tablas creadas: suppliers, purchase_orders, purchase_order_items';
  RAISE NOTICE 'Tabla actualizada: inventory_movements (nuevos campos agregados)';
  RAISE NOTICE 'Funciones creadas: generate_purchase_number, update_inventory_on_purchase_received';
END $$;
