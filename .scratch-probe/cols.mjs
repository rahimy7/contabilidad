import 'dotenv/config';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;
const p = new Pool({ connectionString: process.env.DATABASE_URL });
const tables = process.argv.slice(2);
for (const t of tables) {
  const { rows } = await p.query(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name=$1 AND table_schema='public' ORDER BY ordinal_position`, [t]);
  console.log('== ' + t + ': ' + rows.map(r => `${r.column_name}:${r.data_type}${r.is_nullable==='NO'?'!':''}${r.column_default?'='+String(r.column_default).slice(0,25):''}`).join(', '));
  const idx = await p.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename=$1`, [t]);
  console.log('   idx: ' + idx.rows.map(r=>r.indexdef.replace(/CREATE (UNIQUE )?INDEX /, (m,u)=>u?'U ':'')).join(' ; '));
}
await p.end();
