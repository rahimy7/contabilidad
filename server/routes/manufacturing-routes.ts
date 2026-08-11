import express, { type Response } from "express";
import { z } from "zod";
import { authenticateToken, type AuthenticatedRequest } from "../authMiddleware";
import { masterPool } from "../multi-tenant-db";
import {
  createBom, listBoms, getBom, explodeBom,
  createProductionOrder, listMOs, getMO,
  releaseProductionOrder, completeProductionOrder, cancelProductionOrder,
  ManufacturingError,
} from "../services/manufacturing";

const router = express.Router();

const storeIdOf = (req: AuthenticatedRequest) => {
  const s = req.user!.storeId;
  return typeof s === "string" ? parseInt(s) : s;
};

// ── BOMs ────────────────────────────────────────────────────────────

router.get("/boms", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const rows = await listBoms(masterPool, storeIdOf(req), {
    productId: req.query.productId ? Number(req.query.productId) : undefined,
    status: req.query.status ? String(req.query.status) : undefined,
  });
  res.json({ rows });
});

router.get("/boms/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const bom = await getBom(masterPool, Number(req.params.id));
  if (!bom) return res.status(404).json({ error: "BOM no existe" });
  res.json(bom);
});

router.get("/boms/:id/explode", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const qty = Number(req.query.quantity ?? 1);
  res.json({ components: await explodeBom(masterPool, Number(req.params.id), qty) });
});

router.post("/boms", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      bomCode: z.string().min(1),
      outputProductId: z.number().int().positive(),
      outputQuantity: z.number().positive().optional(),
      outputWarehouseId: z.number().int().positive().optional(),
      name: z.string().min(1),
      description: z.string().optional(),
      version: z.string().optional(),
      status: z.enum(["draft", "active", "obsolete"]).optional(),
      lines: z.array(z.object({
        componentProductId: z.number().int().positive(),
        quantityPer: z.number().positive(),
        unit: z.string().optional(),
        scrapPercent: z.number().min(0).max(100).optional(),
        unitCost: z.number().nonnegative().optional(),
        notes: z.string().optional(),
      })).min(1),
    }).parse(req.body);
    const id = await createBom(masterPool, {
      storeId: storeIdOf(req), createdBy: req.user!.id, ...body,
    });
    res.status(201).json({ id });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    if (err instanceof ManufacturingError) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Failed" });
  }
});

// ── Production Orders ───────────────────────────────────────────────

router.get("/production-orders", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const rows = await listMOs(masterPool, storeIdOf(req), {
    status: req.query.status ? String(req.query.status) : undefined,
    productId: req.query.productId ? Number(req.query.productId) : undefined,
  });
  res.json({ rows });
});

router.get("/production-orders/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const mo = await getMO(masterPool, Number(req.params.id));
  if (!mo) return res.status(404).json({ error: "MO no existe" });
  res.json(mo);
});

router.post("/production-orders", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      moNumber: z.string().min(1),
      bomId: z.number().int().positive(),
      plannedQuantity: z.number().positive(),
      outputWarehouseId: z.number().int().positive(),
      sourceWarehouseId: z.number().int().positive(),
      scheduledStartDate: z.string().optional(),
      scheduledEndDate: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const id = await createProductionOrder(masterPool, {
      storeId: storeIdOf(req), createdBy: req.user!.id, ...body,
    });
    res.status(201).json({ id });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    if (err instanceof ManufacturingError) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/production-orders/:id/release", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const r = await releaseProductionOrder(masterPool, Number(req.params.id), req.user!.id);
    res.json(r);
  } catch (err: unknown) {
    if (err instanceof ManufacturingError) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/production-orders/:id/complete", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      actualQuantity: z.number().positive().optional(),
    }).parse(req.body ?? {});
    const r = await completeProductionOrder(masterPool, {
      moId: Number(req.params.id),
      actualQuantity: body.actualQuantity,
      completedBy: req.user!.id,
    });
    res.json(r);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    if (err instanceof ManufacturingError) return res.status(400).json({ error: err.message });
    console.error("[manufacturing]", err);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/production-orders/:id/cancel", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await cancelProductionOrder(masterPool, Number(req.params.id));
    res.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof ManufacturingError) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
