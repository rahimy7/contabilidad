import express, { type Response } from "express";
import { z } from "zod";
import { authenticateToken, type AuthenticatedRequest } from "../authMiddleware";
import { masterPool } from "../multi-tenant-db";
import {
  createRequisition, submitForApproval, syncApprovalStatus, cancelRequisition,
  getRequisition, getRequisitionLines, listRequisitions,
} from "../services/requisitions";

const router = express.Router();

const lineSchema = z.object({
  productId: z.number().int().positive().optional(),
  productName: z.string().min(1),
  sku: z.string().optional(),
  quantity: z.number().positive(),
  estimatedUnitCost: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

const createBody = z.object({
  department: z.string().optional(),
  warehouseId: z.number().int().positive().optional(),
  neededBy: z.string().optional(),
  reason: z.string().optional(),
  currency: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

router.get("/requisitions", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const storeId = typeof user.storeId === "string" ? parseInt(user.storeId) : user.storeId;
  const status = req.query.status ? String(req.query.status) : undefined;
  const mine = req.query.mine === "true";
  res.json(await listRequisitions(masterPool, storeId, status, mine ? user.id : undefined));
});

router.post("/requisitions", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const storeId = typeof user.storeId === "string" ? parseInt(user.storeId) : user.storeId;
    const body = createBody.parse(req.body);
    const r = await createRequisition(masterPool, { storeId, requestedBy: user.id, ...body });
    res.status(201).json(r);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    console.error("[requisitions] create failed:", err);
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/requisitions/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Sincronizar estado con la aprobación antes de responder.
    const req0 = await syncApprovalStatus(masterPool, Number(req.params.id));
    const lines = await getRequisitionLines(masterPool, req0.id);
    res.json({ requisition: req0, lines });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("no existe")) return res.status(404).json({ error: msg });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/requisitions/:id/submit", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await submitForApproval(masterPool, Number(req.params.id)));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("está")) return res.status(409).json({ error: msg });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/requisitions/:id/cancel", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await cancelRequisition(masterPool, Number(req.params.id)));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("convertida")) return res.status(409).json({ error: msg });
    res.status(500).json({ error: "Failed" });
  }
});

// Endpoint helper: la requisición usa la misma tabla de aprobación; para
// evitar tener que consultar dos endpoints, exponemos el detalle unido.
router.get("/requisitions/:id/full", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const r = await syncApprovalStatus(masterPool, Number(req.params.id));
    const lines = await getRequisitionLines(masterPool, r.id);
    const approval = r.approvalRequestId
      ? (await masterPool.query(
          `SELECT id, status, required_approvals AS "requiredApprovals",
                  received_approvals AS "receivedApprovals",
                  approver_role AS "approverRole",
                  approver_user_id AS "approverUserId",
                  created_at::text AS "createdAt",
                  resolved_at::text AS "resolvedAt"
             FROM approval_requests WHERE id = $1`,
          [r.approvalRequestId],
        )).rows[0]
      : null;
    res.json({ requisition: r, lines, approval });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("no existe")) return res.status(404).json({ error: msg });
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
