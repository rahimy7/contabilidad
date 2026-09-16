-- Ficha maestra de clientes.
--
-- La tabla `customers` nació para el POS/WhatsApp: nombre, teléfono, correo y
-- una marca VIP. Un ERP dominicano necesita además quién es el cliente ante la
-- DGII (RNC o cédula, razón social, régimen, comprobante que le corresponde),
-- dónde está fiscalmente y bajo qué condiciones se le vende a crédito.
--
-- Tres piezas:
--   * columnas fiscales, de dirección y de clasificación en `customers`;
--   * el estado de la línea de crédito en `customers` (none | active |
--     suspended | blocked). El límite y el plazo siguen viviendo en
--     `customer_pricing_terms`, que es lo que ya leen la factura y el cálculo del
--     vencimiento: una sola fuente, no dos que puedan discrepar;
--   * `customer_credit_applications` (lo solicitado frente a lo aprobado, con su
--     solicitud en el motor de aprobaciones) y `customer_credit_events` (bitácora
--     inmutable de cada cambio de la línea).

ALTER TABLE customers ALTER COLUMN email DROP NOT NULL;
--> statement-breakpoint

ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS code text,
    /* fisica | juridica */
    ADD COLUMN IF NOT EXISTS person_type text DEFAULT 'fisica' NOT NULL,
    /* rnc | cedula | pasaporte | extranjero. RNC y cédula van en `rnc` (0061),
       que es lo que se copia a fiscal_documents.buyer_rnc; pasaporte e
       identificación extranjera, en `foreign_id`. */
    ADD COLUMN IF NOT EXISTS tax_id_type text,
    ADD COLUMN IF NOT EXISTS foreign_id text,
    ADD COLUMN IF NOT EXISTS legal_name text,
    ADD COLUMN IF NOT EXISTS trade_name text,
    /* contribuyente | rst | regimen_especial | gubernamental | consumidor_final | exterior */
    ADD COLUMN IF NOT EXISTS taxpayer_type text DEFAULT 'consumidor_final' NOT NULL,
    ADD COLUMN IF NOT EXISTS default_ncf_type varchar(3),
    ADD COLUMN IF NOT EXISTS itbis_exempt boolean DEFAULT false NOT NULL,
    /* Resolución o constancia que respalda la exención. */
    ADD COLUMN IF NOT EXISTS exemption_reference text,
    ADD COLUMN IF NOT EXISTS economic_activity text,
    /* activo | suspendido | cese | no_verificado — lo que dice la consulta de RNC. */
    ADD COLUMN IF NOT EXISTS dgii_status text,
    ADD COLUMN IF NOT EXISTS dgii_verified_at date,
    ADD COLUMN IF NOT EXISTS phone_alt text,
    ADD COLUMN IF NOT EXISTS website text,
    ADD COLUMN IF NOT EXISTS province text,
    ADD COLUMN IF NOT EXISTS municipality text,
    ADD COLUMN IF NOT EXISTS sector text,
    ADD COLUMN IF NOT EXISTS postal_code text,
    ADD COLUMN IF NOT EXISTS country char(2) DEFAULT 'DO' NOT NULL,
    ADD COLUMN IF NOT EXISTS sales_rep_user_id integer REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS currency char(3) DEFAULT 'DOP' NOT NULL,
    /* cash | transfer | check | card */
    ADD COLUMN IF NOT EXISTS preferred_payment_method text,
    ADD COLUMN IF NOT EXISTS credit_status text DEFAULT 'none' NOT NULL,
    ADD COLUMN IF NOT EXISTS credit_status_reason text,
    ADD COLUMN IF NOT EXISTS credit_status_changed_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS credit_approved_by integer REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS credit_approved_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS credit_review_date date,
    ADD COLUMN IF NOT EXISTS created_by integer REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_by integer REFERENCES users(id) ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE customers
    ADD CONSTRAINT customers_person_type_ck CHECK (person_type IN ('fisica','juridica')),
    ADD CONSTRAINT customers_tax_id_type_ck CHECK (tax_id_type IS NULL OR tax_id_type IN ('rnc','cedula','pasaporte','extranjero')),
    ADD CONSTRAINT customers_taxpayer_type_ck CHECK (taxpayer_type IN ('contribuyente','rst','regimen_especial','gubernamental','consumidor_final','exterior')),
    ADD CONSTRAINT customers_credit_status_ck CHECK (credit_status IN ('none','active','suspended','blocked'));
--> statement-breakpoint
-- RNC 9 dígitos o cédula 11, sólo cifras. NOT VALID: rige para lo que se
-- escriba desde ahora sin rechazar la migración por un dato viejo con guiones.
ALTER TABLE customers
    ADD CONSTRAINT customers_rnc_format_ck CHECK (rnc IS NULL OR rnc ~ '^\d{9}$|^\d{11}$') NOT VALID;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS customers_code_uq
    ON customers (store_id, code) WHERE code IS NOT NULL;
--> statement-breakpoint
-- No es único: las sucursales de una misma empresa facturan con el mismo RNC.
-- El servicio advierte del duplicado y pide confirmación.
CREATE INDEX IF NOT EXISTS customers_rnc_idx
    ON customers (store_id, rnc) WHERE rnc IS NOT NULL;
--> statement-breakpoint

UPDATE customers SET code = 'CL-' || lpad(id::text, 6, '0') WHERE code IS NULL;
--> statement-breakpoint

-- Clientes que ya traían RNC o cédula: se infiere lo que el RNC dice de ellos.
-- Un RNC de 9 dígitos es de persona jurídica; los que empiezan por 4 son del
-- Estado (comprobante gubernamental).
UPDATE customers
   SET tax_id_type = CASE WHEN length(rnc) = 9 THEN 'rnc' ELSE 'cedula' END,
       person_type = CASE WHEN length(rnc) = 9 THEN 'juridica' ELSE 'fisica' END,
       taxpayer_type = CASE WHEN rnc LIKE '4%' AND length(rnc) = 9 THEN 'gubernamental' ELSE 'contribuyente' END,
       default_ncf_type = coalesce(default_ncf_type, CASE WHEN rnc LIKE '4%' AND length(rnc) = 9 THEN 'B15' ELSE 'B01' END),
       legal_name = coalesce(legal_name, name)
 WHERE rnc ~ '^\d{9}$|^\d{11}$' AND tax_id_type IS NULL;
--> statement-breakpoint

-- Clientes que ya tenían límite en sus condiciones: su línea queda activa. Sin
-- esto la regla nueva de facturación (crédito sólo con línea activa) cortaría
-- de golpe a clientes que venían comprando a crédito.
UPDATE customers c
   SET credit_status = 'active', credit_status_changed_at = now()
  FROM customer_pricing_terms t
 WHERE t.customer_id = c.id AND t.is_active AND t.credit_limit > 0
   AND c.credit_status = 'none';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS customer_credit_applications (
    id serial PRIMARY KEY,
    customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    store_id integer NOT NULL,
    requested_limit numeric(14, 2) NOT NULL,
    requested_days integer NOT NULL,
    approved_limit numeric(14, 2),
    approved_days integer,
    /* pending | approved | rejected | cancelled */
    status text DEFAULT 'pending' NOT NULL,
    justification text NOT NULL,
    /* ninguna | pagare | fianza | hipotecaria | prendaria | carta_credito | deposito */
    guarantee_type text DEFAULT 'ninguna' NOT NULL,
    guarantee_amount numeric(14, 2),
    guarantee_notes text,
    /* Referencias comerciales y bancarias presentadas por el cliente. */
    references_notes text,
    review_date date,
    approval_request_id integer REFERENCES approval_requests(id) ON DELETE SET NULL,
    requested_by integer NOT NULL REFERENCES users(id),
    resolved_by integer REFERENCES users(id),
    resolution_comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    CONSTRAINT customer_credit_applications_status_ck CHECK (status IN ('pending','approved','rejected','cancelled')),
    CONSTRAINT customer_credit_applications_amount_ck CHECK (requested_limit > 0 AND requested_days >= 0),
    CONSTRAINT customer_credit_applications_approved_ck CHECK (
        status <> 'approved' OR (approved_limit > 0 AND approved_days >= 0)
    ),
    CONSTRAINT customer_credit_applications_guarantee_ck CHECK (
        guarantee_type IN ('ninguna','pagare','fianza','hipotecaria','prendaria','carta_credito','deposito')
    )
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS customer_credit_applications_customer_idx
    ON customer_credit_applications (customer_id, created_at DESC);
--> statement-breakpoint
-- Una sola solicitud en evaluación por cliente.
CREATE UNIQUE INDEX IF NOT EXISTS customer_credit_applications_pending_uq
    ON customer_credit_applications (customer_id) WHERE status = 'pending';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS customer_credit_events (
    id serial PRIMARY KEY,
    customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    store_id integer NOT NULL,
    /* requested | approved | rejected | cancelled | suspended | blocked | reactivated */
    event text NOT NULL,
    from_status text,
    to_status text,
    limit_before numeric(14, 2),
    limit_after numeric(14, 2),
    days_before integer,
    days_after integer,
    application_id integer REFERENCES customer_credit_applications(id) ON DELETE SET NULL,
    reason text,
    actor_user_id integer REFERENCES users(id),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS customer_credit_events_customer_idx
    ON customer_credit_events (customer_id, created_at DESC);
--> statement-breakpoint

-- Dos pantallas de clientes eran una de más: la ficha única vive en /customers.
DELETE FROM views WHERE route_path = '/customer-management';
