-- Fase 04 · Comercial — Listas de precios y condiciones de crédito B2B.
--
-- Un ERP B2B+B2C atiende dos realidades muy distintas:
--   B2C: precio único de venta al público, cobro inmediato en POS.
--   B2B: precio negociado por cliente, crédito con plazos y límite, orden
--        de compra y despacho antes de facturar.
--
-- El modelo actual (products.price) sólo cubre B2C. Esto agrega:
--   * `price_lists` — listas nombradas (retail, mayorista, distribuidor,
--     institucional) con vigencia y moneda.
--   * `price_list_items` — precio de cada producto en cada lista; si no
--     está listado, aplica el precio base.
--   * `customer_pricing_tiers` — a qué lista pertenece cada cliente.
--   * `customer_credit_terms` — plazo (30/60/90), límite y descuento por
--     pronto pago.
--   * `volume_discounts` — descuentos por cantidad por producto o categoría.

-- ── Listas de precios ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS price_lists (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    /* Retail = venta al público; mayorista, distribuidor, institucional. */
    tier text DEFAULT 'retail' NOT NULL,
    currency text DEFAULT 'DOP' NOT NULL,
    /* Vigencia. Si `valid_to` es null, aplica indefinidamente. */
    valid_from date DEFAULT CURRENT_DATE NOT NULL,
    valid_to date,
    /* Cuando la lista se calcula sobre el precio base (products.price)
       con un porcentaje de descuento común, se guarda aquí como fallback. */
    default_discount_percent numeric(5, 2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_default_for_tier boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT price_lists_tier_ck CHECK (tier IN ('retail','wholesale','distributor','institutional','vip','custom')),
    CONSTRAINT price_lists_discount_ck CHECK (default_discount_percent >= 0 AND default_discount_percent <= 100),
    CONSTRAINT price_lists_range_ck CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS price_lists_code_uq
    ON price_lists (store_id, code);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS price_lists_tier_idx
    ON price_lists (store_id, tier, is_active);
--> statement-breakpoint

-- Precio de cada producto en la lista. Precio nulo o ausente = usar el base
-- con el descuento default. Se guarda el ITBIS aparte para casos donde el
-- precio B2B es netamente sin impuestos.
CREATE TABLE IF NOT EXISTS price_list_items (
    id serial PRIMARY KEY,
    price_list_id integer NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
    product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    unit_price numeric(14, 4) NOT NULL,
    min_quantity numeric(12, 2) DEFAULT 1 NOT NULL,
    /* Si es true, el precio ya incluye ITBIS; si es false hay que sumarlo. */
    tax_included boolean DEFAULT true NOT NULL,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT price_list_items_qty_ck CHECK (min_quantity > 0),
    CONSTRAINT price_list_items_price_ck CHECK (unit_price >= 0)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS price_list_items_uq
    ON price_list_items (price_list_id, product_id, min_quantity);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS price_list_items_product_idx
    ON price_list_items (product_id) WHERE is_active = true;
--> statement-breakpoint

-- ── Descuentos por volumen ────────────────────────────────────────────────
--
-- Independiente de las listas: aplican a cualquier venta cuando la cantidad
-- comprada del producto (o de la categoría) supera un umbral.

CREATE TABLE IF NOT EXISTS volume_discounts (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    scope_type text NOT NULL,
    scope_id integer,
    name text NOT NULL,
    /* Escalones: >=10 = 5%, >=25 = 8%, >=50 = 12%. Uno por fila; la venta
       aplica el escalón cuya cantidad mínima cabe en la compra. */
    min_quantity numeric(12, 2) NOT NULL,
    discount_percent numeric(5, 2) NOT NULL,
    valid_from date DEFAULT CURRENT_DATE NOT NULL,
    valid_to date,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT volume_discounts_scope_ck CHECK (scope_type IN ('product','category','all')),
    CONSTRAINT volume_discounts_qty_ck CHECK (min_quantity > 0),
    CONSTRAINT volume_discounts_pct_ck CHECK (discount_percent > 0 AND discount_percent <= 100)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS volume_discounts_lookup_idx
    ON volume_discounts (store_id, scope_type, scope_id, min_quantity)
    WHERE is_active = true;
--> statement-breakpoint

-- ── Enlace cliente ↔ lista/condiciones ────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_pricing_terms (
    id serial PRIMARY KEY,
    customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    store_id integer NOT NULL,
    /* Lista de precios asignada; null = precio base + descuento por cliente. */
    price_list_id integer REFERENCES price_lists(id) ON DELETE SET NULL,
    /* Descuento adicional sobre la lista (negociación específica). */
    additional_discount_percent numeric(5, 2) DEFAULT 0 NOT NULL,
    /* Condiciones de crédito. `credit_days = 0` = cobro contra entrega. */
    credit_days integer DEFAULT 0 NOT NULL,
    credit_limit numeric(14, 2) DEFAULT 0 NOT NULL,
    /* Descuento por pronto pago si paga antes de N días (ej: 2/10 net 30). */
    early_payment_discount_percent numeric(5, 2) DEFAULT 0 NOT NULL,
    early_payment_days integer,
    /* Retención de impuestos: algunos clientes B2B son agentes de retención. */
    itbis_retention_percent numeric(5, 2) DEFAULT 0 NOT NULL,
    isr_retention_percent numeric(5, 2) DEFAULT 0 NOT NULL,
    /* Requiere orden de compra formal para facturar. */
    requires_purchase_order boolean DEFAULT false NOT NULL,
    /* Nota de cobro: días de gracia antes de reportar como moroso. */
    grace_period_days integer DEFAULT 0 NOT NULL,
    notes text,
    valid_from date DEFAULT CURRENT_DATE NOT NULL,
    valid_to date,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_pricing_terms_credit_ck CHECK (credit_days >= 0 AND credit_limit >= 0),
    CONSTRAINT customer_pricing_terms_disc_ck CHECK (additional_discount_percent >= 0 AND additional_discount_percent <= 100)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS customer_pricing_terms_active_uq
    ON customer_pricing_terms (customer_id) WHERE is_active = true;
--> statement-breakpoint

-- Contactos adicionales de clientes B2B: comprador, contador, gerente. Cada
-- uno con su rol y datos, para saber a quién enviar la factura vs a quién
-- llamar por cobranza.
CREATE TABLE IF NOT EXISTS customer_contacts (
    id serial PRIMARY KEY,
    customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    name text NOT NULL,
    role text NOT NULL,
    email text,
    phone text,
    mobile text,
    is_primary boolean DEFAULT false NOT NULL,
    /* Quién recibe la factura y quién los estados de cuenta. */
    receives_invoices boolean DEFAULT false NOT NULL,
    receives_statements boolean DEFAULT false NOT NULL,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_contacts_role_ck CHECK (role IN ('buyer','accountant','manager','operations','warehouse','other'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS customer_contacts_customer_idx
    ON customer_contacts (customer_id) WHERE is_active = true;
