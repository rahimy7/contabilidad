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
    const admin = await seedAdminUser(pool, companyId);

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
    console.log(`• views=${views.total} (added ${views.inserted})`);
    console.log(`• admin '${admin.username}' (id=${admin.userId}) ${admin.passwordUpdated ? "[contraseña actualizada desde .env]" : "[sin cambios]"}`);
    console.log("seed complete");
  } finally {
    await pool.end();
  }
}

/**
 * Credenciales del administrador inicial, tomadas del entorno.
 *
 * El default es `demo`/`demo1234` para que un clon recién bajado arranque sin
 * configurar nada. En cualquier despliegue serio se sobrescriben en `.env`
 * (ADMIN_USERNAME / ADMIN_PASSWORD / ADMIN_NAME / ADMIN_EMAIL) — y como `.env`
 * está fuera de git, la credencial nunca viaja en el código.
 */
function adminCredentials() {
  const username = (process.env.ADMIN_USERNAME || "demo").trim();
  const password = process.env.ADMIN_PASSWORD || "demo1234";
  const name = (process.env.ADMIN_NAME || "Administrador").trim();
  const email = process.env.ADMIN_EMAIL?.trim() || null;

  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD debe tener al menos 8 caracteres");
  }
  // bcrypt sólo cifra los primeros 72 bytes; una contraseña más larga se
  // truncaría en silencio y daría una falsa sensación de robustez.
  if (Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("ADMIN_PASSWORD no puede exceder 72 bytes");
  }
  return { username, password, name, email };
}

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
 * The admin user (from `.env`), and its membership in the demo company.
 *
 * Membership lives in `user_companies`, not in the JWT: access is checked on
 * every request, so linking here is what lets the admin reach the API.
 *
 * Idempotent, and it re-syncs the password on every run: without that, changing
 * ADMIN_PASSWORD in `.env` would have no effect once the user already existed —
 * exactly the case where a controlled reset is wanted. The hash is only rewritten
 * when the password actually changed, so a plain re-seed is a no-op.
 */
async function seedAdminUser(
  pool: Pool,
  companyId: number,
): Promise<{ userId: number; username: string; passwordUpdated: boolean }> {
  const { username, password, name, email } = adminCredentials();
  const existing = await pool.query(`SELECT id, password FROM users WHERE username=$1`, [username]);

  let userId: number;
  let passwordUpdated: boolean;

  if (existing.rows.length > 0) {
    userId = existing.rows[0].id;
    const matches = await bcrypt.compare(password, existing.rows[0].password);
    passwordUpdated = !matches;
    if (passwordUpdated) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        `UPDATE users SET password=$1, name=$2, email=coalesce($3, email),
                          role='admin', status='active', updated_at=now()
          WHERE id=$4`,
        [hash, name, email, userId],
      );
    }
  } else {
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query(
      `INSERT INTO users (username, password, name, email, role, status)
       VALUES ($1,$2,$3,$4,'admin','active') RETURNING id`,
      [username, hash, name, email],
    );
    userId = r.rows[0].id;
    passwordUpdated = true;
  }

  await pool.query(
    `INSERT INTO user_companies (user_id, company_id, is_default)
     VALUES ($1,$2,true)
     ON CONFLICT (user_id, company_id) DO NOTHING`,
    [userId, companyId],
  );
  return { userId, username, passwordUpdated };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
