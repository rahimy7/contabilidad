// server/services/loyalty-points-service.ts
// Servicio para gestionar la acreditación automática de puntos de lealtad

import { eq, and } from 'drizzle-orm';
import * as schema from '@shared/schema';
import { getTenantDb } from '../multi-tenant-db';

export class LoyaltyPointsService {
  private storeId: number;

  constructor(storeId: number) {
    this.storeId = storeId;
  }

  /**
   * Acredita los puntos de lealtad de una orden al cliente y su padre (si existe)
   * Esta función debe llamarse cuando una orden cambia a estado "completed"
   */
  async creditLoyaltyPointsFromOrder(orderId: number): Promise<{
    success: boolean;
    pointsAwarded: number;
    customersAffected: number[];
    message: string;
  }> {
    try {
      console.log(`🎁 [LOYALTY] Iniciando acreditación de puntos para orden ${orderId}`);

      const db = await getTenantDb(this.storeId);

      // 1️⃣ Obtener información de la orden
      const [order] = await db
        .select({
          id: schema.orders.id,
          orderNumber: schema.orders.orderNumber,
          customerId: schema.orders.customerId,
          loyaltyPointsTotal: schema.orders.loyaltyPointsTotal,
          loyaltyPointsPropertyName: schema.orders.loyaltyPointsPropertyName,
          loyaltyPointsCredited: schema.orders.loyaltyPointsCredited,
          status: schema.orders.status,
        })
        .from(schema.orders)
        .where(eq(schema.orders.id, orderId))
        .limit(1);

      if (!order) {
        console.log(`❌ [LOYALTY] Orden ${orderId} no encontrada`);
        return {
          success: false,
          pointsAwarded: 0,
          customersAffected: [],
          message: 'Orden no encontrada',
        };
      }

      // 2️⃣ Validar que la orden esté completada
      if (order.status !== 'completed') {
        console.log(`⚠️ [LOYALTY] Orden ${orderId} no está completada (estado: ${order.status})`);
        return {
          success: false,
          pointsAwarded: 0,
          customersAffected: [],
          message: `Orden no está completada (estado: ${order.status})`,
        };
      }

      // 3️⃣ Validar que los puntos no hayan sido acreditados previamente
      if (order.loyaltyPointsCredited) {
        console.log(`⚠️ [LOYALTY] Los puntos de la orden ${orderId} ya fueron acreditados`);
        return {
          success: false,
          pointsAwarded: 0,
          customersAffected: [],
          message: 'Los puntos ya fueron acreditados previamente',
        };
      }

      // 4️⃣ Validar que haya puntos para acreditar
      const pointsToCredit = parseFloat(order.loyaltyPointsTotal || '0');
      if (pointsToCredit <= 0) {
        console.log(`ℹ️ [LOYALTY] Orden ${orderId} no tiene puntos para acreditar`);

        // Marcar como acreditada aunque sea 0 para evitar reprocesar
        await db
          .update(schema.orders)
          .set({
            loyaltyPointsCredited: true,
            loyaltyPointsCreditedAt: new Date(),
          })
          .where(eq(schema.orders.id, orderId));

        return {
          success: true,
          pointsAwarded: 0,
          customersAffected: [],
          message: 'No hay puntos para acreditar',
        };
      }

      // 5️⃣ Obtener información del cliente
      const [customer] = await db
        .select({
          id: schema.customers.id,
          name: schema.customers.name,
          phone: schema.customers.phone,
          parentCustomerId: schema.customers.parentCustomerId,
        })
        .from(schema.customers)
        .where(eq(schema.customers.id, order.customerId))
        .limit(1);

      if (!customer) {
        console.log(`❌ [LOYALTY] Cliente ${order.customerId} no encontrado`);
        return {
          success: false,
          pointsAwarded: 0,
          customersAffected: [],
          message: 'Cliente no encontrado',
        };
      }

      const customersAffected: number[] = [];

      // 6️⃣ Acreditar puntos al cliente directo
      console.log(`💰 [LOYALTY] Acreditando ${pointsToCredit} puntos al cliente ${customer.id} (${customer.name})`);

      await this.creditPointsToCustomer(
        customer.id,
        pointsToCredit,
        orderId,
        order.orderNumber || `#${orderId}`,
        `Puntos ganados por orden ${order.orderNumber || orderId}`
      );

      customersAffected.push(customer.id);

      // 7️⃣ Si tiene cliente padre, acreditar también al padre
      if (customer.parentCustomerId) {
        const [parentCustomer] = await db
          .select({
            id: schema.customers.id,
            name: schema.customers.name,
          })
          .from(schema.customers)
          .where(eq(schema.customers.id, customer.parentCustomerId))
          .limit(1);

        if (parentCustomer) {
          console.log(`👨‍👦 [LOYALTY] Acreditando ${pointsToCredit} puntos al cliente padre ${parentCustomer.id} (${parentCustomer.name})`);

          await this.creditPointsToCustomer(
            parentCustomer.id,
            pointsToCredit,
            orderId,
            order.orderNumber || `#${orderId}`,
            `Puntos acumulados de cliente hijo: ${customer.name} (Orden ${order.orderNumber || orderId})`
          );

          customersAffected.push(parentCustomer.id);
        } else {
          console.warn(`⚠️ [LOYALTY] Cliente padre ${customer.parentCustomerId} no encontrado`);
        }
      }

      // 8️⃣ Marcar la orden como puntos acreditados
      await db
        .update(schema.orders)
        .set({
          loyaltyPointsCredited: true,
          loyaltyPointsCreditedAt: new Date(),
        })
        .where(eq(schema.orders.id, orderId));

      console.log(`✅ [LOYALTY] Puntos acreditados exitosamente para orden ${orderId}`);
      console.log(`   - Puntos: ${pointsToCredit}`);
      console.log(`   - Clientes afectados: ${customersAffected.join(', ')}`);

      return {
        success: true,
        pointsAwarded: pointsToCredit,
        customersAffected,
        message: `${pointsToCredit} puntos acreditados a ${customersAffected.length} cliente(s)`,
      };

    } catch (error) {
      console.error(`❌ [LOYALTY] Error acreditando puntos para orden ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Acredita puntos a un cliente específico
   * Actualiza el balance y crea la transacción correspondiente
   */
  private async creditPointsToCustomer(
    customerId: number,
    points: number,
    orderId: number,
    orderNumber: string,
    description: string
  ): Promise<void> {
    const db = await getTenantDb(this.storeId);

    // 1️⃣ Obtener o crear balance de puntos del cliente
    let [balance] = await db
      .select()
      .from(schema.customerLoyaltyBalance)
      .where(eq(schema.customerLoyaltyBalance.customerId, customerId))
      .limit(1);

    if (!balance) {
      console.log(`📝 [LOYALTY] Creando balance de puntos para cliente ${customerId}`);

      [balance] = await db
        .insert(schema.customerLoyaltyBalance)
        .values({
          customerId,
          storeId: this.storeId,
          currentBalance: '0',
          totalPointsEarned: '0',
          totalPointsRedeemed: '0',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
    }

    // 2️⃣ Calcular nuevo balance
    const currentBalance = parseFloat(balance.currentBalance || '0');
    const totalEarned = parseFloat(balance.totalPointsEarned || '0');
    const newBalance = currentBalance + points;
    const newTotalEarned = totalEarned + points;

    console.log(`   📊 Cliente ${customerId}: ${currentBalance} → ${newBalance} puntos`);

    // 3️⃣ Actualizar balance
    await db
      .update(schema.customerLoyaltyBalance)
      .set({
        currentBalance: newBalance.toString(),
        totalPointsEarned: newTotalEarned.toString(),
        lastEarnedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.customerLoyaltyBalance.customerId, customerId));

    // 4️⃣ Crear transacción de puntos
    await db
      .insert(schema.loyaltyPointsTransactions)
      .values({
        customerId,
        storeId: this.storeId,
        type: 'earned',
        points: points.toString(),
        balanceBefore: currentBalance.toString(),
        balanceAfter: newBalance.toString(),
        orderId: orderId,
        description,
        createdAt: new Date(),
      });

    console.log(`   ✅ Transacción creada para cliente ${customerId}`);
  }

  /**
   * Revierte la acreditación de puntos de una orden
   * Útil si una orden completada se cancela posteriormente
   */
  async revertLoyaltyPointsFromOrder(orderId: number): Promise<{
    success: boolean;
    pointsReverted: number;
    customersAffected: number[];
    message: string;
  }> {
    try {
      console.log(`🔄 [LOYALTY] Iniciando reversión de puntos para orden ${orderId}`);

      const db = await getTenantDb(this.storeId);

      // 1️⃣ Obtener información de la orden
      const [order] = await db
        .select({
          id: schema.orders.id,
          orderNumber: schema.orders.orderNumber,
          customerId: schema.orders.customerId,
          loyaltyPointsTotal: schema.orders.loyaltyPointsTotal,
          loyaltyPointsCredited: schema.orders.loyaltyPointsCredited,
        })
        .from(schema.orders)
        .where(eq(schema.orders.id, orderId))
        .limit(1);

      if (!order) {
        return {
          success: false,
          pointsReverted: 0,
          customersAffected: [],
          message: 'Orden no encontrada',
        };
      }

      // 2️⃣ Validar que los puntos hayan sido acreditados
      if (!order.loyaltyPointsCredited) {
        console.log(`ℹ️ [LOYALTY] Los puntos de la orden ${orderId} no han sido acreditados`);
        return {
          success: false,
          pointsReverted: 0,
          customersAffected: [],
          message: 'Los puntos no han sido acreditados',
        };
      }

      const pointsToRevert = parseFloat(order.loyaltyPointsTotal || '0');
      if (pointsToRevert <= 0) {
        return {
          success: true,
          pointsReverted: 0,
          customersAffected: [],
          message: 'No hay puntos para revertir',
        };
      }

      // 3️⃣ Obtener transacciones relacionadas a esta orden
      const transactions = await db
        .select()
        .from(schema.loyaltyPointsTransactions)
        .where(
          and(
            eq(schema.loyaltyPointsTransactions.orderId, orderId),
            eq(schema.loyaltyPointsTransactions.type, 'earned')
          )
        );

      const customersAffected: number[] = [];

      // 4️⃣ Revertir puntos para cada cliente afectado
      for (const transaction of transactions) {
        const customerId = transaction.customerId;
        const points = parseFloat(transaction.points);

        console.log(`↩️ [LOYALTY] Revirtiendo ${points} puntos del cliente ${customerId}`);

        await this.deductPointsFromCustomer(
          customerId,
          points,
          orderId,
          order.orderNumber || `#${orderId}`,
          `Reversión de puntos por orden ${order.orderNumber || orderId} (cancelada)`
        );

        customersAffected.push(customerId);
      }

      // 5️⃣ Marcar la orden como puntos no acreditados
      await db
        .update(schema.orders)
        .set({
          loyaltyPointsCredited: false,
          loyaltyPointsCreditedAt: null,
        })
        .where(eq(schema.orders.id, orderId));

      console.log(`✅ [LOYALTY] Puntos revertidos exitosamente para orden ${orderId}`);

      return {
        success: true,
        pointsReverted: pointsToRevert,
        customersAffected,
        message: `${pointsToRevert} puntos revertidos de ${customersAffected.length} cliente(s)`,
      };

    } catch (error) {
      console.error(`❌ [LOYALTY] Error revirtiendo puntos para orden ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Deduce puntos de un cliente
   */
  private async deductPointsFromCustomer(
    customerId: number,
    points: number,
    orderId: number,
    orderNumber: string,
    description: string
  ): Promise<void> {
    const db = await getTenantDb(this.storeId);

    // 1️⃣ Obtener balance actual
    const [balance] = await db
      .select()
      .from(schema.customerLoyaltyBalance)
      .where(eq(schema.customerLoyaltyBalance.customerId, customerId))
      .limit(1);

    if (!balance) {
      console.warn(`⚠️ [LOYALTY] No se encontró balance para cliente ${customerId}`);
      return;
    }

    // 2️⃣ Calcular nuevo balance
    const currentBalance = parseFloat(balance.currentBalance || '0');
    const totalEarned = parseFloat(balance.totalPointsEarned || '0');
    const newBalance = Math.max(0, currentBalance - points); // No permitir balance negativo
    const newTotalEarned = Math.max(0, totalEarned - points);

    console.log(`   📊 Cliente ${customerId}: ${currentBalance} → ${newBalance} puntos`);

    // 3️⃣ Actualizar balance
    await db
      .update(schema.customerLoyaltyBalance)
      .set({
        currentBalance: newBalance.toString(),
        totalPointsEarned: newTotalEarned.toString(),
        updatedAt: new Date(),
      })
      .where(eq(schema.customerLoyaltyBalance.customerId, customerId));

    // 4️⃣ Crear transacción de reversión
    await db
      .insert(schema.loyaltyPointsTransactions)
      .values({
        customerId,
        storeId: this.storeId,
        type: 'adjusted', // Usamos 'adjusted' para reversiones
        points: (-points).toString(), // Negativo para indicar deducción
        balanceBefore: currentBalance.toString(),
        balanceAfter: newBalance.toString(),
        orderId: orderId,
        description,
        createdAt: new Date(),
      });

    console.log(`   ✅ Transacción de reversión creada para cliente ${customerId}`);
  }
}
