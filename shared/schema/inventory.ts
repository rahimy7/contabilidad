import {
  pgTable,
  bigserial,
  bigint,
  integer,
  text,
  date,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
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
    originalQty: quantity("original_qty").notNull(),
    remainingQty: quantity("remaining_qty").notNull(),
    unitCost: fxRate("unit_cost").notNull(),
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("inventory_lots_fifo_idx").on(t.companyId, t.productId, t.warehouseId, t.receivedDate, t.id)],
);

export const inventoryCostMovements = pgTable(
  "inventory_cost_movements",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
    productId: integer("product_id").notNull(),
    warehouseId: integer("warehouse_id").notNull().default(0),
    movementDate: date("movement_date").notNull(),
    /** receipt | issue | return | transfer_in | transfer_out | adjustment */
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

export type InventoryValuation = typeof inventoryValuation.$inferSelect;
export type InventoryCostMovement = typeof inventoryCostMovements.$inferSelect;
export type InventoryLot = typeof inventoryLots.$inferSelect;
