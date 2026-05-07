import 'dotenv/config';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;
const p = new Pool({ connectionString: process.env.DATABASE_URL });
const r = await p.query(`
  SELECT id, order_number,
         created_at AT TIME ZONE 'UTC' AS utc_time,
         (created_at AT TIME ZONE 'America/Santo_Domingo')::text AS dr_time
    FROM orders WHERE id IN (316,317,318,319) ORDER BY id
`);
console.table(r.rows);
await p.end();
