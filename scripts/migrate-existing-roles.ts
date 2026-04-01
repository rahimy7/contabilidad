import { Pool } from '@neondatabase/serverless';
import 'dotenv/config';

/**
 * Script de migración para convertir roles hardcoded en registros de base de datos
 * - Crea los 4 roles base: admin, technician, seller, delivery
 * - Mapea permisos desde rolePermissions en auth.ts a role_permissions
 * - Asigna roles a usuarios existentes según su columna 'role'
 */

// Definición de permisos por rol (extraído de shared/auth.ts)
const rolePermissionsMap = {
  admin: [
    'view_dashboard',
    'manage_users',
    'manage_orders',
    'manage_customers',
    'manage_products',
    'view_reports',
    'manage_settings',
    'view_conversations',
    'send_messages',
    'view_notifications',
    'manage_assignments',
  ],
  technician: [
    'view_dashboard',
    'technician_work',
    'view_assigned_orders',
    'view_orders',
    'update_order_status',
    'view_customers',
    'view_conversations',
    'send_messages',
    'view_notifications',
    'update_profile',
    'view_technician',
    'manage_installations',
    'view_installations',
  ],
  seller: [
    'view_dashboard',
    'manage_orders',
    'view_orders',
    'view_customers',
    'manage_customers',
    'add_customers',
    'view_products',
    'view_conversations',
    'send_messages',
    'view_notifications',
    'create_quotes',
  ],
  delivery: [
    'view_dashboard_delivery',
    'view_assigned_orders',
    'view_orders',
    'update_delivery_status',
    'view_customers',
    'view_conversations',
    'send_messages',
    'view_notifications',
    'update_location',
  ],
};

// Roles base del sistema
const baseRoles = [
  {
    name: 'admin',
    displayName: 'Administrador',
    description: 'Acceso completo al sistema. Puede gestionar usuarios, configuraciones y todos los módulos.',
    isSystem: true,
  },
  {
    name: 'technician',
    displayName: 'Técnico',
    description: 'Especializado en instalaciones y trabajos técnicos. Acceso a órdenes asignadas y panel técnico.',
    isSystem: false,
  },
  {
    name: 'seller',
    displayName: 'Vendedor',
    description: 'Gestión de ventas, clientes y pedidos. Acceso a punto de venta y reportes básicos.',
    isSystem: false,
  },
  {
    name: 'delivery',
    displayName: 'Repartidor',
    description: 'Gestión de entregas y viajes. Vista optimizada para rutas y órdenes de entrega.',
    isSystem: false,
  },
];

async function migrateExistingRoles() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('🚀 Iniciando migración de roles existentes...\n');

    // 1. Verificar que las tablas necesarias existen
    console.log('📋 Verificando tablas...');
    const tablesCheck = await pool.query(`
      SELECT 
        (SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'roles')) as roles_exists,
        (SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'views')) as views_exists,
        (SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'role_permissions')) as role_permissions_exists,
        (SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_roles')) as user_roles_exists;
    `);

    const check = tablesCheck.rows[0];
    if (!check.roles_exists || !check.views_exists || !check.role_permissions_exists || !check.user_roles_exists) {
      throw new Error('Las tablas RBAC no existen. Ejecuta primero migrate-rbac-system.ts y seed-initial-views.ts');
    }
    console.log('✅ Todas las tablas existen\n');

    // 2. Crear roles base
    console.log('📋 Creando roles base...');
    const createdRoles: Record<string, number> = {};

    for (const role of baseRoles) {
      const result = await pool.query(
        `
        INSERT INTO roles (name, display_name, description, is_system, is_active)
        VALUES ($1, $2, $3, $4, TRUE)
        ON CONFLICT (name) DO UPDATE 
        SET display_name = EXCLUDED.display_name,
            description = EXCLUDED.description,
            is_system = EXCLUDED.is_system
        RETURNING id;
        `,
        [role.name, role.displayName, role.description, role.isSystem]
      );

      createdRoles[role.name] = result.rows[0].id;
      console.log(`✅ Rol creado/actualizado: ${role.displayName} (ID: ${result.rows[0].id})`);
    }
    console.log('');

    // 3. Obtener todas las vistas
    console.log('📋 Obteniendo vistas del sistema...');
    const viewsResult = await pool.query('SELECT id, permission_required FROM views;');
    const viewsMap = new Map<string, number>();
    viewsResult.rows.forEach((row) => {
      viewsMap.set(row.permission_required, row.id);
    });
    console.log(`✅ ${viewsMap.size} vistas encontradas\n`);

    // 4. Asignar permisos a cada rol
    console.log('📋 Asignando permisos a roles...');
    let totalPermissions = 0;

    for (const [roleName, permissions] of Object.entries(rolePermissionsMap)) {
      const roleId = createdRoles[roleName];
      if (!roleId) continue;

      console.log(`\n   Procesando rol: ${roleName}`);
      let sortOrder = 1;

      for (const permission of permissions) {
        const viewId = viewsMap.get(permission);
        if (!viewId) {
          console.log(`   ⚠️  Vista no encontrada para permiso: ${permission}`);
          continue;
        }

        try {
          await pool.query(
            `
            INSERT INTO role_permissions (role_id, view_id, can_access, sort_order)
            VALUES ($1, $2, TRUE, $3)
            ON CONFLICT (role_id, view_id) DO UPDATE
            SET can_access = TRUE, sort_order = EXCLUDED.sort_order;
            `,
            [roleId, viewId, sortOrder]
          );

          totalPermissions++;
          sortOrder++;
        } catch (error) {
          console.log(`   ⚠️  Error asignando permiso ${permission}:`, error);
        }
      }

      console.log(`   ✅ ${permissions.length} permisos asignados a ${roleName}`);
    }

    console.log(`\n✅ Total de permisos asignados: ${totalPermissions}\n`);

    // 5. Asignar roles a usuarios existentes
    console.log('📋 Asignando roles a usuarios existentes...');
    const usersResult = await pool.query('SELECT id, username, role FROM users WHERE role IS NOT NULL;');

    let usersAssigned = 0;
    let usersSkipped = 0;

    for (const user of usersResult.rows) {
      const roleId = createdRoles[user.role];

      if (!roleId) {
        console.log(`   ⚠️  Rol desconocido para usuario ${user.username}: ${user.role}`);
        usersSkipped++;
        continue;
      }

      try {
        await pool.query(
          `
          INSERT INTO user_roles (user_id, role_id, is_primary)
          VALUES ($1, $2, TRUE)
          ON CONFLICT (user_id, role_id) DO NOTHING;
          `,
          [user.id, roleId]
        );

        // Actualizar role_id en users
        await pool.query(
          'UPDATE users SET role_id = $1 WHERE id = $2;',
          [roleId, user.id]
        );

        console.log(`   ✅ Usuario ${user.username} → Rol ${user.role}`);
        usersAssigned++;
      } catch (error) {
        console.log(`   ⚠️  Error asignando rol a usuario ${user.username}:`, error);
        usersSkipped++;
      }
    }

    console.log(`\n✅ Usuarios con rol asignado: ${usersAssigned}`);
    console.log(`⏭️  Usuarios omitidos: ${usersSkipped}\n`);

    // 6. Estadísticas finales
    console.log('📊 Estadísticas finales:');
    
    const roleStats = await pool.query(`
      SELECT r.name, r.display_name, COUNT(ur.id) as user_count
      FROM roles r
      LEFT JOIN user_roles ur ON r.id = ur.role_id
      GROUP BY r.id, r.name, r.display_name
      ORDER BY user_count DESC;
    `);

    console.log('\n   Usuarios por rol:');
    roleStats.rows.forEach((row) => {
      console.log(`   ${row.display_name}: ${row.user_count} usuario(s)`);
    });

    const permStats = await pool.query(`
      SELECT r.display_name, COUNT(rp.id) as permission_count
      FROM roles r
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      GROUP BY r.id, r.display_name
      ORDER BY permission_count DESC;
    `);

    console.log('\n   Permisos por rol:');
    permStats.rows.forEach((row) => {
      console.log(`   ${row.display_name}: ${row.permission_count} permisos`);
    });

    console.log('\n✨ Migración de roles completada exitosamente!');
    console.log('\n📝 Próximos pasos:');
    console.log('   1. Verificar datos con: SELECT * FROM roles;');
    console.log('   2. Verificar permisos con: SELECT * FROM role_permissions;');
    console.log('   3. Verificar asignaciones con: SELECT * FROM user_roles;');
    console.log('   4. Implementar los endpoints de backend para gestión de roles\n');

  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Ejecutar migración
migrateExistingRoles()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
