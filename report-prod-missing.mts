// Reporte: ¿qué necesita PROD (schema public) para coincidir con shared/schema.ts?
// Lista únicamente:
//   - tablas declaradas en schema.ts que NO existen en prod
//   - columnas declaradas en schema.ts que NO existen en prod (por tabla en común)
//
// NO modifica nada. Sólo imprime.
import 'dotenv/config';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import * as schema from './shared/schema.ts';
import { getTableConfig } from 'drizzle-orm/pg-core';
neonConfig.webSocketConstructor = ws;

const PROD_URL = 'postgresql://neondb_owner:npg_8ICqFxQmfh3g@ep-long-shadow-ah6l3awj.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const p = new Pool({ connectionString: PROD_URL });

// Recolectar tablas declaradas en schema.ts
const declared = new Map(); // tableName -> Map(columnName -> {sqlType, notNull, hasDefault})
for (const exp of Object.values(schema)) {
  try {
    const cfg = getTableConfig(exp);
    if (!cfg?.name) continue;
    const cols = new Map();
    for (const c of cfg.columns) {
      cols.set(c.name, {
        sqlType: c.getSQLType ? c.getSQLType() : c.dataType,
        notNull: c.notNull,
        hasDefault: c.hasDefault,
        default: c.default,
      });
    }
    declared.set(cfg.name, cols);
  } catch { /* not a table */ }
}

// Tablas en prod
const tablesRes = await p.query(`
  SELECT table_name FROM information_schema.tables
   WHERE table_schema='public' AND table_type='BASE TABLE'
`);
const prodTables = new Set(tablesRes.rows.map(r => r.table_name));

// Columnas en prod
const colsRes = await p.query(`
  SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
   WHERE table_schema='public'
   ORDER BY table_name, ordinal_position
`);
const prodCols = new Map();
for (const r of colsRes.rows) {
  if (!prodCols.has(r.table_name)) prodCols.set(r.table_name, new Map());
  prodCols.get(r.table_name).set(r.column_name, r);
}

// 1) Tablas en schema.ts que faltan en prod
const missingTables = [];
for (const [t, cols] of declared) {
  if (!prodTables.has(t)) missingTables.push({ table: t, columns: cols.size });
}

// 2) Columnas que faltan en prod (tabla existe en ambos)
const missingColsByTable = new Map();
for (const [t, cols] of declared) {
  if (!prodTables.has(t)) continue;
  const pc = prodCols.get(t) || new Map();
  const missing = [];
  for (const [colName, meta] of cols) {
    if (!pc.has(colName)) missing.push({ name: colName, ...meta });
  }
  if (missing.length) missingColsByTable.set(t, missing);
}

console.log('# Lo que PROD necesita para coincidir con shared/schema.ts\n');
console.log(`Fecha: ${new Date().toISOString()}\n`);

console.log(`## Tablas declaradas en schema.ts que NO existen en prod (${missingTables.length})\n`);
for (const m of missingTables) {
  console.log(`### \`${m.table}\` (${m.columns} columnas)`);
  const cols = declared.get(m.table);
  for (const [colName, meta] of cols) {
    const flags = [];
    if (meta.notNull) flags.push('NOT NULL');
    if (meta.hasDefault) flags.push(`default`);
    console.log(`- \`${colName}\` _(${meta.sqlType})_${flags.length ? ' — ' + flags.join(', ') : ''}`);
  }
  console.log('');
}

console.log(`\n## Columnas declaradas en schema.ts que NO existen en prod\n`);
const sortedTables = [...missingColsByTable.keys()].sort();
let totalMissingCols = 0;
for (const t of sortedTables) {
  const cols = missingColsByTable.get(t);
  totalMissingCols += cols.length;
  console.log(`### \`${t}\` — ${cols.length} columna(s) faltantes`);
  for (const c of cols) {
    const flags = [];
    if (c.notNull) flags.push('NOT NULL');
    if (c.hasDefault) flags.push(`default=${JSON.stringify(c.default)}`);
    console.log(`- \`${c.name}\` _(${c.sqlType})_${flags.length ? ' — ' + flags.join(', ') : ''}`);
  }
  console.log('');
}
console.log(`\n**Resumen:** ${missingTables.length} tabla(s) faltante(s), ${totalMissingCols} columna(s) faltante(s) en ${sortedTables.length} tabla(s).`);

await p.end();
