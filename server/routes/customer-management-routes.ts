import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { authenticateToken } from '../authMiddleware';
import { getTenantDb } from '../multi-tenant-db';
import * as schema from '@shared/schema';
import type { AuthUser } from '@shared/auth';

const router = Router();

// ================================
// TIPOS DE CLIENTES
// ================================

// GET - Obtener todos los tipos de clientes
router.get('/customer-types', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const db = await getTenantDb(user.storeId);
    const customerTypes = await db
      .select()
      .from(schema.customerTypes)
      .where(eq(schema.customerTypes.storeId, user.storeId))
      .orderBy(schema.customerTypes.sortOrder);

    res.json(customerTypes);
  } catch (error) {
    console.error('Error fetching customer types:', error);
    res.status(500).json({ error: 'Error al obtener tipos de clientes' });
  }
});

// POST - Crear tipo de cliente
router.post('/customer-types', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const validation = schema.insertCustomerTypeSchema.safeParse({
      ...req.body,
      storeId: user.storeId,
    });

    if (!validation.success) {
      return res.status(400).json({
        error: 'Validación fallida',
        details: validation.error.errors,
      });
    }

    const db = await getTenantDb(user.storeId);
    const [customerType] = await db
      .insert(schema.customerTypes)
      .values(validation.data)
      .returning();

    res.status(201).json(customerType);
  } catch (error) {
    console.error('Error creating customer type:', error);
    res.status(500).json({ error: 'Error al crear tipo de cliente' });
  }
});

// PUT - Actualizar tipo de cliente
router.put('/customer-types/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const id = parseInt(req.params.id);
    const db = await getTenantDb(user.storeId);

    const [customerType] = await db
      .update(schema.customerTypes)
      .set({ ...req.body, updatedAt: new Date() })
      .where(
        and(
          eq(schema.customerTypes.id, id),
          eq(schema.customerTypes.storeId, user.storeId)
        )
      )
      .returning();

    if (!customerType) {
      return res.status(404).json({ error: 'Tipo de cliente no encontrado' });
    }

    res.json(customerType);
  } catch (error) {
    console.error('Error updating customer type:', error);
    res.status(500).json({ error: 'Error al actualizar tipo de cliente' });
  }
});

// DELETE - Eliminar tipo de cliente
router.delete('/customer-types/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const id = parseInt(req.params.id);
    const db = await getTenantDb(user.storeId);

    // Verificar si hay clientes usando este tipo
    const [customersCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.customers)
      .where(eq(schema.customers.customerTypeId, id));

    if (customersCount.count > 0) {
      return res.status(400).json({
        error: `No se puede eliminar: ${customersCount.count} cliente(s) están usando este tipo`,
      });
    }

    await db
      .delete(schema.customerTypes)
      .where(
        and(
          eq(schema.customerTypes.id, id),
          eq(schema.customerTypes.storeId, user.storeId)
        )
      );

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting customer type:', error);
    res.status(500).json({ error: 'Error al eliminar tipo de cliente' });
  }
});

// ================================
// GESTIÓN DE CLIENTES
// ================================

// GET - Obtener todos los clientes con información extendida
router.get('/customers', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const db = await getTenantDb(user.storeId);

    // Query con JOIN para incluir tipo de cliente y balance de puntos
    const customers = await db
      .select({
        // Campos del cliente
        id: schema.customers.id,
        name: schema.customers.name,
        phone: schema.customers.phone,
        email: schema.customers.email,
        address: schema.customers.address,
        category: schema.customers.category,
        customerTypeId: schema.customers.customerTypeId,
        totalOrders: schema.customers.totalOrders,
        totalSpent: schema.customers.totalSpent,
        isVip: schema.customers.isVip,
        isActive: schema.customers.isActive,
        registrationDate: schema.customers.registrationDate,
        lastContact: schema.customers.lastContact,
        notes: schema.customers.notes,
        createdAt: schema.customers.createdAt,

        // Tipo de cliente
        customerType: {
          id: schema.customerTypes.id,
          name: schema.customerTypes.name,
          discountPercentage: schema.customerTypes.discountPercentage,
          color: schema.customerTypes.color,
        },

        // Balance de puntos
        loyaltyBalance: {
          currentBalance: schema.customerLoyaltyBalance.currentBalance,
          totalPointsEarned: schema.customerLoyaltyBalance.totalPointsEarned,
          pointsPropertyName: schema.customerLoyaltyBalance.pointsPropertyName,
        },
      })
      .from(schema.customers)
      .leftJoin(
        schema.customerTypes,
        eq(schema.customers.customerTypeId, schema.customerTypes.id)
      )
      .leftJoin(
        schema.customerLoyaltyBalance,
        eq(schema.customers.id, schema.customerLoyaltyBalance.customerId)
      )
      .where(eq(schema.customers.storeId, user.storeId))
      .orderBy(desc(schema.customers.createdAt));

    res.json(customers);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
});

// GET - Obtener un cliente por ID con detalles completos
router.get('/customers/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const id = parseInt(req.params.id);
    const db = await getTenantDb(user.storeId);

    const [customer] = await db
      .select()
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.id, id),
          eq(schema.customers.storeId, user.storeId)
        )
      )
      .limit(1);

    if (!customer) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    // Obtener balance de puntos
    const [loyaltyBalance] = await db
      .select()
      .from(schema.customerLoyaltyBalance)
      .where(eq(schema.customerLoyaltyBalance.customerId, id))
      .limit(1);

    // Obtener historial reciente de transacciones de puntos
    const recentTransactions = await db
      .select()
      .from(schema.loyaltyPointsTransactions)
      .where(eq(schema.loyaltyPointsTransactions.customerId, id))
      .orderBy(desc(schema.loyaltyPointsTransactions.createdAt))
      .limit(10);

    res.json({
      ...customer,
      loyaltyBalance,
      recentTransactions,
    });
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).json({ error: 'Error al obtener cliente' });
  }
});

// PUT - Actualizar cliente
router.put('/customers/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const id = parseInt(req.params.id);
    const db = await getTenantDb(user.storeId);

    const [customer] = await db
      .update(schema.customers)
      .set({ ...req.body, updatedAt: new Date() })
      .where(
        and(
          eq(schema.customers.id, id),
          eq(schema.customers.storeId, user.storeId)
        )
      )
      .returning();

    if (!customer) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    res.json(customer);
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ error: 'Error al actualizar cliente' });
  }
});

// ================================
// SISTEMA DE PUNTOS DE LEALTAD
// ================================

// POST - Ajustar puntos de lealtad manualmente
router.post('/customers/:id/loyalty/adjust', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const customerId = parseInt(req.params.id);
    const { points, description } = req.body;

    if (!points || !description) {
      return res.status(400).json({ error: 'Puntos y descripción son requeridos' });
    }

    const db = await getTenantDb(user.storeId);

    // Obtener o crear balance de puntos
    let [balance] = await db
      .select()
      .from(schema.customerLoyaltyBalance)
      .where(eq(schema.customerLoyaltyBalance.customerId, customerId))
      .limit(1);

    if (!balance) {
      [balance] = await db
        .insert(schema.customerLoyaltyBalance)
        .values({
          customerId,
          storeId: user.storeId,
          currentBalance: '0',
          totalPointsEarned: '0',
          totalPointsRedeemed: '0',
        })
        .returning();
    }

    const pointsNum = parseFloat(points);
    const currentBalance = parseFloat(balance.currentBalance || '0');
    const newBalance = currentBalance + pointsNum;

    // Actualizar balance
    await db
      .update(schema.customerLoyaltyBalance)
      .set({
        currentBalance: newBalance.toString(),
        totalPointsEarned:
          pointsNum > 0
            ? (parseFloat(balance.totalPointsEarned || '0') + pointsNum).toString()
            : balance.totalPointsEarned,
        totalPointsRedeemed:
          pointsNum < 0
            ? (parseFloat(balance.totalPointsRedeemed || '0') + Math.abs(pointsNum)).toString()
            : balance.totalPointsRedeemed,
        updatedAt: new Date(),
      })
      .where(eq(schema.customerLoyaltyBalance.customerId, customerId));

    // Crear transacción
    const [transaction] = await db
      .insert(schema.loyaltyPointsTransactions)
      .values({
        customerId,
        storeId: user.storeId,
        type: 'adjusted',
        points: pointsNum.toString(),
        balanceBefore: currentBalance.toString(),
        balanceAfter: newBalance.toString(),
        description,
      })
      .returning();

    res.json({
      success: true,
      newBalance,
      transaction,
    });
  } catch (error) {
    console.error('Error adjusting loyalty points:', error);
    res.status(500).json({ error: 'Error al ajustar puntos de lealtad' });
  }
});

// GET - Obtener historial de puntos de un cliente
router.get('/customers/:id/loyalty/transactions', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const customerId = parseInt(req.params.id);
    const db = await getTenantDb(user.storeId);

    const transactions = await db
      .select()
      .from(schema.loyaltyPointsTransactions)
      .where(eq(schema.loyaltyPointsTransactions.customerId, customerId))
      .orderBy(desc(schema.loyaltyPointsTransactions.createdAt));

    res.json(transactions);
  } catch (error) {
    console.error('Error fetching loyalty transactions:', error);
    res.status(500).json({ error: 'Error al obtener transacciones de puntos' });
  }
});

// GET - Estadísticas de clientes
router.get('/customers-stats', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID requerido' });
    }

    const db = await getTenantDb(user.storeId);

    // Total de clientes
    const [totalCustomers] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.customers)
      .where(eq(schema.customers.storeId, user.storeId));

    // Clientes activos
    const [activeCustomers] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.storeId, user.storeId),
          eq(schema.customers.isActive, true)
        )
      );

    // Clientes VIP
    const [vipCustomers] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.storeId, user.storeId),
          eq(schema.customers.isVip, true)
        )
      );

    // Distribución por categoría
    const categoryDistribution = await db
      .select({
        category: schema.customers.category,
        count: sql<number>`count(*)`,
      })
      .from(schema.customers)
      .where(eq(schema.customers.storeId, user.storeId))
      .groupBy(schema.customers.category);

    // Distribución por tipo
    const typeDistribution = await db
      .select({
        typeId: schema.customers.customerTypeId,
        typeName: schema.customerTypes.name,
        count: sql<number>`count(*)`,
      })
      .from(schema.customers)
      .leftJoin(
        schema.customerTypes,
        eq(schema.customers.customerTypeId, schema.customerTypes.id)
      )
      .where(eq(schema.customers.storeId, user.storeId))
      .groupBy(schema.customers.customerTypeId, schema.customerTypes.name);

    res.json({
      totalCustomers: totalCustomers.count,
      activeCustomers: activeCustomers.count,
      vipCustomers: vipCustomers.count,
      categoryDistribution,
      typeDistribution,
    });
  } catch (error) {
    console.error('Error fetching customer stats:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas de clientes' });
  }
});

export default router;
