import type { Pool } from "@neondatabase/serverless";
import * as XLSX from "xlsx";

/**
 * Generación de reportes en Excel/CSV.
 *
 * Cada reporte tiene una firma consistente: recibe filtros, retorna un Buffer
 * XLSX listo para descarga. Los queries están optimizados con LEFT JOIN y
 * filtros por rango de fecha en índices.
 *
 * Formatos ofrecidos:
 *   - .xlsx: recomendado, preserva tipos y estilos
 *   - .csv: fallback para sistemas antiguos
 *
 * PDF se hace en cliente con jsPDF a partir del JSON de los mismos reportes,
 * para no pagar el costo de renderizar HTML → PDF en servidor.
 */

export class ReportError extends Error {}

export interface ReportRange {
  from: string;
  to: string;
}

// ── P&L comparativo ─────────────────────────────────────────────

export async function generatePnLReport(
  pool: Pool,
  companyId: number,
  currentRange: ReportRange,
  compareRange?: ReportRange,
): Promise<Buffer> {
  if (!companyId) throw new ReportError("companyId requerido");
  const current = await pnlSums(pool, companyId, currentRange);
  const compare = compareRange ? await pnlSums(pool, companyId, compareRange) : null;

  const rows: any[][] = [
    ["Estado de Resultados"],
    [`Período: ${currentRange.from} a ${currentRange.to}`],
    [],
    ["Cuenta", "Descripción", "Actual", ...(compare ? ["Comparado", "Δ", "Δ %"] : [])],
  ];

  for (const acc of current) {
    const cmp = compare?.find((c) => c.code === acc.code);
    const delta = cmp ? acc.amount - cmp.amount : null;
    const pct = cmp && cmp.amount !== 0 ? (delta! / Math.abs(cmp.amount)) * 100 : null;
    rows.push([
      acc.code, acc.name, acc.amount,
      ...(compare ? [cmp?.amount ?? 0, delta, pct != null ? `${pct.toFixed(2)}%` : ""] : []),
    ]);
  }

  const totalCurrent = current.reduce((s, x) => s + x.amount, 0);
  const totalCompare = compare?.reduce((s, x) => s + x.amount, 0) ?? 0;
  rows.push([]);
  rows.push(["", "TOTAL", totalCurrent, ...(compare ? [totalCompare, totalCurrent - totalCompare, ""] : [])]);

  return buildXlsx("P&L", rows);
}

async function pnlSums(pool: Pool, companyId: number, range: ReportRange) {
  const r = await pool.query(
    `SELECT coa.code, coa.name, coa.account_type,
            coalesce(sum(
              CASE WHEN coa.account_type = 'revenue' THEN jl.credit_func - jl.debit_func
                   WHEN coa.account_type = 'expense' THEN jl.debit_func - jl.credit_func
                   ELSE 0 END
            ), 0)::float AS amount
       FROM journal_entry_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       JOIN chart_of_accounts coa ON coa.id = jl.account_id
      WHERE jl.company_id = $1
        AND je.entry_date BETWEEN $2::date AND $3::date
        AND coa.account_type IN ('revenue','expense')
      GROUP BY coa.code, coa.name, coa.account_type
     HAVING coalesce(sum(
              CASE WHEN coa.account_type = 'revenue' THEN jl.credit_func - jl.debit_func
                   WHEN coa.account_type = 'expense' THEN jl.debit_func - jl.credit_func
                   ELSE 0 END
            ), 0) <> 0
      ORDER BY coa.account_type DESC, coa.code`,
    [companyId, range.from, range.to],
  );
  return r.rows.map((row: any) => ({
    code: row.code, name: row.name, type: row.account_type, amount: Number(row.amount),
  }));
}

// ── Aging AR / AP ───────────────────────────────────────────────

export async function generateAgingReport(
  pool: Pool,
  companyId: number,
  kind: "ar" | "ap",
  asOf: string,
): Promise<Buffer> {
  const table = kind === "ar" ? "ar_open_items" : "ap_open_items";
  const partyCol = kind === "ar" ? "customer_id" : "supplier_id";
  const partyTable = kind === "ar" ? "customers" : "suppliers";
  const partyLabel = kind === "ar" ? "Cliente" : "Proveedor";

  const r = await pool.query(
    `SELECT p.name AS party,
            oi.currency, oi.issue_date, oi.due_date,
            oi.original_amount::float AS original,
            oi.balance::float AS balance,
            ($1::date - oi.due_date) AS days_over,
            oi.status
       FROM ${table} oi
       LEFT JOIN ${partyTable} p ON p.id = oi.${partyCol}
      WHERE oi.company_id = $2 AND oi.balance > 0 AND oi.status != 'paid'
      ORDER BY oi.due_date`,
    [asOf, companyId],
  );

  const rows: any[][] = [
    [`Aging ${kind.toUpperCase()} — Corte al ${asOf}`],
    [],
    [partyLabel, "Moneda", "Emisión", "Vencimiento", "Original", "Saldo", "Días vencido", "Bucket"],
  ];

  for (const row of r.rows) {
    const days = Number(row.days_over ?? 0);
    const bucket = days <= 0 ? "Vigente" : days <= 30 ? "1-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+";
    rows.push([
      row.party ?? "—", row.currency,
      row.issue_date, row.due_date,
      row.original, row.balance,
      Math.max(days, 0), bucket,
    ]);
  }

  return buildXlsx(`Aging ${kind.toUpperCase()}`, rows);
}

// ── Ventas por vendedor ─────────────────────────────────────────

export async function generateSalesByRepReport(
  pool: Pool,
  storeId: number,
  range: ReportRange,
): Promise<Buffer> {
  const r = await pool.query(
    `SELECT u.id, u.name AS rep_name,
            count(o.id)::int AS orders,
            coalesce(sum(o.total_amount::numeric), 0)::float AS revenue,
            coalesce(avg(o.total_amount::numeric), 0)::float AS avg_ticket
       FROM orders o
       LEFT JOIN users u ON u.id = o.assigned_user_id
      WHERE o.store_id = $1
        AND o.status IN ('completed','delivered','processing')
        AND o.created_at::date BETWEEN $2::date AND $3::date
      GROUP BY u.id, u.name
      ORDER BY revenue DESC`,
    [storeId, range.from, range.to],
  );

  const rows: any[][] = [
    [`Ventas por vendedor — ${range.from} a ${range.to}`],
    [],
    ["Vendedor", "Órdenes", "Ingresos", "Ticket promedio"],
  ];

  for (const row of r.rows) {
    rows.push([row.rep_name ?? "Sin asignar", row.orders, row.revenue, row.avg_ticket]);
  }

  const totalRev = r.rows.reduce((s: number, x: any) => s + Number(x.revenue), 0);
  const totalOrders = r.rows.reduce((s: number, x: any) => s + Number(x.orders), 0);
  rows.push([]);
  rows.push(["TOTAL", totalOrders, totalRev, totalOrders > 0 ? totalRev / totalOrders : 0]);

  return buildXlsx("Ventas por vendedor", rows);
}

// ── Top clientes / productos ─────────────────────────────────────

export async function generateTopCustomersReport(
  pool: Pool,
  storeId: number,
  range: ReportRange,
  limit = 100,
): Promise<Buffer> {
  const r = await pool.query(
    `SELECT c.id, c.name, c.phone,
            count(o.id)::int AS orders,
            coalesce(sum(o.total_amount::numeric), 0)::float AS revenue
       FROM customers c
       JOIN orders o ON o.customer_id = c.id
      WHERE c.store_id = $1
        AND o.status IN ('completed','delivered','processing')
        AND o.created_at::date BETWEEN $2::date AND $3::date
      GROUP BY c.id, c.name, c.phone
      ORDER BY revenue DESC
      LIMIT $4`,
    [storeId, range.from, range.to, limit],
  );

  const rows: any[][] = [
    [`Top clientes — ${range.from} a ${range.to}`],
    [],
    ["Cliente", "Teléfono", "Órdenes", "Ingresos"],
  ];
  for (const row of r.rows) {
    rows.push([row.name, row.phone ?? "—", row.orders, row.revenue]);
  }
  return buildXlsx("Top clientes", rows);
}

export async function generateTopProductsReport(
  pool: Pool,
  storeId: number,
  range: ReportRange,
  limit = 100,
): Promise<Buffer> {
  const r = await pool.query(
    `SELECT p.id, p.name, p.sku,
            coalesce(sum(oi.quantity), 0)::float AS qty,
            coalesce(sum(oi.quantity * oi.unit_price::numeric), 0)::float AS revenue
       FROM products p
       JOIN order_items oi ON oi.product_id = p.id
       JOIN orders o ON o.id = oi.order_id
      WHERE p.store_id = $1 AND o.store_id = $1
        AND o.status IN ('completed','delivered','processing')
        AND o.created_at::date BETWEEN $2::date AND $3::date
      GROUP BY p.id, p.name, p.sku
      ORDER BY revenue DESC
      LIMIT $4`,
    [storeId, range.from, range.to, limit],
  );

  const rows: any[][] = [
    [`Top productos — ${range.from} a ${range.to}`],
    [],
    ["Producto", "SKU", "Cantidad", "Ingresos"],
  ];
  for (const row of r.rows) {
    rows.push([row.name, row.sku ?? "—", row.qty, row.revenue]);
  }
  return buildXlsx("Top productos", rows);
}

// ── Helpers ─────────────────────────────────────────────────────

function buildXlsx(sheetName: string, rows: any[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buf as Buffer;
}
