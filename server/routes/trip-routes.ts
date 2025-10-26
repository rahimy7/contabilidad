// server/routes/trip-routes.ts
import express from 'express';
import { eq, and, or, desc, count, sql } from 'drizzle-orm';
import { authenticateToken } from '../authMiddleware';
import { getTenantStorage } from '../storage';
import { getTenantDb } from '../multi-tenant-db';
import * as schema from '../../shared/schema';

const router = express.Router();

const requireRole = (allowedRoles: string[]) => {
  return (req: any, res: any, next: any) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    next();
  };
};

// Helper para obtener la conexión directa de la BD
async function getDb(storeId: number | string) {
  const id = typeof storeId === 'string' ? parseInt(storeId) : storeId;
  return await getTenantDb(id);
}

// ==================== TRIPS CRUD ====================

router.get('/trips', authenticateToken, async (req, res) => {
  try {
    const db = await getDb(req.user.storeId);
    const { status, assignedUserId, startDate, endDate } = req.query;
    
    let filters: any[] = [eq(schema.trips.storeId, parseInt(req.user.storeId as any))];
    
    if (status) filters.push(eq(schema.trips.status, status as string));
    if (assignedUserId) filters.push(eq(schema.trips.assignedUserId, parseInt(assignedUserId as string)));
    if (startDate) filters.push(sql`${schema.trips.createdAt} >= ${startDate}`);
    if (endDate) filters.push(sql`${schema.trips.createdAt} <= ${endDate}`);
    
    const trips = await db
      .select({
        trip: schema.trips,
        user: {
          id: schema.users.id,
          name: schema.users.name,
          phone: schema.users.phone,
        }
      })
      .from(schema.trips)
      .leftJoin(schema.users, eq(schema.trips.assignedUserId, schema.users.id))
      .where(and(...filters))
      .orderBy(desc(schema.trips.createdAt));
    
    res.json(trips);
  } catch (error) {
    console.error('Error fetching trips:', error);
    res.status(500).json({ error: 'Error al obtener viajes' });
  }
});

router.get('/trips/:id', authenticateToken, async (req, res) => {
  try {
    const db = await getDb(req.user.storeId);
    const tripId = parseInt(req.params.id);
    
    const [trip] = await db
      .select()
      .from(schema.trips)
      .where(and(
        eq(schema.trips.id, tripId),
        eq(schema.trips.storeId, parseInt(req.user.storeId as any))
      ));
    
    if (!trip) {
      return res.status(404).json({ error: 'Viaje no encontrado' });
    }
    
    const [assignedUser] = await db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        phone: schema.users.phone,
      })
      .from(schema.users)
      .where(eq(schema.users.id, trip.assignedUserId));
    
    const tripOrders = await db
      .select({
        tripOrder: schema.tripOrders,
        order: schema.orders,
        customer: schema.customers,
      })
      .from(schema.tripOrders)
      .leftJoin(schema.orders, eq(schema.tripOrders.orderId, schema.orders.id))
      .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
      .where(eq(schema.tripOrders.tripId, tripId))
      .orderBy(schema.tripOrders.sequenceNumber);
    
    res.json({
      ...trip,
      assignedUser,
      orders: tripOrders.map(to => ({
        id: to.tripOrder.id,
        orderId: to.tripOrder.orderId,
        orderNumber: to.order?.orderNumber,
        status: to.tripOrder.status,
        pickedAt: to.tripOrder.pickedAt,
        scannedQR: to.tripOrder.scannedQR,
        sequenceNumber: to.tripOrder.sequenceNumber,
        order: {
          customer: to.customer ? {
            name: to.customer.name,
            phone: to.customer.phone,
            address: to.customer.address,
          } : null,
          totalAmount: to.order?.totalAmount,
        }
      }))
    });
  } catch (error) {
    console.error('Error fetching trip details:', error);
    res.status(500).json({ error: 'Error al obtener detalles del viaje' });
  }
});

router.get('/trips/my-active', authenticateToken, async (req, res) => {
  try {
    const db = await getDb(req.user.storeId);
    
    const [trip] = await db
      .select()
      .from(schema.trips)
      .where(and(
        eq(schema.trips.assignedUserId, req.user.id),
        eq(schema.trips.storeId, parseInt(req.user.storeId as any)),
        or(
          eq(schema.trips.status, 'active'),
          eq(schema.trips.status, 'in_progress')
        )
      ))
      .orderBy(desc(schema.trips.createdAt))
      .limit(1);
    
    if (!trip) {
      return res.json(null);
    }
    
    const tripOrders = await db
      .select({
        tripOrder: schema.tripOrders,
        order: schema.orders,
        customer: schema.customers,
      })
      .from(schema.tripOrders)
      .leftJoin(schema.orders, eq(schema.tripOrders.orderId, schema.orders.id))
      .leftJoin(schema.customers, eq(schema.orders.customerId, schema.customers.id))
      .where(eq(schema.tripOrders.tripId, trip.id))
      .orderBy(schema.tripOrders.sequenceNumber);
    
    res.json({
      ...trip,
      orders: tripOrders.map(to => ({
        id: to.tripOrder.id,
        orderNumber: to.order?.orderNumber,
        orderId: to.tripOrder.orderId,
        status: to.tripOrder.status,
        pickedAt: to.tripOrder.pickedAt,
        customer: to.customer ? {
          name: to.customer.name,
          phone: to.customer.phone,
          address: to.customer.address,
        } : null,
        totalAmount: to.order?.totalAmount,
        qrCode: generateQRCode(to.order?.orderNumber || '', req.user.storeId),
      }))
    });
  } catch (error) {
    console.error('Error fetching active trip:', error);
    res.status(500).json({ error: 'Error al obtener viaje activo' });
  }
});

router.post('/trips/:id/send', authenticateToken, requireRole(['admin', 'sales_rep']), async (req, res) => {
  try {
    const db = await getDb(req.user.storeId);
    const tripId = parseInt(req.params.id);
    const { notes } = req.body;
    
    // 1. Validar que existe y está pending
    const [trip] = await db
      .select()
      .from(schema.trips)
      .where(and(
        eq(schema.trips.id, tripId),
        eq(schema.trips.storeId, parseInt(req.user.storeId as any))
      ));
    
    if (!trip) {
      return res.status(404).json({ error: 'Viaje no encontrado' });
    }
    
    if (trip.status !== 'pending') {
      return res.status(400).json({ 
        error: 'Solo se pueden enviar viajes pendientes',
        currentStatus: trip.status 
      });
    }
    
    // 2. Obtener resumen
    const orders = await db
      .select({
        orderNumber: schema.orders.orderNumber,
        totalAmount: schema.orders.totalAmount,
      })
      .from(schema.tripOrders)
      .leftJoin(schema.orders, eq(schema.tripOrders.orderId, schema.orders.id))
      .where(eq(schema.tripOrders.tripId, tripId));
    
    // 3. Actualizar viaje
    await db
      .update(schema.trips)
      .set({ 
        status: 'active', 
        sentAt: new Date(),
        notes: notes || trip.notes,
        updatedAt: new Date()
      })
      .where(eq(schema.trips.id, tripId));
    
    // 4. TODO: Enviar notificación al delivery
    // await notifyDelivery(trip.assignedUserId, tripId);
    
    res.json({
      success: true,
      trip: {
        id: trip.id,
        tripNumber: trip.tripNumber,
        status: 'active',
        sentAt: new Date()
      },
      summary: {
        totalOrders: trip.totalOrders,
        totalAmount: trip.totalAmount,
        orders
      }
    });
  } catch (error) {
    console.error('Error sending trip:', error);
    res.status(500).json({ error: 'Error al enviar viaje' });
  }
});

router.post('/trips/:id/scan-order', authenticateToken, async (req, res) => {
  try {
    const db = await getDb(req.user.storeId);
    const tripId = parseInt(req.params.id);
    const { qrCode } = req.body;
    
    const orderId = decodeQRCode(qrCode, req.user.storeId);
    if (!orderId) {
      return res.status(400).json({ error: 'Código QR inválido' });
    }
    
    const [tripOrder] = await db
      .select()
      .from(schema.tripOrders)
      .where(and(
        eq(schema.tripOrders.tripId, tripId),
        eq(schema.tripOrders.orderId, orderId)
      ));
    
    if (!tripOrder) {
      return res.status(404).json({ error: 'Pedido no pertenece a este viaje' });
    }
    
    if (tripOrder.status === 'picked') {
      return res.status(400).json({ error: 'Pedido ya fue recogido' });
    }
    
    await db
      .update(schema.tripOrders)
      .set({
        status: 'picked',
        pickedAt: new Date(),
        scannedQR: true,
        updatedAt: new Date(),
      })
      .where(eq(schema.tripOrders.id, tripOrder.id));
    
    await updateTripProgress(db, tripId);
    
    const [trip] = await db.select().from(schema.trips).where(eq(schema.trips.id, tripId));
    
    if (trip?.status === 'active') {
      await db
        .update(schema.trips)
        .set({ status: 'in_progress', startedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.trips.id, tripId));
    }
    
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    const [updatedTrip] = await db
      .select({
        completedOrders: schema.trips.completedOrders,
        totalOrders: schema.trips.totalOrders,
      })
      .from(schema.trips)
      .where(eq(schema.trips.id, tripId));
    
    res.json({
      success: true,
      order: { orderNumber: order?.orderNumber, status: 'picked', pickedAt: new Date() },
      trip: updatedTrip,
    });
  } catch (error) {
    console.error('Error scanning order:', error);
    res.status(500).json({ error: 'Error al escanear pedido' });
  }
});

router.post('/trips/:id/mark-order', authenticateToken, async (req, res) => {
  try {
    const db = await getDb(req.user.storeId);
    const tripId = parseInt(req.params.id);
    const { orderId, notes } = req.body;
    
    const [tripOrder] = await db
      .select()
      .from(schema.tripOrders)
      .where(and(
        eq(schema.tripOrders.tripId, tripId),
        eq(schema.tripOrders.orderId, orderId)
      ));
    
    if (!tripOrder) {
      return res.status(404).json({ error: 'Pedido no encontrado en este viaje' });
    }
    
    if (tripOrder.status === 'picked') {
      return res.status(400).json({ error: 'Pedido ya fue recogido' });
    }
    
    await db
      .update(schema.tripOrders)
      .set({
        status: 'picked',
        pickedAt: new Date(),
        scannedQR: false,
        notes: notes || tripOrder.notes,
        updatedAt: new Date(),
      })
      .where(eq(schema.tripOrders.id, tripOrder.id));
    
    await updateTripProgress(db, tripId);
    
    const [trip] = await db.select().from(schema.trips).where(eq(schema.trips.id, tripId));
    
    if (trip?.status === 'active') {
      await db
        .update(schema.trips)
        .set({ status: 'in_progress', startedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.trips.id, tripId));
    }
    
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    
    res.json({
      success: true,
      order: { orderNumber: order?.orderNumber, status: 'picked' },
    });
  } catch (error) {
    console.error('Error marking order:', error);
    res.status(500).json({ error: 'Error al marcar pedido' });
  }
});

router.post('/trips/:id/complete', authenticateToken, async (req, res) => {
  try {
    const db = await getDb(req.user.storeId);
    const tripId = parseInt(req.params.id);
    const { notes } = req.body;
    
    const [trip] = await db
      .select()
      .from(schema.trips)
      .where(and(
        eq(schema.trips.id, tripId),
        eq(schema.trips.storeId, parseInt(req.user.storeId as any))
      ));
    
    if (!trip) {
      return res.status(404).json({ error: 'Viaje no encontrado' });
    }
    
    const [pendingOrders] = await db
      .select({ count: count() })
      .from(schema.tripOrders)
      .where(and(
        eq(schema.tripOrders.tripId, tripId),
        eq(schema.tripOrders.status, 'pending')
      ));
    
    if (pendingOrders.count > 0) {
      return res.status(400).json({ 
        error: 'Hay pedidos pendientes de recoger',
        pendingCount: pendingOrders.count 
      });
    }
    
    const duration = trip.startedAt 
      ? Math.floor((Date.now() - trip.startedAt.getTime()) / 60000) 
      : null;
    
    await db
      .update(schema.trips)
      .set({
        status: 'completed',
        completedAt: new Date(),
        actualDuration: duration,
        notes: notes || trip.notes,
        updatedAt: new Date(),
      })
      .where(eq(schema.trips.id, tripId));
    
    res.json({
      success: true,
      trip: { id: tripId, status: 'completed', completedAt: new Date(), actualDuration: duration },
    });
  } catch (error) {
    console.error('Error completing trip:', error);
    res.status(500).json({ error: 'Error al completar viaje' });
  }
});

router.get('/trips/stats', authenticateToken, requireRole(['admin', 'sales_rep']), async (req, res) => {
  try {
    const db = await getDb(req.user.storeId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [todayStats] = await db
      .select({
        total: count(),
        pending: count(sql`CASE WHEN status = 'pending' THEN 1 END`),
        active: count(sql`CASE WHEN status = 'active' THEN 1 END`),
        in_progress: count(sql`CASE WHEN status = 'in_progress' THEN 1 END`),
        completed: count(sql`CASE WHEN status = 'completed' THEN 1 END`),
      })
      .from(schema.trips)
      .where(and(
        eq(schema.trips.storeId, parseInt(req.user.storeId as any)),
        sql`${schema.trips.createdAt} >= ${today}`
      ));
    
    res.json({ today: todayStats });
  } catch (error) {
    console.error('Error fetching trip stats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// ==================== HELPERS ====================

async function updateTripProgress(db: any, tripId: number) {
  const [completedCount] = await db
    .select({ count: count() })
    .from(schema.tripOrders)
    .where(and(
      eq(schema.tripOrders.tripId, tripId),
      eq(schema.tripOrders.status, 'picked')
    ));
  
  await db
    .update(schema.trips)
    .set({ completedOrders: completedCount.count, updatedAt: new Date() })
    .where(eq(schema.trips.id, tripId));
}

function generateQRCode(orderNumber: string, storeId: number): string {
  return `QR-${orderNumber}-${storeId}-${Date.now()}`;
}

function decodeQRCode(qrCode: string, storeId: number): number | null {
  try {
    const parts = qrCode.split('-');
    if (parts.length < 4) return null;
    
    const qrStoreId = parseInt(parts[3]);
    if (qrStoreId !== storeId) return null;
    
    return parseInt(parts[2]);
  } catch {
    return null;
  }
}

export default router;