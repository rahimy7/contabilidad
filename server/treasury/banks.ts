import { SqlClient } from "../accounting/types";
import { PostingEngine } from "../accounting/posting-engine";
import { Decimal, add, sub, cmp, isNegative, isZero, toMoney } from "../accounting/decimal";

/**
 * Treasury: bank accounts, their movements, and reconciliation.
 *
 * A movement is recorded and posted to the general ledger in the same
 * transaction, so a bank account's running total (in − out) never drifts from
 * the balance the ledger reports for its control account. The other leg of the
 * entry is named by the caller (`counterpartyAccountRef`): a deposit credits
 * where the money came from, a payment debits where it went. Because that leg
 * varies per movement, the posting goes through `postManual` rather than the
 * rules engine — this is closer to an accountant naming both accounts than to a
 * subledger event the rules resolve.
 *
 * Reconciliation compares our cleared movements against a bank statement. A
 * movement is "cleared" once the bank confirms it (its `reconciliation_id` is
 * set). The reconciliation balances when the cleared total equals the
 * statement's closing balance; what stays uncleared is the reconciling set —
 * deposits in transit ('in' not yet confirmed) and outstanding cheques ('out'
 * not yet confirmed).
 */
export class TreasuryError extends Error {}

/** The chart's "Bancos" control account. A bank rolls up here unless told otherwise. */
const DEFAULT_BANK_GL = "1.1.01.003";

export interface OpenAccountInput {
  companyId: number;
  code: string;
  name: string;
  bankName?: string;
  accountNumber?: string;
  accountType?: string;
  currency?: string;
  /** Chart-of-accounts code the bank rolls up into; defaults to Bancos. */
  glAccountCode?: string;
}

export interface MovementInput {
  companyId: number;
  bankAccountId: number;
  txnDate: string;
  direction: "in" | "out";
  amount: Decimal;
  /** deposit | payment | charge | interest | transfer | other */
  kind?: string;
  /** Chart code of the other leg — the source or use of the funds. */
  counterpartyAccountRef: string;
  memo?: string;
  reference?: string;
  postedBy?: number;
  /** Clear against this reconciliation on the spot, e.g. a bank charge found while reconciling. */
  reconciliationId?: number;
  /** Lets a subledger settlement record its own movement; refused to direct callers. */
  allowControlCounterparty?: boolean;
}

/**
 * Counterparty accounts a raw treasury movement may not touch. Each is the
 * control account of a subledger: paying a supplier "from the bank screen"
 * against Proveedores would reduce the ledger without reducing any open item,
 * and from then on the two never agree. Those movements go through the
 * subledger (AP payment, AR receipt), which records the bank movement itself.
 */
const SUBLEDGER_CONTROLLED = new Set(["1.1.02.001", "2.1.01.001", "2.1.01.002", "1.1.03.001", "1.1.03.002"]);

interface ReconRow {
  id: number;
  bank_account_id: number;
  statement_date: string;
  statement_balance: Decimal;
  status: string;
}

export class Treasury {
  constructor(private readonly client: SqlClient) {}

  async openAccount(input: OpenAccountInput): Promise<number> {
    const glCode = input.glAccountCode ?? DEFAULT_BANK_GL;
    const gl = await this.client.query(
      `SELECT id FROM chart_of_accounts WHERE company_id=$1 AND code=$2`,
      [input.companyId, glCode],
    );
    if (gl.rows.length === 0) throw new TreasuryError(`cuenta contable ${glCode} no existe`);

    const { rows } = await this.client.query(
      `INSERT INTO bank_accounts
         (company_id, code, name, bank_name, account_number, account_type, currency, gl_account_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        input.companyId,
        input.code,
        input.name,
        input.bankName ?? null,
        input.accountNumber ?? null,
        input.accountType ?? "corriente",
        input.currency ?? "DOP",
        Number(gl.rows[0].id),
      ],
    );
    const bankAccountId = Number(rows[0].id);

    // A bank that rolls into its own ledger account needs settlements routed
    // there too; the default Bancos account is covered by the company rules.
    if (glCode !== DEFAULT_BANK_GL) {
      const routes: Array<[string, string, string]> = [
        ["ar_receipt.settlement", glCode, "1.1.02.001"],
        ["ap_payment.settlement", "2.1.01.001", glCode],
        ["ar_advance.settlement", glCode, "2.1.04.001"],
      ];
      for (const [event, debit, credit] of routes) {
        await this.client.query(
          `INSERT INTO posting_rules (company_id, event_type, match, debit_account_ref, credit_account_ref, priority)
           SELECT $1,$2,$3::jsonb,$4,$5,20
            WHERE NOT EXISTS (SELECT 1 FROM posting_rules WHERE company_id=$1 AND event_type=$2 AND match=$3::jsonb)`,
          [input.companyId, event, JSON.stringify({ settlementChannel: "bank", bankGlAccount: glCode }), debit, credit],
        );
      }
    }
    return bankAccountId;
  }

  /** The ledger account a bank account rolls into. */
  static async bankGl(client: SqlClient, companyId: number, bankAccountId: number): Promise<{ glAccountId: number; glCode: string; currency: string }> {
    const { rows } = await client.query(
      `SELECT b.gl_account_id, a.code, b.currency, b.is_active
         FROM bank_accounts b JOIN chart_of_accounts a ON a.id = b.gl_account_id
        WHERE b.id=$1 AND b.company_id=$2`,
      [bankAccountId, companyId],
    );
    if (rows.length === 0) throw new TreasuryError(`cuenta bancaria ${bankAccountId} no existe`);
    if (rows[0].is_active === false) throw new TreasuryError(`la cuenta bancaria ${bankAccountId} está inactiva`);
    return { glAccountId: Number(rows[0].gl_account_id), glCode: rows[0].code, currency: rows[0].currency ?? "DOP" };
  }

  /**
   * Records in treasury a bank movement another module already posted — an AR
   * receipt or an AP payment settled through the bank. Nothing is posted here;
   * the entry is checked to actually move this bank's ledger account by this
   * amount on the right side, so the treasury balance and the ledger cannot part.
   */
  async attachTransaction(input: {
    companyId: number; bankAccountId: number; txnDate: string; direction: "in" | "out"; amount: Decimal;
    kind: string; counterpartyAccountRef: string; journalEntryId: number;
    reference?: string; memo?: string; sourceType?: string; sourceId?: string;
  }): Promise<number> {
    const bank = await Treasury.bankGl(this.client, input.companyId, input.bankAccountId);
    const side = input.direction === "in" ? "debit" : "credit";
    const check = await this.client.query(
      `SELECT coalesce(sum(${side}),0)::text AS amt FROM journal_entry_lines
        WHERE entry_id=$1 AND company_id=$2 AND account_id=$3`,
      [input.journalEntryId, input.companyId, bank.glAccountId],
    );
    if (cmp(check.rows[0].amt, toMoney(input.amount)) !== 0) {
      throw new TreasuryError(
        `el asiento ${input.journalEntryId} no mueve la cuenta del banco por ${input.amount} (${side} ${check.rows[0].amt})`,
      );
    }
    const { rows } = await this.client.query(
      `INSERT INTO bank_transactions
         (company_id, bank_account_id, txn_date, direction, amount, kind, counterparty_account_ref, memo, reference,
          journal_entry_id, source_type, source_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        input.companyId, input.bankAccountId, input.txnDate, input.direction, toMoney(input.amount), input.kind,
        input.counterpartyAccountRef, input.memo ?? null, input.reference ?? null, input.journalEntryId,
        input.sourceType ?? null, input.sourceId ?? null,
      ],
    );
    return Number(rows[0].id);
  }

  /**
   * Moves money between two of the company's bank accounts: one movement out of
   * the source, one into the destination, each posted against the other bank's
   * ledger account. Both land in the reconciliation of their own bank.
   */
  async transfer(input: {
    companyId: number; fromBankAccountId: number; toBankAccountId: number; date: string; amount: Decimal;
    reference?: string; memo?: string; postedBy?: number;
  }): Promise<{ outTransactionId: number; inTransactionId: number }> {
    if (input.fromBankAccountId === input.toBankAccountId) throw new TreasuryError("origen y destino son la misma cuenta");
    const from = await Treasury.bankGl(this.client, input.companyId, input.fromBankAccountId);
    const to = await Treasury.bankGl(this.client, input.companyId, input.toBankAccountId);
    if (from.currency !== to.currency) throw new TreasuryError("la transferencia entre monedas distintas requiere tasa de cambio");
    const memo = input.memo ?? `Transferencia entre cuentas ${input.reference ?? ""}`.trim();
    // Posted once, as a single entry Dr destino / Cr origen; each bank gets its
    // own treasury movement pointing at that entry.
    const posted = await new PostingEngine(this.client).postManual({
      companyId: input.companyId, entryDate: input.date, currency: from.currency, memo,
      lines: [
        { accountId: to.glAccountId, debit: toMoney(input.amount), memo },
        { accountId: from.glAccountId, credit: toMoney(input.amount), memo },
      ],
      postedBy: input.postedBy,
    });
    const outTransactionId = await this.insertTxn(input.companyId, input.fromBankAccountId, input.date, "out", input.amount, "transfer", to.glCode, memo, input.reference, posted.entryId);
    const inTransactionId = await this.insertTxn(input.companyId, input.toBankAccountId, input.date, "in", input.amount, "transfer", from.glCode, memo, input.reference, posted.entryId);
    return { outTransactionId, inTransactionId };
  }

  private async insertTxn(
    companyId: number, bankAccountId: number, date: string, direction: "in" | "out", amount: Decimal, kind: string,
    counterparty: string, memo: string, reference: string | undefined, journalEntryId: number,
  ): Promise<number> {
    const { rows } = await this.client.query(
      `INSERT INTO bank_transactions
         (company_id, bank_account_id, txn_date, direction, amount, kind, counterparty_account_ref, memo, reference, journal_entry_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [companyId, bankAccountId, date, direction, toMoney(amount), kind, counterparty, memo, reference ?? null, journalEntryId],
    );
    return Number(rows[0].id);
  }

  /**
   * Records a bank movement and posts it to the ledger. `direction` decides which
   * leg the bank account takes: 'in' debits the bank, 'out' credits it.
   */
  async recordMovement(input: MovementInput): Promise<{ transactionId: number; journalEntryId: number }> {
    if (isNegative(input.amount) || isZero(input.amount)) {
      throw new TreasuryError("el monto del movimiento debe ser positivo");
    }
    if (input.direction !== "in" && input.direction !== "out") {
      throw new TreasuryError(`dirección inválida: ${input.direction}`);
    }
    if (!input.allowControlCounterparty && SUBLEDGER_CONTROLLED.has(input.counterpartyAccountRef)) {
      throw new TreasuryError(
        `la cuenta ${input.counterpartyAccountRef} es de control de un auxiliar: registre el cobro o pago ` +
          `desde Cuentas por cobrar / por pagar para que la partida también se liquide`,
      );
    }

    const acct = await this.client.query(
      `SELECT gl_account_id, currency FROM bank_accounts WHERE id=$1 AND company_id=$2`,
      [input.bankAccountId, input.companyId],
    );
    if (acct.rows.length === 0) throw new TreasuryError(`cuenta bancaria ${input.bankAccountId} no existe`);
    const glAccountId = Number(acct.rows[0].gl_account_id);
    const currency = acct.rows[0].currency ?? "DOP";

    if (input.reconciliationId != null) {
      const recon = await this.loadDraftRecon(input.companyId, input.reconciliationId);
      if (Number(recon.bank_account_id) !== input.bankAccountId) {
        throw new TreasuryError("la conciliación pertenece a otra cuenta bancaria");
      }
      if (input.txnDate > recon.statement_date) {
        throw new TreasuryError("un movimiento posterior a la fecha del estado no puede conciliarse en él");
      }
    }

    const amount = toMoney(input.amount);
    const inserted = await this.client.query(
      `INSERT INTO bank_transactions
         (company_id, bank_account_id, txn_date, direction, amount, kind,
          counterparty_account_ref, memo, reference, reconciliation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        input.companyId,
        input.bankAccountId,
        input.txnDate,
        input.direction,
        amount,
        input.kind ?? "other",
        input.counterpartyAccountRef,
        input.memo ?? null,
        input.reference ?? null,
        input.reconciliationId ?? null,
      ],
    );
    const transactionId = Number(inserted.rows[0].id);

    const bankLeg = { accountId: glAccountId };
    const otherLeg = { accountCode: input.counterpartyAccountRef };
    const memo = input.memo ?? undefined;
    const lines =
      input.direction === "in"
        ? [
            { ...bankLeg, debit: amount, memo },
            { ...otherLeg, credit: amount, memo },
          ]
        : [
            { ...otherLeg, debit: amount, memo },
            { ...bankLeg, credit: amount, memo },
          ];

    const posted = await new PostingEngine(this.client).postManual({
      companyId: input.companyId,
      entryDate: input.txnDate,
      currency,
      reference: `bank-txn-${transactionId}`,
      memo: input.memo ?? `Movimiento bancario ${input.reference ?? transactionId}`,
      lines,
      postedBy: input.postedBy,
    });

    await this.client.query(`UPDATE bank_transactions SET journal_entry_id=$1 WHERE id=$2`, [
      posted.entryId,
      transactionId,
    ]);
    return { transactionId, journalEntryId: posted.entryId };
  }

  async startReconciliation(
    companyId: number,
    bankAccountId: number,
    statementDate: string,
    statementBalance: Decimal,
  ): Promise<number> {
    const acct = await this.client.query(`SELECT 1 FROM bank_accounts WHERE id=$1 AND company_id=$2`, [
      bankAccountId,
      companyId,
    ]);
    if (acct.rows.length === 0) throw new TreasuryError(`cuenta bancaria ${bankAccountId} no existe`);

    const { rows } = await this.client.query(
      `INSERT INTO bank_reconciliations (company_id, bank_account_id, statement_date, statement_balance)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [companyId, bankAccountId, statementDate, toMoney(statementBalance)],
    );
    return Number(rows[0].id);
  }

  /** Marks movements as confirmed by the bank against a draft reconciliation. */
  async clear(companyId: number, reconciliationId: number, transactionIds: number[]): Promise<void> {
    const recon = await this.loadDraftRecon(companyId, reconciliationId);
    for (const id of transactionIds) {
      const r = await this.client.query(
        // txn_date as text: the pg driver hands back a Date for `date` columns,
        // and `Date > 'yyyy-mm-dd'` coerces to NaN and is always false, so the
        // after-the-statement guard below would never fire.
        `SELECT reconciliation_id, bank_account_id, txn_date::text, status
           FROM bank_transactions WHERE id=$1 AND company_id=$2 FOR UPDATE`,
        [id, companyId],
      );
      if (r.rows.length === 0) throw new TreasuryError(`movimiento ${id} no existe`);
      const t = r.rows[0];
      if (t.status !== "posted") throw new TreasuryError(`movimiento ${id} no está vigente`);
      if (Number(t.bank_account_id) !== Number(recon.bank_account_id)) {
        throw new TreasuryError(`movimiento ${id} pertenece a otra cuenta bancaria`);
      }
      if (t.txn_date > recon.statement_date) {
        throw new TreasuryError(`movimiento ${id} es posterior a la fecha del estado`);
      }
      if (t.reconciliation_id != null && Number(t.reconciliation_id) !== reconciliationId) {
        throw new TreasuryError(`movimiento ${id} ya fue conciliado en otra conciliación`);
      }
      await this.client.query(`UPDATE bank_transactions SET reconciliation_id=$1 WHERE id=$2`, [
        reconciliationId,
        id,
      ]);
    }
  }

  /** Undoes clearing for movements in a draft reconciliation. */
  async unclear(companyId: number, reconciliationId: number, transactionIds: number[]): Promise<void> {
    await this.loadDraftRecon(companyId, reconciliationId);
    for (const id of transactionIds) {
      await this.client.query(
        `UPDATE bank_transactions SET reconciliation_id=NULL
          WHERE id=$1 AND company_id=$2 AND reconciliation_id=$3`,
        [id, companyId, reconciliationId],
      );
    }
  }

  /**
   * The reconciliation report as of the statement date. Everything is filtered to
   * `txn_date <= statement_date`, so the arithmetic closes:
   *   bookBalance − clearedBalance == depositsInTransit − outstandingChecks.
   */
  async summary(companyId: number, reconciliationId: number) {
    const recon = await this.loadRecon(companyId, reconciliationId);

    const agg = await this.client.query(
      `SELECT
         coalesce(sum(CASE WHEN direction='in' THEN amount ELSE -amount END),0)::text AS book_balance,
         coalesce(sum(CASE WHEN reconciliation_id IS NOT NULL
                            THEN (CASE WHEN direction='in' THEN amount ELSE -amount END)
                            ELSE 0 END),0)::text AS cleared_balance,
         coalesce(sum(CASE WHEN reconciliation_id IS NULL AND direction='in' THEN amount ELSE 0 END),0)::text AS deposits_in_transit,
         coalesce(sum(CASE WHEN reconciliation_id IS NULL AND direction='out' THEN amount ELSE 0 END),0)::text AS outstanding_checks
       FROM bank_transactions
       WHERE company_id=$1 AND bank_account_id=$2 AND status='posted' AND txn_date <= $3`,
      [companyId, recon.bank_account_id, recon.statement_date],
    );
    const a = agg.rows[0];

    const items = await this.client.query(
      `SELECT id, txn_date, direction, amount::text, kind, memo, reference,
              (reconciliation_id IS NOT NULL) AS cleared
         FROM bank_transactions
        WHERE company_id=$1 AND bank_account_id=$2 AND status='posted' AND txn_date <= $3
        ORDER BY txn_date, id`,
      [companyId, recon.bank_account_id, recon.statement_date],
    );

    const statementBalance = add(recon.statement_balance, "0");
    const clearedBalance = add(a.cleared_balance, "0");
    const difference = sub(statementBalance, clearedBalance);

    return {
      reconciliationId,
      bankAccountId: Number(recon.bank_account_id),
      statementDate: recon.statement_date,
      statementBalance,
      bookBalance: add(a.book_balance, "0"),
      clearedBalance,
      depositsInTransit: add(a.deposits_in_transit, "0"),
      outstandingChecks: add(a.outstanding_checks, "0"),
      difference,
      reconciled: isZero(difference),
      status: recon.status,
      items: items.rows,
    };
  }

  /** Marks a reconciliation completed. Refuses while the cleared total misses the statement. */
  async complete(companyId: number, reconciliationId: number): Promise<void> {
    const s = await this.summary(companyId, reconciliationId);
    if (s.status !== "draft") throw new TreasuryError("la conciliación ya fue completada");
    if (!s.reconciled) {
      throw new TreasuryError(
        `la conciliación no cuadra: diferencia de ${s.difference} entre el saldo conciliado y el estado`,
      );
    }
    await this.client.query(
      `UPDATE bank_reconciliations SET status='completed', completed_at=now() WHERE id=$1 AND company_id=$2`,
      [reconciliationId, companyId],
    );
  }

  private async loadRecon(companyId: number, reconciliationId: number): Promise<ReconRow> {
    const { rows } = await this.client.query(
      `SELECT id, bank_account_id, statement_date::text, statement_balance::text, status
         FROM bank_reconciliations WHERE id=$1 AND company_id=$2`,
      [reconciliationId, companyId],
    );
    if (rows.length === 0) throw new TreasuryError(`conciliación ${reconciliationId} no existe`);
    return rows[0] as ReconRow;
  }

  private async loadDraftRecon(companyId: number, reconciliationId: number): Promise<ReconRow> {
    const recon = await this.loadRecon(companyId, reconciliationId);
    if (recon.status !== "draft") throw new TreasuryError(`la conciliación ${reconciliationId} ya fue completada`);
    return recon;
  }
}
