import 'dotenv/config';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;

process.env.DATABASE_URL = 'postgresql://neondb_owner:npg_8ICqFxQmfh3g@ep-long-shadow-ah6l3awj.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const p = new Pool({ connectionString: process.env.DATABASE_URL });

const r = await p.query(`
  SELECT table_schema, table_name
    FROM information_schema.tables
   WHERE table_name IN ('virtual_stores','ai_credits','system_users','invoices','payments','paypal_integration')
   ORDER BY table_schema, table_name
`);
console.table(r.rows);

const r2 = await p.query(`
  SELECT schema_name FROM information_schema.schemata
   WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast')
   ORDER BY schema_name
`);
console.log('\nSchemas:');
console.table(r2.rows);
await p.end();
