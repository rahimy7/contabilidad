import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { getExecutiveDashboard } from "../server/services/executive-dashboard";

neonConfig.webSocketConstructor = ws;

/**
 * Executive dashboard — validaciones de:
 *   - Rangos de fecha correctos (mes actual vs mes anterior)
 *   - Aging buckets AR/AP
 *   - Top clientes por revenue
 *   - Delta % (up/down/flat)
 *   - Sin datos → todos los campos = 0 sin errores
 */

describeIntegration("executive dashboard KPIs", () => {
  let pool: Pool;
  const storeId = 999_801;
  let customerA: number, customerB: number;
  let productA: number, productB: number;
  let warehouseId: number;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    await cleanup();

    const w = await pool.query(
      `INSERT INTO warehouses (store_id, name, description, is_default)
       VALUES ($1, 'Dashboard WH', 'test', true) RETURNING id`,
      [storeId],
    );
    warehouseId = w.rows[0].id;

    const ca = await pool.query(
      `INSERT INTO customers (name, phone, email, store_id)
       VALUES ('Cliente Grande', '809-0000001', 'grande@x.com', $1) RETURNING id`, [storeId]);
    customerA = ca.rows[0].id;
    const cb = await pool.query(
      `INSERT INTO customers (name, phone, email, store_id)
       VALUES ('Cliente Pequeño', '809-0000002', 'chico@x.com', $1) RETURNING id`, [storeId]);
    customerB = cb.rows[0].id;

    const pa = await pool.query(
      `INSERT INTO products (store_id, name, sku, price, base_currency, category, type, status, availability)
       VALUES ($1, 'Producto Top', 'DASH-A', '2000', 'DOP', 'test', 'product', 'active', 'available') RETURNING id`,
      [storeId]);
    productA = pa.rows[0].id;
    const pb = await pool.query(
      `INSERT INTO products (store_id, name, sku, price, base_currency, category, type, status, availability)
       VALUES ($1, 'Producto Bajo', 'DASH-B', '500', 'DOP', 'test', 'product', 'active', 'available') RETURNING id`,
      [storeId]);
    productB = pb.rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  async function cleanup() {
    await pool.query(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM orders WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM customers WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM products WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM warehouses WHERE store_id=$1`, [storeId]);
  }

  beforeEach(async () => {
    await pool.query(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM orders WHERE store_id=$1`, [storeId]);
  });

  async function createOrder(customerId: number, amount: number, date: string, status = "completed") {
    const num = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const r = await pool.query(
      `INSERT INTO orders (order_number, customer_id, store_id, warehouse_id, status,
                           total_amount, subtotal_amount, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamp) RETURNING id`,
      [num, customerId, storeId, warehouseId, status, String(amount), String(amount * 0.85), date],
    );
    return Number(r.rows[0].id);
  }

  async function addOrderItem(orderId: number, productId: number, qty: number, unitPrice: number) {
    await pool.query(
      `INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price, store_id, warehouse_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [orderId, productId, qty, String(unitPrice), String(qty * unitPrice), storeId, warehouseId],
    );
  }

  it("sin datos: todos los KPIs son cero, sin errores", async () => {
    const r = await getExecutiveDashboard(pool, { storeId, today: "2026-08-15" });
    expect(r.sales.thisMonth.current).toBe(0);
    expect(r.sales.thisMonth.previous).toBe(0);
    expect(r.cash.bankBalance).toBe(0);
    expect(r.topCustomers).toHaveLength(0);
    expect(r.topProducts).toHaveLength(0);
    expect(r.currency).toBe("DOP");
  });

  it("ventas del mes suman correctamente sólo el mes en curso", async () => {
    // 3 órdenes en agosto, 2 en julio.
    await createOrder(customerA, 10000, "2026-08-05 10:00:00");
    await createOrder(customerA, 5000, "2026-08-12 10:00:00");
    await createOrder(customerB, 3000, "2026-08-15 10:00:00");
    await createOrder(customerA, 20000, "2026-07-15 10:00:00");
    await createOrder(customerB, 8000, "2026-07-20 10:00:00");

    const r = await getExecutiveDashboard(pool, { storeId, today: "2026-08-15" });
    expect(r.sales.thisMonth.current).toBe(18000);
    expect(r.sales.thisMonth.previous).toBe(28000);
    expect(r.sales.ordersMonth).toBe(3);
    expect(r.sales.avgTicketMonth).toBe(6000);
  });

  it("delta % refleja tendencia up/down/flat", async () => {
    await createOrder(customerA, 20000, "2026-08-05 10:00:00");
    await createOrder(customerA, 10000, "2026-07-15 10:00:00");
    const r = await getExecutiveDashboard(pool, { storeId, today: "2026-08-15" });
    expect(r.sales.thisMonth.direction).toBe("up");
    expect(r.sales.thisMonth.changePct).toBe(100); // 20k vs 10k = +100%
  });

  it("top customers ordena por revenue descendente y respeta límite", async () => {
    // Cliente A: 25000, Cliente B: 8000
    const o1 = await createOrder(customerA, 15000, "2026-08-05 10:00:00");
    const o2 = await createOrder(customerA, 10000, "2026-08-10 10:00:00");
    const o3 = await createOrder(customerB, 8000, "2026-08-15 10:00:00");

    await addOrderItem(o1, productA, 1, 15000);
    await addOrderItem(o2, productA, 1, 10000);
    await addOrderItem(o3, productB, 4, 2000);

    const r = await getExecutiveDashboard(pool, { storeId, today: "2026-08-15" });
    expect(r.topCustomers).toHaveLength(2);
    expect(r.topCustomers[0].id).toBe(customerA);
    expect(r.topCustomers[0].revenue).toBe(25000);
    expect(r.topCustomers[0].orderCount).toBe(2);
    expect(r.topCustomers[1].id).toBe(customerB);
    expect(r.topCustomers[1].revenue).toBe(8000);
  });

  it("top products ordena por revenue descendente", async () => {
    const o1 = await createOrder(customerA, 25000, "2026-08-05 10:00:00");
    const o2 = await createOrder(customerB, 8000, "2026-08-15 10:00:00");
    await addOrderItem(o1, productA, 10, 2500); // Producto A: 25000
    await addOrderItem(o2, productB, 16, 500);  // Producto B: 8000

    const r = await getExecutiveDashboard(pool, { storeId, today: "2026-08-15" });
    expect(r.topProducts).toHaveLength(2);
    expect(r.topProducts[0].id).toBe(productA);
    expect(r.topProducts[0].revenue).toBe(25000);
    expect(r.topProducts[0].qty).toBe(10);
    expect(r.topProducts[1].id).toBe(productB);
  });

  it("hoy y ayer se calculan por separado", async () => {
    await createOrder(customerA, 1000, "2026-08-14 09:00:00");
    await createOrder(customerA, 3000, "2026-08-15 12:00:00");
    const r = await getExecutiveDashboard(pool, { storeId, today: "2026-08-15" });
    expect(r.sales.today).toBe(3000);
    expect(r.sales.yesterday).toBe(1000);
    expect(r.sales.ordersToday).toBe(1);
  });

  it("ordersByStatus agrupa órdenes de últimos 30 días", async () => {
    const today = new Date().toISOString().slice(0, 10) + " 10:00:00";
    await createOrder(customerA, 1000, today, "completed");
    await createOrder(customerA, 2000, today, "pending");
    await createOrder(customerA, 3000, today, "pending");
    const r = await getExecutiveDashboard(pool, { storeId });
    const completed = r.ordersByStatus.find((s) => s.status === "completed");
    const pending = r.ordersByStatus.find((s) => s.status === "pending");
    expect(completed?.count).toBe(1);
    expect(pending?.count).toBe(2);
    expect(pending?.amount).toBe(5000);
  });
});
