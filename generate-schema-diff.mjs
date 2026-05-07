/**
 * Genera un reporte de diferencias entre el esquema de producción
 * (drizzle-prod-pull/schema.ts) y shared/schema.ts.
 *
 * Solo lectura — no modifica nada.
 *
 * Salida: schema-diff-report.md
 */
import fs from 'fs';

function parseDrizzleSchema(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const tables = {};

  // Match `export const <var> = pgTable("table_name", { ... })`
  // Uses a permissive bracket counter to find the end of the object
  const tableHeaderRe = /export const (\w+) = pgTable\(\s*"(\w+)"\s*,\s*\{/g;
  let m;
  while ((m = tableHeaderRe.exec(text)) !== null) {
    const varName = m[1];
    const tableName = m[2];
    const start = tableHeaderRe.lastIndex;
    let depth = 1;
    let i = start;
    while (i < text.length && depth > 0) {
      const ch = text[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      i++;
    }
    const body = text.slice(start, i - 1);
    const cols = parseColumns(body);
    tables[tableName] = { varName, columns: cols };
  }
  return tables;
}

function parseColumns(body) {
  // Each column is like: name: text("col_name")...,  or  name: integer("col"),
  // We capture the JS prop name and the SQL column name when present.
  const cols = {};
  // Greedy line-by-line scan with depth tracking
  let depth = 0;
  let buf = '';
  const lines = body.split(/\n/);
  for (const line of lines) {
    for (const ch of line) {
      if (ch === '(' || ch === '{' || ch === '[') depth++;
      else if (ch === ')' || ch === '}' || ch === ']') depth--;
    }
    buf += line + '\n';
    if (depth === 0 && buf.trim().endsWith(',')) {
      processCol(buf, cols);
      buf = '';
    }
  }
  if (buf.trim()) processCol(buf, cols);
  return cols;
}

function processCol(text, cols) {
  // Skip block-level things like .pgPolicy, indices, etc.
  const propMatch = text.match(/^\s*(\w+)\s*:/);
  if (!propMatch) return;
  const prop = propMatch[1];
  // Skip if it's likely an index/relation (heuristic): no helper call
  const sqlMatch = text.match(/(\w+)\s*\(\s*"([^"]+)"/);
  const sqlName = sqlMatch ? sqlMatch[2] : prop;
  const typeFn = sqlMatch ? sqlMatch[1] : null;
  // Filter: only keep when it looks like a column (typeFn is one of known column functions)
  const knownTypes = new Set(['text','varchar','char','integer','bigint','smallint','serial','bigserial','boolean','timestamp','date','time','numeric','decimal','real','doublePrecision','json','jsonb','uuid','customType']);
  if (!typeFn || !knownTypes.has(typeFn)) return;
  cols[sqlName] = { jsName: prop, type: typeFn, raw: text.trim() };
}

const prod = parseDrizzleSchema('drizzle-prod-pull/schema.ts');
const local = parseDrizzleSchema('shared/schema.ts');

const allTables = new Set([...Object.keys(prod), ...Object.keys(local)]);

const lines = [];
lines.push('# Diff esquema producción ↔ shared/schema.ts');
lines.push('');
lines.push(`Fecha: ${new Date().toISOString()}`);
lines.push('');
lines.push(`- Tablas en producción: **${Object.keys(prod).length}**`);
lines.push(`- Tablas en shared/schema.ts: **${Object.keys(local).length}**`);
lines.push('');

// 1) Sólo en prod
const onlyProd = [...allTables].filter(t => prod[t] && !local[t]).sort();
const onlyLocal = [...allTables].filter(t => local[t] && !prod[t]).sort();
const common = [...allTables].filter(t => prod[t] && local[t]).sort();

lines.push('## Tablas SOLO en producción (faltan en schema.ts)');
lines.push('');
if (onlyProd.length === 0) lines.push('_Ninguna_');
else for (const t of onlyProd) lines.push(`- \`${t}\` (${Object.keys(prod[t].columns).length} columnas)`);
lines.push('');

lines.push('## Tablas SOLO en schema.ts (no existen en producción)');
lines.push('');
if (onlyLocal.length === 0) lines.push('_Ninguna_');
else for (const t of onlyLocal) lines.push(`- \`${t}\` (${Object.keys(local[t].columns).length} columnas)`);
lines.push('');

lines.push('## Tablas en común — diferencias de columnas');
lines.push('');

let totalMissingInLocal = 0;
let totalMissingInProd = 0;

for (const t of common) {
  const p = prod[t].columns;
  const l = local[t].columns;
  const colsProd = new Set(Object.keys(p));
  const colsLocal = new Set(Object.keys(l));
  const missingInLocal = [...colsProd].filter(c => !colsLocal.has(c)).sort();
  const missingInProd  = [...colsLocal].filter(c => !colsProd.has(c)).sort();
  if (missingInLocal.length === 0 && missingInProd.length === 0) continue;

  lines.push(`### \`${t}\``);
  if (missingInLocal.length) {
    lines.push('');
    lines.push('**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):');
    for (const c of missingInLocal) {
      lines.push(`- \`${c}\` _(${p[c].type})_`);
    }
    totalMissingInLocal += missingInLocal.length;
  }
  if (missingInProd.length) {
    lines.push('');
    lines.push('**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):');
    for (const c of missingInProd) {
      lines.push(`- \`${c}\` _(${l[c].type})_`);
    }
    totalMissingInProd += missingInProd.length;
  }
  lines.push('');
}

lines.push('---');
lines.push('');
lines.push(`**Resumen:** ${totalMissingInLocal} columnas en prod faltan en schema.ts · ${totalMissingInProd} columnas declaradas en schema.ts no existen en prod.`);

fs.writeFileSync('schema-diff-report.md', lines.join('\n'));
console.log('✅ Reporte generado: schema-diff-report.md');
console.log(`   Tablas comunes con diff: ${common.filter(t => {
  const p = Object.keys(prod[t].columns);
  const l = Object.keys(local[t].columns);
  return p.some(c => !l.includes(c)) || l.some(c => !p.includes(c));
}).length}`);
console.log(`   Columnas en prod faltantes en schema.ts: ${totalMissingInLocal}`);
console.log(`   Columnas en schema.ts no en prod: ${totalMissingInProd}`);
