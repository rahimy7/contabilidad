import type { Pool } from "@neondatabase/serverless";

/**
 * Executive dashboard: consolida KPIs operacionales de los subsistemas.
 *
 * Este endpoint agrupa en una sola llamada los indicadores que un gerente
 * revisa a diario: ventas del mes vs mes anterior, posición de caja,
 * envejecimiento de AR/AP, top clientes/productos, órdenes por status,
 * alertas de liquidez.
 *
 * Todas las queries son READ-ONLY y usan índices existentes. El objetivo es
 * que la respuesta sea rápida (<500ms) porque el dashboard se carga en cada
 * navegación.
 */

export interface ExecutiveDashboardInput {
  storeId: number;
  companyId?: number;
  today?: string;
}

export interface KpiMoM {
  current: number;
  previous: number;
  changePct: number | null;
  direction: "up" | "down" | "flat";
}

export interface ExecutiveDashboardResult {
  asOf: string;
  currency: string;

  sales: {
    thisMonth: KpiMoM;
    lastMonth: number;
    yesterday: number;
    today: number;
    ordersToday: number;
    ordersMonth: number;
    avgTicketMonth: number;
  };

  cash: {
    bankBalance: number;
    arTotal: number;
    apTotal: number;
    netPosition: number;
  };

  arAging: {
    current: number;    // 0-30
    days30_60: number;
    days60_90: number;
    over90: number;
    total: number;
    overduePct: number;
  };

  apAging: {
    current: number;
    days30_60: number;
    days60_90: number;
    over90: number;
    total: number;
    overduePct: number;
  };

  topCustomers: Array<{ id: number; name: string; revenue: number; orderCount: number }>;
  topProducts: Array<{ id: number; name: string; sku: string | null; qty: number; revenue: number }>;

  ordersByStatus: Array<{ status: string; count: number; amount: number }>;

  alerts: {
    lowStockCount: number;
    overduePayables: number;
    overdueReceivables: number;
    pendingApprovals: number;
    expiringSoon: number;
  };

  purchases: {
    thisMonth: KpiMoM;
    itbisPaid: number;
    itbisCollected: number;
    itbisNet: number;
  };
}

function pct(current: number, previous: number): { changePct: number | null; direction: "up" | "down" | "flat" } {
  if (previous === 0) {
    if (current === 0) return { changePct: 0, direction: "flat" };
    return { changePct: null, direction: current > 0 ? "up" : "down" };
  }
  const changePct = ((current - previous) / Math.abs(previous)) * 100;
  return {
    changePct: Math.round(changePct * 100) / 100,
    direction: changePct > 0.5 ? "up" : changePct < -0.5 ? "down" : "flat",
  };
}

export async function getExecutiveDashboard(
  pool: Pool,
  input: ExecutiveDashboardInput,
): Promise<ExecutiveDashboardResult> {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const storeId = input.storeId;

  // Rangos de fechas.
  const d = new Date(today + "T00:00:00Z");
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = today;

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonthStart = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
  const prevMonthEnd = new Date(Date.UTC(prevYear, prevMonth, 0)).toISOString().slice(0, 10);

  const yesterday = new Date(d.getTime() - 86_400_000).toISOString().slice(0, 10);

  // Ventas: usa `orders` legacy con `store_id`.
  const [salesMonth, salesPrevMonth, salesToday, salesYesterday, ordersMonthCount, ordersTodayCount] = await Promise.all([
    sumOrdersAmount(pool, storeId, monthStart, monthEnd),
    sumOrdersAmount(pool, storeId, prevMonthStart, prevMonthEnd),
    sumOrdersAmount(pool, storeId, today, today),
    sumOrdersAmount(pool, storeId, yesterday, yesterday),
    countOrders(pool, storeId, monthStart, monthEnd),
    countOrders(pool, storeId, today, today),
  ]);

  const avgTicketMonth = ordersMonthCount > 0 ? salesMonth / ordersMonthCount : 0;

  // Cash (bank balances de accounts scoped por company OR por store si no hay company).
  const bankBalance = await computeBankBalance(pool, input.companyId, storeId, today);

  // AR / AP aging (buckets: current, 30-60, 60-90, >90).
  const arAging = await computeArAging(pool, input.companyId, storeId, today);
  const apAging = await computeApAging(pool, input.companyId, storeId, today);

  // Top clientes por revenue del mes.
  const topCustomers = await getTopCustomers(pool, storeId, monthStart, monthEnd, 5);

  // Top productos.
  const topProducts = await getTopProducts(pool, storeId, monthStart, monthEnd, 5);

  // Orders by status.
  const ordersByStatus = await getOrdersByStatus(pool, storeId);

  // Alerts.
  const alerts = await getAlerts(pool, input.companyId, storeId, today);

  // Purchases.
  const purchasesMonth = await sumPurchases(pool, storeId, monthStart, monthEnd);
  const purchasesPrevMonth = await sumPurchases(pool, storeId, prevMonthStart, prevMonthEnd);

  // ITBIS: aproximación desde purchase_orders.tax e invoicing.
  const itbisPaid = await sumItbis(pool, storeId, "purchase", monthStart, monthEnd);
  const itbisCollected = await sumItbis(pool, storeId, "sale", monthStart, monthEnd);

  return {
    asOf: today,
    currency: "DOP",
    sales: {
      thisMonth: { current: salesMonth, previous: salesPrevMonth, ...pct(salesMonth, salesPrevMonth) },
      lastMonth: salesPrevMonth,
      yesterday: salesYesterday,
      today: salesToday,
      ordersToday: ordersTodayCount,
      ordersMonth: ordersMonthCount,
      avgTicketMonth: round2(avgTicketMonth),
    },
    cash: {
      bankBalance,
      arTotal: arAging.total,
      apTotal: apAging.total,
      netPosition: round2(bankBalance + arAging.total - apAging.total),
    },
    arAging,
    apAging,
    topCustomers,
    topProducts,
    ordersByStatus,
    alerts,
    purchases: {
      thisMonth: { current: purchasesMonth, previous: purchasesPrevMonth, ...pct(purchasesMonth, purchasesPrevMonth) },
      itbisPaid,
      itbisCollected,
      itbisNet: round2(itbisCollected - itbisPaid),
    },
  };
}

// ── Queries granulares ─────────────────────────────────────────────

async function sumOrdersAmount(pool: Pool, storeId: number, from: string, to: string): Promise<number> {
  const r = await pool.query(
    `SELECT coalesce(sum(total_amount::numeric), 0)::float AS s
       FROM orders
      WHERE store_id = $1
        AND status IN ('completed', 'delivered', 'processing')
        AND created_at::date BETWEEN $2::date AND $3::date`,
    [storeId, from, to],
  );
  return Number(r.rows[0]?.s ?? 0);
}

async function countOrders(pool: Pool, storeId: number, from: string, to: string): Promise<number> {
  const r = await pool.query(
    `SELECT count(*)::int AS n
       FROM orders
      WHERE store_id = $1
        AND status IN ('completed', 'delivered', 'processing')
        AND created_at::date BETWEEN $2::date AND $3::date`,
    [storeId, from, to],
  );
  return Number(r.rows[0]?.n ?? 0);
}

async function computeBankBalance(pool: Pool, companyId: number | undefined, _storeId: number, asOf: string): Promise<number> {
  if (companyId) {
    const r = await pool.query(
      `SELECT coalesce(sum(CASE WHEN t.direction='in' THEN t.amount ELSE -t.amount END)
              FILTER (WHERE t.status='posted' AND t.txn_date <= $2::date), 0)::float AS balance
         FROM bank_transactions t
         JOIN bank_accounts ba ON ba.id = t.bank_account_id
        WHERE ba.company_id = $1`,
      [companyId, asOf],
    );
    return round2(Number(r.rows[0]?.balance ?? 0));
  }
  return 0;
}

async function computeArAging(
  pool: Pool,
  companyId: number | undefined,
  _storeId: number,
  asOf: string,
): Promise<ExecutiveDashboardResult["arAging"]> {
  if (!companyId) {
    return { current: 0, days30_60: 0, days60_90: 0, over90: 0, total: 0, overduePct: 0 };
  }
  const r = await pool.query(
    `SELECT
       coalesce(sum(CASE WHEN (($2::date - due_date) <= 0) THEN balance ELSE 0 END), 0)::float AS current,
       coalesce(sum(CASE WHEN (($2::date - due_date) BETWEEN 1 AND 30) THEN balance ELSE 0 END), 0)::float AS d3060,
       coalesce(sum(CASE WHEN (($2::date - due_date) BETWEEN 31 AND 60) THEN balance ELSE 0 END), 0)::float AS d6090,
       coalesce(sum(CASE WHEN (($2::date - due_date) > 60) THEN balance ELSE 0 END), 0)::float AS over90,
       coalesce(sum(balance), 0)::float AS total
     FROM ar_open_items
     WHERE company_id = $1 AND balance > 0 AND status != 'paid'`,
    [companyId, asOf],
  );
  const row = r.rows[0];
  const total = Number(row?.total ?? 0);
  const overdue = Number(row?.d3060 ?? 0) + Number(row?.d6090 ?? 0) + Number(row?.over90 ?? 0);
  return {
    current: round2(row?.current ?? 0),
    days30_60: round2(row?.d3060 ?? 0),
    days60_90: round2(row?.d6090 ?? 0),
    over90: round2(row?.over90 ?? 0),
    total: round2(total),
    overduePct: total > 0 ? Math.round((overdue / total) * 10000) / 100 : 0,
  };
}

async function computeApAging(
  pool: Pool,
  companyId: number | undefined,
  _storeId: number,
  asOf: string,
): Promise<ExecutiveDashboardResult["apAging"]> {
  if (!companyId) {
    return { current: 0, days30_60: 0, days60_90: 0, over90: 0, total: 0, overduePct: 0 };
  }
  const r = await pool.query(
    `SELECT
       coalesce(sum(CASE WHEN (($2::date - due_date) <= 0) THEN balance ELSE 0 END), 0)::float AS current,
       coalesce(sum(CASE WHEN (($2::date - due_date) BETWEEN 1 AND 30) THEN balance ELSE 0 END), 0)::float AS d3060,
       coalesce(sum(CASE WHEN (($2::date - due_date) BETWEEN 31 AND 60) THEN balance ELSE 0 END), 0)::float AS d6090,
       coalesce(sum(CASE WHEN (($2::date - due_date) > 60) THEN balance ELSE 0 END), 0)::float AS over90,
       coalesce(sum(balance), 0)::float AS total
     FROM ap_open_items
     WHERE company_id = $1 AND balance > 0 AND status != 'paid'`,
    [companyId, asOf],
  );
  const row = r.rows[0];
  const total = Number(row?.total ?? 0);
  const overdue = Number(row?.d3060 ?? 0) + Number(row?.d6090 ?? 0) + Number(row?.over90 ?? 0);
  return {
    current: round2(row?.current ?? 0),
    days30_60: round2(row?.d3060 ?? 0),
    days60_90: round2(row?.d6090 ?? 0),
    over90: round2(row?.over90 ?? 0),
    total: round2(total),
    overduePct: total > 0 ? Math.round((overdue / total) * 10000) / 100 : 0,
  };
}

async function getTopCustomers(pool: Pool, storeId: number, from: string, to: string, limit: number) {
  const r = await pool.query(
    `SELECT c.id, c.name,
            coalesce(sum(o.total_amount::numeric), 0)::float AS revenue,
            count(o.id)::int AS "orderCount"
       FROM customers c
       JOIN orders o ON o.customer_id = c.id AND o.store_id = c.store_id
      WHERE c.store_id = $1
        AND o.status IN ('completed', 'delivered', 'processing')
        AND o.created_at::date BETWEEN $2::date AND $3::date
      GROUP BY c.id, c.name
      ORDER BY revenue DESC
      LIMIT $4`,
    [storeId, from, to, limit],
  );
  return r.rows.map((row: any) => ({
    id: Number(row.id),
    name: row.name,
    revenue: round2(row.revenue),
    orderCount: Number(row.orderCount),
  }));
}

async function getTopProducts(pool: Pool, storeId: number, from: string, to: string, limit: number) {
  const r = await pool.query(
    `SELECT p.id, p.name, p.sku,
            coalesce(sum(oi.quantity::numeric), 0)::float AS qty,
            coalesce(sum(oi.quantity::numeric * oi.unit_price::numeric), 0)::float AS revenue
       FROM products p
       JOIN order_items oi ON oi.product_id = p.id
       JOIN orders o ON o.id = oi.order_id
      WHERE p.store_id = $1 AND o.store_id = $1
        AND o.status IN ('completed', 'delivered', 'processing')
        AND o.created_at::date BETWEEN $2::date AND $3::date
      GROUP BY p.id, p.name, p.sku
      ORDER BY revenue DESC
      LIMIT $4`,
    [storeId, from, to, limit],
  );
  return r.rows.map((row: any) => ({
    id: Number(row.id),
    name: row.name,
    sku: row.sku,
    qty: round2(row.qty),
    revenue: round2(row.revenue),
  }));
}

async function getOrdersByStatus(pool: Pool, storeId: number) {
  const r = await pool.query(
    `SELECT status,
            count(*)::int AS count,
            coalesce(sum(total_amount::numeric), 0)::float AS amount
       FROM orders
      WHERE store_id = $1
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY status
      ORDER BY count DESC`,
    [storeId],
  );
  return r.rows.map((row: any) => ({
    status: row.status,
    count: Number(row.count),
    amount: round2(row.amount),
  }));
}

async function getAlerts(pool: Pool, companyId: number | undefined, storeId: number, asOf: string) {
  const lowStock = await pool.query(
    `SELECT count(*)::int AS n
       FROM products
      WHERE store_id = $1 AND status = 'active'
        AND stock_quantity IS NOT NULL AND min_quantity IS NOT NULL
        AND stock_quantity <= min_quantity`,
    [storeId],
  );

  let overduePayables = 0;
  let overdueReceivables = 0;
  if (companyId) {
    const ovAp = await pool.query(
      `SELECT count(*)::int AS n FROM ap_open_items
        WHERE company_id = $1 AND balance > 0 AND status != 'paid' AND due_date < $2::date`,
      [companyId, asOf],
    );
    overduePayables = Number(ovAp.rows[0]?.n ?? 0);
    const ovAr = await pool.query(
      `SELECT count(*)::int AS n FROM ar_open_items
        WHERE company_id = $1 AND balance > 0 AND status != 'paid' AND due_date < $2::date`,
      [companyId, asOf],
    );
    overdueReceivables = Number(ovAr.rows[0]?.n ?? 0);
  }

  // Aprobaciones pendientes (approvals engine — Fase 01).
  let pendingApprovals = 0;
  try {
    const pa = await pool.query(
      `SELECT count(*)::int AS n FROM approval_requests
        WHERE status = 'pending'`,
    );
    pendingApprovals = Number(pa.rows[0]?.n ?? 0);
  } catch { /* Table may not exist in some deployments. */ }

  // Productos por vencer (30 días).
  const exp = await pool.query(
    `SELECT count(DISTINCT poi.product_id)::int AS n
       FROM purchase_order_items poi
       JOIN products p ON p.id = poi.product_id
      WHERE p.store_id = $1
        AND poi.expiration_date IS NOT NULL
        AND poi.expiration_date::date BETWEEN $2::date AND ($2::date + INTERVAL '30 days')`,
    [storeId, asOf],
  );

  return {
    lowStockCount: Number(lowStock.rows[0]?.n ?? 0),
    overduePayables,
    overdueReceivables,
    pendingApprovals,
    expiringSoon: Number(exp.rows[0]?.n ?? 0),
  };
}

async function sumPurchases(pool: Pool, storeId: number, from: string, to: string): Promise<number> {
  const r = await pool.query(
    `SELECT coalesce(sum(total_amount::numeric), 0)::float AS s
       FROM purchase_orders
      WHERE store_id = $1
        AND status IN ('received', 'completed')
        AND order_date::date BETWEEN $2::date AND $3::date`,
    [storeId, from, to],
  );
  return round2(r.rows[0]?.s ?? 0);
}

async function sumItbis(pool: Pool, storeId: number, kind: "sale" | "purchase", from: string, to: string): Promise<number> {
  if (kind === "sale") {
    // ITBIS de ventas: aproximado como total - subtotal (típico 18%).
    const r = await pool.query(
      `SELECT coalesce(sum((total_amount::numeric - coalesce(subtotal_amount::numeric, 0))), 0)::float AS s
         FROM orders
        WHERE store_id = $1
          AND status IN ('completed', 'delivered')
          AND created_at::date BETWEEN $2::date AND $3::date`,
      [storeId, from, to],
    );
    return round2(Math.max(0, Number(r.rows[0]?.s ?? 0)));
  }
  const r = await pool.query(
    `SELECT coalesce(sum(tax::numeric), 0)::float AS s
       FROM purchase_orders
      WHERE store_id = $1
        AND status IN ('received', 'completed')
        AND order_date::date BETWEEN $2::date AND $3::date`,
    [storeId, from, to],
  );
  return round2(r.rows[0]?.s ?? 0);
}

function round2(v: number | string | null | undefined): number {
  return Math.round(Number(v ?? 0) * 100) / 100;
}
