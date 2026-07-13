import type { Request, Response, NextFunction } from "express";
import { resolveActiveCompany, withCompany } from "../tenant-context";
import { SqlClient } from "../accounting/types";

/**
 * Bridges the existing JWT auth to the company-scoped world.
 *
 * `authenticateToken` runs first and sets `req.user`. This resolves which
 * company the request acts on — from an `X-Company-Id` header or `?companyId`,
 * falling back to the user's default — and proves membership against
 * `user_companies`. A user with no membership is refused; the JWT is not trusted
 * to assert company access on its own, so revocation is immediate.
 *
 * It does not open a transaction. That happens per handler, via `scoped`, so a
 * read and a write get their own transaction boundaries and a slow handler does
 * not hold a connection across the whole request.
 */

/**
 * `req.user` comes from the global Express augmentation in shared/auth.ts, where
 * `authenticateToken` has already normalised the JWT's `userId` into `id`. We
 * only add the resolved company.
 */
export interface CompanyRequest extends Request {
  companyId?: number;
}

export async function requireCompany(req: CompanyRequest, res: Response, next: NextFunction) {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "authentication required" });
  }

  const requested = pickCompanyId(req);
  try {
    const companyId = await resolveActiveCompany(Number(userId), requested);
    if (!companyId) {
      return res.status(403).json({
        error: requested
          ? "no tienes acceso a esa empresa"
          : "el usuario no está asociado a ninguna empresa",
      });
    }
    req.companyId = companyId;
    next();
  } catch (err) {
    next(err);
  }
}

function pickCompanyId(req: Request): number | undefined {
  const header = req.header("x-company-id");
  const q = typeof req.query.companyId === "string" ? req.query.companyId : undefined;
  const raw = header ?? q;
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * Runs `fn` inside the request's company scope. Every handler that reads or
 * writes tenant data goes through here, so no handler can forget the `SET LOCAL
 * ROLE app_rls` that makes row-level security apply.
 */
export function scoped<T>(req: CompanyRequest, fn: (client: SqlClient) => Promise<T>): Promise<T> {
  if (!req.companyId) throw new Error("scoped() called before requireCompany established a company");
  return withCompany(req.companyId, fn);
}
