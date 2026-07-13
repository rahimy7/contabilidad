import { Decimal, add, mul, sub, sum, roundTo, isZero, cmp } from "../accounting/decimal";
import { SqlClient } from "../accounting/types";

/**
 * ITBIS, propina legal and retenciones, computed from a company's configuration
 * rather than from constants.
 *
 * The inherited POS hardcodes "ITBIS (0%)" in two React components. That cannot
 * ship to other Dominican taxpayers: rates differ by good and service, they
 * change by law, and the retention a buyer must withhold depends on whether the
 * seller is a persona física or jurídica. All of it lives in `tax_codes`,
 * `tax_rates` and `retention_rules`.
 *
 * Rates are read as of the document's date, not as of today, so reprinting a
 * 2024 invoice reproduces the 2024 tax.
 */

export type CounterpartyType = "persona_fisica" | "persona_juridica";
export type OperationType = "bienes" | "servicios";

export interface TaxLineInput {
  quantity: Decimal;
  unitPrice: Decimal;
  /** Absolute amount, already computed by the caller. */
  discount?: Decimal;
  /** References `tax_codes.code`. Unknown codes are rejected, not silently zeroed. */
  taxCode: string;
}

export interface TaxLineResult {
  /** quantity * unitPrice - discount, rounded to the centavo. */
  lineTotal: Decimal;
  itbisRate: Decimal;
  itbisAmount: Decimal;
  isExempt: boolean;
  taxCode: string;
}

export interface Retention {
  ruleName: string;
  base: "itbis" | "isr" | "gross";
  rate: Decimal;
  amount: Decimal;
  accountRef: string | null;
}

export interface TaxBreakdown {
  lines: TaxLineResult[];
  subtotalTaxed: Decimal;
  subtotalExempt: Decimal;
  itbis18: Decimal;
  itbis16: Decimal;
  itbis0: Decimal;
  tipLegal: Decimal;
  retentionItbis: Decimal;
  retentionIsr: Decimal;
  retentions: Retention[];
  /** What the counterparty actually pays: taxed + exempt + itbis + tip - retentions. */
  total: Decimal;
}

export interface ComputeOptions {
  companyId: number;
  /** Rates in force on this date. ISO. */
  date: string;
  counterpartyType?: CounterpartyType;
  operationType?: OperationType;
  /**
   * Retentions apply when *we* are the withholding agent — i.e. on purchases.
   * On a sale it is the buyer who withholds from us, and that shows up on their
   * document, not ours.
   */
  applyRetentions?: boolean;
  /** Propina legal 10%, only meaningful for prepared food and similar services. */
  applyLegalTip?: boolean;
}

interface TaxCodeRow {
  code: string;
  kind: string;
  rate: Decimal | null;
}

interface RetentionRuleRow {
  name: string;
  base: "itbis" | "isr" | "gross";
  rate: Decimal;
  applies_when: Record<string, unknown>;
  account_ref: string | null;
}

export class TaxConfigurationError extends Error {}

export class TaxCalculator {
  constructor(private readonly client: SqlClient) {}

  async compute(lines: TaxLineInput[], opts: ComputeOptions): Promise<TaxBreakdown> {
    const codes = await this.loadTaxCodes(opts.companyId, opts.date);

    const results: TaxLineResult[] = lines.map((line) => {
      const cfg = codes.get(line.taxCode);
      if (!cfg) {
        throw new TaxConfigurationError(
          `tax code '${line.taxCode}' is not configured for company ${opts.companyId}`,
        );
      }

      const gross = mul(line.quantity, line.unitPrice);
      const lineTotal = roundTo(sub(gross, line.discount ?? "0"), 2);

      const isExempt = cfg.code === "EXENTO";
      const rate = isExempt ? "0" : (cfg.rate ?? "0");
      // Rounded per line, not on the invoice total. That is what DGII expects,
      // and it is why the line amounts sum to the header without a residue.
      const itbisAmount = isExempt ? "0" : roundTo(mul(lineTotal, rate), 2);

      return { lineTotal, itbisRate: rate, itbisAmount, isExempt, taxCode: cfg.code };
    });

    const subtotalTaxed = sum(results.filter((l) => !l.isExempt).map((l) => l.lineTotal));
    const subtotalExempt = sum(results.filter((l) => l.isExempt).map((l) => l.lineTotal));
    const byRate = (code: string) =>
      sum(results.filter((l) => l.taxCode === code).map((l) => l.itbisAmount));

    const itbis18 = byRate("ITBIS18");
    const itbis16 = byRate("ITBIS16");
    const itbis0 = byRate("ITBIS0");
    const itbisTotal = sum([itbis18, itbis16, itbis0]);

    // Propina legal is computed on the taxed service base and is not itself
    // subject to ITBIS.
    const tipRate = codes.get("PROPINA")?.rate ?? "0";
    const tipLegal = opts.applyLegalTip ? roundTo(mul(subtotalTaxed, tipRate), 2) : "0";

    const grossSubtotal = add(subtotalTaxed, subtotalExempt);

    const retentions = opts.applyRetentions
      ? await this.computeRetentions(opts, { grossSubtotal, itbisTotal })
      : [];

    const retentionItbis = sum(retentions.filter((r) => r.base === "itbis").map((r) => r.amount));
    const retentionIsr = sum(
      retentions.filter((r) => r.base === "isr" || r.base === "gross").map((r) => r.amount),
    );

    const total = sub(
      sum([grossSubtotal, itbisTotal, tipLegal]),
      add(retentionItbis, retentionIsr),
    );

    return {
      lines: results,
      subtotalTaxed,
      subtotalExempt,
      itbis18,
      itbis16,
      itbis0,
      tipLegal,
      retentionItbis,
      retentionIsr,
      retentions,
      total,
    };
  }

  /**
   * Rates valid on `date`. `valid_to` is exclusive-open: a NULL means "still in
   * force". Picking the latest `valid_from` that has started lets a future rate
   * change be entered in advance without affecting today's invoices.
   */
  private async loadTaxCodes(companyId: number, date: string): Promise<Map<string, TaxCodeRow>> {
    const { rows } = await this.client.query(
      `SELECT DISTINCT ON (tc.code)
              tc.code, tc.kind, tr.rate::text AS rate
         FROM tax_codes tc
         LEFT JOIN tax_rates tr
                ON tr.tax_code_id = tc.id
               AND tr.valid_from <= $2::date
               AND (tr.valid_to IS NULL OR tr.valid_to >= $2::date)
        WHERE tc.company_id = $1 AND tc.is_active
        ORDER BY tc.code, tr.valid_from DESC NULLS LAST`,
      [companyId, date],
    );
    return new Map(rows.map((r) => [r.code, r as TaxCodeRow]));
  }

  private async computeRetentions(
    opts: ComputeOptions,
    bases: { grossSubtotal: Decimal; itbisTotal: Decimal },
  ): Promise<Retention[]> {
    const { rows } = await this.client.query(
      `SELECT name, base, rate::text AS rate, applies_when, account_ref
         FROM retention_rules
        WHERE company_id = $1 AND is_active`,
      [opts.companyId],
    );

    const context: Record<string, unknown> = {};
    if (opts.counterpartyType) context.counterpartyType = opts.counterpartyType;
    if (opts.operationType) context.operation = opts.operationType;

    return (rows as RetentionRuleRow[])
      .filter((rule) => matches(rule.applies_when, context))
      .map((rule) => {
        const base =
          rule.base === "itbis"
            ? bases.itbisTotal
            : bases.grossSubtotal; // 'isr' and 'gross' both withhold on the gross
        return {
          ruleName: rule.name,
          base: rule.base,
          rate: rule.rate,
          amount: roundTo(mul(base, rule.rate), 2),
          accountRef: rule.account_ref,
        };
      })
      .filter((r) => !isZero(r.amount));
  }
}

/**
 * A rule applies when every key in its predicate matches the context. An empty
 * predicate matches everything — the same containment semantics `posting_rules`
 * gets from jsonb `@>`, expressed here in TypeScript because the rows are
 * already in memory.
 */
function matches(predicate: Record<string, unknown>, context: Record<string, unknown>): boolean {
  return Object.entries(predicate ?? {}).every(([k, v]) => context[k] === v);
}

/** Convenience: does this breakdown tie out? Used by tests and by the doc service. */
export function ties(breakdown: TaxBreakdown): boolean {
  const linesTotal = sum(breakdown.lines.map((l) => l.lineTotal));
  return cmp(linesTotal, add(breakdown.subtotalTaxed, breakdown.subtotalExempt)) === 0;
}
