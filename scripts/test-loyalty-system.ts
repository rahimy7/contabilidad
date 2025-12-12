// Script de prueba para el sistema de loyalty points
// Este script simula el flujo completo de una orden con puntos

import { getTenantDb } from '../server/multi-tenant-db.js';
import { createTenantStorage } from '../server/tenant-storage.js';

const STORE_ID = 16; // MINI MARKET EL RUBIO

async function testLoyaltySystem() {
  console.log('🧪 PRUEBA DEL SISTEMA DE LOYALTY POINTS\n');
  console.log('='.repeat(80));

  try {
    const db = await getTenantDb(STORE_ID);
    const storage = createTenantStorage(db, STORE_ID);

    console.log(`\n📊 Usando tienda: Store ${STORE_ID}\n`);

    // 1️⃣ Buscar o crear un cliente de prueba
    console.log('1️⃣  Verificando cliente de prueba...');
    let customer = await storage.getCustomerByPhone('8099999999');

    if (!customer) {
      customer = await storage.createCustomer({
        name: 'Cliente Prueba Loyalty',
        phone: '8099999999',
        storeId: STORE_ID,
      });
      console.log(`   ✅ Cliente creado: ID ${customer.id}`);
    } else {
      console.log(`   ✅ Cliente existente: ID ${customer.id}`);
    }

    // 2️⃣ Verificar balance inicial
    console.log('\n2️⃣  Verificando balance inicial...');
    let balance = await storage.getCustomerLoyaltyBalance(customer.id);

    if (!balance) {
      const [newBalance] = await db.insert(storage.schema.customerLoyaltyBalance)
        .values({
          customerId: customer.id,
          storeId: STORE_ID,
          currentBalance: '0',
          totalPointsEarned: '0',
          totalPointsRedeemed: '0',
        })
        .returning();
      balance = newBalance;
      console.log(`   ✅ Balance creado: 0 puntos`);
    } else {
      console.log(`   ✅ Balance actual: ${balance.currentBalance} puntos`);
    }

    const initialBalance = parseFloat(balance.currentBalance || '0');

    // 3️⃣ Crear orden con puntos
    console.log('\n3️⃣  Creando orden de prueba con 50 puntos...');

    const order = await storage.createOrder({
      customerId: customer.id,
      storeId: STORE_ID,
      status: 'pending',
      priority: 'normal',
      totalAmount: '500.00',
      loyaltyPointsTotal: 50, // 50 puntos
      loyaltyPointsPropertyName: 'puntos',
      loyaltyPointsValue: 1,
      description: 'Orden de prueba para loyalty points',
    }, []);

    console.log(`   ✅ Orden creada: ID ${order.id}, Número: ${order.orderNumber}`);
    console.log(`   📦 Puntos asignados: ${order.loyaltyPointsTotal}`);
    console.log(`   🏷️  Estado inicial: ${order.status}`);
    console.log(`   🎁 Puntos acreditados: ${order.loyaltyPointsCredited || false}`);

    // 4️⃣ Completar orden y acreditar puntos
    console.log('\n4️⃣  Completando orden y acreditando puntos...');

    const result = await storage.creditLoyaltyPointsFromOrder(order.id);

    if (result.success) {
      console.log(`   ✅ ${result.message}`);
      console.log(`   💰 Puntos acreditados: ${result.pointsAwarded}`);
      console.log(`   👥 Clientes afectados: ${result.customersAffected.join(', ')}`);
    } else {
      console.log(`   ⚠️  ${result.message}`);
    }

    // 5️⃣ Verificar balance actualizado
    console.log('\n5️⃣  Verificando balance después de acreditación...');
    const updatedBalance = await storage.getCustomerLoyaltyBalance(customer.id);
    const newBalance = parseFloat(updatedBalance.currentBalance || '0');

    console.log(`   📊 Balance anterior: ${initialBalance} puntos`);
    console.log(`   📊 Balance nuevo: ${newBalance} puntos`);
    console.log(`   ➕ Incremento: ${newBalance - initialBalance} puntos`);

    if (newBalance === initialBalance + 50) {
      console.log(`   ✅ Balance actualizado correctamente!`);
    } else {
      console.log(`   ⚠️  Discrepancia en balance`);
    }

    // 6️⃣ Verificar transacciones
    console.log('\n6️⃣  Verificando transacciones creadas...');
    const transactions = await db
      .select()
      .from(storage.schema.loyaltyPointsTransactions)
      .where(storage.schema.loyaltyPointsTransactions.orderId.eq(order.id));

    console.log(`   📝 Transacciones encontradas: ${transactions.length}`);
    transactions.forEach((t: any, i: number) => {
      console.log(`      ${i + 1}. Cliente ${t.customerId}: ${t.points} puntos (${t.type})`);
      console.log(`         "${t.description}"`);
    });

    // 7️⃣ Verificar que la orden está marcada como acreditada
    console.log('\n7️⃣  Verificando estado de la orden...');
    const updatedOrder = await storage.getOrderById(order.id);

    console.log(`   🎁 Puntos acreditados: ${updatedOrder.loyaltyPointsCredited}`);
    console.log(`   📅 Fecha acreditación: ${updatedOrder.loyaltyPointsCreditedAt || 'N/A'}`);

    if (updatedOrder.loyaltyPointsCredited) {
      console.log(`   ✅ Orden marcada correctamente como acreditada`);
    } else {
      console.log(`   ⚠️  Orden NO marcada como acreditada`);
    }

    // 8️⃣ Intentar acreditar nuevamente (debe fallar)
    console.log('\n8️⃣  Probando prevención de doble acreditación...');
    const duplicateResult = await storage.creditLoyaltyPointsFromOrder(order.id);

    if (!duplicateResult.success) {
      console.log(`   ✅ Prevención correcta: ${duplicateResult.message}`);
    } else {
      console.log(`   ❌ ERROR: Se permitió doble acreditación!`);
    }

    // 9️⃣ Probar reversión de puntos
    console.log('\n9️⃣  Probando reversión de puntos...');
    const revertResult = await storage.revertLoyaltyPointsFromOrder(order.id);

    if (revertResult.success) {
      console.log(`   ✅ ${revertResult.message}`);
      console.log(`   ↩️  Puntos revertidos: ${revertResult.pointsReverted}`);

      const finalBalance = await storage.getCustomerLoyaltyBalance(customer.id);
      console.log(`   📊 Balance final: ${finalBalance.currentBalance} puntos`);

      if (parseFloat(finalBalance.currentBalance) === initialBalance) {
        console.log(`   ✅ Balance restaurado correctamente!`);
      }
    } else {
      console.log(`   ⚠️  ${revertResult.message}`);
    }

    // 🔟 Resumen final
    console.log('\n' + '='.repeat(80));
    console.log('📊 RESUMEN DE LA PRUEBA');
    console.log('='.repeat(80));
    console.log(`Cliente ID: ${customer.id}`);
    console.log(`Orden ID: ${order.id} (${order.orderNumber})`);
    console.log(`Balance inicial: ${initialBalance} puntos`);
    console.log(`Puntos acreditados: 50 puntos`);
    console.log(`Balance después de acreditar: ${newBalance} puntos`);
    console.log(`Balance después de revertir: ${parseFloat((await storage.getCustomerLoyaltyBalance(customer.id)).currentBalance)} puntos`);
    console.log('='.repeat(80));
    console.log('\n🎉 ¡PRUEBA COMPLETADA EXITOSAMENTE!\n');

  } catch (error) {
    console.error('\n❌ Error durante la prueba:', error);
    process.exit(1);
  }

  process.exit(0);
}

testLoyaltySystem();
