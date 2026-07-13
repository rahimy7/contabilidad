import {
  pgTable,
  bigserial,
  bigint,
  integer,
  smallint,
  text,
  date,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { money, rate } from "./columns";
import { companies } from "./core";
import { journalEntries } from "./accounting";

/**
 * Fixed assets and their depreciation.
 *
 * An asset depreciates its cost (less residual value) over a useful life. Each
 * month a run posts the period's depreciation: Dr depreciation expense, Cr
 * accumulated depreciation. The asset's net book value is cost − accumulated,
 * and it never depreciates below the residual value.
 *
 * Straight-line only for now — the method most DR SMBs use and the one the tax
 * authority expects by default. `method` leaves room for declining-balance
 * later without a schema change.
 */
export const fixedAssets = pgTable(
  "fixed_assets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: text("category"),
    /** The asset and accumulated-depreciation accounts this asset rolls into. */
    assetAccountCode: text("asset_account_code").notNull().default("1.2.01.001"),
    accumAccountCode: text("accum_account_code").notNull().default("1.2.01.003"),
    expenseAccountCode: text("expense_account_code").notNull().default("5.2.03.001"),
    acquisitionDate: date("acquisition_date").notNull(),
    cost: money("cost").notNull(),
    residualValue: money("residual_value").notNull().default("0"),
    usefulLifeMonths: integer("useful_life_months").notNull(),
    method: text("method").notNull().default("straight_line"),
    /** Accumulated depreciation booked so far; drives net book value. */
    accumulatedDepreciation: money("accumulated_depreciation").notNull().default("0"),
    /** active | disposed | fully_depreciated */
    status: text("status").notNull().default("active"),
    disposalDate: date("disposal_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fixed_assets_code_uq").on(t.companyId, t.code)],
);

/** One posted depreciation charge for one asset in one period. */
export const depreciationEntries = pgTable(
  "depreciation_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    assetId: bigint("asset_id", { mode: "number" }).references(() => fixedAssets.id, { onDelete: "cascade" }).notNull(),
    fiscalYear: smallint("fiscal_year").notNull(),
    periodNo: smallint("period_no").notNull(),
    amount: money("amount").notNull(),
    journalEntryId: bigint("journal_entry_id", { mode: "number" }).references(() => journalEntries.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One charge per asset per period — the guard against depreciating a month twice.
    uniqueIndex("depreciation_entries_uq").on(t.assetId, t.fiscalYear, t.periodNo),
    index("depreciation_entries_period_idx").on(t.companyId, t.fiscalYear, t.periodNo),
  ],
);

export type FixedAsset = typeof fixedAssets.$inferSelect;
export type DepreciationEntry = typeof depreciationEntries.$inferSelect;
