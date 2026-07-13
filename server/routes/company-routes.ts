import { Router } from "express";
import { z } from "zod";
import type { Request, Response } from "express";
import { withoutTenant } from "../tenant-context";
import { seedCompanyDefaults } from "../seed/company-defaults";

/**
 * Company selection and creation — the multi-company entry point.
 *
 * These are deliberately cross-tenant: choosing which company to act on, and
 * creating a new one, cannot themselves be scoped to a company. They run as the
 * owning role (`withoutTenant`) and enforce their own rule — a user sees and
 * acts only on companies they are a member of, checked against `user_companies`
 * on every call, never trusted from the token.
 *
 * They require auth but NOT `requireCompany`: there may be no active company yet.
 */
export function companyRoutes(): Router {
  const r = Router();

  // The companies the current user may enter. The client renders these in the
  // switcher and uses the default for the first request.
  r.get(
    "/",
    handler(async (req) => {
      const userId = numericUserId(req);
      const companies = await withoutTenant(async (c) => {
        const { rows } = await c.query(
          `SELECT co.id, co.legal_name, co.trade_name, co.rnc, co.functional_currency,
                  uc.is_default
             FROM user_companies uc
             JOIN companies co ON co.id = uc.company_id
            WHERE uc.user_id = $1 AND co.is_active
            ORDER BY uc.is_default DESC, co.legal_name`,
          [userId],
        );
        return rows;
      });
      return { companies };
    }),
  );

  /**
   * Creates a company and makes the caller its first member.
   *
   * The company row, the membership, and the full set of defaults (chart of
   * accounts, tax codes, retention rules, periods, posting rules) are seeded in
   * one transaction: a half-created tenant with no chart of accounts is worse
   * than none. Runs as owner because RLS on `companies` would otherwise reject
   * the insert of a company that is not yet the active one.
   */
  r.post(
    "/",
    handler(async (req) => {
      const body = createCompanyBody.parse(req.body);
      const userId = numericUserId(req);

      const company = await withoutTenant(async (c) => {
        const existing = await c.query(`SELECT id FROM companies WHERE rnc = $1`, [body.rnc]);
        if (existing.rows.length > 0) {
          throw new HttpError(409, "ya existe una empresa con ese RNC");
        }

        const created = await c.query(
          `INSERT INTO companies (legal_name, trade_name, rnc, fiscal_regime, functional_currency, group_id)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, legal_name, trade_name, rnc`,
          [
            body.legalName,
            body.tradeName ?? null,
            body.rnc,
            body.fiscalRegime ?? "ordinario",
            body.functionalCurrency ?? "DOP",
            body.groupId ?? null,
          ],
        );
        const companyId = created.rows[0].id;

        // First member, and their default company.
        await c.query(
          `INSERT INTO user_companies (user_id, company_id, is_default)
           VALUES ($1,$2, NOT EXISTS (SELECT 1 FROM user_companies WHERE user_id=$1))
           ON CONFLICT (user_id, company_id) DO NOTHING`,
          [userId, companyId],
        );

        await seedCompanyDefaults(c, companyId);
        return created.rows[0];
      });

      return { status: 201, company };
    }),
  );

  /**
   * Adds an existing user to a company the caller belongs to. This is how a
   * colleague joins: the caller must already be a member (checked here), and the
   * target user must exist. Membership, not the token, is the authority.
   */
  r.post(
    "/:companyId/members",
    handler(async (req) => {
      const callerId = numericUserId(req);
      const companyId = Number(req.params.companyId);
      const body = addMemberBody.parse(req.body);

      await withoutTenant(async (c) => {
        const member = await c.query(
          `SELECT 1 FROM user_companies WHERE user_id=$1 AND company_id=$2`,
          [callerId, companyId],
        );
        if (member.rows.length === 0) throw new HttpError(403, "no perteneces a esa empresa");

        const target = await c.query(`SELECT id FROM users WHERE id=$1 OR username=$2 LIMIT 1`, [
          body.userId ?? 0,
          body.username ?? "",
        ]);
        if (target.rows.length === 0) throw new HttpError(404, "usuario no encontrado");

        await c.query(
          `INSERT INTO user_companies (user_id, company_id, is_default)
           VALUES ($1,$2,false) ON CONFLICT (user_id, company_id) DO NOTHING`,
          [target.rows[0].id, companyId],
        );
      });
      return { status: 201, added: true };
    }),
  );

  /** The members of a company the caller belongs to. */
  r.get(
    "/:companyId/members",
    handler(async (req) => {
      const callerId = numericUserId(req);
      const companyId = Number(req.params.companyId);
      const members = await withoutTenant(async (c) => {
        const member = await c.query(`SELECT 1 FROM user_companies WHERE user_id=$1 AND company_id=$2`, [callerId, companyId]);
        if (member.rows.length === 0) throw new HttpError(403, "no perteneces a esa empresa");
        const { rows } = await c.query(
          `SELECT u.id, u.username, u.name, u.role, uc.is_default
             FROM user_companies uc JOIN users u ON u.id=uc.user_id
            WHERE uc.company_id=$1 ORDER BY u.name`,
          [companyId],
        );
        return rows;
      });
      return { members };
    }),
  );

  return r;
}

const addMemberBody = z
  .object({ userId: z.number().int().positive().optional(), username: z.string().optional() })
  .refine((b) => b.userId || b.username, "se requiere userId o username");

const createCompanyBody = z.object({
  legalName: z.string().min(1),
  tradeName: z.string().optional(),
  rnc: z.string().regex(/^\d{9}$|^\d{11}$/, "RNC de 9 dígitos o cédula de 11"),
  fiscalRegime: z.string().optional(),
  functionalCurrency: z.string().length(3).optional(),
  groupId: z.number().int().positive().optional(),
});

// ── plumbing ────────────────────────────────────────────────────────────────

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const numericUserId = (req: Request): number => {
  const id = req.user?.id;
  if (!id) throw new HttpError(401, "authentication required");
  return Number(id);
};

function handler(fn: (req: Request) => Promise<any>) {
  return async (req: Request, res: Response) => {
    try {
      const out = await fn(req);
      const status = out?.status ?? 200;
      if (out && typeof out === "object") delete out.status;
      res.status(status).json(out);
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      if (err instanceof z.ZodError) return res.status(400).json({ error: "validación", issues: err.issues });
      console.error("[companies]", err);
      res.status(500).json({ error: "error interno" });
    }
  };
}
