import { SqlClient } from "../accounting/types";
import { Decimal, add, cmp, isNegative, isZero, sub } from "../accounting/decimal";
import { RotationPolicy } from "./costing";

/**
 * Where the goods physically are.
 *
 * The costing module says a warehouse holds 40 units worth RD$4,000. This one
 * says 24 are in A-01-02, 12 in the cooler and 4 in cuarentena waiting for the
 * supplier to answer about a broken seal. It writes nothing to the ledger: a box
 * moved from one shelf to another is worth exactly what it was worth before, and
 * a journal entry for that would be noise.
 *
 * The whole layer is **optional**. A warehouse with `wms_enabled = false` never
 * touches these tables and behaves exactly as it did before locations existed —
 * that is the point. Turning it on for a bodega does not oblige the one next
 * door, so a company can rack its main warehouse and keep the branch on a
 * clipboard.
 *
 * The one hard rule: for a WMS warehouse, the placements of a product must sum
 * to the quantity the valuation carries. Anything that changes one without the
 * other is a bug, and `placementDrift` is what finds it.
 */

export class WmsError extends Error {}

/** How a warehouse is configured, read once per operation. */
export interface WarehouseWmsConfig {
  warehouseId: number;
  wmsEnabled: boolean;
  rotationPolicy: RotationPolicy;
  requireLocationOnReceipt: boolean;
}

export interface LocationInput {
  code: string;
  name?: string | null;
  barcode?: string | null;
  kind?: string;
  zone?: string | null;
  aisle?: string | null;
  rack?: string | null;
  level?: string | null;
  position?: string | null;
  pickPriority?: number;
  isPickable?: boolean;
  allowMixedProducts?: boolean;
  maxQty?: Decimal | null;
  notes?: string | null;
  isActive?: boolean;
}

/** One line of a putaway: how much of a receipt lands in which bin. */
export interface PutawayLine {
  locationId: number;
  quantity: Decimal;
  lotNo?: string | null;
  expirationDate?: string | null;
  status?: string;
}

export interface PutawayInput {
  companyId: number;
  productId: number;
  warehouseId: number;
  receivedDate: string;
  unitCost?: Decimal;
  /** Cost layer the units belong to, when the product is costed FIFO. */
  lotId?: number | null;
  lines: PutawayLine[];
  sourceType?: string;
  sourceId?: string;
  userId?: number;
}

/** A proposed or executed pick: take this much, from this bin. */
export interface PickAllocation {
  placementId: number;
  locationId: number;
  locationCode: string;
  lotNo: string | null;
  expirationDate: string | null;
  receivedDate: string;
  quantity: Decimal;
  availableQty: Decimal;
  unitCost: Decimal;
  /** True when the goods are already past their expiry date. */
  isExpired: boolean;
}

// ── warehouse configuration ──────────────────────────────────────────────────

/**
 * Reads a warehouse's WMS settings. Warehouse 0 — the company that keeps one
 * undivided store — has no row and is never under WMS.
 */
export async function warehouseConfig(client: SqlClient, warehouseId: number): Promise<WarehouseWmsConfig> {
  if (!warehouseId) {
    return { warehouseId: 0, wmsEnabled: false, rotationPolicy: "fifo", requireLocationOnReceipt: false };
  }
  const { rows } = await client.query(
    `SELECT wms_enabled, rotation_policy, require_location_on_receipt FROM warehouses WHERE id=$1`,
    [warehouseId],
  );
  const r = rows[0];
  return {
    warehouseId,
    wmsEnabled: r?.wms_enabled === true,
    rotationPolicy: r?.rotation_policy === "fefo" ? "fefo" : "fifo",
    requireLocationOnReceipt: r?.require_location_on_receipt === true,
  };
}

// ── locations ────────────────────────────────────────────────────────────────

export async function listLocations(
  client: SqlClient,
  companyId: number,
  warehouseId: number,
  opts: { includeInactive?: boolean; withStock?: boolean } = {},
) {
  const { rows } = await client.query(
    `SELECT l.id, l.code, l.name, l.barcode, l.kind, l.zone, l.aisle, l.rack, l.level, l.position,
            l.pick_priority, l.is_pickable, l.allow_mixed_products, l.max_qty::text, l.notes, l.is_active,
            coalesce(s.products, 0)         AS product_count,
            coalesce(s.total_qty, 0)::text  AS total_qty,
            coalesce(s.total_value, 0)::text AS total_value,
            s.next_expiration
       FROM warehouse_locations l
       LEFT JOIN LATERAL (
         SELECT count(DISTINCT p.product_id)                   AS products,
                sum(p.quantity)                                AS total_qty,
                sum(round(p.quantity * p.unit_cost, 4))        AS total_value,
                min(p.expiration_date) FILTER (WHERE p.quantity > 0) AS next_expiration
           FROM inventory_placements p
          WHERE p.company_id = l.company_id AND p.location_id = l.id AND p.quantity > 0
       ) s ON true
      WHERE l.company_id=$1 AND l.warehouse_id=$2
        AND ($3::bool OR l.is_active)
      ORDER BY l.pick_priority, l.code`,
    [companyId, warehouseId, opts.includeInactive ?? false],
  );
  return rows;
}

export async function createLocation(
  client: SqlClient,
  companyId: number,
  warehouseId: number,
  input: LocationInput,
) {
  const code = normalizeCode(input.code);
  if (!code) throw new WmsError("el código de la ubicación es requerido");
  const { rows } = await client.query(
    `INSERT INTO warehouse_locations
       (company_id, warehouse_id, code, name, barcode, kind, zone, aisle, level, rack, position,
        pick_priority, is_pickable, allow_mixed_products, max_qty, notes, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT (company_id, warehouse_id, code) DO NOTHING
     RETURNING id, code`,
    [
      companyId, warehouseId, code, input.name ?? null, input.barcode ?? null, input.kind ?? "picking",
      input.zone ?? null, input.aisle ?? null, input.level ?? null, input.rack ?? null, input.position ?? null,
      input.pickPriority ?? 100, input.isPickable ?? true, input.allowMixedProducts ?? true,
      input.maxQty ?? null, input.notes ?? null, input.isActive ?? true,
    ],
  );
  if (rows.length === 0) throw new WmsError(`ya existe una ubicación con el código ${code} en este almacén`);
  return rows[0];
}

export async function updateLocation(
  client: SqlClient,
  companyId: number,
  locationId: number,
  input: Partial<LocationInput>,
) {
  const { rows } = await client.query(
    `UPDATE warehouse_locations SET
       code = coalesce($3, code), name = coalesce($4, name), barcode = coalesce($5, barcode),
       kind = coalesce($6, kind), zone = coalesce($7, zone), aisle = coalesce($8, aisle),
       rack = coalesce($9, rack), level = coalesce($10, level), position = coalesce($11, position),
       pick_priority = coalesce($12, pick_priority), is_pickable = coalesce($13, is_pickable),
       allow_mixed_products = coalesce($14, allow_mixed_products), max_qty = coalesce($15, max_qty),
       notes = coalesce($16, notes), is_active = coalesce($17, is_active), updated_at = now()
     WHERE company_id=$1 AND id=$2
     RETURNING id, code`,
    [
      companyId, locationId,
      input.code ? normalizeCode(input.code) : null, input.name ?? null, input.barcode ?? null,
      input.kind ?? null, input.zone ?? null, input.aisle ?? null, input.rack ?? null,
      input.level ?? null, input.position ?? null, input.pickPriority ?? null,
      input.isPickable ?? null, input.allowMixedProducts ?? null, input.maxQty ?? null,
      input.notes ?? null, input.isActive ?? null,
    ],
  );
  if (rows.length === 0) throw new WmsError("ubicación no encontrada");
  return rows[0];
}

/**
 * Retires a bin. A bin holding stock is never deleted — the units would have
 * nowhere to be — so it is deactivated instead and stops receiving putaways
 * while the stock in it is picked down.
 */
export async function deleteLocation(client: SqlClient, companyId: number, locationId: number) {
  const held = await client.query(
    `SELECT coalesce(sum(quantity),0)::text AS qty FROM inventory_placements
      WHERE company_id=$1 AND location_id=$2`,
    [companyId, locationId],
  );
  if (!isZero(held.rows[0].qty)) {
    await client.query(
      `UPDATE warehouse_locations SET is_active=false, is_pickable=false, updated_at=now()
        WHERE company_id=$1 AND id=$2`,
      [companyId, locationId],
    );
    return { deleted: false, deactivated: true, remainingQty: held.rows[0].qty as string };
  }
  await client.query(`DELETE FROM warehouse_locations WHERE company_id=$1 AND id=$2`, [companyId, locationId]);
  return { deleted: true, deactivated: false, remainingQty: "0" };
}

/**
 * Generates a grid of bins in one go: `A-01-01-01` … `B-04-03-02`.
 *
 * Labelling a racked warehouse by hand is 300 identical forms and a typo
 * somewhere in the middle. The ranges are expanded in order, so `pick_priority`
 * comes out as the walking route and a picker's list is already sorted.
 */
export async function generateLocations(
  client: SqlClient,
  companyId: number,
  warehouseId: number,
  spec: {
    zones: string[];
    aisles: string[];
    racks?: string[];
    levels?: string[];
    positions?: string[];
    kind?: string;
    separator?: string;
    prefix?: string;
    startPriority?: number;
  },
) {
  const sep = spec.separator ?? "-";
  const racks = spec.racks?.length ? spec.racks : [null];
  const levels = spec.levels?.length ? spec.levels : [null];
  const positions = spec.positions?.length ? spec.positions : [null];
  if (!spec.zones.length || !spec.aisles.length) throw new WmsError("indique al menos una zona y un pasillo");

  const created: string[] = [];
  const skipped: string[] = [];
  let priority = spec.startPriority ?? 100;

  for (const zone of spec.zones) {
    for (const aisle of spec.aisles) {
      for (const rack of racks) {
        for (const level of levels) {
          for (const position of positions) {
            const code = normalizeCode(
              [spec.prefix, zone, aisle, rack, level, position].filter((p) => p != null && p !== "").join(sep),
            );
            const { rows } = await client.query(
              `INSERT INTO warehouse_locations
                 (company_id, warehouse_id, code, kind, zone, aisle, rack, level, position, pick_priority)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
               ON CONFLICT (company_id, warehouse_id, code) DO NOTHING
               RETURNING code`,
              [companyId, warehouseId, code, spec.kind ?? "picking", zone, aisle, rack, level, position, priority],
            );
            if (rows.length > 0) created.push(code);
            else skipped.push(code);
            priority += 1;
          }
        }
      }
    }
  }
  return { created: created.length, skipped: skipped.length, codes: created };
}

// ── placement ────────────────────────────────────────────────────────────────

/**
 * Files received goods into bins.
 *
 * The quantities must add up to what the receipt actually brought in — the
 * caller has already told the costing layer that number, and a putaway that
 * disagrees would leave the placements and the valuation permanently apart.
 * Receiving the same lot into a bin twice merges into the existing placement
 * rather than opening a second row for the same thing.
 */
export async function putaway(client: SqlClient, input: PutawayInput): Promise<{ placementIds: number[]; total: Decimal }> {
  if (input.lines.length === 0) throw new WmsError("indique al menos una ubicación de destino");
  const placementIds: number[] = [];
  let total: Decimal = "0";

  for (const line of input.lines) {
    if (isNegative(line.quantity) || isZero(line.quantity)) {
      throw new WmsError("la cantidad a ubicar debe ser positiva");
    }
    const location = await requireLocation(client, input.companyId, input.warehouseId, line.locationId);
    await assertMixingAllowed(client, input.companyId, location, input.productId);

    const placementId = await upsertPlacement(client, {
      companyId: input.companyId,
      productId: input.productId,
      warehouseId: input.warehouseId,
      locationId: line.locationId,
      lotId: input.lotId ?? null,
      lotNo: line.lotNo ?? null,
      expirationDate: line.expirationDate ?? null,
      receivedDate: input.receivedDate,
      quantity: line.quantity,
      unitCost: input.unitCost ?? "0",
      status: line.status ?? "available",
    });
    placementIds.push(placementId);
    total = add(total, line.quantity);

    await recordMove(client, {
      companyId: input.companyId, productId: input.productId, warehouseId: input.warehouseId,
      fromLocationId: null, toLocationId: line.locationId, kind: "putaway", quantity: line.quantity,
      lotNo: line.lotNo ?? null, expirationDate: line.expirationDate ?? null,
      sourceType: input.sourceType, sourceId: input.sourceId, userId: input.userId,
    });
  }

  return { placementIds, total };
}

/**
 * Moves stock from one bin to another. Nothing is created or destroyed and no
 * journal entry is written — the value stays in the same warehouse, on a
 * different shelf.
 */
export async function moveStock(
  client: SqlClient,
  input: {
    companyId: number;
    placementId: number;
    toLocationId: number;
    quantity: Decimal;
    notes?: string;
    userId?: number;
  },
) {
  if (isNegative(input.quantity) || isZero(input.quantity)) {
    throw new WmsError("la cantidad a mover debe ser positiva");
  }
  const source = await lockPlacement(client, input.companyId, input.placementId);
  const available = sub(source.quantity, source.reserved_qty);
  if (cmp(input.quantity, available) > 0) {
    throw new WmsError(
      `la ubicación ${source.location_code} tiene ${available} disponibles y se intentan mover ${input.quantity}`,
    );
  }
  if (Number(source.location_id) === input.toLocationId) {
    throw new WmsError("la ubicación de origen y la de destino son la misma");
  }
  const target = await requireLocation(client, input.companyId, Number(source.warehouse_id), input.toLocationId);
  await assertMixingAllowed(client, input.companyId, target, Number(source.product_id));

  await client.query(
    `UPDATE inventory_placements SET quantity = quantity - $2::numeric, updated_at = now() WHERE id=$1`,
    [input.placementId, input.quantity],
  );
  await upsertPlacement(client, {
    companyId: input.companyId,
    productId: Number(source.product_id),
    warehouseId: Number(source.warehouse_id),
    locationId: input.toLocationId,
    lotId: source.lot_id === null ? null : Number(source.lot_id),
    lotNo: source.lot_no,
    expirationDate: source.expiration_date,
    receivedDate: source.received_date,
    quantity: input.quantity,
    unitCost: source.unit_cost,
    status: source.status,
  });
  await deleteIfEmpty(client, input.companyId, input.placementId);

  await recordMove(client, {
    companyId: input.companyId, productId: Number(source.product_id), warehouseId: Number(source.warehouse_id),
    fromLocationId: Number(source.location_id), toLocationId: input.toLocationId, kind: "move",
    quantity: input.quantity, lotNo: source.lot_no, expirationDate: source.expiration_date,
    notes: input.notes, userId: input.userId,
  });

  return { moved: input.quantity, from: source.location_code as string };
}

// ── picking: FIFO / FEFO ─────────────────────────────────────────────────────

/**
 * Proposes where to pick a quantity from, in rotation order.
 *
 * FEFO first when the warehouse rotates that way: earliest expiry, undated stock
 * last, ties broken by receipt date. Quarantine and damaged bins are excluded —
 * stock held for inspection must not walk out on a sale, which is the entire
 * reason those bins exist. Non-pickable bins (bulk reserve) are offered only
 * after the pickable faces are exhausted, so a picker is sent to the racking
 * only when the shelf cannot cover the order.
 *
 * Returns what it could allocate even when that is less than asked, with
 * `shortfall` saying how much it could not find — the caller decides whether a
 * partial pick is acceptable.
 */
export async function pickPlan(
  client: SqlClient,
  input: {
    companyId: number;
    productId: number;
    warehouseId: number;
    quantity: Decimal;
    rotation?: RotationPolicy;
    /** Restricts the plan to these bins, for a zone-picking run. */
    locationIds?: number[];
    /** Today, for flagging goods already expired. Defaults to the DB's date. */
    asOf?: string;
  },
): Promise<{ rotation: RotationPolicy; allocations: PickAllocation[]; allocated: Decimal; shortfall: Decimal }> {
  const config = await warehouseConfig(client, input.warehouseId);
  const rotation = input.rotation ?? config.rotationPolicy;

  const order =
    rotation === "fefo"
      ? `ORDER BY l.is_pickable DESC, p.expiration_date ASC NULLS LAST, p.received_date ASC, l.pick_priority, p.id`
      : `ORDER BY l.is_pickable DESC, p.received_date ASC, p.expiration_date ASC NULLS LAST, l.pick_priority, p.id`;

  const { rows } = await client.query(
    `SELECT p.id, p.location_id, l.code AS location_code, p.lot_no, p.expiration_date::text,
            p.received_date::text, p.unit_cost::text,
            (p.quantity - p.reserved_qty)::text AS available_qty,
            (p.expiration_date IS NOT NULL AND p.expiration_date < coalesce($5::date, current_date)) AS is_expired
       FROM inventory_placements p
       JOIN warehouse_locations l ON l.id = p.location_id
      WHERE p.company_id=$1 AND p.product_id=$2 AND p.warehouse_id=$3
        AND p.status = 'available' AND l.is_active
        AND l.kind NOT IN ('quarantine','damaged')
        AND p.quantity > p.reserved_qty
        AND ($4::bigint[] IS NULL OR p.location_id = ANY($4::bigint[]))
      ${order}`,
    [
      input.companyId, input.productId, input.warehouseId,
      input.locationIds?.length ? input.locationIds : null,
      input.asOf ?? null,
    ],
  );

  const allocations: PickAllocation[] = [];
  let need = input.quantity;
  for (const r of rows) {
    if (cmp(need, "0") <= 0) break;
    const available = r.available_qty as Decimal;
    const take = cmp(available, need) <= 0 ? available : need;
    allocations.push({
      placementId: Number(r.id),
      locationId: Number(r.location_id),
      locationCode: r.location_code,
      lotNo: r.lot_no,
      expirationDate: r.expiration_date,
      receivedDate: r.received_date,
      quantity: take,
      availableQty: available,
      unitCost: r.unit_cost,
      isExpired: r.is_expired === true,
    });
    need = sub(need, take);
  }

  return {
    rotation,
    allocations,
    allocated: sub(input.quantity, need),
    shortfall: cmp(need, "0") > 0 ? need : "0",
  };
}

/**
 * Executes a pick: takes the units out of the bins the plan chose.
 *
 * This does not touch the ledger — the caller (a sale, an issue) books the cost
 * through `InventoryCosting.issue`, and this only records that the units left
 * these particular shelves. Ordering the two matters: the cost is what the sale
 * recognises, the placement is what the picker walks to.
 *
 * `allowPartial` decides what happens when the bins cannot cover the quantity.
 * The default refuses, because silently shipping less than was sold is a problem
 * that surfaces at the customer rather than here.
 */
export async function consumePlacements(
  client: SqlClient,
  input: {
    companyId: number;
    productId: number;
    warehouseId: number;
    quantity: Decimal;
    rotation?: RotationPolicy;
    allowPartial?: boolean;
    allocations?: { placementId: number; quantity: Decimal }[];
    sourceType?: string;
    sourceId?: string;
    userId?: number;
  },
): Promise<{ picked: Decimal; shortfall: Decimal; lines: PickAllocation[] }> {
  // An explicit allocation is a picker saying "I took it from here", which beats
  // any plan; without one, follow the warehouse's rotation.
  let lines: PickAllocation[];
  if (input.allocations?.length) {
    lines = [];
    for (const a of input.allocations) {
      const p = await lockPlacement(client, input.companyId, a.placementId);
      lines.push({
        placementId: a.placementId, locationId: Number(p.location_id), locationCode: p.location_code,
        lotNo: p.lot_no, expirationDate: p.expiration_date, receivedDate: p.received_date,
        quantity: a.quantity, availableQty: sub(p.quantity, p.reserved_qty), unitCost: p.unit_cost,
        isExpired: false,
      });
    }
  } else {
    const plan = await pickPlan(client, input);
    if (cmp(plan.shortfall, "0") > 0 && !input.allowPartial) {
      throw new WmsError(
        `las ubicaciones del almacén sólo cubren ${plan.allocated} de ${input.quantity} unidades del producto ${input.productId}`,
      );
    }
    lines = plan.allocations;
  }

  let picked: Decimal = "0";
  for (const line of lines) {
    const updated = await client.query(
      `UPDATE inventory_placements
          SET quantity = quantity - $3::numeric, updated_at = now()
        WHERE company_id=$1 AND id=$2 AND quantity - reserved_qty >= $3::numeric
        RETURNING id`,
      [input.companyId, line.placementId, line.quantity],
    );
    if (updated.rows.length === 0) {
      throw new WmsError(`la ubicación ${line.locationCode} ya no tiene ${line.quantity} unidades disponibles`);
    }
    await deleteIfEmpty(client, input.companyId, line.placementId);
    await recordMove(client, {
      companyId: input.companyId, productId: input.productId, warehouseId: input.warehouseId,
      fromLocationId: line.locationId, toLocationId: null, kind: "pick", quantity: line.quantity,
      lotNo: line.lotNo, expirationDate: line.expirationDate,
      sourceType: input.sourceType, sourceId: input.sourceId, userId: input.userId,
    });
    picked = add(picked, line.quantity);
  }

  return { picked, shortfall: sub(input.quantity, picked), lines };
}

/**
 * The bin inbound goods land in before anyone has looked at them — a return, a
 * receipt with no stated destination. Prefers the receiving dock, then staging;
 * a warehouse with neither has nowhere to file them and gets null.
 */
export async function inboundBin(client: SqlClient, companyId: number, warehouseId: number): Promise<number | null> {
  if (!warehouseId) return null;
  const { rows } = await client.query(
    `SELECT id FROM warehouse_locations
      WHERE company_id=$1 AND warehouse_id=$2 AND is_active
        AND kind IN ('receiving','staging')
      ORDER BY CASE kind WHEN 'receiving' THEN 0 ELSE 1 END, pick_priority, id
      LIMIT 1`,
    [companyId, warehouseId],
  );
  return rows.length ? Number(rows[0].id) : null;
}

// ── reporting ────────────────────────────────────────────────────────────────

/** Everything sitting in one warehouse, bin by bin. */
export async function locationStock(
  client: SqlClient,
  companyId: number,
  warehouseId: number,
  filters: { locationId?: number; productId?: number; expiringInDays?: number } = {},
) {
  const { rows } = await client.query(
    `SELECT p.id, p.product_id, pr.name AS product_name, pr.sku,
            p.location_id, l.code AS location_code, l.kind AS location_kind,
            p.lot_no, p.expiration_date::text, p.received_date::text,
            p.quantity::text, p.reserved_qty::text,
            (p.quantity - p.reserved_qty)::text AS available_qty,
            p.unit_cost::text, round(p.quantity * p.unit_cost, 4)::text AS total_value, p.status,
            CASE WHEN p.expiration_date IS NULL THEN NULL
                 ELSE (p.expiration_date - current_date) END AS days_to_expire
       FROM inventory_placements p
       JOIN warehouse_locations l ON l.id = p.location_id
       LEFT JOIN products pr ON pr.id = p.product_id
      WHERE p.company_id=$1 AND p.warehouse_id=$2 AND p.quantity > 0
        AND ($3::bigint IS NULL OR p.location_id=$3)
        AND ($4::int IS NULL OR p.product_id=$4)
        AND ($5::int IS NULL OR (p.expiration_date IS NOT NULL
                                 AND p.expiration_date <= current_date + ($5::int || ' days')::interval))
      ORDER BY l.pick_priority, l.code, pr.name, p.expiration_date NULLS LAST`,
    [
      companyId, warehouseId, filters.locationId ?? null, filters.productId ?? null,
      filters.expiringInDays ?? null,
    ],
  );
  return rows;
}

/**
 * Where the placements and the valuation disagree.
 *
 * For a WMS warehouse these two must sum to the same number. When they do not,
 * stock moved without the bins being told — a sale posted straight against the
 * valuation, an adjustment applied outside a count — and the difference is what
 * a physical count exists to resolve. Reported rather than auto-corrected, for
 * the same reason `stockReconciliation` reports: overwriting one from the other
 * destroys the evidence of which one was wrong.
 */
export async function placementDrift(client: SqlClient, companyId: number, warehouseId: number) {
  const { rows } = await client.query(
    // A full outer join, because drift runs both ways: valued stock nobody has
    // filed into a bin, and boxes on a shelf the books never heard about. The
    // second is the one worth catching — it is a receipt that was put away
    // operationally and never costed.
    `WITH val AS (
       SELECT product_id, quantity_on_hand, average_cost
         FROM inventory_valuation WHERE company_id=$1 AND warehouse_id=$2
     ),
     placed AS (
       SELECT product_id, sum(quantity) AS placed_qty,
              CASE WHEN sum(quantity) = 0 THEN 0
                   ELSE round(sum(quantity * unit_cost) / sum(quantity), 8) END AS placed_cost
         FROM inventory_placements WHERE company_id=$1 AND warehouse_id=$2
        GROUP BY product_id
     )
     SELECT coalesce(val.product_id, placed.product_id) AS product_id,
            pr.name AS product_name, pr.sku,
            coalesce(val.quantity_on_hand, 0)::text     AS valued_qty,
            coalesce(placed.placed_qty, 0)::text        AS placed_qty,
            (coalesce(placed.placed_qty, 0) - coalesce(val.quantity_on_hand, 0))::text AS difference,
            coalesce(nullif(val.average_cost, 0), placed.placed_cost, 0)::text AS unit_cost,
            round((coalesce(placed.placed_qty, 0) - coalesce(val.quantity_on_hand, 0))
                  * coalesce(nullif(val.average_cost, 0), placed.placed_cost, 0), 4)::text AS value_difference
       FROM val
       FULL OUTER JOIN placed ON placed.product_id = val.product_id
       LEFT JOIN products pr ON pr.id = coalesce(val.product_id, placed.product_id)
      WHERE coalesce(placed.placed_qty, 0) <> coalesce(val.quantity_on_hand, 0)
      ORDER BY abs(coalesce(placed.placed_qty, 0) - coalesce(val.quantity_on_hand, 0)) DESC`,
    [companyId, warehouseId],
  );
  let net: Decimal = "0";
  for (const r of rows) net = add(net, r.value_difference);
  return { differences: rows, netValueDifference: net, reconciled: rows.length === 0 };
}

/** Stock past its expiry or about to be, so it can be pulled before it is sold. */
export async function expiryReport(client: SqlClient, companyId: number, warehouseId: number, days = 30) {
  const { rows } = await client.query(
    `SELECT p.product_id, pr.name AS product_name, pr.sku, l.code AS location_code,
            p.lot_no, p.expiration_date::text, p.quantity::text,
            round(p.quantity * p.unit_cost, 4)::text AS total_value,
            (p.expiration_date - current_date) AS days_to_expire,
            (p.expiration_date < current_date) AS is_expired
       FROM inventory_placements p
       JOIN warehouse_locations l ON l.id = p.location_id
       LEFT JOIN products pr ON pr.id = p.product_id
      WHERE p.company_id=$1 AND p.warehouse_id=$2 AND p.quantity > 0
        AND p.expiration_date IS NOT NULL
        AND p.expiration_date <= current_date + ($3::int || ' days')::interval
      ORDER BY p.expiration_date, l.code`,
    [companyId, warehouseId, days],
  );
  return rows;
}

export async function locationMoves(
  client: SqlClient,
  companyId: number,
  warehouseId: number,
  filters: { productId?: number; locationId?: number; limit?: number } = {},
) {
  const { rows } = await client.query(
    `SELECT m.id, m.product_id, pr.name AS product_name, m.kind, m.quantity::text,
            m.lot_no, m.expiration_date::text, m.source_type, m.source_id, m.notes, m.created_at,
            fl.code AS from_location_code, tl.code AS to_location_code, u.name AS created_by_name
       FROM inventory_location_moves m
       LEFT JOIN warehouse_locations fl ON fl.id = m.from_location_id
       LEFT JOIN warehouse_locations tl ON tl.id = m.to_location_id
       LEFT JOIN products pr ON pr.id = m.product_id
       LEFT JOIN users u ON u.id = m.created_by
      WHERE m.company_id=$1 AND m.warehouse_id=$2
        AND ($3::int IS NULL OR m.product_id=$3)
        AND ($4::bigint IS NULL OR m.from_location_id=$4 OR m.to_location_id=$4)
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $5`,
    [companyId, warehouseId, filters.productId ?? null, filters.locationId ?? null, filters.limit ?? 200],
  );
  return rows;
}

// ── internals ────────────────────────────────────────────────────────────────

/**
 * Adds a quantity to a bin, merging into the placement already there.
 *
 * Written as an explicit find-then-write rather than `ON CONFLICT`: the
 * uniqueness that defines "the same thing in the same bin" is an expression
 * index over two nullable columns, and inferring a conflict target from that is
 * exactly the kind of SQL that works until the day a null lot number makes it
 * silently insert a duplicate instead. The `FOR UPDATE` serialises two putaways
 * racing into one bin; the index behind them stays as the last line of defence.
 *
 * `unit_cost` blends on merge — the placement's cost is reporting only, and a
 * bin holding two receipts at different costs should show what its contents
 * actually cost, not whichever arrived last.
 */
async function upsertPlacement(
  client: SqlClient,
  p: {
    companyId: number;
    productId: number;
    warehouseId: number;
    locationId: number;
    lotId: number | null;
    lotNo: string | null;
    expirationDate: string | null;
    receivedDate: string;
    quantity: Decimal;
    unitCost: Decimal;
    status: string;
  },
): Promise<number> {
  const existing = await client.query(
    `SELECT id FROM inventory_placements
      WHERE company_id=$1 AND warehouse_id=$2 AND location_id=$3 AND product_id=$4
        AND status=$5
        AND coalesce(lot_no,'') = coalesce($6,'')
        AND coalesce(expiration_date, DATE '0001-01-01') = coalesce($7::date, DATE '0001-01-01')
      FOR UPDATE`,
    [p.companyId, p.warehouseId, p.locationId, p.productId, p.status, p.lotNo, p.expirationDate],
  );

  if (existing.rows.length > 0) {
    const id = Number(existing.rows[0].id);
    await client.query(
      `UPDATE inventory_placements SET
         quantity   = quantity + $2::numeric,
         -- Keep the oldest receipt date: FIFO inside a merged bin dates from when
         -- the first of those units arrived, not from the latest top-up.
         received_date = least(received_date, $3::date),
         lot_id     = coalesce(lot_id, $4),
         unit_cost  = CASE WHEN quantity + $2::numeric = 0 THEN $5::numeric
                           ELSE round((quantity * unit_cost + $2::numeric * $5::numeric)
                                      / (quantity + $2::numeric), 8) END,
         updated_at = now()
       WHERE id=$1`,
      [id, p.quantity, p.receivedDate, p.lotId, p.unitCost],
    );
    return id;
  }

  const { rows } = await client.query(
    `INSERT INTO inventory_placements
       (company_id, product_id, warehouse_id, location_id, lot_id, lot_no, expiration_date,
        received_date, quantity, unit_cost, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      p.companyId, p.productId, p.warehouseId, p.locationId, p.lotId, p.lotNo, p.expirationDate,
      p.receivedDate, p.quantity, p.unitCost, p.status,
    ],
  );
  return Number(rows[0].id);
}

/**
 * Sets a bin to an absolute quantity, creating the placement if the counter
 * found something the system had no record of.
 *
 * The count is the only caller: everywhere else stock arrives or leaves in
 * deltas, but a count states what is there. Setting rather than adding is what
 * makes applying the same sheet twice a no-op.
 */
export async function setPlacementQuantity(
  client: SqlClient,
  p: {
    companyId: number;
    productId: number;
    warehouseId: number;
    locationId: number;
    lotNo: string | null;
    expirationDate: string | null;
    receivedDate: string;
    quantity: Decimal;
    unitCost: Decimal;
  },
): Promise<number> {
  const id = await upsertPlacement(client, { ...p, lotId: null, quantity: "0", status: "available" });
  await client.query(
    `UPDATE inventory_placements
        SET quantity = greatest($2::numeric, reserved_qty), unit_cost = $3::numeric, updated_at = now()
      WHERE company_id=$1 AND id=$4`,
    [p.companyId, p.quantity, p.unitCost, id],
  );
  await client.query(
    `DELETE FROM inventory_placements
      WHERE company_id=$1 AND id=$2 AND quantity = 0 AND reserved_qty = 0`,
    [p.companyId, id],
  );
  return id;
}

export async function recordMove(
  client: SqlClient,
  m: {
    companyId: number;
    productId: number;
    warehouseId: number;
    fromLocationId: number | null;
    toLocationId: number | null;
    kind: string;
    quantity: Decimal;
    lotNo?: string | null;
    expirationDate?: string | null;
    sourceType?: string;
    sourceId?: string;
    notes?: string;
    userId?: number;
  },
) {
  await client.query(
    `INSERT INTO inventory_location_moves
       (company_id, product_id, warehouse_id, from_location_id, to_location_id, kind, quantity,
        lot_no, expiration_date, source_type, source_id, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      m.companyId, m.productId, m.warehouseId, m.fromLocationId, m.toLocationId, m.kind, m.quantity,
      m.lotNo ?? null, m.expirationDate ?? null, m.sourceType ?? null, m.sourceId ?? null,
      m.notes ?? null, m.userId ?? null,
    ],
  );
}

async function requireLocation(client: SqlClient, companyId: number, warehouseId: number, locationId: number) {
  const { rows } = await client.query(
    `SELECT id, code, kind, is_active, allow_mixed_products, max_qty::text
       FROM warehouse_locations WHERE company_id=$1 AND id=$2 AND warehouse_id=$3`,
    [companyId, locationId, warehouseId],
  );
  if (rows.length === 0) throw new WmsError(`la ubicación ${locationId} no pertenece a este almacén`);
  if (rows[0].is_active !== true) throw new WmsError(`la ubicación ${rows[0].code} está inactiva`);
  return rows[0];
}

/**
 * A single-SKU bin is what makes a count fast and a mis-pick obvious. Enforced
 * on the way in, because discovering a second product in a dedicated bin is a
 * problem for whoever counts it three months later.
 */
async function assertMixingAllowed(client: SqlClient, companyId: number, location: any, productId: number) {
  if (location.allow_mixed_products === true) return;
  const { rows } = await client.query(
    `SELECT DISTINCT product_id FROM inventory_placements
      WHERE company_id=$1 AND location_id=$2 AND quantity > 0 AND product_id <> $3 LIMIT 1`,
    [companyId, location.id, productId],
  );
  if (rows.length > 0) {
    throw new WmsError(
      `la ubicación ${location.code} no admite mezcla y ya contiene el producto ${rows[0].product_id}`,
    );
  }
}

async function lockPlacement(client: SqlClient, companyId: number, placementId: number) {
  const { rows } = await client.query(
    `SELECT p.id, p.product_id, p.warehouse_id, p.location_id, p.lot_id, p.lot_no,
            p.expiration_date::text, p.received_date::text, p.quantity::text, p.reserved_qty::text,
            p.unit_cost::text, p.status, l.code AS location_code
       FROM inventory_placements p
       JOIN warehouse_locations l ON l.id = p.location_id
      WHERE p.company_id=$1 AND p.id=$2 FOR UPDATE OF p`,
    [companyId, placementId],
  );
  if (rows.length === 0) throw new WmsError(`la ubicación con existencia ${placementId} no existe`);
  return rows[0];
}

/** An emptied placement is removed so bins do not fill up with zero rows. */
async function deleteIfEmpty(client: SqlClient, companyId: number, placementId: number) {
  await client.query(
    `DELETE FROM inventory_placements
      WHERE company_id=$1 AND id=$2 AND quantity = 0 AND reserved_qty = 0`,
    [companyId, placementId],
  );
}

const normalizeCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, "-");
