import { SqlClient } from "../accounting/types";
import { Decimal, add, mul, sub, roundTo, toMoney, cmp } from "../accounting/decimal";
import { nextDocumentNumber } from "../accounting/document-numbers";
import { claimWarehouse } from "../inventory/operational-stock";
import { requestApproval } from "../services/approvals";

/**
 * Purchase orders, company-scoped.
 *
 * The legacy screen inserted whatever the browser sent: no number (the column is
 * NOT NULL, so creation failed), no warehouse on the lines, no approval. This
 * service is what the legacy route and the month simulation both call, so an
 * order is always numbered, always tied to a warehouse the company owns, and —
 * when an approval rule covers its amount — cannot be received until approved.
 */
export class ProcurementError extends Error {}

export interface PurchaseOrderLine {
  productId: number;
  productName: string;
  quantity: Decimal;
  unitCost: Decimal;
  /** Percent, e.g. "5" for 5%. */
  discountRate?: Decimal;
  /** ITBIS percent the supplier will charge, e.g. "18". Informative on the order. */
  taxRate?: Decimal;
  sku?: string;
  notes?: string;
}

export interface CreatePurchaseOrderInput {
  companyId: number;
  storeId: number;
  userId: number;
  supplierId?: number;
  warehouseId: number;
  orderDate: string;
  expectedDate?: string;
  currency?: string;
  paymentTerms?: string;
  notes?: string;
  requisitionId?: number;
  supplierQuoteId?: number;
  items: PurchaseOrderLine[];
}

export interface PurchaseOrderTotals {
  subtotal: Decimal;
  discount: Decimal;
  tax: Decimal;
  total: Decimal;
}

/** Net cost of one unit after the line discount. */
export const netUnitCost = (unitCost: Decimal, discountRate?: Decimal | null): Decimal =>
  roundTo(mul(unitCost, sub("1", roundTo(String(Number(discountRate ?? 0) / 100), 8))), 8);

export function purchaseOrderTotals(items: PurchaseOrderLine[]): PurchaseOrderTotals {
  let subtotal: Decimal = "0";
  let discount: Decimal = "0";
  let tax: Decimal = "0";
  for (const i of items) {
    const gross = roundTo(mul(i.quantity, i.unitCost), 2);
    const net = roundTo(mul(i.quantity, netUnitCost(i.unitCost, i.discountRate)), 2);
    subtotal = add(subtotal, net);
    discount = add(discount, sub(gross, net));
    tax = add(tax, roundTo(String((Number(net) * Number(i.taxRate ?? 0)) / 100), 2));
  }
  return { subtotal, discount, tax, total: add(subtotal, tax) };
}

export async function createPurchaseOrder(
  client: SqlClient,
  input: CreatePurchaseOrderInput,
): Promise<{ id: number; purchaseNumber: string; totals: PurchaseOrderTotals }> {
  if (input.items.length === 0) throw new ProcurementError("la orden debe tener al menos un producto");
  for (const i of input.items) {
    if (cmp(i.quantity, "0") <= 0) throw new ProcurementError(`"${i.productName}": la cantidad debe ser positiva`);
    if (cmp(i.unitCost, "0") < 0) throw new ProcurementError(`"${i.productName}": el costo no puede ser negativo`);
  }
  await claimWarehouse(client, input.companyId, input.warehouseId);

  let supplierName: string | null = null;
  if (input.supplierId) {
    const s = await client.query(`SELECT name FROM suppliers WHERE id=$1`, [input.supplierId]);
    if (s.rows.length === 0) throw new ProcurementError(`proveedor ${input.supplierId} no existe`);
    supplierName = s.rows[0].name;
  }

  const totals = purchaseOrderTotals(input.items);
  const purchaseNumber = await nextDocumentNumber(client, input.companyId, "purchase_order", Number(input.orderDate.slice(0, 4)));

  const po = await client.query(
    `INSERT INTO purchase_orders
       (store_id, purchase_number, supplier_id, supplier_name, order_date, expected_delivery_date,
        status, subtotal, tax, discount, total_amount, currency, payment_terms, notes, created_by,
        warehouse_id, company_id, approval_status, requisition_id, supplier_quote_id)
     VALUES ($1,$2,$3,$4,$5::date,$6::date,'pending',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'not_required',$17,$18)
     RETURNING id`,
    [
      input.storeId, purchaseNumber, input.supplierId ?? null, supplierName, input.orderDate,
      input.expectedDate ?? null, toMoney(totals.subtotal), toMoney(totals.tax), toMoney(totals.discount),
      toMoney(totals.total), input.currency ?? "DOP", input.paymentTerms ?? null, input.notes ?? null,
      input.userId, input.warehouseId, input.companyId, input.requisitionId ?? null, input.supplierQuoteId ?? null,
    ],
  );
  const id = Number(po.rows[0].id);

  for (const i of input.items) {
    const net = roundTo(mul(i.quantity, netUnitCost(i.unitCost, i.discountRate)), 2);
    await client.query(
      `INSERT INTO purchase_order_items
         (purchase_order_id, store_id, product_id, product_name, sku, quantity, quantity_received,
          unit_cost, tax_rate, discount_rate, total_cost, notes, warehouse_id)
       VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9,$10,$11,$12)`,
      [
        id, input.storeId, i.productId, i.productName, i.sku ?? null, i.quantity, i.unitCost,
        i.taxRate ?? "0", i.discountRate ?? "0", toMoney(net), i.notes ?? null, input.warehouseId,
      ],
    );
  }

  return { id, purchaseNumber, totals };
}

/**
 * Sends the order through the approvals engine. When a rule covers its amount
 * the order waits in `pending` approval; with no rule it needs none.
 */
export async function submitPurchaseOrder(
  client: SqlClient,
  input: { companyId: number; storeId: number; purchaseOrderId: number; userId: number },
): Promise<{ approvalStatus: "not_required" | "pending" | "approved"; approvalRequestId: number | null }> {
  const po = await loadPurchaseOrder(client, input.companyId, input.purchaseOrderId);
  const rule = await client.query(
    `SELECT id FROM approval_rules
      WHERE store_id=$1 AND document_type='purchase_order' AND is_active
        AND (min_amount IS NULL OR min_amount <= $2::numeric)
        AND (max_amount IS NULL OR max_amount >= $2::numeric)
      LIMIT 1`,
    [input.storeId, po.total_amount],
  );
  if (rule.rows.length === 0) {
    await client.query(`UPDATE purchase_orders SET approval_status='not_required' WHERE id=$1`, [po.id]);
    return { approvalStatus: "not_required", approvalRequestId: null };
  }
  const req = await requestApproval(client as any, {
    storeId: input.storeId,
    documentType: "purchase_order",
    documentId: po.id,
    documentRef: po.purchase_number,
    amount: Number(po.total_amount),
    currency: po.currency ?? "DOP",
    requestedBy: input.userId,
    reason: `Orden de compra ${po.purchase_number}`,
  } as any);
  await client.query(`UPDATE purchase_orders SET approval_status=$2 WHERE id=$1`, [po.id, req.status === "approved" ? "approved" : "pending"]);
  return { approvalStatus: req.status === "approved" ? "approved" : "pending", approvalRequestId: req.id };
}

/** Copies the approval engine's verdict onto the order. */
export async function syncPurchaseOrderApproval(
  client: SqlClient,
  input: { companyId: number; storeId: number; purchaseOrderId: number },
): Promise<string> {
  const po = await loadPurchaseOrder(client, input.companyId, input.purchaseOrderId);
  const r = await client.query(
    `SELECT status, resolved_at FROM approval_requests
      WHERE store_id=$1 AND document_type='purchase_order' AND document_id=$2
      ORDER BY id DESC LIMIT 1`,
    [input.storeId, String(po.id)],
  );
  if (r.rows.length === 0) return po.approval_status;
  const status = r.rows[0].status === "approved" ? "approved" : r.rows[0].status === "rejected" ? "rejected" : "pending";
  await client.query(
    `UPDATE purchase_orders SET approval_status=$2, approved_at = CASE WHEN $2='approved' THEN now() ELSE approved_at END,
            status = CASE WHEN $2='rejected' THEN 'cancelled' ELSE status END
      WHERE id=$1`,
    [po.id, status],
  );
  return status;
}

export async function loadPurchaseOrder(client: SqlClient, companyId: number, purchaseOrderId: number, forUpdate = false) {
  const { rows } = await client.query(
    `SELECT id, store_id, purchase_number, supplier_id, supplier_name, status, approval_status,
            total_amount::text, currency, warehouse_id, company_id
       FROM purchase_orders WHERE id=$1 ${forUpdate ? "FOR UPDATE" : ""}`,
    [purchaseOrderId],
  );
  if (rows.length === 0) throw new ProcurementError(`orden de compra ${purchaseOrderId} no existe`);
  const po = rows[0];
  if (po.company_id !== null && Number(po.company_id) !== companyId) {
    throw new ProcurementError(`la orden ${po.purchase_number} pertenece a otra empresa`);
  }
  if (po.company_id === null) {
    await client.query(`UPDATE purchase_orders SET company_id=$1 WHERE id=$2 AND company_id IS NULL`, [companyId, purchaseOrderId]);
  }
  return po;
}

