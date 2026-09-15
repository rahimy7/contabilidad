import express, { type Response } from "express";
import { z } from "zod";
import { authenticateToken, type AuthenticatedRequest } from "../authMiddleware";
import { masterPool } from "../multi-tenant-db";
import { withLegacyCompany, sendLegacyError } from "../http/legacy-bridge";
import {
  createReturn, completeReturnWithCreditNote, cancelReturn, getReturn, getReturnLines, listReturns,
} from "../services/purchase-returns";

const router = express.Router();

const lineSchema = z.object({
  productId: z.number().int().positive().optional(),
  productName: z.string().min(1),
  sku: z.string().optional(),
  purchaseLineId: z.number().int().positive().optional(),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
  warehouseId: z.number().int().positive().optional(),
  notes: z.string().optional(),
});

const createBody = z.object({
  supplierId: z.number().int().positive().optional(),
  supplierName: z.string().optional(),
  purchaseOrderId: z.number().int().positive().optional(),
  returnDate: z.string().optional(),
  reason: z.string().optional(),
  currency: z.string().optional(),
  taxAmount: z.number().nonnegative().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

router.get("/purchase-returns", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const storeId = typeof user.storeId === "string" ? parseInt(user.storeId) : user.storeId;
  const status = req.query.status ? String(req.query.status) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 100;
  res.json(await listReturns(masterPool, storeId, status, limit));
});

router.post("/purchase-returns", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const storeId = typeof user.storeId === "string" ? parseInt(user.storeId) : user.storeId;
    const body = createBody.parse(req.body);
    const ret = await createReturn(masterPool, { storeId, createdBy: user.id, ...body });
    res.status(201).json(ret);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    console.error("[purchase-returns] create failed:", err);
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/purchase-returns/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const ret = await getReturn(masterPool, Number(req.params.id));
    const lines = await getReturnLines(masterPool, ret.id);
    res.json({ return: ret, lines });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "not found";
    if (msg.includes("no existe")) return res.status(404).json({ error: msg });
    res.status(500).json({ error: "Failed" });
  }
});

// Completar: requiere la nota de crédito del proveedor (NCF) y la factura de
// compra que modifica, porque la devolución no está completa hasta que baja la
// cuenta por pagar y el inventario valorado junto con las existencias.
const completeBody = z.object({
  supplierNcf: z.string().min(11).max(13),
  modifiesDocumentId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  supplierRnc: z.string().regex(/^\d{9}$|^\d{11}$/).optional(),
  taxCode: z.string().optional(),
});

router.post("/purchase-returns/:id/complete", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const b = completeBody.parse(req.body ?? {});
    const out = await withLegacyCompany(req as any, (c, ctx) =>
      completeReturnWithCreditNote(c, {
        companyId: ctx.companyId, storeId: ctx.storeId, userId: ctx.userId, returnId: Number(req.params.id),
        supplierNcf: b.supplierNcf, modifiesDocumentId: b.modifiesDocumentId,
        date: b.date ?? new Date().toISOString().slice(0, 10), supplierRnc: b.supplierRnc, taxCode: b.taxCode,
      }),
    );
    res.json(out);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "complete failed";
    if (/suficiente|ya está|no encontrada|RNC|almacén|excede|acreditaron|original|anulada|líneas/.test(msg)) {
      return res.status(409).json({ error: msg });
    }
    sendLegacyError(res as any, err, "No se pudo completar la devolución");
  }
});

router.post("/purchase-returns/:id/cancel", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await cancelReturn(masterPool, Number(req.params.id)));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "cancel failed";
    if (msg.includes("completada")) return res.status(409).json({ error: msg });
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
