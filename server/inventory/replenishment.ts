import type { Pool } from "@neondatabase/serverless";

/**
 * Reabastecimiento sugerido.
 *
 * `warehouse_stock` ya guarda `min_stock` y `max_stock`. Este servicio los usa
 * para producir una lista de productos por debajo del mínimo (o cerca de él),
 * priorizada por el gap y con la cantidad que llevaría a `max_stock`. Con
 * esto un comprador arma una OC sin caminar la tabla de productos a mano.
 *
 * No genera OC automáticamente: propone; el llamador decide cuáles compra y
 * arma la orden de compra. Ese paso queda del lado del comprador porque los
 * proveedores y precios cambian y una automatización ciega compraría al
 * primero que aparezca.
 */

export interface ReplenishmentSuggestion {
  productId: number;
  productName: string;
  sku: string | null;
  warehouseId: number;
  warehouseName: string;
  onHand: number;
  reserved: number;
  available: number;
  minStock: number;
  maxStock: number | null;
  suggestedQty: number;
  daysCover: number | null;
  urgency: "critical" | "warn" | "info";
}

export interface ReplenishmentFilter {
  storeId: number;
  warehouseId?: number;
  /** Sólo productos que estén por debajo del umbral (default = mínimo). */
  belowMinOnly?: boolean;
  /** Ventana para el cálculo del día-cover (media móvil). */
  windowDays?: number;
}

export async function suggestReplenishment(
  pool: Pool,
  filter: ReplenishmentFilter,
): Promise<ReplenishmentSuggestion[]> {
  const windowDays = filter.windowDays ?? 30;
  const params: unknown[] = [filter.storeId, windowDays];
  let warehouseCondition = "";
  if (filter.warehouseId != null) {
    params.push(filter.warehouseId);
    warehouseCondition = `AND ws.warehouse_id = $${params.length}`;
  }

  // Consumo diario promedio = suma de cantidades vendidas en la ventana / windowDays.
  // Se une por orders.status IN ('completed') para no contar borradores.
  const sql = `
    WITH sales AS (
      SELECT oi.product_id, o.warehouse_id, sum(oi.quantity)::numeric AS sold
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
       WHERE o.store_id = $1
         AND o.status = 'completed'
         AND o.completed_date >= now() - ($2 || ' days')::interval
       GROUP BY oi.product_id, o.warehouse_id
    )
    SELECT p.id AS "productId",
           p.name AS "productName",
           p.sku,
           ws.warehouse_id AS "warehouseId",
           w.name AS "warehouseName",
           ws.quantity::numeric AS "onHand",
           ws.reserved_quantity::numeric AS "reserved",
           (ws.quantity - ws.reserved_quantity)::numeric AS "available",
           coalesce(ws.min_stock, 0)::numeric AS "minStock",
           ws.max_stock::numeric AS "maxStock",
           coalesce(s.sold, 0)::numeric / $2::numeric AS "dailyRate"
      FROM warehouse_stock ws
      JOIN products p ON p.id = ws.product_id
      JOIN warehouses w ON w.id = ws.warehouse_id
      LEFT JOIN sales s ON s.product_id = ws.product_id AND s.warehouse_id = ws.warehouse_id
     WHERE ws.store_id = $1
       ${warehouseCondition}
     ORDER BY p.name`;

  const { rows } = await pool.query(sql, params);
  const suggestions: ReplenishmentSuggestion[] = [];
  for (const r of rows) {
    const available = Number(r.available);
    const min = Number(r.minStock);
    const max = r.maxStock != null ? Number(r.maxStock) : null;
    const dailyRate = Number(r.dailyRate);

    // Sólo sugerir si está bajo mínimo o (belowMinOnly falso) también los que
    // están por debajo de min * 1.25 (zona amarilla).
    const threshold = filter.belowMinOnly === false ? min * 1.25 : min;
    if (min <= 0 && filter.belowMinOnly !== false) continue;
    if (available > threshold) continue;

    const target = max ?? Math.max(min * 2, min + 1);
    const suggestedQty = Math.max(0, Math.ceil(target - available));
    const daysCover = dailyRate > 0 ? Math.floor(available / dailyRate) : null;
    const urgency: ReplenishmentSuggestion["urgency"] =
      available <= 0 ? "critical" : available < min ? "warn" : "info";

    suggestions.push({
      productId: r.productId,
      productName: r.productName,
      sku: r.sku,
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName,
      onHand: Number(r.onHand),
      reserved: Number(r.reserved),
      available,
      minStock: min,
      maxStock: max,
      suggestedQty,
      daysCover,
      urgency,
    });
  }
  // Ordenar: críticos primero, después por menor daysCover.
  suggestions.sort((a, b) => {
    const rank = { critical: 0, warn: 1, info: 2 };
    const r = rank[a.urgency] - rank[b.urgency];
    if (r !== 0) return r;
    return (a.daysCover ?? 9999) - (b.daysCover ?? 9999);
  });
  return suggestions;
}
