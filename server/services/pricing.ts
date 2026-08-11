import type { Pool } from "@neondatabase/serverless";

/**
 * Resolución de precio y descuentos B2B/B2C.
 *
 * Algoritmo:
 *   1. Determinar la lista de precios del cliente (customer_pricing_terms
 *      → price_list_id). Si no tiene, usar la lista `is_default_for_tier`
 *      para 'retail' del store.
 *   2. Buscar el ítem del producto en la lista con `min_quantity` cabiendo
 *      en la cantidad pedida. Si no existe, usar el precio base del producto
 *      con `default_discount_percent` de la lista.
 *   3. Aplicar `additional_discount_percent` del cliente.
 *   4. Aplicar el mejor `volume_discounts` que aplique.
 *   5. Aplicar promociones activas del cliente (segmentos que le tocan).
 *
 * Precio final = base × (1 − descuento_lista) × (1 − descuento_cliente) ×
 *                (1 − descuento_volumen) × (1 − descuento_promoción)
 * Los descuentos NO se suman: se componen; es la práctica común en DR.
 */

export interface PriceQuoteInput {
  storeId: number;
  customerId?: number;
  productId: number;
  quantity: number;
  /** Fecha para evaluar vigencias (default hoy). */
  onDate?: string;
}

export interface PriceQuote {
  productId: number;
  quantity: number;
  basePrice: number;
  listPriceId: number | null;
  listPriceName: string | null;
  listPrice: number;
  customerDiscountPct: number;
  volumeDiscountPct: number;
  volumeDiscountId: number | null;
  promotionId: number | null;
  promotionDiscountPct: number;
  finalUnitPrice: number;
  lineTotal: number;
  breakdown: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

async function loadCustomerTerms(pool: Pool, customerId: number | undefined) {
  if (!customerId) return null;
  const r = await pool.query(
    `SELECT ct.price_list_id AS "priceListId",
            ct.additional_discount_percent::text AS "additionalDiscountPct",
            ct.credit_days AS "creditDays",
            ct.credit_limit::text AS "creditLimit",
            ct.itbis_retention_percent::text AS "itbisRetentionPct"
       FROM customer_pricing_terms ct
      WHERE ct.customer_id = $1 AND ct.is_active = true
      LIMIT 1`,
    [customerId],
  );
  return r.rows[0] ?? null;
}

async function loadPriceList(pool: Pool, storeId: number, priceListId: number | null, onDate: string) {
  if (priceListId) {
    const r = await pool.query(
      `SELECT id, name, default_discount_percent::text AS "defaultDiscountPct",
              tier
         FROM price_lists
        WHERE id = $1 AND store_id = $2 AND is_active = true
          AND $3::date >= valid_from AND ($3::date <= valid_to OR valid_to IS NULL)
        LIMIT 1`,
      [priceListId, storeId, onDate],
    );
    return r.rows[0] ?? null;
  }
  // Lista por default para retail cuando el cliente no tiene una asignada.
  const r = await pool.query(
    `SELECT id, name, default_discount_percent::text AS "defaultDiscountPct", tier
       FROM price_lists
      WHERE store_id = $1 AND is_active = true AND is_default_for_tier = true
        AND tier = 'retail'
        AND $2::date >= valid_from AND ($2::date <= valid_to OR valid_to IS NULL)
      LIMIT 1`,
    [storeId, onDate],
  );
  return r.rows[0] ?? null;
}

async function loadListItem(pool: Pool, priceListId: number, productId: number, quantity: number) {
  const r = await pool.query(
    `SELECT unit_price::text AS "unitPrice", min_quantity::text AS "minQuantity"
       FROM price_list_items
      WHERE price_list_id = $1 AND product_id = $2 AND is_active = true
        AND min_quantity <= $3::numeric
      ORDER BY min_quantity DESC
      LIMIT 1`,
    [priceListId, productId, String(quantity)],
  );
  return r.rows[0] ?? null;
}

async function loadBaseProduct(pool: Pool, storeId: number, productId: number) {
  const r = await pool.query(
    `SELECT price::text FROM products WHERE id = $1 AND store_id = $2 LIMIT 1`,
    [productId, storeId],
  );
  return r.rowCount ? Number(r.rows[0].price) : 0;
}

async function bestVolumeDiscount(
  pool: Pool,
  storeId: number,
  productId: number,
  quantity: number,
  onDate: string,
): Promise<{ id: number; percent: number } | null> {
  const r = await pool.query(
    `SELECT id, discount_percent::text AS "discountPercent"
       FROM volume_discounts
      WHERE store_id = $1 AND is_active = true
        AND min_quantity <= $2::numeric
        AND $3::date >= valid_from AND ($3::date <= valid_to OR valid_to IS NULL)
        AND (scope_type = 'all' OR (scope_type = 'product' AND scope_id = $4))
      ORDER BY discount_percent DESC, min_quantity DESC
      LIMIT 1`,
    [storeId, String(quantity), onDate, productId],
  );
  if (!r.rowCount) return null;
  return { id: r.rows[0].id, percent: Number(r.rows[0].discountPercent) };
}

async function bestPromotion(
  pool: Pool,
  storeId: number,
  productId: number,
  customerId: number | undefined,
  onDate: string,
): Promise<{ id: number; percent: number } | null> {
  const r = await pool.query(
    `SELECT p.id, p.discount_percent::text AS "discountPercent"
       FROM promotions p
      WHERE p.store_id = $1 AND p.is_active = true
        AND p.promotion_type = 'percent_off'
        AND p.discount_percent IS NOT NULL
        AND $2::date >= p.valid_from AND ($2::date <= p.valid_to OR p.valid_to IS NULL)
        AND (
          p.applies_to = 'order'
          OR (p.applies_to = 'product' AND $3::int = ANY(p.scope_product_ids))
        )
        AND (
          array_length(p.target_segment_ids, 1) IS NULL
          OR EXISTS (
            SELECT 1 FROM customer_segment_memberships m
             WHERE m.customer_id = $4::int AND m.segment_id = ANY(p.target_segment_ids)
          )
        )
      ORDER BY p.discount_percent DESC
      LIMIT 1`,
    [storeId, onDate, productId, customerId ?? 0],
  );
  if (!r.rowCount) return null;
  return { id: r.rows[0].id, percent: Number(r.rows[0].discountPercent) };
}

export async function quotePrice(pool: Pool, input: PriceQuoteInput): Promise<PriceQuote> {
  const onDate = input.onDate ?? new Date().toISOString().slice(0, 10);
  const breakdown: string[] = [];

  const terms = await loadCustomerTerms(pool, input.customerId);
  const list = await loadPriceList(pool, input.storeId, terms?.priceListId ?? null, onDate);
  const basePrice = await loadBaseProduct(pool, input.storeId, input.productId);
  breakdown.push(`Precio base: ${basePrice.toFixed(2)}`);

  let listPrice = basePrice;
  if (list) {
    const item = await loadListItem(pool, list.id, input.productId, input.quantity);
    if (item) {
      listPrice = Number(item.unitPrice);
      breakdown.push(`Precio de lista '${list.name}' para qty≥${item.minQuantity}: ${listPrice.toFixed(2)}`);
    } else {
      const defaultDisc = Number(list.defaultDiscountPct);
      if (defaultDisc > 0) {
        listPrice = round4(basePrice * (1 - defaultDisc / 100));
        breakdown.push(`Descuento default de lista '${list.name}': ${defaultDisc}% → ${listPrice.toFixed(4)}`);
      }
    }
  }

  const customerDiscountPct = terms ? Number(terms.additionalDiscountPct) : 0;
  let priceAfterCustomer = listPrice;
  if (customerDiscountPct > 0) {
    priceAfterCustomer = round4(listPrice * (1 - customerDiscountPct / 100));
    breakdown.push(`Descuento adicional cliente: ${customerDiscountPct}% → ${priceAfterCustomer.toFixed(4)}`);
  }

  const vol = await bestVolumeDiscount(pool, input.storeId, input.productId, input.quantity, onDate);
  let priceAfterVolume = priceAfterCustomer;
  if (vol && vol.percent > 0) {
    priceAfterVolume = round4(priceAfterCustomer * (1 - vol.percent / 100));
    breakdown.push(`Descuento por volumen: ${vol.percent}% (regla #${vol.id}) → ${priceAfterVolume.toFixed(4)}`);
  }

  const promo = await bestPromotion(pool, input.storeId, input.productId, input.customerId, onDate);
  let finalUnitPrice = priceAfterVolume;
  if (promo && promo.percent > 0) {
    finalUnitPrice = round4(priceAfterVolume * (1 - promo.percent / 100));
    breakdown.push(`Promoción: ${promo.percent}% (promo #${promo.id}) → ${finalUnitPrice.toFixed(4)}`);
  }

  finalUnitPrice = round2(finalUnitPrice);
  const lineTotal = round2(finalUnitPrice * input.quantity);
  breakdown.push(`Total línea: ${input.quantity} × ${finalUnitPrice.toFixed(2)} = ${lineTotal.toFixed(2)}`);

  return {
    productId: input.productId,
    quantity: input.quantity,
    basePrice: round2(basePrice),
    listPriceId: list?.id ?? null,
    listPriceName: list?.name ?? null,
    listPrice: round2(listPrice),
    customerDiscountPct,
    volumeDiscountPct: vol?.percent ?? 0,
    volumeDiscountId: vol?.id ?? null,
    promotionId: promo?.id ?? null,
    promotionDiscountPct: promo?.percent ?? 0,
    finalUnitPrice,
    lineTotal,
    breakdown,
  };
}

/**
 * Verificación de crédito: dado un cliente y un monto a facturar a crédito,
 * responder si excede su límite considerando su saldo actual.
 */
export async function checkCreditAvailability(pool: Pool, customerId: number, amount: number) {
  const terms = await loadCustomerTerms(pool, customerId);
  if (!terms || Number(terms.creditLimit) === 0) {
    return { hasCredit: false, reason: "sin línea de crédito", limit: 0, used: 0, available: 0 };
  }
  const balance = await pool.query(
    `SELECT coalesce(sum(open_balance::numeric), 0)::text AS "used"
       FROM ar_open_items WHERE customer_id = $1 AND balance_status = 'open'`,
    [customerId],
  ).catch(() => ({ rows: [{ used: "0" }] } as any));
  const used = Number(balance.rows[0]?.used ?? 0);
  const limit = Number(terms.creditLimit);
  const available = limit - used;
  return {
    hasCredit: available >= amount,
    reason: available >= amount ? "ok" : `crédito insuficiente (disponible ${available.toFixed(2)}, requerido ${amount.toFixed(2)})`,
    limit,
    used,
    available,
    creditDays: terms.creditDays,
  };
}
