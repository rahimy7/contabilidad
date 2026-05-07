/**
 * Limpia TODAS las filas duplicadas exactas en order_items.
 * Conserva el id mínimo de cada grupo (order_id, product_id, quantity, unit_price, total_price)
 * y elimina el resto. Se ejecuta dentro de una transacción.
 *
 * Uso:
 *   node cleanup-all-duplicate-order-items.mjs --dry    (preview, default)
 *   node cleanup-all-duplicate-order-items.mjs --apply  (ejecuta)
 */
import 'dotenv/config';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;

const APPLY = process.argv.includes('--apply');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query('BEGIN');

  // 1) Identificar filas a borrar
  const { rows: toDelete } = await client.query(`
    WITH ranked AS (
      SELECT id, order_id, product_id, quantity, unit_price, total_price,
             ROW_NUMBER() OVER (
               PARTITION BY order_id, product_id, quantity, unit_price, total_price
               ORDER BY id
             ) AS rn
        FROM order_items
    )
    SELECT id, order_id, product_id, quantity, unit_price, total_price
      FROM ranked
     WHERE rn > 1
     ORDER BY order_id, id
  `);

  console.log(`\n🗑️  Filas duplicadas detectadas: ${toDelete.length}`);
  if (toDelete.length === 0) {
    console.log('✅ Nada que hacer.');
    await client.query('ROLLBACK');
    process.exit(0);
  }

  // Resumen por orden
  const byOrder = {};
  for (const r of toDelete) {
    byOrder[r.order_id] = (byOrder[r.order_id] || 0) + 1;
  }
  console.log(`📊 Órdenes afectadas: ${Object.keys(byOrder).length}`);

  // 2) Snapshot ANTES — comparar items_sum vs subtotal
  const orderIds = [...new Set(toDelete.map(r => r.order_id))];
  const { rows: before } = await client.query(`
    SELECT o.id, o.order_number,
           (o.created_at AT TIME ZONE 'America/Santo_Domingo')::date AS local_date,
           o.total_amount, o.subtotal_amount, o.discount_amount,
           (SELECT COUNT(*)               FROM order_items WHERE order_id = o.id) AS rows_now,
           (SELECT SUM(total_price::numeric) FROM order_items WHERE order_id = o.id) AS items_sum
      FROM orders o
     WHERE o.id = ANY($1::int[])
     ORDER BY o.id
  `, [orderIds]);
  console.log('\n📋 ANTES (resumen):');
  console.table(before.slice(0, 60));
  if (before.length > 60) console.log(`   …y ${before.length - 60} órdenes más`);

  if (!APPLY) {
    console.log('\n🛈 Modo dry-run. Ejecuta con --apply para borrar.');
    await client.query('ROLLBACK');
    process.exit(0);
  }

  // 3) Eliminar
  const ids = toDelete.map(r => r.id);
  const del = await client.query(
    `DELETE FROM order_items WHERE id = ANY($1::int[])`,
    [ids]
  );
  console.log(`\n✅ Eliminadas ${del.rowCount} filas.`);

  // 4) Validación DESPUÉS
  const { rows: after } = await client.query(`
    SELECT o.id, o.order_number, o.total_amount, o.subtotal_amount, o.discount_amount,
           (SELECT SUM(total_price::numeric) FROM order_items WHERE order_id = o.id) AS items_sum
      FROM orders o
     WHERE o.id = ANY($1::int[])
     ORDER BY o.id
  `, [orderIds]);

  // Detectar discrepancias (items_sum != subtotal y != total) para alertar
  const mismatches = after.filter(r => {
    const sum = parseFloat(r.items_sum || '0');
    const sub = parseFloat(r.subtotal_amount || '0');
    const tot = parseFloat(r.total_amount || '0');
    if (sum === 0) return false;
    return Math.abs(sum - sub) > 0.05 && Math.abs(sum - tot) > 0.05;
  });
  console.log(`\n🔎 Órdenes con items_sum ≠ subtotal/total: ${mismatches.length}`);
  if (mismatches.length > 0) {
    console.table(mismatches);
  }

  await client.query('COMMIT');
  console.log('\n✅ COMMIT realizado.');
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('❌ Error, ROLLBACK:', e);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
