import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { FiscalDocumentService } from "../server/fiscal/document-service";
import { generate607 } from "../server/fiscal/dgii-reports";

neonConfig.webSocketConstructor = ws;

describeIntegration("credit notes", () => {
  let pool: Pool;
  let companyId: number;
  const RNC = "145000001";
  const YEAR = new Date().getUTCFullYear();
  const MONTH = new Date().getUTCMonth() + 1;
  const DATE = `${YEAR}-${String(MONTH).padStart(2, "0")}-12`;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(`INSERT INTO companies (legal_name, rnc) VALUES ('CN SRL',$1) RETURNING id`, [RNC]);
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);
    await pool.query(
      `INSERT INTO ncf_sequences (company_id, ncf_type, range_from, range_to, next_number)
       VALUES ($1,'B01',1,100,1), ($1,'B04',1,100,1)`,
      [companyId],
    );
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
    await pool.query(`UPDATE ncf_sequences SET next_number=1 WHERE company_id=$1`, [companyId]);
  });

  async function inTx<T>(fn: (c: any) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
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

  const balanceOf = async (code: string) => {
    const r = await pool.query(
      `SELECT coalesce(sum(l.debit_func - l.credit_func),0)::text b
         FROM journal_entry_lines l JOIN chart_of_accounts a ON a.id=l.account_id
        WHERE l.company_id=$1 AND a.code=$2`,
      [companyId, code],
    );
    return Number(r.rows[0].b);
  };

  it("a full credit note reverses the sale and nets the ledger to zero", async () => {
    const invoice = await inTx((c) =>
      new FiscalDocumentService(c).issueInvoice({
        companyId,
        issuerRnc: RNC,
        ncfType: "B01",
        date: DATE,
        buyerRnc: "131000001",
        lines: [{ description: "Producto A", quantity: "1", unitPrice: "1000.00", taxCode: "ITBIS18" }],
      }),
    );
    expect(await balanceOf("4.1.01.001")).toBe(-1000);

    const cn = await inTx((c) =>
      new FiscalDocumentService(c).issueCreditNote({
        companyId,
        issuerRnc: RNC,
        ncfType: "B04",
        date: DATE,
        modifiesDocId: invoice.documentId,
        lines: [{ description: "Devolución Producto A", quantity: "1", unitPrice: "1000.00", taxCode: "ITBIS18" }],
      }),
    );
    expect(cn.ncf).toBe("B0400000001");

    // Sale reversed: revenue, ITBIS and cash all net to zero.
    expect(await balanceOf("4.1.01.001")).toBe(0);
    expect(await balanceOf("2.1.02.001")).toBe(0);
    expect(await balanceOf("1.1.01.001")).toBe(0);

    // The credit note references the original invoice.
    const row = await pool.query(`SELECT modifies_ncf, doc_type FROM fiscal_documents WHERE id=$1`, [cn.documentId]);
    expect(row.rows[0].doc_type).toBe("credit_note");
    expect(row.rows[0].modifies_ncf).toBe(invoice.ncf);
  });

  it("appears on the 607 alongside the invoice", async () => {
    const invoice = await inTx((c) =>
      new FiscalDocumentService(c).issueInvoice({
        companyId,
        issuerRnc: RNC,
        ncfType: "B01",
        date: DATE,
        buyerRnc: "131000001",
        lines: [{ description: "P", quantity: "1", unitPrice: "1000.00", taxCode: "ITBIS18" }],
      }),
    );
    await inTx((c) =>
      new FiscalDocumentService(c).issueCreditNote({
        companyId,
        issuerRnc: RNC,
        ncfType: "B04",
        date: DATE,
        modifiesDocId: invoice.documentId,
        lines: [{ description: "Dev", quantity: "1", unitPrice: "400.00", taxCode: "ITBIS18" }],
      }),
    );

    const r607 = await generate607(pool, { companyId, rnc: RNC, year: YEAR, month: MONTH });
    expect(r607.recordCount).toBe(2); // invoice + credit note
    const ncfs = r607.lines.map((l) => l.split("|")[2]);
    expect(ncfs).toContain("B0100000001");
    expect(ncfs).toContain("B0400000001");
  });

  it("a partial credit note reverses only part of the sale", async () => {
    const invoice = await inTx((c) =>
      new FiscalDocumentService(c).issueInvoice({
        companyId,
        issuerRnc: RNC,
        ncfType: "B01",
        date: DATE,
        lines: [{ description: "P", quantity: "1", unitPrice: "1000.00", taxCode: "ITBIS18" }],
      }),
    );
    await inTx((c) =>
      new FiscalDocumentService(c).issueCreditNote({
        companyId,
        issuerRnc: RNC,
        ncfType: "B04",
        date: DATE,
        modifiesDocId: invoice.documentId,
        lines: [{ description: "Dev parcial", quantity: "1", unitPrice: "300.00", taxCode: "ITBIS18" }],
      }),
    );
    // Revenue 1000 − 300 = 700 net credit.
    expect(await balanceOf("4.1.01.001")).toBe(-700);
    expect(await balanceOf("2.1.02.001")).toBe(-126); // ITBIS 180 − 54
  });
});
