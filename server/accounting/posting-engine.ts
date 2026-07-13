import { AccountResolver } from "./account-resolver";
import { AccountingEvent, PostResult, PostingError, SqlClient } from "./types";
import { add as addDecimal } from "./decimal";

/** One line of a manual journal entry: an account named directly, and an amount. */
export interface ManualEntryLine {
  accountId?: number;
  /** Alternative to accountId: the chart-of-accounts code, e.g. '1.1.01.001'. */
  accountCode?: string;
  debit?: string;
  credit?: string;
  costCenterId?: number;
  profitCenterId?: number;
  projectId?: number;
  memo?: string;
}

export interface ManualEntryInput {
  companyId: number;
  entryDate: string;
  memo?: string;
  currency?: string;
  fxRate?: string;
  /** Optional stable id; one is generated when absent. */
  reference?: string;
  lines: ManualEntryLine[];
  postedBy?: number;
}

/**
 * Posts subledger events to the general ledger.
 *
 * Two properties this class exists to guarantee:
 *
 *   Exactly once. `(company_id, source_type, source_id, source_event)` is a
 *   unique index, and `post()` inserts with ON CONFLICT DO NOTHING. A redelivered
 *   outbox message, a retried request or a double-clicked button posts nothing
 *   the second time and says so via `created: false`.
 *
 *   Balanced. Each measure becomes a debit/credit pair of equal magnitude, so an
 *   entry balances by construction. The deferred constraint trigger in migration
 *   0001 checks it anyway, because this class is not the only thing that can
 *   write to `journal_entry_lines`.
 *
 * Every caller must already be inside a transaction — the same one that persists
 * the business document. That is what makes the NCF allocation, the document row
 * and the journal entry commit or vanish together.
 */
export class PostingEngine {
  private readonly resolver: AccountResolver;

  constructor(private readonly client: SqlClient) {
    this.resolver = new AccountResolver(client);
  }

  async post(event: AccountingEvent, sourceEvent: string): Promise<PostResult> {
    if (event.measures.length === 0) {
      throw new PostingError(`event ${event.eventType} carries no measures`);
    }

    const fxRate = event.fxRate ?? "1";
    const fiscalYear = Number(event.entryDate.slice(0, 4));

    const period = await this.findPeriod(event.companyId, event.entryDate);

    // Claim the idempotency key before doing any other work. If another
    // transaction already posted this event, we stop here and touch nothing —
    // notably, we do not burn an entry number.
    const claimed = await this.client.query(
      `INSERT INTO journal_entries
         (company_id, period_id, entry_date, memo, currency, status,
          source_type, source_id, source_event, posted_by, posted_at)
       VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, now())
       ON CONFLICT (company_id, source_type, source_id, source_event) DO NOTHING
       RETURNING id`,
      [
        event.companyId,
        period.id,
        event.entryDate,
        event.memo ?? null,
        event.currency,
        event.sourceType,
        event.sourceId,
        sourceEvent,
        event.postedBy ?? null,
      ],
    );

    if (claimed.rows.length === 0) {
      const existing = await this.client.query(
        `SELECT id, entry_no FROM journal_entries
          WHERE company_id=$1 AND source_type=$2 AND source_id=$3 AND source_event=$4`,
        [event.companyId, event.sourceType, event.sourceId, sourceEvent],
      );
      return {
        entryId: Number(existing.rows[0].id),
        entryNo: existing.rows[0].entry_no,
        created: false,
      };
    }

    const entryId = Number(claimed.rows[0].id);
    const dims = event.dimensions ?? {};
    let lineNo = 1;

    for (const measure of event.measures) {
      // A zero measure would add two lines that say nothing and clutter the
      // ledger. Skipping them keeps the entry readable.
      if (isZero(measure.amount)) continue;

      const { debitAccountId, creditAccountId } = await this.resolver.resolve(
        event.companyId,
        event.eventType,
        measure.role,
        event.context ?? {},
      );

      // A negative measure is a reversal of that measure's normal direction —
      // a discount against revenue, a returned unit against COGS. Swap the
      // accounts rather than write a negative amount: the CHECK constraints
      // reject negatives, and a ledger of negative debits is unreadable.
      const amount = abs(measure.amount);
      const [debitAcct, creditAcct] = isNegative(measure.amount)
        ? [creditAccountId, debitAccountId]
        : [debitAccountId, creditAccountId];

      // debit_func / credit_func are computed by Postgres in numeric. No money
      // passes through a JS float on the way to a numeric(18,4) column.
      await this.client.query(
        `INSERT INTO journal_entry_lines
           (entry_id, company_id, line_no, account_id, debit, credit, currency, fx_rate,
            debit_func, credit_func, cost_center_id, profit_center_id, project_id, dimensions, memo)
         VALUES
           ($1,$2,$3,$4, $6::numeric, 0,          $5, $7::numeric,
            round($6::numeric * $7::numeric, 4), 0, $8,$9,$10,$11,$12),
           ($1,$2,$13,$14, 0,          $6::numeric, $5, $7::numeric,
            0, round($6::numeric * $7::numeric, 4), $8,$9,$10,$11,$12)`,
        [
          entryId,
          event.companyId,
          lineNo,
          debitAcct,
          event.currency,
          amount,
          fxRate,
          dims.costCenterId ?? null,
          dims.profitCenterId ?? null,
          dims.projectId ?? null,
          dims.custom ? JSON.stringify(dims.custom) : null,
          measure.memo ?? measure.role,
          lineNo + 1,
          creditAcct,
        ],
      );
      lineNo += 2;
    }

    if (lineNo === 1) {
      throw new PostingError(
        `event ${event.eventType}/${event.sourceId} produced no lines: every measure was zero`,
      );
    }

    // Numbering last, and only for entries that will actually post. The deferred
    // balance trigger fires on this UPDATE and again at COMMIT.
    const numbered = await this.client.query(
      `UPDATE journal_entries
          SET status = 'posted', entry_no = allocate_entry_no($1, $2::smallint)
        WHERE id = $3
        RETURNING entry_no`,
      [event.companyId, fiscalYear, entryId],
    );

    return { entryId, entryNo: numbered.rows[0].entry_no, created: true };
  }

  /**
   * Reverses a posted entry by writing its mirror image. The original is never
   * touched: an audit trail that can be edited is not an audit trail. A
   * correction is a reversal followed by a fresh posting.
   */
  async reverse(entryId: number, reason: string, postedBy?: number): Promise<PostResult> {
    const { rows } = await this.client.query(
      // fiscal_year comes from Postgres, not from parsing `entry_date` in JS: the
      // pg driver hands back a Date for `date` columns, and slicing its string
      // form yields the weekday.
      `SELECT id, company_id, period_id, entry_date, currency, status,
              source_type, source_id, source_event, reversed_by_entry_id,
              extract(year from entry_date)::int AS fiscal_year
         FROM journal_entries WHERE id = $1`,
      [entryId],
    );
    if (rows.length === 0) throw new PostingError(`journal entry ${entryId} not found`);

    const orig = rows[0];
    if (orig.status !== "posted") {
      throw new PostingError(`journal entry ${entryId} is ${orig.status}, only posted entries reverse`);
    }
    if (orig.reversed_by_entry_id) {
      throw new PostingError(`journal entry ${entryId} was already reversed`);
    }

    const fiscalYear = Number(orig.fiscal_year);
    const reversalEvent = `${orig.source_event}:reversal`;

    const created = await this.client.query(
      `INSERT INTO journal_entries
         (company_id, period_id, entry_date, memo, currency, status,
          source_type, source_id, source_event, reverses_entry_id, posted_by, posted_at)
       VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9,$10, now())
       ON CONFLICT (company_id, source_type, source_id, source_event) DO NOTHING
       RETURNING id`,
      [
        orig.company_id,
        orig.period_id,
        orig.entry_date,
        `Reversión de asiento ${entryId}: ${reason}`,
        orig.currency,
        orig.source_type,
        orig.source_id,
        reversalEvent,
        entryId,
        postedBy ?? null,
      ],
    );
    if (created.rows.length === 0) {
      throw new PostingError(`journal entry ${entryId} already has a reversal`);
    }
    const reversalId = Number(created.rows[0].id);

    // Swap debit and credit, keeping the same accounts, amounts and dimensions.
    await this.client.query(
      `INSERT INTO journal_entry_lines
         (entry_id, company_id, line_no, account_id, debit, credit, currency, fx_rate,
          debit_func, credit_func, cost_center_id, profit_center_id, project_id, dimensions, memo)
       SELECT $1, company_id, line_no, account_id, credit, debit, currency, fx_rate,
              credit_func, debit_func, cost_center_id, profit_center_id, project_id, dimensions,
              'reversal: ' || coalesce(memo, '')
         FROM journal_entry_lines WHERE entry_id = $2`,
      [reversalId, entryId],
    );

    const numbered = await this.client.query(
      `UPDATE journal_entries
          SET status='posted', entry_no = allocate_entry_no($1, $2::smallint)
        WHERE id = $3 RETURNING entry_no`,
      [orig.company_id, fiscalYear, reversalId],
    );

    // The original stays `posted`. A reversed entry has not been erased — its
    // lines still stand, and another entry neutralises them. Flipping it to
    // 'reversed' would drop it out of every balance query that filters on
    // status='posted', which is every balance query, and the reversal's lines
    // would then be counted alone. The link, not the status, records the fact.
    await this.client.query(`UPDATE journal_entries SET reversed_by_entry_id=$1 WHERE id=$2`, [
      reversalId,
      entryId,
    ]);

    return { entryId: reversalId, entryNo: numbered.rows[0].entry_no, created: true };
  }

  /**
   * Posts a manual entry whose lines name accounts directly, rather than
   * describing measures for the rules to resolve. This is the accountant typing
   * an adjusting entry, not a subledger event.
   *
   * The lines must already balance in functional currency; the deferred trigger
   * is the real check, but we fail fast here with a readable message. Manual
   * entries carry a generated `source_id`, so each is distinct and none collides
   * with a subledger event on the idempotency index.
   */
  async postManual(input: ManualEntryInput): Promise<PostResult> {
    if (input.lines.length < 2) {
      throw new PostingError("a manual entry needs at least two lines");
    }

    let debit = "0";
    let credit = "0";
    for (const l of input.lines) {
      debit = addDecimal(debit, l.debit ?? "0");
      credit = addDecimal(credit, l.credit ?? "0");
    }
    if (debit !== credit) {
      throw new PostingError(`manual entry does not balance: debit ${debit}, credit ${credit}`);
    }
    if (debit === "0") {
      throw new PostingError("a manual entry cannot be all zeros");
    }

    const period = await this.findPeriod(input.companyId, input.entryDate);
    const fiscalYear = Number(input.entryDate.slice(0, 4));
    const sourceId = input.reference ?? `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const entry = await this.client.query(
      `INSERT INTO journal_entries
         (company_id, period_id, entry_date, memo, currency, status,
          source_type, source_id, source_event, posted_by, posted_at)
       VALUES ($1,$2,$3,$4,$5,'draft','manual',$6,'manual',$7, now())
       RETURNING id`,
      [
        input.companyId,
        period.id,
        input.entryDate,
        input.memo ?? null,
        input.currency ?? "DOP",
        sourceId,
        input.postedBy ?? null,
      ],
    );
    const entryId = Number(entry.rows[0].id);
    const fxRate = input.fxRate ?? "1";

    let lineNo = 1;
    for (const l of input.lines) {
      const accountId = await this.resolveAccount(input.companyId, l);
      await this.client.query(
        `INSERT INTO journal_entry_lines
           (entry_id, company_id, line_no, account_id, debit, credit, currency, fx_rate,
            debit_func, credit_func, cost_center_id, profit_center_id, project_id, memo)
         VALUES ($1,$2,$3,$4, $5::numeric, $6::numeric, $7, $8::numeric,
                 round($5::numeric * $8::numeric, 4), round($6::numeric * $8::numeric, 4),
                 $9,$10,$11,$12)`,
        [
          entryId,
          input.companyId,
          lineNo++,
          accountId,
          l.debit ?? "0",
          l.credit ?? "0",
          input.currency ?? "DOP",
          fxRate,
          l.costCenterId ?? null,
          l.profitCenterId ?? null,
          l.projectId ?? null,
          l.memo ?? null,
        ],
      );
    }

    const numbered = await this.client.query(
      `UPDATE journal_entries SET status='posted', entry_no = allocate_entry_no($1, $2::smallint)
        WHERE id=$3 RETURNING entry_no`,
      [input.companyId, fiscalYear, entryId],
    );

    return { entryId, entryNo: numbered.rows[0].entry_no, created: true };
  }

  private async resolveAccount(companyId: number, line: ManualEntryLine): Promise<number> {
    if (line.accountId) return line.accountId;
    if (!line.accountCode) throw new PostingError("each manual line needs accountId or accountCode");
    const { rows } = await this.client.query(
      `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND code=$2`,
      [companyId, line.accountCode],
    );
    if (rows.length === 0) throw new PostingError(`account ${line.accountCode} does not exist`);
    return Number(rows[0].id);
  }

  private async findPeriod(companyId: number, entryDate: string) {
    const { rows } = await this.client.query(
      `SELECT id, status FROM accounting_periods
        WHERE company_id = $1 AND $2::date BETWEEN start_date AND end_date
          AND period_no <= 12
        ORDER BY period_no LIMIT 1`,
      [companyId, entryDate],
    );
    if (rows.length === 0) {
      throw new PostingError(`no accounting period covers ${entryDate}`);
    }
    if (!["open", "reopened"].includes(rows[0].status)) {
      throw new PostingError(`period covering ${entryDate} is ${rows[0].status}`);
    }
    return { id: Number(rows[0].id) };
  }
}

// Decimal-string helpers. Money never becomes a float, so these are textual.
const isZero = (s: string) => /^-?0*(\.0*)?$/.test(s.trim());
const isNegative = (s: string) => s.trim().startsWith("-");
const abs = (s: string) => (isNegative(s) ? s.trim().slice(1) : s.trim());
