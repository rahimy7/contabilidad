import express, { type Response } from "express";
import { z } from "zod";
import { authenticateToken, type AuthenticatedRequest } from "../authMiddleware";
import { masterPool } from "../multi-tenant-db";
import {
  createQuote, getQuote, getQuoteLines, listQuotes, updateStatus,
  convertToOrder, expireOverdue,
} from "../services/sales-quotes";

const router = express.Router();

const lineSchema = z.object({
  productId: z.number().int().positive().optional(),
  productName: z.string().min(1),
  sku: z.string().optional(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  discountPercent: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
});

const createBody = z.object({
  customerId: z.number().int().positive().optional(),
  customerName: z.string().optional(),
  customerRnc: z.string().optional(),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().optional(),
  warehouseId: z.number().int().positive().optional(),
  currency: z.string().optional(),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  taxAmount: z.number().nonnegative().optional(),
  lines: z.array(lineSchema).min(1),
});

router.get("/quotes", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const storeId = typeof user.storeId === "string" ? parseInt(user.storeId) : user.storeId;
  const result = await listQuotes(masterPool, {
    storeId,
    status: req.query.status ? String(req.query.status) : undefined,
    customerId: req.query.customerId ? Number(req.query.customerId) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    offset: req.query.offset ? Number(req.query.offset) : undefined,
  });
  res.json(result);
});

router.post("/quotes", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const storeId = typeof user.storeId === "string" ? parseInt(user.storeId) : user.storeId;
    const body = createBody.parse(req.body);
    const quote = await createQuote(masterPool, { storeId, salespersonId: user.id, ...body });
    res.status(201).json(quote);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return res.status(422).json({ error: "Validation failed", issues: err.issues });
    }
    console.error("[quotes] create failed:", err);
    res.status(500).json({ error: "Failed to create quote" });
  }
});

router.get("/quotes/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const quote = await getQuote(masterPool, Number(req.params.id));
    const lines = await getQuoteLines(masterPool, quote.id);
    res.json({ quote, lines });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "not found";
    if (msg.includes("no existe")) return res.status(404).json({ error: msg });
    res.status(500).json({ error: "Failed to fetch quote" });
  }
});

router.post("/quotes/:id/status", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({
      status: z.enum(["draft", "sent", "accepted", "rejected", "cancelled"]),
    }).parse(req.body);
    const q = await updateStatus(masterPool, Number(req.params.id), body.status);
    res.json(q);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed to update status" });
  }
});

router.post("/quotes/:id/convert", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const out = await convertToOrder(masterPool, Number(req.params.id));
    res.status(201).json(out);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "conversion failed";
    if (msg.includes("está") || msg.includes("no existe")) return res.status(409).json({ error: msg });
    console.error("[quotes] convert failed:", err);
    res.status(500).json({ error: "Failed to convert quote" });
  }
});

router.post("/quotes/expire-overdue", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const storeId = typeof user.storeId === "string" ? parseInt(user.storeId) : user.storeId;
  res.json(await expireOverdue(masterPool, storeId));
});

export default router;
