import { SqlClient } from "../accounting/types";
import { Decimal } from "../accounting/decimal";

/**
 * One stock ledger, four places that show it.
 *
 * The valued ledger (`inventory_valuation` + cost layers + GL) is the book of
 * record. The POS and the legacy warehouse screens read three other places:
 * `warehouse_stock` (per bodega), `products.stock_quantity` (the global number
 * on the catalog) and `inventory_movements` (the unit kárdex). Before this module
 * every screen wrote whichever of those it knew about, so the four drifted apart
 * and no month could reconcile.
 *
 * Now every valued movement — purchase receipt, sale, return, transfer, count,
 * adjustment — calls `syncOperationalStock` from `InventoryCosting`, in the same
 * transaction. The operational quantity is *set* to the valued quantity rather
 * than incremented, so a bodega that started out of step heals on its next
 * movement instead of carrying the old error forever.
 *
 * Warehouse 0 (a company with one undivided store) has no `warehouses` row and
 * therefore nothing operational to keep in step.
 */
export class WarehouseOwnershipError extends Error {}

export interface WarehouseOwnership {
  id: number;
  storeId: number;
  name: string;
  wmsEnabled: boolean;
  rotationPolicy: "fifo" | "fefo";
  requireLocationOnReceipt: boolean;
}

/**
 * Loads a warehouse and proves this company may move stock through it.
 *
 * A warehouse that belongs to another company is refused. One that belongs to
 * nobody yet — every warehouse created before companies existed — is claimed by
 * the first company that values stock in it; from then on it rolls into that
 * company's inventory account and no other's.
 */
export async function claimWarehouse(
  client: SqlClient,
  companyId: number,
  warehouseId: number,
): Promise<WarehouseOwnership> {
  const { rows } = await client.query(
    `SELECT id, store_id, company_id, name, wms_enabled, rotation_policy, require_location_on_receipt
       FROM warehouses WHERE id=$1`,
    [warehouseId],
  );
  if (rows.length === 0) throw new WarehouseOwnershipError(`el almacén ${warehouseId} no existe`);
  const r = rows[0];
  if (r.company_id !== null && Number(r.company_id) !== companyId) {
    throw new WarehouseOwnershipError(`el almacén "${r.name}" pertenece a otra empresa`);
  }
  if (r.company_id === null) {
    await client.query(`UPDATE warehouses SET company_id=$1 WHERE id=$2 AND company_id IS NULL`, [companyId, warehouseId]);
  }
  return {
    id: Number(r.id),
    storeId: Number(r.store_id),
    name: r.name,
    wmsEnabled: r.wms_enabled === true,
    rotationPolicy: r.rotation_policy === "fefo" ? "fefo" : "fifo",
    requireLocationOnReceipt: r.require_location_on_receipt === true,
  };
}

export type ValuedMovementKind =
  | "receipt"
  | "return"
  | "transfer_in"
  | "adjustment_in"
  | "issue"
  | "transfer_out"
  | "adjustment_out";

/** The legacy kárdex speaks its own vocabulary; keep the screens that read it working. */
const LEGACY_TYPE: Record<ValuedMovementKind, string> = {
  receipt: "purchase",
  return: "return",
  transfer_in: "transfer",
  transfer_out: "transfer",
  adjustment_in: "adjustment",
  adjustment_out: "adjustment",
  issue: "sale",
};

export interface OperationalSyncInput {
  companyId: number;
  productId: number;
  warehouseId: number;
  date: string;
  kind: ValuedMovementKind;
  quantity: Decimal;
  totalCost: Decimal;
  /** Valued quantity on hand in this warehouse after the movement. */
  quantityOnHand: Decimal;
  costMovementId: number;
  sourceType?: string;
  sourceId?: string;
  userId?: number;
  lotNo?: string | null;
  expirationDate?: string | null;
  notes?: string;
}

export async function syncOperationalStock(
  client: SqlClient,
  m: OperationalSyncInput,
): Promise<{ quantityBefore: string; quantityAfter: string } | null> {
  if (!m.warehouseId) return null;
  const wh = await claimWarehouse(client, m.companyId, m.warehouseId);

  const before = await client.query(
    `SELECT quantity::text FROM warehouse_stock WHERE warehouse_id=$1 AND product_id=$2 FOR UPDATE`,
    [m.warehouseId, m.productId],
  );
  const quantityBefore: string = before.rows[0]?.quantity ?? "0";

  const after = await client.query(
    `INSERT INTO warehouse_stock (warehouse_id, product_id, store_id, quantity)
     VALUES ($1,$2,$3,$4::numeric)
     ON CONFLICT (warehouse_id, product_id)
     DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()
     RETURNING quantity::text`,
    [m.warehouseId, m.productId, wh.storeId, m.quantityOnHand],
  );
  const quantityAfter: string = after.rows[0].quantity;

  // The catalog's single number is the sum over bodegas. Recomputed, never
  // incremented, so it cannot accumulate an error of its own.
  await client.query(
    `UPDATE products
        SET stock_quantity = (SELECT round(coalesce(sum(quantity), 0))::int FROM warehouse_stock WHERE product_id=$1),
            updated_at = now()
      WHERE id=$1`,
    [m.productId],
  );

  const inbound = ["receipt", "return", "transfer_in", "adjustment_in"].includes(m.kind);
  const reason =
    m.kind === "adjustment_in" ? "sobrante" : m.kind === "adjustment_out" ? "faltante" : null;
  const referenceId = m.sourceId && /^\d+/.test(m.sourceId) ? Number(m.sourceId.match(/^\d+/)![0]) : null;

  await client.query(
    `INSERT INTO inventory_movements
       (store_id, product_id, type, quantity, quantity_before, quantity_after,
        unit_cost, total_cost, reference_type, reference_id, notes, reason,
        warehouse_id, created_by, company_id, cost_movement_id, movement_date,
        lot_number, expiration_date)
     VALUES ($1,$2,$3,$4::numeric,$5::numeric,$6::numeric,
             round(coalesce($7::numeric / nullif($4::numeric, 0), 0), 2), round($7::numeric, 2), $8,$9,$10,$11,
             $12,$13,$14,$15,$16,$17,$18)`,
    [
      wh.storeId,
      m.productId,
      LEGACY_TYPE[m.kind],
      m.quantity,
      quantityBefore,
      quantityAfter,
      m.totalCost,
      m.sourceType ?? null,
      referenceId,
      m.notes ?? `${inbound ? "Entrada" : "Salida"} ${m.kind} (${m.sourceType ?? "inventario"})`,
      reason,
      m.warehouseId,
      m.userId ?? null,
      m.companyId,
      m.costMovementId,
      m.date,
      m.lotNo ?? null,
      m.expirationDate ?? null,
    ],
  );

  return { quantityBefore, quantityAfter };
}
