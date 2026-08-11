-- Devoluciones a proveedor (Fase 01).
--
-- Espejo de las devoluciones de venta: se devuelve mercancía a quien nos la
-- vendió. Cabecera con orden de compra referenciada, líneas con producto y
-- cantidad, y estado (draft → sent → completed / cancelled). El asiento
-- contable y el descuento de inventario se disparan al completar.

CREATE TABLE IF NOT EXISTS purchase_returns (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    return_number text NOT NULL,
    supplier_id integer REFERENCES suppliers(id) ON DELETE SET NULL,
    supplier_name text,
    purchase_order_id integer REFERENCES purchase_orders(id) ON DELETE SET NULL,
    return_date date NOT NULL DEFAULT CURRENT_DATE,
    reason text,
    subtotal numeric(14, 2) DEFAULT 0 NOT NULL,
    tax_amount numeric(14, 2) DEFAULT 0 NOT NULL,
    total_amount numeric(14, 2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'DOP' NOT NULL,
    status text DEFAULT 'draft' NOT NULL,
    notes text,
    created_by integer,
    completed_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT purchase_returns_status_ck CHECK (status IN ('draft','sent','completed','cancelled'))
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS purchase_returns_number_uq
    ON purchase_returns (store_id, return_number);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS purchase_returns_status_idx
    ON purchase_returns (store_id, status, return_date DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS purchase_returns_po_idx
    ON purchase_returns (purchase_order_id) WHERE purchase_order_id IS NOT NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS purchase_return_lines (
    id serial PRIMARY KEY,
    return_id integer NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
    product_id integer REFERENCES products(id) ON DELETE SET NULL,
    product_name text NOT NULL,
    sku text,
    /* Línea original de la OC que se está devolviendo, para límites de sobre-devolución. */
    purchase_line_id integer,
    quantity numeric(12, 2) NOT NULL,
    unit_cost numeric(14, 4) NOT NULL,
    line_total numeric(14, 2) NOT NULL,
    warehouse_id integer REFERENCES warehouses(id) ON DELETE SET NULL,
    notes text,
    CONSTRAINT purchase_return_lines_qty_ck CHECK (quantity > 0)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS purchase_return_lines_return_idx
    ON purchase_return_lines (return_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS purchase_return_sequences (
    store_id integer PRIMARY KEY,
    prefix text DEFAULT 'DEV' NOT NULL,
    next_number integer DEFAULT 1 NOT NULL
);
