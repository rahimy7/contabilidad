import type { Pool } from "@neondatabase/serverless";

/**
 * Reserva de stock para pedidos.
 *
 * El flujo POS descuenta stock al crear la venta y usa `allowNegative: true`
 * porque el dinero ya cambió de manos: la venta es definitiva. Los pedidos
 * que nacen en estado `pending` (catálogo web, WhatsApp/IA, cotizaciones que
 * aún no facturan) no descuentan; sin reserva, dos clientes distintos ven la
 * misma caja disponible y ambos "reservan" mentalmente el último ítem.
 *
 * Aquí se pone el candado. `reserveForOrder` incrementa
 * `warehouse_stock.reserved_quantity` vía trigger; `available =
 * quantity - reserved_quantity`. Al despachar (`consumeReservation`) se
 * decrementa la reserva y el descuento real lo hace el flujo normal de
 * inventario. Al cancelar (`releaseReservation`) se libera sin descontar.
 *
 * Idempotencia: la única activa por (order_id, product_id, warehouse_id) la
 * garantiza un índice único parcial; una segunda llamada actualiza en lugar
 * de duplicar.
 */

export interface ReservationItem {
  productId: number;
  warehouseId: number;
  quantity: number;
}

export interface ReservationResult {
  orderId: number;
  reserved: Array<{ productId: number; warehouseId: number; quantity: number }>;
  skipped: Array<{ productId: number; warehouseId: number; reason: string }>;
}

const num = (v: string | number): number => (typeof v === "number" ? v : parseFloat(v));

async function upsertReservation(
  pool: Pool,
  orderId: number,
  storeId: number,
  item: ReservationItem,
): Promise<void> {
  // Reactivar una fila liberada del mismo pedido si existe; si no, insertar.
  // No usar ON CONFLICT porque el índice único es parcial (status='active')
  // y Postgres no lo acepta como target de un conflicto.
  const existing = await pool.query(
    `SELECT id, status, quantity
       FROM order_reservations
      WHERE order_id = $1 AND product_id = $2 AND warehouse_id = $3
      ORDER BY status = 'active' DESC, id DESC
      LIMIT 1`,
    [orderId, item.productId, item.warehouseId],
  );

  if (existing.rowCount && existing.rows[0].status === "active") {
    // Ya hay una activa: si la cantidad cambió, actualiza; si no, no-op.
    if (num(existing.rows[0].quantity) !== item.quantity) {
      await pool.query(
        `UPDATE order_reservations SET quantity = $2 WHERE id = $1`,
        [existing.rows[0].id, String(item.quantity)],
      );
    }
    return;
  }

  await pool.query(
    `INSERT INTO order_reservations
       (order_id, product_id, warehouse_id, store_id, quantity, status)
     VALUES ($1, $2, $3, $4, $5, 'active')`,
    [orderId, item.productId, item.warehouseId, storeId, String(item.quantity)],
  );
}

/**
 * Reserva stock para todas las líneas del pedido. Si la disponibilidad no
 * alcanza para una línea la salta y la agrega a `skipped`; la política de
 * qué hacer con eso (avisar, bloquear, seguir) queda del lado del caller.
 */
export async function reserveForOrder(
  pool: Pool,
  orderId: number,
  storeId: number,
  items: ReservationItem[],
): Promise<ReservationResult> {
  const reserved: ReservationResult["reserved"] = [];
  const skipped: ReservationResult["skipped"] = [];

  for (const item of items) {
    if (!(item.quantity > 0)) {
      skipped.push({ productId: item.productId, warehouseId: item.warehouseId, reason: "quantity <= 0" });
      continue;
    }

    // Comprobación best-effort sobre el snapshot actual; el trigger fuerza el
    // invariante en la BD (reserved_quantity >= 0), no aquí.
    const row = await pool.query(
      `SELECT quantity::text AS quantity, reserved_quantity::text AS reserved
         FROM warehouse_stock
        WHERE warehouse_id = $1 AND product_id = $2
        LIMIT 1`,
      [item.warehouseId, item.productId],
    );
    if (!row.rowCount) {
      skipped.push({ productId: item.productId, warehouseId: item.warehouseId, reason: "no stock row" });
      continue;
    }
    const available = num(row.rows[0].quantity) - num(row.rows[0].reserved);
    if (available < item.quantity) {
      skipped.push({
        productId: item.productId,
        warehouseId: item.warehouseId,
        reason: `insufficient (available=${available}, requested=${item.quantity})`,
      });
      continue;
    }

    await upsertReservation(pool, orderId, storeId, item);
    reserved.push(item);
  }

  return { orderId, reserved, skipped };
}

/**
 * Liberar las reservas activas de un pedido sin descontar stock. Se usa al
 * cancelar un pedido en estado pending/assigned/processing.
 */
export async function releaseReservation(
  pool: Pool,
  orderId: number,
): Promise<{ released: number }> {
  const res = await pool.query(
    `UPDATE order_reservations
        SET status = 'released', released_at = now()
      WHERE order_id = $1 AND status = 'active'`,
    [orderId],
  );
  return { released: res.rowCount ?? 0 };
}

/**
 * Marcar la reserva como consumida. Se llama al despachar/facturar; el
 * descuento real del stock lo hace el flujo de inventario (FIFO), esta
 * función sólo cierra la reserva para que el available deje de mentir.
 */
export async function consumeReservation(
  pool: Pool,
  orderId: number,
): Promise<{ consumed: number }> {
  const res = await pool.query(
    `UPDATE order_reservations
        SET status = 'consumed', released_at = now()
      WHERE order_id = $1 AND status = 'active'`,
    [orderId],
  );
  return { consumed: res.rowCount ?? 0 };
}

/**
 * Disponibilidad efectiva para un producto en un almacén. Nombre corto
 * porque se llama seguido desde flujos de compra y ventas.
 */
export async function getAvailable(
  pool: Pool,
  warehouseId: number,
  productId: number,
): Promise<number> {
  const r = await pool.query(
    `SELECT quantity::text AS quantity, reserved_quantity::text AS reserved
       FROM warehouse_stock
      WHERE warehouse_id = $1 AND product_id = $2
      LIMIT 1`,
    [warehouseId, productId],
  );
  if (!r.rowCount) return 0;
  return num(r.rows[0].quantity) - num(r.rows[0].reserved);
}
