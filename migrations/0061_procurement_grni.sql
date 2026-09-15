-- Recepciones contra orden de compra y cruce de tres vías.
--
-- Una recepción es un documento propio, no un contador sobrescrito en la línea
-- de la orden. Cada recepción registra lo que llegó *esa vez*, al costo pactado,
-- y lo valora contra "Recepciones por facturar" (2.1.01.002). Cuando llega la
-- factura del proveedor se casa contra esas líneas: lo recibido se traslada a
-- Proveedores y lo que la factura difiere es variación de precio. El saldo de
-- 2.1.01.002 es, en todo momento, lo recibido y no facturado.

CREATE TABLE IF NOT EXISTS purchase_receipts (
    id bigserial PRIMARY KEY,
    company_id integer NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    purchase_order_id integer NOT NULL REFERENCES purchase_orders(id),
    receipt_no text NOT NULL,
    receipt_date date NOT NULL,
    warehouse_id integer NOT NULL REFERENCES warehouses(id),
    supplier_id integer,
    status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'cancelled')),
    currency char(3) NOT NULL DEFAULT 'DOP',
    total_cost numeric(18,4) NOT NULL DEFAULT 0,
    notes text,
    created_by integer,
    created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS purchase_receipts_no_uq ON purchase_receipts (company_id, receipt_no);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS purchase_receipts_po_idx ON purchase_receipts (company_id, purchase_order_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS purchase_receipt_lines (
    id bigserial PRIMARY KEY,
    company_id integer NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    receipt_id bigint NOT NULL REFERENCES purchase_receipts(id) ON DELETE CASCADE,
    purchase_order_item_id integer NOT NULL REFERENCES purchase_order_items(id),
    product_id integer NOT NULL,
    quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
    unit_cost numeric(20,8) NOT NULL CHECK (unit_cost >= 0),
    total_cost numeric(18,4) NOT NULL,
    qty_invoiced numeric(18,4) NOT NULL DEFAULT 0,
    inventory_account text NOT NULL DEFAULT '1.1.03.001',
    lot_no text,
    expiration_date date,
    cost_movement_id bigint,
    CONSTRAINT purchase_receipt_lines_invoiced_ck CHECK (qty_invoiced >= 0 AND qty_invoiced <= quantity)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS purchase_receipt_lines_item_idx ON purchase_receipt_lines (company_id, purchase_order_item_id);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS supplier_invoice_matches (
    id bigserial PRIMARY KEY,
    company_id integer NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    document_id bigint NOT NULL REFERENCES fiscal_documents(id) ON DELETE CASCADE,
    receipt_line_id bigint NOT NULL REFERENCES purchase_receipt_lines(id),
    quantity numeric(18,4) NOT NULL,
    receipt_value numeric(18,4) NOT NULL,
    invoice_value numeric(18,4) NOT NULL,
    variance numeric(18,4) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS supplier_invoice_matches_doc_idx ON supplier_invoice_matches (company_id, document_id);
--> statement-breakpoint

SELECT apply_tenant_policy('purchase_receipts');
--> statement-breakpoint
SELECT apply_tenant_policy('purchase_receipt_lines');
--> statement-breakpoint
SELECT apply_tenant_policy('supplier_invoice_matches');
--> statement-breakpoint

-- La factura de compra enlaza con su orden, y la nota de crédito del proveedor
-- con la factura que modifica (ya existe modifies_doc_id). El tipo de bienes y
-- servicios del 606 deja de estar fijo en '09'.
ALTER TABLE fiscal_documents ADD COLUMN IF NOT EXISTS purchase_order_id integer;
--> statement-breakpoint
ALTER TABLE fiscal_documents ADD COLUMN IF NOT EXISTS dgii_expense_type char(2);
--> statement-breakpoint

-- Maestro de proveedores: lo que la factura de compra necesita saber sin que
-- nadie lo teclee cada vez.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_terms_days integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS currency char(3) NOT NULL DEFAULT 'DOP';
--> statement-breakpoint
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS counterparty_type text
    CHECK (counterparty_type IS NULL OR counterparty_type IN ('persona_fisica', 'persona_juridica'));
--> statement-breakpoint
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS default_operation_type text
    CHECK (default_operation_type IS NULL OR default_operation_type IN ('bienes', 'servicios'));
--> statement-breakpoint
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS default_expense_type char(2);
--> statement-breakpoint

-- Maestro de clientes: identificación fiscal. Límite y términos de crédito ya
-- viven en customer_pricing_terms (0050).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS rnc varchar(11);
--> statement-breakpoint
ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id) ON DELETE SET NULL;
--> statement-breakpoint

-- Ajustes al subledger de CxC/CxP que no son cobros ni pagos: notas de crédito,
-- anulaciones, retenciones sufridas, castigos.
CREATE TABLE IF NOT EXISTS ar_adjustments (
    id bigserial PRIMARY KEY,
    company_id integer NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    open_item_id bigint NOT NULL,
    document_id bigint,
    kind text NOT NULL CHECK (kind IN ('credit_note', 'cancel', 'withholding', 'write_off', 'advance')),
    amount numeric(18,4) NOT NULL CHECK (amount > 0),
    adjustment_date date NOT NULL,
    journal_entry_id bigint,
    created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ap_adjustments (
    id bigserial PRIMARY KEY,
    company_id integer NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    open_item_id bigint NOT NULL,
    document_id bigint,
    kind text NOT NULL CHECK (kind IN ('credit_note', 'cancel', 'write_off')),
    amount numeric(18,4) NOT NULL CHECK (amount > 0),
    adjustment_date date NOT NULL,
    journal_entry_id bigint,
    created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
SELECT apply_tenant_policy('ar_adjustments');
--> statement-breakpoint
SELECT apply_tenant_policy('ap_adjustments');
--> statement-breakpoint

ALTER TABLE ar_receipts ADD COLUMN IF NOT EXISTS bank_account_id bigint;
--> statement-breakpoint
ALTER TABLE ar_receipts ADD COLUMN IF NOT EXISTS bank_transaction_id bigint;
--> statement-breakpoint
ALTER TABLE ar_receipts ADD COLUMN IF NOT EXISTS unapplied_amount numeric(18,4) NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE ap_payments ADD COLUMN IF NOT EXISTS bank_account_id bigint;
--> statement-breakpoint
ALTER TABLE ap_payments ADD COLUMN IF NOT EXISTS bank_transaction_id bigint;
--> statement-breakpoint
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS source_type text;
--> statement-breakpoint
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS source_id text;
--> statement-breakpoint

-- Un documento abre a lo sumo una partida.
CREATE UNIQUE INDEX IF NOT EXISTS ar_open_items_document_uq
    ON ar_open_items (company_id, document_id) WHERE document_id IS NOT NULL;
