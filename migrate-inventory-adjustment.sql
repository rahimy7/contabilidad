-- Migration: Inventory Adjustment Tables
-- Run this against the production database

-- 1. Create inventory_adjustments header table
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL,
  adjusted_by INTEGER REFERENCES users(id),
  notes TEXT,
  total_items INTEGER NOT NULL DEFAULT 0,
  surplus_items INTEGER NOT NULL DEFAULT 0,
  deficit_items INTEGER NOT NULL DEFAULT 0,
  surplus_value DECIMAL(14,2) NOT NULL DEFAULT 0,
  deficit_value DECIMAL(14,2) NOT NULL DEFAULT 0,
  net_adjustment_value DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. Create inventory_adjustment_items line table
CREATE TABLE IF NOT EXISTS inventory_adjustment_items (
  id SERIAL PRIMARY KEY,
  adjustment_id INTEGER NOT NULL REFERENCES inventory_adjustments(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  previous_stock INTEGER NOT NULL DEFAULT 0,
  real_stock INTEGER NOT NULL DEFAULT 0,
  difference INTEGER NOT NULL DEFAULT 0,
  unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  base_currency TEXT NOT NULL DEFAULT 'DOP',
  adjustment_amount DECIMAL(14,2) NOT NULL DEFAULT 0
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_inv_adj_store_id ON inventory_adjustments(store_id);
CREATE INDEX IF NOT EXISTS idx_inv_adj_created_at ON inventory_adjustments(created_at);
CREATE INDEX IF NOT EXISTS idx_inv_adj_items_adj_id ON inventory_adjustment_items(adjustment_id);
CREATE INDEX IF NOT EXISTS idx_inv_adj_items_product_id ON inventory_adjustment_items(product_id);

-- 4. Insert view for sidebar
INSERT INTO views (route_path, label, icon_name, permission_required, section, is_system)
VALUES ('/inventory-adjustment', 'Ajuste de Inventario', 'ClipboardList', 'manage_inventory_adjustments', 'admin', true)
ON CONFLICT (route_path) DO NOTHING;

-- 5. Assign view to admin role
INSERT INTO role_permissions (role_id, view_id, can_access, sort_order)
SELECT r.id, v.id, true, 16
FROM roles r, views v
WHERE r.name = 'admin' AND v.route_path = '/inventory-adjustment'
AND NOT EXISTS (
  SELECT 1 FROM role_permissions rp
  WHERE rp.role_id = r.id AND rp.view_id = v.id
);
