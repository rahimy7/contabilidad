-- Números de serie por unidad vendida (Fase 01).
--
-- Extiende `inventory_lots`: un lote agrupa cajas idénticas por costo; un
-- número de serie identifica una unidad. Necesario para garantías por unidad
-- (el equipo con serie SN-1234 vencido en 24 meses) y para trazabilidad
-- individual (una devolución llega con la serie, se ubica de qué venta salió).
--
-- Cada serie vive en un producto, con un estado en su ciclo (in_stock →
-- reserved → sold → returned). Se enlaza a la venta y a la fecha de venta
-- para saber cuándo empieza el reloj de garantía.

CREATE TABLE IF NOT EXISTS product_serials (
    id bigserial PRIMARY KEY,
    store_id integer NOT NULL,
    product_id integer NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    warehouse_id integer REFERENCES warehouses(id) ON DELETE SET NULL,
    lot_id bigint,
    serial_number text NOT NULL,
    status text DEFAULT 'in_stock' NOT NULL,
    sold_at timestamp with time zone,
    order_id integer REFERENCES orders(id) ON DELETE SET NULL,
    warranty_until date,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_serials_status_ck CHECK (status IN ('in_stock','reserved','sold','returned','defective','disposed'))
);
--> statement-breakpoint

-- Un número de serie es único dentro de un producto. Dos productos distintos
-- pueden coincidir por serie (el fabricante A y el B numeran cada uno lo suyo).
CREATE UNIQUE INDEX IF NOT EXISTS product_serials_uq
    ON product_serials (store_id, product_id, serial_number);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS product_serials_status_idx
    ON product_serials (store_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS product_serials_order_idx
    ON product_serials (order_id) WHERE order_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS product_serials_warranty_idx
    ON product_serials (warranty_until) WHERE warranty_until IS NOT NULL;
