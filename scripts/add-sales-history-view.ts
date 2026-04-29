import { Pool } from '@neondatabase/serverless';
import 'dotenv/config';

async function addSalesHistoryView() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // 1. Insertar la vista en la tabla views
    const result = await pool.query(`
      INSERT INTO views (route_path, label, icon_name, permission_required, section, is_system)
      VALUES ('/sales-history', 'Historial de Ventas', 'Receipt', 'manage_orders', 'sales', true)
      ON CONFLICT (route_path) DO UPDATE
        SET label = EXCLUDED.label,
            icon_name = EXCLUDED.icon_name,
            permission_required = EXCLUDED.permission_required,
            section = EXCLUDED.section
      RETURNING id, route_path, label;
    `);

    const view = result.rows[0];
    console.log(`✅ Vista insertada/actualizada: ${view.label} (${view.route_path}) → id=${view.id}`);

    // 2. Agregar a role_permissions para TODOS los roles que ya tengan manage_orders
    const rolesResult = await pool.query(`
      SELECT DISTINCT rp.role_id, r.display_name
      FROM role_permissions rp
      INNER JOIN roles r ON r.id = rp.role_id
      INNER JOIN views v ON v.id = rp.view_id
      WHERE v.permission_required = 'manage_orders'
        AND rp.can_access = true;
    `);

    console.log(`\n🔍 Roles con manage_orders: ${rolesResult.rows.length}`);

    for (const role of rolesResult.rows) {
      // Calcular sort_order: poner justo después del POS
      const posView = await pool.query(`
        SELECT COALESCE(rp.sort_order, 999) as sort_order
        FROM role_permissions rp
        INNER JOIN views v ON v.id = rp.view_id
        WHERE rp.role_id = $1 AND v.route_path = '/pos'
        LIMIT 1;
      `, [role.role_id]);

      const sortOrder = posView.rows[0] ? posView.rows[0].sort_order + 1 : 50;

      await pool.query(`
        INSERT INTO role_permissions (role_id, view_id, can_access, sort_order)
        VALUES ($1, $2, true, $3)
        ON CONFLICT (role_id, view_id) DO NOTHING;
      `, [role.role_id, view.id, sortOrder]);

      console.log(`   ✅ Permiso agregado al rol: ${role.display_name}`);
    }

    // 3. Verificar el resultado
    const check = await pool.query(`
      SELECT v.route_path, v.label, v.icon_name, COUNT(rp.id) as roles_count
      FROM views v
      LEFT JOIN role_permissions rp ON rp.view_id = v.id AND rp.can_access = true
      WHERE v.route_path = '/sales-history'
      GROUP BY v.route_path, v.label, v.icon_name;
    `);

    console.log('\n📊 Estado final:');
    check.rows.forEach(r => {
      console.log(`   ${r.route_path} → ${r.roles_count} rol(es) con acceso`);
    });

    console.log('\n✨ Listo! La vista "Historial de Ventas" ya aparecerá en el sidebar.');
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

addSalesHistoryView()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
