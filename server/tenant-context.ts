import { pool } from "./db";
import { SqlClient } from "./accounting/types";

/**
 * Tenant scoping.
 *
 * Every request that touches company data runs inside `withCompany`. It opens a
 * transaction, publishes the active company as a transaction-local GUC, and
 * drops into `app_rls` — a role that owns nothing and has no BYPASSRLS, so the
 * row-level security policies installed in migration 0002 actually apply.
 *
 * Why the role switch is not optional: the connection identity is
 * `neondb_owner`, which owns every table and carries BYPASSRLS. Policies are
 * invisible to it. Without `SET LOCAL ROLE`, enabling RLS isolates nothing.
 *
 * Why `SET LOCAL` and `set_config(..., true)` and not plain `SET`: Neon pools
 * connections. A session-level setting survives the request and leaks into
 * whichever tenant is served next on that connection. Both settings here are
 * transaction-local and revert at COMMIT or ROLLBACK.
 *
 * The callback receives a raw pg client typed as `SqlClient` — the same
 * interface the posting engine, tax calculator and report generators consume, so
 * a handler can hand it straight to any of them.
 */

export async function withCompany<T>(
  companyId: number,
  fn: (client: SqlClient) => Promise<T>,
): Promise<T> {
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new Error(`withCompany: invalid companyId ${companyId}`);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Publish the tenant before switching roles: the GUC is read by every policy.
    await client.query("SELECT set_config('app.company_id', $1, true)", [String(companyId)]);
    // From here on the transaction runs without BYPASSRLS. Policies bite.
    await client.query("SET LOCAL ROLE app_rls");
    const out = await fn(client as SqlClient);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Escape hatch: runs as the owning role, with RLS bypassed entirely.
 *
 * Legitimate uses are few and all cross-tenant by nature: authenticating a user
 * and listing the companies they may enter, platform administration, migrations,
 * seeds, consolidation across a group. Named so that `grep withoutTenant`
 * enumerates every place isolation is deliberately suspended.
 */
export async function withoutTenant<T>(fn: (client: SqlClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client as SqlClient);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Resolves which company a request acts on, and proves the user may enter it.
 *
 * Membership is checked against `user_companies` on every request rather than
 * trusted from the JWT, so revoking a user's access takes effect immediately
 * instead of when their token expires.
 */
export async function resolveActiveCompany(
  userId: number,
  requestedCompanyId?: number,
): Promise<number | null> {
  return withoutTenant(async (client) => {
    if (requestedCompanyId) {
      const { rows } = await client.query(
        `SELECT company_id FROM user_companies WHERE user_id = $1 AND company_id = $2 LIMIT 1`,
        [userId, requestedCompanyId],
      );
      return rows.length ? requestedCompanyId : null;
    }
    const { rows } = await client.query(
      `SELECT company_id FROM user_companies
        WHERE user_id = $1 ORDER BY is_default DESC, company_id ASC LIMIT 1`,
      [userId],
    );
    return rows.length ? Number(rows[0].company_id) : null;
  });
}
