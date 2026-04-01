import { Pool } from '@neondatabase/serverless';
import 'dotenv/config';

async function checkUserRoles() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('🔍 Verificando roles de usuarios...\n');
    
    // 1. Ver usuarios y sus roles asignados
    const usersResult = await pool.query(`
      SELECT 
        u.id, 
        u.username, 
        u.name, 
        u.role as old_role,
        ur.role_id,
        r.name as role_name,
        r.display_name
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.username IN ('rahimy', 'vendedor', 'yashira')
      ORDER BY u.username
    `);
    
    console.log('👥 Usuarios y sus roles:');
    console.table(usersResult.rows);
    
    // 2. Ver permisos del rol delivery (Rahimy)
    const rahimyUser = usersResult.rows.find((r: any) => r.username === 'rahimy');
    if (rahimyUser?.role_id) {
      console.log(`\n🔐 Permisos del rol "${rahimyUser.role_name}" (ID: ${rahimyUser.role_id}):`);
      
      const permsResult = await pool.query(`
        SELECT 
          v.id,
          v.route_path,
          v.label,
          v.icon_name,
          v.section,
          rp.sort_order
        FROM role_permissions rp
        INNER JOIN views v ON rp.view_id = v.id
        WHERE rp.role_id = $1 AND rp.can_access = TRUE
        ORDER BY rp.sort_order
      `, [rahimyUser.role_id]);
      
      console.table(permsResult.rows);
      console.log(`Total de vistas: ${permsResult.rows.length}`);
    } else {
      console.log('\n⚠️  Usuario Rahimy no tiene rol asignado en user_roles');
    }
    
    // 3. Ver permisos del rol seller (vendedor/yashira)
    const sellerUser = usersResult.rows.find((r: any) => r.username === 'vendedor');
    if (sellerUser?.role_id) {
      console.log(`\n\n🔐 Permisos del rol "${sellerUser.role_name}" (ID: ${sellerUser.role_id}):`);
      
      const permsResult = await pool.query(`
        SELECT 
          v.id,
          v.route_path,
          v.label,
          v.icon_name,
          v.section,
          rp.sort_order
        FROM role_permissions rp
        INNER JOIN views v ON rp.view_id = v.id
        WHERE rp.role_id = $1 AND rp.can_access = TRUE
        ORDER BY rp.sort_order
      `, [sellerUser.role_id]);
      
      console.table(permsResult.rows);
      console.log(`Total de vistas: ${permsResult.rows.length}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkUserRoles();
