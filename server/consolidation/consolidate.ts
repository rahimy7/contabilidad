import { SqlClient } from "../accounting/types";
import { Decimal, add, sub, neg, isZero, isNegative } from "../accounting/decimal";

/**
 * Group consolidation.
 *
 * A group's consolidated trial balance is the sum of its members' ledgers,
 * account by account. Because every company is seeded from the same Dominican
 * chart template, the member accounts share codes, so consolidation aggregates
 * `journal_entry_lines` by `chart_of_accounts.code` across the member companies —
 * one query, one connection, which is the whole reason the tenancy model is a
 * discriminator column rather than a database per tenant.
 *
 * Each member is weighted by its `ownership_pct`, so a wholly-owned subsidiary
 * (1.0000) folds in at full value and a partly-owned one at its share. That is
 * exact for wholly-owned groups — the common SMB case — and a proportional
 * consolidation otherwise. Equity-method members are excluded from the line
 * aggregation. Intercompany eliminations and translating a foreign-currency
 * subsidiary to the group's presentation currency are deliberate follow-ups; a
 * single-currency group with no intercompany trading consolidates correctly today.
 *
 * Reads span companies, so this runs as the owning role via `withoutTenant`. The
 * route authorises the caller against the group first.
 */
export class ConsolidationError extends Error {}

/** How a foreign-currency member translates into the group's presentation currency. */
export interface MemberRate {
  companyId: number;
  currency?: string;
  /** Balance-sheet accounts convert at this. */
  closingRate: Decimal;
  /** Income-statement accounts convert at this — the period's average. */
  averageRate: Decimal;
}

export interface ConsolidationRunInput {
  groupId: number;
  fiscalYear: number;
  /** YTD through this month (1..12); omit for the full year. */
  periodNo?: number;
  /** Members not listed translate at 1 — they already keep the group's currency. */
  rates?: MemberRate[];
  createdBy?: number;
}

/** The group-level equity line that absorbs the translation gap. */
const CTA_CODE = "3.1.02.003";
const CTA_NAME = "Ajuste acumulado por conversión";

export interface ConsolidatedLine {
  account_code: string;
  account_name: string;
  account_type: string;
  debit: string;
  credit: string;
}

export class Consolidation {
  constructor(private readonly client: SqlClient) {}

  async run(input: ConsolidationRunInput): Promise<{ runId: number; memberCount: number }> {
    const members = await this.client.query(
      `SELECT company_id, ownership_pct::text AS pct, consol_method
         FROM company_consolidation_map WHERE group_id=$1`,
      [input.groupId],
    );
    if (members.rows.length === 0) throw new ConsolidationError("el grupo no tiene empresas mapeadas");

    // Equity-method holdings are not consolidated line by line.
    const included = members.rows.filter((m) => m.consol_method !== "equity");
    if (included.length === 0) throw new ConsolidationError("ninguna empresa se consolida por integración");

    const rateOf = new Map<number, MemberRate>();
    for (const r of input.rates ?? []) rateOf.set(r.companyId, r);

    const companyIds = included.map((m) => Number(m.company_id));
    const pcts = included.map((m) => m.pct as string);
    // A member with no rate keeps the group's currency and translates at 1.
    const closingRates = companyIds.map((id) => rateOf.get(id)?.closingRate ?? "1");
    const averageRates = companyIds.map((id) => rateOf.get(id)?.averageRate ?? "1");

    const g = await this.client.query(`SELECT base_currency FROM groups WHERE id=$1`, [input.groupId]);
    const baseCurrency = g.rows[0]?.base_currency ?? "DOP";

    const run = await this.client.query(
      `INSERT INTO consolidation_runs (group_id, fiscal_year, period_no, base_currency, member_count, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [input.groupId, input.fiscalYear, input.periodNo ?? null, baseCurrency, included.length, input.createdBy ?? null],
    );
    const runId = Number(run.rows[0].id);

    // Freeze the rates: a consolidated statement is only reproducible if the
    // rates that produced it are stored with it.
    for (const id of companyIds) {
      const r = rateOf.get(id);
      await this.client.query(
        `INSERT INTO consolidation_rates (run_id, company_id, currency, closing_rate, average_rate)
         VALUES ($1,$2,$3,$4,$5)`,
        [runId, id, r?.currency ?? baseCurrency, r?.closingRate ?? "1", r?.averageRate ?? "1"],
      );
    }

    // Aggregate every member's posted lines by account code, weighted by ownership
    // and translated into the group's currency. Entry dates are `date` columns, so
    // extract() needs no timezone handling.
    await this.client.query(
      // Each account nets to a single side, as a trial balance does: gross debit
      // and gross credit summed separately would double-count an account that both
      // received and paid (a cash account nets to its true balance, not the sum of
      // every movement through it).
      //
      // Balance-sheet accounts convert at the closing rate and income-statement
      // accounts at the average — the standard treatment, and the reason a
      // translated member does not balance on its own.
      `INSERT INTO consolidation_lines (run_id, group_id, account_code, account_name, account_type, debit, credit)
       SELECT $1, $2, a.code, max(a.name), max(a.account_type::text),
              GREATEST(round(sum((l.debit_func - l.credit_func) * w.pct
                * CASE WHEN a.account_type IN ('income','expense') THEN w.avg_rate ELSE w.close_rate END), 4), 0),
              GREATEST(round(sum((l.credit_func - l.debit_func) * w.pct
                * CASE WHEN a.account_type IN ('income','expense') THEN w.avg_rate ELSE w.close_rate END), 4), 0)
         FROM journal_entry_lines l
         JOIN journal_entries je ON je.id = l.entry_id AND je.status = 'posted'
         JOIN chart_of_accounts a ON a.id = l.account_id
         JOIN unnest($3::int[], $4::numeric[], $5::numeric[], $6::numeric[])
              AS w(company_id, pct, close_rate, avg_rate) ON w.company_id = l.company_id
        WHERE extract(year from je.entry_date) = $7
          AND ($8::int IS NULL OR extract(month from je.entry_date) <= $8)
        GROUP BY a.code
       HAVING round(sum((l.debit_func - l.credit_func) * w.pct
                * CASE WHEN a.account_type IN ('income','expense') THEN w.avg_rate ELSE w.close_rate END), 4) <> 0`,
      [runId, input.groupId, companyIds, pcts, closingRates, averageRates, input.fiscalYear, input.periodNo ?? null],
    );

    await this.eliminateIntercompany(runId, input.groupId, companyIds, input.fiscalYear, input.periodNo);
    await this.postTranslationAdjustment(runId, input.groupId);

    return { runId, memberCount: included.length };
  }

  /**
   * Cancels what the group did with itself.
   *
   * A sale from one member to another is not a sale — the goods only moved across
   * the hall. Left alone it would inflate consolidated revenue, and the buyer's
   * stock would carry the seller's profit as if it had been earned. Two
   * eliminations follow, and both balance on their own:
   *
   *   Trading — Dr Ventas (what the seller booked), Cr Costo de ventas (what those
   *   goods actually cost the seller), and Cr Inventario for the difference: the
   *   margin the group has not earned because the goods never left it. After this,
   *   consolidated inventory carries the price the *group* paid the outside world.
   *
   *   Balances — the receivable one member holds on another is the same debt as
   *   the payable, and a group cannot owe itself. Dr Proveedores / Cr Clientes.
   *
   * The margin elimination assumes the buyer still holds the goods. If it has
   * already resold them the profit is realised and this over-eliminates by the
   * margin on what was resold; tracing which units left is a follow-up. Both
   * eliminations are written as their own flagged lines rather than netted into
   * the aggregate, so an auditor can see exactly what was removed and adjust.
   */
  private async eliminateIntercompany(
    runId: number,
    groupId: number,
    memberIds: number[],
    fiscalYear: number,
    periodNo?: number,
  ): Promise<void> {
    if (memberIds.length < 2) return; // a group of one trades with nobody

    const rncs = await this.client.query(`SELECT rnc FROM companies WHERE id = ANY($1)`, [memberIds]);
    const memberRncs = rncs.rows.map((r) => r.rnc as string).filter(Boolean);
    if (memberRncs.length < 2) return;

    // Sales one member made to another, in the period.
    const sales = await this.client.query(
      `SELECT coalesce(sum(d.subtotal_taxed + d.subtotal_exempt), 0)::text AS revenue,
              coalesce(array_agg(d.id::text), '{}') AS doc_ids
         FROM fiscal_documents d
         JOIN companies seller ON seller.id = d.company_id
        WHERE d.company_id = ANY($1)
          AND d.doc_type = 'invoice' AND d.status = 'issued'
          AND d.buyer_rnc = ANY($2)
          AND d.buyer_rnc <> seller.rnc
          AND extract(year from (d.emitted_at AT TIME ZONE 'America/Santo_Domingo')) = $3
          AND ($4::int IS NULL OR extract(month from (d.emitted_at AT TIME ZONE 'America/Santo_Domingo')) <= $4)`,
      [memberIds, memberRncs, fiscalYear, periodNo ?? null],
    );
    const revenue = add(sales.rows[0].revenue, "0");
    const docIds: string[] = sales.rows[0].doc_ids ?? [];

    if (!isZero(revenue)) {
      // What those goods cost the seller — the COGS the stock ledger recognised
      // against exactly those invoices.
      const c = await this.client.query(
        `SELECT coalesce(sum(m.total_cost), 0)::text AS cogs
           FROM inventory_cost_movements m
          WHERE m.company_id = ANY($1) AND m.kind = 'issue'
            AND m.source_type = 'fiscal_document' AND m.source_id = ANY($2::text[])`,
        [memberIds, docIds],
      );
      const cogs = add(c.rows[0].cogs, "0");
      const margin = sub(revenue, cogs);

      await this.addElimination(runId, groupId, "4.1.01.001", "Ventas de mercancías", "income", revenue, "0", "Ventas intercompañía");
      if (!isZero(cogs)) {
        await this.addElimination(runId, groupId, "5.1.01.001", "Costo de mercancías vendidas", "expense", "0", cogs, "Costo intercompañía");
      }
      if (!isZero(margin)) {
        await this.addElimination(runId, groupId, "1.1.03.001", "Inventario de mercancías", "asset", "0", margin, "Utilidad no realizada en inventario");
      }
    }

    // Receivables one member holds on another — the same debt as the payable.
    const bal = await this.client.query(
      `SELECT coalesce(sum(ar.balance), 0)::text AS amount
         FROM ar_open_items ar
         JOIN fiscal_documents d ON d.id = ar.document_id
         JOIN companies seller ON seller.id = ar.company_id
        WHERE ar.company_id = ANY($1)
          AND d.buyer_rnc = ANY($2)
          AND d.buyer_rnc <> seller.rnc`,
      [memberIds, memberRncs],
    );
    const intercompanyDebt = add(bal.rows[0].amount, "0");
    if (!isZero(intercompanyDebt)) {
      await this.addElimination(runId, groupId, "2.1.01.001", "Proveedores", "liability", intercompanyDebt, "0", "Saldo intercompañía");
      await this.addElimination(runId, groupId, "1.1.02.001", "Clientes", "asset", "0", intercompanyDebt, "Saldo intercompañía");
    }
  }

  private async addElimination(
    runId: number,
    groupId: number,
    code: string,
    name: string,
    type: string,
    debit: Decimal,
    credit: Decimal,
    note: string,
  ): Promise<void> {
    await this.client.query(
      `INSERT INTO consolidation_lines
         (run_id, group_id, account_code, account_name, account_type, debit, credit, is_elimination, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8)`,
      [runId, groupId, code, name, type, debit, credit, note],
    );
  }

  /**
   * Balances the run with the cumulative translation adjustment.
   *
   * Translating the balance sheet at closing and the income statement at average
   * leaves a gap — that gap *is* the CTA, and it belongs in equity. Without it a
   * consolidated trial balance with a foreign subsidiary simply would not balance.
   * A single-currency group produces no gap and no line.
   */
  private async postTranslationAdjustment(runId: number, groupId: number): Promise<void> {
    const { rows } = await this.client.query(
      `SELECT coalesce(sum(debit),0)::text AS d, coalesce(sum(credit),0)::text AS c
         FROM consolidation_lines WHERE run_id=$1`,
      [runId],
    );
    const imbalance = sub(add(rows[0].d, "0"), add(rows[0].c, "0")); // debit − credit
    if (isZero(imbalance)) return;

    const debit = isNegative(imbalance) ? neg(imbalance) : "0";
    const credit = isNegative(imbalance) ? "0" : imbalance;
    await this.client.query(
      `INSERT INTO consolidation_lines (run_id, group_id, account_code, account_name, account_type, debit, credit)
       VALUES ($1,$2,$3,$4,'equity',$5,$6)`,
      [runId, groupId, CTA_CODE, CTA_NAME, debit, credit],
    );
  }

  /** A run's consolidated trial balance, with its balance check. */
  async getRun(runId: number) {
    const run = await this.client.query(
      `SELECT id, group_id, fiscal_year, period_no, base_currency, member_count, status, created_at
         FROM consolidation_runs WHERE id=$1`,
      [runId],
    );
    if (run.rows.length === 0) throw new ConsolidationError(`corrida ${runId} no existe`);

    const all = await this.client.query(
      `SELECT account_code, account_name, account_type, debit::text, credit::text, is_elimination, note
         FROM consolidation_lines WHERE run_id=$1 ORDER BY is_elimination, account_code`,
      [runId],
    );

    // Totals span both: the eliminations are part of the consolidated position,
    // and since they balance among themselves the trial balance still ties.
    let totalDebit: Decimal = "0";
    let totalCredit: Decimal = "0";
    for (const l of all.rows as ConsolidatedLine[]) {
      totalDebit = add(totalDebit, l.debit);
      totalCredit = add(totalCredit, l.credit);
    }

    return {
      run: run.rows[0],
      lines: all.rows.filter((l: any) => !l.is_elimination),
      eliminations: all.rows.filter((l: any) => l.is_elimination),
      allLines: all.rows,
      totalDebit,
      totalCredit,
      balanced: isZero(sub(totalDebit, totalCredit)),
    };
  }

  async listRuns(groupId: number) {
    const { rows } = await this.client.query(
      `SELECT id, fiscal_year, period_no, base_currency, member_count, status, created_at
         FROM consolidation_runs WHERE group_id=$1 ORDER BY created_at DESC LIMIT 100`,
      [groupId],
    );
    return rows;
  }
}
