import express, { type Response } from "express";
import { z } from "zod";
import { authenticateToken, requireAdmin, type AuthenticatedRequest } from "../authMiddleware";
import { masterPool } from "../multi-tenant-db";
import {
  requestApproval,
  resolveApproval,
  getById,
  listRequests,
} from "../services/approvals";

const router = express.Router();

const createBody = z.object({
  documentType: z.string().min(1),
  documentId: z.union([z.string(), z.number()]),
  documentRef: z.string().optional(),
  amount: z.number().nonnegative(),
  currency: z.string().default("DOP"),
  reason: z.string().optional(),
});

const resolveBody = z.object({
  action: z.enum(["approve", "reject", "comment", "cancel"]),
  comment: z.string().optional(),
});

router.get("/approvals", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const storeId = typeof user.storeId === "string" ? parseInt(user.storeId) : user.storeId;
    const result = await listRequests(masterPool, {
      storeId,
      status: req.query.status ? String(req.query.status) : undefined,
      documentType: req.query.documentType ? String(req.query.documentType) : undefined,
      approverUserId: req.query.approverUserId ? Number(req.query.approverUserId) : undefined,
      approverRole: req.query.approverRole ? String(req.query.approverRole) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });
    res.json(result);
  } catch (err) {
    console.error("[approvals] list failed:", err);
    res.status(500).json({ error: "Failed to list approvals" });
  }
});

// Bandeja del aprobador: filtro conveniente por rol del usuario actual.
router.get("/approvals/inbox", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const storeId = typeof user.storeId === "string" ? parseInt(user.storeId) : user.storeId;
    // Aprobaciones dirigidas al usuario por rol o por id explícito.
    const result = await masterPool.query(
      `SELECT id, document_type, document_id, document_ref, amount::text AS amount,
              currency, requested_by, reason, status,
              required_approvals, received_approvals,
              approver_role, approver_user_id, rule_id, created_at
         FROM approval_requests
        WHERE store_id = $1 AND status = 'pending'
          AND (approver_user_id = $2 OR approver_role = $3)
        ORDER BY created_at ASC, id ASC
        LIMIT 200`,
      [storeId, user.id, user.role],
    );
    res.json({ rows: result.rows });
  } catch (err) {
    console.error("[approvals] inbox failed:", err);
    res.status(500).json({ error: "Failed to load inbox" });
  }
});

router.post("/approvals", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const body = createBody.parse(req.body);
    const storeId = typeof user.storeId === "string" ? parseInt(user.storeId) : user.storeId;
    const out = await requestApproval(masterPool, {
      storeId,
      documentType: body.documentType,
      documentId: body.documentId,
      documentRef: body.documentRef,
      amount: body.amount,
      currency: body.currency,
      reason: body.reason,
      requestedBy: user.id,
    });
    res.status(201).json(out);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return res.status(422).json({ error: "Validation failed", issues: err.issues });
    }
    console.error("[approvals] create failed:", err);
    res.status(500).json({ error: "Failed to create approval request" });
  }
});

router.get("/approvals/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const request = await getById(masterPool, Number(req.params.id));
    const actions = await masterPool.query(
      `SELECT id, actor_user_id, action, comment, created_at
         FROM approval_actions WHERE request_id = $1 ORDER BY created_at ASC, id ASC`,
      [request.id],
    );
    res.json({ request, actions: actions.rows });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "not found";
    if (msg.includes("no existe")) return res.status(404).json({ error: msg });
    console.error("[approvals] get failed:", err);
    res.status(500).json({ error: "Failed to fetch approval" });
  }
});

router.post("/approvals/:id/resolve", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const body = resolveBody.parse(req.body);
    const out = await resolveApproval(
      masterPool,
      Number(req.params.id),
      user.id,
      body.action,
      body.comment,
    );
    res.json(out);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return res.status(422).json({ error: "Validation failed", issues: err.issues });
    }
    const msg = err instanceof Error ? err.message : "resolve failed";
    if (msg.includes("ya está")) return res.status(409).json({ error: msg });
    console.error("[approvals] resolve failed:", err);
    res.status(500).json({ error: "Failed to resolve approval" });
  }
});

// ── Reglas (admin) ──────────────────────────────────────────────────────────

router.get("/approval-rules", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const storeId = typeof user.storeId === "string" ? parseInt(user.storeId) : user.storeId;
  const rows = await masterPool.query(
    `SELECT id, document_type, min_amount::text AS min_amount,
            max_amount::text AS max_amount, approver_role, approver_user_id,
            required_approvals, is_active, priority, notes
       FROM approval_rules WHERE store_id = $1
       ORDER BY document_type, priority, id`,
    [storeId],
  );
  res.json({ rows: rows.rows });
});

const ruleBody = z.object({
  documentType: z.string().min(1),
  minAmount: z.number().nonnegative().default(0),
  maxAmount: z.number().positive().optional(),
  approverRole: z.string().optional(),
  approverUserId: z.number().int().positive().optional(),
  requiredApprovals: z.number().int().positive().default(1),
  isActive: z.boolean().default(true),
  priority: z.number().int().default(100),
  notes: z.string().optional(),
}).refine((v) => v.approverRole || v.approverUserId, {
  message: "approverRole o approverUserId requerido",
});

router.post("/approval-rules", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const storeId = typeof user.storeId === "string" ? parseInt(user.storeId) : user.storeId;
    const body = ruleBody.parse(req.body);
    const r = await masterPool.query(
      `INSERT INTO approval_rules
         (store_id, document_type, min_amount, max_amount, approver_role,
          approver_user_id, required_approvals, is_active, priority, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        storeId,
        body.documentType,
        String(body.minAmount),
        body.maxAmount ? String(body.maxAmount) : null,
        body.approverRole ?? null,
        body.approverUserId ?? null,
        body.requiredApprovals,
        body.isActive,
        body.priority,
        body.notes ?? null,
      ],
    );
    res.status(201).json({ id: r.rows[0].id });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return res.status(422).json({ error: "Validation failed", issues: err.issues });
    }
    console.error("[approvals] rule create failed:", err);
    res.status(500).json({ error: "Failed to create rule" });
  }
});

router.delete("/approval-rules/:id", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const storeId = typeof user.storeId === "string" ? parseInt(user.storeId) : user.storeId;
    await masterPool.query(
      `DELETE FROM approval_rules WHERE id = $1 AND store_id = $2`,
      [Number(req.params.id), storeId],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[approvals] rule delete failed:", err);
    res.status(500).json({ error: "Failed to delete rule" });
  }
});

export default router;
