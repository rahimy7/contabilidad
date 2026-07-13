import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, sql, sum } from 'drizzle-orm';
import { authenticateToken } from '../authMiddleware';
import { getTenantDb } from '../multi-tenant-db';
import * as schema from '@shared/schema';
import type { AuthUser } from '@shared/auth';

const router = Router();

// ============================================================
// HELPER: número de transferencia
// ============================================================
function generateTransferNumber(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `TRF-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${Math.floor(Math.random() * 9000) + 1000}`;
}

// ============================================================
// ALMACENES — CRUD
// ============================================================

// GET /api/warehouses — listar almacenes de la tienda
router.get('/warehouses', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const db = await getTenantDb(user.storeId);
    const items = await db
      .select()
      .from(schema.warehouses)
      .where(eq(schema.warehouses.storeId, user.storeId))
      .orderBy(desc(schema.warehouses.isDefault), schema.warehouses.name);

    return res.json(items);
  } catch (err) {
    console.error('[warehouses] GET list error:', err);
    return res.status(500).json({ error: 'Error al obtener almacenes' });
  }
});

// GET /api/warehouses/:id — detalle de un almacén
router.get('/warehouses/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const id = parseInt(req.params.id);
    const db = await getTenantDb(user.storeId);
    const [warehouse] = await db
      .select()
      .from(schema.warehouses)
      .where(and(eq(schema.warehouses.id, id), eq(schema.warehouses.storeId, user.storeId)));

    if (!warehouse) return res.status(404).json({ error: 'Almacén no encontrado' });
    return res.json(warehouse);
  } catch (err) {
    console.error('[warehouses] GET one error:', err);
    return res.status(500).json({ error: 'Error al obtener almacén' });
  }
});

// POST /api/warehouses — crear almacén
router.post('/warehouses', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const body = schema.insertWarehouseSchema.parse(req.body);
    const db = await getTenantDb(user.storeId);

    // Si se marca como default, quitar el default anterior
    if (body.isDefault) {
      await db
        .update(schema.warehouses)
        .set({ isDefault: false })
        .where(eq(schema.warehouses.storeId, user.storeId));
    }

    const [created] = await db
      .insert(schema.warehouses)
      .values({
        storeId: user.storeId,
        name: body.name,
        description: body.description ?? null,
        address: body.address ?? null,
        phone: body.phone ?? null,
        manager: body.manager ?? null,
        isDefault: body.isDefault ?? false,
        isActive: body.isActive ?? true,
      })
      .returning();

    return res.status(201).json(created);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    console.error('[warehouses] POST error:', err);
    return res.status(500).json({ error: 'Error al crear almacén' });
  }
});

// PUT /api/warehouses/:id — actualizar almacén
router.put('/warehouses/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const id = parseInt(req.params.id);
    const body = schema.insertWarehouseSchema.partial().parse(req.body);
    const db = await getTenantDb(user.storeId);

    // Verificar que pertenece a esta tienda
    const [existing] = await db
      .select({ id: schema.warehouses.id })
      .from(schema.warehouses)
      .where(and(eq(schema.warehouses.id, id), eq(schema.warehouses.storeId, user.storeId)));
    if (!existing) return res.status(404).json({ error: 'Almacén no encontrado' });

    if (body.isDefault) {
      await db
        .update(schema.warehouses)
        .set({ isDefault: false })
        .where(eq(schema.warehouses.storeId, user.storeId));
    }

    const [updated] = await db
      .update(schema.warehouses)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(schema.warehouses.id, id))
      .returning();

    return res.json(updated);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    console.error('[warehouses] PUT error:', err);
    return res.status(500).json({ error: 'Error al actualizar almacén' });
  }
});

// DELETE /api/warehouses/:id — desactivar almacén
router.delete('/warehouses/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const id = parseInt(req.params.id);
    const db = await getTenantDb(user.storeId);

    const [existing] = await db
      .select({ id: schema.warehouses.id, isDefault: schema.warehouses.isDefault })
      .from(schema.warehouses)
      .where(and(eq(schema.warehouses.id, id), eq(schema.warehouses.storeId, user.storeId)));
    if (!existing) return res.status(404).json({ error: 'Almacén no encontrado' });
    if (existing.isDefault) return res.status(400).json({ error: 'No se puede eliminar el almacén predeterminado' });

    // Soft-delete: desactivar
    await db
      .update(schema.warehouses)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(schema.warehouses.id, id));

    return res.json({ message: 'Almacén desactivado correctamente' });
  } catch (err) {
    console.error('[warehouses] DELETE error:', err);
    return res.status(500).json({ error: 'Error al eliminar almacén' });
  }
});

// ============================================================
// STOCK POR ALMACÉN
// ============================================================

// GET /api/warehouses/:id/stock — stock de productos en un almacén
router.get('/warehouses/:id/stock', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const warehouseId = parseInt(req.params.id);
    const db = await getTenantDb(user.storeId);

    const stockItems = await db
      .select({
        id: schema.warehouseStock.id,
        warehouseId: schema.warehouseStock.warehouseId,
        productId: schema.warehouseStock.productId,
        quantity: schema.warehouseStock.quantity,
        minStock: schema.warehouseStock.minStock,
        maxStock: schema.warehouseStock.maxStock,
        updatedAt: schema.warehouseStock.updatedAt,
        productName: schema.products.name,
        productSku: schema.products.sku,
        productCategory: schema.products.category,
        productImageUrl: schema.products.imageUrl,
        productPrice: schema.products.price,
        productBaseCurrency: schema.products.baseCurrency,
      })
      .from(schema.warehouseStock)
      .leftJoin(schema.products, eq(schema.warehouseStock.productId, schema.products.id))
      .where(
        and(
          eq(schema.warehouseStock.warehouseId, warehouseId),
          eq(schema.warehouseStock.storeId, user.storeId)
        )
      )
      .orderBy(schema.products.name);

    return res.json(stockItems);
  } catch (err) {
    console.error('[warehouses] GET stock error:', err);
    return res.status(500).json({ error: 'Error al obtener stock' });
  }
});

// GET /api/warehouses/stock/summary — stock total por producto (todos los almacenes)
router.get('/warehouses/stock/summary', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const db = await getTenantDb(user.storeId);

    const summary = await db
      .select({
        productId: schema.warehouseStock.productId,
        productName: schema.products.name,
        productSku: schema.products.sku,
        productCategory: schema.products.category,
        productPrice: schema.products.price,
        productBaseCurrency: schema.products.baseCurrency,
        totalQuantity: sum(schema.warehouseStock.quantity),
      })
      .from(schema.warehouseStock)
      .leftJoin(schema.products, eq(schema.warehouseStock.productId, schema.products.id))
      .where(eq(schema.warehouseStock.storeId, user.storeId))
      .groupBy(
        schema.warehouseStock.productId,
        schema.products.name,
        schema.products.sku,
        schema.products.category,
        schema.products.price,
        schema.products.baseCurrency
      )
      .orderBy(schema.products.name);

    return res.json(summary);
  } catch (err) {
    console.error('[warehouses] GET stock summary error:', err);
    return res.status(500).json({ error: 'Error al obtener resumen de stock' });
  }
});

// PUT /api/warehouses/:id/stock/:productId — ajustar stock en un almacén
router.put('/warehouses/:id/stock/:productId', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const warehouseId = parseInt(req.params.id);
    const productId = parseInt(req.params.productId);
    const { quantity, minStock, maxStock } = req.body;

    const db = await getTenantDb(user.storeId);

    // Verificar almacén
    const [warehouse] = await db
      .select({ id: schema.warehouses.id })
      .from(schema.warehouses)
      .where(and(eq(schema.warehouses.id, warehouseId), eq(schema.warehouses.storeId, user.storeId)));
    if (!warehouse) return res.status(404).json({ error: 'Almacén no encontrado' });

    // Upsert stock
    const existing = await db
      .select({ id: schema.warehouseStock.id })
      .from(schema.warehouseStock)
      .where(
        and(
          eq(schema.warehouseStock.warehouseId, warehouseId),
          eq(schema.warehouseStock.productId, productId)
        )
      );

    let result: any;
    if (existing.length > 0) {
      [result] = await db
        .update(schema.warehouseStock)
        .set({
          quantity: String(quantity),
          minStock: minStock != null ? String(minStock) : undefined,
          maxStock: maxStock != null ? String(maxStock) : undefined,
          updatedAt: new Date(),
        })
        .where(eq(schema.warehouseStock.id, existing[0].id))
        .returning();
    } else {
      [result] = await db
        .insert(schema.warehouseStock)
        .values({
          warehouseId,
          productId,
          storeId: user.storeId,
          quantity: String(quantity),
          minStock: minStock != null ? String(minStock) : '0',
          maxStock: maxStock != null ? String(maxStock) : null,
        })
        .returning();
    }

    return res.json(result);
  } catch (err) {
    console.error('[warehouses] PUT stock error:', err);
    return res.status(500).json({ error: 'Error al actualizar stock' });
  }
});

// ============================================================
// TRANSFERENCIAS
// ============================================================

// GET /api/warehouse-transfers — listar transferencias
router.get('/warehouse-transfers', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const db = await getTenantDb(user.storeId);

    const transfers = await db
      .select({
        id: schema.warehouseTransfers.id,
        transferNumber: schema.warehouseTransfers.transferNumber,
        status: schema.warehouseTransfers.status,
        notes: schema.warehouseTransfers.notes,
        createdAt: schema.warehouseTransfers.createdAt,
        approvedAt: schema.warehouseTransfers.approvedAt,
        completedAt: schema.warehouseTransfers.completedAt,
        fromWarehouseId: schema.warehouseTransfers.fromWarehouseId,
        toWarehouseId: schema.warehouseTransfers.toWarehouseId,
        fromWarehouseName: sql<string>`fw.name`,
        toWarehouseName: sql<string>`tw.name`,
        createdByName: schema.users.name,
      })
      .from(schema.warehouseTransfers)
      .leftJoin(
        sql`warehouses fw`,
        sql`fw.id = ${schema.warehouseTransfers.fromWarehouseId}`
      )
      .leftJoin(
        sql`warehouses tw`,
        sql`tw.id = ${schema.warehouseTransfers.toWarehouseId}`
      )
      .leftJoin(schema.users, eq(schema.warehouseTransfers.createdBy, schema.users.id))
      .where(eq(schema.warehouseTransfers.storeId, user.storeId))
      .orderBy(desc(schema.warehouseTransfers.createdAt));

    return res.json(transfers);
  } catch (err) {
    console.error('[warehouse-transfers] GET list error:', err);
    return res.status(500).json({ error: 'Error al obtener transferencias' });
  }
});

// GET /api/warehouse-transfers/:id — detalle con ítems
router.get('/warehouse-transfers/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const id = parseInt(req.params.id);
    const db = await getTenantDb(user.storeId);

    const [transfer] = await db
      .select()
      .from(schema.warehouseTransfers)
      .where(and(eq(schema.warehouseTransfers.id, id), eq(schema.warehouseTransfers.storeId, user.storeId)));
    if (!transfer) return res.status(404).json({ error: 'Transferencia no encontrada' });

    const items = await db
      .select({
        id: schema.warehouseTransferItems.id,
        productId: schema.warehouseTransferItems.productId,
        requestedQuantity: schema.warehouseTransferItems.requestedQuantity,
        sentQuantity: schema.warehouseTransferItems.sentQuantity,
        receivedQuantity: schema.warehouseTransferItems.receivedQuantity,
        notes: schema.warehouseTransferItems.notes,
        productName: schema.products.name,
        productSku: schema.products.sku,
      })
      .from(schema.warehouseTransferItems)
      .leftJoin(schema.products, eq(schema.warehouseTransferItems.productId, schema.products.id))
      .where(eq(schema.warehouseTransferItems.transferId, id));

    return res.json({ ...transfer, items });
  } catch (err) {
    console.error('[warehouse-transfers] GET one error:', err);
    return res.status(500).json({ error: 'Error al obtener transferencia' });
  }
});

// POST /api/warehouse-transfers — crear transferencia
router.post('/warehouse-transfers', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const body = schema.insertWarehouseTransferSchema.parse(req.body);
    if (body.fromWarehouseId === body.toWarehouseId) {
      return res.status(400).json({ error: 'Los almacenes de origen y destino deben ser distintos' });
    }

    const db = await getTenantDb(user.storeId);

    // Verificar que ambos almacenes pertenecen a la tienda
    const warehouses = await db
      .select({ id: schema.warehouses.id })
      .from(schema.warehouses)
      .where(
        and(
          eq(schema.warehouses.storeId, user.storeId),
          sql`${schema.warehouses.id} IN (${body.fromWarehouseId}, ${body.toWarehouseId})`
        )
      );
    if (warehouses.length < 2) return res.status(400).json({ error: 'Almacén(es) no válido(s)' });

    const [transfer] = await db
      .insert(schema.warehouseTransfers)
      .values({
        storeId: user.storeId,
        transferNumber: generateTransferNumber(),
        fromWarehouseId: body.fromWarehouseId,
        toWarehouseId: body.toWarehouseId,
        notes: body.notes ?? null,
        createdBy: user.id,
        status: 'pending',
      })
      .returning();

    // Insertar ítems
    await db.insert(schema.warehouseTransferItems).values(
      body.items.map((item) => ({
        transferId: transfer.id,
        productId: item.productId,
        requestedQuantity: String(item.requestedQuantity),
        notes: item.notes ?? null,
      }))
    );

    return res.status(201).json(transfer);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    console.error('[warehouse-transfers] POST error:', err);
    return res.status(500).json({ error: 'Error al crear transferencia' });
  }
});

// PATCH /api/warehouse-transfers/:id/approve — aprobar transferencia
router.patch('/warehouse-transfers/:id/approve', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const id = parseInt(req.params.id);
    const db = await getTenantDb(user.storeId);

    const [transfer] = await db
      .select()
      .from(schema.warehouseTransfers)
      .where(and(eq(schema.warehouseTransfers.id, id), eq(schema.warehouseTransfers.storeId, user.storeId)));
    if (!transfer) return res.status(404).json({ error: 'Transferencia no encontrada' });
    if (transfer.status !== 'pending') return res.status(400).json({ error: 'Solo se pueden aprobar transferencias pendientes' });

    const [updated] = await db
      .update(schema.warehouseTransfers)
      .set({ status: 'approved', approvedBy: user.id, approvedAt: new Date() })
      .where(eq(schema.warehouseTransfers.id, id))
      .returning();

    return res.json(updated);
  } catch (err) {
    console.error('[warehouse-transfers] PATCH approve error:', err);
    return res.status(500).json({ error: 'Error al aprobar transferencia' });
  }
});

// PATCH /api/warehouse-transfers/:id/complete — completar (descontar/acreditar stock)
router.patch('/warehouse-transfers/:id/complete', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const id = parseInt(req.params.id);
    const db = await getTenantDb(user.storeId);

    const [transfer] = await db
      .select()
      .from(schema.warehouseTransfers)
      .where(and(eq(schema.warehouseTransfers.id, id), eq(schema.warehouseTransfers.storeId, user.storeId)));
    if (!transfer) return res.status(404).json({ error: 'Transferencia no encontrada' });
    if (!['approved', 'in_transit'].includes(transfer.status)) {
      return res.status(400).json({ error: 'La transferencia debe estar aprobada para completarse' });
    }

    const items = await db
      .select()
      .from(schema.warehouseTransferItems)
      .where(eq(schema.warehouseTransferItems.transferId, id));

    // Procesar cada ítem: descontar del origen, acreditar en destino
    for (const item of items) {
      const qty = parseFloat(String(item.requestedQuantity));

      // Descontar del almacén origen
      const [srcStock] = await db
        .select()
        .from(schema.warehouseStock)
        .where(
          and(
            eq(schema.warehouseStock.warehouseId, transfer.fromWarehouseId),
            eq(schema.warehouseStock.productId, item.productId)
          )
        );

      if (srcStock) {
        const newQty = Math.max(0, parseFloat(String(srcStock.quantity)) - qty);
        await db
          .update(schema.warehouseStock)
          .set({ quantity: String(newQty), updatedAt: new Date() })
          .where(eq(schema.warehouseStock.id, srcStock.id));
      }

      // Acreditar en almacén destino
      const [dstStock] = await db
        .select()
        .from(schema.warehouseStock)
        .where(
          and(
            eq(schema.warehouseStock.warehouseId, transfer.toWarehouseId),
            eq(schema.warehouseStock.productId, item.productId)
          )
        );

      if (dstStock) {
        const newQty = parseFloat(String(dstStock.quantity)) + qty;
        await db
          .update(schema.warehouseStock)
          .set({ quantity: String(newQty), updatedAt: new Date() })
          .where(eq(schema.warehouseStock.id, dstStock.id));
      } else {
        await db.insert(schema.warehouseStock).values({
          warehouseId: transfer.toWarehouseId,
          productId: item.productId,
          storeId: user.storeId,
          quantity: String(qty),
        });
      }

      // Registrar received_quantity en el ítem
      await db
        .update(schema.warehouseTransferItems)
        .set({ receivedQuantity: String(qty), sentQuantity: String(qty) })
        .where(eq(schema.warehouseTransferItems.id, item.id));
    }

    const [updated] = await db
      .update(schema.warehouseTransfers)
      .set({ status: 'completed', completedBy: user.id, completedAt: new Date() })
      .where(eq(schema.warehouseTransfers.id, id))
      .returning();

    return res.json(updated);
  } catch (err) {
    console.error('[warehouse-transfers] PATCH complete error:', err);
    return res.status(500).json({ error: 'Error al completar transferencia' });
  }
});

// PATCH /api/warehouse-transfers/:id/cancel — cancelar transferencia
router.patch('/warehouse-transfers/:id/cancel', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const id = parseInt(req.params.id);
    const db = await getTenantDb(user.storeId);

    const [transfer] = await db
      .select({ id: schema.warehouseTransfers.id, status: schema.warehouseTransfers.status })
      .from(schema.warehouseTransfers)
      .where(and(eq(schema.warehouseTransfers.id, id), eq(schema.warehouseTransfers.storeId, user.storeId)));
    if (!transfer) return res.status(404).json({ error: 'Transferencia no encontrada' });
    if (transfer.status === 'completed') return res.status(400).json({ error: 'No se puede cancelar una transferencia completada' });

    const [updated] = await db
      .update(schema.warehouseTransfers)
      .set({ status: 'cancelled' })
      .where(eq(schema.warehouseTransfers.id, id))
      .returning();

    return res.json(updated);
  } catch (err) {
    console.error('[warehouse-transfers] PATCH cancel error:', err);
    return res.status(500).json({ error: 'Error al cancelar transferencia' });
  }
});

// ============================================================
// REPORTES POR ALMACÉN
// ============================================================

// GET /api/warehouses/reports/stock-comparison — comparación de stock entre almacenes
router.get('/warehouses/reports/stock-comparison', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const db = await getTenantDb(user.storeId);

    // Todos los almacenes activos
    const allWarehouses = await db
      .select({ id: schema.warehouses.id, name: schema.warehouses.name })
      .from(schema.warehouses)
      .where(and(eq(schema.warehouses.storeId, user.storeId), eq(schema.warehouses.isActive, true)))
      .orderBy(schema.warehouses.name);

    // Stock de todos los productos en todos los almacenes
    const stockData = await db
      .select({
        warehouseId: schema.warehouseStock.warehouseId,
        productId: schema.warehouseStock.productId,
        productName: schema.products.name,
        productSku: schema.products.sku,
        productCategory: schema.products.category,
        quantity: schema.warehouseStock.quantity,
        minStock: schema.warehouseStock.minStock,
      })
      .from(schema.warehouseStock)
      .leftJoin(schema.products, eq(schema.warehouseStock.productId, schema.products.id))
      .where(eq(schema.warehouseStock.storeId, user.storeId))
      .orderBy(schema.products.name);

    return res.json({ warehouses: allWarehouses, stockData });
  } catch (err) {
    console.error('[warehouses] GET stock comparison error:', err);
    return res.status(500).json({ error: 'Error al obtener comparación de stock' });
  }
});

// GET /api/warehouses/reports/transfers-summary — resumen de transferencias
router.get('/warehouses/reports/transfers-summary', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });

    const db = await getTenantDb(user.storeId);

    const transfers = await db
      .select({
        id: schema.warehouseTransfers.id,
        transferNumber: schema.warehouseTransfers.transferNumber,
        status: schema.warehouseTransfers.status,
        createdAt: schema.warehouseTransfers.createdAt,
        completedAt: schema.warehouseTransfers.completedAt,
        fromWarehouseId: schema.warehouseTransfers.fromWarehouseId,
        toWarehouseId: schema.warehouseTransfers.toWarehouseId,
      })
      .from(schema.warehouseTransfers)
      .where(eq(schema.warehouseTransfers.storeId, user.storeId))
      .orderBy(desc(schema.warehouseTransfers.createdAt))
      .limit(200);

    return res.json(transfers);
  } catch (err) {
    console.error('[warehouses] GET transfers summary error:', err);
    return res.status(500).json({ error: 'Error al obtener resumen de transferencias' });
  }
});

export default router;
