import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { authenticateToken } from '../authMiddleware';
import { getTenantDb } from '../multi-tenant-db';
import { resolveWarehouseId } from '../utils/warehouse-context';
import * as schema from '@shared/schema';
import type { AuthUser } from '@shared/auth';

const router = Router();

// ─── Helper: verify admin/supervisor credentials ─────────────────────────────
async function verifyAdminCredentials(
  db: any,
  username: string,
  password: string,
): Promise<{ id: number; name: string; role: string } | null> {
  const bcrypt = await import('bcrypt');

  const [user] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      username: schema.users.username,
      password: schema.users.password,
      role: schema.users.role,
      status: schema.users.status,
    })
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .limit(1);

  if (!user) return null;
  if (user.role !== 'admin' && user.role !== 'super_admin') return null;
  if (user.status !== 'active') return null;

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return null;

  return { id: user.id, name: user.name, role: user.role };
}

// ─── POST /cash-withdrawals ───────────────────────────────────────────────────
// Crea un retiro de efectivo. Requiere autorización de usuario admin/supervisor.
router.post('/cash-withdrawals', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const bodySchema = z.object({
      concept:               z.string().min(1, 'El concepto es requerido'),
      amount:                z.number().positive('El monto debe ser mayor a 0'),
      currency:              z.string().default('DOP'),
      notes:                 z.string().optional(),
      sessionType:           z.enum(['day', 'shift']).default('day'),
      authorizerUsername:    z.string().min(1, 'El usuario autorizador es requerido'),
      authorizerPassword:    z.string().min(1, 'La contraseña autorizadora es requerida'),
    });

    const body = bodySchema.parse(req.body);
    const db = await getTenantDb(user.storeId);

    // Verify authorizer credentials
    const authorizer = await verifyAdminCredentials(db, body.authorizerUsername, body.authorizerPassword);
    if (!authorizer) {
      return res.status(403).json({ error: 'Credenciales de autorización inválidas o usuario sin permisos de administrador' });
    }

    const [withdrawal] = await db
      .insert(schema.cashWithdrawals)
      .values({
        storeId:            user.storeId,
        warehouseId:        user.warehouseId ?? (resolveWarehouseId(req) as number),
        cashierId:          user.id,
        authorizedByUserId: authorizer.id,
        concept:            body.concept,
        amount:             body.amount.toString(),
        currency:           body.currency,
        notes:              body.notes ?? null,
        sessionType:        body.sessionType,
        voided:             false,
      })
      .returning();

    // Enrich with names for receipt
    return res.status(201).json({
      withdrawal: {
        ...withdrawal,
        cashierName:    user.username,
        authorizerName: authorizer.name,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', details: error.errors });
    }
    console.error('❌ Error creating withdrawal:', error);
    return res.status(500).json({ error: 'Error al registrar retiro de efectivo' });
  }
});

// ─── GET /cash-withdrawals ────────────────────────────────────────────────────
// Lista retiros con filtros opcionales.
router.get('/cash-withdrawals', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const { startDate, endDate, cashierId, voided } = req.query as Record<string, string>;

    const db = await getTenantDb(user.storeId);

    const conditions: any[] = [eq(schema.cashWithdrawals.storeId, user.storeId)];

    // Filtrar por almacén: operativos ven solo su almacén
    const warehouseId = resolveWarehouseId(req);

    if (startDate) {
      conditions.push(gte(schema.cashWithdrawals.createdAt, new Date(startDate)));
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(schema.cashWithdrawals.createdAt, end));
    }
    if (cashierId) {
      conditions.push(eq(schema.cashWithdrawals.cashierId, parseInt(cashierId)));
    }
    // Default: only non-voided; pass voided=true to include voided
    if (voided !== 'true') {
      conditions.push(eq(schema.cashWithdrawals.voided, false));
    }

    const cashierAlias = { name: schema.users.name };

    const rows = await db.execute(sql`
      SELECT
        w.id,
        w.store_id,
        w.cashier_id,
        w.authorized_by_user_id,
        w.concept,
        w.amount,
        w.currency,
        w.notes,
        w.session_type,
        w.voided,
        w.voided_at,
        w.voided_by_user_id,
        w.void_reason,
        w.created_at,
        c.name  AS cashier_name,
        a.name  AS authorizer_name,
        vb.name AS voided_by_name
      FROM cash_withdrawals w
      LEFT JOIN users c  ON c.id  = w.cashier_id
      LEFT JOIN users a  ON a.id  = w.authorized_by_user_id
      LEFT JOIN users vb ON vb.id = w.voided_by_user_id
      WHERE w.store_id = ${user.storeId}
        ${warehouseId ? sql`AND w.warehouse_id = ${warehouseId}` : sql``}
        ${startDate ? sql`AND w.created_at >= ${new Date(startDate)}` : sql``}
        ${endDate   ? sql`AND w.created_at <= ${new Date(new Date(endDate).setHours(23, 59, 59, 999))}` : sql``}
        ${cashierId ? sql`AND w.cashier_id = ${parseInt(cashierId)}` : sql``}
        ${voided !== 'true' ? sql`AND w.voided = FALSE` : sql``}
      ORDER BY w.created_at DESC
    `);

    const withdrawals = (rows.rows as any[]).map((r: any) => ({
      id:                  r.id,
      storeId:             r.store_id,
      cashierId:           r.cashier_id,
      authorizedByUserId:  r.authorized_by_user_id,
      concept:             r.concept,
      amount:              r.amount,
      currency:            r.currency,
      notes:               r.notes,
      sessionType:         r.session_type,
      voided:              r.voided,
      voidedAt:            r.voided_at,
      voidedByUserId:      r.voided_by_user_id,
      voidReason:          r.void_reason,
      createdAt:           r.created_at,
      cashierName:         r.cashier_name,
      authorizerName:      r.authorizer_name,
      voidedByName:        r.voided_by_name,
    }));

    return res.json({ withdrawals });
  } catch (error) {
    console.error('❌ Error listing withdrawals:', error);
    return res.status(500).json({ error: 'Error al obtener retiros' });
  }
});

// ─── GET /cash-withdrawals/:id ────────────────────────────────────────────────
router.get('/cash-withdrawals/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const withdrawalId = parseInt(req.params.id);
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const db = await getTenantDb(user.storeId);

    const rows = await db.execute(sql`
      SELECT
        w.id, w.store_id, w.cashier_id, w.authorized_by_user_id,
        w.concept, w.amount, w.currency, w.notes, w.session_type,
        w.voided, w.voided_at, w.voided_by_user_id, w.void_reason, w.created_at,
        c.name  AS cashier_name,
        a.name  AS authorizer_name,
        vb.name AS voided_by_name
      FROM cash_withdrawals w
      LEFT JOIN users c  ON c.id  = w.cashier_id
      LEFT JOIN users a  ON a.id  = w.authorized_by_user_id
      LEFT JOIN users vb ON vb.id = w.voided_by_user_id
      WHERE w.id = ${withdrawalId} AND w.store_id = ${user.storeId}
      LIMIT 1
    `);

    const r = rows.rows[0] as any;
    if (!r) return res.status(404).json({ error: 'Retiro no encontrado' });

    return res.json({
      withdrawal: {
        id: r.id, storeId: r.store_id, cashierId: r.cashier_id,
        authorizedByUserId: r.authorized_by_user_id, concept: r.concept,
        amount: r.amount, currency: r.currency, notes: r.notes,
        sessionType: r.session_type, voided: r.voided, voidedAt: r.voided_at,
        voidedByUserId: r.voided_by_user_id, voidReason: r.void_reason,
        createdAt: r.created_at, cashierName: r.cashier_name,
        authorizerName: r.authorizer_name, voidedByName: r.voided_by_name,
      },
    });
  } catch (error) {
    console.error('❌ Error getting withdrawal:', error);
    return res.status(500).json({ error: 'Error al obtener retiro' });
  }
});

// ─── PATCH /cash-withdrawals/:id/void ────────────────────────────────────────
// Anula un retiro. Requiere autorización de admin/supervisor.
router.patch('/cash-withdrawals/:id/void', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const withdrawalId = parseInt(req.params.id);
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const bodySchema = z.object({
      voidReason:         z.string().min(1, 'El motivo de anulación es requerido'),
      authorizerUsername: z.string().min(1),
      authorizerPassword: z.string().min(1),
    });
    const body = bodySchema.parse(req.body);

    const db = await getTenantDb(user.storeId);

    // Verify authorizer
    const authorizer = await verifyAdminCredentials(db, body.authorizerUsername, body.authorizerPassword);
    if (!authorizer) {
      return res.status(403).json({ error: 'Credenciales de autorización inválidas o usuario sin permisos de administrador' });
    }

    const [existing] = await db
      .select({ id: schema.cashWithdrawals.id, voided: schema.cashWithdrawals.voided })
      .from(schema.cashWithdrawals)
      .where(and(
        eq(schema.cashWithdrawals.id, withdrawalId),
        eq(schema.cashWithdrawals.storeId, user.storeId),
      ))
      .limit(1);

    if (!existing) return res.status(404).json({ error: 'Retiro no encontrado' });
    if (existing.voided) return res.status(400).json({ error: 'El retiro ya fue anulado' });

    const [updated] = await db
      .update(schema.cashWithdrawals)
      .set({
        voided:          true,
        voidedAt:        new Date(),
        voidedByUserId:  authorizer.id,
        voidReason:      body.voidReason,
      })
      .where(eq(schema.cashWithdrawals.id, withdrawalId))
      .returning();

    return res.json({ withdrawal: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Datos inválidos', details: error.errors });
    }
    console.error('❌ Error voiding withdrawal:', error);
    return res.status(500).json({ error: 'Error al anular retiro' });
  }
});

export default router;
