import { SqlClient } from "../accounting/types";
import { PostingEngine } from "../accounting/posting-engine";
import { Decimal, add, sub, mul, cmp, roundTo, toMoney, isZero } from "../accounting/decimal";
import { nextDocumentNumber } from "../accounting/document-numbers";
import { InventoryCosting } from "../inventory/costing";
import { putaway, PutawayLine } from "../inventory/wms";
import { claimWarehouse } from "../inventory/operational-stock";
import { ProcurementError, loadPurchaseOrder, netUnitCost } from "./purchase-orders";

/**
 * Receiving goods against a purchase order.
 *
 * Each call is one delivery: it states what arrived *now*, never a running
 * total. The legacy screen sent the cumulative quantity and the server added it
 * again, so a second partial delivery counted the first one twice. Here the
 * received quantity accumulates from the receipt lines themselves, and receiving
 * more than was ordered is refused.
 *
 * The goods enter the valued ledger at the order's net cost — which keeps every
 * stock view in step — and one entry per inventory account posts
 * Dr Inventario / Cr Recepciones por facturar. The supplier's invoice clears
 * that account later (see `Payables.registerInvoice` with `purchaseOrderId`).
 */
export interface ReceiveLineInput {
  purchaseOrderItemId: number;
  quantity: Decimal;
  lotNo?: string;
  expirationDate?: string | null;
  locations?: PutawayLine[];
  /** Costing method and control account, fixed on a product's first receipt. */
  method?: "average" | "fifo";
  inventoryAccountRef?: string;
}

export interface ReceivePurchaseOrderInput {
  companyId: number;
  purchaseOrderId: number;
  date: string;
  userId?: number;
  lines: ReceiveLineInput[];
  notes?: string;
  /** Closes the order even though lines are still short (supplier will not ship the rest). */
  closeShort?: boolean;
}

export interface ReceiptResult {
  receiptId: number;
  receiptNo: string;
  totalCost: Decimal;
  journalEntryIds: number[];
  poStatus: "partial" | "received";
}

export async function receivePurchaseOrder(client: SqlClient, input: ReceivePurchaseOrderInput): Promise<ReceiptResult> {
  const lines = input.lines.filter((l) => cmp(l.quantity, "0") > 0);
  if (lines.length === 0) throw new ProcurementError("indique al menos una línea con cantidad recibida");

  const po = await loadPurchaseOrder(client, input.companyId, input.purchaseOrderId, true);
  if (po.status === "cancelled") throw new ProcurementError(`la orden ${po.purchase_number} está cancelada`);
  if (po.status === "received") throw new ProcurementError(`la orden ${po.purchase_number} ya fue recibida completa`);
  if (!["not_required", "approved"].includes(po.approval_status)) {
    throw new ProcurementError(`la orden ${po.purchase_number} no está aprobada (${po.approval_status})`);
  }

  const warehouseId = Number(po.warehouse_id);
  const wh = await claimWarehouse(client, input.companyId, warehouseId);
  const receiptNo = await nextDocumentNumber(client, input.companyId, "purchase_receipt", Number(input.date.slice(0, 4)));

  const receipt = await client.query(
    `INSERT INTO purchase_receipts
       (company_id, purchase_order_id, receipt_no, receipt_date, warehouse_id, supplier_id, currency, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [input.companyId, po.id, receiptNo, input.date, warehouseId, po.supplier_id, po.currency ?? "DOP", input.notes ?? null, input.userId ?? null],
  );
  const receiptId = Number(receipt.rows[0].id);

  const costing = new InventoryCosting(client);
  const byAccount = new Map<string, Decimal>();
  let totalCost: Decimal = "0";

  for (const line of lines) {
    const item = await client.query(
      `SELECT id, product_id, product_name, quantity::text, unit_cost::text, discount_rate::text
         FROM purchase_order_items WHERE id=$1 AND purchase_order_id=$2 FOR UPDATE`,
      [line.purchaseOrderItemId, po.id],
    );
    if (item.rows.length === 0) throw new ProcurementError(`la línea ${line.purchaseOrderItemId} no pertenece a la orden`);
    const it = item.rows[0];
    if (!it.product_id) throw new ProcurementError(`"${it.product_name}" no está vinculado a un producto del catálogo`);

    const already = await client.query(
      `SELECT coalesce(sum(l.quantity),0)::text AS q
         FROM purchase_receipt_lines l JOIN purchase_receipts r ON r.id = l.receipt_id
        WHERE l.company_id=$1 AND l.purchase_order_item_id=$2 AND r.status='posted'`,
      [input.companyId, it.id],
    );
    const pending = sub(it.quantity, already.rows[0].q);
    if (cmp(line.quantity, pending) > 0) {
      throw new ProcurementError(
        `"${it.product_name}": se ordenaron ${it.quantity}, ya se recibieron ${already.rows[0].q}; no se pueden recibir ${line.quantity}`,
      );
    }

    const unitCost = netUnitCost(it.unit_cost, it.discount_rate);
    const value = roundTo(mul(line.quantity, unitCost), 4);

    const received = await costing.receive({
      companyId: input.companyId,
      productId: Number(it.product_id),
      date: input.date,
      quantity: line.quantity,
      unitCost,
      totalCost: value,
      warehouseId,
      lotNo: line.lotNo,
      expirationDate: line.expirationDate ?? null,
      method: line.method,
      inventoryAccountRef: line.inventoryAccountRef,
      post: false,
      sourceType: "purchase_receipt",
      sourceId: String(receiptId),
      postedBy: input.userId,
    });

    const account = await inventoryAccountOf(client, input.companyId, Number(it.product_id));
    byAccount.set(account, add(byAccount.get(account) ?? "0", value));
    totalCost = add(totalCost, value);

    await client.query(
      `INSERT INTO purchase_receipt_lines
         (company_id, receipt_id, purchase_order_item_id, product_id, quantity, unit_cost, total_cost,
          inventory_account, lot_no, expiration_date, cost_movement_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        input.companyId, receiptId, it.id, it.product_id, line.quantity, unitCost, toMoney(value),
        account, line.lotNo ?? null, line.expirationDate ?? null, received.movementId,
      ],
    );
    await client.query(
      `UPDATE purchase_order_items
          SET quantity_received = $2::numeric + $3::numeric,
              lot_number = coalesce($4, lot_number),
              expiration_date = coalesce($5::timestamp, expiration_date)
        WHERE id=$1`,
      [it.id, already.rows[0].q, line.quantity, line.lotNo ?? null, line.expirationDate ?? null],
    );

    if (wh.wmsEnabled) {
      const binLines = line.locations?.length ? line.locations : [];
      if (binLines.length === 0 && wh.requireLocationOnReceipt) {
        throw new ProcurementError(`el almacén exige ubicación al recibir y "${it.product_name}" no indica ninguna`);
      }
      if (binLines.length > 0) {
        await putaway(client, {
          companyId: input.companyId,
          productId: Number(it.product_id),
          warehouseId,
          receivedDate: input.date,
          unitCost,
          lotId: received.lotId,
          sourceType: "purchase_receipt",
          sourceId: String(receiptId),
          userId: input.userId,
          lines: binLines,
        });
      }
    }
  }

  const engine = new PostingEngine(client);
  const journalEntryIds: number[] = [];
  for (const [account, amount] of byAccount) {
    if (isZero(amount)) continue;
    const posted = await engine.post(
      {
        companyId: input.companyId,
        eventType: "po_receipt",
        sourceType: "purchase_receipt",
        sourceId: `${receiptId}:${account}`,
        entryDate: input.date,
        currency: "DOP",
        context: { inventoryAccount: account },
        measures: [{ role: "inventory", amount: toMoney(amount), memo: `Recepción ${receiptNo}` }],
        memo: `Recepción ${receiptNo} — OC ${po.purchase_number}`,
        postedBy: input.userId,
      },
      "receipt",
    );
    journalEntryIds.push(posted.entryId);
  }

  const open = await client.query(
    `SELECT count(*)::int AS n FROM purchase_order_items
      WHERE purchase_order_id=$1 AND coalesce(quantity_received,0) < quantity`,
    [po.id],
  );
  const poStatus: "partial" | "received" = open.rows[0].n === 0 || input.closeShort ? "received" : "partial";
  await client.query(
    `UPDATE purchase_orders SET status=$2, received_date = CASE WHEN $2='received' THEN $3::timestamp ELSE received_date END,
            updated_at=now() WHERE id=$1`,
    [po.id, poStatus, input.date],
  );
  await client.query(`UPDATE purchase_receipts SET total_cost=$2 WHERE id=$1`, [receiptId, toMoney(totalCost)]);

  return { receiptId, receiptNo, totalCost, journalEntryIds, poStatus };
}

/** Receipt lines of an order still waiting for the supplier's invoice. */
export async function uninvoicedReceipts(
  client: SqlClient,
  companyId: number,
  filter: { purchaseOrderId?: number; supplierId?: number } = {},
) {
  const { rows } = await client.query(
    `SELECT l.id, r.receipt_no, r.receipt_date, r.purchase_order_id, po.purchase_number, r.supplier_id,
            l.purchase_order_item_id, l.product_id, l.quantity::text, l.qty_invoiced::text,
            (l.quantity - l.qty_invoiced)::text AS pending_qty, l.unit_cost::text,
            round((l.quantity - l.qty_invoiced) * l.unit_cost, 4)::text AS pending_value
       FROM purchase_receipt_lines l
       JOIN purchase_receipts r ON r.id = l.receipt_id
       JOIN purchase_orders po ON po.id = r.purchase_order_id
      WHERE l.company_id=$1 AND r.status='posted' AND l.qty_invoiced < l.quantity
        AND ($2::int IS NULL OR r.purchase_order_id=$2)
        AND ($3::int IS NULL OR r.supplier_id=$3)
      ORDER BY r.receipt_date, l.id`,
    [companyId, filter.purchaseOrderId ?? null, filter.supplierId ?? null],
  );
  return rows;
}

async function inventoryAccountOf(client: SqlClient, companyId: number, productId: number): Promise<string> {
  const { rows } = await client.query(
    `SELECT inventory_account FROM inventory_valuation WHERE company_id=$1 AND product_id=$2 LIMIT 1`,
    [companyId, productId],
  );
  return rows[0]?.inventory_account ?? "1.1.03.001";
}
