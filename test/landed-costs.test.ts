import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import {
  createVoucher, addCostLine, addTarget, applyVoucher, getVoucher, LandedCostError,
} from "../server/services/landed-costs";

neonConfig.webSocketConstructor = ws;

/**
 * Landed costs — prorateo de gastos de importación sobre POs recibidas.
 *
 * Escenarios cubiertos:
 *   - Prorateo por valor (base más común)
 *   - Prorateo por cantidad
 *   - Prorateo por peso (con y sin peso declarado)
 *   - Prorateo mixto (varias líneas de gasto con distintos métodos)
 *   - No se puede aplicar dos veces
 *   - El unit_cost de purchase_order_items se actualiza correctamente
 */

describeIntegration("landed costs — prorateo", () => {
  let pool: Pool;
  const storeId = 999_701;
  let productA: number, productB: number;
  let warehouseId: number;
  let poId: number;
  let itemAId: number, itemBId: number;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    await cleanup();

    // Warehouse requerido por PO.
    const w = await pool.query(
      `INSERT INTO warehouses (store_id, name, description, is_default)
       VALUES ($1, 'LC Test WH', 'test', false) RETURNING id`,
      [storeId],
    );
    warehouseId = w.rows[0].id;

    // Dos productos.
    const a = await pool.query(
      `INSERT INTO products (store_id, name, sku, price, base_currency, category, type, status, availability)
       VALUES ($1, 'Producto A', 'LC-A', '1500', 'DOP', 'test', 'product', 'active', 'available') RETURNING id`,
      [storeId],
    );
    productA = a.rows[0].id;
    const b = await pool.query(
      `INSERT INTO products (store_id, name, sku, price, base_currency, category, type, status, availability)
       VALUES ($1, 'Producto B', 'LC-B', '3000', 'DOP', 'test', 'product', 'active', 'available') RETURNING id`,
      [storeId],
    );
    productB = b.rows[0].id;
  });

  afterAll(async () => {
    await cleanup();
    await pool.end();
  });

  async function cleanup() {
    await pool.query(
      `DELETE FROM landed_cost_item_allocations
        WHERE voucher_id IN (SELECT id FROM landed_cost_vouchers WHERE store_id=$1)`,
      [storeId],
    );
    await pool.query(
      `DELETE FROM landed_cost_lines
        WHERE voucher_id IN (SELECT id FROM landed_cost_vouchers WHERE store_id=$1)`,
      [storeId],
    );
    await pool.query(
      `DELETE FROM landed_cost_targets
        WHERE voucher_id IN (SELECT id FROM landed_cost_vouchers WHERE store_id=$1)`,
      [storeId],
    );
    await pool.query(`DELETE FROM landed_cost_vouchers WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM purchase_order_items WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM purchase_orders WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM products WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM warehouses WHERE store_id=$1`, [storeId]);
  }

  beforeEach(async () => {
    await pool.query(
      `DELETE FROM landed_cost_item_allocations
        WHERE voucher_id IN (SELECT id FROM landed_cost_vouchers WHERE store_id=$1)`,
      [storeId],
    );
    await pool.query(
      `DELETE FROM landed_cost_lines
        WHERE voucher_id IN (SELECT id FROM landed_cost_vouchers WHERE store_id=$1)`,
      [storeId],
    );
    await pool.query(
      `DELETE FROM landed_cost_targets
        WHERE voucher_id IN (SELECT id FROM landed_cost_vouchers WHERE store_id=$1)`,
      [storeId],
    );
    await pool.query(`DELETE FROM landed_cost_vouchers WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM purchase_order_items WHERE purchase_order_id=$1`, [poId ?? 0]);
    if (poId) await pool.query(`DELETE FROM purchase_orders WHERE id=$1`, [poId]);

    // Recrear una PO con dos ítems.
    const po = await pool.query(
      `INSERT INTO purchase_orders
         (store_id, purchase_number, order_date, status, subtotal, total_amount, created_by, warehouse_id)
       VALUES ($1, 'PO-LC-1', now(), 'received', '20000', '20000', 1, $2) RETURNING id`,
      [storeId, warehouseId],
    );
    poId = po.rows[0].id;
    // Producto A: 10 unidades × 500 = 5000
    const ia = await pool.query(
      `INSERT INTO purchase_order_items
         (purchase_order_id, store_id, product_id, product_name, quantity, quantity_received,
          unit_cost, total_cost, warehouse_id)
       VALUES ($1,$2,$3,'Producto A','10','10','500','5000',$4) RETURNING id`,
      [poId, storeId, productA, warehouseId],
    );
    itemAId = ia.rows[0].id;
    // Producto B: 5 unidades × 3000 = 15000
    const ib = await pool.query(
      `INSERT INTO purchase_order_items
         (purchase_order_id, store_id, product_id, product_name, quantity, quantity_received,
          unit_cost, total_cost, warehouse_id)
       VALUES ($1,$2,$3,'Producto B','5','5','3000','15000',$4) RETURNING id`,
      [poId, storeId, productB, warehouseId],
    );
    itemBId = ib.rows[0].id;
  });

  it("prorateo POR VALOR: el ítem más costoso recibe más peso", async () => {
    const vid = await createVoucher(pool, {
      storeId, voucherCode: "LC-VAL-1",
      description: "Contenedor prueba valor",
      defaultAllocationMethod: "by_value",
      createdBy: 1,
    });
    await addCostLine(pool, vid, { costType: "freight_ocean", amount: 2000 });
    await addTarget(pool, vid, { purchaseOrderId: poId });
    const r = await applyVoucher(pool, vid, 1);

    expect(r.totalCosts).toBe(2000);
    expect(r.totalAllocated).toBeCloseTo(2000, 2);

    // Total valor: 20000 (5000 A + 15000 B)
    // A recibe: 2000 × 5000/20000 = 500 → +50/unidad (500/10)
    // B recibe: 2000 × 15000/20000 = 1500 → +300/unidad (1500/5)
    const items = await pool.query(
      `SELECT id, unit_cost::float AS cost FROM purchase_order_items WHERE purchase_order_id=$1 ORDER BY id`,
      [poId],
    );
    const a = items.rows.find((x: any) => x.id === itemAId);
    const b = items.rows.find((x: any) => x.id === itemBId);
    expect(a.cost).toBeCloseTo(550, 2);
    expect(b.cost).toBeCloseTo(3300, 2);
  });

  it("prorateo POR CANTIDAD: cada unidad recibe el mismo costo extra", async () => {
    const vid = await createVoucher(pool, {
      storeId, voucherCode: "LC-QTY-1",
      defaultAllocationMethod: "by_quantity",
      createdBy: 1,
    });
    // 1500 sobre 15 unidades = 100 por unidad
    await addCostLine(pool, vid, { costType: "clearing_agent", amount: 1500 });
    await addTarget(pool, vid, { purchaseOrderId: poId });
    await applyVoucher(pool, vid, 1);

    const items = await pool.query(
      `SELECT id, unit_cost::float AS cost FROM purchase_order_items WHERE purchase_order_id=$1 ORDER BY id`,
      [poId],
    );
    const a = items.rows.find((x: any) => x.id === itemAId);
    const b = items.rows.find((x: any) => x.id === itemBId);
    expect(a.cost).toBeCloseTo(600, 2);
    expect(b.cost).toBeCloseTo(3100, 2);
  });

  it("líneas MIXTAS: flete por valor + agente por cantidad", async () => {
    const vid = await createVoucher(pool, {
      storeId, voucherCode: "LC-MIX-1",
      defaultAllocationMethod: "by_value",
      createdBy: 1,
    });
    await addCostLine(pool, vid, { costType: "freight_ocean", amount: 2000, allocationMethod: "by_value" });
    await addCostLine(pool, vid, { costType: "clearing_agent", amount: 1500, allocationMethod: "by_quantity" });
    await addTarget(pool, vid, { purchaseOrderId: poId });
    await applyVoucher(pool, vid, 1);

    // A: +50 (valor) + +100 (cantidad) = +150 → 650
    // B: +300 (valor) + +100 (cantidad) = +400 → 3400
    const items = await pool.query(
      `SELECT id, unit_cost::float AS cost FROM purchase_order_items WHERE purchase_order_id=$1 ORDER BY id`,
      [poId],
    );
    const a = items.rows.find((x: any) => x.id === itemAId);
    const b = items.rows.find((x: any) => x.id === itemBId);
    expect(a.cost).toBeCloseTo(650, 2);
    expect(b.cost).toBeCloseTo(3400, 2);
  });

  it("prorateo POR PESO sin peso declarado lanza error", async () => {
    const vid = await createVoucher(pool, {
      storeId, voucherCode: "LC-WT-1",
      defaultAllocationMethod: "by_weight",
      createdBy: 1,
    });
    await addCostLine(pool, vid, { costType: "freight_ocean", amount: 1000 });
    await addTarget(pool, vid, { purchaseOrderId: poId });
    await expect(applyVoucher(pool, vid, 1)).rejects.toBeInstanceOf(LandedCostError);
  });

  it("no se puede APLICAR dos veces", async () => {
    const vid = await createVoucher(pool, {
      storeId, voucherCode: "LC-DBL-1",
      defaultAllocationMethod: "by_value",
      createdBy: 1,
    });
    await addCostLine(pool, vid, { costType: "insurance", amount: 500 });
    await addTarget(pool, vid, { purchaseOrderId: poId });
    await applyVoucher(pool, vid, 1);
    await expect(applyVoucher(pool, vid, 1)).rejects.toBeInstanceOf(LandedCostError);
  });

  it("no se puede aplicar SIN líneas", async () => {
    const vid = await createVoucher(pool, {
      storeId, voucherCode: "LC-EMPTY",
      defaultAllocationMethod: "by_value",
      createdBy: 1,
    });
    await addTarget(pool, vid, { purchaseOrderId: poId });
    await expect(applyVoucher(pool, vid, 1)).rejects.toBeInstanceOf(LandedCostError);
  });

  it("no se puede aplicar SIN POs", async () => {
    const vid = await createVoucher(pool, {
      storeId, voucherCode: "LC-NOPO",
      defaultAllocationMethod: "by_value",
      createdBy: 1,
    });
    await addCostLine(pool, vid, { costType: "customs_duty", amount: 800 });
    await expect(applyVoucher(pool, vid, 1)).rejects.toBeInstanceOf(LandedCostError);
  });

  it("suma exacta: total_allocated == total_costs", async () => {
    const vid = await createVoucher(pool, {
      storeId, voucherCode: "LC-SUM-1",
      defaultAllocationMethod: "by_value",
      createdBy: 1,
    });
    await addCostLine(pool, vid, { costType: "freight_ocean", amount: 1234.56 });
    await addCostLine(pool, vid, { costType: "customs_itbis", amount: 987.65 });
    await addTarget(pool, vid, { purchaseOrderId: poId });
    const r = await applyVoucher(pool, vid, 1);
    expect(r.totalAllocated).toBeCloseTo(r.totalCosts, 2);
  });

  it("getVoucher devuelve el voucher completo con allocations", async () => {
    const vid = await createVoucher(pool, {
      storeId, voucherCode: "LC-GET-1",
      defaultAllocationMethod: "by_value",
      createdBy: 1,
    });
    await addCostLine(pool, vid, { costType: "freight_ocean", amount: 1000 });
    await addTarget(pool, vid, { purchaseOrderId: poId });
    await applyVoucher(pool, vid, 1);

    const detail = await getVoucher(pool, vid);
    expect(detail).not.toBeNull();
    expect(detail!.voucher.status).toBe("applied");
    expect(detail!.lines).toHaveLength(1);
    expect(detail!.targets).toHaveLength(1);
    expect(detail!.allocations.length).toBeGreaterThan(0);
  });
});
