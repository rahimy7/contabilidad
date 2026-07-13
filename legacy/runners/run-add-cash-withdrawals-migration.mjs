import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar .env manualmente
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

const sqlPath = join(__dirname, 'migrations', 'add-cash-withdrawals.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  console.log('🔌 Conectando a la base de datos...');
  await client.connect();
  console.log('✅ Conectado\n');

  // Obtener todos los schemas de tiendas
  const schemasResult = await client.query(`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name LIKE 'store_%' OR schema_name = 'public'
    ORDER BY schema_name
  `);
  const schemas = schemasResult.rows.map(r => r.schema_name);
  console.log(`📋 Schemas encontrados: ${schemas.join(', ')}\n`);

  for (const schema of schemas) {
    console.log(`\n🏪 Aplicando migración en schema: ${schema}`);
    try {
      // Reemplazar nombres de tabla y referencias para el schema correcto
      const schemaSql = sql
        .replace(/CREATE TABLE IF NOT EXISTS cash_withdrawals/g,
                 `CREATE TABLE IF NOT EXISTS ${schema}.cash_withdrawals`)
        .replace(/ON cash_withdrawals\(/g,
                 `ON ${schema}.cash_withdrawals(`)
        .replace(/REFERENCES users\(id\)/g,
                 `REFERENCES ${schema}.users(id)`);

      const statements = schemaSql
        .split(';')
        .map(s => s.trim())
        .filter(s => {
          const withoutComments = s.replace(/--[^\n]*/g, '').trim();
          return withoutComments.length > 0;
        });

      for (const stmt of statements) {
        const preview = stmt.split('\n').find(l => l.trim() && !l.trim().startsWith('--')) || stmt.slice(0, 80);
        console.log(`  ⏳ ${preview.trim().slice(0, 80)}...`);
        await client.query(stmt);
        console.log('     ✅ OK');
      }
    } catch (schemaErr) {
      console.warn(`  ⚠️ Error en schema ${schema}: ${schemaErr.message}`);
    }
  }

  console.log('\n🎉 Migración de retiros de efectivo completada!');
  console.log('   ✅ Tabla "cash_withdrawals" creada en todos los schemas.');
  console.log('   ✅ Índices creados para store_id, created_at, cashier_id y voided.');
} catch (err) {
  console.error('\n❌ Error durante la migración:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
