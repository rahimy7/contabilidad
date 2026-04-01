import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { authenticateToken } from '../authMiddleware';
import { getTenantDb } from '../multi-tenant-db';
import * as schema from '@shared/schema';
import type { AuthUser } from '@shared/auth';

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
router.post('/inventory-adjustments', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const validation = schema.insertInventoryAdjustmentSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: 'Datos inválidos', details: validation.error.flatten() });
    }

    const { notes, items } = validation.data;
    const db = await getTenantDb(user.storeId);

    // Compute summary
    const surplusItems = items.filter(i => i.difference > 0).length;
    const deficitItems = items.filter(i => i.difference < 0).length;
    const surplusValue = items
      .filter(i => i.difference > 0)
      .reduce((acc, i) => acc + Math.abs(parseFloat(i.adjustmentAmount)), 0);
    const deficitValue = items
      .filter(i => i.difference < 0)
      .reduce((acc, i) => acc + Math.abs(parseFloat(i.adjustmentAmount)), 0);
    const netAdjustmentValue = surplusValue - deficitValue;

    // Insert header
    const [adjustment] = await db
      .insert(schema.inventoryAdjustments)
      .values({
        storeId: user.storeId,
        adjustedBy: user.id,
        notes: notes || null,
        totalItems: items.length,
        surplusItems,
        deficitItems,
        surplusValue: surplusValue.toFixed(2),
        deficitValue: deficitValue.toFixed(2),
        netAdjustmentValue: netAdjustmentValue.toFixed(2),
      })
      .returning();

    // Insert line items
    if (items.length > 0) {
      await db.insert(schema.inventoryAdjustmentItems).values(
        items.map(item => ({
          adjustmentId: adjustment.id,
          productId: item.productId,
          productName: item.productName,
          previousStock: item.previousStock,
          realStock: item.realStock,
          difference: item.difference,
          unitPrice: item.unitPrice,
          baseCurrency: item.baseCurrency,
          adjustmentAmount: item.adjustmentAmount,
        }))
      );
    }

    // Apply stock adjustments + record inventory movements
    for (const item of items) {
      // Update product stock
      await db
        .update(schema.products)
        .set({ stockQuantity: item.realStock })
        .where(
          and(
            eq(schema.products.id, item.productId),
            eq(schema.products.storeId, user.storeId)
          )
        );

      // Record movement in inventoryMovements
      await db.insert(schema.inventoryMovements).values({
        storeId: user.storeId,
        productId: item.productId,
        type: 'adjustment',
        quantity: String(Math.abs(item.difference)),
        quantityBefore: String(item.previousStock),
        quantityAfter: String(item.realStock),
        referenceType: 'inventory_adjustment',
        referenceId: adjustment.id,
        notes: notes || `Ajuste de inventario #${adjustment.id}`,
        reason: item.difference > 0 ? 'sobrante' : item.difference < 0 ? 'faltante' : 'sin cambio',
        createdBy: user.id,
      });
    }

    return res.status(201).json({
      message: `Ajuste aplicado correctamente a ${items.length} producto(s)`,
      adjustmentId: adjustment.id,
      summary: { surplusItems, deficitItems, surplusValue, deficitValue, netAdjustmentValue },
    });
  } catch (error) {
    console.error('Error applying inventory adjustment:', error);
    return res.status(500).json({ error: 'Error al aplicar ajuste de inventario' });
  }
});

export default router;
