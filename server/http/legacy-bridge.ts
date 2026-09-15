import type { Request, Response } from "express";
import { resolveActiveCompany, withCompany } from "../tenant-context";
import { SqlClient } from "../accounting/types";
import { pickCompanyId } from "./require-company";

/**
 * The bridge from the legacy operational routes (scoped by the JWT's `storeId`)
 * to the company-scoped accounting services.
 *
 * A legacy screen — transfers, adjustments, purchase receipts, HR — acts on a
 * store, but anything that moves value has to post to a company's books. The
 * company is resolved exactly as the accounting API resolves it: from the
 * `X-Company-Id` header (the client sends it on every request) or the user's
 * default membership, checked against `user_companies` on every call. The work
 * then runs inside `withCompany`, so row-level security applies to the
 * accounting tables it touches and the legacy tables it updates share the same
 * transaction.
 */
export class LegacyBridgeError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409 | 422 = 400) {
    super(message);
  }
}

export interface LegacyContext {
  companyId: number;
  storeId: number;
  userId: number;
}

export async function resolveLegacyCompany(req: Request): Promise<number> {
  const userId = Number((req as any).user?.id ?? (req as any).user?.userId);
  if (!userId) throw new LegacyBridgeError("autenticación requerida", 403);
  const requested = pickCompanyId(req);
  const companyId = await resolveActiveCompany(userId, requested);
  if (!companyId) {
    throw new LegacyBridgeError(
      requested ? "no tienes acceso a esa empresa" : "el usuario no está asociado a ninguna empresa",
      403,
    );
  }
  return companyId;
}

/** Runs `fn` in the request's company scope, with the legacy store alongside. */
export async function withLegacyCompany<T>(
  req: Request,
  fn: (client: SqlClient, ctx: LegacyContext) => Promise<T>,
): Promise<T> {
  const companyId = await resolveLegacyCompany(req);
  const user = (req as any).user ?? {};
  const ctx: LegacyContext = {
    companyId,
    storeId: Number(user.storeId ?? 1),
    userId: Number(user.id ?? user.userId),
  };
  return withCompany(companyId, (c) => fn(c, ctx));
}

/** Warehouse ownership lives with the inventory module; re-exported for routes. */
export { claimWarehouse as lockWarehouse } from "../inventory/operational-stock";

/**
 * Maps a service error to an HTTP response. Business-rule failures (insufficient
 * stock, wrong company, closed period) are the client's to fix and come back as
 * 4xx with the service's own message; anything else is a 500.
 */
export function sendLegacyError(res: Response, err: unknown, fallback: string) {
  const e = err as any;
  if (e instanceof LegacyBridgeError) return res.status(e.status).json({ error: e.message });
  const name = e?.constructor?.name ?? "";
  if (
    /(Costing|Payables|Receivables|Posting|Procurement|Payroll|Treasury|Wms|InventoryCount|Checkout|Stock|Ownership|UnresolvedAccount|PurchaseReturn|PeriodClose)Error$/.test(name) ||
    e?.name === "ZodError"
  ) {
    return res.status(e?.name === "ZodError" ? 400 : 422).json({ error: e?.errors?.[0]?.message ?? e.message });
  }
  // Postgres raises the posting-period guard as a check violation.
  if (typeof e?.message === "string" && /period|período/i.test(e.message) && e?.code) {
    return res.status(422).json({ error: e.message });
  }
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
}
