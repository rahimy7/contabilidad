import type { Request, Response, NextFunction } from "express";
import { masterPool } from "../multi-tenant-db";
import type { AuthUser } from "@shared/auth";

/**
 * Audit trail middleware for authenticated write operations.
 *
 * Runs AFTER `authenticateToken`, wraps `res.send`/`res.json` to capture the
 * final status code, and only records mutations (POST/PUT/PATCH/DELETE) on
 * paths under /api that are not high-volume noise (auth/me, notifications
 * poll, health). The insert is fire-and-forget so a logging failure never
 * fails a request.
 */

const IGNORED_PATH_FRAGMENTS = [
  "/auth/me",
  "/notifications/count",
  "/notifications/",
  "/health",
  "/debug/",
  "/audit-log",
];

const RESOURCE_HINT_RE = /\/api\/([a-z0-9-]+)(?:\/([^/?]+))?/i;

function resourceFromPath(path: string): { resource: string; resourceId: string | null } {
  const m = path.match(RESOURCE_HINT_RE);
  if (!m) return { resource: path.replace(/^\/+/, ""), resourceId: null };
  const idPart = m[2] ?? null;
  // A numeric or uuid-ish segment is treated as the record id; a word like
  // "search" or "assignment" is part of the resource name.
  const looksLikeId = idPart != null && /^[0-9a-f-]+$/i.test(idPart);
  return {
    resource: m[1],
    resourceId: looksLikeId ? idPart : null,
  };
}

function shouldAudit(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return false;
  const path = req.originalUrl || req.url;
  if (!path.startsWith("/api")) return false;
  if (IGNORED_PATH_FRAGMENTS.some((f) => path.includes(f))) return false;
  return true;
}

function safeBody(body: unknown): unknown {
  if (body == null || typeof body !== "object") return body;
  const clone: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    const key = k.toLowerCase();
    if (
      key === "password" ||
      key === "newpassword" ||
      key === "currentpassword" ||
      key === "token" ||
      key.includes("secret") ||
      key.includes("apikey") ||
      key === "totp" ||
      key === "totpcode"
    ) {
      clone[k] = "[redacted]";
    } else {
      clone[k] = v;
    }
  }
  return clone;
}

export function auditLogMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!shouldAudit(req)) return next();

  const startedAt = Date.now();
  const user = (req as Request & { user?: AuthUser }).user;
  const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress
    ?? null;
  const userAgent = (req.headers["user-agent"] as string) ?? null;
  const path = req.originalUrl || req.url;
  const method = req.method.toUpperCase();
  const { resource, resourceId } = resourceFromPath(path);
  const bodySnapshot = safeBody(req.body);

  let recorded = false;
  const record = (statusCode: number) => {
    if (recorded) return;
    recorded = true;

    // Fire-and-forget: never block the response or crash the request.
    Promise.resolve()
      .then(() =>
        masterPool.query(
          `INSERT INTO system_audit_log
             (user_id, store_id, action, resource, resource_id, details,
              ip_address, user_agent, method, path, status_code)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            user?.id ?? null,
            user?.storeId ?? null,
            `${method} ${resource}`,
            resource,
            resourceId,
            JSON.stringify({
              body: bodySnapshot,
              durationMs: Date.now() - startedAt,
              params: Object.keys(req.params ?? {}).length ? req.params : undefined,
              query: Object.keys(req.query ?? {}).length ? req.query : undefined,
            }),
            ipAddress,
            userAgent,
            method,
            path.split("?")[0],
            statusCode,
          ],
        ),
      )
      .catch((err) => {
        // Auditing must never take the request down; log and move on.
        console.warn("[audit-log] insert failed:", err?.message ?? err);
      });
  };

  res.on("finish", () => record(res.statusCode));
  res.on("close", () => record(res.statusCode));

  next();
}
