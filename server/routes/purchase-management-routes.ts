import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, sql, gte, lte, isNull, not } from 'drizzle-orm';
import { authenticateToken } from '../authMiddleware';
import { getTenantDb } from '../multi-tenant-db';
import * as schema from '@shared/schema';
import type { AuthUser } from '@shared/auth';
import { resolveActiveCompany, withCompany } from '../tenant-context';
import { putaway, warehouseConfig, WmsError } from '../inventory/wms';
import { withLegacyCompany, LegacyBridgeError, sendLegacyError } from '../http/legacy-bridge';
import { createPurchaseOrder, submitPurchaseOrder } from '../procurement/purchase-orders';
import { receivePurchaseOrder } from '../procurement/receipts';

const router = Router();

// ================================
// PROVEEDORES (SUPPLIERS)
// ================================

// GET - Obtener todos los proveedores
router.get('/suppliers', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const db = await getTenantDb(user.storeId);
    const suppliers = await db
      .select()
      .from(schema.suppliers)
      .where(eq(schema.suppliers.storeId, user.storeId))
      .orderBy(schema.suppliers.name);

    res.json(suppliers);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({ error: 'Error al obtener proveedores' });
  }
});

// POST - Crear proveedor
router.post('/suppliers', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    // Asegurar que storeId sea un número
    const storeId = typeof user.storeId === 'string' ? parseInt(user.storeId, 10) : user.storeId;

    const validation = schema.insertSupplierSchema.safeParse({
      ...req.body,
      storeId: storeId,
    });

    if (!validation.success) {
      return res.status(400).json({
        error: 'Validación fallida',
        details: validation.error.errors,
      });
    }

    const db = await getTenantDb(storeId);
    const [supplier] = await db
      .insert(schema.suppliers)
      .values(validation.data)
      .returning();

    res.status(201).json(supplier);
  } catch (error) {
    console.error('Error creating supplier:', error);
    res.status(500).json({ error: 'Error al crear proveedor' });
  }
});

// PUT - Actualizar proveedor
router.put('/suppliers/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const id = parseInt(req.params.id);
    const db = await getTenantDb(user.storeId);

    const [supplier] = await db
      .update(schema.suppliers)
      .set({ ...req.body, updatedAt: new Date() })
      .where(
        and(
          eq(schema.suppliers.id, id),
          eq(schema.suppliers.storeId, user.storeId)
        )
      )
      .returning();

    if (!supplier) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    res.json(supplier);
  } catch (error) {
    console.error('Error updating supplier:', error);
    res.status(500).json({ error: 'Error al actualizar proveedor' });
  }
});

// DELETE - Eliminar proveedor
router.delete('/suppliers/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const id = parseInt(req.params.id);
    const db = await getTenantDb(user.storeId);

    // Verificar si hay órdenes de compra con este proveedor
    const [purchaseCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.purchaseOrders)
      .where(eq(schema.purchaseOrders.supplierId, id));

    if (purchaseCount.count > 0) {
      return res.status(400).json({
        error: `No se puede eliminar: ${purchaseCount.count} orden(es) de compra asociadas`,
      });
    }

    await db
      .delete(schema.suppliers)
      .where(
        and(
          eq(schema.suppliers.id, id),
          eq(schema.suppliers.storeId, user.storeId)
        )
      );

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting supplier:', error);
    res.status(500).json({ error: 'Error al eliminar proveedor' });
  }
});

// ================================
// ÓRDENES DE COMPRA (PURCHASE ORDERS)
// ================================

// GET - Obtener todas las órdenes de compra
router.get('/purchase-orders', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const { status, fromDate, toDate, supplierId, warehouseId: warehouseIdParam } = req.query;
    const db = await getTenantDb(user.storeId);

    const ADMIN_ROLES = ['admin', 'super_admin'];
    const isAdmin = ADMIN_ROLES.includes(user.role || '');
    // Resolver almacén a filtrar
    const resolvedWarehouseId = isAdmin
      ? (warehouseIdParam ? parseInt(warehouseIdParam as string) : null)
      : (user.warehouseId ?? null);

    let query = db
      .select({
        // Campos de purchase order
        id: schema.purchaseOrders.id,
        purchaseNumber: schema.purchaseOrders.purchaseNumber,
        supplierId: schema.purchaseOrders.supplierId,
        supplierName: schema.purchaseOrders.supplierName,
        orderDate: schema.purchaseOrders.orderDate,
        expectedDeliveryDate: schema.purchaseOrders.expectedDeliveryDate,
        receivedDate: schema.purchaseOrders.receivedDate,
        status: schema.purchaseOrders.status,
        totalAmount: schema.purchaseOrders.totalAmount,
        currency: schema.purchaseOrders.currency,
        paymentStatus: schema.purchaseOrders.paymentStatus,
        invoiceNumber: schema.purchaseOrders.invoiceNumber,
        notes: schema.purchaseOrders.notes,
        createdAt: schema.purchaseOrders.createdAt,
        warehouseId: schema.purchaseOrders.warehouseId,

        // Datos del proveedor
        supplier: {
          id: schema.suppliers.id,
          name: schema.suppliers.name,
          phone: schema.suppliers.phone,
        },
      })
      .from(schema.purchaseOrders)
      .leftJoin(
        schema.suppliers,
        eq(schema.purchaseOrders.supplierId, schema.suppliers.id)
      );

    // Aplicar filtros
    const conditions = [eq(schema.purchaseOrders.storeId, user.storeId)];

    if (resolvedWarehouseId) {
      conditions.push(eq(schema.purchaseOrders.warehouseId, resolvedWarehouseId));
    }
    if (status) {
      conditions.push(eq(schema.purchaseOrders.status, status as string));
    }
    if (supplierId) {
      conditions.push(eq(schema.purchaseOrders.supplierId, parseInt(supplierId as string)));
    }
    if (fromDate) {
      conditions.push(gte(schema.purchaseOrders.orderDate, new Date(fromDate as string)));
    }
    if (toDate) {
      conditions.push(lte(schema.purchaseOrders.orderDate, new Date(toDate as string)));
    }

    const purchaseOrders = await query
      .where(and(...conditions))
      .orderBy(desc(schema.purchaseOrders.orderDate));

    res.json(purchaseOrders);
  } catch (error) {
    console.error('Error fetching purchase orders:', error);
    res.status(500).json({ error: 'Error al obtener órdenes de compra' });
  }
});

// GET - Obtener una orden de compra por ID con items
router.get('/purchase-orders/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const id = parseInt(req.params.id);
    const db = await getTenantDb(user.storeId);

    // Obtener la orden
    const [purchaseOrder] = await db
      .select()
      .from(schema.purchaseOrders)
      .where(
        and(
          eq(schema.purchaseOrders.id, id),
          eq(schema.purchaseOrders.storeId, user.storeId)
        )
      )
      .limit(1);

    if (!purchaseOrder) {
      return res.status(404).json({ error: 'Orden de compra no encontrada' });
    }

    // Obtener los items
    const items = await db
      .select()
      .from(schema.purchaseOrderItems)
      .where(eq(schema.purchaseOrderItems.purchaseOrderId, id))
      .orderBy(schema.purchaseOrderItems.id);

    // Obtener el proveedor si existe
    let supplier = null;
    if (purchaseOrder.supplierId) {
      [supplier] = await db
        .select()
        .from(schema.suppliers)
        .where(eq(schema.suppliers.id, purchaseOrder.supplierId))
        .limit(1);
    }

    res.json({
      ...purchaseOrder,
      supplier,
      items,
    });
  } catch (error) {
    console.error('Error fetching purchase order:', error);
    res.status(500).json({ error: 'Error al obtener orden de compra' });
  }
});

// POST - Crear orden de compra
//
// Delegado al servicio de compras: numera la orden (el número es obligatorio y
// antes nadie lo generaba), fija el almacén en cada línea y la asocia a la
// empresa activa, que es la que contabilizará sus recepciones.
router.post('/purchase-orders', authenticateToken, async (req: any, res: any) => {
  try {
    const { items, ...orderData } = req.body;
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'La orden debe tener al menos un producto' });
    }
    const user = req.user as AuthUser;
    const created = await withLegacyCompany(req, async (c, ctx) => {
      let warehouseId = Number(orderData.warehouseId ?? user.warehouseId ?? 0);
      if (!warehouseId) {
        const w = await c.query(
          `SELECT id FROM warehouses WHERE store_id=$1 AND is_active AND (company_id IS NULL OR company_id=$2)
            ORDER BY is_default DESC, id LIMIT 1`,
          [ctx.storeId, ctx.companyId],
        );
        warehouseId = Number(w.rows[0]?.id ?? 0);
      }
      if (!warehouseId) throw new LegacyBridgeError('Seleccione el almacén que recibirá la mercancía', 400);
      const po = await createPurchaseOrder(c, {
        companyId: ctx.companyId,
        storeId: ctx.storeId,
        userId: ctx.userId,
        supplierId: orderData.supplierId ? Number(orderData.supplierId) : undefined,
        warehouseId,
        orderDate: dateOnly(orderData.orderDate) ?? new Date().toISOString().slice(0, 10),
        expectedDate: dateOnly(orderData.expectedDeliveryDate) ?? undefined,
        currency: orderData.currency,
        paymentTerms: orderData.paymentTerms,
        notes: orderData.notes,
        items: items.map((i: any) => ({
          productId: Number(i.productId),
          productName: i.productName,
          quantity: String(i.quantity),
          unitCost: String(i.unitCost),
          discountRate: i.discountRate != null ? String(i.discountRate) : undefined,
          taxRate: i.taxRate != null ? String(i.taxRate) : undefined,
          sku: i.sku ?? undefined,
          notes: i.notes ?? undefined,
        })),
      });
      const approval = await submitPurchaseOrder(c, {
        companyId: ctx.companyId, storeId: ctx.storeId, purchaseOrderId: po.id, userId: ctx.userId,
      });
      const row = await c.query(`SELECT * FROM purchase_orders WHERE id=$1`, [po.id]);
      const lines = await c.query(`SELECT * FROM purchase_order_items WHERE purchase_order_id=$1 ORDER BY id`, [po.id]);
      return { ...row.rows[0], items: lines.rows, approval };
    });
    res.status(201).json(created);
  } catch (error) {
    sendLegacyError(res, error, 'Error al crear orden de compra');
  }
});

// PUT - Actualizar orden de compra
router.put('/purchase-orders/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const id = parseInt(req.params.id);
    const { items, ...orderData } = req.body;

    // Asegurar que storeId sea un número
    const storeId = typeof user.storeId === 'string' ? parseInt(user.storeId, 10) : user.storeId;
    const db = await getTenantDb(storeId);

    // Convertir fechas si existen
    const updateData: any = { ...orderData, updatedAt: new Date() };
    if (orderData.orderDate) {
      updateData.orderDate = new Date(orderData.orderDate);
    }
    if (orderData.expectedDeliveryDate) {
      updateData.expectedDeliveryDate = new Date(orderData.expectedDeliveryDate);
    }
    if (orderData.receivedDate) {
      updateData.receivedDate = new Date(orderData.receivedDate);
    }

    // Actualizar la orden
    const [purchaseOrder] = await db
      .update(schema.purchaseOrders)
      .set(updateData)
      .where(
        and(
          eq(schema.purchaseOrders.id, id),
          eq(schema.purchaseOrders.storeId, storeId)
        )
      )
      .returning();

    if (!purchaseOrder) {
      return res.status(404).json({ error: 'Orden de compra no encontrada' });
    }

    // Si hay items, eliminar los anteriores y crear los nuevos
    if (items) {
      await db
        .delete(schema.purchaseOrderItems)
        .where(eq(schema.purchaseOrderItems.purchaseOrderId, id));

      const itemsToInsert = items.map((item: any) => ({
        purchaseOrderId: id,
        storeId: storeId,
        productId: item.productId || null,
        productName: item.productName, // Campo obligatorio
        sku: item.sku || null,
        barcode: item.barcode || null,
        quantity: item.quantity,
        quantityReceived: item.quantityReceived || "0.00",
        unitId: item.unitId || null,
        lotNumber: item.lotNumber || null,
        expirationDate: item.expirationDate ? new Date(item.expirationDate) : null,
        manufacturingDate: item.manufacturingDate ? new Date(item.manufacturingDate) : null,
        unitCost: item.unitCost,
        taxRate: item.taxRate || "0.00",
        discountRate: item.discountRate || "0.00",
        totalCost: item.totalCost,
        notes: item.notes || null,
      }));

      await db
        .insert(schema.purchaseOrderItems)
        .values(itemsToInsert);
    }

    // Obtener la orden actualizada con items
    const updatedItems = await db
      .select()
      .from(schema.purchaseOrderItems)
      .where(eq(schema.purchaseOrderItems.purchaseOrderId, id));

    res.json({
      ...purchaseOrder,
      items: updatedItems,
    });
  } catch (error) {
    console.error('Error updating purchase order:', error);
    res.status(500).json({ error: 'Error al actualizar orden de compra' });
  }
});

// DELETE - Eliminar orden de compra
router.delete('/purchase-orders/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const id = parseInt(req.params.id);
    const db = await getTenantDb(user.storeId);

    await db
      .delete(schema.purchaseOrders)
      .where(
        and(
          eq(schema.purchaseOrders.id, id),
          eq(schema.purchaseOrders.storeId, user.storeId)
        )
      );

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting purchase order:', error);
    res.status(500).json({ error: 'Error al eliminar orden de compra' });
  }
});

// POST - Recepción rápida: recibe todo lo pendiente de la orden
//
// Antes sólo cambiaba el estado a "recibida" sin mover inventario. Ahora recibe
// cada línea por lo que falta, con el mismo servicio que la recepción detallada.
router.post('/purchase-orders/:id/receive', authenticateToken, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    const receiptDate = dateOnly(req.body?.date) ?? new Date().toISOString().slice(0, 10);
    const result = await withLegacyCompany(req, async (c, ctx) => {
      const pending = await c.query(
        `SELECT i.id, i.quantity - coalesce((
                  SELECT sum(l.quantity) FROM purchase_receipt_lines l JOIN purchase_receipts r ON r.id=l.receipt_id
                   WHERE l.purchase_order_item_id=i.id AND r.status='posted'), 0) AS pending
           FROM purchase_order_items i JOIN purchase_orders po ON po.id=i.purchase_order_id
          WHERE i.purchase_order_id=$1 AND po.store_id=$2`,
        [id, ctx.storeId],
      );
      const lines = pending.rows
        .filter((r: any) => Number(r.pending) > 0)
        .map((r: any) => ({ purchaseOrderItemId: Number(r.id), quantity: String(r.pending) }));
      if (lines.length === 0) throw new LegacyBridgeError('La orden no tiene cantidades pendientes', 400);
      return receivePurchaseOrder(c, { companyId: ctx.companyId, purchaseOrderId: id, date: receiptDate, userId: ctx.userId, lines });
    });
    res.json({ success: true, ...result });
  } catch (error) {
    sendLegacyError(res, error, 'Error al recibir orden de compra');
  }
});

// POST - Recibir items de orden de compra con trazabilidad
//
// La pantalla envía por línea la cantidad recibida ACUMULADA (pre-llena lo ya
// recibido). El servidor la convierte en lo que llega en esta entrega — la
// diferencia contra lo ya registrado — y la recibe con el servicio de compras:
// entra al inventario valorado al costo de la orden, se ubica en el almacén,
// mueve todas las vistas del stock y contabiliza Dr Inventario / Cr Recepciones
// por facturar. Antes se sumaba la cifra completa otra vez y una segunda
// recepción parcial contaba la primera dos veces.
router.post('/purchase-orders/:id/receive-items', authenticateToken, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    const { items, status: newStatus, closureNote, date } = req.body;
    const receiptDate = dateOnly(date) ?? new Date().toISOString().slice(0, 10);

    const result = await withLegacyCompany(req, async (c, ctx) => {
      const po = await c.query(`SELECT id, store_id, notes FROM purchase_orders WHERE id=$1`, [id]);
      if (po.rows.length === 0 || Number(po.rows[0].store_id) !== ctx.storeId) {
        throw new LegacyBridgeError('Orden de compra no encontrada', 404);
      }
      const lines = [];
      for (const item of (items ?? []) as any[]) {
        if (!item.id) {
          throw new LegacyBridgeError(
            `"${item.productName ?? 'producto'}" no está en la orden: agréguelo a la orden antes de recibirlo`, 400,
          );
        }
        const current = await c.query(
          `SELECT coalesce(sum(l.quantity),0)::text AS q
             FROM purchase_receipt_lines l JOIN purchase_receipts r ON r.id=l.receipt_id
            WHERE l.purchase_order_item_id=$1 AND r.status='posted'`,
          [item.id],
        );
        const delta = Number(item.quantityReceived ?? 0) - Number(current.rows[0].q);
        if (delta <= 0) continue;
        lines.push({
          purchaseOrderItemId: Number(item.id),
          quantity: String(delta),
          lotNo: item.lotNumber ?? undefined,
          expirationDate: dateOnly(item.expirationDate),
          locations: hasLocations(item) ? putawayLinesOf(item, delta) : undefined,
        });
      }
      if (lines.length === 0) throw new LegacyBridgeError('No hay cantidades nuevas por recibir', 400);
      const receipt = await receivePurchaseOrder(c, {
        companyId: ctx.companyId, purchaseOrderId: id, date: receiptDate, userId: ctx.userId,
        lines, notes: closureNote, closeShort: newStatus === 'received',
      });
      if (closureNote) {
        const existing = po.rows[0].notes || '';
        await c.query(`UPDATE purchase_orders SET notes=$2 WHERE id=$1`, [
          id, `${existing}${existing ? '\n\n---\n\n' : ''}${closureNote}`,
        ]);
      }
      return receipt;
    });

    res.json({ success: true, message: `Recepción ${result.receiptNo} registrada`, ...result });
  } catch (error) {
    sendLegacyError(res, error, 'Error al recibir items de la orden');
  }
});

/**
 * Un ítem puede llegar repartido en varias ubicaciones (`locations[]`) o entero
 * en una sola (`locationId`). La segunda forma es la que usa el 90% de las
 * recepciones y no vale la pena obligar a la pantalla a construir un arreglo
 * para una sola caja.
 */
const hasLocations = (item: any): boolean =>
  Boolean(item?.locationId) || (Array.isArray(item?.locations) && item.locations.length > 0);

function putawayLinesOf(item: any, quantityReceived: number) {
  if (Array.isArray(item.locations) && item.locations.length > 0) {
    return item.locations.map((l: any) => ({
      locationId: Number(l.locationId),
      quantity: String(l.quantity),
      lotNo: l.lotNo ?? item.lotNumber ?? null,
      expirationDate: dateOnly(l.expirationDate ?? item.expirationDate),
      status: l.status,
    }));
  }
  return [
    {
      locationId: Number(item.locationId),
      quantity: String(quantityReceived),
      lotNo: item.lotNumber ?? null,
      expirationDate: dateOnly(item.expirationDate),
    },
  ];
}

const dateOnly = (value: any): string | null =>
  value ? new Date(value).toISOString().slice(0, 10) : null;

// ================================
// MOVIMIENTOS DE INVENTARIO
// ================================

// GET - Obtener movimientos de inventario
router.get('/inventory-movements', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const { productId, type, fromDate, toDate, warehouseId: wIdParam } = req.query;
    const db = await getTenantDb(user.storeId);

    const ADMIN_ROLES_INV = ['admin', 'super_admin'];
    const isAdminInv = ADMIN_ROLES_INV.includes(user.role || '');
    const invWarehouseId = isAdminInv
      ? (wIdParam ? parseInt(wIdParam as string) : null)
      : (user.warehouseId ?? null);

    let query = db
      .select({
        // Movimiento
        id: schema.inventoryMovements.id,
        productId: schema.inventoryMovements.productId,
        type: schema.inventoryMovements.type,
        quantity: schema.inventoryMovements.quantity,
        unitId: schema.inventoryMovements.unitId, // Unidad en que se realizó el movimiento
        quantityBefore: schema.inventoryMovements.quantityBefore,
        quantityAfter: schema.inventoryMovements.quantityAfter,
        unitCost: schema.inventoryMovements.unitCost,
        totalCost: schema.inventoryMovements.totalCost,
        lotNumber: schema.inventoryMovements.lotNumber,
        expirationDate: schema.inventoryMovements.expirationDate,
        referenceType: schema.inventoryMovements.referenceType,
        referenceId: schema.inventoryMovements.referenceId,
        notes: schema.inventoryMovements.notes,
        reason: schema.inventoryMovements.reason,
        createdAt: schema.inventoryMovements.createdAt,

        // Producto
        productName: schema.products.name,
        productSku: schema.products.sku,
        productBarcode: schema.products.barcode,

        // Unidad de medida del movimiento
        unitSymbol: schema.measurementUnits.symbol,
        unitName: schema.measurementUnits.name,

        // Proveedor
        supplierId: schema.suppliers.id,
        supplierName: schema.suppliers.name,
      })
      .from(schema.inventoryMovements)
      .leftJoin(
        schema.products,
        eq(schema.inventoryMovements.productId, schema.products.id)
      )
      .leftJoin(
        schema.measurementUnits,
        eq(schema.inventoryMovements.unitId, schema.measurementUnits.id)
      )
      .leftJoin(
        schema.suppliers,
        eq(schema.inventoryMovements.supplierId, schema.suppliers.id)
      );

    const conditions = [eq(schema.inventoryMovements.storeId, user.storeId)];

    // Excluir movimientos de productos tipo servicio (no manejan stock)
    conditions.push(
      sql`(${schema.products.type} IS NULL OR ${schema.products.type} != 'service')`
    );

    if (invWarehouseId) {
      conditions.push(eq(schema.inventoryMovements.warehouseId, invWarehouseId));
    }

    if (productId) {
      conditions.push(eq(schema.inventoryMovements.productId, parseInt(productId as string)));
    }
    if (type) {
      conditions.push(eq(schema.inventoryMovements.type, type as string));
    }
    // Interpretar fechas en zona horaria dominicana (America/Santo_Domingo, UTC-4 sin DST)
    // para que el filtro coincida con el día local registrado por TZ del .env
    const DR_OFFSET = '-04:00';
    if (fromDate) {
      const from = new Date(`${String(fromDate).slice(0, 10)}T00:00:00.000${DR_OFFSET}`);
      if (!isNaN(from.getTime())) {
        conditions.push(gte(schema.inventoryMovements.createdAt, from));
      }
    }
    if (toDate) {
      const to = new Date(`${String(toDate).slice(0, 10)}T23:59:59.999${DR_OFFSET}`);
      if (!isNaN(to.getTime())) {
        conditions.push(lte(schema.inventoryMovements.createdAt, to));
      }
    }

    const movements = await query
      .where(and(...conditions))
      .orderBy(desc(schema.inventoryMovements.createdAt))
      .limit(500); // Limitar a últimos 500 movimientos

    res.json(movements);
  } catch (error) {
    console.error('Error fetching inventory movements:', error);
    res.status(500).json({ error: 'Error al obtener movimientos de inventario' });
  }
});

// GET - Obtener stock de productos por lote
router.get('/inventory-stock', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const db = await getTenantDb(user.storeId);

    // Obtener todos los movimientos con lote, producto y unidades
    // Excluir productos tipo servicio (no manejan inventario)
    const movements = await db
      .select({
        id: schema.inventoryMovements.id,
        productId: schema.inventoryMovements.productId,
        type: schema.inventoryMovements.type,
        quantity: schema.inventoryMovements.quantity,
        unitId: schema.inventoryMovements.unitId,
        lotNumber: schema.inventoryMovements.lotNumber,
        expirationDate: schema.inventoryMovements.expirationDate,
        createdAt: schema.inventoryMovements.createdAt,
        productName: schema.products.name,
        productSku: schema.products.sku,
        productBarcode: schema.products.barcode,
        productBaseUnitId: schema.products.baseUnitId,
      })
      .from(schema.inventoryMovements)
      .leftJoin(schema.products, eq(schema.inventoryMovements.productId, schema.products.id))
      .where(
        and(
          eq(schema.inventoryMovements.storeId, user.storeId),
          sql`(${schema.products.type} IS NULL OR ${schema.products.type} != 'service')`
        )
      )
      .orderBy(schema.inventoryMovements.id); // Ordenar por ID para FIFO

    // Obtener conversiones de unidades
    const conversions = await db
      .select()
      .from(schema.productUnitConversions)
      .where(eq(schema.productUnitConversions.storeId, user.storeId));

    // Obtener todas las unidades
    const units = await db
      .select()
      .from(schema.measurementUnits)
      .where(eq(schema.measurementUnits.storeId, user.storeId));

    const unitsMap = new Map(units.map(u => [u.id, u]));

    // Crear mapa de conversiones para acceso rápido
    const conversionMap = new Map<string, number>();
    conversions.forEach(c => {
      const key = `${c.productId}-${c.sourceUnitId}-${c.targetUnitId}`;
      conversionMap.set(key, parseFloat(c.conversionFactor));
    });

    // Función para convertir cantidad a unidad base
    const convertToBaseUnit = (productId: number, quantity: number, sourceUnitId: number | null, baseUnitId: number | null): number => {
      if (!sourceUnitId || !baseUnitId || sourceUnitId === baseUnitId) {
        return quantity; // No hay conversión necesaria
      }

      const conversionKey = `${productId}-${sourceUnitId}-${baseUnitId}`;
      const conversionFactor = conversionMap.get(conversionKey);

      if (conversionFactor) {
        return quantity * conversionFactor;
      }

      // Si no hay factor de conversión definido, retornar cantidad original
      return quantity;
    };

    // Calcular stock por producto y lote usando FIFO (en unidad base)
    const productStockMap = new Map<number, {
      productId: number;
      productName: string;
      sku: string | null;
      barcode: string | null;
      baseUnitId: number | null;
      baseUnitSymbol: string | null;
      totalStock: number; // En unidad base
      lots: Map<string, {
        lotNumber: string;
        stock: number; // En unidad base
        expirationDate: string | null;
        movements: { id: number; type: string; quantity: number; date: string }[];
      }>;
    }>();

    // Procesar movimientos
    movements.forEach((movement) => {
      if (!movement.productId) return;

      const productId = movement.productId;
      const lotNumber = movement.lotNumber || 'SIN_LOTE';
      const quantity = parseFloat(movement.quantity);
      const isInbound = movement.type === 'purchase' || movement.type === 'return' || movement.type === 'adjustment';

      // Convertir cantidad a unidad base
      const quantityInBaseUnit = convertToBaseUnit(
        productId,
        quantity,
        movement.unitId,
        movement.productBaseUnitId
      );

      // Inicializar producto si no existe
      if (!productStockMap.has(productId)) {
        const baseUnit = movement.productBaseUnitId ? unitsMap.get(movement.productBaseUnitId) : null;

        productStockMap.set(productId, {
          productId,
          productName: movement.productName || 'Producto sin nombre',
          sku: movement.productSku,
          barcode: movement.productBarcode,
          baseUnitId: movement.productBaseUnitId,
          baseUnitSymbol: baseUnit?.symbol || null,
          totalStock: 0,
          lots: new Map(),
        });
      }

      const productData = productStockMap.get(productId)!;

      // Inicializar lote si no existe
      if (!productData.lots.has(lotNumber)) {
        productData.lots.set(lotNumber, {
          lotNumber,
          stock: 0,
          expirationDate: movement.expirationDate,
          movements: [],
        });
      }

      const lotData = productData.lots.get(lotNumber)!;

      // Agregar movimiento al historial del lote
      lotData.movements.push({
        id: movement.id,
        type: movement.type,
        quantity: isInbound ? quantityInBaseUnit : -quantityInBaseUnit,
        date: movement.createdAt,
      });

      // Actualizar stock del lote (en unidad base)
      if (isInbound) {
        lotData.stock += quantityInBaseUnit;
        productData.totalStock += quantityInBaseUnit;
      } else {
        // Salida: descontar del stock del lote (FIFO ya está manejado por ordenamiento de ID)
        lotData.stock -= quantityInBaseUnit;
        productData.totalStock -= quantityInBaseUnit;
      }
    });

    // Convertir Map a Array y filtrar lotes con stock > 0
    const stockData = Array.from(productStockMap.values()).map(product => ({
      productId: product.productId,
      productName: product.productName,
      sku: product.sku,
      barcode: product.barcode,
      totalStock: product.totalStock, // En unidad base
      baseUnitId: product.baseUnitId,
      baseUnitSymbol: product.baseUnitSymbol,
      lotCount: Array.from(product.lots.values()).filter(lot => lot.stock > 0).length,
      lots: Array.from(product.lots.values())
        .filter(lot => lot.stock > 0)
        .map(lot => ({
          lotNumber: lot.lotNumber === 'SIN_LOTE' ? null : lot.lotNumber,
          quantity: lot.stock, // En unidad base
          expirationDate: lot.expirationDate,
        }))
        .sort((a, b) => {
          // Ordenar por fecha de vencimiento (más próxima primero)
          if (!a.expirationDate && !b.expirationDate) return 0;
          if (!a.expirationDate) return 1;
          if (!b.expirationDate) return -1;
          return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
        }),
    }))
    .filter(product => product.totalStock > 0) // Solo productos con stock
    .sort((a, b) => a.productName.localeCompare(b.productName));

    // Calcular información adicional (vencimiento próximo)
    const today = new Date();
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const enrichedData = stockData.map(product => {
      let nearestExpiration: string | null = null;
      let expiringQuantity = 0;

      product.lots.forEach(lot => {
        if (lot.expirationDate) {
          const expDate = new Date(lot.expirationDate);

          // Encontrar vencimiento más próximo
          if (!nearestExpiration || expDate < new Date(nearestExpiration)) {
            nearestExpiration = lot.expirationDate;
          }

          // Calcular cantidad a vencer en 30 días
          if (expDate <= thirtyDaysFromNow) {
            expiringQuantity += lot.quantity;
          }
        }
      });

      return {
        ...product,
        nearestExpiration,
        expiringQuantity,
      };
    });

    res.json(enrichedData);
  } catch (error) {
    console.error('Error fetching inventory stock:', error);
    res.status(500).json({ error: 'Error al obtener stock de inventario' });
  }
});

// GET - Estadísticas de compras
router.get('/purchase-stats', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const { warehouseId: statsWIdParam } = req.query;
    const db = await getTenantDb(user.storeId);

    const ADMIN_ROLES_STATS = ['admin', 'super_admin'];
    const isAdminStats = ADMIN_ROLES_STATS.includes(user.role || '');
    const statsWarehouseId = isAdminStats
      ? (statsWIdParam ? parseInt(statsWIdParam as string) : null)
      : (user.warehouseId ?? null);

    const baseConditions = [eq(schema.purchaseOrders.storeId, user.storeId)];
    if (statsWarehouseId) baseConditions.push(eq(schema.purchaseOrders.warehouseId, statsWarehouseId));

    // Total de órdenes
    const [totals] = await db
      .select({
        totalOrders: sql<number>`count(*)`,
        totalSpent: sql<string>`COALESCE(sum(${schema.purchaseOrders.totalAmount}), '0')`,
      })
      .from(schema.purchaseOrders)
      .where(and(...baseConditions));

    // Órdenes por estado
    const [pendingOrders] = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(schema.purchaseOrders)
      .where(and(...baseConditions, eq(schema.purchaseOrders.status, 'pending')));

    const [receivedOrders] = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(schema.purchaseOrders)
      .where(and(...baseConditions, eq(schema.purchaseOrders.status, 'received')));

    // Total gastado este mes
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);

    const [monthlyTotal] = await db
      .select({
        total: sql<string>`COALESCE(sum(${schema.purchaseOrders.totalAmount}), '0')`,
      })
      .from(schema.purchaseOrders)
      .where(and(...baseConditions, gte(schema.purchaseOrders.orderDate, firstDayOfMonth)));

    // Proveedores más usados
    const topSuppliers = await db
      .select({
        supplierId: schema.purchaseOrders.supplierId,
        supplierName: schema.purchaseOrders.supplierName,
        orderCount: sql<number>`count(*)`,
        totalSpent: sql<string>`COALESCE(sum(${schema.purchaseOrders.totalAmount}), '0')`,
      })
      .from(schema.purchaseOrders)
      .where(and(...baseConditions, not(isNull(schema.purchaseOrders.supplierId))))
      .groupBy(schema.purchaseOrders.supplierId, schema.purchaseOrders.supplierName)
      .orderBy(sql`count(*) DESC`)
      .limit(5);

    res.json({
      totalOrders: totals.totalOrders || 0,
      pendingOrders: pendingOrders?.count || 0,
      receivedOrders: receivedOrders?.count || 0,
      totalSpent: totals.totalSpent || '0',
      monthlySpending: monthlyTotal?.total || '0',
      topSuppliers: topSuppliers.map(s => ({
        supplierId: s.supplierId!,
        supplierName: s.supplierName!,
        totalSpent: s.totalSpent,
        orderCount: s.orderCount,
      })),
    });
  } catch (error) {
    console.error('Error fetching purchase stats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas de compras' });
  }
});

export default router;
