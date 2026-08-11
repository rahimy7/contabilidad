-- Manufacturing lite: BOM (bill of materials) + production orders + backflush.
--
-- Un BOM define la receta de un producto terminado: qué materias primas se
-- consumen para producir una unidad. Cada línea es un componente con su
-- cantidad requerida. Alcance: BOM plano de un nivel (no explosión recursiva)
-- porque la mayoría de PyMEs DR arman kits o preparan alimentos, no fabrican
-- subensambles anidados.
--
-- Una orden de producción (MO) instancia un BOM para producir N unidades:
--   1. draft — se está definiendo
--   2. released — reservó materias primas, se puede empezar
--   3. in_progress — producción arrancó (opcional, puede saltarse)
--   4. completed — se descontaron MPs y se ingresó producto terminado (backflush)
--   5. cancelled
--
-- Backflush automático al completar: consume MPs desde el almacén y crea
-- movimiento de entrada del producto terminado. En un ERP más grande cada MP
-- se consumiría al inicio de su operación; aquí se hace todo al final porque
-- las corridas son cortas.

CREATE TABLE IF NOT EXISTS bom_headers (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    /* Código secuencial ("BOM-2026-001"). */
    bom_code text NOT NULL,
    /* Producto terminado que produce este BOM. */
    output_product_id integer NOT NULL,
    /* Cantidad de output producida por una corrida base del BOM (típicamente 1). */
    output_quantity numeric(14,4) NOT NULL DEFAULT 1 CHECK (output_quantity > 0),
    /* Almacén default donde ingresará el terminado. */
    output_warehouse_id integer,
    /* Descripción, notas, versión del BOM. */
    name text NOT NULL,
    description text,
    version text NOT NULL DEFAULT 'v1',
    /* Costo estimado por unidad del output — se calcula a partir de las líneas.
       Se guarda cache para reportes rápidos. */
    estimated_unit_cost numeric(20,4) DEFAULT 0,
    /* draft | active | obsolete — sólo BOMs active pueden usarse en MOs. */
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('draft','active','obsolete')),
    notes text,
    created_by integer NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS bom_headers_code_uq
    ON bom_headers (store_id, bom_code);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS bom_headers_output_idx
    ON bom_headers (store_id, output_product_id, status);
--> statement-breakpoint

-- ── Líneas del BOM (componentes / materias primas) ──────────────────────

CREATE TABLE IF NOT EXISTS bom_lines (
    id serial PRIMARY KEY,
    bom_id integer NOT NULL REFERENCES bom_headers(id) ON DELETE CASCADE,
    /* Materia prima o componente. */
    component_product_id integer NOT NULL,
    /* Cantidad por corrida base (por output_quantity del header). */
    quantity_per numeric(14,4) NOT NULL CHECK (quantity_per > 0),
    /* Unidad — texto libre porque no todos los ERPs de DR normalizan unidades. */
    unit text NOT NULL DEFAULT 'unit',
    /* % scrap típico (0-100). Se agrega al cálculo de la orden real. */
    scrap_percent numeric(5,2) NOT NULL DEFAULT 0
        CHECK (scrap_percent >= 0 AND scrap_percent <= 100),
    /* Costo unitario snapshot para estimated_unit_cost. */
    unit_cost numeric(20,4) DEFAULT 0,
    notes text,
    line_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS bom_lines_bom_idx ON bom_lines (bom_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS bom_lines_component_idx
    ON bom_lines (component_product_id);
--> statement-breakpoint

-- ── Órdenes de producción ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS production_orders (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    mo_number text NOT NULL,
    /* BOM base (puede ser NULL si es una MO ad-hoc sin BOM guardado). */
    bom_id integer REFERENCES bom_headers(id),
    /* Producto terminado y cantidad planeada. */
    output_product_id integer NOT NULL,
    planned_quantity numeric(14,4) NOT NULL CHECK (planned_quantity > 0),
    actual_quantity numeric(14,4) NOT NULL DEFAULT 0 CHECK (actual_quantity >= 0),
    output_warehouse_id integer NOT NULL,
    /* Fechas planeadas y reales. */
    scheduled_start_date date,
    scheduled_end_date date,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    /* draft | released | in_progress | completed | cancelled */
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','released','in_progress','completed','cancelled')),
    /* Snapshot del costo total de esta corrida al momento de completar. */
    total_material_cost numeric(20,4) DEFAULT 0,
    unit_cost numeric(20,4) DEFAULT 0,
    notes text,
    created_by integer NOT NULL,
    completed_by integer,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS production_orders_number_uq
    ON production_orders (store_id, mo_number);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS production_orders_status_idx
    ON production_orders (store_id, status, scheduled_start_date);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS production_orders_output_idx
    ON production_orders (output_product_id);
--> statement-breakpoint

-- Componentes específicos de la MO (snapshot al momento de release).
-- Se separa del BOM porque la MO puede tener sustituciones o cantidades
-- ajustadas por scrap real.
CREATE TABLE IF NOT EXISTS production_order_components (
    id serial PRIMARY KEY,
    mo_id integer NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
    component_product_id integer NOT NULL,
    /* Cantidad planeada según BOM × cantidad producida (con scrap incluido). */
    planned_quantity numeric(14,4) NOT NULL,
    /* Cantidad realmente consumida (poblada al completar la MO). */
    consumed_quantity numeric(14,4) NOT NULL DEFAULT 0,
    unit text NOT NULL DEFAULT 'unit',
    unit_cost numeric(20,4) DEFAULT 0,
    /* Almacén de donde se consume — soporta MO multi-almacén. */
    source_warehouse_id integer NOT NULL,
    /* Estado del componente: pending | consumed | short (falta stock). */
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','consumed','short')),
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS production_order_components_mo_idx
    ON production_order_components (mo_id);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS production_order_components_component_idx
    ON production_order_components (component_product_id);
--> statement-breakpoint

-- Movimientos de inventario generados por MOs. Se guarda por auditoría separada
-- de warehouse_stock_movements en caso de que se necesite reportar producción
-- específicamente sin filtrar por tipo de movimiento.
CREATE TABLE IF NOT EXISTS production_inventory_movements (
    id serial PRIMARY KEY,
    mo_id integer NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
    /* out = consumo de materia prima, in = ingreso de terminado */
    direction text NOT NULL CHECK (direction IN ('in','out')),
    product_id integer NOT NULL,
    warehouse_id integer NOT NULL,
    quantity numeric(14,4) NOT NULL,
    unit_cost numeric(20,4),
    total_cost numeric(20,4),
    moved_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS production_inventory_movements_mo_idx
    ON production_inventory_movements (mo_id);
--> statement-breakpoint
