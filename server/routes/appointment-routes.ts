import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { authenticateToken } from '../authMiddleware';
import { getTenantDb } from '../multi-tenant-db';
import * as schema from '@shared/schema';
import type { AuthUser } from '@shared/auth';

const router = Router();

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
        title: schema.appointments.title,
        description: schema.appointments.description,
        appointmentDate: schema.appointments.appointmentDate,
        appointmentEndDate: schema.appointments.appointmentEndDate,
        status: schema.appointments.status,
        notes: schema.appointments.notes,
        createdBy: schema.appointments.createdBy,
        createdAt: schema.appointments.createdAt,
        updatedAt: schema.appointments.updatedAt,
        customerName: schema.customers.name,
        customerPhone: schema.customers.phone,
        customerEmail: schema.customers.email,
      })
      .from(schema.appointments)
      .leftJoin(schema.customers, eq(schema.appointments.customerId, schema.customers.id))
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
        title: schema.appointments.title,
        appointmentDate: schema.appointments.appointmentDate,
        appointmentEndDate: schema.appointments.appointmentEndDate,
        status: schema.appointments.status,
        customerName: schema.customers.name,
        customerPhone: schema.customers.phone,
      })
      .from(schema.appointments)
      .leftJoin(schema.customers, eq(schema.appointments.customerId, schema.customers.id))
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
        title: schema.appointments.title,
        description: schema.appointments.description,
        appointmentDate: schema.appointments.appointmentDate,
        appointmentEndDate: schema.appointments.appointmentEndDate,
        status: schema.appointments.status,
        notes: schema.appointments.notes,
        createdBy: schema.appointments.createdBy,
        createdAt: schema.appointments.createdAt,
        updatedAt: schema.appointments.updatedAt,
        customerName: schema.customers.name,
        customerPhone: schema.customers.phone,
        customerEmail: schema.customers.email,
      })
      .from(schema.appointments)
      .leftJoin(schema.customers, eq(schema.appointments.customerId, schema.customers.id))
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
        title: validation.data.title,
        description: validation.data.description || null,
        appointmentDate: new Date(validation.data.appointmentDate),
        appointmentEndDate: validation.data.appointmentEndDate ? new Date(validation.data.appointmentEndDate) : null,
        status: validation.data.status || 'scheduled',
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

export default router;
