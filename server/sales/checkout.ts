import { SqlClient } from "../accounting/types";
import { Decimal, add, mul, sub, toMoney, roundTo, isZero, cmp } from "../accounting/decimal";
import { FiscalDocumentService, IssueLineInput } from "../fiscal/document-service";
import { claimWarehouse } from "../inventory/operational-stock";

/**
 * A sale, once.
 *
 * The POS and the invoicing screen used to make three calls — create a legacy
 * order (which deducted `products.stock_quantity`), register a legacy credit
 * charge, then issue the fiscal invoice (which issued stock again from the valued
 * ledger). Two stock deductions, two receivables, and a failure between calls
 * left half a sale behind.
 *
 * Checkout does all of it in one transaction: the operational order is recorded
 * for delivery, loyalty and sales history *without* touching stock, and the
 * fiscal invoice allocates the NCF, posts revenue and ITBIS, issues the goods at
 * cost (which keeps every stock view in step) and, on credit, opens the
 * receivable. Either the whole sale exists or none of it does.
 */
export class CheckoutError extends Error {}

export type PaymentMethod = "cash" | "card" | "transfer" | "credit";

export interface CheckoutLine {
  productId?: number;
  description: string;
  quantity: Decimal;
  unitPrice: Decimal;
  /** Absolute discount on the line, before tax. */
  discount?: Decimal;
  taxCode: string;
}

export interface CheckoutInput {
  companyId: number;
  storeId: number;
  userId?: number;
  issuerRnc: string;
  /** Warehouse the goods leave from; 0 = the company's single undivided store. */
  warehouseId: number;
  ncfType: string;
  date: string;
  paymentMethod: PaymentMethod;
  customerId?: number;
  buyerRnc?: string;
  buyerName?: string;
  dueDate?: string;
  sellerUserId?: number;
  currency?: string;
  fxRate?: Decimal;
  lines: CheckoutLine[];
  /** Record the operational order (delivery, loyalty, history). Default true. */
  createOrder?: boolean;
  notes?: string;
  /**
   * Discount policy: the largest line discount, as a percent of the line gross,
   * the caller may grant without approval. Enforced when set.
   */
  maxDiscountPercent?: Decimal;
  /** A supervisor authorised a discount above the policy. */
  discountApprovedBy?: number;
  /**
   * Apply the store's active promotions (percent off, amount off, buy-X-get-Y)
   * on top of each product line's own discount. The promotion's discount is
   * part of the line discount the invoice carries, so revenue is posted net and
   * the 607 shows the discounted base.
   */
  applyPromotions?: boolean;
}

export interface CheckoutResult {
  orderId: number | null;
  orderNumber: string | null;
  documentId: number;
  ncf: string;
  total: Decimal;
  cogsTotal: Decimal;
  openItemId: number | null;
  journalEntryId: number;
}

export async function checkout(client: SqlClient, input: CheckoutInput): Promise<CheckoutResult> {
  if (input.lines.length === 0) throw new CheckoutError("la venta necesita al menos una línea");
  if (input.applyPromotions) {
    input = { ...input, lines: await withPromotions(client, input.storeId, input.date, input.customerId, input.lines) };
  }
  if (input.paymentMethod === "credit" && !input.customerId) {
    throw new CheckoutError("una venta a crédito necesita un cliente registrado");
  }

  for (const l of input.lines) {
    if (cmp(l.quantity, "0") <= 0) throw new CheckoutError(`"${l.description}": la cantidad debe ser positiva`);
    if (cmp(l.unitPrice, "0") < 0) throw new CheckoutError(`"${l.description}": el precio no puede ser negativo`);
    const gross = roundTo(mul(l.quantity, l.unitPrice), 2);
    const discount = l.discount ?? "0";
    if (cmp(discount, gross) > 0) throw new CheckoutError(`"${l.description}": el descuento excede el importe de la línea`);
    if (input.maxDiscountPercent !== undefined && !input.discountApprovedBy && !isZero(gross)) {
      const limit = roundTo(mul(gross, input.maxDiscountPercent), 4);
      // limit is gross × percent; compare discount × 100 against it.
      if (cmp(mul(discount, "100"), limit) > 0) {
        throw new CheckoutError(
          `"${l.description}": el descuento supera el ${input.maxDiscountPercent}% permitido y requiere aprobación`,
        );
      }
    }
  }

  let orderId: number | null = null;
  let orderNumber: string | null = null;
  const productLines = input.lines.filter((l) => l.productId);

  if ((input.createOrder ?? true) && productLines.length > 0 && input.warehouseId > 0) {
    await claimWarehouse(client, input.companyId, input.warehouseId);
    const gross = input.lines.reduce<Decimal>((s, l) => add(s, roundTo(mul(l.quantity, l.unitPrice), 2)), "0");
    const discount = input.lines.reduce<Decimal>((s, l) => add(s, l.discount ?? "0"), "0");
    orderNumber = `VTA-${input.companyId}-${input.date.replace(/-/g, "")}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const order = await client.query(
      `INSERT INTO orders
         (order_number, customer_id, store_id, warehouse_id, assigned_user_id, status, priority,
          description, total_amount, payment_method, payment_status, received_amount, change_amount,
          order_type, subtotal_amount, discount_amount, completed_date)
       VALUES ($1,$2,$3,$4,$5,'completed','normal',$6,$7,$8,$9,$10,0,'sale',$11,$12,$13::date)
       RETURNING id`,
      [
        orderNumber,
        input.customerId ?? null,
        input.storeId,
        input.warehouseId,
        input.sellerUserId ?? input.userId ?? null,
        input.notes ?? "Venta facturada",
        toMoney(sub(gross, discount)),
        input.paymentMethod,
        input.paymentMethod === "credit" ? "credit" : "paid",
        input.paymentMethod === "credit" ? "0" : toMoney(sub(gross, discount)),
        toMoney(gross),
        toMoney(discount),
        input.date,
      ],
    );
    orderId = Number(order.rows[0].id);
    for (const l of productLines) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price, store_id, warehouse_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          orderId,
          l.productId,
          Math.round(Number(l.quantity)),
          toMoney(l.unitPrice),
          toMoney(sub(roundTo(mul(l.quantity, l.unitPrice), 2), l.discount ?? "0")),
          input.storeId,
          input.warehouseId,
        ],
      );
    }
  }

  const lines: IssueLineInput[] = input.lines.map((l) => ({
    productId: l.productId,
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    discount: l.discount,
    taxCode: l.taxCode,
  }));

  const doc = await new FiscalDocumentService(client).issueInvoice({
    companyId: input.companyId,
    issuerRnc: input.issuerRnc,
    ncfType: input.ncfType,
    date: input.date,
    lines,
    customerId: input.customerId,
    buyerRnc: input.buyerRnc,
    buyerName: input.buyerName,
    orderId: orderId ?? undefined,
    currency: input.currency,
    fxRate: input.fxRate,
    paymentMethod: input.paymentMethod,
    dueDate: input.dueDate,
    postedBy: input.userId,
    bookCogs: true,
    warehouseId: input.warehouseId,
    sellerUserId: input.sellerUserId ?? input.userId,
  });

  return {
    orderId,
    orderNumber,
    documentId: doc.documentId,
    ncf: doc.ncf,
    total: doc.total,
    cogsTotal: doc.cogsTotal ?? "0",
    openItemId: (doc as any).openItemId ?? null,
    journalEntryId: doc.journalEntryId,
  };
}

/**
 * Adds the discount of the best active promotion for each product line.
 *
 * Promotions compete, they do not stack: for a line the one that gives the
 * largest discount wins. `percent_off` discounts the line by a percentage,
 * `amount_off` takes a fixed amount off each unit, and `bogo` gives `get`
 * units free for every `buy + get` units on the line (a 2x1 is buy 1 get 1).
 * Date window, days of the week and remaining uses are honoured; a promotion
 * used here counts one use per sale.
 */
export async function withPromotions(
  client: SqlClient,
  storeId: number,
  date: string,
  customerId: number | undefined,
  lines: CheckoutLine[],
): Promise<CheckoutLine[]> {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  const used = new Set<number>();
  const out: CheckoutLine[] = [];
  for (const l of lines) {
    if (!l.productId) { out.push(l); continue; }
    const { rows } = await client.query(
      `SELECT id, promotion_type, discount_percent::text, discount_amount::text, buy_quantity::text, get_quantity::text
         FROM promotions
        WHERE store_id=$1 AND is_active AND $2::date >= valid_from AND ($2::date <= valid_to OR valid_to IS NULL)
          AND (valid_days_of_week IS NULL OR array_length(valid_days_of_week,1) IS NULL OR $3::int = ANY(valid_days_of_week))
          AND (max_uses IS NULL OR current_uses < max_uses)
          AND (applies_to = 'order' OR (applies_to = 'product' AND $4::int = ANY(scope_product_ids)))
          AND promotion_type IN ('percent_off','amount_off','bogo')`,
      [storeId, date, dow, l.productId],
    );
    const gross = roundTo(mul(l.quantity, l.unitPrice), 2);
    let best: { id: number; discount: Decimal } | null = null;
    for (const p of rows) {
      let discount: Decimal = "0";
      if (p.promotion_type === "percent_off" && p.discount_percent) {
        discount = roundTo(String((Number(gross) * Number(p.discount_percent)) / 100), 2);
      } else if (p.promotion_type === "amount_off" && p.discount_amount) {
        discount = roundTo(mul(l.quantity, p.discount_amount), 2);
      } else if (p.promotion_type === "bogo" && p.buy_quantity && p.get_quantity) {
        const block = Number(p.buy_quantity) + Number(p.get_quantity);
        const free = Math.floor(Number(l.quantity) / block) * Number(p.get_quantity);
        discount = roundTo(mul(String(free), l.unitPrice), 2);
      }
      if (cmp(discount, gross) > 0) discount = gross;
      if (!best || cmp(discount, best.discount) > 0) best = { id: Number(p.id), discount };
    }
    if (best && !isZero(best.discount)) {
      used.add(best.id);
      out.push({ ...l, discount: toMoney(add(l.discount ?? "0", best.discount)) });
    } else {
      out.push(l);
    }
  }
  for (const id of used) {
    await client.query(`UPDATE promotions SET current_uses = current_uses + 1 WHERE id=$1`, [id]);
  }
  void customerId;
  return out;
}

/**
 * Turns an accepted quote into the sale, without retyping it. The quote's
 * lines (price and percentage discount included) become the invoice lines, the
 * quote is marked converted and points at the fiscal document it became.
 */
export async function checkoutFromQuote(
  client: SqlClient,
  input: Omit<CheckoutInput, "lines" | "customerId" | "buyerRnc" | "buyerName"> & {
    quoteId: number;
    extraLines?: CheckoutLine[];
    /** Tax code per product; defaults to ITBIS18. */
    taxCodeOf?: (productId: number | null) => string;
  },
): Promise<CheckoutResult> {
  const q = await client.query(
    `SELECT id, store_id, status, customer_id, customer_name, customer_rnc, valid_until::text FROM sales_quotes WHERE id=$1 FOR UPDATE`,
    [input.quoteId],
  );
  if (q.rows.length === 0 || Number(q.rows[0].store_id) !== input.storeId) throw new CheckoutError("cotización no encontrada");
  const quote = q.rows[0];
  if (quote.status !== "accepted") {
    throw new CheckoutError(`la cotización está ${quote.status}: solo una cotización aceptada se factura`);
  }
  if (quote.valid_until && quote.valid_until < input.date) throw new CheckoutError("la cotización está vencida");
  const lines = await client.query(
    `SELECT l.product_id, l.product_name, l.quantity::text, l.unit_price::text, l.discount_percent::text,
            (SELECT fl.tax_code FROM fiscal_document_lines fl WHERE fl.product_id = l.product_id AND fl.tax_code IS NOT NULL
              ORDER BY fl.id DESC LIMIT 1) AS last_tax_code
       FROM sales_quote_lines l WHERE l.quote_id=$1 ORDER BY l.sort_order, l.id`,
    [input.quoteId],
  );
  const checkoutLines: CheckoutLine[] = lines.rows.map((l: any) => {
    const gross = roundTo(mul(l.quantity, l.unit_price), 2);
    const discount = roundTo(String((Number(gross) * Number(l.discount_percent ?? 0)) / 100), 2);
    return {
      productId: l.product_id ?? undefined,
      description: l.product_name,
      quantity: l.quantity,
      unitPrice: l.unit_price,
      discount: isZero(discount) ? undefined : discount,
      taxCode: input.taxCodeOf?.(l.product_id) ?? l.last_tax_code ?? "ITBIS18",
    };
  });
  const result = await checkout(client, {
    ...input,
    customerId: quote.customer_id ?? undefined,
    buyerRnc: quote.customer_rnc ?? undefined,
    buyerName: quote.customer_name ?? undefined,
    lines: [...checkoutLines, ...(input.extraLines ?? [])],
  });
  await client.query(
    `UPDATE sales_quotes SET status='converted', converted_to='invoice', converted_document_id=$2, converted_at=now(), updated_at=now()
      WHERE id=$1`,
    [input.quoteId, result.documentId],
  );
  return result;
}
