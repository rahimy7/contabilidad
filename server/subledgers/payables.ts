import { SqlClient } from "../accounting/types";
import { PostingEngine } from "../accounting/posting-engine";
import { TaxCalculator } from "../fiscal/tax-calculator";
import { InventoryCosting, CostingMethod } from "../inventory/costing";
import { putaway, warehouseConfig } from "../inventory/wms";
import { FixedAssets } from "../modules/fixed-assets";
import { Decimal, add, sub, sum, cmp, isNegative, isZero, toMoney } from "../accounting/decimal";

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
  purchaseType?: "inventory" | "supply" | "fixed_asset" | "service" | "expense";
  /** When `purchaseType` is 'fixed_asset', also open the asset (cost = goods). */
  fixedAsset?: { code: string; name: string; usefulLifeMonths: number; residualValue?: Decimal; category?: string };
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

    const breakdown = await new TaxCalculator(this.client).compute(input.lines, {
      companyId: input.companyId,
      date: input.date,
      counterpartyType: input.counterpartyType,
      operationType: input.operationType,
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
      : input.retentionConcept ?? (input.operationType === "servicios" ? "honorarios" : "otras_rentas");

    // The purchase fiscal document (doc_type='purchase') is what the 606 reads.
    const doc = await this.client.query(
      `INSERT INTO fiscal_documents
         (company_id, doc_type, ncf, ncf_type, issuer_rnc, supplier_id, currency, fx_rate,
          subtotal_taxed, subtotal_exempt, itbis_18, itbis_16, itbis_0,
          retention_itbis, retention_isr, retention_concept, total, status, emitted_at, due_date)
       VALUES ($1,'purchase',$2,$3,$4,$5,$6,1,
               $7,$8,$9,$10,$11,$12,$13,$14,$15,'issued',$16::date,$17)
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
      ],
    );
    const documentId = Number(doc.rows[0].id);

    // Post: Dr Inventory (goods) + Dr ITBIS adelantado, Cr Proveedores,
    // Dr Proveedores for any retention (it reduces what we owe).
    const measures = [
      { role: "inventory", amount: toMoney(goods), memo: "Compra" },
    ];
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
        context: { purchaseType },
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
      });
    }

    return { documentId, openItemId: Number(item.rows[0].id), journalEntryId: posted.entryId, total: invoiceTotal };
  }

  /** Registers a payment, applies it to open items, posts Dr Proveedores / Cr Cash. */
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
  }): Promise<{ paymentId: number; journalEntryId: number }> {
    const applied = input.applications.reduce<Decimal>((s, a) => add(s, a.amount), "0");
    if (cmp(applied, input.amount) !== 0) {
      throw new PayablesError(`las aplicaciones (${applied}) no suman el pago (${input.amount})`);
    }

    for (const app of input.applications) {
      if (isNegative(app.amount) || isZero(app.amount)) throw new PayablesError("el monto aplicado debe ser positivo");
      const { rows } = await this.client.query(
        `SELECT balance::text FROM ap_open_items WHERE id=$1 AND company_id=$2 FOR UPDATE`,
        [app.openItemId, input.companyId],
      );
      if (rows.length === 0) throw new PayablesError(`partida ${app.openItemId} no existe`);
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
      `INSERT INTO ap_payments (company_id, supplier_id, payment_date, currency, amount, method, reference)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [input.companyId, input.supplierId ?? null, input.paymentDate, input.currency ?? "DOP", toMoney(input.amount), input.method ?? "transfer", input.reference ?? null],
    );
    const paymentId = Number(payment.rows[0].id);
    for (const app of input.applications) {
      await this.client.query(
        `INSERT INTO ap_applications (company_id, payment_id, open_item_id, amount) VALUES ($1,$2,$3,$4)`,
        [input.companyId, paymentId, app.openItemId, toMoney(app.amount)],
      );
    }

    const posted = await new PostingEngine(this.client).post(
      {
        companyId: input.companyId,
        eventType: "ap_payment",
        sourceType: "ap_payment",
        sourceId: String(paymentId),
        entryDate: input.paymentDate,
        currency: input.currency ?? "DOP",
        measures: [{ role: "settlement", amount: toMoney(input.amount), memo: "Pago a proveedor" }],
        memo: `Pago ${input.reference ?? paymentId}`,
        postedBy: input.postedBy,
      },
      "payment",
    );
    await this.client.query(`UPDATE ap_payments SET journal_entry_id=$1 WHERE id=$2`, [posted.entryId, paymentId]);
    return { paymentId, journalEntryId: posted.entryId };
  }

  async aging(companyId: number, asOf: string) {
    const { rows } = await this.client.query(
      `SELECT supplier_id,
              sum(balance) FILTER (WHERE due_date >= $2)::text AS current,
              sum(balance) FILTER (WHERE due_date < $2 AND due_date >= $2::date - 30)::text AS d1_30,
              sum(balance) FILTER (WHERE due_date < $2::date - 30 AND due_date >= $2::date - 60)::text AS d31_60,
              sum(balance) FILTER (WHERE due_date < $2::date - 60)::text AS d60_plus,
              sum(balance)::text AS total
         FROM ap_open_items WHERE company_id=$1 AND status <> 'paid'
        GROUP BY supplier_id`,
      [companyId, asOf],
    );
    return rows;
  }
}
