import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, sql, gte, lte, isNull, not } from 'drizzle-orm';
import { authenticateToken } from '../authMiddleware';
import { getTenantDb } from '../multi-tenant-db';
import * as schema from '@shared/schema';
import type { AuthUser } from '@shared/auth';

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

    const { status, fromDate, toDate, supplierId } = req.query;
    const db = await getTenantDb(user.storeId);

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
      )
      .$dynamic();

    // Aplicar filtros
    const conditions = [eq(schema.purchaseOrders.storeId, user.storeId)];

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
router.post('/purchase-orders', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const { items, ...orderData } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'La orden debe tener al menos un producto' });
    }

    // Asegurar que storeId sea un número
    const storeId = typeof user.storeId === 'string' ? parseInt(user.storeId, 10) : user.storeId;
    const db = await getTenantDb(storeId);

    // Obtener nombre del proveedor si existe
    let supplierName = null;
    if (orderData.supplierId) {
      const [supplier] = await db
        .select({ name: schema.suppliers.name })
        .from(schema.suppliers)
        .where(eq(schema.suppliers.id, orderData.supplierId))
        .limit(1);
      supplierName = supplier?.name;
    }

    // Convertir fechas de string a Date
    const orderValues = {
      ...orderData,
      storeId: storeId,
      supplierName,
      createdBy: user.id,
      orderDate: orderData.orderDate ? new Date(orderData.orderDate) : new Date(),
      expectedDeliveryDate: orderData.expectedDeliveryDate ? new Date(orderData.expectedDeliveryDate) : null,
    };

    // Crear la orden de compra
    const [purchaseOrder] = await db
      .insert(schema.purchaseOrders)
      .values(orderValues)
      .returning();

    // Convertir fechas en items y asegurar que todos los campos necesarios estén presentes
    const itemsToInsert = items.map((item: any) => ({
      purchaseOrderId: purchaseOrder.id,
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

    const createdItems = await db
      .insert(schema.purchaseOrderItems)
      .values(itemsToInsert)
      .returning();

    res.status(201).json({
      ...purchaseOrder,
      items: createdItems,
    });
  } catch (error) {
    console.error('Error creating purchase order:', error);
    res.status(500).json({ error: 'Error al crear orden de compra' });
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

// POST - Marcar orden de compra como recibida (simple)
router.post('/purchase-orders/:id/receive', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const id = parseInt(req.params.id);
    const storeId = typeof user.storeId === 'string' ? parseInt(user.storeId, 10) : user.storeId;
    const db = await getTenantDb(storeId);

    // Actualizar estado a recibido
    const [purchaseOrder] = await db
      .update(schema.purchaseOrders)
      .set({
        status: 'received',
        receivedDate: new Date(),
        updatedAt: new Date(),
      })
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

    res.json(purchaseOrder);
  } catch (error) {
    console.error('Error receiving purchase order:', error);
    res.status(500).json({ error: 'Error al recibir orden de compra' });
  }
});

// POST - Recibir items de orden de compra con trazabilidad
router.post('/purchase-orders/:id/receive-items', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const id = parseInt(req.params.id);
    const { items, status: newStatus, closureNote } = req.body;
    const storeId = typeof user.storeId === 'string' ? parseInt(user.storeId, 10) : user.storeId;
    const db = await getTenantDb(storeId);

    // Obtener la orden actual
    const [currentOrder] = await db
      .select()
      .from(schema.purchaseOrders)
      .where(
        and(
          eq(schema.purchaseOrders.id, id),
          eq(schema.purchaseOrders.storeId, storeId)
        )
      )
      .limit(1);

    if (!currentOrder) {
      return res.status(404).json({ error: 'Orden de compra no encontrada' });
    }

    // Actualizar items
    for (const item of items) {
      const quantityReceived = parseFloat(item.quantityReceived) || 0;

      if (quantityReceived <= 0) continue;

      // Actualizar o crear item
      if (item.id) {
        // Update existing item
        await db
          .update(schema.purchaseOrderItems)
          .set({
            quantityReceived: item.quantityReceived,
            lotNumber: item.lotNumber,
            expirationDate: item.expirationDate ? new Date(item.expirationDate) : null,
            manufacturingDate: item.manufacturingDate ? new Date(item.manufacturingDate) : null,
          })
          .where(eq(schema.purchaseOrderItems.id, item.id));
      } else {
        // Insert new item (added during receiving)
        await db
          .insert(schema.purchaseOrderItems)
          .values({
            purchaseOrderId: id,
            storeId: storeId,
            productId: item.productId,
            productName: item.productName,
            sku: item.sku,
            barcode: item.barcode,
            quantity: item.quantity || "0",
            quantityReceived: item.quantityReceived,
            lotNumber: item.lotNumber,
            expirationDate: item.expirationDate ? new Date(item.expirationDate) : null,
            manufacturingDate: item.manufacturingDate ? new Date(item.manufacturingDate) : null,
            unitCost: item.unitCost,
            taxRate: item.taxRate || "0",
            discountRate: item.discountRate || "0",
            totalCost: item.totalCost,
            notes: item.notes,
          });
      }

      // Actualizar inventario del producto
      if (item.productId) {
        const [product] = await db
          .select()
          .from(schema.products)
          .where(eq(schema.products.id, item.productId))
          .limit(1);

        if (product) {
          const currentStock = parseFloat(product.stockQuantity?.toString() || '0');
          const newStock = currentStock + quantityReceived;

          await db
            .update(schema.products)
            .set({ stockQuantity: newStock })
            .where(eq(schema.products.id, item.productId));

          // Registrar movimiento de inventario
          await db
            .insert(schema.inventoryMovements)
            .values({
              storeId: storeId,
              productId: item.productId,
              type: 'purchase',
              quantity: quantityReceived.toString(),
              unitId: item.unitId || product.baseUnitId, // Usar unitId del item o la unidad base del producto
              quantityBefore: currentStock.toString(),
              quantityAfter: newStock.toString(),
              unitCost: item.unitCost,
              totalCost: (quantityReceived * parseFloat(item.unitCost)).toFixed(2),
              lotNumber: item.lotNumber,
              expirationDate: item.expirationDate ? new Date(item.expirationDate) : null,
              supplierId: currentOrder.supplierId,
              referenceType: 'purchase_order',
              referenceId: id.toString(),
              reason: `Recepción de orden de compra #${currentOrder.purchaseNumber}`,
              notes: item.notes,
              createdBy: user.id,
            });
        }
      }
    }

    // Actualizar estado de la orden
    const updateData: any = {
      status: newStatus || 'received',
      receivedDate: new Date(),
      updatedAt: new Date(),
    };

    // Si hay una nota de cierre, agregarla a las notas existentes
    if (closureNote) {
      const existingNotes = currentOrder.notes || '';
      const separator = existingNotes ? '\n\n---\n\n' : '';
      updateData.notes = `${existingNotes}${separator}${closureNote}`;
    }

    await db
      .update(schema.purchaseOrders)
      .set(updateData)
      .where(eq(schema.purchaseOrders.id, id));

    res.json({ success: true, message: 'Orden recibida exitosamente' });
  } catch (error) {
    console.error('Error receiving purchase order items:', error);
    res.status(500).json({ error: 'Error al recibir items de la orden' });
  }
});

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

    const { productId, type, fromDate, toDate } = req.query;
    const db = await getTenantDb(user.storeId);

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
      )
      .$dynamic();

    const conditions = [eq(schema.inventoryMovements.storeId, user.storeId)];

    if (productId) {
      conditions.push(eq(schema.inventoryMovements.productId, parseInt(productId as string)));
    }
    if (type) {
      conditions.push(eq(schema.inventoryMovements.type, type as string));
    }
    if (fromDate) {
      conditions.push(gte(schema.inventoryMovements.createdAt, new Date(fromDate as string)));
    }
    if (toDate) {
      conditions.push(lte(schema.inventoryMovements.createdAt, new Date(toDate as string)));
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
      .where(eq(schema.inventoryMovements.storeId, user.storeId))
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

    const db = await getTenantDb(user.storeId);

    // Total de órdenes
    const [totals] = await db
      .select({
        totalOrders: sql<number>`count(*)`,
        totalSpent: sql<string>`COALESCE(sum(${schema.purchaseOrders.totalAmount}), '0')`,
      })
      .from(schema.purchaseOrders)
      .where(eq(schema.purchaseOrders.storeId, user.storeId));

    // Órdenes por estado
    const [pendingOrders] = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(schema.purchaseOrders)
      .where(
        and(
          eq(schema.purchaseOrders.storeId, user.storeId),
          eq(schema.purchaseOrders.status, 'pending')
        )
      );

    const [receivedOrders] = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(schema.purchaseOrders)
      .where(
        and(
          eq(schema.purchaseOrders.storeId, user.storeId),
          eq(schema.purchaseOrders.status, 'received')
        )
      );

    // Total gastado este mes
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);

    const [monthlyTotal] = await db
      .select({
        total: sql<string>`COALESCE(sum(${schema.purchaseOrders.totalAmount}), '0')`,
      })
      .from(schema.purchaseOrders)
      .where(
        and(
          eq(schema.purchaseOrders.storeId, user.storeId),
          gte(schema.purchaseOrders.orderDate, firstDayOfMonth)
        )
      );

    // Proveedores más usados
    const topSuppliers = await db
      .select({
        supplierId: schema.purchaseOrders.supplierId,
        supplierName: schema.purchaseOrders.supplierName,
        orderCount: sql<number>`count(*)`,
        totalSpent: sql<string>`COALESCE(sum(${schema.purchaseOrders.totalAmount}), '0')`,
      })
      .from(schema.purchaseOrders)
      .where(
        and(
          eq(schema.purchaseOrders.storeId, user.storeId),
          not(isNull(schema.purchaseOrders.supplierId))
        )
      )
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
