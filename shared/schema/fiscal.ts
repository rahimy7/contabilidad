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

// ────────────────────────────────────────────────────────────────────────────
// e-CF: facturación electrónica
// ────────────────────────────────────────────────────────────────────────────

/**
 * Which DGII environment a company talks to.
 *
 * The three are separate worlds with separate credentials, separate eNCF ranges
 * and separate consulta URLs. A taxpayer walks them in order: `test` while
 * building, `cert` for the certification DGII grades, `prod` once authorized.
 * Keeping it per company rather than per deployment is what lets one instance
 * serve a taxpayer already in producción alongside one still certifying.
 *
 * `simulated` is this system's own: no network at all, a local DGII that runs
 * the real handshake and the real validations. It is what makes the module
 * operable before a certificate exists.
 */
export const ecfEnvironment = pgEnum("ecf_environment", [
  "simulated",
  "test",
  "cert",
  "prod",
]);

/** Where a commercial approval sits. DGII codes: 1 = aceptado, 2 = rechazado. */
export const ecfApprovalStatus = pgEnum("ecf_approval_status", [
  "pendiente",
  "aceptado",
  "rechazado",
]);

/**
 * Per-company e-CF configuration.
 *
 * One row per company. The certificate lives here as PEM rather than as a file
 * path because the deployment is containerised and a path would not survive a
 * redeploy; the private key is the sensitive part and is never returned by any
 * read endpoint — only its fingerprint and expiry, which is what an operator
 * actually needs to see.
 */
export const ecfConfig = pgTable(
  "ecf_config",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    environment: ecfEnvironment("environment").notNull().default("simulated"),
    /** Master switch. Off, and every document stays a legacy NCF. */
    isEnabled: boolean("is_enabled").notNull().default(false),
    /** Razón social as DGII has it — must match the RNC registry exactly. */
    issuerName: text("issuer_name"),
    issuerRnc: varchar("issuer_rnc", { length: 11 }),
    /** Comercial name printed on the representación impresa. */
    tradeName: text("trade_name"),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    /** Logo for the representación impresa, as a data: URI. */
    logoUrl: text("logo_url"),

    /** PEM private key. Write-only through the API; never read back. */
    certificatePrivateKey: text("certificate_private_key"),
    certificatePem: text("certificate_pem"),
    /** SHA-256 of the certificate, shown so an operator can confirm which is loaded. */
    certificateFingerprint: text("certificate_fingerprint"),
    certificateSubject: text("certificate_subject"),
    certificateExpiresAt: timestamp("certificate_expires_at", { withTimezone: true }),

    /**
     * A consumo e-CF (E32) below this total goes to DGII as a periodic summary
     * (RFCE) instead of one submission per sale — the rule that keeps a colmado
     * ringing up 400 sales a day from making 400 API calls. RD$250,000 is the
     * DGII threshold; it is configurable because thresholds move by norm.
     */
    rfceThreshold: money("rfce_threshold").notNull().default("250000"),

    /**
     * How long to keep retrying a submission before the operator has to look at
     * it. Contingency is a legal state, not an error, but one that lasts a week
     * unnoticed is an unreported month.
     */
    maxTransmitAttempts: integer("max_transmit_attempts").notNull().default(8),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ecf_config_company_uq").on(t.companyId)],
);

/**
 * The transmission queue.
 *
 * A row per attempt to get one document to DGII. Separate from
 * `fiscal_documents` because a document has one status but many attempts, and
 * the question an operator asks during an outage — "what is stuck, since when,
 * and what did DGII say the last three times" — is unanswerable from a single
 * status column.
 *
 * `next_attempt_at` is what the retry job polls. Backoff is exponential, so a
 * DGII outage does not turn into a self-inflicted denial of service.
 */
export const ecfTransmissions = pgTable(
  "ecf_transmissions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    documentId: bigint("document_id", { mode: "number" })
      .references(() => fiscalDocuments.id, { onDelete: "cascade" })
      .notNull(),
    /** queued | sending | sent | resolved | failed | abandoned */
    state: text("state").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow(),
    lastError: text("last_error"),
    trackId: text("track_id"),
    /** The status DGII last reported for this submission. */
    dgiiStatus: text("dgii_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ecf_transmissions_doc_uq").on(t.documentId),
    index("ecf_transmissions_due_idx").on(t.state, t.nextAttemptAt),
  ],
);

/**
 * e-CF received from suppliers.
 *
 * An electronic issuer is also an electronic receiver: DGII pushes a supplier's
 * e-CF to our endpoint, and we owe an acuse de recibo within an hour and a
 * commercial approval within three days. Kept apart from `fiscal_documents`
 * because these are somebody else's comprobantes — we did not number them, we
 * cannot cancel them, and their XML is the supplier's signed original which must
 * be preserved byte for byte.
 *
 * The link to our own AP document is `purchase_document_id`: matching a received
 * e-CF to the purchase we recorded is the reconciliation that makes the 606
 * defensible.
 */
export const ecfReceived = pgTable(
  "ecf_received",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    /** The supplier's eNCF, e.g. 'E310000000042'. */
    encf: varchar("encf", { length: 19 }).notNull(),
    ecfType: varchar("ecf_type", { length: 3 }).notNull(),
    issuerRnc: varchar("issuer_rnc", { length: 11 }).notNull(),
    issuerName: text("issuer_name"),
    /** Our RNC, as the supplier addressed it. */
    buyerRnc: varchar("buyer_rnc", { length: 11 }),
    emittedAt: timestamp("emitted_at", { withTimezone: true }),
    currency: char("currency", { length: 3 }).notNull().default("DOP"),
    subtotalTaxed: money("subtotal_taxed").notNull().default("0"),
    subtotalExempt: money("subtotal_exempt").notNull().default("0"),
    totalItbis: money("total_itbis").notNull().default("0"),
    total: money("total").notNull().default("0"),
    securityCode: varchar("security_code", { length: 12 }),
    /** The supplier's signed XML, preserved exactly as received. */
    xmlReceived: text("xml_received"),
    /** Whether our signature check over their XML passed. */
    signatureValid: boolean("signature_valid"),

    /** Acuse de recibo: did we acknowledge, and when. */
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    /** Aprobación comercial we sent back. */
    approvalStatus: ecfApprovalStatus("approval_status").notNull().default("pendiente"),
    approvalReason: text("approval_reason"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: integer("approved_by"),

    /** Our own AP document for this purchase, once matched. */
    purchaseDocumentId: bigint("purchase_document_id", { mode: "number" }).references(
      () => fiscalDocuments.id,
    ),
    supplierId: integer("supplier_id").references(() => suppliers.id),

    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** One eNCF per issuer: a redelivered push must not create a second row. */
    uniqueIndex("ecf_received_uq").on(t.companyId, t.issuerRnc, t.encf),
    index("ecf_received_approval_idx").on(t.companyId, t.approvalStatus),
    index("ecf_received_date_idx").on(t.companyId, t.emittedAt),
  ],
);

/**
 * Voided e-NCF ranges, reported to DGII.
 *
 * Distinct from Form 608 (which reports voided *documents*): this reports
 * *numbers never used* — a range abandoned because a sequence was replaced, a
 * printer batch lost, a test range that reached production. DGII wants them
 * declared so an unused number cannot resurface later as an invoice.
 */
export const ecfSequenceVoids = pgTable(
  "ecf_sequence_voids",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    ecfType: varchar("ecf_type", { length: 3 }).notNull(),
    rangeFrom: bigint("range_from", { mode: "number" }).notNull(),
    rangeTo: bigint("range_to", { mode: "number" }).notNull(),
    reason: text("reason"),
    /** pendiente | enviado | aceptado | rechazado */
    status: text("status").notNull().default("pendiente"),
    trackId: text("track_id"),
    xmlSigned: text("xml_signed"),
    voidedBy: integer("voided_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    index("ecf_sequence_voids_idx").on(t.companyId, t.ecfType),
    check("ecf_sequence_voids_range_ck", sql`${t.rangeTo} >= ${t.rangeFrom}`),
  ],
);

/**
 * The simulated DGII's own storage.
 *
 * A mock that lives in a Map proves the code path and forgets everything on
 * restart. This is a stand-in you can operate against for weeks: it keeps every
 * submission, enforces eNCF uniqueness across them, and resolves asynchronously
 * the way the real service does — so "En Proceso" is a state the application
 * genuinely has to handle rather than one it never sees.
 *
 * Rows here are DGII's records, not the taxpayer's. They are deliberately not
 * company-scoped by RLS in the same way: the simulator plays an outside party.
 */
export const ecfSimulatorInbox = pgTable(
  "ecf_simulator_inbox",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    trackId: text("track_id").notNull(),
    issuerRnc: varchar("issuer_rnc", { length: 11 }).notNull(),
    encf: varchar("encf", { length: 19 }).notNull(),
    ecfType: varchar("ecf_type", { length: 3 }),
    buyerRnc: varchar("buyer_rnc", { length: 11 }),
    total: money("total").notNull().default("0"),
    /** en_proceso | aceptado | aceptado_condicional | rechazado */
    status: text("status").notNull().default("en_proceso"),
    /** DGII's validation findings, as a list of coded messages. */
    messages: jsonb("messages").notNull().default([]),
    xmlReceived: text("xml_received"),
    /** When the simulator will flip this from en_proceso to its verdict. */
    resolvesAt: timestamp("resolves_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ecf_simulator_track_uq").on(t.trackId),
    /** DGII refuses a second submission of the same eNCF from the same issuer. */
    uniqueIndex("ecf_simulator_encf_uq").on(t.issuerRnc, t.encf),
  ],
);

export type EcfConfig = typeof ecfConfig.$inferSelect;
export type EcfTransmission = typeof ecfTransmissions.$inferSelect;
export type EcfReceived = typeof ecfReceived.$inferSelect;
export type EcfSequenceVoid = typeof ecfSequenceVoids.$inferSelect;

export type NcfSequence = typeof ncfSequences.$inferSelect;
export type TaxCode = typeof taxCodes.$inferSelect;
export type TaxRate = typeof taxRates.$inferSelect;
export type RetentionRule = typeof retentionRules.$inferSelect;
export type FiscalDocument = typeof fiscalDocuments.$inferSelect;
export type FiscalDocumentLine = typeof fiscalDocumentLines.$inferSelect;
export type FiscalDocumentEvent = typeof fiscalDocumentEvents.$inferSelect;
