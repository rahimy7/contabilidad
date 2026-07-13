import { SqlClient, UnresolvedAccountError } from "./types";

/**
 * Turns a measure role into a pair of account ids, via `posting_rules`.
 *
 * A rule matches when its `match` predicate is contained in the event context —
 * `{}` therefore matches everything and serves as the company default. Ties are
 * broken by `priority` (highest wins), so a rule scoped to one product category
 * beats the catch-all without either knowing about the other.
 *
 * Containment is evaluated by Postgres with the jsonb `@>` operator rather than
 * by pulling every rule into memory and filtering. It keeps the "most specific
 * rule wins" semantics in one place, and it is indexable.
 */
export interface ResolvedAccounts {
  debitAccountId: number;
  creditAccountId: number;
}

export class AccountResolver {
  /** (companyId, code) -> account id. Accounts are effectively immutable. */
  private accountCache = new Map<string, number>();

  constructor(private readonly client: SqlClient) {}

  async resolve(
    companyId: number,
    eventType: string,
    role: string,
    context: Record<string, unknown> = {},
  ): Promise<ResolvedAccounts> {
    const key = `${eventType}.${role}`;

    const { rows } = await this.client.query(
      `SELECT debit_account_ref, credit_account_ref
         FROM posting_rules
        WHERE company_id = $1
          AND event_type = $2
          AND is_active
          AND $3::jsonb @> match
        ORDER BY priority DESC, id ASC
        LIMIT 1`,
      [companyId, key, JSON.stringify(context)],
    );

    if (rows.length === 0) throw new UnresolvedAccountError(eventType, role);

    const { debit_account_ref, credit_account_ref } = rows[0];
    if (!debit_account_ref || !credit_account_ref) {
      throw new UnresolvedAccountError(eventType, role);
    }

    return {
      debitAccountId: await this.accountIdByCode(companyId, debit_account_ref),
      creditAccountId: await this.accountIdByCode(companyId, credit_account_ref),
    };
  }

  /**
   * Rules reference accounts by code, not by id: a code is stable and readable
   * in a configuration UI, and survives a chart of accounts being re-seeded.
   */
  private async accountIdByCode(companyId: number, code: string): Promise<number> {
    const cacheKey = `${companyId}:${code}`;
    const hit = this.accountCache.get(cacheKey);
    if (hit !== undefined) return hit;

    const { rows } = await this.client.query(
      `SELECT id, is_postable, is_active FROM chart_of_accounts
        WHERE company_id = $1 AND code = $2`,
      [companyId, code],
    );

    if (rows.length === 0) {
      throw new UnresolvedAccountError("account", `${code} does not exist`);
    }
    // The database trigger rejects these too, but the message here names the
    // misconfigured rule rather than an opaque line number.
    if (!rows[0].is_postable) {
      throw new UnresolvedAccountError("account", `${code} is not postable (not a leaf)`);
    }
    if (!rows[0].is_active) {
      throw new UnresolvedAccountError("account", `${code} is inactive`);
    }

    this.accountCache.set(cacheKey, rows[0].id);
    return rows[0].id;
  }
}
