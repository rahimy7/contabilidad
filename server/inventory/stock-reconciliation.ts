import { SqlClient } from "../accounting/types";
import { Decimal, add } from "../accounting/decimal";

/**
 * Reconciles the operational stock count against the valued stock ledger.
 *
 * The legacy POS keeps quantities in `warehouse_stock`; accounting keeps quantity
 * *and cost* in `inventory_valuation`. They are two systems of record for the same
 * shelf, and they drift — a sale rung up without a comprobante, an adjustment made
 * in one and not the other, a count that never happened.
 *
 * This deliberately does not sync them. Silently overwriting one from the other
 * would destroy the very evidence an accountant needs, and the operational count
 * is not always the wrong one. It reports the disagreements instead, priced at the
 * ledger's own cost, so someone can decide which side is right and post an
 * adjustment on purpose.
 *
 * Only warehouses the accounting already knows about are compared; a bodega that
 * has never received valued stock has nothing to reconcile against yet.
 */
export interface StockDifference {
  warehouse_id: number;
  warehouse_name: string | null;
  product_id: number;
  operational_qty: string;
  valued_qty: string;
  difference: string;
  unit_cost: string;
  value_difference: string;
}

export interface StockReconciliation {
  differences: StockDifference[];
  /** Net value the disagreements represent, at the ledger's own unit costs. */
  netValueDifference: Decimal;
  reconciled: boolean;
}

export async function stockReconciliation(
  client: SqlClient,
  companyId: number,
): Promise<StockReconciliation> {
  const { rows } = await client.query(
    `WITH val AS (
       SELECT warehouse_id, product_id, quantity_on_hand, average_cost
         FROM inventory_valuation
        WHERE company_id = $1 AND warehouse_id <> 0
     ),
     known AS (SELECT DISTINCT warehouse_id FROM val),
     ops AS (
       SELECT ws.warehouse_id, ws.product_id, ws.quantity
         FROM warehouse_stock ws
         JOIN known k ON k.warehouse_id = ws.warehouse_id
     )
     SELECT coalesce(val.warehouse_id, ops.warehouse_id) AS warehouse_id,
            w.name AS warehouse_name,
            coalesce(val.product_id, ops.product_id) AS product_id,
            coalesce(ops.quantity, 0)::text            AS operational_qty,
            coalesce(val.quantity_on_hand, 0)::text    AS valued_qty,
            (coalesce(ops.quantity, 0) - coalesce(val.quantity_on_hand, 0))::text AS difference,
            coalesce(val.average_cost, 0)::text        AS unit_cost,
            round((coalesce(ops.quantity, 0) - coalesce(val.quantity_on_hand, 0))
                  * coalesce(val.average_cost, 0), 4)::text AS value_difference
       FROM val
       FULL OUTER JOIN ops
         ON ops.warehouse_id = val.warehouse_id AND ops.product_id = val.product_id
       LEFT JOIN warehouses w ON w.id = coalesce(val.warehouse_id, ops.warehouse_id)
      WHERE coalesce(ops.quantity, 0) <> coalesce(val.quantity_on_hand, 0)
      ORDER BY 1, 3`,
    [companyId],
  );

  let netValueDifference: Decimal = "0";
  for (const r of rows) netValueDifference = add(netValueDifference, r.value_difference);

  return {
    differences: rows as StockDifference[],
    netValueDifference,
    reconciled: rows.length === 0,
  };
}
