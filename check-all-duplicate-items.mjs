/**
 * Escanea TODA la tabla order_items buscando duplicados por
 * (order_id, product_id, quantity, unit_price, total_price).
 */
import 'dotenv/config';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 1) Resumen por orden (filas duplicadas exactas)
const { rows: dupGroups } = await pool.query(`
  WITH g AS (
    SELECT order_id, product_id, quantity, unit_price, total_price, COUNT(*) AS c
      FROM order_items
     GROUP BY order_id, product_id, quantity, unit_price, total_price
    HAVING COUNT(*) > 1
  )
  SELECT g.order_id,
         o.order_number,
         (o.created_at AT TIME ZONE 'America/Santo_Domingo')::date AS local_date,
         o.order_type,
         o.total_amount,
         SUM(g.c - 1)::int AS extra_rows
    FROM g
    JOIN orders o ON o.id = g.order_id
   GROUP BY g.order_id, o.order_number, o.created_at, o.order_type, o.total_amount
   ORDER BY local_date DESC, g.order_id DESC;
`);

console.log(`\n📋 Órdenes con filas duplicadas exactas: ${dupGroups.length}\n`);
console.table(dupGroups);

// 2) Detalle por orden (lo que se borraría)
if (dupGroups.length > 0) {
  const ids = dupGroups.map(r => r.order_id);
  const { rows: detail } = await pool.query(`
    WITH ranked AS (
      SELECT id, order_id, product_id, quantity, unit_price, total_price,
             ROW_NUMBER() OVER (
               PARTITION BY order_id, product_id, quantity, unit_price, total_price
               ORDER BY id
             ) AS rn
        FROM order_items
       WHERE order_id = ANY($1::int[])
    )
    SELECT id, order_id, product_id, quantity, unit_price, total_price
      FROM ranked WHERE rn > 1
      ORDER BY order_id, id;
  `, [ids]);
  console.log(`\n🗑️  Filas duplicadas que se eliminarían: ${detail.length}`);
  console.table(detail);

  // 3) Validación: items_sum vs subtotal
  const { rows: validate } = await pool.query(`
    SELECT o.id, o.order_number,
           (o.created_at AT TIME ZONE 'America/Santo_Domingo')::date AS local_date,
           o.total_amount, o.subtotal_amount, o.discount_amount,
           (SELECT SUM(total_price::numeric) FROM order_items WHERE order_id = o.id) AS items_sum
      FROM orders o
     WHERE o.id = ANY($1::int[])
     ORDER BY o.id;
  `, [ids]);
  console.log('\n🔎 Comparación actual items_sum vs subtotal:');
  console.table(validate);
}

await pool.end();
