// Aplica migrations/2026-05-07_create_ai_credits.sql contra DATABASE_URL.
// Uso:
//   $env:DATABASE_URL = "postgres://..."   # apuntar a la DB destino
//   node apply-create-ai-credits.mjs --dry   # imprime el SQL y verifica sin aplicar
//   node apply-create-ai-credits.mjs --apply # ejecuta el SQL en una transacción

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;

const apply = process.argv.includes('--apply');
const sqlFile = path.resolve('migrations/2026-05-07_create_ai_credits.sql');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL no está definido.');
  process.exit(1);
}
const sql = fs.readFileSync(sqlFile, 'utf8');
console.log(`📄 Archivo: ${sqlFile}`);
console.log(`🌐 DB host: ${new URL(process.env.DATABASE_URL).host}`);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

async function main() {
  const before = await client.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name='ai_credits') AS exists`
  );
  console.log(`🔎 ai_credits existe antes: ${before.rows[0].exists}`);

  if (!apply) {
    console.log('\n--- DRY RUN: SQL a ejecutar ---\n');
    console.log(sql);
    console.log('\n(usa --apply para ejecutar)');
    return;
  }

  console.log('▶️  Ejecutando SQL...');
  await client.query(sql);

  const after = await client.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ai_credits'
      ORDER BY ordinal_position`
  );
  console.log(`✅ Tabla creada/verificada. Columnas (${after.rows.length}):`);
  console.table(after.rows);
}

try {
  await main();
} catch (e) {
  console.error('❌ Error:', e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
