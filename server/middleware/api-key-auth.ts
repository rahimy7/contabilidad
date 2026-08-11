import type { Request, Response, NextFunction } from "express";
import { masterPool } from "../multi-tenant-db";
import { validateApiKey, checkRateLimit, logUsage, type ApiKeyInfo } from "../services/api-keys";

/**
 * Middleware para autenticación por API key.
 *
 * Acepta:
 *   Authorization: Bearer sk_xxx
 *   x-api-key: sk_xxx
 *
 * Al validar, adjunta `req.apiKey` con la info del key. Aplica rate limiting
 * antes de continuar. Registra el uso al finalizar el request.
 */

export interface ApiKeyRequest extends Request {
  apiKey?: ApiKeyInfo;
}

export async function requireApiKey(req: ApiKeyRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "API key requerida" });

  try {
    const key = await validateApiKey(masterPool, token);
    if (!key) return res.status(401).json({ error: "API key inválida o revocada" });

    const withinLimit = await checkRateLimit(masterPool, key.id, key.rateLimitPerMin);
    if (!withinLimit) {
      res.setHeader("Retry-After", "60");
      return res.status(429).json({ error: "Rate limit excedido" });
    }

    req.apiKey = key;

    const startTime = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - startTime;
      logUsage(
        masterPool,
        key.id,
        req.method,
        req.path,
        res.statusCode,
        duration,
        req.ip ?? null,
        req.get("user-agent") ?? null,
      ).catch(() => { /* best-effort */ });
    });

    next();
  } catch (err) {
    console.error("[api-key middleware]", err);
    res.status(500).json({ error: "Error interno" });
  }
}

export function requireScope(scope: "read" | "write" | "admin") {
  return (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    if (!req.apiKey) return res.status(401).json({ error: "API key requerida" });
    if (!req.apiKey.scopes.includes(scope) && !req.apiKey.scopes.includes("admin")) {
      return res.status(403).json({ error: `Scope '${scope}' requerido` });
    }
    next();
  };
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const xKey = req.headers["x-api-key"];
  if (typeof xKey === "string") return xKey;
  return null;
}
