import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { FiscalDocumentService } from "../server/fiscal/document-service";
import { Payables } from "../server/subledgers/payables";
import { generateIt1 } from "../server/fiscal/dgii-reports";

neonConfig.webSocketConstructor = ws;

describeIntegration("IT-1 ITBIS declaration", () => {
  let pool: Pool;
  let companyId: number;
  const RNC = "148000001";
  const YEAR = new Date().getUTCFullYear();
  const MONTH = new Date().getUTCMonth() + 1;
  const DATE = `${YEAR}-${String(MONTH).padStart(2, "0")}-10`;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(`INSERT INTO companies (legal_name, rnc) VALUES ('IT1 SRL',$1) RETURNING id`, [RNC]);
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);
    await pool.query(`INSERT INTO ncf_sequences (company_id, ncf_type, range_from, range_to, next_number) VALUES ($1,'B01',1,100,1)`, [companyId]);
  });

  afterAll(async () => {
    if (companyId) {
      await pool.query(`DELETE FROM ap_open_items WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM fiscal_documents WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    await pool.end();
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

  it("nets ITBIS charged against ITBIS paid to a balance to pay", async () => {
    // Sale: ITBIS charged 180.
    await inTx((c) =>
      new FiscalDocumentService(c).issueInvoice({
        companyId, issuerRnc: RNC, ncfType: "B01", date: DATE, buyerRnc: "131000001",
        lines: [{ description: "Venta", quantity: "1", unitPrice: "1000.00", taxCode: "ITBIS18" }],
      }),
    );
    // Purchase: ITBIS paid (crédito fiscal) 90.
    await inTx((c) =>
      new Payables(c).registerInvoice({
        companyId, supplierRnc: "130123456", ncf: "B0100000099", ncfType: "B01", date: DATE, dueDate: DATE,
        lines: [{ description: "Compra", quantity: "1", unitPrice: "500.00", taxCode: "ITBIS18" }],
      }),
    );

    const it1 = await generateIt1(pool, { companyId, rnc: RNC, year: YEAR, month: MONTH });
    expect(it1.itbisCharged).toBe("180.00");
    expect(it1.itbisPaid).toBe("90.00");
    expect(it1.balanceToPay).toBe("90.00"); // 180 − 90

    // Reconciles with the ledger: ITBIS por pagar (180) − ITBIS adelantado (90) = 90.
    const ledger = await pool.query(
      `SELECT
         coalesce(sum(l.credit_func - l.debit_func) FILTER (WHERE a.code='2.1.02.001'),0)::text AS por_pagar,
         coalesce(sum(l.debit_func - l.credit_func) FILTER (WHERE a.code='1.1.04.001'),0)::text AS adelantado
         FROM journal_entry_lines l JOIN chart_of_accounts a ON a.id=l.account_id WHERE l.company_id=$1`,
      [companyId],
    );
    const net = Number(ledger.rows[0].por_pagar) - Number(ledger.rows[0].adelantado);
    expect(net).toBe(90);
  });
});
