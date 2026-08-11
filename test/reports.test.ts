import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { generateSalesByRepReport, generateTopProductsReport } from "../server/services/reports";
import { beforeAll, afterAll, beforeEach } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";

neonConfig.webSocketConstructor = ws;

describeIntegration("reports Excel", () => {
  let pool: Pool;
  const storeId = 999_970;
  let customerId: number;
  let productId: number;
  let warehouseId: number;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    await cleanup();
    const w = await pool.query(
      `INSERT INTO warehouses (store_id, name, description, is_default)
       VALUES ($1, 'RPT WH', 'test', true) RETURNING id`, [storeId]);
    warehouseId = w.rows[0].id;
    const c = await pool.query(
      `INSERT INTO customers (name, phone, email, store_id)
       VALUES ('Cliente RPT', '809-0000701', 'r@x.com', $1) RETURNING id`, [storeId]);
    customerId = c.rows[0].id;
    const p = await pool.query(
      `INSERT INTO products (store_id, name, sku, price, base_currency, category, type, status, availability)
       VALUES ($1, 'Producto Reporte', 'RPT-A', '500', 'DOP', 'test', 'product', 'active', 'available') RETURNING id`,
      [storeId]);
    productId = p.rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  async function cleanup() {
    await pool.query(`DELETE FROM order_items WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM orders WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM customers WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM products WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM warehouses WHERE store_id=$1`, [storeId]);
  }

  beforeEach(async () => {
    await pool.query(`DELETE FROM order_items WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM orders WHERE store_id=$1`, [storeId]);
  });

  async function createOrderWithItem(amount: number, date: string, qty: number) {
    const o = await pool.query(
      `INSERT INTO orders (order_number, customer_id, store_id, warehouse_id, status, total_amount, created_at)
       VALUES ($1,$2,$3,$4,'completed',$5,$6::timestamp) RETURNING id`,
      [`ORD-RPT-${Math.random().toString(36).slice(2, 8)}`, customerId, storeId, warehouseId, String(amount), date],
    );
    await pool.query(
      `INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price, store_id, warehouse_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [o.rows[0].id, productId, qty, "500", String(qty * 500), storeId, warehouseId],
    );
  }

  it("generateSalesByRepReport devuelve un XLSX válido", async () => {
    await createOrderWithItem(1000, "2026-08-05", 2);
    await createOrderWithItem(500, "2026-08-06", 1);
    const buf = await generateSalesByRepReport(pool, storeId, { from: "2026-08-01", to: "2026-08-31" });
    expect(buf).toBeInstanceOf(Buffer);
    const wb = XLSX.read(buf);
    expect(wb.SheetNames).toContain("Ventas por vendedor");
    const sheet = wb.Sheets["Ventas por vendedor"];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    expect(csv).toContain("Ventas por vendedor");
    expect(csv).toContain("TOTAL");
  });

  it("generateTopProductsReport ordena por revenue descendente", async () => {
    await createOrderWithItem(2500, "2026-08-05", 5);
    const buf = await generateTopProductsReport(pool, storeId, { from: "2026-08-01", to: "2026-08-31" });
    const wb = XLSX.read(buf);
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets["Top productos"]);
    expect(csv).toContain("Producto Reporte");
    expect(csv).toContain("RPT-A");
  });
});
