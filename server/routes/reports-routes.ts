import express, { type Response } from "express";
import { z } from "zod";
import { authenticateToken, type AuthenticatedRequest } from "../authMiddleware";
import { masterPool } from "../multi-tenant-db";
import {
  generatePnLReport, generateAgingReport,
  generateSalesByRepReport, generateTopCustomersReport, generateTopProductsReport,
  ReportError,
} from "../services/reports";

const router = express.Router();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const storeIdOf = (req: AuthenticatedRequest) => {
  const s = req.user!.storeId;
  return typeof s === "string" ? parseInt(s) : s;
};

function sendXlsx(res: Response, filename: string, buf: Buffer) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buf);
}

router.get("/reports/pnl.xlsx", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const q = z.object({
      companyId: z.string(),
      from: isoDate, to: isoDate,
      compareFrom: isoDate.optional(),
      compareTo: isoDate.optional(),
    }).parse(req.query);
    const compare = q.compareFrom && q.compareTo ? { from: q.compareFrom, to: q.compareTo } : undefined;
    const buf = await generatePnLReport(masterPool, Number(q.companyId), { from: q.from, to: q.to }, compare);
    sendXlsx(res, `pnl-${q.from}-${q.to}.xlsx`, buf);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    if (err instanceof ReportError) return res.status(400).json({ error: err.message });
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/reports/aging.xlsx", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const q = z.object({
      companyId: z.string(),
      kind: z.enum(["ar", "ap"]),
      asOf: isoDate.optional(),
    }).parse(req.query);
    const buf = await generateAgingReport(
      masterPool, Number(q.companyId), q.kind,
      q.asOf ?? new Date().toISOString().slice(0, 10),
    );
    sendXlsx(res, `aging-${q.kind}-${q.asOf ?? "today"}.xlsx`, buf);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: err.message ?? "Failed" });
  }
});

router.get("/reports/sales-by-rep.xlsx", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const q = z.object({ from: isoDate, to: isoDate }).parse(req.query);
    const buf = await generateSalesByRepReport(masterPool, storeIdOf(req), q);
    sendXlsx(res, `ventas-por-vendedor-${q.from}-${q.to}.xlsx`, buf);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: err.message ?? "Failed" });
  }
});

router.get("/reports/top-customers.xlsx", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const q = z.object({ from: isoDate, to: isoDate, limit: z.string().optional() }).parse(req.query);
    const buf = await generateTopCustomersReport(
      masterPool, storeIdOf(req), q, q.limit ? Number(q.limit) : 100,
    );
    sendXlsx(res, `top-clientes-${q.from}-${q.to}.xlsx`, buf);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: err.message ?? "Failed" });
  }
});

router.get("/reports/top-products.xlsx", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const q = z.object({ from: isoDate, to: isoDate, limit: z.string().optional() }).parse(req.query);
    const buf = await generateTopProductsReport(
      masterPool, storeIdOf(req), q, q.limit ? Number(q.limit) : 100,
    );
    sendXlsx(res, `top-productos-${q.from}-${q.to}.xlsx`, buf);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(422).json({ error: "Validation failed", issues: err.issues });
    res.status(500).json({ error: err.message ?? "Failed" });
  }
});

export default router;
