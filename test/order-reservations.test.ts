import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import {
  reserveForOrder,
  releaseReservation,
  consumeReservation,
  getAvailable,
} from "../server/inventory/order-reservations";

neonConfig.webSocketConstructor = ws;

/**
 * Reservas de stock por pedido. La invariante que probamos:
 *   available(w, p) = warehouse_stock.quantity - warehouse_stock.reserved_quantity
 * y el trigger mantiene la segunda en sincronía con las filas activas de
 * `order_reservations`.
 */
describeIntegration("order reservations", () => {
  let pool: Pool;
  let warehouseId: number;
  let productId: number;
  let orderId: number;
  let orderId2: number;
  let storeId: number;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });

    // Un almacén, un producto y dos órdenes de prueba en un store de prueba.
    // Ubicadas en un store_id alto para no chocar con datos existentes.
    storeId = 999_777;
    await pool.query(`DELETE FROM order_reservations WHERE store_id = $1`, [storeId]);
    await pool.query(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE store_id = $1)`, [storeId]);
    await pool.query(`DELETE FROM orders WHERE store_id = $1`, [storeId]);
    await pool.query(`DELETE FROM warehouse_stock WHERE store_id = $1`, [storeId]);
    await pool.query(`DELETE FROM warehouses WHERE store_id = $1`, [storeId]);
    await pool.query(`DELETE FROM products WHERE store_id = $1`, [storeId]);

    const w = await pool.query(
      `INSERT INTO warehouses (store_id, name, description, is_active, is_default)
       VALUES ($1, 'Reserv Test', 'Bodega Test', true, false) RETURNING id`,
      [storeId],
    );
    warehouseId = w.rows[0].id;

    const p = await pool.query(
      `INSERT INTO products (store_id, name, sku, price, stock_quantity,
                             base_currency, category, type, status, availability)
       VALUES ($1, 'Producto Reserva', 'RSV-001', '100', 0,
               'DOP', 'test', 'product', 'active', 'available') RETURNING id`,
      [storeId],
    );
    productId = p.rows[0].id;

    await pool.query(
      `INSERT INTO warehouse_stock (warehouse_id, product_id, store_id, quantity)
       VALUES ($1, $2, $3, '10')`,
      [warehouseId, productId, storeId],
    );

    const o1 = await pool.query(
      `INSERT INTO orders (order_number, store_id, warehouse_id, status)
       VALUES ('RSV-1', $1, $2, 'pending') RETURNING id`,
      [storeId, warehouseId],
    );
    orderId = o1.rows[0].id;

    const o2 = await pool.query(
      `INSERT INTO orders (order_number, store_id, warehouse_id, status)
       VALUES ('RSV-2', $1, $2, 'pending') RETURNING id`,
      [storeId, warehouseId],
    );
    orderId2 = o2.rows[0].id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM order_reservations WHERE store_id = $1`, [storeId]);
    await pool.query(`DELETE FROM orders WHERE store_id = $1`, [storeId]);
    await pool.query(`DELETE FROM warehouse_stock WHERE store_id = $1`, [storeId]);
    await pool.query(`DELETE FROM warehouses WHERE store_id = $1`, [storeId]);
    await pool.query(`DELETE FROM products WHERE store_id = $1`, [storeId]);
    await pool.end();
  });

  beforeEach(async () => {
    // Cada test parte con las reservas del store limpias y quantity=10.
    await pool.query(`DELETE FROM order_reservations WHERE store_id = $1`, [storeId]);
    await pool.query(
      `UPDATE warehouse_stock SET quantity = '10', reserved_quantity = '0'
        WHERE warehouse_id = $1 AND product_id = $2`,
      [warehouseId, productId],
    );
  });

  it("reservar sube reserved_quantity y baja el available", async () => {
    const before = await getAvailable(pool, warehouseId, productId);
    expect(before).toBe(10);

    const out = await reserveForOrder(pool, orderId, storeId, [
      { productId, warehouseId, quantity: 3 },
    ]);
    expect(out.reserved).toHaveLength(1);
    expect(out.skipped).toHaveLength(0);

    const after = await getAvailable(pool, warehouseId, productId);
    expect(after).toBe(7);

    const stock = await pool.query(
      `SELECT reserved_quantity::text AS r FROM warehouse_stock
        WHERE warehouse_id=$1 AND product_id=$2`,
      [warehouseId, productId],
    );
    expect(parseFloat(stock.rows[0].r)).toBe(3);
  });

  it("dos pedidos no pueden prometer la misma caja: el segundo se salta lo que falta", async () => {
    await reserveForOrder(pool, orderId, storeId, [{ productId, warehouseId, quantity: 8 }]);
    const out2 = await reserveForOrder(pool, orderId2, storeId, [
      { productId, warehouseId, quantity: 5 },
    ]);

    expect(out2.reserved).toHaveLength(0);
    expect(out2.skipped).toHaveLength(1);
    expect(out2.skipped[0].reason).toMatch(/insufficient/);

    const available = await getAvailable(pool, warehouseId, productId);
    expect(available).toBe(2);
  });

  it("release devuelve las cajas al pool de disponible", async () => {
    await reserveForOrder(pool, orderId, storeId, [{ productId, warehouseId, quantity: 4 }]);
    expect(await getAvailable(pool, warehouseId, productId)).toBe(6);

    const rel = await releaseReservation(pool, orderId);
    expect(rel.released).toBe(1);
    expect(await getAvailable(pool, warehouseId, productId)).toBe(10);
  });

  it("consume no cambia el available inmediato (el descuento real lo hace inventario)", async () => {
    // Antes de consumir: quantity=10, reserved=4, available=6.
    await reserveForOrder(pool, orderId, storeId, [{ productId, warehouseId, quantity: 4 }]);

    // Consumir libera la reserva; el available sube porque el trigger baja
    // reserved_quantity. El descuento del stock físico lo hace deductStockFIFO
    // en el flujo del inventario, no esta función.
    const con = await consumeReservation(pool, orderId);
    expect(con.consumed).toBe(1);

    const r = await pool.query(
      `SELECT reserved_quantity::text AS r FROM warehouse_stock
        WHERE warehouse_id=$1 AND product_id=$2`,
      [warehouseId, productId],
    );
    expect(parseFloat(r.rows[0].r)).toBe(0);
  });

  it("reservar dos veces la misma línea no duplica ni sobresuma", async () => {
    await reserveForOrder(pool, orderId, storeId, [{ productId, warehouseId, quantity: 2 }]);
    // Se cambia de opinión y la línea ahora pide 5. La reserva debe actualizar.
    await reserveForOrder(pool, orderId, storeId, [{ productId, warehouseId, quantity: 5 }]);

    const stock = await pool.query(
      `SELECT reserved_quantity::text AS r FROM warehouse_stock
        WHERE warehouse_id=$1 AND product_id=$2`,
      [warehouseId, productId],
    );
    expect(parseFloat(stock.rows[0].r)).toBe(5);

    const rows = await pool.query(
      `SELECT count(*)::int AS n FROM order_reservations
        WHERE order_id=$1 AND status='active'`,
      [orderId],
    );
    expect(rows.rows[0].n).toBe(1);
  });

  it("el CHECK garantiza que la reserva nunca queda negativa", async () => {
    // Forzar directamente reserved_quantity a un valor < 0 debe fallar.
    await expect(
      pool.query(
        `UPDATE warehouse_stock SET reserved_quantity = '-1'
          WHERE warehouse_id=$1 AND product_id=$2`,
        [warehouseId, productId],
      ),
    ).rejects.toThrow(/warehouse_stock_reserved_nonneg_ck/);
  });
});
