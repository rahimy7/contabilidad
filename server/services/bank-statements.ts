import crypto from "node:crypto";
import type { Pool, PoolClient } from "@neondatabase/serverless";

/**
 * Importación de extractos bancarios y matching automático contra `bank_transactions`.
 *
 * Un extracto es un archivo CSV/OFX del banco (BHD, Popular, Reservas, etc.) que
 * lista los movimientos según los ve el banco. Nuestros registros son las
 * `bank_transactions` — lo que la contabilidad cree que pasó. La conciliación
 * cierra la brecha: por cada línea del extracto marcamos qué transacción
 * nuestra la explica, y a la inversa.
 *
 * El matching es determinístico y tolerante:
 *   1. Match exact  → misma fecha, mismo monto, misma dirección, misma referencia
 *   2. Match high   → misma fecha, mismo monto, misma dirección
 *   3. Match medium → ±3 días, mismo monto, misma dirección
 *   4. Sin match    → la línea queda pendiente para revisión manual
 *
 * Nunca hacemos match "medium" si hay más de un candidato — mejor pedir revisión
 * humana que emparejar mal.
 */

export interface RawLine {
  txnDate: string;
  valueDate?: string;
  amount: number;
  direction: "in" | "out";
  description?: string;
  bankReference?: string;
  raw?: Record<string, unknown>;
}

export interface ImportInput {
  companyId: number;
  bankAccountId: number;
  periodStart: string;
  periodEnd: string;
  openingBalance?: number;
  closingBalance?: number;
  sourceType?: "csv" | "ofx" | "pdf" | "manual";
  bankCode?: string;
  fileName?: string;
  importedBy: number;
  lines: RawLine[];
}

export interface ImportResult {
  importId: number;
  totalLines: number;
  importedLines: number;
  duplicateLines: number;
}

function dedupHash(l: RawLine): string {
  const key = `${l.txnDate}|${l.amount}|${l.direction}|${(l.description ?? "").trim().toLowerCase()}`;
  return crypto.createHash("sha256").update(key).digest("hex");
}

export async function importBankStatement(
  pool: Pool,
  input: ImportInput,
): Promise<ImportResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const header = await client.query(
      `INSERT INTO bank_statement_imports
         (company_id, bank_account_id, period_start, period_end,
          opening_balance, closing_balance, source_type, bank_code, file_name,
          total_lines, imported_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [
        input.companyId, input.bankAccountId,
        input.periodStart, input.periodEnd,
        input.openingBalance ?? null, input.closingBalance ?? null,
        input.sourceType ?? "csv", input.bankCode ?? null, input.fileName ?? null,
        input.lines.length, input.importedBy,
      ],
    );
    const importId = Number(header.rows[0].id);

    let imported = 0;
    let duplicates = 0;
    for (const l of input.lines) {
      const h = dedupHash(l);
      const r = await client.query(
        `INSERT INTO bank_statement_lines
           (company_id, bank_account_id, statement_import_id, txn_date, value_date,
            amount, direction, description, bank_reference, raw_line, dedup_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (bank_account_id, dedup_hash) DO NOTHING
         RETURNING id`,
        [
          input.companyId, input.bankAccountId, importId,
          l.txnDate, l.valueDate ?? null,
          String(l.amount), l.direction,
          l.description ?? null, l.bankReference ?? null,
          l.raw ? JSON.stringify(l.raw) : null, h,
        ],
      );
      if (r.rowCount) imported++;
      else duplicates++;
    }

    await client.query(
      `UPDATE bank_statement_imports SET imported_lines = $2, duplicate_lines = $3 WHERE id = $1`,
      [importId, imported, duplicates],
    );

    await client.query("COMMIT");
    return { importId, totalLines: input.lines.length, importedLines: imported, duplicateLines: duplicates };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ────────────────────────────────────────────────────────────────────────────

export interface AutoMatchInput {
  companyId: number;
  bankAccountId: number;
  /** Si se pasa, sólo empareja líneas de este import. */
  importId?: number;
  /** Tolerancia de días para match medium. */
  dateToleranceDays?: number;
  matchedBy: number;
}

export interface AutoMatchResult {
  processed: number;
  matched: number;
  matchedExact: number;
  matchedHigh: number;
  matchedMedium: number;
  ambiguous: number;
  unmatched: number;
}

export async function autoMatchStatement(
  pool: Pool,
  input: AutoMatchInput,
): Promise<AutoMatchResult> {
  const tolerance = input.dateToleranceDays ?? 3;
  const client = await pool.connect();
  const stats: AutoMatchResult = {
    processed: 0, matched: 0, matchedExact: 0, matchedHigh: 0, matchedMedium: 0,
    ambiguous: 0, unmatched: 0,
  };

  try {
    await client.query("BEGIN");

    const linesQ = await client.query(
      `SELECT id, txn_date::text, amount::text, direction, bank_reference
         FROM bank_statement_lines
        WHERE company_id = $1 AND bank_account_id = $2 AND status = 'pending'
          AND ($3::bigint IS NULL OR statement_import_id = $3)
        ORDER BY txn_date, id`,
      [input.companyId, input.bankAccountId, input.importId ?? null],
    );

    for (const l of linesQ.rows) {
      stats.processed++;

      const matched = await tryMatchOne(client, {
        companyId: input.companyId,
        bankAccountId: input.bankAccountId,
        lineId: Number(l.id),
        txnDate: l.txn_date,
        amount: l.amount,
        direction: l.direction,
        bankReference: l.bank_reference,
        toleranceDays: tolerance,
        matchedBy: input.matchedBy,
      });

      switch (matched.kind) {
        case "exact": stats.matched++; stats.matchedExact++; break;
        case "high": stats.matched++; stats.matchedHigh++; break;
        case "medium": stats.matched++; stats.matchedMedium++; break;
        case "ambiguous": stats.ambiguous++; break;
        case "none": stats.unmatched++; break;
      }
    }

    await client.query("COMMIT");
    return stats;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function tryMatchOne(
  client: PoolClient,
  args: {
    companyId: number;
    bankAccountId: number;
    lineId: number;
    txnDate: string;
    amount: string;
    direction: string;
    bankReference: string | null;
    toleranceDays: number;
    matchedBy: number;
  },
): Promise<{ kind: "exact" | "high" | "medium" | "ambiguous" | "none" }> {
  if (args.bankReference) {
    const r = await client.query(
      `SELECT id FROM bank_transactions
        WHERE company_id=$1 AND bank_account_id=$2
          AND status='posted' AND reconciliation_id IS NULL
          AND direction=$3 AND amount=$4 AND txn_date=$5::date
          AND reference = $6
        LIMIT 2`,
      [args.companyId, args.bankAccountId, args.direction, args.amount, args.txnDate, args.bankReference],
    );
    if (r.rowCount === 1) {
      await mark(client, args.lineId, Number(r.rows[0].id), "exact", args.matchedBy);
      return { kind: "exact" };
    }
    if (r.rowCount && r.rowCount > 1) return { kind: "ambiguous" };
  }

  const rHigh = await client.query(
    `SELECT id FROM bank_transactions
      WHERE company_id=$1 AND bank_account_id=$2
        AND status='posted' AND reconciliation_id IS NULL
        AND direction=$3 AND amount=$4 AND txn_date=$5::date
      LIMIT 2`,
    [args.companyId, args.bankAccountId, args.direction, args.amount, args.txnDate],
  );
  if (rHigh.rowCount === 1) {
    await mark(client, args.lineId, Number(rHigh.rows[0].id), "high", args.matchedBy);
    return { kind: "high" };
  }
  if (rHigh.rowCount && rHigh.rowCount > 1) return { kind: "ambiguous" };

  const rMed = await client.query(
    `SELECT id FROM bank_transactions
      WHERE company_id=$1 AND bank_account_id=$2
        AND status='posted' AND reconciliation_id IS NULL
        AND direction=$3 AND amount=$4
        AND txn_date BETWEEN ($5::date - $6::int) AND ($5::date + $6::int)
      LIMIT 2`,
    [args.companyId, args.bankAccountId, args.direction, args.amount, args.txnDate, args.toleranceDays],
  );
  if (rMed.rowCount === 1) {
    await mark(client, args.lineId, Number(rMed.rows[0].id), "medium", args.matchedBy);
    return { kind: "medium" };
  }
  if (rMed.rowCount && rMed.rowCount > 1) return { kind: "ambiguous" };

  return { kind: "none" };
}

async function mark(
  client: PoolClient,
  lineId: number,
  txnId: number,
  confidence: "exact" | "high" | "medium" | "manual",
  matchedBy: number,
): Promise<void> {
  await client.query(
    `UPDATE bank_statement_lines
        SET matched_transaction_id = $2, match_confidence = $3,
            status = 'matched', matched_at = now(), matched_by = $4
      WHERE id = $1`,
    [lineId, txnId, confidence, matchedBy],
  );
}

// ────────────────────────────────────────────────────────────────────────────

/** Match manual línea → transacción. */
export async function matchLine(
  pool: Pool,
  lineId: number,
  txnId: number,
  matchedBy: number,
): Promise<void> {
  await pool.query(
    `UPDATE bank_statement_lines
        SET matched_transaction_id = $2, match_confidence = 'manual',
            status = 'matched', matched_at = now(), matched_by = $3
      WHERE id = $1 AND status = 'pending'`,
    [lineId, txnId, matchedBy],
  );
}

/** Deshacer un match (vuelve la línea a pending). */
export async function unmatchLine(pool: Pool, lineId: number): Promise<void> {
  await pool.query(
    `UPDATE bank_statement_lines
        SET matched_transaction_id = NULL, match_confidence = NULL,
            status = 'pending', matched_at = NULL, matched_by = NULL
      WHERE id = $1`,
    [lineId],
  );
}

/** Marcar una línea como ignorada (transferencias internas, ajustes menores). */
export async function ignoreLine(pool: Pool, lineId: number): Promise<void> {
  await pool.query(
    `UPDATE bank_statement_lines SET status = 'ignored' WHERE id = $1`,
    [lineId],
  );
}

/** Lista líneas de un import con estado. */
export async function listStatementLines(
  pool: Pool,
  bankAccountId: number,
  filters: { importId?: number; status?: string; limit?: number } = {},
): Promise<Array<Record<string, unknown>>> {
  const r = await pool.query(
    `SELECT bsl.id, bsl.txn_date::text AS "txnDate", bsl.value_date::text AS "valueDate",
            bsl.amount::text AS amount, bsl.direction,
            bsl.description, bsl.bank_reference AS "bankReference",
            bsl.status, bsl.match_confidence AS "matchConfidence",
            bsl.matched_transaction_id AS "matchedTransactionId",
            bt.reference AS "txnReference", bt.memo AS "txnMemo"
       FROM bank_statement_lines bsl
       LEFT JOIN bank_transactions bt ON bt.id = bsl.matched_transaction_id
      WHERE bsl.bank_account_id = $1
        AND ($2::bigint IS NULL OR bsl.statement_import_id = $2)
        AND ($3::text IS NULL OR bsl.status = $3)
      ORDER BY bsl.txn_date DESC, bsl.id DESC
      LIMIT $4`,
    [bankAccountId, filters.importId ?? null, filters.status ?? null, filters.limit ?? 500],
  );
  return r.rows;
}

// ────────────────────────────────────────────────────────────────────────────

/** Parser CSV genérico DR — columnas mínimas: fecha, débito, crédito, descripción. */
export interface CsvParserOptions {
  dateColumn?: string;
  debitColumn?: string;
  creditColumn?: string;
  amountColumn?: string;
  descriptionColumn?: string;
  referenceColumn?: string;
  /** DR usa 'DD/MM/YYYY' predominantemente. */
  dateFormat?: "DD/MM/YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY";
}

export function parseCsvLines(
  rows: Record<string, string>[],
  opts: CsvParserOptions = {},
): RawLine[] {
  const dateCol = opts.dateColumn ?? "fecha";
  const descCol = opts.descriptionColumn ?? "descripcion";
  const refCol = opts.referenceColumn ?? "referencia";
  const debitCol = opts.debitColumn ?? "debito";
  const creditCol = opts.creditColumn ?? "credito";
  const amountCol = opts.amountColumn;
  const dateFmt = opts.dateFormat ?? "DD/MM/YYYY";

  const out: RawLine[] = [];
  for (const row of rows) {
    const dateRaw = pickCol(row, dateCol);
    if (!dateRaw) continue;
    const txnDate = normalizeDate(dateRaw, dateFmt);
    if (!txnDate) continue;

    let amount: number;
    let direction: "in" | "out";
    if (amountCol) {
      const v = parseAmount(pickCol(row, amountCol));
      if (v === 0) continue;
      amount = Math.abs(v);
      direction = v < 0 ? "out" : "in";
    } else {
      const debit = parseAmount(pickCol(row, debitCol));
      const credit = parseAmount(pickCol(row, creditCol));
      if (debit > 0) { amount = debit; direction = "out"; }
      else if (credit > 0) { amount = credit; direction = "in"; }
      else continue;
    }

    out.push({
      txnDate,
      amount,
      direction,
      description: pickCol(row, descCol),
      bankReference: pickCol(row, refCol),
      raw: row,
    });
  }
  return out;
}

function pickCol(row: Record<string, string>, key: string): string {
  const target = key.toLowerCase();
  for (const k of Object.keys(row)) {
    if (k.toLowerCase().trim() === target) return (row[k] ?? "").trim();
  }
  return "";
}

function parseAmount(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/[^\d,.\-]/g, "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(s: string, fmt: string): string | null {
  const parts = s.trim().split(/[/\-.]/);
  if (parts.length !== 3) return null;
  let year: number, month: number, day: number;
  if (fmt === "YYYY-MM-DD") { [year, month, day] = parts.map(Number); }
  else if (fmt === "MM/DD/YYYY") { [month, day, year] = parts.map(Number); }
  else { [day, month, year] = parts.map(Number); }
  if (!year || !month || !day) return null;
  if (year < 100) year += 2000;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}
