import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import {
  registerSerials, markSold, markReturned, findSerial, warrantyExpiring,
} from "../server/inventory/serials";

neonConfig.webSocketConstructor = ws;

describeIntegration("product serials", () => {
  let pool: Pool;
  const storeId = 999_733;
  let productId: number;
  let productId2: number;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    await pool.query(`DELETE FROM product_serials WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM products WHERE store_id=$1`, [storeId]);
    const p1 = await pool.query(
      `INSERT INTO products (store_id, name, sku, price, base_currency, category, type, status, availability)
       VALUES ($1, 'Producto S1', 'PS-1', '100', 'DOP', 'test', 'product', 'active', 'available') RETURNING id`,
      [storeId],
    );
    productId = p1.rows[0].id;
    const p2 = await pool.query(
      `INSERT INTO products (store_id, name, sku, price, base_currency, category, type, status, availability)
       VALUES ($1, 'Producto S2', 'PS-2', '200', 'DOP', 'test', 'product', 'active', 'available') RETURNING id`,
      [storeId],
    );
    productId2 = p2.rows[0].id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM product_serials WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM products WHERE store_id=$1`, [storeId]);
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM product_serials WHERE store_id=$1`, [storeId]);
  });

  it("registra series y detecta duplicados dentro del mismo producto", async () => {
    const r1 = await registerSerials(pool, {
      storeId, productId, serials: ["SN-1", "SN-2", "SN-3"],
    });
    expect(r1.inserted).toBe(3);
    expect(r1.duplicates).toEqual([]);

    const r2 = await registerSerials(pool, {
      storeId, productId, serials: ["SN-2", "SN-4"],
    });
    expect(r2.inserted).toBe(1);
    expect(r2.duplicates).toEqual(["SN-2"]);
  });

  it("dos productos pueden compartir un mismo número de serie", async () => {
    await registerSerials(pool, { storeId, productId, serials: ["COMMON-1"] });
    const r = await registerSerials(pool, { storeId, productId: productId2, serials: ["COMMON-1"] });
    expect(r.inserted).toBe(1);
  });

  it("markSold aplica garantía y encuentra la serie", async () => {
    await registerSerials(pool, { storeId, productId, serials: ["WARR-1"] });
    const soldAt = new Date("2026-01-01T00:00:00Z");
    const out = await markSold(pool, {
      storeId, productId, serialNumbers: ["WARR-1"], warrantyMonths: 24, soldAt,
    });
    expect(out.updated).toBe(1);
    const found = await findSerial(pool, storeId, "WARR-1");
    expect(found?.status).toBe("sold");
    expect(found?.warrantyUntil).toBe("2028-01-01");
  });

  it("markSold reporta las series que no existen", async () => {
    await registerSerials(pool, { storeId, productId, serials: ["ONLY-1"] });
    const out = await markSold(pool, {
      storeId, productId, serialNumbers: ["ONLY-1", "MISSING-1"],
    });
    expect(out.updated).toBe(1);
    expect(out.notFound).toEqual(["MISSING-1"]);
  });

  it("markReturned exige que estuviera vendida", async () => {
    await registerSerials(pool, { storeId, productId, serials: ["RET-1"] });
    // No está vendida todavía
    let out = await markReturned(pool, storeId, ["RET-1"]);
    expect(out.updated).toBe(0);

    await markSold(pool, { storeId, productId, serialNumbers: ["RET-1"] });
    out = await markReturned(pool, storeId, ["RET-1"]);
    expect(out.updated).toBe(1);
    const found = await findSerial(pool, storeId, "RET-1");
    expect(found?.status).toBe("returned");
  });

  it("warrantyExpiring lista las que vencen dentro de N días", async () => {
    await registerSerials(pool, { storeId, productId, serials: ["EXP-1", "EXP-2"] });
    const today = new Date();
    const past = new Date(today);
    past.setMonth(past.getMonth() - 23);
    await markSold(pool, { storeId, productId, serialNumbers: ["EXP-1"], warrantyMonths: 24, soldAt: past });
    // EXP-1 vence en ~1 mes
    const soon = await warrantyExpiring(pool, storeId, 60);
    expect(soon.some((r) => r.serial === "EXP-1")).toBe(true);
  });
});
