import type { Pool, PoolClient } from "@neondatabase/serverless";

/**
 * Manufacturing lite: BOMs + production orders + backflush automático.
 *
 * Flujo:
 *   1. `createBom(input)` — define receta con líneas de componentes
 *   2. `createProductionOrder(input)` — genera MO en draft con snapshot de componentes
 *   3. `releaseProductionOrder(id)` — valida disponibilidad (informa short) y cambia estado
 *   4. `completeProductionOrder(id, actualQty)` — backflush: descuenta MPs + ingresa terminado
 *
 * Reglas:
 *   - Sólo BOMs `active` pueden usarse en MOs
 *   - Backflush usa costo unitario snapshot para calcular total_cost
 *   - Si stock insuficiente al release, se marca `short` pero se permite continuar
 *   - Completar dos veces la misma MO lanza error
 */

export class ManufacturingError extends Error {}

// ── BOM Management ───────────────────────────────────────────────────

export interface BomLineInput {
  componentProductId: number;
  quantityPer: number;
  unit?: string;
  scrapPercent?: number;
  unitCost?: number;
  notes?: string;
}

export interface CreateBomInput {
  storeId: number;
  bomCode: string;
  outputProductId: number;
  outputQuantity?: number;
  outputWarehouseId?: number;
  name: string;
  description?: string;
  version?: string;
  status?: "draft" | "active" | "obsolete";
  lines: BomLineInput[];
  createdBy: number;
}

export async function createBom(pool: Pool, input: CreateBomInput): Promise<number> {
  if (!input.lines.length) throw new ManufacturingError("un BOM necesita al menos una línea");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const estimated = input.lines.reduce(
      (s, l) => s + Number(l.quantityPer) * Number(l.unitCost ?? 0),
      0,
    );
    const outQty = input.outputQuantity ?? 1;

    const header = await client.query(
      `INSERT INTO bom_headers
         (store_id, bom_code, output_product_id, output_quantity, output_warehouse_id,
          name, description, version, estimated_unit_cost, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [
        input.storeId, input.bomCode, input.outputProductId,
        String(outQty), input.outputWarehouseId ?? null,
        input.name, input.description ?? null,
        input.version ?? "v1",
        String(estimated / outQty),
        input.status ?? "active",
        input.createdBy,
      ],
    );
    const bomId = Number(header.rows[0].id);

    let order = 0;
    for (const l of input.lines) {
      await client.query(
        `INSERT INTO bom_lines
           (bom_id, component_product_id, quantity_per, unit,
            scrap_percent, unit_cost, notes, line_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          bomId, l.componentProductId, String(l.quantityPer),
          l.unit ?? "unit", String(l.scrapPercent ?? 0),
          String(l.unitCost ?? 0), l.notes ?? null, order++,
        ],
      );
    }

    await client.query("COMMIT");
    return bomId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listBoms(pool: Pool, storeId: number, filter?: { productId?: number; status?: string }) {
  const r = await pool.query(
    `SELECT bh.id, bh.bom_code AS "bomCode", bh.name, bh.description, bh.version,
            bh.output_product_id AS "outputProductId", bh.output_quantity::text AS "outputQuantity",
            bh.status, bh.estimated_unit_cost::text AS "estimatedUnitCost",
            p.name AS "outputProductName", p.sku AS "outputProductSku",
            (SELECT count(*)::int FROM bom_lines WHERE bom_id = bh.id) AS "lineCount"
       FROM bom_headers bh
       LEFT JOIN products p ON p.id = bh.output_product_id
      WHERE bh.store_id = $1
        AND ($2::int IS NULL OR bh.output_product_id = $2)
        AND ($3::text IS NULL OR bh.status = $3)
      ORDER BY bh.updated_at DESC LIMIT 200`,
    [storeId, filter?.productId ?? null, filter?.status ?? null],
  );
  return r.rows;
}

export async function getBom(pool: Pool, bomId: number) {
  const header = await pool.query(
    `SELECT bh.id, bh.bom_code AS "bomCode", bh.output_product_id AS "outputProductId",
            bh.output_quantity::text AS "outputQuantity",
            bh.output_warehouse_id AS "outputWarehouseId",
            bh.name, bh.description, bh.version, bh.status,
            bh.estimated_unit_cost::text AS "estimatedUnitCost", bh.notes,
            p.name AS "outputProductName", p.sku AS "outputProductSku"
       FROM bom_headers bh
       LEFT JOIN products p ON p.id = bh.output_product_id
      WHERE bh.id = $1`,
    [bomId],
  );
  if (!header.rowCount) return null;
  const lines = await pool.query(
    `SELECT bl.id, bl.component_product_id AS "componentProductId",
            bl.quantity_per::text AS "quantityPer", bl.unit,
            bl.scrap_percent::text AS "scrapPercent",
            bl.unit_cost::text AS "unitCost", bl.notes, bl.line_order AS "lineOrder",
            p.name AS "componentName", p.sku AS "componentSku"
       FROM bom_lines bl
       LEFT JOIN products p ON p.id = bl.component_product_id
      WHERE bl.bom_id = $1
      ORDER BY bl.line_order, bl.id`,
    [bomId],
  );
  return { header: header.rows[0], lines: lines.rows };
}

/**
 * Explosión de BOM: dada una cantidad de output, calcula las cantidades
 * requeridas de cada MP (incluyendo scrap).
 */
export async function explodeBom(
  pool: Pool,
  bomId: number,
  outputQuantity: number,
): Promise<Array<{ componentProductId: number; totalRequired: number; unit: string; unitCost: number }>> {
  const r = await pool.query(
    `SELECT bl.component_product_id, bl.quantity_per::float AS qp,
            bl.scrap_percent::float AS scrap, bl.unit,
            bl.unit_cost::float AS "unitCost",
            bh.output_quantity::float AS "outputQuantity"
       FROM bom_lines bl
       JOIN bom_headers bh ON bh.id = bl.bom_id
      WHERE bl.bom_id = $1`,
    [bomId],
  );
  const runs = outputQuantity / Number(r.rows[0]?.outputQuantity ?? 1);
  return r.rows.map((row: any) => ({
    componentProductId: Number(row.component_product_id),
    totalRequired: round4(row.qp * runs * (1 + row.scrap / 100)),
    unit: row.unit,
    unitCost: Number(row.unitCost),
  }));
}

// ── Production Orders ────────────────────────────────────────────────

export interface CreateMoInput {
  storeId: number;
  moNumber: string;
  bomId: number;
  plannedQuantity: number;
  outputWarehouseId: number;
  sourceWarehouseId: number;
  scheduledStartDate?: string;
  scheduledEndDate?: string;
  notes?: string;
  createdBy: number;
}

export async function createProductionOrder(pool: Pool, input: CreateMoInput): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const bomRes = await client.query(
      `SELECT id, output_product_id, output_quantity::float AS qty, status
         FROM bom_headers WHERE id = $1 AND store_id = $2`,
      [input.bomId, input.storeId],
    );
    if (!bomRes.rowCount) throw new ManufacturingError(`BOM ${input.bomId} no existe`);
    const bom = bomRes.rows[0];
    if (bom.status !== "active") throw new ManufacturingError(`BOM está en estado ${bom.status}, no puede usarse`);

    const mo = await client.query(
      `INSERT INTO production_orders
         (store_id, mo_number, bom_id, output_product_id, planned_quantity,
          output_warehouse_id, scheduled_start_date, scheduled_end_date,
          status, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8::date,'draft',$9,$10) RETURNING id`,
      [
        input.storeId, input.moNumber, input.bomId,
        bom.output_product_id, String(input.plannedQuantity),
        input.outputWarehouseId,
        input.scheduledStartDate ?? null,
        input.scheduledEndDate ?? null,
        input.notes ?? null, input.createdBy,
      ],
    );
    const moId = Number(mo.rows[0].id);

    // Snapshot de componentes con explosión.
    const components = await client.query(
      `SELECT bl.component_product_id, bl.quantity_per::float AS qp,
              bl.scrap_percent::float AS scrap, bl.unit,
              bl.unit_cost::float AS unit_cost,
              bh.output_quantity::float AS bomOutQty
         FROM bom_lines bl
         JOIN bom_headers bh ON bh.id = bl.bom_id
        WHERE bl.bom_id = $1`,
      [input.bomId],
    );
    const runs = input.plannedQuantity / Number(components.rows[0]?.bomOutQty ?? 1);
    for (const c of components.rows) {
      const planned = round4(Number(c.qp) * runs * (1 + Number(c.scrap) / 100));
      await client.query(
        `INSERT INTO production_order_components
           (mo_id, component_product_id, planned_quantity, unit, unit_cost,
            source_warehouse_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          moId, c.component_product_id, String(planned),
          c.unit, String(c.unit_cost), input.sourceWarehouseId,
        ],
      );
    }

    await client.query("COMMIT");
    return moId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listMOs(pool: Pool, storeId: number, filter?: { status?: string; productId?: number }) {
  const r = await pool.query(
    `SELECT mo.id, mo.mo_number AS "moNumber", mo.bom_id AS "bomId",
            mo.output_product_id AS "outputProductId",
            mo.planned_quantity::text AS "plannedQuantity",
            mo.actual_quantity::text AS "actualQuantity",
            mo.status,
            mo.scheduled_start_date::text AS "scheduledStartDate",
            mo.scheduled_end_date::text AS "scheduledEndDate",
            mo.started_at::text AS "startedAt",
            mo.completed_at::text AS "completedAt",
            mo.total_material_cost::text AS "totalMaterialCost",
            mo.unit_cost::text AS "unitCost",
            p.name AS "outputProductName", p.sku AS "outputProductSku",
            bh.bom_code AS "bomCode", bh.name AS "bomName"
       FROM production_orders mo
       LEFT JOIN products p ON p.id = mo.output_product_id
       LEFT JOIN bom_headers bh ON bh.id = mo.bom_id
      WHERE mo.store_id = $1
        AND ($2::text IS NULL OR mo.status = $2)
        AND ($3::int IS NULL OR mo.output_product_id = $3)
      ORDER BY mo.created_at DESC LIMIT 200`,
    [storeId, filter?.status ?? null, filter?.productId ?? null],
  );
  return r.rows;
}

export async function getMO(pool: Pool, moId: number) {
  const head = await pool.query(
    `SELECT mo.id, mo.mo_number AS "moNumber", mo.store_id AS "storeId",
            mo.bom_id AS "bomId", mo.output_product_id AS "outputProductId",
            mo.planned_quantity::text AS "plannedQuantity",
            mo.actual_quantity::text AS "actualQuantity",
            mo.output_warehouse_id AS "outputWarehouseId",
            mo.status,
            mo.scheduled_start_date::text AS "scheduledStartDate",
            mo.scheduled_end_date::text AS "scheduledEndDate",
            mo.started_at::text AS "startedAt",
            mo.completed_at::text AS "completedAt",
            mo.total_material_cost::text AS "totalMaterialCost",
            mo.unit_cost::text AS "unitCost",
            mo.notes, p.name AS "outputProductName", p.sku AS "outputProductSku"
       FROM production_orders mo
       LEFT JOIN products p ON p.id = mo.output_product_id
      WHERE mo.id = $1`,
    [moId],
  );
  if (!head.rowCount) return null;
  const comps = await pool.query(
    `SELECT poc.id, poc.component_product_id AS "componentProductId",
            poc.planned_quantity::text AS "plannedQuantity",
            poc.consumed_quantity::text AS "consumedQuantity",
            poc.unit, poc.unit_cost::text AS "unitCost",
            poc.source_warehouse_id AS "sourceWarehouseId",
            poc.status,
            p.name AS "componentName", p.sku AS "componentSku"
       FROM production_order_components poc
       LEFT JOIN products p ON p.id = poc.component_product_id
      WHERE poc.mo_id = $1
      ORDER BY poc.id`,
    [moId],
  );
  return { header: head.rows[0], components: comps.rows };
}

// ── Release / Complete ──────────────────────────────────────────────

/** Marca la MO como liberada; verifica disponibilidad de MPs y marca 'short' si no alcanza. */
export async function releaseProductionOrder(pool: Pool, moId: number, releasedBy: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const mo = await client.query(
      `SELECT id, status FROM production_orders WHERE id = $1 FOR UPDATE`,
      [moId],
    );
    if (!mo.rowCount) throw new ManufacturingError(`MO ${moId} no existe`);
    if (mo.rows[0].status !== "draft") {
      throw new ManufacturingError(`MO está en ${mo.rows[0].status}, no puede liberarse`);
    }

    const comps = await client.query(
      `SELECT id, component_product_id, planned_quantity::float AS planned,
              source_warehouse_id
         FROM production_order_components WHERE mo_id = $1`,
      [moId],
    );

    const shorts: number[] = [];
    for (const c of comps.rows) {
      const stock = await getStock(client, c.component_product_id, c.source_warehouse_id);
      if (stock < Number(c.planned)) {
        shorts.push(Number(c.id));
        await client.query(
          `UPDATE production_order_components SET status = 'short' WHERE id = $1`,
          [c.id],
        );
      }
    }

    await client.query(
      `UPDATE production_orders SET status = 'released', updated_at = now() WHERE id = $1`,
      [moId],
    );
    await client.query("COMMIT");
    return { released: true, shortComponents: shorts.length, releasedBy };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export interface CompleteMoInput {
  moId: number;
  actualQuantity?: number;
  completedBy: number;
}

/**
 * Backflush: descuenta MPs consumidas y crea entrada de terminado.
 * Calcula costo total desde componentes y actualiza MO.
 */
export async function completeProductionOrder(pool: Pool, input: CompleteMoInput) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const moRes = await client.query(
      `SELECT id, store_id, output_product_id, output_warehouse_id,
              planned_quantity::float AS planned, status
         FROM production_orders WHERE id = $1 FOR UPDATE`,
      [input.moId],
    );
    if (!moRes.rowCount) throw new ManufacturingError(`MO ${input.moId} no existe`);
    const mo = moRes.rows[0];
    if (mo.status !== "released" && mo.status !== "in_progress") {
      throw new ManufacturingError(`MO está en ${mo.status}, no puede completarse`);
    }

    const actualQty = input.actualQuantity ?? Number(mo.planned);
    const ratio = actualQty / Number(mo.planned);

    // Consumir componentes proporcionalmente.
    const comps = await client.query(
      `SELECT id, component_product_id, planned_quantity::float AS planned,
              unit_cost::float AS unit_cost, source_warehouse_id
         FROM production_order_components WHERE mo_id = $1`,
      [input.moId],
    );

    let totalMaterialCost = 0;
    for (const c of comps.rows) {
      const consume = round4(Number(c.planned) * ratio);
      const cost = round4(consume * Number(c.unit_cost));
      totalMaterialCost += cost;

      await client.query(
        `UPDATE production_order_components
            SET consumed_quantity = $2, status = 'consumed'
          WHERE id = $1`,
        [c.id, String(consume)],
      );

      await decrementStock(client, c.component_product_id, c.source_warehouse_id, consume, mo.store_id);
      await client.query(
        `INSERT INTO production_inventory_movements
           (mo_id, direction, product_id, warehouse_id, quantity, unit_cost, total_cost)
         VALUES ($1,'out',$2,$3,$4,$5,$6)`,
        [
          input.moId, c.component_product_id, c.source_warehouse_id,
          String(consume), String(c.unit_cost), String(cost),
        ],
      );
    }

    const unitCost = actualQty > 0 ? round4(totalMaterialCost / actualQty) : 0;

    // Ingresar producto terminado.
    await incrementStock(client, mo.output_product_id, mo.output_warehouse_id, actualQty, mo.store_id);
    await client.query(
      `INSERT INTO production_inventory_movements
         (mo_id, direction, product_id, warehouse_id, quantity, unit_cost, total_cost)
       VALUES ($1,'in',$2,$3,$4,$5,$6)`,
      [
        input.moId, mo.output_product_id, mo.output_warehouse_id,
        String(actualQty), String(unitCost), String(totalMaterialCost),
      ],
    );

    // Cerrar MO.
    await client.query(
      `UPDATE production_orders
          SET status = 'completed',
              actual_quantity = $2,
              total_material_cost = $3,
              unit_cost = $4,
              completed_at = now(),
              completed_by = $5,
              updated_at = now()
        WHERE id = $1`,
      [input.moId, String(actualQty), String(totalMaterialCost), String(unitCost), input.completedBy],
    );

    await client.query("COMMIT");
    return { moId: input.moId, actualQuantity: actualQty, totalMaterialCost, unitCost };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function cancelProductionOrder(pool: Pool, moId: number) {
  const r = await pool.query(
    `UPDATE production_orders SET status = 'cancelled', updated_at = now()
      WHERE id = $1 AND status IN ('draft','released') RETURNING id`,
    [moId],
  );
  if (!r.rowCount) throw new ManufacturingError("MO no está en estado cancelable");
}

// ── Inventory helpers ────────────────────────────────────────────────

async function getStock(client: PoolClient, productId: number, warehouseId: number): Promise<number> {
  const r = await client.query(
    `SELECT quantity::float AS q FROM warehouse_stock
      WHERE product_id = $1 AND warehouse_id = $2 LIMIT 1`,
    [productId, warehouseId],
  );
  return r.rowCount ? Number(r.rows[0].q) : 0;
}

async function incrementStock(client: PoolClient, productId: number, warehouseId: number, qty: number, storeId: number) {
  const existing = await client.query(
    `SELECT id, quantity::float AS q FROM warehouse_stock
      WHERE product_id = $1 AND warehouse_id = $2 LIMIT 1`,
    [productId, warehouseId],
  );
  if (existing.rowCount) {
    await client.query(
      `UPDATE warehouse_stock SET quantity = quantity + $2, updated_at = now() WHERE id = $1`,
      [existing.rows[0].id, String(qty)],
    );
  } else {
    await client.query(
      `INSERT INTO warehouse_stock (warehouse_id, product_id, store_id, quantity)
       VALUES ($1, $2, $3, $4)`,
      [warehouseId, productId, storeId, String(qty)],
    );
  }
}

async function decrementStock(client: PoolClient, productId: number, warehouseId: number, qty: number, storeId: number) {
  const existing = await client.query(
    `SELECT id FROM warehouse_stock
      WHERE product_id = $1 AND warehouse_id = $2 LIMIT 1`,
    [productId, warehouseId],
  );
  if (existing.rowCount) {
    await client.query(
      `UPDATE warehouse_stock SET quantity = quantity - $2, updated_at = now() WHERE id = $1`,
      [existing.rows[0].id, String(qty)],
    );
  } else {
    // Sin registro previo, creamos negativo para que quede evidenciado.
    await client.query(
      `INSERT INTO warehouse_stock (warehouse_id, product_id, store_id, quantity)
       VALUES ($1, $2, $3, $4)`,
      [warehouseId, productId, storeId, String(-qty)],
    );
  }
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
