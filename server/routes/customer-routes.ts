import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { withLegacyCompany, LegacyBridgeError } from "../http/legacy-bridge";
import {
  CustomerError, listCustomers, getCustomer, customerLookups, customerStatement,
  createCustomer, updateCustomer, deleteCustomer, saveContact, removeContact,
  requestCredit, resolveCreditApplication, cancelCreditApplication, changeCreditStatus,
  type CustomerCtx, type CustomerInput,
} from "../sales/customers";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha debe ser YYYY-MM-DD");
const optText = z.string().max(500).nullish();
const pct = z.coerce.number().min(0).max(100);

const termsBody = z.object({
  priceListId: z.number().int().positive().nullish(),
  additionalDiscountPercent: pct.default(0),
  earlyPaymentDiscountPercent: pct.default(0),
  earlyPaymentDays: z.number().int().min(0).max(365).nullish(),
  itbisRetentionPercent: pct.default(0),
  isrRetentionPercent: pct.default(0),
  requiresPurchaseOrder: z.boolean().default(false),
  gracePeriodDays: z.number().int().min(0).max(365).default(0),
  notes: optText,
});

const customerBody = z.object({
  code: z.string().max(30).nullish(),
  personType: z.enum(["fisica", "juridica"]),
  taxIdType: z.enum(["rnc", "cedula", "pasaporte", "extranjero"]).nullish(),
  rnc: z.string().max(20).nullish(),
  foreignId: z.string().max(40).nullish(),
  legalName: z.string().trim().min(2, "la razón social o nombre es obligatorio").max(200),
  tradeName: z.string().max(200).nullish(),
  taxpayerType: z.enum(["contribuyente", "rst", "regimen_especial", "gubernamental", "consumidor_final", "exterior"]),
  defaultNcfType: z.string().max(3).nullish(),
  itbisExempt: z.boolean().default(false),
  exemptionReference: optText,
  economicActivity: optText,
  dgiiStatus: z.enum(["activo", "suspendido", "cese", "no_verificado"]).nullish(),
  dgiiVerifiedAt: isoDate.nullish().or(z.literal("")),
  phone: z.string().trim().min(7, "el teléfono es obligatorio").max(30),
  phoneAlt: z.string().max(30).nullish(),
  email: z.string().trim().email("correo inválido").nullish().or(z.literal("")),
  website: z.string().max(200).nullish(),
  address: optText,
  sector: z.string().max(120).nullish(),
  municipality: z.string().max(120).nullish(),
  province: z.string().max(120).nullish(),
  postalCode: z.string().max(10).nullish(),
  country: z.string().length(2).default("DO"),
  customerTypeId: z.number().int().positive().nullish(),
  salesRepUserId: z.number().int().positive().nullish(),
  currency: z.string().length(3).default("DOP"),
  preferredPaymentMethod: z.enum(["cash", "transfer", "check", "card"]).nullish(),
  isActive: z.boolean().default(true),
  notes: z.string().max(2000).nullish(),
  terms: termsBody.default({}),
  confirmDuplicateTaxId: z.boolean().optional(),
});

const creditRequestBody = z.object({
  requestedLimit: z.coerce.number().positive("el monto solicitado debe ser mayor que cero"),
  requestedDays: z.coerce.number().int().min(0).max(365),
  justification: z.string().trim().min(10, "explique la solicitud (al menos 10 caracteres)").max(2000),
  guaranteeType: z.enum(["ninguna", "pagare", "fianza", "hipotecaria", "prendaria", "carta_credito", "deposito"]).default("ninguna"),
  guaranteeAmount: z.coerce.number().nonnegative().nullish(),
  guaranteeNotes: z.string().max(1000).nullish(),
  referencesNotes: z.string().max(2000).nullish(),
  reviewDate: isoDate.nullish().or(z.literal("")),
});

const resolveBody = z.object({
  action: z.enum(["approve", "reject"]),
  approvedLimit: z.coerce.number().positive().optional(),
  approvedDays: z.coerce.number().int().min(0).max(365).optional(),
  comment: z.string().max(1000).nullish(),
});

const statusBody = z.object({
  status: z.enum(["active", "suspended", "blocked"]),
  reason: z.string().trim().min(5, "indique el motivo del cambio").max(1000),
});

const contactBody = z.object({
  name: z.string().trim().min(2).max(120),
  role: z.enum(["buyer", "accountant", "manager", "operations", "warehouse", "other"]),
  email: z.string().trim().email("correo inválido").nullish().or(z.literal("")),
  phone: z.string().max(30).nullish(),
  mobile: z.string().max(30).nullish(),
  isPrimary: z.boolean().default(false),
  receivesInvoices: z.boolean().default(false),
  receivesStatements: z.boolean().default(false),
  notes: z.string().max(500).nullish(),
});

const idParam = (v: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new CustomerError("identificador inválido", 400);
  return n;
};

function sendError(res: Response, err: any) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: err.errors[0]?.message ?? "datos inválidos", issues: err.errors });
  }
  if (err instanceof CustomerError) {
    return res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
  }
  if (err instanceof LegacyBridgeError) return res.status(err.status).json({ error: err.message });
  console.error("[customers]", err);
  return res.status(500).json({ error: "Error en el maestro de clientes" });
}

/** Ejecuta en el alcance de la empresa activa, con la tienda y el usuario del token. */
function handle(status: number, fn: (req: Request, c: any, ctx: CustomerCtx) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      const out = await withLegacyCompany(req, (c, ctx) => fn(req, c, ctx));
      res.status(status).json(out ?? { ok: true });
    } catch (err) {
      sendError(res, err);
    }
  };
}

/**
 * Maestro de clientes del ERP. Montado aparte de las rutas heredadas de
 * /api/customers (POS y WhatsApp), que siguen sirviendo a esas pantallas.
 */
export function customerRoutes(): Router {
  const r = Router();

  r.get("/", handle(200, (req, c, ctx) =>
    listCustomers(c, ctx, {
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      credit: typeof req.query.credit === "string" ? req.query.credit : undefined,
    }).then((rows) => ({ rows }))));

  r.get("/lookups", handle(200, (_req, c, ctx) => customerLookups(c, ctx)));

  r.post("/", handle(201, (req, c, ctx) => createCustomer(c, ctx, customerBody.parse(req.body) as CustomerInput)));

  // Solicitudes de crédito (antes de /:id para que "credit" no se lea como id).
  r.post("/credit/applications/:applicationId/resolve", handle(200, (req, c, ctx) => {
    const b = resolveBody.parse(req.body);
    return resolveCreditApplication(c, ctx, idParam(req.params.applicationId), {
      action: b.action!, approvedLimit: b.approvedLimit, approvedDays: b.approvedDays, comment: b.comment,
    });
  }));

  r.post("/credit/applications/:applicationId/cancel", handle(200, (req, c, ctx) =>
    cancelCreditApplication(c, ctx, idParam(req.params.applicationId), z.object({ reason: z.string().max(1000).nullish() }).parse(req.body ?? {}).reason ?? null)));

  r.get("/:id", handle(200, (req, c, ctx) => getCustomer(c, ctx, idParam(req.params.id))));

  r.put("/:id", handle(200, (req, c, ctx) =>
    updateCustomer(c, ctx, idParam(req.params.id), customerBody.parse(req.body) as CustomerInput)));

  r.delete("/:id", handle(200, (req, c, ctx) => deleteCustomer(c, ctx, idParam(req.params.id))));

  r.get("/:id/statement", handle(200, (req, c, ctx) => customerStatement(c, ctx, idParam(req.params.id))));

  r.post("/:id/credit/applications", handle(201, (req, c, ctx) =>
    requestCredit(c, ctx, idParam(req.params.id), creditRequestBody.parse(req.body) as any)));

  r.post("/:id/credit/status", handle(200, (req, c, ctx) =>
    changeCreditStatus(c, ctx, idParam(req.params.id), statusBody.parse(req.body) as any)));

  r.post("/:id/contacts", handle(201, (req, c, ctx) =>
    saveContact(c, ctx, idParam(req.params.id), null, contactBody.parse(req.body) as any)));

  r.put("/:id/contacts/:contactId", handle(200, (req, c, ctx) =>
    saveContact(c, ctx, idParam(req.params.id), idParam(req.params.contactId), contactBody.parse(req.body) as any)));

  r.delete("/:id/contacts/:contactId", handle(200, (req, c, ctx) =>
    removeContact(c, ctx, idParam(req.params.id), idParam(req.params.contactId))));

  return r;
}
