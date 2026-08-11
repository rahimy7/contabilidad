import { Router } from "express";
import { z } from "zod";
import { CompanyRequest, requireCompany } from "../http/require-company";
import { masterPool } from "../multi-tenant-db";
import {
  createEntry, updateEntry, deleteEntry, listEntries,
  generateForecast, saveForecast, listSavedForecasts,
  CashFlowError,
} from "../services/cash-flow";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function cashFlowRoutes(): Router {
  const r = Router();
  r.use(requireCompany);

  r.get("/entries", h(async (req) => ({
    rows: await listEntries(masterPool, req.companyId!),
  })));

  r.post("/entries", h(async (req) => {
    const body = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      direction: z.enum(["inflow", "outflow"]),
      category: z.string().optional(),
      amount: z.number().positive(),
      currency: z.string().length(3).optional(),
      frequency: z.enum(["one_time", "weekly", "biweekly", "monthly", "quarterly", "yearly"]).optional(),
      startDate: isoDate,
      endDate: isoDate.optional(),
      intervalCount: z.number().int().positive().optional(),
      confidence: z.enum(["high", "medium", "low"]).optional(),
      referenceType: z.string().optional(),
      referenceId: z.number().int().positive().optional(),
      bankAccountId: z.number().int().positive().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const id = await createEntry(masterPool, {
      companyId: req.companyId!, createdBy: uid(req) ?? 0, ...body,
    });
    return { status: 201, id };
  }));

  r.put("/entries/:id", h(async (req) => {
    const body = z.object({
      name: z.string().optional(),
      description: z.string().optional(),
      direction: z.enum(["inflow", "outflow"]).optional(),
      category: z.string().optional(),
      amount: z.number().positive().optional(),
      currency: z.string().length(3).optional(),
      frequency: z.enum(["one_time", "weekly", "biweekly", "monthly", "quarterly", "yearly"]).optional(),
      startDate: isoDate.optional(),
      endDate: isoDate.optional(),
      intervalCount: z.number().int().positive().optional(),
      confidence: z.enum(["high", "medium", "low"]).optional(),
      bankAccountId: z.number().int().positive().optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    await updateEntry(masterPool, Number(req.params.id), body);
    return { ok: true };
  }));

  r.delete("/entries/:id", h(async (req) => {
    await deleteEntry(masterPool, Number(req.params.id));
    return { ok: true };
  }));

  r.post("/forecast", h(async (req) => {
    const body = z.object({
      forecastDate: isoDate.optional(),
      horizonWeeks: z.number().int().min(1).max(52).optional(),
      includeCategories: z.array(z.string()).optional(),
      excludeConfidence: z.array(z.enum(["high", "medium", "low"])).optional(),
      bankAccountId: z.number().int().positive().optional(),
    }).parse(req.body);
    return await generateForecast(masterPool, { companyId: req.companyId!, ...body });
  }));

  r.post("/forecast/save", h(async (req) => {
    const body = z.object({
      forecastDate: isoDate.optional(),
      horizonWeeks: z.number().int().min(1).max(52).optional(),
      notes: z.string().optional(),
    }).parse(req.body);
    const forecast = await generateForecast(masterPool, {
      companyId: req.companyId!,
      forecastDate: body.forecastDate,
      horizonWeeks: body.horizonWeeks,
    });
    const id = await saveForecast(masterPool, req.companyId!, forecast, uid(req) ?? 0, body.notes);
    return { status: 201, id, forecast };
  }));

  r.get("/forecast/history", h(async (req) => ({
    rows: await listSavedForecasts(masterPool, req.companyId!),
  })));

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
      if (err instanceof CashFlowError) return res.status(400).json({ error: err.message });
      console.error("[cash-flow]", err);
      res.status(500).json({ error: "error interno" });
    }
  };
}
