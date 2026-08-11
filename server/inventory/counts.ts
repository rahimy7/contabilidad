import { SqlClient } from "../accounting/types";
import { PostingEngine } from "../accounting/posting-engine";
import { Decimal, add, cmp, isNegative, isZero, sub, toMoney } from "../accounting/decimal";
import { InventoryCosting } from "./costing";
import { recordMove, setPlacementQuantity, warehouseConfig } from "./wms";

/**
 * Physical inventory count — the audit, and the rectification it produces.
 *
 * A count is a document with a life: it is **opened** with a scope and a frozen
 * snapshot of what the system believes, **counted** by people walking the bins,
 * **reviewed** by someone who did not count, and only then **applied**. Until it
 * is applied it changes nothing at all. That sequence is the control: a single
 * "fix the stock" button lets whoever is closest to the shortage make it
 * disappear, and there is nothing left to audit afterwards.
 *
 * Three properties this module is built around:
 *
 *   The snapshot is frozen. `expected_qty` is copied when the count opens and is
 *   never recomputed. Stock that moves mid-count does not silently reshape the
 *   variance, so every line is evidence of what the books said at that moment.
 *
 *   Counting is blind by default. The counter does not see the expected number,
 *   so what is written down is what was seen. Showing it first turns a count
 *   into a confirmation.
 *
 *   Applying is absolute, not incremental. The count states what is on the
 *   shelf and `InventoryCosting.adjust` works out the difference. A delta
 *   applied twice books the shortage twice; a target applied twice is a no-op —
 *   which is exactly what a double-clicked "aplicar" needs to be.
 *
 * A count works with or without WMS. With locations on, it counts bin by bin and
 * rectifies each placement. With them off, it counts product by product against
 * the warehouse total, which is the same count a colmado does with a clipboard.
 */

export class InventoryCountError extends Error {}

export interface CreateCountInput {
  companyId: number;
  warehouseId: number;
  countDate: string;
  name?: string;
  countType?: "full" | "cycle" | "spot";
  isBlind?: boolean;
  locationIds?: number[];
  productIds?: number[];
  scheduledDate?: string;
  notes?: string;
  userId?: number;
}

export interface CountLineEntry {
  lineId: number;
  countedQty: Decimal;
  reason?: string | null;
  notes?: string | null;
  /** True when this is a second pass over a disputed line. */
  isRecount?: boolean;
}

// ── opening a count ──────────────────────────────────────────────────────────

/**
 * Opens a count and freezes the sheet.
 *
 * Only one count may be in flight per warehouse. Two open counts over the same
 * bins produce two snapshots of the same stock, and whichever is applied second
 * measures its variance against a reality the first one already changed.
 */
export async function createCount(client: SqlClient, input: CreateCountInput) {
  const open = await client.query(
    `SELECT id, count_no FROM inventory_counts
      WHERE company_id=$1 AND warehouse_id=$2 AND status IN ('open','counting','review') LIMIT 1`,
    [input.companyId, input.warehouseId],
  );
  if (open.rows.length > 0) {
    throw new InventoryCountError(
      `el almacén ya tiene el conteo ${open.rows[0].count_no} en proceso; ciérrelo o cancélelo antes de abrir otro`,
    );
  }

  const config = await warehouseConfig(client, input.warehouseId);
  const countNo = await nextCountNo(client, input.companyId, input.countDate);
  const locationIds = input.locationIds ?? [];
  const productIds = input.productIds ?? [];

  const { rows } = await client.query(
    `INSERT INTO inventory_counts
       (company_id, warehouse_id, count_no, name, count_type, is_blind, status,
        location_ids, product_ids, scheduled_date, count_date, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'open',$7::jsonb,$8::jsonb,$9,$10,$11,$12)
     RETURNING id, count_no`,
    [
      input.companyId, input.warehouseId, countNo, input.name ?? null,
      input.countType ?? "cycle", input.isBlind ?? true,
      JSON.stringify(locationIds), JSON.stringify(productIds),
      input.scheduledDate ?? null, input.countDate, input.notes ?? null, input.userId ?? null,
    ],
  );
  const countId = Number(rows[0].id);

  const lines = config.wmsEnabled
    ? await snapshotFromPlacements(client, input, countId, locationIds, productIds)
    : await snapshotFromValuation(client, input, countId, productIds);

  await client.query(
    `UPDATE inventory_counts SET total_lines=$2 WHERE id=$1`,
    [countId, lines],
  );

  return { id: countId, countNo: rows[0].count_no as string, totalLines: lines, wmsEnabled: config.wmsEnabled };
}

/**
 * One line per placement: the count is of *bins*, and the same product in three
 * bins is three things to verify. A bin in scope holding nothing still produces
 * no line — but the counter can add one when they find stock that should not be
 * there, which is how a mis-put-away is caught.
 */
async function snapshotFromPlacements(
  client: SqlClient,
  input: CreateCountInput,
  countId: number,
  locationIds: number[],
  productIds: number[],
): Promise<number> {
  const { rowCount } = await client.query(
    `INSERT INTO inventory_count_lines
       (company_id, count_id, product_id, product_name, sku, location_id, location_code,
        placement_id, lot_no, expiration_date, expected_qty, unit_cost, status)
     SELECT $1, $2, p.product_id, pr.name, pr.sku, p.location_id, l.code,
            p.id, p.lot_no, p.expiration_date, p.quantity, p.unit_cost, 'pending'
       FROM inventory_placements p
       JOIN warehouse_locations l ON l.id = p.location_id
       LEFT JOIN products pr ON pr.id = p.product_id
      WHERE p.company_id=$1 AND p.warehouse_id=$3 AND p.quantity > 0 AND l.is_active
        AND ($4::bigint[] IS NULL OR p.location_id = ANY($4::bigint[]))
        AND ($5::int[] IS NULL OR p.product_id = ANY($5::int[]))`,
    [
      input.companyId, countId, input.warehouseId,
      locationIds.length ? locationIds : null,
      productIds.length ? productIds : null,
    ],
  );
  return rowCount ?? 0;
}

/**
 * Without WMS the unit of count is the product in the warehouse — the same sheet
 * the business used before locations existed.
 */
async function snapshotFromValuation(
  client: SqlClient,
  input: CreateCountInput,
  countId: number,
  productIds: number[],
): Promise<number> {
  const { rowCount } = await client.query(
    `INSERT INTO inventory_count_lines
       (company_id, count_id, product_id, product_name, sku, expected_qty, unit_cost, status)
     SELECT $1, $2, v.product_id, pr.name, pr.sku, v.quantity_on_hand, v.average_cost, 'pending'
       FROM inventory_valuation v
       LEFT JOIN products pr ON pr.id = v.product_id
      WHERE v.company_id=$1 AND v.warehouse_id=$3
        AND ($4::int[] IS NULL OR v.product_id = ANY($4::int[]))`,
    [input.companyId, countId, input.warehouseId, productIds.length ? productIds : null],
  );
  return rowCount ?? 0;
}

// ── counting ─────────────────────────────────────────────────────────────────

/** The sheet a counter works from. Blind counts arrive without the expected column. */
export async function getCount(client: SqlClient, companyId: number, countId: number, forCounting = false) {
  const header = await client.query(
    `SELECT c.*, w.name AS warehouse_name,
            cu.name AS created_by_name, ru.name AS reviewed_by_name, au.name AS applied_by_name
       FROM inventory_counts c
       LEFT JOIN warehouses w ON w.id = c.warehouse_id
       LEFT JOIN users cu ON cu.id = c.created_by
       LEFT JOIN users ru ON ru.id = c.reviewed_by
       LEFT JOIN users au ON au.id = c.applied_by
      WHERE c.company_id=$1 AND c.id=$2`,
    [companyId, countId],
  );
  if (header.rows.length === 0) throw new InventoryCountError("conteo no encontrado");
  const count = header.rows[0];

  // A blind count hides the expected quantity from the counting screen — but not
  // from review, where comparing the two is the entire job.
  const hideExpected = forCounting && count.is_blind === true && count.status !== "review";

  const lines = await client.query(
    `SELECT l.id, l.product_id, l.product_name, l.sku, l.location_id, l.location_code,
            l.placement_id, l.lot_no, l.expiration_date::text,
            ${hideExpected ? "NULL::text" : "l.expected_qty::text"} AS expected_qty,
            l.counted_qty::text, l.recount_qty::text,
            ${hideExpected ? "NULL::text" : "l.variance::text"} AS variance,
            l.unit_cost::text,
            ${hideExpected ? "NULL::text" : "l.variance_value::text"} AS variance_value,
            l.status, l.reason, l.notes, l.counted_at, u.name AS counted_by_name
       FROM inventory_count_lines l
       LEFT JOIN users u ON u.id = l.counted_by
      WHERE l.company_id=$1 AND l.count_id=$2
      ORDER BY l.location_code NULLS FIRST, l.product_name, l.id`,
    [companyId, countId],
  );

  return { ...count, blindActive: hideExpected, lines: lines.rows };
}

export async function listCounts(client: SqlClient, companyId: number, warehouseId?: number) {
  const { rows } = await client.query(
    `SELECT c.id, c.count_no, c.name, c.warehouse_id, w.name AS warehouse_name, c.count_type,
            c.status, c.is_blind, c.count_date, c.total_lines, c.counted_lines, c.variance_lines,
            c.surplus_value::text, c.shortage_value::text, c.net_value::text,
            c.created_at, c.applied_at, u.name AS created_by_name
       FROM inventory_counts c
       LEFT JOIN warehouses w ON w.id = c.warehouse_id
       LEFT JOIN users u ON u.id = c.created_by
      WHERE c.company_id=$1 AND ($2::int IS NULL OR c.warehouse_id=$2)
      ORDER BY c.created_at DESC
      LIMIT 100`,
    [companyId, warehouseId ?? null],
  );
  return rows;
}

/**
 * Records what was found. Recording a quantity is not applying it — the numbers
 * sit on the sheet until someone with the authority to accept a shrinkage says
 * so.
 */
export async function recordCounts(
  client: SqlClient,
  companyId: number,
  countId: number,
  entries: CountLineEntry[],
  userId?: number,
) {
  const count = await lockCount(client, companyId, countId);
  if (!["open", "counting", "review"].includes(count.status)) {
    throw new InventoryCountError(`el conteo ${count.count_no} está ${count.status} y ya no admite capturas`);
  }

  for (const entry of entries) {
    if (isNegative(entry.countedQty)) {
      throw new InventoryCountError("la cantidad contada no puede ser negativa");
    }
    const column = entry.isRecount ? "recount_qty" : "counted_qty";
    // The variance always measures the *effective* count — the recount when there
    // is one, the first pass otherwise.
    const { rowCount } = await client.query(
      `UPDATE inventory_count_lines
          SET ${column} = $3::numeric,
              variance = coalesce(${entry.isRecount ? "$3::numeric" : "recount_qty"}, $3::numeric) - expected_qty,
              variance_value = round((coalesce(${entry.isRecount ? "$3::numeric" : "recount_qty"}, $3::numeric)
                                      - expected_qty) * unit_cost, 4),
              status = CASE WHEN $6::bool THEN 'recount' ELSE 'counted' END,
              reason = coalesce($4, reason), notes = coalesce($5, notes),
              counted_by = $7, counted_at = now()
        WHERE company_id=$1 AND count_id=$2 AND id=$8`,
      [
        companyId, countId, entry.countedQty, entry.reason ?? null, entry.notes ?? null,
        entry.isRecount ?? false, userId ?? null, entry.lineId,
      ],
    );
    if (rowCount === 0) throw new InventoryCountError(`la línea ${entry.lineId} no pertenece a este conteo`);
  }

  await refreshTotals(client, companyId, countId);
  if (count.status === "open") {
    await client.query(`UPDATE inventory_counts SET status='counting' WHERE id=$1`, [countId]);
  }
  return getCount(client, companyId, countId);
}

/**
 * Adds a line for stock found where the system did not expect it.
 *
 * This is the most valuable line on any count sheet: an expected quantity of
 * zero against a real box on a real shelf is either a receipt that was never
 * recorded or a put-away into the wrong bin, and neither is visible from the
 * system's own snapshot.
 */
export async function addFoundLine(
  client: SqlClient,
  companyId: number,
  countId: number,
  input: {
    productId: number;
    locationId?: number;
    countedQty: Decimal;
    lotNo?: string | null;
    expirationDate?: string | null;
    unitCost?: Decimal;
    reason?: string;
    notes?: string;
    userId?: number;
  },
) {
  const count = await lockCount(client, companyId, countId);
  if (!["open", "counting", "review"].includes(count.status)) {
    throw new InventoryCountError(`el conteo ${count.count_no} está ${count.status}`);
  }

  // Value the find at what the warehouse already pays for that product; a product
  // never received here has no cost to inherit and the caller must state one.
  const valuation = await client.query(
    `SELECT average_cost::text FROM inventory_valuation
      WHERE company_id=$1 AND product_id=$2 AND warehouse_id=$3`,
    [companyId, input.productId, count.warehouse_id],
  );
  const unitCost = input.unitCost ?? valuation.rows[0]?.average_cost ?? "0";

  const { rows } = await client.query(
    `INSERT INTO inventory_count_lines
       (company_id, count_id, product_id, product_name, sku, location_id, location_code,
        lot_no, expiration_date, expected_qty, counted_qty, variance, unit_cost, variance_value,
        status, reason, notes, counted_by, counted_at)
     VALUES ($1, $2, $3,
             (SELECT name FROM products WHERE id=$3),
             (SELECT sku  FROM products WHERE id=$3),
             $4,
             (SELECT code FROM warehouse_locations WHERE company_id=$1 AND id=$4),
             $5, $6,
             0, $7::numeric, $7::numeric, $8::numeric, round($7::numeric * $8::numeric, 4),
             'counted', $9, $10, $11, now())
     RETURNING id`,
    [
      companyId, countId, input.productId, input.locationId ?? null, input.lotNo ?? null,
      input.expirationDate ?? null, input.countedQty, unitCost, input.reason ?? "hallazgo en conteo",
      input.notes ?? null, input.userId ?? null,
    ],
  );

  await refreshTotals(client, companyId, countId);
  return { lineId: Number(rows[0].id) };
}

/** Hands the sheet to whoever approves the variances. */
export async function submitForReview(client: SqlClient, companyId: number, countId: number, userId?: number) {
  const count = await lockCount(client, companyId, countId);
  if (!["open", "counting"].includes(count.status)) {
    throw new InventoryCountError(`el conteo ${count.count_no} está ${count.status}`);
  }
  const pending = await client.query(
    `SELECT count(*)::int AS n FROM inventory_count_lines
      WHERE company_id=$1 AND count_id=$2 AND counted_qty IS NULL`,
    [companyId, countId],
  );
  if (pending.rows[0].n > 0) {
    throw new InventoryCountError(
      `faltan ${pending.rows[0].n} línea(s) por contar; capture 0 en las ubicaciones vacías para cerrarlas`,
    );
  }
  // `reviewed_by` stays empty here on purpose: submitting is the counter's act,
  // and it is filled by whoever accepts the variances at apply time. Stamping the
  // submitter would make the sheet look reviewed by the person who wrote it.
  await client.query(
    `UPDATE inventory_counts SET status='review', counted_at=now() WHERE company_id=$1 AND id=$2`,
    [companyId, countId],
  );
  await refreshTotals(client, companyId, countId);
  return getCount(client, companyId, countId);
}

// ── applying ─────────────────────────────────────────────────────────────────

/**
 * Rectifies the inventory from the reviewed sheet.
 *
 * Two things happen, in this order and in one transaction:
 *
 *   1. The placements are set to what was counted, bin by bin. This is a pure
 *      relocation of quantities and touches no account.
 *   2. Each affected product is adjusted to its new warehouse total, which is
 *      where the money moves: the shortage to faltantes, the surplus to other
 *      income, at the cost the ledger already carries.
 *
 * Step 2 works from the *post-rectification placement sum*, not from the count
 * lines. A cycle count covers some bins and not others, so the product's true
 * new quantity is what was counted in scope plus what is still placed outside
 * it — computing it from the lines alone would wipe the stock the count never
 * looked at.
 *
 * The whole count posts one journal entry per inventory control account — one in
 * practice — rather than one per line. A 400-line count producing 400 entries
 * would be technically correct and completely unusable.
 */
export async function applyCount(
  client: SqlClient,
  companyId: number,
  countId: number,
  opts: { userId?: number; onlyApproved?: boolean } = {},
) {
  const count = await lockCount(client, companyId, countId);
  if (count.status === "applied") {
    throw new InventoryCountError(`el conteo ${count.count_no} ya fue aplicado`);
  }
  if (count.status !== "review") {
    throw new InventoryCountError(
      `el conteo ${count.count_no} debe pasar por revisión antes de aplicarse (está ${count.status})`,
    );
  }

  const warehouseId = Number(count.warehouse_id);
  const config = await warehouseConfig(client, warehouseId);
  const costing = new InventoryCosting(client);

  const lines = await client.query(
    `SELECT id, product_id, location_id, placement_id, lot_no, expiration_date::text,
            expected_qty::text, coalesce(recount_qty, counted_qty)::text AS effective_qty,
            unit_cost::text, status, reason
       FROM inventory_count_lines
      WHERE company_id=$1 AND count_id=$2 AND coalesce(recount_qty, counted_qty) IS NOT NULL
        AND ($3::bool IS NOT TRUE OR status <> 'rejected')
      ORDER BY id`,
    [companyId, countId, opts.onlyApproved ?? false],
  );

  // 1 — the shelves.
  const touched = new Map<number, { unitCost: Decimal; reason: string | null; lotNo: string | null; expiry: string | null }>();
  for (const line of lines.rows) {
    const productId = Number(line.product_id);
    if (!touched.has(productId)) {
      touched.set(productId, {
        unitCost: line.unit_cost, reason: line.reason ?? null,
        lotNo: line.lot_no ?? null, expiry: line.expiration_date ?? null,
      });
    }
    if (!config.wmsEnabled || !line.location_id) continue;
    await rectifyPlacement(client, {
      companyId, countId, countNo: count.count_no, warehouseId, line,
      countDate: count.count_date, userId: opts.userId,
    });
  }

  // 2 — the books.
  const groups = new Map<string, { shortage: Decimal; surplus: Decimal; movementIds: number[] }>();
  let surplusValue: Decimal = "0";
  let shortageValue: Decimal = "0";

  for (const [productId, meta] of touched) {
    const target = config.wmsEnabled
      ? await placedQuantity(client, companyId, productId, warehouseId)
      : countedQuantityOf(lines.rows, productId);

    const result = await costing.adjust({
      companyId, productId, date: count.count_date, countedQuantity: target,
      warehouseId, unitCost: meta.unitCost, reason: meta.reason ?? `conteo ${count.count_no}`,
      // Postings are deferred so the whole count lands in one entry rather than
      // one per product.
      post: false,
      sourceType: "inventory_count", sourceId: String(countId), postedBy: opts.userId,
      lotNo: meta.lotNo ?? undefined, expirationDate: meta.expiry,
      rotation: config.rotationPolicy,
    });
    if (result.movementId === null) continue;

    const account = await inventoryAccountOf(client, companyId, productId, warehouseId);
    const group = groups.get(account) ?? { shortage: "0", surplus: "0", movementIds: [] };
    if (isNegative(result.variance)) {
      group.shortage = add(group.shortage, result.value);
      shortageValue = add(shortageValue, result.value);
    } else {
      group.surplus = add(group.surplus, result.value);
      surplusValue = add(surplusValue, result.value);
    }
    group.movementIds.push(result.movementId);
    groups.set(account, group);

    await client.query(
      `UPDATE inventory_count_lines SET movement_id=$3
        WHERE company_id=$1 AND count_id=$2 AND product_id=$4`,
      [companyId, countId, result.movementId, productId],
    );
  }

  // 3 — one entry per control account, carrying the count's net shortage and
  // surplus as separate measures so both sides stay visible in the ledger.
  const engine = new PostingEngine(client);
  const entryIds: number[] = [];
  for (const [account, group] of groups) {
    const measures = [] as { role: string; amount: Decimal; memo: string }[];
    if (!isZero(group.shortage)) {
      measures.push({ role: "shortage", amount: toMoney(group.shortage), memo: `Faltantes conteo ${count.count_no}` });
    }
    if (!isZero(group.surplus)) {
      measures.push({ role: "surplus", amount: toMoney(group.surplus), memo: `Sobrantes conteo ${count.count_no}` });
    }
    if (measures.length === 0) continue;

    const posted = await engine.post(
      {
        companyId,
        eventType: "inventory_adjustment",
        sourceType: "inventory_count",
        // The account is part of the key so two control accounts in one count do
        // not collide on the idempotency index.
        sourceId: `${countId}:${account}`,
        entryDate: count.count_date,
        currency: "DOP",
        context: { inventoryAccount: account, warehouseId },
        measures,
        memo: `Ajuste por conteo físico ${count.count_no}`,
        postedBy: opts.userId,
      },
      "inventory_adjustment",
    );
    entryIds.push(posted.entryId);
    await client.query(
      `UPDATE inventory_cost_movements SET journal_entry_id=$1 WHERE id = ANY($2::bigint[])`,
      [posted.entryId, group.movementIds],
    );
  }

  await client.query(
    `UPDATE inventory_counts
        SET status='applied', applied_at=now(), applied_by=$3, reviewed_by=coalesce(reviewed_by, $3),
            surplus_value=$4, shortage_value=$5, net_value=$6, journal_entry_id=$7
      WHERE company_id=$1 AND id=$2`,
    [
      companyId, countId, opts.userId ?? null, toMoney(surplusValue), toMoney(shortageValue),
      toMoney(sub(surplusValue, shortageValue)), entryIds[0] ?? null,
    ],
  );

  return {
    countId,
    countNo: count.count_no as string,
    productsAdjusted: touched.size,
    surplusValue: toMoney(surplusValue),
    shortageValue: toMoney(shortageValue),
    netValue: toMoney(sub(surplusValue, shortageValue)),
    journalEntryIds: entryIds,
  };
}

export async function cancelCount(
  client: SqlClient,
  companyId: number,
  countId: number,
  reason: string,
  userId?: number,
) {
  const count = await lockCount(client, companyId, countId);
  if (count.status === "applied") {
    throw new InventoryCountError("un conteo aplicado no se cancela; corríjalo con otro conteo");
  }
  await client.query(
    `UPDATE inventory_counts
        SET status='cancelled', cancelled_at=now(),
            notes = coalesce(notes || E'\\n', '') || $3
      WHERE company_id=$1 AND id=$2`,
    [companyId, countId, `Cancelado por usuario ${userId ?? "?"}: ${reason}`],
  );
  return { cancelled: true };
}

// ── internals ────────────────────────────────────────────────────────────────

/**
 * Sets one bin to what the counter found. An existing placement is corrected; a
 * find with no placement opens one; a bin counted empty loses its row.
 */
async function rectifyPlacement(
  client: SqlClient,
  ctx: {
    companyId: number;
    countId: number;
    countNo: string;
    warehouseId: number;
    line: any;
    countDate: string;
    userId?: number;
  },
) {
  const { companyId, warehouseId, line } = ctx;
  const counted: Decimal = line.effective_qty;
  const locationId = Number(line.location_id);

  if (line.placement_id) {
    const delta = sub(counted, line.expected_qty);
    if (isZero(delta)) return;
    // `greatest(reserved_qty, …)` guards the invariant that a bin can never hold
    // less than it has already promised: units committed to an order are not
    // erased by a count that did not find them, they are a discrepancy for
    // whoever made the reservation to resolve.
    await client.query(
      `UPDATE inventory_placements
          SET quantity = greatest($3::numeric, reserved_qty), updated_at = now()
        WHERE company_id=$1 AND id=$2`,
      [companyId, line.placement_id, counted],
    );
    await client.query(
      `DELETE FROM inventory_placements
        WHERE company_id=$1 AND id=$2 AND quantity = 0 AND reserved_qty = 0`,
      [companyId, line.placement_id],
    );
    await recordMove(client, {
      companyId, productId: Number(line.product_id), warehouseId,
      fromLocationId: isNegative(delta) ? locationId : null,
      toLocationId: isNegative(delta) ? null : locationId,
      kind: "count_adjust", quantity: isNegative(delta) ? sub("0", delta) : delta,
      lotNo: line.lot_no, expirationDate: line.expiration_date,
      sourceType: "inventory_count", sourceId: String(ctx.countId),
      notes: `Conteo ${ctx.countNo}`, userId: ctx.userId,
    });
    return;
  }

  if (isZero(counted)) return;
  await setPlacementQuantity(client, {
    companyId,
    productId: Number(line.product_id),
    warehouseId,
    locationId,
    lotNo: line.lot_no ?? null,
    expirationDate: line.expiration_date ?? null,
    receivedDate: ctx.countDate,
    quantity: counted,
    unitCost: line.unit_cost,
  });
  await recordMove(client, {
    companyId, productId: Number(line.product_id), warehouseId,
    fromLocationId: null, toLocationId: locationId, kind: "count_adjust", quantity: counted,
    lotNo: line.lot_no, expirationDate: line.expiration_date,
    sourceType: "inventory_count", sourceId: String(ctx.countId),
    notes: `Hallazgo en conteo ${ctx.countNo}`, userId: ctx.userId,
  });
}

async function placedQuantity(client: SqlClient, companyId: number, productId: number, warehouseId: number): Promise<Decimal> {
  const { rows } = await client.query(
    `SELECT coalesce(sum(quantity),0)::text AS qty FROM inventory_placements
      WHERE company_id=$1 AND product_id=$2 AND warehouse_id=$3`,
    [companyId, productId, warehouseId],
  );
  return rows[0].qty as Decimal;
}

/** Without WMS every line of a product is a slice of the same warehouse total. */
function countedQuantityOf(lines: any[], productId: number): Decimal {
  let total: Decimal = "0";
  for (const l of lines) {
    if (Number(l.product_id) === productId) total = add(total, l.effective_qty);
  }
  return total;
}

async function inventoryAccountOf(
  client: SqlClient,
  companyId: number,
  productId: number,
  warehouseId: number,
): Promise<string> {
  const { rows } = await client.query(
    `SELECT inventory_account FROM inventory_valuation
      WHERE company_id=$1 AND product_id=$2 AND warehouse_id=$3`,
    [companyId, productId, warehouseId],
  );
  return rows[0]?.inventory_account ?? "1.1.03.001";
}

async function lockCount(client: SqlClient, companyId: number, countId: number) {
  const { rows } = await client.query(
    `SELECT id, count_no, status, warehouse_id, count_date::text, is_blind
       FROM inventory_counts WHERE company_id=$1 AND id=$2 FOR UPDATE`,
    [companyId, countId],
  );
  if (rows.length === 0) throw new InventoryCountError("conteo no encontrado");
  return rows[0];
}

async function refreshTotals(client: SqlClient, companyId: number, countId: number) {
  await client.query(
    `UPDATE inventory_counts c SET
       total_lines    = t.total,
       counted_lines  = t.counted,
       variance_lines = t.variances,
       surplus_value  = t.surplus,
       shortage_value = t.shortage,
       net_value      = t.surplus - t.shortage
     FROM (
       SELECT count(*)::int AS total,
              count(*) FILTER (WHERE coalesce(recount_qty, counted_qty) IS NOT NULL)::int AS counted,
              count(*) FILTER (WHERE variance <> 0)::int AS variances,
              coalesce(sum(variance_value) FILTER (WHERE variance_value > 0), 0)      AS surplus,
              coalesce(-sum(variance_value) FILTER (WHERE variance_value < 0), 0)     AS shortage
         FROM inventory_count_lines WHERE company_id=$1 AND count_id=$2
     ) t
     WHERE c.company_id=$1 AND c.id=$2`,
    [companyId, countId],
  );
}

/**
 * CONT-2026-0001, per company per year. The unique index is the real guard: two
 * counts opened in the same second read the same max, and the loser retries with
 * the next number instead of failing the request.
 */
async function nextCountNo(client: SqlClient, companyId: number, countDate: string): Promise<string> {
  const year = countDate.slice(0, 4);
  const { rows } = await client.query(
    `SELECT coalesce(max(substring(count_no from '[0-9]+$')::int), 0) AS n
       FROM inventory_counts WHERE company_id=$1 AND count_no LIKE $2`,
    [companyId, `CONT-${year}-%`],
  );
  return `CONT-${year}-${String(Number(rows[0].n) + 1).padStart(4, "0")}`;
}
