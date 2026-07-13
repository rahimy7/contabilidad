-- ===========================================================================
-- MIGRACIÓN 001: Backfill Multi-Almacén
-- Propaga warehouse_id a todas las tablas operacionales
-- Idempotente: usa IF NOT EXISTS / ON CONFLICT DO NOTHING
-- ===========================================================================

-- ─── 0. Tabla auxiliar temporaria ──────────────────────────────────────────
-- Almacena el warehouse "Principal" (default) por cada store_id

CREATE TEMP TABLE IF NOT EXISTS tmp_default_warehouses (
  store_id     INTEGER PRIMARY KEY,
  warehouse_id INTEGER NOT NULL
);

-- ─── 1. Crear almacén "Principal" en cada store que no lo tenga ────────────

-- Obtener todos los store_id distintos de las tablas operacionales
WITH stores_in_use AS (
  SELECT DISTINCT store_id FROM users          WHERE store_id IS NOT NULL
  UNION
  SELECT DISTINCT store_id FROM orders         WHERE store_id IS NOT NULL
  UNION
  SELECT DISTINCT store_id FROM cash_register_sessions WHERE store_id IS NOT NULL
  UNION
  SELECT DISTINCT store_id FROM purchase_orders WHERE store_id IS NOT NULL
  UNION
  SELECT DISTINCT store_id FROM appointments   WHERE store_id IS NOT NULL
)
INSERT INTO warehouses (store_id, name, description, is_default, is_active, created_at, updated_at)
SELECT
  s.store_id,
  'Principal',
  'Almacén principal (creado automáticamente)',
  true,
  true,
  NOW(),
  NOW()
FROM stores_in_use s
WHERE NOT EXISTS (
  SELECT 1 FROM warehouses w
  WHERE w.store_id = s.store_id AND w.is_default = true
);

-- Poblar tmp_default_warehouses con el warehouse default de cada store
INSERT INTO tmp_default_warehouses (store_id, warehouse_id)
SELECT DISTINCT ON (store_id) store_id, id
FROM warehouses
WHERE is_default = true
ORDER BY store_id, id;

-- ─── 2. Agregar columna warehouse_id (nullable) a las tablas operacionales ─

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS warehouse_id INTEGER REFERENCES warehouses(id);

ALTER TABLE cash_register_sessions
  ADD COLUMN IF NOT EXISTS warehouse_id INTEGER REFERENCES warehouses(id);

ALTER TABLE cash_withdrawals
  ADD COLUMN IF NOT EXISTS warehouse_id INTEGER REFERENCES warehouses(id);

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS warehouse_id INTEGER REFERENCES warehouses(id);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS warehouse_id INTEGER REFERENCES warehouses(id);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS warehouse_id INTEGER REFERENCES warehouses(id);

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS warehouse_id INTEGER REFERENCES warehouses(id);

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS warehouse_id INTEGER REFERENCES warehouses(id);

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS warehouse_id INTEGER REFERENCES warehouses(id);

-- ─── 3. Backfill: asignar el warehouse default según store_id ──────────────

UPDATE users u
SET warehouse_id = d.warehouse_id
FROM tmp_default_warehouses d
WHERE u.store_id  = d.store_id
  AND u.warehouse_id IS NULL
  AND u.role NOT IN ('super_admin');

UPDATE cash_register_sessions s
SET warehouse_id = d.warehouse_id
FROM tmp_default_warehouses d
WHERE s.store_id = d.store_id
  AND s.warehouse_id IS NULL;

UPDATE cash_withdrawals w
SET warehouse_id = d.warehouse_id
FROM tmp_default_warehouses d
WHERE w.store_id = d.store_id
  AND w.warehouse_id IS NULL;

UPDATE inventory_movements m
SET warehouse_id = d.warehouse_id
FROM tmp_default_warehouses d
WHERE m.store_id = d.store_id
  AND m.warehouse_id IS NULL;

UPDATE orders o
SET warehouse_id = d.warehouse_id
FROM tmp_default_warehouses d
WHERE o.store_id = d.store_id
  AND o.warehouse_id IS NULL;

UPDATE order_items oi
SET warehouse_id = o.warehouse_id
FROM orders o
WHERE oi.order_id = o.id
  AND oi.warehouse_id IS NULL;

UPDATE purchase_orders po
SET warehouse_id = d.warehouse_id
FROM tmp_default_warehouses d
WHERE po.store_id = d.store_id
  AND po.warehouse_id IS NULL;

UPDATE purchase_order_items poi
SET warehouse_id = po.warehouse_id
FROM purchase_orders po
WHERE poi.purchase_order_id = po.id
  AND poi.warehouse_id IS NULL;

UPDATE appointments a
SET warehouse_id = d.warehouse_id
FROM tmp_default_warehouses d
WHERE a.store_id = d.store_id
  AND a.warehouse_id IS NULL;

-- ─── 4. Backfill warehouse_stock desde products.stock_quantity ─────────────
-- Solo inserta donde no exista ya una fila en warehouse_stock para ese producto/warehouse

INSERT INTO warehouse_stock (warehouse_id, product_id, store_id, quantity, min_stock, updated_at)
SELECT
  d.warehouse_id,
  p.id,
  p.store_id,
  COALESCE(p.stock_quantity, 0),
  COALESCE(p.min_quantity, 0),
  NOW()
FROM products p
JOIN tmp_default_warehouses d ON d.store_id = p.store_id
WHERE NOT EXISTS (
  SELECT 1 FROM warehouse_stock ws
  WHERE ws.product_id = p.id
    AND ws.warehouse_id = d.warehouse_id
);

-- ─── 5. SET NOT NULL en tablas operacionales (excepto users) ───────────────
-- Solo se ejecuta si ya no hay NULLs (seguro por el backfill previo)

ALTER TABLE cash_register_sessions  ALTER COLUMN warehouse_id SET NOT NULL;
ALTER TABLE cash_withdrawals        ALTER COLUMN warehouse_id SET NOT NULL;
ALTER TABLE inventory_movements     ALTER COLUMN warehouse_id SET NOT NULL;
ALTER TABLE orders                  ALTER COLUMN warehouse_id SET NOT NULL;
ALTER TABLE order_items             ALTER COLUMN warehouse_id SET NOT NULL;
ALTER TABLE purchase_orders         ALTER COLUMN warehouse_id SET NOT NULL;
ALTER TABLE purchase_order_items    ALTER COLUMN warehouse_id SET NOT NULL;
ALTER TABLE appointments            ALTER COLUMN warehouse_id SET NOT NULL;

-- ─── 6. Índices para rendimiento ────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_users_warehouse_id                 ON users (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_warehouse_id         ON cash_register_sessions (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_cash_withdrawals_warehouse_id      ON cash_withdrawals (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_warehouse_id   ON inventory_movements (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_orders_warehouse_id                ON orders (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_order_items_warehouse_id           ON order_items (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_warehouse_id       ON purchase_orders (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_warehouse_id  ON purchase_order_items (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_appointments_warehouse_id          ON appointments (warehouse_id);

-- ─── 7. Permiso RBAC: view_all_warehouses ───────────────────────────────────

INSERT INTO views (route_path, label, icon_name, permission_required, section, is_system)
VALUES ('/corporate-reports', 'Reportes Corporativos', 'Building2', 'view_all_warehouses', 'reports', false)
ON CONFLICT (route_path) DO NOTHING;

-- Otorgar view_all_warehouses a roles admin y super_admin
INSERT INTO role_permissions (role_id, view_id, can_access, sort_order)
SELECT r.id, v.id, true, 95
FROM roles r
CROSS JOIN views v
WHERE r.name IN ('admin', 'super_admin')
  AND v.permission_required = 'view_all_warehouses'
ON CONFLICT DO NOTHING;
