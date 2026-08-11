import type { Pool } from "@neondatabase/serverless";

/**
 * Comisiones por vendedor.
 *
 * Al cerrar un período (quincena/mes) se recorren las ventas atribuidas al
 * vendedor, se evalúan las reglas activas por precedencia, y se calcula el
 * monto ganado. El pago se integra con nómina al ejecutar la corrida.
 *
 * Precedencia de reglas: menor `priority` gana. Si dos reglas aplican al
 * mismo tiempo (una por producto, otra por categoría), gana la más específica
 * (product > category > general).
 *
 * Base:
 *   revenue      → % sobre venta bruta atribuida
 *   gross_margin → % sobre margen bruto (revenue − COGS)
 *   units        → monto fijo por unidad vendida
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

interface Rule {
  id: number;
  code: string;
  name: string;
  calculationBase: "revenue" | "gross_margin" | "units";
  scopeType: "all_sellers" | "by_user" | "by_role";
  scopeUserIds: number[] | null;
  scopeRole: string | null;
  productId: number | null;
  categoryId: number | null;
  percentRate: number | null;
  fixedPerUnit: number | null;
  goalAmount: number | null;
  bonusPercent: number | null;
  priority: number;
}

async function activeRules(pool: Pool, storeId: number, userId: number): Promise<Rule[]> {
  const r = await pool.query(
    `SELECT id, code, name,
            calculation_base AS "calculationBase",
            scope_type AS "scopeType",
            scope_user_ids AS "scopeUserIds",
            scope_role AS "scopeRole",
            product_id AS "productId",
            category_id AS "categoryId",
            percent_rate::float AS "percentRate",
            fixed_per_unit::float AS "fixedPerUnit",
            goal_amount::float AS "goalAmount",
            bonus_percent::float AS "bonusPercent",
            priority
       FROM commission_rules
      WHERE store_id = $1 AND is_active = true
        AND (
          scope_type = 'all_sellers'
          OR (scope_type = 'by_user' AND $2::int = ANY(scope_user_ids))
        )
      ORDER BY priority ASC`,
    [storeId, userId],
  );
  return r.rows;
}

/**
 * Calcula la comisión ganada por un vendedor en un período. Recorre las
 * órdenes completadas atribuidas a ese usuario (assignedUserId) y suma.
 */
export async function calculateCommissions(
  pool: Pool,
  storeId: number,
  userId: number,
  year: number,
  month: number,
) {
  const rules = await activeRules(pool, storeId, userId);
  const rulesByProduct = new Map<number, Rule>();
  const rulesByCategory = new Map<number, Rule>();
  let generalRule: Rule | null = null;
  for (const r of rules) {
    if (r.productId) rulesByProduct.set(r.productId, r);
    else if (r.categoryId) rulesByCategory.set(r.categoryId, r);
    else if (!generalRule) generalRule = r;
  }

  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endMonth = new Date(year, month, 0);
  const end = `${year}-${String(month).padStart(2, "0")}-${endMonth.getDate()}`;

  const orders = await pool.query(
    `SELECT o.id AS "orderId", o.total_amount::numeric AS "orderTotal"
       FROM orders o
      WHERE o.store_id = $1 AND o.assigned_user_id = $2
        AND o.status = 'completed'
        AND o.completed_date >= $3::date AND o.completed_date <= $4::date`,
    [storeId, userId, start, end],
  );

  let totalRevenue = 0;
  let totalMargin = 0;
  let totalUnits = 0;
  let commissionAmount = 0;

  for (const o of orders.rows) {
    const lines = await pool.query(
      `SELECT oi.product_id AS "productId", oi.quantity::numeric AS "quantity",
              oi.unit_price::numeric AS "unitPrice", oi.total_price::numeric AS "totalPrice",
              p.category AS "category"
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = $1`,
      [o.orderId],
    );

    for (const l of lines.rows) {
      const revenue = Number(l.totalPrice);
      const units = Number(l.quantity);
      totalRevenue += revenue;
      totalUnits += units;
      // Margen bruto sin COGS conocido: aproximación 30%. En un despliegue con
      // costos reales, este número viene de inventory_cost_movements.
      const marginApprox = revenue * 0.3;
      totalMargin += marginApprox;

      const rule = rulesByProduct.get(l.productId) ?? rulesByCategory.get(l.category) ?? generalRule;
      if (!rule) continue;

      let earned = 0;
      switch (rule.calculationBase) {
        case "revenue":
          earned = revenue * ((rule.percentRate ?? 0) / 100);
          break;
        case "gross_margin":
          earned = marginApprox * ((rule.percentRate ?? 0) / 100);
          break;
        case "units":
          earned = units * (rule.fixedPerUnit ?? 0);
          break;
      }
      commissionAmount += earned;
    }
  }

  // Meta y bono: el general rule define el bono si se cumple la meta.
  const goalRule = generalRule;
  const goalAmount = goalRule?.goalAmount ?? 0;
  const goalAchieved = goalAmount > 0 && totalRevenue >= goalAmount;
  let bonusAmount = 0;
  if (goalAchieved && goalRule?.bonusPercent) {
    bonusAmount = commissionAmount * (goalRule.bonusPercent / 100);
  }

  return {
    userId, year, month,
    totalRevenue: round2(totalRevenue),
    totalGrossMargin: round2(totalMargin),
    totalUnits: round2(totalUnits),
    goalAmount,
    goalAchieved,
    commissionAmount: round2(commissionAmount),
    bonusAmount: round2(bonusAmount),
    totalEarned: round2(commissionAmount + bonusAmount),
    orderCount: orders.rowCount,
  };
}

/**
 * Congela el cálculo del período: guarda una fila en `commission_earnings`
 * para que aparezca en el próximo pago de nómina. Un segundo cierre del
 * mismo período devuelve la fila existente sin duplicar.
 */
export async function closeCommissionPeriod(
  pool: Pool,
  storeId: number,
  userId: number,
  year: number,
  month: number,
) {
  const existing = await pool.query(
    `SELECT id FROM commission_earnings
      WHERE store_id = $1 AND user_id = $2 AND period_year = $3 AND period_month = $4
        AND status <> 'cancelled'`,
    [storeId, userId, year, month],
  );
  if (existing.rowCount) return { earningId: existing.rows[0].id, alreadyExists: true };

  const calc = await calculateCommissions(pool, storeId, userId, year, month);
  const r = await pool.query(
    `INSERT INTO commission_earnings
       (store_id, user_id, period_year, period_month, total_revenue,
        total_gross_margin, total_units, goal_amount, goal_achieved,
        commission_amount, bonus_amount, total_earned, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft')
     RETURNING id`,
    [
      storeId, userId, year, month,
      String(calc.totalRevenue), String(calc.totalGrossMargin), String(calc.totalUnits),
      String(calc.goalAmount), calc.goalAchieved,
      String(calc.commissionAmount), String(calc.bonusAmount), String(calc.totalEarned),
    ],
  );
  return { earningId: r.rows[0].id, alreadyExists: false, calc };
}

export async function approveCommissionEarning(pool: Pool, id: number, approvedBy: number) {
  await pool.query(
    `UPDATE commission_earnings
        SET status = 'approved', approved_by = $2, approved_at = now(), updated_at = now()
      WHERE id = $1 AND status = 'draft'`,
    [id, approvedBy],
  );
}

/**
 * Uso desde el motor de nómina: al preparar el payslip mensual, obtener el
 * monto de comisiones aprobadas y agregarlo al bruto pagado.
 */
export async function pendingCommissionForPayroll(
  pool: Pool,
  storeId: number,
  userId: number,
  year: number,
  month: number,
): Promise<{ id: number; amount: number } | null> {
  const r = await pool.query(
    `SELECT id, total_earned::float AS amount
       FROM commission_earnings
      WHERE store_id = $1 AND user_id = $2 AND period_year = $3
        AND period_month = $4 AND status = 'approved'
      LIMIT 1`,
    [storeId, userId, year, month],
  );
  if (!r.rowCount) return null;
  return { id: r.rows[0].id, amount: Number(r.rows[0].amount) };
}

export async function markCommissionPaid(pool: Pool, id: number, payslipId: number) {
  await pool.query(
    `UPDATE commission_earnings
        SET status = 'paid', paid_at = now(), payslip_id = $2, updated_at = now()
      WHERE id = $1 AND status = 'approved'`,
    [id, payslipId],
  );
}
