import { Pool } from '@neondatabase/serverless';
import 'dotenv/config';

async function addCashRegisterView() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('🔄 Iniciando migración: Cierre de Caja\n');

    // 1. Crear tabla cash_register_sessions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cash_register_sessions (
        id                   SERIAL PRIMARY KEY,
        store_id             INTEGER NOT NULL,
        cashier_id           INTEGER REFERENCES users(id),
        session_type         TEXT NOT NULL DEFAULT 'shift',
        status               TEXT NOT NULL DEFAULT 'open',

        opening_amount       DECIMAL(12,2) DEFAULT 0,
        opened_at            TIMESTAMP NOT NULL DEFAULT NOW(),
        opening_notes        TEXT,

        cash_reported        DECIMAL(12,2),
        card_reported        DECIMAL(12,2),
        transfer_reported    DECIMAL(12,2),
        credit_reported      DECIMAL(12,2),
        closed_at            TIMESTAMP,
        closed_by_user_id    INTEGER REFERENCES users(id),

        cash_expected        DECIMAL(12,2),
        card_expected        DECIMAL(12,2),
        transfer_expected    DECIMAL(12,2),
        credit_expected      DECIMAL(12,2),

        cash_difference      DECIMAL(12,2),
        card_difference      DECIMAL(12,2),
        transfer_difference  DECIMAL(12,2),
        credit_difference    DECIMAL(12,2),
        total_difference     DECIMAL(12,2),

        total_orders         INTEGER DEFAULT 0,
        total_sales_amount   DECIMAL(12,2) DEFAULT 0,
        total_cancellations  INTEGER DEFAULT 0,
        total_discounts_amount DECIMAL(12,2) DEFAULT 0,
        total_expected       DECIMAL(12,2),
        total_reported       DECIMAL(12,2),

        discrepancy_note     TEXT,
        approved_by_user_id  INTEGER REFERENCES users(id),
        approved_at          TIMESTAMP,
        rejection_reason     TEXT,

        created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log('✅ Tabla cash_register_sessions creada');

    // 2. Índices
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cash_reg_store_id ON cash_register_sessions(store_id);
      CREATE INDEX IF NOT EXISTS idx_cash_reg_opened_at ON cash_register_sessions(opened_at);
      CREATE INDEX IF NOT EXISTS idx_cash_reg_status ON cash_register_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_cash_reg_cashier ON cash_register_sessions(cashier_id);
    `);
    console.log('✅ Índices creados');

    // 3. Insertar la vista en la tabla views
    const viewResult = await pool.query(`
      INSERT INTO views (route_path, label, icon_name, permission_required, section, is_system)
      VALUES ('/cash-register', 'Cierre de Caja', 'Landmark', 'manage_cash_register', 'sales', true)
      ON CONFLICT (route_path) DO UPDATE
        SET label               = EXCLUDED.label,
            icon_name           = EXCLUDED.icon_name,
            permission_required = EXCLUDED.permission_required,
            section             = EXCLUDED.section
      RETURNING id, route_path, label;
    `);
    const view = viewResult.rows[0];
    console.log(`✅ Vista insertada/actualizada: ${view.label} (${view.route_path}) → id=${view.id}`);

    // 4. Asignar a los roles que tienen acceso a manage_orders (cajeras/vendedoras/admin)
    //    y asegurarse de que admin siempre lo tenga
    const rolesResult = await pool.query(`
      SELECT DISTINCT rp.role_id, r.display_name, r.name
      FROM role_permissions rp
      INNER JOIN roles r ON r.id = rp.role_id
      INNER JOIN views v ON v.id = rp.view_id
      WHERE v.permission_required = 'manage_orders'
        AND rp.can_access = true;
    `);

    console.log(`\n🔍 Roles con manage_orders: ${rolesResult.rows.length}`);

    for (const role of rolesResult.rows) {
      // sort_order: después del pos o sales-history
      const posView = await pool.query(`
        SELECT COALESCE(rp.sort_order, 50) + 2 AS sort_order
        FROM role_permissions rp
        INNER JOIN views v ON v.id = rp.view_id
        WHERE rp.role_id = $1 AND v.route_path IN ('/pos', '/sales-history')
        ORDER BY rp.sort_order DESC
        LIMIT 1;
      `, [role.role_id]);

      const sortOrder = posView.rows[0]?.sort_order ?? 60;

      await pool.query(`
        INSERT INTO role_permissions (role_id, view_id, can_access, sort_order)
        VALUES ($1, $2, true, $3)
        ON CONFLICT (role_id, view_id) DO NOTHING;
      `, [role.role_id, view.id, sortOrder]);

      console.log(`   ✅ Permiso agregado al rol: ${role.display_name} (${role.name})`);
    }

    // 5. Verificar resultado final
    const check = await pool.query(`
      SELECT v.route_path, v.label, v.icon_name,
             COUNT(rp.id) AS roles_count,
             STRING_AGG(r.name, ', ' ORDER BY r.name) AS roles
      FROM views v
      LEFT JOIN role_permissions rp ON rp.view_id = v.id AND rp.can_access = true
      LEFT JOIN roles r ON r.id = rp.role_id
      WHERE v.route_path = '/cash-register'
      GROUP BY v.route_path, v.label, v.icon_name;
    `);

    console.log('\n📊 Estado final:');
    check.rows.forEach((r: any) => {
      console.log(`   ${r.route_path} → ${r.roles_count} rol(es): ${r.roles}`);
    });

    console.log('\n✨ Listo! "Cierre de Caja" aparecerá en el sidebar de los roles asignados.');
  } catch (error) {
    console.error('❌ Error en migración:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

addCashRegisterView()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
