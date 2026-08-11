-- Cotizaciones de venta (Fase 01).
--
-- Un cliente pide un precio; el vendedor arma una cotización; si el cliente
-- acepta, se convierte en pedido o factura. Hoy el sistema salta directo a
-- facturar (consume un NCF) o a pedido; una cotización rechazada no debería
-- gastar ningún número fiscal.
--
-- Estructura: header con datos del cliente/vendedor, líneas con producto y
-- precio, estado (draft → sent → accepted → converted / expired / rejected),
-- fecha de vencimiento, y enlace al documento que se generó al aceptar.

CREATE TABLE IF NOT EXISTS sales_quotes (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    quote_number text NOT NULL,
    customer_id integer REFERENCES customers(id) ON DELETE SET NULL,
    customer_name text,
    customer_rnc text,
    customer_email text,
    customer_phone text,
    warehouse_id integer REFERENCES warehouses(id) ON DELETE SET NULL,
    salesperson_id integer REFERENCES users(id) ON DELETE SET NULL,
    subtotal numeric(14, 2) DEFAULT 0 NOT NULL,
    discount_amount numeric(14, 2) DEFAULT 0 NOT NULL,
    tax_amount numeric(14, 2) DEFAULT 0 NOT NULL,
    total_amount numeric(14, 2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'DOP' NOT NULL,
    status text DEFAULT 'draft' NOT NULL,
    valid_until date,
    notes text,
    internal_notes text,
    /* Cuando se convierte, quedan enlazados el tipo y el id destino: 'order' o
       'invoice'. La cotización no se borra, sólo cambia de estado. */
    converted_to text,
    converted_document_id integer,
    converted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sales_quotes_status_ck CHECK (status IN ('draft','sent','accepted','rejected','expired','converted','cancelled')),
    CONSTRAINT sales_quotes_converted_ck CHECK (converted_to IS NULL OR converted_to IN ('order','invoice'))
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS sales_quotes_number_uq
    ON sales_quotes (store_id, quote_number);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS sales_quotes_status_idx
    ON sales_quotes (store_id, status, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sales_quotes_customer_idx
    ON sales_quotes (customer_id) WHERE customer_id IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS sales_quote_lines (
    id serial PRIMARY KEY,
    quote_id integer NOT NULL REFERENCES sales_quotes(id) ON DELETE CASCADE,
    product_id integer REFERENCES products(id) ON DELETE SET NULL,
    product_name text NOT NULL,
    sku text,
    quantity numeric(12, 2) NOT NULL,
    unit_price numeric(14, 4) NOT NULL,
    discount_percent numeric(5, 2) DEFAULT 0 NOT NULL,
    line_total numeric(14, 2) NOT NULL,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT sales_quote_lines_qty_ck CHECK (quantity > 0),
    CONSTRAINT sales_quote_lines_discount_ck CHECK (discount_percent >= 0 AND discount_percent <= 100)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS sales_quote_lines_quote_idx
    ON sales_quote_lines (quote_id, sort_order);
--> statement-breakpoint

-- Contador de secuencia por store: COT-000001, COT-000002…
CREATE TABLE IF NOT EXISTS sales_quote_sequences (
    store_id integer PRIMARY KEY,
    prefix text DEFAULT 'COT' NOT NULL,
    next_number integer DEFAULT 1 NOT NULL
);
