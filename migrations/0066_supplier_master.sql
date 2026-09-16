-- Ficha maestra de proveedores.
--
-- `suppliers` tenía lo justo para una orden de compra: nombre, contacto, RNC.
-- Una compra formal necesita además qué comprobante la respalda, cómo va en el
-- 606, si se le retiene al proveedor, a qué cuenta se le paga y bajo qué
-- condiciones. Se reutiliza lo que ya leen la factura de compra y el 606:
-- `tax_id` (RNC o cédula), `counterparty_type` (persona física/jurídica, que es
-- lo que miran las reglas de retención), `default_operation_type`,
-- `default_expense_type`, `payment_terms_days` y `currency`.
--
-- Tres tablas nuevas: contactos, cuentas bancarias y una bitácora. Las cuentas
-- bancarias llevan bitácora propia porque cambiar la cuenta de un proveedor es
-- la forma clásica de desviar un pago.

ALTER TABLE suppliers
    ADD COLUMN IF NOT EXISTS code text,
    /* rnc | cedula | pasaporte | extranjero */
    ADD COLUMN IF NOT EXISTS tax_id_type text,
    ADD COLUMN IF NOT EXISTS foreign_id text,
    ADD COLUMN IF NOT EXISTS legal_name text,
    ADD COLUMN IF NOT EXISTS trade_name text,
    /* contribuyente | rst | regimen_especial | informal | exterior */
    ADD COLUMN IF NOT EXISTS taxpayer_type text DEFAULT 'contribuyente' NOT NULL,
    ADD COLUMN IF NOT EXISTS default_ncf_type varchar(3),
    ADD COLUMN IF NOT EXISTS economic_activity text,
    ADD COLUMN IF NOT EXISTS dgii_status text,
    ADD COLUMN IF NOT EXISTS dgii_verified_at date,
    ADD COLUMN IF NOT EXISTS phone_alt text,
    ADD COLUMN IF NOT EXISTS website text,
    ADD COLUMN IF NOT EXISTS sector text,
    ADD COLUMN IF NOT EXISTS municipality text,
    ADD COLUMN IF NOT EXISTS province text,
    ADD COLUMN IF NOT EXISTS postal_code text,
    ADD COLUMN IF NOT EXISTS country char(2) DEFAULT 'DO' NOT NULL,
    /* Retener ITBIS/ISR según las reglas de retención de la empresa. */
    ADD COLUMN IF NOT EXISTS apply_retentions boolean DEFAULT false NOT NULL,
    ADD COLUMN IF NOT EXISTS isr_retention_concept text,
    /* inventory | supply | fixed_asset | service | expense */
    ADD COLUMN IF NOT EXISTS default_purchase_type text,
    ADD COLUMN IF NOT EXISTS default_expense_account text,
    /* Crédito que el proveedor nos concede. */
    ADD COLUMN IF NOT EXISTS credit_limit numeric(14, 2) DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS early_payment_discount_percent numeric(5, 2) DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS early_payment_days integer,
    ADD COLUMN IF NOT EXISTS preferred_payment_method text,
    ADD COLUMN IF NOT EXISTS lead_time_days integer,
    ADD COLUMN IF NOT EXISTS minimum_order_amount numeric(14, 2),
    ADD COLUMN IF NOT EXISTS incoterm text,
    ADD COLUMN IF NOT EXISTS purchase_blocked boolean DEFAULT false NOT NULL,
    ADD COLUMN IF NOT EXISTS payment_blocked boolean DEFAULT false NOT NULL,
    ADD COLUMN IF NOT EXISTS block_reason text,
    ADD COLUMN IF NOT EXISTS blocked_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS blocked_by integer REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_by integer REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_by integer REFERENCES users(id) ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE suppliers
    ADD CONSTRAINT suppliers_tax_id_type_ck CHECK (tax_id_type IS NULL OR tax_id_type IN ('rnc','cedula','pasaporte','extranjero')),
    ADD CONSTRAINT suppliers_taxpayer_type_ck CHECK (taxpayer_type IN ('contribuyente','rst','regimen_especial','informal','exterior')),
    ADD CONSTRAINT suppliers_purchase_type_ck CHECK (default_purchase_type IS NULL OR default_purchase_type IN ('inventory','supply','fixed_asset','service','expense')),
    ADD CONSTRAINT suppliers_amounts_ck CHECK (credit_limit >= 0 AND early_payment_discount_percent BETWEEN 0 AND 100
        AND (lead_time_days IS NULL OR lead_time_days >= 0) AND (minimum_order_amount IS NULL OR minimum_order_amount >= 0));
--> statement-breakpoint
-- RNC 9 dígitos o cédula 11, sólo cifras. NOT VALID para no rechazar la
-- migración por un RNC viejo escrito con guiones.
ALTER TABLE suppliers
    ADD CONSTRAINT suppliers_tax_id_format_ck CHECK (tax_id IS NULL OR tax_id ~ '^\d{9}$|^\d{11}$') NOT VALID;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_code_uq
    ON suppliers (store_id, code) WHERE code IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS suppliers_tax_id_idx
    ON suppliers (store_id, tax_id) WHERE tax_id IS NOT NULL;
--> statement-breakpoint

UPDATE suppliers SET code = 'PR-' || lpad(id::text, 6, '0') WHERE code IS NULL;
--> statement-breakpoint

-- Lo que el RNC ya dice: 9 dígitos es persona jurídica, 11 es cédula.
UPDATE suppliers
   SET tax_id_type = CASE WHEN length(tax_id) = 9 THEN 'rnc' ELSE 'cedula' END,
       counterparty_type = coalesce(counterparty_type, CASE WHEN length(tax_id) = 9 THEN 'persona_juridica' ELSE 'persona_fisica' END),
       default_ncf_type = coalesce(default_ncf_type, 'B01')
 WHERE tax_id ~ '^\d{9}$|^\d{11}$' AND tax_id_type IS NULL;
--> statement-breakpoint
UPDATE suppliers SET legal_name = name WHERE legal_name IS NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS supplier_contacts (
    id serial PRIMARY KEY,
    supplier_id integer NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    name text NOT NULL,
    /* sales | receivables | logistics | technical | manager | other */
    role text NOT NULL,
    email text,
    phone text,
    mobile text,
    is_primary boolean DEFAULT false NOT NULL,
    /* A quién se le envía la orden de compra y a quién el aviso de pago. */
    receives_purchase_orders boolean DEFAULT false NOT NULL,
    receives_payment_notices boolean DEFAULT false NOT NULL,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplier_contacts_role_ck CHECK (role IN ('sales','receivables','logistics','technical','manager','other'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS supplier_contacts_supplier_idx
    ON supplier_contacts (supplier_id) WHERE is_active = true;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS supplier_bank_accounts (
    id serial PRIMARY KEY,
    supplier_id integer NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    bank_name text NOT NULL,
    /* corriente | ahorro | otro */
    account_type text DEFAULT 'corriente' NOT NULL,
    account_number text NOT NULL,
    currency char(3) DEFAULT 'DOP' NOT NULL,
    holder_name text,
    holder_tax_id text,
    /* Transferencias internacionales. */
    swift_code text,
    aba_routing text,
    iban text,
    bank_address text,
    is_primary boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_by integer REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplier_bank_accounts_type_ck CHECK (account_type IN ('corriente','ahorro','otro'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS supplier_bank_accounts_supplier_idx
    ON supplier_bank_accounts (supplier_id) WHERE is_active = true;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS supplier_events (
    id serial PRIMARY KEY,
    supplier_id integer NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    store_id integer NOT NULL,
    /* purchase_blocked | purchase_released | payment_blocked | payment_released |
       bank_account_added | bank_account_changed | bank_account_removed */
    event text NOT NULL,
    reason text,
    details jsonb,
    actor_user_id integer REFERENCES users(id),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS supplier_events_supplier_idx
    ON supplier_events (supplier_id, created_at DESC);
--> statement-breakpoint

-- Proveedores deja de ser una pestaña de Órdenes de Compra: tiene su vista.
INSERT INTO views (route_path, label, icon_name, permission_required, section, sort_order, is_system)
VALUES ('/suppliers', 'Proveedores', 'Truck', 'manage_products', 'compras', 295, true)
ON CONFLICT (route_path) DO NOTHING;
--> statement-breakpoint
-- Quien ya veía las órdenes de compra ve también los proveedores.
INSERT INTO role_permissions (role_id, view_id, can_access, sort_order)
SELECT rp.role_id, v.id, rp.can_access, 0
  FROM role_permissions rp
  JOIN views po ON po.id = rp.view_id AND po.route_path = '/purchase-management'
  CROSS JOIN views v
 WHERE v.route_path = '/suppliers'
   AND NOT EXISTS (SELECT 1 FROM role_permissions x WHERE x.role_id = rp.role_id AND x.view_id = v.id);
