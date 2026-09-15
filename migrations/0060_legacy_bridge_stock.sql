-- Puente entre la pila operativa heredada (store_id) y la contable (company_id),
-- y un solo libro de existencias.
--
-- No es la migración store_id -> company_id: esas tablas siguen funcionando por
-- tienda. Son columnas puente, anulables, que dicen a qué empresa pertenece un
-- almacén o un documento operativo para que el servicio contable pueda validar
-- que nadie mueva mercancía de otra empresa ni contabilice en la equivocada.

-- ── almacenes y documentos operativos ────────────────────────────────────────
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS warehouses_company_idx ON warehouses (company_id) WHERE company_id IS NOT NULL;
--> statement-breakpoint

ALTER TABLE warehouse_transfers ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE warehouse_transfers ADD COLUMN IF NOT EXISTS transfer_date date;
--> statement-breakpoint

ALTER TABLE inventory_adjustments ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE inventory_adjustments ADD COLUMN IF NOT EXISTS warehouse_id integer REFERENCES warehouses(id);
--> statement-breakpoint
ALTER TABLE inventory_adjustments ADD COLUMN IF NOT EXISTS adjustment_date date;
--> statement-breakpoint
ALTER TABLE inventory_adjustments ADD COLUMN IF NOT EXISTS journal_entry_ids bigint[];
--> statement-breakpoint

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'not_required';
--> statement-breakpoint
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_by integer;
--> statement-breakpoint
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_at timestamptz;
--> statement-breakpoint
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS requisition_id integer;
--> statement-breakpoint
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_quote_id integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS purchase_orders_company_idx ON purchase_orders (company_id) WHERE company_id IS NOT NULL;
--> statement-breakpoint

ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS supplier_credit_document_id bigint;
--> statement-breakpoint

ALTER TABLE hr_employees ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint

-- ── un solo libro de existencias ─────────────────────────────────────────────
-- Una fila por (almacén, producto). Sin esta unicidad no hay upsert posible y
-- dos filas del mismo producto en el mismo almacén son dos verdades.
WITH dups AS (
  SELECT warehouse_id, product_id, min(id) AS keep_id,
         sum(quantity) AS qty, sum(reserved_quantity) AS reserved
    FROM warehouse_stock
   GROUP BY warehouse_id, product_id
  HAVING count(*) > 1
)
UPDATE warehouse_stock ws
   SET quantity = d.qty, reserved_quantity = d.reserved
  FROM dups d
 WHERE ws.id = d.keep_id;
--> statement-breakpoint
DELETE FROM warehouse_stock ws
 USING warehouse_stock keep
 WHERE ws.warehouse_id = keep.warehouse_id
   AND ws.product_id = keep.product_id
   AND ws.id > keep.id;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS warehouse_stock_wh_product_uq ON warehouse_stock (warehouse_id, product_id);
--> statement-breakpoint

-- Cada movimiento operativo apunta al movimiento valorado que lo originó: el
-- kárdex de unidades y el de costo son el mismo hecho visto dos veces.
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS company_id integer;
--> statement-breakpoint
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS cost_movement_id bigint;
--> statement-breakpoint
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS movement_date date;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS inventory_movements_cost_movement_idx
    ON inventory_movements (cost_movement_id) WHERE cost_movement_id IS NOT NULL;
