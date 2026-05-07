/**
 * Limpia filas duplicadas en order_items para órdenes del 5 de mayo (TZ DR).
 * Estrategia: para cada (order_id, product_id, unit_price, total_price, quantity)
 * conserva el id más bajo y borra el resto. Hace todo dentro de una transacción.
 *
 * Ámbito: órdenes en tabla `orders` cuya fecha local DR cae en día 5,
 * en los últimos 120 días, y que tengan items_sum == 2 * total_amount aprox.
 * Para máxima seguridad, restringe a IDs explícitos detectados en el diagnóstico.
 *
 * Uso:
 *   node cleanup-duplicate-order-items.mjs --dry        (solo muestra)
 *   node cleanup-duplicate-order-items.mjs --apply      (ejecuta)
 */
import 'dotenv/config';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;

const TARGET_ORDER_IDS = [310, 311, 313, 314];
const DRY = !process.argv.includes('--apply');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query('BEGIN');

  // 1) Snapshot antes
  const before = await client.query(
    `SELECT order_id, COUNT(*)::int AS rows, SUM(total_price::numeric) AS items_sum
       FROM order_items
      WHERE order_id = ANY($1::int[])
      GROUP BY order_id ORDER BY order_id`,
    [TARGET_ORDER_IDS]
  );
  console.log('\n📋 ANTES:');
  console.table(before.rows);

  // 2) Identificar filas a borrar: dentro de cada grupo de duplicado exacto,
  //    conservar id mínimo, borrar el resto.
  const toDelete = await client.query(
    `WITH ranked AS (
       SELECT id, order_id, product_id, quantity, unit_price, total_price,
              ROW_NUMBER() OVER (
                PARTITION BY order_id, product_id, quantity, unit_price, total_price
                ORDER BY id
              ) AS rn
         FROM order_items
        WHERE order_id = ANY($1::int[])
     )
     SELECT id, order_id, product_id, quantity, unit_price, total_price
       FROM ranked
      WHERE rn > 1
      ORDER BY order_id, id`,
    [TARGET_ORDER_IDS]
  );
  console.log(`\n🗑️  Filas duplicadas a borrar: ${toDelete.rowCount}`);
  console.table(toDelete.rows);

  if (DRY) {
    console.log('\n🛈 Modo dry-run: no se aplican cambios. Ejecuta con --apply para borrar.');
    await client.query('ROLLBACK');
  } else {
    if (toDelete.rowCount > 0) {
      const ids = toDelete.rows.map((r) => r.id);
      const del = await client.query(
        `DELETE FROM order_items WHERE id = ANY($1::int[])`,
        [ids]
      );
      console.log(`\n✅ Eliminadas ${del.rowCount} filas.`);
    } else {
      console.log('\n✅ Nada que eliminar.');
    }

    // 3) Snapshot después
    const after = await client.query(
      `SELECT order_id, COUNT(*)::int AS rows, SUM(total_price::numeric) AS items_sum
         FROM order_items
        WHERE order_id = ANY($1::int[])
        GROUP BY order_id ORDER BY order_id`,
      [TARGET_ORDER_IDS]
    );
    console.log('\n📋 DESPUÉS:');
    console.table(after.rows);

    // 4) Validación: items_sum debe coincidir (aprox) con subtotal o total
    const validate = await client.query(
      `SELECT o.id, o.order_number, o.total_amount, o.subtotal_amount, o.discount_amount,
              (SELECT SUM(total_price::numeric) FROM order_items WHERE order_id = o.id) AS items_sum
         FROM orders o
        WHERE o.id = ANY($1::int[])
        ORDER BY o.id`,
      [TARGET_ORDER_IDS]
    );
    console.log('\n🔎 Validación (items_sum vs subtotal_amount):');
    console.table(validate.rows);

    await client.query('COMMIT');
    console.log('\n✅ COMMIT realizado.');
  }
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('❌ Error, ROLLBACK:', e);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
