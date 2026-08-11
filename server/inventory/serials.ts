import type { Pool } from "@neondatabase/serverless";

/**
 * Números de serie por unidad.
 *
 * Un número de serie identifica una unidad concreta dentro de un producto:
 * dos ejemplares del mismo modelo tienen series distintas. Es el enlace
 * mínimo para que una garantía o una devolución individual funcionen — sin
 * él, un cliente reclama y el sistema no sabe cuándo se vendió esa unidad.
 *
 * Ciclo: `in_stock` → `reserved` (al reservar un pedido con serie asignada)
 * → `sold` (al despachar) → `returned` (si vuelve). Los intermedios son
 * opcionales; el POS puede saltar directo a `sold` en la venta al mostrador.
 */

export interface RegisterSerialsInput {
  storeId: number;
  productId: number;
  warehouseId?: number;
  lotId?: number;
  serials: string[];
  status?: "in_stock" | "reserved" | "sold";
  notes?: string;
}

export interface MarkSoldInput {
  storeId: number;
  productId: number;
  serialNumbers: string[];
  orderId?: number;
  soldAt?: Date;
  /** Meses a partir de la venta; usa el campo `warrantyMonths` del producto. */
  warrantyMonths?: number;
}

async function warrantyUntil(warrantyMonths: number | undefined, soldAt: Date): Promise<string | null> {
  if (!warrantyMonths || warrantyMonths <= 0) return null;
  const d = new Date(soldAt);
  d.setMonth(d.getMonth() + warrantyMonths);
  return d.toISOString().slice(0, 10);
}

export async function registerSerials(
  pool: Pool,
  input: RegisterSerialsInput,
): Promise<{ inserted: number; duplicates: string[] }> {
  const duplicates: string[] = [];
  let inserted = 0;
  for (const raw of input.serials) {
    const serial = raw.trim();
    if (!serial) continue;
    const existing = await pool.query(
      `SELECT id FROM product_serials
        WHERE store_id = $1 AND product_id = $2 AND serial_number = $3`,
      [input.storeId, input.productId, serial],
    );
    if (existing.rowCount) {
      duplicates.push(serial);
      continue;
    }
    await pool.query(
      `INSERT INTO product_serials
         (store_id, product_id, warehouse_id, lot_id, serial_number, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.storeId,
        input.productId,
        input.warehouseId ?? null,
        input.lotId ?? null,
        serial,
        input.status ?? "in_stock",
        input.notes ?? null,
      ],
    );
    inserted++;
  }
  return { inserted, duplicates };
}

export async function markSold(
  pool: Pool,
  input: MarkSoldInput,
): Promise<{ updated: number; notFound: string[] }> {
  const soldAt = input.soldAt ?? new Date();
  const until = await warrantyUntil(input.warrantyMonths, soldAt);
  const notFound: string[] = [];
  let updated = 0;
  for (const raw of input.serialNumbers) {
    const serial = raw.trim();
    if (!serial) continue;
    const r = await pool.query(
      `UPDATE product_serials
          SET status = 'sold', order_id = $1, sold_at = $2, warranty_until = $3, updated_at = now()
        WHERE store_id = $4 AND product_id = $5 AND serial_number = $6
          AND status IN ('in_stock', 'reserved')`,
      [
        input.orderId ?? null,
        soldAt.toISOString(),
        until,
        input.storeId,
        input.productId,
        serial,
      ],
    );
    if (r.rowCount) updated++;
    else notFound.push(serial);
  }
  return { updated, notFound };
}

export async function markReturned(
  pool: Pool,
  storeId: number,
  serialNumbers: string[],
): Promise<{ updated: number }> {
  let updated = 0;
  for (const raw of serialNumbers) {
    const serial = raw.trim();
    if (!serial) continue;
    const r = await pool.query(
      `UPDATE product_serials
          SET status = 'returned', updated_at = now()
        WHERE store_id = $1 AND serial_number = $2 AND status = 'sold'`,
      [storeId, serial],
    );
    if (r.rowCount) updated++;
  }
  return { updated };
}

export async function findSerial(
  pool: Pool,
  storeId: number,
  serialNumber: string,
): Promise<{
  id: number; productId: number; status: string; orderId: number | null;
  soldAt: string | null; warrantyUntil: string | null;
} | null> {
  const r = await pool.query(
    `SELECT id, product_id AS "productId", status, order_id AS "orderId",
            sold_at::text AS "soldAt", warranty_until::text AS "warrantyUntil"
       FROM product_serials
      WHERE store_id = $1 AND serial_number = $2
      LIMIT 1`,
    [storeId, serialNumber.trim()],
  );
  if (!r.rowCount) return null;
  return r.rows[0];
}

/** Series vencidas de garantía o por vencer en N días. */
export async function warrantyExpiring(
  pool: Pool,
  storeId: number,
  days = 30,
): Promise<Array<{
  serial: string; productId: number; orderId: number | null;
  warrantyUntil: string; daysLeft: number;
}>> {
  const r = await pool.query(
    `SELECT serial_number AS serial, product_id AS "productId", order_id AS "orderId",
            warranty_until::text AS "warrantyUntil",
            (warranty_until - CURRENT_DATE)::int AS "daysLeft"
       FROM product_serials
      WHERE store_id = $1 AND status = 'sold' AND warranty_until IS NOT NULL
        AND warranty_until <= CURRENT_DATE + $2::int
      ORDER BY warranty_until ASC
      LIMIT 500`,
    [storeId, days],
  );
  return r.rows;
}
