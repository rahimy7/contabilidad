import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import {
  createQuote, getQuote, updateStatus, convertToOrder, expireOverdue, listQuotes,
} from "../server/services/sales-quotes";

neonConfig.webSocketConstructor = ws;

describeIntegration("sales quotes", () => {
  let pool: Pool;
  const storeId = 999_755;
  let warehouseId: number;
  let productId: number;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });

    await pool.query(`DELETE FROM sales_quote_lines WHERE quote_id IN (SELECT id FROM sales_quotes WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM sales_quotes WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM sales_quote_sequences WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM orders WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM warehouse_stock WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM warehouses WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM products WHERE store_id=$1`, [storeId]);

    const w = await pool.query(
      `INSERT INTO warehouses (store_id, name, is_default, is_active) VALUES ($1, 'QuoteWH', false, true) RETURNING id`,
      [storeId],
    );
    warehouseId = w.rows[0].id;
    const p = await pool.query(
      `INSERT INTO products (store_id, name, sku, price, base_currency, category, type, status, availability)
       VALUES ($1, 'Producto Q', 'PQ-1', '150', 'DOP', 'test', 'product', 'active', 'available') RETURNING id`,
      [storeId],
    );
    productId = p.rows[0].id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM sales_quote_lines WHERE quote_id IN (SELECT id FROM sales_quotes WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM sales_quotes WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM sales_quote_sequences WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM orders WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM warehouses WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM products WHERE store_id=$1`, [storeId]);
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM sales_quote_lines WHERE quote_id IN (SELECT id FROM sales_quotes WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM sales_quotes WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM sales_quote_sequences WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM orders WHERE store_id=$1`, [storeId]);
  });

  it("crea una cotización con números correlativos", async () => {
    const q1 = await createQuote(pool, {
      storeId, warehouseId,
      customerName: "Test Client",
      lines: [{ productId, productName: "Producto Q", quantity: 2, unitPrice: 150 }],
    });
    const q2 = await createQuote(pool, {
      storeId, warehouseId,
      customerName: "Test Client 2",
      lines: [{ productId, productName: "Producto Q", quantity: 1, unitPrice: 150 }],
    });
    expect(q1.quoteNumber).toBe("COT-000001");
    expect(q2.quoteNumber).toBe("COT-000002");
  });

  it("calcula totales considerando descuento por línea", async () => {
    const q = await createQuote(pool, {
      storeId, warehouseId,
      customerName: "Test Client",
      lines: [
        { productId, productName: "P1", quantity: 2, unitPrice: 100, discountPercent: 10 },
        { productId, productName: "P2", quantity: 1, unitPrice: 50 },
      ],
    });
    // Subtotal = 200 + 50 = 250; Descuento = 20; Total = 230.
    expect(Number(q.subtotal)).toBe(250);
    expect(Number(q.discountAmount)).toBe(20);
    expect(Number(q.totalAmount)).toBe(230);
  });

  it("convertir en pedido crea order y marca como converted", async () => {
    const q = await createQuote(pool, {
      storeId, warehouseId,
      customerName: "Test",
      lines: [{ productId, productName: "Producto Q", quantity: 3, unitPrice: 100 }],
    });
    const { orderId, quote } = await convertToOrder(pool, q.id);
    expect(quote.status).toBe("converted");
    expect(quote.convertedTo).toBe("order");
    expect(quote.convertedDocumentId).toBe(orderId);
    const items = await pool.query(`SELECT quantity, unit_price::text FROM order_items WHERE order_id = $1`, [orderId]);
    expect(items.rowCount).toBe(1);
    expect(items.rows[0].quantity).toBe(3);
  });

  it("no permite convertir una cotización rechazada", async () => {
    const q = await createQuote(pool, {
      storeId, warehouseId,
      customerName: "Test",
      lines: [{ productId, productName: "Producto Q", quantity: 1, unitPrice: 100 }],
    });
    await updateStatus(pool, q.id, "rejected");
    await expect(convertToOrder(pool, q.id)).rejects.toThrow(/rejected/);
  });

  it("marca como expiradas las que ya vencieron", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await createQuote(pool, {
      storeId, warehouseId,
      customerName: "Test", validUntil: yesterday.toISOString().slice(0, 10),
      lines: [{ productId, productName: "Producto Q", quantity: 1, unitPrice: 100 }],
    });
    const { expired } = await expireOverdue(pool, storeId);
    expect(expired).toBe(1);
    const list = await listQuotes(pool, { storeId, status: "expired" });
    expect(list.total).toBe(1);
  });

  it("una segunda conversión devuelve la existente sin duplicar order", async () => {
    const q = await createQuote(pool, {
      storeId, warehouseId,
      customerName: "Test",
      lines: [{ productId, productName: "Producto Q", quantity: 1, unitPrice: 100 }],
    });
    const first = await convertToOrder(pool, q.id);
    const second = await convertToOrder(pool, q.id);
    expect(first.orderId).toBe(second.orderId);
  });
});
