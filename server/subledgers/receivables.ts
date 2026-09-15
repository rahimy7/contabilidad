import { SqlClient } from "../accounting/types";
import { PostingEngine } from "../accounting/posting-engine";
import { Decimal, add, sub, cmp, isNegative, isZero, toMoney } from "../accounting/decimal";
import { Treasury } from "../treasury/banks";

/**
 * Accounts receivable as an open-item subledger.
 *
 * A credit invoice opens an item; a receipt applies against one or more items,
 * reducing their balance and posting the cash movement to the ledger. The AR
 * control account (Clientes, 1.1.02.001) always equals the sum of open balances
 * — that reconciliation is the whole reason the subledger exists rather than a
 * running total on the customer.
 */
export class ReceivablesError extends Error {}

export interface OpenItemInput {
  companyId: number;
  customerId?: number;
  documentId?: number;
  issueDate: string;
  dueDate: string;
  amount: Decimal;
  currency?: string;
}

export interface ReceiptInput {
  companyId: number;
  customerId?: number;
  receiptDate: string;
  amount: Decimal;
  method?: string;
  reference?: string;
  currency?: string;
  /** Which open items to settle, and by how much. */
  applications: Array<{ openItemId: number; amount: Decimal }>;
  postedBy?: number;
  /** Account the cash lands in; defaults to Caja general. */
  cashAccountRef?: string;
  /**
   * Bank account the money was deposited into. The receipt then debits that
   * bank's ledger account and records the same movement in treasury, so the
   * bank reconciliation sees it. Without it the cash lands in Caja general.
   */
  bankAccountId?: number;
  /**
   * Withholdings the customer applied instead of paying (e.g. the State retains
   * 30% of the ITBIS and 5% ISR). They settle the invoice like cash does, but land
   * in tax-credit accounts. They are part of the applications' total, not of
   * `amount`, which is only the money received.
   */
  withholdingItbis?: Decimal;
  withholdingIsr?: Decimal;
}

export class Receivables {
  constructor(private readonly client: SqlClient) {}

  /**
   * Opens a receivable. Called when a credit invoice is issued.
   *
   * A document opens at most one item (unique index): calling this again for
   * the same document returns the item it already opened instead of doubling
   * what the customer owes.
   */
  async openItem(input: OpenItemInput): Promise<number> {
    const { rows } = await this.client.query(
      `INSERT INTO ar_open_items
         (company_id, customer_id, document_id, issue_date, due_date, currency, original_amount, balance, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,'open')
       ON CONFLICT (company_id, document_id) WHERE document_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        input.companyId,
        input.customerId ?? null,
        input.documentId ?? null,
        input.issueDate,
        input.dueDate,
        input.currency ?? "DOP",
        toMoney(input.amount),
      ],
    );
    if (rows.length > 0) return Number(rows[0].id);
    const existing = await this.client.query(
      `SELECT id FROM ar_open_items WHERE company_id=$1 AND document_id=$2`,
      [input.companyId, input.documentId],
    );
    return Number(existing.rows[0].id);
  }

  /** The item a document opened, if any. */
  async itemForDocument(companyId: number, documentId: number): Promise<{ id: number; balance: Decimal; status: string } | null> {
    const { rows } = await this.client.query(
      `SELECT id, balance::text, status FROM ar_open_items WHERE company_id=$1 AND document_id=$2 FOR UPDATE`,
      [companyId, documentId],
    );
    return rows.length ? { id: Number(rows[0].id), balance: rows[0].balance, status: rows[0].status } : null;
  }

  /**
   * Reduces an item by a credit note. The ledger side is the credit note's own
   * entry (Dr Ventas / Cr Clientes); this keeps the subledger in step with it.
   */
  async applyCreditNote(input: {
    companyId: number; openItemId: number; documentId: number; amount: Decimal; date: string; journalEntryId?: number;
  }): Promise<void> {
    await this.reduce(input.companyId, input.openItemId, input.amount, "credit_note", input.documentId, input.date, input.journalEntryId);
  }

  /**
   * Cancels what a voided document still owes. Refused once anything was
   * collected on it: the money has to be dealt with first (refund or re-apply),
   * or cancelling would erase a payment from the customer's history.
   */
  async cancelItemForDocument(input: { companyId: number; documentId: number; date: string; journalEntryId?: number }): Promise<void> {
    const item = await this.itemForDocument(input.companyId, input.documentId);
    if (!item) return;
    const applied = await this.client.query(
      `SELECT coalesce(sum(amount),0)::text AS a FROM ar_applications WHERE company_id=$1 AND open_item_id=$2`,
      [input.companyId, item.id],
    );
    if (!isZero(applied.rows[0].a)) {
      throw new ReceivablesError(
        `la factura tiene cobros aplicados por ${applied.rows[0].a}: reverse los cobros antes de anularla`,
      );
    }
    if (!isZero(item.balance)) {
      await this.reduce(input.companyId, item.id, item.balance, "cancel", input.documentId, input.date, input.journalEntryId);
    }
    await this.client.query(`UPDATE ar_open_items SET status='cancelled' WHERE id=$1`, [item.id]);
  }

  private async reduce(
    companyId: number, openItemId: number, amount: Decimal, kind: string, documentId: number | null, date: string, journalEntryId?: number,
  ): Promise<void> {
    if (isNegative(amount) || isZero(amount)) throw new ReceivablesError("el ajuste debe ser positivo");
    const { rows } = await this.client.query(
      `SELECT balance::text FROM ar_open_items WHERE id=$1 AND company_id=$2 FOR UPDATE`,
      [openItemId, companyId],
    );
    if (rows.length === 0) throw new ReceivablesError(`partida ${openItemId} no existe`);
    if (cmp(amount, rows[0].balance) > 0) {
      throw new ReceivablesError(`el ajuste (${amount}) excede el saldo (${rows[0].balance}) de la partida ${openItemId}`);
    }
    const newBalance = sub(rows[0].balance, amount);
    await this.client.query(
      `UPDATE ar_open_items SET balance=$1, status=CASE WHEN $1::numeric = 0 THEN 'paid' ELSE 'partial' END WHERE id=$2`,
      [toMoney(newBalance), openItemId],
    );
    await this.client.query(
      `INSERT INTO ar_adjustments (company_id, open_item_id, document_id, kind, amount, adjustment_date, journal_entry_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [companyId, openItemId, documentId, kind, toMoney(amount), date, journalEntryId ?? null],
    );
  }

  /**
   * Registers a receipt, applies it to open items, and posts to the ledger:
   * Dr Cash / Cr Clientes. The applications must sum to the receipt amount and
   * none may exceed the item's remaining balance.
   */
  async registerReceipt(input: ReceiptInput): Promise<{ receiptId: number; journalEntryId: number; bankTransactionId: number | null }> {
    const applied = input.applications.reduce<Decimal>((s, a) => add(s, a.amount), "0");
    const withheld = add(input.withholdingItbis ?? "0", input.withholdingIsr ?? "0");
    const settled = add(input.amount, withheld);
    if (cmp(applied, settled) !== 0) {
      throw new ReceivablesError(
        isZero(withheld)
          ? `las aplicaciones (${applied}) no suman el cobro (${input.amount})`
          : `las aplicaciones (${applied}) no suman el cobro más las retenciones (${settled})`,
      );
    }
    if (input.applications.length === 0) throw new ReceivablesError("un cobro debe aplicarse a al menos una partida");

    // Validate and reduce each open item under a row lock.
    for (const app of input.applications) {
      if (isNegative(app.amount) || isZero(app.amount)) {
        throw new ReceivablesError("el monto aplicado debe ser positivo");
      }
      const { rows } = await this.client.query(
        `SELECT balance::text, customer_id FROM ar_open_items
          WHERE id=$1 AND company_id=$2 FOR UPDATE`,
        [app.openItemId, input.companyId],
      );
      if (rows.length === 0) throw new ReceivablesError(`partida ${app.openItemId} no existe`);
      const balance = rows[0].balance as Decimal;
      if (cmp(app.amount, balance) > 0) {
        throw new ReceivablesError(`la aplicación (${app.amount}) excede el saldo (${balance}) de la partida ${app.openItemId}`);
      }
      const newBalance = sub(balance, app.amount);
      await this.client.query(
        `UPDATE ar_open_items
            SET balance=$1, status=CASE WHEN $1::numeric = 0 THEN 'paid' ELSE 'partial' END
          WHERE id=$2`,
        [toMoney(newBalance), app.openItemId],
      );
    }

    const receipt = await this.client.query(
      `INSERT INTO ar_receipts (company_id, customer_id, receipt_date, currency, amount, method, reference, bank_account_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        input.companyId,
        input.customerId ?? null,
        input.receiptDate,
        input.currency ?? "DOP",
        toMoney(input.amount),
        input.method ?? (input.bankAccountId ? "transfer" : "cash"),
        input.reference ?? null,
        input.bankAccountId ?? null,
      ],
    );
    const receiptId = Number(receipt.rows[0].id);

    for (const app of input.applications) {
      await this.client.query(
        `INSERT INTO ar_applications (company_id, receipt_id, open_item_id, amount)
         VALUES ($1,$2,$3,$4)`,
        [input.companyId, receiptId, app.openItemId, toMoney(app.amount)],
      );
    }

    // Post Dr Cash (or Bank) / Cr Clientes via the rules engine; withholdings
    // settle the receivable against their tax-credit accounts.
    const bank = input.bankAccountId ? await Treasury.bankGl(this.client, input.companyId, input.bankAccountId) : null;
    const context: Record<string, unknown> = input.cashAccountRef ? { cashAccountRef: input.cashAccountRef } : {};
    if (bank) Object.assign(context, { settlementChannel: "bank", bankGlAccount: bank.glCode });
    const measures = [];
    if (!isZero(input.amount)) measures.push({ role: "settlement", amount: toMoney(input.amount), memo: "Cobro a cliente" });
    if (input.withholdingItbis && !isZero(input.withholdingItbis))
      measures.push({ role: "withholding_itbis", amount: toMoney(input.withholdingItbis), memo: "ITBIS retenido por el cliente" });
    if (input.withholdingIsr && !isZero(input.withholdingIsr))
      measures.push({ role: "withholding_isr", amount: toMoney(input.withholdingIsr), memo: "ISR retenido por el cliente" });

    const posted = await new PostingEngine(this.client).post(
      {
        companyId: input.companyId,
        eventType: "ar_receipt",
        sourceType: "ar_receipt",
        sourceId: String(receiptId),
        entryDate: input.receiptDate,
        currency: input.currency ?? "DOP",
        context,
        measures,
        memo: `Cobro ${input.reference ?? receiptId}`,
        postedBy: input.postedBy,
      },
      "receipt",
    );

    let bankTransactionId: number | null = null;
    if (bank && !isZero(input.amount)) {
      bankTransactionId = await new Treasury(this.client).attachTransaction({
        companyId: input.companyId, bankAccountId: input.bankAccountId!, txnDate: input.receiptDate, direction: "in",
        amount: input.amount, kind: "deposit", counterpartyAccountRef: "1.1.02.001",
        reference: input.reference, memo: `Cobro ${input.reference ?? receiptId}`, journalEntryId: posted.entryId,
        sourceType: "ar_receipt", sourceId: String(receiptId),
      });
    }
    await this.client.query(`UPDATE ar_receipts SET journal_entry_id=$1, bank_transaction_id=$3 WHERE id=$2`, [
      posted.entryId, receiptId, bankTransactionId,
    ]);
    return { receiptId, journalEntryId: posted.entryId, bankTransactionId };
  }

  /**
   * A customer advance: money received before there is any invoice to apply it
   * to. It is a liability (Anticipos de clientes) until applied, and it lives in
   * the subledger as a receipt with its whole amount unapplied.
   */
  async registerAdvance(input: {
    companyId: number; customerId: number; date: string; amount: Decimal; bankAccountId?: number; reference?: string; postedBy?: number;
  }): Promise<{ receiptId: number; journalEntryId: number }> {
    if (isNegative(input.amount) || isZero(input.amount)) throw new ReceivablesError("el anticipo debe ser positivo");
    const receipt = await this.client.query(
      `INSERT INTO ar_receipts (company_id, customer_id, receipt_date, currency, amount, method, reference, bank_account_id, unapplied_amount)
       VALUES ($1,$2,$3,'DOP',$4,$5,$6,$7,$4) RETURNING id`,
      [input.companyId, input.customerId, input.date, toMoney(input.amount), input.bankAccountId ? "transfer" : "cash", input.reference ?? null, input.bankAccountId ?? null],
    );
    const receiptId = Number(receipt.rows[0].id);
    const bank = input.bankAccountId ? await Treasury.bankGl(this.client, input.companyId, input.bankAccountId) : null;
    const posted = await new PostingEngine(this.client).post(
      {
        companyId: input.companyId, eventType: "ar_advance", sourceType: "ar_advance", sourceId: String(receiptId),
        entryDate: input.date, currency: "DOP",
        context: bank ? { settlementChannel: "bank", bankGlAccount: bank.glCode } : {},
        measures: [{ role: "settlement", amount: toMoney(input.amount), memo: "Anticipo de cliente" }],
        memo: `Anticipo ${input.reference ?? receiptId}`, postedBy: input.postedBy,
      },
      "advance",
    );
    let bankTransactionId: number | null = null;
    if (bank) {
      bankTransactionId = await new Treasury(this.client).attachTransaction({
        companyId: input.companyId, bankAccountId: input.bankAccountId!, txnDate: input.date, direction: "in",
        amount: input.amount, kind: "deposit", counterpartyAccountRef: "2.1.04.001", reference: input.reference,
        memo: `Anticipo ${input.reference ?? receiptId}`, journalEntryId: posted.entryId, sourceType: "ar_advance", sourceId: String(receiptId),
      });
    }
    await this.client.query(`UPDATE ar_receipts SET journal_entry_id=$1, bank_transaction_id=$3 WHERE id=$2`, [posted.entryId, receiptId, bankTransactionId]);
    return { receiptId, journalEntryId: posted.entryId };
  }

  /** Applies (part of) an advance to an open invoice: Dr Anticipos / Cr Clientes. */
  async applyAdvance(input: {
    companyId: number; receiptId: number; openItemId: number; amount: Decimal; date: string; postedBy?: number;
  }): Promise<{ journalEntryId: number }> {
    const r = await this.client.query(
      `SELECT unapplied_amount::text FROM ar_receipts WHERE id=$1 AND company_id=$2 FOR UPDATE`,
      [input.receiptId, input.companyId],
    );
    if (r.rows.length === 0) throw new ReceivablesError(`anticipo ${input.receiptId} no existe`);
    if (cmp(input.amount, r.rows[0].unapplied_amount) > 0) {
      throw new ReceivablesError(`el anticipo solo tiene ${r.rows[0].unapplied_amount} sin aplicar`);
    }
    const count = await this.client.query(`SELECT count(*)::int n FROM ar_applications WHERE receipt_id=$1`, [input.receiptId]);
    const posted = await new PostingEngine(this.client).post(
      {
        companyId: input.companyId, eventType: "ar_advance", sourceType: "ar_advance_application",
        sourceId: `${input.receiptId}:${count.rows[0].n + 1}`, entryDate: input.date, currency: "DOP",
        measures: [{ role: "application", amount: toMoney(input.amount), memo: "Aplicación de anticipo" }],
        memo: `Aplicación anticipo ${input.receiptId}`, postedBy: input.postedBy,
      },
      "application",
    );
    await this.reduce(input.companyId, input.openItemId, input.amount, "advance", null, input.date, posted.entryId);
    await this.client.query(
      `INSERT INTO ar_applications (company_id, receipt_id, open_item_id, amount) VALUES ($1,$2,$3,$4)`,
      [input.companyId, input.receiptId, input.openItemId, toMoney(input.amount)],
    );
    await this.client.query(`UPDATE ar_receipts SET unapplied_amount = unapplied_amount - $1::numeric WHERE id=$2`, [
      toMoney(input.amount), input.receiptId,
    ]);
    return { journalEntryId: posted.entryId };
  }

  /** Aging buckets as of a date, per customer: current, 1-30, 31-60, 61-90, 90+. */
  async aging(companyId: number, asOf: string) {
    const { rows } = await this.client.query(
      `SELECT customer_id,
              sum(balance) FILTER (WHERE due_date >= $2)::text AS current,
              sum(balance) FILTER (WHERE due_date < $2 AND due_date >= $2::date - 30)::text AS d1_30,
              sum(balance) FILTER (WHERE due_date < $2::date - 30 AND due_date >= $2::date - 60)::text AS d31_60,
              sum(balance) FILTER (WHERE due_date < $2::date - 60 AND due_date >= $2::date - 90)::text AS d61_90,
              sum(balance) FILTER (WHERE due_date < $2::date - 90)::text AS d90_plus,
              sum(balance)::text AS total
         FROM ar_open_items
        WHERE company_id=$1 AND status NOT IN ('paid','cancelled')
        GROUP BY customer_id`,
      [companyId, asOf],
    );
    return rows;
  }
}
