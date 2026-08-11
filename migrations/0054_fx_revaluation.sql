-- Multi-currency: tasas oficiales diarias y revaluación de saldos en ME.
--
-- La tabla legacy `exchange_rates` (0000) sirve al POS. Para contabilidad
-- necesitamos:
--   - Tasas por fecha (histórico), no sólo la vigente
--   - Tres tipos de tasa: spot (día), closing (cierre mensual), avg (promedio)
--   - Company-scoped (no store) porque los estados financieros son por empresa
--
-- La revaluación toma los saldos de subledgers en ME (AR, AP, bancos USD) y
-- los vuelve a expresar con la tasa de cierre. La diferencia contra el saldo
-- en libros va a la cuenta de ganancia/pérdida por diferencia cambiaria. En
-- DR se conocen como "ingresos por diferencia cambiaria" (4.4.x) y "gastos
-- por diferencia cambiaria" (5.6.x).

CREATE TABLE IF NOT EXISTS fx_daily_rates (
    id serial PRIMARY KEY,
    company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    rate_date date NOT NULL,
    from_currency char(3) NOT NULL,
    to_currency char(3) NOT NULL,
    /* spot   = tasa de mercado del día (para transacciones)
       closing = tasa oficial al cierre del período (para revaluación)
       avg    = promedio del período (para traducción de resultados) */
    rate_type text NOT NULL DEFAULT 'spot'
        CHECK (rate_type IN ('spot','closing','avg')),
    rate numeric(18,8) NOT NULL CHECK (rate > 0),
    /* Fuente: banco central, BHD, Popular, promedio propio. */
    source text,
    notes text,
    created_by integer,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS fx_daily_rates_uq
    ON fx_daily_rates (company_id, rate_date, from_currency, to_currency, rate_type);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS fx_daily_rates_ccy_idx
    ON fx_daily_rates (company_id, from_currency, to_currency, rate_date DESC);
--> statement-breakpoint

-- ── Corridas de revaluación ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fx_revaluation_runs (
    id serial PRIMARY KEY,
    company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    /* Fecha a la que se está reexpresando el balance. Típicamente último día del mes. */
    valuation_date date NOT NULL,
    /* Estado — draft = calculado sin postear; posted = asiento aplicado. */
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','posted','cancelled')),
    /* Totales del run. */
    total_gain numeric(20,4) NOT NULL DEFAULT 0,
    total_loss numeric(20,4) NOT NULL DEFAULT 0,
    net_impact numeric(20,4) NOT NULL DEFAULT 0,
    /* Cuentas de destino (ganancia/pérdida por diferencia cambiaria). */
    gain_account_code text NOT NULL DEFAULT '4.2.01.001',
    loss_account_code text NOT NULL DEFAULT '5.3.01.001',
    /* Asiento contable resultante. */
    journal_entry_id bigint,
    posted_at timestamp with time zone,
    posted_by integer,
    notes text,
    created_by integer NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS fx_revaluation_runs_date_idx
    ON fx_revaluation_runs (company_id, valuation_date DESC);
--> statement-breakpoint

-- Detalle: qué se revaloró y cuánta fue la diferencia por partida.
CREATE TABLE IF NOT EXISTS fx_revaluation_items (
    id serial PRIMARY KEY,
    run_id integer NOT NULL REFERENCES fx_revaluation_runs(id) ON DELETE CASCADE,
    /* Subledger del que viene el saldo: ar | ap | bank */
    subledger text NOT NULL CHECK (subledger IN ('ar','ap','bank')),
    /* Referencia al open item o cuenta bancaria original. */
    reference_id bigint NOT NULL,
    currency char(3) NOT NULL,
    /* Saldo en la moneda extranjera (invariante). */
    balance_ccy numeric(20,4) NOT NULL,
    /* Lo que dice el libro en DOP hoy. */
    ledger_balance_dop numeric(20,4) NOT NULL,
    /* Lo que debería decir el libro tras revaluación. */
    revalued_dop numeric(20,4) NOT NULL,
    /* revalued - ledger. Positivo = subió el equivalente en DOP. */
    difference numeric(20,4) NOT NULL,
    rate_used numeric(18,8) NOT NULL,
    /* Cuenta contable del subledger involucrada — la contra-partida
       del asiento por moneda va contra esta cuenta. */
    control_account_code text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS fx_revaluation_items_run_idx
    ON fx_revaluation_items (run_id);
--> statement-breakpoint
