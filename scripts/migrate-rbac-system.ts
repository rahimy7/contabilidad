import { Pool } from '@neondatabase/serverless';
import 'dotenv/config';

/**
 * Script de migración para crear las tablas del sistema RBAC
 * - roles: Roles del sistema
 * - views: Vistas/páginas disponibles
 * - role_permissions: Permisos de vistas por rol con orden
 * - user_roles: Asignación de roles a usuarios
 */

async function migrateRBACTables() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('🚀 Iniciando migración de tablas RBAC...\n');

    // 1. Crear tabla roles
    console.log('📋 Creando tabla "roles"...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        description TEXT,
        is_system BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Tabla "roles" creada\n');

    // 2. Crear tabla views
    console.log('📋 Creando tabla "views"...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS views (
        id SERIAL PRIMARY KEY,
        route_path TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        icon_name TEXT NOT NULL,
        permission_required TEXT NOT NULL,
        section TEXT,
        is_system BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Tabla "views" creada\n');

    // 3. Crear tabla role_permissions
    console.log('📋 Creando tabla "role_permissions"...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id SERIAL PRIMARY KEY,
        role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        view_id INTEGER NOT NULL REFERENCES views(id) ON DELETE CASCADE,
        can_access BOOLEAN DEFAULT TRUE,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(role_id, view_id)
      );
    `);
    console.log('✅ Tabla "role_permissions" creada\n');

    // 4. Crear tabla user_roles
    console.log('📋 Creando tabla "user_roles"...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
        is_primary BOOLEAN DEFAULT TRUE,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, role_id)
      );
    `);
    console.log('✅ Tabla "user_roles" creada\n');

    // 5. Crear índices para optimizar consultas
    console.log('📋 Creando índices...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
      CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
      CREATE INDEX IF NOT EXISTS idx_role_permissions_view_id ON role_permissions(view_id);
    `);
    console.log('✅ Índices creados\n');

    // 6. Agregar columna role_id a users (nullable para migración gradual)
    console.log('📋 Agregando columna "role_id" a tabla "users"...');
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES roles(id);
    `);
    console.log('✅ Columna "role_id" agregada a "users"\n');

    console.log('✨ Migración de tablas RBAC completada exitosamente!');
    console.log('\n📝 Próximos pasos:');
    console.log('   1. Ejecutar script: seed-initial-views.ts');
    console.log('   2. Ejecutar script: migrate-existing-roles.ts\n');

  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Ejecutar migración
migrateRBACTables()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
