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
  transmit: (id: number) =>
    apiRequest<{ documentId: number; ecfStatus: string }>("POST", `/api/fiscal/documents/${id}/transmit`),
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
