import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import {
  createRfq, addSupplierQuote, awardQuote, getRfq, updateRfqStatus,
  listRfqQuotes, compareQuotes,
} from "../server/services/supplier-rfqs";

neonConfig.webSocketConstructor = ws;

describeIntegration("supplier RFQs", () => {
  let pool: Pool;
  const storeId = 999_722;
  let supplierAId: number;
  let supplierBId: number;
  const userId = 1;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    await pool.query(`DELETE FROM supplier_quote_lines WHERE quote_id IN (SELECT id FROM supplier_quotes WHERE rfq_id IN (SELECT id FROM purchase_rfqs WHERE store_id=$1))`, [storeId]);
    await pool.query(`DELETE FROM supplier_quotes WHERE rfq_id IN (SELECT id FROM purchase_rfqs WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM purchase_rfq_lines WHERE rfq_id IN (SELECT id FROM purchase_rfqs WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM purchase_rfqs WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM purchase_rfq_sequences WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM suppliers WHERE store_id=$1`, [storeId]);

    const a = await pool.query(`INSERT INTO suppliers (store_id, name) VALUES ($1, 'Supplier A') RETURNING id`, [storeId]);
    const b = await pool.query(`INSERT INTO suppliers (store_id, name) VALUES ($1, 'Supplier B') RETURNING id`, [storeId]);
    supplierAId = a.rows[0].id;
    supplierBId = b.rows[0].id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM supplier_quote_lines WHERE quote_id IN (SELECT id FROM supplier_quotes WHERE rfq_id IN (SELECT id FROM purchase_rfqs WHERE store_id=$1))`, [storeId]);
    await pool.query(`DELETE FROM supplier_quotes WHERE rfq_id IN (SELECT id FROM purchase_rfqs WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM purchase_rfq_lines WHERE rfq_id IN (SELECT id FROM purchase_rfqs WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM purchase_rfqs WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM purchase_rfq_sequences WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM suppliers WHERE store_id=$1`, [storeId]);
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM supplier_quote_lines WHERE quote_id IN (SELECT id FROM supplier_quotes WHERE rfq_id IN (SELECT id FROM purchase_rfqs WHERE store_id=$1))`, [storeId]);
    await pool.query(`DELETE FROM supplier_quotes WHERE rfq_id IN (SELECT id FROM purchase_rfqs WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM purchase_rfq_lines WHERE rfq_id IN (SELECT id FROM purchase_rfqs WHERE store_id=$1)`, [storeId]);
    await pool.query(`DELETE FROM purchase_rfqs WHERE store_id=$1`, [storeId]);
    await pool.query(`DELETE FROM purchase_rfq_sequences WHERE store_id=$1`, [storeId]);
  });

  it("crea un RFQ con líneas y números correlativos", async () => {
    const rfq1 = await createRfq(pool, {
      storeId, requestedBy: userId,
      title: "Insumos oficina",
      lines: [{ productName: "Resma papel", quantity: 100 }, { productName: "Bolígrafo azul", quantity: 200 }],
    });
    const rfq2 = await createRfq(pool, {
      storeId, requestedBy: userId,
      title: "Refacciones",
      lines: [{ productName: "Cable HDMI", quantity: 5 }],
    });
    expect(rfq1.rfqNumber).toBe("RFQ-000001");
    expect(rfq2.rfqNumber).toBe("RFQ-000002");
  });

  it("recibir cotizaciones y comparar precios entre proveedores", async () => {
    const rfq = await createRfq(pool, {
      storeId, requestedBy: userId, title: "Test",
      lines: [{ productName: "Producto X", quantity: 10 }],
    });
    const rfqLine = (await pool.query(`SELECT id FROM purchase_rfq_lines WHERE rfq_id=$1`, [rfq.id])).rows[0].id;

    await addSupplierQuote(pool, {
      rfqId: rfq.id, supplierId: supplierAId, supplierName: "Supplier A",
      lines: [{ rfqLineId: rfqLine, productName: "Producto X", quantity: 10, unitPrice: 100 }],
    });
    await addSupplierQuote(pool, {
      rfqId: rfq.id, supplierId: supplierBId, supplierName: "Supplier B",
      lines: [{ rfqLineId: rfqLine, productName: "Producto X", quantity: 10, unitPrice: 85 }],
    });

    const list = await listRfqQuotes(pool, rfq.id);
    expect(list.length).toBe(2);
    // El más barato debe salir primero (ORDER BY total_amount).
    expect(Number(list[0].totalAmount)).toBeLessThan(Number(list[1].totalAmount));

    const comp = await compareQuotes(pool, rfq.id);
    expect(comp.comparison[0].offers.length).toBe(2);
  });

  it("la primera cotización cambia el RFQ a 'sent'", async () => {
    const rfq = await createRfq(pool, {
      storeId, requestedBy: userId, title: "Test",
      lines: [{ productName: "P", quantity: 1 }],
    });
    expect(rfq.status).toBe("draft");
    await addSupplierQuote(pool, {
      rfqId: rfq.id, supplierId: supplierAId, supplierName: "A",
      lines: [{ productName: "P", quantity: 1, unitPrice: 50 }],
    });
    const after = await getRfq(pool, rfq.id);
    expect(after.status).toBe("sent");
  });

  it("adjudicar marca una cotización y cierra el RFQ", async () => {
    const rfq = await createRfq(pool, {
      storeId, requestedBy: userId, title: "Test",
      lines: [{ productName: "P", quantity: 1 }],
    });
    const qA = await addSupplierQuote(pool, {
      rfqId: rfq.id, supplierId: supplierAId, supplierName: "A",
      lines: [{ productName: "P", quantity: 1, unitPrice: 100 }],
    });
    const qB = await addSupplierQuote(pool, {
      rfqId: rfq.id, supplierId: supplierBId, supplierName: "B",
      lines: [{ productName: "P", quantity: 1, unitPrice: 80 }],
    });
    await awardQuote(pool, qB.id);

    const rfqAfter = await getRfq(pool, rfq.id);
    expect(rfqAfter.status).toBe("awarded");
    expect(rfqAfter.awardedSupplierId).toBe(supplierBId);
    expect(rfqAfter.awardedQuoteId).toBe(qB.id);

    // Sólo una `is_selected = true`.
    const list = await listRfqQuotes(pool, rfq.id);
    const selected = list.filter((q: any) => q.isSelected);
    expect(selected.length).toBe(1);
    expect(selected[0].id).toBe(qB.id);
    void qA;
  });

  it("no se puede adjudicar dos veces el mismo RFQ", async () => {
    const rfq = await createRfq(pool, {
      storeId, requestedBy: userId, title: "Test",
      lines: [{ productName: "P", quantity: 1 }],
    });
    const q1 = await addSupplierQuote(pool, {
      rfqId: rfq.id, supplierName: "A",
      lines: [{ productName: "P", quantity: 1, unitPrice: 100 }],
    });
    const q2 = await addSupplierQuote(pool, {
      rfqId: rfq.id, supplierName: "B",
      lines: [{ productName: "P", quantity: 1, unitPrice: 80 }],
    });
    await awardQuote(pool, q1.id);
    await expect(awardQuote(pool, q2.id)).rejects.toThrow(/adjudicado/);
  });

  it("un RFQ cerrado no acepta más cotizaciones", async () => {
    const rfq = await createRfq(pool, {
      storeId, requestedBy: userId, title: "Test",
      lines: [{ productName: "P", quantity: 1 }],
    });
    await updateRfqStatus(pool, rfq.id, "cancelled");
    await expect(
      addSupplierQuote(pool, {
        rfqId: rfq.id, supplierName: "A",
        lines: [{ productName: "P", quantity: 1, unitPrice: 100 }],
      }),
    ).rejects.toThrow(/cancelled|no acepta/);
  });
});
