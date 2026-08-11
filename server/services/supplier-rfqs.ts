import type { Pool } from "@neondatabase/serverless";

/**
 * Cotizaciones a proveedores (RFQ).
 *
 * Un RFQ describe qué se quiere comprar; distintos proveedores responden con
 * su cotización (precio, plazo de entrega, disponibilidad). El comparativo
 * es una consulta sobre las respuestas activas. Al elegir un ganador se
 * marca la cotización, se cambia el RFQ a `awarded` y opcionalmente se genera
 * la orden de compra con esos precios.
 *
 * Estados del RFQ:
 *   draft     — el comprador arma la solicitud, aún no la envió.
 *   sent      — enviada a proveedores; se aceptan cotizaciones.
 *   awarded   — se eligió una cotización.
 *   closed    — cerrado sin adjudicar (todos rechazaron, precios altos, etc.).
 *   cancelled — el comprador la anuló.
 */

export interface RfqLineInput {
  productId?: number;
  productName: string;
  sku?: string;
  quantity: number;
  notes?: string;
}

export interface CreateRfqInput {
  storeId: number;
  title: string;
  description?: string;
  requestedBy: number;
  validUntil?: string;
  lines: RfqLineInput[];
}

export interface QuoteLineInput {
  rfqLineId?: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  availabilityDays?: number;
  notes?: string;
}

export interface CreateSupplierQuoteInput {
  rfqId: number;
  supplierId?: number;
  supplierName?: string;
  currency?: string;
  leadTimeDays?: number;
  validUntil?: string;
  notes?: string;
  taxAmount?: number;
  lines: QuoteLineInput[];
}

async function nextRfqNumber(pool: Pool, storeId: number): Promise<string> {
  await pool.query(
    `INSERT INTO purchase_rfq_sequences (store_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [storeId],
  );
  const r = await pool.query(
    `UPDATE purchase_rfq_sequences SET next_number = next_number + 1
      WHERE store_id = $1 RETURNING prefix, next_number - 1 AS n`,
    [storeId],
  );
  return `${r.rows[0].prefix}-${String(r.rows[0].n).padStart(6, "0")}`;
}

export async function createRfq(pool: Pool, input: CreateRfqInput) {
  if (!input.lines.length) throw new Error("un RFQ necesita al menos una línea");
  const rfqNumber = await nextRfqNumber(pool, input.storeId);
  const r = await pool.query(
    `INSERT INTO purchase_rfqs
       (store_id, rfq_number, title, description, requested_by, valid_until, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'draft') RETURNING id`,
    [input.storeId, rfqNumber, input.title, input.description ?? null, input.requestedBy, input.validUntil ?? null],
  );
  const id = r.rows[0].id;
  for (let i = 0; i < input.lines.length; i++) {
    const l = input.lines[i];
    await pool.query(
      `INSERT INTO purchase_rfq_lines
         (rfq_id, product_id, product_name, sku, quantity, notes, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, l.productId ?? null, l.productName, l.sku ?? null, String(l.quantity), l.notes ?? null, i],
    );
  }
  return getRfq(pool, id);
}

export async function updateRfqStatus(
  pool: Pool,
  id: number,
  status: "sent" | "closed" | "cancelled",
) {
  await pool.query(
    `UPDATE purchase_rfqs SET status = $2, updated_at = now() WHERE id = $1 AND status NOT IN ('awarded','cancelled')`,
    [id, status],
  );
  return getRfq(pool, id);
}

export async function addSupplierQuote(pool: Pool, input: CreateSupplierQuoteInput) {
  if (!input.lines.length) throw new Error("una cotización necesita líneas");
  const rfq = await getRfq(pool, input.rfqId);
  if (rfq.status !== "draft" && rfq.status !== "sent") {
    throw new Error(`el RFQ está ${rfq.status}; ya no acepta cotizaciones`);
  }
  const subtotal = input.lines.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const taxAmount = input.taxAmount ?? 0;
  const total = subtotal + taxAmount;

  const r = await pool.query(
    `INSERT INTO supplier_quotes
       (rfq_id, supplier_id, supplier_name, subtotal, tax_amount, total_amount,
        currency, lead_time_days, valid_until, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      input.rfqId,
      input.supplierId ?? null,
      input.supplierName ?? null,
      String(subtotal.toFixed(2)),
      String(taxAmount.toFixed(2)),
      String(total.toFixed(2)),
      input.currency ?? "DOP",
      input.leadTimeDays ?? null,
      input.validUntil ?? null,
      input.notes ?? null,
    ],
  );
  const quoteId = r.rows[0].id;

  for (const l of input.lines) {
    const lineTotal = l.quantity * l.unitPrice;
    await pool.query(
      `INSERT INTO supplier_quote_lines
         (quote_id, rfq_line_id, product_name, quantity, unit_price, line_total,
          availability_days, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        quoteId,
        l.rfqLineId ?? null,
        l.productName,
        String(l.quantity),
        String(l.unitPrice),
        String(lineTotal.toFixed(2)),
        l.availabilityDays ?? null,
        l.notes ?? null,
      ],
    );
  }

  // Marca automática de RFQ como enviado la primera vez que llega una cotización.
  if (rfq.status === "draft") {
    await pool.query(`UPDATE purchase_rfqs SET status = 'sent', updated_at = now() WHERE id = $1`, [input.rfqId]);
  }

  return getQuote(pool, quoteId);
}

export async function awardQuote(pool: Pool, quoteId: number): Promise<{ rfqId: number }> {
  const q = await getQuote(pool, quoteId);
  const rfq = await getRfq(pool, q.rfqId);
  if (rfq.status === "awarded") throw new Error("este RFQ ya fue adjudicado");
  if (rfq.status === "cancelled" || rfq.status === "closed") {
    throw new Error(`el RFQ está ${rfq.status}`);
  }
  // Sólo una seleccionada por RFQ; el índice único parcial lo respalda.
  await pool.query(
    `UPDATE supplier_quotes SET is_selected = false, updated_at = now() WHERE rfq_id = $1`,
    [q.rfqId],
  );
  await pool.query(
    `UPDATE supplier_quotes SET is_selected = true, updated_at = now() WHERE id = $1`,
    [quoteId],
  );
  await pool.query(
    `UPDATE purchase_rfqs
        SET status = 'awarded', awarded_supplier_id = $2, awarded_quote_id = $3,
            awarded_at = now(), updated_at = now()
      WHERE id = $1`,
    [q.rfqId, q.supplierId, quoteId],
  );
  return { rfqId: q.rfqId };
}

export async function getRfq(pool: Pool, id: number) {
  const r = await pool.query(
    `SELECT id, store_id AS "storeId", rfq_number AS "rfqNumber", title, description,
            requested_by AS "requestedBy", valid_until::text AS "validUntil",
            status, awarded_supplier_id AS "awardedSupplierId",
            awarded_quote_id AS "awardedQuoteId",
            awarded_purchase_order_id AS "awardedPurchaseOrderId",
            awarded_at::text AS "awardedAt",
            created_at::text AS "createdAt", updated_at::text AS "updatedAt"
       FROM purchase_rfqs WHERE id = $1`,
    [id],
  );
  if (!r.rowCount) throw new Error(`RFQ ${id} no existe`);
  return r.rows[0];
}

export async function getRfqLines(pool: Pool, rfqId: number) {
  const r = await pool.query(
    `SELECT id, product_id AS "productId", product_name AS "productName", sku,
            quantity::text, notes, sort_order AS "sortOrder"
       FROM purchase_rfq_lines WHERE rfq_id = $1 ORDER BY sort_order, id`,
    [rfqId],
  );
  return r.rows;
}

export async function getQuote(pool: Pool, id: number) {
  const r = await pool.query(
    `SELECT id, rfq_id AS "rfqId", supplier_id AS "supplierId",
            supplier_name AS "supplierName", subtotal::text,
            tax_amount::text AS "taxAmount", total_amount::text AS "totalAmount",
            currency, lead_time_days AS "leadTimeDays",
            valid_until::text AS "validUntil", notes,
            is_selected AS "isSelected", received_at::text AS "receivedAt"
       FROM supplier_quotes WHERE id = $1`,
    [id],
  );
  if (!r.rowCount) throw new Error(`cotización ${id} no existe`);
  return r.rows[0];
}

export async function getQuoteLines(pool: Pool, quoteId: number) {
  const r = await pool.query(
    `SELECT id, rfq_line_id AS "rfqLineId", product_name AS "productName",
            quantity::text, unit_price::text AS "unitPrice",
            line_total::text AS "lineTotal",
            availability_days AS "availabilityDays", notes
       FROM supplier_quote_lines WHERE quote_id = $1 ORDER BY id`,
    [quoteId],
  );
  return r.rows;
}

export async function listRfqQuotes(pool: Pool, rfqId: number) {
  const r = await pool.query(
    `SELECT id, supplier_id AS "supplierId", supplier_name AS "supplierName",
            subtotal::text, total_amount::text AS "totalAmount", currency,
            lead_time_days AS "leadTimeDays", valid_until::text AS "validUntil",
            is_selected AS "isSelected", received_at::text AS "receivedAt"
       FROM supplier_quotes WHERE rfq_id = $1
       ORDER BY total_amount ASC, id ASC`,
    [rfqId],
  );
  return r.rows;
}

export async function listRfqs(pool: Pool, storeId: number, status?: string) {
  const params: unknown[] = [storeId];
  let where = "store_id = $1";
  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  const r = await pool.query(
    `SELECT id, rfq_number AS "rfqNumber", title, status,
            valid_until::text AS "validUntil",
            (SELECT count(*)::int FROM supplier_quotes q WHERE q.rfq_id = purchase_rfqs.id) AS "quoteCount",
            created_at::text AS "createdAt"
       FROM purchase_rfqs WHERE ${where}
       ORDER BY created_at DESC LIMIT 200`,
    params,
  );
  return { rows: r.rows };
}

/**
 * Comparativo: para cada línea del RFQ, el precio ofrecido por cada
 * proveedor. Con esto un frontend arma la matriz sin traer líneas sueltas.
 */
export async function compareQuotes(pool: Pool, rfqId: number) {
  const rfqLines = await getRfqLines(pool, rfqId);
  const quotes = await listRfqQuotes(pool, rfqId);
  const results: Array<Record<string, unknown>> = [];
  for (const line of rfqLines) {
    const cells = await pool.query(
      `SELECT sq.id AS "quoteId", sq.supplier_name AS "supplierName",
              sql.unit_price::text AS "unitPrice",
              sql.line_total::text AS "lineTotal",
              sql.availability_days AS "availabilityDays"
         FROM supplier_quote_lines sql
         JOIN supplier_quotes sq ON sq.id = sql.quote_id
        WHERE sq.rfq_id = $1 AND sql.rfq_line_id = $2`,
      [rfqId, line.id],
    );
    results.push({
      rfqLine: line,
      offers: cells.rows,
    });
  }
  return { rfqLines, quotes, comparison: results };
}
