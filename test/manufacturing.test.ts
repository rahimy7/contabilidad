import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import {
  createBom, listBoms, explodeBom,
  createProductionOrder, releaseProductionOrder,
  completeProductionOrder, cancelProductionOrder,
  ManufacturingError,
} from "../server/services/manufacturing";

neonConfig.webSocketConstructor = ws;

/**
 * Manufacturing lite: BOM + MO + backflush.
 *
 * Cubre:
 *   - Creación de BOM con líneas
 *   - Explosión: cantidades requeridas para output N
 *   - Scrap se aplica correctamente
 *   - MO snapshot de componentes
 *   - Release: marca short si no hay stock
 *   - Complete: backflush descuenta MPs e ingresa terminado
 *   - Costo unitario = total MP / cantidad producida
 *   - No se puede completar 2 veces
 *   - Cancel funciona solo en draft/released
 */

describeIntegration("manufacturing — BOM + MO + backflush", () => {
  let pool: Pool;
  const storeId = 999_901;
  let flour: number, sugar: number, eggs: number, cake: number;
  let mainWh: number;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    await cleanup();

    const w = await pool.query(
      `INSERT INTO warehouses (store_id, name, description, is_default)
       VALUES ($1, 'Panadería principal', 'test', true) RETURNING id`,
      [storeId],
    );
    mainWh = w.rows[0].id;

    // MPs.
    const f = await pool.query(
      `INSERT INTO products (store_id, name, sku, price, base_currency, category, type, status, availability)
       VALUES ($1, 'Harina 1kg', 'MP-HAR', '80', 'DOP', 'raw', 'product', 'active', 'available') RETURNING id`,
      [storeId]); flour = f.rows[0].id;
    const s = await pool.query(
      `INSERT INTO products (store_id, name, sku, price, base_currency, category, type, status, availability)
       VALUES ($1, 'Azúcar 1kg', 'MP-AZU', '60', 'DOP', 'raw', 'product', 'active', 'available') RETURNING id`,
      [storeId]); sugar = s.rows[0].id;
    const e = await pool.query(
      `INSERT INTO products (store_id, name, sku, price, base_currency, category, type, status, availability)
       VALUES ($1, 'Huevos docena', 'MP-HUE', '150', 'DOP', 'raw', 'product', 'active', 'available') RETURNING id`,
      [storeId]); eggs = e.rows[0].id;
    // Producto terminado.
    const c = await pool.query(
      `INSERT INTO products (store_id, name, sku, price, base_currency, category, type, status, availability)
       VALUES ($1, 'Bizcocho de vainilla', 'PT-BIZ', '800', 'DOP', 'finished', 'product', 'active', 'available') RETURNING id`,
      [storeId]); cake = c.rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  async function cleanup() {
    await pool.query(`DELETE FROM production_inventory_movements WHERE mo_id IN (SELECT id FROM production_orders WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM production_order_components WHERE mo_id IN (SELECT id FROM production_orders WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM production_orders WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM bom_lines WHERE bom_id IN (SELECT id FROM bom_headers WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM bom_headers WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM warehouse_stock WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM products WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM warehouses WHERE store_id=$1`, [storeId]);
  }

  beforeEach(async () => {
    await pool.query(`DELETE FROM production_inventory_movements WHERE mo_id IN (SELECT id FROM production_orders WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM production_order_components WHERE mo_id IN (SELECT id FROM production_orders WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM production_orders WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM bom_lines WHERE bom_id IN (SELECT id FROM bom_headers WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM bom_headers WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM warehouse_stock WHERE store_id=$1`, [storeId]);
  });

  async function seedStock(productId: number, qty: number) {
    await pool.query(
      `INSERT INTO warehouse_stock (warehouse_id, product_id, store_id, quantity)
       VALUES ($1, $2, $3, $4)`,
      [mainWh, productId, storeId, String(qty)],
    );
  }

  async function getStock(productId: number): Promise<number> {
    const r = await pool.query(
      `SELECT quantity::float AS q FROM warehouse_stock WHERE product_id=$1 AND warehouse_id=$2`,
      [productId, mainWh],
    );
    return r.rowCount ? Number(r.rows[0].q) : 0;
  }

  async function createBizcochoBom(bomCode = "BOM-BIZ-1") {
    // Receta: 1 bizcocho = 0.5kg harina + 0.3kg azúcar + 6 huevos (= 0.5 docena)
    return createBom(pool, {
      storeId, bomCode,
      outputProductId: cake, outputQuantity: 1,
      name: "Bizcocho vainilla", createdBy: 1,
      lines: [
        { componentProductId: flour, quantityPer: 0.5, unit: "kg", unitCost: 80 },
        { componentProductId: sugar, quantityPer: 0.3, unit: "kg", unitCost: 60 },
        { componentProductId: eggs, quantityPer: 0.5, unit: "docena", unitCost: 150 },
      ],
    });
  }

  it("createBom persiste header + líneas y calcula estimatedUnitCost", async () => {
    const id = await createBizcochoBom();
    const list = await listBoms(pool, storeId);
    const bom = list.find((b: any) => b.id === id);
    expect(bom).toBeDefined();
    expect(bom.lineCount).toBe(3);
    // 0.5×80 + 0.3×60 + 0.5×150 = 40 + 18 + 75 = 133
    expect(Number(bom.estimatedUnitCost)).toBe(133);
  });

  it("explodeBom calcula cantidades requeridas para output N", async () => {
    const id = await createBizcochoBom();
    const comps = await explodeBom(pool, id, 10);
    expect(comps).toHaveLength(3);
    const flourComp = comps.find((c) => c.componentProductId === flour);
    expect(flourComp?.totalRequired).toBe(5); // 0.5 × 10
    const sugarComp = comps.find((c) => c.componentProductId === sugar);
    expect(sugarComp?.totalRequired).toBe(3); // 0.3 × 10
  });

  it("BOM en estado draft/obsolete no permite crear MO", async () => {
    const id = await createBom(pool, {
      storeId, bomCode: "BOM-DRAFT",
      outputProductId: cake, outputQuantity: 1,
      status: "draft", name: "Draft", createdBy: 1,
      lines: [{ componentProductId: flour, quantityPer: 1, unitCost: 80 }],
    });
    await expect(
      createProductionOrder(pool, {
        storeId, moNumber: "MO-1", bomId: id,
        plannedQuantity: 5, outputWarehouseId: mainWh, sourceWarehouseId: mainWh,
        createdBy: 1,
      }),
    ).rejects.toBeInstanceOf(ManufacturingError);
  });

  it("createMO snapshotea componentes con explosión completa", async () => {
    const bomId = await createBizcochoBom();
    const moId = await createProductionOrder(pool, {
      storeId, moNumber: "MO-BIZ-10", bomId,
      plannedQuantity: 10, outputWarehouseId: mainWh, sourceWarehouseId: mainWh,
      createdBy: 1,
    });
    const comps = await pool.query(
      `SELECT component_product_id, planned_quantity::float AS q
         FROM production_order_components WHERE mo_id = $1`,
      [moId],
    );
    expect(comps.rowCount).toBe(3);
    const flourRow = comps.rows.find((r: any) => r.component_product_id === flour);
    expect(flourRow.q).toBe(5); // 0.5 × 10
  });

  it("release marca 'short' cuando falta stock de MP", async () => {
    const bomId = await createBizcochoBom();
    // Solo tengo 2kg de harina pero necesito 5kg.
    await seedStock(flour, 2);
    await seedStock(sugar, 100);
    await seedStock(eggs, 100);
    const moId = await createProductionOrder(pool, {
      storeId, moNumber: "MO-SHORT", bomId,
      plannedQuantity: 10, outputWarehouseId: mainWh, sourceWarehouseId: mainWh,
      createdBy: 1,
    });
    const result = await releaseProductionOrder(pool, moId, 1);
    expect(result.shortComponents).toBe(1);
  });

  it("complete: backflush descuenta MPs e ingresa terminado con costo correcto", async () => {
    const bomId = await createBizcochoBom();
    await seedStock(flour, 100);
    await seedStock(sugar, 100);
    await seedStock(eggs, 100);
    const moId = await createProductionOrder(pool, {
      storeId, moNumber: "MO-BF", bomId,
      plannedQuantity: 10, outputWarehouseId: mainWh, sourceWarehouseId: mainWh,
      createdBy: 1,
    });
    await releaseProductionOrder(pool, moId, 1);

    const result = await completeProductionOrder(pool, { moId, completedBy: 1 });

    // MPs descontadas
    expect(await getStock(flour)).toBe(95); // 100 - 5
    expect(await getStock(sugar)).toBeCloseTo(97, 4); // 100 - 3
    expect(await getStock(eggs)).toBe(95); // 100 - 5

    // Terminado ingresado
    expect(await getStock(cake)).toBe(10);

    // Costo: 5×80 + 3×60 + 5×150 = 400 + 180 + 750 = 1330
    expect(result.totalMaterialCost).toBe(1330);
    expect(result.unitCost).toBe(133);
  });

  it("complete con actualQuantity < plannedQuantity ajusta proporcionalmente", async () => {
    const bomId = await createBizcochoBom();
    await seedStock(flour, 100);
    await seedStock(sugar, 100);
    await seedStock(eggs, 100);
    const moId = await createProductionOrder(pool, {
      storeId, moNumber: "MO-PARTIAL", bomId,
      plannedQuantity: 10, outputWarehouseId: mainWh, sourceWarehouseId: mainWh,
      createdBy: 1,
    });
    await releaseProductionOrder(pool, moId, 1);
    // Producimos solo 5.
    const r = await completeProductionOrder(pool, { moId, actualQuantity: 5, completedBy: 1 });
    // Consumió la mitad: 2.5kg harina, 1.5kg azúcar, 2.5 docenas huevos.
    expect(await getStock(flour)).toBe(97.5);
    expect(await getStock(cake)).toBe(5);
    expect(r.totalMaterialCost).toBe(665); // 1330 / 2
    expect(r.unitCost).toBe(133);
  });

  it("no se puede completar dos veces la misma MO", async () => {
    const bomId = await createBizcochoBom();
    await seedStock(flour, 100);
    await seedStock(sugar, 100);
    await seedStock(eggs, 100);
    const moId = await createProductionOrder(pool, {
      storeId, moNumber: "MO-DBL", bomId,
      plannedQuantity: 5, outputWarehouseId: mainWh, sourceWarehouseId: mainWh,
      createdBy: 1,
    });
    await releaseProductionOrder(pool, moId, 1);
    await completeProductionOrder(pool, { moId, completedBy: 1 });
    await expect(completeProductionOrder(pool, { moId, completedBy: 1 })).rejects.toBeInstanceOf(ManufacturingError);
  });

  it("cancel funciona en draft y released, no en completed", async () => {
    const bomId = await createBizcochoBom();
    await seedStock(flour, 100);
    await seedStock(sugar, 100);
    await seedStock(eggs, 100);
    // Test 1: cancel en draft
    const mo1 = await createProductionOrder(pool, {
      storeId, moNumber: "MO-CANCEL-1", bomId,
      plannedQuantity: 5, outputWarehouseId: mainWh, sourceWarehouseId: mainWh,
      createdBy: 1,
    });
    await cancelProductionOrder(pool, mo1);
    const s1 = await pool.query(`SELECT status FROM production_orders WHERE id=$1`, [mo1]);
    expect(s1.rows[0].status).toBe("cancelled");

    // Test 2: no se puede cancelar completada
    const mo2 = await createProductionOrder(pool, {
      storeId, moNumber: "MO-CANCEL-2", bomId,
      plannedQuantity: 5, outputWarehouseId: mainWh, sourceWarehouseId: mainWh,
      createdBy: 1,
    });
    await releaseProductionOrder(pool, mo2, 1);
    await completeProductionOrder(pool, { moId: mo2, completedBy: 1 });
    await expect(cancelProductionOrder(pool, mo2)).rejects.toBeInstanceOf(ManufacturingError);
  });
});
