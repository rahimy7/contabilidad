-- ============================================================
-- MIGRACIÓN: Sistema Multi-Almacenes (Sucursales)
-- ============================================================

-- 1. Tabla de almacenes / sucursales
CREATE TABLE IF NOT EXISTS warehouses (
  id            SERIAL PRIMARY KEY,
  store_id      INTEGER NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  address       TEXT,
  phone         TEXT,
  manager       TEXT,
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warehouses_store_id ON warehouses (store_id);

-- 2. Stock de productos por almacén
CREATE TABLE IF NOT EXISTS warehouse_stock (
  id             SERIAL PRIMARY KEY,
  warehouse_id   INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id       INTEGER NOT NULL,
  quantity       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  min_stock      NUMERIC(12, 2) DEFAULT 0,
  max_stock      NUMERIC(12, 2),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (warehouse_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_warehouse ON warehouse_stock (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_product  ON warehouse_stock (product_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_store    ON warehouse_stock (store_id);

-- 3. Transferencias entre almacenes
CREATE TABLE IF NOT EXISTS warehouse_transfers (
  id                  SERIAL PRIMARY KEY,
  store_id            INTEGER NOT NULL,
  transfer_number     TEXT NOT NULL,
  from_warehouse_id   INTEGER NOT NULL REFERENCES warehouses(id),
  to_warehouse_id     INTEGER NOT NULL REFERENCES warehouses(id),
  status              TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | in_transit | completed | cancelled
  notes               TEXT,
  created_by          INTEGER REFERENCES users(id),
  approved_by         INTEGER REFERENCES users(id),
  completed_by        INTEGER REFERENCES users(id),
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  approved_at         TIMESTAMP,
  completed_at        TIMESTAMP,
  CONSTRAINT chk_different_warehouses CHECK (from_warehouse_id <> to_warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_wt_store     ON warehouse_transfers (store_id);
CREATE INDEX IF NOT EXISTS idx_wt_status    ON warehouse_transfers (status);
CREATE INDEX IF NOT EXISTS idx_wt_from      ON warehouse_transfers (from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_wt_to        ON warehouse_transfers (to_warehouse_id);

-- 4. Ítems de cada transferencia
CREATE TABLE IF NOT EXISTS warehouse_transfer_items (
  id                    SERIAL PRIMARY KEY,
  transfer_id           INTEGER NOT NULL REFERENCES warehouse_transfers(id) ON DELETE CASCADE,
  product_id            INTEGER NOT NULL REFERENCES products(id),
  requested_quantity    NUMERIC(12, 2) NOT NULL,
  sent_quantity         NUMERIC(12, 2),
  received_quantity     NUMERIC(12, 2),
  notes                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_wti_transfer ON warehouse_transfer_items (transfer_id);

-- ============================================================
-- Función utilitaria: obtener stock total de un producto
-- (suma de todos los almacenes del mismo store_id)
-- ============================================================
CREATE OR REPLACE FUNCTION get_product_total_stock(p_product_id INTEGER, p_store_id INTEGER)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(quantity), 0)
  FROM warehouse_stock
  WHERE product_id = p_product_id AND store_id = p_store_id;
$$ LANGUAGE SQL STABLE;

-- ============================================================
-- Registrar vistas de almacenes en el sistema RBAC
-- ============================================================

INSERT INTO views (route_path, label, icon_name, permission_required, section, is_system)
VALUES
  ('/warehouses',          'Almacenes',               'Warehouse',        'manage_products', 'inventory', false),
  ('/warehouse-transfers', 'Transferencias',          'ArrowRightLeft',   'manage_products', 'inventory', false),
  ('/warehouse-reports',   'Reportes Almacenes',      'BarChart3',        'view_reports',    'inventory', false)
ON CONFLICT (route_path) DO NOTHING;

-- Otorgar acceso al rol admin (asumiendo id=1; ajustar si es diferente)
-- Se usa DO NOTHING para no duplicar si ya existe
INSERT INTO role_permissions (role_id, view_id, can_access, sort_order)
SELECT r.id, v.id, true, 90
FROM roles r, views v
WHERE r.name = 'admin'
  AND v.route_path IN ('/warehouses', '/warehouse-transfers', '/warehouse-reports')
ON CONFLICT DO NOTHING;
