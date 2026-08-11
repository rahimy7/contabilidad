-- Cotizaciones a proveedores y comparativo (Fase 01).
--
-- Antes de emitir una orden de compra, se piden precios a varios proveedores
-- y se compara para tomar la decisión con evidencia. Sin este paso la OC se
-- crea al primero que aparece; con él queda registro de por qué se eligió.
--
-- Estructura: un "RFQ" (request for quotation) tiene tipo, descripción y
-- productos deseados; cada proveedor invitado responde con una cotización
-- (`supplier_quotes`) con precios y disponibilidad. El comparativo es una
-- consulta sobre las respuestas activas; el ganador se marca al aceptar.

CREATE TABLE IF NOT EXISTS purchase_rfqs (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    rfq_number text NOT NULL,
    title text NOT NULL,
    description text,
    requested_by integer NOT NULL,
    valid_until date,
    status text DEFAULT 'draft' NOT NULL,
    /* Se enlaza a la OC ganadora cuando se cierra el proceso. */
    awarded_supplier_id integer REFERENCES suppliers(id) ON DELETE SET NULL,
    awarded_quote_id integer,
    awarded_purchase_order_id integer REFERENCES purchase_orders(id) ON DELETE SET NULL,
    awarded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT purchase_rfqs_status_ck CHECK (status IN ('draft','sent','awarded','cancelled','closed'))
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS purchase_rfqs_number_uq
    ON purchase_rfqs (store_id, rfq_number);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS purchase_rfqs_status_idx
    ON purchase_rfqs (store_id, status, created_at DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS purchase_rfq_lines (
    id serial PRIMARY KEY,
    rfq_id integer NOT NULL REFERENCES purchase_rfqs(id) ON DELETE CASCADE,
    product_id integer REFERENCES products(id) ON DELETE SET NULL,
    product_name text NOT NULL,
    sku text,
    quantity numeric(12, 2) NOT NULL,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT purchase_rfq_lines_qty_ck CHECK (quantity > 0)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS purchase_rfq_lines_rfq_idx
    ON purchase_rfq_lines (rfq_id, sort_order);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS supplier_quotes (
    id serial PRIMARY KEY,
    rfq_id integer NOT NULL REFERENCES purchase_rfqs(id) ON DELETE CASCADE,
    supplier_id integer REFERENCES suppliers(id) ON DELETE SET NULL,
    supplier_name text,
    subtotal numeric(14, 2) DEFAULT 0 NOT NULL,
    tax_amount numeric(14, 2) DEFAULT 0 NOT NULL,
    total_amount numeric(14, 2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'DOP' NOT NULL,
    lead_time_days integer,
    valid_until date,
    notes text,
    is_selected boolean DEFAULT false NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS supplier_quotes_rfq_idx
    ON supplier_quotes (rfq_id, total_amount);
--> statement-breakpoint
-- Sólo una cotización aceptada por RFQ.
CREATE UNIQUE INDEX IF NOT EXISTS supplier_quotes_selected_uq
    ON supplier_quotes (rfq_id) WHERE is_selected = true;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS supplier_quote_lines (
    id serial PRIMARY KEY,
    quote_id integer NOT NULL REFERENCES supplier_quotes(id) ON DELETE CASCADE,
    rfq_line_id integer REFERENCES purchase_rfq_lines(id) ON DELETE SET NULL,
    product_name text NOT NULL,
    quantity numeric(12, 2) NOT NULL,
    unit_price numeric(14, 4) NOT NULL,
    line_total numeric(14, 2) NOT NULL,
    availability_days integer,
    notes text,
    CONSTRAINT supplier_quote_lines_qty_ck CHECK (quantity > 0)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS supplier_quote_lines_quote_idx
    ON supplier_quote_lines (quote_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS purchase_rfq_sequences (
    store_id integer PRIMARY KEY,
    prefix text DEFAULT 'RFQ' NOT NULL,
    next_number integer DEFAULT 1 NOT NULL
);
