// scripts/create-admin-user.ts
// Script para crear un usuario administrador con contraseña hasheada

import bcrypt from 'bcrypt';
import { Pool } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';
import { neonConfig } from '@neondatabase/serverless';

// Configurar WebSocket para Neon
neonConfig.webSocketConstructor = ws;

// Cargar variables de entorno
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL no está definida');
  process.exit(1);
}

interface AdminUserData {
  username: string;
  password: string;
  name: string;
  email: string;
  role: string;
}

async function createAdminUser(userData: AdminUserData) {
  const pool = new Pool({ connectionString: DATABASE_URL });
  let client;

  try {
    console.log('\n👤 CREANDO USUARIO ADMINISTRADOR');
    console.log('================================\n');

    client = await pool.connect();

    // Hashear la contraseña
    console.log('🔒 Hasheando contraseña...');
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    console.log('✅ Contraseña hasheada\n');

    // Verificar si el usuario ya existe
    const existingUser = await client.query(
      'SELECT id, username FROM users WHERE username = $1',
      [userData.username]
    );

    if (existingUser.rows.length > 0) {
      console.log(`⚠️  El usuario "${userData.username}" ya existe`);
      console.log('🔄 Actualizando usuario existente...\n');

      await client.query(
        `UPDATE users
         SET password = $1, name = $2, email = $3, role = $4, status = 'active', updated_at = CURRENT_TIMESTAMP
         WHERE username = $5`,
        [hashedPassword, userData.name, userData.email, userData.role, userData.username]
      );

      console.log('✅ Usuario actualizado exitosamente');
    } else {
      console.log(`➕ Creando nuevo usuario "${userData.username}"...\n`);

      await client.query(
        `INSERT INTO users (username, password, name, email, role, status)
         VALUES ($1, $2, $3, $4, $5, 'active')`,
        [userData.username, hashedPassword, userData.name, userData.email, userData.role]
      );

      console.log('✅ Usuario creado exitosamente');
    }

    // Mostrar resumen
    console.log('\n' + '='.repeat(50));
    console.log('📋 RESUMEN DEL USUARIO ADMINISTRADOR');
    console.log('='.repeat(50));
    console.log(`  Username: ${userData.username}`);
    console.log(`  Nombre:   ${userData.name}`);
    console.log(`  Email:    ${userData.email}`);
    console.log(`  Rol:      ${userData.role}`);
    console.log(`  Password: ${userData.password}`);
    console.log('='.repeat(50));
    console.log('\n⚠️  IMPORTANTE: Guarda estas credenciales en un lugar seguro\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

// Datos del usuario administrador por defecto
// CAMBIAR ESTOS VALORES SEGÚN SEA NECESARIO
const adminData: AdminUserData = {
  username: 'admin',
  password: 'admin123',  // CAMBIAR en producción
  name: 'Administrador 4Life',
  email: 'admin@4lifebellavista.com',
  role: 'admin'
};

// Ejecutar
createAdminUser(adminData).catch(console.error);
