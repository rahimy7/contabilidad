import { Router } from "express";
import { z } from "zod";
import { CompanyRequest, requireCompany, scoped } from "../http/require-company";
import { PostingError } from "../accounting/types";
import { InventoryCostingError } from "../inventory/costing";
import {
  WmsError, warehouseConfig, listLocations, createLocation, updateLocation, deleteLocation,
  generateLocations, putaway, moveStock, pickPlan, consumePlacements, locationStock,
  placementDrift, expiryReport, locationMoves,
} from "../inventory/wms";
import {
  InventoryCountError, createCount, getCount, listCounts, recordCounts, addFoundLine,
  submitForReview, applyCount, cancelCount,
} from "../inventory/counts";

/**
 * HTTP surface for the optional WMS layer and the physical count.
 *
 * Mounted under `/api/inventory`, so it inherits the same company scoping as the
 * costing routes: `requireCompany` resolves the tenant from the user's
 * membership and `scoped` runs each handler in its own transaction with RLS on.
 *
 * The picking endpoints come in two halves on purpose. `pick-plan` is a
 * question — where *would* this come from — and changes nothing, so a screen can
 * ask it on every keystroke. `pick` is the answer being carried out. Merging
 * them into one endpoint that both proposes and consumes is how a preview ends
 * up emptying a shelf.
 */
export function wmsRoutes(): Router {
  const r = Router();
  r.use(requireCompany);

  // ── configuration ──────────────────────────────────────────────────────────

  r.get("/warehouses/:id/config", h(async (req) =>
    scoped(req, async (c) => ({ config: await warehouseConfig(c, Number(req.params.id)) })),
  ));

  // ── locations ──────────────────────────────────────────────────────────────

  r.get("/locations", h(async (req) => {
    const q = z.object({
      warehouseId: z.coerce.number().int().min(0),
      includeInactive: z.coerce.boolean().optional(),
    }).parse(req.query);
    return scoped(req, async (c) => ({
      locations: await listLocations(c, req.companyId!, q.warehouseId, { includeInactive: q.includeInactive }),
    }));
  }));

  r.post("/locations", h(async (req) => {
    const b = locationBody.parse(req.body);
    return scoped(req, async (c) => ({
      status: 201,
      location: await createLocation(c, req.companyId!, b.warehouseId, { ...b, code: b.code }),
    }));
  }));

  r.put("/locations/:id", h(async (req) => {
    const b = locationBody.partial().parse(req.body);
    return scoped(req, async (c) => ({
      location: await updateLocation(c, req.companyId!, Number(req.params.id), b),
    }));
  }));

  r.delete("/locations/:id", h(async (req) =>
    scoped(req, (c) => deleteLocation(c, req.companyId!, Number(req.params.id))),
  ));

  // Labels a racked warehouse in one pass instead of 300 identical forms.
  r.post("/locations/generate", h(async (req) => {
    const b = generateBody.parse(req.body);
    return scoped(req, async (c) => ({
      status: 201,
      ...(await generateLocations(c, req.companyId!, b.warehouseId, {
        zones: b.zones, aisles: b.aisles, racks: b.racks, levels: b.levels, positions: b.positions,
        kind: b.kind, separator: b.separator, prefix: b.prefix, startPriority: b.startPriority,
      })),
    }));
  }));

  // ── stock by location ──────────────────────────────────────────────────────

  r.get("/stock", h(async (req) => {
    const q = z.object({
      warehouseId: z.coerce.number().int().min(0),
      locationId: z.coerce.number().int().optional(),
      productId: z.coerce.number().int().optional(),
      expiringInDays: z.coerce.number().int().optional(),
    }).parse(req.query);
    return scoped(req, async (c) => ({
      stock: await locationStock(c, req.companyId!, q.warehouseId, q),
    }));
  }));

  r.get("/moves", h(async (req) => {
    const q = z.object({
      warehouseId: z.coerce.number().int().min(0),
      productId: z.coerce.number().int().optional(),
      locationId: z.coerce.number().int().optional(),
      limit: z.coerce.number().int().max(500).optional(),
    }).parse(req.query);
    return scoped(req, async (c) => ({
      moves: await locationMoves(c, req.companyId!, q.warehouseId, q),
    }));
  }));

  // Where the bins and the valuation stopped agreeing — the count's to-do list.
  r.get("/drift", h(async (req) => {
    const q = z.object({ warehouseId: z.coerce.number().int().min(0) }).parse(req.query);
    return scoped(req, (c) => placementDrift(c, req.companyId!, q.warehouseId));
  }));

  r.get("/expiring", h(async (req) => {
    const q = z.object({
      warehouseId: z.coerce.number().int().min(0),
      days: z.coerce.number().int().min(0).max(3650).optional(),
    }).parse(req.query);
    return scoped(req, async (c) => ({
      items: await expiryReport(c, req.companyId!, q.warehouseId, q.days ?? 30),
    }));
  }));

  // ── movement ───────────────────────────────────────────────────────────────

  r.post("/putaway", h(async (req) => {
    const b = putawayBody.parse(req.body);
    return scoped(req, async (c) => ({
      status: 201,
      ...(await putaway(c, {
        companyId: req.companyId!, userId: uid(req),
        productId: b.productId, warehouseId: b.warehouseId, receivedDate: b.receivedDate,
        unitCost: b.unitCost, lotId: b.lotId, sourceType: b.sourceType, sourceId: b.sourceId,
        lines: b.lines.map((l) => ({
          locationId: l.locationId, quantity: l.quantity, lotNo: l.lotNo,
          expirationDate: l.expirationDate, status: l.status,
        })),
      })),
    }));
  }));

  r.post("/move", h(async (req) => {
    const b = moveBody.parse(req.body);
    return scoped(req, (c) =>
      moveStock(c, {
        companyId: req.companyId!, userId: uid(req),
        placementId: b.placementId, toLocationId: b.toLocationId, quantity: b.quantity, notes: b.notes,
      }),
    );
  }));

  r.get("/pick-plan", h(async (req) => {
    const q = z.object({
      warehouseId: z.coerce.number().int().min(0),
      productId: z.coerce.number().int().positive(),
      quantity: decimal,
      rotation: z.enum(["fifo", "fefo"]).optional(),
    }).parse(req.query);
    return scoped(req, (c) =>
      pickPlan(c, {
        companyId: req.companyId!, warehouseId: q.warehouseId, productId: q.productId,
        quantity: q.quantity, rotation: q.rotation,
      }),
    );
  }));

  r.post("/pick", h(async (req) => {
    const b = pickBody.parse(req.body);
    return scoped(req, async (c) => ({
      status: 201,
      ...(await consumePlacements(c, {
        companyId: req.companyId!, userId: uid(req),
        productId: b.productId, warehouseId: b.warehouseId, quantity: b.quantity,
        rotation: b.rotation, allowPartial: b.allowPartial, sourceType: b.sourceType, sourceId: b.sourceId,
        allocations: b.allocations?.map((a) => ({ placementId: a.placementId, quantity: a.quantity })),
      })),
    }));
  }));

  // ── physical count ─────────────────────────────────────────────────────────

  r.get("/counts", h(async (req) => {
    const q = z.object({ warehouseId: z.coerce.number().int().optional() }).parse(req.query);
    return scoped(req, async (c) => ({ counts: await listCounts(c, req.companyId!, q.warehouseId) }));
  }));

  r.post("/counts", h(async (req) => {
    const b = countBody.parse(req.body);
    return scoped(req, async (c) => ({
      status: 201,
      ...(await createCount(c, {
        companyId: req.companyId!, userId: uid(req),
        warehouseId: b.warehouseId, countDate: b.countDate, name: b.name, countType: b.countType,
        isBlind: b.isBlind, locationIds: b.locationIds, productIds: b.productIds,
        scheduledDate: b.scheduledDate, notes: b.notes,
      })),
    }));
  }));

  r.get("/counts/:id", h(async (req) => {
    // `forCounting` is what a blind count hides behind: the capture screen asks
    // for it, the review screen does not.
    const forCounting = req.query.forCounting === "true";
    return scoped(req, (c) => getCount(c, req.companyId!, Number(req.params.id), forCounting));
  }));

  r.post("/counts/:id/lines", h(async (req) => {
    const b = z.object({ entries: z.array(countEntry).min(1) }).parse(req.body);
    const entries = b.entries.map((e) => ({
      lineId: e.lineId, countedQty: e.countedQty, reason: e.reason, notes: e.notes, isRecount: e.isRecount,
    }));
    return scoped(req, (c) => recordCounts(c, req.companyId!, Number(req.params.id), entries, uid(req)));
  }));

  r.post("/counts/:id/found", h(async (req) => {
    const b = foundBody.parse(req.body);
    return scoped(req, async (c) => ({
      status: 201,
      ...(await addFoundLine(c, req.companyId!, Number(req.params.id), {
        productId: b.productId, locationId: b.locationId, countedQty: b.countedQty,
        lotNo: b.lotNo, expirationDate: b.expirationDate, unitCost: b.unitCost,
        reason: b.reason, notes: b.notes, userId: uid(req),
      })),
    }));
  }));

  r.post("/counts/:id/submit", h(async (req) =>
    scoped(req, (c) => submitForReview(c, req.companyId!, Number(req.params.id), uid(req))),
  ));

  // The only endpoint here that moves money. Everything before it is evidence.
  r.post("/counts/:id/apply", h(async (req) => {
    const b = z.object({ onlyApproved: z.boolean().optional() }).parse(req.body ?? {});
    return scoped(req, (c) =>
      applyCount(c, req.companyId!, Number(req.params.id), { userId: uid(req), onlyApproved: b.onlyApproved }),
    );
  }));

  r.post("/counts/:id/cancel", h(async (req) => {
    const b = z.object({ reason: z.string().min(1, "indique el motivo") }).parse(req.body);
    return scoped(req, (c) => cancelCount(c, req.companyId!, Number(req.params.id), b.reason, uid(req)));
  }));

  return r;
}

// ── validation ───────────────────────────────────────────────────────────────

const decimal = z.string().regex(/^\d+(\.\d+)?$/, "valor inválido");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const locationBody = z.object({
  warehouseId: z.number().int().min(0),
  code: z.string().min(1),
  name: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  kind: z.enum(["picking", "bulk", "receiving", "staging", "quarantine", "damaged"]).optional(),
  zone: z.string().optional().nullable(),
  aisle: z.string().optional().nullable(),
  rack: z.string().optional().nullable(),
  level: z.string().optional().nullable(),
  position: z.string().optional().nullable(),
  pickPriority: z.number().int().optional(),
  isPickable: z.boolean().optional(),
  allowMixedProducts: z.boolean().optional(),
  maxQty: decimal.optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

const generateBody = z.object({
  warehouseId: z.number().int().min(0),
  zones: z.array(z.string().min(1)).min(1),
  aisles: z.array(z.string().min(1)).min(1),
  racks: z.array(z.string()).optional(),
  levels: z.array(z.string()).optional(),
  positions: z.array(z.string()).optional(),
  kind: z.string().optional(),
  separator: z.string().max(2).optional(),
  prefix: z.string().optional(),
  startPriority: z.number().int().optional(),
});

const putawayBody = z.object({
  productId: z.number().int().positive(),
  warehouseId: z.number().int().min(0),
  receivedDate: isoDate,
  unitCost: decimal.optional(),
  lotId: z.number().int().optional().nullable(),
  sourceType: z.string().optional(),
  sourceId: z.string().optional(),
  lines: z.array(z.object({
    locationId: z.number().int().positive(),
    quantity: decimal,
    lotNo: z.string().optional().nullable(),
    expirationDate: isoDate.optional().nullable(),
    status: z.enum(["available", "quarantine", "damaged"]).optional(),
  })).min(1),
});

const moveBody = z.object({
  placementId: z.number().int().positive(),
  toLocationId: z.number().int().positive(),
  quantity: decimal,
  notes: z.string().optional(),
});

const pickBody = z.object({
  productId: z.number().int().positive(),
  warehouseId: z.number().int().min(0),
  quantity: decimal,
  rotation: z.enum(["fifo", "fefo"]).optional(),
  allowPartial: z.boolean().optional(),
  allocations: z.array(z.object({
    placementId: z.number().int().positive(),
    quantity: decimal,
  })).optional(),
  sourceType: z.string().optional(),
  sourceId: z.string().optional(),
});

const countBody = z.object({
  warehouseId: z.number().int().min(0),
  countDate: isoDate,
  name: z.string().optional(),
  countType: z.enum(["full", "cycle", "spot"]).optional(),
  isBlind: z.boolean().optional(),
  locationIds: z.array(z.number().int()).optional(),
  productIds: z.array(z.number().int()).optional(),
  scheduledDate: isoDate.optional(),
  notes: z.string().optional(),
});

const countEntry = z.object({
  lineId: z.number().int().positive(),
  countedQty: decimal,
  reason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isRecount: z.boolean().optional(),
});

const foundBody = z.object({
  productId: z.number().int().positive(),
  locationId: z.number().int().positive().optional(),
  countedQty: decimal,
  lotNo: z.string().optional().nullable(),
  expirationDate: isoDate.optional().nullable(),
  unitCost: decimal.optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

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
      if (
        err instanceof WmsError ||
        err instanceof InventoryCountError ||
        err instanceof InventoryCostingError ||
        err instanceof PostingError
      ) {
        return res.status(400).json({ error: (err as Error).message });
      }
      console.error("[wms]", err);
      res.status(500).json({ error: "error interno" });
    }
  };
}
