import { Router } from 'express';
import { eq, and, desc, sql } from 'drizzle-orm';
import { authenticateToken } from '../authMiddleware';
import { getTenantDb } from '../multi-tenant-db';
import { ensureAppointmentCreditSchema } from '../services/appointment-credit-schema-guard';
import * as schema from '@shared/schema';
import type { AuthUser } from '@shared/auth';

const router = Router();

// ================================
// CUENTA DE CRÉDITO DEL CLIENTE
// ================================

// GET - Obtener cuenta de crédito de un cliente
router.get('/credits/:customerId', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });
    await ensureAppointmentCreditSchema(user.storeId);
    const customerId = parseInt(req.params.customerId);
    if (isNaN(customerId)) return res.status(400).json({ error: 'ID de cliente inválido' });

    const db = await getTenantDb(user.storeId);

    // Get or create credit account
    let [account] = await db
      .select()
      .from(schema.customerCreditAccounts)
      .where(and(
        eq(schema.customerCreditAccounts.customerId, customerId),
        eq(schema.customerCreditAccounts.storeId, user.storeId),
      ));

    if (!account) {
      // Auto-create credit account
      [account] = await db
        .insert(schema.customerCreditAccounts)
        .values({
          customerId,
          storeId: user.storeId,
          totalCredit: '0',
          totalPaid: '0',
          currentBalance: '0',
        })
        .returning();
    }

    // Get transactions
    const transactions = await db
      .select()
      .from(schema.creditTransactions)
      .where(and(
        eq(schema.creditTransactions.customerId, customerId),
        eq(schema.creditTransactions.storeId, user.storeId),
      ))
      .orderBy(desc(schema.creditTransactions.createdAt));

    // Get customer info
    const [customer] = await db
      .select({ id: schema.customers.id, name: schema.customers.name, phone: schema.customers.phone })
      .from(schema.customers)
      .where(eq(schema.customers.id, customerId));

    res.json({ account, transactions, customer });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener crédito', details: error.message });
  }
});

// GET - Clientes con deuda pendiente
router.get('/credits/pending/list', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });
    await ensureAppointmentCreditSchema(user.storeId);

    const db = await getTenantDb(user.storeId);

    const accounts = await db
      .select({
        id: schema.customerCreditAccounts.id,
        customerId: schema.customerCreditAccounts.customerId,
        totalCredit: schema.customerCreditAccounts.totalCredit,
        totalPaid: schema.customerCreditAccounts.totalPaid,
        currentBalance: schema.customerCreditAccounts.currentBalance,
        creditLimit: schema.customerCreditAccounts.creditLimit,
        customerName: schema.customers.name,
        customerPhone: schema.customers.phone,
      })
      .from(schema.customerCreditAccounts)
      .leftJoin(schema.customers, eq(schema.customerCreditAccounts.customerId, schema.customers.id))
      .where(and(
        eq(schema.customerCreditAccounts.storeId, user.storeId),
        sql`${schema.customerCreditAccounts.currentBalance}::numeric > 0`,
      ))
      .orderBy(desc(schema.customerCreditAccounts.currentBalance));

    res.json(accounts);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener deudas pendientes', details: error.message });
  }
});

// POST - Registrar cargo a crédito (nueva deuda)
router.post('/credits/charge', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });
    await ensureAppointmentCreditSchema(user.storeId);

    const { customerId, amount, orderId, description } = req.body;
    if (!customerId || !amount) return res.status(400).json({ error: 'customerId y amount son requeridos' });

    const chargeAmount = parseFloat(amount);
    if (isNaN(chargeAmount) || chargeAmount <= 0) return res.status(400).json({ error: 'Monto inválido' });

    const db = await getTenantDb(user.storeId);

    // Get or create credit account
    let [account] = await db
      .select()
      .from(schema.customerCreditAccounts)
      .where(and(
        eq(schema.customerCreditAccounts.customerId, customerId),
        eq(schema.customerCreditAccounts.storeId, user.storeId),
      ));

    if (!account) {
      [account] = await db
        .insert(schema.customerCreditAccounts)
        .values({
          customerId,
          storeId: user.storeId,
          totalCredit: '0',
          totalPaid: '0',
          currentBalance: '0',
        })
        .returning();
    }

    const balanceBefore = parseFloat(account.currentBalance);
    const balanceAfter = balanceBefore + chargeAmount;
    const newTotalCredit = parseFloat(account.totalCredit) + chargeAmount;

    // Create transaction
    const [transaction] = await db
      .insert(schema.creditTransactions)
      .values({
        customerId,
        storeId: user.storeId,
        orderId: orderId || null,
        type: 'charge',
        amount: chargeAmount.toFixed(2),
        balanceBefore: balanceBefore.toFixed(2),
        balanceAfter: balanceAfter.toFixed(2),
        description: description || 'Venta a crédito',
        createdBy: user.id,
      })
      .returning();

    // Update account
    const [updatedAccount] = await db
      .update(schema.customerCreditAccounts)
      .set({
        totalCredit: newTotalCredit.toFixed(2),
        currentBalance: balanceAfter.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(schema.customerCreditAccounts.id, account.id))
      .returning();

    res.status(201).json({ transaction, account: updatedAccount });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al registrar cargo', details: error.message });
  }
});

// POST - Registrar pago de deuda
router.post('/credits/payment', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) return res.status(403).json({ error: 'Store ID requerido' });
    await ensureAppointmentCreditSchema(user.storeId);

    const { customerId, amount, paymentMethod, description } = req.body;
    if (!customerId || !amount) return res.status(400).json({ error: 'customerId y amount son requeridos' });

    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) return res.status(400).json({ error: 'Monto inválido' });

    const db = await getTenantDb(user.storeId);

    // Get credit account
    const [account] = await db
      .select()
      .from(schema.customerCreditAccounts)
      .where(and(
        eq(schema.customerCreditAccounts.customerId, customerId),
        eq(schema.customerCreditAccounts.storeId, user.storeId),
      ));

    if (!account) return res.status(404).json({ error: 'No se encontró cuenta de crédito' });

    const balanceBefore = parseFloat(account.currentBalance);
    if (balanceBefore <= 0) return res.status(400).json({ error: 'No hay deuda pendiente' });

    const actualPayment = Math.min(paymentAmount, balanceBefore);
    const balanceAfter = balanceBefore - actualPayment;
    const newTotalPaid = parseFloat(account.totalPaid) + actualPayment;

    // Create a credit_payment order for the receipt
    const orderNumber = `PAG-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;
    const [paymentOrder] = await db
      .insert(schema.orders)
      .values({
        orderNumber,
        customerId,
        storeId: user.storeId,
        status: 'completed',
        totalAmount: actualPayment.toFixed(2),
        paymentMethod: paymentMethod || 'cash',
        paymentStatus: 'paid',
        receivedAmount: paymentAmount.toFixed(2),
        changeAmount: (paymentAmount - actualPayment).toFixed(2),
        orderType: 'credit_payment',
        subtotalAmount: actualPayment.toFixed(2),
        discountPercentage: '0',
        discountAmount: '0',
      })
      .returning();

    // Create transaction
    const [transaction] = await db
      .insert(schema.creditTransactions)
      .values({
        customerId,
        storeId: user.storeId,
        orderId: paymentOrder.id,
        type: 'payment',
        amount: actualPayment.toFixed(2),
        balanceBefore: balanceBefore.toFixed(2),
        balanceAfter: balanceAfter.toFixed(2),
        description: description || 'Pago de deuda',
        paymentMethod: paymentMethod || 'cash',
        createdBy: user.id,
      })
      .returning();

    // Update account
    const [updatedAccount] = await db
      .update(schema.customerCreditAccounts)
      .set({
        totalPaid: newTotalPaid.toFixed(2),
        currentBalance: balanceAfter.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(schema.customerCreditAccounts.id, account.id))
      .returning();

    res.status(201).json({ transaction, account: updatedAccount, order: paymentOrder });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al registrar pago', details: error.message });
  }
});

export default router;
