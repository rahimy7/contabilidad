import express, { type Response } from "express";
import { authenticateToken, requireAdmin, type AuthenticatedRequest } from "../authMiddleware";
import { masterPool } from "../multi-tenant-db";

const router = express.Router();

/**
 * Consulta paginada de la bitácora. Sólo admin. Los filtros están pensados
 * para investigar: por usuario, por tienda, por recurso, por rango.
 */
router.get("/audit-log", authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const isSuperAdmin = user.role === "super_admin";

    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const userId = req.query.userId ? Number(req.query.userId) : null;
    const resource = req.query.resource ? String(req.query.resource) : null;
    const method = req.query.method ? String(req.query.method).toUpperCase() : null;
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;

    // Un admin de tienda ve sólo su tienda; el super_admin ve todo, salvo que
    // pida una tienda específica.
    const storeIdFilter = isSuperAdmin
      ? (req.query.storeId ? Number(req.query.storeId) : null)
      : (user.storeId ?? null);

    const conditions: string[] = [];
    const params: unknown[] = [];
    const push = (sqlFragment: string, value: unknown) => {
      params.push(value);
      conditions.push(sqlFragment.replace("$?", `$${params.length}`));
    };

    if (storeIdFilter != null) push("store_id = $?", storeIdFilter);
    if (userId != null) push("user_id = $?", userId);
    if (resource) push("resource = $?", resource);
    if (method) push("method = $?", method);
    if (from) push("created_at >= $?", from.toISOString());
    if (to) push("created_at <= $?", to.toISOString());

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const listSql = `
      SELECT id, user_id, store_id, action, resource, resource_id,
             details, ip_address, user_agent, method, path, status_code, created_at
        FROM system_audit_log
        ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT ${limit} OFFSET ${offset}`;
    const countSql = `SELECT count(*)::int AS total FROM system_audit_log ${where}`;

    const [rows, totals] = await Promise.all([
      masterPool.query(listSql, params),
      masterPool.query(countSql, params),
    ]);

    res.json({
      total: totals.rows[0]?.total ?? 0,
      limit,
      offset,
      rows: rows.rows,
    });
  } catch (err) {
    console.error("[audit-log] query failed:", err);
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

export default router;
