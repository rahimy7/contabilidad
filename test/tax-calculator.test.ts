import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import fc from "fast-check";
import { describeIntegration, TEST_DATABASE_URL } from "./helpers";
import { seedCompanyDefaults } from "../server/seed/company-defaults";
import { TaxCalculator, TaxConfigurationError, ties } from "../server/fiscal/tax-calculator";
import { add, sum, cmp, roundTo } from "../server/accounting/decimal";

neonConfig.webSocketConstructor = ws;

describeIntegration("tax calculator", () => {
  let pool: Pool;
  let companyId: number;
  let calc: TaxCalculator;

  const RNC = "999000888";
  const DATE = "2026-03-15";

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
    await pool.query(`DELETE FROM companies WHERE rnc=$1`, [RNC]);
    const c = await pool.query(
      `INSERT INTO companies (legal_name, rnc) VALUES ('Tax SRL', $1) RETURNING id`,
      [RNC],
    );
    companyId = c.rows[0].id;
    await seedCompanyDefaults(pool, companyId);
    calc = new TaxCalculator(pool);
  });

  afterAll(async () => {
    if (companyId) await pool.query(`DELETE FROM companies WHERE id=$1`, [companyId]);
    await pool.end();
  });

  it("computes ITBIS at 18% on a simple line", async () => {
    const r = await calc.compute([{ quantity: "1", unitPrice: "1000.00", taxCode: "ITBIS18" }], {
      companyId,
      date: DATE,
    });
    expect(r.subtotalTaxed).toBe("1000");
    expect(r.itbis18).toBe("180");
    expect(r.total).toBe("1180");
  });

  it("rounds ITBIS per line, so the lines sum to the header", async () => {
    // 33.33 * 0.18 = 5.9994 -> 6.00 per line. Three lines: 18.00, not 17.9982.
    const lines = Array(3).fill({ quantity: "1", unitPrice: "33.33", taxCode: "ITBIS18" });
    const r = await calc.compute(lines, { companyId, date: DATE });
    expect(r.lines.map((l) => l.itbisAmount)).toEqual(["6", "6", "6"]);
    expect(r.itbis18).toBe("18");
    expect(sum(r.lines.map((l) => l.itbisAmount))).toBe(r.itbis18);
  });

  it("separates exempt from taxed subtotals and taxes neither by accident", async () => {
    const r = await calc.compute(
      [
        { quantity: "2", unitPrice: "500.00", taxCode: "ITBIS18" },
        { quantity: "1", unitPrice: "300.00", taxCode: "EXENTO" },
      ],
      { companyId, date: DATE },
    );
    expect(r.subtotalTaxed).toBe("1000");
    expect(r.subtotalExempt).toBe("300");
    expect(r.itbis18).toBe("180");
    expect(r.total).toBe("1480");
    expect(r.lines[1].isExempt).toBe(true);
    expect(r.lines[1].itbisAmount).toBe("0");
  });

  it("applies a line discount before tax", async () => {
    const r = await calc.compute(
      [{ quantity: "1", unitPrice: "1000.00", discount: "100.00", taxCode: "ITBIS18" }],
      { companyId, date: DATE },
    );
    expect(r.lines[0].lineTotal).toBe("900");
    expect(r.itbis18).toBe("162"); // 900 * 0.18, not 1000 * 0.18 - 100
  });

  it("computes propina legal on the taxed base and does not tax it", async () => {
    const r = await calc.compute([{ quantity: "1", unitPrice: "1000.00", taxCode: "ITBIS18" }], {
      companyId,
      date: DATE,
      applyLegalTip: true,
    });
    expect(r.tipLegal).toBe("100");
    expect(r.itbis18).toBe("180"); // unchanged: the tip is outside the ITBIS base
    expect(r.total).toBe("1280");
  });

  it("withholds 100% of ITBIS and 10% ISR buying services from a persona física", async () => {
    const r = await calc.compute([{ quantity: "1", unitPrice: "1000.00", taxCode: "ITBIS18" }], {
      companyId,
      date: DATE,
      counterpartyType: "persona_fisica",
      operationType: "servicios",
      applyRetentions: true,
    });
    expect(r.retentionItbis).toBe("180"); // 100% of the 180 ITBIS
    expect(r.retentionIsr).toBe("100"); // 10% of the 1000 gross
    expect(r.total).toBe("900"); // 1180 - 180 - 100
  });

  it("withholds 30% of ITBIS buying services from a persona jurídica, and no ISR", async () => {
    const r = await calc.compute([{ quantity: "1", unitPrice: "1000.00", taxCode: "ITBIS18" }], {
      companyId,
      date: DATE,
      counterpartyType: "persona_juridica",
      operationType: "servicios",
      applyRetentions: true,
    });
    expect(r.retentionItbis).toBe("54"); // 30% of 180
    expect(r.retentionIsr).toBe("0");
    expect(r.total).toBe("1126");
  });

  it("does not withhold on a sale: the buyer withholds from us, not us from us", async () => {
    const r = await calc.compute([{ quantity: "1", unitPrice: "1000.00", taxCode: "ITBIS18" }], {
      companyId,
      date: DATE,
      counterpartyType: "persona_fisica",
      operationType: "servicios",
      // applyRetentions omitted — this is a sale
    });
    expect(r.retentions).toHaveLength(0);
    expect(r.total).toBe("1180");
  });

  it("rejects an unknown tax code instead of silently charging zero", async () => {
    await expect(
      calc.compute([{ quantity: "1", unitPrice: "100", taxCode: "ITBIS99" }], {
        companyId,
        date: DATE,
      }),
    ).rejects.toThrow(TaxConfigurationError);
  });

  it("reads the rate in force on the document's date, not today's", async () => {
    // Enter a hypothetical future rate change. Documents before it are untouched.
    const tc = await pool.query(
      `SELECT id FROM tax_codes WHERE company_id=$1 AND code='ITBIS18'`,
      [companyId],
    );
    await pool.query(
      `UPDATE tax_rates SET valid_to = DATE '2026-12-31' WHERE tax_code_id=$1`,
      [tc.rows[0].id],
    );
    await pool.query(
      `INSERT INTO tax_rates (tax_code_id, rate, valid_from) VALUES ($1, 0.20, DATE '2027-01-01')`,
      [tc.rows[0].id],
    );

    const before = await calc.compute([{ quantity: "1", unitPrice: "1000", taxCode: "ITBIS18" }], {
      companyId,
      date: "2026-06-01",
    });
    const after = await calc.compute([{ quantity: "1", unitPrice: "1000", taxCode: "ITBIS18" }], {
      companyId,
      date: "2027-06-01",
    });
    expect(before.itbis18).toBe("180");
    expect(after.itbis18).toBe("200");

    // Restore, so later tests in this file see the seeded configuration.
    await pool.query(`DELETE FROM tax_rates WHERE tax_code_id=$1 AND valid_from='2027-01-01'`, [
      tc.rows[0].id,
    ]);
    await pool.query(`UPDATE tax_rates SET valid_to = NULL WHERE tax_code_id=$1`, [tc.rows[0].id]);
  });

  it("property: line totals always tie to the subtotals, and ITBIS never exceeds 18%", async () => {
    const money = fc.integer({ min: 1, max: 999_999 }).map((c) => (c / 100).toFixed(2));

    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            unitPrice: money,
            quantity: fc.integer({ min: 1, max: 20 }).map(String),
            taxCode: fc.constantFrom("ITBIS18", "ITBIS0", "EXENTO"),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        async (lines) => {
          const r = await calc.compute(lines, { companyId, date: DATE });

          expect(ties(r)).toBe(true);

          // ITBIS is bounded by 18% of the taxed base, allowing a centavo of
          // per-line rounding for each line.
          const bound = add(roundTo(String(Number(r.subtotalTaxed) * 0.18), 2), String(lines.length * 0.01));
          expect(cmp(r.itbis18, bound)).toBeLessThanOrEqual(0);

          // The total is what the counterparty pays, and nothing is negative.
          expect(cmp(r.total, "0")).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 15 },
    );
  });
});
