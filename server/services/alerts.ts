import crypto from "node:crypto";
import type { Pool } from "@neondatabase/serverless";

/**
 * Motor de alertas proactivas.
 *
 * Cada regla mapea a un evaluator que consulta el estado de un subsistema y
 * produce cero o más "matches". Por cada match se emite un evento idempotente
 * (dedup por `dedup_key`). Los eventos se despachan a canales (in-app, email,
 * WhatsApp) mediante `alert_deliveries`.
 *
 * El `runAlerts(pool, storeId)` corre todos los evaluators registrados para el
 * store. Diseñado para ejecutarse cada 5-15 minutos vía cron o al vuelo desde
 * la UI para verificación manual.
 */

export class AlertError extends Error {}

// ── Tipos ──────────────────────────────────────────────────────────

export type RuleType =
  | "cash_low" | "ar_overdue" | "ap_overdue" | "approvals_stale"
  | "mo_short" | "low_stock" | "fx_stale" | "custom";

export type Severity = "info" | "warning" | "critical";

export interface AlertRule {
  id: number;
  storeId: number;
  companyId: number | null;
  name: string;
  ruleType: RuleType;
  parameters: Record<string, unknown>;
  severity: Severity;
  channels: string[];
  recipientUserIds: number[] | null;
  debounceMinutes: number;
  isActive: boolean;
  lastTriggeredAt: string | null;
}

export interface AlertMatch {
  dedupKey: string;
  title: string;
  payload: Record<string, unknown>;
  severity?: Severity;
}

// ── CRUD de reglas ────────────────────────────────────────────────

export interface CreateRuleInput {
  storeId: number;
  companyId?: number;
  name: string;
  ruleType: RuleType;
  parameters?: Record<string, unknown>;
  severity?: Severity;
  channels?: string[];
  recipientUserIds?: number[];
  debounceMinutes?: number;
  notes?: string;
  createdBy: number;
}

export async function createRule(pool: Pool, input: CreateRuleInput): Promise<number> {
  const r = await pool.query(
    `INSERT INTO alert_rules
       (store_id, company_id, name, rule_type, parameters, severity,
        channels, recipient_user_ids, debounce_minutes, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [
      input.storeId, input.companyId ?? null,
      input.name, input.ruleType,
      JSON.stringify(input.parameters ?? {}),
      input.severity ?? "warning",
      input.channels ?? ["in_app"],
      input.recipientUserIds ?? null,
      input.debounceMinutes ?? 60,
      input.notes ?? null, input.createdBy,
    ],
  );
  return Number(r.rows[0].id);
}

export async function listRules(pool: Pool, storeId: number) {
  const r = await pool.query(
    `SELECT id, name, rule_type AS "ruleType", parameters, severity,
            channels, recipient_user_ids AS "recipientUserIds",
            debounce_minutes AS "debounceMinutes",
            is_active AS "isActive",
            last_triggered_at::text AS "lastTriggeredAt",
            trigger_count AS "triggerCount", notes
       FROM alert_rules WHERE store_id = $1
       ORDER BY rule_type, name`,
    [storeId],
  );
  return r.rows;
}

export async function updateRule(pool: Pool, ruleId: number, patch: Partial<CreateRuleInput>): Promise<void> {
  const setters: string[] = [];
  const values: any[] = [ruleId];
  const map: Record<string, string> = {
    name: "name", ruleType: "rule_type", severity: "severity",
    channels: "channels", debounceMinutes: "debounce_minutes",
    notes: "notes",
  };
  for (const [k, v] of Object.entries(patch)) {
    if (k === "parameters") {
      values.push(JSON.stringify(v));
      setters.push(`parameters = $${values.length}`);
      continue;
    }
    if (k === "recipientUserIds") {
      values.push(v ?? null);
      setters.push(`recipient_user_ids = $${values.length}`);
      continue;
    }
    const col = map[k];
    if (!col) continue;
    values.push(v);
    setters.push(`${col} = $${values.length}`);
  }
  if (!setters.length) return;
  setters.push(`updated_at = now()`);
  await pool.query(
    `UPDATE alert_rules SET ${setters.join(", ")} WHERE id = $1`,
    values,
  );
}

export async function toggleRule(pool: Pool, ruleId: number, isActive: boolean): Promise<void> {
  await pool.query(
    `UPDATE alert_rules SET is_active = $2, updated_at = now() WHERE id = $1`,
    [ruleId, isActive],
  );
}

// ── Eventos ────────────────────────────────────────────────────────

export async function listEvents(pool: Pool, storeId: number, filter?: { status?: string; limit?: number }) {
  const r = await pool.query(
    `SELECT ae.id, ae.rule_id AS "ruleId", ae.dedup_key AS "dedupKey",
            ae.severity, ae.title, ae.payload, ae.status,
            ae.acknowledged_at::text AS "acknowledgedAt",
            ae.resolved_at::text AS "resolvedAt",
            ae.created_at::text AS "createdAt",
            ar.name AS "ruleName", ar.rule_type AS "ruleType"
       FROM alert_events ae
       LEFT JOIN alert_rules ar ON ar.id = ae.rule_id
      WHERE ae.store_id = $1
        AND ($2::text IS NULL OR ae.status = $2)
      ORDER BY ae.created_at DESC LIMIT $3`,
    [storeId, filter?.status ?? null, filter?.limit ?? 200],
  );
  return r.rows;
}

export async function acknowledgeEvent(pool: Pool, eventId: number, userId: number): Promise<void> {
  await pool.query(
    `UPDATE alert_events
        SET status = 'acknowledged', acknowledged_by = $2, acknowledged_at = now()
      WHERE id = $1 AND status = 'new'`,
    [eventId, userId],
  );
}

export async function dismissEvent(pool: Pool, eventId: number): Promise<void> {
  await pool.query(
    `UPDATE alert_events SET status = 'dismissed' WHERE id = $1 AND status != 'resolved'`,
    [eventId],
  );
}

// ── Runner ────────────────────────────────────────────────────────

export interface RunResult {
  rulesEvaluated: number;
  eventsCreated: number;
  deliveriesQueued: number;
  errors: Array<{ ruleId: number; error: string }>;
}

export async function runAlerts(
  pool: Pool,
  storeId: number,
  options?: { companyId?: number; deliver?: boolean },
): Promise<RunResult> {
  const rules = await pool.query(
    `SELECT id, store_id AS "storeId", company_id AS "companyId",
            name, rule_type AS "ruleType", parameters, severity,
            channels, recipient_user_ids AS "recipientUserIds",
            debounce_minutes AS "debounceMinutes",
            last_triggered_at::text AS "lastTriggeredAt"
       FROM alert_rules WHERE store_id = $1 AND is_active = true`,
    [storeId],
  );

  const result: RunResult = { rulesEvaluated: 0, eventsCreated: 0, deliveriesQueued: 0, errors: [] };
  for (const raw of rules.rows) {
    result.rulesEvaluated++;
    const rule: AlertRule = raw;

    // Debounce por regla.
    if (rule.lastTriggeredAt && rule.debounceMinutes > 0) {
      const elapsed = (Date.now() - new Date(rule.lastTriggeredAt).getTime()) / 60_000;
      if (elapsed < rule.debounceMinutes) continue;
    }

    try {
      const matches = await evaluateRule(pool, rule, { companyId: options?.companyId });
      if (!matches.length) continue;

      for (const m of matches) {
        const inserted = await pool.query(
          `INSERT INTO alert_events (rule_id, store_id, dedup_key, severity, title, payload)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (rule_id, dedup_key) DO NOTHING
           RETURNING id`,
          [
            rule.id, rule.storeId, m.dedupKey,
            m.severity ?? rule.severity, m.title, JSON.stringify(m.payload),
          ],
        );
        if (!inserted.rowCount) continue;
        result.eventsCreated++;
        const eventId = Number(inserted.rows[0].id);
        if (options?.deliver !== false) {
          result.deliveriesQueued += await queueDeliveries(pool, rule, eventId);
        }
      }

      await pool.query(
        `UPDATE alert_rules
            SET last_triggered_at = now(),
                trigger_count = trigger_count + $2,
                updated_at = now()
          WHERE id = $1`,
        [rule.id, matches.length],
      );
    } catch (err: any) {
      result.errors.push({ ruleId: rule.id, error: err.message ?? String(err) });
    }
  }

  return result;
}

async function queueDeliveries(pool: Pool, rule: AlertRule, eventId: number): Promise<number> {
  const recipients = rule.recipientUserIds ?? [];
  let count = 0;
  for (const channel of rule.channels) {
    if (!recipients.length) {
      // Sin destinatarios explícitos: registra un delivery para envío a admins.
      await pool.query(
        `INSERT INTO alert_deliveries (event_id, channel) VALUES ($1, $2)`,
        [eventId, channel],
      );
      count++;
      continue;
    }
    for (const uid of recipients) {
      await pool.query(
        `INSERT INTO alert_deliveries (event_id, channel, recipient_user_id) VALUES ($1, $2, $3)`,
        [eventId, channel, uid],
      );
      count++;
    }
  }
  return count;
}

// ── Evaluators ────────────────────────────────────────────────────

async function evaluateRule(
  pool: Pool,
  rule: AlertRule,
  ctx: { companyId?: number },
): Promise<AlertMatch[]> {
  switch (rule.ruleType) {
    case "cash_low": return evalCashLow(pool, rule, ctx);
    case "ar_overdue": return evalArOverdue(pool, rule, ctx);
    case "ap_overdue": return evalApOverdue(pool, rule, ctx);
    case "approvals_stale": return evalApprovalsStale(pool, rule);
    case "mo_short": return evalMoShort(pool, rule);
    case "low_stock": return evalLowStock(pool, rule);
    case "fx_stale": return evalFxStale(pool, rule, ctx);
    default: return [];
  }
}

function today(): string { return new Date().toISOString().slice(0, 10); }
function dedup(...parts: (string | number)[]): string {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

async function evalCashLow(pool: Pool, rule: AlertRule, ctx: { companyId?: number }): Promise<AlertMatch[]> {
  const minBalance = Number(rule.parameters.minBalance ?? 100000);
  const companyId = ctx.companyId ?? rule.companyId;
  if (!companyId) return [];
  const r = await pool.query(
    `SELECT coalesce(sum(CASE WHEN t.direction='in' THEN t.amount ELSE -t.amount END)
            FILTER (WHERE t.status='posted'), 0)::float AS balance
       FROM bank_transactions t
       JOIN bank_accounts ba ON ba.id = t.bank_account_id
      WHERE ba.company_id = $1`,
    [companyId],
  );
  const balance = Number(r.rows[0]?.balance ?? 0);
  if (balance >= minBalance) return [];
  return [{
    dedupKey: dedup(rule.id, "cash_low", today()),
    title: `Balance bancario bajo: RD$ ${balance.toLocaleString("es-DO")} (umbral RD$ ${minBalance.toLocaleString("es-DO")})`,
    payload: { balance, minBalance, threshold: minBalance },
    severity: balance <= minBalance / 2 ? "critical" : "warning",
  }];
}

async function evalArOverdue(pool: Pool, rule: AlertRule, ctx: { companyId?: number }): Promise<AlertMatch[]> {
  const days = Number(rule.parameters.days ?? 30);
  const minAmount = Number(rule.parameters.minAmount ?? 0);
  const companyId = ctx.companyId ?? rule.companyId;
  if (!companyId) return [];
  const r = await pool.query(
    `SELECT id, due_date::text AS due, balance::float AS balance, customer_id AS "customerId"
       FROM ar_open_items
      WHERE company_id = $1 AND balance > $3 AND status != 'paid'
        AND (CURRENT_DATE - due_date) >= $2`,
    [companyId, days, minAmount],
  );
  return r.rows.map((row: any) => ({
    dedupKey: dedup(rule.id, "ar", row.id, today()),
    title: `Factura vencida hace ${daysSince(row.due)} días: RD$ ${row.balance.toLocaleString("es-DO")}`,
    payload: { arItemId: row.id, dueDate: row.due, balance: row.balance, customerId: row.customerId, daysOverdue: daysSince(row.due) },
    severity: daysSince(row.due) >= 90 ? "critical" : "warning",
  }));
}

async function evalApOverdue(pool: Pool, rule: AlertRule, ctx: { companyId?: number }): Promise<AlertMatch[]> {
  const days = Number(rule.parameters.days ?? 15);
  const minAmount = Number(rule.parameters.minAmount ?? 0);
  const companyId = ctx.companyId ?? rule.companyId;
  if (!companyId) return [];
  const r = await pool.query(
    `SELECT id, due_date::text AS due, balance::float AS balance, supplier_id AS "supplierId"
       FROM ap_open_items
      WHERE company_id = $1 AND balance > $3 AND status != 'paid'
        AND (CURRENT_DATE - due_date) >= $2`,
    [companyId, days, minAmount],
  );
  return r.rows.map((row: any) => ({
    dedupKey: dedup(rule.id, "ap", row.id, today()),
    title: `Cuenta por pagar vencida hace ${daysSince(row.due)} días: RD$ ${row.balance.toLocaleString("es-DO")}`,
    payload: { apItemId: row.id, dueDate: row.due, balance: row.balance, supplierId: row.supplierId, daysOverdue: daysSince(row.due) },
    severity: daysSince(row.due) >= 30 ? "critical" : "warning",
  }));
}

async function evalApprovalsStale(pool: Pool, rule: AlertRule): Promise<AlertMatch[]> {
  const hours = Number(rule.parameters.hoursThreshold ?? 24);
  try {
    const r = await pool.query(
      `SELECT id, document_type AS "documentType", document_id AS "documentId",
              amount::float AS amount,
              created_at::text AS "createdAt"
         FROM approval_requests
        WHERE status = 'pending'
          AND created_at < NOW() - ($2 || ' hours')::interval`,
      [rule.id, String(hours)],
    );
    return r.rows.map((row: any) => ({
      dedupKey: dedup(rule.id, "approval", row.id),
      title: `Aprobación pendiente hace ${hoursSince(row.createdAt)}h · ${row.documentType} #${row.documentId}`,
      payload: { approvalId: row.id, ...row, hoursOld: hoursSince(row.createdAt) },
    }));
  } catch {
    return [];
  }
}

async function evalMoShort(pool: Pool, rule: AlertRule): Promise<AlertMatch[]> {
  try {
    const r = await pool.query(
      `SELECT mo.id, mo.mo_number AS "moNumber",
              count(poc.id) FILTER (WHERE poc.status = 'short')::int AS "shortCount"
         FROM production_orders mo
         JOIN production_order_components poc ON poc.mo_id = mo.id
        WHERE mo.store_id = $1 AND mo.status IN ('released','in_progress')
        GROUP BY mo.id, mo.mo_number
       HAVING count(poc.id) FILTER (WHERE poc.status = 'short') > 0`,
      [rule.storeId],
    );
    return r.rows.map((row: any) => ({
      dedupKey: dedup(rule.id, "mo_short", row.id, today()),
      title: `MO ${row.moNumber}: ${row.shortCount} componentes con stock insuficiente`,
      payload: { moId: row.id, moNumber: row.moNumber, shortCount: row.shortCount },
    }));
  } catch {
    return [];
  }
}

async function evalLowStock(pool: Pool, rule: AlertRule): Promise<AlertMatch[]> {
  const threshold = Number(rule.parameters.threshold ?? 0);
  const r = await pool.query(
    `SELECT id, name, sku, stock_quantity::float AS stock, min_quantity::float AS min_qty
       FROM products
      WHERE store_id = $1 AND status = 'active'
        AND stock_quantity IS NOT NULL AND min_quantity IS NOT NULL
        AND stock_quantity <= min_quantity + $2`,
    [rule.storeId, threshold],
  );
  return r.rows.map((row: any) => ({
    dedupKey: dedup(rule.id, "low_stock", row.id, today()),
    title: `Stock bajo: ${row.name} (${row.stock} ≤ ${row.min_qty})`,
    payload: { productId: row.id, name: row.name, sku: row.sku, stock: row.stock, minQty: row.min_qty },
    severity: row.stock <= 0 ? "critical" : "warning",
  }));
}

async function evalFxStale(pool: Pool, rule: AlertRule, ctx: { companyId?: number }): Promise<AlertMatch[]> {
  const companyId = ctx.companyId ?? rule.companyId;
  if (!companyId) return [];
  const from = String(rule.parameters.fromCurrency ?? "USD");
  const to = String(rule.parameters.toCurrency ?? "DOP");
  const maxDays = Number(rule.parameters.maxDays ?? 7);
  const r = await pool.query(
    `SELECT max(rate_date)::text AS "lastDate"
       FROM fx_daily_rates
      WHERE company_id = $1 AND from_currency = $2 AND to_currency = $3
        AND rate_type IN ('spot','closing')`,
    [companyId, from, to],
  );
  const lastDate = r.rows[0]?.lastDate;
  if (!lastDate) {
    return [{
      dedupKey: dedup(rule.id, "fx_stale", today()),
      title: `No hay tasa de cambio registrada para ${from}→${to}`,
      payload: { fromCurrency: from, toCurrency: to },
      severity: "critical",
    }];
  }
  const days = daysSince(lastDate);
  if (days <= maxDays) return [];
  return [{
    dedupKey: dedup(rule.id, "fx_stale", today()),
    title: `Tasa ${from}→${to} está desactualizada (última: ${lastDate}, hace ${days} días)`,
    payload: { fromCurrency: from, toCurrency: to, lastDate, daysStale: days },
  }];
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr.length === 10 ? dateStr + "T00:00:00Z" : dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

function hoursSince(dateStr: string): number {
  const d = new Date(dateStr);
  return Math.floor((Date.now() - d.getTime()) / 3_600_000);
}
