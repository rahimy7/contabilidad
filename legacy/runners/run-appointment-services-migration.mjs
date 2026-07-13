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

// Importar pg dinámicamente
const { default: pg } = await import('pg');
const { Client } = pg;

const sqlPath = join(__dirname, 'migrate-appointment-services.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  console.log('🔌 Conectando a la base de datos...');
  await client.connect();
  console.log('✅ Conectado\n');

  // Separar y ejecutar cada bloque SQL
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => {
      // Eliminar bloques que solo son comentarios o están vacíos
      const withoutComments = s.replace(/--[^\n]*/g, '').trim();
      return withoutComments.length > 0;
    });

  for (const stmt of statements) {
    const preview = stmt.split('\n').find(l => l.trim() && !l.trim().startsWith('--')) || stmt.slice(0, 80);
    console.log(`⏳ Ejecutando: ${preview.trim().slice(0, 80)}...`);
    await client.query(stmt);
    console.log('   ✅ OK');
  }

  console.log('\n🎉 Migración completada exitosamente!');
} catch (err) {
  console.error('\n❌ Error durante la migración:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
