// Script para ejecutar la migración en una tienda específica
import { Pool } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storeId = process.argv[2] ? parseInt(process.argv[2]) : null;

if (!storeId) {
  console.error('❌ Error: Debes proporcionar el ID de la tienda');
  console.log('Uso: npx tsx scripts/migrate-single-store.ts <storeId>');
  process.exit(1);
}

const masterPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  console.log(`🚀 Ejecutando migración para tienda ID: ${storeId}\n`);

  try {
    // Obtener información de la tienda
    const { rows } = await masterPool.query(`
      SELECT id, name, slug, database_url
      FROM virtual_stores
      WHERE id = $1
    `, [storeId]);

    if (rows.length === 0) {
      console.error(`❌ No se encontró la tienda con ID ${storeId}`);
      process.exit(1);
    }

    const store = rows[0];
    console.log(`📊 Tienda: ${store.name} (Schema: store_${store.id})\n`);

    // Leer el archivo de migración
    const migrationPath = path.join(__dirname, '../migrations/add-loyalty-points-credited-field.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    // Conectar a la base de datos de la tienda
    const tenantPool = new Pool({
      connectionString: store.database_url,
    });

    // Ejecutar migración
    console.log('🔄 Ejecutando migración...');
    await tenantPool.query(`SET search_path TO store_${store.id}`);
    await tenantPool.query(migrationSQL);
    await tenantPool.end();

    console.log(`\n✅ Migración exitosa para ${store.name}!`);

  } catch (error) {
    console.error(`\n❌ Error ejecutando migración:`, error);
    process.exit(1);
  } finally {
    await masterPool.end();
  }
}

runMigration();
