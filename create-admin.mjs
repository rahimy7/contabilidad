/**
 * Script para crear un usuario administrador
 * Uso: node create-admin.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcrypt';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL no encontrada en .env');
  process.exit(1);
}

// ─── CREDENCIALES DEL ADMIN ─────────────────────────────────────────────────
const USERNAME  = 'rahimy7';
const PASSWORD  = 'D0l0r35ios';
const NAME      = 'Rahimy de la cruz';
const ROLE      = 'admin';   // Opciones: admin | super_admin | technician | seller | delivery
const EMAIL     = null;
const PHONE     = null;
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log(`\n🔐 Creando usuario admin: ${USERNAME} ...`);

    // Verificar si ya existe
    const existing = await pool.query(
      'SELECT id, username FROM users WHERE username = $1',
      [USERNAME]
    );

    if (existing.rows.length > 0) {
      console.log(`⚠️  El usuario "${USERNAME}" ya existe (id=${existing.rows[0].id})`);
      console.log('   Si quieres resetear la contraseña agrega --reset como argumento.');

      if (process.argv.includes('--reset')) {
        const hashedPassword = await bcrypt.hash(PASSWORD, 10);
        await pool.query(
          'UPDATE users SET password = $1, updated_at = NOW() WHERE username = $2',
          [hashedPassword, USERNAME]
        );
        console.log(`✅ Contraseña reseteada para "${USERNAME}"`);
      }
      return;
    }

    const hashedPassword = await bcrypt.hash(PASSWORD, 10);

    const result = await pool.query(
      `INSERT INTO users (username, password, name, role, email, phone, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW(), NOW())
       RETURNING id, username, name, role, status`,
      [USERNAME, hashedPassword, NAME, ROLE, EMAIL, PHONE]
    );

    const user = result.rows[0];
    console.log('\n✅ Usuario creado exitosamente:');
    console.log(`   ID       : ${user.id}`);
    console.log(`   Usuario  : ${user.username}`);
    console.log(`   Nombre   : ${user.name}`);
    console.log(`   Rol      : ${user.role}`);
    console.log(`   Estado   : ${user.status}`);
    console.log('\n🔑 Credenciales de acceso:');
    console.log(`   Usuario    : ${USERNAME}`);
    console.log(`   Contraseña : ${PASSWORD}`);

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

main();
