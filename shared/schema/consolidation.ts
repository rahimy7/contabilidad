import {
  pgTable,
  bigserial,
  bigint,
  integer,
  smallint,
  text,
  boolean,
  char,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { money, fxRate } from "./columns";
import { groups, companies } from "./core";

/**
 * Materialised consolidation runs.
 *
 * A consolidated statement has to be reproducible: an auditor who asks for "the
 * group's Q2 balance sheet" must get the same numbers months later, even after
 * the member companies have kept posting. So a run freezes its result into
 * `consolidation_lines` rather than recomputing on demand.
 *
 * These tables are keyed by `group_id`, not `company_id` — consolidation is
 * cross-tenant by nature. They carry no row-level-security policy (which is
 * per-company); access is authorised at the route by proving the user belongs to
 * a company in the group, and the aggregation runs as the owner via
 * `withoutTenant`, the one place isolation is deliberately crossed.
 */
export const consolidationRuns = pgTable(
  "consolidation_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    groupId: integer("group_id").references(() => groups.id, { onDelete: "cascade" }).notNull(),
    fiscalYear: smallint("fiscal_year").notNull(),
    /** Null = full year; otherwise YTD through this month (1..12). */
    periodNo: smallint("period_no"),
    baseCurrency: char("base_currency", { length: 3 }).notNull().default("DOP"),
    /** draft | final */
    status: text("status").notNull().default("final"),
    memberCount: integer("member_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: integer("created_by"),
  },
  (t) => [index("consolidation_runs_group_idx").on(t.groupId, t.fiscalYear)],
);

export const consolidationLines = pgTable(
  "consolidation_lines",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: bigint("run_id", { mode: "number" }).references(() => consolidationRuns.id, { onDelete: "cascade" }).notNull(),
    groupId: integer("group_id").notNull(),
    accountCode: text("account_code").notNull(),
    accountName: text("account_name").notNull(),
    /** asset | liability | equity | income | expense */
    accountType: text("account_type").notNull(),
    debit: money("debit").notNull().default("0"),
    credit: money("credit").notNull().default("0"),
    /**
     * True for a line that cancels an intra-group transaction rather than
     * aggregating one. Kept as its own line instead of silently netted into the
     * aggregate, because an auditor must be able to see what was eliminated and
     * why. Eliminations balance among themselves, so they never disturb the CTA.
     */
    isElimination: boolean("is_elimination").notNull().default(false),
    note: text("note"),
  },
  (t) => [index("consolidation_lines_run_idx").on(t.runId, t.accountCode)],
);

/**
 * The rates a run translated each foreign-currency member at.
 *
 * Frozen with the run, because a consolidated statement is only reproducible if
 * the rates that produced it are. Balance-sheet accounts convert at the closing
 * rate and income-statement accounts at the period average — the two differ, and
 * the gap they open is the cumulative translation adjustment that balances the
 * consolidated trial balance.
 */
export const consolidationRates = pgTable(
  "consolidation_rates",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: bigint("run_id", { mode: "number" }).references(() => consolidationRuns.id, { onDelete: "cascade" }).notNull(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    /** The member's functional currency, translated into the group's. */
    currency: char("currency", { length: 3 }).notNull().default("DOP"),
    closingRate: fxRate("closing_rate").notNull().default("1"),
    averageRate: fxRate("average_rate").notNull().default("1"),
  },
  (t) => [index("consolidation_rates_run_idx").on(t.runId)],
);

export type ConsolidationRun = typeof consolidationRuns.$inferSelect;
export type ConsolidationLine = typeof consolidationLines.$inferSelect;
export type ConsolidationRate = typeof consolidationRates.$inferSelect;
