// run-migration.js
// Script para ejecutar la migración inicial en la nueva base de datos de Neon

import { Pool } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import ws from 'ws';

// Configurar WebSocket para Neon
import { neonConfig } from '@neondatabase/serverless';
neonConfig.webSocketConstructor = ws;

// Cargar variables de entorno
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL no está definida en el archivo .env');
  process.exit(1);
}

console.log('\n🚀 MIGRACIÓN INICIAL - 4LIFE BELLA VISTA');
console.log('==========================================\n');

async function runMigration() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
  });

  let client;

  try {
    // Conectar al pool
    console.log('📡 Conectando a la base de datos Neon...');
    client = await pool.connect();
    console.log('✅ Conexión establecida\n');

    // Leer el archivo SQL de migración
    const migrationPath = path.join(process.cwd(), 'migrations', '4life-bellavista-initial-migration.sql');
    console.log(`📄 Leyendo archivo de migración: ${migrationPath}`);

    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Archivo de migración no encontrado: ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('✅ Archivo de migración cargado\n');

    // Ejecutar la migración
    console.log('⚙️  Ejecutando migración...\n');
    console.log('━'.repeat(50));

    const startTime = Date.now();
    await client.query(migrationSQL);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('━'.repeat(50));
    console.log(`\n✅ Migración completada exitosamente en ${duration}s\n`);

    // Verificar que las tablas se crearon correctamente
    console.log('🔍 Verificando tablas creadas...');
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log(`\n📊 Total de tablas creadas: ${tablesResult.rows.length}\n`);
    console.log('Tablas principales:');
    tablesResult.rows.slice(0, 15).forEach((row, index) => {
      console.log(`  ${(index + 1).toString().padStart(2, ' ')}. ${row.table_name}`);
    });

    if (tablesResult.rows.length > 15) {
      console.log(`  ... y ${tablesResult.rows.length - 15} más`);
    }

    // Verificar datos iniciales
    console.log('\n🔍 Verificando datos iniciales...');

    const storeCheck = await client.query('SELECT COUNT(*) as count FROM store_settings');
    console.log(`  ✓ Configuración de tienda: ${storeCheck.rows[0].count} registro(s)`);

    const userCheck = await client.query('SELECT COUNT(*) as count FROM users');
    console.log(`  ✓ Usuarios: ${userCheck.rows[0].count} registro(s)`);

    console.log('\n' + '='.repeat(50));
    console.log('🎉 MIGRACIÓN COMPLETADA EXITOSAMENTE');
    console.log('='.repeat(50));
    console.log('\n📋 Próximos pasos:');
    console.log('  1. Actualizar la contraseña del usuario admin');
    console.log('  2. Configurar la información de la tienda en store_settings');
    console.log('  3. Iniciar el servidor: npm run dev\n');

  } catch (error) {
    console.error('\n❌ ERROR durante la migración:');
    console.error('━'.repeat(50));
    console.error(error);
    console.error('━'.repeat(50));

    if (error.position) {
      console.error(`\n📍 Error en posición: ${error.position}`);
    }

    process.exit(1);
  } finally {
    if (client) {
      client.release();
      console.log('\n🔌 Conexión cerrada');
    }
    await pool.end();
  }
}

// Ejecutar migración
runMigration().catch((error) => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
