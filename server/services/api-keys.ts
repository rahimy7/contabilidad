import crypto from "node:crypto";
import type { Pool } from "@neondatabase/serverless";

/**
 * API keys para integraciones externas.
 *
 * Emisión: se genera un token opaco de 40 bytes hex; se guarda sólo su hash
 * SHA-256. El usuario ve el token **una sola vez**.
 *
 * Validación: hash del token → busca en `api_keys` where key_hash=$1 and
 * is_active=true and revoked_at IS NULL and (expires_at IS NULL OR
 * expires_at > now()).
 *
 * Rate limit: cuenta requests de últimos 60s en `api_key_usage`. Si excede
 * `rate_limit_per_min`, devuelve 429.
 */

export class ApiKeyError extends Error {}

export interface ApiKeyInfo {
  id: number;
  storeId: number;
  companyId: number | null;
  name: string;
  scopes: string[];
  rateLimitPerMin: number;
  isActive: boolean;
}

export interface CreateApiKeyInput {
  storeId: number;
  companyId?: number;
  name: string;
  scopes?: string[];
  rateLimitPerMin?: number;
  expiresAt?: string;
  notes?: string;
  createdBy: number;
}

export interface IssuedApiKey {
  id: number;
  token: string; // Se muestra una sola vez.
  prefix: string;
  keyHash: string;
}

const TOKEN_PREFIX = "sk_"; // "secret key"

export async function createApiKey(pool: Pool, input: CreateApiKeyInput): Promise<IssuedApiKey> {
  const raw = crypto.randomBytes(24).toString("base64url");
  const token = `${TOKEN_PREFIX}${raw}`;
  const prefix = token.slice(0, 12);
  const keyHash = hashToken(token);

  const r = await pool.query(
    `INSERT INTO api_keys
       (store_id, company_id, name, key_hash, key_prefix,
        scopes, rate_limit_per_min, expires_at, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9,$10) RETURNING id`,
    [
      input.storeId, input.companyId ?? null,
      input.name, keyHash, prefix,
      input.scopes ?? ["read"],
      input.rateLimitPerMin ?? 60,
      input.expiresAt ?? null,
      input.notes ?? null, input.createdBy,
    ],
  );
  return { id: Number(r.rows[0].id), token, prefix, keyHash };
}

export async function validateApiKey(pool: Pool, token: string): Promise<ApiKeyInfo | null> {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  const keyHash = hashToken(token);
  const r = await pool.query(
    `SELECT id, store_id AS "storeId", company_id AS "companyId", name,
            scopes, rate_limit_per_min AS "rateLimitPerMin", is_active AS "isActive"
       FROM api_keys
      WHERE key_hash = $1 AND is_active = true AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > now())`,
    [keyHash],
  );
  return r.rowCount ? r.rows[0] : null;
}

export async function logUsage(
  pool: Pool,
  apiKeyId: number,
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
  ip: string | null,
  userAgent: string | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO api_key_usage
       (api_key_id, method, path, status_code, duration_ms, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [apiKeyId, method, path, statusCode, durationMs, ip, userAgent],
  );
  await pool.query(
    `UPDATE api_keys SET last_used_at = now(), usage_count = usage_count + 1 WHERE id = $1`,
    [apiKeyId],
  );
}

export async function checkRateLimit(pool: Pool, apiKeyId: number, limit: number): Promise<boolean> {
  const r = await pool.query(
    `SELECT count(*)::int AS n FROM api_key_usage
      WHERE api_key_id = $1 AND called_at > NOW() - INTERVAL '60 seconds'`,
    [apiKeyId],
  );
  return Number(r.rows[0].n) < limit;
}

export async function revokeApiKey(pool: Pool, keyId: number, revokedBy: number): Promise<void> {
  await pool.query(
    `UPDATE api_keys SET is_active = false, revoked_at = now(), revoked_by = $2 WHERE id = $1`,
    [keyId, revokedBy],
  );
}

export async function listApiKeys(pool: Pool, storeId: number) {
  const r = await pool.query(
    `SELECT id, name, key_prefix AS "keyPrefix", scopes,
            rate_limit_per_min AS "rateLimitPerMin",
            expires_at::text AS "expiresAt",
            last_used_at::text AS "lastUsedAt",
            usage_count AS "usageCount",
            is_active AS "isActive",
            revoked_at::text AS "revokedAt",
            created_at::text AS "createdAt", notes
       FROM api_keys WHERE store_id = $1
       ORDER BY created_at DESC`,
    [storeId],
  );
  return r.rows;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
