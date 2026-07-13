import {
  pgTable,
  bigserial,
  bigint,
  serial,
  integer,
  smallint,
  text,
  char,
  date,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { money } from "./columns";
import { companies } from "./core";
import { customers, suppliers } from "./legacy";
import { fiscalDocuments } from "./fiscal";
import { journalEntries } from "./accounting";

/**
 * Accounts receivable and payable as open-item subledgers.
 *
 * The legacy `customer_credit_accounts` is a running balance with no due dates,
 * no aging and no tie to the general ledger. A real subledger tracks each
 * document as an open item that receipts (or payments) apply against, and it
 * reconciles to a control account in the chart of accounts. AR reconciles to
 * "Clientes" (1.1.02.001), AP to "Proveedores" (2.1.01.001).
 *
 * The document that opens an AR item is a `fiscal_documents` invoice; the one
 * that opens an AP item is a `fiscal_documents` purchase (which also feeds the
 * 606). Receipts and payments are their own records so the money movement is
 * auditable independently of what it settled.
 */

// ── Accounts receivable ─────────────────────────────────────────────────────

export const arOpenItems = pgTable(
  "ar_open_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    customerId: integer("customer_id").references(() => customers.id),
    /** The invoice that created the receivable. */
    documentId: bigint("document_id", { mode: "number" }).references(() => fiscalDocuments.id),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date").notNull(),
    currency: char("currency", { length: 3 }).notNull().default("DOP"),
    originalAmount: money("original_amount").notNull(),
    /** Falls as receipts apply; zero when fully paid. */
    balance: money("balance").notNull(),
    /** open | partial | paid */
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ar_open_items_customer_idx").on(t.companyId, t.customerId, t.status),
    index("ar_open_items_due_idx").on(t.companyId, t.dueDate),
  ],
);

export const arReceipts = pgTable(
  "ar_receipts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    customerId: integer("customer_id").references(() => customers.id),
    receiptDate: date("receipt_date").notNull(),
    currency: char("currency", { length: 3 }).notNull().default("DOP"),
    amount: money("amount").notNull(),
    /** cash | transfer | card | check */
    method: text("method").notNull().default("cash"),
    reference: text("reference"),
    journalEntryId: bigint("journal_entry_id", { mode: "number" }).references(() => journalEntries.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ar_receipts_customer_idx").on(t.companyId, t.customerId)],
);

/** Which open items a receipt settled, and by how much. */
export const arApplications = pgTable(
  "ar_applications",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    receiptId: bigint("receipt_id", { mode: "number" }).references(() => arReceipts.id, { onDelete: "cascade" }).notNull(),
    openItemId: bigint("open_item_id", { mode: "number" }).references(() => arOpenItems.id).notNull(),
    amount: money("amount").notNull(),
  },
  (t) => [index("ar_applications_receipt_idx").on(t.receiptId)],
);

// ── Accounts payable ────────────────────────────────────────────────────────

export const apOpenItems = pgTable(
  "ap_open_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    supplierId: integer("supplier_id").references(() => suppliers.id),
    /** The supplier's purchase document (feeds Form 606). */
    documentId: bigint("document_id", { mode: "number" }).references(() => fiscalDocuments.id),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date").notNull(),
    currency: char("currency", { length: 3 }).notNull().default("DOP"),
    originalAmount: money("original_amount").notNull(),
    balance: money("balance").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ap_open_items_supplier_idx").on(t.companyId, t.supplierId, t.status),
    index("ap_open_items_due_idx").on(t.companyId, t.dueDate),
  ],
);

export const apPayments = pgTable(
  "ap_payments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    supplierId: integer("supplier_id").references(() => suppliers.id),
    paymentDate: date("payment_date").notNull(),
    currency: char("currency", { length: 3 }).notNull().default("DOP"),
    amount: money("amount").notNull(),
    method: text("method").notNull().default("transfer"),
    reference: text("reference"),
    journalEntryId: bigint("journal_entry_id", { mode: "number" }).references(() => journalEntries.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ap_payments_supplier_idx").on(t.companyId, t.supplierId)],
);

export const apApplications = pgTable(
  "ap_applications",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    paymentId: bigint("payment_id", { mode: "number" }).references(() => apPayments.id, { onDelete: "cascade" }).notNull(),
    openItemId: bigint("open_item_id", { mode: "number" }).references(() => apOpenItems.id).notNull(),
    amount: money("amount").notNull(),
  },
  (t) => [index("ap_applications_payment_idx").on(t.paymentId)],
);

export type ArOpenItem = typeof arOpenItems.$inferSelect;
export type ArReceipt = typeof arReceipts.$inferSelect;
export type ApOpenItem = typeof apOpenItems.$inferSelect;
export type ApPayment = typeof apPayments.$inferSelect;
