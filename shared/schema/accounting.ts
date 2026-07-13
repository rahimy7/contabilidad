import {
  pgTable,
  pgEnum,
  serial,
  bigserial,
  bigint,
  integer,
  smallint,
  text,
  boolean,
  char,
  date,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { money, fxRate } from "./columns";
import { companies } from "./core";
import { users } from "./legacy";

/**
 * Double-entry general ledger.
 *
 * Two invariants hold this module together, and both are enforced by the
 * database rather than by application code, because a migration or a stray
 * script bypasses application code:
 *
 *   1. Every posted entry balances: sum(debit) = sum(credit), in the company's
 *      functional currency and within each transaction currency.
 *   2. An entry posts at most once per source event. Idempotency is the unique
 *      index on (company_id, source_type, source_id, source_event), not a
 *      "have I seen this?" check in a service.
 *
 * The triggers implementing (1), plus the guards against posting to a closed
 * period or to a non-leaf account, live in the baseline migration as raw SQL —
 * drizzle-kit does not model triggers.
 */

export const accountType = pgEnum("account_type", [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
]);

/** Which side increases the account. Drives sign conventions in reports. */
export const normalSide = pgEnum("normal_side", ["D", "C"]);

export const periodStatus = pgEnum("period_status", [
  "open",
  "soft_closed",
  "closed",
  "reopened",
]);

/**
 * `reversed` is intentionally never assigned. A reversed entry stays `posted`:
 * its lines still stand in the ledger and a mirror entry neutralises them.
 * Marking the original `reversed` would drop it from every balance query that
 * filters on `status='posted'` — which is all of them — leaving the reversal's
 * lines counted alone. The fact of reversal lives in `reversed_by_entry_id`.
 * The value survives only because removing an enum member is not worth a
 * migration.
 */
export const journalStatus = pgEnum("journal_status", [
  "draft",
  "posted",
  "reversed",
  "void",
]);

// ────────────────────────────────────────────────────────────────────────────
// Dimensions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Cost centre, profit centre and project are typed FK columns on every journal
 * line rather than rows in a key/value table. Management reports filter and
 * group by them constantly; an EAV model turns every dimensional trial balance
 * into a pivot with one self-join per dimension. Tenant-specific dimensions
 * ("sucursal", "línea de negocio") go in `journal_entry_lines.dimensions` jsonb
 * instead, which is GIN-indexed and queried far less often.
 */
export const costCenters = pgTable(
  "cost_centers",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    parentId: integer("parent_id"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [uniqueIndex("cost_centers_code_uq").on(t.companyId, t.code)],
);

export const profitCenters = pgTable(
  "profit_centers",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    parentId: integer("parent_id"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [uniqueIndex("profit_centers_code_uq").on(t.companyId, t.code)],
);

export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    parentId: integer("parent_id"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [uniqueIndex("projects_code_uq").on(t.companyId, t.code)],
);

/** Tenant-defined extra dimensions, keyed into `journal_entry_lines.dimensions`. */
export const dimensionDefinitions = pgTable(
  "dimension_definitions",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    isRequired: boolean("is_required").notNull().default(false),
    allowedValues: text("allowed_values").array(),
  },
  (t) => [uniqueIndex("dimension_definitions_uq").on(t.companyId, t.key)],
);

// ────────────────────────────────────────────────────────────────────────────
// Chart of accounts
// ────────────────────────────────────────────────────────────────────────────

export const chartOfAccounts = pgTable(
  "chart_of_accounts",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    /** Hierarchical code: '1', '1.1', '1.1.01', '1.1.01.001'. */
    code: text("code").notNull(),
    name: text("name").notNull(),
    parentId: integer("parent_id"),
    /** Depth, denormalized from parentId so reports avoid a recursive CTE. */
    level: smallint("level").notNull().default(1),
    accountType: accountType("account_type").notNull(),
    normalSide: normalSide("normal_side").notNull(),
    /** Only leaves accept postings. A trigger enforces this, not just the UI. */
    isPostable: boolean("is_postable").notNull().default(false),
    /** Control accounts must reconcile to their subledger. */
    isControl: boolean("is_control").notNull().default(false),
    /** 'AR' | 'AP' | 'INVENTORY' | 'BANK' | null */
    subledger: text("subledger"),
    /** Set only for monetary accounts denominated in a single foreign currency. */
    currency: char("currency", { length: 3 }),
    /** e.g. {'cost_center'} — postings to this account must carry a cost centre. */
    requiresDimension: text("requires_dimension").array(),
    /** Maps into the group's consolidated chart. Null = not consolidated. */
    groupAccountId: integer("group_account_id"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("chart_of_accounts_code_uq").on(t.companyId, t.code),
    index("chart_of_accounts_parent_idx").on(t.companyId, t.parentId),
    index("chart_of_accounts_postable_idx").on(t.companyId, t.isPostable),
  ],
);

// ────────────────────────────────────────────────────────────────────────────
// Periods
// ────────────────────────────────────────────────────────────────────────────

export const accountingPeriods = pgTable(
  "accounting_periods",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    fiscalYear: smallint("fiscal_year").notNull(),
    /** 1..12 for months; 13 carries year-end adjusting and closing entries. */
    periodNo: smallint("period_no").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: periodStatus("status").notNull().default("open"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: integer("closed_by").references(() => users.id),
  },
  (t) => [
    uniqueIndex("accounting_periods_uq").on(t.companyId, t.fiscalYear, t.periodNo),
    index("accounting_periods_range_idx").on(t.companyId, t.startDate, t.endDate),
    check("accounting_periods_range_ck", sql`${t.endDate} >= ${t.startDate}`),
    check("accounting_periods_no_ck", sql`${t.periodNo} between 1 and 13`),
  ],
);

// ────────────────────────────────────────────────────────────────────────────
// Journal
// ────────────────────────────────────────────────────────────────────────────

/**
 * Per-company, per-year counter for `journal_entries.entry_no`.
 *
 * A `max(entry_no) + 1` read would hand the same number to two concurrent
 * posters. This is allocated with the same single `UPDATE … RETURNING` used for
 * NCF ranges, which serializes contenders on the row.
 */
export const journalEntrySequences = pgTable(
  "journal_entry_sequences",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    fiscalYear: smallint("fiscal_year").notNull(),
    nextNumber: bigint("next_number", { mode: "number" }).notNull().default(1),
  },
  (t) => [uniqueIndex("journal_entry_sequences_uq").on(t.companyId, t.fiscalYear)],
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "restrict" })
      .notNull(),
    periodId: integer("period_id")
      .references(() => accountingPeriods.id)
      .notNull(),
    /** Per-company sequential number, assigned when the entry is posted. */
    entryNo: text("entry_no"),
    entryDate: date("entry_date").notNull(),
    memo: text("memo"),
    /** Transaction currency of the entry as a whole. */
    currency: char("currency", { length: 3 }).notNull(),
    status: journalStatus("status").notNull().default("draft"),

    /**
     * Provenance. `source_event` discriminates the several entries one business
     * document produces — a POS sale posts revenue under 'invoice' and COGS
     * under 'cogs', from the same (source_type, source_id).
     */
    sourceType: text("source_type").notNull().default("manual"),
    sourceId: text("source_id"),
    sourceEvent: text("source_event"),

    reversesEntryId: bigint("reverses_entry_id", { mode: "number" }),
    reversedByEntryId: bigint("reversed_by_entry_id", { mode: "number" }),

    postedAt: timestamp("posted_at", { withTimezone: true }),
    postedBy: integer("posted_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),

    /**
     * Whether this entry's lines have been folded into `account_period_balances`.
     * The flag, not the trigger's timing, is what makes the incremental
     * maintenance idempotent: an entry contributes to the cache exactly once,
     * however many times its row is touched.
     */
    balancesApplied: boolean("balances_applied").notNull().default(false),
  },
  (t) => [
    /**
     * The idempotency key. `post()` inserts with ON CONFLICT DO NOTHING, so a
     * redelivered event — from the outbox worker, a retried request, a double
     * click — cannot produce a second entry. Manual entries carry a null
     * source_id and are exempt, since Postgres treats nulls as distinct.
     */
    uniqueIndex("journal_entries_source_uq").on(
      t.companyId,
      t.sourceType,
      t.sourceId,
      t.sourceEvent,
    ),
    uniqueIndex("journal_entries_no_uq").on(t.companyId, t.entryNo),
    index("journal_entries_period_idx").on(t.companyId, t.periodId),
    index("journal_entries_date_idx").on(t.companyId, t.entryDate),
    index("journal_entries_status_idx").on(t.companyId, t.status),
  ],
);

export const journalEntryLines = pgTable(
  "journal_entry_lines",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    entryId: bigint("entry_id", { mode: "number" })
      .references(() => journalEntries.id, { onDelete: "cascade" })
      .notNull(),
    /** Denormalized from the entry: RLS policies and account scans need it here. */
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "restrict" })
      .notNull(),
    lineNo: smallint("line_no").notNull(),
    accountId: integer("account_id")
      .references(() => chartOfAccounts.id)
      .notNull(),

    /** Amounts as transacted. */
    debit: money("debit").notNull().default("0"),
    credit: money("credit").notNull().default("0"),
    currency: char("currency", { length: 3 }).notNull(),
    fxRate: fxRate("fx_rate").notNull().default("1"),

    /** Same amounts translated to the company's functional currency. */
    debitFunc: money("debit_func").notNull().default("0"),
    creditFunc: money("credit_func").notNull().default("0"),

    costCenterId: integer("cost_center_id").references(() => costCenters.id),
    profitCenterId: integer("profit_center_id").references(() => profitCenters.id),
    projectId: integer("project_id").references(() => projects.id),
    /** Overflow for tenant-defined dimensions. See `dimension_definitions`. */
    dimensions: jsonb("dimensions"),

    memo: text("memo"),
  },
  (t) => [
    uniqueIndex("journal_entry_lines_no_uq").on(t.entryId, t.lineNo),
    index("journal_entry_lines_account_idx").on(t.companyId, t.accountId),
    index("journal_entry_lines_entry_idx").on(t.entryId),
    index("journal_entry_lines_cc_idx").on(t.costCenterId),
    check("jel_nonneg_ck", sql`${t.debit} >= 0 and ${t.credit} >= 0`),
    /** A line is a debit or a credit, never both. */
    check("jel_xor_ck", sql`not (${t.debit} > 0 and ${t.credit} > 0)`),
    check(
      "jel_func_nonneg_ck",
      sql`${t.debitFunc} >= 0 and ${t.creditFunc} >= 0`,
    ),
  ],
);

// ────────────────────────────────────────────────────────────────────────────
// Materialized balances
// ────────────────────────────────────────────────────────────────────────────

/**
 * Trial balance and financial statements read from here instead of aggregating
 * millions of journal lines. Maintained incrementally by an AFTER INSERT
 * trigger, which is sound only because posted lines are append-only: a
 * correction is a new reversing entry, never an UPDATE.
 *
 * `rebuildBalances()` recomputes from the lines; a test asserts the rebuilt
 * table equals the incrementally maintained one.
 */
export const accountPeriodBalances = pgTable(
  "account_period_balances",
  {
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    accountId: integer("account_id")
      .references(() => chartOfAccounts.id, { onDelete: "cascade" })
      .notNull(),
    periodId: integer("period_id")
      .references(() => accountingPeriods.id, { onDelete: "cascade" })
      .notNull(),
    /** 0 rather than null, so it can sit in the primary key. */
    costCenterId: integer("cost_center_id").notNull().default(0),
    currency: char("currency", { length: 3 }).notNull(),
    debitTotal: money("debit_total").notNull().default("0"),
    creditTotal: money("credit_total").notNull().default("0"),
    openingFunc: money("opening_func").notNull().default("0"),
    closingFunc: money("closing_func").notNull().default("0"),
  },
  (t) => [
    uniqueIndex("account_period_balances_pk").on(
      t.companyId,
      t.accountId,
      t.periodId,
      t.costCenterId,
      t.currency,
    ),
  ],
);

// ────────────────────────────────────────────────────────────────────────────
// Account determination
// ────────────────────────────────────────────────────────────────────────────

/**
 * The posting engine never names an account. A subledger emits an event with
 * semantic measures ('revenue', 'itbis', 'cogs'); these rules resolve each
 * measure to an account. Without this indirection every SaaS tenant would need
 * the same hardcoded chart of accounts.
 */
export const postingRuleSets = pgTable(
  "posting_rule_sets",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    validFrom: date("valid_from"),
  },
  (t) => [index("posting_rule_sets_company_idx").on(t.companyId)],
);

export const postingRules = pgTable(
  "posting_rules",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    ruleSetId: integer("rule_set_id").references(() => postingRuleSets.id, {
      onDelete: "cascade",
    }),
    /** '<eventType>.<measureRole>', e.g. 'pos_sale.revenue', 'purchase.itbis_credit'. */
    eventType: text("event_type").notNull(),
    /**
     * Predicate over the event context, e.g. {"productCategoryId": 5}. A rule
     * matches when every key here equals the same key in the context. The
     * highest-priority match wins; a rule with `{}` is the company default.
     */
    match: jsonb("match").notNull().default({}),
    debitAccountRef: text("debit_account_ref"),
    creditAccountRef: text("credit_account_ref"),
    priority: smallint("priority").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    index("posting_rules_lookup_idx").on(t.companyId, t.eventType, t.priority),
  ],
);

// ────────────────────────────────────────────────────────────────────────────
// Outbox
// ────────────────────────────────────────────────────────────────────────────

/**
 * When a business write cannot share a transaction with its posting, the event
 * lands here and a worker drains it. Redelivery is safe because `post()` is
 * idempotent on (source_type, source_id, source_event).
 */
export const accountingOutbox = pgTable(
  "accounting_outbox",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    eventType: text("event_type").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    sourceEvent: text("source_event").notNull(),
    payload: jsonb("payload").notNull(),
    /** pending | processed | failed */
    status: text("status").notNull().default("pending"),
    attempts: smallint("attempts").notNull().default(0),
    lastError: text("last_error"),
    /**
     * Earliest time this row may be claimed again. Without it a failing event is
     * re-claimed on the next iteration of the same drain, exhausting `attempts`
     * in milliseconds — so a transient error (a deadlock, a dropped connection)
     * is treated exactly like a permanent one.
     */
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    index("accounting_outbox_pending_idx").on(t.status, t.nextAttemptAt),
    uniqueIndex("accounting_outbox_source_uq").on(
      t.companyId,
      t.sourceType,
      t.sourceId,
      t.sourceEvent,
    ),
  ],
);

export type ChartOfAccount = typeof chartOfAccounts.$inferSelect;
export type AccountingPeriod = typeof accountingPeriods.$inferSelect;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type JournalEntryLine = typeof journalEntryLines.$inferSelect;
export type PostingRule = typeof postingRules.$inferSelect;
export type AccountingOutbox = typeof accountingOutbox.$inferSelect;
