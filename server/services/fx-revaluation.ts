import type { Pool, PoolClient } from "@neondatabase/serverless";
import { PostingEngine } from "../accounting/posting-engine";

/**
 * Multi-currency: gestión de tasas oficiales y revaluación mensual de saldos
 * en moneda extranjera.
 *
 * Modelo mental: la moneda funcional (DOP) es la que reportamos. Cuando un
 * saldo (AR, AP, banco USD) queda expresado en otra moneda, los libros lo
 * llevan también en DOP usando la tasa del día en que se registró. Con el
 * paso del tiempo la tasa cambia y el equivalente en DOP del mismo saldo
 * también cambia — esa diferencia se llama diferencia cambiaria y hay que
 * reconocerla contra ganancia (4.4.x) o pérdida (5.6.x).
 *
 * `runRevaluation`:
 *   1. Toma cada partida abierta en ME (AR, AP, banco)
 *   2. Calcula el DOP equivalente con la tasa de cierre
 *   3. Compara contra lo que registraron los libros (balance × tasa histórica)
 *   4. La diferencia neta por moneda se postea en un asiento agregado
 *
 * El asiento resultante tiene esta forma (ejemplo USD con USD sube):
 *   Dr Cuenta control AR (USD)   xxx.xx
 *      Cr Ingresos por diferencia cambiaria  xxx.xx
 * Si USD bajó:
 *   Dr Gastos por diferencia cambiaria  xxx.xx
 *      Cr Cuenta control AR (USD)  xxx.xx
 */

export class FxError extends Error {}

// ── Rate management ──────────────────────────────────────────────────────

export type RateType = "spot" | "closing" | "avg";

export interface SetRateInput {
  companyId: number;
  rateDate: string;
  fromCurrency: string;
  toCurrency: string;
  rateType?: RateType;
  rate: number;
  source?: string;
  notes?: string;
  createdBy?: number;
}

export async function setDailyRate(pool: Pool, input: SetRateInput): Promise<number> {
  if (input.rate <= 0) throw new FxError("la tasa debe ser positiva");
  const r = await pool.query(
    `INSERT INTO fx_daily_rates
       (company_id, rate_date, from_currency, to_currency, rate_type, rate, source, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (company_id, rate_date, from_currency, to_currency, rate_type)
     DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source,
                   notes = EXCLUDED.notes, updated_at = now()
     RETURNING id`,
    [
      input.companyId, input.rateDate, input.fromCurrency, input.toCurrency,
      input.rateType ?? "spot", String(input.rate), input.source ?? null,
      input.notes ?? null, input.createdBy ?? null,
    ],
  );
  return Number(r.rows[0].id);
}

/**
 * Devuelve la tasa vigente para la fecha indicada; si no hay tasa exacta,
 * usa la más reciente anterior (retro-búsqueda). Si tampoco existe una
 * previa, devuelve null.
 */
export async function getRate(
  pool: Pool,
  companyId: number,
  rateDate: string,
  fromCurrency: string,
  toCurrency: string,
  rateType: RateType = "spot",
): Promise<number | null> {
  if (fromCurrency === toCurrency) return 1;
  const r = await pool.query(
    `SELECT rate::float AS rate
       FROM fx_daily_rates
      WHERE company_id = $1 AND from_currency = $2 AND to_currency = $3
        AND rate_type = $4 AND rate_date <= $5::date
      ORDER BY rate_date DESC LIMIT 1`,
    [companyId, fromCurrency, toCurrency, rateType, rateDate],
  );
  return r.rowCount ? Number(r.rows[0].rate) : null;
}

/** Same as getRate but for use inside an already-open transaction/client. */
async function getRateWithClient(
  client: PoolClient,
  companyId: number,
  rateDate: string,
  fromCurrency: string,
  toCurrency: string,
  rateType: RateType = "spot",
): Promise<number | null> {
  if (fromCurrency === toCurrency) return 1;
  const r = await client.query(
    `SELECT rate::float AS rate
       FROM fx_daily_rates
      WHERE company_id = $1 AND from_currency = $2 AND to_currency = $3
        AND rate_type = $4 AND rate_date <= $5::date
      ORDER BY rate_date DESC LIMIT 1`,
    [companyId, fromCurrency, toCurrency, rateType, rateDate],
  );
  return r.rowCount ? Number(r.rows[0].rate) : null;
}

export async function listRates(
  pool: Pool,
  companyId: number,
  filter: { fromCurrency?: string; toCurrency?: string; limit?: number } = {},
) {
  const r = await pool.query(
    `SELECT id, rate_date::text AS "rateDate",
            from_currency AS "fromCurrency", to_currency AS "toCurrency",
            rate_type AS "rateType", rate::text AS rate,
            source, notes, updated_at::text AS "updatedAt"
       FROM fx_daily_rates
      WHERE company_id = $1
        AND ($2::text IS NULL OR from_currency = $2)
        AND ($3::text IS NULL OR to_currency = $3)
      ORDER BY rate_date DESC, from_currency, to_currency, rate_type
      LIMIT $4`,
    [companyId, filter.fromCurrency ?? null, filter.toCurrency ?? null, filter.limit ?? 200],
  );
  return r.rows;
}

// ── Revaluation ───────────────────────────────────────────────────────

interface OpenItem {
  refId: number;
  currency: string;
  balanceCcy: number;
  ledgerBalanceDop: number;
  issueDate: string;
  controlAccountCode: string | null;
}

export interface RevaluationPreview {
  valuationDate: string;
  functionalCurrency: string;
  rates: Record<string, number>;
  totalGain: number;
  totalLoss: number;
  netImpact: number;
  byCurrency: Array<{
    currency: string;
    closingRate: number;
    subledger: "ar" | "ap" | "bank";
    itemCount: number;
    ledgerDop: number;
    revaluedDop: number;
    difference: number;
  }>;
  items: Array<{
    subledger: "ar" | "ap" | "bank";
    referenceId: number;
    currency: string;
    balanceCcy: number;
    ledgerBalanceDop: number;
    revaluedDop: number;
    difference: number;
    rateUsed: number;
    controlAccountCode: string | null;
  }>;
}

export async function previewRevaluation(
  pool: Pool,
  companyId: number,
  valuationDate: string,
): Promise<RevaluationPreview> {
  const client = await pool.connect();
  try {
    return await previewInClient(client, companyId, valuationDate);
  } finally {
    client.release();
  }
}

async function previewInClient(
  client: PoolClient,
  companyId: number,
  valuationDate: string,
): Promise<RevaluationPreview> {
  const fc = await getFunctionalCurrency(client, companyId);

  const ar = await loadAr(client, companyId, valuationDate, fc);
  const ap = await loadAp(client, companyId, valuationDate, fc);
  const bank = await loadBankBalances(client, companyId, valuationDate, fc);

  const rates: Record<string, number> = {};
  async function rateFor(ccy: string): Promise<number> {
    if (ccy === fc) return 1;
    if (rates[ccy]) return rates[ccy];
    const r = await getRateWithClient(client, companyId, valuationDate, ccy, fc, "closing")
      ?? await getRateWithClient(client, companyId, valuationDate, ccy, fc, "spot");
    if (!r) throw new FxError(`no hay tasa de cierre para ${ccy}→${fc} en ${valuationDate}`);
    rates[ccy] = r;
    return r;
  }

    const items: RevaluationPreview["items"] = [];
    const bucket = new Map<string, RevaluationPreview["byCurrency"][number]>();

    for (const src of [{ list: ar, kind: "ar" as const }, { list: ap, kind: "ap" as const }, { list: bank, kind: "bank" as const }]) {
      for (const it of src.list) {
        const rate = await rateFor(it.currency);
        const revaluedDop = round4(it.balanceCcy * rate);
        const diff = round4(revaluedDop - it.ledgerBalanceDop);
        items.push({
          subledger: src.kind,
          referenceId: it.refId,
          currency: it.currency,
          balanceCcy: it.balanceCcy,
          ledgerBalanceDop: it.ledgerBalanceDop,
          revaluedDop,
          difference: diff,
          rateUsed: rate,
          controlAccountCode: it.controlAccountCode,
        });
        const key = `${it.currency}|${src.kind}`;
        const b = bucket.get(key) ?? {
          currency: it.currency, closingRate: rate, subledger: src.kind,
          itemCount: 0, ledgerDop: 0, revaluedDop: 0, difference: 0,
        };
        b.itemCount++;
        b.ledgerDop = round4(b.ledgerDop + it.ledgerBalanceDop);
        b.revaluedDop = round4(b.revaluedDop + revaluedDop);
        b.difference = round4(b.difference + diff);
        bucket.set(key, b);
      }
    }

    const totalGain = items.reduce((s, it) => s + Math.max(gainFor(it.subledger, it.difference), 0), 0);
    const totalLoss = items.reduce((s, it) => s + Math.max(-gainFor(it.subledger, it.difference), 0), 0);

  return {
    valuationDate,
    functionalCurrency: fc,
    rates,
    totalGain: round4(totalGain),
    totalLoss: round4(totalLoss),
    netImpact: round4(totalGain - totalLoss),
    byCurrency: [...bucket.values()],
    items,
  };
}

/**
 * Signo contable: si es un activo (AR, banco) y sube el DOP equivalente,
 * es ganancia. Si es un pasivo (AP) y sube el DOP equivalente, es pérdida.
 */
function gainFor(subledger: "ar" | "ap" | "bank", diff: number): number {
  return subledger === "ap" ? -diff : diff;
}

export interface RunRevaluationInput {
  companyId: number;
  valuationDate: string;
  gainAccountCode?: string;
  lossAccountCode?: string;
  notes?: string;
  createdBy: number;
}

export async function runRevaluation(pool: Pool, input: RunRevaluationInput) {
  const gainCode = input.gainAccountCode ?? "4.2.01.001";
  const lossCode = input.lossAccountCode ?? "5.3.01.001";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const preview = await previewInClient(client, input.companyId, input.valuationDate);
    if (preview.items.length === 0) {
      throw new FxError("no hay saldos en moneda extranjera para revaluar");
    }

    // Persistir header en draft.
    const runRes = await client.query(
      `INSERT INTO fx_revaluation_runs
         (company_id, valuation_date, status, total_gain, total_loss, net_impact,
          gain_account_code, loss_account_code, notes, created_by)
       VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        input.companyId, input.valuationDate,
        String(preview.totalGain), String(preview.totalLoss), String(preview.netImpact),
        gainCode, lossCode, input.notes ?? null, input.createdBy,
      ],
    );
    const runId = Number(runRes.rows[0].id);

    for (const it of preview.items) {
      await client.query(
        `INSERT INTO fx_revaluation_items
           (run_id, subledger, reference_id, currency, balance_ccy,
            ledger_balance_dop, revalued_dop, difference, rate_used, control_account_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          runId, it.subledger, it.referenceId, it.currency,
          String(it.balanceCcy), String(it.ledgerBalanceDop),
          String(it.revaluedDop), String(it.difference),
          String(it.rateUsed), it.controlAccountCode,
        ],
      );
    }

    // Construir asiento agregado.
    // Un debit/credit por cada (control_account_code, subledger, currency)
    // + contrapartida en gain/loss.
    interface LineAgg { code: string; debit: number; credit: number; }
    const lines: LineAgg[] = [];

    for (const it of preview.items) {
      if (it.difference === 0 || !it.controlAccountCode) continue;
      if (it.subledger === "ap") {
        // AP: si diff positivo (pasivo sube en DOP), Cr control, Dr pérdida.
        if (it.difference > 0) {
          push(lines, it.controlAccountCode, 0, it.difference);
          push(lines, lossCode, it.difference, 0);
        } else {
          push(lines, it.controlAccountCode, -it.difference, 0);
          push(lines, gainCode, 0, -it.difference);
        }
      } else {
        // AR o banco (activo): si diff positivo (activo sube en DOP), Dr control, Cr ganancia.
        if (it.difference > 0) {
          push(lines, it.controlAccountCode, it.difference, 0);
          push(lines, gainCode, 0, it.difference);
        } else {
          push(lines, it.controlAccountCode, 0, -it.difference);
          push(lines, lossCode, -it.difference, 0);
        }
      }
    }

    // Colapsar y filtrar ceros.
    const clean = lines
      .filter((l) => l.debit > 0 || l.credit > 0)
      .map((l) => ({ accountCode: l.code, debit: l.debit > 0 ? l.debit.toFixed(4) : "0", credit: l.credit > 0 ? l.credit.toFixed(4) : "0" }));

    if (clean.length < 2) {
      await client.query(
        `UPDATE fx_revaluation_runs SET status='posted', posted_at=now(), posted_by=$2 WHERE id=$1`,
        [runId, input.createdBy],
      );
      await client.query("COMMIT");
      return { runId, journalEntryId: null, ...preview };
    }

    // Balancear si hay una fracción de redondeo.
    const totalDr = clean.reduce((s, l) => s + Number(l.debit), 0);
    const totalCr = clean.reduce((s, l) => s + Number(l.credit), 0);
    const diff = round4(totalDr - totalCr);
    if (Math.abs(diff) > 0 && Math.abs(diff) < 0.01) {
      // Aplicar corrección a la primera línea del gain/loss.
      const target = clean.find((l) => l.accountCode === gainCode || l.accountCode === lossCode);
      if (target) {
        if (diff > 0) target.credit = (Number(target.credit) + diff).toFixed(4);
        else target.debit = (Number(target.debit) - diff).toFixed(4);
      }
    }

    const posted = await new PostingEngine(client as unknown as PoolClient).postManual({
      companyId: input.companyId,
      entryDate: input.valuationDate,
      reference: `fx-reval-${runId}`,
      memo: `Revaluación cambiaria al ${input.valuationDate}`,
      lines: clean,
      postedBy: input.createdBy,
    });

    await client.query(
      `UPDATE fx_revaluation_runs
          SET status = 'posted', posted_at = now(), posted_by = $2,
              journal_entry_id = $3
        WHERE id = $1`,
      [runId, input.createdBy, posted.entryId],
    );

    await client.query("COMMIT");
    return { runId, journalEntryId: posted.entryId, ...preview };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function push(lines: Array<{ code: string; debit: number; credit: number }>, code: string, debit: number, credit: number) {
  const existing = lines.find((l) => l.code === code);
  if (existing) {
    existing.debit = round4(existing.debit + debit);
    existing.credit = round4(existing.credit + credit);
  } else {
    lines.push({ code, debit: round4(debit), credit: round4(credit) });
  }
}

// ── Consultas de subledger ────────────────────────────────────────────

async function getFunctionalCurrency(client: PoolClient, companyId: number): Promise<string> {
  const r = await client.query(
    `SELECT functional_currency FROM companies WHERE id = $1`,
    [companyId],
  );
  return r.rows[0]?.functional_currency ?? "DOP";
}

async function loadAr(client: PoolClient, companyId: number, valuationDate: string, fc: string): Promise<OpenItem[]> {
  const r = await client.query(
    `SELECT id, currency, balance::float AS balance,
            issue_date::text AS issue_date
       FROM ar_open_items
      WHERE company_id = $1 AND balance > 0 AND status != 'paid'
        AND currency <> $2 AND issue_date <= $3::date`,
    [companyId, fc, valuationDate],
  );
  return await withHistoricRate(r.rows, "1.1.02.001", companyId, fc, client);
}

async function loadAp(client: PoolClient, companyId: number, valuationDate: string, fc: string): Promise<OpenItem[]> {
  const r = await client.query(
    `SELECT id, currency, balance::float AS balance,
            issue_date::text AS issue_date
       FROM ap_open_items
      WHERE company_id = $1 AND balance > 0 AND status != 'paid'
        AND currency <> $2 AND issue_date <= $3::date`,
    [companyId, fc, valuationDate],
  );
  return await withHistoricRate(r.rows, "2.1.01.001", companyId, fc, client);
}

async function loadBankBalances(client: PoolClient, companyId: number, valuationDate: string, fc: string): Promise<OpenItem[]> {
  const r = await client.query(
    `SELECT ba.id, ba.currency, ba.code,
            coa.code AS gl_code,
            coalesce(sum(CASE WHEN t.direction='in' THEN t.amount ELSE -t.amount END)
                     FILTER (WHERE t.status='posted' AND t.txn_date <= $3::date), 0)::float AS balance
       FROM bank_accounts ba
       LEFT JOIN bank_transactions t ON t.bank_account_id = ba.id
       LEFT JOIN chart_of_accounts coa ON coa.id = ba.gl_account_id
      WHERE ba.company_id = $1 AND ba.currency <> $2 AND ba.is_active
      GROUP BY ba.id, ba.currency, ba.code, coa.code
      HAVING coalesce(sum(CASE WHEN t.direction='in' THEN t.amount ELSE -t.amount END)
                      FILTER (WHERE t.status='posted' AND t.txn_date <= $3::date), 0) <> 0`,
    [companyId, fc, valuationDate],
  );
  const items: OpenItem[] = [];
  for (const row of r.rows) {
    const historic = await getRateWithClient(client, companyId, valuationDate, row.currency, fc, "spot") ?? 1;
    items.push({
      refId: Number(row.id),
      currency: row.currency,
      balanceCcy: Number(row.balance),
      ledgerBalanceDop: round4(Number(row.balance) * historic),
      issueDate: valuationDate,
      controlAccountCode: row.gl_code,
    });
  }
  return items;
}

async function withHistoricRate(
  rows: Array<{ id: number; currency: string; balance: number; issue_date: string }>,
  defaultCode: string,
  companyId: number,
  fc: string,
  client: PoolClient,
): Promise<OpenItem[]> {
  const out: OpenItem[] = [];
  for (const row of rows) {
    const historic = await getRateWithClient(client, companyId, row.issue_date, row.currency, fc, "spot") ?? 1;
    out.push({
      refId: Number(row.id),
      currency: row.currency,
      balanceCcy: Number(row.balance),
      ledgerBalanceDop: round4(Number(row.balance) * historic),
      issueDate: row.issue_date,
      controlAccountCode: defaultCode,
    });
  }
  return out;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

// ── Historial ───────────────────────────────────────────────────────

export async function listRevaluationRuns(pool: Pool, companyId: number) {
  const r = await pool.query(
    `SELECT id, valuation_date::text AS "valuationDate", status,
            total_gain::text AS "totalGain",
            total_loss::text AS "totalLoss",
            net_impact::text AS "netImpact",
            gain_account_code AS "gainAccountCode",
            loss_account_code AS "lossAccountCode",
            journal_entry_id AS "journalEntryId",
            posted_at::text AS "postedAt", notes,
            created_at::text AS "createdAt"
       FROM fx_revaluation_runs WHERE company_id = $1
       ORDER BY valuation_date DESC LIMIT 100`,
    [companyId],
  );
  return r.rows;
}

export async function getRevaluationRun(pool: Pool, runId: number) {
  const head = await pool.query(
    `SELECT id, valuation_date::text AS "valuationDate", status,
            total_gain::text AS "totalGain", total_loss::text AS "totalLoss",
            net_impact::text AS "netImpact",
            gain_account_code AS "gainAccountCode",
            loss_account_code AS "lossAccountCode",
            journal_entry_id AS "journalEntryId", notes
       FROM fx_revaluation_runs WHERE id = $1`,
    [runId],
  );
  if (!head.rowCount) return null;
  const items = await pool.query(
    `SELECT subledger, reference_id AS "referenceId", currency,
            balance_ccy::text AS "balanceCcy",
            ledger_balance_dop::text AS "ledgerBalanceDop",
            revalued_dop::text AS "revaluedDop",
            difference::text AS difference,
            rate_used::text AS "rateUsed",
            control_account_code AS "controlAccountCode"
       FROM fx_revaluation_items WHERE run_id = $1
       ORDER BY subledger, currency, id`,
    [runId],
  );
  return { run: head.rows[0], items: items.rows };
}
