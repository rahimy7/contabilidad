import express, { type Response } from "express";
import { authenticateToken, type AuthenticatedRequest } from "../authMiddleware";
import { masterPool } from "../multi-tenant-db";
import { getOnboardingStatus, getFaq, searchFaq, getTipsForRoute } from "../services/assistant";

const router = express.Router();

const storeIdOf = (req: AuthenticatedRequest) => {
  const s = req.user!.storeId;
  return typeof s === "string" ? parseInt(s) : s;
};

router.get("/assistant/onboarding", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.query.companyId ? Number(req.query.companyId) : req.user?.companyId;
  const status = await getOnboardingStatus(
    masterPool, storeIdOf(req),
    companyId ? Number(companyId) : undefined,
  );
  res.json(status);
});

router.get("/assistant/faq", authenticateToken, (_req, res: Response) => {
  res.json({ entries: getFaq() });
});

router.get("/assistant/search", authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const q = String(req.query.q ?? "");
  const limit = req.query.limit ? Number(req.query.limit) : 5;
  const entries = searchFaq(q, limit);
  res.json({ query: q, entries });
});

router.get("/assistant/tips", authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  const path = String(req.query.path ?? "");
  res.json({ path, tips: getTipsForRoute(path) });
});

export default router;
