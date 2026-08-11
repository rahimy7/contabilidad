import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { quotePrice } from "../server/services/pricing";

neonConfig.webSocketConstructor = ws;

describeIntegration("pricing engine — listas de precios + descuentos", () => {
  let pool: Pool;
  const storeId = 999_501;
  let customerId: number;
  let productId: number;
  let priceListId: number;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    await cleanup();

    // Producto base a precio 1000.
    const p = await pool.query(
      `INSERT INTO products (store_id, name, sku, price, base_currency, category, type, status, availability)
       VALUES ($1, 'Producto Test', 'PRC-1', '1000', 'DOP', 'test', 'product', 'active', 'available') RETURNING id`,
      [storeId],
    );
    productId = p.rows[0].id;

    // Cliente B2B.
    const c = await pool.query(
      `INSERT INTO customers (name, phone, email, store_id)
       VALUES ('Cliente B2B', '809-0000000', 'test@example.com', $1) RETURNING id`,
      [storeId],
    );
    customerId = c.rows[0].id;

    // Lista de precios wholesale con 10% descuento default.
    const pl = await pool.query(
      `INSERT INTO price_lists (store_id, code, name, tier, default_discount_percent, is_default_for_tier)
       VALUES ($1, 'WHOLESALE', 'Mayorista', 'wholesale', 10, false) RETURNING id`,
      [storeId],
    );
    priceListId = pl.rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  async function cleanup() {
    await pool.query(`DELETE FROM promotions WHERE store_id = $1`, [storeId]);
    await pool.query(`DELETE FROM volume_discounts WHERE store_id = $1`, [storeId]);
    await pool.query(`DELETE FROM customer_pricing_terms WHERE store_id = $1`, [storeId]);
    await pool.query(`DELETE FROM price_list_items WHERE price_list_id IN (SELECT id FROM price_lists WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM price_lists WHERE store_id = $1`, [storeId]);
    await pool.query(
      `DELETE FROM customer_segment_memberships
       WHERE segment_id IN (SELECT id FROM customer_segments WHERE store_id=$1)`,
      [storeId],
    );
    await pool.query(`DELETE FROM customer_segments WHERE store_id = $1`, [storeId]);
    await pool.query(`DELETE FROM customers WHERE store_id = $1`, [storeId]);
    await pool.query(`DELETE FROM products WHERE store_id = $1`, [storeId]);
  }

  beforeEach(async () => {
    await pool.query(`DELETE FROM promotions WHERE store_id = $1`, [storeId]);
    await pool.query(`DELETE FROM volume_discounts WHERE store_id = $1`, [storeId]);
    await pool.query(`DELETE FROM customer_pricing_terms WHERE customer_id = $1`, [customerId]);
    await pool.query(`DELETE FROM price_list_items WHERE price_list_id = $1`, [priceListId]);
    await pool.query(
      `DELETE FROM customer_segment_memberships
       WHERE segment_id IN (SELECT id FROM customer_segments WHERE store_id=$1)`,
      [storeId],
    );
    await pool.query(`DELETE FROM customer_segments WHERE store_id = $1`, [storeId]);
  });

  it("sin cliente: devuelve precio base", async () => {
    const q = await quotePrice(pool, { storeId, productId, quantity: 1 });
    expect(q.finalUnitPrice).toBe(1000);
    expect(q.listPriceId).toBeNull();
  });

  it("cliente con lista de precios y ítem específico usa el precio de lista", async () => {
    await pool.query(
      `INSERT INTO price_list_items (price_list_id, product_id, unit_price, min_quantity)
       VALUES ($1, $2, '850', 1)`,
      [priceListId, productId],
    );
    await pool.query(
      `INSERT INTO customer_pricing_terms (customer_id, store_id, price_list_id)
       VALUES ($1, $2, $3)`,
      [customerId, storeId, priceListId],
    );
    const q = await quotePrice(pool, { storeId, productId, customerId, quantity: 1 });
    expect(q.finalUnitPrice).toBe(850);
    expect(q.listPriceId).toBe(priceListId);
  });

  it("sin ítem específico: usa descuento default de la lista sobre el precio base", async () => {
    await pool.query(
      `INSERT INTO customer_pricing_terms (customer_id, store_id, price_list_id)
       VALUES ($1, $2, $3)`,
      [customerId, storeId, priceListId],
    );
    const q = await quotePrice(pool, { storeId, productId, customerId, quantity: 1 });
    // 1000 × (1 - 0.10) = 900
    expect(q.finalUnitPrice).toBe(900);
  });

  it("descuento adicional del cliente se compone sobre el de lista", async () => {
    await pool.query(
      `INSERT INTO customer_pricing_terms (customer_id, store_id, price_list_id, additional_discount_percent)
       VALUES ($1, $2, $3, 5)`,
      [customerId, storeId, priceListId],
    );
    const q = await quotePrice(pool, { storeId, productId, customerId, quantity: 1 });
    // 1000 × 0.90 × 0.95 = 855
    expect(q.finalUnitPrice).toBe(855);
    expect(q.customerDiscountPct).toBe(5);
  });

  it("descuento por volumen aplica encima de los anteriores", async () => {
    await pool.query(
      `INSERT INTO volume_discounts (store_id, scope_type, name, min_quantity, discount_percent)
       VALUES ($1, 'all', 'Vol >=10', 10, 8)`,
      [storeId],
    );
    const q = await quotePrice(pool, { storeId, productId, quantity: 10 });
    // 1000 × (1 - 0.08) = 920
    expect(q.volumeDiscountPct).toBe(8);
    expect(q.finalUnitPrice).toBe(920);
  });

  it("selecciona escalón mayor de volumen cuando aplican varios", async () => {
    await pool.query(
      `INSERT INTO volume_discounts (store_id, scope_type, name, min_quantity, discount_percent)
       VALUES ($1, 'all', 'Vol >=10', 10, 5),
              ($1, 'all', 'Vol >=25', 25, 10),
              ($1, 'all', 'Vol >=50', 50, 15)`,
      [storeId],
    );
    const q = await quotePrice(pool, { storeId, productId, quantity: 30 });
    expect(q.volumeDiscountPct).toBe(10);
  });

  it("promoción por segmento aplica sólo a clientes miembros", async () => {
    // Segmento y membership.
    const seg = await pool.query(
      `INSERT INTO customer_segments (store_id, code, name, segment_type)
       VALUES ($1, 'VIP', 'Cliente VIP', 'b2c_vip') RETURNING id`,
      [storeId],
    );
    await pool.query(
      `INSERT INTO customer_segment_memberships (segment_id, customer_id, is_manual)
       VALUES ($1, $2, true)`,
      [seg.rows[0].id, customerId],
    );
    await pool.query(
      `INSERT INTO promotions
         (store_id, code, name, promotion_type, discount_percent, applies_to,
          valid_from, target_segment_ids)
       VALUES ($1, 'VIP20', 'VIP 20%', 'percent_off', 20, 'order',
               CURRENT_DATE - INTERVAL '1 day', ARRAY[$2]::int[])`,
      [storeId, seg.rows[0].id],
    );
    // Con cliente VIP.
    const qVip = await quotePrice(pool, { storeId, productId, customerId, quantity: 1 });
    expect(qVip.promotionDiscountPct).toBe(20);
    expect(qVip.finalUnitPrice).toBe(800);
    // Sin cliente: la promoción de segmento no debe aplicar.
    const qNone = await quotePrice(pool, { storeId, productId, quantity: 1 });
    expect(qNone.promotionDiscountPct).toBe(0);
  });

  it("promoción sin segmento aplica a todos", async () => {
    await pool.query(
      `INSERT INTO promotions
         (store_id, code, name, promotion_type, discount_percent, applies_to, valid_from)
       VALUES ($1, 'BLACKFRIDAY', 'BF25', 'percent_off', 25, 'order', CURRENT_DATE - INTERVAL '1 day')`,
      [storeId],
    );
    const q = await quotePrice(pool, { storeId, productId, quantity: 1 });
    expect(q.promotionDiscountPct).toBe(25);
    expect(q.finalUnitPrice).toBe(750);
  });

  it("composición completa: lista + cliente + volumen + promoción", async () => {
    await pool.query(
      `INSERT INTO customer_pricing_terms (customer_id, store_id, price_list_id, additional_discount_percent)
       VALUES ($1, $2, $3, 5)`,
      [customerId, storeId, priceListId],
    );
    await pool.query(
      `INSERT INTO volume_discounts (store_id, scope_type, name, min_quantity, discount_percent)
       VALUES ($1, 'all', 'V10', 10, 5)`,
      [storeId],
    );
    await pool.query(
      `INSERT INTO promotions
         (store_id, code, name, promotion_type, discount_percent, applies_to, valid_from)
       VALUES ($1, 'ADD', 'Add10', 'percent_off', 10, 'order', CURRENT_DATE - INTERVAL '1 day')`,
      [storeId],
    );
    const q = await quotePrice(pool, { storeId, productId, customerId, quantity: 15 });
    // 1000 × 0.90 × 0.95 × 0.95 × 0.90 = 731.025 → redondea a 731.03 o 731.02 según arithmetic
    expect(q.finalUnitPrice).toBeGreaterThan(730);
    expect(q.finalUnitPrice).toBeLessThan(732);
  });
});
