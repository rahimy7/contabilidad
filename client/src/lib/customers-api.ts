import { apiRequest } from "./queryClient";
import type {
  CreditApplicationStatus, CreditLineStatus, GuaranteeType, PersonType, TaxIdType, TaxpayerType,
} from "@shared/customer-fiscal";

/** Cliente tipado del maestro de clientes (server/routes/customer-routes.ts). */

export interface CustomerListRow {
  id: number;
  code: string | null;
  name: string;
  legalName: string | null;
  tradeName: string | null;
  personType: PersonType;
  taxIdType: TaxIdType | null;
  rnc: string | null;
  foreignId: string | null;
  taxpayerType: TaxpayerType;
  defaultNcfType: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  province: string | null;
  isActive: boolean;
  creditStatus: CreditLineStatus;
  currency: string;
  salesRepName: string | null;
  customerTypeName: string | null;
  creditLimit: string;
  creditDays: number;
  balance: string;
  overdue: string;
  maxDaysOverdue: number | null;
  available: string;
  pendingApplicationId: number | null;
  pendingRequestedLimit: string | null;
}

export interface CommercialTerms {
  priceListId: number | null;
  additionalDiscountPercent: number;
  earlyPaymentDiscountPercent: number;
  earlyPaymentDays: number | null;
  itbisRetentionPercent: number;
  isrRetentionPercent: number;
  requiresPurchaseOrder: boolean;
  gracePeriodDays: number;
  notes: string | null;
}

export interface CustomerForm {
  code: string | null;
  personType: PersonType;
  taxIdType: TaxIdType | null;
  rnc: string | null;
  foreignId: string | null;
  legalName: string;
  tradeName: string | null;
  taxpayerType: TaxpayerType;
  defaultNcfType: string | null;
  itbisExempt: boolean;
  exemptionReference: string | null;
  economicActivity: string | null;
  dgiiStatus: string | null;
  dgiiVerifiedAt: string | null;
  phone: string;
  phoneAlt: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  sector: string | null;
  municipality: string | null;
  province: string | null;
  postalCode: string | null;
  country: string;
  customerTypeId: number | null;
  salesRepUserId: number | null;
  currency: string;
  preferredPaymentMethod: string | null;
  isActive: boolean;
  notes: string | null;
  terms: CommercialTerms;
}

export interface CreditSummary {
  status: CreditLineStatus;
  limit: string;
  days: number;
  gracePeriodDays: number;
  used: string;
  available: string;
  overdue: string;
  maxDaysOverdue: number | null;
  openItems: number;
  nextDue: string | null;
  lastInvoice: string | null;
  lastReceipt: string | null;
  sales12m: string;
}

export interface CreditApplication {
  id: number;
  requestedLimit: string;
  requestedDays: number;
  approvedLimit: string | null;
  approvedDays: number | null;
  status: CreditApplicationStatus;
  justification: string;
  guaranteeType: GuaranteeType;
  guaranteeAmount: string | null;
  guaranteeNotes: string | null;
  referencesNotes: string | null;
  reviewDate: string | null;
  approvalRequestId: number | null;
  requestedBy: number;
  requestedByName: string | null;
  resolvedBy: number | null;
  resolvedByName: string | null;
  resolutionComment: string | null;
  createdAt: string;
  resolvedAt: string | null;
  approverRole: string | null;
  requiredApprovals: number | null;
  receivedApprovals: number | null;
}

export interface CreditEvent {
  id: number;
  event: string;
  fromStatus: string | null;
  toStatus: string | null;
  limitBefore: string | null;
  limitAfter: string | null;
  daysBefore: number | null;
  daysAfter: number | null;
  reason: string | null;
  applicationId: number | null;
  actorName: string | null;
  createdAt: string;
}

export interface CustomerContact {
  id: number;
  name: string;
  role: "buyer" | "accountant" | "manager" | "operations" | "warehouse" | "other";
  email: string | null;
  phone: string | null;
  mobile: string | null;
  isPrimary: boolean;
  receivesInvoices: boolean;
  receivesStatements: boolean;
  notes: string | null;
}

export interface CustomerDetail {
  customer: Omit<CustomerForm, "terms"> & {
    id: number;
    name: string;
    salesRepName: string | null;
    creditStatusReason: string | null;
    creditStatusChangedAt: string | null;
    creditApprovedByName: string | null;
    creditApprovedAt: string | null;
    creditReviewDate: string | null;
    createdAt: string;
    createdByName: string | null;
    updatedAt: string;
    updatedByName: string | null;
  };
  terms: CommercialTerms & { validFrom: string | null };
  credit: CreditSummary;
  applications: CreditApplication[];
  events: CreditEvent[];
  contacts: CustomerContact[];
}

export interface CustomerLookups {
  priceLists: { id: number; code: string; name: string; tier: string }[];
  customerTypes: { id: number; name: string; discountPercentage: string }[];
  salesReps: { id: number; name: string; role: string }[];
}

export interface CustomerStatement {
  aging: { current: string; d1_30: string; d31_60: string; d61_90: string; d90_plus: string; total: string };
  openItems: {
    id: number; issueDate: string; dueDate: string; currency: string; originalAmount: string;
    balance: string; status: string; ncf: string | null; ncfType: string | null; daysOverdue: number;
  }[];
  documents: {
    id: number; docType: string; ncf: string | null; ncfType: string; documentDate: string;
    dueDate: string | null; total: string; status: string; paymentMethod: string | null;
  }[];
  receipts: { id: number; receiptDate: string; amount: string; method: string; reference: string | null; currency: string }[];
}

export interface CreditRequest {
  requestedLimit: number;
  requestedDays: number;
  justification: string;
  guaranteeType: GuaranteeType;
  guaranteeAmount?: number | null;
  guaranteeNotes?: string | null;
  referencesNotes?: string | null;
  reviewDate?: string | null;
}

const BASE = "/api/customer-master";

export const customersApi = {
  list: (params: { search?: string; status?: string; credit?: string } = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    return apiRequest<{ rows: CustomerListRow[] }>("GET", `${BASE}?${q.toString()}`);
  },
  lookups: () => apiRequest<CustomerLookups>("GET", `${BASE}/lookups`),
  get: (id: number) => apiRequest<CustomerDetail>("GET", `${BASE}/${id}`),
  statement: (id: number) => apiRequest<CustomerStatement>("GET", `${BASE}/${id}/statement`),
  create: (body: CustomerForm & { confirmDuplicateTaxId?: boolean }) =>
    apiRequest<{ id: number }>("POST", BASE, body),
  update: (id: number, body: CustomerForm & { confirmDuplicateTaxId?: boolean }) =>
    apiRequest<{ id: number }>("PUT", `${BASE}/${id}`, body),
  remove: (id: number) => apiRequest("DELETE", `${BASE}/${id}`),
  requestCredit: (id: number, body: CreditRequest) =>
    apiRequest<{ applicationId: number }>("POST", `${BASE}/${id}/credit/applications`, body),
  resolveCredit: (applicationId: number, body: { action: "approve" | "reject"; approvedLimit?: number; approvedDays?: number; comment?: string }) =>
    apiRequest<{ status: string; receivedApprovals?: number; requiredApprovals?: number }>(
      "POST", `${BASE}/credit/applications/${applicationId}/resolve`, body,
    ),
  cancelCredit: (applicationId: number, reason?: string) =>
    apiRequest("POST", `${BASE}/credit/applications/${applicationId}/cancel`, { reason }),
  changeCreditStatus: (id: number, body: { status: "active" | "suspended" | "blocked"; reason: string }) =>
    apiRequest("POST", `${BASE}/${id}/credit/status`, body),
  saveContact: (id: number, contactId: number | null, body: Omit<CustomerContact, "id">) =>
    contactId
      ? apiRequest("PUT", `${BASE}/${id}/contacts/${contactId}`, body)
      : apiRequest("POST", `${BASE}/${id}/contacts`, body),
  removeContact: (id: number, contactId: number) => apiRequest("DELETE", `${BASE}/${id}/contacts/${contactId}`),
};

/** Invalida la lista y la ficha tras cualquier cambio. */
export const customerKeys = {
  list: ["/api/customer-master"] as const,
  detail: (id: number) => ["/api/customer-master", id] as const,
  statement: (id: number) => ["/api/customer-master", id, "statement"] as const,
};
