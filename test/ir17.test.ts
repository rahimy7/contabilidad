import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { Payables } from "../server/subledgers/payables";
import { generateIr17 } from "../server/fiscal/dgii-reports";

neonConfig.webSocketConstructor = ws;

describeIntegration("IR-17 ISR retention declaration", () => {
  let pool: Pool;
  let companyId: number;
  const RNC = "149000001";
  const YEAR = new Date().getUTCFullYear();
  const MONTH = new Date().getUTCMonth() + 1;
  const DATE = `${YEAR}-${String(MONTH).padStart(2, "0")}-10`;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(`INSERT INTO companies (legal_name, rnc) VALUES ('IR17 SRL',$1) RETURNING id`, [RNC]);
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);
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

  it("groups ISR withholdings by concept and reconciles the total to ISR retenido por pagar", async () => {
    // Honorarios: persona física, servicios — the seeded ISR rule withholds 10%.
    await inTx((c) =>
      new Payables(c).registerInvoice({
        companyId, supplierRnc: "40200300401", ncf: "B1100000001", ncfType: "B11",
        date: DATE, dueDate: DATE, counterpartyType: "persona_fisica", operationType: "servicios",
        applyRetentions: true,
        lines: [{ description: "Honorarios", quantity: "1", unitPrice: "1000.00", taxCode: "ITBIS18" }],
      }),
    );
    // Alquiler: same 10% ISR rule, but tagged explicitly as the alquileres concept.
    await inTx((c) =>
      new Payables(c).registerInvoice({
        companyId, supplierRnc: "40200300402", ncf: "B1100000002", ncfType: "B11",
        date: DATE, dueDate: DATE, counterpartyType: "persona_fisica", operationType: "servicios",
        applyRetentions: true, retentionConcept: "alquileres",
        lines: [{ description: "Alquiler local", quantity: "1", unitPrice: "2000.00", taxCode: "ITBIS18" }],
      }),
    );
    // A plain purchase with no retention must not appear on the IR-17.
    await inTx((c) =>
      new Payables(c).registerInvoice({
        companyId, supplierRnc: "130999888", ncf: "B0100000077", ncfType: "B01",
        date: DATE, dueDate: DATE,
        lines: [{ description: "Mercancía", quantity: "1", unitPrice: "5000.00", taxCode: "ITBIS18" }],
      }),
    );

    const ir17 = await generateIr17(pool, { companyId, rnc: RNC, year: YEAR, month: MONTH });

    // Two concept lines only — the plain purchase is excluded.
    expect(ir17.lines.length).toBe(2);
    const byConcept = Object.fromEntries(ir17.lines.map((l) => [l.concept, l]));
    expect(byConcept.honorarios.retained).toBe("100.00"); // 10% of 1000
    expect(byConcept.honorarios.base).toBe("1000.00");
    expect(byConcept.honorarios.label).toBe("Honorarios por servicios");
    expect(byConcept.alquileres.retained).toBe("200.00"); // 10% of 2000
    expect(byConcept.alquileres.label).toBe("Alquileres");

    expect(ir17.totalRetained).toBe("300.00");
    expect(ir17.totalBase).toBe("3000.00");

    // Reconciles to the ledger: credit movement of "ISR retenido por pagar".
    const ledger = await pool.query(
      `SELECT coalesce(sum(l.credit_func - l.debit_func),0)::text isr_retenido
         FROM journal_entry_lines l JOIN chart_of_accounts a ON a.id=l.account_id
        WHERE l.company_id=$1 AND a.code='2.1.02.003'`,
      [companyId],
    );
    expect(Number(ledger.rows[0].isr_retenido)).toBe(300);
  });
});
