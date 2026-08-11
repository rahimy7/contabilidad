import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { FiscalDocumentService } from "../server/fiscal/document-service";
import { InventoryCosting } from "../server/inventory/costing";

neonConfig.webSocketConstructor = ws;

/**
 * Devolución de mercancía: la nota de crédito y su control de sobre-crédito.
 *
 * Lo que se prueba no es que se pueda emitir una nota de crédito, sino que no se
 * pueda emitir una que no corresponda: acreditar más de lo vendido revierte
 * ingreso e ITBIS que nunca se cobraron, y en el 607 aparece como un negativo
 * que la factura original no sostiene.
 */
describeIntegration("Devoluciones: notas de crédito contra la factura original", () => {
  let pool: Pool;
  let companyId: number;
  let P: number;
  const RNC = "130444222";
  const BUYER = "131555444";
  const YEAR = new Date().getUTCFullYear();
  const M = String(new Date().getUTCMonth() + 1).padStart(2, "0");
  const DATE = `${YEAR}-${M}-08`;
  const INVENTORY = "1.1.03.001";
  const COGS = "5.1.01.001";

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await purge();
    companyId = (
      await pool.query(
        `INSERT INTO companies (legal_name, rnc) VALUES ('Devoluciones SRL',$1) RETURNING id`,
        [RNC],
      )
    ).rows[0].id;
    await seedCompanyDefaults(pool, companyId);
    P = (
      await pool.query(
        `INSERT INTO products (name, base_currency, price, category, store_id)
         VALUES ('Producto Devolución','DOP','100','general',1) RETURNING id`,
      )
    ).rows[0].id;
  });

  afterAll(async () => {
    await purge();
    if (P) await pool.query(`DELETE FROM products WHERE id=$1`, [P]);
    await pool.end();
  });

  /** Igual que en e-CF: una corrida interrumpida no debe envenenar la siguiente. */
  async function purge() {
    const { rows } = await pool.query(`SELECT id FROM companies WHERE rnc=$1`, [RNC]);
    for (const row of rows) {
      const id = Number(row.id);
      await clearDocuments(id);
      for (const t of [
        "posting_rules", "accounting_periods", "retention_rules", "user_companies",
        "bank_accounts",
      ]) {
        await pool.query(`DELETE FROM ${t} WHERE company_id=$1`, [id]).catch(() => {});
      }
      await pool.query(
        `DELETE FROM tax_rates WHERE tax_code_id IN (SELECT id FROM tax_codes WHERE company_id=$1)`,
        [id],
      ).catch(() => {});
      await pool.query(`DELETE FROM tax_codes WHERE company_id=$1`, [id]).catch(() => {});
      await pool.query(`DELETE FROM chart_of_accounts WHERE company_id=$1`, [id]).catch(() => {});
      await pool.query(`DELETE FROM companies WHERE id=$1`, [id]);
    }
  }

  /**
   * Borra todo lo transaccional, en orden de dependencias y sin tragarse los
   * errores.
   *
   * Dos cosas que este orden respeta y que no son obvias:
   *
   * Las líneas del asiento **no se borran aparte**. Cascadean al borrar el
   * asiento, y quitarlas por su cuenta deja momentáneamente un asiento posteado
   * sin líneas — que es justo lo que el trigger diferido de balance prohíbe, y
   * revienta al hacer COMMIT.
   *
   * `inventory_cost_movements` referencia `journal_entries`, así que los
   * movimientos van antes que los asientos. Con un `.catch()` alrededor ese
   * fallo no se ve: los asientos sobreviven, los saldos se acumulan entre
   * pruebas, y una prueba falla por lo que hizo la anterior.
   */
  async function clearDocuments(id: number) {
    await pool.query(
      `DELETE FROM fiscal_document_events WHERE document_id IN
         (SELECT id FROM fiscal_documents WHERE company_id=$1)`,
      [id],
    );
    for (const t of [
      // Primero lo que apunta a los asientos y a los documentos…
      "ecf_transmissions", "fiscal_document_lines", "fiscal_documents",
      "inventory_cost_movements", "inventory_lots", "inventory_valuation",
      // …y sólo entonces los asientos, que se llevan sus líneas por cascada.
      "ncf_sequences", "journal_entries",
    ]) {
      await pool.query(`DELETE FROM ${t} WHERE company_id=$1`, [id]);
    }
  }

  beforeEach(async () => {
    await clearDocuments(companyId);
    // Rangos para la factura (B01) y para la nota de crédito (B04).
    await pool.query(
      `INSERT INTO ncf_sequences (company_id, ncf_type, is_ecf, range_from, range_to, next_number)
       VALUES ($1,'B01',false,1,1000,1), ($1,'B04',false,1,1000,1)`,
      [companyId],
    );
  });

  async function inTx<T>(fn: (c: any) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.company_id', $1, true)", [String(companyId)]);
      const out = await fn(client);
      await client.query("COMMIT");
      return out;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  /** Una factura de 10 unidades a RD$100, con su costo ya en inventario. */
  async function sellTen(opts: { withStock?: boolean } = {}) {
    return inTx(async (c) => {
      if (opts.withStock) {
        await new InventoryCosting(c).receive({
          companyId, productId: P, date: DATE, quantity: "10", unitCost: "60",
        });
      }
      const doc = await new FiscalDocumentService(c).issueInvoice({
        companyId, issuerRnc: RNC, ncfType: "B01", date: DATE,
        buyerRnc: BUYER, buyerName: "Cliente Devolución SRL",
        bookCogs: Boolean(opts.withStock),
        lines: [{
          description: "Producto Devolución", quantity: "10", unitPrice: "100",
          taxCode: "ITBIS18", productId: P,
        }],
      });
      return doc.documentId;
    });
  }

  const balanceOf = async (code: string) => {
    const r = await pool.query(
      `SELECT coalesce(sum(l.debit - l.credit), 0)::text AS bal
         FROM journal_entry_lines l
         JOIN chart_of_accounts a ON a.id = l.account_id
        WHERE a.company_id=$1 AND a.code=$2`,
      [companyId, code],
    );
    return Number(r.rows[0].bal);
  };

  // ── saldo acreditable ──────────────────────────────────────────────────────

  it("una factura recién emitida tiene todo por acreditar", async () => {
    const id = await sellTen();
    const bal = await inTx((c) =>
      new FiscalDocumentService(c).creditableBalance(companyId, id),
    );
    expect(bal.lines).toHaveLength(1);
    expect(Number(bal.lines[0].invoicedQty)).toBe(10);
    expect(Number(bal.lines[0].creditedQty)).toBe(0);
    expect(Number(bal.lines[0].remainingQty)).toBe(10);
  });

  it("una devolución parcial reduce lo que queda por acreditar", async () => {
    const id = await sellTen();
    await inTx((c) =>
      new FiscalDocumentService(c).issueCreditNote({
        companyId, issuerRnc: RNC, ncfType: "B04", date: DATE, modifiesDocId: id,
        matchInvoiceLines: true,
        lines: [{
          description: "Producto Devolución", quantity: "3", unitPrice: "100",
          taxCode: "ITBIS18", productId: P,
        }],
      }),
    );

    const bal = await inTx((c) =>
      new FiscalDocumentService(c).creditableBalance(companyId, id),
    );
    expect(Number(bal.lines[0].creditedQty)).toBe(3);
    expect(Number(bal.lines[0].remainingQty)).toBe(7);
  });

  // ── el control de sobre-crédito ────────────────────────────────────────────

  it("no deja acreditar más de lo que dice la factura", async () => {
    const id = await sellTen();
    await expect(
      inTx((c) =>
        new FiscalDocumentService(c).issueCreditNote({
          companyId, issuerRnc: RNC, ncfType: "B04", date: DATE, modifiesDocId: id,
          matchInvoiceLines: true,
          lines: [{
            description: "Producto Devolución", quantity: "11", unitPrice: "100",
            taxCode: "ITBIS18", productId: P,
          }],
        }),
      ),
    ).rejects.toThrow(/se piden acreditar 1100/);
  });

  it("no deja que dos devoluciones sumadas excedan la factura", async () => {
    const id = await sellTen();
    await inTx((c) =>
      new FiscalDocumentService(c).issueCreditNote({
        companyId, issuerRnc: RNC, ncfType: "B04", date: DATE, modifiesDocId: id,
        matchInvoiceLines: true,
        lines: [{
          description: "Producto Devolución", quantity: "8", unitPrice: "100",
          taxCode: "ITBIS18", productId: P,
        }],
      }),
    );
    // Quedan 2; pedir 5 tiene que fallar aunque sola sea menor que 10.
    await expect(
      inTx((c) =>
        new FiscalDocumentService(c).issueCreditNote({
          companyId, issuerRnc: RNC, ncfType: "B04", date: DATE, modifiesDocId: id,
          matchInvoiceLines: true,
          lines: [{
            description: "Producto Devolución", quantity: "5", unitPrice: "100",
            taxCode: "ITBIS18", productId: P,
          }],
        }),
      ),
    ).rejects.toThrow(/quedan 200\.00/);
  });

  it("suma las líneas repetidas del mismo producto antes de comparar", async () => {
    const id = await sellTen();
    // 6 + 6 = 12 contra una factura de 10: ninguna línea sola lo delata.
    await expect(
      inTx((c) =>
        new FiscalDocumentService(c).issueCreditNote({
          companyId, issuerRnc: RNC, ncfType: "B04", date: DATE, modifiesDocId: id,
          matchInvoiceLines: true,
          lines: [
            { description: "Producto Devolución", quantity: "6", unitPrice: "100", taxCode: "ITBIS18", productId: P },
            { description: "Producto Devolución", quantity: "6", unitPrice: "100", taxCode: "ITBIS18", productId: P },
          ],
        }),
      ),
    ).rejects.toThrow(/se piden acreditar 1200/);
  });

  it("suma las líneas repetidas de la factura en un solo saldo acreditable", async () => {
    // Mismo producto, mismo precio, dos líneas de 5. Son 10 devolvibles, no
    // dos cupos de 5 que se pisan entre sí.
    const id = await inTx(async (c) => {
      const doc = await new FiscalDocumentService(c).issueInvoice({
        companyId, issuerRnc: RNC, ncfType: "B01", date: DATE,
        buyerRnc: BUYER, buyerName: "Cliente Devolución SRL", bookCogs: false,
        lines: [
          { description: "Producto Devolución", quantity: "5", unitPrice: "100", taxCode: "ITBIS18", productId: P },
          { description: "Producto Devolución", quantity: "5", unitPrice: "100", taxCode: "ITBIS18", productId: P },
        ],
      });
      return doc.documentId;
    });

    const before = await inTx((c) =>
      new FiscalDocumentService(c).creditableBalance(companyId, id),
    );
    expect(before.lines).toHaveLength(1);
    expect(Number(before.lines[0].invoicedQty)).toBe(10);

    await inTx((c) =>
      new FiscalDocumentService(c).issueCreditNote({
        companyId, issuerRnc: RNC, ncfType: "B04", date: DATE, modifiesDocId: id,
        matchInvoiceLines: true,
        lines: [{ description: "Producto Devolución", quantity: "3", unitPrice: "100", taxCode: "ITBIS18", productId: P }],
      }),
    );

    // Lo acreditado se descuenta una sola vez del total, no de cada línea.
    const after = await inTx((c) =>
      new FiscalDocumentService(c).creditableBalance(companyId, id),
    );
    expect(Number(after.lines[0].creditedQty)).toBe(3);
    expect(Number(after.lines[0].remainingQty)).toBe(7);

    // Y devolver las 7 restantes tiene que pasar.
    await inTx((c) =>
      new FiscalDocumentService(c).issueCreditNote({
        companyId, issuerRnc: RNC, ncfType: "B04", date: DATE, modifiesDocId: id,
        matchInvoiceLines: true,
        lines: [{ description: "Producto Devolución", quantity: "7", unitPrice: "100", taxCode: "ITBIS18", productId: P }],
      }),
    );
    const done = await inTx((c) =>
      new FiscalDocumentService(c).creditableBalance(companyId, id),
    );
    expect(Number(done.lines[0].remainingQty)).toBe(0);
  });

  it("el mismo producto a dos precios son dos saldos distintos", async () => {
    const id = await inTx(async (c) => {
      const doc = await new FiscalDocumentService(c).issueInvoice({
        companyId, issuerRnc: RNC, ncfType: "B01", date: DATE,
        buyerRnc: BUYER, buyerName: "Cliente Devolución SRL", bookCogs: false,
        lines: [
          { description: "Producto Devolución", quantity: "4", unitPrice: "100", taxCode: "ITBIS18", productId: P },
          { description: "Producto Devolución", quantity: "6", unitPrice: "80", taxCode: "ITBIS18", productId: P },
        ],
      });
      return doc.documentId;
    });

    const bal = await inTx((c) =>
      new FiscalDocumentService(c).creditableBalance(companyId, id),
    );
    expect(bal.lines).toHaveLength(2);

    // Devolver 4 al precio de 100 no consume nada del cupo de 80.
    await inTx((c) =>
      new FiscalDocumentService(c).issueCreditNote({
        companyId, issuerRnc: RNC, ncfType: "B04", date: DATE, modifiesDocId: id,
        matchInvoiceLines: true,
        lines: [{ description: "Producto Devolución", quantity: "4", unitPrice: "100", taxCode: "ITBIS18", productId: P }],
      }),
    );

    const after = await inTx((c) =>
      new FiscalDocumentService(c).creditableBalance(companyId, id),
    );
    const at100 = after.lines.find((l) => Number(l.unitPrice) === 100)!;
    const at80 = after.lines.find((l) => Number(l.unitPrice) === 80)!;
    expect(Number(at100.remainingQty)).toBe(0);
    expect(Number(at80.remainingQty)).toBe(6);
  });

  it("avisa cuando el precio no corresponde al de la factura", async () => {
    const id = await sellTen();
    await expect(
      inTx((c) =>
        new FiscalDocumentService(c).issueCreditNote({
          companyId, issuerRnc: RNC, ncfType: "B04", date: DATE, modifiesDocId: id,
          matchInvoiceLines: true,
          lines: [{
            description: "Producto Devolución", quantity: "1", unitPrice: "999",
            taxCode: "ITBIS18", productId: P,
          }],
        }),
      ),
    ).rejects.toThrow(/no al precio indicado/);
  });

  it("rechaza acreditar algo que no estaba en la factura", async () => {
    const id = await sellTen();
    await expect(
      inTx((c) =>
        new FiscalDocumentService(c).issueCreditNote({
          companyId, issuerRnc: RNC, ncfType: "B04", date: DATE, modifiesDocId: id,
          matchInvoiceLines: true,
          lines: [{
            description: "Servicio que nunca se vendió", quantity: "1", unitPrice: "500",
            taxCode: "ITBIS18",
          }],
        }),
      ),
    ).rejects.toThrow(/no aparece en la factura original/);
  });

  it("un rechazo no quema el NCF de la nota de crédito", async () => {
    const id = await sellTen();
    const before = await pool.query(
      `SELECT next_number FROM ncf_sequences WHERE company_id=$1 AND ncf_type='B04'`,
      [companyId],
    );
    await expect(
      inTx((c) =>
        new FiscalDocumentService(c).issueCreditNote({
          companyId, issuerRnc: RNC, ncfType: "B04", date: DATE, modifiesDocId: id,
          matchInvoiceLines: true,
          lines: [{
            description: "Producto Devolución", quantity: "99", unitPrice: "100",
            taxCode: "ITBIS18", productId: P,
          }],
        }),
      ),
    ).rejects.toThrow();

    const after = await pool.query(
      `SELECT next_number FROM ncf_sequences WHERE company_id=$1 AND ncf_type='B04'`,
      [companyId],
    );
    expect(Number(after.rows[0].next_number)).toBe(Number(before.rows[0].next_number));
  });

  it("no admite notas de crédito contra una factura anulada", async () => {
    const id = await sellTen();
    await pool.query(`UPDATE fiscal_documents SET status='cancelled' WHERE id=$1`, [id]);
    await expect(
      inTx((c) => new FiscalDocumentService(c).creditableBalance(companyId, id)),
    ).rejects.toThrow(/anulada/);
  });

  // ── efectos contables y de inventario ─────────────────────────────────────

  it("la nota de crédito revierte ingreso e ITBIS en proporción", async () => {
    const id = await sellTen();
    const revenueBefore = await balanceOf("4.1.01.001");
    const itbisBefore = await balanceOf("2.1.02.001");

    await inTx((c) =>
      new FiscalDocumentService(c).issueCreditNote({
        companyId, issuerRnc: RNC, ncfType: "B04", date: DATE, modifiesDocId: id,
        matchInvoiceLines: true,
        lines: [{
          description: "Producto Devolución", quantity: "4", unitPrice: "100",
          taxCode: "ITBIS18", productId: P,
        }],
      }),
    );

    // 4 × 100 de ingreso y su ITBIS vuelven atrás. Ingreso es acreedor: revertir
    // lo acerca a cero, es decir, sube.
    expect(await balanceOf("4.1.01.001")).toBe(revenueBefore + 400);
    expect(await balanceOf("2.1.02.001")).toBe(itbisBefore + 72);
  });

  it("devolver mercancía la reingresa al costo con que salió", async () => {
    const id = await sellTen({ withStock: true });
    // Vendidas las 10 que había: el inventario quedó en cero y el costo en 600.
    expect(await balanceOf(INVENTORY)).toBe(0);
    expect(await balanceOf(COGS)).toBe(600);

    await inTx((c) =>
      new FiscalDocumentService(c).issueCreditNote({
        companyId, issuerRnc: RNC, ncfType: "B04", date: DATE, modifiesDocId: id,
        matchInvoiceLines: true,
        lines: [{
          description: "Producto Devolución", quantity: "4", unitPrice: "100",
          taxCode: "ITBIS18", productId: P,
        }],
        restockInventory: true,
      }),
    );

    // 4 unidades a 60 vuelven al inventario y neutralizan su costo de venta.
    expect(await balanceOf(INVENTORY)).toBe(240);
    expect(await balanceOf(COGS)).toBe(360);

    const val = await pool.query(
      `SELECT quantity_on_hand::text q FROM inventory_valuation
        WHERE company_id=$1 AND product_id=$2`,
      [companyId, P],
    );
    expect(Number(val.rows[0].q)).toBe(4);
  });

  it("sin reingreso de mercancía el inventario no se mueve", async () => {
    const id = await sellTen({ withStock: true });
    const cogsBefore = await balanceOf(COGS);

    await inTx((c) =>
      new FiscalDocumentService(c).issueCreditNote({
        companyId, issuerRnc: RNC, ncfType: "B04", date: DATE, modifiesDocId: id,
        matchInvoiceLines: true,
        lines: [{
          description: "Producto Devolución", quantity: "4", unitPrice: "100",
          taxCode: "ITBIS18", productId: P,
        }],
        restockInventory: false,
      }),
    );

    // La venta se acredita, pero la mercancía no volvió: el costo se queda.
    expect(await balanceOf(COGS)).toBe(cogsBefore);
    expect(await balanceOf(INVENTORY)).toBe(0);
  });

  it("la nota de crédito referencia la factura que modifica", async () => {
    const id = await sellTen();
    const note = await inTx((c) =>
      new FiscalDocumentService(c).issueCreditNote({
        companyId, issuerRnc: RNC, ncfType: "B04", date: DATE, modifiesDocId: id,
        matchInvoiceLines: true,
        lines: [{
          description: "Producto Devolución", quantity: "1", unitPrice: "100",
          taxCode: "ITBIS18", productId: P,
        }],
      }),
    );

    const { rows } = await pool.query(
      `SELECT doc_type, modifies_doc_id, modifies_ncf, total::text
         FROM fiscal_documents WHERE id=$1`,
      [note.documentId],
    );
    expect(rows[0].doc_type).toBe("credit_note");
    expect(Number(rows[0].modifies_doc_id)).toBe(id);
    expect(rows[0].modifies_ncf).toMatch(/^B01/);
    expect(Number(rows[0].total)).toBe(118);
  });
});
