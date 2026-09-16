import type { SqlClient } from "../accounting/types";
import { requestApproval, resolveApproval, getById as getApproval } from "../services/approvals";
import {
  checkFiscalIdentity, onlyDigits,
  type CreditLineStatus, type GuaranteeType, type PersonType, type TaxIdType, type TaxpayerType,
} from "@shared/customer-fiscal";

/**
 * Maestro de clientes: identidad fiscal, condiciones comerciales, contactos,
 * estado de cuenta y línea de crédito.
 *
 * Tres decisiones que conviene tener presentes:
 *
 *  - El límite y el plazo de crédito viven en `customer_pricing_terms`, que es
 *    lo que ya leen la factura (límite) y el vencimiento de la CxC (plazo). Aquí
 *    no hay una segunda copia: guardar la ficha nunca toca esos dos campos, sólo
 *    una solicitud aprobada los cambia.
 *  - Las condiciones se versionan: un cambio desactiva la fila vigente (con su
 *    fecha de fin) e inserta otra, así se sabe qué condiciones regían una venta.
 *  - La aprobación usa el motor genérico (`approval_requests`): regla por monto,
 *    quien solicita no aprueba, bitácora inmutable. Una solicitud resuelta desde
 *    la bandeja de Aprobaciones se aplica con `syncCreditApplication`.
 */

export class CustomerError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 422 = 422,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface CustomerCtx {
  companyId: number;
  storeId: number;
  userId: number;
}

export const CREDIT_DOCUMENT_TYPE = "customer_credit";

const TODAY = `(now() AT TIME ZONE 'America/Santo_Domingo')::date`;

// ── Tipos de entrada ─────────────────────────────────────────────────────────

export interface CommercialTermsInput {
  priceListId?: number | null;
  additionalDiscountPercent: number;
  earlyPaymentDiscountPercent: number;
  earlyPaymentDays?: number | null;
  itbisRetentionPercent: number;
  isrRetentionPercent: number;
  requiresPurchaseOrder: boolean;
  gracePeriodDays: number;
  notes?: string | null;
}

export interface CustomerInput {
  code?: string | null;
  personType: PersonType;
  taxIdType?: TaxIdType | null;
  rnc?: string | null;
  foreignId?: string | null;
  legalName: string;
  tradeName?: string | null;
  taxpayerType: TaxpayerType;
  defaultNcfType?: string | null;
  itbisExempt: boolean;
  exemptionReference?: string | null;
  economicActivity?: string | null;
  dgiiStatus?: string | null;
  dgiiVerifiedAt?: string | null;
  phone: string;
  phoneAlt?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  sector?: string | null;
  municipality?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country: string;
  customerTypeId?: number | null;
  salesRepUserId?: number | null;
  currency: string;
  preferredPaymentMethod?: string | null;
  isActive: boolean;
  notes?: string | null;
  terms: CommercialTermsInput;
  /** El RNC ya está en otro cliente (una sucursal, p. ej.) y el usuario lo confirmó. */
  confirmDuplicateTaxId?: boolean;
}

export interface CreditRequestInput {
  requestedLimit: number;
  requestedDays: number;
  justification: string;
  guaranteeType: GuaranteeType;
  guaranteeAmount?: number | null;
  guaranteeNotes?: string | null;
  referencesNotes?: string | null;
  reviewDate?: string | null;
}

export interface ContactInput {
  name: string;
  role: "buyer" | "accountant" | "manager" | "operations" | "warehouse" | "other";
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  isPrimary: boolean;
  receivesInvoices: boolean;
  receivesStatements: boolean;
  notes?: string | null;
}

const blank = (v: string | null | undefined) => (v === undefined || v === null || v.trim() === "" ? null : v.trim());

// ── Lectura ─────────────────────────────────────────────────────────────────

/** El cliente de esta tienda y visible para esta empresa, o 404. */
async function loadCustomer(c: SqlClient, ctx: CustomerCtx, id: number, forUpdate = false) {
  const { rows } = await c.query(
    `SELECT *, dgii_verified_at::text AS dgii_verified_on, credit_review_date::text AS credit_review_on
       FROM customers
      WHERE id=$1 AND store_id=$2 AND (company_id IS NULL OR company_id=$3)
      ${forUpdate ? "FOR UPDATE" : ""}`,
    [id, ctx.storeId, ctx.companyId],
  );
  if (rows.length === 0) throw new CustomerError(`cliente ${id} no existe`, 404);
  return rows[0];
}

async function activeTerms(c: SqlClient, customerId: number) {
  const { rows } = await c.query(
    `SELECT *, valid_from::text AS valid_from_on FROM customer_pricing_terms WHERE customer_id=$1 AND is_active LIMIT 1`,
    [customerId],
  );
  return rows[0] ?? null;
}

export interface CustomerListFilters {
  search?: string;
  /** active | inactive | all */
  status?: string;
  /** none | active | suspended | blocked | pending | overdue */
  credit?: string;
}

export async function listCustomers(c: SqlClient, ctx: CustomerCtx, f: CustomerListFilters = {}) {
  const params: unknown[] = [ctx.companyId, ctx.storeId];
  const where: string[] = [`c.store_id=$2`, `(c.company_id IS NULL OR c.company_id=$1)`];
  if (f.status === "active") where.push(`c.is_active IS NOT FALSE`);
  if (f.status === "inactive") where.push(`c.is_active = false`);
  if (f.search?.trim()) {
    params.push(`%${f.search.trim()}%`);
    const text = params.length;
    const clauses = ["name", "legal_name", "trade_name", "code", "phone", "email"].map((col) => `c.${col} ILIKE $${text}`);
    // El RNC se guarda sin guiones: "1-01-01063-2" también debe encontrarlo.
    const digits = onlyDigits(f.search);
    if (digits) {
      params.push(`%${digits}%`);
      clauses.push(`c.rnc LIKE $${params.length}`);
    }
    where.push(`(${clauses.join(" OR ")})`);
  }
  if (f.credit === "pending") where.push(`pending.id IS NOT NULL`);
  else if (f.credit === "overdue") where.push(`coalesce(ar.overdue,0) > 0`);
  else if (f.credit && ["none", "active", "suspended", "blocked"].includes(f.credit)) {
    params.push(f.credit);
    where.push(`c.credit_status=$${params.length}`);
  }

  const { rows } = await c.query(
    `WITH ar AS (
       SELECT customer_id,
              sum(balance) AS balance,
              sum(balance) FILTER (WHERE due_date < ${TODAY}) AS overdue,
              max(${TODAY} - due_date) FILTER (WHERE due_date < ${TODAY}) AS max_days_overdue
         FROM ar_open_items
        WHERE company_id=$1 AND status NOT IN ('paid','cancelled') AND customer_id IS NOT NULL
        GROUP BY customer_id
     )
     SELECT c.id, c.code, c.name, c.legal_name AS "legalName", c.trade_name AS "tradeName",
            c.person_type AS "personType", c.tax_id_type AS "taxIdType", c.rnc, c.foreign_id AS "foreignId",
            c.taxpayer_type AS "taxpayerType", c.default_ncf_type AS "defaultNcfType",
            c.phone, c.email, c.address, c.province, c.is_active AS "isActive",
            c.credit_status AS "creditStatus", c.currency,
            u.name AS "salesRepName", ct.name AS "customerTypeName",
            coalesce(t.credit_limit, 0)::text AS "creditLimit", coalesce(t.credit_days, 0) AS "creditDays",
            coalesce(ar.balance, 0)::text AS balance, coalesce(ar.overdue, 0)::text AS overdue,
            ar.max_days_overdue AS "maxDaysOverdue",
            pending.id AS "pendingApplicationId", pending.requested_limit::text AS "pendingRequestedLimit"
       FROM customers c
       LEFT JOIN customer_pricing_terms t ON t.customer_id=c.id AND t.is_active
       LEFT JOIN ar ON ar.customer_id=c.id
       LEFT JOIN users u ON u.id=c.sales_rep_user_id
       LEFT JOIN customer_types ct ON ct.id=c.customer_type_id
       LEFT JOIN customer_credit_applications pending ON pending.customer_id=c.id AND pending.status='pending'
      WHERE ${where.join(" AND ")}
      ORDER BY c.name
      LIMIT 2000`,
    params,
  );
  return rows.map((r: any) => ({
    ...r,
    available: r.creditStatus === "active" ? Math.max(0, Number(r.creditLimit) - Number(r.balance)).toFixed(2) : "0.00",
  }));
}

/** Límite, uso y morosidad de la línea en esta empresa. */
export async function creditSummary(c: SqlClient, ctx: CustomerCtx, customerId: number) {
  const customer = await loadCustomer(c, ctx, customerId);
  const terms = await activeTerms(c, customerId);
  const { rows } = await c.query(
    `SELECT coalesce(sum(balance),0)::text AS used,
            coalesce(sum(balance) FILTER (WHERE due_date < ${TODAY}),0)::text AS overdue,
            max(${TODAY} - due_date) FILTER (WHERE due_date < ${TODAY}) AS max_days_overdue,
            count(*) AS open_items,
            min(due_date) FILTER (WHERE due_date >= ${TODAY})::text AS next_due
       FROM ar_open_items
      WHERE company_id=$1 AND customer_id=$2 AND status NOT IN ('paid','cancelled')`,
    [ctx.companyId, customerId],
  );
  const activity = await c.query(
    `SELECT (SELECT max(document_date)::text FROM fiscal_documents
              WHERE company_id=$1 AND customer_id=$2 AND doc_type='invoice' AND status='issued') AS last_invoice,
            (SELECT coalesce(sum(total),0)::text FROM fiscal_documents
              WHERE company_id=$1 AND customer_id=$2 AND doc_type='invoice' AND status='issued'
                AND document_date > ${TODAY} - 365) AS sales_12m,
            (SELECT max(receipt_date)::text FROM ar_receipts WHERE company_id=$1 AND customer_id=$2) AS last_receipt`,
    [ctx.companyId, customerId],
  );
  const limit = terms ? String(terms.credit_limit) : "0";
  const used = rows[0].used as string;
  const status = customer.credit_status as CreditLineStatus;
  return {
    status,
    limit,
    days: terms ? Number(terms.credit_days) : 0,
    gracePeriodDays: terms ? Number(terms.grace_period_days) : 0,
    used,
    available: status === "active" ? Math.max(0, Number(limit) - Number(used)).toFixed(2) : "0.00",
    overdue: rows[0].overdue as string,
    maxDaysOverdue: rows[0].max_days_overdue === null ? null : Number(rows[0].max_days_overdue),
    openItems: Number(rows[0].open_items),
    nextDue: rows[0].next_due as string | null,
    lastInvoice: activity.rows[0].last_invoice as string | null,
    lastReceipt: activity.rows[0].last_receipt as string | null,
    sales12m: activity.rows[0].sales_12m as string,
  };
}

/** La ficha completa: datos, condiciones, crédito, solicitudes, bitácora y contactos. */
export async function getCustomer(c: SqlClient, ctx: CustomerCtx, id: number) {
  const row = await loadCustomer(c, ctx, id);
  const terms = await activeTerms(c, id);
  const people = await c.query(
    `SELECT id, name FROM users WHERE id = ANY($1::int[])`,
    [[row.sales_rep_user_id, row.credit_approved_by, row.created_by, row.updated_by].filter(Boolean)],
  );
  const nameOf = (uid: number | null) => people.rows.find((p: any) => p.id === uid)?.name ?? null;
  const applications = await c.query(
    `SELECT a.id, a.requested_limit::text AS "requestedLimit", a.requested_days AS "requestedDays",
            a.approved_limit::text AS "approvedLimit", a.approved_days AS "approvedDays", a.status,
            a.justification, a.guarantee_type AS "guaranteeType", a.guarantee_amount::text AS "guaranteeAmount",
            a.guarantee_notes AS "guaranteeNotes", a.references_notes AS "referencesNotes",
            a.review_date::text AS "reviewDate", a.approval_request_id AS "approvalRequestId",
            a.requested_by AS "requestedBy", rq.name AS "requestedByName",
            a.resolved_by AS "resolvedBy", rs.name AS "resolvedByName",
            a.resolution_comment AS "resolutionComment", a.created_at AS "createdAt", a.resolved_at AS "resolvedAt",
            ar.approver_role AS "approverRole", ar.required_approvals AS "requiredApprovals",
            ar.received_approvals AS "receivedApprovals"
       FROM customer_credit_applications a
       LEFT JOIN users rq ON rq.id=a.requested_by
       LEFT JOIN users rs ON rs.id=a.resolved_by
       LEFT JOIN approval_requests ar ON ar.id=a.approval_request_id
      WHERE a.customer_id=$1
      ORDER BY a.created_at DESC, a.id DESC`,
    [id],
  );
  const events = await c.query(
    `SELECT e.id, e.event, e.from_status AS "fromStatus", e.to_status AS "toStatus",
            e.limit_before::text AS "limitBefore", e.limit_after::text AS "limitAfter",
            e.days_before AS "daysBefore", e.days_after AS "daysAfter",
            e.reason, e.application_id AS "applicationId", u.name AS "actorName", e.created_at AS "createdAt"
       FROM customer_credit_events e LEFT JOIN users u ON u.id=e.actor_user_id
      WHERE e.customer_id=$1 ORDER BY e.created_at DESC, e.id DESC`,
    [id],
  );
  const contacts = await c.query(
    `SELECT id, name, role, email, phone, mobile, is_primary AS "isPrimary",
            receives_invoices AS "receivesInvoices", receives_statements AS "receivesStatements", notes
       FROM customer_contacts WHERE customer_id=$1 AND is_active ORDER BY is_primary DESC, name`,
    [id],
  );

  return {
    customer: {
      id: row.id,
      code: row.code,
      name: row.name,
      personType: row.person_type,
      taxIdType: row.tax_id_type,
      rnc: row.rnc,
      foreignId: row.foreign_id,
      legalName: row.legal_name ?? row.name,
      tradeName: row.trade_name,
      taxpayerType: row.taxpayer_type,
      defaultNcfType: row.default_ncf_type,
      itbisExempt: row.itbis_exempt,
      exemptionReference: row.exemption_reference,
      economicActivity: row.economic_activity,
      dgiiStatus: row.dgii_status,
      dgiiVerifiedAt: row.dgii_verified_on,
      phone: row.phone,
      phoneAlt: row.phone_alt,
      email: row.email,
      website: row.website,
      address: row.address,
      sector: row.sector,
      municipality: row.municipality,
      province: row.province,
      postalCode: row.postal_code,
      country: row.country,
      customerTypeId: row.customer_type_id,
      salesRepUserId: row.sales_rep_user_id,
      salesRepName: nameOf(row.sales_rep_user_id),
      currency: row.currency,
      preferredPaymentMethod: row.preferred_payment_method,
      isActive: row.is_active !== false,
      notes: row.notes,
      creditStatusReason: row.credit_status_reason,
      creditStatusChangedAt: row.credit_status_changed_at,
      creditApprovedByName: nameOf(row.credit_approved_by),
      creditApprovedAt: row.credit_approved_at,
      creditReviewDate: row.credit_review_on,
      createdAt: row.created_at,
      createdByName: nameOf(row.created_by),
      updatedAt: row.updated_at,
      updatedByName: nameOf(row.updated_by),
    },
    terms: {
      priceListId: terms?.price_list_id ?? null,
      additionalDiscountPercent: Number(terms?.additional_discount_percent ?? 0),
      earlyPaymentDiscountPercent: Number(terms?.early_payment_discount_percent ?? 0),
      earlyPaymentDays: terms?.early_payment_days ?? null,
      itbisRetentionPercent: Number(terms?.itbis_retention_percent ?? 0),
      isrRetentionPercent: Number(terms?.isr_retention_percent ?? 0),
      requiresPurchaseOrder: terms?.requires_purchase_order ?? false,
      gracePeriodDays: Number(terms?.grace_period_days ?? 0),
      notes: terms?.notes ?? null,
      validFrom: terms?.valid_from_on ?? null,
    },
    credit: await creditSummary(c, ctx, id),
    applications: applications.rows,
    events: events.rows,
    contacts: contacts.rows,
  };
}

/** Catálogos que la ficha necesita para sus listas desplegables. */
export async function customerLookups(c: SqlClient, ctx: CustomerCtx) {
  const [priceLists, customerTypes, salesReps] = await Promise.all([
    c.query(
      `SELECT id, code, name, tier FROM price_lists WHERE store_id=$1 AND is_active ORDER BY name`,
      [ctx.storeId],
    ),
    c.query(
      `SELECT id, name, discount_percentage::text AS "discountPercentage" FROM customer_types
        WHERE store_id=$1 AND is_active IS NOT FALSE ORDER BY sort_order, name`,
      [ctx.storeId],
    ),
    c.query(
      `SELECT u.id, u.name, u.role FROM users u JOIN user_companies uc ON uc.user_id=u.id
        WHERE uc.company_id=$1 AND coalesce(u.status,'active')='active' ORDER BY u.name`,
      [ctx.companyId],
    ),
  ]);
  return { priceLists: priceLists.rows, customerTypes: customerTypes.rows, salesReps: salesReps.rows };
}

/** Estado de cuenta: antigüedad, partidas abiertas, comprobantes y cobros. */
export async function customerStatement(c: SqlClient, ctx: CustomerCtx, customerId: number) {
  await loadCustomer(c, ctx, customerId);
  const aging = await c.query(
    `SELECT coalesce(sum(balance) FILTER (WHERE due_date >= ${TODAY}),0)::text AS current,
            coalesce(sum(balance) FILTER (WHERE due_date < ${TODAY} AND due_date >= ${TODAY} - 30),0)::text AS d1_30,
            coalesce(sum(balance) FILTER (WHERE due_date < ${TODAY} - 30 AND due_date >= ${TODAY} - 60),0)::text AS d31_60,
            coalesce(sum(balance) FILTER (WHERE due_date < ${TODAY} - 60 AND due_date >= ${TODAY} - 90),0)::text AS d61_90,
            coalesce(sum(balance) FILTER (WHERE due_date < ${TODAY} - 90),0)::text AS d90_plus,
            coalesce(sum(balance),0)::text AS total
       FROM ar_open_items
      WHERE company_id=$1 AND customer_id=$2 AND status NOT IN ('paid','cancelled')`,
    [ctx.companyId, customerId],
  );
  const openItems = await c.query(
    `SELECT oi.id, oi.issue_date::text AS "issueDate", oi.due_date::text AS "dueDate", oi.currency,
            oi.original_amount::text AS "originalAmount", oi.balance::text AS balance, oi.status,
            d.ncf, d.ncf_type AS "ncfType",
            GREATEST(${TODAY} - oi.due_date, 0) AS "daysOverdue"
       FROM ar_open_items oi LEFT JOIN fiscal_documents d ON d.id=oi.document_id
      WHERE oi.company_id=$1 AND oi.customer_id=$2 AND oi.status NOT IN ('paid','cancelled')
      ORDER BY oi.due_date, oi.id`,
    [ctx.companyId, customerId],
  );
  const documents = await c.query(
    `SELECT id, doc_type AS "docType", ncf, ncf_type AS "ncfType", document_date::text AS "documentDate",
            due_date::text AS "dueDate", total::text AS total, status, payment_method AS "paymentMethod"
       FROM fiscal_documents
      WHERE company_id=$1 AND customer_id=$2 AND doc_type IN ('invoice','credit_note','debit_note')
      ORDER BY document_date DESC, id DESC LIMIT 200`,
    [ctx.companyId, customerId],
  );
  const receipts = await c.query(
    `SELECT id, receipt_date::text AS "receiptDate", amount::text AS amount, method, reference, currency
       FROM ar_receipts WHERE company_id=$1 AND customer_id=$2
      ORDER BY receipt_date DESC, id DESC LIMIT 200`,
    [ctx.companyId, customerId],
  );
  return { aging: aging.rows[0], openItems: openItems.rows, documents: documents.rows, receipts: receipts.rows };
}

// ── Escritura: ficha y condiciones ───────────────────────────────────────────

async function nextCustomerCode(c: SqlClient, storeId: number): Promise<string> {
  // Serializa la numeración por tienda: dos altas simultáneas no toman el mismo código.
  await c.query(`SELECT pg_advisory_xact_lock(hashtext('customer_code'), $1)`, [storeId]);
  const { rows } = await c.query(
    `SELECT coalesce(max(substring(code from '^CL-(\\d+)$')::int), 0) + 1 AS n
       FROM customers WHERE store_id=$1 AND code ~ '^CL-\\d+$'`,
    [storeId],
  );
  return `CL-${String(rows[0].n).padStart(6, "0")}`;
}

function normalizeIdentity(input: CustomerInput) {
  const isDominican = input.taxIdType === "rnc" || input.taxIdType === "cedula";
  return {
    rnc: isDominican ? onlyDigits(input.rnc) || null : null,
    foreignId: !isDominican ? blank(input.foreignId) : null,
  };
}

async function assertFiscalIdentity(
  c: SqlClient,
  ctx: CustomerCtx,
  input: CustomerInput,
  current: { id: number; rnc: string | null } | null,
) {
  const { rnc, foreignId } = normalizeIdentity(input);
  const check = checkFiscalIdentity({ ...input, rnc, foreignId });
  if (check.errors.length > 0) {
    throw new CustomerError(check.errors[0], 422, "fiscal_identity", check);
  }
  // Un RNC compartido se confirma al registrarlo, no en cada guardado posterior.
  const selfId = current?.id ?? null;
  if (rnc && rnc !== current?.rnc && !input.confirmDuplicateTaxId) {
    const dup = await c.query(
      `SELECT id, code, name FROM customers
        WHERE store_id=$1 AND rnc=$2 AND (company_id IS NULL OR company_id=$3) AND ($4::int IS NULL OR id <> $4)
        LIMIT 1`,
      [ctx.storeId, rnc, ctx.companyId, selfId],
    );
    if (dup.rows.length > 0) {
      const d = dup.rows[0];
      throw new CustomerError(
        `el RNC/cédula ${rnc} ya está registrado en ${d.code ?? ""} ${d.name}`.trim(),
        409,
        "duplicate_tax_id",
        d,
      );
    }
  }
  if (input.customerTypeId) {
    const t = await c.query(`SELECT 1 FROM customer_types WHERE id=$1 AND store_id=$2`, [input.customerTypeId, ctx.storeId]);
    if (t.rows.length === 0) throw new CustomerError("el tipo de cliente no existe", 422);
  }
  if (input.terms.priceListId) {
    const t = await c.query(`SELECT 1 FROM price_lists WHERE id=$1 AND store_id=$2`, [input.terms.priceListId, ctx.storeId]);
    if (t.rows.length === 0) throw new CustomerError("la lista de precios no existe", 422);
  }
  return { rnc, foreignId };
}

/**
 * Deja vigentes las condiciones indicadas. Si nada cambió no crea versión; si
 * cambió algo, cierra la fila vigente e inserta otra. Límite y plazo de crédito
 * se copian de la vigente, o se pasan explícitos cuando los fija una aprobación.
 */
async function writeTerms(
  c: SqlClient,
  storeId: number,
  customerId: number,
  patch: Partial<CommercialTermsInput> & { creditLimit?: number; creditDays?: number },
) {
  const current = await activeTerms(c, customerId);
  const next = {
    price_list_id: patch.priceListId !== undefined ? patch.priceListId : current?.price_list_id ?? null,
    additional_discount_percent: patch.additionalDiscountPercent ?? Number(current?.additional_discount_percent ?? 0),
    credit_days: patch.creditDays ?? Number(current?.credit_days ?? 0),
    credit_limit: patch.creditLimit ?? Number(current?.credit_limit ?? 0),
    early_payment_discount_percent: patch.earlyPaymentDiscountPercent ?? Number(current?.early_payment_discount_percent ?? 0),
    early_payment_days: patch.earlyPaymentDays !== undefined ? patch.earlyPaymentDays : current?.early_payment_days ?? null,
    itbis_retention_percent: patch.itbisRetentionPercent ?? Number(current?.itbis_retention_percent ?? 0),
    isr_retention_percent: patch.isrRetentionPercent ?? Number(current?.isr_retention_percent ?? 0),
    requires_purchase_order: patch.requiresPurchaseOrder ?? current?.requires_purchase_order ?? false,
    grace_period_days: patch.gracePeriodDays ?? Number(current?.grace_period_days ?? 0),
    notes: patch.notes !== undefined ? blank(patch.notes) : current?.notes ?? null,
  };
  if (current) {
    // numeric llega como texto ("12.50"); se compara por valor, no por forma.
    const norm = (v: unknown) =>
      v === null || v === undefined ? null : typeof v === "boolean" || Number.isNaN(Number(v)) ? v : Number(v);
    const same = (Object.keys(next) as (keyof typeof next)[]).every((k) => norm(next[k]) === norm(current[k]));
    if (same) return current.id as number;
    await c.query(
      `UPDATE customer_pricing_terms SET is_active=false, valid_to=${TODAY}, updated_at=now() WHERE id=$1`,
      [current.id],
    );
  }
  const { rows } = await c.query(
    `INSERT INTO customer_pricing_terms
       (customer_id, store_id, price_list_id, additional_discount_percent, credit_days, credit_limit,
        early_payment_discount_percent, early_payment_days, itbis_retention_percent, isr_retention_percent,
        requires_purchase_order, grace_period_days, notes, valid_from, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,${TODAY},true)
     RETURNING id`,
    [
      customerId, storeId, next.price_list_id, String(next.additional_discount_percent), next.credit_days,
      String(next.credit_limit), String(next.early_payment_discount_percent), next.early_payment_days,
      String(next.itbis_retention_percent), String(next.isr_retention_percent), next.requires_purchase_order,
      next.grace_period_days, next.notes,
    ],
  );
  return rows[0].id as number;
}

function customerColumns(input: CustomerInput, identity: { rnc: string | null; foreignId: string | null }) {
  const legalName = input.legalName.trim();
  return {
    name: blank(input.tradeName) ?? legalName,
    person_type: input.personType,
    tax_id_type: input.taxIdType ?? null,
    rnc: identity.rnc,
    foreign_id: identity.foreignId,
    legal_name: legalName,
    trade_name: blank(input.tradeName),
    taxpayer_type: input.taxpayerType,
    default_ncf_type: blank(input.defaultNcfType),
    itbis_exempt: input.itbisExempt,
    exemption_reference: input.itbisExempt ? blank(input.exemptionReference) : null,
    economic_activity: blank(input.economicActivity),
    dgii_status: blank(input.dgiiStatus),
    dgii_verified_at: blank(input.dgiiVerifiedAt),
    phone: input.phone.trim(),
    phone_alt: blank(input.phoneAlt),
    email: blank(input.email)?.toLowerCase() ?? null,
    website: blank(input.website),
    address: blank(input.address),
    sector: blank(input.sector),
    municipality: blank(input.municipality),
    province: blank(input.province),
    postal_code: blank(input.postalCode),
    country: input.country || "DO",
    customer_type_id: input.customerTypeId ?? null,
    sales_rep_user_id: input.salesRepUserId ?? null,
    currency: input.currency || "DOP",
    preferred_payment_method: blank(input.preferredPaymentMethod),
    is_active: input.isActive,
    notes: blank(input.notes),
  };
}

/** Traduce las violaciones de unicidad del legado (teléfono, correo, código) a un mensaje. */
function mapUniqueViolation(err: any): never {
  if (err?.code === "23505") {
    const detail = `${err.constraint ?? ""} ${err.detail ?? ""}`;
    if (/phone/.test(detail)) throw new CustomerError("ya existe un cliente con ese teléfono", 409, "duplicate_phone");
    if (/email/.test(detail)) throw new CustomerError("ya existe un cliente con ese correo", 409, "duplicate_email");
    if (/code/.test(detail)) throw new CustomerError("ya existe un cliente con ese código", 409, "duplicate_code");
  }
  throw err;
}

export async function createCustomer(c: SqlClient, ctx: CustomerCtx, input: CustomerInput) {
  const identity = await assertFiscalIdentity(c, ctx, input, null);
  const cols = customerColumns(input, identity);
  const code = blank(input.code) ?? (await nextCustomerCode(c, ctx.storeId));
  const entries = Object.entries({ ...cols, code, store_id: ctx.storeId, company_id: ctx.companyId, created_by: ctx.userId, updated_by: ctx.userId });
  let id: number;
  try {
    const { rows } = await c.query(
      `INSERT INTO customers (${entries.map(([k]) => k).join(", ")})
       VALUES (${entries.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
      entries.map(([, v]) => v),
    );
    id = rows[0].id;
  } catch (err) {
    mapUniqueViolation(err);
  }
  await writeTerms(c, ctx.storeId, id!, { ...input.terms, creditLimit: 0, creditDays: 0 });
  return { id: id! };
}

export async function updateCustomer(c: SqlClient, ctx: CustomerCtx, id: number, input: CustomerInput) {
  const current = await loadCustomer(c, ctx, id, true);
  const identity = await assertFiscalIdentity(c, ctx, input, { id, rnc: current.rnc });
  const cols = { ...customerColumns(input, identity), code: blank(input.code) ?? current.code, updated_by: ctx.userId };
  const entries = Object.entries(cols);
  try {
    await c.query(
      `UPDATE customers SET ${entries.map(([k], i) => `${k}=$${i + 2}`).join(", ")}, updated_at=now() WHERE id=$1`,
      [id, ...entries.map(([, v]) => v)],
    );
  } catch (err) {
    mapUniqueViolation(err);
  }
  // Nunca desde la ficha: el límite y el plazo sólo los mueve una aprobación.
  const { creditLimit: _l, creditDays: _d, ...terms } = input.terms as any;
  await writeTerms(c, ctx.storeId, id, terms);
  return { id };
}

/**
 * Borra un cliente sin historia. Con comprobantes, pedidos o cuentas por cobrar
 * la base lo impide (llave foránea) y la respuesta sugiere inactivarlo: un
 * cliente con movimientos es parte del registro contable.
 */
export async function deleteCustomer(c: SqlClient, ctx: CustomerCtx, id: number) {
  await loadCustomer(c, ctx, id, true);
  const used = await c.query(
    `SELECT (SELECT count(*) FROM fiscal_documents WHERE customer_id=$1)
          + (SELECT count(*) FROM ar_open_items WHERE customer_id=$1)
          + (SELECT count(*) FROM orders WHERE customer_id=$1) AS n`,
    [id],
  );
  if (Number(used.rows[0].n) > 0) {
    throw new CustomerError("el cliente tiene movimientos registrados; inactívelo en lugar de eliminarlo", 409, "has_movements");
  }
  await c.query(`DELETE FROM loyalty_points_transactions WHERE customer_id=$1`, [id]);
  await c.query(`DELETE FROM customer_loyalty_balance WHERE customer_id=$1`, [id]);
  await c.query(`DELETE FROM customer_history WHERE customer_id=$1`, [id]);
  try {
    await c.query(`DELETE FROM customers WHERE id=$1`, [id]);
  } catch (err: any) {
    if (err?.code === "23503") {
      throw new CustomerError("el cliente está referenciado por otros registros; inactívelo en lugar de eliminarlo", 409, "has_movements");
    }
    throw err;
  }
}

// ── Contactos ────────────────────────────────────────────────────────────────

export async function saveContact(c: SqlClient, ctx: CustomerCtx, customerId: number, contactId: number | null, input: ContactInput) {
  await loadCustomer(c, ctx, customerId);
  if (input.isPrimary) {
    await c.query(`UPDATE customer_contacts SET is_primary=false WHERE customer_id=$1 AND id <> coalesce($2, 0)`, [customerId, contactId]);
  }
  const values = [
    input.name.trim(), input.role, blank(input.email), blank(input.phone), blank(input.mobile),
    input.isPrimary, input.receivesInvoices, input.receivesStatements, blank(input.notes),
  ];
  if (contactId) {
    const { rowCount } = await c.query(
      `UPDATE customer_contacts SET name=$3, role=$4, email=$5, phone=$6, mobile=$7, is_primary=$8,
              receives_invoices=$9, receives_statements=$10, notes=$11
        WHERE id=$1 AND customer_id=$2 AND is_active`,
      [contactId, customerId, ...values],
    );
    if (!rowCount) throw new CustomerError(`contacto ${contactId} no existe`, 404);
    return { id: contactId };
  }
  const { rows } = await c.query(
    `INSERT INTO customer_contacts (customer_id, name, role, email, phone, mobile, is_primary,
            receives_invoices, receives_statements, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [customerId, ...values],
  );
  return { id: rows[0].id as number };
}

export async function removeContact(c: SqlClient, ctx: CustomerCtx, customerId: number, contactId: number) {
  await loadCustomer(c, ctx, customerId);
  await c.query(`UPDATE customer_contacts SET is_active=false, is_primary=false WHERE id=$1 AND customer_id=$2`, [contactId, customerId]);
}

// ── Crédito ──────────────────────────────────────────────────────────────────

async function logCreditEvent(
  c: SqlClient,
  e: {
    customerId: number; storeId: number; event: string; actorUserId: number | null;
    fromStatus?: string | null; toStatus?: string | null;
    limitBefore?: string | number | null; limitAfter?: string | number | null;
    daysBefore?: number | null; daysAfter?: number | null;
    applicationId?: number | null; reason?: string | null;
  },
) {
  await c.query(
    `INSERT INTO customer_credit_events
       (customer_id, store_id, event, from_status, to_status, limit_before, limit_after,
        days_before, days_after, application_id, reason, actor_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      e.customerId, e.storeId, e.event, e.fromStatus ?? null, e.toStatus ?? null,
      e.limitBefore === undefined || e.limitBefore === null ? null : String(e.limitBefore),
      e.limitAfter === undefined || e.limitAfter === null ? null : String(e.limitAfter),
      e.daysBefore ?? null, e.daysAfter ?? null, e.applicationId ?? null, e.reason ?? null, e.actorUserId,
    ],
  );
}

/**
 * Abre una solicitud de crédito (o de cambio de límite) y la envía al motor de
 * aprobaciones. La línea vigente, si la hay, sigue rigiendo mientras se evalúa.
 */
export async function requestCredit(c: SqlClient, ctx: CustomerCtx, customerId: number, input: CreditRequestInput) {
  const customer = await loadCustomer(c, ctx, customerId, true);
  if (customer.is_active === false) throw new CustomerError("el cliente está inactivo", 422);
  if (!customer.rnc) {
    throw new CustomerError("para otorgar crédito el cliente debe estar identificado con RNC o cédula", 422, "missing_tax_id");
  }
  if (customer.credit_status === "blocked") {
    throw new CustomerError("la línea de crédito está bloqueada; debe reactivarse antes de solicitar un cambio", 422);
  }
  if (!(input.requestedLimit > 0)) throw new CustomerError("el monto solicitado debe ser mayor que cero", 422);
  if (input.requestedDays < 0 || input.requestedDays > 365) throw new CustomerError("el plazo debe estar entre 0 y 365 días", 422);
  if (input.justification.trim().length < 10) throw new CustomerError("explique la solicitud (al menos 10 caracteres)", 422);
  if (input.guaranteeType !== "ninguna" && !(Number(input.guaranteeAmount ?? 0) > 0) && !blank(input.guaranteeNotes)) {
    throw new CustomerError("describa la garantía o indique su monto", 422);
  }

  const pending = await c.query(
    `SELECT id FROM customer_credit_applications WHERE customer_id=$1 AND status='pending'`,
    [customerId],
  );
  if (pending.rows.length > 0) {
    throw new CustomerError("ya hay una solicitud de crédito en evaluación para este cliente", 409, "pending_application");
  }

  const terms = await activeTerms(c, customerId);
  const { rows } = await c.query(
    `INSERT INTO customer_credit_applications
       (customer_id, store_id, requested_limit, requested_days, justification, guarantee_type,
        guarantee_amount, guarantee_notes, references_notes, review_date, requested_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [
      customerId, ctx.storeId, input.requestedLimit.toFixed(2), input.requestedDays, input.justification.trim(),
      input.guaranteeType, input.guaranteeAmount ? input.guaranteeAmount.toFixed(2) : null,
      blank(input.guaranteeNotes), blank(input.referencesNotes), blank(input.reviewDate), ctx.userId,
    ],
  );
  const applicationId = rows[0].id as number;
  const approval = await requestApproval(c as any, {
    storeId: ctx.storeId,
    documentType: CREDIT_DOCUMENT_TYPE,
    documentId: applicationId,
    documentRef: `${customer.code ?? ""} ${customer.name}`.trim(),
    amount: input.requestedLimit,
    currency: customer.currency ?? "DOP",
    requestedBy: ctx.userId,
    reason: `Línea de crédito de RD$ ${input.requestedLimit.toLocaleString("en-US", { minimumFractionDigits: 2 })} a ${input.requestedDays} días. ${input.justification.trim()}`,
  });
  await c.query(`UPDATE customer_credit_applications SET approval_request_id=$2 WHERE id=$1`, [applicationId, approval.id]);
  await logCreditEvent(c, {
    customerId, storeId: ctx.storeId, event: "requested", actorUserId: ctx.userId,
    fromStatus: customer.credit_status, toStatus: customer.credit_status,
    limitBefore: terms?.credit_limit ?? 0, limitAfter: input.requestedLimit.toFixed(2),
    daysBefore: terms ? Number(terms.credit_days) : 0, daysAfter: input.requestedDays,
    applicationId, reason: input.justification.trim(),
  });
  return { applicationId, approvalRequestId: approval.id };
}

async function loadApplication(c: SqlClient, ctx: CustomerCtx | null, applicationId: number) {
  const { rows } = await c.query(
    `SELECT * FROM customer_credit_applications WHERE id=$1 ${ctx ? "AND store_id=$2" : ""} FOR UPDATE`,
    ctx ? [applicationId, ctx.storeId] : [applicationId],
  );
  if (rows.length === 0) throw new CustomerError(`solicitud de crédito ${applicationId} no existe`, 404);
  return rows[0];
}

/** Pone en vigor una solicitud aprobada: límite, plazo, estado de la línea y bitácora. */
async function applyApprovedApplication(
  c: SqlClient,
  app: any,
  approved: { limit: number; days: number; actorUserId: number; comment: string | null },
) {
  const { rows } = await c.query(`SELECT * FROM customers WHERE id=$1 FOR UPDATE`, [app.customer_id]);
  const customer = rows[0];
  const before = await activeTerms(c, app.customer_id);

  await c.query(
    `UPDATE customer_credit_applications
        SET status='approved', approved_limit=$2, approved_days=$3, resolved_by=$4, resolved_at=now(),
            resolution_comment=$5
      WHERE id=$1`,
    [app.id, approved.limit.toFixed(2), approved.days, approved.actorUserId, approved.comment],
  );
  await writeTerms(c, app.store_id, app.customer_id, { creditLimit: approved.limit, creditDays: approved.days });

  // Aprobar un límite no levanta una suspensión: eso es una decisión aparte.
  const nextStatus = customer.credit_status === "none" ? "active" : customer.credit_status;
  await c.query(
    `UPDATE customers
        SET credit_status=$2, credit_approved_by=$3, credit_approved_at=now(),
            credit_review_date=(SELECT review_date FROM customer_credit_applications WHERE id=$4),
            credit_status_changed_at = CASE WHEN credit_status <> $2 THEN now() ELSE credit_status_changed_at END,
            credit_status_reason = CASE WHEN credit_status <> $2 THEN $5 ELSE credit_status_reason END,
            updated_at=now()
      WHERE id=$1`,
    [app.customer_id, nextStatus, approved.actorUserId, app.id, approved.comment ?? "Línea aprobada"],
  );
  await logCreditEvent(c, {
    customerId: app.customer_id, storeId: app.store_id, event: "approved", actorUserId: approved.actorUserId,
    fromStatus: customer.credit_status, toStatus: nextStatus,
    limitBefore: before?.credit_limit ?? 0, limitAfter: approved.limit.toFixed(2),
    daysBefore: before ? Number(before.credit_days) : 0, daysAfter: approved.days,
    applicationId: app.id, reason: approved.comment,
  });
}

/**
 * Aprueba o rechaza desde la ficha del cliente. El aprobador puede otorgar un
 * límite menor o igual al solicitado — nunca mayor, porque la regla que eligió
 * al aprobador se decidió por el monto solicitado.
 */
export async function resolveCreditApplication(
  c: SqlClient,
  ctx: CustomerCtx,
  applicationId: number,
  input: { action: "approve" | "reject"; approvedLimit?: number; approvedDays?: number; comment?: string | null },
) {
  const app = await loadApplication(c, ctx, applicationId);
  await loadCustomer(c, ctx, app.customer_id);
  if (app.status !== "pending") throw new CustomerError(`la solicitud ya está ${app.status}`, 409);
  if (!app.approval_request_id) throw new CustomerError("la solicitud no tiene aprobación asociada", 422);
  const comment = blank(input.comment);

  if (input.action === "reject") {
    if (!comment) throw new CustomerError("indique el motivo del rechazo", 422);
    await resolveApprovalOrExplain(c, app.approval_request_id, ctx.userId, "reject", comment);
    await c.query(
      `UPDATE customer_credit_applications SET status='rejected', resolved_by=$2, resolved_at=now(), resolution_comment=$3 WHERE id=$1`,
      [app.id, ctx.userId, comment],
    );
    await logCreditEvent(c, {
      customerId: app.customer_id, storeId: app.store_id, event: "rejected", actorUserId: ctx.userId,
      applicationId: app.id, reason: comment,
    });
    return { status: "rejected" as const };
  }

  const limit = input.approvedLimit ?? Number(app.requested_limit);
  const days = input.approvedDays ?? Number(app.requested_days);
  if (!(limit > 0)) throw new CustomerError("el límite aprobado debe ser mayor que cero", 422);
  if (limit > Number(app.requested_limit)) {
    throw new CustomerError("el límite aprobado no puede superar el solicitado; registre una nueva solicitud", 422);
  }
  if (days < 0 || days > 365) throw new CustomerError("el plazo aprobado debe estar entre 0 y 365 días", 422);

  const approval = await resolveApprovalOrExplain(c, app.approval_request_id, ctx.userId, "approve", comment ?? undefined);
  if (approval.status !== "approved") {
    // Regla de varias firmas: esta aprobación cuenta, la línea espera las demás.
    await logCreditEvent(c, {
      customerId: app.customer_id, storeId: app.store_id, event: "approval_step", actorUserId: ctx.userId,
      applicationId: app.id, reason: `Aprobación ${approval.receivedApprovals} de ${approval.requiredApprovals}${comment ? `: ${comment}` : ""}`,
    });
    return { status: "pending" as const, receivedApprovals: approval.receivedApprovals, requiredApprovals: approval.requiredApprovals };
  }
  await applyApprovedApplication(c, app, { limit, days, actorUserId: ctx.userId, comment });
  return { status: "approved" as const };
}

/** Los errores del motor (segregación de funciones, rol) son del usuario, no del servidor. */
async function resolveApprovalOrExplain(
  c: SqlClient, requestId: number, userId: number, action: "approve" | "reject" | "cancel", comment?: string,
) {
  try {
    return await resolveApproval(c as any, requestId, userId, action, comment);
  } catch (err: any) {
    throw new CustomerError(err?.message ?? "no se pudo resolver la aprobación", 403, "approval_denied");
  }
}

export async function cancelCreditApplication(c: SqlClient, ctx: CustomerCtx, applicationId: number, reason: string | null) {
  const app = await loadApplication(c, ctx, applicationId);
  await loadCustomer(c, ctx, app.customer_id);
  if (app.status !== "pending") throw new CustomerError(`la solicitud ya está ${app.status}`, 409);
  if (app.approval_request_id) {
    await resolveApprovalOrExplain(c, app.approval_request_id, ctx.userId, "cancel", reason ?? undefined);
  }
  await c.query(
    `UPDATE customer_credit_applications SET status='cancelled', resolved_by=$2, resolved_at=now(), resolution_comment=$3 WHERE id=$1`,
    [app.id, ctx.userId, blank(reason)],
  );
  await logCreditEvent(c, {
    customerId: app.customer_id, storeId: app.store_id, event: "cancelled", actorUserId: ctx.userId,
    applicationId: app.id, reason: blank(reason),
  });
}

/**
 * Lleva a la solicitud el veredicto dado en la bandeja de Aprobaciones. Allí no
 * se captura un monto distinto, así que una aprobación otorga lo solicitado.
 * Idempotente: una solicitud ya resuelta no se toca.
 */
export async function syncCreditApplication(c: SqlClient, applicationId: number): Promise<string> {
  const app = await loadApplication(c, null, applicationId);
  if (app.status !== "pending" || !app.approval_request_id) return app.status;
  const approval = await getApproval(c as any, app.approval_request_id);
  if (approval.status === "pending") return "pending";
  const last = await c.query(
    `SELECT actor_user_id, comment FROM approval_actions
      WHERE request_id=$1 AND action=$2 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [approval.id, approval.status === "approved" ? "approve" : approval.status === "rejected" ? "reject" : "cancel"],
  );
  const actor = Number(last.rows[0]?.actor_user_id ?? approval.requestedBy);
  const comment = last.rows[0]?.comment ?? null;

  if (approval.status === "approved") {
    await applyApprovedApplication(c, app, {
      limit: Number(app.requested_limit), days: Number(app.requested_days), actorUserId: actor, comment,
    });
    return "approved";
  }
  const status = approval.status === "rejected" ? "rejected" : "cancelled";
  await c.query(
    `UPDATE customer_credit_applications SET status=$2, resolved_by=$3, resolved_at=now(), resolution_comment=$4 WHERE id=$1`,
    [app.id, status, actor, comment],
  );
  await logCreditEvent(c, {
    customerId: app.customer_id, storeId: app.store_id, event: status, actorUserId: actor,
    applicationId: app.id, reason: comment,
  });
  return status;
}

/**
 * Suspender (temporal, p. ej. por mora), bloquear (definitivo hasta decisión en
 * contrario) o reactivar la línea. Reactivar exige una línea aprobada, y sacar
 * una línea de un bloqueo —a cualquier estado— exige rol de administrador.
 */
export async function changeCreditStatus(
  c: SqlClient,
  ctx: CustomerCtx,
  customerId: number,
  input: { status: "active" | "suspended" | "blocked"; reason: string },
) {
  const customer = await loadCustomer(c, ctx, customerId, true);
  const from = customer.credit_status as CreditLineStatus;
  const reason = input.reason?.trim() ?? "";
  if (reason.length < 5) throw new CustomerError("indique el motivo del cambio", 422);
  if (from === input.status) throw new CustomerError("la línea ya está en ese estado", 409);

  const terms = await activeTerms(c, customerId);
  if (from === "blocked") {
    const actor = await c.query(`SELECT role FROM users WHERE id=$1`, [ctx.userId]);
    if (!["admin", "super_admin"].includes(actor.rows[0]?.role)) {
      throw new CustomerError("sólo un administrador puede sacar una línea de un bloqueo", 403);
    }
  }
  if (input.status === "active") {
    if (!terms || !(Number(terms.credit_limit) > 0)) {
      throw new CustomerError("el cliente no tiene un límite aprobado; registre una solicitud de crédito", 422);
    }
  } else if (from === "none") {
    throw new CustomerError("el cliente no tiene línea de crédito", 422);
  }

  await c.query(
    `UPDATE customers SET credit_status=$2, credit_status_reason=$3, credit_status_changed_at=now(),
            updated_by=$4, updated_at=now()
      WHERE id=$1`,
    [customerId, input.status, reason, ctx.userId],
  );
  await logCreditEvent(c, {
    customerId, storeId: ctx.storeId,
    event: input.status === "active" ? "reactivated" : input.status,
    actorUserId: ctx.userId, fromStatus: from, toStatus: input.status,
    limitBefore: terms?.credit_limit ?? 0, limitAfter: terms?.credit_limit ?? 0, reason,
  });
}
