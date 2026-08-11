import express, { type Response } from "express";
import { z } from "zod";
import { authenticateToken, type AuthenticatedRequest } from "../authMiddleware";
import { masterPool } from "../multi-tenant-db";
import {
  createVoucher, addCostLine, addTarget, applyVoucher,
  getVoucher, listVouchers, LandedCostError, COST_TYPE_LABELS,
} from "../services/landed-costs";

const router = express.Router();

const storeIdOf = (req: AuthenticatedRequest) => {
  const s = req.user!.storeId;
  return typeof s === "string" ? parseInt(s) : s;
};

router.get("/landed-costs/cost-types", authenticateToken, (_req, res: Response) => {
  res.json({ types: Object.entries(COST_TYPE_LABELS).map(([k, v]) => ({ code: k, label: v })) });
});

router.get("/landed-costs/vouchers", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  res.json({ rows: await listVouchers(masterPool, storeIdOf(req), { status }) });
});

router.get("/landed-costs/vouchers/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const v = await getVoucher(masterPool, Number(req.params.id));
  if (!v) return res.status(404).json({ error: "voucher no existe" });
  res.json(v);
});

router.post("/landed-costs/vouchers", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      voucherCode: z.string().min(1),
      description: z.string().optional(),
      voucherDate: z.string().optional(),
      shipmentReference: z.string().optional(),
      blAwbNumber: z.string().optional(),
      supplierId: z.number().int().positive().optional(),
      currency: z.string().length(3).optional(),
      defaultAllocationMethod: z.enum(["by_value", "by_quantity", "by_weight", "by_volume"]).optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const id = await createVoucher(masterPool, { storeId: storeIdOf(req), createdBy: req.user!.id, ...body });
    res.status(201).json({ id });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    if (err instanceof LandedCostError) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/landed-costs/vouchers/:id/lines", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      costType: z.enum([
        "freight_ocean", "freight_air", "freight_land",
        "insurance", "customs_duty", "customs_itbis", "customs_selectivo",
        "clearing_agent", "port_handling", "warehouse_storage",
        "inland_transport", "inspection", "bank_charges", "other",
      ]),
      description: z.string().optional(),
      amount: z.number().nonnegative(),
      allocationMethod: z.enum(["by_value", "by_quantity", "by_weight", "by_volume"]).optional(),
      expenseDocumentRef: z.string().optional(),
      supplierId: z.number().int().positive().optional(),
      expenseAccountCode: z.string().optional(),
    }).parse(req.body);
    const id = await addCostLine(masterPool, Number(req.params.id), body);
    res.status(201).json({ id });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    if (err instanceof LandedCostError) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: "Failed" });
  }
});

router.delete("/landed-costs/vouchers/:id/lines/:lineId", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  await masterPool.query(
    `DELETE FROM landed_cost_lines WHERE id = $1 AND voucher_id = $2`,
    [Number(req.params.lineId), Number(req.params.id)],
  );
  await masterPool.query(
    `UPDATE landed_cost_vouchers
        SET total_costs = coalesce((SELECT sum(amount) FROM landed_cost_lines WHERE voucher_id = $1), 0),
            updated_at = now()
      WHERE id = $1`,
    [Number(req.params.id)],
  );
  res.json({ ok: true });
});

router.post("/landed-costs/vouchers/:id/targets", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      purchaseOrderId: z.number().int().positive(),
      totalWeightKg: z.number().nonnegative().optional(),
      totalVolumeM3: z.number().nonnegative().optional(),
    }).parse(req.body);
    const id = await addTarget(masterPool, Number(req.params.id), body);
    res.status(201).json({ id });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.delete("/landed-costs/vouchers/:id/targets/:targetId", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  await masterPool.query(
    `DELETE FROM landed_cost_targets WHERE id = $1 AND voucher_id = $2`,
    [Number(req.params.targetId), Number(req.params.id)],
  );
  res.json({ ok: true });
});

router.post("/landed-costs/vouchers/:id/apply", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const r = await applyVoucher(masterPool, Number(req.params.id), req.user!.id);
    res.json(r);
  } catch (err: unknown) {
    if (err instanceof LandedCostError) return res.status(400).json({ error: err.message });
    console.error("[landed-costs apply]", err);
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
