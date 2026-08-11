import { Router } from "express";
import { z } from "zod";
import { CompanyRequest, requireCompany } from "../http/require-company";
import { masterPool } from "../multi-tenant-db";
import {
  setDailyRate, getRate, listRates,
  previewRevaluation, runRevaluation,
  listRevaluationRuns, getRevaluationRun,
  FxError,
} from "../services/fx-revaluation";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function fxRoutes(): Router {
  const r = Router();
  r.use(requireCompany);

  // ── Rate management ──────────────────────────────────────────────────
  r.get("/rates", h(async (req) => ({
    rows: await listRates(masterPool, req.companyId!, {
      fromCurrency: req.query.from ? String(req.query.from) : undefined,
      toCurrency: req.query.to ? String(req.query.to) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    }),
  })));

  r.get("/rates/lookup", h(async (req) => {
    const body = z.object({
      rateDate: isoDate, fromCurrency: z.string().length(3),
      toCurrency: z.string().length(3),
      rateType: z.enum(["spot", "closing", "avg"]).optional(),
    }).parse(req.query);
    const rate = await getRate(
      masterPool, req.companyId!,
      body.rateDate, body.fromCurrency, body.toCurrency, body.rateType,
    );
    return { rate };
  }));

  r.post("/rates", h(async (req) => {
    const body = z.object({
      rateDate: isoDate,
      fromCurrency: z.string().length(3),
      toCurrency: z.string().length(3),
      rateType: z.enum(["spot", "closing", "avg"]).optional(),
      rate: z.number().positive(),
      source: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const id = await setDailyRate(masterPool, {
      companyId: req.companyId!, createdBy: uid(req),
      ...body,
    });
    return { status: 201, id };
  }));

  // ── Revaluation ─────────────────────────────────────────────────────
  r.post("/revaluations/preview", h(async (req) => {
    const body = z.object({ valuationDate: isoDate }).parse(req.body);
    return await previewRevaluation(masterPool, req.companyId!, body.valuationDate);
  }));

  r.post("/revaluations", h(async (req) => {
    const body = z.object({
      valuationDate: isoDate,
      gainAccountCode: z.string().optional(),
      lossAccountCode: z.string().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const r2 = await runRevaluation(masterPool, {
      companyId: req.companyId!,
      createdBy: uid(req) ?? 0,
      ...body,
    });
    return { status: 201, ...r2 };
  }));

  r.get("/revaluations", h(async (req) => ({
    rows: await listRevaluationRuns(masterPool, req.companyId!),
  })));

  r.get("/revaluations/:id", h(async (req) => {
    const r2 = await getRevaluationRun(masterPool, Number(req.params.id));
    if (!r2) return { status: 404, error: "no existe" };
    return r2;
  }));

  return r;
}

const uid = (req: CompanyRequest) => (req.user?.id ? Number(req.user.id) : undefined);

function h(fn: (req: CompanyRequest) => Promise<any>) {
  return async (req: CompanyRequest, res: any) => {
    try {
      const out = await fn(req);
      const status = out?.status ?? 200;
      if (out && typeof out === "object") delete out.status;
      res.status(status).json(out);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "validación", issues: err.issues });
      if (err instanceof FxError) return res.status(400).json({ error: err.message });
      console.error("[fx]", err);
      res.status(500).json({ error: "error interno" });
    }
  };
}
