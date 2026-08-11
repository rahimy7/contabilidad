import {
  pgTable,
  bigserial,
  bigint,
  boolean,
  integer,
  jsonb,
  text,
  date,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { money, quantity, fxRate } from "./columns";
import { companies } from "./core";
import { journalEntries } from "./accounting";

/**
 * Inventory costing: what stock is worth, and the cost of what leaves.
 *
 * The legacy `inventory_movements`/`warehouse_stock` tables count units; they
 * carry no cost, so nothing recognises cost of goods sold. This is the valuation
 * layer. Each product keeps a running quantity and weighted-average unit cost;
 * a receipt raises the average, an issue leaves it unchanged and books COGS at
 * that average. The sum of every product's value reconciles to the Inventory
 * control account (1.1.03.001) — the same relationship AR has with Clientes.
 *
 * Weighted average is the method here (NIIF-friendly, the DR SMB default). FIFO
 * would layer the cost lots instead; the movement ledger is shaped to allow that
 * later without changing the valuation row.
 *
 * `product_id` is the catalog id, kept without a hard FK so this layer does not
 * couple to the 30-column legacy `products` table; the valuation is keyed by it.
 */

export const inventoryValuation = pgTable(
  "inventory_valuation",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    productId: integer("product_id").notNull(),
    /**
     * The physical warehouse this stock sits in (`warehouses.id`), or 0 when the
     * company keeps one undivided store. Value is tracked per warehouse, so each
     * bodega has its own quantity and cost; the sum across warehouses is what
     * reconciles to the control account.
     */
    warehouseId: integer("warehouse_id").notNull().default(0),
    quantityOnHand: quantity("quantity_on_hand").notNull().default("0"),
    /** Weighted-average unit cost; 8 decimals so repeated receipts do not drift. */
    averageCost: fxRate("average_cost").notNull().default("0"),
    /** quantityOnHand × averageCost, maintained so reports never recompute it. */
    totalValue: money("total_value").notNull().default("0"),
    /** average | fifo — fixed on first receipt; issues honour it. */
    costingMethod: text("costing_method").notNull().default("average"),
    /**
     * The control account this product's stock rolls up into: merchandise for
     * sale in 1.1.03.001, consumable supplies in 1.1.03.002. Set on first
     * receipt; the postings and the reconciliation follow it.
     */
    inventoryAccount: text("inventory_account").notNull().default("1.1.03.001"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("inventory_valuation_product_uq").on(t.companyId, t.productId, t.warehouseId)],
);

/**
 * Cost layers for FIFO. A receipt opens a lot; an issue consumes the oldest open
 * lots first, and the cost of goods sold is the sum of the layers it drains.
 * Weighted-average products keep no lots — `inventory_valuation` is enough for
 * them. `total_value` on the valuation always equals the sum of open lots'
 * `remaining_qty × unit_cost`, so both methods reconcile to the same ledger.
 */
export const inventoryLots = pgTable(
  "inventory_lots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    productId: integer("product_id").notNull(),
    /** Layers belong to a warehouse: FIFO drains the oldest lot *in that bodega*. */
    warehouseId: integer("warehouse_id").notNull().default(0),
    receivedDate: date("received_date").notNull(),
    /** Optional supplier/lot reference for traceability. */
    lotNo: text("lot_no"),
    /**
     * Expiry of the goods in this layer. FEFO drains the earliest date first,
     * which for perishables is the rotation that matters — the oldest receipt is
     * not always the one closest to expiring. Null = does not expire, and sorts
     * last under FEFO so dated stock always leaves before undated stock.
     */
    expirationDate: date("expiration_date"),
    originalQty: quantity("original_qty").notNull(),
    remainingQty: quantity("remaining_qty").notNull(),
    unitCost: fxRate("unit_cost").notNull(),
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inventory_lots_fifo_idx").on(t.companyId, t.productId, t.warehouseId, t.receivedDate, t.id),
    index("inventory_lots_fefo_idx").on(t.companyId, t.productId, t.warehouseId, t.expirationDate, t.id),
  ],
);

export const inventoryCostMovements = pgTable(
  "inventory_cost_movements",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    productId: integer("product_id").notNull(),
    warehouseId: integer("warehouse_id").notNull().default(0),
    movementDate: date("movement_date").notNull(),
    /**
     * receipt | issue | return | transfer_in | transfer_out |
     * adjustment_in | adjustment_out — the last two are a physical count putting
     * the books right, kept apart from an issue so shrinkage never reads as a
     * sale in the margin report.
     */
    kind: text("kind").notNull(),
    /** Positive magnitude; `kind` carries the direction. */
    quantity: quantity("quantity").notNull(),
    /** Unit cost applied: the receipt's cost, or the average cost on an issue. */
    unitCost: fxRate("unit_cost").notNull(),
    totalCost: money("total_cost").notNull(),
    /** Running balances after this movement — the kardex. */
    balanceQty: quantity("balance_qty").notNull(),
    balanceValue: money("balance_value").notNull(),
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    journalEntryId: bigint("journal_entry_id", { mode: "number" }).references(() => journalEntries.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("inventory_cost_movements_product_idx").on(t.companyId, t.productId, t.movementDate)],
);

/**
 * ── WMS: where the goods physically are ─────────────────────────────────────
 *
 * The costing layer above answers "how much is this stock worth". It has no
 * opinion about which shelf the boxes sit on, and it should not: a company with
 * one room and a clipboard values its inventory exactly the same way as one with
 * a racked warehouse. So placement is a separate, *optional* layer — a warehouse
 * turns it on (`warehouses.wms_enabled`) and only then do locations exist for it.
 *
 * Nothing below writes to the ledger. Moving a box from A-01 to B-04 changes
 * where it is, not what it cost; the journal never hears about it. The one place
 * the two layers meet is the physical count, which discovers that the shelf and
 * the books disagree and posts an adjustment on purpose.
 */

/**
 * A bin, shelf, rack level or staging area inside a warehouse.
 *
 * `code` is what is printed on the label and scanned by the picker, unique per
 * warehouse. The zone/aisle/rack/level/position columns exist so the same code
 * can be sorted into a walking route and generated in bulk; a company that just
 * wants "Estante 1", "Nevera", "Vitrina" can leave every one of them null.
 */
export const warehouseLocations = pgTable(
  "warehouse_locations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    /** `warehouses.id` — the bodega this bin belongs to. */
    warehouseId: integer("warehouse_id").notNull(),
    /** Scannable label, e.g. `A-01-02-03`. Unique within the warehouse. */
    code: text("code").notNull(),
    name: text("name"),
    /** Barcode/QR when it differs from the code itself. */
    barcode: text("barcode"),
    /**
     * picking  — the face a picker draws from
     * bulk     — reserve/overstock, replenishes picking
     * receiving / staging — inbound and outbound docks, stock in transit
     * quarantine — held pending inspection; never picked for a sale
     * damaged  — merma awaiting write-off; never picked for a sale
     */
    kind: text("kind").notNull().default("picking"),
    zone: text("zone"),
    aisle: text("aisle"),
    rack: text("rack"),
    level: text("level"),
    position: text("position"),
    /** Walking order. Picks are proposed in this sequence so a route is one pass. */
    pickPriority: integer("pick_priority").notNull().default(100),
    /** False for quarantine/damaged bins and anything temporarily blocked. */
    isPickable: boolean("is_pickable").notNull().default(true),
    /** Whether one bin may hold more than one product. Single-SKU bins count faster. */
    allowMixedProducts: boolean("allow_mixed_products").notNull().default(true),
    /** Optional ceiling in base units; the putaway warns rather than blocks. */
    maxQty: quantity("max_qty"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("warehouse_locations_code_uq").on(t.companyId, t.warehouseId, t.code),
    index("warehouse_locations_route_idx").on(t.companyId, t.warehouseId, t.pickPriority, t.code),
  ],
);

/**
 * How much of a product sits in one bin, under one lot and expiry.
 *
 * This is the physical counterpart of `inventory_valuation`: the valuation says
 * a warehouse holds 40 units, the placements say where those 40 units are. The
 * invariant is that for a WMS warehouse the placements sum to the valuation's
 * quantity — when they stop agreeing, someone moved stock without telling the
 * system, and the count is what puts it right.
 *
 * It is kept apart from `inventory_lots` because lots only exist for FIFO
 * products, while placement has to work for every product regardless of costing
 * method. `lotId` links the two when both exist, so a FEFO pick can drain the
 * matching cost layer instead of guessing.
 */
export const inventoryPlacements = pgTable(
  "inventory_placements",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    productId: integer("product_id").notNull(),
    warehouseId: integer("warehouse_id").notNull(),
    locationId: bigint("location_id", { mode: "number" })
      .references(() => warehouseLocations.id, { onDelete: "restrict" })
      .notNull(),
    /** The cost layer these units belong to, when the product is costed FIFO. */
    lotId: bigint("lot_id", { mode: "number" }).references(() => inventoryLots.id, { onDelete: "set null" }),
    /** Supplier lot/batch. Two receipts of the same lot into one bin merge. */
    lotNo: text("lot_no"),
    expirationDate: date("expiration_date"),
    /** Drives FIFO when there is no expiry to sort on. */
    receivedDate: date("received_date").notNull(),
    quantity: quantity("quantity").notNull().default("0"),
    /**
     * Units promised to an order but not yet picked. Available = quantity −
     * reserved, so two pickers cannot be sent to the same box.
     */
    reservedQty: quantity("reserved_qty").notNull().default("0"),
    /**
     * Unit cost carried for reporting only — the valuation remains the authority.
     * A count variance is priced from here so the value shown to the counter
     * matches what the adjustment will post.
     */
    unitCost: fxRate("unit_cost").notNull().default("0"),
    /** available | quarantine | damaged — mirrors the bin but set per placement. */
    status: text("status").notNull().default("available"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The key coalesces the two nullable parts because Postgres treats every
    // null as distinct: without this, "same bin, same product, no lot" would
    // insert a fresh row on every receipt and the bin would quietly accumulate
    // duplicate placements of the same thing.
    uniqueIndex("inventory_placements_bin_uq").on(
      t.companyId, t.warehouseId, t.locationId, t.productId, t.status,
      sql`coalesce(${t.lotNo}, '')`,
      sql`coalesce(${t.expirationDate}, DATE '0001-01-01')`,
    ),
    index("inventory_placements_pick_idx").on(
      t.companyId, t.productId, t.warehouseId, t.expirationDate, t.receivedDate,
    ),
    index("inventory_placements_location_idx").on(t.companyId, t.locationId),
  ],
);

/**
 * The WMS audit trail: every unit that entered, left or crossed a bin.
 *
 * Separate from `inventory_cost_movements` because it answers a different
 * question — that one is the kardex an accountant reads, this is the one a
 * warehouse manager reads when a box is missing. A transfer between bins writes
 * two rows here and nothing at all to the ledger.
 */
export const inventoryLocationMoves = pgTable(
  "inventory_location_moves",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    productId: integer("product_id").notNull(),
    warehouseId: integer("warehouse_id").notNull(),
    /** Null on a putaway (came from outside) — otherwise the bin drawn from. */
    fromLocationId: bigint("from_location_id", { mode: "number" }).references(() => warehouseLocations.id),
    /** Null on a pick (left the building) — otherwise the bin filled. */
    toLocationId: bigint("to_location_id", { mode: "number" }).references(() => warehouseLocations.id),
    /** putaway | pick | move | count_adjust | return */
    kind: text("kind").notNull(),
    quantity: quantity("quantity").notNull(),
    lotNo: text("lot_no"),
    expirationDate: date("expiration_date"),
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    notes: text("notes"),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inventory_location_moves_wh_idx").on(t.companyId, t.warehouseId, t.createdAt),
    index("inventory_location_moves_product_idx").on(t.companyId, t.productId, t.createdAt),
  ],
);

/**
 * ── Physical count / audit ──────────────────────────────────────────────────
 *
 * A count is a document, not a button. It is opened with a scope and a frozen
 * snapshot of what the system believes; people then walk the bins and record
 * what is actually there; a supervisor reviews the variances; and only on
 * *apply* does anything change — placements are rectified and the value of the
 * difference is posted to the ledger in one journal entry per count.
 *
 * The snapshot is what makes the count defensible: without it, stock that moves
 * during the count silently changes the expected quantity and every variance
 * becomes an argument. `expected_qty` is copied at open and never touched again,
 * so the count line is evidence of what the books said at that moment.
 */
export const inventoryCounts = pgTable(
  "inventory_counts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    warehouseId: integer("warehouse_id").notNull(),
    /** Sequential per company: CONT-2026-0001. */
    countNo: text("count_no").notNull(),
    name: text("name"),
    /** full — the whole warehouse | cycle — a rotating subset | spot — a few bins */
    countType: text("count_type").notNull().default("cycle"),
    /**
     * A blind count hides the expected quantity from the counter, so what is
     * written down is what was seen rather than what was expected to be seen.
     * It is the difference between a count and a rubber stamp.
     */
    isBlind: boolean("is_blind").notNull().default(true),
    /** open | counting | review | applied | cancelled */
    status: text("status").notNull().default("open"),
    /** Bins in scope; empty = every active bin of the warehouse. */
    locationIds: jsonb("location_ids").notNull().default([]),
    /** Products in scope; empty = everything found in those bins. */
    productIds: jsonb("product_ids").notNull().default([]),
    scheduledDate: date("scheduled_date"),
    /** Accounting date the adjustment posts on. */
    countDate: date("count_date").notNull(),
    totalLines: integer("total_lines").notNull().default(0),
    countedLines: integer("counted_lines").notNull().default(0),
    varianceLines: integer("variance_lines").notNull().default(0),
    surplusValue: money("surplus_value").notNull().default("0"),
    shortageValue: money("shortage_value").notNull().default("0"),
    netValue: money("net_value").notNull().default("0"),
    notes: text("notes"),
    createdBy: integer("created_by"),
    reviewedBy: integer("reviewed_by"),
    appliedBy: integer("applied_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    countedAt: timestamp("counted_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /** The single journal entry the applied variances posted to. */
    journalEntryId: bigint("journal_entry_id", { mode: "number" }).references(() => journalEntries.id),
  },
  (t) => [
    uniqueIndex("inventory_counts_no_uq").on(t.companyId, t.countNo),
    index("inventory_counts_wh_idx").on(t.companyId, t.warehouseId, t.status),
  ],
);

export const inventoryCountLines = pgTable(
  "inventory_count_lines",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    countId: bigint("count_id", { mode: "number" })
      .references(() => inventoryCounts.id, { onDelete: "cascade" })
      .notNull(),
    productId: integer("product_id").notNull(),
    /** Denormalised so the sheet survives a product rename or deletion. */
    productName: text("product_name"),
    sku: text("sku"),
    locationId: bigint("location_id", { mode: "number" }).references(() => warehouseLocations.id),
    locationCode: text("location_code"),
    /** The placement this line audits; null when the counter found something unexpected. */
    placementId: bigint("placement_id", { mode: "number" }).references(() => inventoryPlacements.id, {
      onDelete: "set null",
    }),
    lotNo: text("lot_no"),
    expirationDate: date("expiration_date"),
    /** Frozen at open. Never updated — the variance is measured against this. */
    expectedQty: quantity("expected_qty").notNull().default("0"),
    /** Null until someone actually counts the bin; 0 means "counted, found none". */
    countedQty: quantity("counted_qty"),
    /** A second pass on a disputed line. When present it, not `countedQty`, wins. */
    recountQty: quantity("recount_qty"),
    variance: quantity("variance").notNull().default("0"),
    unitCost: fxRate("unit_cost").notNull().default("0"),
    varianceValue: money("variance_value").notNull().default("0"),
    /** pending | counted | recount | approved | rejected */
    status: text("status").notNull().default("pending"),
    /** Why the stock was missing: rotura, vencimiento, robo, error de digitación… */
    reason: text("reason"),
    notes: text("notes"),
    countedBy: integer("counted_by"),
    countedAt: timestamp("counted_at", { withTimezone: true }),
    /** The cost movement the applied variance produced, for the audit trail. */
    movementId: bigint("movement_id", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inventory_count_lines_count_idx").on(t.countId, t.locationId, t.productId),
    index("inventory_count_lines_status_idx").on(t.companyId, t.countId, t.status),
  ],
);

export type InventoryValuation = typeof inventoryValuation.$inferSelect;
export type InventoryCostMovement = typeof inventoryCostMovements.$inferSelect;
export type InventoryLot = typeof inventoryLots.$inferSelect;
export type WarehouseLocation = typeof warehouseLocations.$inferSelect;
export type InventoryPlacement = typeof inventoryPlacements.$inferSelect;
export type InventoryLocationMove = typeof inventoryLocationMoves.$inferSelect;
export type InventoryCount = typeof inventoryCounts.$inferSelect;
export type InventoryCountLine = typeof inventoryCountLines.$inferSelect;
