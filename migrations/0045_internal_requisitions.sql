-- Requisiciones internas (Fase 01).
--
-- Un departamento pide algo (papel, insumos de oficina, refacciones); pasa
-- por aprobación según monto y luego se convierte en OC. Sin este paso el
-- comprador arma la OC sin ver quién la necesitaba ni por qué.
--
-- Enlaza con el motor de aprobaciones creando una `approval_requests` de
-- documentType='requisition' cuando se envía. La conversión a OC queda del
-- lado del comprador.

CREATE TABLE IF NOT EXISTS internal_requisitions (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    requisition_number text NOT NULL,
    department text,
    requested_by integer NOT NULL,
    warehouse_id integer REFERENCES warehouses(id) ON DELETE SET NULL,
    needed_by date,
    reason text,
    subtotal numeric(14, 2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'DOP' NOT NULL,
    status text DEFAULT 'draft' NOT NULL,
    approval_request_id integer REFERENCES approval_requests(id) ON DELETE SET NULL,
    converted_purchase_order_id integer REFERENCES purchase_orders(id) ON DELETE SET NULL,
    converted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT internal_requisitions_status_ck CHECK (status IN ('draft','pending_approval','approved','rejected','converted','cancelled'))
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS internal_requisitions_number_uq
    ON internal_requisitions (store_id, requisition_number);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS internal_requisitions_status_idx
    ON internal_requisitions (store_id, status, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS internal_requisitions_requested_by_idx
    ON internal_requisitions (requested_by);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS internal_requisition_lines (
    id serial PRIMARY KEY,
    requisition_id integer NOT NULL REFERENCES internal_requisitions(id) ON DELETE CASCADE,
    product_id integer REFERENCES products(id) ON DELETE SET NULL,
    product_name text NOT NULL,
    sku text,
    quantity numeric(12, 2) NOT NULL,
    /* Estimado por el solicitante; el comprador puede refinarlo al convertir. */
    estimated_unit_cost numeric(14, 4) DEFAULT 0 NOT NULL,
    line_total numeric(14, 2) DEFAULT 0 NOT NULL,
    notes text,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT internal_requisition_lines_qty_ck CHECK (quantity > 0)
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS internal_requisition_lines_req_idx
    ON internal_requisition_lines (requisition_id, sort_order);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS internal_requisition_sequences (
    store_id integer PRIMARY KEY,
    prefix text DEFAULT 'REQ' NOT NULL,
    next_number integer DEFAULT 1 NOT NULL
);
