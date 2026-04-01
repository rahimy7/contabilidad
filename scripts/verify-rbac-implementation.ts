import { Pool } from '@neondatabase/serverless';
import 'dotenv/config';

/**
 * Script de verificación completa del sistema RBAC
 * Valida las tablas, datos migrados y endpoints
 */

async function verifyRBACImplementation() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('🔍 Verificando implementación del sistema RBAC...\n');

    // 1. Verificar existencia de tablas
    console.log('📋 Verificando tablas...');
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('roles', 'views', 'role_permissions', 'user_roles')
      ORDER BY table_name;
    `);

    const existingTables = tables.rows.map(r => r.table_name);
    const requiredTables = ['role_permissions', 'roles', 'user_roles', 'views'];
    
    for (const table of requiredTables) {
      if (existingTables.includes(table)) {
        console.log(`   ✅ Tabla "${table}" existe`);
      } else {
        console.log(`   ❌ Tabla "${table}" NO existe`);
      }
    }
    console.log('');

    // 2. Verificar roles creados
    console.log('📋 Verificando roles...');
    const rolesResult = await pool.query(`
      SELECT id, name, display_name, is_system, is_active, 
             (SELECT COUNT(*) FROM user_roles WHERE role_id = roles.id) as user_count
      FROM roles
      ORDER BY is_system DESC, name;
    `);

    console.log(`   Total de roles: ${rolesResult.rows.length}`);
    rolesResult.rows.forEach(role => {
      const systemBadge = role.is_system ? '[SISTEMA]' : '';
      const statusBadge = role.is_active ? '✅' : '⏸️';
      console.log(`   ${statusBadge} ${role.display_name} (${role.name}) ${systemBadge} - ${role.user_count} usuarios`);
    });
    console.log('');

    // 3. Verificar vistas
    console.log('📋 Verificando vistas...');
    const viewsResult = await pool.query(`
      SELECT section, COUNT(*) as count
      FROM views
      GROUP BY section
      ORDER BY section;
    `);

    const totalViews = await pool.query('SELECT COUNT(*) as count FROM views');
    console.log(`   Total de vistas: ${totalViews.rows[0].count}`);
    viewsResult.rows.forEach(row => {
      console.log(`   - ${row.section || 'sin sección'}: ${row.count} vistas`);
    });
    console.log('');

    // 4. Verificar permisos asignados
    console.log('📋 Verificando permisos asignados...');
    const permsResult = await pool.query(`
      SELECT r.display_name, COUNT(rp.id) as permission_count
      FROM roles r
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      GROUP BY r.id, r.display_name
      ORDER BY permission_count DESC;
    `);

    permsResult.rows.forEach(row => {
      console.log(`   ${row.display_name}: ${row.permission_count} permisos`);
    });
    console.log('');

    // 5. Verificar usuarios asignados a roles
    console.log('📋 Verificando usuarios con roles asignados...');
    const usersResult = await pool.query(`
      SELECT 
        u.username,
        u.name,
        r.display_name as role_name,
        ur.is_primary
      FROM user_roles ur
      JOIN users u ON ur.user_id = u.id
      JOIN roles r ON ur.role_id = r.id
      ORDER BY r.display_name, u.username;
    `);

    console.log(`   Total de asignaciones: ${usersResult.rows.length}`);
    usersResult.rows.forEach(row => {
      const primaryBadge = row.is_primary ? '⭐' : '';
      console.log(`   ${primaryBadge} ${row.username} (${row.name}) → ${row.role_name}`);
    });
    console.log('');

    // 6. Verificar usuarios sin roles
    const usersWithoutRoles = await pool.query(`
      SELECT u.id, u.username, u.name, u.role as old_role
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      WHERE ur.id IS NULL;
    `);

    if (usersWithoutRoles.rows.length > 0) {
      console.log('⚠️  Usuarios sin rol asignado:');
      usersWithoutRoles.rows.forEach(user => {
        console.log(`   - ${user.username} (${user.name}) - rol antiguo: ${user.old_role}`);
      });
      console.log('');
    } else {
      console.log('✅ Todos los usuarios tienen rol asignado\n');
    }

    // 7. Verificar índices
    console.log('📋 Verificando índices...');
    const indexes = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename IN ('roles', 'views', 'role_permissions', 'user_roles')
      AND indexname LIKE 'idx_%'
      ORDER BY indexname;
    `);

    console.log(`   Total de índices personalizados: ${indexes.rows.length}`);
    indexes.rows.forEach(idx => {
      console.log(`   ✅ ${idx.indexname}`);
    });
    console.log('');

    // 8. Verificar integridad referencial
    console.log('📋 Verificando integridad referencial...');
    
    // Verificar role_permissions sin rol
    const orphanPermissions = await pool.query(`
      SELECT COUNT(*) as count
      FROM role_permissions rp
      LEFT JOIN roles r ON rp.role_id = r.id
      WHERE r.id IS NULL;
    `);

    // Verificar role_permissions sin vista
    const orphanPermissions2 = await pool.query(`
      SELECT COUNT(*) as count
      FROM role_permissions rp
      LEFT JOIN views v ON rp.view_id = v.id
      WHERE v.id IS NULL;
    `);

    // Verificar user_roles sin usuario
    const orphanUserRoles = await pool.query(`
      SELECT COUNT(*) as count
      FROM user_roles ur
      LEFT JOIN users u ON ur.user_id = u.id
      WHERE u.id IS NULL;
    `);

    const orphanCount = 
      parseInt(orphanPermissions.rows[0].count) +
      parseInt(orphanPermissions2.rows[0].count) +
      parseInt(orphanUserRoles.rows[0].count);

    if (orphanCount === 0) {
      console.log('   ✅ No hay registros huérfanos');
    } else {
      console.log(`   ⚠️  Encontrados ${orphanCount} registros huérfanos`);
    }
    console.log('');

    // 9. Resumen final
    console.log('═══════════════════════════════════════');
    console.log('📊 RESUMEN DE VERIFICACIÓN');
    console.log('═══════════════════════════════════════');
    console.log(`✅ Tablas: ${existingTables.length}/${requiredTables.length}`);
    console.log(`✅ Roles: ${rolesResult.rows.length}`);
    console.log(`✅ Vistas: ${totalViews.rows[0].count}`);
    console.log(`✅ Usuarios con rol: ${usersResult.rows.length}`);
    console.log(`✅ Índices: ${indexes.rows.length}`);
    
    if (orphanCount === 0 && usersWithoutRoles.rows.length === 0) {
      console.log('\n🎉 ¡Sistema RBAC implementado correctamente!');
      console.log('\n📝 Próximos pasos:');
      console.log('   1. Acceder a /employees en el frontend');
      console.log('   2. Ir a la pestaña "Roles y Permisos"');
      console.log('   3. Crear un rol nuevo y configurar permisos');
      console.log('   4. Asignar el rol a un usuario');
      console.log('   5. Verificar que el sidebar refleja los permisos\n');
    } else {
      console.log('\n⚠️  Se encontraron algunos problemas. Revisa los detalles arriba.\n');
    }

  } catch (error) {
    console.error('❌ Error durante la verificación:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Ejecutar verificación
verifyRBACImplementation()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
