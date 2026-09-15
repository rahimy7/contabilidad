import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { authenticateToken } from '../authMiddleware';
import { getTenantDb } from '../multi-tenant-db';
import * as schema from '@shared/schema';
import type { AuthUser } from '@shared/auth';
import { withLegacyCompany, sendLegacyError } from '../http/legacy-bridge';
import { applyStockAdjustment } from '../inventory/adjustments';

const router = Router();

// ================================
// AJUSTE DE INVENTARIO
// ================================

// GET - Lista de ajustes pasados (cabecera)
router.get('/inventory-adjustments', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const db = await getTenantDb(user.storeId);

    const adjustments = await db
      .select({
        id: schema.inventoryAdjustments.id,
        notes: schema.inventoryAdjustments.notes,
        totalItems: schema.inventoryAdjustments.totalItems,
        surplusItems: schema.inventoryAdjustments.surplusItems,
        deficitItems: schema.inventoryAdjustments.deficitItems,
        surplusValue: schema.inventoryAdjustments.surplusValue,
        deficitValue: schema.inventoryAdjustments.deficitValue,
        netAdjustmentValue: schema.inventoryAdjustments.netAdjustmentValue,
        createdAt: schema.inventoryAdjustments.createdAt,
        adjustedByName: schema.users.name,
      })
      .from(schema.inventoryAdjustments)
      .leftJoin(schema.users, eq(schema.inventoryAdjustments.adjustedBy, schema.users.id))
      .where(eq(schema.inventoryAdjustments.storeId, user.storeId))
      .orderBy(desc(schema.inventoryAdjustments.createdAt))
      .limit(100);

    return res.json(adjustments);
  } catch (error) {
    console.error('Error fetching inventory adjustments:', error);
    return res.status(500).json({ error: 'Error al obtener ajustes de inventario' });
  }
});

// GET - Detalle de un ajuste con sus líneas
router.get('/inventory-adjustments/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const adjustmentId = parseInt(req.params.id);
    if (isNaN(adjustmentId)) return res.status(400).json({ error: 'ID inválido' });

    const db = await getTenantDb(user.storeId);

    // Verify it belongs to this store
    const [header] = await db
      .select()
      .from(schema.inventoryAdjustments)
      .where(
        and(
          eq(schema.inventoryAdjustments.id, adjustmentId),
          eq(schema.inventoryAdjustments.storeId, user.storeId)
        )
      )
      .limit(1);

    if (!header) return res.status(404).json({ error: 'Ajuste no encontrado' });

    const items = await db
      .select()
      .from(schema.inventoryAdjustmentItems)
      .where(eq(schema.inventoryAdjustmentItems.adjustmentId, adjustmentId))
      .orderBy(schema.inventoryAdjustmentItems.productName);

    return res.json({ ...header, items });
  } catch (error) {
    console.error('Error fetching adjustment detail:', error);
    return res.status(500).json({ error: 'Error al obtener detalle del ajuste' });
  }
});

// POST - Aplicar un ajuste de inventario
//
// Cada línea dice cuánto hay realmente en el estante (`realStock`) de un almacén.
// La diferencia contra el libro valorado es el ajuste: un faltante sale al costo
// y va a "Faltantes de inventario" (5.1.02.001), un sobrante entra al costo
// promedio contra "Sobrantes de inventario" (4.2.02.001). Se valora al COSTO,
// nunca al precio de venta, y todo — cabecera, líneas, existencias y asientos —
// ocurre en una transacción.
const adjustmentBody = z.object({
  warehouseId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().optional().nullable(),
  reason: z.string().optional(),
  items: z.array(z.object({
    productId: z.number().int().positive(),
    productName: z.string().optional(),
    realStock: z.union([z.number(), z.string()]).transform((v) => String(v)),
    /** Costo de un sobrante sin costo previo en el almacén. */
    unitCost: z.string().optional(),
    reason: z.string().optional(),
  })).min(1, 'Se requiere al menos un producto'),
});

router.post('/inventory-adjustments', authenticateToken, async (req: any, res: any) => {
  try {
    const body = adjustmentBody.parse(req.body);
    const date = body.date ?? new Date().toISOString().slice(0, 10);
    const result = await withLegacyCompany(req, (c, ctx) =>
      applyStockAdjustment(c, {
        companyId: ctx.companyId, storeId: ctx.storeId, userId: ctx.userId, warehouseId: body.warehouseId, date,
        notes: body.notes, reason: body.reason,
        items: body.items.map((i) => ({ productId: i.productId, productName: i.productName, realStock: i.realStock, unitCost: i.unitCost, reason: i.reason })),
      }),
    );
    return res.status(201).json({
      message: `Ajuste aplicado correctamente a ${body.items.length} producto(s)`,
      adjustmentId: result.adjustmentId,
      summary: result,
    });
  } catch (error) {
    return sendLegacyError(res, error, 'Error al aplicar ajuste de inventario');
  }
});

export default router;
