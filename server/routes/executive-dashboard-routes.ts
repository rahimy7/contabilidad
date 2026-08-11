import express, { type Response } from "express";
import { authenticateToken, type AuthenticatedRequest } from "../authMiddleware";
import { masterPool } from "../multi-tenant-db";
import { getExecutiveDashboard } from "../services/executive-dashboard";

const router = express.Router();

const storeIdOf = (req: AuthenticatedRequest) => {
  const s = req.user!.storeId;
  return typeof s === "string" ? parseInt(s) : s;
};

router.get("/executive-dashboard", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companyIdRaw = req.query.companyId ?? req.user?.companyId;
    const companyId = companyIdRaw ? Number(companyIdRaw) : undefined;
    const today = req.query.today ? String(req.query.today) : undefined;

    const r = await getExecutiveDashboard(masterPool, {
      storeId: storeIdOf(req),
      companyId,
      today,
    });
    res.json(r);
  } catch (err: any) {
    console.error("[executive-dashboard]", err);
    res.status(500).json({ error: err.message ?? "Failed" });
  }
});

export default router;
