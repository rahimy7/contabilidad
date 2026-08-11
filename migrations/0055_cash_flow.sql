-- Cash flow forecast: proyección rodante 13 semanas.
--
-- Consolida cuatro fuentes de flujo:
--   1. Saldos actuales de cuentas bancarias (punto de partida)
--   2. AR (cuentas por cobrar) — programa por due_date
--   3. AP (cuentas por pagar) — programa por due_date
--   4. Flujos recurrentes o esperados que no están todavía en AR/AP:
--        alquiler mensual, nómina bisemanal, servicios (luz, agua, internet),
--        suscripciones, préstamos programados, aportes proyectados
--
-- La tabla `cash_flow_entries` guarda esas líneas recurrentes con su regla de
-- recurrencia (frequency + start_date). El servicio expande la regla en el
-- horizonte pedido y las suma al forecast.

CREATE TABLE IF NOT EXISTS cash_flow_entries (
    id serial PRIMARY KEY,
    company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    /* Nombre corto identificable en el forecast (ej: "Alquiler local", "Nómina quincenal"). */
    name text NOT NULL,
    description text,
    /* inflow | outflow — sentido del flujo. */
    direction text NOT NULL CHECK (direction IN ('inflow','outflow')),
    /* Categoría — sirve para reportes: rent, payroll, utilities, subscription,
       loan, tax, interest, dividends, capex, income, other. */
    category text NOT NULL DEFAULT 'other',
    /* Monto por ocurrencia — en la moneda del entry. */
    amount numeric(20,4) NOT NULL CHECK (amount > 0),
    currency char(3) NOT NULL DEFAULT 'DOP',
    /* Regla de recurrencia:
         one_time  = ocurre una sola vez en start_date
         weekly    = cada N semanas
         biweekly  = cada 14 días
         monthly   = mismo día del mes cada mes
         quarterly = cada 3 meses
         yearly    = anual */
    frequency text NOT NULL DEFAULT 'monthly'
        CHECK (frequency IN ('one_time','weekly','biweekly','monthly','quarterly','yearly')),
    /* Fecha del primer flujo. Para monthly, el mismo día se repite cada mes.
       Para weekly, ese día de la semana se repite cada N semanas. */
    start_date date NOT NULL,
    /* Fin opcional — cuándo dejar de proyectar (contrato con final, préstamo con última cuota). */
    end_date date,
    /* Si el flujo es recurrente cada N períodos (por ejemplo, cada 2 semanas). */
    interval_count integer NOT NULL DEFAULT 1 CHECK (interval_count > 0),
    /* Certeza estimada del flujo — sirve para escenarios optimista/pesimista. */
    confidence text NOT NULL DEFAULT 'high'
        CHECK (confidence IN ('high','medium','low')),
    /* Referencia opcional al recurso que genera el flujo. */
    reference_type text,
    reference_id integer,
    /* Cuenta bancaria destino/origen — opcional; si se define, filtra al proyectar
       por esa cuenta. */
    bank_account_id bigint,
    is_active boolean NOT NULL DEFAULT true,
    notes text,
    created_by integer NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS cash_flow_entries_active_idx
    ON cash_flow_entries (company_id, is_active, start_date);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS cash_flow_entries_category_idx
    ON cash_flow_entries (company_id, category, direction);
--> statement-breakpoint

-- Snapshots del forecast — se guarda cada vez que un usuario quiere congelar
-- una proyección para compararla contra el actual la próxima semana.
CREATE TABLE IF NOT EXISTS cash_flow_forecasts (
    id serial PRIMARY KEY,
    company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    forecast_date date NOT NULL,
    horizon_weeks integer NOT NULL DEFAULT 13,
    starting_balance numeric(20,4) NOT NULL,
    total_inflow numeric(20,4) NOT NULL DEFAULT 0,
    total_outflow numeric(20,4) NOT NULL DEFAULT 0,
    ending_balance numeric(20,4) NOT NULL,
    /* Detalle serializado en JSON para no explotar en filas. */
    weekly_buckets jsonb NOT NULL,
    notes text,
    created_by integer NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS cash_flow_forecasts_date_idx
    ON cash_flow_forecasts (company_id, forecast_date DESC);
--> statement-breakpoint
