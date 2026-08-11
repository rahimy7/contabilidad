import type { Pool } from "@neondatabase/serverless";

/**
 * Cotizaciones de venta.
 *
 * Documento previo a factura: mismo shape (cliente, líneas, totales,
 * impuestos) sin consumir NCF. Al aceptarse se convierte en pedido o factura;
 * la cotización queda como registro y trazabilidad — nunca se borra.
 *
 * Estados:
 *   draft     — el vendedor la está armando.
 *   sent      — enviada al cliente, esperando respuesta.
 *   accepted  — el cliente aceptó; próximo paso: convertir.
 *   converted — ya se convirtió en pedido/factura; converted_to y _document_id
 *               apuntan al destino.
 *   rejected  — el cliente dijo que no.
 *   expired   — venció y nadie hizo nada.
 *   cancelled — el vendedor la anuló antes de tiempo.
 *
 * El vencimiento se aplica reactivamente: `expireOverdue` marca las que
 * pasaron su `valid_until`.
 */

export interface QuoteLine {
  productId?: number;
  productName: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  notes?: string;
}

export interface CreateQuoteInput {
  storeId: number;
  customerId?: number;
  customerName?: string;
  customerRnc?: string;
  customerEmail?: string;
  customerPhone?: string;
  warehouseId?: number;
  salespersonId?: number;
  currency?: string;
  validUntil?: string;
  notes?: string;
  internalNotes?: string;
  lines: QuoteLine[];
  /** ITBIS por cotización, calculado por el llamador con su motor de impuestos. */
  taxAmount?: number;
}

export interface Quote {
  id: number;
  storeId: number;
  quoteNumber: string;
  customerId: number | null;
  customerName: string | null;
  customerRnc: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  warehouseId: number | null;
  salespersonId: number | null;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  currency: string;
  status: string;
  validUntil: string | null;
  notes: string | null;
  internalNotes: string | null;
  convertedTo: string | null;
  convertedDocumentId: number | null;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

async function nextQuoteNumber(pool: Pool, storeId: number): Promise<string> {
  const seq = await pool.query(
    `INSERT INTO sales_quote_sequences (store_id) VALUES ($1)
     ON CONFLICT (store_id) DO NOTHING`,
    [storeId],
  );
  void seq;
  const r = await pool.query(
    `UPDATE sales_quote_sequences
        SET next_number = next_number + 1
      WHERE store_id = $1
      RETURNING prefix, next_number - 1 AS current_number`,
    [storeId],
  );
  const { prefix, current_number } = r.rows[0];
  return `${prefix}-${String(current_number).padStart(6, "0")}`;
}

export async function createQuote(pool: Pool, input: CreateQuoteInput): Promise<Quote> {
  if (!input.lines.length) throw new Error("una cotización necesita al menos una línea");

  const currency = input.currency ?? "DOP";
  const computedLines = input.lines.map((l) => {
    const gross = l.quantity * l.unitPrice;
    const discountPct = l.discountPercent ?? 0;
    const lineTotal = gross * (1 - discountPct / 100);
    return { ...l, lineTotal, discountPercent: discountPct };
  });
  const subtotal = computedLines.reduce((acc, l) => acc + l.quantity * l.unitPrice, 0);
  const discountAmount = computedLines.reduce(
    (acc, l) => acc + l.quantity * l.unitPrice * ((l.discountPercent ?? 0) / 100),
    0,
  );
  const taxable = subtotal - discountAmount;
  const taxAmount = input.taxAmount ?? 0;
  const totalAmount = taxable + taxAmount;

  const quoteNumber = await nextQuoteNumber(pool, input.storeId);
  const r = await pool.query(
    `INSERT INTO sales_quotes
       (store_id, quote_number, customer_id, customer_name, customer_rnc,
        customer_email, customer_phone, warehouse_id, salesperson_id,
        subtotal, discount_amount, tax_amount, total_amount,
        currency, status, valid_until, notes, internal_notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'draft',$15,$16,$17)
     RETURNING id`,
    [
      input.storeId,
      quoteNumber,
      input.customerId ?? null,
      input.customerName ?? null,
      input.customerRnc ?? null,
      input.customerEmail ?? null,
      input.customerPhone ?? null,
      input.warehouseId ?? null,
      input.salespersonId ?? null,
      String(subtotal.toFixed(2)),
      String(discountAmount.toFixed(2)),
      String(taxAmount.toFixed(2)),
      String(totalAmount.toFixed(2)),
      currency,
      input.validUntil ?? null,
      input.notes ?? null,
      input.internalNotes ?? null,
    ],
  );
  const quoteId = r.rows[0].id;

  for (let i = 0; i < computedLines.length; i++) {
    const l = computedLines[i];
    await pool.query(
      `INSERT INTO sales_quote_lines
         (quote_id, product_id, product_name, sku, quantity,
          unit_price, discount_percent, line_total, notes, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        quoteId,
        l.productId ?? null,
        l.productName,
        l.sku ?? null,
        String(l.quantity),
        String(l.unitPrice),
        String(l.discountPercent),
        String(l.lineTotal.toFixed(2)),
        l.notes ?? null,
        i,
      ],
    );
  }

  return getQuote(pool, quoteId);
}

export async function getQuote(pool: Pool, id: number): Promise<Quote> {
  const r = await pool.query(
    `SELECT id, store_id AS "storeId", quote_number AS "quoteNumber",
            customer_id AS "customerId", customer_name AS "customerName",
            customer_rnc AS "customerRnc", customer_email AS "customerEmail",
            customer_phone AS "customerPhone", warehouse_id AS "warehouseId",
            salesperson_id AS "salespersonId",
            subtotal::text, discount_amount::text AS "discountAmount",
            tax_amount::text AS "taxAmount", total_amount::text AS "totalAmount",
            currency, status, valid_until::text AS "validUntil",
            notes, internal_notes AS "internalNotes",
            converted_to AS "convertedTo",
            converted_document_id AS "convertedDocumentId",
            converted_at::text AS "convertedAt",
            created_at::text AS "createdAt", updated_at::text AS "updatedAt"
       FROM sales_quotes WHERE id = $1`,
    [id],
  );
  if (!r.rowCount) throw new Error(`cotización ${id} no existe`);
  return r.rows[0];
}

export async function getQuoteLines(pool: Pool, quoteId: number) {
  const r = await pool.query(
    `SELECT id, product_id AS "productId", product_name AS "productName", sku,
            quantity::text, unit_price::text AS "unitPrice",
            discount_percent::text AS "discountPercent",
            line_total::text AS "lineTotal", notes, sort_order AS "sortOrder"
       FROM sales_quote_lines WHERE quote_id = $1 ORDER BY sort_order, id`,
    [quoteId],
  );
  return r.rows;
}

export async function updateStatus(
  pool: Pool,
  id: number,
  status: "draft" | "sent" | "accepted" | "rejected" | "cancelled",
): Promise<Quote> {
  await pool.query(
    `UPDATE sales_quotes SET status = $2, updated_at = now() WHERE id = $1 AND status NOT IN ('converted','expired')`,
    [id, status],
  );
  return getQuote(pool, id);
}

export async function expireOverdue(pool: Pool, storeId: number): Promise<{ expired: number }> {
  const r = await pool.query(
    `UPDATE sales_quotes
        SET status = 'expired', updated_at = now()
      WHERE store_id = $1
        AND status IN ('draft','sent','accepted')
        AND valid_until IS NOT NULL
        AND valid_until < CURRENT_DATE`,
    [storeId],
  );
  return { expired: r.rowCount ?? 0 };
}

/**
 * Convertir la cotización aceptada en un pedido; devuelve el order_id creado.
 * La cotización queda como `converted`, apuntando al pedido, con `converted_at`
 * al momento del cierre.
 */
export async function convertToOrder(
  pool: Pool,
  id: number,
): Promise<{ orderId: number; quote: Quote }> {
  const quote = await getQuote(pool, id);
  if (quote.status === "converted") {
    return { orderId: quote.convertedDocumentId!, quote };
  }
  if (quote.status === "expired" || quote.status === "cancelled" || quote.status === "rejected") {
    throw new Error(`la cotización está ${quote.status}`);
  }
  const lines = await getQuoteLines(pool, id);

  const orderNumber = `ORD-${quote.quoteNumber}`;
  const order = await pool.query(
    `INSERT INTO orders
       (order_number, customer_id, store_id, warehouse_id, status, priority,
        total_amount, subtotal_amount, discount_amount, description)
     VALUES ($1, $2, $3, $4, 'pending', 'normal', $5, $6, $7, $8)
     RETURNING id`,
    [
      orderNumber,
      quote.customerId,
      quote.storeId,
      quote.warehouseId,
      quote.totalAmount,
      quote.subtotal,
      quote.discountAmount,
      `Convertida desde ${quote.quoteNumber}`,
    ],
  );
  const orderId = order.rows[0].id;

  for (const l of lines) {
    await pool.query(
      `INSERT INTO order_items
         (order_id, product_id, quantity, unit_price, total_price, warehouse_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        orderId,
        l.productId ?? 0,
        Math.max(1, Math.floor(Number(l.quantity))),
        l.unitPrice,
        l.lineTotal,
        quote.warehouseId,
        l.notes,
      ],
    );
  }

  await pool.query(
    `UPDATE sales_quotes
        SET status = 'converted', converted_to = 'order',
            converted_document_id = $2, converted_at = now(), updated_at = now()
      WHERE id = $1`,
    [id, orderId],
  );

  return { orderId, quote: await getQuote(pool, id) };
}

export interface ListQuotesFilter {
  storeId: number;
  status?: string;
  customerId?: number;
  limit?: number;
  offset?: number;
}

export async function listQuotes(pool: Pool, filter: ListQuotesFilter) {
  const conditions = ["store_id = $1"];
  const params: unknown[] = [filter.storeId];
  if (filter.status) {
    params.push(filter.status);
    conditions.push(`status = $${params.length}`);
  }
  if (filter.customerId != null) {
    params.push(filter.customerId);
    conditions.push(`customer_id = $${params.length}`);
  }
  const limit = Math.min(500, Math.max(1, filter.limit ?? 100));
  const offset = Math.max(0, filter.offset ?? 0);
  const where = conditions.join(" AND ");

  const [rows, total] = await Promise.all([
    pool.query(
      `SELECT id, quote_number AS "quoteNumber", customer_name AS "customerName",
              status, total_amount::text AS "totalAmount",
              currency, valid_until::text AS "validUntil",
              created_at::text AS "createdAt"
         FROM sales_quotes WHERE ${where}
         ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params,
    ),
    pool.query(`SELECT count(*)::int AS total FROM sales_quotes WHERE ${where}`, params),
  ]);
  return { total: total.rows[0]?.total ?? 0, rows: rows.rows };
}
