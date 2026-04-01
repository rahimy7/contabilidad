import { Pool } from '@neondatabase/serverless';
import 'dotenv/config';

async function migrateInventoryAdjustment() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('🔄 Starting inventory adjustment migration...\n');

    // 1. Create inventory_adjustments header table
    await pool.query(`
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
    `);
    console.log('✅ inventory_adjustments table created');

    // 2. Create inventory_adjustment_items line table
    await pool.query(`
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
    `);
    console.log('✅ inventory_adjustment_items table created');

    // 3. Indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_inv_adj_store_id ON inventory_adjustments(store_id);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_inv_adj_created_at ON inventory_adjustments(created_at);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_inv_adj_items_adj_id ON inventory_adjustment_items(adjustment_id);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_inv_adj_items_product_id ON inventory_adjustment_items(product_id);');
    console.log('✅ Indexes created');

    // 4. Insert view for sidebar
    await pool.query(`
      INSERT INTO views (route_path, label, icon_name, permission_required, section, is_system)
      VALUES ('/inventory-adjustment', 'Ajuste de Inventario', 'ClipboardList', 'manage_inventory_adjustments', 'admin', true)
      ON CONFLICT (route_path) DO NOTHING;
    `);
    console.log('✅ View inserted into views table');

    // 5. Assign view to admin role
    const result = await pool.query(`
      INSERT INTO role_permissions (role_id, view_id, can_access, sort_order)
      SELECT r.id, v.id, true, 16
      FROM roles r, views v
      WHERE r.name = 'admin' AND v.route_path = '/inventory-adjustment'
      AND NOT EXISTS (
        SELECT 1 FROM role_permissions rp
        WHERE rp.role_id = r.id AND rp.view_id = v.id
      );
    `);
    console.log(`✅ Admin role_permission assigned (${result.rowCount} row(s) inserted)`);

    // 6. Verify
    const verify = await pool.query(`
      SELECT v.route_path, v.label, v.icon_name, v.permission_required
      FROM views v
      WHERE v.route_path = '/inventory-adjustment';
    `);
    console.log('\n📋 View verification:', verify.rows);

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrateInventoryAdjustment();
