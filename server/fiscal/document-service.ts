import { SqlClient, AccountingEvent, EventMeasure } from "../accounting/types";
import { PostingEngine } from "../accounting/posting-engine";
import { Decimal, add, sum, isZero, toMoney } from "../accounting/decimal";
import { InventoryCosting } from "../inventory/costing";
import { allocateNcf, isEcfType } from "./ncf";
import {
  TaxCalculator,
  TaxLineInput,
  CounterpartyType,
  OperationType,
} from "./tax-calculator";

/**
 * Issuing a fiscal document.
 *
 * The NCF allocation, the document row, its lines and the journal entry all
 * happen in the caller's transaction. That is the point: if the posting fails,
 * the comprobante number is released rather than burned, and there is never a
 * document without an entry or an entry without a document.
 *
 * `orders` stays the operational sales document. A sale becomes fiscal only when
 * an NCF is issued, some orders never need one, and a credit note does not map
 * one-to-one onto an order — so this references the order rather than absorbing
 * it.
 */

export interface IssueLineInput extends TaxLineInput {
  productId?: number;
  description: string;
}

export interface IssueInvoiceInput {
  companyId: number;
  /** Our own RNC. Denormalized onto the document because it appears on the 607. */
  issuerRnc: string;
  ncfType: string;
  date: string;
  lines: IssueLineInput[];

  customerId?: number;
  buyerRnc?: string;
  buyerName?: string;
  orderId?: number;

  currency?: string;
  fxRate?: Decimal;
  /** 'cash' | 'credit' | 'card' | 'transfer'. Routes revenue to Caja or Clientes. */
  paymentMethod?: string;
  counterpartyType?: CounterpartyType;
  operationType?: OperationType;
  applyLegalTip?: boolean;
  dueDate?: string;
  postedBy?: number;
  /**
   * Also recognise cost of goods sold: for each line whose product is tracked in
   * inventory, issue stock at weighted-average cost and post Dr COGS / Cr
   * Inventory. Untracked products (services, or items never received) are skipped,
   * so enabling this never blocks a sale of something that carries no cost.
   */
  bookCogs?: boolean;
  /** Warehouse the goods leave from; 0 = the company's single store. */
  warehouseId?: number;
}

export interface IssuedDocument {
  documentId: number;
  ncf: string;
  journalEntryId: number;
  entryNo: string | null;
  total: Decimal;
  /** Cost of goods sold recognised, when `bookCogs` was set. */
  cogsTotal?: Decimal;
}

export class FiscalDocumentService {
  private readonly taxes: TaxCalculator;
  private readonly ledger: PostingEngine;

  constructor(private readonly client: SqlClient) {
    this.taxes = new TaxCalculator(client);
    this.ledger = new PostingEngine(client);
  }

  async issueInvoice(input: IssueInvoiceInput): Promise<IssuedDocument> {
    if (input.lines.length === 0) {
      throw new Error("a fiscal document needs at least one line");
    }

    const currency = input.currency ?? "DOP";
    const fxRate = input.fxRate ?? "1";

    const breakdown = await this.taxes.compute(input.lines, {
      companyId: input.companyId,
      date: input.date,
      counterpartyType: input.counterpartyType,
      operationType: input.operationType,
      applyLegalTip: input.applyLegalTip,
      // A sale: the buyer withholds from us, if anyone does. Not our document.
      applyRetentions: false,
    });

    // Reserved here, released on rollback. Everything below shares this transaction.
    const allocation = await allocateNcf(this.client, input.companyId, input.ncfType);

    const doc = await this.client.query(
      `INSERT INTO fiscal_documents
         (company_id, doc_type, ncf, ncf_type, is_ecf,
          issuer_rnc, buyer_rnc, buyer_name, customer_id, order_id,
          currency, fx_rate,
          subtotal_taxed, subtotal_exempt, itbis_18, itbis_16, itbis_0,
          tip_legal, total, status, ecf_status, emitted_at, due_date)
       VALUES ($1,'invoice',$2,$3,$4,
               $5,$6,$7,$8,$9,
               $10,$11,
               $12,$13,$14,$15,$16,
               $17,$18,'issued',$19, now(), $20)
       RETURNING id`,
      [
        input.companyId,
        allocation.ncf,
        input.ncfType,
        allocation.isEcf,
        input.issuerRnc,
        input.buyerRnc ?? null,
        input.buyerName ?? null,
        input.customerId ?? null,
        input.orderId ?? null,
        currency,
        fxRate,
        toMoney(breakdown.subtotalTaxed),
        toMoney(breakdown.subtotalExempt),
        toMoney(breakdown.itbis18),
        toMoney(breakdown.itbis16),
        toMoney(breakdown.itbis0),
        toMoney(breakdown.tipLegal),
        toMoney(breakdown.total),
        // An e-CF starts life unsent; a legacy NCF has no DGII lifecycle at all.
        isEcfType(input.ncfType) ? "pendiente" : null,
        input.dueDate ?? null,
      ],
    );
    const documentId = Number(doc.rows[0].id);

    for (const [i, line] of input.lines.entries()) {
      const computed = breakdown.lines[i];
      await this.client.query(
        `INSERT INTO fiscal_document_lines
           (document_id, company_id, line_no, product_id, description,
            quantity, unit_price, discount, tax_code, itbis_rate, itbis_amount,
            line_total, is_exempt)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          documentId,
          input.companyId,
          i + 1,
          line.productId ?? null,
          line.description,
          toMoney(line.quantity),
          toMoney(line.unitPrice),
          toMoney(line.discount ?? "0"),
          computed.taxCode,
          computed.itbisRate,
          toMoney(computed.itbisAmount),
          toMoney(computed.lineTotal),
          computed.isExempt,
        ],
      );
    }

    const itbisTotal = sum([breakdown.itbis18, breakdown.itbis16, breakdown.itbis0]);
    const revenue = add(breakdown.subtotalTaxed, breakdown.subtotalExempt);

    const measures: EventMeasure[] = [
      { role: "revenue", amount: toMoney(revenue), memo: "Ventas" },
    ];
    if (!isZero(itbisTotal)) {
      measures.push({ role: "itbis", amount: toMoney(itbisTotal), memo: "ITBIS por pagar" });
    }

    const event: AccountingEvent = {
      companyId: input.companyId,
      eventType: "pos_sale",
      // Keyed on the document, not the order: an order can carry several
      // comprobantes over its life, and each posts once.
      sourceType: "fiscal_document",
      sourceId: String(documentId),
      entryDate: input.date,
      currency,
      fxRate,
      context: input.paymentMethod ? { paymentMethod: input.paymentMethod } : {},
      measures,
      memo: `Factura ${allocation.ncf}`,
      postedBy: input.postedBy,
    };

    const posted = await this.ledger.post(event, "invoice");

    await this.client.query(`UPDATE fiscal_documents SET journal_entry_id=$1 WHERE id=$2`, [
      posted.entryId,
      documentId,
    ]);

    const cogsTotal = input.bookCogs
      ? await this.bookCogsForSale(input.companyId, documentId, input.date, input.lines, input.warehouseId ?? 0, input.postedBy)
      : undefined;

    return {
      documentId,
      ncf: allocation.ncf,
      journalEntryId: posted.entryId,
      entryNo: posted.entryNo,
      total: breakdown.total,
      cogsTotal,
    };
  }

  /**
   * Recognises COGS for a sale by issuing each tracked line from inventory at
   * weighted-average cost. A product with no valuation row is untracked (a
   * service, or never received) and is skipped rather than blocking the sale.
   * Runs in the invoice's transaction, so revenue and its cost commit together.
   */
  private async bookCogsForSale(
    companyId: number,
    documentId: number,
    date: string,
    lines: IssueLineInput[],
    warehouseId: number,
    postedBy?: number,
  ): Promise<Decimal> {
    const costing = new InventoryCosting(this.client);
    let cogsTotal: Decimal = "0";
    for (const line of lines) {
      if (!line.productId) continue;
      const quantity = toMoney(line.quantity);
      if (isZero(quantity)) continue;
      // Tracked in *this* warehouse: a product stocked elsewhere carries no cost
      // to release here, and the sale must not be blocked by that.
      const tracked = await this.client.query(
        `SELECT 1 FROM inventory_valuation WHERE company_id=$1 AND product_id=$2 AND warehouse_id=$3`,
        [companyId, line.productId, warehouseId],
      );
      if (tracked.rows.length === 0) continue;
      const { cogs } = await costing.issue({
        companyId,
        productId: line.productId,
        date,
        quantity: line.quantity,
        warehouseId,
        sourceType: "fiscal_document",
        sourceId: String(documentId),
        postedBy,
      });
      cogsTotal = add(cogsTotal, cogs);
    }
    return cogsTotal;
  }

  /**
   * Issues a credit note (nota de crédito) against an issued invoice.
   *
   * A credit note reverses part or all of a sale: it allocates its own NCF
   * (B04, or e-CF E34), references the original via `modifies_ncf`, and posts the
   * mirror of the sale — reducing revenue and the ITBIS payable, and crediting
   * cash or the receivable. It appears on the 607 as a negative-effect document.
   *
   * `lines` describe what is being credited; if omitted, the whole original
   * invoice is credited. Amounts are validated by the tax engine exactly as a
   * sale, so a partial credit note computes its own ITBIS.
   */
  async issueCreditNote(input: {
    companyId: number;
    issuerRnc: string;
    ncfType: string; // B04 / E34
    date: string;
    modifiesDocId: number;
    lines: IssueLineInput[];
    paymentMethod?: string;
    postedBy?: number;
    /** Put returned goods back in inventory at the cost they were sold at. */
    restockInventory?: boolean;
  }): Promise<IssuedDocument> {
    const original = await this.client.query(
      `SELECT ncf, buyer_rnc, buyer_name, customer_id, currency FROM fiscal_documents
        WHERE id=$1 AND company_id=$2 AND doc_type='invoice'`,
      [input.modifiesDocId, input.companyId],
    );
    if (original.rows.length === 0) throw new Error("factura original no encontrada");
    const orig = original.rows[0];

    const breakdown = await this.taxes.compute(input.lines, {
      companyId: input.companyId,
      date: input.date,
      applyRetentions: false,
    });
    const allocation = await allocateNcf(this.client, input.companyId, input.ncfType);
    const itbisTotal = sum([breakdown.itbis18, breakdown.itbis16, breakdown.itbis0]);
    const revenue = add(breakdown.subtotalTaxed, breakdown.subtotalExempt);

    const doc = await this.client.query(
      `INSERT INTO fiscal_documents
         (company_id, doc_type, ncf, ncf_type, is_ecf, modifies_ncf, modifies_doc_id,
          issuer_rnc, buyer_rnc, buyer_name, customer_id, currency, fx_rate,
          subtotal_taxed, subtotal_exempt, itbis_18, itbis_16, itbis_0, total,
          status, ecf_status, emitted_at)
       VALUES ($1,'credit_note',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,
               $12,$13,$14,$15,$16,$17,'issued',$18, now())
       RETURNING id`,
      [
        input.companyId,
        allocation.ncf,
        input.ncfType,
        allocation.isEcf,
        orig.ncf,
        input.modifiesDocId,
        input.issuerRnc,
        orig.buyer_rnc,
        orig.buyer_name,
        orig.customer_id,
        orig.currency,
        toMoney(breakdown.subtotalTaxed),
        toMoney(breakdown.subtotalExempt),
        toMoney(breakdown.itbis18),
        toMoney(breakdown.itbis16),
        toMoney(breakdown.itbis0),
        toMoney(breakdown.total),
        allocation.isEcf ? "pendiente" : null,
      ],
    );
    const documentId = Number(doc.rows[0].id);

    for (const [i, line] of input.lines.entries()) {
      const computed = breakdown.lines[i];
      await this.client.query(
        `INSERT INTO fiscal_document_lines
           (document_id, company_id, line_no, product_id, description, quantity, unit_price,
            discount, tax_code, itbis_rate, itbis_amount, line_total, is_exempt)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          documentId,
          input.companyId,
          i + 1,
          line.productId ?? null,
          line.description,
          toMoney(line.quantity),
          toMoney(line.unitPrice),
          toMoney(line.discount ?? "0"),
          computed.taxCode,
          computed.itbisRate,
          toMoney(computed.itbisAmount),
          toMoney(computed.lineTotal),
          computed.isExempt,
        ],
      );
    }

    // Negative measures: the engine swaps sides, so revenue is debited and cash
    // credited — the reversal of the original sale.
    const measures: EventMeasure[] = [{ role: "revenue", amount: "-" + toMoney(revenue), memo: "Nota de crédito" }];
    if (!isZero(itbisTotal)) measures.push({ role: "itbis", amount: "-" + toMoney(itbisTotal), memo: "ITBIS NC" });

    const posted = await this.ledger.post(
      {
        companyId: input.companyId,
        eventType: "pos_sale",
        sourceType: "fiscal_document",
        sourceId: String(documentId),
        entryDate: input.date,
        currency: orig.currency,
        context: input.paymentMethod ? { paymentMethod: input.paymentMethod } : {},
        measures,
        memo: `Nota de crédito ${allocation.ncf}`,
        postedBy: input.postedBy,
      },
      "credit_note",
    );
    await this.client.query(`UPDATE fiscal_documents SET journal_entry_id=$1 WHERE id=$2`, [posted.entryId, documentId]);

    if (input.restockInventory) {
      await this.restockFromReturn(input.companyId, input.modifiesDocId, documentId, input.date, input.lines, input.postedBy);
    }

    return { documentId, ncf: allocation.ncf, journalEntryId: posted.entryId, entryNo: posted.entryNo, total: breakdown.total };
  }

  /**
   * Returns credited goods to stock at the unit cost they were sold at — read
   * from the original invoice's COGS movement, in numeric, so no money passes
   * through a float. A line whose product carried no cost on the original sale is
   * skipped (nothing to put back).
   */
  private async restockFromReturn(
    companyId: number,
    originalDocId: number,
    creditNoteId: number,
    date: string,
    lines: IssueLineInput[],
    postedBy?: number,
  ): Promise<void> {
    const costing = new InventoryCosting(this.client);
    for (const line of lines) {
      if (!line.productId) continue;
      // Cost and warehouse both come from the original sale's issue: the goods go
      // back where they came from, at what they left for.
      const orig = await this.client.query(
        `SELECT round(sum(total_cost) / nullif(sum(quantity), 0), 8)::text AS unit_cost,
                max(warehouse_id) AS warehouse_id
           FROM inventory_cost_movements
          WHERE company_id=$1 AND kind='issue' AND source_type='fiscal_document'
            AND source_id=$2 AND product_id=$3`,
        [companyId, String(originalDocId), line.productId],
      );
      const unitCost = orig.rows[0]?.unit_cost as string | null;
      if (!unitCost) continue;
      await costing.returnToStock({
        companyId,
        productId: line.productId,
        date,
        quantity: line.quantity,
        unitCost,
        warehouseId: Number(orig.rows[0].warehouse_id ?? 0),
        sourceType: "credit_note",
        sourceId: String(creditNoteId),
        postedBy,
      });
    }
  }

  /**
   * Cancels an issued document and reverses its journal entry.
   *
   * The NCF is not reused. Its number now belongs to a cancelled comprobante and
   * is reported on Form 608; handing it to another sale would put two documents
   * under one number in DGII's records.
   */
  async cancel(documentId: number, reason: string, postedBy?: number): Promise<void> {
    const { rows } = await this.client.query(
      `SELECT id, status, journal_entry_id FROM fiscal_documents WHERE id=$1`,
      [documentId],
    );
    if (rows.length === 0) throw new Error(`fiscal document ${documentId} not found`);
    if (rows[0].status === "cancelled") throw new Error(`document ${documentId} is already cancelled`);

    if (rows[0].journal_entry_id) {
      await this.ledger.reverse(Number(rows[0].journal_entry_id), reason, postedBy);
    }

    await this.client.query(
      `UPDATE fiscal_documents
          SET status='cancelled', ecf_status = CASE WHEN is_ecf THEN 'anulado'::ecf_status ELSE ecf_status END
        WHERE id=$1`,
      [documentId],
    );

    await this.client.query(
      `INSERT INTO fiscal_document_events (document_id, from_status, to_status, direction, dgii_message)
       VALUES ($1,'issued','cancelled','out',$2)`,
      [documentId, reason],
    );
  }
}
