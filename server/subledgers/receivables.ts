import { SqlClient } from "../accounting/types";
import { PostingEngine } from "../accounting/posting-engine";
import { Decimal, add, sub, cmp, isNegative, isZero, toMoney } from "../accounting/decimal";

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
}

export class Receivables {
  constructor(private readonly client: SqlClient) {}

  /** Opens a receivable. Called when a credit invoice is issued. */
  async openItem(input: OpenItemInput): Promise<number> {
    const { rows } = await this.client.query(
      `INSERT INTO ar_open_items
         (company_id, customer_id, document_id, issue_date, due_date, currency, original_amount, balance, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,'open') RETURNING id`,
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
    return Number(rows[0].id);
  }

  /**
   * Registers a receipt, applies it to open items, and posts to the ledger:
   * Dr Cash / Cr Clientes. The applications must sum to the receipt amount and
   * none may exceed the item's remaining balance.
   */
  async registerReceipt(input: ReceiptInput): Promise<{ receiptId: number; journalEntryId: number }> {
    const applied = input.applications.reduce<Decimal>((s, a) => add(s, a.amount), "0");
    if (cmp(applied, input.amount) !== 0) {
      throw new ReceivablesError(`las aplicaciones (${applied}) no suman el cobro (${input.amount})`);
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
      `INSERT INTO ar_receipts (company_id, customer_id, receipt_date, currency, amount, method, reference)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        input.companyId,
        input.customerId ?? null,
        input.receiptDate,
        input.currency ?? "DOP",
        toMoney(input.amount),
        input.method ?? "cash",
        input.reference ?? null,
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

    // Post Dr Cash / Cr Clientes via the rules engine.
    const posted = await new PostingEngine(this.client).post(
      {
        companyId: input.companyId,
        eventType: "ar_receipt",
        sourceType: "ar_receipt",
        sourceId: String(receiptId),
        entryDate: input.receiptDate,
        currency: input.currency ?? "DOP",
        context: input.cashAccountRef ? { cashAccountRef: input.cashAccountRef } : {},
        measures: [{ role: "settlement", amount: toMoney(input.amount), memo: "Cobro a cliente" }],
        memo: `Cobro ${input.reference ?? receiptId}`,
        postedBy: input.postedBy,
      },
      "receipt",
    );

    await this.client.query(`UPDATE ar_receipts SET journal_entry_id=$1 WHERE id=$2`, [posted.entryId, receiptId]);
    return { receiptId, journalEntryId: posted.entryId };
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
        WHERE company_id=$1 AND status <> 'paid'
        GROUP BY customer_id`,
      [companyId, asOf],
    );
    return rows;
  }
}
