import express, { type Response } from "express";
import { authenticateToken, type AuthenticatedRequest } from "../authMiddleware";
import { masterPool } from "../multi-tenant-db";

const router = express.Router();

/**
 * Picking (lista de despacho).
 *
 * Los pedidos en `assigned` o `processing` necesitan sacarse del almacén. Este
 * endpoint arma la lista con producto, cantidad y ubicación —para almacenes
 * con WMS habilitado usa el `pickPlan()` de `wms.ts` (FIFO/FEFO); para el
 * resto entrega la línea sin detalle de estantería.
 *
 * El impreso vive del lado del cliente: el servidor entrega los datos y el
 * cliente los formatea. Esto permite imprimir en térmica ESC/POS o en A4 sin
 * duplicar lógica.
 */

router.get("/picking/orders", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const storeId = typeof user.storeId === "string" ? parseInt(user.storeId) : user.storeId;
  const warehouseId = req.query.warehouseId ? Number(req.query.warehouseId) : null;

  const r = await masterPool.query(
    `SELECT o.id, o.order_number, o.status, o.warehouse_id, w.name AS warehouse_name,
            o.customer_id, c.name AS customer_name, c.phone AS customer_phone,
            o.total_amount::text AS total_amount,
            o.created_at, o.priority,
            (SELECT count(*)::int FROM order_items oi WHERE oi.order_id = o.id) AS item_count
       FROM orders o
       LEFT JOIN warehouses w ON w.id = o.warehouse_id
       LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.store_id = $1
        AND o.status IN ('assigned','processing','pending')
        AND ($2::int IS NULL OR o.warehouse_id = $2)
      ORDER BY
        CASE o.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,
        o.created_at ASC
      LIMIT 200`,
    [storeId, warehouseId],
  );
  res.json({ rows: r.rows });
});

router.get("/picking/orders/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const storeId = typeof user.storeId === "string" ? parseInt(user.storeId) : user.storeId;
  const orderId = Number(req.params.id);

  const header = await masterPool.query(
    `SELECT o.id, o.order_number, o.status, o.warehouse_id, w.name AS warehouse_name,
            o.customer_id, c.name AS customer_name, c.phone AS customer_phone,
            c.address AS customer_address,
            o.customer_address AS delivery_address,
            o.total_amount::text AS total_amount,
            o.notes, o.created_at, o.priority
       FROM orders o
       LEFT JOIN warehouses w ON w.id = o.warehouse_id
       LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.id = $1 AND o.store_id = $2`,
    [orderId, storeId],
  );
  if (!header.rowCount) return res.status(404).json({ error: "orden no encontrada" });

  const lines = await masterPool.query(
    `SELECT oi.id, oi.product_id, p.name AS product_name, p.sku,
            oi.quantity, oi.unit_price::text, oi.total_price::text,
            oi.warehouse_id, ws.quantity::text AS stock_on_hand,
            ws.reserved_quantity::text AS reserved
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       LEFT JOIN warehouse_stock ws ON ws.warehouse_id = oi.warehouse_id AND ws.product_id = oi.product_id
      WHERE oi.order_id = $1
      ORDER BY p.name`,
    [orderId],
  );

  // Para cada línea, si el warehouse tiene wms_enabled y hay placements,
  // sugerir ubicación específica (best-effort: si falla, sólo devolvemos la línea).
  const enriched: Array<Record<string, unknown>> = [];
  for (const l of lines.rows) {
    let locations: Array<{ code: string; quantity: string; lotNo: string | null; expirationDate: string | null }> = [];
    try {
      const wms = await masterPool.query(
        `SELECT wl.code, ip.quantity::text - ip.reserved_qty::text AS quantity,
                ip.lot_no, ip.expiration_date::text
           FROM inventory_placements ip
           JOIN warehouse_locations wl ON wl.id = ip.location_id
           JOIN warehouses w ON w.id = ip.warehouse_id
          WHERE ip.product_id = $1 AND ip.warehouse_id = $2
            AND w.wms_enabled = true
            AND ip.status = 'available'
            AND ip.quantity > ip.reserved_qty
            AND wl.is_active AND wl.kind NOT IN ('quarantine','damaged')
          ORDER BY
            CASE w.rotation_policy
              WHEN 'fefo' THEN ip.expiration_date
              ELSE ip.received_date
            END NULLS LAST,
            wl.pick_priority
          LIMIT 5`,
        [l.product_id, l.warehouse_id],
      );
      locations = wms.rows;
    } catch {
      // WMS no aplica a este almacén o falla; la línea igual sirve para el picker.
    }
    enriched.push({ ...l, locations });
  }

  res.json({ order: header.rows[0], lines: enriched });
});

export default router;
