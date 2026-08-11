import express, { type Response } from "express";
import { z } from "zod";
import { authenticateToken, type AuthenticatedRequest } from "../authMiddleware";
import { masterPool } from "../multi-tenant-db";
import {
  createRule, listRules, updateRule, toggleRule,
  listEvents, acknowledgeEvent, dismissEvent, runAlerts,
} from "../services/alerts";
import { processDeliveries } from "../services/alert-delivery";
import { isSchedulerRunning } from "../jobs/alerts-scheduler";

const router = express.Router();

const storeIdOf = (req: AuthenticatedRequest) => {
  const s = req.user!.storeId;
  return typeof s === "string" ? parseInt(s) : s;
};

// ── Rules ──────────────────────────────────────────────────────────

router.get("/alerts/rules", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  res.json({ rows: await listRules(masterPool, storeIdOf(req)) });
});

router.post("/alerts/rules", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      name: z.string().min(1),
      ruleType: z.enum(["cash_low", "ar_overdue", "ap_overdue", "approvals_stale", "mo_short", "low_stock", "fx_stale", "custom"]),
      parameters: z.record(z.unknown()).optional(),
      severity: z.enum(["info", "warning", "critical"]).optional(),
      channels: z.array(z.enum(["in_app", "email", "whatsapp"])).optional(),
      recipientUserIds: z.array(z.number().int().positive()).optional(),
      debounceMinutes: z.number().int().nonnegative().optional(),
      companyId: z.number().int().positive().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const id = await createRule(masterPool, {
      storeId: storeIdOf(req), createdBy: req.user!.id, ...body,
    });
    res.status(201).json({ id });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.patch("/alerts/rules/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      name: z.string().optional(),
      parameters: z.record(z.unknown()).optional(),
      severity: z.enum(["info", "warning", "critical"]).optional(),
      channels: z.array(z.enum(["in_app", "email", "whatsapp"])).optional(),
      recipientUserIds: z.array(z.number().int().positive()).optional(),
      debounceMinutes: z.number().int().nonnegative().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    await updateRule(masterPool, Number(req.params.id), body);
    res.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/alerts/rules/:id/toggle", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const body = z.object({ isActive: z.boolean() }).parse(req.body);
  await toggleRule(masterPool, Number(req.params.id), body.isActive);
  res.json({ ok: true });
});

// ── Events ─────────────────────────────────────────────────────────

router.get("/alerts/events", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const rows = await listEvents(masterPool, storeIdOf(req), {
    status: req.query.status ? String(req.query.status) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  res.json({ rows });
});

router.post("/alerts/events/:id/acknowledge", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  await acknowledgeEvent(masterPool, Number(req.params.id), req.user!.id);
  res.json({ ok: true });
});

router.post("/alerts/events/:id/dismiss", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  await dismissEvent(masterPool, Number(req.params.id));
  res.json({ ok: true });
});

// ── Runner (evaluación on-demand) ──────────────────────────────────

router.post("/alerts/run", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      companyId: z.number().int().positive().optional(),
      deliver: z.boolean().optional(),
    }).parse(req.body ?? {});
    const r = await runAlerts(masterPool, storeIdOf(req), body);
    res.json(r);
  } catch (err: any) {
    console.error("[alerts run]", err);
    res.status(500).json({ error: err.message ?? "Failed" });
  }
});

// ── Delivery / Scheduler ───────────────────────────────────────────

router.post("/alerts/deliveries/process", authenticateToken, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await processDeliveries(masterPool);
    res.json(stats);
  } catch (err: any) {
    console.error("[deliveries]", err);
    res.status(500).json({ error: err.message ?? "Failed" });
  }
});

router.get("/alerts/scheduler/status", authenticateToken, (_req, res: Response) => {
  res.json({
    running: isSchedulerRunning(),
    evaluatorCron: process.env.ALERTS_EVAL_CRON ?? "*/15 * * * *",
    deliveryCron: process.env.ALERTS_DELIVERY_CRON ?? "*/5 * * * *",
  });
});

export default router;
