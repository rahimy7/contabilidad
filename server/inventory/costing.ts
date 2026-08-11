import { SqlClient } from "../accounting/types";
import { PostingEngine } from "../accounting/posting-engine";
import { Decimal, add, mul, neg, sub, cmp, isNegative, isZero, roundTo, toMoney } from "../accounting/decimal";

/**
 * Inventory costing: weighted-average or FIFO, per product, per warehouse.
 *
 * Stock is valued where it physically sits. Each (product, warehouse) keeps its
 * own quantity and cost, so a bodega can be valued on its own, and FIFO drains
 * the oldest layer *in that bodega* rather than somewhere across town. Companies
 * with a single undivided store use warehouse 0 and never notice.
 *
 * The costing method and the control account are properties of the *product*, not
 * of the warehouse: a product is merchandise (1.1.03.001) or a consumable supply
 * (1.1.03.002) wherever it is stored. That is what makes a transfer between
 * warehouses ledger-neutral — the value moves between subledger buckets that roll
 * up into the same account, so the account total does not change and no entry is
 * written. Sum every warehouse's value for an account and you get that account's
 * balance in the general ledger; that identity is the point of the whole module.
 *
 * Postings go through the rules engine (`inventory_receipt.cost`,
 * `inventory_issue.cogs`, `inventory_return.restock`,
 * `inventory_adjustment.shortage|surplus`), with the product's inventory account
 * travelling in the event context so the rules can route an issue to cost of
 * goods sold or, for a supply, straight to expense. A caller that already books
 * the inventory leg (the AP purchase does) passes `post: false`.
 *
 * Everything runs in the caller's transaction — the one recording the purchase,
 * the sale, or the transfer.
 */
export class InventoryCostingError extends Error {}

export type CostingMethod = "average" | "fifo";

/**
 * Which layer leaves first.
 *
 * `fifo` drains the oldest receipt; `fefo` drains the earliest expiry. They are
 * only the same when goods are received in the order they expire, which for
 * anything perishable is exactly the assumption that gets a shipment thrown
 * away. The policy is a property of the *warehouse* — a bodega of ambient dry
 * goods and a walk-in cooler rotate differently — and is read from
 * `warehouses.rotation_policy` unless the caller states it.
 *
 * It changes only the *order* layers are consumed in, never how they are
 * valued: FEFO on a weighted-average product costs the issue at the average,
 * same as always. Rotation is a warehouse decision; costing is an accounting
 * one, and conflating them would let a change in picking policy quietly restate
 * the cost of goods sold.
 */
export type RotationPolicy = "fifo" | "fefo";

export interface ReceiveInput {
  companyId: number;
  productId: number;
  date: string;
  quantity: Decimal;
  unitCost: Decimal;
  /** Physical warehouse (`warehouses.id`); 0 = the company's single store. */
  warehouseId?: number;
  /**
   * The exact value to bring in, overriding quantity × unitCost. A transfer uses
   * it to move precisely the value that left the source, so no rounding sliver
   * creates or destroys inventory value in transit.
   */
  totalCost?: Decimal;
  /** Sets the method on a product's first receipt; ignored once one exists. */
  method?: CostingMethod;
  /** Control account the stock rolls up into; set on first receipt. Default 1.1.03.001. */
  inventoryAccountRef?: string;
  lotNo?: string;
  /** False when the caller already posted the inventory leg (e.g. AP). */
  post?: boolean;
  sourceType?: string;
  sourceId?: string;
  postedBy?: number;
  /** Expiry of the goods received, when they have one. Drives FEFO. */
  expirationDate?: string | null;
}

export interface IssueInput {
  companyId: number;
  productId: number;
  date: string;
  quantity: Decimal;
  warehouseId?: number;
  post?: boolean;
  sourceType?: string;
  sourceId?: string;
  postedBy?: number;
  /** Overrides the warehouse's own rotation policy for this issue. */
  rotation?: RotationPolicy;
}

/**
 * Bringing the books in line with what a count actually found.
 *
 * `countedQuantity` is the absolute quantity on the shelf, not a delta — the
 * caller states what is there and this works out the rest. Passing a delta is
 * how a count race turns into a double adjustment: two people apply the same
 * sheet and the shortage is booked twice. An absolute target applied twice is
 * idempotent.
 */
export interface AdjustInput {
  companyId: number;
  productId: number;
  date: string;
  /** What the count found. The difference against the books is the adjustment. */
  countedQuantity: Decimal;
  warehouseId?: number;
  /** Cost to value a surplus at; defaults to the warehouse's current average. */
  unitCost?: Decimal;
  reason?: string;
  post?: boolean;
  sourceType?: string;
  sourceId?: string;
  postedBy?: number;
  /** Lot/expiry the surplus opens a layer under, for a FIFO product. */
  lotNo?: string;
  expirationDate?: string | null;
  rotation?: RotationPolicy;
}

export interface TransferInput {
  companyId: number;
  productId: number;
  date: string;
  quantity: Decimal;
  fromWarehouseId: number;
  toWarehouseId: number;
  sourceType?: string;
  sourceId?: string;
  postedBy?: number;
}

interface Balances {
  quantityOnHand: Decimal;
  averageCost: Decimal;
  totalValue: Decimal;
}

export class InventoryCosting {
  constructor(private readonly client: SqlClient) {}

  /** Brings stock into a warehouse: posts Dr Inventory / Cr Proveedores. */
  async receive(
    input: ReceiveInput,
  ): Promise<{ movementId: number; journalEntryId: number | null; balances: Balances; lotId: number | null }> {
    const { movementId, balances, value, inventoryAccount, lotId } = await this.inbound(input, "receipt");
    const journalEntryId =
      input.post === false
        ? null
        : await this.post(input, "inventory_receipt", "cost", value, movementId, "receipt", inventoryAccount);
    return { movementId, journalEntryId, balances, lotId };
  }

  /**
   * Puts returned stock back: posts Dr Inventory / Cr COGS, reversing the cost of
   * the original sale. The `unitCost` is the cost the goods left at, so the return
   * neutralises the sale's COGS exactly.
   */
  async returnToStock(
    input: ReceiveInput,
  ): Promise<{ movementId: number; journalEntryId: number | null; balances: Balances; lotId: number | null }> {
    const { movementId, balances, value, inventoryAccount, lotId } = await this.inbound(input, "return");
    const journalEntryId =
      input.post === false
        ? null
        : await this.post(input, "inventory_return", "restock", value, movementId, "return", inventoryAccount);
    return { movementId, journalEntryId, balances, lotId };
  }

  /** Takes stock out of a warehouse and books its cost (COGS, or expense for a supply). */
  async issue(input: IssueInput): Promise<{ movementId: number; journalEntryId: number | null; cogs: Decimal; balances: Balances }> {
    const { movementId, cost, balances, inventoryAccount } = await this.outbound(input, "issue");
    const journalEntryId =
      input.post === false
        ? null
        : await this.post(input, "inventory_issue", "cogs", cost, movementId, "issue", inventoryAccount);
    return { movementId, journalEntryId, cogs: cost, balances };
  }

  /**
   * Moves stock between warehouses at the cost it carried.
   *
   * No journal entry: both warehouses roll into the same control account, so the
   * ledger balance is unchanged — only the subledger buckets move. The value that
   * leaves the source is exactly the value that enters the destination (passed as
   * `totalCost`), so a transfer can never create or destroy inventory value.
   */
  async transfer(input: TransferInput): Promise<{ outMovementId: number; inMovementId: number; cost: Decimal }> {
    if (input.fromWarehouseId === input.toWarehouseId) {
      throw new InventoryCostingError("el almacén de origen y el de destino son el mismo");
    }
    const out = await this.outbound(
      {
        companyId: input.companyId, productId: input.productId, date: input.date, quantity: input.quantity,
        warehouseId: input.fromWarehouseId, sourceType: input.sourceType, sourceId: input.sourceId, postedBy: input.postedBy,
      },
      "transfer_out",
    );
    const inn = await this.inbound(
      {
        companyId: input.companyId, productId: input.productId, date: input.date, quantity: input.quantity,
        unitCost: "0", totalCost: out.cost, warehouseId: input.toWarehouseId,
        sourceType: input.sourceType, sourceId: input.sourceId, postedBy: input.postedBy,
      },
      "transfer_in",
    );
    return { outMovementId: out.movementId, inMovementId: inn.movementId, cost: out.cost };
  }

  /**
   * Writes the result of a physical count into the books.
   *
   * A shortage leaves stock without a sale, so its cost goes to the faltantes
   * expense rather than to COGS — mixing them buries shrinkage inside the gross
   * margin, which is precisely where nobody looks for it. A surplus enters at the
   * warehouse's current average cost (or a stated one) against other income,
   * because inventory that appears was understated, not earned.
   *
   * Returns `variance: 0` and posts nothing when the shelf agrees with the books,
   * which is the common case and must stay free of journal noise.
   */
  async adjust(input: AdjustInput): Promise<{
    movementId: number | null;
    journalEntryId: number | null;
    variance: Decimal;
    value: Decimal;
    balances: Balances;
  }> {
    if (isNegative(input.countedQuantity)) {
      throw new InventoryCostingError("la cantidad contada no puede ser negativa");
    }
    const warehouseId = input.warehouseId ?? 0;

    // Lock the row first: two supervisors applying the same count sheet at once
    // must serialize, or both read the same "before" and book the variance twice.
    const locked = await this.client.query(
      `SELECT quantity_on_hand::text, average_cost::text, total_value::text, costing_method, inventory_account
         FROM inventory_valuation
        WHERE company_id=$1 AND product_id=$2 AND warehouse_id=$3 FOR UPDATE`,
      [input.companyId, input.productId, warehouseId],
    );

    // Never counted before: the whole count is a surplus, and this receipt is
    // what establishes the product's costing method and control account.
    const onHand: Decimal = locked.rows.length > 0 ? locked.rows[0].quantity_on_hand : "0";
    const averageCost: Decimal = locked.rows.length > 0 ? locked.rows[0].average_cost : "0";
    const variance = sub(input.countedQuantity, onHand);

    if (isZero(variance)) {
      return {
        movementId: null,
        journalEntryId: null,
        variance: "0",
        value: "0",
        balances: {
          quantityOnHand: onHand,
          averageCost,
          totalValue: locked.rows.length > 0 ? locked.rows[0].total_value : "0",
        },
      };
    }

    const memo = input.reason ? `ajuste por conteo (${input.reason})` : "ajuste por conteo";

    if (isNegative(variance)) {
      const { movementId, cost, balances, inventoryAccount } = await this.outbound(
        {
          companyId: input.companyId, productId: input.productId, date: input.date,
          quantity: neg(variance), warehouseId, rotation: input.rotation,
          sourceType: input.sourceType, sourceId: input.sourceId, postedBy: input.postedBy,
        },
        "adjustment_out",
      );
      const journalEntryId =
        input.post === false
          ? null
          : await this.post(
              { ...input, warehouseId }, "inventory_adjustment", "shortage",
              cost, movementId, memo, inventoryAccount,
            );
      return { movementId, journalEntryId, variance, value: cost, balances };
    }

    // A surplus with no prior valuation and no stated cost would enter at zero and
    // silently understate inventory; make the caller say what it is worth.
    const unitCost = input.unitCost ?? averageCost;
    if (isZero(unitCost) && locked.rows.length === 0) {
      throw new InventoryCostingError(
        `el producto ${input.productId} no tiene costo en el almacén ${warehouseId}: indique el costo unitario del sobrante`,
      );
    }

    const { movementId, balances, value, inventoryAccount } = await this.inbound(
      {
        companyId: input.companyId, productId: input.productId, date: input.date,
        quantity: variance, unitCost, warehouseId, lotNo: input.lotNo,
        expirationDate: input.expirationDate,
        sourceType: input.sourceType, sourceId: input.sourceId, postedBy: input.postedBy,
      },
      "adjustment_in",
    );
    const journalEntryId =
      input.post === false
        ? null
        : await this.post(
            { ...input, warehouseId }, "inventory_adjustment", "surplus",
            value, movementId, memo, inventoryAccount,
          );
    return { movementId, journalEntryId, variance, value, balances };
  }

  // ── inbound / outbound ─────────────────────────────────────────────────────

  /** Shared inbound path: re-value the warehouse, open a FIFO lot, record it. */
  private async inbound(
    input: ReceiveInput,
    kind: "receipt" | "return" | "transfer_in" | "adjustment_in",
  ): Promise<{
    movementId: number;
    balances: Balances;
    value: Decimal;
    inventoryAccount: string;
    /** The FIFO layer opened, so a putaway can bind its placement to it. */
    lotId: number | null;
  }> {
    if (isNegative(input.quantity) || isZero(input.quantity)) {
      throw new InventoryCostingError("la cantidad recibida debe ser positiva");
    }
    if (isNegative(input.unitCost)) throw new InventoryCostingError("el costo unitario no puede ser negativo");
    const warehouseId = input.warehouseId ?? 0;

    // Method and account belong to the product, so they are read from any of its
    // warehouses and inherited by a new one.
    const existing = await this.client.query(
      `SELECT costing_method, inventory_account FROM inventory_valuation
        WHERE company_id=$1 AND product_id=$2 LIMIT 1`,
      [input.companyId, input.productId],
    );
    const method: CostingMethod =
      existing.rows.length > 0 ? (existing.rows[0].costing_method as CostingMethod) : input.method ?? "average";
    const inventoryAccount: string =
      existing.rows.length > 0 ? (existing.rows[0].inventory_account as string) : input.inventoryAccountRef ?? "1.1.03.001";

    const receiptValue =
      input.totalCost !== undefined ? toMoney(input.totalCost) : toMoney(roundTo(mul(input.quantity, input.unitCost), 4));

    const upsert = await this.client.query(
      `INSERT INTO inventory_valuation
         (company_id, product_id, warehouse_id, quantity_on_hand, total_value, average_cost, costing_method, inventory_account)
       VALUES ($1,$2,$3,$4,$5,
               CASE WHEN $4::numeric = 0 THEN 0 ELSE round($5::numeric / $4::numeric, 8) END, $6, $7)
       ON CONFLICT (company_id, product_id, warehouse_id) DO UPDATE SET
         quantity_on_hand = inventory_valuation.quantity_on_hand + $4::numeric,
         total_value      = inventory_valuation.total_value + $5::numeric,
         average_cost     = CASE WHEN inventory_valuation.quantity_on_hand + $4::numeric = 0 THEN 0
                            ELSE round((inventory_valuation.total_value + $5::numeric)
                                       / (inventory_valuation.quantity_on_hand + $4::numeric), 8) END,
         updated_at = now()
       RETURNING quantity_on_hand::text, average_cost::text, total_value::text`,
      [input.companyId, input.productId, warehouseId, input.quantity, receiptValue, method, inventoryAccount],
    );
    const balances = balancesOf(upsert.rows[0]);

    let lotId: number | null = null;
    if (method === "fifo") {
      // The layer's unit cost is derived from the value actually brought in, in
      // numeric — so a transfer's layer carries exactly the cost that left.
      const lot = await this.client.query(
        `INSERT INTO inventory_lots
           (company_id, product_id, warehouse_id, received_date, lot_no, expiration_date,
            original_qty, remaining_qty, unit_cost, source_type, source_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7, round($8::numeric / $7::numeric, 8), $9,$10)
         RETURNING id`,
        [
          input.companyId, input.productId, warehouseId, input.date, input.lotNo ?? null,
          input.expirationDate ?? null,
          input.quantity, receiptValue, input.sourceType ?? null, input.sourceId ?? null,
        ],
      );
      lotId = Number(lot.rows[0].id);
    }

    const movementId = await this.recordMovement({
      companyId: input.companyId, productId: input.productId, warehouseId, date: input.date, kind,
      quantity: input.quantity, totalCost: receiptValue, balances,
      sourceType: input.sourceType, sourceId: input.sourceId,
    });

    return { movementId, balances, value: receiptValue, inventoryAccount, lotId };
  }

  /** Shared outbound path: cost the stock leaving a warehouse and reduce it. */
  private async outbound(
    input: IssueInput,
    kind: "issue" | "transfer_out" | "adjustment_out",
  ): Promise<{ movementId: number; cost: Decimal; balances: Balances; inventoryAccount: string }> {
    if (isNegative(input.quantity) || isZero(input.quantity)) {
      throw new InventoryCostingError("la cantidad emitida debe ser positiva");
    }
    const warehouseId = input.warehouseId ?? 0;

    const locked = await this.client.query(
      `SELECT quantity_on_hand::text, average_cost::text, total_value::text, costing_method, inventory_account
         FROM inventory_valuation
        WHERE company_id=$1 AND product_id=$2 AND warehouse_id=$3 FOR UPDATE`,
      [input.companyId, input.productId, warehouseId],
    );
    if (locked.rows.length === 0) {
      throw new InventoryCostingError(`el producto ${input.productId} no tiene existencias en el almacén ${warehouseId}`);
    }
    const current = balancesOf(locked.rows[0]);
    const method = locked.rows[0].costing_method as CostingMethod;
    const inventoryAccount = locked.rows[0].inventory_account as string;
    if (cmp(input.quantity, current.quantityOnHand) > 0) {
      throw new InventoryCostingError(
        `existencia insuficiente en el almacén ${warehouseId}: se emiten ${input.quantity} pero hay ${current.quantityOnHand}`,
      );
    }

    const newQty = sub(current.quantityOnHand, input.quantity);
    const emptied = isZero(newQty);

    // FIFO drains the layers of this warehouse in its rotation order — oldest
    // receipt, or earliest expiry when the bodega rotates FEFO; average takes the
    // quantity at its average. Emptying the bucket absorbs any rounding residual,
    // so the value and the ledger reach exactly zero together.
    let cost: Decimal;
    if (emptied) {
      cost = current.totalValue;
      if (method === "fifo") await this.drainAllLots(input.companyId, input.productId, warehouseId);
    } else if (method === "fifo") {
      const rotation = input.rotation ?? (await this.rotationOf(warehouseId));
      cost = await this.consumeLots(input.companyId, input.productId, warehouseId, input.quantity, rotation);
    } else {
      cost = toMoney(roundTo(mul(input.quantity, current.averageCost), 4));
    }

    const newValue = emptied ? "0" : sub(current.totalValue, cost);

    // average_cost stays put under weighted average; FIFO re-derives it from the
    // remaining value in numeric, so no money passes through a JS float.
    const updated = await this.client.query(
      `UPDATE inventory_valuation
          SET quantity_on_hand=$4, total_value=$5,
              average_cost = CASE WHEN $4::numeric = 0 THEN 0
                                  WHEN $7 = 'fifo' THEN round($5::numeric / $4::numeric, 8)
                                  ELSE $6::numeric END,
              updated_at=now()
        WHERE company_id=$1 AND product_id=$2 AND warehouse_id=$3
        RETURNING average_cost::text`,
      [input.companyId, input.productId, warehouseId, newQty, toMoney(newValue), current.averageCost, method],
    );
    const balances: Balances = {
      quantityOnHand: newQty,
      totalValue: toMoney(newValue),
      averageCost: updated.rows[0].average_cost,
    };

    const movementId = await this.recordMovement({
      companyId: input.companyId, productId: input.productId, warehouseId, date: input.date, kind,
      quantity: input.quantity, totalCost: cost, balances,
      sourceType: input.sourceType, sourceId: input.sourceId,
    });

    return { movementId, cost, balances, inventoryAccount };
  }

  // ── FIFO / FEFO layers ─────────────────────────────────────────────────────

  /**
   * The bodega's rotation policy. Warehouse 0 — the company that keeps one
   * undivided store — has no row to read, and rotates FIFO.
   */
  private async rotationOf(warehouseId: number): Promise<RotationPolicy> {
    if (!warehouseId) return "fifo";
    const { rows } = await this.client.query(`SELECT rotation_policy FROM warehouses WHERE id=$1`, [warehouseId]);
    return rows[0]?.rotation_policy === "fefo" ? "fefo" : "fifo";
  }

  /**
   * Drains the open layers of one warehouse in rotation order, returning the
   * layered cost.
   *
   * Under FEFO the earliest expiry goes first and undated layers sort last —
   * `NULLS LAST` is deliberate: stock that never expires should sit on the shelf
   * while the yoghurt that expires on Friday leaves today. Ties fall back to the
   * receipt date, so two lots expiring the same day still leave oldest-first.
   */
  private async consumeLots(
    companyId: number,
    productId: number,
    warehouseId: number,
    quantity: Decimal,
    rotation: RotationPolicy = "fifo",
  ): Promise<Decimal> {
    const order =
      rotation === "fefo"
        ? "ORDER BY expiration_date ASC NULLS LAST, received_date, id"
        : "ORDER BY received_date, id";
    const lots = await this.client.query(
      `SELECT id, remaining_qty::text, unit_cost::text FROM inventory_lots
        WHERE company_id=$1 AND product_id=$2 AND warehouse_id=$3 AND remaining_qty > 0
        ${order} FOR UPDATE`,
      [companyId, productId, warehouseId],
    );
    let need = quantity;
    let cost: Decimal = "0";
    for (const lot of lots.rows) {
      if (cmp(need, "0") <= 0) break;
      const available = lot.remaining_qty as Decimal;
      const take = cmp(available, need) <= 0 ? available : need; // min(available, need)
      cost = add(cost, toMoney(roundTo(mul(take, lot.unit_cost), 4)));
      await this.client.query(`UPDATE inventory_lots SET remaining_qty=$1 WHERE id=$2`, [sub(available, take), lot.id]);
      need = sub(need, take);
    }
    if (cmp(need, "0") > 0) throw new InventoryCostingError("los lotes FIFO no cubren la cantidad emitida");
    return cost;
  }

  private async drainAllLots(companyId: number, productId: number, warehouseId: number): Promise<void> {
    await this.client.query(
      `UPDATE inventory_lots SET remaining_qty=0
        WHERE company_id=$1 AND product_id=$2 AND warehouse_id=$3 AND remaining_qty > 0`,
      [companyId, productId, warehouseId],
    );
  }

  // ── plumbing ───────────────────────────────────────────────────────────────

  /**
   * `unit_cost` is this movement's effective cost — its value over its quantity,
   * computed in numeric. For a receipt that is what was paid; for a FIFO issue it
   * is the blended cost of the layers actually drained; for a transfer it is the
   * cost the stock carried across.
   */
  private async recordMovement(m: {
    companyId: number;
    productId: number;
    warehouseId: number;
    date: string;
    quantity: Decimal;
    kind: string;
    totalCost: Decimal;
    balances: Balances;
    sourceType?: string;
    sourceId?: string;
  }): Promise<number> {
    const { rows } = await this.client.query(
      `INSERT INTO inventory_cost_movements
         (company_id, product_id, warehouse_id, movement_date, kind, quantity, unit_cost, total_cost,
          balance_qty, balance_value, source_type, source_id)
       VALUES ($1,$2,$3,$4,$5,$6,
               coalesce(round($7::numeric / nullif($6::numeric, 0), 8), 0),
               $7,$8,$9,$10,$11) RETURNING id`,
      [
        m.companyId, m.productId, m.warehouseId, m.date, m.kind, m.quantity, m.totalCost,
        m.balances.quantityOnHand, m.balances.totalValue, m.sourceType ?? null, m.sourceId ?? null,
      ],
    );
    return Number(rows[0].id);
  }

  /**
   * The product's `inventoryAccount` travels in the event context, so the rules
   * decide the accounts: merchandise books COGS against 1.1.03.001, while a
   * consumable in 1.1.03.002 books its issue straight to supplies expense — the
   * same "issue" operation, meaning "sold" for goods and "consumed" for supplies.
   */
  private async post(
    input: { companyId: number; productId: number; date: string; warehouseId?: number; postedBy?: number },
    eventType: string,
    role: string,
    amount: Decimal,
    movementId: number,
    memo: string,
    inventoryAccount: string,
  ): Promise<number> {
    const posted = await new PostingEngine(this.client).post(
      {
        companyId: input.companyId,
        eventType,
        sourceType: eventType,
        sourceId: String(movementId),
        entryDate: input.date,
        currency: "DOP",
        context: { productId: input.productId, inventoryAccount, warehouseId: input.warehouseId ?? 0 },
        measures: [{ role, amount, memo: `${memo} inventario producto ${input.productId}` }],
        memo: `Inventario ${memo} producto ${input.productId}`,
        postedBy: input.postedBy,
      },
      eventType,
    );
    await this.client.query(`UPDATE inventory_cost_movements SET journal_entry_id=$1 WHERE id=$2`, [
      posted.entryId,
      movementId,
    ]);
    return posted.entryId;
  }
}

const balancesOf = (r: { quantity_on_hand: string; average_cost: string; total_value: string }): Balances => ({
  quantityOnHand: r.quantity_on_hand,
  averageCost: r.average_cost,
  totalValue: r.total_value,
});
