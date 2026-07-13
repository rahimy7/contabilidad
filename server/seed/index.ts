import "dotenv/config";
import bcrypt from "bcryptjs";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { seedCompanyDefaults } from "./company-defaults";
import { seedViews } from "./views";

neonConfig.webSocketConstructor = ws;

/**
 * `yarn db:seed` — brings a freshly migrated database to a usable state.
 *
 * Idempotent by construction: running it twice leaves the database exactly as
 * running it once did. It executes on every fresh Neon branch and after every
 * baseline rebuild, and a seeder that duplicates rows on the second run is a
 * seeder nobody dares to run.
 */

const DEMO_RNC = "101000001";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const pool = new Pool({ connectionString: url });
  try {
    const existing = await pool.query(`SELECT id FROM companies WHERE rnc = $1`, [DEMO_RNC]);
    let companyId: number;

    if (existing.rows.length > 0) {
      companyId = existing.rows[0].id;
      console.log(`• demo company already present (id=${companyId})`);
    } else {
      const r = await pool.query(
        `INSERT INTO companies (legal_name, trade_name, rnc, functional_currency)
         VALUES ('Empresa Demo SRL', 'Demo', $1, 'DOP') RETURNING id`,
        [DEMO_RNC],
      );
      companyId = r.rows[0].id;
      console.log(`• created demo company (id=${companyId})`);
    }

    await seedCompanyDefaults(pool, companyId);
    await seedDemoBankAccount(pool, companyId);
    const views = await seedViews(pool);
    const demoUserId = await seedDemoUser(pool, companyId);

    const counts = await pool.query(
      `SELECT
         (SELECT count(*) FROM chart_of_accounts   WHERE company_id=$1) AS accounts,
         (SELECT count(*) FROM chart_of_accounts   WHERE company_id=$1 AND is_postable) AS postable,
         (SELECT count(*) FROM tax_codes           WHERE company_id=$1) AS tax_codes,
         (SELECT count(*) FROM retention_rules     WHERE company_id=$1) AS retentions,
         (SELECT count(*) FROM accounting_periods  WHERE company_id=$1) AS periods`,
      [companyId],
    );
    const c = counts.rows[0];
    console.log(
      `• accounts=${c.accounts} (postable=${c.postable}) tax_codes=${c.tax_codes} ` +
        `retentions=${c.retentions} periods=${c.periods}`,
    );
    console.log(`• views=${views.total} (added ${views.inserted}) demo_user_id=${demoUserId}`);
    console.log("seed complete");
  } finally {
    await pool.end();
  }
}

const DEMO_USER = "demo";

/**
 * A demo bank account, rolled up into the "Bancos" control account so the
 * treasury page has something to show. Idempotent on (company_id, code).
 */
async function seedDemoBankAccount(pool: Pool, companyId: number): Promise<void> {
  await pool.query(
    `INSERT INTO bank_accounts (company_id, code, name, bank_name, account_number, gl_account_id)
     SELECT $1, 'BCO-001', 'Cuenta Corriente Principal', 'Banco de Reservas', '9600000001',
            (SELECT id FROM chart_of_accounts WHERE company_id=$1 AND code='1.1.01.003')
     WHERE EXISTS (SELECT 1 FROM chart_of_accounts WHERE company_id=$1 AND code='1.1.01.003')
     ON CONFLICT (company_id, code) DO NOTHING`,
    [companyId],
  );
}

/**
 * A demo admin, and its membership in the demo company.
 *
 * Membership lives in `user_companies`, not in the JWT: access is checked on
 * every request, so linking here is what lets the demo user reach the API. The
 * password is a fixed dev value — this seed never runs against production.
 */
async function seedDemoUser(pool: Pool, companyId: number): Promise<number> {
  const existing = await pool.query(`SELECT id FROM users WHERE username=$1`, [DEMO_USER]);
  let userId: number;
  if (existing.rows.length > 0) {
    userId = existing.rows[0].id;
  } else {
    const hash = await bcrypt.hash("demo1234", 10);
    const r = await pool.query(
      `INSERT INTO users (username, password, name, role, status)
       VALUES ($1,$2,'Usuario Demo','admin','active') RETURNING id`,
      [DEMO_USER, hash],
    );
    userId = r.rows[0].id;
  }

  await pool.query(
    `INSERT INTO user_companies (user_id, company_id, is_default)
     VALUES ($1,$2,true)
     ON CONFLICT (user_id, company_id) DO NOTHING`,
    [userId, companyId],
  );
  return userId;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
