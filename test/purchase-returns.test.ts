import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import {
  createReturn, completeReturn, cancelReturn, getReturn, listReturns,
} from "../server/services/purchase-returns";

neonConfig.webSocketConstructor = ws;

describeIntegration("purchase returns", () => {
  let pool: Pool;
  const storeId = 999_744;
  let warehouseId: number;
  let productId: number;
  let supplierId: number;
  const userId = 1;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });

    await pool.query(`DELETE FROM purchase_return_lines WHERE return_id IN (SELECT id FROM purchase_returns WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM purchase_returns WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM purchase_return_sequences WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM warehouse_stock WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM warehouses WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM products WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM suppliers WHERE store_id=$1`, [storeId]);

    const w = await pool.query(
      `INSERT INTO warehouses (store_id, name, is_default, is_active) VALUES ($1, 'RetWH', false, true) RETURNING id`,
      [storeId],
    );
    warehouseId = w.rows[0].id;
    const p = await pool.query(
      `INSERT INTO products (store_id, name, sku, price, base_currency, category, type, status, availability)
       VALUES ($1, 'Producto R', 'PR-1', '80', 'DOP', 'test', 'product', 'active', 'available') RETURNING id`,
      [storeId],
    );
    productId = p.rows[0].id;
    const s = await pool.query(
      `INSERT INTO suppliers (store_id, name) VALUES ($1, 'Proveedor Test') RETURNING id`,
      [storeId],
    );
    supplierId = s.rows[0].id;

    await pool.query(
      `INSERT INTO warehouse_stock (warehouse_id, product_id, store_id, quantity) VALUES ($1, $2, $3, '20')`,
      [warehouseId, productId, storeId],
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM purchase_return_lines WHERE return_id IN (SELECT id FROM purchase_returns WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM purchase_returns WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM purchase_return_sequences WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM warehouse_stock WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM warehouses WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM products WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM suppliers WHERE store_id=$1`, [storeId]);
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM purchase_return_lines WHERE return_id IN (SELECT id FROM purchase_returns WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM purchase_returns WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM purchase_return_sequences WHERE store_id=$1`, [storeId]);
    await pool.query(`UPDATE warehouse_stock SET quantity='20', reserved_quantity='0' WHERE warehouse_id=$1 AND product_id=$2`, [warehouseId, productId]);
  });

  it("crea una devolución con secuencia correlativa", async () => {
    const r1 = await createReturn(pool, {
      storeId, supplierId, supplierName: "Proveedor Test", createdBy: userId,
      lines: [{ productId, productName: "Producto R", quantity: 5, unitCost: 80, warehouseId }],
    });
    const r2 = await createReturn(pool, {
      storeId, supplierId, supplierName: "Proveedor Test", createdBy: userId,
      lines: [{ productId, productName: "Producto R", quantity: 2, unitCost: 80, warehouseId }],
    });
    expect(r1.returnNumber).toBe("DEV-000001");
    expect(r2.returnNumber).toBe("DEV-000002");
  });

  it("completar descuenta del inventario", async () => {
    const r = await createReturn(pool, {
      storeId, supplierId, supplierName: "Proveedor Test", createdBy: userId,
      lines: [{ productId, productName: "Producto R", quantity: 5, unitCost: 80, warehouseId }],
    });
    const done = await completeReturn(pool, r.id, userId);
    expect(done.status).toBe("completed");
    const s = await pool.query(`SELECT quantity::text AS q FROM warehouse_stock WHERE warehouse_id=$1 AND product_id=$2`, [warehouseId, productId]);
    expect(Number(s.rows[0].q)).toBe(15);
  });

  it("no puede completar si no hay suficiente stock disponible", async () => {
    const r = await createReturn(pool, {
      storeId, supplierId, supplierName: "Proveedor Test", createdBy: userId,
      lines: [{ productId, productName: "Producto R", quantity: 50, unitCost: 80, warehouseId }],
    });
    await expect(completeReturn(pool, r.id, userId)).rejects.toThrow(/suficiente stock/);
    const ret = await getReturn(pool, r.id);
    expect(ret.status).toBe("draft");
  });

  it("cancelar cierra la devolución sin tocar stock", async () => {
    const r = await createReturn(pool, {
      storeId, supplierId, supplierName: "Proveedor Test", createdBy: userId,
      lines: [{ productId, productName: "Producto R", quantity: 3, unitCost: 80, warehouseId }],
    });
    const cancelled = await cancelReturn(pool, r.id);
    expect(cancelled.status).toBe("cancelled");
    const s = await pool.query(`SELECT quantity::text AS q FROM warehouse_stock WHERE warehouse_id=$1 AND product_id=$2`, [warehouseId, productId]);
    expect(Number(s.rows[0].q)).toBe(20);
  });

  it("no puede cancelar una devolución ya completada", async () => {
    const r = await createReturn(pool, {
      storeId, supplierId, supplierName: "Proveedor Test", createdBy: userId,
      lines: [{ productId, productName: "Producto R", quantity: 2, unitCost: 80, warehouseId }],
    });
    await completeReturn(pool, r.id, userId);
    await expect(cancelReturn(pool, r.id)).rejects.toThrow(/completada/);
  });

  it("lista devoluciones filtradas por estado", async () => {
    const a = await createReturn(pool, {
      storeId, supplierId, supplierName: "P", createdBy: userId,
      lines: [{ productId, productName: "P", quantity: 1, unitCost: 80, warehouseId }],
    });
    const b = await createReturn(pool, {
      storeId, supplierId, supplierName: "P", createdBy: userId,
      lines: [{ productId, productName: "P", quantity: 1, unitCost: 80, warehouseId }],
    });
    await completeReturn(pool, a.id, userId);
    void b;

    const completed = await listReturns(pool, storeId, "completed");
    expect(completed.rows.length).toBe(1);
    const drafts = await listReturns(pool, storeId, "draft");
    expect(drafts.rows.length).toBe(1);
  });
});
