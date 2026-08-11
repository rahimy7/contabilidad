import express, { type Response } from "express";
import { authenticateToken, type AuthenticatedRequest } from "../authMiddleware";
import { masterPool } from "../multi-tenant-db";
import { suggestReplenishment } from "../inventory/replenishment";
import { registerSerials, markSold, markReturned, findSerial, warrantyExpiring } from "../inventory/serials";
import { z } from "zod";

const router = express.Router();

router.get("/replenishment/suggestions", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const storeId = typeof user.storeId === "string" ? parseInt(user.storeId) : user.storeId;
    const warehouseId = req.query.warehouseId ? Number(req.query.warehouseId) : undefined;
    const windowDays = req.query.windowDays ? Number(req.query.windowDays) : undefined;
    const belowMinOnly = req.query.includeYellow === "true" ? false : true;
    const rows = await suggestReplenishment(masterPool, { storeId, warehouseId, windowDays, belowMinOnly });
    res.json({ rows });
  } catch (err) {
    console.error("[replenishment] failed:", err);
    res.status(500).json({ error: "Failed to compute suggestions" });
  }
});

// ── Serials (mismo router para agrupar inventario avanzado) ─────────────────

router.get("/serials/:serial", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const storeId = typeof user.storeId === "string" ? parseInt(user.storeId) : user.storeId;
  const r = await findSerial(masterPool, storeId, req.params.serial);
  if (!r) return res.status(404).json({ error: "not found" });
  res.json(r);
});

router.get("/serials-warranty/expiring", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const storeId = typeof user.storeId === "string" ? parseInt(user.storeId) : user.storeId;
  const days = req.query.days ? Number(req.query.days) : 30;
  res.json({ rows: await warrantyExpiring(masterPool, storeId, days) });
});

router.post("/serials", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const storeId = typeof user.storeId === "string" ? parseInt(user.storeId) : user.storeId;
    const body = z.object({
      productId: z.number().int().positive(),
      warehouseId: z.number().int().positive().optional(),
      lotId: z.number().int().positive().optional(),
      serials: z.array(z.string()).min(1),
      status: z.enum(["in_stock", "reserved", "sold"]).optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    res.status(201).json(await registerSerials(masterPool, { storeId, ...body }));
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/serials/sold", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const storeId = typeof user.storeId === "string" ? parseInt(user.storeId) : user.storeId;
    const body = z.object({
      productId: z.number().int().positive(),
      serialNumbers: z.array(z.string()).min(1),
      orderId: z.number().int().positive().optional(),
      warrantyMonths: z.number().int().nonnegative().optional(),
    }).parse(req.body);
    res.json(await markSold(masterPool, { storeId, ...body }));
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/serials/returned", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const storeId = typeof user.storeId === "string" ? parseInt(user.storeId) : user.storeId;
    const body = z.object({ serialNumbers: z.array(z.string()).min(1) }).parse(req.body);
    res.json(await markReturned(masterPool, storeId, body.serialNumbers));
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
