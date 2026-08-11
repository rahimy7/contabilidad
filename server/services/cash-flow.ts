import type { Pool } from "@neondatabase/serverless";

/**
 * Cash flow forecast: proyección rodante de 13 semanas.
 *
 * Consolida cuatro fuentes:
 *   1. Saldo actual combinado de bancos (posición inicial)
 *   2. AR con vencimiento en el horizonte (entrada)
 *   3. AP con vencimiento en el horizonte (salida)
 *   4. Flujos recurrentes definidos en cash_flow_entries
 *
 * El forecast se calcula en buckets semanales. Cada bucket recibe:
 *   - inflows por AR vencido en la semana
 *   - inflows por entries de tipo inflow expandidos
 *   - outflows por AP vencido en la semana
 *   - outflows por entries de tipo outflow expandidos
 *   - balance acumulado = balance previo + net
 *
 * El objetivo no es predecir con exactitud sino visualizar puntos de estrés
 * de liquidez: semanas donde el balance quedaría negativo o cerca de un
 * mínimo crítico.
 */

export class CashFlowError extends Error {}

export interface CashFlowEntryInput {
  companyId: number;
  name: string;
  description?: string;
  direction: "inflow" | "outflow";
  category?: string;
  amount: number;
  currency?: string;
  frequency?: "one_time" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
  startDate: string;
  endDate?: string;
  intervalCount?: number;
  confidence?: "high" | "medium" | "low";
  referenceType?: string;
  referenceId?: number;
  bankAccountId?: number;
  notes?: string;
  createdBy: number;
}

export async function createEntry(pool: Pool, input: CashFlowEntryInput): Promise<number> {
  if (input.amount <= 0) throw new CashFlowError("el monto debe ser positivo");
  const r = await pool.query(
    `INSERT INTO cash_flow_entries
       (company_id, name, description, direction, category, amount, currency,
        frequency, start_date, end_date, interval_count, confidence,
        reference_type, reference_id, bank_account_id, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10::date,$11,$12,$13,$14,$15,$16,$17)
     RETURNING id`,
    [
      input.companyId, input.name, input.description ?? null,
      input.direction, input.category ?? "other",
      String(input.amount), input.currency ?? "DOP",
      input.frequency ?? "monthly",
      input.startDate, input.endDate ?? null,
      input.intervalCount ?? 1, input.confidence ?? "high",
      input.referenceType ?? null, input.referenceId ?? null,
      input.bankAccountId ?? null, input.notes ?? null, input.createdBy,
    ],
  );
  return Number(r.rows[0].id);
}

export async function updateEntry(
  pool: Pool,
  entryId: number,
  patch: Partial<Omit<CashFlowEntryInput, "companyId" | "createdBy">>,
): Promise<void> {
  const setters: string[] = [];
  const values: any[] = [entryId];
  const camelToSnake: Record<string, string> = {
    name: "name", description: "description", direction: "direction",
    category: "category", amount: "amount", currency: "currency",
    frequency: "frequency", startDate: "start_date", endDate: "end_date",
    intervalCount: "interval_count", confidence: "confidence",
    bankAccountId: "bank_account_id", notes: "notes",
  };
  for (const [k, v] of Object.entries(patch)) {
    const col = camelToSnake[k];
    if (!col) continue;
    values.push(v);
    setters.push(`${col} = $${values.length}`);
  }
  if (!setters.length) return;
  setters.push(`updated_at = now()`);
  await pool.query(
    `UPDATE cash_flow_entries SET ${setters.join(", ")} WHERE id = $1`,
    values,
  );
}

export async function deleteEntry(pool: Pool, entryId: number): Promise<void> {
  await pool.query(`UPDATE cash_flow_entries SET is_active = false WHERE id = $1`, [entryId]);
}

export async function listEntries(pool: Pool, companyId: number) {
  const r = await pool.query(
    `SELECT id, name, description, direction, category,
            amount::text AS amount, currency, frequency,
            start_date::text AS "startDate", end_date::text AS "endDate",
            interval_count AS "intervalCount", confidence,
            bank_account_id AS "bankAccountId", is_active AS "isActive", notes
       FROM cash_flow_entries
      WHERE company_id = $1 AND is_active = true
      ORDER BY direction, start_date, name`,
    [companyId],
  );
  return r.rows;
}

// ── Forecast ────────────────────────────────────────────────────────

export interface WeeklyBucket {
  weekStart: string;
  weekEnd: string;
  openingBalance: number;
  inflowAR: number;
  inflowOther: number;
  outflowAP: number;
  outflowOther: number;
  netFlow: number;
  closingBalance: number;
  items: Array<{
    date: string;
    source: "AR" | "AP" | "entry";
    direction: "inflow" | "outflow";
    label: string;
    amount: number;
    entryId?: number;
    referenceId?: number;
  }>;
}

export interface ForecastResult {
  forecastDate: string;
  horizonWeeks: number;
  startingBalance: number;
  totalInflow: number;
  totalOutflow: number;
  netFlow: number;
  endingBalance: number;
  minBalance: number;
  minBalanceWeek: string;
  buckets: WeeklyBucket[];
}

export interface ForecastInput {
  companyId: number;
  forecastDate?: string;
  horizonWeeks?: number;
  includeCategories?: string[];
  excludeConfidence?: Array<"high" | "medium" | "low">;
  bankAccountId?: number;
}

export async function generateForecast(pool: Pool, input: ForecastInput): Promise<ForecastResult> {
  const start = input.forecastDate ?? new Date().toISOString().slice(0, 10);
  const horizon = input.horizonWeeks ?? 13;
  const buckets = buildBuckets(start, horizon);
  const endDate = buckets[buckets.length - 1].weekEnd;

  // 1. Saldo inicial: suma de todos los bancos hasta la fecha de forecast.
  const startingBalance = await computeBankBalance(pool, input.companyId, start, input.bankAccountId);

  // 2. AR con vencimiento en el horizonte.
  const arRows = await pool.query(
    `SELECT id, due_date::text AS "dueDate", balance::float AS balance, currency
       FROM ar_open_items
      WHERE company_id = $1 AND balance > 0 AND status != 'paid'
        AND due_date BETWEEN $2::date AND $3::date`,
    [input.companyId, start, endDate],
  );

  // 3. AP con vencimiento en el horizonte.
  const apRows = await pool.query(
    `SELECT id, due_date::text AS "dueDate", balance::float AS balance, currency
       FROM ap_open_items
      WHERE company_id = $1 AND balance > 0 AND status != 'paid'
        AND due_date BETWEEN $2::date AND $3::date`,
    [input.companyId, start, endDate],
  );

  // 4. Entries recurrentes activos.
  const excludeConf = input.excludeConfidence ?? [];
  const catFilter = input.includeCategories?.length
    ? ` AND category = ANY($5::text[])` : "";
  const entries = await pool.query(
    `SELECT id, name, direction, category,
            amount::float AS amount, currency,
            frequency, start_date::text AS "startDate",
            end_date::text AS "endDate",
            interval_count AS "intervalCount", confidence, bank_account_id AS "bankAccountId"
       FROM cash_flow_entries
      WHERE company_id = $1 AND is_active = true
        AND start_date <= $3::date
        AND (end_date IS NULL OR end_date >= $2::date)
        AND ($4::text[] IS NULL OR NOT (confidence = ANY($4)))
        ${catFilter}`,
    [
      input.companyId, start, endDate,
      excludeConf.length ? excludeConf : null,
      ...(input.includeCategories?.length ? [input.includeCategories] : []),
    ],
  );

  // Volcar AR/AP a buckets.
  for (const ar of arRows.rows) {
    const b = findBucket(buckets, ar.dueDate);
    if (!b) continue;
    b.inflowAR += ar.balance;
    b.items.push({
      date: ar.dueDate, source: "AR", direction: "inflow",
      label: `AR #${ar.id}`, amount: ar.balance, referenceId: Number(ar.id),
    });
  }
  for (const ap of apRows.rows) {
    const b = findBucket(buckets, ap.dueDate);
    if (!b) continue;
    b.outflowAP += ap.balance;
    b.items.push({
      date: ap.dueDate, source: "AP", direction: "outflow",
      label: `AP #${ap.id}`, amount: ap.balance, referenceId: Number(ap.id),
    });
  }

  // Expandir entries.
  for (const e of entries.rows) {
    const occurrences = expandOccurrences({
      frequency: e.frequency,
      startDate: e.startDate,
      endDate: e.endDate,
      intervalCount: Number(e.intervalCount),
      windowStart: start,
      windowEnd: endDate,
    });
    for (const occ of occurrences) {
      const b = findBucket(buckets, occ);
      if (!b) continue;
      if (e.direction === "inflow") {
        b.inflowOther += Number(e.amount);
      } else {
        b.outflowOther += Number(e.amount);
      }
      b.items.push({
        date: occ, source: "entry",
        direction: e.direction, label: e.name,
        amount: Number(e.amount), entryId: Number(e.id),
      });
    }
  }

  // Balance acumulado.
  let running = startingBalance;
  let minBalance = startingBalance;
  let minBalanceWeek = start;
  let totalIn = 0, totalOut = 0;
  for (const b of buckets) {
    b.openingBalance = round4(running);
    const netIn = b.inflowAR + b.inflowOther;
    const netOut = b.outflowAP + b.outflowOther;
    b.netFlow = round4(netIn - netOut);
    running = round4(running + b.netFlow);
    b.closingBalance = running;
    totalIn += netIn;
    totalOut += netOut;
    if (running < minBalance) { minBalance = running; minBalanceWeek = b.weekEnd; }
    b.inflowAR = round4(b.inflowAR);
    b.inflowOther = round4(b.inflowOther);
    b.outflowAP = round4(b.outflowAP);
    b.outflowOther = round4(b.outflowOther);
    b.items.sort((a, b2) => a.date < b2.date ? -1 : 1);
  }

  return {
    forecastDate: start,
    horizonWeeks: horizon,
    startingBalance: round4(startingBalance),
    totalInflow: round4(totalIn),
    totalOutflow: round4(totalOut),
    netFlow: round4(totalIn - totalOut),
    endingBalance: running,
    minBalance: round4(minBalance),
    minBalanceWeek,
    buckets,
  };
}

// ── Persistir snapshot ─────────────────────────────────────────────

export async function saveForecast(
  pool: Pool,
  companyId: number,
  forecast: ForecastResult,
  createdBy: number,
  notes?: string,
): Promise<number> {
  const r = await pool.query(
    `INSERT INTO cash_flow_forecasts
       (company_id, forecast_date, horizon_weeks, starting_balance,
        total_inflow, total_outflow, ending_balance, weekly_buckets, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [
      companyId, forecast.forecastDate, forecast.horizonWeeks,
      String(forecast.startingBalance),
      String(forecast.totalInflow), String(forecast.totalOutflow),
      String(forecast.endingBalance),
      JSON.stringify(forecast.buckets),
      notes ?? null, createdBy,
    ],
  );
  return Number(r.rows[0].id);
}

export async function listSavedForecasts(pool: Pool, companyId: number) {
  const r = await pool.query(
    `SELECT id, forecast_date::text AS "forecastDate", horizon_weeks AS "horizonWeeks",
            starting_balance::text AS "startingBalance",
            total_inflow::text AS "totalInflow",
            total_outflow::text AS "totalOutflow",
            ending_balance::text AS "endingBalance",
            notes, created_at::text AS "createdAt"
       FROM cash_flow_forecasts WHERE company_id = $1
       ORDER BY forecast_date DESC, id DESC LIMIT 50`,
    [companyId],
  );
  return r.rows;
}

// ── Helpers ─────────────────────────────────────────────────────────

async function computeBankBalance(
  pool: Pool,
  companyId: number,
  asOfDate: string,
  bankAccountId?: number,
): Promise<number> {
  const r = await pool.query(
    `SELECT coalesce(sum(CASE WHEN t.direction='in' THEN t.amount ELSE -t.amount END)
                    FILTER (WHERE t.status='posted' AND t.txn_date <= $2::date), 0)::float AS balance
       FROM bank_transactions t
       JOIN bank_accounts ba ON ba.id = t.bank_account_id
      WHERE ba.company_id = $1
        AND ($3::bigint IS NULL OR ba.id = $3::bigint)`,
    [companyId, asOfDate, bankAccountId ?? null],
  );
  return Number(r.rows[0]?.balance ?? 0);
}

function buildBuckets(startDate: string, weeks: number): WeeklyBucket[] {
  const buckets: WeeklyBucket[] = [];
  let cursor = parseDate(startDate);
  for (let i = 0; i < weeks; i++) {
    const start = cursor;
    const end = addDays(start, 6);
    buckets.push({
      weekStart: formatDate(start),
      weekEnd: formatDate(end),
      openingBalance: 0,
      inflowAR: 0, inflowOther: 0,
      outflowAP: 0, outflowOther: 0,
      netFlow: 0, closingBalance: 0,
      items: [],
    });
    cursor = addDays(start, 7);
  }
  return buckets;
}

function findBucket(buckets: WeeklyBucket[], date: string): WeeklyBucket | null {
  for (const b of buckets) {
    if (date >= b.weekStart && date <= b.weekEnd) return b;
  }
  return null;
}

interface ExpandInput {
  frequency: string;
  startDate: string;
  endDate: string | null;
  intervalCount: number;
  windowStart: string;
  windowEnd: string;
}

function expandOccurrences(inp: ExpandInput): string[] {
  const out: string[] = [];
  const winStart = parseDate(inp.windowStart);
  const winEnd = parseDate(inp.windowEnd);
  const end = inp.endDate ? parseDate(inp.endDate) : null;
  let cursor = parseDate(inp.startDate);
  const N = inp.intervalCount || 1;

  const stopAt = end && end.getTime() < winEnd.getTime() ? end : winEnd;
  const maxIter = 500;
  let iter = 0;

  while (cursor.getTime() <= stopAt.getTime() && iter++ < maxIter) {
    if (cursor.getTime() >= winStart.getTime()) {
      out.push(formatDate(cursor));
    }
    if (inp.frequency === "one_time") break;
    cursor = advance(cursor, inp.frequency, N);
  }
  return out;
}

function advance(d: Date, frequency: string, n: number): Date {
  switch (frequency) {
    case "weekly": return addDays(d, 7 * n);
    case "biweekly": return addDays(d, 14 * n);
    case "monthly": return addMonths(d, n);
    case "quarterly": return addMonths(d, 3 * n);
    case "yearly": return addMonths(d, 12 * n);
    default: return addDays(d, 7);
  }
}

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

function addMonths(d: Date, n: number): Date {
  const nd = new Date(d.getTime());
  const day = nd.getUTCDate();
  nd.setUTCDate(1);
  nd.setUTCMonth(nd.getUTCMonth() + n);
  const target = new Date(Date.UTC(nd.getUTCFullYear(), nd.getUTCMonth() + 1, 0)).getUTCDate();
  nd.setUTCDate(Math.min(day, target));
  return nd;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
