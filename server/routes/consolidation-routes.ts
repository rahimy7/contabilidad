import { Router, type Request } from "express";
import { z } from "zod";
import { withoutTenant } from "../tenant-context";
import { Consolidation, ConsolidationError } from "../consolidation/consolidate";

/**
 * HTTP surface for group consolidation.
 *
 * Unlike the other routers this one is deliberately cross-tenant: a consolidated
 * statement spans companies, so it does not go through `requireCompany`/`scoped`.
 * Access is authorised per request — the caller must belong to a company in the
 * group (or, to add a member, to the company being added) — and the reads run as
 * the owning role via `withoutTenant`.
 */
class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function consolidationRoutes(): Router {
  const r = Router();

  // Groups the caller can reach: those with a member company they belong to.
  r.get("/groups", h(async (req) => {
    const userId = uid(req);
    return withoutTenant(async (c) => {
      const { rows } = await c.query(
        `SELECT DISTINCT g.id, g.name, g.base_currency
           FROM groups g
           JOIN company_consolidation_map m ON m.group_id = g.id
           JOIN user_companies uc ON uc.company_id = m.company_id
          WHERE uc.user_id = $1
          ORDER BY g.name`,
        [userId],
      );
      return { groups: rows };
    });
  }));

  r.post("/groups", h(async (req) => {
    const b = groupBody.parse(req.body);
    return withoutTenant(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO groups (name, base_currency) VALUES ($1,$2) RETURNING id, name, base_currency`,
        [b.name, b.baseCurrency ?? "DOP"],
      );
      return { status: 201, group: rows[0] };
    });
  }));

  r.get("/groups/:id/members", h(async (req) => {
    const groupId = Number(req.params.id);
    await assertGroupAccess(uid(req), groupId);
    return withoutTenant(async (c) => {
      const { rows } = await c.query(
        `SELECT m.company_id, co.legal_name, co.rnc, m.ownership_pct::text AS ownership_pct, m.consol_method
           FROM company_consolidation_map m
           JOIN companies co ON co.id = m.company_id
          WHERE m.group_id = $1
          ORDER BY co.legal_name`,
        [groupId],
      );
      return { members: rows };
    });
  }));

  r.post("/groups/:id/members", h(async (req) => {
    const groupId = Number(req.params.id);
    const b = memberBody.parse(req.body);
    // Adding a company you control is what bootstraps your access to the group.
    await assertCompanyAccess(uid(req), b.companyId);
    return withoutTenant(async (c) => {
      const grp = await c.query(`SELECT 1 FROM groups WHERE id=$1`, [groupId]);
      if (grp.rows.length === 0) throw new HttpError(404, "grupo no encontrado");
      await c.query(
        `INSERT INTO company_consolidation_map (group_id, company_id, ownership_pct, consol_method)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (group_id, company_id) DO UPDATE SET ownership_pct=$3, consol_method=$4`,
        [groupId, b.companyId, b.ownershipPct ?? "1.0", b.consolMethod ?? "full"],
      );
      // Keep the company's own group_id in sync for convenience.
      await c.query(`UPDATE companies SET group_id=$1 WHERE id=$2 AND group_id IS NULL`, [groupId, b.companyId]);
      return { status: 201, ok: true };
    });
  }));

  r.post("/groups/:id/consolidate", h(async (req) => {
    const groupId = Number(req.params.id);
    await assertGroupAccess(uid(req), groupId);
    const b = consolidateBody.parse(req.body);
    return withoutTenant((c) =>
      new Consolidation(c).run({
        groupId,
        fiscalYear: b.fiscalYear,
        periodNo: b.periodNo,
        // Rebuilt with explicit keys: zod infers every field optional under
        // strictNullChecks:false, so the parsed shape is not assignable as-is.
        rates: b.rates?.map((r) => ({
          companyId: r.companyId,
          currency: r.currency,
          closingRate: r.closingRate,
          averageRate: r.averageRate,
        })),
        createdBy: uid(req),
      }),
    ).then((res) => ({ status: 201, ...res }));
  }));

  r.get("/groups/:id/runs", h(async (req) => {
    const groupId = Number(req.params.id);
    await assertGroupAccess(uid(req), groupId);
    return withoutTenant(async (c) => ({ runs: await new Consolidation(c).listRuns(groupId) }));
  }));

  r.get("/runs/:id", h(async (req) => {
    const runId = Number(req.params.id);
    return withoutTenant(async (c) => {
      const res = await new Consolidation(c).getRun(runId);
      await assertGroupAccess(uid(req), Number(res.run.group_id));
      return res;
    });
  }));

  return r;
}

const groupBody = z.object({ name: z.string().min(1), baseCurrency: z.string().length(3).optional() });
const memberBody = z.object({
  companyId: z.number().int().positive(),
  ownershipPct: z.string().regex(/^\d(\.\d+)?$/).optional(),
  consolMethod: z.enum(["full", "proportional", "equity"]).optional(),
});
const rateBody = z.object({
  companyId: z.number().int().positive(),
  currency: z.string().length(3).optional(),
  closingRate: z.string().regex(/^\d+(\.\d+)?$/),
  averageRate: z.string().regex(/^\d+(\.\d+)?$/),
});

const consolidateBody = z.object({
  fiscalYear: z.number().int().min(2000).max(2100),
  periodNo: z.number().int().min(1).max(12).optional(),
  /** Translation rates for members that do not keep the group's currency. */
  rates: z.array(rateBody).optional(),
});

function uid(req: Request): number {
  const id = (req as any).user?.id;
  if (!id) throw new HttpError(401, "autenticación requerida");
  return Number(id);
}

async function assertCompanyAccess(userId: number, companyId: number): Promise<void> {
  await withoutTenant(async (c) => {
    const { rows } = await c.query(
      `SELECT 1 FROM user_companies WHERE user_id=$1 AND company_id=$2 LIMIT 1`,
      [userId, companyId],
    );
    if (rows.length === 0) throw new HttpError(403, "no tienes acceso a esa empresa");
  });
}

async function assertGroupAccess(userId: number, groupId: number): Promise<void> {
  await withoutTenant(async (c) => {
    const { rows } = await c.query(
      `SELECT 1 FROM company_consolidation_map m
         JOIN user_companies uc ON uc.company_id = m.company_id
        WHERE m.group_id=$1 AND uc.user_id=$2 LIMIT 1`,
      [groupId, userId],
    );
    if (rows.length === 0) throw new HttpError(403, "no tienes acceso a este grupo");
  });
}

function h(fn: (req: Request) => Promise<any>) {
  return async (req: Request, res: any) => {
    try {
      const out = await fn(req);
      const status = out?.status ?? 200;
      if (out && typeof out === "object") delete out.status;
      res.status(status).json(out);
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      if (err instanceof z.ZodError) return res.status(400).json({ error: "validación", issues: err.issues });
      if (err instanceof ConsolidationError) return res.status(400).json({ error: err.message });
      console.error("[consolidation]", err);
      res.status(500).json({ error: "error interno" });
    }
  };
}
