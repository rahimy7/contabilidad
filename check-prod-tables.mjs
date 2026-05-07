import 'dotenv/config';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;

process.env.DATABASE_URL = 'postgresql://neondb_owner:npg_8ICqFxQmfh3g@ep-long-shadow-ah6l3awj.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const p = new Pool({ connectionString: process.env.DATABASE_URL });

const candidates = [
  'ai_credits','virtual_stores','invoices','payments','paypal_integration','system_users',
  'users','roles','user_roles','role_permissions','views','employee_profiles',
  'categories','brands','currencies','exchange_rate_history','store_currency_settings',
  'conversation_context','order_notes',
];

const r = await p.query(
  `SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name = ANY($1::text[])
    ORDER BY table_name`,
  [candidates]
);

const present = new Set(r.rows.map(r => r.table_name));
console.log('\nPresentes en PROD:');
for (const t of candidates) {
  console.log(`  ${present.has(t) ? '✅' : '❌'} ${t}`);
}
await p.end();
