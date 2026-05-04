import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = join(__dirname, '.env');
const envContent = readFileSync(envPath, 'utf8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const value = trimmed.slice(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = value;
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL no encontrado en .env');
  process.exit(1);
}

const { default: pg } = await import('pg');
const { Client } = pg;

const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log('✅ Conectado\n');

  // Obtener todos los schemas (tiendas)
  const schemasResult = await client.query(`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name LIKE 'store_%' OR schema_name = 'public'
    ORDER BY schema_name
  `);
  const schemas = schemasResult.rows.map(r => r.schema_name);
  console.log(`📋 Schemas: ${schemas.join(', ')}\n`);

  for (const schema of schemas) {
    console.log(`\n🏪 Schema: ${schema}`);

    // Ver cuántos se eliminarán
    const preview = await client.query(`
      SELECT COUNT(*) AS total, string_agg(DISTINCT p.name, ', ') AS productos
      FROM ${schema}.inventory_movements im
      JOIN ${schema}.products p ON p.id = im.product_id
      WHERE p.type = 'service'
    `);
    const { total, productos } = preview.rows[0];

    if (parseInt(total) === 0) {
      console.log('  ✅ Sin movimientos residuales de servicios');
      continue;
    }

    console.log(`  ⚠️ Movimientos a eliminar: ${total}`);
    console.log(`     Productos afectados: ${productos || '-'}`);

    // Eliminar
    await client.query(`
      DELETE FROM ${schema}.inventory_movements
      WHERE product_id IN (
        SELECT id FROM ${schema}.products WHERE type = 'service'
      )
    `);
    console.log(`  🗑️ Eliminados ${total} movimientos residuales`);
  }

  console.log('\n🎉 Limpieza completada. Los servicios ya no tienen movimientos de inventario.');
} catch (err) {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
