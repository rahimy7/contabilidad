import type { Pool } from "@neondatabase/serverless";
import { requestApproval, getById as getApproval } from "./approvals";

/**
 * Requisiciones internas.
 *
 * Un empleado pide algo que la empresa comprará. La requisición pasa por
 * aprobación (motor genérico, `documentType='requisition'`); una vez aprobada
 * el comprador la convierte en orden de compra referenciando qué productos
 * y cantidades salieron de dónde.
 *
 * El monto estimado alimenta la regla de aprobación: una requisición de RD$
 * 500 puede pasarla el jefe directo, una de RD$ 50,000 exige gerencia. El
 * enlace `approval_request_id` mantiene el historial de la decisión.
 */

export interface RequisitionLineInput {
  productId?: number;
  productName: string;
  sku?: string;
  quantity: number;
  estimatedUnitCost?: number;
  notes?: string;
}

export interface CreateRequisitionInput {
  storeId: number;
  department?: string;
  requestedBy: number;
  warehouseId?: number;
  neededBy?: string;
  reason?: string;
  currency?: string;
  lines: RequisitionLineInput[];
}

async function nextRequisitionNumber(pool: Pool, storeId: number): Promise<string> {
  await pool.query(
    `INSERT INTO internal_requisition_sequences (store_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [storeId],
  );
  const r = await pool.query(
    `UPDATE internal_requisition_sequences SET next_number = next_number + 1
      WHERE store_id = $1 RETURNING prefix, next_number - 1 AS n`,
    [storeId],
  );
  return `${r.rows[0].prefix}-${String(r.rows[0].n).padStart(6, "0")}`;
}

export async function createRequisition(pool: Pool, input: CreateRequisitionInput) {
  if (!input.lines.length) throw new Error("una requisición necesita al menos una línea");

  const subtotal = input.lines.reduce(
    (a, l) => a + l.quantity * (l.estimatedUnitCost ?? 0),
    0,
  );

  const number = await nextRequisitionNumber(pool, input.storeId);
  const r = await pool.query(
    `INSERT INTO internal_requisitions
       (store_id, requisition_number, department, requested_by, warehouse_id,
        needed_by, reason, subtotal, currency, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft') RETURNING id`,
    [
      input.storeId, number, input.department ?? null, input.requestedBy,
      input.warehouseId ?? null, input.neededBy ?? null, input.reason ?? null,
      String(subtotal.toFixed(2)), input.currency ?? "DOP",
    ],
  );
  const id = r.rows[0].id;

  for (let i = 0; i < input.lines.length; i++) {
    const l = input.lines[i];
    const lineTotal = l.quantity * (l.estimatedUnitCost ?? 0);
    await pool.query(
      `INSERT INTO internal_requisition_lines
         (requisition_id, product_id, product_name, sku, quantity,
          estimated_unit_cost, line_total, notes, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id, l.productId ?? null, l.productName, l.sku ?? null,
        String(l.quantity), String((l.estimatedUnitCost ?? 0).toFixed(4)),
        String(lineTotal.toFixed(2)), l.notes ?? null, i,
      ],
    );
  }

  return getRequisition(pool, id);
}

/**
 * Enviar la requisición a aprobación: crea una `approval_requests`, guarda su
 * id en la requisición y cambia el estado. Un segundo envío devuelve la
 * misma solicitud sin duplicar.
 */
export async function submitForApproval(pool: Pool, id: number) {
  const req = await getRequisition(pool, id);
  if (req.status === "pending_approval") return req;
  if (req.status !== "draft") throw new Error(`la requisición está ${req.status}; no se puede enviar`);

  const approval = await requestApproval(pool, {
    storeId: req.storeId,
    documentType: "requisition",
    documentId: String(req.id),
    documentRef: req.requisitionNumber,
    amount: Number(req.subtotal),
    currency: req.currency,
    reason: req.reason ?? undefined,
    requestedBy: req.requestedBy,
  });
  await pool.query(
    `UPDATE internal_requisitions
        SET status = 'pending_approval', approval_request_id = $2, updated_at = now()
      WHERE id = $1`,
    [id, approval.id],
  );
  return getRequisition(pool, id);
}

/**
 * Reactive sync: consulta el estado de la aprobación asociada y actualiza el
 * de la requisición. Se llama antes de mostrar el detalle para que el estado
 * refleje la última acción del aprobador.
 */
export async function syncApprovalStatus(pool: Pool, id: number) {
  const req = await getRequisition(pool, id);
  if (!req.approvalRequestId) return req;
  if (req.status === "converted" || req.status === "cancelled") return req;

  const approval = await getApproval(pool, req.approvalRequestId);
  let nextStatus = req.status;
  if (approval.status === "approved") nextStatus = "approved";
  else if (approval.status === "rejected") nextStatus = "rejected";
  else if (approval.status === "cancelled") nextStatus = "cancelled";

  if (nextStatus !== req.status) {
    await pool.query(
      `UPDATE internal_requisitions SET status = $2, updated_at = now() WHERE id = $1`,
      [id, nextStatus],
    );
    return getRequisition(pool, id);
  }
  return req;
}

export async function cancelRequisition(pool: Pool, id: number) {
  const req = await getRequisition(pool, id);
  if (req.status === "converted") throw new Error("no se puede cancelar una requisición ya convertida");
  await pool.query(
    `UPDATE internal_requisitions SET status = 'cancelled', updated_at = now() WHERE id = $1`,
    [id],
  );
  return getRequisition(pool, id);
}

export async function getRequisition(pool: Pool, id: number) {
  const r = await pool.query(
    `SELECT id, store_id AS "storeId", requisition_number AS "requisitionNumber",
            department, requested_by AS "requestedBy", warehouse_id AS "warehouseId",
            needed_by::text AS "neededBy", reason, subtotal::text, currency, status,
            approval_request_id AS "approvalRequestId",
            converted_purchase_order_id AS "convertedPurchaseOrderId",
            converted_at::text AS "convertedAt",
            created_at::text AS "createdAt", updated_at::text AS "updatedAt"
       FROM internal_requisitions WHERE id = $1`,
    [id],
  );
  if (!r.rowCount) throw new Error(`requisición ${id} no existe`);
  return r.rows[0];
}

export async function getRequisitionLines(pool: Pool, id: number) {
  const r = await pool.query(
    `SELECT id, product_id AS "productId", product_name AS "productName", sku,
            quantity::text, estimated_unit_cost::text AS "estimatedUnitCost",
            line_total::text AS "lineTotal", notes, sort_order AS "sortOrder"
       FROM internal_requisition_lines WHERE requisition_id = $1
       ORDER BY sort_order, id`,
    [id],
  );
  return r.rows;
}

export async function listRequisitions(pool: Pool, storeId: number, status?: string, requestedBy?: number) {
  const params: unknown[] = [storeId];
  let where = "store_id = $1";
  if (status) { params.push(status); where += ` AND status = $${params.length}`; }
  if (requestedBy != null) { params.push(requestedBy); where += ` AND requested_by = $${params.length}`; }
  const r = await pool.query(
    `SELECT id, requisition_number AS "requisitionNumber", department,
            requested_by AS "requestedBy", needed_by::text AS "neededBy",
            subtotal::text, currency, status,
            created_at::text AS "createdAt"
       FROM internal_requisitions WHERE ${where}
       ORDER BY created_at DESC LIMIT 200`,
    params,
  );
  return { rows: r.rows };
}
