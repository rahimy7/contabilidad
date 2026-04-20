import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { authenticateToken } from '../authMiddleware';
import { getTenantDb } from '../multi-tenant-db';
import * as schema from '@shared/schema';
import type { AuthUser } from '@shared/auth';

const router = Router();

// ================================
// TITULARES
// ================================

// GET - Obtener todos los titulares
router.get('/appointment-titulares', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });
    const db = await getTenantDb(user.storeId);
    const titulares = await db
      .select()
      .from(schema.appointmentTitulares)
      .where(eq(schema.appointmentTitulares.storeId, user.storeId))
      .orderBy(schema.appointmentTitulares.name);
    res.json(titulares);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener titulares', details: error.message });
  }
});

// POST - Crear titular
router.post('/appointment-titulares', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });
    const validation = schema.insertAppointmentTitularSchema.safeParse({ ...req.body, storeId: user.storeId });
    if (!validation.success) return res.status(400).json({ error: 'Datos inválidos', details: validation.error.errors });
    const db = await getTenantDb(user.storeId);
    const [titular] = await db.insert(schema.appointmentTitulares).values({
      storeId: user.storeId,
      name: validation.data.name!,
      specialty: validation.data.specialty || null,
      isActive: validation.data.isActive ?? true,
    }).returning();
    res.status(201).json(titular);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al crear titular', details: error.message });
  }
});

// PUT - Actualizar titular
router.put('/appointment-titulares/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
    const validation = schema.updateAppointmentTitularSchema.safeParse(req.body);
    if (!validation.success) return res.status(400).json({ error: 'Datos inválidos', details: validation.error.errors });
    const db = await getTenantDb(user.storeId);
    const [titular] = await db
      .update(schema.appointmentTitulares)
      .set({ ...validation.data, updatedAt: new Date() })
      .where(and(eq(schema.appointmentTitulares.id, id), eq(schema.appointmentTitulares.storeId, user.storeId)))
      .returning();
    if (!titular) return res.status(404).json({ error: 'Titular no encontrado' });
    res.json(titular);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al actualizar titular', details: error.message });
  }
});

// DELETE - Eliminar titular
router.delete('/appointment-titulares/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
    const db = await getTenantDb(user.storeId);
    const [deleted] = await db
      .delete(schema.appointmentTitulares)
      .where(and(eq(schema.appointmentTitulares.id, id), eq(schema.appointmentTitulares.storeId, user.storeId)))
      .returning();
    if (!deleted) return res.status(404).json({ error: 'Titular no encontrado' });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al eliminar titular', details: error.message });
  }
});

// ================================
// TIPOS DE SERVICIOS
// ================================

// GET - Obtener todos los tipos de servicio
router.get('/appointment-service-types', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });
    const db = await getTenantDb(user.storeId);
    const services = await db
      .select()
      .from(schema.appointmentServiceTypes)
      .where(eq(schema.appointmentServiceTypes.storeId, user.storeId))
      .orderBy(schema.appointmentServiceTypes.category, schema.appointmentServiceTypes.name);
    res.json(services);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener servicios', details: error.message });
  }
});

// POST - Crear tipo de servicio
router.post('/appointment-service-types', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });
    const validation = schema.insertAppointmentServiceTypeSchema.safeParse({ ...req.body, storeId: user.storeId });
    if (!validation.success) return res.status(400).json({ error: 'Datos inválidos', details: validation.error.errors });
    const db = await getTenantDb(user.storeId);
    const [service] = await db.insert(schema.appointmentServiceTypes).values({
      storeId: user.storeId,
      name: validation.data.name!,
      category: validation.data.category ?? 'general',
      description: validation.data.description || null,
      duration: validation.data.duration || null,
      basePrice: validation.data.basePrice || '0',
      priceType: validation.data.priceType || 'fixed',
      minPrice: validation.data.minPrice || null,
      maxPrice: validation.data.maxPrice || null,
      isActive: validation.data.isActive ?? true,
    }).returning();
    res.status(201).json(service);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al crear servicio', details: error.message });
  }
});

// PUT - Actualizar tipo de servicio
router.put('/appointment-service-types/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
    const validation = schema.updateAppointmentServiceTypeSchema.safeParse(req.body);
    if (!validation.success) return res.status(400).json({ error: 'Datos inválidos', details: validation.error.errors });
    const db = await getTenantDb(user.storeId);
    const [service] = await db
      .update(schema.appointmentServiceTypes)
      .set({ ...validation.data, updatedAt: new Date() })
      .where(and(eq(schema.appointmentServiceTypes.id, id), eq(schema.appointmentServiceTypes.storeId, user.storeId)))
      .returning();
    if (!service) return res.status(404).json({ error: 'Servicio no encontrado' });
    res.json(service);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al actualizar servicio', details: error.message });
  }
});

// DELETE - Eliminar tipo de servicio
router.delete('/appointment-service-types/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
    const db = await getTenantDb(user.storeId);
    const [deleted] = await db
      .delete(schema.appointmentServiceTypes)
      .where(and(eq(schema.appointmentServiceTypes.id, id), eq(schema.appointmentServiceTypes.storeId, user.storeId)))
      .returning();
    if (!deleted) return res.status(404).json({ error: 'Servicio no encontrado' });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al eliminar servicio', details: error.message });
  }
});

// ================================
// CITAS / APPOINTMENTS
// ================================

// GET - Obtener todas las citas (con datos del cliente)
router.get('/appointments', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const db = await getTenantDb(user.storeId);

    const { status, startDate, endDate } = req.query;

    let conditions = [eq(schema.appointments.storeId, user.storeId)];

    if (status && status !== 'all') {
      conditions.push(eq(schema.appointments.status, status as string));
    }
    if (startDate) {
      conditions.push(gte(schema.appointments.appointmentDate, new Date(startDate as string)));
    }
    if (endDate) {
      conditions.push(lte(schema.appointments.appointmentDate, new Date(endDate as string)));
    }

    const appointments = await db
      .select({
        id: schema.appointments.id,
        storeId: schema.appointments.storeId,
        customerId: schema.appointments.customerId,
        titularId: schema.appointments.titularId,
        serviceTypeId: schema.appointments.serviceTypeId,
        title: schema.appointments.title,
        description: schema.appointments.description,
        appointmentDate: schema.appointments.appointmentDate,
        appointmentEndDate: schema.appointments.appointmentEndDate,
        status: schema.appointments.status,
        price: schema.appointments.price,
        paymentStatus: schema.appointments.paymentStatus,
        paymentMethod: schema.appointments.paymentMethod,
        orderId: schema.appointments.orderId,
        notes: schema.appointments.notes,
        createdBy: schema.appointments.createdBy,
        createdAt: schema.appointments.createdAt,
        updatedAt: schema.appointments.updatedAt,
        customerName: schema.customers.name,
        customerPhone: schema.customers.phone,
        customerEmail: schema.customers.email,
        titularName: schema.appointmentTitulares.name,
        serviceTypeName: schema.appointmentServiceTypes.name,
        serviceTypeCategory: schema.appointmentServiceTypes.category,
      })
      .from(schema.appointments)
      .leftJoin(schema.customers, eq(schema.appointments.customerId, schema.customers.id))
      .leftJoin(schema.appointmentTitulares, eq(schema.appointments.titularId, schema.appointmentTitulares.id))
      .leftJoin(schema.appointmentServiceTypes, eq(schema.appointments.serviceTypeId, schema.appointmentServiceTypes.id))
      .where(and(...conditions))
      .orderBy(desc(schema.appointments.appointmentDate));

    res.json(appointments);
  } catch (error: any) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ error: 'Error al obtener citas', details: error.message });
  }
});

// GET - Obtener citas de un mes específico (para calendario)
router.get('/appointments/calendar/:year/:month', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Año o mes inválido' });
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const db = await getTenantDb(user.storeId);

    const appointments = await db
      .select({
        id: schema.appointments.id,
        customerId: schema.appointments.customerId,
        titularId: schema.appointments.titularId,
        serviceTypeId: schema.appointments.serviceTypeId,
        title: schema.appointments.title,
        appointmentDate: schema.appointments.appointmentDate,
        appointmentEndDate: schema.appointments.appointmentEndDate,
        status: schema.appointments.status,
        price: schema.appointments.price,
        paymentStatus: schema.appointments.paymentStatus,
        customerName: schema.customers.name,
        customerPhone: schema.customers.phone,
        titularName: schema.appointmentTitulares.name,
        serviceTypeName: schema.appointmentServiceTypes.name,
        serviceTypeCategory: schema.appointmentServiceTypes.category,
      })
      .from(schema.appointments)
      .leftJoin(schema.customers, eq(schema.appointments.customerId, schema.customers.id))
      .leftJoin(schema.appointmentTitulares, eq(schema.appointments.titularId, schema.appointmentTitulares.id))
      .leftJoin(schema.appointmentServiceTypes, eq(schema.appointments.serviceTypeId, schema.appointmentServiceTypes.id))
      .where(and(
        eq(schema.appointments.storeId, user.storeId),
        gte(schema.appointments.appointmentDate, startDate),
        lte(schema.appointments.appointmentDate, endDate),
      ))
      .orderBy(schema.appointments.appointmentDate);

    res.json(appointments);
  } catch (error: any) {
    console.error('Error fetching calendar appointments:', error);
    res.status(500).json({ error: 'Error al obtener citas del calendario', details: error.message });
  }
});

// GET - Obtener una cita por ID
router.get('/appointments/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const db = await getTenantDb(user.storeId);

    const [appointment] = await db
      .select({
        id: schema.appointments.id,
        storeId: schema.appointments.storeId,
        customerId: schema.appointments.customerId,
        titularId: schema.appointments.titularId,
        serviceTypeId: schema.appointments.serviceTypeId,
        title: schema.appointments.title,
        description: schema.appointments.description,
        appointmentDate: schema.appointments.appointmentDate,
        appointmentEndDate: schema.appointments.appointmentEndDate,
        status: schema.appointments.status,
        price: schema.appointments.price,
        paymentStatus: schema.appointments.paymentStatus,
        paymentMethod: schema.appointments.paymentMethod,
        orderId: schema.appointments.orderId,
        notes: schema.appointments.notes,
        createdBy: schema.appointments.createdBy,
        createdAt: schema.appointments.createdAt,
        updatedAt: schema.appointments.updatedAt,
        customerName: schema.customers.name,
        customerPhone: schema.customers.phone,
        customerEmail: schema.customers.email,
        titularName: schema.appointmentTitulares.name,
        serviceTypeName: schema.appointmentServiceTypes.name,
        serviceTypeCategory: schema.appointmentServiceTypes.category,
      })
      .from(schema.appointments)
      .leftJoin(schema.customers, eq(schema.appointments.customerId, schema.customers.id))
      .leftJoin(schema.appointmentTitulares, eq(schema.appointments.titularId, schema.appointmentTitulares.id))
      .leftJoin(schema.appointmentServiceTypes, eq(schema.appointments.serviceTypeId, schema.appointmentServiceTypes.id))
      .where(and(
        eq(schema.appointments.id, id),
        eq(schema.appointments.storeId, user.storeId),
      ));

    if (!appointment) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    res.json(appointment);
  } catch (error: any) {
    console.error('Error fetching appointment:', error);
    res.status(500).json({ error: 'Error al obtener cita', details: error.message });
  }
});

// POST - Crear nueva cita
router.post('/appointments', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const validation = schema.insertAppointmentSchema.safeParse({
      ...req.body,
      storeId: user.storeId,
      createdBy: user.id,
    });

    if (!validation.success) {
      return res.status(400).json({ error: 'Datos inválidos', details: validation.error.errors });
    }

    const db = await getTenantDb(user.storeId);

    const [appointment] = await db
      .insert(schema.appointments)
      .values({
        storeId: validation.data.storeId,
        customerId: validation.data.customerId,
        titularId: validation.data.titularId || null,
        serviceTypeId: validation.data.serviceTypeId || null,
        title: validation.data.title,
        description: validation.data.description || null,
        appointmentDate: new Date(validation.data.appointmentDate),
        appointmentEndDate: validation.data.appointmentEndDate ? new Date(validation.data.appointmentEndDate) : null,
        status: validation.data.status || 'scheduled',
        price: validation.data.price || '0',
        paymentStatus: validation.data.paymentStatus || 'pending',
        paymentMethod: validation.data.paymentMethod || null,
        orderId: validation.data.orderId || null,
        notes: validation.data.notes || null,
        createdBy: validation.data.createdBy || null,
      })
      .returning();

    res.status(201).json(appointment);
  } catch (error: any) {
    console.error('Error creating appointment:', error);
    res.status(500).json({ error: 'Error al crear cita', details: error.message });
  }
});

// PUT - Actualizar cita
router.put('/appointments/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const validation = schema.updateAppointmentSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ error: 'Datos inválidos', details: validation.error.errors });
    }

    const db = await getTenantDb(user.storeId);

    const updateData: any = {
      ...validation.data,
      updatedAt: new Date(),
    };

    if (validation.data.appointmentDate) {
      updateData.appointmentDate = new Date(validation.data.appointmentDate);
    }
    if (validation.data.appointmentEndDate) {
      updateData.appointmentEndDate = new Date(validation.data.appointmentEndDate);
    }

    const [appointment] = await db
      .update(schema.appointments)
      .set(updateData)
      .where(and(
        eq(schema.appointments.id, id),
        eq(schema.appointments.storeId, user.storeId),
      ))
      .returning();

    if (!appointment) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    res.json(appointment);
  } catch (error: any) {
    console.error('Error updating appointment:', error);
    res.status(500).json({ error: 'Error al actualizar cita', details: error.message });
  }
});

// DELETE - Eliminar cita
router.delete('/appointments/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const db = await getTenantDb(user.storeId);

    const [deleted] = await db
      .delete(schema.appointments)
      .where(and(
        eq(schema.appointments.id, id),
        eq(schema.appointments.storeId, user.storeId),
      ))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    res.json({ success: true, message: 'Cita eliminada exitosamente' });
  } catch (error: any) {
    console.error('Error deleting appointment:', error);
    res.status(500).json({ error: 'Error al eliminar cita', details: error.message });
  }
});

// ================================
// CITAS POR FECHA (para POS)
// ================================
router.get('/appointments/by-date/:date', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });
    const dateStr = req.params.date;
    const startOfDay = new Date(dateStr + 'T00:00:00');
    const endOfDay = new Date(dateStr + 'T23:59:59.999');
    const db = await getTenantDb(user.storeId);
    const appointments = await db
      .select({
        id: schema.appointments.id,
        storeId: schema.appointments.storeId,
        customerId: schema.appointments.customerId,
        titularId: schema.appointments.titularId,
        serviceTypeId: schema.appointments.serviceTypeId,
        title: schema.appointments.title,
        description: schema.appointments.description,
        appointmentDate: schema.appointments.appointmentDate,
        appointmentEndDate: schema.appointments.appointmentEndDate,
        status: schema.appointments.status,
        price: schema.appointments.price,
        paymentStatus: schema.appointments.paymentStatus,
        paymentMethod: schema.appointments.paymentMethod,
        orderId: schema.appointments.orderId,
        notes: schema.appointments.notes,
        createdAt: schema.appointments.createdAt,
        customerName: schema.customers.name,
        customerPhone: schema.customers.phone,
        titularName: schema.appointmentTitulares.name,
        serviceTypeName: schema.appointmentServiceTypes.name,
        serviceTypeCategory: schema.appointmentServiceTypes.category,
        serviceTypePrice: schema.appointmentServiceTypes.basePrice,
      })
      .from(schema.appointments)
      .leftJoin(schema.customers, eq(schema.appointments.customerId, schema.customers.id))
      .leftJoin(schema.appointmentTitulares, eq(schema.appointments.titularId, schema.appointmentTitulares.id))
      .leftJoin(schema.appointmentServiceTypes, eq(schema.appointments.serviceTypeId, schema.appointmentServiceTypes.id))
      .where(and(
        eq(schema.appointments.storeId, user.storeId),
        gte(schema.appointments.appointmentDate, startOfDay),
        lte(schema.appointments.appointmentDate, endOfDay),
      ))
      .orderBy(schema.appointments.appointmentDate);
    res.json(appointments);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener citas del día', details: error.message });
  }
});

// ================================
// CITAS POR TITULAR (para Doctor Dashboard)
// ================================
router.get('/appointments/titular/:titularId', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });
    const titularId = parseInt(req.params.titularId);
    if (isNaN(titularId)) return res.status(400).json({ error: 'ID de titular inválido' });
    const db = await getTenantDb(user.storeId);
    const { startDate, endDate } = req.query;
    let conditions = [
      eq(schema.appointments.storeId, user.storeId),
      eq(schema.appointments.titularId, titularId),
    ];
    if (startDate) conditions.push(gte(schema.appointments.appointmentDate, new Date(startDate as string)));
    if (endDate) conditions.push(lte(schema.appointments.appointmentDate, new Date(endDate as string)));
    const appointments = await db
      .select({
        id: schema.appointments.id,
        customerId: schema.appointments.customerId,
        titularId: schema.appointments.titularId,
        serviceTypeId: schema.appointments.serviceTypeId,
        title: schema.appointments.title,
        appointmentDate: schema.appointments.appointmentDate,
        appointmentEndDate: schema.appointments.appointmentEndDate,
        status: schema.appointments.status,
        price: schema.appointments.price,
        paymentStatus: schema.appointments.paymentStatus,
        notes: schema.appointments.notes,
        customerName: schema.customers.name,
        customerPhone: schema.customers.phone,
        serviceTypeName: schema.appointmentServiceTypes.name,
        serviceTypeCategory: schema.appointmentServiceTypes.category,
      })
      .from(schema.appointments)
      .leftJoin(schema.customers, eq(schema.appointments.customerId, schema.customers.id))
      .leftJoin(schema.appointmentServiceTypes, eq(schema.appointments.serviceTypeId, schema.appointmentServiceTypes.id))
      .where(and(...conditions))
      .orderBy(desc(schema.appointments.appointmentDate));
    res.json(appointments);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener citas del titular', details: error.message });
  }
});

// GET - Stats del titular
router.get('/appointments/titular/:titularId/stats', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });
    const titularId = parseInt(req.params.titularId);
    if (isNaN(titularId)) return res.status(400).json({ error: 'ID de titular inválido' });
    const db = await getTenantDb(user.storeId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const baseConditions = [
      eq(schema.appointments.storeId, user.storeId),
      eq(schema.appointments.titularId, titularId),
    ];
    // Total appointments
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.appointments)
      .where(and(...baseConditions));
    // Today's appointments
    const [todayResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.appointments)
      .where(and(...baseConditions, gte(schema.appointments.appointmentDate, today), lte(schema.appointments.appointmentDate, endOfToday)));
    // Revenue (paid appointments)
    const [revenueResult] = await db
      .select({ total: sql<string>`COALESCE(SUM(price::numeric), 0)::text` })
      .from(schema.appointments)
      .where(and(...baseConditions, eq(schema.appointments.paymentStatus, 'paid')));
    // Pending payment
    const [pendingResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.appointments)
      .where(and(...baseConditions, eq(schema.appointments.paymentStatus, 'pending')));
    res.json({
      totalAppointments: totalResult?.count || 0,
      todayAppointments: todayResult?.count || 0,
      totalRevenue: revenueResult?.total || '0',
      pendingPayment: pendingResult?.count || 0,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener estadísticas', details: error.message });
  }
});

export default router;
