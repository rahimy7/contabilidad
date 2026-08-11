import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import {
  requestApproval,
  resolveApproval,
  isApproved,
  listRequests,
  getById,
} from "../server/services/approvals";

neonConfig.webSocketConstructor = ws;

/**
 * Motor de aprobaciones (Fase 01). Los tests aplican la regla, avanzan la
 * solicitud por acciones y comprueban las tres invariantes:
 *   - se elige la regla más específica dentro de rango;
 *   - un documento sólo tiene una solicitud viva a la vez;
 *   - approve/reject son terminales; comment no cambia estado.
 */
describeIntegration("approvals engine", () => {
  let pool: Pool;
  let storeId: number;
  let approverUserId: number;
  let requesterUserId: number;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    storeId = 999_766;

    await pool.query(`DELETE FROM approval_actions WHERE request_id IN (SELECT id FROM approval_requests WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM approval_requests WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM approval_rules WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM users WHERE username IN ('appr-boss','appr-clerk')`);

    const boss = await pool.query(
      `INSERT INTO users (username, password, name, role, status)
       VALUES ('appr-boss', 'x', 'Approver Boss', 'admin', 'active') RETURNING id`,
    );
    approverUserId = boss.rows[0].id;
    const clerk = await pool.query(
      `INSERT INTO users (username, password, name, role, status)
       VALUES ('appr-clerk', 'x', 'Requester', 'seller', 'active') RETURNING id`,
    );
    requesterUserId = clerk.rows[0].id;

    await pool.query(
      `INSERT INTO approval_rules
         (store_id, document_type, min_amount, max_amount, approver_role, required_approvals, priority)
       VALUES ($1, 'purchase_order', 0, 10000, 'admin', 1, 200)`,
      [storeId],
    );
    await pool.query(
      `INSERT INTO approval_rules
         (store_id, document_type, min_amount, max_amount, approver_user_id, required_approvals, priority)
       VALUES ($1, 'purchase_order', 10000.01, NULL, $2, 2, 100)`,
      [storeId, approverUserId],
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM approval_actions WHERE request_id IN (SELECT id FROM approval_requests WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM approval_requests WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM approval_rules WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM users WHERE id IN ($1, $2)`, [approverUserId, requesterUserId]);
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM approval_actions WHERE request_id IN (SELECT id FROM approval_requests WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM approval_requests WHERE store_id=$1`, [storeId]);
  });

  it("elige la regla de menor prioridad dentro de rango", async () => {
    const small = await requestApproval(pool, {
      storeId,
      documentType: "purchase_order",
      documentId: "PO-1001",
      amount: 5000,
      requestedBy: requesterUserId,
    });
    expect(small.approverRole).toBe("admin");
    expect(small.requiredApprovals).toBe(1);

    const big = await requestApproval(pool, {
      storeId,
      documentType: "purchase_order",
      documentId: "PO-1002",
      amount: 25000,
      requestedBy: requesterUserId,
    });
    expect(big.approverUserId).toBe(approverUserId);
    expect(big.requiredApprovals).toBe(2);
  });

  it("una segunda solicitud sobre el mismo documento devuelve la existente", async () => {
    const a = await requestApproval(pool, {
      storeId, documentType: "purchase_order", documentId: "PO-2001",
      amount: 3000, requestedBy: requesterUserId,
    });
    const b = await requestApproval(pool, {
      storeId, documentType: "purchase_order", documentId: "PO-2001",
      amount: 3000, requestedBy: requesterUserId,
    });
    expect(a.id).toBe(b.id);
  });

  it("approve cierra la solicitud y isApproved lo confirma", async () => {
    const req = await requestApproval(pool, {
      storeId, documentType: "purchase_order", documentId: "PO-3001",
      amount: 2500, requestedBy: requesterUserId,
    });
    expect(await isApproved(pool, storeId, "purchase_order", "PO-3001")).toBe(false);

    const resolved = await resolveApproval(pool, req.id, approverUserId, "approve");
    expect(resolved.status).toBe("approved");
    expect(resolved.receivedApprovals).toBe(1);
    expect(await isApproved(pool, storeId, "purchase_order", "PO-3001")).toBe(true);
  });

  it("reject cierra la solicitud y no queda como aprobada", async () => {
    const req = await requestApproval(pool, {
      storeId, documentType: "purchase_order", documentId: "PO-3002",
      amount: 2500, requestedBy: requesterUserId,
    });
    const resolved = await resolveApproval(pool, req.id, approverUserId, "reject", "monto alto");
    expect(resolved.status).toBe("rejected");
    expect(await isApproved(pool, storeId, "purchase_order", "PO-3002")).toBe(false);
  });

  it("requiere N aprobaciones antes de cerrar", async () => {
    const req = await requestApproval(pool, {
      storeId, documentType: "purchase_order", documentId: "PO-4001",
      amount: 50000, requestedBy: requesterUserId,
    });
    expect(req.requiredApprovals).toBe(2);
    const first = await resolveApproval(pool, req.id, approverUserId, "approve");
    expect(first.status).toBe("pending");
    expect(first.receivedApprovals).toBe(1);
    const second = await resolveApproval(pool, req.id, requesterUserId, "approve");
    expect(second.status).toBe("approved");
    expect(second.receivedApprovals).toBe(2);
  });

  it("no se puede aprobar una solicitud ya cerrada", async () => {
    const req = await requestApproval(pool, {
      storeId, documentType: "purchase_order", documentId: "PO-5001",
      amount: 2500, requestedBy: requesterUserId,
    });
    await resolveApproval(pool, req.id, approverUserId, "reject");
    await expect(
      resolveApproval(pool, req.id, approverUserId, "approve"),
    ).rejects.toThrow(/ya está/);
  });

  it("comment agrega historial sin cambiar estado", async () => {
    const req = await requestApproval(pool, {
      storeId, documentType: "purchase_order", documentId: "PO-6001",
      amount: 2500, requestedBy: requesterUserId,
    });
    await resolveApproval(pool, req.id, approverUserId, "comment", "revisando");
    const after = await getById(pool, req.id);
    expect(after.status).toBe("pending");
    const actions = await pool.query(
      `SELECT action, comment FROM approval_actions WHERE request_id=$1 ORDER BY id`,
      [req.id],
    );
    expect(actions.rows[0]).toMatchObject({ action: "comment", comment: "revisando" });
  });

  it("cancel cierra la solicitud sin aprobar", async () => {
    const req = await requestApproval(pool, {
      storeId, documentType: "purchase_order", documentId: "PO-7001",
      amount: 2500, requestedBy: requesterUserId,
    });
    const cancelled = await resolveApproval(pool, req.id, requesterUserId, "cancel", "duplicado");
    expect(cancelled.status).toBe("cancelled");
    expect(await isApproved(pool, storeId, "purchase_order", "PO-7001")).toBe(false);
  });

  it("la lista filtra por estado y por tipo", async () => {
    await requestApproval(pool, {
      storeId, documentType: "purchase_order", documentId: "PO-8001",
      amount: 2000, requestedBy: requesterUserId,
    });
    await requestApproval(pool, {
      storeId, documentType: "vacation_request", documentId: "VAC-8002",
      amount: 0, requestedBy: requesterUserId,
    });
    const pos = await listRequests(pool, { storeId, documentType: "purchase_order" });
    const vac = await listRequests(pool, { storeId, documentType: "vacation_request" });
    expect(pos.total).toBe(1);
    expect(vac.total).toBe(1);
    expect(pos.rows[0].documentType).toBe("purchase_order");
  });
});
