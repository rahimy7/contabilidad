import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { FiscalDocumentService } from "../server/fiscal/document-service";
import { Receivables, ReceivablesError } from "../server/subledgers/receivables";
import { Payables } from "../server/subledgers/payables";
import { generate606 } from "../server/fiscal/dgii-reports";

neonConfig.webSocketConstructor = ws;

describeIntegration("AR/AP subledgers", () => {
  let pool: Pool;
  let companyId: number;
  const RNC = "143000001";
  const YEAR = new Date().getUTCFullYear();
  const MONTH = new Date().getUTCMonth() + 1;
  const DATE = `${YEAR}-${String(MONTH).padStart(2, "0")}-10`;
  const DUE = `${YEAR}-${String(MONTH).padStart(2, "0")}-25`;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(`INSERT INTO companies (legal_name, rnc) VALUES ('Sub SRL',$1) RETURNING id`, [RNC]);
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);
    await pool.query(
      `INSERT INTO ncf_sequences (company_id, ncf_type, range_from, range_to, next_number) VALUES ($1,'B01',1,100,1)`,
      [companyId],
    );
  });

  afterAll(async () => {
    if (companyId) {
      await pool.query(`DELETE FROM ar_applications WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM ap_applications WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM ar_receipts WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM ap_payments WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM ar_open_items WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM ap_open_items WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM fiscal_documents WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM journal_entries WHERE company_id=$1`, [companyId]);
      await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    }
    await pool.end();
  });

  beforeEach(async () => {
    for (const t of ["ar_applications", "ap_applications", "ar_receipts", "ap_payments", "ar_open_items", "ap_open_items", "fiscal_documents", "journal_entries"]) {
      await pool.query(`DELETE FROM ${t} WHERE company_id=$1`, [companyId]);
    }
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

  // ── Accounts receivable ───────────────────────────────────────────────────

  it("a credit sale opens a receivable that a receipt settles, tying to the control account", async () => {
    // Issue a credit invoice, then open the receivable off it.
    const { openItemId } = await inTx(async (c) => {
      const doc = await new FiscalDocumentService(c).issueInvoice({
        companyId,
        issuerRnc: RNC,
        ncfType: "B01",
        date: DATE,
        buyerRnc: "131000001",
        paymentMethod: "credit",
        lines: [{ description: "Servicio", quantity: "1", unitPrice: "1000.00", taxCode: "ITBIS18" }],
      });
      const id = await new Receivables(c).openItem({
        companyId,
        documentId: doc.documentId,
        issueDate: DATE,
        dueDate: DUE,
        amount: doc.total,
      });
      return { openItemId: id };
    });

    // Clientes control account holds 1180 (from the credit invoice posting).
    expect(await balanceOf("1.1.02.001")).toBe(1180);

    // Sum of open AR balances equals the control account — the reconciliation.
    const open = await pool.query(`SELECT coalesce(sum(balance),0)::text b FROM ar_open_items WHERE company_id=$1`, [companyId]);
    expect(Number(open.rows[0].b)).toBe(1180);

    // A partial receipt of 700.
    await inTx((c) =>
      new Receivables(c).registerReceipt({
        companyId,
        receiptDate: DATE,
        amount: "700.00",
        applications: [{ openItemId, amount: "700.00" }],
      }),
    );
    expect(await balanceOf("1.1.02.001")).toBe(480); // 1180 − 700
    expect(await balanceOf("1.1.01.001")).toBe(700); // cash received

    const item = await pool.query(`SELECT balance::text, status FROM ar_open_items WHERE id=$1`, [openItemId]);
    expect(Number(item.rows[0].balance)).toBe(480);
    expect(item.rows[0].status).toBe("partial");
  });

  it("rejects a receipt that over-applies an open item", async () => {
    const openItemId = await inTx((c) =>
      new Receivables(c).openItem({ companyId, issueDate: DATE, dueDate: DUE, amount: "100.00" }),
    );
    await expect(
      inTx((c) =>
        new Receivables(c).registerReceipt({
          companyId,
          receiptDate: DATE,
          amount: "150.00",
          applications: [{ openItemId, amount: "150.00" }],
        }),
      ),
    ).rejects.toThrow(ReceivablesError);
  });

  // ── Accounts payable ──────────────────────────────────────────────────────

  it("a supplier invoice opens a payable, posts to the ledger, and feeds the 606", async () => {
    const { openItemId, total } = await inTx((c) =>
      new Payables(c).registerInvoice({
        companyId,
        supplierRnc: "130123456",
        ncf: "B0100000055",
        ncfType: "B01",
        date: DATE,
        dueDate: DUE,
        lines: [{ description: "Mercancía", quantity: "1", unitPrice: "2000.00", taxCode: "ITBIS18" }],
      }),
    );
    expect(total).toBe("2360"); // 2000 + 18%

    // Ledger: inventory 2000, ITBIS adelantado 360, Proveedores 2360.
    expect(await balanceOf("1.1.03.001")).toBe(2000);
    expect(await balanceOf("1.1.04.001")).toBe(360);
    expect(await balanceOf("2.1.01.001")).toBe(-2360);

    // The 606 reports it, under the supplier's RNC.
    const r606 = await generate606(pool, { companyId, rnc: RNC, year: YEAR, month: MONTH });
    expect(r606.recordCount).toBe(1);
    expect(r606.lines[0].split("|")[0]).toBe("130123456");

    // Pay it in full.
    await inTx((c) =>
      new Payables(c).registerPayment({
        companyId,
        paymentDate: DUE,
        amount: "2360.00",
        applications: [{ openItemId, amount: "2360.00" }],
      }),
    );
    expect(await balanceOf("2.1.01.001")).toBe(0); // payable cleared
    const item = await pool.query(`SELECT status FROM ap_open_items WHERE id=$1`, [openItemId]);
    expect(item.rows[0].status).toBe("paid");
  });

  it("a supplier invoice with retentions books a smaller payable than the total", async () => {
    const { total } = await inTx((c) =>
      new Payables(c).registerInvoice({
        companyId,
        supplierRnc: "40200300400", // 11 digits = persona física
        ncf: "B1100000001",
        ncfType: "B11",
        date: DATE,
        dueDate: DUE,
        counterpartyType: "persona_fisica",
        operationType: "servicios",
        applyRetentions: true,
        lines: [{ description: "Honorarios", quantity: "1", unitPrice: "1000.00", taxCode: "ITBIS18" }],
      }),
    );
    expect(total).toBe("1180");
    // Retentions: 100% ITBIS (180) + 10% ISR (100). Payable = 1180 − 280 = 900.
    const item = await pool.query(`SELECT original_amount::text FROM ap_open_items WHERE company_id=$1`, [companyId]);
    expect(Number(item.rows[0].original_amount)).toBe(900);
    // Liabilities to DGII created.
    expect(await balanceOf("2.1.02.002")).toBe(-180); // ITBIS retenido por pagar
    expect(await balanceOf("2.1.02.003")).toBe(-100); // ISR retenido por pagar
  });

  it("AR aging buckets an overdue item into the right column", async () => {
    await inTx((c) =>
      new Receivables(c).openItem({
        companyId,
        customerId: undefined,
        issueDate: "2026-01-01",
        dueDate: "2026-01-31",
        amount: "500.00",
      }),
    );
    const aging = await new Receivables(pool).aging(companyId, "2026-04-15");
    // Due 2026-01-31, as of 2026-04-15 → ~75 days overdue → 61-90 bucket.
    const row = aging[0];
    expect(Number(row.d61_90)).toBe(500);
    expect(Number(row.total)).toBe(500);
  });
});
