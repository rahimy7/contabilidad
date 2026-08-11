import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import {
  createRequisition, submitForApproval, syncApprovalStatus, cancelRequisition,
  getRequisition, listRequisitions,
} from "../server/services/requisitions";
import { resolveApproval } from "../server/services/approvals";

neonConfig.webSocketConstructor = ws;

describeIntegration("internal requisitions", () => {
  let pool: Pool;
  const storeId = 999_711;
  let approverId: number;
  let requesterId: number;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });

    await pool.query(`DELETE FROM internal_requisition_lines WHERE requisition_id IN (SELECT id FROM internal_requisitions WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM internal_requisitions WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM internal_requisition_sequences WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM approval_actions WHERE request_id IN (SELECT id FROM approval_requests WHERE store_id=$1 AND document_type='requisition')`, [storeId]);
    await pool.query(`DELETE FROM approval_requests WHERE store_id=$1 AND document_type='requisition'`, [storeId]);
    await pool.query(`DELETE FROM approval_rules WHERE store_id=$1 AND document_type='requisition'`, [storeId]);
    await pool.query(`DELETE FROM users WHERE username IN ('req-boss','req-clerk')`);

    const boss = await pool.query(
      `INSERT INTO users (username, password, name, role, status)
       VALUES ('req-boss', 'x', 'Approver', 'admin', 'active') RETURNING id`,
    );
    approverId = boss.rows[0].id;
    const clerk = await pool.query(
      `INSERT INTO users (username, password, name, role, status)
       VALUES ('req-clerk', 'x', 'Requester', 'seller', 'active') RETURNING id`,
    );
    requesterId = clerk.rows[0].id;

    // Regla: admin aprueba requisiciones hasta cualquier monto.
    await pool.query(
      `INSERT INTO approval_rules
         (store_id, document_type, min_amount, max_amount, approver_role, required_approvals, priority)
       VALUES ($1, 'requisition', 0, NULL, 'admin', 1, 100)`,
      [storeId],
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM internal_requisition_lines WHERE requisition_id IN (SELECT id FROM internal_requisitions WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM internal_requisitions WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM internal_requisition_sequences WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM approval_actions WHERE request_id IN (SELECT id FROM approval_requests WHERE store_id=$1 AND document_type='requisition')`, [storeId]);
    await pool.query(`DELETE FROM approval_requests WHERE store_id=$1 AND document_type='requisition'`, [storeId]);
    await pool.query(`DELETE FROM approval_rules WHERE store_id=$1 AND document_type='requisition'`, [storeId]);
    await pool.query(`DELETE FROM users WHERE id IN ($1, $2)`, [approverId, requesterId]);
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM internal_requisition_lines WHERE requisition_id IN (SELECT id FROM internal_requisitions WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM internal_requisitions WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM internal_requisition_sequences WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM approval_actions WHERE request_id IN (SELECT id FROM approval_requests WHERE store_id=$1 AND document_type='requisition')`, [storeId]);
    await pool.query(`DELETE FROM approval_requests WHERE store_id=$1 AND document_type='requisition'`, [storeId]);
  });

  it("crea una requisición con subtotal y correlativo", async () => {
    const req = await createRequisition(pool, {
      storeId, requestedBy: requesterId,
      department: "Compras", reason: "Test",
      lines: [
        { productName: "Papel A4", quantity: 10, estimatedUnitCost: 200 },
        { productName: "Tinta", quantity: 2, estimatedUnitCost: 500 },
      ],
    });
    expect(req.requisitionNumber).toBe("REQ-000001");
    expect(Number(req.subtotal)).toBe(3000);
    expect(req.status).toBe("draft");
  });

  it("submit crea la solicitud de aprobación y cambia el estado", async () => {
    const req = await createRequisition(pool, {
      storeId, requestedBy: requesterId, department: "Compras",
      lines: [{ productName: "P", quantity: 1, estimatedUnitCost: 500 }],
    });
    const after = await submitForApproval(pool, req.id);
    expect(after.status).toBe("pending_approval");
    expect(after.approvalRequestId).not.toBeNull();

    // Verificar que la aprobación apunte de vuelta a la requisición.
    const ap = await pool.query(
      `SELECT document_type, document_id FROM approval_requests WHERE id = $1`,
      [after.approvalRequestId],
    );
    expect(ap.rows[0].document_type).toBe("requisition");
    expect(ap.rows[0].document_id).toBe(String(req.id));
  });

  it("aprobar la solicitud actualiza el estado de la requisición al sincronizar", async () => {
    const req = await createRequisition(pool, {
      storeId, requestedBy: requesterId,
      lines: [{ productName: "P", quantity: 1, estimatedUnitCost: 500 }],
    });
    const submitted = await submitForApproval(pool, req.id);
    await resolveApproval(pool, submitted.approvalRequestId!, approverId, "approve");

    const synced = await syncApprovalStatus(pool, req.id);
    expect(synced.status).toBe("approved");
  });

  it("rechazar la solicitud sincroniza a 'rejected'", async () => {
    const req = await createRequisition(pool, {
      storeId, requestedBy: requesterId,
      lines: [{ productName: "P", quantity: 1, estimatedUnitCost: 500 }],
    });
    const submitted = await submitForApproval(pool, req.id);
    await resolveApproval(pool, submitted.approvalRequestId!, approverId, "reject", "sin presupuesto");

    const synced = await syncApprovalStatus(pool, req.id);
    expect(synced.status).toBe("rejected");
  });

  it("un segundo submit devuelve el mismo estado sin duplicar aprobación", async () => {
    const req = await createRequisition(pool, {
      storeId, requestedBy: requesterId,
      lines: [{ productName: "P", quantity: 1, estimatedUnitCost: 500 }],
    });
    const a = await submitForApproval(pool, req.id);
    const b = await submitForApproval(pool, req.id);
    expect(a.approvalRequestId).toBe(b.approvalRequestId);
  });

  it("cancelar bloquea si ya se convirtió", async () => {
    const req = await createRequisition(pool, {
      storeId, requestedBy: requesterId,
      lines: [{ productName: "P", quantity: 1, estimatedUnitCost: 500 }],
    });
    // Marcar como convertida directamente en BD.
    await pool.query(
      `UPDATE internal_requisitions SET status = 'converted', converted_at = now() WHERE id = $1`,
      [req.id],
    );
    await expect(cancelRequisition(pool, req.id)).rejects.toThrow(/convertida/);
  });

  it("la lista filtra por status y por solicitante", async () => {
    await createRequisition(pool, {
      storeId, requestedBy: requesterId,
      lines: [{ productName: "P", quantity: 1, estimatedUnitCost: 100 }],
    });
    await createRequisition(pool, {
      storeId, requestedBy: approverId,
      lines: [{ productName: "Q", quantity: 1, estimatedUnitCost: 100 }],
    });

    const mine = await listRequisitions(pool, storeId, undefined, requesterId);
    expect(mine.rows.length).toBe(1);
    const drafts = await listRequisitions(pool, storeId, "draft");
    expect(drafts.rows.length).toBe(2);
  });
});
