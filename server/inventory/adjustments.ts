import { SqlClient } from "../accounting/types";
import { Decimal } from "../accounting/decimal";
import { InventoryCosting } from "./costing";
import { claimWarehouse } from "./operational-stock";

/**
 * A manual stock adjustment: someone states how much is really on a warehouse's
 * shelf, product by product, and the books follow.
 *
 * The difference against the valued ledger is the adjustment. A shortage leaves
 * at cost and goes to "Faltantes de inventario" (5.1.02.001); a surplus comes in
 * at the warehouse's average cost (or a stated one) against "Sobrantes de
 * inventario" (4.2.02.001). It is valued at COST — the legacy screen priced it at
 * the sale price, which overstated every loss by the margin. Header, lines,
 * stock and entries all commit in the caller's transaction.
 */
export interface StockAdjustmentInput {
  companyId: number;
  storeId: number;
  userId?: number;
  warehouseId: number;
  date: string;
  notes?: string | null;
  reason?: string;
  items: Array<{ productId: number; productName?: string; realStock: Decimal; unitCost?: Decimal; reason?: string }>;
}

export interface StockAdjustmentResult {
  adjustmentId: number;
  surplusItems: number;
  deficitItems: number;
  surplusValue: number;
  deficitValue: number;
  netAdjustmentValue: number;
  journalEntryIds: number[];
}

export async function applyStockAdjustment(client: SqlClient, input: StockAdjustmentInput): Promise<StockAdjustmentResult> {
  if (input.items.length === 0) throw new Error("se requiere al menos un producto");
  await claimWarehouse(client, input.companyId, input.warehouseId);

  const header = await client.query(
    `INSERT INTO inventory_adjustments (store_id, adjusted_by, notes, total_items, company_id, warehouse_id, adjustment_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [input.storeId, input.userId ?? null, input.notes ?? null, input.items.length, input.companyId, input.warehouseId, input.date],
  );
  const adjustmentId = Number(header.rows[0].id);
  const costing = new InventoryCosting(client);
  let surplusItems = 0;
  let deficitItems = 0;
  let surplusValue = 0;
  let deficitValue = 0;
  const journalEntryIds: number[] = [];

  for (const item of input.items) {
    const before = await client.query(
      `SELECT quantity_on_hand::text, average_cost::text FROM inventory_valuation
        WHERE company_id=$1 AND product_id=$2 AND warehouse_id=$3`,
      [input.companyId, item.productId, input.warehouseId],
    );
    const previous = before.rows[0]?.quantity_on_hand ?? "0";
    const r = await costing.adjust({
      companyId: input.companyId,
      productId: item.productId,
      date: input.date,
      countedQuantity: item.realStock,
      warehouseId: input.warehouseId,
      unitCost: item.unitCost,
      reason: item.reason ?? input.reason ?? "ajuste manual",
      sourceType: "inventory_adjustment",
      sourceId: String(adjustmentId),
      postedBy: input.userId,
    });
    const diff = Number(r.variance);
    if (diff > 0) { surplusItems++; surplusValue += Number(r.value); }
    if (diff < 0) { deficitItems++; deficitValue += Number(r.value); }
    if (r.journalEntryId) journalEntryIds.push(r.journalEntryId);

    const name = item.productName
      ?? (await client.query(`SELECT name FROM products WHERE id=$1`, [item.productId])).rows[0]?.name
      ?? `Producto ${item.productId}`;
    const unit = before.rows[0]?.average_cost ?? item.unitCost ?? "0";
    await client.query(
      `INSERT INTO inventory_adjustment_items
         (adjustment_id, product_id, product_name, previous_stock, real_stock, difference, unit_price, base_currency, adjustment_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'DOP',$8)`,
      [
        adjustmentId, item.productId, name, Math.round(Number(previous)), Math.round(Number(item.realStock)),
        Math.round(diff), Number(unit).toFixed(2), (diff < 0 ? -Number(r.value) : Number(r.value)).toFixed(2),
      ],
    );
  }

  const netAdjustmentValue = surplusValue - deficitValue;
  await client.query(
    `UPDATE inventory_adjustments
        SET surplus_items=$2, deficit_items=$3, surplus_value=$4, deficit_value=$5, net_adjustment_value=$6, journal_entry_ids=$7
      WHERE id=$1`,
    [adjustmentId, surplusItems, deficitItems, surplusValue.toFixed(2), deficitValue.toFixed(2), netAdjustmentValue.toFixed(2), journalEntryIds],
  );
  return { adjustmentId, surplusItems, deficitItems, surplusValue, deficitValue, netAdjustmentValue, journalEntryIds };
}
