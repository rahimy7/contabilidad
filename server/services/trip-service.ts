// server/services/trip-service.ts
import { eq, and, desc, count as drizzleCount, sql } from 'drizzle-orm';
import { getTenantDb } from '../multi-tenant-db';
import * as schema from '../../shared/schema';

export class TripService {
  /**
   * Encuentra o crea un viaje para un delivery
   */
  static async findOrCreateTrip(
    storeId: number,
    userId: number
  ): Promise<number> {
    try {
      const db = await getTenantDb(storeId);
      
      const [existingTrip] = await db
        .select()
        .from(schema.trips)
        .where(and(
          eq(schema.trips.assignedUserId, userId),
          eq(schema.trips.storeId, storeId),
          eq(schema.trips.status, 'pending')
        ))
        .orderBy(desc(schema.trips.createdAt))
        .limit(1);

      if (existingTrip) {
        return existingTrip.id;
      }

      const tripNumber = await this.generateTripNumber(storeId);
      
      const [newTrip] = await db
        .insert(schema.trips)
        .values({
          tripNumber,
          assignedUserId: userId,
          storeId,
          status: 'pending',
          totalOrders: 0,
          completedOrders: 0,
          totalAmount: '0',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      console.log(`✅ Created new trip ${tripNumber} for user ${userId}`);
      return newTrip.id;
    } catch (error) {
      console.error('Error finding/creating trip:', error);
      throw error;
    }
  }

  /**
   * Agrega un pedido a un viaje
   */
  static async addOrderToTrip(
    storeId: number,
    tripId: number,
    orderId: number
  ): Promise<void> {
    try {
      const db = await getTenantDb(storeId);
      
      const [existing] = await db
        .select()
        .from(schema.tripOrders)
        .where(and(
          eq(schema.tripOrders.tripId, tripId),
          eq(schema.tripOrders.orderId, orderId)
        ));

      if (existing) {
        console.log(`⚠️ Order ${orderId} already in trip ${tripId}`);
        return;
      }

      const [maxSeq] = await db
        .select({ max: sql<number>`MAX(sequence_number)` })
        .from(schema.tripOrders)
        .where(eq(schema.tripOrders.tripId, tripId));

      const sequenceNumber = (maxSeq?.max || 0) + 1;

      await db
        .insert(schema.tripOrders)
        .values({
          tripId,
          orderId,
          storeId,
          status: 'pending',
          sequenceNumber,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

      await db
        .update(schema.orders)
        .set({ tripId })
        .where(eq(schema.orders.id, orderId));

      await this.updateTripCounters(storeId, tripId);

      console.log(`✅ Added order ${orderId} to trip ${tripId}`);
    } catch (error) {
      console.error('Error adding order to trip:', error);
      throw error;
    }
  }

  /**
   * Actualiza contadores y totales del viaje
   */
  static async updateTripCounters(
    storeId: number,
    tripId: number
  ): Promise<void> {
    try {
      const db = await getTenantDb(storeId);
      
      const [orderCount] = await db
        .select({
          total: drizzleCount(),
          completed: drizzleCount(sql`CASE WHEN ${schema.tripOrders.status} = 'picked' THEN 1 END`),
        })
        .from(schema.tripOrders)
        .where(eq(schema.tripOrders.tripId, tripId));

      const [amountSum] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${schema.orders.totalAmount}), 0)`,
        })
        .from(schema.tripOrders)
        .leftJoin(schema.orders, eq(schema.tripOrders.orderId, schema.orders.id))
        .where(eq(schema.tripOrders.tripId, tripId));

      await db
        .update(schema.trips)
        .set({
          totalOrders: orderCount.total,
          completedOrders: orderCount.completed,
          totalAmount: amountSum.total || '0',
          updatedAt: new Date(),
        })
        .where(eq(schema.trips.id, tripId));
    } catch (error) {
      console.error('Error updating trip counters:', error);
      throw error;
    }
  }

  /**
   * Genera número de viaje único
   */
  static async generateTripNumber(storeId: number): Promise<string> {
    try {
      const db = await getTenantDb(storeId);
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');

      const [result] = await db
        .select({ total: drizzleCount() })
        .from(schema.trips)
        .where(and(
          eq(schema.trips.storeId, storeId),
          sql`DATE(${schema.trips.createdAt}) = CURRENT_DATE`
        ));

      const sequence = String(result.total + 1).padStart(3, '0');
      return `TRIP-${dateStr}-${sequence}`;
    } catch (error) {
      console.error('Error generating trip number:', error);
      return `TRIP-${Date.now()}`;
    }
  }

  /**
   * Integración con asignación de pedidos
   */
  static async assignOrderWithTrip(
    storeId: number,
    orderId: number,
    userId: number
  ): Promise<{ tripId: number; tripNumber: string }> {
    try {
      const db = await getTenantDb(storeId);
      
      const tripId = await this.findOrCreateTrip(storeId, userId);
      await this.addOrderToTrip(storeId, tripId, orderId);

      const [trip] = await db
        .select({ tripNumber: schema.trips.tripNumber })
        .from(schema.trips)
        .where(eq(schema.trips.id, tripId));

      return {
        tripId,
        tripNumber: trip?.tripNumber || `TRIP-${tripId}`,
      };
    } catch (error) {
      console.error('Error assigning order with trip:', error);
      throw error;
    }
  }
}

/**
 * Helper para integrar con el sistema de asignación automática
 */
export async function integrateWithAutoAssignment(
  storeId: number,
  orderId: number,
  assignedUserId: number
) {
  try {
    const db = await getTenantDb(storeId);
    
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, assignedUserId));

    if (!user) {
      console.log('⚠️ User not found for trip assignment');
      return null;
    }

    if (user.role === 'delivery' || user.role === 'technician') {
      const result = await TripService.assignOrderWithTrip(
        storeId,
        orderId,
        assignedUserId
      );
      
      console.log(`✅ Order ${orderId} assigned to trip ${result.tripNumber}`);
      return result;
    }

    return null;
  } catch (error) {
    console.error('Error integrating with auto assignment:', error);
    return null;
  }
}