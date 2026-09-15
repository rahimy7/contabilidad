import bcrypt from "bcryptjs";
import { SqlClient } from "../../accounting/types";
import { withCompanyOn, ConnectionSource } from "../../tenant-context";
import { seedCompanyDefaults } from "../../seed/company-defaults";
import { ensureFiscalYear } from "../../accounting/periods";
import { PostingEngine } from "../../accounting/posting-engine";
import { PeriodClose } from "../../accounting/period-close";
import { monthEndReconciliation, MonthEndReconciliation } from "../../accounting/reconciliation";
import { Decimal, add, mul, sub, roundTo, toMoney } from "../../accounting/decimal";
import { Treasury } from "../../treasury/banks";
import { InventoryCosting } from "../../inventory/costing";
import { applyStockAdjustment } from "../../inventory/adjustments";
import { createCount, recordCounts, submitForReview, applyCount, getCount } from "../../inventory/counts";
import { createPurchaseOrder, submitPurchaseOrder, syncPurchaseOrderApproval } from "../../procurement/purchase-orders";
import { receivePurchaseOrder } from "../../procurement/receipts";
import { Payables } from "../../subledgers/payables";
import { Receivables } from "../../subledgers/receivables";
import { FiscalDocumentService } from "../../fiscal/document-service";
import { checkout, checkoutFromQuote, CheckoutInput } from "../../sales/checkout";
import { closeFiscalCommissionPeriod, approveFiscalCommission } from "../../sales/commissions";
import { FixedAssets } from "../../modules/fixed-assets";
import {
  prepareRun, setRunInput, importCommissions, calculateRun, postRun, payRun, payStatutory, generateIr3, syncPayrollEmployee,
} from "../../payroll/runs";
import { hireEmployee } from "../../services/hr-employees";
import { requestApproval, resolveApproval } from "../../services/approvals";
import { createRequisition, submitForApproval as submitRequisition, syncApprovalStatus } from "../../services/requisitions";
import { createRfq, addSupplierQuote, awardQuote } from "../../services/supplier-rfqs";
import { createQuote, updateStatus as updateQuoteStatus } from "../../services/sales-quotes";
import { completeReturnWithCreditNote } from "../../services/purchase-returns";
import { generate606, generate607, generate608, generateIt1, generateIr17 } from "../../fiscal/dgii-reports";
import {
  OCT, NOV, SCENARIO_YEAR, SCENARIO_MONTH, COMPANY, USERS, WAREHOUSES, PRODUCTS, CUSTOMERS, SUPPLIERS,
  EMPLOYEES, BANKS, NCF_RANGES, UserKey, WarehouseKey,
} from "./fixtures";

/**
 * The October 2026 month of "Distribuidora Caribe", end to end.
 *
 * Runs every business event of the month through the same services the HTTP
 * routes call, each in its own company-scoped transaction under row-level
 * security, with the document dates of October. At the end it reconciles the
 * month, closes it, proves a closed month refuses postings, and pays the
 * statutory liabilities in November.
 *
 * The step ids (D01-…) are the case ids of the test-plan document, so a failure
 * here points at the same case a tester would run by hand.
 */

export interface ScenarioOptions {
  rnc: string;
  /** Prefix for SKUs, usernames, codes and cédulas, so two runs never collide. */
  prefix: string;
  /** Legacy store the operational rows belong to (the UI's user has store 1). */
  storeId: number;
  log?: (step: string, message: string) => void;
  /** Admin username to grant access to the company (seeder only). */
  grantUsername?: string;
}

export interface ScenarioResult {
  companyId: number;
  ids: Record<string, number>;
  facts: Record<string, any>;
  october: MonthEndReconciliation;
  afterStatutoryPayments: Record<string, Decimal>;
  steps: string[];
}

type Ids = Record<string, number>;

export async function resetScenarioCompany(pool: ConnectionSource & { query: SqlClient["query"] }, opts: ScenarioOptions) {
  const found = await pool.query(`SELECT id FROM companies WHERE rnc=$1`, [opts.rnc]);
  const companyId: number | undefined = found.rows[0]?.id;
  const like = `${opts.prefix}%`;
  if (companyId) {
    // HR rows are legacy (store-scoped) but carry the company they were synced to.
    const hrIds = (await pool.query(`SELECT id FROM hr_employees WHERE company_id=$1`, [companyId])).rows.map((r: any) => Number(r.id));
    if (hrIds.length > 0) {
      for (const t of ["hr_positions", "hr_employment_contracts", "hr_time_off_requests", "hr_time_off_balances", "hr_attendance", "hr_terminations", "hr_documents", "hr_emergency_contacts", "hr_bank_accounts", "hr_dependents"]) {
        await pool.query(`DELETE FROM ${t} WHERE employee_id = ANY($1::int[])`, [hrIds]).catch(() => undefined);
      }
      await pool.query(`DELETE FROM hr_employees WHERE id = ANY($1::int[])`, [hrIds]).catch(() => undefined);
    }
    // Rows that do not cascade from the company, children first.
    const scoped = [
      "supplier_invoice_matches", "purchase_receipt_lines", "purchase_receipts", "ar_adjustments", "ap_adjustments",
      "ar_applications", "ap_applications", "ar_receipts", "ap_payments", "ar_open_items", "ap_open_items",
      "payroll_liability_payments", "payslip_lines", "payroll_run_inputs", "payslips", "payroll_runs", "payroll_employees",
      "depreciation_entries", "fixed_assets", "bank_transactions", "bank_reconciliations", "bank_accounts",
      "inventory_count_lines", "inventory_counts", "inventory_cost_movements", "inventory_lots", "inventory_valuation",
      "inventory_movements", "fiscal_document_events", "fiscal_document_lines",
    ];
    for (const t of scoped) {
      await pool.query(`DELETE FROM ${t} WHERE company_id=$1`, [companyId]).catch(() => undefined);
    }
    await pool.query(`UPDATE fiscal_documents SET journal_entry_id=NULL WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM fiscal_documents WHERE company_id=$1`, [companyId]);
    await pool.query(`UPDATE journal_entries SET reversed_by_entry_id=NULL, reverses_entry_id=NULL WHERE company_id=$1`, [companyId]).catch(() => undefined);
    await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM commission_earnings WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM purchase_order_items WHERE purchase_order_id IN (SELECT id FROM purchase_orders WHERE company_id=$1)`, [companyId]);
    await pool.query(`DELETE FROM purchase_orders WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM purchase_return_lines WHERE return_id IN (SELECT id FROM purchase_returns WHERE company_id=$1)`, [companyId]);
    await pool.query(`DELETE FROM purchase_returns WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM warehouse_transfer_items WHERE transfer_id IN (SELECT id FROM warehouse_transfers WHERE company_id=$1)`, [companyId]);
    await pool.query(`DELETE FROM warehouse_transfers WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM inventory_adjustment_items WHERE adjustment_id IN (SELECT id FROM inventory_adjustments WHERE company_id=$1)`, [companyId]);
    await pool.query(`DELETE FROM inventory_adjustments WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE warehouse_id IN (SELECT id FROM warehouses WHERE company_id=$1))`, [companyId]);
    await pool.query(`DELETE FROM orders WHERE warehouse_id IN (SELECT id FROM warehouses WHERE company_id=$1)`, [companyId]);
    await pool.query(`UPDATE accounting_periods SET closed_by=NULL WHERE company_id=$1`, [companyId]);
  }
  // Operational rows of this run, found by prefix and store.
  await pool.query(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE store_id=$1 AND order_number LIKE 'VTA-%' AND warehouse_id IN (SELECT id FROM warehouses WHERE name LIKE $2))`, [opts.storeId, like]);
  await pool.query(`DELETE FROM orders WHERE store_id=$1 AND warehouse_id IN (SELECT id FROM warehouses WHERE name LIKE $2)`, [opts.storeId, like]);
  await pool.query(`DELETE FROM inventory_movements WHERE warehouse_id IN (SELECT id FROM warehouses WHERE name LIKE $1)`, [like]);
  await pool.query(`DELETE FROM warehouse_stock WHERE warehouse_id IN (SELECT id FROM warehouses WHERE name LIKE $1)`, [like]);
  await pool.query(`DELETE FROM purchase_order_items WHERE warehouse_id IN (SELECT id FROM warehouses WHERE name LIKE $1)`, [like]);
  await pool.query(`DELETE FROM purchase_orders WHERE warehouse_id IN (SELECT id FROM warehouses WHERE name LIKE $1)`, [like]);
  await pool.query(`DELETE FROM customer_pricing_terms WHERE customer_id IN (SELECT id FROM customers WHERE email LIKE $1)`, [`${opts.prefix.toLowerCase()}%`]);
  await pool.query(`DELETE FROM customers WHERE email LIKE $1`, [`${opts.prefix.toLowerCase()}%`]);
  await pool.query(`DELETE FROM approval_actions WHERE request_id IN (SELECT id FROM approval_requests WHERE store_id=$1)`, [opts.storeId]).catch(() => undefined);
  if (opts.storeId !== 1) {
    for (const t of ["approval_requests", "approval_rules", "commission_rules", "commission_earnings", "promotions",
      "internal_requisition_lines", "internal_requisitions", "purchase_rfq_quote_lines", "supplier_quote_lines", "supplier_quotes",
      "purchase_rfq_lines", "purchase_rfqs", "sales_quote_lines", "sales_quotes"]) {
      if (t.endsWith("_lines") && !["purchase_rfq_lines"].includes(t)) continue;
      await pool.query(`DELETE FROM ${t} WHERE store_id=$1`, [opts.storeId]).catch(() => undefined);
    }
  }
  await pool.query(`DELETE FROM hr_positions WHERE employee_id IN (SELECT id FROM hr_employees WHERE cedula LIKE $1)`, [`${cedulaPrefix(opts.prefix)}%`]).catch(() => undefined);
  await pool.query(`DELETE FROM hr_employment_contracts WHERE employee_id IN (SELECT id FROM hr_employees WHERE cedula LIKE $1)`, [`${cedulaPrefix(opts.prefix)}%`]).catch(() => undefined);
  await pool.query(`DELETE FROM hr_employees WHERE cedula LIKE $1`, [`${cedulaPrefix(opts.prefix)}%`]).catch(() => undefined);
  const productIds = (await pool.query(`SELECT id FROM products WHERE sku LIKE $1`, [like])).rows.map((r: any) => Number(r.id));
  if (productIds.length > 0) {
    for (const t of ["sales_quote_lines", "internal_requisition_lines", "purchase_rfq_lines", "supplier_quote_lines", "order_items",
      "inventory_movements", "warehouse_stock", "purchase_order_items", "purchase_return_lines", "fiscal_document_lines", "price_list_items"]) {
      await pool.query(`DELETE FROM ${t} WHERE product_id = ANY($1::int[])`, [productIds]).catch(() => undefined);
    }
  }
  await pool.query(`DELETE FROM products WHERE sku LIKE $1`, [like]).catch(() => undefined);
  await pool.query(`DELETE FROM suppliers WHERE name LIKE $1`, [like]).catch(() => undefined);
  await pool.query(`DELETE FROM warehouses WHERE name LIKE $1`, [like]).catch(() => undefined);
  if (companyId) {
    await pool.query(`DELETE FROM user_companies WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
  }
  const userLike = `${opts.prefix.toLowerCase()}%`;
  await pool.query(`DELETE FROM inventory_adjustment_items WHERE adjustment_id IN (SELECT id FROM inventory_adjustments WHERE adjusted_by IN (SELECT id FROM users WHERE username LIKE $1))`, [userLike]).catch(() => undefined);
  await pool.query(`DELETE FROM inventory_adjustments WHERE adjusted_by IN (SELECT id FROM users WHERE username LIKE $1)`, [userLike]).catch(() => undefined);
  await pool.query(`DELETE FROM users WHERE username LIKE $1`, [userLike]).catch((e) => console.warn("[reset] usuarios no borrados:", e.message));
  // Second pass: rows freed only once the company and its documents are gone.
  await pool.query(`DELETE FROM products WHERE sku LIKE $1`, [like]).catch((e) => console.warn("[reset] productos no borrados:", e.message));
  await pool.query(`DELETE FROM suppliers WHERE name LIKE $1`, [like]).catch(() => undefined);
  await pool.query(`DELETE FROM warehouses WHERE name LIKE $1`, [like]).catch((e) => console.warn("[reset] almacenes no borrados:", e.message));
}

/** The DR cédula is 11 digits; a 3-digit prefix keeps each run's cédulas apart. */
const cedulaPrefix = (prefix: string) => String(900 + (hash(prefix) % 99)).slice(0, 3);
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export async function runOctoberScenario(
  pool: ConnectionSource & { query: SqlClient["query"] },
  opts: ScenarioOptions,
): Promise<ScenarioResult> {
  const steps: string[] = [];
  const log = (step: string, message: string) => {
    steps.push(`${step} ${message}`);
    opts.log?.(step, message);
  };
  const ids: Ids = {};
  const facts: Record<string, any> = {};
  const P = opts.prefix;
  const storeId = opts.storeId;

  // ── D00 — company, users, calendar ─────────────────────────────────────────
  const company = await pool.query(
    `INSERT INTO companies (legal_name, trade_name, rnc, settings)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [`${COMPANY.legalName} (${P})`, COMPANY.tradeName, opts.rnc, JSON.stringify({ sales: { maxDiscountPercent: 10 } })],
  );
  const companyId = Number(company.rows[0].id);
  ids.company = companyId;
  await seedCompanyDefaults(pool, companyId);
  const tx = <T>(fn: (c: SqlClient) => Promise<T>) => withCompanyOn(pool, companyId, fn);
  // The company starts operating in October: January–September carry nothing
  // and are closed as pre-inception, so October can be closed on its own.
  await tx((c) => ensureFiscalYear(c, companyId, SCENARIO_YEAR, { openFrom: OCT(1) }));
  log("D00-CFG-01", `empresa ${opts.rnc} creada, ejercicio ${SCENARIO_YEAR} abierto desde octubre`);

  const password = await bcrypt.hash("Prueba-2026!", 8);
  const user: Record<UserKey, number> = {} as any;
  for (const u of USERS) {
    const r = await pool.query(
      `INSERT INTO users (username, password, name, role, status, email) VALUES ($1,$2,$3,$4,'active',$5) RETURNING id`,
      [`${P.toLowerCase()}${u.key}`, password, u.name, u.role, `${P.toLowerCase()}${u.key}@prueba.do`],
    );
    user[u.key] = Number(r.rows[0].id);
    await pool.query(`INSERT INTO user_companies (user_id, company_id, is_default) VALUES ($1,$2,true)`, [user[u.key], companyId]);
  }
  if (opts.grantUsername) {
    await pool.query(
      `INSERT INTO user_companies (user_id, company_id, is_default)
       SELECT id, $2, false FROM users WHERE username=$1 ON CONFLICT DO NOTHING`,
      [opts.grantUsername, companyId],
    );
  }
  log("D00-SEG-01", `${USERS.length} usuarios con roles`);

  // ── D00 — master data ──────────────────────────────────────────────────────
  const wh: Record<WarehouseKey, number> = {} as any;
  for (const w of WAREHOUSES) {
    const r = await pool.query(
      `INSERT INTO warehouses (store_id, name, is_default, is_active, company_id, rotation_policy)
       VALUES ($1,$2,$3,true,$4,$5) RETURNING id`,
      [storeId, `${P} ${w.name}`, (w as any).isDefault === true, companyId, w.key === "CENTRAL" ? "fefo" : "fifo"],
    );
    wh[w.key] = Number(r.rows[0].id);
  }
  const prod: Record<string, number> = {};
  for (const p of PRODUCTS) {
    const r = await pool.query(
      `INSERT INTO products (name, base_currency, price, category, store_id, type, status, availability, sku, stock_quantity)
       VALUES ($1,'DOP',$2,$3,$4,$5,'active','in_stock',$6,0) RETURNING id`,
      [p.name, p.price, p.category, storeId, p.type, `${P}-${p.key}`],
    );
    prod[p.key] = Number(r.rows[0].id);
  }
  const product = (key: string) => PRODUCTS.find((p) => p.key === key)!;
  const supp: Record<string, number> = {};
  for (const s of SUPPLIERS) {
    const r = await pool.query(
      `INSERT INTO suppliers (store_id, name, tax_id, is_active, company_id, payment_terms_days, currency,
                              counterparty_type, default_operation_type, default_expense_type)
       VALUES ($1,$2,$3,true,$4,$5,'DOP',$6,$7,$8) RETURNING id`,
      [storeId, `${P} ${s.name}`, s.rnc, companyId, s.paymentTermsDays, s.counterpartyType, s.operationType, s.expenseType],
    );
    supp[s.key] = Number(r.rows[0].id);
  }
  const supplier = (key: string) => SUPPLIERS.find((s) => s.key === key)!;
  const cust: Record<string, number> = {};
  for (const [i, cu] of CUSTOMERS.entries()) {
    const r = await pool.query(
      `INSERT INTO customers (name, phone, email, store_id, rnc, company_id, category)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [cu.name, `8${String(hash(P) % 1000).padStart(3, "0")}55${String(i).padStart(4, "0")}`, `${P.toLowerCase()}${cu.key.toLowerCase()}@clientes.do`,
       storeId, cu.rnc ?? null, companyId, cu.creditDays > 0 ? "credito" : "contado"],
    );
    cust[cu.key] = Number(r.rows[0].id);
    await pool.query(
      `INSERT INTO customer_pricing_terms (customer_id, store_id, credit_days, credit_limit, itbis_retention_percent, isr_retention_percent, valid_from)
       VALUES ($1,$2,$3,$4,$5,$6,'2026-01-01')`,
      [cust[cu.key], storeId, cu.creditDays, cu.creditLimit, cu.itbisRetentionPercent ?? "0", cu.isrRetentionPercent ?? "0"],
    );
  }
  const customer = (key: string) => CUSTOMERS.find((c) => c.key === key)!;
  await tx(async (c) => {
    for (const [type, from, to] of NCF_RANGES) {
      await c.query(
        `INSERT INTO ncf_sequences (company_id, ncf_type, is_ecf, range_from, range_to, next_number, expiry_date)
         VALUES ($1,$2,false,$3,$4,$3,'2027-12-31')`,
        [companyId, type, from, to],
      );
    }
  });
  const bank: Record<"BRV" | "POP", number> = {} as any;
  await tx(async (c) => {
    for (const b of BANKS) {
      bank[b.key] = await new Treasury(c).openAccount({
        companyId, code: `${b.code}`, name: b.name, bankName: b.bankName, accountNumber: b.accountNumber,
      });
    }
  });
  // Approval policy: purchase orders from RD$500,000 need the general manager;
  // requisitions need the warehouse's superior. Commission: 3% of net sales for
  // sellers, +10% bonus over a RD$400,000 monthly goal.
  await pool.query(
    `INSERT INTO approval_rules (store_id, document_type, min_amount, approver_user_id, required_approvals, priority, notes)
     VALUES ($1,'purchase_order',500000,$2,1,10,'OC ≥ 500k: gerente general'),
            ($1,'requisition',0,$3,1,10,'Requisiciones: comprador')`,
    [storeId, user.gerente, user.comprador],
  );
  await pool.query(
    `INSERT INTO commission_rules (store_id, company_id, code, name, calculation_base, scope_type, scope_role, percent_rate, goal_amount, bonus_percent, valid_from, priority)
     VALUES ($1,$2,$3,'Comisión vendedores 3%','revenue','by_role','seller',3,400000,10,'2026-01-01',10)`,
    [storeId, companyId, `${P}-COM3`],
  );
  await pool.query(
    `INSERT INTO promotions (store_id, code, name, promotion_type, discount_percent, applies_to, scope_product_ids, valid_from, valid_to, is_active)
     VALUES ($1,$2,'Oferta café 10%','percent_off',10,'product',$3,'2026-10-20','2026-10-31',true),
            ($1,$4,'2x1 galletas (lleve 2 pague 1 en cajas de 24)','bogo',NULL,'product',$5,'2026-10-20','2026-10-31',true)`,
    [storeId, `${P}-CAFE10`, [prod.P03], `${P}-GAL2X1`, [prod.P06]],
  );
  await pool.query(
    `UPDATE promotions SET buy_quantity=1, get_quantity=1 WHERE store_id=$1 AND code=$2`,
    [storeId, `${P}-GAL2X1`],
  );
  log("D00-MAE-01", `${WAREHOUSES.length} almacenes, ${PRODUCTS.length} productos, ${CUSTOMERS.length} clientes, ${SUPPLIERS.length} proveedores, NCF, bancos, reglas de aprobación, comisión y 2 ofertas`);

  // ── D00 — hiring by department ─────────────────────────────────────────────
  const emp: Record<string, number> = {};
  const cp = cedulaPrefix(P);
  for (const e of EMPLOYEES) {
    const hired = await hireEmployee(pool as any, {
      storeId, userId: e.user ? user[e.user] : undefined, firstName: e.firstName, lastName: e.lastName,
      cedula: `${cp}${e.cedula.slice(3)}`, hireDate: e.hireDate, department: e.department, positionTitle: e.position,
      monthlySalary: e.salary, contractType: "indefinite", paymentFrequency: "monthly", paymentMethod: "transfer",
    });
    emp[e.key] = await tx((c) => syncPayrollEmployee(c, companyId, Number((hired as any).id)));
  }
  log("D00-RH-01", `${EMPLOYEES.length} empleados contratados en ${new Set(EMPLOYEES.map((e) => e.department)).size} departamentos`);

  // ── D01 — opening balances and fixed assets ────────────────────────────────
  await tx(async (c) => {
    const t = new Treasury(c);
    await t.recordMovement({ companyId, bankAccountId: bank.BRV, txnDate: OCT(1), direction: "in", amount: "6000000", kind: "deposit",
      counterpartyAccountRef: "3.1.01.001", memo: "Aporte de capital de los socios", reference: "CAP-001" });
    await t.transfer({ companyId, fromBankAccountId: bank.BRV, toBankAccountId: bank.POP, date: OCT(1), amount: "1500000", reference: "TRF-BRV-POP-01" });
    await t.recordMovement({ companyId, bankAccountId: bank.BRV, txnDate: OCT(1), direction: "out", amount: "30000", kind: "withdrawal",
      counterpartyAccountRef: "1.1.01.001", memo: "Fondo de cambio de caja", reference: "CH-0001" });
    await t.recordMovement({ companyId, bankAccountId: bank.BRV, txnDate: OCT(1), direction: "out", amount: "20000", kind: "withdrawal",
      counterpartyAccountRef: "1.1.01.002", memo: "Fondo de caja chica", reference: "CH-0002" });
  });
  const truck = await tx((c) => new Payables(c).registerInvoice({
    companyId, supplierId: supp.V07, supplierRnc: supplier("V07").rnc, ncf: "B0100007001", ncfType: "B01", date: OCT(1), dueDate: OCT(15),
    purchaseType: "fixed_asset", fixedAsset: { code: `${P}-VEH-01`, name: "Camión de reparto Isuzu NPR", usefulLifeMonths: 60, residualValue: "200000", category: "Vehículos", assetAccount: "1.2.01.002" },
    lines: [{ description: "Camión Isuzu NPR 2026", quantity: "1", unitPrice: "2200000", taxCode: "ITBIS18" }],
  }));
  ids.truckInvoice = truck.documentId;
  await tx((c) => new FixedAssets(c).register({
    companyId, code: `${P}-MOB-01`, name: "Mobiliario de oficina (aporte en especie)", category: "Mobiliario", acquisitionDate: OCT(1),
    cost: "150000", usefulLifeMonths: 60, assetAccountCode: "1.2.01.001", capitalizeAgainstAccount: "3.1.01.001",
  }));
  log("D01-TES-01", "capital RD$6,000,000, transferencia a Popular, fondos de caja; camión (CxP) y mobiliario (aporte) registrados");

  // ── D02 — requisition → RFQ → purchase orders with approval ───────────────
  const requisition = await createRequisition(pool as any, {
    storeId, department: "Almacén y Logística", requestedBy: user.almacenista, warehouseId: wh.CENTRAL, neededBy: OCT(5),
    reason: "Reposición para inicio de operaciones",
    lines: [{ productName: product("P08").name, productId: prod.P08, quantity: 20, estimatedUnitCost: 18500 }],
  } as any);
  await submitRequisition(pool as any, Number((requisition as any).id));
  const reqApproval = await pool.query(`SELECT id FROM approval_requests WHERE store_id=$1 AND document_type='requisition' AND document_id=$2`, [storeId, String((requisition as any).id)]);
  // The requester cannot approve their own requisition.
  facts.selfApprovalRefused = await resolveApproval(pool as any, Number(reqApproval.rows[0].id), user.almacenista, "approve").then(() => false, () => true);
  await resolveApproval(pool as any, Number(reqApproval.rows[0].id), user.comprador, "approve");
  const reqSynced = await syncApprovalStatus(pool as any, Number((requisition as any).id));
  facts.requisitionStatus = (reqSynced as any).status;

  const rfq = await createRfq(pool as any, { storeId, title: "Neveras 10 pies x20", requestedBy: user.comprador, validUntil: OCT(4),
    lines: [{ productId: prod.P08, productName: product("P08").name, quantity: 20 }] } as any);
  const q1 = await addSupplierQuote(pool as any, { rfqId: Number((rfq as any).id), supplierId: supp.V02, supplierName: supplier("V02").name,
    lines: [{ productName: product("P08").name, quantity: 20, unitPrice: 18500 }] } as any);
  await addSupplierQuote(pool as any, { rfqId: Number((rfq as any).id), supplierName: `${P} Otro proveedor`, lines: [{ productName: product("P08").name, quantity: 20, unitPrice: 19250 }] } as any);
  await awardQuote(pool as any, Number((q1 as any).id));

  const po1 = await tx((c) => createPurchaseOrder(c, {
    companyId, storeId, userId: user.comprador, supplierId: supp.V01, warehouseId: wh.CENTRAL, orderDate: OCT(2), expectedDate: OCT(3), paymentTerms: "30 días",
    items: [
      { productId: prod.P01, productName: product("P01").name, quantity: "200", unitCost: "1150", taxRate: "0" },
      { productId: prod.P02, productName: product("P02").name, quantity: "300", unitCost: "520", taxRate: "18" },
      { productId: prod.P03, productName: product("P03").name, quantity: "250", unitCost: "260", taxRate: "16" },
      { productId: prod.P04, productName: product("P04").name, quantity: "150", unitCost: "610", taxRate: "0" },
      { productId: prod.P05, productName: product("P05").name, quantity: "200", unitCost: "480", taxRate: "18" },
      { productId: prod.P06, productName: product("P06").name, quantity: "180", unitCost: "350", taxRate: "18" },
      { productId: prod.P07, productName: product("P07").name, quantity: "300", unitCost: "410", taxRate: "18" },
    ],
  }));
  const po2 = await tx((c) => createPurchaseOrder(c, {
    companyId, storeId, userId: user.comprador, supplierId: supp.V02, warehouseId: wh.CENTRAL, orderDate: OCT(2), expectedDate: OCT(3),
    requisitionId: Number((requisition as any).id), supplierQuoteId: Number((q1 as any).id),
    items: [
      { productId: prod.P08, productName: product("P08").name, quantity: "20", unitCost: "18500", taxRate: "18" },
      { productId: prod.P09, productName: product("P09").name, quantity: "15", unitCost: "24000", taxRate: "18", discountRate: "5" },
      { productId: prod.P10, productName: product("P10").name, quantity: "60", unitCost: "2100", taxRate: "18" },
    ],
  }));
  const po3 = await tx((c) => createPurchaseOrder(c, {
    companyId, storeId, userId: user.comprador, supplierId: supp.V08, warehouseId: wh.CENTRAL, orderDate: OCT(2),
    items: [{ productId: prod.SUM01, productName: product("SUM01").name, quantity: "100", unitCost: "280", taxRate: "18" }],
  }));
  ids.po1 = po1.id; ids.po2 = po2.id; ids.po3 = po3.id;
  facts.po1Total = po1.totals.total; facts.po2Total = po2.totals.total;
  for (const po of [po1, po2, po3]) {
    const s = await tx((c) => submitPurchaseOrder(c, { companyId, storeId, purchaseOrderId: po.id, userId: user.comprador }));
    if (s.approvalStatus === "pending") {
      // Receiving before approval is refused.
      if (po.id === po1.id) {
        facts.receiveBeforeApprovalRefused = await tx((c) => receivePurchaseOrder(c, {
          companyId, purchaseOrderId: po.id, date: OCT(2), lines: [{ purchaseOrderItemId: 1, quantity: "1" }],
        })).then(() => false, () => true);
      }
      await resolveApproval(pool as any, s.approvalRequestId!, user.gerente, "approve");
      await tx((c) => syncPurchaseOrderApproval(c, { companyId, storeId, purchaseOrderId: po.id }));
    }
  }
  log("D02-COM-01", `requisición → RFQ (2 cotizaciones, adjudicada) → OC ${po1.purchaseNumber} (${po1.totals.total}), ${po2.purchaseNumber} (${po2.totals.total}), ${po3.purchaseNumber}; aprobación del gerente`);

  const items = async (poId: number) =>
    Object.fromEntries((await pool.query(`SELECT id, product_id FROM purchase_order_items WHERE purchase_order_id=$1`, [poId])).rows
      .map((r: any) => [PRODUCTS.find((p) => prod[p.key] === Number(r.product_id))!.key, Number(r.id)]));
  const po1Items = await items(po1.id);
  const po2Items = await items(po2.id);
  const po3Items = await items(po3.id);
  const method = (key: string) => ({ method: product(key).method, inventoryAccountRef: product(key).inventoryAccount });

  // ── D03 — receipts: PO-1 at 60 %, PO-2 and PO-3 in full ────────────────────
  const rec1 = await tx((c) => receivePurchaseOrder(c, {
    companyId, purchaseOrderId: po1.id, date: OCT(3), userId: user.almacenista,
    lines: [
      { purchaseOrderItemId: po1Items.P01, quantity: "120", ...method("P01") },
      { purchaseOrderItemId: po1Items.P02, quantity: "180", ...method("P02") },
      { purchaseOrderItemId: po1Items.P03, quantity: "150", ...method("P03") },
      { purchaseOrderItemId: po1Items.P04, quantity: "90", lotNo: "LCH-2610", expirationDate: "2027-03-31", ...method("P04") },
      { purchaseOrderItemId: po1Items.P05, quantity: "120", ...method("P05") },
      { purchaseOrderItemId: po1Items.P06, quantity: "100", lotNo: "GAL-A", expirationDate: "2026-12-15", ...method("P06") },
      { purchaseOrderItemId: po1Items.P07, quantity: "180", ...method("P07") },
    ],
  }));
  const rec2 = await tx((c) => receivePurchaseOrder(c, {
    companyId, purchaseOrderId: po2.id, date: OCT(3), userId: user.almacenista,
    lines: [
      { purchaseOrderItemId: po2Items.P08, quantity: "20", ...method("P08") },
      { purchaseOrderItemId: po2Items.P09, quantity: "15", ...method("P09") },
      { purchaseOrderItemId: po2Items.P10, quantity: "60", ...method("P10") },
    ],
  }));
  await tx((c) => receivePurchaseOrder(c, {
    companyId, purchaseOrderId: po3.id, date: OCT(3), userId: user.almacenista,
    lines: [{ purchaseOrderItemId: po3Items.SUM01, quantity: "100", ...method("SUM01") }],
  }));
  facts.rec1Status = rec1.poStatus; facts.rec2Status = rec2.poStatus;
  // Receiving more than ordered is refused.
  facts.overReceiptRefused = await tx((c) => receivePurchaseOrder(c, {
    companyId, purchaseOrderId: po1.id, date: OCT(4), lines: [{ purchaseOrderItemId: po1Items.P01, quantity: "81" }],
  })).then(() => false, () => true);
  log("D03-INV-01", `recepción parcial ${rec1.receiptNo} (${rec1.totalCost}) y total ${rec2.receiptNo}; sobre-recepción rechazada=${facts.overReceiptRefused}`);

  // ── D05 — second delivery, supplier invoices (three-way match), rent ──────
  const rec4 = await tx((c) => receivePurchaseOrder(c, {
    companyId, purchaseOrderId: po1.id, date: OCT(5), userId: user.almacenista,
    lines: [
      { purchaseOrderItemId: po1Items.P01, quantity: "80" },
      { purchaseOrderItemId: po1Items.P02, quantity: "120" },
      { purchaseOrderItemId: po1Items.P03, quantity: "100" },
      { purchaseOrderItemId: po1Items.P04, quantity: "60", lotNo: "LCH-2611", expirationDate: "2027-04-30" },
      { purchaseOrderItemId: po1Items.P05, quantity: "80" },
      { purchaseOrderItemId: po1Items.P06, quantity: "80", lotNo: "GAL-B", expirationDate: "2027-01-20" },
      { purchaseOrderItemId: po1Items.P07, quantity: "120" },
    ],
  }));
  facts.rec4Status = rec4.poStatus;
  const inv1 = await tx((c) => new Payables(c).registerInvoice({
    companyId, supplierId: supp.V01, supplierRnc: supplier("V01").rnc, ncf: "B0100001001", ncfType: "B01", date: OCT(5), dueDate: OCT(31),
    purchaseOrderId: po1.id,
    lines: [
      { description: product("P01").name, quantity: "200", unitPrice: "1150", taxCode: "EXENTO", productId: prod.P01, purchaseOrderItemId: po1Items.P01 },
      // Billed at 525 against an agreed 520: a RD$1,500 purchase price variance.
      { description: product("P02").name, quantity: "300", unitPrice: "525", taxCode: "ITBIS18", productId: prod.P02, purchaseOrderItemId: po1Items.P02 },
      { description: product("P03").name, quantity: "250", unitPrice: "260", taxCode: "ITBIS16", productId: prod.P03, purchaseOrderItemId: po1Items.P03 },
      { description: product("P04").name, quantity: "150", unitPrice: "610", taxCode: "EXENTO", productId: prod.P04, purchaseOrderItemId: po1Items.P04 },
      { description: product("P05").name, quantity: "200", unitPrice: "480", taxCode: "ITBIS18", productId: prod.P05, purchaseOrderItemId: po1Items.P05 },
      { description: product("P06").name, quantity: "180", unitPrice: "350", taxCode: "ITBIS18", productId: prod.P06, purchaseOrderItemId: po1Items.P06 },
      { description: product("P07").name, quantity: "300", unitPrice: "410", taxCode: "ITBIS18", productId: prod.P07, purchaseOrderItemId: po1Items.P07 },
    ],
  }));
  const inv2 = await tx((c) => new Payables(c).registerInvoice({
    companyId, supplierId: supp.V02, supplierRnc: supplier("V02").rnc, ncf: "B0100002001", ncfType: "B01", date: OCT(5), dueDate: NOV(19),
    purchaseOrderId: po2.id,
    lines: [
      { description: product("P08").name, quantity: "20", unitPrice: "18500", taxCode: "ITBIS18", productId: prod.P08, purchaseOrderItemId: po2Items.P08 },
      { description: product("P09").name, quantity: "15", unitPrice: "24000", discount: "18000", taxCode: "ITBIS18", productId: prod.P09, purchaseOrderItemId: po2Items.P09 },
      { description: product("P10").name, quantity: "60", unitPrice: "2100", taxCode: "ITBIS18", productId: prod.P10, purchaseOrderItemId: po2Items.P10 },
    ],
  }));
  const inv3 = await tx((c) => new Payables(c).registerInvoice({
    companyId, supplierId: supp.V08, supplierRnc: supplier("V08").rnc, ncf: "B0100008001", ncfType: "B01", date: OCT(5), dueDate: NOV(4),
    purchaseOrderId: po3.id,
    lines: [{ description: product("SUM01").name, quantity: "100", unitPrice: "280", taxCode: "ITBIS18", productId: prod.SUM01, purchaseOrderItemId: po3Items.SUM01 }],
  }));
  const rent = await tx((c) => new Payables(c).registerInvoice({
    companyId, supplierId: supp.V04, supplierRnc: supplier("V04").rnc, ncf: "B1100000001", ncfType: "B11", date: OCT(5), dueDate: OCT(10),
    purchaseType: "expense", expenseAccountCode: "5.2.02.001", applyRetentions: true, retentionConcept: "alquileres",
    lines: [{ description: "Alquiler local octubre 2026", quantity: "1", unitPrice: "60000", taxCode: "ITBIS18" }],
  }));
  ids.inv1 = inv1.documentId; ids.inv2 = inv2.documentId; ids.inv3 = inv3.documentId; ids.rent = rent.documentId;
  facts.inv1Total = inv1.total; facts.inv2Total = inv2.total;
  await tx((c) => new Payables(c).registerPayment({
    companyId, supplierId: supp.V07, paymentDate: OCT(5), amount: "2596000", bankAccountId: bank.BRV, reference: "CH-0003",
    applications: [{ openItemId: truck.openItemId, amount: "2596000" }],
  }));
  log("D05-CXP-01", `facturas de proveedor casadas con recepciones (variación de precio P02), alquiler con retenciones, pago del camión`);

  // ── D06 — transfers and freight ────────────────────────────────────────────
  const transfer = async (from: WarehouseKey, to: WarehouseKey, date: string, lines: Array<[string, string]>) =>
    tx(async (c) => {
      const costing = new InventoryCosting(c);
      for (const [key, qty] of lines) {
        await costing.transfer({ companyId, productId: prod[key], date, quantity: qty, fromWarehouseId: wh[from], toWarehouseId: wh[to],
          sourceType: "warehouse_transfer", sourceId: `${from}-${to}-${date}`, postedBy: user.almacenista });
      }
    });
  await transfer("CENTRAL", "TIENDA", OCT(6), [["P01", "30"], ["P02", "50"], ["P03", "40"], ["P04", "20"], ["P05", "30"], ["P06", "30"], ["P07", "60"], ["P10", "10"]]);
  await transfer("CENTRAL", "SANTIAGO", OCT(6), [["P02", "60"], ["P07", "60"], ["P08", "6"], ["P09", "5"], ["P10", "15"]]);
  const freight = await tx((c) => new Payables(c).registerInvoice({
    companyId, supplierId: supp.V03, supplierRnc: supplier("V03").rnc, ncf: "B1100000002", ncfType: "B11", date: OCT(6), dueDate: OCT(20),
    purchaseType: "expense", expenseAccountCode: "5.2.02.005", applyRetentions: true, retentionConcept: "otras_rentas",
    lines: [{ description: "Flete Santo Domingo – Santiago", quantity: "1", unitPrice: "12000", taxCode: "ITBIS18" }],
  }));
  ids.freight = freight.documentId;
  log("D06-INV-02", "transferencias Central→Tienda y Central→Santiago (sin asiento), flete con retención a persona física");

  // ── D07 onwards — sales ────────────────────────────────────────────────────
  const issuer = opts.rnc;
  const sale = async (tag: string, input: Omit<CheckoutInput, "companyId" | "storeId" | "issuerRnc">) => {
    const r = await tx((c) => checkout(c, { companyId, storeId, issuerRnc: issuer, ...input }));
    ids[tag] = r.documentId;
    facts[`${tag}Total`] = r.total;
    return r;
  };
  const line = (key: string, qty: string, discount?: string) => ({
    productId: product(key).type === "service" ? undefined : prod[key],
    description: product(key).name, quantity: qty, unitPrice: product(key).price, discount, taxCode: product(key).taxCode,
  });

  const s1 = await sale("S1", { warehouseId: wh.CENTRAL, ncfType: "B01", date: OCT(7), paymentMethod: "credit", customerId: cust.C01,
    buyerRnc: customer("C01").rnc, buyerName: customer("C01").name, sellerUserId: user.vendedor1, userId: user.vendedor1,
    lines: [line("P01", "40"), line("P02", "60", "2160"), line("P07", "50")] });
  const s2 = await sale("S2", { warehouseId: wh.TIENDA, ncfType: "B02", date: OCT(7), paymentMethod: "cash", customerId: cust.C05, userId: user.cajera,
    lines: [line("P02", "5"), line("P05", "3"), line("P01", "2")] });
  // A quote accepted by the hotel becomes the invoice without retyping it.
  const quote = await createQuote(pool as any, { storeId, customerId: cust.C03, customerName: customer("C03").name, customerRnc: customer("C03").rnc,
    warehouseId: wh.CENTRAL, salespersonId: user.vendedor2, validUntil: OCT(15),
    lines: [
      { productId: prod.P08, productName: product("P08").name, quantity: 2, unitPrice: 26900 },
      { productId: prod.P10, productName: product("P10").name, quantity: 5, unitPrice: 3250, discountPercent: 10 },
    ] } as any);
  await updateQuoteStatus(pool as any, Number((quote as any).id), "accepted" as any);
  const s3 = await tx((c) => checkoutFromQuote(c, {
    companyId, storeId, issuerRnc: issuer, quoteId: Number((quote as any).id), warehouseId: wh.CENTRAL, ncfType: "B01", date: OCT(8),
    paymentMethod: "credit", userId: user.vendedor2, sellerUserId: user.vendedor2,
    extraLines: [{ description: product("S01").name, quantity: "2", unitPrice: "1500", taxCode: "ITBIS18" }],
  }));
  ids.S3 = s3.documentId; facts.S3Total = s3.total;
  const s4 = await sale("S4", { warehouseId: wh.CENTRAL, ncfType: "B15", date: OCT(9), paymentMethod: "credit", customerId: cust.C04,
    buyerRnc: customer("C04").rnc, buyerName: customer("C04").name, sellerUserId: user.vendedor1, userId: user.vendedor1,
    lines: [line("P05", "50"), line("P03", "60"), line("P06", "40")] });
  // Employee purchase with the 10% staff discount (within policy).
  const s5 = await sale("S5", { warehouseId: wh.TIENDA, ncfType: "B02", date: OCT(9), paymentMethod: "cash", customerId: cust.C06, userId: user.cajera,
    lines: [line("P10", "1", "325")] });
  // A discount above the 10% policy without approval is refused.
  facts.discountAbovePolicyRefused = await tx((c) => checkout(c, { companyId, storeId, issuerRnc: issuer, warehouseId: wh.TIENDA, ncfType: "B02",
    date: OCT(9), paymentMethod: "cash", customerId: cust.C05, userId: user.cajera, maxDiscountPercent: "10",
    lines: [line("P10", "1", "650")] })).then(() => false, () => true);
  const s6 = await sale("S6", { warehouseId: wh.TIENDA, ncfType: "B01", date: OCT(10), paymentMethod: "credit", customerId: cust.C02,
    buyerRnc: customer("C02").rnc, buyerName: customer("C02").name, sellerUserId: user.vendedor2, userId: user.vendedor2,
    lines: [line("P01", "10"), line("P02", "10"), line("P07", "10")] });
  // Credit limit: RD$122,130 against a RD$80,000 limit is refused and burns no NCF.
  const b01Before = await pool.query(`SELECT next_number FROM ncf_sequences WHERE company_id=$1 AND ncf_type='B01'`, [companyId]);
  facts.creditLimitRefused = await tx((c) => checkout(c, { companyId, storeId, issuerRnc: issuer, warehouseId: wh.CENTRAL, ncfType: "B01", date: OCT(11),
    paymentMethod: "credit", customerId: cust.C07, buyerRnc: customer("C07").rnc, sellerUserId: user.vendedor1, userId: user.vendedor1,
    lines: [line("P09", "3")] })).then(() => false, (e) => /límite de crédito/.test(String(e.message)));
  const b01After = await pool.query(`SELECT next_number FROM ncf_sequences WHERE company_id=$1 AND ncf_type='B01'`, [companyId]);
  facts.ncfNotBurnedOnRefusal = b01Before.rows[0].next_number === b01After.rows[0].next_number;
  const s7 = await sale("S7", { warehouseId: wh.CENTRAL, ncfType: "B01", date: OCT(11), paymentMethod: "credit", customerId: cust.C07,
    buyerRnc: customer("C07").rnc, buyerName: customer("C07").name, sellerUserId: user.vendedor1, userId: user.vendedor1,
    lines: [line("P09", "1")] });
  const s8 = await sale("S8", { warehouseId: wh.TIENDA, ncfType: "B02", date: OCT(12), paymentMethod: "card", customerId: cust.C05, userId: user.cajera,
    lines: [line("P04", "5"), line("P06", "6")] });
  log("D07-VTA-01", `ventas S1–S8: crédito B01, contado B02, cotización→factura, gubernamental B15, descuento de empleado, tarjeta; límite de crédito y descuento fuera de política rechazados`);

  // ── D12 — returns and credit notes ─────────────────────────────────────────
  const r1 = await tx((c) => new FiscalDocumentService(c).issueCreditNote({
    companyId, issuerRnc: issuer, ncfType: "B04", date: OCT(12), modifiesDocId: s1.documentId, restockInventory: true, matchInvoiceLines: true,
    lines: [{ productId: prod.P07, description: product("P07").name, quantity: "5", unitPrice: product("P07").price, taxCode: "ITBIS18" }], postedBy: user.vendedor1,
  }));
  ids.R1 = r1.documentId; facts.R1Total = r1.total;
  facts.overCreditRefused = await tx((c) => new FiscalDocumentService(c).issueCreditNote({
    companyId, issuerRnc: issuer, ncfType: "B04", date: OCT(12), modifiesDocId: s1.documentId, restockInventory: true, matchInvoiceLines: true,
    lines: [{ productId: prod.P07, description: product("P07").name, quantity: "46", unitPrice: product("P07").price, taxCode: "ITBIS18" }],
  })).then(() => false, () => true);
  const s9 = await sale("S9", { warehouseId: wh.SANTIAGO, ncfType: "B01", date: OCT(13), paymentMethod: "credit", customerId: cust.C01,
    buyerRnc: customer("C01").rnc, buyerName: customer("C01").name, sellerUserId: user.vendedor2, userId: user.vendedor2,
    lines: [line("P08", "3"), line("P09", "2", "1380"), line("P02", "40")] });
  const r2 = await tx((c) => new FiscalDocumentService(c).issueCreditNote({
    companyId, issuerRnc: issuer, ncfType: "B04", date: OCT(13), modifiesDocId: s3.documentId,
    lines: [{ description: "Rebaja por empaque golpeado", quantity: "1", unitPrice: "2000", taxCode: "ITBIS18" }], postedBy: user.vendedor2,
  }));
  ids.R2 = r2.documentId;
  // An invoice issued to the wrong customer is voided (608) and reissued.
  const s10 = await sale("S10", { warehouseId: wh.CENTRAL, ncfType: "B01", date: OCT(14), paymentMethod: "credit", customerId: cust.C01,
    buyerRnc: customer("C01").rnc, buyerName: customer("C01").name, sellerUserId: user.vendedor2, userId: user.vendedor2, lines: [line("P07", "20")] });
  await tx((c) => new FiscalDocumentService(c).cancel(s10.documentId, "Emitida al cliente equivocado", user.contador, companyId));
  const s10b = await sale("S10B", { warehouseId: wh.CENTRAL, ncfType: "B01", date: OCT(14), paymentMethod: "credit", customerId: cust.C03,
    buyerRnc: customer("C03").rnc, buyerName: customer("C03").name, sellerUserId: user.vendedor2, userId: user.vendedor2, lines: [line("P07", "20")] });
  log("D12-DEV-01", `NC con reingreso a costo original, sobre-crédito rechazado, NC de rebaja sin reingreso, anulación y reemisión`);

  // ── D15 — collections, card settlement, deposits, damaged goods ────────────
  const itemOf = async (docId: number) =>
    (await pool.query(`SELECT id, balance::text FROM ar_open_items WHERE company_id=$1 AND document_id=$2`, [companyId, docId])).rows[0];
  const s1ItemFirst = await itemOf(s1.documentId);
  await tx((c) => new Receivables(c).registerReceipt({ companyId, customerId: cust.C01, receiptDate: OCT(15), amount: "50000", bankAccountId: bank.BRV,
    reference: "DEP-C01-001", applications: [{ openItemId: Number(s1ItemFirst.id), amount: "50000" }] }));
  const cardFee = roundTo(mul(s8.total, "0.03"), 2);
  await tx(async (c) => {
    await new Treasury(c).recordMovement({ companyId, bankAccountId: bank.POP, txnDate: OCT(15), direction: "in", amount: toMoney(sub(s8.total, cardFee)),
      kind: "deposit", counterpartyAccountRef: "1.1.01.004", memo: "Liquidación tarjetas 12-oct", reference: "LIQ-VISA-1012" });
    await new PostingEngine(c).postManual({ companyId, entryDate: OCT(15), memo: "Comisión adquirente 3%", reference: "LIQ-VISA-1012-FEE",
      lines: [{ accountCode: "5.3.01.002", debit: toMoney(cardFee) }, { accountCode: "1.1.01.004", credit: toMoney(cardFee) }] });
    await new Treasury(c).recordMovement({ companyId, bankAccountId: bank.BRV, txnDate: OCT(8), direction: "in", amount: toMoney(s2.total),
      kind: "deposit", counterpartyAccountRef: "1.1.01.001", memo: "Depósito ventas contado 7-oct", reference: "DEP-CAJA-1007" });
    await new Treasury(c).recordMovement({ companyId, bankAccountId: bank.BRV, txnDate: OCT(10), direction: "in", amount: toMoney(s5.total),
      kind: "deposit", counterpartyAccountRef: "1.1.01.001", memo: "Depósito ventas contado 9-oct", reference: "DEP-CAJA-1009" });
    await new Treasury(c).recordMovement({ companyId, bankAccountId: bank.BRV, txnDate: OCT(10), direction: "out", amount: "3000",
      kind: "payment", counterpartyAccountRef: "1.1.05.001", memo: "Avance de salario Félix Reyes", reference: "AV-E09" });
  });
  await tx((c) => new Payables(c).registerPayment({ companyId, supplierId: supp.V04, paymentDate: OCT(10), amount: "54000", bankAccountId: bank.BRV,
    reference: "CH-0004", applications: [{ openItemId: rent.openItemId, amount: "54000" }] }));
  await tx((c) => new Payables(c).registerPayment({ companyId, supplierId: supp.V01, paymentDate: OCT(15), amount: "400000", bankAccountId: bank.POP,
    reference: "TRF-V01-01", applications: [{ openItemId: inv1.openItemId, amount: "400000" }] }));
  await transfer("CENTRAL", "AVERIAS", OCT(15), [["P06", "10"]]);
  const pr = await pool.query(
    `INSERT INTO purchase_returns (store_id, return_number, supplier_id, supplier_name, purchase_order_id, return_date, reason, status, created_by, company_id)
     VALUES ($1,$2,$3,$4,$5,$6,'Cajas golpeadas y húmedas','draft',$7,$8) RETURNING id`,
    [storeId, `${P}-DEV-0001`, supp.V01, supplier("V01").name, po1.id, OCT(16), user.almacenista, companyId],
  );
  await pool.query(
    `INSERT INTO purchase_return_lines (return_id, product_id, product_name, quantity, unit_cost, line_total, warehouse_id)
     VALUES ($1,$2,$3,10,350,3500,$4)`,
    [pr.rows[0].id, prod.P06, product("P06").name, wh.AVERIAS],
  );
  const ret = await tx((c) => completeReturnWithCreditNote(c, {
    companyId, storeId, returnId: Number(pr.rows[0].id), userId: user.comprador, supplierNcf: "B0400000501", modifiesDocumentId: inv1.documentId, date: OCT(16),
  }));
  ids.supplierCreditNote = ret.creditNoteDocumentId; facts.supplierCreditTotal = ret.total; facts.supplierCreditStockCost = ret.stockCost;
  const s11 = await sale("S11", { warehouseId: wh.CENTRAL, ncfType: "B01", date: OCT(16), paymentMethod: "credit", customerId: cust.C01,
    buyerRnc: customer("C01").rnc, buyerName: customer("C01").name, sellerUserId: user.vendedor1, userId: user.vendedor1,
    lines: [line("P01", "60"), line("P05", "40"), line("P03", "50")] });
  const s3Item = await itemOf(s3.documentId);
  await tx((c) => new Receivables(c).registerReceipt({ companyId, customerId: cust.C03, receiptDate: OCT(17), amount: s3Item.balance, bankAccountId: bank.BRV,
    reference: "DEP-C03-001", applications: [{ openItemId: Number(s3Item.id), amount: s3Item.balance }] }));
  log("D15-CXC-01", `cobros por banco, liquidación de tarjeta con comisión, depósitos de caja, pagos a proveedores, devolución de averías con NC del proveedor`);

  // ── D18 — cycle count, manual adjustment, supplies, computers ─────────────
  const count = await tx((c) => createCount(c, { companyId, warehouseId: wh.SANTIAGO, countDate: OCT(18), countType: "cycle", isBlind: true,
    productIds: [prod.P02, prod.P07, prod.P10], userId: user.almacenista, name: "Conteo cíclico Santiago" }));
  const countId = Number((count as any).id ?? (count as any).countId);
  const sheet = await tx((c) => getCount(c, companyId, countId));
  const counted: Record<string, string> = { P02: "20", P07: "58", P10: "16" };
  await tx((c) => recordCounts(c, companyId, countId, (sheet as any).lines.map((l: any) => ({
    lineId: Number(l.id), countedQty: counted[PRODUCTS.find((p) => prod[p.key] === Number(l.product_id ?? l.productId))!.key],
    reason: "conteo cíclico",
  })), user.almacenista));
  await tx((c) => submitForReview(c, companyId, countId, user.almacenista));
  const applied = await tx((c) => applyCount(c, companyId, countId, { userId: user.contador }));
  facts.countShortage = applied.shortageValue; facts.countSurplus = applied.surplusValue;
  const adj = await tx((c) => applyStockAdjustment(c, { companyId, storeId, userId: user.almacenista, warehouseId: wh.TIENDA, date: OCT(18),
    notes: "Detergente roto en exhibición", items: [{ productId: prod.P05, realStock: "26", reason: "avería" }] }));
  facts.manualAdjustment = adj;
  await tx((c) => new InventoryCosting(c).issue({ companyId, productId: prod.SUM01, date: OCT(20), quantity: "15", warehouseId: wh.CENTRAL,
    sourceType: "supplies_consumption", sourceId: "OCT-ADM", postedBy: user.contador }));
  const computers = await tx((c) => new Payables(c).registerInvoice({
    companyId, supplierId: supp.V09, supplierRnc: supplier("V09").rnc, ncf: "B0100009001", ncfType: "B01", date: OCT(18), dueDate: NOV(17),
    purchaseType: "fixed_asset", fixedAsset: { code: `${P}-CMP-01`, name: "Computadoras de oficina (6)", usefulLifeMonths: 36, category: "Cómputo", assetAccount: "1.2.01.004" },
    lines: [{ description: "Computadora de escritorio", quantity: "6", unitPrice: "30000", taxCode: "ITBIS18" }],
  }));
  ids.computers = computers.documentId;
  log("D18-INV-03", `conteo cíclico ciego (faltante ${applied.shortageValue}, sobrante ${applied.surplusValue}), ajuste manual por avería, consumo de suministros, compra de computadoras`);

  // ── D20 — more sales (promotions), withholdings, supplier payments ────────
  const s12 = await sale("S12", { warehouseId: wh.CENTRAL, ncfType: "B01", date: OCT(20), paymentMethod: "credit", customerId: cust.C03,
    buyerRnc: customer("C03").rnc, buyerName: customer("C03").name, sellerUserId: user.vendedor1, userId: user.vendedor1,
    lines: [line("P09", "3"), line("P08", "2")] });
  const s4Item = await itemOf(s4.documentId);
  const s4Doc = (await pool.query(`SELECT subtotal_taxed::text, subtotal_exempt::text, (itbis_18+itbis_16)::text AS itbis FROM fiscal_documents WHERE id=$1`, [s4.documentId])).rows[0];
  const whItbis = roundTo(mul(s4Doc.itbis, "0.30"), 2);
  const whIsr = roundTo(mul(add(s4Doc.subtotal_taxed, s4Doc.subtotal_exempt), "0.05"), 2);
  const s4Cash = sub(s4Item.balance, add(whItbis, whIsr));
  await tx((c) => new Receivables(c).registerReceipt({ companyId, customerId: cust.C04, receiptDate: OCT(20), amount: toMoney(s4Cash), bankAccountId: bank.BRV,
    withholdingItbis: toMoney(whItbis), withholdingIsr: toMoney(whIsr), reference: "LIB-MINERD-001",
    applications: [{ openItemId: Number(s4Item.id), amount: s4Item.balance }] }));
  facts.govWithholdingItbis = whItbis; facts.govWithholdingIsr = whIsr;
  await tx((c) => new Payables(c).registerPayment({ companyId, supplierId: supp.V02, paymentDate: OCT(20), amount: toMoney(inv2.total), bankAccountId: bank.POP,
    reference: "TRF-V02-01", applications: [{ openItemId: inv2.openItemId, amount: toMoney(inv2.total) }] }));
  const freightItem = (await pool.query(`SELECT balance::text FROM ap_open_items WHERE id=$1`, [freight.openItemId])).rows[0].balance;
  await tx((c) => new Payables(c).registerPayment({ companyId, supplierId: supp.V03, paymentDate: OCT(20), amount: freightItem, bankAccountId: bank.POP,
    reference: "TRF-V03-01", applications: [{ openItemId: freight.openItemId, amount: freightItem }] }));
  await tx((c) => new PostingEngine(c).postManual({ companyId, entryDate: OCT(20), memo: "Gastos menores de caja chica (combustible y útiles)", reference: `${P}-CCH-01`,
    lines: [{ accountCode: "5.2.02.004", debit: "1200" }, { accountCode: "1.1.01.002", credit: "1200" }] }));
  const s13 = await sale("S13", { warehouseId: wh.TIENDA, ncfType: "B02", date: OCT(22), paymentMethod: "cash", customerId: cust.C05, userId: user.cajera,
    applyPromotions: true, lines: [line("P07", "12"), line("P03", "10"), line("P01", "5"), line("P06", "4")] });
  facts.S13Discounts = (await pool.query(`SELECT coalesce(sum(discount),0)::text d FROM fiscal_document_lines WHERE document_id=$1`, [s13.documentId])).rows[0].d;
  await tx((c) => new Treasury(c).recordMovement({ companyId, bankAccountId: bank.BRV, txnDate: OCT(23), direction: "in", amount: toMoney(s13.total),
    kind: "deposit", counterpartyAccountRef: "1.1.01.001", memo: "Depósito ventas contado 22-oct", reference: "DEP-CAJA-1022" }));
  const adv = await tx((c) => new Receivables(c).registerAdvance({ companyId, customerId: cust.C02, date: OCT(22), amount: "20000", bankAccountId: bank.BRV, reference: "ANT-C02-01" }));
  log("D20-VTA-02", `venta con ofertas (café 10% y 2x1 galletas: descuento ${facts.S13Discounts}), cobro gubernamental con retenciones, anticipo de cliente`);

  // ── D25 — expenses, debit note, advance application ───────────────────────
  const power = await tx((c) => new Payables(c).registerInvoice({
    companyId, supplierId: supp.V05, supplierRnc: supplier("V05").rnc, ncf: "B0100005001", ncfType: "B01", date: OCT(25), dueDate: NOV(14),
    purchaseType: "expense", expenseAccountCode: "5.2.02.002",
    lines: [{ description: "Energía eléctrica septiembre–octubre", quantity: "1", unitPrice: "18500", taxCode: "ITBIS18" }],
  }));
  await tx((c) => new Payables(c).registerInvoice({
    companyId, supplierId: supp.V06, supplierRnc: supplier("V06").rnc, ncf: "B0100006001", ncfType: "B01", date: OCT(25), dueDate: NOV(24),
    purchaseType: "service", expenseAccountCode: "5.2.02.003", applyRetentions: true,
    lines: [{ description: "Honorarios revisión de cierre", quantity: "1", unitPrice: "45000", taxCode: "ITBIS18" }],
  }));
  const d1 = await tx((c) => new FiscalDocumentService(c).issueDebitNote({ companyId, issuerRnc: issuer, ncfType: "B03", date: OCT(25), modifiesDocId: s6.documentId,
    paymentMethod: "credit", reason: "Flete de entrega no facturado",
    lines: [{ description: "Flete de entrega no facturado", quantity: "1", unitPrice: "800", taxCode: "ITBIS18" }] }));
  ids.D1 = d1.documentId;
  await tx((c) => new Receivables(c).applyAdvance({ companyId, receiptId: adv.receiptId, openItemId: Number((s6 as any).openItemId), amount: "20000", date: OCT(26) }));
  const s14 = await sale("S14", { warehouseId: wh.CENTRAL, ncfType: "B15", date: OCT(27), paymentMethod: "credit", customerId: cust.C04,
    buyerRnc: customer("C04").rnc, buyerName: customer("C04").name, sellerUserId: user.vendedor2, userId: user.vendedor2,
    lines: [line("P01", "50"), line("P06", "30")] });
  await tx((c) => new Payables(c).registerPayment({ companyId, supplierId: supp.V05, paymentDate: OCT(28), amount: toMoney(power.total), bankAccountId: bank.POP,
    reference: "TRF-V05-01", applications: [{ openItemId: power.openItemId, amount: toMoney(power.total) }] }));
  const s1Item = await itemOf(s1.documentId);
  const s9Item = await itemOf(s9.documentId);
  await tx((c) => new Receivables(c).registerReceipt({ companyId, customerId: cust.C01, receiptDate: OCT(29), amount: toMoney(add(s1Item.balance, "100000")),
    bankAccountId: bank.BRV, reference: "DEP-C01-002",
    applications: [{ openItemId: Number(s1Item.id), amount: s1Item.balance }, { openItemId: Number(s9Item.id), amount: "100000" }] }));
  const inv1Item = (await pool.query(`SELECT balance::text FROM ap_open_items WHERE id=$1`, [inv1.openItemId])).rows[0].balance;
  await tx((c) => new Payables(c).registerPayment({ companyId, supplierId: supp.V01, paymentDate: OCT(29), amount: inv1Item, bankAccountId: bank.BRV,
    reference: "CH-0005", applications: [{ openItemId: inv1.openItemId, amount: inv1Item }] }));
  const s7Item = await itemOf(s7.documentId);
  await tx((c) => new Receivables(c).registerReceipt({ companyId, customerId: cust.C07, receiptDate: OCT(30), amount: s7Item.balance, bankAccountId: bank.POP,
    reference: "DEP-C07-001", applications: [{ openItemId: Number(s7Item.id), amount: s7Item.balance }] }));
  log("D25-GAS-01", `electricidad, honorarios con retención 30% ITBIS, nota de débito, aplicación de anticipo, venta B15, cobro multi-factura, pagos`);

  // ── D30 — commissions and payroll ─────────────────────────────────────────
  const commissions: Record<string, any> = {};
  for (const sellerKey of ["vendedor1", "vendedor2"] as const) {
    const closed = await tx((c) => closeFiscalCommissionPeriod(c, { companyId, storeId, userId: user[sellerKey], year: SCENARIO_YEAR, month: SCENARIO_MONTH }));
    facts[`selfApproveCommissionRefused_${sellerKey}`] = await tx((c) => approveFiscalCommission(c, { earningId: closed.earningId, approvedBy: user[sellerKey] })).then(() => false, () => true);
    await tx((c) => approveFiscalCommission(c, { earningId: closed.earningId, approvedBy: user.gerente }));
    commissions[sellerKey] = closed.calculation;
  }
  facts.commissions = commissions;

  const run = await tx((c) => prepareRun(c, { companyId, year: SCENARIO_YEAR, month: SCENARIO_MONTH, paymentDate: OCT(30) }));
  ids.payrollRun = run.runId;
  await tx(async (c) => {
    for (const e of EMPLOYEES) {
      const employeeId = emp[e.key];
      if (e.overtime35Hours) await setRunInput(c, { companyId, runId: run.runId, employeeId, code: "HE35", quantity: e.overtime35Hours });
      if (e.overtime100Hours) await setRunInput(c, { companyId, runId: run.runId, employeeId, code: "HE100", quantity: e.overtime100Hours });
      if (e.incentive) await setRunInput(c, { companyId, runId: run.runId, employeeId, code: "INCENTIVO", amount: e.incentive });
      if (e.bonus) await setRunInput(c, { companyId, runId: run.runId, employeeId, code: "BONIFICACION", amount: e.bonus });
      if (e.loanDeduction) await setRunInput(c, { companyId, runId: run.runId, employeeId, code: "PRESTAMO", amount: e.loanDeduction });
    }
  });
  const imported = await tx((c) => importCommissions(c, { companyId, runId: run.runId }));
  const calc = await tx((c) => calculateRun(c, { companyId, runId: run.runId }));
  await tx((c) => postRun(c, { companyId, runId: run.runId, entryDate: OCT(30), postedBy: user.contador }));
  await tx((c) => payRun(c, { companyId, runId: run.runId, bankAccountId: bank.BRV, date: OCT(30), postedBy: user.contador }));
  facts.payroll = { ...calc, commissionsImported: imported };
  facts.payslips = (await pool.query(
    `SELECT pe.code, pe.name, pe.department, s.gross_salary::text, s.base_salary::text, s.afp_employee::text, s.sfs_employee::text,
            s.isr::text, s.other_deductions::text, s.net_pay::text, s.afp_employer::text, s.sfs_employer::text, s.srl::text,
            s.infotep::text, s.days_worked::text
       FROM payslips s JOIN payroll_employees pe ON pe.id = s.employee_id WHERE s.run_id=$1 ORDER BY pe.code`,
    [run.runId],
  )).rows;
  log("D30-NOM-01", `comisiones cerradas y aprobadas; nómina de ${calc.employees} empleados, bruto ${calc.grossTotal}, neto ${calc.netTotal}; pagada por Banreservas`);

  // ── D31 — accruals, depreciation, bank reconciliation, filings, close ─────
  const regalia = roundTo(String(EMPLOYEES.filter((e) => e.hireDate <= OCT(31)).reduce((s, e) => s + e.salary, 0) / 12), 2);
  await tx((c) => new PostingEngine(c).postManual({ companyId, entryDate: OCT(31), memo: "Provisión regalía pascual octubre (1/12)", reference: `${P}-PROV-REG-10`,
    lines: [{ accountCode: "5.2.01.007", debit: toMoney(regalia) }, { accountCode: "2.1.03.005", credit: toMoney(regalia) }] }));
  const dep = await tx((c) => new FixedAssets(c).runDepreciation(companyId, SCENARIO_YEAR, SCENARIO_MONTH, OCT(31), user.contador, "mid_month"));
  facts.depreciation = dep;
  await tx((c) => new Treasury(c).recordMovement({ companyId, bankAccountId: bank.BRV, txnDate: OCT(31), direction: "out", amount: "850",
    kind: "charge", counterpartyAccountRef: "5.3.01.002", memo: "Cargos bancarios octubre", reference: "ND-BRV-1031" }));

  const reconcile = async (bankKey: "BRV" | "POP", outstandingRef: string) =>
    tx(async (c) => {
      const t = new Treasury(c);
      const txns = await c.query(
        `SELECT id, reference, direction, amount::text FROM bank_transactions WHERE company_id=$1 AND bank_account_id=$2 AND txn_date <= $3 ORDER BY id`,
        [companyId, bank[bankKey], OCT(31)],
      );
      const cleared = txns.rows.filter((r: any) => r.reference !== outstandingRef);
      const statement = cleared.reduce((s: Decimal, r: any) => (r.direction === "in" ? add(s, r.amount) : sub(s, r.amount)), "0");
      const reconId = await t.startReconciliation(companyId, bank[bankKey], OCT(31), statement);
      await t.clear(companyId, reconId, cleared.map((r: any) => Number(r.id)));
      await t.complete(companyId, reconId);
      return t.summary(companyId, reconId);
    });
  facts.bankRecBRV = await reconcile("BRV", "CH-0005");
  facts.bankRecPOP = await reconcile("POP", "TRF-V05-01");

  const req = { companyId, rnc: opts.rnc, year: SCENARIO_YEAR, month: SCENARIO_MONTH };
  facts.dgii = await tx(async (c) => ({
    r606: await generate606(c, req), r607: await generate607(c, req), r608: await generate608(c, req),
    it1: await generateIt1(c, req), ir17: await generateIr17(c, req), ir3: await generateIr3(c, companyId, SCENARIO_YEAR, SCENARIO_MONTH),
  }));
  const october = await tx((c) => monthEndReconciliation(c, companyId, SCENARIO_YEAR, SCENARIO_MONTH));
  log("D31-CIE-01", `provisiones, depreciación ${dep.total}, conciliaciones bancarias, 606/607/608/IT-1/IR-17/IR-3; controles ${october.checks.filter((c) => c.ok).length}/${october.checks.length} OK`);

  await tx((c) => new PeriodClose(c).close(companyId, SCENARIO_YEAR, SCENARIO_MONTH, user.contador));
  facts.postingIntoClosedMonthRefused = await tx((c) => new PostingEngine(c).postManual({ companyId, entryDate: OCT(31), memo: "Intento en mes cerrado",
    lines: [{ accountCode: "5.2.02.004", debit: "1" }, { accountCode: "1.1.01.001", credit: "1" }] })).then(() => false, () => true);
  log("D31-CIE-02", `octubre cerrado; asiento posterior al cierre rechazado=${facts.postingIntoClosedMonthRefused}`);

  // ── November — statutory payments ─────────────────────────────────────────
  await tx(async (c) => {
    await payStatutory(c, { companyId, year: SCENARIO_YEAR, month: SCENARIO_MONTH, kind: "tss", bankAccountId: bank.POP, date: NOV(3) });
    await payStatutory(c, { companyId, year: SCENARIO_YEAR, month: SCENARIO_MONTH, kind: "infotep", bankAccountId: bank.POP, date: NOV(3) });
    await payStatutory(c, { companyId, year: SCENARIO_YEAR, month: SCENARIO_MONTH, kind: "isr_salaries", bankAccountId: bank.POP, date: NOV(10) });
  });
  const balanceOn = async (code: string, date: string) =>
    (await pool.query(
      `SELECT coalesce(sum(l.debit_func - l.credit_func),0)::text b FROM journal_entry_lines l JOIN journal_entries e ON e.id=l.entry_id
         JOIN chart_of_accounts a ON a.id=l.account_id WHERE l.company_id=$1 AND a.code=$2 AND e.status='posted' AND e.entry_date <= $3`,
      [companyId, code, date],
    )).rows[0].b as Decimal;
  await tx(async (c) => {
    const t = new Treasury(c);
    const ir17Liability = sub("0", await balanceOn("2.1.02.003", OCT(31)));
    const itbisWithheld = sub("0", await balanceOn("2.1.02.002", OCT(31)));
    await t.recordMovement({ companyId, bankAccountId: bank.POP, txnDate: NOV(10), direction: "out", amount: toMoney(ir17Liability), kind: "tax",
      counterpartyAccountRef: "2.1.02.003", memo: "Pago IR-17 octubre", reference: "IR17-2026-10" });
    await t.recordMovement({ companyId, bankAccountId: bank.POP, txnDate: NOV(10), direction: "out", amount: toMoney(itbisWithheld), kind: "tax",
      counterpartyAccountRef: "2.1.02.002", memo: "Pago ITBIS retenido octubre", reference: "ITBISRET-2026-10" });
    // IT-1: the ITBIS withheld by customers and the purchase credit offset the
    // ITBIS charged, up to what was charged. A credit larger than the debit is a
    // saldo a favor that stays in 1.1.04.001 for next month; only a positive
    // balance is paid.
    const charged = sub("0", await balanceOn("2.1.02.001", OCT(31)));
    const credit = await balanceOn("1.1.04.001", OCT(31));
    const withheldByCustomers = await balanceOn("1.1.04.003", OCT(31));
    const fromWithheld = Number(withheldByCustomers) <= Number(charged) ? withheldByCustomers : charged;
    const remaining = sub(charged, fromWithheld);
    const fromCredit = Number(credit) <= Number(remaining) ? credit : remaining;
    const toPay = sub(remaining, fromCredit);
    const lines = [{ accountCode: "2.1.02.001", debit: toMoney(add(fromWithheld, fromCredit)) }];
    if (Number(fromWithheld) > 0) lines.push({ accountCode: "1.1.04.003", credit: toMoney(fromWithheld) } as any);
    if (Number(fromCredit) > 0) lines.push({ accountCode: "1.1.04.001", credit: toMoney(fromCredit) } as any);
    await new PostingEngine(c).postManual({ companyId, entryDate: NOV(20), memo: "Compensación IT-1 octubre", reference: `${P}-IT1-2026-10`, lines });
    facts.it1Payment = toMoney(toPay);
    facts.it1CreditCarriedForward = toMoney(sub(credit, fromCredit));
    if (Number(toPay) > 0) {
      await t.recordMovement({ companyId, bankAccountId: bank.POP, txnDate: NOV(20), direction: "out", amount: toMoney(toPay), kind: "tax",
        counterpartyAccountRef: "2.1.02.001", memo: "Pago IT-1 octubre", reference: "IT1-2026-10" });
    }
  });
  const afterStatutoryPayments: Record<string, Decimal> = {};
  for (const code of ["2.1.03.001", "2.1.03.002", "2.1.03.003", "2.1.03.004", "2.1.02.001", "2.1.02.002", "2.1.02.003"]) {
    afterStatutoryPayments[code] = toMoney(await balanceOn(code, NOV(30)));
  }
  log("D35-FIS-01", `noviembre: TSS, INFOTEP, IR-3, IR-17, ITBIS retenido e IT-1 (${facts.it1Payment}) pagados`);

  return { companyId, ids, facts, october, afterStatutoryPayments, steps };
}
