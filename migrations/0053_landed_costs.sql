-- Landed costs: allocation of import-side expenses (freight, insurance,
-- customs duty, ITBIS at customs, agente aduanal, transporte interno) to the
-- cost of goods received.
--
-- DR PyMEs importan continuamente desde US/China y necesitan reflejar el costo
-- real de un producto en inventario, no sólo el precio FOB de la factura del
-- proveedor. Un producto que costó USD 10 FOB puede terminar costando RD$ 850
-- cuando llega al almacén sumando flete, aduana, ITBIS pagado al despacho,
-- agente aduanal y transporte interno. Esa diferencia se pierde si sólo
-- capturamos la factura del proveedor.
--
-- Un `landed_cost_voucher` agrupa los gastos que llegaron con un embarque y
-- los distribuye sobre uno o más purchase_orders. La distribución soporta 4
-- bases:
--   - by_value    → prorateo por costo FOB (el más común, siempre disponible)
--   - by_quantity → prorateo por unidades (útil cuando el flete es plano)
--   - by_weight   → prorateo por peso (marítimo pesado)
--   - by_volume   → prorateo por volumen (marítimo voluminoso)
--
-- El voucher es "draft" mientras se define, "applied" cuando se posteó a
-- inventario. Postear actualiza el costo unitario de los items recibidos y
-- crea el asiento contable Dr Inventario / Cr Cuenta transitoria de importación.

CREATE TABLE IF NOT EXISTS landed_cost_vouchers (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    /* Código secuencial visible al usuario. */
    voucher_code text NOT NULL,
    /* Descripción del embarque (ej: "Contenedor MSKU1234567"). */
    description text,
    /* Fecha del voucher (típicamente la fecha en que la carga llegó al puerto). */
    voucher_date date NOT NULL DEFAULT CURRENT_DATE,
    /* Referencias documentales del embarque. */
    shipment_reference text,
    bl_awb_number text,
    supplier_id integer,
    /* Moneda base del voucher — todos los costos aquí ya están en esta moneda.
       Si un proveedor cobró USD, se convirtió antes de registrar la línea. */
    currency char(3) NOT NULL DEFAULT 'DOP',
    /* Método de allocation por defecto — cada línea puede override. */
    default_allocation_method text NOT NULL DEFAULT 'by_value'
        CHECK (default_allocation_method IN ('by_value','by_quantity','by_weight','by_volume')),
    /* Estado del voucher. */
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','applied','cancelled')),
    applied_at timestamp with time zone,
    applied_by integer,
    total_costs numeric(20,4) NOT NULL DEFAULT 0,
    total_allocated numeric(20,4) NOT NULL DEFAULT 0,
    notes text,
    created_by integer NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS landed_cost_vouchers_code_uq
    ON landed_cost_vouchers (store_id, voucher_code);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS landed_cost_vouchers_status_idx
    ON landed_cost_vouchers (store_id, status, voucher_date DESC);
--> statement-breakpoint

-- ── Líneas de gasto ─────────────────────────────────────────────────────────

-- Cada línea representa un gasto que se prorateará: flete, seguro, aduana,
-- ITBIS de importación, agente aduanal, transporte interno, otros.
CREATE TABLE IF NOT EXISTS landed_cost_lines (
    id serial PRIMARY KEY,
    voucher_id integer NOT NULL REFERENCES landed_cost_vouchers(id) ON DELETE CASCADE,
    /* Categoría del gasto — clasificación para reportes y para el asiento. */
    cost_type text NOT NULL CHECK (cost_type IN (
        'freight_ocean','freight_air','freight_land',
        'insurance','customs_duty','customs_itbis','customs_selectivo',
        'clearing_agent','port_handling','warehouse_storage',
        'inland_transport','inspection','bank_charges','other'
    )),
    description text,
    amount numeric(20,4) NOT NULL CHECK (amount >= 0),
    /* Override del método de allocation — por ejemplo, agente aduanal puede
       prorratearse por unidades mientras el flete se prorratea por volumen. */
    allocation_method text CHECK (allocation_method IN ('by_value','by_quantity','by_weight','by_volume')),
    /* Referencia al gasto contable — si ya se registró la factura del gasto. */
    expense_document_ref text,
    supplier_id integer,
    /* Cuenta contable del gasto (transitoria de importación).
       Al aplicar el voucher se acredita esta cuenta y se debita inventario. */
    expense_account_code text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS landed_cost_lines_voucher_idx
    ON landed_cost_lines (voucher_id);
--> statement-breakpoint

-- ── Targets (POs a las que se aplica) ───────────────────────────────────────

-- Un voucher puede aplicarse a múltiples POs si un mismo embarque trae
-- mercancía de varias órdenes.
CREATE TABLE IF NOT EXISTS landed_cost_targets (
    id serial PRIMARY KEY,
    voucher_id integer NOT NULL REFERENCES landed_cost_vouchers(id) ON DELETE CASCADE,
    /* PO cuya mercancía se ajustará. Requiere que la PO ya haya sido recibida. */
    purchase_order_id integer NOT NULL,
    /* Peso y volumen totales de la PO — capturados aquí porque el usuario los
       ingresa manualmente para el allocation por peso/volumen. */
    total_weight_kg numeric(14,4) DEFAULT 0,
    total_volume_m3 numeric(14,4) DEFAULT 0,
    /* Monto asignado a esta PO tras el prorateo. Populado al aplicar el voucher. */
    allocated_amount numeric(20,4) NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS landed_cost_targets_uq
    ON landed_cost_targets (voucher_id, purchase_order_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS landed_cost_targets_po_idx
    ON landed_cost_targets (purchase_order_id);
--> statement-breakpoint

-- ── Allocation resultante por item ──────────────────────────────────────────

-- Detalle del ajuste por item recibido — auditable para saber cuánto costo
-- extra le tocó a cada línea de la PO.
CREATE TABLE IF NOT EXISTS landed_cost_item_allocations (
    id serial PRIMARY KEY,
    voucher_id integer NOT NULL REFERENCES landed_cost_vouchers(id) ON DELETE CASCADE,
    purchase_order_id integer NOT NULL,
    purchase_order_item_id integer NOT NULL,
    product_id integer NOT NULL,
    /* Cantidad recibida sobre la que se prorratea. */
    quantity numeric(14,4) NOT NULL,
    /* Costo original antes del prorateo. */
    original_unit_cost numeric(20,4) NOT NULL,
    /* Monto de costo extra atribuido a esta línea. */
    allocated_amount numeric(20,4) NOT NULL,
    /* Nuevo costo unitario tras el ajuste. */
    new_unit_cost numeric(20,4) NOT NULL,
    /* Base usada para el prorateo (para auditoría). */
    allocation_basis text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS landed_cost_item_allocations_voucher_idx
    ON landed_cost_item_allocations (voucher_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS landed_cost_item_allocations_product_idx
    ON landed_cost_item_allocations (product_id, purchase_order_id);
--> statement-breakpoint
