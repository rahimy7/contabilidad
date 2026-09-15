import { SqlClient } from "../accounting/types";
import { PostingEngine } from "../accounting/posting-engine";
import { TaxCalculator } from "../fiscal/tax-calculator";
import { InventoryCosting, CostingMethod } from "../inventory/costing";
import { putaway, warehouseConfig } from "../inventory/wms";
import { FixedAssets } from "../modules/fixed-assets";
import { Treasury } from "../treasury/banks";
import { Decimal, add, sub, mul, sum, cmp, isNegative, isZero, roundTo, toMoney } from "../accounting/decimal";

/**
 * Accounts payable, and the supplier invoice that opens it.
 *
 * Registering a supplier invoice does three things at once: it records the
 * fiscal document (which the 606 reports), it opens an AP item, and it posts to
 * the ledger — Dr Inventory/expense + Dr ITBIS adelantado, Cr Proveedores, less
 * any retentions we withhold. A payment later applies against open items and
 * posts Dr Proveedores / Cr Cash.
 *
 * The AP control account (Proveedores, 2.1.01.001) equals the sum of open
 * balances, the mirror of the AR invariant.
 */
export class PayablesError extends Error {}

export interface SupplierInvoiceLine {
  description: string;
  quantity: Decimal;
  unitPrice: Decimal;
  discount?: Decimal;
  taxCode: string;
  /** The catalog product this line buys; required to feed inventory costing. */
  productId?: number;
  /** Supplier batch and expiry, carried into the cost layer so FEFO can sort it. */
  lotNo?: string;
  expirationDate?: string | null;
  /**
   * Which bins the goods go into, for a warehouse using WMS. Splitting one
   * receipt across several is normal — a pallet to the racking, a case to the
   * picking face — and the quantities must add up to the line, or the shelves
   * and the valuation start the day already disagreeing.
   */
  locations?: { locationId: number; quantity: Decimal; lotNo?: string; expirationDate?: string | null }[];
  /**
   * The purchase-order line this invoice line bills. The line is then matched
   * against what was received for it: the received cost clears "recepciones por
   * facturar" and the difference is a purchase price variance. The goods were
   * already valued on receipt, so a matched line never receives stock again.
   */
  purchaseOrderItemId?: number;
}

export interface RegisterSupplierInvoiceInput {
  companyId: number;
  supplierId?: number;
  supplierRnc: string;
  /** The supplier's NCF (their B01/B11…), reported on the 606. */
  ncf: string;
  ncfType: string;
  date: string;
  dueDate: string;
  lines: SupplierInvoiceLine[];
  counterpartyType?: "persona_fisica" | "persona_juridica";
  operationType?: "bienes" | "servicios";
  /** Withhold ITBIS/ISR from the supplier per the company's retention rules. */
  applyRetentions?: boolean;
  /**
   * IR-17 concept for the ISR withheld (alquileres, honorarios, dividendos…).
   * Defaults from the operation type; only meaningful when ISR is withheld.
   */
  retentionConcept?: string;
  /**
   * What the purchase buys, which routes the goods debit: merchandise for resale
   * (default), a consumable supply, a fixed asset, or a service/expense. A
   * consumable never lands in the sale-inventory account, and a fixed asset can
   * open its own record in the register.
   */
  purchaseType?: "inventory" | "supply" | "fixed_asset" | "service" | "expense" | "landed_cost";
  /** When `purchaseType` is 'fixed_asset', also open the asset (cost = goods). */
  fixedAsset?: {
    code: string; name: string; usefulLifeMonths: number; residualValue?: Decimal; category?: string;
    /** Asset class account: 1.2.01.001 mobiliario (default), 1.2.01.002 vehículos, 1.2.01.004 cómputo. */
    assetAccount?: string;
  };
  /** The purchase order this invoice bills, for the three-way match. */
  purchaseOrderId?: number;
  /**
   * For a service or expense purchase: the expense account it lands in —
   * alquileres (5.2.02.001), servicios públicos (.002), honorarios (.003),
   * útiles (.004), fletes (.005), comisiones bancarias (5.3.01.002).
   */
  expenseAccountCode?: string;
  /** DGII 606 "tipo de bienes y servicios" (01–11). Defaults from the supplier, then '09'. */
  dgiiExpenseType?: string;
  /**
   * Feed inventory costing from the purchase: each line with a `productId`
   * receives stock at its line cost. Only merchandise for resale is costed. The
   * AP posting already debits Inventory, so the receipt re-values only.
   */
  receiveToInventory?: boolean;
  /** Costing method to set on a product's first receipt (default average). */
  inventoryMethod?: CostingMethod;
  /** Warehouse the goods are received into; 0 = the company's single store. */
  warehouseId?: number;
  currency?: string;
  postedBy?: number;
}

export class Payables {
  constructor(private readonly client: SqlClient) {}

  async registerInvoice(
    input: RegisterSupplierInvoiceInput,
  ): Promise<{ documentId: number; openItemId: number; journalEntryId: number; total: Decimal }> {
    if (input.lines.length === 0) throw new PayablesError("una factura de compra necesita al menos una línea");

    // What the supplier master already knows need not be typed on every invoice.
    const supplier = input.supplierId
      ? (await this.client.query(
          `SELECT counterparty_type, default_operation_type, default_expense_type, tax_id FROM suppliers WHERE id=$1`,
          [input.supplierId],
        )).rows[0]
      : undefined;
    const counterpartyType = input.counterpartyType ?? supplier?.counterparty_type ?? undefined;
    const operationType = input.operationType ?? supplier?.default_operation_type ?? undefined;

    const breakdown = await new TaxCalculator(this.client).compute(input.lines, {
      companyId: input.companyId,
      date: input.date,
      counterpartyType,
      operationType,
      applyRetentions: input.applyRetentions ?? false,
    });

    const currency = input.currency ?? "DOP";
    const itbis = sum([breakdown.itbis18, breakdown.itbis16, breakdown.itbis0]);
    const goods = add(breakdown.subtotalTaxed, breakdown.subtotalExempt);
    const retentions = add(breakdown.retentionItbis, breakdown.retentionIsr);
    // The document's face value (MontoTotal on the 606) is gross + ITBIS + tip,
    // before retentions. `breakdown.total` is already net of retentions, so it is
    // the payable, not the invoice total — the two differ exactly by what we
    // withhold to remit to DGII.
    const invoiceTotal = sum([goods, itbis, breakdown.tipLegal]);
    const payable = sub(invoiceTotal, retentions);

    // Classify the ISR withheld for the IR-17, but only when there is any: a
    // purchase with no ISR retention has no IR-17 box to land in.
    const retentionConcept = isZero(breakdown.retentionIsr)
      ? null
      : input.retentionConcept ?? (operationType === "servicios" ? "honorarios" : "otras_rentas");

    // The purchase fiscal document (doc_type='purchase') is what the 606 reads.
    const doc = await this.client.query(
      `INSERT INTO fiscal_documents
         (company_id, doc_type, ncf, ncf_type, issuer_rnc, supplier_id, currency, fx_rate,
          subtotal_taxed, subtotal_exempt, itbis_18, itbis_16, itbis_0,
          retention_itbis, retention_isr, retention_concept, total, status, emitted_at, due_date, document_date,
          purchase_order_id, dgii_expense_type)
       VALUES ($1,'purchase',$2,$3,$4,$5,$6,1,
               $7,$8,$9,$10,$11,$12,$13,$14,$15,'issued',now(),$17,$16::date,$18,$19)
       RETURNING id`,
      [
        input.companyId,
        input.ncf,
        input.ncfType,
        input.supplierRnc,
        input.supplierId ?? null,
        currency,
        toMoney(breakdown.subtotalTaxed),
        toMoney(breakdown.subtotalExempt),
        toMoney(breakdown.itbis18),
        toMoney(breakdown.itbis16),
        toMoney(breakdown.itbis0),
        toMoney(breakdown.retentionItbis),
        toMoney(breakdown.retentionIsr),
        retentionConcept,
        toMoney(invoiceTotal),
        input.date,
        input.dueDate,
        input.purchaseOrderId ?? null,
        input.dgiiExpenseType ?? supplier?.default_expense_type ?? null,
      ],
    );
    const documentId = Number(doc.rows[0].id);
    await this.insertLines(input.companyId, documentId, input.lines, breakdown.lines);

    // Three-way match: lines billing a purchase order clear what was received
    // for them; only the rest is a fresh purchase that debits the goods account.
    const match = await this.matchReceipts(input, documentId, breakdown.lines.map((l) => l.lineTotal));
    const unmatchedGoods = sub(goods, match.invoiced);

    // Post: Dr Inventory (goods) + Dr ITBIS adelantado, Cr Proveedores,
    // Dr Proveedores for any retention (it reduces what we owe).
    const measures: { role: string; amount: Decimal; memo: string }[] = [];
    if (!isZero(unmatchedGoods)) measures.push({ role: "inventory", amount: toMoney(unmatchedGoods), memo: "Compra" });
    if (!isZero(match.received)) measures.push({ role: "grni_clear", amount: toMoney(match.received), memo: "Recepciones facturadas" });
    if (!isZero(match.variance)) measures.push({ role: "price_variance", amount: toMoney(match.variance), memo: "Diferencia de precio" });
    if (!isZero(itbis)) measures.push({ role: "itbis_credit", amount: toMoney(itbis), memo: "ITBIS adelantado" });
    if (!isZero(breakdown.retentionIsr))
      measures.push({ role: "retention_isr", amount: toMoney(breakdown.retentionIsr), memo: "ISR retenido" });
    if (!isZero(breakdown.retentionItbis))
      measures.push({ role: "retention_itbis", amount: toMoney(breakdown.retentionItbis), memo: "ITBIS retenido" });

    const purchaseType = input.purchaseType ?? "inventory";
    const posted = await new PostingEngine(this.client).post(
      {
        companyId: input.companyId,
        eventType: "purchase",
        sourceType: "purchase_document",
        sourceId: String(documentId),
        entryDate: input.date,
        currency,
        // The goods debit routes on this; itbis_credit and retentions ignore it.
        context: {
          purchaseType,
          ...(input.fixedAsset?.assetAccount ? { assetAccount: input.fixedAsset.assetAccount } : {}),
          ...(input.expenseAccountCode ? { expenseAccount: input.expenseAccountCode } : {}),
        },
        measures,
        memo: `Compra ${input.ncf}`,
        postedBy: input.postedBy,
      },
      "invoice",
    );
    await this.client.query(`UPDATE fiscal_documents SET journal_entry_id=$1 WHERE id=$2`, [posted.entryId, documentId]);

    // Payable = invoice face value minus what we withhold (computed above).
    const item = await this.client.query(
      `INSERT INTO ap_open_items
         (company_id, supplier_id, document_id, issue_date, due_date, currency, original_amount, balance, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,'open') RETURNING id`,
      [input.companyId, input.supplierId ?? null, documentId, input.date, input.dueDate, currency, toMoney(payable)],
    );

    // Feed the stock ledger for anything held in stock — merchandise for sale and
    // consumable supplies, each into its own control account. The AP entry already
    // debited that account, so each receipt re-values (post: false), no second entry.
    const stockAccount =
      purchaseType === "inventory" ? "1.1.03.001" : purchaseType === "supply" ? "1.1.03.002" : null;
    if (input.receiveToInventory && stockAccount && input.lines.some((l) => l.purchaseOrderItemId)) {
      throw new PayablesError("las líneas de una orden de compra ya entraron al inventario al recibirse: no use receiveToInventory");
    }
    if (input.receiveToInventory && stockAccount) {
      const costing = new InventoryCosting(this.client);
      const wms = await warehouseConfig(this.client, input.warehouseId ?? 0);
      for (const [i, line] of input.lines.entries()) {
        if (!line.productId) continue;
        const { lotId } = await costing.receive({
          companyId: input.companyId,
          productId: line.productId,
          date: input.date,
          quantity: line.quantity,
          unitCost: line.unitPrice,
          // The cost basis is the line net of its discount — exactly what the
          // entry above debited to the stock account. Valuing at the undiscounted
          // unit price would leave the subledger above the ledger by the discount.
          totalCost: breakdown.lines[i].lineTotal,
          method: input.inventoryMethod,
          inventoryAccountRef: stockAccount,
          warehouseId: input.warehouseId ?? 0,
          lotNo: line.lotNo,
          expirationDate: line.expirationDate,
          post: false,
          sourceType: "purchase_document",
          sourceId: String(documentId),
          postedBy: input.postedBy,
        });

        // File the goods into their bins in the same transaction that valued
        // them, so the placements and the valuation are never apart. A warehouse
        // that requires a location and did not get one stops the whole invoice —
        // receiving stock nobody can find is worse than not receiving it.
        if (!wms.wmsEnabled) continue;
        const lines = line.locations?.length
          ? line.locations
          : wms.requireLocationOnReceipt
            ? (() => {
                throw new PayablesError(
                  `el almacén exige ubicación al recibir y la línea "${line.description}" no indica ninguna`,
                );
              })()
            : [];
        if (lines.length === 0) continue;
        await putaway(this.client, {
          companyId: input.companyId,
          productId: line.productId,
          warehouseId: input.warehouseId ?? 0,
          receivedDate: input.date,
          unitCost: line.unitPrice,
          lotId,
          sourceType: "purchase_document",
          sourceId: String(documentId),
          userId: input.postedBy,
          lines: lines.map((l) => ({
            locationId: l.locationId,
            quantity: l.quantity,
            lotNo: l.lotNo ?? line.lotNo ?? null,
            expirationDate: l.expirationDate ?? line.expirationDate ?? null,
          })),
        });
      }
    }

    // A fixed-asset purchase opens the asset. The AP entry already debited the
    // asset account (via the purchaseType routing), so this only records it for
    // the depreciation schedule — its cost is the goods amount.
    if (purchaseType === "fixed_asset" && input.fixedAsset) {
      await new FixedAssets(this.client).register({
        companyId: input.companyId,
        code: input.fixedAsset.code,
        name: input.fixedAsset.name,
        category: input.fixedAsset.category,
        acquisitionDate: input.date,
        cost: goods,
        residualValue: input.fixedAsset.residualValue,
        usefulLifeMonths: input.fixedAsset.usefulLifeMonths,
        assetAccountCode: input.fixedAsset.assetAccount,
      });
    }

    return { documentId, openItemId: Number(item.rows[0].id), journalEntryId: posted.entryId, total: invoiceTotal };
  }

  /**
   * Matches purchase-order lines on an invoice against their uninvoiced receipt
   * lines, oldest delivery first. Returns the received value it cleared, the
   * invoiced value of those lines, and the variance between the two.
   */
  private async matchReceipts(
    input: RegisterSupplierInvoiceInput,
    documentId: number,
    lineTotals: Decimal[],
  ): Promise<{ received: Decimal; invoiced: Decimal; variance: Decimal }> {
    let received: Decimal = "0";
    let invoiced: Decimal = "0";
    const poLines = input.lines.map((l, i) => ({ l, total: lineTotals[i] })).filter((x) => x.l.purchaseOrderItemId);
    if (poLines.length === 0) return { received, invoiced, variance: "0" };
    if (!input.purchaseOrderId) throw new PayablesError("indique la orden de compra de las líneas a casar");

    for (const { l, total } of poLines) {
      const item = await this.client.query(
        `SELECT id FROM purchase_order_items WHERE id=$1 AND purchase_order_id=$2`,
        [l.purchaseOrderItemId, input.purchaseOrderId],
      );
      if (item.rows.length === 0) throw new PayablesError(`la línea ${l.purchaseOrderItemId} no pertenece a la orden ${input.purchaseOrderId}`);
      const open = await this.client.query(
        `SELECT pl.id, (pl.quantity - pl.qty_invoiced)::text AS pending, pl.unit_cost::text
           FROM purchase_receipt_lines pl JOIN purchase_receipts r ON r.id = pl.receipt_id
          WHERE pl.company_id=$1 AND pl.purchase_order_item_id=$2 AND r.status='posted' AND pl.qty_invoiced < pl.quantity
          ORDER BY r.receipt_date, pl.id FOR UPDATE OF pl`,
        [input.companyId, l.purchaseOrderItemId],
      );
      let need = toMoney(l.quantity);
      let lineReceived: Decimal = "0";
      const takes: Array<{ id: number; qty: Decimal; value: Decimal }> = [];
      for (const r of open.rows) {
        if (cmp(need, "0") <= 0) break;
        const take = cmp(r.pending, need) <= 0 ? r.pending : need;
        const value = toMoney(roundTo(mul(take, r.unit_cost), 4));
        takes.push({ id: Number(r.id), qty: take, value });
        lineReceived = add(lineReceived, value);
        need = sub(need, take);
      }
      if (cmp(need, "0") > 0) {
        throw new PayablesError(
          `"${l.description}": se facturan ${l.quantity} pero solo hay ${sub(toMoney(l.quantity), need)} recibidas sin facturar`,
        );
      }
      // The invoiced value is spread over the receipt lines in proportion to
      // what each contributed, so every match row carries its own variance.
      let spread: Decimal = "0";
      for (const [k, t] of takes.entries()) {
        const share = k === takes.length - 1
          ? sub(total, spread)
          : toMoney(roundTo(String((Number(total) * Number(t.value)) / Number(lineReceived || "1")), 2));
        spread = add(spread, share);
        await this.client.query(`UPDATE purchase_receipt_lines SET qty_invoiced = qty_invoiced + $1::numeric WHERE id=$2`, [t.qty, t.id]);
        await this.client.query(
          `INSERT INTO supplier_invoice_matches (company_id, document_id, receipt_line_id, quantity, receipt_value, invoice_value, variance)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [input.companyId, documentId, t.id, t.qty, t.value, toMoney(share), toMoney(sub(share, t.value))],
        );
      }
      received = add(received, lineReceived);
      invoiced = add(invoiced, total);
    }
    return { received, invoiced, variance: sub(invoiced, received) };
  }

  private async insertLines(
    companyId: number,
    documentId: number,
    lines: SupplierInvoiceLine[],
    computed: Array<{ taxCode: string; itbisRate: string; itbisAmount: Decimal; lineTotal: Decimal; isExempt: boolean }>,
  ): Promise<void> {
    for (const [i, line] of lines.entries()) {
      const c = computed[i];
      await this.client.query(
        `INSERT INTO fiscal_document_lines
           (document_id, company_id, line_no, product_id, description, quantity, unit_price, discount, tax_code,
            itbis_rate, itbis_amount, line_total, is_exempt)
         VALUES ($1,$2,$3,(SELECT id FROM products WHERE id=$4::int),$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          // A purchase line may buy something that is not in the sales catalog
          // (valued stock keys on the product id without a catalog row); the
          // line then carries no product link rather than failing the invoice.
          documentId, companyId, i + 1, line.productId ?? null, line.description, toMoney(line.quantity),
          toMoney(line.unitPrice), toMoney(line.discount ?? "0"), c.taxCode, c.itbisRate, toMoney(c.itbisAmount),
          toMoney(c.lineTotal), c.isExempt,
        ],
      );
    }
  }

  /**
   * A supplier's credit note (their B04/E34) against one of their invoices:
   * goods sent back, or a price allowance.
   *
   * Returned goods leave the valued ledger at the cost they carry now, so the
   * inventory account and the valuation stay equal; the payable goes down by the
   * credited amount; the ITBIS credit taken on the purchase is reversed; and
   * whatever the supplier credits above or below the stock's cost is a purchase
   * price variance. The open item of the original invoice is reduced — a credit
   * larger than what is still owed must be settled first.
   */
  async registerSupplierCreditNote(input: {
    companyId: number;
    supplierId?: number;
    supplierRnc: string;
    ncf: string;
    ncfType?: string;
    date: string;
    modifiesDocumentId: number;
    lines: Array<SupplierInvoiceLine & { warehouseId?: number }>;
    /** Take the goods out of stock (a return). False for a pure price allowance. */
    returnGoods: boolean;
    warehouseId?: number;
    postedBy?: number;
  }): Promise<{ documentId: number; journalEntryIds: number[]; total: Decimal; stockCost: Decimal }> {
    if (input.lines.length === 0) throw new PayablesError("la nota de crédito necesita al menos una línea");
    const orig = await this.client.query(
      `SELECT id, ncf, supplier_id, total::text, status FROM fiscal_documents
        WHERE id=$1 AND company_id=$2 AND doc_type='purchase' AND modifies_doc_id IS NULL`,
      [input.modifiesDocumentId, input.companyId],
    );
    if (orig.rows.length === 0) throw new PayablesError("factura de compra original no encontrada");
    if (orig.rows[0].status === "cancelled") throw new PayablesError("la factura de compra está anulada");

    const breakdown = await new TaxCalculator(this.client).compute(input.lines, {
      companyId: input.companyId, date: input.date, applyRetentions: false,
    });
    const itbis = sum([breakdown.itbis18, breakdown.itbis16, breakdown.itbis0]);
    const goods = add(breakdown.subtotalTaxed, breakdown.subtotalExempt);
    const total = add(goods, itbis);

    const previous = await this.client.query(
      `SELECT coalesce(sum(total),0)::text AS t FROM fiscal_documents
        WHERE company_id=$1 AND modifies_doc_id=$2 AND doc_type='purchase' AND status<>'cancelled'`,
      [input.companyId, input.modifiesDocumentId],
    );
    if (cmp(add(previous.rows[0].t, total), orig.rows[0].total) > 0) {
      throw new PayablesError(
        `la factura es de ${orig.rows[0].total}, ya se acreditaron ${previous.rows[0].t} y se piden ${toMoney(total)}`,
      );
    }

    const item = await this.client.query(
      `SELECT id, balance::text FROM ap_open_items WHERE company_id=$1 AND document_id=$2 FOR UPDATE`,
      [input.companyId, input.modifiesDocumentId],
    );
    if (item.rows.length === 0) throw new PayablesError("la factura original no tiene partida por pagar");
    if (cmp(total, item.rows[0].balance) > 0) {
      throw new PayablesError(
        `la nota de crédito (${toMoney(total)}) excede lo que aún se debe de la factura (${item.rows[0].balance})`,
      );
    }

    const doc = await this.client.query(
      `INSERT INTO fiscal_documents
         (company_id, doc_type, ncf, ncf_type, issuer_rnc, supplier_id, currency, fx_rate, modifies_ncf, modifies_doc_id,
          subtotal_taxed, subtotal_exempt, itbis_18, itbis_16, itbis_0, total, status, emitted_at, document_date)
       VALUES ($1,'purchase',$2,$3,$4,$5,'DOP',1,$6,$7,$8,$9,$10,$11,$12,$13,'issued',now(),$14)
       RETURNING id`,
      [
        input.companyId, input.ncf, input.ncfType ?? "B04", input.supplierRnc, input.supplierId ?? orig.rows[0].supplier_id,
        orig.rows[0].ncf, input.modifiesDocumentId, toMoney(breakdown.subtotalTaxed), toMoney(breakdown.subtotalExempt),
        toMoney(breakdown.itbis18), toMoney(breakdown.itbis16), toMoney(breakdown.itbis0), toMoney(total), input.date,
      ],
    );
    const documentId = Number(doc.rows[0].id);
    await this.insertLines(input.companyId, documentId, input.lines, breakdown.lines);

    // Goods out of stock, at what they carry now, grouped by control account.
    const costByAccount = new Map<string, Decimal>();
    let stockCost: Decimal = "0";
    if (input.returnGoods) {
      const costing = new InventoryCosting(this.client);
      for (const line of input.lines) {
        if (!line.productId) continue;
        const warehouseId = line.warehouseId ?? input.warehouseId ?? 0;
        const issued = await costing.issue({
          companyId: input.companyId, productId: line.productId, date: input.date, quantity: toMoney(line.quantity),
          warehouseId, post: false, sourceType: "supplier_credit_note", sourceId: String(documentId), postedBy: input.postedBy,
        });
        const acct = await this.client.query(
          `SELECT inventory_account FROM inventory_valuation WHERE company_id=$1 AND product_id=$2 LIMIT 1`,
          [input.companyId, line.productId],
        );
        const account = acct.rows[0]?.inventory_account ?? "1.1.03.001";
        costByAccount.set(account, add(costByAccount.get(account) ?? "0", issued.cogs));
        stockCost = add(stockCost, issued.cogs);
      }
    }

    const engine = new PostingEngine(this.client);
    const journalEntryIds: number[] = [];
    const accounts = [...costByAccount.keys()];
    if (accounts.length === 0) accounts.push("1.1.03.001");
    for (const [k, account] of accounts.entries()) {
      const measures: { role: string; amount: Decimal; memo: string }[] = [];
      const cost = costByAccount.get(account) ?? "0";
      if (!isZero(cost)) measures.push({ role: "inventory", amount: toMoney(cost), memo: "Mercancía devuelta" });
      if (k === 0) {
        const variance = sub(goods, stockCost);
        if (!isZero(variance)) measures.push({ role: "price_variance", amount: toMoney(variance), memo: "Diferencia devolución" });
        if (!isZero(itbis)) measures.push({ role: "itbis_credit", amount: toMoney(itbis), memo: "Reverso ITBIS adelantado" });
      }
      if (measures.length === 0) continue;
      const posted = await engine.post(
        {
          companyId: input.companyId, eventType: "purchase_credit", sourceType: "purchase_document",
          sourceId: k === 0 ? String(documentId) : `${documentId}:${account}`, entryDate: input.date, currency: "DOP",
          context: { inventoryAccount: account }, measures, memo: `Nota de crédito proveedor ${input.ncf}`, postedBy: input.postedBy,
        },
        "credit_note",
      );
      journalEntryIds.push(posted.entryId);
    }
    if (journalEntryIds[0]) {
      await this.client.query(`UPDATE fiscal_documents SET journal_entry_id=$1 WHERE id=$2`, [journalEntryIds[0], documentId]);
    }

    const newBalance = sub(item.rows[0].balance, total);
    await this.client.query(
      `UPDATE ap_open_items SET balance=$1, status=CASE WHEN $1::numeric=0 THEN 'paid' ELSE 'partial' END WHERE id=$2`,
      [toMoney(newBalance), item.rows[0].id],
    );
    await this.client.query(
      `INSERT INTO ap_adjustments (company_id, open_item_id, document_id, kind, amount, adjustment_date, journal_entry_id)
       VALUES ($1,$2,$3,'credit_note',$4,$5,$6)`,
      [input.companyId, item.rows[0].id, documentId, toMoney(total), input.date, journalEntryIds[0] ?? null],
    );
    return { documentId, journalEntryIds, total, stockCost };
  }

  /** Registers a payment, applies it to open items, posts Dr Proveedores / Cr Cash (or Bank). */
  async registerPayment(input: {
    companyId: number;
    supplierId?: number;
    paymentDate: string;
    amount: Decimal;
    method?: string;
    reference?: string;
    currency?: string;
    applications: Array<{ openItemId: number; amount: Decimal }>;
    postedBy?: number;
    /** Bank account the payment leaves from; recorded in treasury too. Default: Caja general. */
    bankAccountId?: number;
  }): Promise<{ paymentId: number; journalEntryId: number; bankTransactionId: number | null }> {
    const applied = input.applications.reduce<Decimal>((s, a) => add(s, a.amount), "0");
    if (cmp(applied, input.amount) !== 0) {
      throw new PayablesError(`las aplicaciones (${applied}) no suman el pago (${input.amount})`);
    }

    for (const app of input.applications) {
      if (isNegative(app.amount) || isZero(app.amount)) throw new PayablesError("el monto aplicado debe ser positivo");
      const { rows } = await this.client.query(
        `SELECT balance::text, status FROM ap_open_items WHERE id=$1 AND company_id=$2 FOR UPDATE`,
        [app.openItemId, input.companyId],
      );
      if (rows.length === 0) throw new PayablesError(`partida ${app.openItemId} no existe`);
      if (rows[0].status === "cancelled") throw new PayablesError(`la partida ${app.openItemId} está anulada`);
      const balance = rows[0].balance as Decimal;
      if (cmp(app.amount, balance) > 0) {
        throw new PayablesError(`la aplicación (${app.amount}) excede el saldo (${balance})`);
      }
      await this.client.query(
        `UPDATE ap_open_items SET balance=$1, status=CASE WHEN $1::numeric=0 THEN 'paid' ELSE 'partial' END WHERE id=$2`,
        [toMoney(sub(balance, app.amount)), app.openItemId],
      );
    }

    const payment = await this.client.query(
      `INSERT INTO ap_payments (company_id, supplier_id, payment_date, currency, amount, method, reference, bank_account_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [input.companyId, input.supplierId ?? null, input.paymentDate, input.currency ?? "DOP", toMoney(input.amount), input.method ?? "transfer", input.reference ?? null, input.bankAccountId ?? null],
    );
    const paymentId = Number(payment.rows[0].id);
    for (const app of input.applications) {
      await this.client.query(
        `INSERT INTO ap_applications (company_id, payment_id, open_item_id, amount) VALUES ($1,$2,$3,$4)`,
        [input.companyId, paymentId, app.openItemId, toMoney(app.amount)],
      );
    }

    const bank = input.bankAccountId ? await Treasury.bankGl(this.client, input.companyId, input.bankAccountId) : null;
    const posted = await new PostingEngine(this.client).post(
      {
        companyId: input.companyId,
        eventType: "ap_payment",
        sourceType: "ap_payment",
        sourceId: String(paymentId),
        entryDate: input.paymentDate,
        currency: input.currency ?? "DOP",
        context: bank ? { settlementChannel: "bank", bankGlAccount: bank.glCode } : {},
        measures: [{ role: "settlement", amount: toMoney(input.amount), memo: "Pago a proveedor" }],
        memo: `Pago ${input.reference ?? paymentId}`,
        postedBy: input.postedBy,
      },
      "payment",
    );
    let bankTransactionId: number | null = null;
    if (bank) {
      bankTransactionId = await new Treasury(this.client).attachTransaction({
        companyId: input.companyId, bankAccountId: input.bankAccountId!, txnDate: input.paymentDate, direction: "out",
        amount: input.amount, kind: "payment", counterpartyAccountRef: "2.1.01.001", reference: input.reference,
        memo: `Pago a proveedor ${input.reference ?? paymentId}`, journalEntryId: posted.entryId,
        sourceType: "ap_payment", sourceId: String(paymentId),
      });
    }
    await this.client.query(`UPDATE ap_payments SET journal_entry_id=$1, bank_transaction_id=$3 WHERE id=$2`, [
      posted.entryId, paymentId, bankTransactionId,
    ]);
    return { paymentId, journalEntryId: posted.entryId, bankTransactionId };
  }

  async aging(companyId: number, asOf: string) {
    const { rows } = await this.client.query(
      `SELECT supplier_id,
              sum(balance) FILTER (WHERE due_date >= $2)::text AS current,
              sum(balance) FILTER (WHERE due_date < $2 AND due_date >= $2::date - 30)::text AS d1_30,
              sum(balance) FILTER (WHERE due_date < $2::date - 30 AND due_date >= $2::date - 60)::text AS d31_60,
              sum(balance) FILTER (WHERE due_date < $2::date - 60)::text AS d60_plus,
              sum(balance)::text AS total
         FROM ap_open_items WHERE company_id=$1 AND status NOT IN ('paid','cancelled')
        GROUP BY supplier_id`,
      [companyId, asOf],
    );
    return rows;
  }
}
