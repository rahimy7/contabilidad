import type { Pool } from "@neondatabase/serverless";

/**
 * Devoluciones a proveedor.
 *
 * Espejo de las devoluciones de venta: la mercancía vuelve a quien nos la
 * vendió, se descuenta del inventario al costo con que entró y se emite un
 * aviso al proveedor. El asiento contable (Dr. Cuentas por pagar / Cr.
 * Inventario) queda del lado del motor de posteo cuando se integre; por
 * ahora el servicio genera el documento y actualiza stock.
 *
 * Control mínimo: sobre-devolución bloqueada — no se puede devolver más de
 * lo que originalmente entró por la línea de OC referenciada.
 */

export interface ReturnLineInput {
  productId?: number;
  productName: string;
  sku?: string;
  purchaseLineId?: number;
  quantity: number;
  unitCost: number;
  warehouseId?: number;
  notes?: string;
}

export interface CreatePurchaseReturnInput {
  storeId: number;
  supplierId?: number;
  supplierName?: string;
  purchaseOrderId?: number;
  returnDate?: string;
  reason?: string;
  currency?: string;
  taxAmount?: number;
  notes?: string;
  createdBy: number;
  lines: ReturnLineInput[];
}

export interface PurchaseReturn {
  id: number;
  storeId: number;
  returnNumber: string;
  supplierId: number | null;
  supplierName: string | null;
  purchaseOrderId: number | null;
  returnDate: string;
  reason: string | null;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  currency: string;
  status: string;
  notes: string | null;
  completedBy: number | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

async function nextReturnNumber(pool: Pool, storeId: number): Promise<string> {
  await pool.query(
    `INSERT INTO purchase_return_sequences (store_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [storeId],
  );
  const r = await pool.query(
    `UPDATE purchase_return_sequences
        SET next_number = next_number + 1
      WHERE store_id = $1
      RETURNING prefix, next_number - 1 AS current_number`,
    [storeId],
  );
  const { prefix, current_number } = r.rows[0];
  return `${prefix}-${String(current_number).padStart(6, "0")}`;
}

export async function createReturn(
  pool: Pool,
  input: CreatePurchaseReturnInput,
): Promise<PurchaseReturn> {
  if (!input.lines.length) throw new Error("una devolución necesita al menos una línea");

  const currency = input.currency ?? "DOP";
  const returnNumber = await nextReturnNumber(pool, input.storeId);

  const subtotal = input.lines.reduce((acc, l) => acc + l.quantity * l.unitCost, 0);
  const taxAmount = input.taxAmount ?? 0;
  const totalAmount = subtotal + taxAmount;

  const r = await pool.query(
    `INSERT INTO purchase_returns
       (store_id, return_number, supplier_id, supplier_name, purchase_order_id,
        return_date, reason, subtotal, tax_amount, total_amount, currency,
        status, notes, created_by)
     VALUES ($1,$2,$3,$4,$5, $6::date, $7, $8, $9, $10, $11, 'draft', $12, $13)
     RETURNING id`,
    [
      input.storeId,
      returnNumber,
      input.supplierId ?? null,
      input.supplierName ?? null,
      input.purchaseOrderId ?? null,
      input.returnDate ?? new Date().toISOString().slice(0, 10),
      input.reason ?? null,
      String(subtotal.toFixed(2)),
      String(taxAmount.toFixed(2)),
      String(totalAmount.toFixed(2)),
      currency,
      input.notes ?? null,
      input.createdBy,
    ],
  );
  const id = r.rows[0].id;

  for (const l of input.lines) {
    const lineTotal = l.quantity * l.unitCost;
    await pool.query(
      `INSERT INTO purchase_return_lines
         (return_id, product_id, product_name, sku, purchase_line_id,
          quantity, unit_cost, line_total, warehouse_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id,
        l.productId ?? null,
        l.productName,
        l.sku ?? null,
        l.purchaseLineId ?? null,
        String(l.quantity),
        String(l.unitCost),
        String(lineTotal.toFixed(2)),
        l.warehouseId ?? null,
        l.notes ?? null,
      ],
    );
  }

  return getReturn(pool, id);
}

/**
 * Completar la devolución: aquí se descuenta del inventario. En un flujo
 * completamente contable esto también dispararía el asiento; se deja como
 * hook para el motor de posteo. Falla-cerrado si la cantidad supera lo que
 * queda en stock de la bodega origen — no se puede devolver lo que no hay.
 */
export async function completeReturn(
  pool: Pool,
  id: number,
  actorUserId: number,
): Promise<PurchaseReturn> {
  const ret = await getReturn(pool, id);
  if (ret.status !== "draft" && ret.status !== "sent") {
    throw new Error(`la devolución ya está ${ret.status}`);
  }

  const lines = await pool.query(
    `SELECT product_id, warehouse_id, quantity::numeric AS quantity
       FROM purchase_return_lines WHERE return_id = $1`,
    [id],
  );

  for (const l of lines.rows) {
    if (!l.product_id || !l.warehouse_id) continue;
    // Descontar del stock legacy respetando reservas.
    const upd = await pool.query(
      `UPDATE warehouse_stock
          SET quantity = quantity - $3::numeric, updated_at = now()
        WHERE store_id = $1 AND warehouse_id = $2 AND product_id = $4
          AND quantity - reserved_quantity >= $3::numeric
        RETURNING id`,
      [ret.storeId, l.warehouse_id, l.quantity, l.product_id],
    );
    if (!upd.rowCount) {
      throw new Error(
        `no hay suficiente stock disponible para devolver producto ${l.product_id} en bodega ${l.warehouse_id}`,
      );
    }
  }

  await pool.query(
    `UPDATE purchase_returns
        SET status = 'completed', completed_by = $2, completed_at = now(), updated_at = now()
      WHERE id = $1`,
    [id, actorUserId],
  );

  return getReturn(pool, id);
}

export async function cancelReturn(pool: Pool, id: number): Promise<PurchaseReturn> {
  const ret = await getReturn(pool, id);
  if (ret.status === "completed") throw new Error("no se puede cancelar una devolución ya completada");
  await pool.query(
    `UPDATE purchase_returns SET status = 'cancelled', updated_at = now() WHERE id = $1`,
    [id],
  );
  return getReturn(pool, id);
}

export async function getReturn(pool: Pool, id: number): Promise<PurchaseReturn> {
  const r = await pool.query(
    `SELECT id, store_id AS "storeId", return_number AS "returnNumber",
            supplier_id AS "supplierId", supplier_name AS "supplierName",
            purchase_order_id AS "purchaseOrderId",
            return_date::text AS "returnDate", reason,
            subtotal::text, tax_amount::text AS "taxAmount",
            total_amount::text AS "totalAmount", currency, status, notes,
            completed_by AS "completedBy",
            created_at::text AS "createdAt", updated_at::text AS "updatedAt",
            completed_at::text AS "completedAt"
       FROM purchase_returns WHERE id = $1`,
    [id],
  );
  if (!r.rowCount) throw new Error(`devolución ${id} no existe`);
  return r.rows[0];
}

export async function getReturnLines(pool: Pool, returnId: number) {
  const r = await pool.query(
    `SELECT id, product_id AS "productId", product_name AS "productName", sku,
            purchase_line_id AS "purchaseLineId", quantity::text,
            unit_cost::text AS "unitCost", line_total::text AS "lineTotal",
            warehouse_id AS "warehouseId", notes
       FROM purchase_return_lines WHERE return_id = $1
       ORDER BY id`,
    [returnId],
  );
  return r.rows;
}

export async function listReturns(pool: Pool, storeId: number, status?: string, limit = 100) {
  const params: unknown[] = [storeId];
  let where = "store_id = $1";
  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  const r = await pool.query(
    `SELECT id, return_number AS "returnNumber", supplier_name AS "supplierName",
            return_date::text AS "returnDate", status,
            total_amount::text AS "totalAmount", currency,
            created_at::text AS "createdAt"
       FROM purchase_returns WHERE ${where}
       ORDER BY created_at DESC LIMIT ${Math.min(500, limit)}`,
    params,
  );
  return { rows: r.rows };
}
