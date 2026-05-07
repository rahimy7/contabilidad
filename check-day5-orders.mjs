import dotenv from 'dotenv';
dotenv.config();
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TZ = 'America/Santo_Domingo';

async function main() {
  // Detect "day 5" — interpret as the 5th of the current/most-recent month with orders
  // Use 2026-05-05 (date in DR) by default. Allow override via CLI arg.
  const arg = process.argv[2];
  // We will scan a range: orders in DR-local day 5 of any recent month.
  // Strategy: find orders where date_part('day', created_at AT TIME ZONE 'America/Santo_Domingo') = 5
  // And limit to last 90 days
  const sql = `
    WITH d5 AS (
      SELECT o.id, o.order_number, o.order_type, o.payment_method, o.payment_status,
             o.notes, o.total_amount, o.subtotal_amount,
             (o.created_at AT TIME ZONE 'America/Santo_Domingo')::date AS local_date,
             (o.created_at AT TIME ZONE 'America/Santo_Domingo')::time AS local_time,
             o.created_at,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
             (SELECT COUNT(DISTINCT oi.product_id) FROM order_items oi WHERE oi.order_id = o.id) AS distinct_products,
             (SELECT json_agg(json_build_object(
                'id', oi.id,
                'product_id', oi.product_id,
                'product_name', p.name,
                'qty', oi.quantity,
                'unit_price', oi.unit_price,
                'total_price', oi.total_price,
                'notes', oi.notes
             ) ORDER BY oi.id)
              FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
              WHERE oi.order_id = o.id) AS items
      FROM orders o
      WHERE o.created_at >= NOW() - INTERVAL '120 days'
        AND EXTRACT(DAY FROM (o.created_at AT TIME ZONE 'America/Santo_Domingo')) = 5
    )
    SELECT * FROM d5
    ORDER BY created_at DESC
    LIMIT 80;
  `;

  const { rows } = await pool.query(sql);
  console.log(`\n📊 Órdenes del día 5 (TZ DR) en últimos 120 días: ${rows.length}\n`);

  let emptyItems = 0;
  let withDuplicates = 0;
  for (const r of rows) {
    const dups = (r.items || []).reduce((acc, it) => {
      acc[it.product_id] = (acc[it.product_id] || 0) + 1;
      return acc;
    }, {});
    const hasDup = Object.values(dups).some(c => c > 1);
    if (Number(r.item_count) === 0) emptyItems++;
    if (hasDup) withDuplicates++;

    const dt = `${r.local_date} ${String(r.local_time).split('.')[0]}`;
    console.log(`#${r.id} ${r.order_number}  ${dt}  type=${r.order_type}  pay=${r.payment_method}/${r.payment_status}  items=${r.item_count}${hasDup ? '  ⚠️DUP' : ''}`);
    if (r.notes) console.log(`   notes: ${r.notes.slice(0, 80)}`);
    if (r.items) {
      for (const it of r.items) {
        console.log(`   - [${it.id}] prod#${it.product_id} "${it.product_name}" x${it.qty} @${it.unit_price} = ${it.total_price}`);
      }
    }
  }

  console.log(`\nResumen: ${emptyItems} sin items, ${withDuplicates} con duplicados`);

  // Check duplicate detection across all orders day 5 — duplicate rows in order_items same order/product
  const dupSql = `
    SELECT oi.order_id, o.order_number, oi.product_id, p.name AS product_name,
           COUNT(*) AS dup_rows, SUM(oi.quantity::numeric) AS total_qty
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE EXTRACT(DAY FROM (o.created_at AT TIME ZONE 'America/Santo_Domingo')) = 5
      AND o.created_at >= NOW() - INTERVAL '120 days'
    GROUP BY oi.order_id, o.order_number, oi.product_id, p.name
    HAVING COUNT(*) > 1
    ORDER BY oi.order_id DESC;
  `;
  const dup = await pool.query(dupSql);
  console.log(`\n🔍 Items duplicados (mismo order_id+product_id): ${dup.rowCount}`);
  for (const d of dup.rows) {
    console.log(`  order ${d.order_number} (id=${d.order_id})  prod#${d.product_id} "${d.product_name}"  rows=${d.dup_rows}  qty=${d.total_qty}`);
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
