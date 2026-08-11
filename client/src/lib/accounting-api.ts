import { apiRequest } from "./queryClient";

/**
 * Typed client for the accounting + fiscal API.
 *
 * `apiRequest` already attaches the auth token; the server resolves the active
 * company from the user's membership, so the client never sends a company id
 * unless the user is switching companies (then via the X-Company-Id header,
 * which the warehouse/company switcher would set).
 */

export interface Account {
  id: number;
  code: string;
  name: string;
  account_type: string;
  is_postable: boolean;
  is_active: boolean;
}

export interface TrialBalanceRow {
  code: string;
  name: string;
  account_type: string;
  debit: string;
  credit: string;
  balance: string;
}

export interface TrialBalance {
  year: number;
  period: number | null;
  rows: TrialBalanceRow[];
  totalDebit: string;
  totalCredit: string;
  balanced: boolean;
}

export interface FiscalDocument {
  id: number;
  doc_type: string;
  ncf: string | null;
  ncf_type: string;
  is_ecf: boolean;
  buyer_rnc: string | null;
  buyer_name: string | null;
  total: string;
  status: string;
  ecf_status: string | null;
  emitted_at: string | null;
}

export interface IssueInvoiceLine {
  description: string;
  quantity: string;
  unitPrice: string;
  discount?: string;
  taxCode: string;
}

export interface IssueInvoiceInput {
  ncfType: string;
  date: string;
  buyerRnc?: string;
  buyerName?: string;
  paymentMethod?: "cash" | "credit" | "card" | "transfer";
  applyLegalTip?: boolean;
  /** Recognise COGS for tracked products (default true on the server). */
  bookCogs?: boolean;
  lines: IssueInvoiceLine[];
  /** Registered customer, when the buyer is one. */
  customerId?: number;
  /** Operational order this comprobante bills, when there is one. */
  orderId?: number;
  currency?: string;
  /** Required when `currency` is not the company's functional currency. */
  fxRate?: string;
  dueDate?: string;
  /** Warehouse the goods leave from; 0 = the company's single store. */
  warehouseId?: number;
}

export interface StatementSection {
  title: string;
  lines: { code: string; name: string; amount: string }[];
  total: string;
}
export interface IncomeStatement {
  year: number;
  income: StatementSection;
  expenses: StatementSection;
  netIncome: string;
}
export interface BalanceSheet {
  year: number;
  assets: StatementSection;
  liabilities: StatementSection;
  equity: StatementSection;
  netIncome: string;
  imbalance: string;
  balanced: boolean;
}

export interface Kpi {
  value: string;
  /** Variación contra el mes anterior, en %. Null cuando no hay base contra qué comparar. */
  changePct: string | null;
}

export interface DashboardData {
  year: number;
  month: number;
  currency: string;
  kpis: { income: Kpi; expense: Kpi; netIncome: Kpi; cashFlow: Kpi };
  monthly: { period: number; income: string; expense: string; cash: string }[];
  expenseBreakdown: { name: string; amount: string; pct: string }[];
  expenseTotal: string;
  receivables: {
    items: { name: string; balance: string; daysOverdue: number }[];
    total: string;
    othersCount: number;
    othersBalance: string;
  };
  payables: {
    items: { name: string; balance: string; daysOverdue: number }[];
    total: string;
    othersCount: number;
    othersBalance: string;
  };
  summary: {
    assets: string;
    liabilities: string;
    equity: string;
    netIncome: string;
    marginPct: string | null;
  };
}

export const accountingApi = {
  accounts: () => apiRequest<{ accounts: Account[] }>("GET", "/api/accounting/accounts"),
  dashboard: (year: number, month: number) =>
    apiRequest<DashboardData>("GET", `/api/accounting/dashboard?year=${year}&month=${month}`),
  trialBalance: (year: number, period?: number) =>
    apiRequest<TrialBalance>(
      "GET",
      `/api/accounting/trial-balance?year=${year}${period ? `&period=${period}` : ""}`,
    ),
  periods: (year: number) =>
    apiRequest<{ year: number; periods: any[] }>("GET", `/api/accounting/periods?year=${year}`),
  incomeStatement: (year: number) =>
    apiRequest<IncomeStatement>("GET", `/api/accounting/income-statement?year=${year}`),
  balanceSheet: (year: number) =>
    apiRequest<BalanceSheet>("GET", `/api/accounting/balance-sheet?year=${year}`),
};

export const subledgerApi = {
  arOpenItems: () => apiRequest<{ items: any[] }>("GET", "/api/subledgers/ar/open-items"),
  arAging: () => apiRequest<{ asOf: string; aging: any[] }>("GET", "/api/subledgers/ar/aging"),
  registerReceipt: (body: any) => apiRequest("POST", "/api/subledgers/ar/receipts", body),
  apOpenItems: () => apiRequest<{ items: any[] }>("GET", "/api/subledgers/ap/open-items"),
  apAging: () => apiRequest<{ asOf: string; aging: any[] }>("GET", "/api/subledgers/ap/aging"),
  registerSupplierInvoice: (body: any) => apiRequest("POST", "/api/subledgers/ap/invoices", body),
  registerPayment: (body: any) => apiRequest("POST", "/api/subledgers/ap/payments", body),
};

export const moduleApi = {
  fixedAssets: () => apiRequest<{ assets: any[] }>("GET", "/api/modules/fixed-assets"),
  createAsset: (body: any) => apiRequest("POST", "/api/modules/fixed-assets", body),
  depreciate: (body: any) => apiRequest("POST", "/api/modules/fixed-assets/depreciate", body),
  employees: () => apiRequest<{ employees: any[] }>("GET", "/api/modules/payroll/employees"),
  createEmployee: (body: any) => apiRequest("POST", "/api/modules/payroll/employees", body),
  runPayroll: (body: any) => apiRequest("POST", "/api/modules/payroll/run", body),
  payslips: (runId: number) => apiRequest<{ payslips: any[] }>("GET", `/api/modules/payroll/runs/${runId}/payslips`),
  createBudget: (body: any) => apiRequest<{ id: number }>("POST", "/api/modules/budgets", body),
  variance: (id: number) => apiRequest<{ rows: any[]; totalBudget: string; totalActual: string }>("GET", `/api/modules/budgets/${id}/variance`),
};

export const treasuryApi = {
  accounts: () => apiRequest<{ accounts: any[] }>("GET", "/api/treasury/accounts"),
  openAccount: (body: any) => apiRequest<{ id: number }>("POST", "/api/treasury/accounts", body),
  movements: (bankAccountId: number) =>
    apiRequest<{ movements: any[] }>("GET", `/api/treasury/accounts/${bankAccountId}/movements`),
  recordMovement: (body: any) => apiRequest("POST", "/api/treasury/movements", body),
  reconciliations: (bankAccountId?: number) =>
    apiRequest<{ reconciliations: any[] }>(
      "GET",
      `/api/treasury/reconciliations${bankAccountId ? `?bankAccountId=${bankAccountId}` : ""}`,
    ),
  startReconciliation: (body: any) => apiRequest<{ id: number }>("POST", "/api/treasury/reconciliations", body),
  reconciliation: (id: number) =>
    apiRequest<{
      reconciliationId: number;
      statementDate: string;
      statementBalance: string;
      bookBalance: string;
      clearedBalance: string;
      depositsInTransit: string;
      outstandingChecks: string;
      difference: string;
      reconciled: boolean;
      status: string;
      items: any[];
    }>("GET", `/api/treasury/reconciliations/${id}`),
  clear: (id: number, transactionIds: number[]) =>
    apiRequest("POST", `/api/treasury/reconciliations/${id}/clear`, { transactionIds }),
  unclear: (id: number, transactionIds: number[]) =>
    apiRequest("POST", `/api/treasury/reconciliations/${id}/unclear`, { transactionIds }),
  complete: (id: number) => apiRequest("POST", `/api/treasury/reconciliations/${id}/complete`),
};

export const consolidationApi = {
  companies: () => apiRequest<{ companies: any[] }>("GET", "/api/companies"),
  groups: () => apiRequest<{ groups: any[] }>("GET", "/api/consolidation/groups"),
  createGroup: (body: any) => apiRequest<{ group: any }>("POST", "/api/consolidation/groups", body),
  members: (groupId: number) => apiRequest<{ members: any[] }>("GET", `/api/consolidation/groups/${groupId}/members`),
  addMember: (groupId: number, body: any) => apiRequest("POST", `/api/consolidation/groups/${groupId}/members`, body),
  consolidate: (groupId: number, body: any) =>
    apiRequest<{ runId: number; memberCount: number }>("POST", `/api/consolidation/groups/${groupId}/consolidate`, body),
  runs: (groupId: number) => apiRequest<{ runs: any[] }>("GET", `/api/consolidation/groups/${groupId}/runs`),
  run: (runId: number) =>
    apiRequest<{
      run: any;
      lines: any[];
      eliminations: any[];
      totalDebit: string;
      totalCredit: string;
      balanced: boolean;
    }>("GET", `/api/consolidation/runs/${runId}`),
};

export const inventoryApi = {
  valuation: () =>
    apiRequest<{ items: any[]; totalValue: string; byWarehouse: any[] }>("GET", "/api/inventory/valuation"),
  movements: (productId?: number) =>
    apiRequest<{ movements: any[] }>("GET", `/api/inventory/movements${productId ? `?productId=${productId}` : ""}`),
  receive: (body: any) => apiRequest("POST", "/api/inventory/receive", body),
  issue: (body: any) => apiRequest("POST", "/api/inventory/issue", body),
  transfer: (body: any) => apiRequest<{ cost: string }>("POST", "/api/inventory/transfer", body),
  warehouses: () => apiRequest<{ warehouses: any[] }>("GET", "/api/warehouses"),
  margin: (year: number, month: number) =>
    apiRequest<{ period: string; lines: any[]; totalRevenue: string; totalCogs: string; totalMargin: string; marginPct: string }>(
      "GET",
      `/api/inventory/margin?year=${year}&month=${month}`,
    ),
};

// ── WMS: ubicaciones, picking y conteo físico ────────────────────────────────

export interface WarehouseWmsConfig {
  warehouseId: number;
  wmsEnabled: boolean;
  rotationPolicy: "fifo" | "fefo";
  requireLocationOnReceipt: boolean;
}

export interface WarehouseLocationRow {
  id: number;
  code: string;
  name: string | null;
  barcode: string | null;
  kind: string;
  zone: string | null;
  aisle: string | null;
  rack: string | null;
  level: string | null;
  position: string | null;
  pick_priority: number;
  is_pickable: boolean;
  allow_mixed_products: boolean;
  max_qty: string | null;
  is_active: boolean;
  product_count: number;
  total_qty: string;
  total_value: string;
  next_expiration: string | null;
}

export interface PickAllocationRow {
  placementId: number;
  locationId: number;
  locationCode: string;
  lotNo: string | null;
  expirationDate: string | null;
  receivedDate: string;
  quantity: string;
  availableQty: string;
  unitCost: string;
  isExpired: boolean;
}

export interface InventoryCountRow {
  id: number;
  count_no: string;
  name: string | null;
  warehouse_id: number;
  warehouse_name: string | null;
  count_type: string;
  status: string;
  is_blind: boolean;
  count_date: string;
  total_lines: number;
  counted_lines: number;
  variance_lines: number;
  surplus_value: string;
  shortage_value: string;
  net_value: string;
  created_at: string;
  applied_at: string | null;
  created_by_name: string | null;
}

export interface InventoryCountLineRow {
  id: number;
  product_id: number;
  product_name: string | null;
  sku: string | null;
  location_id: number | null;
  location_code: string | null;
  lot_no: string | null;
  expiration_date: string | null;
  /** Null while a blind count is being captured. */
  expected_qty: string | null;
  counted_qty: string | null;
  recount_qty: string | null;
  variance: string | null;
  unit_cost: string;
  variance_value: string | null;
  status: string;
  reason: string | null;
  notes: string | null;
  counted_by_name: string | null;
}

const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") s.set(k, String(v));
  return s.toString();
};

export const wmsApi = {
  config: (warehouseId: number) =>
    apiRequest<{ config: WarehouseWmsConfig }>("GET", `/api/wms/warehouses/${warehouseId}/config`),

  locations: (warehouseId: number, includeInactive = false) =>
    apiRequest<{ locations: WarehouseLocationRow[] }>(
      "GET",
      `/api/wms/locations?${qs({ warehouseId, includeInactive })}`,
    ),
  createLocation: (body: any) => apiRequest("POST", "/api/wms/locations", body),
  updateLocation: (id: number, body: any) => apiRequest("PUT", `/api/wms/locations/${id}`, body),
  deleteLocation: (id: number) =>
    apiRequest<{ deleted: boolean; deactivated: boolean; remainingQty: string }>(
      "DELETE",
      `/api/wms/locations/${id}`,
    ),
  generateLocations: (body: any) =>
    apiRequest<{ created: number; skipped: number; codes: string[] }>("POST", "/api/wms/locations/generate", body),

  stock: (warehouseId: number, filters: { locationId?: number; productId?: number; expiringInDays?: number } = {}) =>
    apiRequest<{ stock: any[] }>("GET", `/api/wms/stock?${qs({ warehouseId, ...filters })}`),
  moves: (warehouseId: number, filters: { productId?: number; locationId?: number; limit?: number } = {}) =>
    apiRequest<{ moves: any[] }>("GET", `/api/wms/moves?${qs({ warehouseId, ...filters })}`),
  drift: (warehouseId: number) =>
    apiRequest<{ differences: any[]; netValueDifference: string; reconciled: boolean }>(
      "GET",
      `/api/wms/drift?${qs({ warehouseId })}`,
    ),
  expiring: (warehouseId: number, days = 30) =>
    apiRequest<{ items: any[] }>("GET", `/api/wms/expiring?${qs({ warehouseId, days })}`),

  putaway: (body: any) => apiRequest("POST", "/api/wms/putaway", body),
  move: (body: any) => apiRequest<{ moved: string; from: string }>("POST", "/api/wms/move", body),
  /** Read-only: asks where a quantity *would* come from. Changes nothing. */
  pickPlan: (warehouseId: number, productId: number, quantity: string, rotation?: "fifo" | "fefo") =>
    apiRequest<{ rotation: "fifo" | "fefo"; allocations: PickAllocationRow[]; allocated: string; shortfall: string }>(
      "GET",
      `/api/wms/pick-plan?${qs({ warehouseId, productId, quantity, rotation })}`,
    ),
  pick: (body: any) => apiRequest<{ picked: string; shortfall: string }>("POST", "/api/wms/pick", body),

  counts: (warehouseId?: number) =>
    apiRequest<{ counts: InventoryCountRow[] }>("GET", `/api/wms/counts?${qs({ warehouseId })}`),
  createCount: (body: any) =>
    apiRequest<{ id: number; countNo: string; totalLines: number; wmsEnabled: boolean }>(
      "POST",
      "/api/wms/counts",
      body,
    ),
  count: (id: number, forCounting = false) =>
    apiRequest<InventoryCountRow & { blindActive: boolean; lines: InventoryCountLineRow[] }>(
      "GET",
      `/api/wms/counts/${id}?${qs({ forCounting })}`,
    ),
  recordCounts: (id: number, entries: any[]) => apiRequest("POST", `/api/wms/counts/${id}/lines`, { entries }),
  addFound: (id: number, body: any) => apiRequest("POST", `/api/wms/counts/${id}/found`, body),
  submitCount: (id: number) => apiRequest("POST", `/api/wms/counts/${id}/submit`),
  applyCount: (id: number) =>
    apiRequest<{
      countNo: string;
      productsAdjusted: number;
      surplusValue: string;
      shortageValue: string;
      netValue: string;
      journalEntryIds: number[];
    }>("POST", `/api/wms/counts/${id}/apply`, {}),
  cancelCount: (id: number, reason: string) => apiRequest("POST", `/api/wms/counts/${id}/cancel`, { reason }),
};

export const fiscalApi = {
  documents: (type?: string) =>
    apiRequest<{ documents: FiscalDocument[] }>(
      "GET",
      `/api/fiscal/documents${type ? `?type=${type}` : ""}`,
    ),
  issueInvoice: (input: IssueInvoiceInput) =>
    apiRequest<{ documentId: number; ncf: string; total: string; journalEntryId: number }>(
      "POST",
      "/api/fiscal/invoices",
      input,
    ),
  cancel: (id: number, reason: string) =>
    apiRequest("POST", `/api/fiscal/documents/${id}/cancel`, { reason }),
  ncfSequences: () =>
    apiRequest<{ sequences: any[]; alerts: any[] }>("GET", "/api/fiscal/ncf-sequences"),
  report: (form: "606" | "607" | "608" | "609", year: number, month: number) =>
    apiRequest<{ form: string; period: string; recordCount: number; header: string; lines: string[] }>(
      "GET",
      `/api/fiscal/reports/${form}?year=${year}&month=${month}`,
    ),
  reportUrl: (form: "606" | "607" | "608" | "609", year: number, month: number) =>
    `/api/fiscal/reports/${form}?year=${year}&month=${month}&format=txt`,
  foreignPayments: () => apiRequest<{ payments: any[] }>("GET", "/api/fiscal/foreign-payments"),
  recordForeignPayment: (body: any) => apiRequest("POST", "/api/fiscal/foreign-payments", body),
  it1: (year: number, month: number) =>
    apiRequest<{ period: string; itbisCharged: string; itbisPaid: string; itbisWithheldFromUs: string; balanceToPay: string }>(
      "GET",
      `/api/fiscal/reports/it1?year=${year}&month=${month}`,
    ),
  ir17: (year: number, month: number) =>
    apiRequest<{
      period: string;
      lines: { concept: string; label: string; count: number; base: string; retained: string }[];
      totalBase: string;
      totalRetained: string;
    }>("GET", `/api/fiscal/reports/ir17?year=${year}&month=${month}`),
};

// ── e-CF: facturación electrónica ────────────────────────────────────────────

export interface EcfSettings {
  companyId: number;
  environment: "simulated" | "test" | "cert" | "prod";
  isEnabled: boolean;
  issuerRnc: string;
  issuerName: string;
  tradeName?: string;
  address?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  rfceThreshold: string;
  maxTransmitAttempts: number;
  certificateFingerprint?: string;
  certificateSubject?: string;
  certificateExpiresAt?: string;
  hasCertificate: boolean;
}

export interface EcfValidationMessage {
  code: string;
  message: string;
  severity: "error" | "warning";
  field?: string;
}

export interface EcfQueueRow {
  id: number;
  document_id: number;
  ncf: string | null;
  ncf_type: string;
  total: string;
  ecf_status: string | null;
  state: string;
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  track_id: string | null;
  dgii_status: string | null;
  updated_at: string;
}

export interface EcfReceivedRow {
  id: number;
  encf: string;
  ecf_type: string;
  issuer_rnc: string;
  issuer_name: string | null;
  supplier_name: string | null;
  emitted_at: string | null;
  currency: string;
  total: string;
  total_itbis: string;
  security_code: string | null;
  signature_valid: boolean | null;
  acknowledged_at: string | null;
  approval_status: "pendiente" | "aceptado" | "rechazado";
  approval_reason: string | null;
  approved_at: string | null;
  approved_by_name: string | null;
  approval_overdue: boolean;
  purchase_document_id: number | null;
  received_at: string;
}

export interface EcfRepresentation {
  isFiscal: boolean;
  documentId: number;
  encf: string | null;
  ecfType: string;
  ecfTypeName: string;
  ecfStatus: string | null;
  securityCode: string | null;
  signedAt: string | null;
  qrUrl: string | null;
  trackId: string | null;
  environment: string;
  environmentNotice?: string;
  issuer: {
    rnc: string; name: string; tradeName?: string; address?: string;
    phone?: string; email?: string; logoUrl?: string;
  };
  buyer: { rnc?: string; name?: string };
  emittedAt: string | null;
  dueDate: string | null;
  currency: string;
  paymentMethodLabel?: string;
  modifiesNcf?: string;
  lines: Array<{
    lineNo: number; description: string; quantity: string; unitPrice: string;
    discount: string; itbisAmount: string; lineTotal: string; isExempt: boolean;
  }>;
  totals: {
    subtotalTaxed: string; subtotalExempt: string; itbis18: string; itbis16: string;
    itbis0: string; totalItbis: string; isc: string; tipLegal: string;
    retentionItbis: string; retentionIsr: string; total: string;
  };
}

export interface EcfDashboard {
  settings: {
    environment: string;
    isEnabled: boolean;
    hasCertificate: boolean;
    certificateExpiresAt?: string;
  };
  byStatus: { status: string; n: number; total: string }[];
  queue: { state: string; n: number; next_attempt: string | null }[];
  stuck: {
    id: number; ncf: string | null; ncf_type: string; total: string;
    emitted_at: string | null; ecf_status: string | null;
    attempts: number; last_error: string | null; state: string;
  }[];
  inbox: { pending: number; overdue: number; total: number };
  sequenceAlerts: {
    ncf_type: string; remaining: number; alert_threshold: number; expiry_date: string | null;
  }[];
}

export interface EcfReadinessCheck {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
}

export interface EcfReadiness {
  ready: boolean;
  environment: string;
  isEnabled: boolean;
  checks: EcfReadinessCheck[];
  nextSteps: string[];
}

const ecfQs = (params: Record<string, string | number | boolean | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") s.set(k, String(v));
  const q = s.toString();
  return q ? `?${q}` : "";
};

export const ecfApi = {
  config: () => apiRequest<{ config: EcfSettings }>("GET", "/api/ecf/config"),
  saveConfig: (body: Partial<EcfSettings>) =>
    apiRequest<{ config: EcfSettings }>("PUT", "/api/ecf/config", body),
  uploadCertificate: (privateKeyPem: string, certificatePem: string) =>
    apiRequest<{ config: EcfSettings }>("PUT", "/api/ecf/certificate", { privateKeyPem, certificatePem }),
  types: () => apiRequest<{ types: any[] }>("GET", "/api/ecf/types"),
  dashboard: () => apiRequest<EcfDashboard>("GET", "/api/ecf/dashboard"),
  readiness: () => apiRequest<EcfReadiness>("GET", "/api/ecf/readiness"),

  /** Read-only dry run: what DGII would say, without spending an eNCF. */
  validate: (id: number) =>
    apiRequest<{ valid: boolean; messages: EcfValidationMessage[]; xml: string }>(
      "POST",
      `/api/ecf/documents/${id}/validate`,
      {},
    ),
  transmit: (id: number) =>
    apiRequest<{ documentId: number; ecfStatus: string; trackId?: string }>(
      "POST",
      `/api/ecf/documents/${id}/transmit`,
      {},
    ),
  refreshStatus: (id: number) =>
    apiRequest<{ documentId: number; ecfStatus: string }>(
      "POST",
      `/api/ecf/documents/${id}/refresh-status`,
      {},
    ),
  events: (id: number) => apiRequest<{ events: any[] }>("GET", `/api/ecf/documents/${id}/events`),
  representation: (id: number) =>
    apiRequest<{ representation: EcfRepresentation }>("GET", `/api/ecf/documents/${id}/representation`),
  xmlUrl: (id: number) => `/api/ecf/documents/${id}/xml`,

  queue: () => apiRequest<{ queue: EcfQueueRow[] }>("GET", "/api/ecf/queue"),
  processQueue: (limit?: number) =>
    apiRequest<{ checked: number; resolved: number; stillPending: number; failed: number }>(
      "POST",
      "/api/ecf/queue/process",
      { limit },
    ),

  inbox: (filters: { approvalStatus?: string; from?: string; to?: string } = {}) =>
    apiRequest<{ received: EcfReceivedRow[] }>("GET", `/api/ecf/inbox${ecfQs(filters)}`),
  received: (id: number) => apiRequest<{ received: any; parsed: any }>("GET", `/api/ecf/inbox/${id}`),
  receive: (xml: string) =>
    apiRequest<{ id: number; encf: string; accepted: boolean; duplicate: boolean; messages: any[] }>(
      "POST",
      "/api/ecf/inbox",
      { xml },
    ),
  acknowledge: (id: number) =>
    apiRequest<{ xml: string; status: string }>("POST", `/api/ecf/inbox/${id}/acknowledge`, {}),
  approve: (id: number, status: "aceptado" | "rechazado", reason?: string) =>
    apiRequest<{ xml: string; approvalStatus: string }>("POST", `/api/ecf/inbox/${id}/approve`, {
      status,
      reason,
    }),
  match: (id: number, purchaseDocumentId: number) =>
    apiRequest<{ matched: boolean; warnings: string[] }>("POST", `/api/ecf/inbox/${id}/match`, {
      purchaseDocumentId,
    }),

  rfcePreview: (from: string, to: string) =>
    apiRequest<{ n: number; encf_from: string; encf_to: string; total: string; threshold: string }>(
      "GET",
      `/api/ecf/rfce/preview${ecfQs({ from, to })}`,
    ),
  fileRfce: (from: string, to: string) =>
    apiRequest<{ filed: boolean; documentCount: number; trackId?: string; reason?: string }>(
      "POST",
      "/api/ecf/rfce",
      { from, to },
    ),

  sequenceVoids: () => apiRequest<{ voids: any[] }>("GET", "/api/ecf/sequence-voids"),
  voidSequence: (body: { ecfType: string; rangeFrom: number; rangeTo: number; reason?: string }) =>
    apiRequest<{ id: number; status: string; count: number }>("POST", "/api/ecf/sequence-voids", body),
};

// ── Devoluciones de mercancía (notas de crédito) ─────────────────────────────

export interface CreditableLine {
  lineNo: number;
  productId: number | null;
  description: string;
  unitPrice: string;
  taxCode: string | null;
  invoicedQty: string;
  creditedQty: string;
  remainingQty: string;
}

export interface CreditableInvoice {
  invoice: {
    id: number;
    ncf: string | null;
    buyerName: string | null;
    total: string;
    emittedAt: string | null;
  };
  lines: CreditableLine[];
}

export const returnsApi = {
  /** Lo que queda por acreditar de una factura, línea por línea. */
  creditable: (invoiceId: number) =>
    apiRequest<CreditableInvoice>("GET", `/api/fiscal/invoices/${invoiceId}/creditable`),
  issueCreditNote: (body: {
    ncfType: string;
    date: string;
    modifiesDocId: number;
    lines: { description: string; quantity: string; unitPrice: string; discount?: string; taxCode: string; productId?: number }[];
    restockInventory?: boolean;
    matchInvoiceLines?: boolean;
  }) =>
    apiRequest<{ documentId: number; ncf: string; total: string; journalEntryId: number }>(
      "POST",
      "/api/fiscal/credit-notes",
      body,
    ),
};
