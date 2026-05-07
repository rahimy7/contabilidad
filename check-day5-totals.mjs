import 'dotenv/config';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;
const p = new Pool({ connectionString: process.env.DATABASE_URL });
const r = await p.query(`
  SELECT id, order_number, order_type, total_amount, subtotal_amount, discount_amount,
         (SELECT SUM(total_price::numeric) FROM order_items WHERE order_id = o.id) AS items_sum,
         (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS n_rows
  FROM orders o WHERE id IN (310,311,312,313,314,315)
  ORDER BY id
`);
console.table(r.rows);
await p.end();
