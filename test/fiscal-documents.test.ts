import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { FiscalDocumentService } from "../server/fiscal/document-service";
import { NcfExhaustedError, formatNcf, isEcfType } from "../server/fiscal/ncf";
import { generate606, generate607, generate608 } from "../server/fiscal/dgii-reports";

neonConfig.webSocketConstructor = ws;

describeIntegration("fiscal documents and DGII filings", () => {
  let pool: Pool;
  let companyId: number;

  const RNC = "999000999";
  const BUYER_RNC = "131000001";
  const YEAR = new Date().getUTCFullYear();
  const MONTH = new Date().getUTCMonth() + 1;
  const DATE = `${YEAR}-${String(MONTH).padStart(2, "0")}-12`;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(
      `INSERT INTO companies (legal_name, rnc) VALUES ('Fiscal SRL', $1) RETURNING id`,
      [RNC],
    );
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);
  });

  afterAll(async () => {
    if (companyId) {
      await pool.query(`DELETE FROM fiscal_documents WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`DELETE FROM fiscal_documents WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId]);
    await pool.query(`DELETE FROM ncf_sequences WHERE company_id=$1`, [companyId]);
    await pool.query(
      `INSERT INTO ncf_sequences (company_id, ncf_type, range_from, range_to, next_number)
       VALUES ($1,'B01',1,100,1), ($1,'B02',1,100,1)`,
      [companyId],
    );
  });

  async function inTx<T>(fn: (svc: FiscalDocumentService) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const out = await fn(new FiscalDocumentService(client));
      await client.query("COMMIT");
      return out;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  const invoice = (over: Partial<Parameters<FiscalDocumentService["issueInvoice"]>[0]> = {}) => ({
    companyId,
    issuerRnc: RNC,
    ncfType: "B01",
    date: DATE,
    buyerRnc: BUYER_RNC,
    buyerName: "Cliente SRL",
    lines: [{ description: "Producto A", quantity: "1", unitPrice: "1000.00", taxCode: "ITBIS18" }],
    ...over,
  });

  it("formats legacy NCF at 11 chars and e-CF at 13", () => {
    expect(formatNcf("B01", 1)).toBe("B0100000001");
    expect(formatNcf("B01", 1)).toHaveLength(11);
    expect(formatNcf("E31", 1)).toBe("E310000000001");
    expect(formatNcf("E31", 1)).toHaveLength(13);
    expect(isEcfType("E31")).toBe(true);
    expect(isEcfType("B01")).toBe(false);
  });

  it("issues an invoice: allocates the NCF, persists it and posts it, atomically", async () => {
    const doc = await inTx((s) => s.issueInvoice(invoice()));

    expect(doc.ncf).toBe("B0100000001");
    expect(doc.total).toBe("1180");
    expect(doc.journalEntryId).toBeGreaterThan(0);

    const row = await pool.query(
      `SELECT status, total::text, itbis_18::text, journal_entry_id FROM fiscal_documents WHERE id=$1`,
      [doc.documentId],
    );
    expect(row.rows[0].status).toBe("issued");
    expect(row.rows[0].total).toBe("1180.0000");
    expect(row.rows[0].itbis_18).toBe("180.0000");
    expect(Number(row.rows[0].journal_entry_id)).toBe(doc.journalEntryId);

    // The ledger agrees with the document.
    const bal = await pool.query(
      `SELECT a.code, sum(l.debit_func) - sum(l.credit_func) AS b
         FROM journal_entry_lines l
         JOIN chart_of_accounts a ON a.id = l.account_id
        WHERE l.company_id=$1 GROUP BY a.code`,
      [companyId],
    );
    const m = Object.fromEntries(bal.rows.map((r) => [r.code, Number(r.b)]));
    expect(m["1.1.01.001"]).toBe(1180); // Caja
    expect(m["4.1.01.001"]).toBe(-1000); // Ventas
    expect(m["2.1.02.001"]).toBe(-180); // ITBIS por pagar
  });

  it("releases the NCF when the transaction rolls back, leaving no gap", async () => {
    // Force a failure after the NCF is allocated: an unmapped measure role would
    // not do it, so use an unknown tax code, which throws after allocation.
    await expect(
      inTx(async (s) => {
        await s.issueInvoice(invoice()); // takes B0100000001
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const seq = await pool.query(
      `SELECT next_number FROM ncf_sequences WHERE company_id=$1 AND ncf_type='B01'`,
      [companyId],
    );
    expect(Number(seq.rows[0].next_number)).toBe(1); // returned

    const doc = await inTx((s) => s.issueInvoice(invoice()));
    expect(doc.ncf).toBe("B0100000001"); // reused, no gap
  });

  it("routes a credit sale to receivables", async () => {
    await inTx((s) => s.issueInvoice(invoice({ paymentMethod: "credit" })));
    const bal = await pool.query(
      `SELECT sum(l.debit_func) - sum(l.credit_func) AS b
         FROM journal_entry_lines l JOIN chart_of_accounts a ON a.id=l.account_id
        WHERE l.company_id=$1 AND a.code='1.1.02.001'`,
      [companyId],
    );
    expect(Number(bal.rows[0].b)).toBe(1180);
  });

  it("refuses to issue when the sequence is exhausted", async () => {
    await pool.query(
      `UPDATE ncf_sequences SET next_number = range_to + 1 WHERE company_id=$1 AND ncf_type='B01'`,
      [companyId],
    );
    await expect(inTx((s) => s.issueInvoice(invoice()))).rejects.toThrow(NcfExhaustedError);
  });

  it("cancelling reverses the entry and never reuses the NCF", async () => {
    const doc = await inTx((s) => s.issueInvoice(invoice()));
    await inTx((s) => s.cancel(doc.documentId, "cliente anuló el pedido"));

    const row = await pool.query(`SELECT status FROM fiscal_documents WHERE id=$1`, [doc.documentId]);
    expect(row.rows[0].status).toBe("cancelled");

    // Ledger back to zero.
    const bal = await pool.query(
      `SELECT coalesce(sum(debit_func) - sum(credit_func),0) b FROM journal_entry_lines WHERE company_id=$1`,
      [companyId],
    );
    expect(Number(bal.rows[0].b)).toBe(0);

    // The next invoice takes the following number: the gap is permanent.
    const next = await inTx((s) => s.issueInvoice(invoice()));
    expect(next.ncf).toBe("B0100000002");
  });

  // ── DGII filings ──────────────────────────────────────────────────────────

  it("607 lists issued sales, excludes cancelled, and ties to the ledger", async () => {
    const a = await inTx((s) => s.issueInvoice(invoice()));
    await inTx((s) =>
      s.issueInvoice(
        invoice({
          lines: [
            { description: "Servicio B", quantity: "2", unitPrice: "250.00", taxCode: "ITBIS18" },
            { description: "Libro exento", quantity: "1", unitPrice: "300.00", taxCode: "EXENTO" },
          ],
        }),
      ),
    );
    const cancelled = await inTx((s) => s.issueInvoice(invoice()));
    await inTx((s) => s.cancel(cancelled.documentId, "duplicada"));

    const r607 = await generate607(pool, { companyId, rnc: RNC, year: YEAR, month: MONTH });

    expect(r607.recordCount).toBe(2); // the cancelled one is absent
    expect(r607.header).toBe(`607|${RNC}|${YEAR}${String(MONTH).padStart(2, "0")}|2`);

    const first = r607.lines[0].split("|");
    expect(first[0]).toBe(BUYER_RNC);
    expect(first[1]).toBe("1"); // 9-digit RNC
    expect(first[2]).toBe(a.ncf);
    expect(first[5]).toBe("1000.00"); // subtotal gravado
    expect(first[6]).toBe("180.00"); // ITBIS
    expect(first[11]).toBe("1180.00"); // total

    const second = r607.lines[1].split("|");
    expect(second[5]).toBe("500.00"); // taxed
    expect(second[9]).toBe("300.00"); // exempt
    expect(second[6]).toBe("90.00"); // ITBIS on 500 only

    // Every 607 total ties to the ITBIS the ledger recorded for those documents.
    const ledgerItbis = await pool.query(
      `SELECT coalesce(sum(l.credit_func) - sum(l.debit_func),0) b
         FROM journal_entry_lines l JOIN chart_of_accounts a ON a.id=l.account_id
        WHERE l.company_id=$1 AND a.code='2.1.02.001'`,
      [companyId],
    );
    const filedItbis = r607.lines.reduce((acc, l) => acc + Number(l.split("|")[6]), 0);
    expect(Number(ledgerItbis.rows[0].b)).toBe(filedItbis); // cancelled netted to zero
  });

  it("607 leaves the buyer id blank for consumo final", async () => {
    await inTx((s) => s.issueInvoice(invoice({ ncfType: "B02", buyerRnc: undefined, buyerName: undefined })));
    const r = await generate607(pool, { companyId, rnc: RNC, year: YEAR, month: MONTH });
    const f = r.lines[0].split("|");
    expect(f[0]).toBe(""); // no RNC
    expect(f[1]).toBe(""); // and therefore no id type, not "1"
    expect(f[2]).toBe("B0200000001");
  });

  it("608 lists exactly the cancelled comprobantes", async () => {
    const keep = await inTx((s) => s.issueInvoice(invoice()));
    const kill = await inTx((s) => s.issueInvoice(invoice()));
    await inTx((s) => s.cancel(kill.documentId, "error de digitación"));

    const r608 = await generate608(pool, { companyId, rnc: RNC, year: YEAR, month: MONTH });
    expect(r608.recordCount).toBe(1);
    const [ncf, , reason] = r608.lines[0].split("|");
    expect(ncf).toBe(kill.ncf);
    expect(reason).toBe("01");
    expect(r608.content).not.toContain(keep.ncf);
  });

  it("606 reports the supplier's RNC, not our own", async () => {
    const SUPPLIER_RNC = "130123456";
    await pool.query(
      `INSERT INTO fiscal_documents
         (company_id, doc_type, ncf, ncf_type, issuer_rnc, buyer_rnc,
          subtotal_taxed, itbis_18, retention_itbis, retention_isr, total, status, emitted_at)
       VALUES ($1,'purchase','B0100000055','B01',$2,$3, 2000, 360, 108, 0, 2252, 'issued', $4::date)`,
      [companyId, SUPPLIER_RNC, RNC, DATE],
    );

    const r606 = await generate606(pool, { companyId, rnc: RNC, year: YEAR, month: MONTH });
    expect(r606.recordCount).toBe(1);
    const f = r606.lines[0].split("|");
    expect(f[0]).toBe(SUPPLIER_RNC); // the supplier issued it
    expect(f[0]).not.toBe(RNC);
    expect(f[1]).toBe("1");
    expect(f[2]).toBe("09");
    expect(f[3]).toBe("B0100000055");
    expect(f[6]).toBe("2000.00");
    expect(f[7]).toBe("360.00");
    expect(f[8]).toBe("108.00"); // ITBIS retenido
    expect(f[10]).toBe("2252.00");
  });

  it("an empty period produces a header with a zero count and no lines", async () => {
    const r = await generate607(pool, { companyId, rnc: RNC, year: 2001, month: 1 });
    expect(r.recordCount).toBe(0);
    expect(r.content).toBe(`607|${RNC}|200101|0`);
  });

  it("amounts are formatted to exactly two decimals, dot-separated", async () => {
    await inTx((s) =>
      s.issueInvoice(
        invoice({ lines: [{ description: "X", quantity: "3", unitPrice: "33.33", taxCode: "ITBIS18" }] }),
      ),
    );
    const r = await generate607(pool, { companyId, rnc: RNC, year: YEAR, month: MONTH });
    const f = r.lines[0].split("|");
    expect(f[5]).toBe("99.99");
    expect(f[6]).toBe("18.00"); // 99.99 * 0.18 = 17.9982 -> 18.00
    expect(f[11]).toBe("117.99");
    for (const idx of [5, 6, 7, 8, 9, 10, 11]) {
      expect(f[idx]).toMatch(/^-?\d+\.\d{2}$/);
    }
  });
});
