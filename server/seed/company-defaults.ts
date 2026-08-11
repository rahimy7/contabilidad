import type { SqlClient } from "../accounting/types";
import {
  DR_CHART_OF_ACCOUNTS,
  levelOf,
  isLeaf,
  parentCodeOf,
} from "./chart-of-accounts";

/**
 * Everything a newly created company needs before anyone can post to it: a chart
 * of accounts, tax codes with dated rates, retention rules, and open periods.
 *
 * Every statement is idempotent. This is the same function the "create company"
 * endpoint calls when a taxpayer signs up, and the one `db:seed` calls on a
 * fresh branch; running it twice must change nothing.
 */
export async function seedCompanyDefaults(pool: SqlClient, companyId: number) {
  await seedChartOfAccounts(pool, companyId);
  await seedTaxConfiguration(pool, companyId);
  await seedPeriods(pool, companyId, new Date().getUTCFullYear());
  await seedPostingRules(pool, companyId);
}

/**
 * Default account determination.
 *
 * Each rule maps `<eventType>.<measureRole>` to the debit and credit account a
 * measure of that kind lands on. A rule with an empty `match` is the company
 * default; a rule with a predicate and a higher priority overrides it when the
 * event context satisfies the predicate — which is how a credit sale books
 * revenue against Clientes instead of Caja without either rule knowing about
 * the other.
 *
 * These are a starting point. A tenant is expected to edit them.
 */
async function seedPostingRules(pool: SqlClient, companyId: number) {
  type Rule = [event: string, debit: string, credit: string, match: object, priority: number];

  const rules: Rule[] = [
    // Cash sale: cash is debited once per measure, summing to the invoice total.
    ["pos_sale.revenue", "1.1.01.001", "4.1.01.001", {}, 0],
    ["pos_sale.itbis", "1.1.01.001", "2.1.02.001", {}, 0],
    ["pos_sale.discount", "4.1.02.001", "1.1.01.001", {}, 0],
    // Credit sale: same measures, receivable instead of cash.
    ["pos_sale.revenue", "1.1.02.001", "4.1.01.001", { paymentMethod: "credit" }, 10],
    ["pos_sale.itbis", "1.1.02.001", "2.1.02.001", { paymentMethod: "credit" }, 10],
    ["pos_sale.discount", "4.1.02.001", "1.1.02.001", { paymentMethod: "credit" }, 10],
    // Cost of goods sold, posted as its own entry off the same source document.
    ["pos_sale.cogs", "5.1.01.001", "1.1.03.001", {}, 0],

    // Purchase on credit: the goods debit routes by what was bought. The default
    // is merchandise for resale; a higher-priority rule overrides it when the
    // purchase is a supply, a fixed asset, or a service/expense — so a consumable
    // never lands in the sale-inventory account.
    ["purchase.inventory", "1.1.03.001", "2.1.01.001", {}, 0],
    ["purchase.inventory", "1.1.03.002", "2.1.01.001", { purchaseType: "supply" }, 10],
    ["purchase.inventory", "1.2.01.001", "2.1.01.001", { purchaseType: "fixed_asset" }, 10],
    ["purchase.inventory", "5.2.02.003", "2.1.01.001", { purchaseType: "service" }, 10],
    ["purchase.inventory", "5.2.02.004", "2.1.01.001", { purchaseType: "expense" }, 10],
    ["purchase.itbis_credit", "1.1.04.001", "2.1.01.001", {}, 0],
    // Retentions reduce what we owe the supplier and create a liability to DGII.
    ["purchase.retention_isr", "2.1.01.001", "2.1.02.003", {}, 0],
    ["purchase.retention_itbis", "2.1.01.001", "2.1.02.002", {}, 0],

    // AR receipt: Dr Caja / Cr Clientes. AP payment: Dr Proveedores / Cr Caja.
    ["ar_receipt.settlement", "1.1.01.001", "1.1.02.001", {}, 0],
    ["ap_payment.settlement", "2.1.01.001", "1.1.01.001", {}, 0],

    // Inventory costing. A receipt raises inventory against the payable; an issue
    // books COGS against inventory; a return puts stock back, reversing the COGS.
    ["inventory_receipt.cost", "1.1.03.001", "2.1.01.001", {}, 0],
    ["inventory_issue.cogs", "5.1.01.001", "1.1.03.001", {}, 0],
    ["inventory_return.restock", "1.1.03.001", "5.1.01.001", {}, 0],

    // Consumable supplies live in their own control account. Issuing one is not a
    // sale but a consumption, so it goes straight to supplies expense rather than
    // to cost of goods sold.
    ["inventory_receipt.cost", "1.1.03.002", "2.1.01.001", { inventoryAccount: "1.1.03.002" }, 10],
    ["inventory_issue.cogs", "5.2.02.004", "1.1.03.002", { inventoryAccount: "1.1.03.002" }, 10],
    ["inventory_return.restock", "1.1.03.002", "5.2.02.004", { inventoryAccount: "1.1.03.002" }, 10],

    // Conteo físico. Lo que falta se reconoce como gasto por faltante, no como
    // costo de ventas: no se vendió, se perdió, y la diferencia importa. Lo que
    // sobra entra al inventario contra otros ingresos. Cada uno con su variante
    // para suministros, que ruedan por su propia cuenta de control.
    ["inventory_adjustment.shortage", "5.1.02.001", "1.1.03.001", {}, 0],
    ["inventory_adjustment.surplus", "1.1.03.001", "4.2.02.001", {}, 0],
    ["inventory_adjustment.shortage", "5.1.02.001", "1.1.03.002", { inventoryAccount: "1.1.03.002" }, 10],
    ["inventory_adjustment.surplus", "1.1.03.002", "4.2.02.001", { inventoryAccount: "1.1.03.002" }, 10],

    ["depreciation.expense", "5.2.03.001", "1.2.01.003", {}, 0],
    ["fx.gain", "1.1.01.003", "4.2.01.001", {}, 0],
    ["fx.loss", "5.3.01.001", "1.1.01.003", {}, 0],
  ];

  for (const [eventType, debit, credit, match, priority] of rules) {
    await pool.query(
      `INSERT INTO posting_rules (company_id, event_type, match, debit_account_ref, credit_account_ref, priority)
       SELECT $1,$2,$3,$4,$5,$6
        WHERE NOT EXISTS (
          SELECT 1 FROM posting_rules
           WHERE company_id=$1 AND event_type=$2 AND match=$3::jsonb
        )`,
      [companyId, eventType, JSON.stringify(match), debit, credit, priority],
    );
  }
}

async function seedChartOfAccounts(pool: SqlClient, companyId: number) {
  // Insert parents before children so `parent_id` can be resolved by code.
  const ordered = [...DR_CHART_OF_ACCOUNTS].sort((a, b) => a.code.localeCompare(b.code));

  for (const acc of ordered) {
    const parentCode = parentCodeOf(acc.code);
    await pool.query(
      `INSERT INTO chart_of_accounts
         (company_id, code, name, parent_id, level, account_type, normal_side,
          is_postable, is_control, subledger)
       VALUES ($1, $2, $3,
               (SELECT id FROM chart_of_accounts WHERE company_id = $1 AND code = $4),
               $5, $6, $7, $8, $9, $10)
       ON CONFLICT (company_id, code) DO NOTHING`,
      [
        companyId,
        acc.code,
        acc.name,
        parentCode,
        levelOf(acc.code),
        acc.type,
        acc.side,
        isLeaf(acc.code, DR_CHART_OF_ACCOUNTS),
        acc.isControl ?? false,
        acc.subledger ?? null,
      ],
    );
  }
}

/**
 * ITBIS rates and retention rules as of 2026. `valid_from` exists so a rate
 * change by law does not retroactively alter documents already issued.
 */
async function seedTaxConfiguration(pool: SqlClient, companyId: number) {
  const taxCodes: Array<[string, string, string, string, number | null]> = [
    // code, name, kind, accountRef, rate
    ["ITBIS18", "ITBIS 18%", "vat", "2.1.02.001", 0.18],
    ["ITBIS16", "ITBIS 16% (tasa reducida)", "vat", "2.1.02.001", 0.16],
    ["ITBIS0", "ITBIS 0% (tasa cero)", "vat", "2.1.02.001", 0.0],
    ["EXENTO", "Exento de ITBIS", "vat", null as unknown as string, null],
    ["PROPINA", "Propina legal 10%", "tip", null as unknown as string, 0.1],
  ];

  for (const [code, name, kind, accountRef, rate] of taxCodes) {
    const r = await pool.query(
      `INSERT INTO tax_codes (company_id, code, name, kind, account_ref)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (company_id, code) DO NOTHING
       RETURNING id`,
      [companyId, code, name, kind, accountRef],
    );
    if (r.rows.length === 0 || rate === null) continue;

    await pool.query(
      `INSERT INTO tax_rates (tax_code_id, rate, valid_from)
       SELECT $1, $2, DATE '2000-01-01'
        WHERE NOT EXISTS (SELECT 1 FROM tax_rates WHERE tax_code_id = $1)`,
      [r.rows[0].id, rate],
    );
  }

  const retentions: Array<[string, string, number, object, string]> = [
    [
      "ISR 10% servicios a persona física",
      "gross",
      0.1,
      { counterpartyType: "persona_fisica", operation: "servicios" },
      "2.1.02.003",
    ],
    [
      "ITBIS retenido 100% a persona física",
      "itbis",
      1.0,
      { counterpartyType: "persona_fisica" },
      "2.1.02.002",
    ],
    [
      "ITBIS retenido 30% a persona jurídica por servicios",
      "itbis",
      0.3,
      { counterpartyType: "persona_juridica", operation: "servicios" },
      "2.1.02.002",
    ],
  ];

  for (const [name, base, rate, appliesWhen, accountRef] of retentions) {
    await pool.query(
      `INSERT INTO retention_rules (company_id, name, base, rate, applies_when, account_ref)
       SELECT $1,$2,$3,$4,$5,$6
        WHERE NOT EXISTS (
          SELECT 1 FROM retention_rules WHERE company_id = $1 AND name = $2
        )`,
      [companyId, name, base, rate, JSON.stringify(appliesWhen), accountRef],
    );
  }
}

/** Twelve monthly periods plus period 13, which carries year-end adjustments. */
async function seedPeriods(pool: SqlClient, companyId: number, year: number) {
  for (let m = 1; m <= 12; m++) {
    const start = new Date(Date.UTC(year, m - 1, 1));
    const end = new Date(Date.UTC(year, m, 0));
    await pool.query(
      `INSERT INTO accounting_periods (company_id, fiscal_year, period_no, start_date, end_date, status)
       VALUES ($1,$2,$3,$4,$5,'open')
       ON CONFLICT (company_id, fiscal_year, period_no) DO NOTHING`,
      [companyId, year, m, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)],
    );
  }
  // Period 13 shares December's last day: closing entries are dated at year end.
  const dec31 = `${year}-12-31`;
  await pool.query(
    `INSERT INTO accounting_periods (company_id, fiscal_year, period_no, start_date, end_date, status)
     VALUES ($1,$2,13,$3,$3,'open')
     ON CONFLICT (company_id, fiscal_year, period_no) DO NOTHING`,
    [companyId, year, dec31],
  );
}
