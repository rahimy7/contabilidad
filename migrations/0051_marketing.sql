-- Fase 04 · Comercial y Mercadeo interno.
--
-- El plan sugería integrar el mercadeo a un CRM externo. Con B2B+B2C el
-- mercadeo pertenece al ERP: segmentos (para promociones específicas),
-- campañas (con presupuesto y ROI), leads (contactos que aún no son clientes),
-- promociones (con vigencia y condiciones) y comisiones (que tocan la
-- nómina).

-- ── Segmentos de clientes ─────────────────────────────────────────────────
--
-- Un segmento agrupa clientes por criterios estables (tipo de cliente,
-- ubicación, comportamiento de compra). Sirve para dirigir campañas y
-- promociones a la audiencia correcta.

CREATE TABLE IF NOT EXISTS customer_segments (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    /* Tipo de segmento:
         b2b_wholesale = mayorista B2B
         b2b_distributor = distribuidor
         b2c_retail = consumidor final
         b2c_vip = alto valor B2C
         b2c_frequent = cliente frecuente
         inactive = sin compras en > N días
         at_risk = clientes cuya frecuencia bajó */
    segment_type text DEFAULT 'custom' NOT NULL,
    /* Reglas expresadas en JSON: consumo min, frecuencia, ubicación, tags.
       El servicio las evalúa al reclasificar. */
    rules jsonb,
    /* Un segmento puede ser fijo (asignado manual) o dinámico (recalculado). */
    is_dynamic boolean DEFAULT true NOT NULL,
    /* Cantidad actual de clientes en el segmento; cache para dashboards. */
    member_count integer DEFAULT 0 NOT NULL,
    last_recomputed_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_segments_type_ck CHECK (segment_type IN (
        'b2b_wholesale','b2b_distributor','b2c_retail','b2c_vip',
        'b2c_frequent','inactive','at_risk','custom'
    ))
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS customer_segments_code_uq
    ON customer_segments (store_id, code);
--> statement-breakpoint

-- Enlace cliente ↔ segmento; un cliente puede pertenecer a varios.
CREATE TABLE IF NOT EXISTS customer_segment_memberships (
    id bigserial PRIMARY KEY,
    segment_id integer NOT NULL REFERENCES customer_segments(id) ON DELETE CASCADE,
    customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    added_by integer,
    /* Si fue asignado manualmente vs por reclasificación dinámica. */
    is_manual boolean DEFAULT false NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS customer_segment_memberships_uq
    ON customer_segment_memberships (segment_id, customer_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS customer_segment_memberships_customer_idx
    ON customer_segment_memberships (customer_id);
--> statement-breakpoint

-- ── Campañas de mercadeo ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS marketing_campaigns (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    /* Canal principal: whatsapp, email, sms, redes, offline. */
    channel text NOT NULL,
    /* Objetivo declarado: conversión, retención, awareness, reactivación. */
    objective text NOT NULL,
    start_date date NOT NULL,
    end_date date,
    /* Segmentos objetivo. */
    target_segment_ids integer[] DEFAULT '{}'::integer[] NOT NULL,
    /* Presupuesto planificado y ejecutado. */
    budget_amount numeric(14, 2) DEFAULT 0 NOT NULL,
    spent_amount numeric(14, 2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'DOP' NOT NULL,
    /* KPIs objetivo. */
    target_reach integer,
    target_conversions integer,
    /* Métricas obtenidas — se actualizan reactivamente. */
    reach_count integer DEFAULT 0 NOT NULL,
    engagement_count integer DEFAULT 0 NOT NULL,
    conversion_count integer DEFAULT 0 NOT NULL,
    revenue_generated numeric(14, 2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'planning' NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marketing_campaigns_channel_ck CHECK (channel IN ('whatsapp','email','sms','social','offline','multi')),
    CONSTRAINT marketing_campaigns_obj_ck CHECK (objective IN ('conversion','retention','awareness','reactivation','loyalty','launch')),
    CONSTRAINT marketing_campaigns_status_ck CHECK (status IN ('planning','active','paused','completed','cancelled')),
    CONSTRAINT marketing_campaigns_range_ck CHECK (end_date IS NULL OR end_date >= start_date)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS marketing_campaigns_code_uq
    ON marketing_campaigns (store_id, code);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS marketing_campaigns_status_idx
    ON marketing_campaigns (store_id, status, start_date DESC);
--> statement-breakpoint

-- Gastos de la campaña: pauta digital, imprenta, comisiones a influencers,
-- descuentos aplicados. Suma a `spent_amount`.
CREATE TABLE IF NOT EXISTS marketing_campaign_expenses (
    id serial PRIMARY KEY,
    campaign_id integer NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
    expense_date date DEFAULT CURRENT_DATE NOT NULL,
    category text NOT NULL,
    description text,
    amount numeric(14, 2) NOT NULL,
    currency text DEFAULT 'DOP' NOT NULL,
    /* Enlace al asiento contable cuando el gasto se registra formalmente. */
    journal_entry_id bigint,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marketing_campaign_expenses_amount_ck CHECK (amount > 0)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS marketing_campaign_expenses_campaign_idx
    ON marketing_campaign_expenses (campaign_id);
--> statement-breakpoint

-- Atribución: qué ventas vinieron de qué campaña. Se enlaza a `orders` para
-- el ROI.
CREATE TABLE IF NOT EXISTS marketing_campaign_conversions (
    id bigserial PRIMARY KEY,
    campaign_id integer NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
    customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
    order_id integer REFERENCES orders(id) ON DELETE SET NULL,
    revenue_amount numeric(14, 2) DEFAULT 0 NOT NULL,
    /* Timestamp del evento. */
    attributed_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS marketing_campaign_conversions_campaign_idx
    ON marketing_campaign_conversions (campaign_id, attributed_at DESC);
--> statement-breakpoint

-- ── Leads (contactos que aún no son clientes) ─────────────────────────────

CREATE TABLE IF NOT EXISTS marketing_leads (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    first_name text NOT NULL,
    last_name text,
    company text,
    email text,
    phone text,
    /* Origen: web, referido, campaña, whatsapp entrante, feria. */
    source text NOT NULL,
    source_campaign_id integer REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
    /* Etapa en el embudo. */
    stage text DEFAULT 'new' NOT NULL,
    /* Puntuación (lead scoring): 0-100. */
    score integer,
    interested_in text,
    estimated_value numeric(14, 2),
    /* Asignado a un vendedor para seguimiento. */
    assigned_to_user_id integer,
    /* Al convertirse en cliente. */
    converted_customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
    converted_at timestamp with time zone,
    lost_reason text,
    lost_at timestamp with time zone,
    notes text,
    tags text[],
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marketing_leads_stage_ck CHECK (stage IN ('new','contacted','qualified','proposal','negotiation','won','lost')),
    CONSTRAINT marketing_leads_score_ck CHECK (score IS NULL OR (score >= 0 AND score <= 100))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS marketing_leads_stage_idx
    ON marketing_leads (store_id, stage, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS marketing_leads_assigned_idx
    ON marketing_leads (assigned_to_user_id) WHERE assigned_to_user_id IS NOT NULL;
--> statement-breakpoint

-- Interacciones con el lead: llamadas, mensajes, correos, reuniones.
CREATE TABLE IF NOT EXISTS marketing_lead_activities (
    id bigserial PRIMARY KEY,
    lead_id integer NOT NULL REFERENCES marketing_leads(id) ON DELETE CASCADE,
    activity_type text NOT NULL,
    activity_date timestamp with time zone DEFAULT now() NOT NULL,
    summary text,
    outcome text,
    performed_by_user_id integer,
    /* Próximo paso planeado. */
    next_action text,
    next_action_at timestamp with time zone,
    CONSTRAINT marketing_lead_activities_type_ck CHECK (activity_type IN ('call','email','whatsapp','sms','meeting','visit','proposal','other'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS marketing_lead_activities_lead_idx
    ON marketing_lead_activities (lead_id, activity_date DESC);
--> statement-breakpoint

-- ── Promociones ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS promotions (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    /* Tipos de promoción:
         percent_off = X% de descuento
         amount_off = monto fijo de descuento
         bogo = 2x1, 3x2 (buy N get M free)
         bundle = combo de productos por precio fijo
         gift = compra X y llévate Y gratis
         free_shipping = envío gratis */
    promotion_type text NOT NULL,
    /* Configuración específica del tipo. */
    discount_percent numeric(5, 2),
    discount_amount numeric(14, 2),
    buy_quantity numeric(12, 2),
    get_quantity numeric(12, 2),
    bundle_price numeric(14, 2),
    /* Alcance: producto, categoría o toda la orden. */
    applies_to text DEFAULT 'order' NOT NULL,
    scope_product_ids integer[],
    scope_category_ids integer[],
    /* Restricciones para aplicarse. */
    min_order_amount numeric(14, 2) DEFAULT 0 NOT NULL,
    min_items integer DEFAULT 0 NOT NULL,
    /* Vigencia. */
    valid_from date NOT NULL,
    valid_to date,
    /* Días de la semana permitidos: array de 0-6 (dom=0). Empty = todos. */
    valid_days_of_week integer[],
    valid_hour_start time,
    valid_hour_end time,
    /* Segmentos a los que aplica; empty = todos los clientes. */
    target_segment_ids integer[] DEFAULT '{}'::integer[] NOT NULL,
    /* Límites de uso. */
    max_uses integer,
    max_uses_per_customer integer,
    current_uses integer DEFAULT 0 NOT NULL,
    /* No se combina con otras si es exclusive. */
    is_exclusive boolean DEFAULT false NOT NULL,
    requires_coupon_code boolean DEFAULT false NOT NULL,
    coupon_code text,
    is_active boolean DEFAULT true NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT promotions_type_ck CHECK (promotion_type IN ('percent_off','amount_off','bogo','bundle','gift','free_shipping')),
    CONSTRAINT promotions_applies_ck CHECK (applies_to IN ('product','category','order')),
    CONSTRAINT promotions_range_ck CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS promotions_code_uq
    ON promotions (store_id, code);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS promotions_active_idx
    ON promotions (store_id, valid_from, valid_to) WHERE is_active = true;
--> statement-breakpoint

-- Uso de la promoción: qué orden la aplicó y cuánto ahorró.
CREATE TABLE IF NOT EXISTS promotion_usages (
    id bigserial PRIMARY KEY,
    promotion_id integer NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    order_id integer REFERENCES orders(id) ON DELETE SET NULL,
    customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
    discount_applied numeric(14, 2) DEFAULT 0 NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS promotion_usages_promo_idx
    ON promotion_usages (promotion_id, applied_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS promotion_usages_customer_idx
    ON promotion_usages (customer_id) WHERE customer_id IS NOT NULL;
--> statement-breakpoint

-- ── Comisiones por vendedor ────────────────────────────────────────────────
--
-- Los vendedores B2B cobran comisión sobre lo que venden. Reglas definidas
-- por producto, margen, categoría o meta cumplida. Liquidación entra a la
-- nómina del período.

CREATE TABLE IF NOT EXISTS commission_rules (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    /* Base de cálculo: revenue (venta bruta), gross_margin (margen bruto),
       units (número de unidades vendidas). */
    calculation_base text NOT NULL,
    /* Alcance: por vendedor, todos, o por rol. */
    scope_type text DEFAULT 'all_sellers' NOT NULL,
    scope_user_ids integer[],
    scope_role text,
    /* Producto/categoría al que aplica; null = todos. */
    product_id integer REFERENCES products(id) ON DELETE SET NULL,
    category_id integer,
    /* Configuración del cálculo. */
    percent_rate numeric(6, 3),
    fixed_per_unit numeric(14, 2),
    /* Meta: si se alcanza, la comisión sube al `bonus_percent`. */
    goal_amount numeric(14, 2),
    bonus_percent numeric(6, 3),
    /* Vigencia. */
    valid_from date DEFAULT CURRENT_DATE NOT NULL,
    valid_to date,
    priority integer DEFAULT 100 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT commission_rules_base_ck CHECK (calculation_base IN ('revenue','gross_margin','units')),
    CONSTRAINT commission_rules_scope_ck CHECK (scope_type IN ('all_sellers','by_user','by_role'))
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS commission_rules_code_uq
    ON commission_rules (store_id, code);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS commission_rules_active_idx
    ON commission_rules (store_id, priority) WHERE is_active = true;
--> statement-breakpoint

-- Comisiones acumuladas por vendedor por período (quincena/mes). Se liquidan
-- al cierre y alimentan la nómina como un adicional al sueldo base.
CREATE TABLE IF NOT EXISTS commission_earnings (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    user_id integer NOT NULL,
    period_year integer NOT NULL,
    period_month smallint NOT NULL,
    /* Bases del período. */
    total_revenue numeric(14, 2) DEFAULT 0 NOT NULL,
    total_gross_margin numeric(14, 2) DEFAULT 0 NOT NULL,
    total_units numeric(14, 2) DEFAULT 0 NOT NULL,
    goal_amount numeric(14, 2) DEFAULT 0 NOT NULL,
    goal_achieved boolean DEFAULT false NOT NULL,
    /* Monto de la comisión ganado. */
    commission_amount numeric(14, 2) DEFAULT 0 NOT NULL,
    bonus_amount numeric(14, 2) DEFAULT 0 NOT NULL,
    total_earned numeric(14, 2) DEFAULT 0 NOT NULL,
    /* Estado: se calcula al cerrar período, se aprueba, y se paga junto con nómina. */
    status text DEFAULT 'draft' NOT NULL,
    /* Enlace al payslip cuando se paga. */
    payslip_id integer,
    approved_by integer,
    approved_at timestamp with time zone,
    paid_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT commission_earnings_month_ck CHECK (period_month BETWEEN 1 AND 12),
    CONSTRAINT commission_earnings_status_ck CHECK (status IN ('draft','approved','paid','cancelled'))
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS commission_earnings_uq
    ON commission_earnings (store_id, user_id, period_year, period_month)
    WHERE status <> 'cancelled';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS commission_earnings_user_idx
    ON commission_earnings (user_id, period_year DESC, period_month DESC);
