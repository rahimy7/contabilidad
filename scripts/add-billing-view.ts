import { Pool } from '@neondatabase/serverless';
import 'dotenv/config';

async function addBillingView() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('🔄 Insertando vista de Facturación del Sistema...\n');

    // 1. Insertar la vista
    const viewResult = await pool.query(`
      INSERT INTO views (route_path, label, icon_name, permission_required, section, is_system)
      VALUES ('/billing', 'Facturación', 'CreditCard', 'manage_settings', 'config', true)
      ON CONFLICT (route_path) DO UPDATE
        SET label               = EXCLUDED.label,
            icon_name           = EXCLUDED.icon_name,
            permission_required = EXCLUDED.permission_required,
            section             = EXCLUDED.section,
            is_system           = EXCLUDED.is_system
      RETURNING id, route_path, label;
    `);
    const view = viewResult.rows[0];
    console.log(`✅ Vista insertada/actualizada: ${view.label} (${view.route_path}) → id=${view.id}`);

    // 2. Asignar a todos los roles que tengan manage_settings
    const rolesResult = await pool.query(`
      SELECT DISTINCT rp.role_id, r.display_name, r.name
      FROM role_permissions rp
      INNER JOIN roles r ON r.id = rp.role_id
      INNER JOIN views v ON v.id = rp.view_id
      WHERE v.permission_required = 'manage_settings'
        AND rp.can_access = true;
    `);

    console.log(`\n🔍 Roles con manage_settings: ${rolesResult.rows.length}`);

    for (const role of rolesResult.rows) {
      const sortResult = await pool.query(`
        SELECT COALESCE(MAX(rp.sort_order), 90) + 1 AS sort_order
        FROM role_permissions rp
        WHERE rp.role_id = $1;
      `, [role.role_id]);

      const sortOrder = sortResult.rows[0]?.sort_order ?? 95;

      await pool.query(`
        INSERT INTO role_permissions (role_id, view_id, can_access, sort_order)
        VALUES ($1, $2, true, $3)
        ON CONFLICT (role_id, view_id) DO NOTHING;
      `, [role.role_id, view.id, sortOrder]);

      console.log(`   ✅ Permiso agregado al rol: ${role.display_name} (${role.name})`);
    }

    // 3. Verificar
    const check = await pool.query(`
      SELECT v.route_path, v.label, v.icon_name,
             COUNT(rp.id) AS roles_count
      FROM views v
      LEFT JOIN role_permissions rp ON rp.view_id = v.id AND rp.can_access = true
      WHERE v.route_path = '/billing'
      GROUP BY v.route_path, v.label, v.icon_name;
    `);

    console.log('\n📊 Resultado final:');
    for (const row of check.rows) {
      console.log(`  ${row.route_path} → "${row.label}" | icon: ${row.icon_name} | roles: ${row.roles_count}`);
    }

    console.log('\n✅ Migración completada exitosamente.');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addBillingView();
