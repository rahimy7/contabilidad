import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { InventoryCosting } from "../server/inventory/costing";
import {
  createLocation, generateLocations, putaway, moveStock, pickPlan, consumePlacements,
  placementDrift, expiryReport, listLocations, deleteLocation, WmsError,
} from "../server/inventory/wms";
import {
  createCount, recordCounts, submitForReview, applyCount, getCount, addFoundLine,
  InventoryCountError,
} from "../server/inventory/counts";

neonConfig.webSocketConstructor = ws;

/**
 * Ubicaciones WMS, rotación FEFO y conteo físico.
 *
 * Las tres cosas se prueban juntas porque el valor está en cómo se encadenan:
 * la compra guarda en un estante, la venta despacha del que vence primero, y el
 * conteo es lo único que puede mover dinero cuando el estante y los libros
 * dejan de coincidir.
 */
describeIntegration("WMS locations, FEFO rotation and physical count", () => {
  let pool: Pool;
  let companyId: number;
  let wh: number;
  let P: number;
  let P2: number;
  const RNC = "159000077";
  const YEAR = new Date().getUTCFullYear();
  const M = String(new Date().getUTCMonth() + 1).padStart(2, "0");
  const DATE = `${YEAR}-${M}-10`;
  const INVENTORY = "1.1.03.001";
  const SHORTAGE = "5.1.02.001";
  const SURPLUS = "4.2.02.001";

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    companyId = (
      await pool.query(`INSERT INTO companies (legal_name, rnc) VALUES ('WMS SRL',$1) RETURNING id`, [RNC])
    ).rows[0].id;
    await seedCompanyDefaults(pool, companyId);
    wh = (
      await pool.query(
        `INSERT INTO warehouses (store_id, name, wms_enabled, rotation_policy)
         VALUES (1,'Bodega WMS Test', true, 'fefo') RETURNING id`,
      )
    ).rows[0].id;
    P = (
      await pool.query(
        `INSERT INTO products (name, base_currency, price, category, store_id)
         VALUES ('Yogurt Test','DOP','100','general',1) RETURNING id`,
      )
    ).rows[0].id;
    P2 = (
      await pool.query(
        `INSERT INTO products (name, base_currency, price, category, store_id)
         VALUES ('Harina Test','DOP','50','general',1) RETURNING id`,
      )
    ).rows[0].id;
  });

  afterAll(async () => {
    if (companyId) {
      await cleanup();
      await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    if (wh) await pool.query(`DELETE FROM warehouses WHERE id=$1`, [wh]);
    if (P) await pool.query(`DELETE FROM products WHERE id = ANY($1)`, [[P, P2]]);
    await pool.end();
  });

  async function cleanup() {
    for (const t of [
      "inventory_count_lines", "inventory_counts", "inventory_location_moves",
      "inventory_placements", "warehouse_locations", "inventory_cost_movements",
      "inventory_lots", "inventory_valuation", "journal_entries",
    ]) {
      await pool.query(`DELETE FROM ${t} WHERE company_id=$1`, [companyId]);
    }
  }
  beforeEach(cleanup);

  async function inTx<T>(fn: (c: any) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  const balanceOf = async (code: string) => {
    const r = await pool.query(
      `SELECT coalesce(sum(l.debit - l.credit), 0)::text AS bal
         FROM journal_entry_lines l
         JOIN chart_of_accounts a ON a.id = l.account_id
        WHERE a.company_id=$1 AND a.code=$2`,
      [companyId, code],
    );
    return Number(r.rows[0].bal);
  };

  const bin = (c: any, code: string, extra: any = {}) =>
    createLocation(c, companyId, wh, { code, ...extra });

  const receiveInto = (c: any, opts: {
    locationId: number; quantity: string; unitCost: string;
    lotNo?: string; expirationDate?: string; date?: string;
  }) =>
    (async () => {
      const { lotId } = await new InventoryCosting(c).receive({
        companyId, productId: P, date: opts.date ?? DATE, quantity: opts.quantity,
        unitCost: opts.unitCost, warehouseId: wh, method: "fifo",
        lotNo: opts.lotNo, expirationDate: opts.expirationDate,
      });
      await putaway(c, {
        companyId, productId: P, warehouseId: wh, receivedDate: opts.date ?? DATE,
        unitCost: opts.unitCost, lotId,
        lines: [{
          locationId: opts.locationId, quantity: opts.quantity,
          lotNo: opts.lotNo, expirationDate: opts.expirationDate,
        }],
      });
      return lotId;
    })();

  // ── ubicaciones ────────────────────────────────────────────────────────────

  it("genera una rejilla de ubicaciones en orden de recorrido", async () => {
    const out = await inTx((c) =>
      generateLocations(c, companyId, wh, { zones: ["A"], aisles: ["01", "02"], levels: ["1", "2"] }),
    );
    expect(out.created).toBe(4);
    expect(out.codes).toEqual(["A-01-1", "A-01-2", "A-02-1", "A-02-2"]);

    const rows = await inTx((c) => listLocations(c, companyId, wh));
    expect(rows.map((r: any) => r.code)).toEqual(["A-01-1", "A-01-2", "A-02-1", "A-02-2"]);

    // Re-generar no duplica: el código ya existe y se deja como está.
    const again = await inTx((c) =>
      generateLocations(c, companyId, wh, { zones: ["A"], aisles: ["01"], levels: ["1"] }),
    );
    expect(again.created).toBe(0);
    expect(again.skipped).toBe(1);
  });

  it("desactiva en lugar de borrar una ubicación con existencia", async () => {
    const { deactivated, deleted } = await inTx(async (c) => {
      const l = await bin(c, "A-01");
      await receiveInto(c, { locationId: Number(l.id), quantity: "5", unitCost: "10" });
      return deleteLocation(c, companyId, Number(l.id));
    });
    expect(deleted).toBe(false);
    expect(deactivated).toBe(true);
  });

  it("rechaza mezclar productos en una ubicación de un solo SKU", async () => {
    await expect(
      inTx(async (c) => {
        const l = await bin(c, "A-DEDICADA", { allowMixedProducts: false });
        await receiveInto(c, { locationId: Number(l.id), quantity: "5", unitCost: "10" });
        await putaway(c, {
          companyId, productId: P2, warehouseId: wh, receivedDate: DATE, unitCost: "3",
          lines: [{ locationId: Number(l.id), quantity: "1" }],
        });
      }),
    ).rejects.toThrow(WmsError);
  });

  // ── FEFO ───────────────────────────────────────────────────────────────────

  it("despacha primero lo que vence antes, aunque haya entrado después", async () => {
    const plan = await inTx(async (c) => {
      const a = await bin(c, "A-01");
      const b = await bin(c, "A-02");
      // La caja vieja vence en diciembre; la que llegó después vence esta semana.
      await receiveInto(c, {
        locationId: Number(a.id), quantity: "10", unitCost: "10",
        lotNo: "VIEJO", expirationDate: `${YEAR}-12-31`, date: `${YEAR}-${M}-01`,
      });
      await receiveInto(c, {
        locationId: Number(b.id), quantity: "10", unitCost: "12",
        lotNo: "NUEVO", expirationDate: `${YEAR}-${M}-15`, date: `${YEAR}-${M}-05`,
      });
      return pickPlan(c, { companyId, productId: P, warehouseId: wh, quantity: "12" });
    });

    expect(plan.rotation).toBe("fefo");
    expect(plan.allocations[0].lotNo).toBe("NUEVO");
    expect(plan.allocations[1].lotNo).toBe("VIEJO");
    // Numérico y no textual: la cantidad viene del `numeric(18,4)` cuando se
    // agota la ubicación ("10.0000") y de la resta cuando es parcial ("2").
    expect(Number(plan.allocations[0].quantity)).toBe(10);
    expect(Number(plan.allocations[1].quantity)).toBe(2);
    expect(Number(plan.shortfall)).toBe(0);
  });

  it("bajo FIFO despacha primero el recibo más antiguo", async () => {
    const plan = await inTx(async (c) => {
      const a = await bin(c, "A-01");
      const b = await bin(c, "A-02");
      await receiveInto(c, {
        locationId: Number(a.id), quantity: "10", unitCost: "10",
        lotNo: "VIEJO", expirationDate: `${YEAR}-12-31`, date: `${YEAR}-${M}-01`,
      });
      await receiveInto(c, {
        locationId: Number(b.id), quantity: "10", unitCost: "12",
        lotNo: "NUEVO", expirationDate: `${YEAR}-${M}-15`, date: `${YEAR}-${M}-05`,
      });
      return pickPlan(c, { companyId, productId: P, warehouseId: wh, quantity: "5", rotation: "fifo" });
    });
    expect(plan.allocations[0].lotNo).toBe("VIEJO");
  });

  it("nunca propone despachar de cuarentena ni de averías", async () => {
    const plan = await inTx(async (c) => {
      const ok = await bin(c, "A-01");
      const q = await bin(c, "CUARENTENA", { kind: "quarantine", isPickable: false });
      await receiveInto(c, { locationId: Number(ok.id), quantity: "3", unitCost: "10" });
      await receiveInto(c, { locationId: Number(q.id), quantity: "50", unitCost: "10" });
      return pickPlan(c, { companyId, productId: P, warehouseId: wh, quantity: "20" });
    });
    expect(Number(plan.allocated)).toBe(3);
    expect(Number(plan.shortfall)).toBe(17);
    expect(plan.allocations).toHaveLength(1);
  });

  it("el costo FEFO drena las capas por vencimiento, no por antigüedad", async () => {
    const cogs = await inTx(async (c) => {
      const a = await bin(c, "A-01");
      const b = await bin(c, "A-02");
      await receiveInto(c, {
        locationId: Number(a.id), quantity: "10", unitCost: "10",
        lotNo: "VIEJO", expirationDate: `${YEAR}-12-31`, date: `${YEAR}-${M}-01`,
      });
      await receiveInto(c, {
        locationId: Number(b.id), quantity: "10", unitCost: "25",
        lotNo: "NUEVO", expirationDate: `${YEAR}-${M}-15`, date: `${YEAR}-${M}-05`,
      });
      const r = await new InventoryCosting(c).issue({
        companyId, productId: P, date: DATE, quantity: "4", warehouseId: wh,
      });
      return r.cogs;
    });
    // 4 unidades de la capa que vence primero, a 25 — no a 10.
    expect(Number(cogs)).toBe(100);
  });

  it("mover entre ubicaciones no toca el mayor", async () => {
    const before = await balanceOf(INVENTORY);
    const moved = await inTx(async (c) => {
      const a = await bin(c, "A-01");
      const b = await bin(c, "B-01");
      await receiveInto(c, { locationId: Number(a.id), quantity: "10", unitCost: "10" });
      const p = await c.query(
        `SELECT id FROM inventory_placements WHERE company_id=$1 AND location_id=$2`,
        [companyId, a.id],
      );
      return moveStock(c, {
        companyId, placementId: Number(p.rows[0].id), toLocationId: Number(b.id), quantity: "4",
      });
    });
    expect(Number(moved.moved)).toBe(4);

    const rows = await pool.query(
      `SELECT l.code, p.quantity::text FROM inventory_placements p
         JOIN warehouse_locations l ON l.id = p.location_id
        WHERE p.company_id=$1 ORDER BY l.code`,
      [companyId],
    );
    expect(rows.rows).toEqual([
      { code: "A-01", quantity: "6.0000" },
      { code: "B-01", quantity: "4.0000" },
    ]);
    // El asiento sólo lleva la recepción: el traslado interno no escribe nada.
    expect(await balanceOf(INVENTORY)).toBe(before + 100);
  });

  it("el despacho descuenta de las ubicaciones y deja bitácora", async () => {
    await inTx(async (c) => {
      const a = await bin(c, "A-01");
      await receiveInto(c, { locationId: Number(a.id), quantity: "10", unitCost: "10" });
      await consumePlacements(c, {
        companyId, productId: P, warehouseId: wh, quantity: "3",
        sourceType: "fiscal_document", sourceId: "999",
      });
    });
    const placed = await pool.query(
      `SELECT coalesce(sum(quantity),0)::text q FROM inventory_placements WHERE company_id=$1`,
      [companyId],
    );
    expect(placed.rows[0].q).toBe("7.0000");

    const moves = await pool.query(
      `SELECT kind, quantity::text FROM inventory_location_moves WHERE company_id=$1 ORDER BY id`,
      [companyId],
    );
    expect(moves.rows).toEqual([
      { kind: "putaway", quantity: "10.0000" },
      { kind: "pick", quantity: "3.0000" },
    ]);
  });

  it("se niega a despachar más de lo que hay en los estantes", async () => {
    await expect(
      inTx(async (c) => {
        const a = await bin(c, "A-01");
        await receiveInto(c, { locationId: Number(a.id), quantity: "2", unitCost: "10" });
        await consumePlacements(c, { companyId, productId: P, warehouseId: wh, quantity: "5" });
      }),
    ).rejects.toThrow(WmsError);
  });

  it("reporta el stock vencido y por vencer", async () => {
    const items = await inTx(async (c) => {
      const a = await bin(c, "A-01");
      await receiveInto(c, {
        locationId: Number(a.id), quantity: "5", unitCost: "10", expirationDate: `${YEAR}-${M}-15`,
      });
      return expiryReport(c, companyId, wh, 3650);
    });
    expect(items).toHaveLength(1);
    expect(items[0].expiration_date).toBe(`${YEAR}-${M}-15`);
  });

  // ── conteo físico ──────────────────────────────────────────────────────────

  it("un faltante va a gasto por faltante, no a costo de ventas", async () => {
    const applied = await inTx(async (c) => {
      const a = await bin(c, "A-01");
      await receiveInto(c, { locationId: Number(a.id), quantity: "10", unitCost: "10" });

      const count = await createCount(c, { companyId, warehouseId: wh, countDate: DATE, countType: "full" });
      const sheet = await getCount(c, companyId, count.id);
      // El estante tiene 8, no 10: faltan 2.
      await recordCounts(c, companyId, count.id, [{ lineId: sheet.lines[0].id, countedQty: "8", reason: "rotura" }]);
      await submitForReview(c, companyId, count.id);
      return applyCount(c, companyId, count.id);
    });

    expect(applied.productsAdjusted).toBe(1);
    expect(Number(applied.shortageValue)).toBe(20);
    expect(Number(applied.surplusValue)).toBe(0);
    expect(applied.journalEntryIds).toHaveLength(1);

    expect(await balanceOf(SHORTAGE)).toBe(20);
    expect(await balanceOf(INVENTORY)).toBe(80);
    // El costo de ventas queda intacto: nada se vendió.
    expect(await balanceOf("5.1.01.001")).toBe(0);

    const placed = await pool.query(
      `SELECT quantity::text q FROM inventory_placements WHERE company_id=$1`,
      [companyId],
    );
    expect(placed.rows[0].q).toBe("8.0000");
  });

  it("un sobrante entra al inventario contra otros ingresos", async () => {
    const applied = await inTx(async (c) => {
      const a = await bin(c, "A-01");
      await receiveInto(c, { locationId: Number(a.id), quantity: "10", unitCost: "10" });
      const count = await createCount(c, { companyId, warehouseId: wh, countDate: DATE, countType: "full" });
      const sheet = await getCount(c, companyId, count.id);
      await recordCounts(c, companyId, count.id, [{ lineId: sheet.lines[0].id, countedQty: "13" }]);
      await submitForReview(c, companyId, count.id);
      return applyCount(c, companyId, count.id);
    });
    expect(Number(applied.surplusValue)).toBe(30);
    expect(await balanceOf(SURPLUS)).toBe(-30); // cuenta de ingreso: saldo acreedor
    expect(await balanceOf(INVENTORY)).toBe(130);
  });

  it("un conteo cíclico no borra la existencia de las ubicaciones que no miró", async () => {
    const applied = await inTx(async (c) => {
      const a = await bin(c, "A-01");
      const b = await bin(c, "B-01");
      await receiveInto(c, { locationId: Number(a.id), quantity: "10", unitCost: "10" });
      await receiveInto(c, { locationId: Number(b.id), quantity: "10", unitCost: "10" });

      // Sólo se cuenta A-01, y aparece con 7 en vez de 10.
      const count = await createCount(c, {
        companyId, warehouseId: wh, countDate: DATE, countType: "cycle", locationIds: [Number(a.id)],
      });
      const sheet = await getCount(c, companyId, count.id);
      expect(sheet.lines).toHaveLength(1);
      await recordCounts(c, companyId, count.id, [{ lineId: sheet.lines[0].id, countedQty: "7" }]);
      await submitForReview(c, companyId, count.id);
      return applyCount(c, companyId, count.id);
    });

    // Falta 3 de 20, no 13: B-01 nunca se contó y sus 10 unidades siguen ahí.
    expect(Number(applied.shortageValue)).toBe(30);
    const v = await pool.query(
      `SELECT quantity_on_hand::text q FROM inventory_valuation WHERE company_id=$1 AND product_id=$2`,
      [companyId, P],
    );
    expect(v.rows[0].q).toBe("17.0000");
  });

  it("registra hallazgos en ubicaciones donde no se esperaba nada", async () => {
    const applied = await inTx(async (c) => {
      const a = await bin(c, "A-01");
      const b = await bin(c, "B-01");
      await receiveInto(c, { locationId: Number(a.id), quantity: "10", unitCost: "10" });

      const count = await createCount(c, { companyId, warehouseId: wh, countDate: DATE, countType: "full" });
      const sheet = await getCount(c, companyId, count.id);
      await recordCounts(c, companyId, count.id, [{ lineId: sheet.lines[0].id, countedQty: "10" }]);
      // Aparecen 4 cajas en B-01, donde el sistema no tenía nada.
      await addFoundLine(c, companyId, count.id, {
        productId: P, locationId: Number(b.id), countedQty: "4", unitCost: "10",
      });
      await submitForReview(c, companyId, count.id);
      return applyCount(c, companyId, count.id);
    });
    expect(Number(applied.surplusValue)).toBe(40);

    const rows = await pool.query(
      `SELECT l.code, p.quantity::text q FROM inventory_placements p
         JOIN warehouse_locations l ON l.id = p.location_id
        WHERE p.company_id=$1 ORDER BY l.code`,
      [companyId],
    );
    expect(rows.rows).toEqual([
      { code: "A-01", q: "10.0000" },
      { code: "B-01", q: "4.0000" },
    ]);
  });

  it("un conteo ciego oculta lo esperado mientras se captura, no en la revisión", async () => {
    const { capturing, reviewing } = await inTx(async (c) => {
      const a = await bin(c, "A-01");
      await receiveInto(c, { locationId: Number(a.id), quantity: "10", unitCost: "10" });
      const count = await createCount(c, {
        companyId, warehouseId: wh, countDate: DATE, countType: "full", isBlind: true,
      });
      const capturing = await getCount(c, companyId, count.id, true);
      const sheet = await getCount(c, companyId, count.id);
      await recordCounts(c, companyId, count.id, [{ lineId: sheet.lines[0].id, countedQty: "9" }]);
      await submitForReview(c, companyId, count.id);
      const reviewing = await getCount(c, companyId, count.id, true);
      return { capturing, reviewing };
    });
    expect(capturing.blindActive).toBe(true);
    expect(capturing.lines[0].expected_qty).toBeNull();
    expect(reviewing.blindActive).toBe(false);
    expect(reviewing.lines[0].expected_qty).toBe("10.0000");
  });

  it("no permite aplicar sin pasar por revisión, ni aplicar dos veces", async () => {
    const countId = await inTx(async (c) => {
      const a = await bin(c, "A-01");
      await receiveInto(c, { locationId: Number(a.id), quantity: "10", unitCost: "10" });
      const count = await createCount(c, { companyId, warehouseId: wh, countDate: DATE, countType: "full" });
      const sheet = await getCount(c, companyId, count.id);
      await recordCounts(c, companyId, count.id, [{ lineId: sheet.lines[0].id, countedQty: "9" }]);
      return count.id;
    });

    await expect(inTx((c) => applyCount(c, companyId, countId))).rejects.toThrow(InventoryCountError);

    await inTx(async (c) => {
      await submitForReview(c, companyId, countId);
      await applyCount(c, companyId, countId);
    });
    await expect(inTx((c) => applyCount(c, companyId, countId))).rejects.toThrow(/ya fue aplicado/);

    // Y el faltante se contabilizó una sola vez.
    expect(await balanceOf(SHORTAGE)).toBe(10);
  });

  it("un almacén no admite dos conteos abiertos a la vez", async () => {
    await expect(
      inTx(async (c) => {
        await bin(c, "A-01");
        await createCount(c, { companyId, warehouseId: wh, countDate: DATE, countType: "full" });
        await createCount(c, { companyId, warehouseId: wh, countDate: DATE, countType: "full" });
      }),
    ).rejects.toThrow(/en proceso/);
  });

  it("el conteo cierra la diferencia entre las ubicaciones y la valuación", async () => {
    const drift = await inTx(async (c) => {
      const a = await bin(c, "A-01");
      await receiveInto(c, { locationId: Number(a.id), quantity: "10", unitCost: "10" });
      // Alguien despacha contra la valuación sin tocar los estantes.
      await new InventoryCosting(c).issue({
        companyId, productId: P, date: DATE, quantity: "4", warehouseId: wh,
      });
      return placementDrift(c, companyId, wh);
    });
    expect(drift.reconciled).toBe(false);
    expect(drift.differences[0].placed_qty).toBe("10.0000");
    expect(drift.differences[0].valued_qty).toBe("6.0000");

    const after = await inTx(async (c) => {
      const count = await createCount(c, { companyId, warehouseId: wh, countDate: DATE, countType: "full" });
      const sheet = await getCount(c, companyId, count.id);
      await recordCounts(c, companyId, count.id, [{ lineId: sheet.lines[0].id, countedQty: "6" }]);
      await submitForReview(c, companyId, count.id);
      await applyCount(c, companyId, count.id);
      return placementDrift(c, companyId, wh);
    });
    expect(after.reconciled).toBe(true);
  });

  it("un conteo sin diferencias no escribe ningún asiento", async () => {
    const applied = await inTx(async (c) => {
      const a = await bin(c, "A-01");
      await receiveInto(c, { locationId: Number(a.id), quantity: "10", unitCost: "10" });
      const count = await createCount(c, { companyId, warehouseId: wh, countDate: DATE, countType: "full" });
      const sheet = await getCount(c, companyId, count.id);
      await recordCounts(c, companyId, count.id, [{ lineId: sheet.lines[0].id, countedQty: "10" }]);
      await submitForReview(c, companyId, count.id);
      return applyCount(c, companyId, count.id);
    });
    expect(applied.journalEntryIds).toHaveLength(0);
    expect(Number(applied.netValue)).toBe(0);
    expect(await balanceOf(SHORTAGE)).toBe(0);
    expect(await balanceOf(SURPLUS)).toBe(0);
  });
});
