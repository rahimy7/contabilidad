// Script para completar una orden y verificar acreditación de puntos
import { getTenantDb } from '../server/multi-tenant-db.js';
import { createTenantStorage } from '../server/tenant-storage.js';

const STORE_ID = 16;
const ORDER_ID = process.argv[2] ? parseInt(process.argv[2]) : 222;

async function completeOrderAndTest() {
  console.log('🧪 PRUEBA COMPLETA DE LOYALTY POINTS\n');
  console.log('='.repeat(80));

  const db = await getTenantDb(STORE_ID);
  const storage = createTenantStorage(db, STORE_ID);

  // 1. Obtener orden
  console.log(`1️⃣  Obteniendo orden ${ORDER_ID}...`);
  const order = await storage.getOrderById(ORDER_ID);

  if (!order) {
    console.error(`❌ Orden ${ORDER_ID} no encontrada`);
    process.exit(1);
  }

  console.log(`   ✅ Orden encontrada: ${order.orderNumber}`);
  console.log(`      Cliente ID: ${order.customerId}`);
  console.log(`      Estado: ${order.status}`);
  console.log(`      Puntos: ${order.loyaltyPointsTotal}`);
  console.log(`      Acreditados: ${order.loyaltyPointsCredited}\n`);

  // 2. Obtener balance ANTES
  console.log(`2️⃣  Balance del cliente ANTES...`);
  const customer = await storage.getCustomerById(order.customerId);
  console.log(`   Cliente: ${customer.name} (${customer.phone})`);

  let balance = await storage.getCustomerLoyaltyBalance(order.customerId);
  const balanceBefore = parseFloat(balance?.currentBalance || '0');
  console.log(`   Balance: ${balanceBefore} puntos\n`);

  // 3. Completar orden
  if (order.status !== 'completed') {
    console.log(`3️⃣  Completando orden ${ORDER_ID}...\n`);

    await storage.updateOrder(ORDER_ID, {
      status: 'completed',
      completedDate: new Date(),
    });

    console.log(`   ✅ Estado actualizado a "completed"\n`);

    // 4. Acreditar puntos
    console.log(`4️⃣  Acreditando puntos de lealtad...\n`);

    const result = await storage.creditLoyaltyPointsFromOrder(ORDER_ID);

    console.log(`   Resultado:`);
    console.log(`      Success: ${result.success}`);
    console.log(`      Puntos: ${result.pointsAwarded}`);
    console.log(`      Clientes: ${result.customersAffected.join(', ')}`);
    console.log(`      Mensaje: ${result.message}\n`);
  } else {
    console.log(`3️⃣  ⚠️  La orden ya estaba completada\n`);
  }

  // 5. Verificar balance DESPUÉS
  console.log(`5️⃣  Balance del cliente DESPUÉS...`);
  const updatedBalance = await storage.getCustomerLoyaltyBalance(order.customerId);
  const balanceAfter = parseFloat(updatedBalance.currentBalance || '0');

  console.log(`   Balance anterior: ${balanceBefore} puntos`);
  console.log(`   Balance nuevo: ${balanceAfter} puntos`);
  console.log(`   Incremento: ${balanceAfter - balanceBefore} puntos\n`);

  // 6. Verificar orden marcada como acreditada
  console.log(`6️⃣  Verificando marca de acreditación...`);
  const updatedOrder = await storage.getOrderById(ORDER_ID);

  console.log(`   Puntos acreditados: ${updatedOrder.loyaltyPointsCredited ? '✅ Sí' : '❌ No'}`);
  if (updatedOrder.loyaltyPointsCreditedAt) {
    console.log(`   Fecha: ${updatedOrder.loyaltyPointsCreditedAt}`);
  }
  console.log('');

  // 7. Ver transacciones
  console.log(`7️⃣  Transacciones creadas...`);
  const transactions = await db.execute(`
    SELECT *
    FROM store_${STORE_ID}.loyalty_points_transactions
    WHERE order_id = ${ORDER_ID}
    ORDER BY created_at DESC
  `);

  if (transactions.rows && transactions.rows.length > 0) {
    console.log(`   ✅ ${transactions.rows.length} transacción(es) encontrada(s):\n`);
    transactions.rows.forEach((t: any, i: number) => {
      console.log(`   ${i + 1}. Cliente ${t.customer_id}:`);
      console.log(`      Tipo: ${t.type}`);
      console.log(`      Puntos: ${t.points}`);
      console.log(`      Balance: ${t.balance_before} → ${t.balance_after}`);
      console.log(`      Descripción: "${t.description}"`);
      console.log('');
    });
  } else {
    console.log(`   ⚠️  No se encontraron transacciones\n`);
  }

  // Resumen
  console.log('='.repeat(80));
  console.log('✅ RESULTADO DE LA PRUEBA\n');

  const expectedPoints = parseFloat(order.loyaltyPointsTotal || '0');
  const actualIncrement = balanceAfter - balanceBefore;
  const success = actualIncrement === expectedPoints && updatedOrder.loyaltyPointsCredited;

  console.log(`   Puntos esperados: ${expectedPoints}`);
  console.log(`   Puntos acreditados: ${actualIncrement}`);
  console.log(`   Orden marcada como acreditada: ${updatedOrder.loyaltyPointsCredited ? '✅' : '❌'}`);
  console.log(`   Estado final: ${success ? '✅ ÉXITO' : '❌ FALLÓ'}`);
  console.log('='.repeat(80));

  process.exit(success ? 0 : 1);
}

completeOrderAndTest();
