import {
  pgTable,
  bigserial,
  bigint,
  integer,
  text,
  char,
  date,
  timestamp,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { money } from "./columns";
import { companies } from "./core";
import { chartOfAccounts, journalEntries } from "./accounting";

/**
 * Treasury: bank accounts, the movements through them, and their reconciliation
 * against a bank statement.
 *
 * A bank account is a subledger under a control account in the chart (by default
 * "Bancos", 1.1.01.003), exactly as AR sits under "Clientes". Its detail lives
 * here; the general ledger holds only the rolled-up balance. Every movement
 * posts to the ledger the moment it is recorded, so the sum of a bank account's
 * movements (in − out) equals the balance the ledger reports for its control
 * account — that identity is the whole point of keeping the detail.
 *
 * Reconciliation is the second reason this exists. Our books and the bank's
 * rarely agree at a point in time: a cheque we wrote has not cleared, a charge
 * the bank levied is not yet on our books. A reconciliation marks which of our
 * movements the bank has confirmed ("cleared"), and the difference between the
 * cleared total and the statement's closing balance must reach zero before the
 * reconciliation can be completed. What stays uncleared is the reconciling set —
 * deposits in transit and outstanding cheques.
 */

// ── Bank accounts ────────────────────────────────────────────────────────────

export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    bankName: text("bank_name"),
    accountNumber: text("account_number"),
    /** corriente | ahorros */
    accountType: text("account_type").notNull().default("corriente"),
    currency: char("currency", { length: 3 }).notNull().default("DOP"),
    /** The control account in the chart this bank rolls up into. */
    glAccountId: integer("gl_account_id").references(() => chartOfAccounts.id).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("bank_accounts_code_uq").on(t.companyId, t.code)],
);

// ── Reconciliations ──────────────────────────────────────────────────────────
// Declared before bank_transactions because a transaction points at the
// reconciliation that cleared it.

export const bankReconciliations = pgTable(
  "bank_reconciliations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    bankAccountId: bigint("bank_account_id", { mode: "number" }).references(() => bankAccounts.id, { onDelete: "cascade" }).notNull(),
    /** The statement's closing date. */
    statementDate: date("statement_date").notNull(),
    /** The bank's reported closing balance for that date. */
    statementBalance: money("statement_balance").notNull(),
    /** draft | completed */
    status: text("status").notNull().default("draft"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bank_reconciliations_account_idx").on(t.companyId, t.bankAccountId, t.statementDate)],
);

// ── Movements ────────────────────────────────────────────────────────────────

export const bankTransactions = pgTable(
  "bank_transactions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    bankAccountId: bigint("bank_account_id", { mode: "number" }).references(() => bankAccounts.id, { onDelete: "cascade" }).notNull(),
    txnDate: date("txn_date").notNull(),
    /** in | out — money into or out of the bank. Amount is always positive. */
    direction: text("direction").notNull(),
    amount: money("amount").notNull(),
    /** deposit | payment | charge | interest | transfer | other */
    kind: text("kind").notNull().default("other"),
    /** The chart code of the other leg of the entry (the source or use of funds). */
    counterpartyAccountRef: text("counterparty_account_ref"),
    memo: text("memo"),
    reference: text("reference"),
    journalEntryId: bigint("journal_entry_id", { mode: "number" }).references(() => journalEntries.id),
    /** Set when a reconciliation clears this movement; null while uncleared. */
    reconciliationId: bigint("reconciliation_id", { mode: "number" }).references(() => bankReconciliations.id),
    /** posted | void */
    status: text("status").notNull().default("posted"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bank_transactions_account_idx").on(t.companyId, t.bankAccountId, t.txnDate),
    index("bank_transactions_reconciliation_idx").on(t.reconciliationId),
  ],
);

export type BankAccount = typeof bankAccounts.$inferSelect;
export type BankTransaction = typeof bankTransactions.$inferSelect;
export type BankReconciliation = typeof bankReconciliations.$inferSelect;
