import express, { type Response } from "express";
import { z } from "zod";
import { authenticateToken, type AuthenticatedRequest } from "../authMiddleware";
import { masterPool } from "../multi-tenant-db";
import { createApiKey, listApiKeys, revokeApiKey } from "../services/api-keys";
import { requireApiKey, requireScope, type ApiKeyRequest } from "../middleware/api-key-auth";
import { getExecutiveDashboard } from "../services/executive-dashboard";
import { getRate } from "../services/fx-revaluation";
import { openapiSpec } from "./openapi-spec";

const router = express.Router();

const storeIdOf = (req: AuthenticatedRequest) => {
  const s = req.user!.storeId;
  return typeof s === "string" ? parseInt(s) : s;
};

// ── Gestión de API keys (autenticada con JWT) ─────────────────────

router.get("/api-keys", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  res.json({ rows: await listApiKeys(masterPool, storeIdOf(req)) });
});

router.post("/api-keys", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      name: z.string().min(1),
      scopes: z.array(z.enum(["read", "write", "admin"])).optional(),
      rateLimitPerMin: z.number().int().positive().optional(),
      expiresAt: z.string().optional(),
      companyId: z.number().int().positive().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const issued = await createApiKey(masterPool, {
      storeId: storeIdOf(req), createdBy: req.user!.id, ...body,
    });
    // token se muestra una sola vez
    res.status(201).json({ id: issued.id, token: issued.token, prefix: issued.prefix });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/api-keys/:id/revoke", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  await revokeApiKey(masterPool, Number(req.params.id), req.user!.id);
  res.json({ ok: true });
});

// ── OpenAPI spec ─────────────────────────────────────────────────

router.get("/v1/openapi.json", (_req, res) => res.json(openapiSpec));

// ── Endpoints públicos v1 (autenticados con API key) ─────────────

router.get("/v1/dashboard", requireApiKey, requireScope("read"), async (req: ApiKeyRequest, res: Response) => {
  try {
    const r = await getExecutiveDashboard(masterPool, {
      storeId: req.apiKey!.storeId,
      companyId: req.apiKey!.companyId ?? undefined,
    });
    res.json(r);
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Failed" });
  }
});

router.get("/v1/fx/rate", requireApiKey, requireScope("read"), async (req: ApiKeyRequest, res: Response) => {
  try {
    const q = z.object({
      from: z.string().length(3),
      to: z.string().length(3),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      rateType: z.enum(["spot", "closing", "avg"]).optional(),
    }).parse(req.query);
    const companyId = req.apiKey!.companyId;
    if (!companyId) return res.status(400).json({ error: "API key sin companyId" });
    const rate = await getRate(
      masterPool, companyId,
      q.date ?? new Date().toISOString().slice(0, 10),
      q.from.toUpperCase(), q.to.toUpperCase(),
      q.rateType ?? "spot",
    );
    res.json({ from: q.from.toUpperCase(), to: q.to.toUpperCase(), rate, date: q.date });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: err.message ?? "Failed" });
  }
});

router.get("/v1/orders", requireApiKey, requireScope("read"), async (req: ApiKeyRequest, res: Response) => {
  try {
    const q = z.object({
      status: z.string().optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      limit: z.string().optional(),
    }).parse(req.query);
    const limit = Math.min(Number(q.limit ?? 100), 500);
    const r = await masterPool.query(
      `SELECT id, order_number AS "orderNumber", customer_id AS "customerId",
              status, total_amount::text AS "totalAmount",
              currency, created_at::text AS "createdAt"
         FROM orders
        WHERE store_id = $1
          AND ($2::text IS NULL OR status = $2)
          AND ($3::date IS NULL OR created_at::date >= $3::date)
          AND ($4::date IS NULL OR created_at::date <= $4::date)
        ORDER BY created_at DESC LIMIT $5`,
      [req.apiKey!.storeId, q.status ?? null, q.from ?? null, q.to ?? null, limit],
    );
    res.json({ rows: r.rows });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: err.message ?? "Failed" });
  }
});

router.get("/v1/products", requireApiKey, requireScope("read"), async (req: ApiKeyRequest, res: Response) => {
  const q = z.object({
    search: z.string().optional(),
    category: z.string().optional(),
    limit: z.string().optional(),
  }).safeParse(req.query);
  const p = q.success ? q.data : { search: undefined, category: undefined, limit: undefined };
  const limit = Math.min(Number(p.limit ?? 100), 500);
  const r = await masterPool.query(
    `SELECT id, name, sku, category, price::text AS price, stock_quantity::text AS "stockQuantity",
            base_currency AS "baseCurrency", status
       FROM products
      WHERE store_id = $1 AND status = 'active'
        AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR sku ILIKE '%' || $2 || '%')
        AND ($3::text IS NULL OR category = $3)
      ORDER BY name LIMIT $4`,
    [req.apiKey!.storeId, p.search ?? null, p.category ?? null, limit],
  );
  res.json({ rows: r.rows });
});

router.get("/v1/customers", requireApiKey, requireScope("read"), async (req: ApiKeyRequest, res: Response) => {
  const q = z.object({
    search: z.string().optional(),
    limit: z.string().optional(),
  }).safeParse(req.query);
  const p = q.success ? q.data : { search: undefined, limit: undefined };
  const limit = Math.min(Number(p.limit ?? 100), 500);
  const r = await masterPool.query(
    `SELECT id, name, phone, email, created_at::text AS "createdAt"
       FROM customers
      WHERE store_id = $1
        AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR phone ILIKE '%' || $2 || '%')
      ORDER BY name LIMIT $3`,
    [req.apiKey!.storeId, p.search ?? null, limit],
  );
  res.json({ rows: r.rows });
});

export default router;
