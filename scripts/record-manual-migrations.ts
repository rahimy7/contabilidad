import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const files = [
  { idx: 37, tag: '0037_audit_log' },
  { idx: 38, tag: '0038_order_reservations' },
  { idx: 39, tag: '0039_users_2fa' },
  { idx: 40, tag: '0040_approvals' },
  { idx: 41, tag: '0041_product_serials' },
  { idx: 42, tag: '0042_sales_quotes' },
  { idx: 43, tag: '0043_purchase_returns' },
  { idx: 44, tag: '0044_supplier_rfqs' },
  { idx: 45, tag: '0045_internal_requisitions' },
  { idx: 46, tag: '0046_hr_employees' },
  { idx: 47, tag: '0047_hr_workflow' },
  { idx: 48, tag: '0048_hr_lifecycle' },
  { idx: 49, tag: '0049_hr_tss' },
  { idx: 50, tag: '0050_pricing_b2b' },
  { idx: 51, tag: '0051_marketing' },
  { idx: 52, tag: '0052_bank_statements' },
  { idx: 53, tag: '0053_landed_costs' },
  { idx: 54, tag: '0054_fx_revaluation' },
  { idx: 55, tag: '0055_cash_flow' },
  { idx: 56, tag: '0056_manufacturing' },
  { idx: 57, tag: '0057_alerts' },
  { idx: 58, tag: '0058_api_keys' },
];

const base = Date.now();

const journalPath = 'migrations/meta/_journal.json';
const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
for (let i = 0; i < files.length; i++) {
  const f = files[i];
  const already = journal.entries.some((e: { tag: string }) => e.tag === f.tag);
  if (!already) {
    journal.entries.push({
      idx: f.idx,
      version: '7',
      when: base + i,
      tag: f.tag,
      breakpoints: true,
    });
  }
}
fs.writeFileSync(journalPath, JSON.stringify(journal, null, '\t') + '\n');
console.log('journal updated. entries:', journal.entries.length);

const p = new Pool({ connectionString: process.env.DATABASE_URL });
for (let i = 0; i < files.length; i++) {
  const f = files[i];
  const sql = fs.readFileSync(`migrations/${f.tag}.sql`, 'utf8');
  const hash = crypto.createHash('sha256').update(sql).digest('hex');
  const exists = await p.query(
    `SELECT id FROM drizzle.__drizzle_migrations WHERE hash = $1`,
    [hash],
  );
  if (exists.rowCount) {
    console.log(f.tag, 'already recorded');
    continue;
  }
  await p.query(
    `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
    [hash, String(base + i)],
  );
  console.log(f.tag, 'recorded');
}
await p.end();
