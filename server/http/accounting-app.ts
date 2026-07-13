import express, { type Express, type Router } from "express";
import cookieParser from "cookie-parser";
import { authenticateToken } from "../authMiddleware";
import { accountingRoutes } from "../routes/accounting-routes";
import { fiscalRoutes } from "../routes/fiscal-routes";
import { companyRoutes } from "../routes/company-routes";
import { subledgerRoutes } from "../routes/subledger-routes";
import { moduleRoutes } from "../routes/module-routes";
import { treasuryRoutes } from "../routes/treasury-routes";
import { inventoryRoutes } from "../routes/inventory-routes";
import { consolidationRoutes } from "../routes/consolidation-routes";

/**
 * The accounting + fiscal HTTP surface, assembled on its own.
 *
 * Kept separate from the 1,200-line legacy `server/index.ts` on purpose: this
 * boots without the WhatsApp/AI environment the legacy app needs, so it can be
 * exercised end-to-end in a test. To wire it into the running app, mount the
 * router in index.ts with one line — see `mountAccounting`.
 */
export function accountingApiRouter(): Router {
  const router = express.Router();
  // Cross-tenant: pick or create a company. Auth only, no company scope yet.
  router.use("/companies", authenticateToken, companyRoutes());
  router.use("/accounting", authenticateToken, accountingRoutes());
  router.use("/fiscal", authenticateToken, fiscalRoutes());
  router.use("/subledgers", authenticateToken, subledgerRoutes());
  router.use("/modules", authenticateToken, moduleRoutes());
  router.use("/treasury", authenticateToken, treasuryRoutes());
  router.use("/inventory", authenticateToken, inventoryRoutes());
  router.use("/consolidation", authenticateToken, consolidationRoutes());
  return router;
}

/** Mounts the accounting API onto an existing Express app under `/api`. */
export function mountAccounting(app: Express): void {
  app.use("/api", accountingApiRouter());
}

/** A standalone app carrying only the accounting API. Used by tests. */
export function createAccountingApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  mountAccounting(app);
  return app;
}
