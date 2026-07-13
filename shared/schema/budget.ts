import {
  pgTable,
  serial,
  integer,
  smallint,
  text,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { money } from "./columns";
import { companies } from "./core";
import { chartOfAccounts, costCenters } from "./accounting";

/**
 * Annual budgets and their monthly lines.
 *
 * A budget is a set of expected amounts per account (optionally per cost centre)
 * per month. "Budget vs actual" compares those against the posted ledger, which
 * is why the budget line keys on the same account the journal posts to — the
 * comparison is a join, not a mapping exercise.
 */
export const budgets = pgTable(
  "budgets",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    fiscalYear: smallint("fiscal_year").notNull(),
    status: text("status").notNull().default("draft"), // draft | approved
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("budgets_uq").on(t.companyId, t.name, t.fiscalYear)],
);

export const budgetLines = pgTable(
  "budget_lines",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    budgetId: integer("budget_id").references(() => budgets.id, { onDelete: "cascade" }).notNull(),
    accountId: integer("account_id").references(() => chartOfAccounts.id).notNull(),
    costCenterId: integer("cost_center_id").references(() => costCenters.id),
    periodNo: smallint("period_no").notNull(), // 1..12
    amount: money("amount").notNull(),
  },
  (t) => [
    uniqueIndex("budget_lines_uq").on(t.budgetId, t.accountId, t.costCenterId, t.periodNo),
    index("budget_lines_account_idx").on(t.companyId, t.accountId),
  ],
);

export type Budget = typeof budgets.$inferSelect;
export type BudgetLine = typeof budgetLines.$inferSelect;
