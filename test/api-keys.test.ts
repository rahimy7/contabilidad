import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import {
  createApiKey, validateApiKey, revokeApiKey,
  checkRateLimit, logUsage, listApiKeys,
} from "../server/services/api-keys";

neonConfig.webSocketConstructor = ws;

describeIntegration("API keys", () => {
  let pool: Pool;
  const storeId = 999_980;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  async function cleanup() {
    await pool.query(`DELETE FROM api_key_usage WHERE api_key_id IN (SELECT id FROM api_keys WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM api_keys WHERE store_id=$1`, [storeId]);
  }

  beforeEach(async () => {
    await cleanup();
  });

  it("createApiKey emite token con prefix visible + hash oculto", async () => {
    const issued = await createApiKey(pool, {
      storeId, name: "Test key", createdBy: 1,
    });
    expect(issued.token).toMatch(/^sk_/);
    expect(issued.token.length).toBeGreaterThan(20);
    expect(issued.prefix).toBe(issued.token.slice(0, 12));
    expect(issued.keyHash).not.toBe(issued.token);
    expect(issued.keyHash).toHaveLength(64); // sha256
  });

  it("validateApiKey resuelve el token emitido", async () => {
    const issued = await createApiKey(pool, {
      storeId, name: "Valid", scopes: ["read", "write"], createdBy: 1,
    });
    const info = await validateApiKey(pool, issued.token);
    expect(info).not.toBeNull();
    expect(info!.storeId).toBe(storeId);
    expect(info!.scopes).toContain("read");
    expect(info!.scopes).toContain("write");
  });

  it("validateApiKey rechaza token inválido, revocado o inexistente", async () => {
    expect(await validateApiKey(pool, "sk_invalid_token")).toBeNull();
    expect(await validateApiKey(pool, "no_prefix_token")).toBeNull();

    const issued = await createApiKey(pool, { storeId, name: "R", createdBy: 1 });
    await revokeApiKey(pool, issued.id, 1);
    expect(await validateApiKey(pool, issued.token)).toBeNull();
  });

  it("validateApiKey rechaza key expirada", async () => {
    const expiredDate = new Date(Date.now() - 86_400_000).toISOString();
    const issued = await createApiKey(pool, {
      storeId, name: "Expired", expiresAt: expiredDate, createdBy: 1,
    });
    expect(await validateApiKey(pool, issued.token)).toBeNull();
  });

  it("checkRateLimit devuelve false cuando se supera el límite", async () => {
    const issued = await createApiKey(pool, {
      storeId, name: "Limited", rateLimitPerMin: 3, createdBy: 1,
    });
    await logUsage(pool, issued.id, "GET", "/v1/orders", 200, 10, null, null);
    await logUsage(pool, issued.id, "GET", "/v1/orders", 200, 10, null, null);
    await logUsage(pool, issued.id, "GET", "/v1/orders", 200, 10, null, null);
    const ok = await checkRateLimit(pool, issued.id, 3);
    expect(ok).toBe(false);
  });

  it("checkRateLimit devuelve true dentro del límite", async () => {
    const issued = await createApiKey(pool, {
      storeId, name: "OK", rateLimitPerMin: 10, createdBy: 1,
    });
    await logUsage(pool, issued.id, "GET", "/v1/orders", 200, 10, null, null);
    const ok = await checkRateLimit(pool, issued.id, 10);
    expect(ok).toBe(true);
  });

  it("logUsage incrementa contador y actualiza last_used_at", async () => {
    const issued = await createApiKey(pool, { storeId, name: "Log", createdBy: 1 });
    await logUsage(pool, issued.id, "GET", "/v1/orders", 200, 15, "1.2.3.4", "curl");
    const list = await listApiKeys(pool, storeId);
    const rec = list.find((k: any) => k.id === issued.id);
    expect(Number(rec.usageCount)).toBe(1);
    expect(rec.lastUsedAt).not.toBeNull();
  });

  it("listApiKeys no expone el key_hash", async () => {
    await createApiKey(pool, { storeId, name: "K", createdBy: 1 });
    const list = await listApiKeys(pool, storeId);
    expect(list[0]).not.toHaveProperty("keyHash");
    expect(list[0]).not.toHaveProperty("key_hash");
    expect(list[0].keyPrefix).toMatch(/^sk_/);
  });
});
