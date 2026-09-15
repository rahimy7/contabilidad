import { SqlClient } from "./types";
import { Decimal, add, sub, cmp, isZero, toMoney } from "./decimal";
import { generate606, generate607, generateIt1, generateIr17 } from "../fiscal/dgii-reports";

/**
 * Month-end reconciliation: the checks that prove the system does not
 * contradict itself.
 *
 * Every subledger claims a number; the general ledger claims another; the DGII
 * forms claim a third. Each check below states what two independent sources must
 * agree on, and the difference if they do not. A month is ready to close when
 * every check is `ok`. The same function backs the close-the-month screen and
 * the month simulation's assertions, so a test cannot pass while the screen shows
 * a difference, or the other way round.
 */
export interface ReconciliationCheck {
  key: string;
  label: string;
  expected: Decimal;
  actual: Decimal;
  difference: Decimal;
  ok: boolean;
  detail?: string;
}

export interface MonthEndReconciliation {
  companyId: number;
  year: number;
  month: number;
  asOf: string;
  ok: boolean;
  checks: ReconciliationCheck[];
}

const check = (key: string, label: string, expected: Decimal, actual: Decimal, detail?: string): ReconciliationCheck => {
  const e = toMoney(expected ?? "0");
  const a = toMoney(actual ?? "0");
  const difference = sub(a, e);
  return { key, label, expected: e, actual: a, difference: toMoney(difference), ok: cmp(roundCents(difference), "0") === 0, detail };
};

/** Differences below half a cent are rounding, not disagreement. */
const roundCents = (d: Decimal): Decimal => {
  const n = Number(d);
  return Math.abs(n) < 0.005 ? "0" : d;
};

export async function monthEndReconciliation(
  client: SqlClient,
  companyId: number,
  year: number,
  month: number,
): Promise<MonthEndReconciliation> {
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const asOf = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const checks: ReconciliationCheck[] = [];

  // Balance of an account (debit − credit, functional) up to a date.
  const gl = async (code: string, to = asOf, from?: string): Promise<Decimal> => {
    const { rows } = await client.query(
      `SELECT coalesce(sum(l.debit_func - l.credit_func),0)::text AS b
         FROM journal_entry_lines l
         JOIN journal_entries e ON e.id = l.entry_id
         JOIN chart_of_accounts a ON a.id = l.account_id
        WHERE l.company_id=$1 AND e.status='posted' AND a.code=$2 AND e.entry_date <= $3::date
          AND ($4::date IS NULL OR e.entry_date >= $4::date)`,
      [companyId, code, to, from ?? null],
    );
    return rows[0].b;
  };
  const one = async (sql: string, params: unknown[]): Promise<Decimal> => (await client.query(sql, params)).rows[0]?.v ?? "0";

  // 1. The ledger balances.
  const tb = await client.query(
    `SELECT coalesce(sum(l.debit_func),0)::text AS d, coalesce(sum(l.credit_func),0)::text AS c
       FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.entry_id
      WHERE l.company_id=$1 AND e.status='posted' AND e.entry_date <= $2::date`,
    [companyId, asOf],
  );
  checks.push(check("trial_balance", "Balanza de comprobación: débitos = créditos", tb.rows[0].d, tb.rows[0].c));

  // 2. Receivables and payables.
  checks.push(
    check(
      "ar_control",
      "CxC: cuenta Clientes (1.1.02.001) = partidas abiertas",
      await one(`SELECT coalesce(sum(balance),0)::text v FROM ar_open_items WHERE company_id=$1 AND status <> 'cancelled' AND issue_date <= $2`, [companyId, asOf]),
      await gl("1.1.02.001"),
    ),
  );
  checks.push(
    check(
      "ap_control",
      "CxP: cuenta Proveedores (2.1.01.001) = partidas abiertas",
      await one(`SELECT (-coalesce(sum(balance),0))::text v FROM ap_open_items WHERE company_id=$1 AND status <> 'cancelled' AND issue_date <= $2`, [companyId, asOf]),
      await gl("2.1.01.001"),
    ),
  );
  checks.push(
    check(
      "grni",
      "Recepciones por facturar (2.1.01.002) = recibido sin factura",
      await one(
        `SELECT (-coalesce(sum(round((l.quantity - l.qty_invoiced) * l.unit_cost, 4)),0))::text v
           FROM purchase_receipt_lines l JOIN purchase_receipts r ON r.id = l.receipt_id
          WHERE l.company_id=$1 AND r.status='posted'`,
        [companyId],
      ),
      await gl("2.1.01.002"),
    ),
  );
  checks.push(
    check(
      "customer_advances",
      "Anticipos de clientes (2.1.04.001) = anticipos sin aplicar",
      await one(`SELECT (-coalesce(sum(unapplied_amount),0))::text v FROM ar_receipts WHERE company_id=$1`, [companyId]),
      await gl("2.1.04.001"),
    ),
  );

  // 3. Inventory: ledger = valuation, per control account; units in step.
  for (const account of ["1.1.03.001", "1.1.03.002"]) {
    checks.push(
      check(
        `inventory_${account}`,
        `Inventario ${account}: cuenta contable = valuación`,
        await one(`SELECT coalesce(sum(total_value),0)::text v FROM inventory_valuation WHERE company_id=$1 AND inventory_account=$2`, [companyId, account]),
        await gl(account),
      ),
    );
  }
  const unitGaps = await client.query(
    `SELECT count(*)::int AS n, coalesce(sum(abs(coalesce(ws.quantity,0) - v.quantity_on_hand)),0)::text AS units
       FROM inventory_valuation v
       LEFT JOIN warehouse_stock ws ON ws.warehouse_id = v.warehouse_id AND ws.product_id = v.product_id
      WHERE v.company_id=$1 AND v.warehouse_id <> 0 AND coalesce(ws.quantity,0) <> v.quantity_on_hand`,
    [companyId],
  );
  checks.push(
    check("stock_units", "Unidades: warehouse_stock = valuación por almacén", "0", unitGaps.rows[0].units,
      `${unitGaps.rows[0].n} producto(s)/almacén con diferencia`),
  );
  const catalogGaps = await client.query(
    `SELECT coalesce(sum(abs(p.stock_quantity - t.q)),0)::text AS units
       FROM (SELECT ws.product_id, round(sum(ws.quantity))::int AS q
               FROM warehouse_stock ws JOIN warehouses w ON w.id = ws.warehouse_id
              WHERE w.company_id=$1 GROUP BY ws.product_id) t
       JOIN products p ON p.id = t.product_id`,
    [companyId],
  );
  checks.push(check("catalog_units", "Unidades: catálogo (products.stock_quantity) = suma por almacén", "0", catalogGaps.rows[0].units));
  const fifo = await client.query(
    `SELECT coalesce(sum(abs(v.total_value - coalesce(l.val,0))),0)::text AS v
       FROM inventory_valuation v
       LEFT JOIN (SELECT product_id, warehouse_id, sum(round(remaining_qty * unit_cost, 4)) AS val
                    FROM inventory_lots WHERE company_id=$1 GROUP BY 1,2) l
         ON l.product_id = v.product_id AND l.warehouse_id = v.warehouse_id
      WHERE v.company_id=$1 AND v.costing_method='fifo'`,
    [companyId],
  );
  checks.push(check("fifo_layers", "FIFO: capas de costo = valuación", "0", fifo.rows[0].v));

  // 4. Banks: ledger = treasury, per bank account.
  const banks = await client.query(
    `SELECT b.id, b.code, a.code AS gl,
            coalesce((SELECT sum(CASE WHEN t.direction='in' THEN t.amount ELSE -t.amount END)
                        FROM bank_transactions t
                       WHERE t.bank_account_id=b.id AND t.status='posted' AND t.txn_date <= $2::date),0)::text AS book
       FROM bank_accounts b JOIN chart_of_accounts a ON a.id = b.gl_account_id
      WHERE b.company_id=$1 ORDER BY b.id`,
    [companyId, asOf],
  );
  const byGl = new Map<string, Decimal>();
  for (const b of banks.rows) byGl.set(b.gl, add(byGl.get(b.gl) ?? "0", b.book));
  for (const [code, book] of byGl) {
    checks.push(check(`bank_${code}`, `Bancos ${code}: cuenta contable = movimientos de tesorería`, book, await gl(code)));
  }

  // 5. Payroll of the month.
  const payroll = await client.query(
    `SELECT coalesce(sum(s.gross_salary),0)::text AS gross,
            coalesce(sum(s.isr),0)::text AS isr,
            coalesce(sum(s.afp_employee + s.sfs_employee + s.afp_employer + s.sfs_employer + s.srl),0)::text AS tss,
            coalesce(sum(s.infotep),0)::text AS infotep
       FROM payslips s JOIN payroll_runs r ON r.id = s.run_id
      WHERE r.company_id=$1 AND r.fiscal_year=$2 AND r.month=$3 AND r.status='posted'`,
    [companyId, year, month],
  );
  const p = payroll.rows[0];
  // Only what payroll itself posted: a regalía provision or a manual accrual
  // in the same accounts is not a payslip.
  const earningsGl = await one(
    `SELECT coalesce(sum(l.debit_func - l.credit_func),0)::text v
       FROM journal_entry_lines l JOIN journal_entries e ON e.id=l.entry_id JOIN chart_of_accounts a ON a.id=l.account_id
      WHERE l.company_id=$1 AND e.status='posted' AND e.source_type='payroll'
        AND a.code IN ('5.2.01.001','5.2.01.004','5.2.01.005','5.2.01.006','5.2.01.007')
        AND e.entry_date BETWEEN $2::date AND $3::date`,
    [companyId, monthStart, asOf],
  );
  checks.push(check("payroll_gross", "Nómina: gasto de personal del mes = ingresos de las volantes", p.gross, earningsGl));
  const movement = async (code: string) => {
    const { rows } = await client.query(
      `SELECT coalesce(sum(l.credit_func),0)::text AS v FROM journal_entry_lines l
         JOIN journal_entries e ON e.id=l.entry_id JOIN chart_of_accounts a ON a.id=l.account_id
        WHERE l.company_id=$1 AND e.status='posted' AND a.code=$2 AND e.entry_date BETWEEN $3::date AND $4::date
          AND e.source_type = 'payroll'`,
      [companyId, code, monthStart, asOf],
    );
    return rows[0].v as Decimal;
  };
  checks.push(check("payroll_isr", "IR-3: ISR de asalariados (2.1.03.004) = volantes", p.isr, await movement("2.1.03.004")));
  checks.push(check("payroll_tss", "TSS por pagar (2.1.03.002) = aportes de las volantes", p.tss, await movement("2.1.03.002")));
  checks.push(check("payroll_infotep", "INFOTEP por pagar (2.1.03.003) = volantes", p.infotep, await movement("2.1.03.003")));

  // 6. Taxes: the forms against the ledger.
  const company = await client.query(`SELECT rnc FROM companies WHERE id=$1`, [companyId]);
  const rnc = company.rows[0]?.rnc ?? "";
  const it1 = await generateIt1(client, { companyId, rnc, year, month });
  const itbisPayableMonth = await client.query(
    `SELECT coalesce(sum(l.credit_func - l.debit_func),0)::text AS v FROM journal_entry_lines l
       JOIN journal_entries e ON e.id=l.entry_id JOIN chart_of_accounts a ON a.id=l.account_id
      WHERE l.company_id=$1 AND e.status='posted' AND a.code='2.1.02.001' AND e.entry_date BETWEEN $2::date AND $3::date`,
    [companyId, monthStart, asOf],
  );
  checks.push(check("itbis_charged", "IT-1: ITBIS facturado neto de NC = movimiento de ITBIS por pagar", it1.itbisCharged, itbisPayableMonth.rows[0].v));
  const itbisCreditMonth = await client.query(
    `SELECT coalesce(sum(l.debit_func - l.credit_func),0)::text AS v FROM journal_entry_lines l
       JOIN journal_entries e ON e.id=l.entry_id JOIN chart_of_accounts a ON a.id=l.account_id
      WHERE l.company_id=$1 AND e.status='posted' AND a.code='1.1.04.001' AND e.entry_date BETWEEN $2::date AND $3::date`,
    [companyId, monthStart, asOf],
  );
  checks.push(check("itbis_paid", "IT-1: ITBIS en compras neto de NC = movimiento de ITBIS adelantado", it1.itbisPaid, itbisCreditMonth.rows[0].v));
  const ir17 = await generateIr17(client, { companyId, rnc, year, month });
  const isrWithheld = await client.query(
    `SELECT coalesce(sum(l.credit_func),0)::text AS v FROM journal_entry_lines l
       JOIN journal_entries e ON e.id=l.entry_id JOIN chart_of_accounts a ON a.id=l.account_id
      WHERE l.company_id=$1 AND e.status='posted' AND a.code='2.1.02.003' AND e.entry_date BETWEEN $2::date AND $3::date
        AND e.source_type='purchase_document'`,
    [companyId, monthStart, asOf],
  );
  checks.push(check("ir17", "IR-17: ISR retenido a terceros = créditos a 2.1.02.003", ir17.totalRetained, isrWithheld.rows[0].v));
  const r607 = await generate607(client, { companyId, rnc, year, month });
  const r606 = await generate606(client, { companyId, rnc, year, month });
  checks.push(check("dgii_607_records", "607: registros = comprobantes emitidos vigentes del mes",
    await one(`SELECT count(*)::text v FROM fiscal_documents WHERE company_id=$1 AND doc_type IN ('invoice','credit_note','debit_note') AND status='issued' AND document_date BETWEEN $2::date AND $3::date`, [companyId, monthStart, asOf]),
    String(r607.recordCount)));
  checks.push(check("dgii_606_records", "606: registros = compras vigentes del mes",
    await one(`SELECT count(*)::text v FROM fiscal_documents WHERE company_id=$1 AND doc_type='purchase' AND status<>'cancelled' AND document_date BETWEEN $2::date AND $3::date`, [companyId, monthStart, asOf]),
    String(r606.recordCount)));

  // 7. Every document and movement has its entry.
  checks.push(check("docs_without_entry", "Comprobantes sin asiento", "0",
    await one(`SELECT count(*)::text v FROM fiscal_documents WHERE company_id=$1 AND status='issued' AND journal_entry_id IS NULL AND document_date <= $2`, [companyId, asOf])));
  checks.push(check("credit_sales_without_item", "Ventas a crédito sin partida por cobrar", "0",
    await one(
      `SELECT count(*)::text v FROM fiscal_documents d
        WHERE d.company_id=$1 AND d.doc_type IN ('invoice','debit_note') AND d.payment_method='credit'
          AND NOT EXISTS (SELECT 1 FROM ar_open_items i WHERE i.company_id=d.company_id AND i.document_id=d.id)`,
      [companyId],
    )));
  checks.push(check("bank_txn_without_entry", "Movimientos bancarios sin asiento", "0",
    await one(`SELECT count(*)::text v FROM bank_transactions WHERE company_id=$1 AND journal_entry_id IS NULL`, [companyId])));

  // 8. Fixed assets: accumulated depreciation in the register = ledger.
  checks.push(check("depreciation", "Depreciación acumulada (1.2.01.003) = registro de activos",
    await one(`SELECT (-coalesce(sum(de.amount),0))::text v FROM depreciation_entries de JOIN fixed_assets fa ON fa.id=de.asset_id WHERE fa.company_id=$1`, [companyId]),
    await gl("1.2.01.003")));

  return { companyId, year, month, asOf, ok: checks.every((c) => c.ok), checks };
}

export const failingChecks = (r: MonthEndReconciliation) => r.checks.filter((c) => !c.ok);
export const isZeroDecimal = isZero;
