/**
 * The contract between a subledger and the general ledger.
 *
 * A subledger never names an account. It describes what economically happened —
 * "revenue of 1000, ITBIS of 180" — and the posting rules decide which accounts
 * those hit. Without that indirection every tenant of this SaaS would be forced
 * onto one hardcoded chart of accounts.
 */

/**
 * One economic quantity, and what it means. `role` is matched against
 * `posting_rules.event_type` as `<eventType>.<role>`.
 *
 * Each measure becomes a balanced debit/credit pair. A cash sale of 1,000 plus
 * 18% ITBIS is two measures, not one:
 *
 *     revenue 1000  ->  Dr Caja 1000   / Cr Ventas 1000
 *     itbis    180  ->  Dr Caja  180   / Cr ITBIS por pagar 180
 *
 * Cash ends up debited 1,180 across the two lines and the entry balances by
 * construction. The database trigger still checks — belt and braces — but the
 * engine cannot emit an unbalanced entry in the first place.
 */
export interface EventMeasure {
  role: string;
  /**
   * Decimal string, not a number. Money never round-trips through a JS float
   * here: the string goes straight into a numeric(18,4) column, and functional
   * amounts are computed by Postgres.
   */
  amount: string;
  taxCode?: string;
  memo?: string;
}

export interface DimensionSet {
  costCenterId?: number;
  profitCenterId?: number;
  projectId?: number;
  /** Tenant-defined dimensions, validated against `dimension_definitions`. */
  custom?: Record<string, string>;
}

export interface AccountingEvent {
  companyId: number;
  /** 'pos_sale' | 'purchase_receipt' | 'cash_withdrawal' | 'depreciation' | … */
  eventType: string;

  /** Idempotency key, together with sourceId and the sourceEvent passed to post(). */
  sourceType: string;
  sourceId: string;

  /** ISO date. Must fall inside an open period. */
  entryDate: string;
  /** Transaction currency of every measure. */
  currency: string;
  /** Transaction -> functional. Decimal string. Defaults to '1'. */
  fxRate?: string;

  /** Predicate input for rule matching, e.g. { productCategoryId: 5 }. */
  context?: Record<string, unknown>;
  measures: EventMeasure[];
  dimensions?: DimensionSet;
  memo?: string;
  postedBy?: number;
}

export interface PostResult {
  entryId: number;
  entryNo: string | null;
  /** False when this event had already been posted. The caller did nothing wrong. */
  created: boolean;
}

/** Minimal shape shared by a pg client and a pooled connection. */
export interface SqlClient {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}

export class PostingError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PostingError";
  }
}

/** No active rule matched a measure, and the company defined no fallback. */
export class UnresolvedAccountError extends PostingError {
  constructor(
    readonly eventType: string,
    readonly role: string,
  ) {
    super(
      `no posting rule matches '${eventType}.${role}'. ` +
        `Define a rule, or a company default with an empty match.`,
    );
    this.name = "UnresolvedAccountError";
  }
}
