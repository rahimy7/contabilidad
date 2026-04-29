import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { authenticateToken } from '../authMiddleware';
import { getTenantDb } from '../multi-tenant-db';
import * as schema from '@shared/schema';
import type { AuthUser } from '@shared/auth';

const router = Router();

// Diferencia máxima sin requerir nota de discrepancia
const DISCREPANCY_THRESHOLD = 100;

// ================================
// CIERRE DE CAJA
// ================================

// GET /cash-register/sessions/active — sesión abierta del store actual
router.get('/cash-register/sessions/active', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const db = await getTenantDb(user.storeId);

    const [session] = await db
      .select({
        id: schema.cashRegisterSessions.id,
        storeId: schema.cashRegisterSessions.storeId,
        cashierId: schema.cashRegisterSessions.cashierId,
        cashierName: schema.users.name,
        sessionType: schema.cashRegisterSessions.sessionType,
        status: schema.cashRegisterSessions.status,
        openingAmount: schema.cashRegisterSessions.openingAmount,
        openedAt: schema.cashRegisterSessions.openedAt,
        openingNotes: schema.cashRegisterSessions.openingNotes,
      })
      .from(schema.cashRegisterSessions)
      .leftJoin(schema.users, eq(schema.users.id, schema.cashRegisterSessions.cashierId))
      .where(
        and(
          eq(schema.cashRegisterSessions.storeId, user.storeId),
          eq(schema.cashRegisterSessions.status, 'open'),
        ),
      )
      .orderBy(desc(schema.cashRegisterSessions.openedAt))
      .limit(1);

    if (!session) {
      return res.json({ session: null });
    }

    // Calcular stats en vivo de las órdenes desde la apertura
    const statsResult = await db.execute(sql`
      SELECT
        COUNT(*)::int                                          AS total_orders,
        COALESCE(SUM(total_amount)::numeric, 0)               AS total_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'cash'     THEN total_amount ELSE 0 END)::numeric, 0) AS cash_total,
        COALESCE(SUM(CASE WHEN payment_method = 'card'     THEN total_amount ELSE 0 END)::numeric, 0) AS card_total,
        COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN total_amount ELSE 0 END)::numeric, 0) AS transfer_total,
        COALESCE(SUM(CASE WHEN payment_method = 'credit'   THEN total_amount ELSE 0 END)::numeric, 0) AS credit_total,
        COALESCE(SUM(discount_amount)::numeric, 0)            AS total_discounts,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END)::int AS total_cancellations
      FROM orders
      WHERE store_id = ${user.storeId}
        AND created_at >= ${session.openedAt}
        AND payment_status IN ('paid', 'partial')
        AND status != 'cancelled'
    `);

    const stats = statsResult.rows[0] as any;

    return res.json({
      session,
      stats: {
        totalOrders: stats.total_orders,
        totalSales: stats.total_sales,
        cashTotal: stats.cash_total,
        cardTotal: stats.card_total,
        transferTotal: stats.transfer_total,
        creditTotal: stats.credit_total,
        totalDiscounts: stats.total_discounts,
        totalCancellations: stats.total_cancellations,
      },
    });
  } catch (error) {
    console.error('❌ Error getting active cash register session:', error);
    return res.status(500).json({ error: 'Error al obtener sesión activa' });
  }
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

// POST /cash-register/sessions — abrir nueva sesión
router.post('/cash-register/sessions', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const bodySchema = z.object({
      sessionType: z.enum(['shift', 'day']).default('shift'),
      openingAmount: z.number().min(0).default(0),
      openingNotes: z.string().optional(),
    });

    const body = bodySchema.parse(req.body);

    const db = await getTenantDb(user.storeId);

    // Verificar que no haya una sesión ya abierta
    const [existing] = await db
      .select({ id: schema.cashRegisterSessions.id })
      .from(schema.cashRegisterSessions)
      .where(
        and(
          eq(schema.cashRegisterSessions.storeId, user.storeId),
          eq(schema.cashRegisterSessions.status, 'open'),
        ),
      )
      .limit(1);

    if (existing) {
      return res.status(400).json({
        error: 'Ya existe una sesión de caja abierta. Ciérrala antes de abrir una nueva.',
      });
    }

    const [session] = await db
      .insert(schema.cashRegisterSessions)
      .values({
        storeId: user.storeId,
        cashierId: user.id,
        sessionType: body.sessionType,
        openingAmount: body.openingAmount.toString(),
        openingNotes: body.openingNotes,
        status: 'open',
      })
      .returning();

    return res.status(201).json({ session });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', details: error.errors });
    }
    console.error('❌ Error opening cash register session:', error);
    return res.status(500).json({ error: 'Error al abrir sesión de caja' });
  }
});

// PUT /cash-register/sessions/:id/close — cajera envía conteo
router.put('/cash-register/sessions/:id/close', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const sessionId = parseInt(req.params.id);
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const bodySchema = z.object({
      cashReported: z.number().min(0).default(0),
      cardReported: z.number().min(0).default(0),
      transferReported: z.number().min(0).default(0),
      creditReported: z.number().min(0).default(0),
      discrepancyNote: z.string().optional(),
    });

    const body = bodySchema.parse(req.body);

    const db = await getTenantDb(user.storeId);

    const [session] = await db
      .select()
      .from(schema.cashRegisterSessions)
      .where(
        and(
          eq(schema.cashRegisterSessions.id, sessionId),
          eq(schema.cashRegisterSessions.storeId, user.storeId),
          eq(schema.cashRegisterSessions.status, 'open'),
        ),
      )
      .limit(1);

    if (!session) {
      return res.status(404).json({ error: 'Sesión abierta no encontrada' });
    }

    const closedAt = new Date();

    // Calcular montos esperados desde las órdenes del período
    const statsResult = await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN payment_method = 'cash'     THEN total_amount ELSE 0 END)::numeric, 0) AS cash_expected,
        COALESCE(SUM(CASE WHEN payment_method = 'card'     THEN total_amount ELSE 0 END)::numeric, 0) AS card_expected,
        COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN total_amount ELSE 0 END)::numeric, 0) AS transfer_expected,
        COALESCE(SUM(CASE WHEN payment_method = 'credit'   THEN total_amount ELSE 0 END)::numeric, 0) AS credit_expected,
        COUNT(*)::int                                                                                   AS total_orders,
        COALESCE(SUM(total_amount)::numeric, 0)                                                       AS total_sales,
        COALESCE(SUM(discount_amount)::numeric, 0)                                                    AS total_discounts,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END)::int                                         AS total_cancellations
      FROM orders
      WHERE store_id = ${user.storeId}
        AND created_at >= ${session.openedAt}
        AND created_at <= ${closedAt}
        AND payment_status IN ('paid', 'partial')
        AND status != 'cancelled'
    `);

    const stats = statsResult.rows[0] as any;

    const cashExpected = parseFloat(stats.cash_expected);
    const cardExpected = parseFloat(stats.card_expected);
    const transferExpected = parseFloat(stats.transfer_expected);
    const creditExpected = parseFloat(stats.credit_expected);
    const totalExpected = cashExpected + cardExpected + transferExpected + creditExpected;

    const totalReported =
      body.cashReported + body.cardReported + body.transferReported + body.creditReported;
    const totalDifference = totalReported - totalExpected;

    // Nota obligatoria si la diferencia supera el umbral
    if (Math.abs(totalDifference) > DISCREPANCY_THRESHOLD && !body.discrepancyNote?.trim()) {
      return res.status(400).json({
        error: `La diferencia (${totalDifference.toFixed(2)}) supera el límite de ${DISCREPANCY_THRESHOLD}. Debes ingresar una nota explicando la discrepancia.`,
        totalDifference,
        threshold: DISCREPANCY_THRESHOLD,
      });
    }

    const [updated] = await db
      .update(schema.cashRegisterSessions)
      .set({
        status: 'closed',
        closedAt,
        closedByUserId: user.id,
        // Reportado
        cashReported: body.cashReported.toString(),
        cardReported: body.cardReported.toString(),
        transferReported: body.transferReported.toString(),
        creditReported: body.creditReported.toString(),
        // Esperado
        cashExpected: cashExpected.toString(),
        cardExpected: cardExpected.toString(),
        transferExpected: transferExpected.toString(),
        creditExpected: creditExpected.toString(),
        // Diferencias
        cashDifference: (body.cashReported - cashExpected).toString(),
        cardDifference: (body.cardReported - cardExpected).toString(),
        transferDifference: (body.transferReported - transferExpected).toString(),
        creditDifference: (body.creditReported - creditExpected).toString(),
        totalDifference: totalDifference.toString(),
        // Totales
        totalExpected: totalExpected.toString(),
        totalReported: totalReported.toString(),
        // Resumen operaciones
        totalOrders: stats.total_orders,
        totalSalesAmount: stats.total_sales,
        totalCancellations: stats.total_cancellations,
        totalDiscountsAmount: stats.total_discounts,
        // Nota
        discrepancyNote: body.discrepancyNote,
        updatedAt: new Date(),
      })
      .returning();

    return res.json({ session: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', details: error.errors });
    }
    console.error('❌ Error closing cash register session:', error);
    return res.status(500).json({ error: 'Error al cerrar sesión de caja' });
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
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
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
        updatedAt: new Date(),
      })
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

export default router;
