// server/routes/trip-routes.ts
import { Router } from 'express';
import express from 'express';
import { eq, and, or, desc, count, sql, gte, lte } from 'drizzle-orm';
import { authenticateToken } from '../authMiddleware';
import { getTenantStorage } from '../storage';
import { getTenantDb } from '../multi-tenant-db';
import * as schema from '../../shared/schema';
import { trips, orders, users, tripOrders } from '../../shared/schema';



const router = Router();

// Middleware para verificar roles
const requireRole = (allowedRoles: string[]) => {
  return (req: any, res: any, next: any) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    next();
  };
};

// Helper para obtener DB con manejo de storeId
async function getDb(storeId: string | number) {
  const id = typeof storeId === 'string' ? parseInt(storeId) : storeId;
  return await getTenantDb(id);
}

// Helper para validar ID
function validateId(id: string | undefined, paramName: string = 'ID'): number {
  if (!id) {
    throw new Error(`${paramName} no proporcionado`);
  }
  
  const numId = parseInt(id);
  
  if (isNaN(numId) || !Number.isInteger(numId) || numId <= 0) {
    throw new Error(`${paramName} inválido: ${id}`);
  }
  
  return numId;
}

// Funciones auxiliares
function generateQRCode(orderNumber: string, storeId: string | number): string {
  return `QR-${orderNumber}-${storeId}-${Date.now()}`;
}

function decodeQRCode(qrCode: string, storeId: string | number): number | null {
  try {
    const parts = qrCode.split('-');
    if (parts.length < 2) return null;
    
    const orderNumber = parts[1];
    return parseInt(orderNumber);
  } catch {
    return null;
  }
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
    
    // Formatear respuesta para el frontend
    const formattedTrips = trips.map(({ trip, user }) => ({
      ...trip,
      assignedUser: user
    }));
    
    res.json(formattedTrips);
  } catch (error) {
    console.error('Error fetching trips:', error);
    res.status(500).json({ error: 'Error al obtener viajes' });
  }
});

// ⚠️ IMPORTANTE: Esta ruta DEBE estar ANTES de /trips/:id
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
          eq(schema.trips.status, 'processing')
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

router.get('/trips/:id', authenticateToken, async (req, res) => {
  try {
    // ✅ VALIDACIÓN DEL ID
    const tripId = validateId(req.params.id, 'Trip ID');
    const db = await getDb(req.user.storeId);
    
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
      orders: tripOrders.map(to => {
  const orderAddr =
    to.order?.customerAddress ||
    to.order?.deliveryAddress ||
    [to.order?.customerSector, to.order?.customerMunicipality, to.order?.customerProvince]
      .filter(Boolean)
      .join(', ') ||
    null;

  return {
    id: to.tripOrder.id,
    orderId: to.tripOrder.orderId,
    orderNumber: to.order?.orderNumber,
    status: to.tripOrder.status,
    pickedAt: to.tripOrder.pickedAt,
    scannedQR: to.tripOrder.scannedQR,
    sequenceNumber: to.tripOrder.sequenceNumber,

    // 👇 Esto es lo que tu app necesita
    order: {
      customer: {
        name: to.customer?.name || 'Cliente',
        phone: to.customer?.phone || '',
        address: orderAddr,
      },
      totalAmount: to.order?.totalAmount || '0.00',
      deliveryAddress: to.order?.deliveryAddress || orderAddr,
      customerLocation: {
        province: to.order?.customerProvince || null,
        municipality: to.order?.customerMunicipality || null,
        sector: to.order?.customerSector || null,
        address: orderAddr,
        latitude: to.order?.customerLatitude || null,
        longitude: to.order?.customerLongitude || null,
      },
    },
  };
})
    });
  } catch (error) {
    console.error('Error fetching trip details:', error);
    if (error.message.includes('inválido')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Error al obtener detalles del viaje' });
  }
});

router.post('/trips', authenticateToken, async (req: any, res: any) => {
  try {
    const { orderId, assignedUserId } = req.body;
    const db = await getDb(req.user.storeId);
    
    const [trip] = await db
      .insert(schema.trips)
      .values({
        orderId,
        assignedUserId: assignedUserId || null,
        status: 'pending',
        storeId: parseInt(req.user.storeId),
        createdAt: new Date()
      })
      .returning();
    
    res.json(trip);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create trip' });
  }
});

// Endpoint para asignar orden a viaje (sin usuario asignado)
router.post('/trips/assign-order', authenticateToken, async (req: any, res: any) => {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ error: 'orderId es requerido' });
    }
    
    const db = await getDb(req.user.storeId);
    const storeId = parseInt(req.user.storeId);
    
    console.log(`🔍 [ASSIGN-ORDER] Buscando orden ${orderId} para store ${storeId}`);
    
    // 1. Verificar que la orden existe
    const [order] = await db
      .select()
      .from(schema.orders)
      .where(and(
        eq(schema.orders.id, orderId),
      ));
    
    if (!order) {
      console.error(`❌ [ASSIGN-ORDER] Orden ${orderId} no encontrada en store ${storeId}`);
      return res.status(404).json({ 
        error: 'Orden no encontrada',
        details: `No se encontró la orden ${orderId} en la tienda ${storeId}`,
        suggestion: 'Verifica que el ID de la orden sea correcto y pertenezca a tu tienda'
      });
    }
    
    console.log(`✅ [ASSIGN-ORDER] Orden encontrada: ${order.orderNumber || order.id}, status: ${order.status}, assignedUserId: ${order.assignedUserId}`);
    
    // 2. Verificar si ya está en un viaje
    if (order.tripId) {
      console.warn(`⚠️ [ASSIGN-ORDER] Orden ya está en viaje ${order.tripId}`);
      return res.status(400).json({ 
        error: 'Esta orden ya está asignada a un viaje',
        tripId: order.tripId,
        suggestion: 'La orden ya forma parte de un viaje existente'
      });
    }
    
    // 3. ⚠️ MODIFICACIÓN: Permitir órdenes 'pending' si no tienen usuario asignado
    // Las órdenes sin usuario pueden ir a viajes compartidos
    if (order.status === 'pending' && order.assignedUserId) {
      console.warn(`⚠️ [ASSIGN-ORDER] Orden pending con usuario asignado ${order.assignedUserId}`);
      return res.status(400).json({ 
        error: 'La orden debe estar confirmada antes de asignarla a un viaje',
        currentStatus: order.status,
        suggestion: 'Confirma la orden antes de agregarla al viaje'
      });
    }
    
    // Si la orden está pending sin usuario, la aceptamos para viajes compartidos
    if (order.status === 'pending' && !order.assignedUserId) {
      console.log(`ℹ️ [ASSIGN-ORDER] Orden pending sin usuario, será agregada a viaje compartido`);
    }
    
    // 4. Buscar viaje pendiente sin usuario asignado
    console.log(`🔍 [ASSIGN-ORDER] Buscando viaje pendiente sin usuario...`);
    let [trip] = await db
      .select()
      .from(schema.trips)
      .where(and(
        eq(schema.trips.storeId, storeId),
        eq(schema.trips.status, 'pending'),
        sql`${schema.trips.assignedUserId} IS NULL`
      ))
      .orderBy(desc(schema.trips.createdAt))
      .limit(1);
    
    // 5. Si no existe, crear viaje nuevo SIN usuario asignado
    if (!trip) {
      console.log(`📦 [ASSIGN-ORDER] No hay viaje compartido, creando nuevo...`);
      
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const [countResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.trips)
        .where(eq(schema.trips.storeId, storeId));
      
      const tripNumber = `TRIP-${today}-${String((countResult.count || 0) + 1).padStart(3, '0')}`;
      
      console.log(`✨ [ASSIGN-ORDER] Creando viaje ${tripNumber} sin usuario`);
      
      [trip] = await db
        .insert(schema.trips)
        .values({
          tripNumber,
          assignedUserId: null, // ⚠️ IMPORTANTE: Sin usuario asignado
          storeId,
          status: 'pending',
          totalOrders: 0,
          completedOrders: 0,
          totalAmount: '0',
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      console.log(`✅ [ASSIGN-ORDER] Viaje ${tripNumber} creado con ID ${trip.id}`);
    } else {
      console.log(`✅ [ASSIGN-ORDER] Usando viaje existente ${trip.tripNumber} (ID: ${trip.id})`);
    }
    
    // 6. Agregar orden al viaje
    console.log(`🔗 [ASSIGN-ORDER] Agregando orden ${order.id} al viaje ${trip.id}...`);
    
    await db
      .insert(schema.tripOrders)
      .values({
        tripId: trip.id,
        orderId: order.id,
        storeId,
        status: 'pending',
        sequenceNumber: trip.totalOrders + 1,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    
    // 7. Actualizar orden: tripId + cambiar estado si es necesario
    const newOrderStatus = order.status === 'pending' ? 'processing' : order.status;
    
    await db
      .update(schema.orders)
      .set({
        tripId: trip.id,
        status: newOrderStatus, // Confirmar si estaba pending
        updatedAt: new Date()
      })
      .where(eq(schema.orders.id, orderId));
    
    console.log(`✅ [ASSIGN-ORDER] Orden actualizada con tripId ${trip.id}, nuevo status: ${newOrderStatus}`);
    
    // 8. Actualizar contadores del viaje
    await updateTripProgress(db, trip.id);
    
    // 9. Obtener viaje actualizado
    const [updatedTrip] = await db
      .select()
      .from(schema.trips)
      .where(eq(schema.trips.id, trip.id));
    
    console.log(`✅ [ASSIGN-ORDER] Orden ${order.orderNumber || order.id} asignada a viaje ${trip.tripNumber}`);
    console.log(`📊 [ASSIGN-ORDER] Viaje ahora tiene ${updatedTrip.totalOrders} órdenes`);
    
    res.json({
      success: true,
      message: 'Orden asignada al viaje correctamente',
      tripId: trip.id,
      tripNumber: trip.tripNumber,
      orderStatus: newOrderStatus,
      trip: updatedTrip,
      info: {
        wasNewTrip: !trip.totalOrders,
        totalOrdersInTrip: updatedTrip.totalOrders,
        tripHasUser: !!updatedTrip.assignedUserId
      }
    });
    
  } catch (error) {
    console.error('❌ [ASSIGN-ORDER] Error asignando orden a viaje:', error);
    res.status(500).json({ 
      error: 'Error al asignar orden a viaje',
      details: error.message 
    });
  }
});

router.get('/trips/my-trips', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const storeId = req.user!.storeId;
    const { status, from, to } = req.query;
    
    const db = await getTenantDb(storeId);
    
    // Construir query con filtros opcionales
    let query = db
      .select({
        trip: trips,
        assignedUser: {
          id: users.id,
          name: users.name,
          role: users.role,
        },
      })
      .from(trips)
      .leftJoin(users, eq(trips.assignedUserId, users.id))
      .where(
        and(
          eq(trips.assignedUserId, userId),
          eq(trips.storeId, storeId)
        )
      );

    // Aplicar filtros
    const conditions = [
      eq(trips.assignedUserId, userId),
      eq(trips.storeId, storeId)
    ];

    if (status && status !== 'all') {
      conditions.push(eq(trips.status, status as string));
    }

    if (from) {
      conditions.push(gte(trips.createdAt, new Date(from as string)));
    }

    if (to) {
      conditions.push(lte(trips.createdAt, new Date(to as string)));
    }

    const results = await db
      .select({
        trip: trips,
        assignedUser: {
          id: users.id,
          name: users.name,
          role: users.role,
        },
      })
      .from(trips)
      .leftJoin(users, eq(trips.assignedUserId, users.id))
      .where(and(...conditions))
      .orderBy(desc(trips.createdAt));

    // Formatear respuesta
    const formattedTrips = results.map(r => ({
      ...r.trip,
      assignedUser: r.assignedUser,
    }));

    res.json(formattedTrips);
  } catch (error) {
    console.error('Error fetching my trips:', error);
    res.status(500).json({ error: 'Error al obtener viajes' });
  }
});


router.post('/trips/:id/send', authenticateToken, requireRole(['admin', 'sales_rep']), async (req, res) => {
  try {
    // ✅ VALIDACIÓN DEL ID
    const tripId = validateId(req.params.id, 'Trip ID');
    const db = await getDb(req.user.storeId);
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
    if (error.message.includes('inválido')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Error al enviar viaje' });
  }
});

router.post('/trips/:id/scan-order', authenticateToken, async (req, res) => {
  try {
    // ✅ VALIDACIÓN DEL ID
    const tripId = validateId(req.params.id, 'Trip ID');
    const db = await getDb(req.user.storeId);
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
        .set({ status: 'processing', startedAt: new Date(), updatedAt: new Date() })
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
    if (error.message.includes('inválido')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Error al escanear pedido' });
  }
});

router.post('/trips/:id/mark-order', authenticateToken, async (req, res) => {
  try {
    // ✅ VALIDACIÓN DEL ID
    const tripId = validateId(req.params.id, 'Trip ID');
    const db = await getDb(req.user.storeId);
    const { orderId, notes } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ error: 'Order ID requerido' });
    }
    
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
        .set({ status: 'processing', startedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.trips.id, tripId));
    }
    
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
    
    res.json({
      success: true,
      order: { orderNumber: order?.orderNumber, status: 'picked' },
    });
  } catch (error) {
    console.error('Error marking order:', error);
    if (error.message.includes('inválido')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Error al marcar pedido' });
  }
});

router.post('/trips/:id/complete', authenticateToken, async (req, res) => {
  try {
    // ✅ VALIDACIÓN DEL ID
    const tripId = validateId(req.params.id, 'Trip ID');
    const db = await getDb(req.user.storeId);
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
      ? Math.floor((new Date().getTime() - new Date(trip.startedAt).getTime()) / 60000)
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
    
    // Actualizar estado de órdenes a 'picked_up'
    const tripOrders = await db
      .select({ orderId: schema.tripOrders.orderId })
      .from(schema.tripOrders)
      .where(eq(schema.tripOrders.tripId, tripId));
    
    for (const to of tripOrders) {
      await db
        .update(schema.orders)
        .set({ 
          status: 'picked_up',
          updatedAt: new Date()
        })
        .where(eq(schema.orders.id, to.orderId));
    }
    
    res.json({
      success: true,
      trip: {
        id: trip.id,
        tripNumber: trip.tripNumber,
        status: 'completed',
        completedAt: new Date(),
        actualDuration: duration
      }
    });
  } catch (error) {
    console.error('Error completing trip:', error);
    if (error.message.includes('inválido')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Error al completar viaje' });
  }
});
router.put('/trips/:id/update-sequence', authenticateToken, async (req, res) => {
  try {
    const tripId = validateId(req.params.id, 'Trip ID');
    const { orderIds } = req.body;
    const db = await getDb(req.user.storeId);

    // Validar que orderIds sea un array
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ 
        error: 'Se requiere un array de IDs de órdenes' 
      });
    }

    // Verificar que el viaje existe y pertenece a la tienda
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

    // Actualizar la secuencia de cada orden
    const updatePromises = orderIds.map((orderId, index) => {
      return db
        .update(schema.tripOrders)
        .set({ 
          sequenceNumber: index + 1,
          updatedAt: new Date()
        })
        .where(and(
          eq(schema.tripOrders.tripId, tripId),
          eq(schema.tripOrders.id, orderId)
        ));
    });

    await Promise.all(updatePromises);

    console.log(`✅ Secuencia actualizada para viaje ${tripId}`);

    res.json({ 
      success: true,
      message: 'Secuencia de pedidos actualizada correctamente'
    });

  } catch (error) {
    console.error('❌ Error actualizando secuencia:', error);
    res.status(500).json({ 
      error: 'Error al actualizar la secuencia de pedidos',
      details: error.message 
    });
  }
});

router.delete('/trips/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const tripId = validateId(req.params.id, 'Trip ID');
    const db = await getDb(req.user.storeId);
    
    const [trip] = await db
      .select()
      .from(schema.trips)
      .where(eq(schema.trips.id, tripId));
    
    if (!trip) {
      return res.status(404).json({ error: 'Viaje no encontrado' });
    }
    
    // No permitir eliminar viajes en progreso
    if (trip.status === 'processing') {
      return res.status(400).json({ 
        error: 'No se puede eliminar un viaje en progreso'
      });
    }
    
    // 1. Obtener las órdenes del viaje
    const tripOrdersList = await db
      .select({ orderId: schema.tripOrders.orderId })
      .from(schema.tripOrders)
      .where(eq(schema.tripOrders.tripId, tripId));
    
    const orderIds = tripOrdersList.map(to => to.orderId);
    
    // 2. Limpiar tripId de las órdenes
    if (orderIds.length > 0) {
      for (const orderId of orderIds) {
        await db
          .update(schema.orders)
          .set({ tripId: null })
          .where(eq(schema.orders.id, orderId));
      }
    }
    
    // 3. Eliminar trip_orders
    await db
      .delete(schema.tripOrders)
      .where(eq(schema.tripOrders.tripId, tripId));
    
    // 4. Eliminar trip
    await db
      .delete(schema.trips)
      .where(eq(schema.trips.id, tripId));
    
    console.log(`✅ Viaje ${trip.tripNumber} eliminado (${orderIds.length} órdenes liberadas)`);
    
    res.json({ 
      success: true, 
      message: 'Viaje eliminado correctamente',
      ordersReleased: orderIds.length
    });
  } catch (error) {
    console.error('Error deleting trip:', error);
    if (error.message.includes('inválido')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Error al eliminar viaje' });
  }
});

router.patch(
  '/trips/:id/reassign',
  authenticateToken,
  requireRole(['admin', 'sales']),
  async (req, res) => {
    try {
      const tripId = parseInt(req.params.id);
      const { newUserId, reason } = req.body;

      // Validación básica
      if (!newUserId) {
        return res.status(400).json({ 
          error: 'newUserId es requerido' 
        });
      }

      const storeId = req.user!.storeId;
      const db = await getTenantDb(storeId);

      // 1. Verificar que el viaje existe
      const [trip] = await db
        .select()
        .from(trips)
        .where(and(
          eq(trips.id, tripId),
          eq(trips.storeId, storeId)
        ));

      if (!trip) {
        return res.status(404).json({ 
          error: 'Viaje no encontrado' 
        });
      }

      // 2. Verificar que el nuevo usuario existe y es delivery/technician
      const [newUser] = await db
        .select({
          id: users.id,
          name: users.name,
          role: users.role
        })
        .from(users)
        .where(and(
          eq(users.id, newUserId),
       
        ));

      if (!newUser) {
        return res.status(404).json({ 
          error: 'Usuario no encontrado' 
        });
      }

      if (newUser.role !== 'delivery' && newUser.role !== 'technician') {
        return res.status(400).json({ 
          error: 'El usuario debe ser delivery o technician' 
        });
      }

      // 3. Verificar que el viaje no esté completado o cancelado
      if (trip.status === 'completed' || trip.status === 'cancelled') {
        return res.status(400).json({ 
          error: `No se puede reasignar un viaje ${trip.status}` 
        });
      }

      // 4. Obtener todas las órdenes del viaje
      const tripOrdersList = await db
        .select({
          orderId: tripOrders.orderId
        })
        .from(tripOrders)
        .where(eq(tripOrders.tripId, tripId));

      const orderIds = tripOrdersList.map(to => to.orderId);

      // 5. Iniciar transacción para actualizar todo
      await db.transaction(async (tx) => {
        // Actualizar el viaje
        await tx
          .update(trips)
          .set({
            assignedUserId: newUserId,
            updatedAt: new Date(),
            notes: trip.notes 
              ? `${trip.notes}\n[Reasignado a ${newUser.name}] ${reason || ''}`
              : `[Reasignado a ${newUser.name}] ${reason || ''}`
          })
          .where(eq(trips.id, tripId));

        // Actualizar todas las órdenes relacionadas
        if (orderIds.length > 0) {
          for (const orderId of orderIds) {
            await tx
              .update(orders)
              .set({
                assignedUserId: newUserId,
                updatedAt: new Date()
              })
              .where(eq(orders.id, orderId));
          }
        }
      });

      // 6. Obtener el viaje actualizado con detalles
      const [updatedTrip] = await db
        .select({
          id: trips.id,
          tripNumber: trips.tripNumber,
          assignedUserId: trips.assignedUserId,
          assignedUser: {
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role
          },
          status: trips.status,
          totalOrders: trips.totalOrders,
          completedOrders: trips.completedOrders,
          totalAmount: trips.totalAmount,
          notes: trips.notes,
          updatedAt: trips.updatedAt
        })
        .from(trips)
        .leftJoin(users, eq(trips.assignedUserId, users.id))
        .where(eq(trips.id, tripId));

      console.log(`✅ Viaje ${trip.tripNumber} reasignado de usuario ${trip.assignedUserId} a ${newUserId}`);
      console.log(`   - ${orderIds.length} órdenes actualizadas`);

      res.json({
        success: true,
        message: `Viaje reasignado exitosamente a ${newUser.name}`,
        trip: updatedTrip,
        reassignment: {
          previousUserId: trip.assignedUserId,
          newUserId: newUserId,
          ordersUpdated: orderIds.length,
          reason: reason || null
        }
      });

    } catch (error) {
      console.error('❌ Error reasignando viaje:', error);
      res.status(500).json({ 
        error: 'Error al reasignar viaje',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/trips/:id/reassignment-candidates
 * Obtiene lista de usuarios válidos para reasignar un viaje
 */
router.get(
  '/trips/:id/reassignment-candidates',
  authenticateToken,
  requireRole(['admin', 'sales']),
  async (req, res) => {
    try {
      const tripId = parseInt(req.params.id);
      const storeId = req.user!.storeId;
      const db = await getTenantDb(storeId);

      // Verificar que el viaje existe
      const [trip] = await db
        .select()
        .from(trips)
        .where(and(
          eq(trips.id, tripId),
          eq(trips.storeId, storeId)
        ));

      if (!trip) {
        return res.status(404).json({ 
          error: 'Viaje no encontrado' 
        });
      }

      // Obtener todos los delivery/technician disponibles (excepto el actual)
      const candidates = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          phone: users.phone
        })
        .from(users)
        .where(and(
          eq(users.status, 'active')
        ));

      // Filtrar solo delivery y technician, excluyendo el actual
      const validCandidates = candidates.filter(
        u => (u.role === 'delivery' || u.role === 'technician') 
          && u.id !== trip.assignedUserId
      );

      res.json({
        currentUserId: trip.assignedUserId,
        candidates: validCandidates
      });

    } catch (error) {
      console.error('❌ Error obteniendo candidatos:', error);
      res.status(500).json({ 
        error: 'Error al obtener candidatos para reasignación' 
      });
    }
  }
);





export default router;