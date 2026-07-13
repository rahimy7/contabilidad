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
  varchar,
  date,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { money, fxRate, rate, quantity } from "./columns";
import { companies } from "./core";
import { journalEntries } from "./accounting";
import { customers, suppliers, orders, products } from "./legacy";

/**
 * DGII fiscal layer (República Dominicana).
 *
 * Named `fiscal_documents`, not `invoices`: `invoices` in the inherited schema
 * is the PayPal subscription-billing table (currently commented out), and
 * reusing the name would collide the day that subsystem comes back.
 *
 * The model is e-CF-ready from the outset even though the first release only
 * issues legacy NCF. Retrofitting `xml_signed`, `track_id` and the submission
 * state machine onto a table already holding a year of invoices is far more
 * expensive than carrying nullable columns now.
 */

/** Comprobante status, independent of the e-CF submission lifecycle. */
export const fiscalDocStatus = pgEnum("fiscal_doc_status", [
  "draft",
  "issued",
  "cancelled",
]);

export const fiscalDocType = pgEnum("fiscal_doc_type", [
  "invoice",
  "credit_note",
  "debit_note",
  "receipt",
  /** Supplier document. Feeds Form 606 and the AP subledger. */
  "purchase",
]);

/**
 * Where a document sits in the DGII round trip. Null until the company is
 * certified for e-CF; legacy NCF documents never leave `null`.
 */
export const ecfStatus = pgEnum("ecf_status", [
  "pendiente",
  "firmado",
  "enviado",
  "aceptado",
  "aceptado_condicional",
  "rechazado",
  "en_contingencia",
  "anulado",
]);

// ────────────────────────────────────────────────────────────────────────────
// NCF sequences
// ────────────────────────────────────────────────────────────────────────────

/**
 * A range of comprobante numbers authorized by DGII for one company and one
 * NCF type. Allocation must be atomic under concurrency: two cashiers ringing
 * up sales at the same instant must never receive the same NCF.
 *
 * The allocator is a single statement:
 *
 *   UPDATE ncf_sequences
 *      SET next_number = next_number + 1
 *    WHERE id = $1 AND is_active
 *      AND next_number <= range_to
 *      AND (expiry_date IS NULL OR expiry_date >= current_date)
 *   RETURNING next_number - 1;
 *
 * The UPDATE takes a row lock for the life of the transaction, so concurrent
 * allocators serialize on this row and Postgres re-evaluates the WHERE against
 * the latest committed tuple. Zero rows back means the range is spent or
 * expired — fail over to the next active sequence, or to contingency.
 *
 * Gaps are legal. A number is reserved by the UPDATE and only sticks if the
 * transaction commits, so a rollback returns it. But a document voided after
 * commit, or an e-CF rejected by DGII, leaves a hole — and that is exactly what
 * Form 608 (Comprobantes Anulados) exists to report. Do not engineer dense
 * sequences; reconcile through 608.
 */
export const ncfSequences = pgTable(
  "ncf_sequences",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    /** 'B01', 'B02', 'B14', 'B15', 'E31', 'E32', 'E34'… */
    ncfType: varchar("ncf_type", { length: 3 }).notNull(),
    isEcf: boolean("is_ecf").notNull().default(false),
    rangeFrom: bigint("range_from", { mode: "number" }).notNull(),
    rangeTo: bigint("range_to", { mode: "number" }).notNull(),
    /** Next number to hand out. Equals range_to + 1 once exhausted. */
    nextNumber: bigint("next_number", { mode: "number" }).notNull(),
    expiryDate: date("expiry_date"),
    /** Warn once fewer than this many numbers remain. */
    alertThreshold: integer("alert_threshold").notNull().default(50),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ncf_sequences_uq").on(t.companyId, t.ncfType, t.rangeFrom),
    index("ncf_sequences_active_idx").on(t.companyId, t.ncfType, t.isActive),
    check("ncf_sequences_range_ck", sql`${t.rangeTo} >= ${t.rangeFrom}`),
    /** next_number may sit one past the end; that is the exhausted state. */
    check(
      "ncf_sequences_next_ck",
      sql`${t.nextNumber} >= ${t.rangeFrom} and ${t.nextNumber} <= ${t.rangeTo} + 1`,
    ),
  ],
);

// ────────────────────────────────────────────────────────────────────────────
// Tax configuration
// ────────────────────────────────────────────────────────────────────────────

/**
 * Rates are configuration, not constants. The inherited POS hardcodes
 * "ITBIS (0%)" in the invoice modal and the POS screen; a SaaS sold to other
 * Dominican taxpayers cannot do that, and rates change by law.
 */
export const taxCodes = pgTable(
  "tax_codes",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    /** 'ITBIS18' | 'ITBIS16' | 'ITBIS0' | 'EXENTO' | 'ISC' | 'PROPINA' */
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** vat | excise | tip | retention */
    kind: text("kind").notNull(),
    /** Symbolic account reference, resolved through posting rules. */
    accountRef: text("account_ref"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [uniqueIndex("tax_codes_uq").on(t.companyId, t.code)],
);

/** Rates are time-boxed so historical documents keep reproducing their own totals. */
export const taxRates = pgTable(
  "tax_rates",
  {
    id: serial("id").primaryKey(),
    taxCodeId: integer("tax_code_id")
      .references(() => taxCodes.id, { onDelete: "cascade" })
      .notNull(),
    /** 0.1800 = 18%. */
    rate: rate("rate").notNull(),
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to"),
  },
  (t) => [index("tax_rates_lookup_idx").on(t.taxCodeId, t.validFrom)],
);

/**
 * Retenciones. Which party withholds, on what base, at what rate, depends on
 * the counterparty (persona física vs jurídica) and the operation, so the
 * predicate lives in `applies_when` rather than in a switch statement.
 */
export const retentionRules = pgTable(
  "retention_rules",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    /** itbis | isr | gross */
    base: text("base").notNull(),
    rate: rate("rate").notNull(),
    /** e.g. {"counterpartyType":"persona_fisica","operation":"servicios"} */
    appliesWhen: jsonb("applies_when").notNull().default({}),
    accountRef: text("account_ref"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [index("retention_rules_company_idx").on(t.companyId)],
);

// ────────────────────────────────────────────────────────────────────────────
// Fiscal documents
// ────────────────────────────────────────────────────────────────────────────

export const fiscalDocuments = pgTable(
  "fiscal_documents",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "restrict" })
      .notNull(),
    docType: fiscalDocType("doc_type").notNull(),

    /** 'B0100000001' (11) or e-CF 'E310000000001' (13). Null while draft. */
    ncf: varchar("ncf", { length: 19 }),
    ncfType: varchar("ncf_type", { length: 3 }).notNull(),
    isEcf: boolean("is_ecf").notNull().default(false),
    /** For credit/debit notes: the comprobante being modified. */
    modifiesNcf: varchar("modifies_ncf", { length: 19 }),
    modifiesDocId: bigint("modifies_doc_id", { mode: "number" }),

    issuerRnc: varchar("issuer_rnc", { length: 11 }).notNull(),
    /** Null for consumo final below the threshold. */
    buyerRnc: varchar("buyer_rnc", { length: 11 }),
    buyerName: text("buyer_name"),

    customerId: integer("customer_id").references(() => customers.id),
    supplierId: integer("supplier_id").references(() => suppliers.id),
    /**
     * The operational sale this document bills. `orders` keeps delivery, trips,
     * loyalty and warehouse concerns that DGII has no interest in; a sale
     * becomes fiscal only when an NCF is issued, and credit notes do not map
     * one-to-one onto orders. Hence a reference, not a merge.
     */
    orderId: integer("order_id").references(() => orders.id),

    currency: char("currency", { length: 3 }).notNull().default("DOP"),
    fxRate: fxRate("fx_rate").notNull().default("1"),

    subtotalTaxed: money("subtotal_taxed").notNull().default("0"),
    subtotalExempt: money("subtotal_exempt").notNull().default("0"),
    itbis18: money("itbis_18").notNull().default("0"),
    itbis16: money("itbis_16").notNull().default("0"),
    itbis0: money("itbis_0").notNull().default("0"),
    /** Impuesto selectivo al consumo. */
    isc: money("isc").notNull().default("0"),
    /** Propina legal 10%. */
    tipLegal: money("tip_legal").notNull().default("0"),
    retentionItbis: money("retention_itbis").notNull().default("0"),
    retentionIsr: money("retention_isr").notNull().default("0"),
    /**
     * ISR-retention concept for the IR-17 declaration (honorarios, alquileres,
     * dividendos…). Null when the document withholds no ISR. It classifies the
     * withholding into an IR-17 box; the amount lives in `retention_isr`.
     */
    retentionConcept: text("retention_concept"),
    total: money("total").notNull().default("0"),

    status: fiscalDocStatus("status").notNull().default("draft"),
    ecfStatus: ecfStatus("ecf_status"),
    /** DGII TrackId returned on submission. */
    trackId: text("track_id"),
    /** Derived from the XAdES signature; printed on the representación impresa. */
    securityCode: varchar("security_code", { length: 12 }),
    signatureDatetime: timestamp("signature_datetime", { withTimezone: true }),
    /** Storage path to the signed XML, or the XML itself for small documents. */
    xmlSigned: text("xml_signed"),
    qrUrl: text("qr_url"),
    contingency: boolean("contingency").notNull().default(false),

    emittedAt: timestamp("emitted_at", { withTimezone: true }),
    dueDate: date("due_date"),

    /** Filled once the GL exists; null for documents issued before it did. */
    journalEntryId: bigint("journal_entry_id", { mode: "number" }).references(
      () => journalEntries.id,
    ),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** An NCF identifies a document uniquely within the issuing taxpayer. */
    uniqueIndex("fiscal_documents_ncf_uq").on(t.companyId, t.ncf),
    index("fiscal_documents_type_idx").on(t.companyId, t.ncfType),
    index("fiscal_documents_buyer_idx").on(t.companyId, t.buyerRnc),
    index("fiscal_documents_ecf_status_idx").on(t.companyId, t.ecfStatus),
    index("fiscal_documents_emitted_idx").on(t.companyId, t.emittedAt),
    check("fiscal_documents_total_ck", sql`${t.total} >= 0`),
  ],
);

export const fiscalDocumentLines = pgTable(
  "fiscal_document_lines",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    documentId: bigint("document_id", { mode: "number" })
      .references(() => fiscalDocuments.id, { onDelete: "cascade" })
      .notNull(),
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "restrict" })
      .notNull(),
    lineNo: smallint("line_no").notNull(),
    productId: integer("product_id").references(() => products.id),
    description: text("description").notNull(),
    quantity: quantity("quantity").notNull().default("1"),
    unitPrice: money("unit_price").notNull().default("0"),
    discount: money("discount").notNull().default("0"),
    /** References `tax_codes.code`, not its id: the code is what DGII files carry. */
    taxCode: text("tax_code"),
    itbisRate: rate("itbis_rate").notNull().default("0"),
    itbisAmount: money("itbis_amount").notNull().default("0"),
    lineTotal: money("line_total").notNull().default("0"),
    isExempt: boolean("is_exempt").notNull().default(false),
  },
  (t) => [
    uniqueIndex("fiscal_document_lines_no_uq").on(t.documentId, t.lineNo),
    index("fiscal_document_lines_doc_idx").on(t.documentId),
  ],
);

/**
 * Every interaction with DGII, inbound and outbound. This is the audit trail a
 * tax auditor asks for, and the only way to explain why a document sits in
 * `rechazado` three months later.
 */
export const fiscalDocumentEvents = pgTable(
  "fiscal_document_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    documentId: bigint("document_id", { mode: "number" })
      .references(() => fiscalDocuments.id, { onDelete: "cascade" })
      .notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    /** out = we called DGII; in = DGII called us (aprobación comercial). */
    direction: text("direction").notNull(),
    payload: jsonb("payload"),
    httpStatus: integer("http_status"),
    dgiiMessage: text("dgii_message"),
  },
  (t) => [index("fiscal_document_events_doc_idx").on(t.documentId, t.at)],
);

/**
 * Payments to non-residents, for the Formato 609.
 *
 * Kept apart from `fiscal_documents` because a payment abroad carries no NCF, no
 * ITBIS and no domestic RNC — it does not fit the comprobante model at all. What
 * DGII wants is the beneficiary, the kind of income, the amount, and the ISR
 * withheld (27% by default, less under a tax treaty). Amounts are stored in DOP:
 * the 609 files in pesos, converted at the payment date. The ISR withheld is
 * remitted separately from IR-17 retentions, so it lands in its own control
 * account (2.1.02.005) and each declaration reconciles to its own account.
 */
export const foreignPayments = pgTable(
  "foreign_payments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    beneficiaryName: text("beneficiary_name").notNull(),
    country: text("country"),
    /** 609 tipo de renta: servicios | intereses | dividendos | regalias | alquileres | … */
    incomeType: text("income_type").notNull().default("servicios"),
    paymentDate: date("payment_date").notNull(),
    /** Monto pagado, en DOP. */
    grossAmount: money("gross_amount").notNull(),
    isrRate: rate("isr_rate").notNull().default("0.27"),
    /** ISR retenido, en DOP. */
    isrRetained: money("isr_retained").notNull(),
    /** GL leg for the expense and the account the payment came out of. */
    expenseAccountRef: text("expense_account_ref").notNull().default("5.2.02.003"),
    paymentAccountRef: text("payment_account_ref").notNull().default("1.1.01.003"),
    memo: text("memo"),
    reference: text("reference"),
    journalEntryId: bigint("journal_entry_id", { mode: "number" }).references(() => journalEntries.id),
    status: text("status").notNull().default("posted"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("foreign_payments_date_idx").on(t.companyId, t.paymentDate)],
);

export type ForeignPayment = typeof foreignPayments.$inferSelect;

export type NcfSequence = typeof ncfSequences.$inferSelect;
export type TaxCode = typeof taxCodes.$inferSelect;
export type TaxRate = typeof taxRates.$inferSelect;
export type RetentionRule = typeof retentionRules.$inferSelect;
export type FiscalDocument = typeof fiscalDocuments.$inferSelect;
export type FiscalDocumentLine = typeof fiscalDocumentLines.$inferSelect;
export type FiscalDocumentEvent = typeof fiscalDocumentEvents.$inferSelect;
