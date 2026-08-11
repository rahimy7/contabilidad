import express, { type Response } from "express";
import { z } from "zod";
import { authenticateToken, type AuthenticatedRequest } from "../authMiddleware";
import { masterPool } from "../multi-tenant-db";
import {
  createRfq, addSupplierQuote, awardQuote, getRfq, getRfqLines, getQuote, getQuoteLines,
  listRfqQuotes, listRfqs, compareQuotes, updateRfqStatus,
} from "../services/supplier-rfqs";

const router = express.Router();

const rfqLine = z.object({
  productId: z.number().int().positive().optional(),
  productName: z.string().min(1),
  sku: z.string().optional(),
  quantity: z.number().positive(),
  notes: z.string().optional(),
});

const createRfqBody = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  validUntil: z.string().optional(),
  lines: z.array(rfqLine).min(1),
});

const quoteLine = z.object({
  rfqLineId: z.number().int().positive().optional(),
  productName: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  availabilityDays: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
});

const supplierQuoteBody = z.object({
  supplierId: z.number().int().positive().optional(),
  supplierName: z.string().optional(),
  currency: z.string().optional(),
  leadTimeDays: z.number().int().nonnegative().optional(),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
  taxAmount: z.number().nonnegative().optional(),
  lines: z.array(quoteLine).min(1),
});

router.get("/rfqs", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const storeId = typeof user.storeId === "string" ? parseInt(user.storeId) : user.storeId;
  const status = req.query.status ? String(req.query.status) : undefined;
  res.json(await listRfqs(masterPool, storeId, status));
});

router.post("/rfqs", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const storeId = typeof user.storeId === "string" ? parseInt(user.storeId) : user.storeId;
    const body = createRfqBody.parse(req.body);
    const rfq = await createRfq(masterPool, {
      storeId, requestedBy: user.id, ...body,
    });
    res.status(201).json(rfq);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    console.error("[rfqs] create failed:", err);
    res.status(500).json({ error: "Failed to create RFQ" });
  }
});

router.get("/rfqs/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rfq = await getRfq(masterPool, Number(req.params.id));
    const lines = await getRfqLines(masterPool, rfq.id);
    const quotes = await listRfqQuotes(masterPool, rfq.id);
    res.json({ rfq, lines, quotes });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "not found";
    if (msg.includes("no existe")) return res.status(404).json({ error: msg });
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/rfqs/:id/compare", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await compareQuotes(masterPool, Number(req.params.id)));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "compare failed";
    if (msg.includes("no existe")) return res.status(404).json({ error: msg });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/rfqs/:id/status", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = z.object({ status: z.enum(["sent", "closed", "cancelled"]) }).parse(req.body);
    res.json(await updateRfqStatus(masterPool, Number(req.params.id), body.status));
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/rfqs/:id/quotes", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = supplierQuoteBody.parse(req.body);
    const quote = await addSupplierQuote(masterPool, { rfqId: Number(req.params.id), ...body });
    res.status(201).json(quote);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("está")) return res.status(409).json({ error: msg });
    console.error("[rfqs] add quote failed:", err);
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/supplier-quotes/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const quote = await getQuote(masterPool, Number(req.params.id));
    const lines = await getQuoteLines(masterPool, quote.id);
    res.json({ quote, lines });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("no existe")) return res.status(404).json({ error: msg });
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/supplier-quotes/:id/award", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await awardQuote(masterPool, Number(req.params.id)));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("está") || msg.includes("adjudicado")) return res.status(409).json({ error: msg });
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
