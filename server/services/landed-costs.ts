import type { Pool, PoolClient } from "@neondatabase/serverless";

/**
 * Landed costs: prorratea gastos de importación (flete, aduana, ITBIS de
 * despacho, agente aduanal, transporte interno) sobre las líneas recibidas de
 * una orden de compra, ajustando el costo unitario en inventario.
 *
 * Un voucher se define en estado draft: agregas líneas de gasto, indicas a
 * qué POs se aplica, opcionalmente pasas peso/volumen si vas a prorratear por
 * esas bases, y al `applyVoucher` se calcula el prorateo, se registra en
 * `landed_cost_item_allocations` y se actualiza el `unit_cost` de cada
 * `purchase_order_items` afectada.
 *
 * Bases de prorateo:
 *   - by_value    → cada item toma proporción a su valor FOB (qty × unit_cost)
 *   - by_quantity → cada item toma proporción a su cantidad recibida
 *   - by_weight   → prorratea por peso total declarado por PO
 *   - by_volume   → prorratea por volumen total declarado por PO
 *
 * Cuando el método es by_weight/by_volume y una PO no tiene peso/volumen
 * declarado, el servicio lanza error: no se puede prorratear "a ciegas".
 */

export type AllocationMethod = "by_value" | "by_quantity" | "by_weight" | "by_volume";

export type CostType =
  | "freight_ocean" | "freight_air" | "freight_land"
  | "insurance" | "customs_duty" | "customs_itbis" | "customs_selectivo"
  | "clearing_agent" | "port_handling" | "warehouse_storage"
  | "inland_transport" | "inspection" | "bank_charges" | "other";

export const COST_TYPE_LABELS: Record<CostType, string> = {
  freight_ocean: "Flete marítimo",
  freight_air: "Flete aéreo",
  freight_land: "Flete terrestre",
  insurance: "Seguro",
  customs_duty: "Arancel aduanero",
  customs_itbis: "ITBIS de importación",
  customs_selectivo: "Impuesto selectivo",
  clearing_agent: "Agente aduanal",
  port_handling: "Manejo portuario",
  warehouse_storage: "Almacenaje",
  inland_transport: "Transporte interno",
  inspection: "Inspección",
  bank_charges: "Cargos bancarios",
  other: "Otro",
};

export class LandedCostError extends Error {}

// ── Voucher CRUD ──────────────────────────────────────────────────────────

export interface CreateVoucherInput {
  storeId: number;
  voucherCode: string;
  description?: string;
  voucherDate?: string;
  shipmentReference?: string;
  blAwbNumber?: string;
  supplierId?: number;
  currency?: string;
  defaultAllocationMethod?: AllocationMethod;
  notes?: string;
  createdBy: number;
}

export async function createVoucher(pool: Pool, input: CreateVoucherInput): Promise<number> {
  const r = await pool.query(
    `INSERT INTO landed_cost_vouchers
       (store_id, voucher_code, description, voucher_date, shipment_reference,
        bl_awb_number, supplier_id, currency, default_allocation_method, notes, created_by)
     VALUES ($1,$2,$3, coalesce($4::date, CURRENT_DATE), $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      input.storeId, input.voucherCode, input.description ?? null,
      input.voucherDate ?? null, input.shipmentReference ?? null,
      input.blAwbNumber ?? null, input.supplierId ?? null,
      input.currency ?? "DOP", input.defaultAllocationMethod ?? "by_value",
      input.notes ?? null, input.createdBy,
    ],
  );
  return Number(r.rows[0].id);
}

export async function addCostLine(
  pool: Pool,
  voucherId: number,
  input: {
    costType: CostType;
    description?: string;
    amount: number;
    allocationMethod?: AllocationMethod;
    expenseDocumentRef?: string;
    supplierId?: number;
    expenseAccountCode?: string;
  },
): Promise<number> {
  if (input.amount < 0) throw new LandedCostError("el monto no puede ser negativo");
  const r = await pool.query(
    `INSERT INTO landed_cost_lines
       (voucher_id, cost_type, description, amount, allocation_method,
        expense_document_ref, supplier_id, expense_account_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      voucherId, input.costType, input.description ?? null, String(input.amount),
      input.allocationMethod ?? null, input.expenseDocumentRef ?? null,
      input.supplierId ?? null, input.expenseAccountCode ?? null,
    ],
  );
  await recalcVoucherTotals(pool, voucherId);
  return Number(r.rows[0].id);
}

export async function addTarget(
  pool: Pool,
  voucherId: number,
  input: {
    purchaseOrderId: number;
    totalWeightKg?: number;
    totalVolumeM3?: number;
  },
): Promise<number> {
  const r = await pool.query(
    `INSERT INTO landed_cost_targets
       (voucher_id, purchase_order_id, total_weight_kg, total_volume_m3)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (voucher_id, purchase_order_id) DO UPDATE
        SET total_weight_kg = EXCLUDED.total_weight_kg,
            total_volume_m3 = EXCLUDED.total_volume_m3
     RETURNING id`,
    [
      voucherId, input.purchaseOrderId,
      String(input.totalWeightKg ?? 0), String(input.totalVolumeM3 ?? 0),
    ],
  );
  return Number(r.rows[0].id);
}

async function recalcVoucherTotals(pool: Pool, voucherId: number): Promise<void> {
  await pool.query(
    `UPDATE landed_cost_vouchers
        SET total_costs = coalesce((SELECT sum(amount) FROM landed_cost_lines WHERE voucher_id = $1), 0),
            updated_at = now()
      WHERE id = $1`,
    [voucherId],
  );
}

// ── Aplicación del voucher ────────────────────────────────────────────────

export interface ApplyResult {
  voucherId: number;
  totalCosts: number;
  totalAllocated: number;
  allocationsByPo: Array<{
    purchaseOrderId: number;
    itemCount: number;
    allocated: number;
  }>;
}

export async function applyVoucher(
  pool: Pool,
  voucherId: number,
  appliedBy: number,
): Promise<ApplyResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const vRes = await client.query(
      `SELECT id, store_id, status, default_allocation_method, total_costs::float AS total_costs
         FROM landed_cost_vouchers WHERE id = $1 FOR UPDATE`,
      [voucherId],
    );
    if (!vRes.rowCount) throw new LandedCostError(`voucher ${voucherId} no existe`);
    const v = vRes.rows[0];
    if (v.status !== "draft") throw new LandedCostError(`voucher ya está ${v.status}`);

    const linesRes = await client.query(
      `SELECT id, cost_type, amount::float AS amount, coalesce(allocation_method, $2) AS method
         FROM landed_cost_lines WHERE voucher_id = $1`,
      [voucherId, v.default_allocation_method],
    );
    if (!linesRes.rowCount) throw new LandedCostError("el voucher no tiene líneas de gasto");

    const targetsRes = await client.query(
      `SELECT id, purchase_order_id, total_weight_kg::float AS weight, total_volume_m3::float AS volume
         FROM landed_cost_targets WHERE voucher_id = $1`,
      [voucherId],
    );
    if (!targetsRes.rowCount) throw new LandedCostError("el voucher no tiene POs asignadas");

    // Precargamos las líneas de PO por target — necesitamos qty × unit_cost.
    interface PoItem {
      id: number;
      po_id: number;
      product_id: number;
      quantity: number;
      quantity_received: number;
      unit_cost: number;
      value: number;
    }
    const poItemsByTarget = new Map<number, PoItem[]>();
    let grandValue = 0;
    let grandQty = 0;
    for (const t of targetsRes.rows) {
      const items = await client.query(
        `SELECT id, purchase_order_id AS po_id, product_id,
                quantity::float AS quantity, quantity_received::float AS quantity_received,
                unit_cost::float AS unit_cost
           FROM purchase_order_items
          WHERE purchase_order_id = $1 AND product_id IS NOT NULL`,
        [t.purchase_order_id],
      );
      const poItems: PoItem[] = items.rows.map((r: any) => {
        const qty = Number(r.quantity_received) > 0 ? Number(r.quantity_received) : Number(r.quantity);
        return {
          id: Number(r.id),
          po_id: Number(r.po_id),
          product_id: Number(r.product_id),
          quantity: qty,
          quantity_received: Number(r.quantity_received),
          unit_cost: Number(r.unit_cost),
          value: qty * Number(r.unit_cost),
        };
      });
      poItemsByTarget.set(Number(t.id), poItems);
      grandValue += poItems.reduce((s, p) => s + p.value, 0);
      grandQty += poItems.reduce((s, p) => s + p.quantity, 0);
    }
    if (grandValue === 0 && grandQty === 0) {
      throw new LandedCostError("las POs no tienen items válidos para prorratear");
    }

    const totalWeight = targetsRes.rows.reduce((s: number, t: any) => s + Number(t.weight ?? 0), 0);
    const totalVolume = targetsRes.rows.reduce((s: number, t: any) => s + Number(t.volume ?? 0), 0);

    interface Alloc { poItemId: number; poId: number; productId: number; qty: number; origCost: number; add: number; basis: string; }
    const allocsByLine = new Map<number, Alloc[]>();

    for (const l of linesRes.rows) {
      const method: AllocationMethod = l.method;
      const amount = Number(l.amount);
      if (amount === 0) continue;

      if (method === "by_weight" && totalWeight === 0) {
        throw new LandedCostError("prorateo por peso requiere que las POs tengan peso declarado");
      }
      if (method === "by_volume" && totalVolume === 0) {
        throw new LandedCostError("prorateo por volumen requiere que las POs tengan volumen declarado");
      }

      const lineAllocs: Alloc[] = [];

      if (method === "by_weight" || method === "by_volume") {
        // Prorateo a nivel de PO por su peso/volumen — luego dentro de cada PO se
        // reparte por valor entre sus items (no sabemos peso por item).
        for (const t of targetsRes.rows) {
          const basisPO = method === "by_weight" ? Number(t.weight ?? 0) : Number(t.volume ?? 0);
          const totalBasis = method === "by_weight" ? totalWeight : totalVolume;
          if (basisPO === 0) continue;
          const poShare = (basisPO / totalBasis) * amount;
          const items = poItemsByTarget.get(Number(t.id))!;
          const poValue = items.reduce((s, p) => s + p.value, 0);
          if (poValue === 0) continue;
          for (const it of items) {
            const add = (it.value / poValue) * poShare;
            lineAllocs.push({
              poItemId: it.id, poId: it.po_id, productId: it.product_id,
              qty: it.quantity, origCost: it.unit_cost, add, basis: method,
            });
          }
        }
      } else {
        // by_value o by_quantity — se prorratea globalmente entre todos los items.
        const allItems = ([] as PoItem[]).concat(...poItemsByTarget.values());
        const denom = method === "by_value" ? grandValue : grandQty;
        if (denom === 0) continue;
        for (const it of allItems) {
          const numerator = method === "by_value" ? it.value : it.quantity;
          if (numerator === 0) continue;
          const add = (numerator / denom) * amount;
          lineAllocs.push({
            poItemId: it.id, poId: it.po_id, productId: it.product_id,
            qty: it.quantity, origCost: it.unit_cost, add, basis: method,
          });
        }
      }
      allocsByLine.set(Number(l.id), lineAllocs);
    }

    // Consolidamos por poItemId — un item puede recibir varias líneas de gasto.
    const finalByItem = new Map<number, { poId: number; productId: number; qty: number; origCost: number; add: number; basis: string; }>();
    for (const list of allocsByLine.values()) {
      for (const a of list) {
        const cur = finalByItem.get(a.poItemId);
        if (cur) {
          cur.add += a.add;
          cur.basis = cur.basis === a.basis ? cur.basis : "mixed";
        } else {
          finalByItem.set(a.poItemId, {
            poId: a.poId, productId: a.productId, qty: a.qty,
            origCost: a.origCost, add: a.add, basis: a.basis,
          });
        }
      }
    }

    // Escritura: allocations por item + update de unit_cost.
    const allocByPo = new Map<number, { itemCount: number; allocated: number }>();
    for (const [itemId, f] of finalByItem) {
      const newCost = f.origCost + (f.qty > 0 ? f.add / f.qty : 0);
      await client.query(
        `INSERT INTO landed_cost_item_allocations
           (voucher_id, purchase_order_id, purchase_order_item_id, product_id,
            quantity, original_unit_cost, allocated_amount, new_unit_cost, allocation_basis)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [voucherId, f.poId, itemId, f.productId, String(f.qty), String(f.origCost), String(f.add), String(newCost), f.basis],
      );
      await client.query(
        `UPDATE purchase_order_items
            SET unit_cost = $2,
                total_cost = quantity * $2
          WHERE id = $1`,
        [itemId, String(newCost)],
      );
      const stat = allocByPo.get(f.poId) ?? { itemCount: 0, allocated: 0 };
      stat.itemCount++;
      stat.allocated += f.add;
      allocByPo.set(f.poId, stat);
    }

    // Actualizar targets con el monto asignado.
    for (const [poId, stat] of allocByPo) {
      await client.query(
        `UPDATE landed_cost_targets
            SET allocated_amount = $3
          WHERE voucher_id = $1 AND purchase_order_id = $2`,
        [voucherId, poId, String(stat.allocated)],
      );
    }

    const totalAllocated = [...allocByPo.values()].reduce((s, v) => s + v.allocated, 0);

    await client.query(
      `UPDATE landed_cost_vouchers
          SET status = 'applied',
              applied_at = now(),
              applied_by = $2,
              total_allocated = $3,
              updated_at = now()
        WHERE id = $1`,
      [voucherId, appliedBy, String(totalAllocated)],
    );

    await client.query("COMMIT");
    return {
      voucherId,
      totalCosts: Number(v.total_costs),
      totalAllocated,
      allocationsByPo: [...allocByPo].map(([poId, s]) => ({ purchaseOrderId: poId, itemCount: s.itemCount, allocated: s.allocated })),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Consultas ─────────────────────────────────────────────────────────────

export async function getVoucher(pool: Pool, voucherId: number) {
  const v = await pool.query(
    `SELECT id, store_id AS "storeId", voucher_code AS "voucherCode", description,
            voucher_date::text AS "voucherDate", shipment_reference AS "shipmentReference",
            bl_awb_number AS "blAwbNumber", supplier_id AS "supplierId",
            currency, default_allocation_method AS "defaultAllocationMethod",
            status, applied_at::text AS "appliedAt", applied_by AS "appliedBy",
            total_costs::text AS "totalCosts", total_allocated::text AS "totalAllocated",
            notes
       FROM landed_cost_vouchers WHERE id = $1`,
    [voucherId],
  );
  if (!v.rowCount) return null;
  const lines = await pool.query(
    `SELECT id, cost_type AS "costType", description, amount::text AS amount,
            allocation_method AS "allocationMethod",
            expense_document_ref AS "expenseDocumentRef",
            expense_account_code AS "expenseAccountCode",
            supplier_id AS "supplierId"
       FROM landed_cost_lines WHERE voucher_id = $1 ORDER BY id`,
    [voucherId],
  );
  const targets = await pool.query(
    `SELECT id, purchase_order_id AS "purchaseOrderId",
            total_weight_kg::text AS "totalWeightKg",
            total_volume_m3::text AS "totalVolumeM3",
            allocated_amount::text AS "allocatedAmount"
       FROM landed_cost_targets WHERE voucher_id = $1`,
    [voucherId],
  );
  const allocations = await pool.query(
    `SELECT purchase_order_id AS "purchaseOrderId", product_id AS "productId",
            quantity::text AS quantity,
            original_unit_cost::text AS "originalUnitCost",
            allocated_amount::text AS "allocatedAmount",
            new_unit_cost::text AS "newUnitCost",
            allocation_basis AS "allocationBasis"
       FROM landed_cost_item_allocations WHERE voucher_id = $1`,
    [voucherId],
  );
  return {
    voucher: v.rows[0],
    lines: lines.rows,
    targets: targets.rows,
    allocations: allocations.rows,
  };
}

export async function listVouchers(pool: Pool, storeId: number, filter?: { status?: string }) {
  const r = await pool.query(
    `SELECT id, voucher_code AS "voucherCode", description,
            voucher_date::text AS "voucherDate",
            shipment_reference AS "shipmentReference",
            status, total_costs::text AS "totalCosts",
            total_allocated::text AS "totalAllocated",
            created_at::text AS "createdAt"
       FROM landed_cost_vouchers
      WHERE store_id = $1 AND ($2::text IS NULL OR status = $2)
      ORDER BY voucher_date DESC, id DESC LIMIT 200`,
    [storeId, filter?.status ?? null],
  );
  return r.rows;
}
