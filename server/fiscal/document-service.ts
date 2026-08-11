import { SqlClient, AccountingEvent, EventMeasure } from "../accounting/types";
import { PostingEngine } from "../accounting/posting-engine";
import { Decimal, add, sum, isZero, toMoney } from "../accounting/decimal";
import { InventoryCosting } from "../inventory/costing";
import { consumePlacements, warehouseConfig, putaway, inboundBin } from "../inventory/wms";
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
  /**
   * Bins the picker actually drew from. When absent, a WMS warehouse picks in
   * its own rotation order (FEFO or FIFO) — which is the normal case: the
   * cashier rings up a sale and the system decides which box left.
   */
  pickFrom?: { placementId: number; quantity: Decimal }[];
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
    // Where the goods physically are, when the warehouse tracks it. The sale
    // drains the bins in the same rotation the cost layers are drained in, so
    // the box that leaves the shelf is the box whose cost was recognised.
    const wms = await warehouseConfig(this.client, warehouseId);
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

      if (wms.wmsEnabled) {
        await consumePlacements(this.client, {
          companyId,
          productId: line.productId,
          warehouseId,
          quantity: line.quantity,
          rotation: wms.rotationPolicy,
          allocations: line.pickFrom,
          // A shelf that cannot cover a sale the valuation says is coverable is a
          // real discrepancy, but it is not a reason to refuse the customer at
          // the counter. The pick takes what it finds and the drift report
          // surfaces the rest for the next count.
          allowPartial: true,
          sourceType: "fiscal_document",
          sourceId: String(documentId),
          userId: postedBy,
        });
      }

      const { cogs } = await costing.issue({
        companyId,
        productId: line.productId,
        date,
        quantity: line.quantity,
        warehouseId,
        rotation: wms.rotationPolicy,
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
    /**
     * Exige que cada línea acreditada corresponda a un producto y precio de la
     * factura original. Lo pide la devolución de mercancía; una nota de crédito
     * por ajuste de precio o descuento posterior no tiene por qué cumplirlo.
     */
    matchInvoiceLines?: boolean;
  }): Promise<IssuedDocument> {
    const original = await this.client.query(
      `SELECT ncf, buyer_rnc, buyer_name, customer_id, currency FROM fiscal_documents
        WHERE id=$1 AND company_id=$2 AND doc_type='invoice'`,
      [input.modifiesDocId, input.companyId],
    );
    if (original.rows.length === 0) throw new Error("factura original no encontrada");
    const orig = original.rows[0];

    await this.assertCreditable(input.companyId, input.modifiesDocId, input.lines, {
      matchInvoiceLines: input.matchInvoiceLines,
    });

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
   * Issues a debit note (nota de débito, B03 / E33).
   *
   * Aumenta el saldo del cliente contra una factura existente: recargos por
   * mora, ajustes de precio hacia arriba, cargos por flete no incluidos en el
   * comprobante original. La forma es simétrica a la NC pero sin swap: se
   * asigna NCF (B03 o E33), se referencia la factura original, se postea
   * revenue+ITBIS positivos. No devuelve mercancía al inventario.
   *
   * A diferencia de la NC, aquí no hay tope por la cantidad facturada: un
   * débito puede exceder el total original (por ejemplo, una mora del 10% se
   * calcula sobre un saldo ya crecido). Queda del lado del llamador validar
   * que exista razón comercial para el débito.
   */
  async issueDebitNote(input: {
    companyId: number;
    issuerRnc: string;
    ncfType: string; // B03 / E33
    date: string;
    modifiesDocId: number;
    lines: IssueLineInput[];
    paymentMethod?: string;
    postedBy?: number;
    reason?: string;
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
       VALUES ($1,'debit_note',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,
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

    // Débito: signos positivos — se aumenta revenue e ITBIS, se debita al
    // cliente. La cuenta bancaria/caja no se toca hasta que cobre.
    const measures: EventMeasure[] = [
      { role: "revenue", amount: toMoney(revenue), memo: input.reason ?? "Nota de débito" },
    ];
    if (!isZero(itbisTotal)) {
      measures.push({ role: "itbis", amount: toMoney(itbisTotal), memo: "ITBIS ND" });
    }

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
        memo: `Nota de débito ${allocation.ncf}`,
        postedBy: input.postedBy,
      },
      "debit_note",
    );
    await this.client.query(`UPDATE fiscal_documents SET journal_entry_id=$1 WHERE id=$2`, [posted.entryId, documentId]);

    return { documentId, ncf: allocation.ncf, journalEntryId: posted.entryId, entryNo: posted.entryNo, total: breakdown.total };
  }

  /**
   * What is still creditable on an invoice: what was sold, less what previous
   * credit notes already took back.
   *
   * Matching is by product where there is one, and by description where there is
   * not — a service line has no `product_id`, and refusing to credit it because
   * of that would be worse than matching on its text.
   */
  async creditableBalance(
    companyId: number,
    invoiceId: number,
  ): Promise<{
    invoice: { id: number; ncf: string | null; buyerName: string | null; total: string; emittedAt: string | null };
    lines: Array<{
      lineNo: number;
      productId: number | null;
      description: string;
      unitPrice: string;
      taxCode: string | null;
      invoicedQty: string;
      creditedQty: string;
      remainingQty: string;
    }>;
  }> {
    const head = await this.client.query(
      `SELECT id, ncf, buyer_name, total::text, emitted_at, status
         FROM fiscal_documents
        WHERE id=$1 AND company_id=$2 AND doc_type='invoice'`,
      [invoiceId, companyId],
    );
    if (head.rows.length === 0) throw new Error("factura no encontrada");
    if (head.rows[0].status === "cancelled") {
      throw new Error("la factura está anulada: no admite notas de crédito");
    }

    const { rows } = await this.client.query(
      // Se agrupa por (producto, precio), no por línea.
      //
      // Una factura puede traer el mismo producto en dos líneas, y lo acreditado
      // se acumula por producto: repartirlo línea por línea le pegaría el total
      // devuelto a *cada* una, mostrando menos disponible del que hay y
      // bloqueando una devolución legítima.
      //
      // El precio entra en la llave porque el mismo producto vendido a dos
      // precios son dos cosas distintas para acreditar, y la línea de la nota de
      // crédito trae su propio precio: con él el emparejamiento es exacto en vez
      // de repartido a ojo.
      `WITH sold AS (
         SELECT min(l.line_no)   AS line_no,
                l.product_id,
                min(l.description) AS description,
                l.unit_price,
                min(l.tax_code)  AS tax_code,
                sum(l.quantity)  AS quantity
           FROM fiscal_document_lines l
          WHERE l.document_id=$1 AND l.company_id=$2
          GROUP BY l.product_id, l.unit_price,
                   -- Las líneas de servicio no tienen producto: ahí la
                   -- descripción es lo único que las identifica.
                   CASE WHEN l.product_id IS NULL THEN l.description ELSE '' END
       ),
       credited AS (
         SELECT cl.product_id, cl.unit_price,
                CASE WHEN cl.product_id IS NULL THEN cl.description ELSE '' END AS descr_key,
                sum(cl.quantity) AS qty
           FROM fiscal_document_lines cl
           JOIN fiscal_documents cd
             ON cd.id = cl.document_id
            AND cd.company_id = $2
            AND cd.doc_type = 'credit_note'
            AND cd.status <> 'cancelled'
            AND cd.modifies_doc_id = $1
          GROUP BY cl.product_id, cl.unit_price,
                   CASE WHEN cl.product_id IS NULL THEN cl.description ELSE '' END
       )
       SELECT s.line_no, s.product_id, s.description, s.unit_price::text, s.tax_code,
              s.quantity::text                                   AS invoiced_qty,
              coalesce(c.qty, 0)::text                            AS credited_qty,
              greatest(s.quantity - coalesce(c.qty, 0), 0)::text  AS remaining_qty
         FROM sold s
         LEFT JOIN credited c
           ON c.unit_price = s.unit_price
          AND c.product_id IS NOT DISTINCT FROM s.product_id
          AND c.descr_key = CASE WHEN s.product_id IS NULL THEN s.description ELSE '' END
        ORDER BY s.line_no`,
      [invoiceId, companyId],
    );

    return {
      invoice: {
        id: Number(head.rows[0].id),
        ncf: head.rows[0].ncf,
        buyerName: head.rows[0].buyer_name,
        total: head.rows[0].total,
        emittedAt: head.rows[0].emitted_at ? new Date(head.rows[0].emitted_at).toISOString() : null,
      },
      lines: rows.map((r: any) => ({
        lineNo: r.line_no,
        productId: r.product_id,
        description: r.description,
        unitPrice: r.unit_price,
        taxCode: r.tax_code,
        invoicedQty: r.invoiced_qty,
        creditedQty: r.credited_qty,
        remainingQty: r.remaining_qty,
      })),
    };
  }

  /**
   * Refuses a credit note that would take back more than was sold.
   *
   * Two checks, and the distinction matters.
   *
   * **Siempre**: the money. The credited base, plus everything previous credit
   * notes already took back, cannot exceed what the invoice charged. This holds
   * for every kind of credit note — a return, a price adjustment, a discount
   * granted after the fact — because none of them can give back more than was
   * charged. Without it, nothing stopped a nota de crédito of 100 units against
   * an invoice for 10: revenue and ITBIS reversed that were never collected, and
   * a negative on the 607 the original sale cannot support.
   *
   * **Sólo cuando se pide** (`matchInvoiceLines`): line identity. A merchandise
   * return credits *the same products* that were sold, so the returns screen
   * asks for the per-product, per-price check. But a credit note is not always a
   * return — "Descuento acordado" for RD$400 against an invoice of "Producto A"
   * is legitimate and matches no line. Making line identity universal would
   * outlaw it.
   *
   * Both run before the NCF is allocated, so a rejected credit note burns no
   * number.
   */
  private async assertCreditable(
    companyId: number,
    invoiceId: number,
    lines: IssueLineInput[],
    opts: { matchInvoiceLines?: boolean } = {},
  ): Promise<void> {
    // ── el dinero, siempre ────────────────────────────────────────────────
    const totals = await this.client.query(
      `SELECT
         (SELECT coalesce(sum(line_total),0) FROM fiscal_document_lines
           WHERE document_id=$1 AND company_id=$2)::text AS invoiced,
         (SELECT coalesce(sum(cl.line_total),0)
            FROM fiscal_document_lines cl
            JOIN fiscal_documents cd ON cd.id = cl.document_id
           WHERE cd.company_id=$2 AND cd.doc_type='credit_note'
             AND cd.status <> 'cancelled' AND cd.modifies_doc_id=$1)::text AS credited`,
      [invoiceId, companyId],
    );
    const invoiced = Number(totals.rows[0].invoiced);
    const credited = Number(totals.rows[0].credited);
    const asking = lines.reduce(
      (n, l) => n + Number(l.quantity) * Number(l.unitPrice) - Number(l.discount ?? 0),
      0,
    );

    if (credited + asking > invoiced + 0.01) {
      const left = Math.max(invoiced - credited, 0);
      throw new Error(
        credited > 0
          ? `la factura es de ${invoiced.toFixed(2)} y ya se acreditaron ${credited.toFixed(2)}; ` +
            `quedan ${left.toFixed(2)} por acreditar y se piden ${asking.toFixed(2)}`
          : `la factura es de ${invoiced.toFixed(2)} y se piden acreditar ${asking.toFixed(2)}`,
      );
    }

    if (!opts.matchInvoiceLines) return;

    // ── la identidad de las líneas, sólo para devoluciones ────────────────
    const { lines: balance } = await this.creditableBalance(companyId, invoiceId);

    // Se acumula por línea entrante: dos líneas del mismo producto en una misma
    // nota tienen que sumarse antes de comparar, o cada una pasaría sola. La
    // llave incluye el precio, igual que el saldo acreditable: el mismo producto
    // a dos precios son dos cosas distintas para acreditar.
    const keyOf = (productId: number | null | undefined, description: string, unitPrice: string) =>
      `${productId != null ? `p:${productId}` : `d:${description}`}@${Number(unitPrice).toFixed(4)}`;

    const asked = new Map<string, { qty: Decimal; label: string }>();
    for (const line of lines) {
      const key = keyOf(line.productId, line.description, line.unitPrice);
      const prev = asked.get(key);
      asked.set(key, {
        qty: prev ? add(prev.qty, toMoney(line.quantity)) : toMoney(line.quantity),
        label: line.description,
      });
    }

    for (const [key, want] of asked) {
      const match = balance.find(
        (b) => keyOf(b.productId, b.description, b.unitPrice) === key,
      );
      if (!match) {
        // Distinguir "no está en la factura" de "está, pero a otro precio":
        // el segundo caso es un precio mal tecleado, y decir que el producto no
        // existe manda a buscar en el lugar equivocado.
        const samething = balance.filter(
          (b) => (b.productId != null ? `p:${b.productId}` : `d:${b.description}`) === key.split("@")[0],
        );
        if (samething.length > 0) {
          throw new Error(
            `"${want.label}": la factura lo tiene a ${samething
              .map((b) => Number(b.unitPrice).toFixed(2))
              .join(" y ")}, no al precio indicado`,
          );
        }
        throw new Error(
          `"${want.label}" no aparece en la factura original y no puede acreditarse`,
        );
      }
      if (Number(want.qty) > Number(match.remainingQty) + 0.0001) {
        const credited = Number(match.creditedQty);
        throw new Error(
          credited > 0
            ? `"${want.label}": se facturaron ${match.invoicedQty}, ya se acreditaron ${match.creditedQty}; ` +
              `quedan ${match.remainingQty} por acreditar y se piden ${want.qty}`
            : `"${want.label}": la factura tiene ${match.invoicedQty} y se piden acreditar ${want.qty}`,
        );
      }
    }
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
      const warehouseId = Number(orig.rows[0].warehouse_id ?? 0);
      const { lotId } = await costing.returnToStock({
        companyId,
        productId: line.productId,
        date,
        quantity: line.quantity,
        unitCost,
        warehouseId,
        sourceType: "credit_note",
        sourceId: String(creditNoteId),
        postedBy,
      });

      // Returned goods land at the receiving dock, not back on the picking face:
      // nobody has inspected them yet, and a warehouse that wants them checked
      // before resale marks that bin non-pickable and the rotation skips it. With
      // no dock bin defined the goods are valued but unplaced, and the drift
      // report is what says so.
      const bin = await inboundBin(this.client, companyId, warehouseId);
      if (!bin) continue;
      await putaway(this.client, {
        companyId,
        productId: line.productId,
        warehouseId,
        receivedDate: date,
        unitCost,
        lotId,
        sourceType: "credit_note",
        sourceId: String(creditNoteId),
        userId: postedBy,
        lines: [{ locationId: bin, quantity: line.quantity }],
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
