import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { authenticateToken } from '../authMiddleware';
import { getTenantDb } from '../multi-tenant-db';
import * as schema from '@shared/schema';
import type { AuthUser } from '@shared/auth';

const router = Router();

const DISCREPANCY_THRESHOLD = 100;

// ─── Helper: calcula inicio del período a cerrar ──────────────────────────────
// Si cashierId es provisto (cierre por cajero/turno), busca el último cierre
// de ESE cajero hoy. Si no hay cashierId (cierre general), busca el último
// cierre general (session_type='day') de hoy. En ambos casos, si no existe
// ninguno previo usa medianoche UTC como inicio.
async function getPeriodStart(db: any, storeId: number, cashierId?: number): Promise<Date> {
  let result: any;
  if (cashierId) {
    result = await db.execute(sql`
      SELECT MAX(closed_at) AS last_closed
      FROM cash_register_sessions
      WHERE store_id   = ${storeId}
        AND cashier_id = ${cashierId}
        AND session_type = 'shift'
        AND status    IN ('closed', 'approved', 'rejected')
        AND closed_at IS NOT NULL
        AND DATE(closed_at) = CURRENT_DATE
    `);
  } else {
    result = await db.execute(sql`
      SELECT MAX(closed_at) AS last_closed
      FROM cash_register_sessions
      WHERE store_id   = ${storeId}
        AND session_type = 'day'
        AND status    IN ('closed', 'approved', 'rejected')
        AND closed_at IS NOT NULL
        AND DATE(closed_at) = CURRENT_DATE
    `);
  }
  const lastClosed = result.rows[0]?.last_closed;
  if (lastClosed) return new Date(lastClosed);
  // Sin cierres hoy: usar medianoche local como inicio
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

async function getClosuresToday(db: any, storeId: number, cashierId?: number): Promise<number> {
  let result: any;
  if (cashierId) {
    result = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM cash_register_sessions
      WHERE store_id   = ${storeId}
        AND cashier_id = ${cashierId}
        AND session_type = 'shift'
        AND status    IN ('closed', 'approved', 'rejected')
        AND DATE(closed_at) = CURRENT_DATE
    `);
  } else {
    result = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM cash_register_sessions
      WHERE store_id   = ${storeId}
        AND session_type = 'day'
        AND status    IN ('closed', 'approved', 'rejected')
        AND DATE(closed_at) = CURRENT_DATE
    `);
  }
  return result.rows[0]?.total ?? 0;
}

// ================================
// ENDPOINTS
// ================================

// GET /cash-register/sessions/current-stats
// Devuelve el período del próximo cierre (desde/hasta) y las ventas acumuladas.
// Acepta query param ?cashierId=X para cierre por cajero/turno.
// No modifica ningún registro. DEBE estar antes de GET /:id.
router.get('/cash-register/sessions/current-stats', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    // cashierId opcional: si viene, el período y conteo son por ese cajero (turno)
    const cashierId = req.query.cashierId ? parseInt(req.query.cashierId as string) : undefined;
    const storeId = typeof user.storeId === 'number' ? user.storeId : parseInt(String(user.storeId));

    const db = await getTenantDb(storeId);
    const closuresToday = await getClosuresToday(db, storeId, cashierId);

    // ─── Usamos SQL nativo para evitar problemas de timezone con Neon ──────────
    // DATE_TRUNC('day', NOW()) da medianoche en la zona horaria del servidor de BD,
    // lo que garantiza que las comparaciones con created_at (TIMESTAMP WITHOUT TZ)
    // sean consistentes sin conversiones de JS Date.
    const statsResult = cashierId
      ? await db.execute(sql`
          WITH period AS (
            SELECT COALESCE(
              (SELECT MAX(closed_at)
               FROM cash_register_sessions
               WHERE store_id    = ${storeId}
                 AND cashier_id  = ${cashierId}
                 AND session_type = 'shift'
                 AND status IN ('closed', 'approved', 'rejected')
                 AND closed_at IS NOT NULL
                 AND DATE(closed_at) = CURRENT_DATE
              ),
              CURRENT_DATE::timestamp
            ) AS period_start
          )
          SELECT
            p.period_start,
            COUNT(o.id)::int                                                                                   AS total_orders,
            COALESCE(SUM(o.total_amount)::numeric,    0)                                                      AS total_sales,
            COALESCE(SUM(CASE WHEN o.payment_method = 'cash'     THEN o.total_amount ELSE 0 END)::numeric, 0) AS cash_total,
            COALESCE(SUM(CASE WHEN o.payment_method = 'card'     THEN o.total_amount ELSE 0 END)::numeric, 0) AS card_total,
            COALESCE(SUM(CASE WHEN o.payment_method = 'transfer' THEN o.total_amount ELSE 0 END)::numeric, 0) AS transfer_total,
            COALESCE(SUM(CASE WHEN o.payment_method = 'credit'   THEN o.total_amount ELSE 0 END)::numeric, 0) AS credit_total,
            COALESCE(SUM(o.discount_amount)::numeric, 0)                                                      AS total_discounts,
            COUNT(CASE WHEN o.status = 'cancelled' THEN 1 END)::int                                           AS total_cancellations,
            COALESCE((SELECT SUM(w.amount)::numeric FROM cash_withdrawals w
                      WHERE w.store_id = ${storeId} AND w.cashier_id = ${cashierId}
                        AND w.voided = FALSE AND w.created_at >= p.period_start), 0) AS cash_withdrawals_total,
            COALESCE((SELECT COUNT(w.id)::int FROM cash_withdrawals w
                      WHERE w.store_id = ${storeId} AND w.cashier_id = ${cashierId}
                        AND w.voided = FALSE AND w.created_at >= p.period_start), 0) AS cash_withdrawals_count
          FROM period p
          LEFT JOIN orders o
            ON  o.store_id          = ${storeId}
            AND o.assigned_user_id  = ${cashierId}
            AND o.created_at       >= p.period_start
            AND o.payment_status IN ('paid', 'partial')
            AND o.status        != 'cancelled'
          GROUP BY p.period_start
        `)
      : await db.execute(sql`
          WITH period AS (
            SELECT COALESCE(
              (SELECT MAX(closed_at)
               FROM cash_register_sessions
               WHERE store_id    = ${storeId}
                 AND session_type = 'day'
                 AND status IN ('closed', 'approved', 'rejected')
                 AND closed_at IS NOT NULL
                 AND DATE(closed_at) = CURRENT_DATE
              ),
              CURRENT_DATE::timestamp
            ) AS period_start
          )
          SELECT
            p.period_start,
            COUNT(o.id)::int                                                                                   AS total_orders,
            COALESCE(SUM(o.total_amount)::numeric,    0)                                                      AS total_sales,
            COALESCE(SUM(CASE WHEN o.payment_method = 'cash'     THEN o.total_amount ELSE 0 END)::numeric, 0) AS cash_total,
            COALESCE(SUM(CASE WHEN o.payment_method = 'card'     THEN o.total_amount ELSE 0 END)::numeric, 0) AS card_total,
            COALESCE(SUM(CASE WHEN o.payment_method = 'transfer' THEN o.total_amount ELSE 0 END)::numeric, 0) AS transfer_total,
            COALESCE(SUM(CASE WHEN o.payment_method = 'credit'   THEN o.total_amount ELSE 0 END)::numeric, 0) AS credit_total,
            COALESCE(SUM(o.discount_amount)::numeric, 0)                                                      AS total_discounts,
            COUNT(CASE WHEN o.status = 'cancelled' THEN 1 END)::int                                           AS total_cancellations,
            COALESCE((SELECT SUM(w.amount)::numeric FROM cash_withdrawals w
                      WHERE w.store_id = ${storeId} AND w.voided = FALSE
                        AND w.created_at >= p.period_start), 0) AS cash_withdrawals_total,
            COALESCE((SELECT COUNT(w.id)::int FROM cash_withdrawals w
                      WHERE w.store_id = ${storeId} AND w.voided = FALSE
                        AND w.created_at >= p.period_start), 0) AS cash_withdrawals_count
          FROM period p
          LEFT JOIN orders o
            ON  o.store_id       = ${storeId}
            AND o.created_at    >= p.period_start
            AND o.payment_status IN ('paid', 'partial')
            AND o.status        != 'cancelled'
          GROUP BY p.period_start
        `);

    const s = statsResult.rows[0] as any;
    const cashWithdrawalsTotal = parseFloat(s?.cash_withdrawals_total ?? '0');
    const cashTotalGross = parseFloat(s?.cash_total ?? '0');

    return res.json({
      periodStart:    s?.period_start ?? null,
      periodEnd:      new Date().toISOString(),
      closuresToday,
      cashierId:      cashierId ?? null,
      stats: {
        totalOrders:           s?.total_orders        ?? 0,
        totalSales:            s?.total_sales         ?? '0',
        cashTotal:             Math.max(0, cashTotalGross - cashWithdrawalsTotal).toString(),
        cashTotalGross:        cashTotalGross.toString(),
        cardTotal:             s?.card_total          ?? '0',
        transferTotal:         s?.transfer_total      ?? '0',
        creditTotal:           s?.credit_total        ?? '0',
        totalDiscounts:        s?.total_discounts     ?? '0',
        totalCancellations:    s?.total_cancellations ?? 0,
        cashWithdrawalsTotal:  cashWithdrawalsTotal.toString(),
        cashWithdrawalsCount:  s?.cash_withdrawals_count ?? 0,
      },
    });
  } catch (error) {
    console.error('❌ Error getting current stats:', error);
    return res.status(500).json({ error: 'Error al obtener estadísticas actuales' });
  }
});

// LEGACY COMPAT — ya no hay sesiones "open"; retorna null para no romper clientes viejos
router.get('/cash-register/sessions/active', authenticateToken, async (_req: any, res: any) => {
  return res.json({ session: null });
});

// GET /cash-register/sessions — historial con filtros opcionales
router.get('/cash-register/sessions', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const { startDate, endDate, cashierId, status } = req.query as Record<string, string>;

    const db = await getTenantDb(user.storeId);

    const conditions: any[] = [eq(schema.cashRegisterSessions.storeId, user.storeId)];

    if (startDate) {
      conditions.push(gte(schema.cashRegisterSessions.openedAt, new Date(startDate)));
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(schema.cashRegisterSessions.openedAt, end));
    }
    if (cashierId) {
      conditions.push(eq(schema.cashRegisterSessions.cashierId, parseInt(cashierId)));
    }
    if (status) {
      conditions.push(eq(schema.cashRegisterSessions.status, status));
    }

    const sessions = await db
      .select({
        id: schema.cashRegisterSessions.id,
        sessionType: schema.cashRegisterSessions.sessionType,
        status: schema.cashRegisterSessions.status,
        openingAmount: schema.cashRegisterSessions.openingAmount,
        openedAt: schema.cashRegisterSessions.openedAt,
        closedAt: schema.cashRegisterSessions.closedAt,
        totalOrders: schema.cashRegisterSessions.totalOrders,
        totalSalesAmount: schema.cashRegisterSessions.totalSalesAmount,
        totalDifference: schema.cashRegisterSessions.totalDifference,
        totalExpected: schema.cashRegisterSessions.totalExpected,
        totalReported: schema.cashRegisterSessions.totalReported,
        cashierId: schema.cashRegisterSessions.cashierId,
        cashierName: schema.users.name,
      })
      .from(schema.cashRegisterSessions)
      .leftJoin(schema.users, eq(schema.users.id, schema.cashRegisterSessions.cashierId))
      .where(and(...conditions))
      .orderBy(desc(schema.cashRegisterSessions.openedAt));

    return res.json({ sessions });
  } catch (error) {
    console.error('❌ Error listing cash register sessions:', error);
    return res.status(500).json({ error: 'Error al obtener historial de cierres' });
  }
});

// GET /cash-register/sessions/:id — detalle completo
router.get('/cash-register/sessions/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const sessionId = parseInt(req.params.id);
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const db = await getTenantDb(user.storeId);

    const [session] = await db
      .select()
      .from(schema.cashRegisterSessions)
      .where(
        and(
          eq(schema.cashRegisterSessions.id, sessionId),
          eq(schema.cashRegisterSessions.storeId, user.storeId),
        ),
      )
      .limit(1);

    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });

    // Enriquecer con nombres de usuarios
    const cashier = session.cashierId
      ? await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, session.cashierId)).limit(1)
      : [];
    const approver = session.approvedByUserId
      ? await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, session.approvedByUserId)).limit(1)
      : [];
    const closer = session.closedByUserId
      ? await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, session.closedByUserId)).limit(1)
      : [];

    return res.json({
      session: {
        ...session,
        cashierName: cashier[0]?.name,
        approverName: approver[0]?.name,
        closerName: closer[0]?.name,
      },
    });
  } catch (error) {
    console.error('❌ Error getting cash register session:', error);
    return res.status(500).json({ error: 'Error al obtener detalle de sesión' });
  }
});

// POST /cash-register/sessions/close
// Crea un nuevo cierre directamente en estado 'closed' (INSERT, nunca UPDATE).
// Acepta sessionType 'day' (caja general) o 'shift' (por cajero).
// Para 'shift', targetCashierId indica el cajero cuyo turno se está cerrando.
router.post('/cash-register/sessions/close', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const bodySchema = z.object({
      cashReported:     z.number().min(0).default(0),
      cardReported:     z.number().min(0).default(0),
      transferReported: z.number().min(0).default(0),
      creditReported:   z.number().min(0).default(0),
      openingAmount:    z.number().min(0).default(0),
      discrepancyNote:  z.string().optional(),
      closingNotes:     z.string().optional(),
      sessionType:      z.enum(['day', 'shift']).default('day'),
      targetCashierId:  z.number().int().positive().optional(),
    });
    const body = bodySchema.parse(req.body);

    // Para cierre de turno, el cashierId del período es el cajero seleccionado
    const periodCashierId = body.sessionType === 'shift' ? (body.targetCashierId ?? user.id) : undefined;
    // El cajero registrado en la sesión es el cajero seleccionado (o el usuario actual si es general)
    const sessionCashierId = body.sessionType === 'shift' ? (body.targetCashierId ?? user.id) : user.id;

    const db = await getTenantDb(user.storeId);

    // ─── Calcular período y estadísticas en SQL para evitar timezone issues ──
    // El período del nuevo cierre va desde el ÚLTIMO cierre DE HOY hasta ahora.
    // Si no hay cierres hoy, comienza desde medianoche local (CURRENT_DATE).
    const statsResult = body.sessionType === 'shift'
      ? await db.execute(sql`
          WITH period AS (
            SELECT COALESCE(
              (SELECT MAX(closed_at)
               FROM cash_register_sessions
               WHERE store_id    = ${user.storeId}
                 AND cashier_id  = ${sessionCashierId}
                 AND session_type = 'shift'
                 AND status IN ('closed', 'approved', 'rejected')
                 AND closed_at IS NOT NULL
                 AND DATE(closed_at) = CURRENT_DATE
              ),
              CURRENT_DATE::timestamp
            ) AS period_start
          )
          SELECT
            p.period_start,
            NOW()::timestamp AS period_end,
            COALESCE(SUM(CASE WHEN o.payment_method = 'cash'     THEN o.total_amount ELSE 0 END)::numeric, 0) AS cash_expected,
            COALESCE(SUM(CASE WHEN o.payment_method = 'card'     THEN o.total_amount ELSE 0 END)::numeric, 0) AS card_expected,
            COALESCE(SUM(CASE WHEN o.payment_method = 'transfer' THEN o.total_amount ELSE 0 END)::numeric, 0) AS transfer_expected,
            COALESCE(SUM(CASE WHEN o.payment_method = 'credit'   THEN o.total_amount ELSE 0 END)::numeric, 0) AS credit_expected,
            COUNT(o.id)::int                                                                                   AS total_orders,
            COALESCE(SUM(o.total_amount)::numeric, 0)                                                         AS total_sales,
            COALESCE(SUM(o.discount_amount)::numeric, 0)                                                      AS total_discounts,
            COUNT(CASE WHEN o.status = 'cancelled' THEN 1 END)::int                                           AS total_cancellations,
            COALESCE((SELECT SUM(w.amount)::numeric FROM cash_withdrawals w
                      WHERE w.store_id = ${user.storeId} AND w.cashier_id = ${sessionCashierId}
                        AND w.voided = FALSE AND w.created_at >= p.period_start), 0) AS cash_withdrawals_total,
            COALESCE((SELECT COUNT(w.id)::int FROM cash_withdrawals w
                      WHERE w.store_id = ${user.storeId} AND w.cashier_id = ${sessionCashierId}
                        AND w.voided = FALSE AND w.created_at >= p.period_start), 0) AS cash_withdrawals_count
          FROM period p
          LEFT JOIN orders o
            ON  o.store_id          = ${user.storeId}
            AND o.assigned_user_id  = ${sessionCashierId}
            AND o.created_at       >= p.period_start
            AND o.payment_status IN ('paid', 'partial')
            AND o.status        != 'cancelled'
          GROUP BY p.period_start
        `)
      : await db.execute(sql`
          WITH period AS (
            SELECT COALESCE(
              (SELECT MAX(closed_at)
               FROM cash_register_sessions
               WHERE store_id    = ${user.storeId}
                 AND session_type = 'day'
                 AND status IN ('closed', 'approved', 'rejected')
                 AND closed_at IS NOT NULL
                 AND DATE(closed_at) = CURRENT_DATE
              ),
              CURRENT_DATE::timestamp
            ) AS period_start
          )
          SELECT
            p.period_start,
            NOW()::timestamp AS period_end,
            COALESCE(SUM(CASE WHEN o.payment_method = 'cash'     THEN o.total_amount ELSE 0 END)::numeric, 0) AS cash_expected,
            COALESCE(SUM(CASE WHEN o.payment_method = 'card'     THEN o.total_amount ELSE 0 END)::numeric, 0) AS card_expected,
            COALESCE(SUM(CASE WHEN o.payment_method = 'transfer' THEN o.total_amount ELSE 0 END)::numeric, 0) AS transfer_expected,
            COALESCE(SUM(CASE WHEN o.payment_method = 'credit'   THEN o.total_amount ELSE 0 END)::numeric, 0) AS credit_expected,
            COUNT(o.id)::int                                                                                   AS total_orders,
            COALESCE(SUM(o.total_amount)::numeric, 0)                                                         AS total_sales,
            COALESCE(SUM(o.discount_amount)::numeric, 0)                                                      AS total_discounts,
            COUNT(CASE WHEN o.status = 'cancelled' THEN 1 END)::int                                           AS total_cancellations,
            COALESCE((SELECT SUM(w.amount)::numeric FROM cash_withdrawals w
                      WHERE w.store_id = ${user.storeId} AND w.voided = FALSE
                        AND w.created_at >= p.period_start), 0) AS cash_withdrawals_total,
            COALESCE((SELECT COUNT(w.id)::int FROM cash_withdrawals w
                      WHERE w.store_id = ${user.storeId} AND w.voided = FALSE
                        AND w.created_at >= p.period_start), 0) AS cash_withdrawals_count
          FROM period p
          LEFT JOIN orders o
            ON  o.store_id       = ${user.storeId}
            AND o.created_at    >= p.period_start
            AND o.payment_status IN ('paid', 'partial')
            AND o.status        != 'cancelled'
          GROUP BY p.period_start
        `);

    const s = statsResult.rows[0] as any;
    // ⚠️ openedAt / closedAt se insertan vía SQL templates para que usen
    // directamente el wall-clock del DB (zona horaria de sesión = DR).
    // Evita el roundtrip de JS Date que puede aplicar offsets incorrectos
    // si el TZ de Node no coincide con el de la BD.
    const periodStartSql = sql`${s.period_start}::timestamp`;
    const periodEndSql   = sql`NOW()::timestamp`;
    // Versión Date para devolver al cliente (informativa, no se almacena)
    const periodStart = s?.period_start ? new Date(s.period_start) : new Date();
    const periodEnd   = new Date();

    const cashWithdrawalsTotal = parseFloat(s.cash_withdrawals_total ?? '0');
    // cashExpected = fondo inicial + ventas en efectivo - retiros (lo que debería haber en gaveta)
    const cashExpected     = Math.max(0, body.openingAmount + parseFloat(s.cash_expected) - cashWithdrawalsTotal);
    const cardExpected     = parseFloat(s.card_expected);
    const transferExpected = parseFloat(s.transfer_expected);
    const creditExpected   = parseFloat(s.credit_expected);
    const totalExpected    = cashExpected + cardExpected + transferExpected + creditExpected;
    const totalReported    = body.cashReported + body.cardReported + body.transferReported + body.creditReported;
    const totalDifference  = totalReported - totalExpected;

    if (Math.abs(totalDifference) > DISCREPANCY_THRESHOLD && !body.discrepancyNote?.trim()) {
      return res.status(400).json({
        error: `La diferencia (${totalDifference.toFixed(2)}) supera el límite de ${DISCREPANCY_THRESHOLD}. Debes ingresar una nota.`,
        totalDifference,
        threshold: DISCREPANCY_THRESHOLD,
      });
    }

    // INSERT directo — nunca modifica registros anteriores
    const [newSession] = await db
      .insert(schema.cashRegisterSessions)
      .values({
        storeId:              user.storeId,
        cashierId:            sessionCashierId,
        closedByUserId:       user.id,
        sessionType:          body.sessionType,
        status:               'closed',
        openedAt:             periodStartSql as any,  // raw SQL: período desde último cierre / inicio de día
        closedAt:             periodEndSql as any,    // raw SQL: NOW() del DB (zona horaria de sesión)
        openingAmount:        body.openingAmount.toString(),
        openingNotes:         body.closingNotes,
        cashReported:         body.cashReported.toString(),
        cardReported:         body.cardReported.toString(),
        transferReported:     body.transferReported.toString(),
        creditReported:       body.creditReported.toString(),
        cashExpected:         cashExpected.toString(),
        cardExpected:         cardExpected.toString(),
        transferExpected:     transferExpected.toString(),
        creditExpected:       creditExpected.toString(),
        cashDifference:       (body.cashReported - cashExpected).toString(),
        cardDifference:       (body.cardReported - cardExpected).toString(),
        transferDifference:   (body.transferReported - transferExpected).toString(),
        creditDifference:     (body.creditReported - creditExpected).toString(),
        totalDifference:      totalDifference.toString(),
        totalExpected:        totalExpected.toString(),
        totalReported:        totalReported.toString(),
        totalOrders:          s.total_orders,
        totalSalesAmount:     s.total_sales,
        totalCancellations:   s.total_cancellations,
        totalDiscountsAmount: s.total_discounts,
        discrepancyNote:      body.discrepancyNote,
      })
      .returning();

    return res.status(201).json({
      session: {
        ...newSession,
        cashWithdrawalsTotal: cashWithdrawalsTotal.toString(),
        cashWithdrawalsCount: s.cash_withdrawals_count ?? 0,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', details: error.errors });
    }
    console.error('❌ Error creating closure:', error);
    return res.status(500).json({ error: 'Error al realizar cierre de caja' });
  }
});

// PUT /cash-register/sessions/:id/approve — supervisor aprueba
router.put('/cash-register/sessions/:id/approve', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const sessionId = parseInt(req.params.id);
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const db = await getTenantDb(user.storeId);

    const [session] = await db
      .select({ id: schema.cashRegisterSessions.id, status: schema.cashRegisterSessions.status })
      .from(schema.cashRegisterSessions)
      .where(
        and(
          eq(schema.cashRegisterSessions.id, sessionId),
          eq(schema.cashRegisterSessions.storeId, user.storeId),
        ),
      )
      .limit(1);

    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });
    if (session.status !== 'closed') {
      return res.status(400).json({ error: 'Solo se pueden aprobar sesiones en estado "cerrado"' });
    }

    const [updated] = await db
      .update(schema.cashRegisterSessions)
      .set({
        status: 'approved',
        approvedByUserId: user.id,
        approvedAt: sql`NOW()::timestamp` as any,
        updatedAt:  sql`NOW()::timestamp` as any,
      })
      .where(
        and(
          eq(schema.cashRegisterSessions.id, sessionId),
          eq(schema.cashRegisterSessions.storeId, user.storeId),
        ),
      )
      .returning();

    return res.json({ session: updated });
  } catch (error) {
    console.error('❌ Error approving cash register session:', error);
    return res.status(500).json({ error: 'Error al aprobar sesión de caja' });
  }
});

// PUT /cash-register/sessions/:id/reject — supervisor rechaza
router.put('/cash-register/sessions/:id/reject', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const sessionId = parseInt(req.params.id);
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const bodySchema = z.object({ rejectionReason: z.string().min(1) });
    const body = bodySchema.parse(req.body);

    const db = await getTenantDb(user.storeId);

    const [session] = await db
      .select({ id: schema.cashRegisterSessions.id, status: schema.cashRegisterSessions.status })
      .from(schema.cashRegisterSessions)
      .where(
        and(
          eq(schema.cashRegisterSessions.id, sessionId),
          eq(schema.cashRegisterSessions.storeId, user.storeId),
        ),
      )
      .limit(1);

    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });
    if (session.status !== 'closed') {
      return res.status(400).json({ error: 'Solo se pueden rechazar sesiones en estado "cerrado"' });
    }

    const [updated] = await db
      .update(schema.cashRegisterSessions)
      .set({
        status: 'rejected',
        rejectionReason: body.rejectionReason,
        updatedAt: sql`NOW()::timestamp` as any,
      })
      .where(
        and(
          eq(schema.cashRegisterSessions.id, sessionId),
          eq(schema.cashRegisterSessions.storeId, user.storeId),
        ),
      )
      .returning();

    return res.json({ session: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Motivo de rechazo requerido' });
    }
    console.error('❌ Error rejecting cash register session:', error);
    return res.status(500).json({ error: 'Error al rechazar sesión de caja' });
  }
});

// GET /cash-register/monthly-report — reporte consolidado por día para un mes
router.get('/cash-register/monthly-report', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const year  = parseInt(req.query.year  as string);
    const month = parseInt(req.query.month as string);

    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Parámetros year y month requeridos (month: 1-12)' });
    }

    const db = await getTenantDb(user.storeId);

    const result = await db.execute(sql`
      SELECT
        DATE(opened_at)                                             AS day,
        COUNT(*)::int                                              AS session_count,
        COALESCE(SUM(total_orders), 0)::int                       AS total_orders,
        COALESCE(SUM(total_expected::numeric),        0)::numeric AS total_expected,
        COALESCE(SUM(total_reported::numeric),        0)::numeric AS total_reported,
        COALESCE(SUM(total_difference::numeric),      0)::numeric AS total_difference,
        COALESCE(SUM(total_sales_amount::numeric),    0)::numeric AS total_sales,
        COALESCE(SUM(total_discounts_amount::numeric),0)::numeric AS total_discounts,
        COALESCE(SUM(total_cancellations), 0)::int                AS total_cancellations
      FROM cash_register_sessions
      WHERE store_id = ${user.storeId}
        AND status IN ('closed', 'approved', 'rejected')
        AND EXTRACT(YEAR  FROM opened_at) = ${year}
        AND EXTRACT(MONTH FROM opened_at) = ${month}
      GROUP BY DATE(opened_at)
      ORDER BY day ASC
    `);

    const days = (result.rows as any[]).map((d: any) => ({
      date:               d.day,
      sessionCount:       d.session_count,
      totalOrders:        d.total_orders,
      totalExpected:      parseFloat(d.total_expected),
      totalReported:      parseFloat(d.total_reported),
      totalDifference:    parseFloat(d.total_difference),
      totalSales:         parseFloat(d.total_sales),
      totalDiscounts:     parseFloat(d.total_discounts),
      totalCancellations: d.total_cancellations,
    }));

    const totals = days.reduce((acc: any, d: any) => ({
      sessionCount:       acc.sessionCount       + d.sessionCount,
      totalOrders:        acc.totalOrders        + d.totalOrders,
      totalExpected:      acc.totalExpected      + d.totalExpected,
      totalReported:      acc.totalReported      + d.totalReported,
      totalDifference:    acc.totalDifference    + d.totalDifference,
      totalSales:         acc.totalSales         + d.totalSales,
      totalDiscounts:     acc.totalDiscounts     + d.totalDiscounts,
      totalCancellations: acc.totalCancellations + d.totalCancellations,
    }), { sessionCount: 0, totalOrders: 0, totalExpected: 0, totalReported: 0,
          totalDifference: 0, totalSales: 0, totalDiscounts: 0, totalCancellations: 0 });

    return res.json({ year, month, days, totals });
  } catch (error) {
    console.error('❌ Error getting monthly report:', error);
    return res.status(500).json({ error: 'Error al obtener reporte mensual' });
  }
});

export default router;
