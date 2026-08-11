import type { Pool } from "@neondatabase/serverless";

/**
 * Motor genérico de aprobaciones.
 *
 * La regla que elige el aprobador se busca por tipo de documento, monto y
 * store; se resuelve por prioridad (más baja primero) y por si el monto entra
 * en el rango. Un caller pide una aprobación con `requestApproval`; el
 * aprobador la resuelve con `resolveApproval` (approve/reject); el llamador
 * consulta si un documento está autorizado con `isApproved` antes de mover.
 *
 * La forma que va aquí y NO en los llamadores:
 *   - unicidad de solicitud pendiente por documento (índice único parcial);
 *   - transición de estado con contador de aprobaciones múltiples;
 *   - historial inmutable en `approval_actions` para auditoría.
 *
 * Lo que queda del lado del llamador:
 *   - qué hacer cuando se aprueba/rechaza (postear la OC, aplicar el descuento,
 *     ejecutar el ajuste, etc.) — un webhook o una consulta reactiva.
 */

export interface RequestApprovalInput {
  storeId: number;
  documentType: string;
  documentId: string | number;
  documentRef?: string;
  amount: number;
  currency?: string;
  requestedBy: number;
  reason?: string;
}

export interface ApprovalRequestRow {
  id: number;
  storeId: number;
  documentType: string;
  documentId: string;
  documentRef: string | null;
  amount: string;
  currency: string;
  requestedBy: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  requiredApprovals: number;
  receivedApprovals: number;
  approverRole: string | null;
  approverUserId: number | null;
  ruleId: number | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

interface MatchedRule {
  ruleId: number | null;
  approverRole: string | null;
  approverUserId: number | null;
  requiredApprovals: number;
}

async function pickRule(
  pool: Pool,
  storeId: number,
  documentType: string,
  amount: number,
): Promise<MatchedRule> {
  const r = await pool.query(
    `SELECT id, approver_role, approver_user_id, required_approvals
       FROM approval_rules
      WHERE store_id = $1
        AND document_type = $2
        AND is_active = true
        AND min_amount <= $3::numeric
        AND (max_amount IS NULL OR max_amount >= $3::numeric)
      ORDER BY priority ASC, id ASC
      LIMIT 1`,
    [storeId, documentType, String(amount)],
  );
  if (!r.rowCount) {
    return { ruleId: null, approverRole: "admin", approverUserId: null, requiredApprovals: 1 };
  }
  return {
    ruleId: r.rows[0].id,
    approverRole: r.rows[0].approver_role,
    approverUserId: r.rows[0].approver_user_id,
    requiredApprovals: r.rows[0].required_approvals,
  };
}

export async function requestApproval(
  pool: Pool,
  input: RequestApprovalInput,
): Promise<ApprovalRequestRow> {
  const documentId = String(input.documentId);
  const rule = await pickRule(pool, input.storeId, input.documentType, input.amount);

  // Reactivar una solicitud cancelada de este documento antes que crear otra;
  // el índice único parcial (WHERE status='pending') evita duplicados vivos.
  const existing = await pool.query(
    `SELECT id FROM approval_requests
      WHERE store_id = $1 AND document_type = $2 AND document_id = $3 AND status = 'pending'
      LIMIT 1`,
    [input.storeId, input.documentType, documentId],
  );
  if (existing.rowCount) {
    return getById(pool, existing.rows[0].id);
  }

  const inserted = await pool.query(
    `INSERT INTO approval_requests (
       store_id, document_type, document_id, document_ref, amount, currency,
       requested_by, reason, status, required_approvals, received_approvals,
       approver_role, approver_user_id, rule_id
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,0,$10,$11,$12)
     RETURNING id`,
    [
      input.storeId,
      input.documentType,
      documentId,
      input.documentRef ?? null,
      String(input.amount),
      input.currency ?? "DOP",
      input.requestedBy,
      input.reason ?? null,
      rule.requiredApprovals,
      rule.approverRole,
      rule.approverUserId,
      rule.ruleId,
    ],
  );
  return getById(pool, inserted.rows[0].id);
}

export async function resolveApproval(
  pool: Pool,
  requestId: number,
  actorUserId: number,
  action: "approve" | "reject" | "comment" | "cancel",
  comment?: string,
): Promise<ApprovalRequestRow> {
  const current = await getById(pool, requestId);
  if (current.status !== "pending" && action !== "comment") {
    throw new Error(`la solicitud ${requestId} ya está ${current.status}`);
  }

  // Registrar la acción antes de aplicar cualquier transición, para que la
  // bitácora quede aunque el UPDATE falle.
  await pool.query(
    `INSERT INTO approval_actions (request_id, actor_user_id, action, comment)
     VALUES ($1, $2, $3, $4)`,
    [requestId, actorUserId, action, comment ?? null],
  );

  if (action === "comment") return getById(pool, requestId);

  if (action === "cancel") {
    await pool.query(
      `UPDATE approval_requests
          SET status = 'cancelled', resolved_at = now(), updated_at = now()
        WHERE id = $1`,
      [requestId],
    );
    return getById(pool, requestId);
  }

  if (action === "reject") {
    await pool.query(
      `UPDATE approval_requests
          SET status = 'rejected', resolved_at = now(), updated_at = now()
        WHERE id = $1`,
      [requestId],
    );
    return getById(pool, requestId);
  }

  // approve: incrementar el contador; si alcanza required_approvals, cerrar.
  await pool.query(
    `UPDATE approval_requests
        SET received_approvals = received_approvals + 1,
            updated_at = now(),
            status = CASE
              WHEN received_approvals + 1 >= required_approvals THEN 'approved'
              ELSE status
            END,
            resolved_at = CASE
              WHEN received_approvals + 1 >= required_approvals THEN now()
              ELSE resolved_at
            END
      WHERE id = $1`,
    [requestId],
  );
  return getById(pool, requestId);
}

export async function getById(pool: Pool, id: number): Promise<ApprovalRequestRow> {
  const r = await pool.query(
    `SELECT id, store_id, document_type, document_id, document_ref, amount::text,
            currency, requested_by, reason, status, required_approvals,
            received_approvals, approver_role, approver_user_id, rule_id,
            created_at, updated_at, resolved_at
       FROM approval_requests WHERE id = $1`,
    [id],
  );
  if (!r.rowCount) throw new Error(`solicitud ${id} no existe`);
  const row = r.rows[0];
  return {
    id: row.id,
    storeId: row.store_id,
    documentType: row.document_type,
    documentId: row.document_id,
    documentRef: row.document_ref,
    amount: row.amount,
    currency: row.currency,
    requestedBy: row.requested_by,
    reason: row.reason,
    status: row.status,
    requiredApprovals: row.required_approvals,
    receivedApprovals: row.received_approvals,
    approverRole: row.approver_role,
    approverUserId: row.approver_user_id,
    ruleId: row.rule_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
  };
}

/**
 * Verificación reactiva: ¿este documento tiene una aprobación cerrada en verde?
 * Diseñada para llamarse antes de una operación sensible (postear la OC, aplicar
 * un descuento fuera de política) y decidir si sigue o pide aprobación.
 */
export async function isApproved(
  pool: Pool,
  storeId: number,
  documentType: string,
  documentId: string | number,
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM approval_requests
      WHERE store_id = $1 AND document_type = $2 AND document_id = $3 AND status = 'approved'
      LIMIT 1`,
    [storeId, documentType, String(documentId)],
  );
  return (r.rowCount ?? 0) > 0;
}

export interface ListFilters {
  storeId: number;
  status?: string;
  documentType?: string;
  approverUserId?: number;
  approverRole?: string;
  limit?: number;
  offset?: number;
}

export async function listRequests(
  pool: Pool,
  filters: ListFilters,
): Promise<{ total: number; rows: ApprovalRequestRow[] }> {
  const conditions: string[] = ["store_id = $1"];
  const params: unknown[] = [filters.storeId];
  const push = (frag: string, val: unknown) => {
    params.push(val);
    conditions.push(frag.replace("$?", `$${params.length}`));
  };
  if (filters.status) push("status = $?", filters.status);
  if (filters.documentType) push("document_type = $?", filters.documentType);
  if (filters.approverUserId != null) push("approver_user_id = $?", filters.approverUserId);
  if (filters.approverRole) push("approver_role = $?", filters.approverRole);

  const limit = Math.min(500, Math.max(1, filters.limit ?? 100));
  const offset = Math.max(0, filters.offset ?? 0);

  const where = conditions.join(" AND ");
  const [list, totals] = await Promise.all([
    pool.query(
      `SELECT id, store_id, document_type, document_id, document_ref, amount::text,
              currency, requested_by, reason, status, required_approvals,
              received_approvals, approver_role, approver_user_id, rule_id,
              created_at, updated_at, resolved_at
         FROM approval_requests WHERE ${where}
         ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`,
      params,
    ),
    pool.query(`SELECT count(*)::int AS total FROM approval_requests WHERE ${where}`, params),
  ]);
  return {
    total: totals.rows[0]?.total ?? 0,
    rows: list.rows.map((row) => ({
      id: row.id,
      storeId: row.store_id,
      documentType: row.document_type,
      documentId: row.document_id,
      documentRef: row.document_ref,
      amount: row.amount,
      currency: row.currency,
      requestedBy: row.requested_by,
      reason: row.reason,
      status: row.status,
      requiredApprovals: row.required_approvals,
      receivedApprovals: row.received_approvals,
      approverRole: row.approver_role,
      approverUserId: row.approver_user_id,
      ruleId: row.rule_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      resolvedAt: row.resolved_at,
    })),
  };
}
