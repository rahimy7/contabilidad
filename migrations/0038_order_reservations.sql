-- Reserva de inventario para pedidos.
--
-- El flujo actual descuenta inventario de golpe en la creación del pedido POS
-- (deductStockFIFO), lo que funciona para una venta al mostrador. Los pedidos
-- que no son ventas inmediatas (catálogo web, IA de WhatsApp, cotizaciones)
-- viven en estado `pending` sin descontar; por eso dos clientes pueden
-- prometer la misma caja.
--
-- Esta migración agrega dos piezas:
--   1. `warehouse_stock.reserved_quantity`: cuánto stock está prometido pero
--      no despachado; `available = quantity - reserved_quantity`.
--   2. `order_reservations`: qué reservó cada pedido, para poder liberar el
--      monto exacto al despachar o cancelar sin depender del historial de
--      cambios de `order_items`.
--
-- El disparador mantiene ambos consistentes: agregar una reserva sube el
-- `reserved_quantity`, cambiarla a `released` o `consumed` lo baja.

ALTER TABLE warehouse_stock
    ADD COLUMN IF NOT EXISTS reserved_quantity numeric(12, 2) NOT NULL DEFAULT 0;
--> statement-breakpoint

-- No puede haber reserva negativa; el stock físico sí puede quedar negativo
-- porque el POS permite `allowNegative: true` en ventas ya confirmadas.
ALTER TABLE warehouse_stock DROP CONSTRAINT IF EXISTS warehouse_stock_reserved_nonneg_ck;
--> statement-breakpoint
ALTER TABLE warehouse_stock
    ADD CONSTRAINT warehouse_stock_reserved_nonneg_ck
    CHECK (reserved_quantity >= 0);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS order_reservations (
    id bigserial PRIMARY KEY,
    order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id integer NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    warehouse_id integer NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    store_id integer NOT NULL,
    quantity numeric(12, 2) NOT NULL,
    status text NOT NULL DEFAULT 'active',
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    released_at timestamp with time zone,
    CONSTRAINT order_reservations_qty_pos_ck CHECK (quantity > 0),
    CONSTRAINT order_reservations_status_ck CHECK (status IN ('active', 'released', 'consumed'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS order_reservations_order_idx
    ON order_reservations (order_id) WHERE status = 'active';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS order_reservations_product_idx
    ON order_reservations (warehouse_id, product_id) WHERE status = 'active';
--> statement-breakpoint

-- Un pedido reserva una sola vez por (producto, almacén) mientras está activo;
-- un segundo intento debe UPDATE la fila existente en vez de duplicar.
CREATE UNIQUE INDEX IF NOT EXISTS order_reservations_unique_active_idx
    ON order_reservations (order_id, product_id, warehouse_id)
    WHERE status = 'active';
--> statement-breakpoint

-- Mantener `warehouse_stock.reserved_quantity` como un cache derivado del
-- estado de las reservas. Un trigger en lugar de recomputar en cada consulta
-- porque las lecturas de disponibilidad son cientos por minuto en el POS.

CREATE OR REPLACE FUNCTION order_reservations_sync_stock() RETURNS trigger AS $$
DECLARE
    delta numeric(12, 2);
    target_warehouse int;
    target_product int;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'active' THEN
            delta := NEW.quantity;
            target_warehouse := NEW.warehouse_id;
            target_product := NEW.product_id;
        ELSE
            RETURN NEW;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Transición desde active hacia released/consumed: descontar.
        IF OLD.status = 'active' AND NEW.status <> 'active' THEN
            delta := -OLD.quantity;
            target_warehouse := OLD.warehouse_id;
            target_product := OLD.product_id;
        -- Cambio en la cantidad de una reserva activa (edición del pedido).
        ELSIF OLD.status = 'active' AND NEW.status = 'active' AND OLD.quantity <> NEW.quantity THEN
            delta := NEW.quantity - OLD.quantity;
            target_warehouse := NEW.warehouse_id;
            target_product := NEW.product_id;
        ELSE
            RETURN NEW;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.status = 'active' THEN
            delta := -OLD.quantity;
            target_warehouse := OLD.warehouse_id;
            target_product := OLD.product_id;
        ELSE
            RETURN OLD;
        END IF;
    END IF;

    UPDATE warehouse_stock
       SET reserved_quantity = reserved_quantity + delta,
           updated_at = now()
     WHERE warehouse_id = target_warehouse
       AND product_id = target_product;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS order_reservations_sync_stock_trg ON order_reservations;
--> statement-breakpoint
CREATE TRIGGER order_reservations_sync_stock_trg
    AFTER INSERT OR UPDATE OR DELETE ON order_reservations
    FOR EACH ROW EXECUTE FUNCTION order_reservations_sync_stock();
