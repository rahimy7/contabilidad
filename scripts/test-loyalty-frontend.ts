// Script de prueba para simular el flujo del frontend
// Simula exactamente lo que hace el modal de order-detail cuando cambia el estado

import { getTenantDb } from '../server/multi-tenant-db.js';
import { createTenantStorage } from '../server/tenant-storage.js';

const STORE_ID = 16; // MINI MARKET EL RUBIO
const TEST_ORDER_ID = process.argv[2] ? parseInt(process.argv[2]) : null;

async function testFrontendFlow() {
  console.log('🧪 PRUEBA DE FLUJO FRONTEND - LOYALTY POINTS\n');
  console.log('='.repeat(80));

  try {
    const db = await getTenantDb(STORE_ID);
    const storage = createTenantStorage(db, STORE_ID);

    // Paso 1: Buscar una orden con puntos
    let orderId = TEST_ORDER_ID;

    if (!orderId) {
      console.log('\n📊 Buscando orden con puntos de lealtad...');

      const orders = await db.execute(`
        SELECT id, order_number, customer_id, status, loyalty_points_total, loyalty_points_credited
        FROM store_${STORE_ID}.orders
        WHERE loyalty_points_total > 0
          AND status != 'completed'
          AND status != 'cancelled'
        ORDER BY created_at DESC
        LIMIT 5
      `);

      if (!orders.rows || orders.rows.length === 0) {
        console.log('⚠️  No se encontraron órdenes con puntos pendientes');
        console.log('   Creando orden de prueba...\n');

        // Crear cliente de prueba
        let customer = await storage.getCustomerByPhone('8099998888');
        if (!customer) {
          customer = await storage.createCustomer({
            name: 'Cliente Prueba Loyalty Frontend',
            phone: '8099998888',
            storeId: STORE_ID,
          });
        }

        // Crear orden de prueba con puntos
        const newOrder = await storage.createOrder({
          customerId: customer.id,
          storeId: STORE_ID,
          status: 'pending',
          priority: 'normal',
          totalAmount: '1000.00',
          loyaltyPointsTotal: 100,
          loyaltyPointsPropertyName: 'puntos',
          loyaltyPointsValue: 1,
          description: 'Orden de prueba para frontend',
        }, []);

        orderId = newOrder.id;
        console.log(`   ✅ Orden creada: ID ${orderId}, Número: ${newOrder.orderNumber}`);
      } else {
        console.log(`   ✅ Encontradas ${orders.rows.length} órdenes con puntos\n`);
        console.log('   Órdenes disponibles:');
        orders.rows.forEach((order: any, i: number) => {
          console.log(`      ${i + 1}. ID: ${order.id}, Número: ${order.order_number}, Estado: ${order.status}, Puntos: ${order.loyalty_points_total}`);
        });

        orderId = orders.rows[0].id;
        console.log(`\n   📍 Usando orden: ID ${orderId}`);
      }
    }

    // Paso 2: Obtener información de la orden
    console.log('\n' + '='.repeat(80));
    console.log('📦 INFORMACIÓN DE LA ORDEN\n');

    const order = await storage.getOrderById(orderId);
    if (!order) {
      console.error(`❌ No se encontró la orden ${orderId}`);
      process.exit(1);
    }

    console.log(`   ID: ${order.id}`);
    console.log(`   Número: ${order.orderNumber}`);
    console.log(`   Cliente ID: ${order.customerId}`);
    console.log(`   Estado actual: ${order.status}`);
    console.log(`   Puntos totales: ${order.loyaltyPointsTotal}`);
    console.log(`   Puntos acreditados: ${order.loyaltyPointsCredited || false}`);

    // Paso 3: Obtener balance del cliente ANTES
    const customer = await storage.getCustomerById(order.customerId);
    console.log(`   Cliente: ${customer.name} (${customer.phone})`);
    console.log(`   Tiene padre: ${customer.parentCustomerId ? 'Sí (ID: ' + customer.parentCustomerId + ')' : 'No'}`);

    let balance = await storage.getCustomerLoyaltyBalance(order.customerId);
    if (!balance) {
      console.log(`   ⚠️  No tiene balance de puntos, creando...`);
      const [newBalance] = await db.insert(storage.schema.customerLoyaltyBalance)
        .values({
          customerId: order.customerId,
          storeId: STORE_ID,
          currentBalance: '0',
          totalPointsEarned: '0',
          totalPointsRedeemed: '0',
        })
        .returning();
      balance = newBalance;
    }

    const balanceBefore = parseFloat(balance.currentBalance || '0');
    console.log(`   Balance ANTES: ${balanceBefore} puntos`);

    // Paso 4: SIMULAR LO QUE HACE EL FRONTEND
    console.log('\n' + '='.repeat(80));
    console.log('🔄 SIMULANDO ACTUALIZACIÓN DESDE FRONTEND\n');
    console.log('   Endpoint: PATCH /api/orders/:id/status');
    console.log('   Payload: { status: "completed" }');
    console.log('');

    // Simular exactamente lo que hace order-detail-modal.tsx:127-135
    if (order.status !== 'completed') {
      console.log('   ⏳ Cambiando estado a "completed"...\n');

      // Esto es lo que hace el servidor en PATCH /orders/:id/status
      const previousStatus = order.status;

      // Actualizar orden
      await storage.updateOrder(orderId, {
        status: 'completed',
        updatedAt: new Date()
      });

      console.log(`   ✅ Estado actualizado: ${previousStatus} → completed`);

      // Acreditar puntos (esto ahora debería ejecutarse automáticamente en el endpoint)
      console.log('\n   🎁 Ejecutando acreditación de loyalty points...\n');

      const result = await storage.creditLoyaltyPointsFromOrder(orderId);

      if (result.success) {
        console.log(`   ✅ ${result.message}`);
        console.log(`   💰 Puntos acreditados: ${result.pointsAwarded}`);
        console.log(`   👥 Clientes afectados: ${result.customersAffected.join(', ')}`);
      } else {
        console.log(`   ⚠️  ${result.message}`);
      }
    } else {
      console.log('   ℹ️  La orden ya estaba completada');
    }

    // Paso 5: Verificar balance DESPUÉS
    console.log('\n' + '='.repeat(80));
    console.log('📊 VERIFICACIÓN POST-ACREDITACIÓN\n');

    const updatedOrder = await storage.getOrderById(orderId);
    const updatedBalance = await storage.getCustomerLoyaltyBalance(order.customerId);
    const balanceAfter = parseFloat(updatedBalance.currentBalance || '0');

    console.log(`   Balance ANTES:  ${balanceBefore} puntos`);
    console.log(`   Balance DESPUÉS: ${balanceAfter} puntos`);
    console.log(`   Incremento:     ${balanceAfter - balanceBefore} puntos`);
    console.log('');
    console.log(`   Orden marcada como acreditada: ${updatedOrder.loyaltyPointsCredited}`);
    console.log(`   Fecha de acreditación: ${updatedOrder.loyaltyPointsCreditedAt || 'N/A'}`);

    // Paso 6: Verificar transacciones
    console.log('\n' + '='.repeat(80));
    console.log('📝 TRANSACCIONES CREADAS\n');

    const transactions = await db
      .select()
      .from(storage.schema.loyaltyPointsTransactions)
      .where(storage.schema.loyaltyPointsTransactions.orderId.eq(orderId))
      .orderBy(storage.schema.loyaltyPointsTransactions.createdAt);

    if (transactions.length > 0) {
      console.log(`   ✅ Se crearon ${transactions.length} transacción(es):\n`);
      transactions.forEach((t: any, i: number) => {
        console.log(`   ${i + 1}. Cliente ${t.customerId}:`);
        console.log(`      Tipo: ${t.type}`);
        console.log(`      Puntos: ${t.points}`);
        console.log(`      Balance: ${t.balanceBefore} → ${t.balanceAfter}`);
        console.log(`      Descripción: "${t.description}"`);
        console.log('');
      });
    } else {
      console.log('   ⚠️  No se encontraron transacciones');
    }

    // Paso 7: Verificar cliente padre (si existe)
    if (customer.parentCustomerId) {
      console.log('='.repeat(80));
      console.log('👨‍👦 VERIFICACIÓN DE CLIENTE PADRE\n');

      const parentCustomer = await storage.getCustomerById(customer.parentCustomerId);
      const parentBalance = await storage.getCustomerLoyaltyBalance(customer.parentCustomerId);

      console.log(`   Padre: ${parentCustomer.name} (ID: ${parentCustomer.id})`);
      console.log(`   Balance del padre: ${parentBalance.currentBalance} puntos`);

      const parentTransactions = await db
        .select()
        .from(storage.schema.loyaltyPointsTransactions)
        .where(storage.schema.loyaltyPointsTransactions.orderId.eq(orderId))
        .where(storage.schema.loyaltyPointsTransactions.customerId.eq(customer.parentCustomerId));

      if (parentTransactions.length > 0) {
        console.log(`   ✅ Transacción del padre encontrada:`);
        console.log(`      Puntos: ${parentTransactions[0].points}`);
        console.log(`      Descripción: "${parentTransactions[0].description}"`);
      }
    }

    // Resumen final
    console.log('\n' + '='.repeat(80));
    console.log('✅ PRUEBA COMPLETADA EXITOSAMENTE\n');
    console.log('   Orden ID: ' + orderId);
    console.log('   Estado: completed');
    console.log('   Puntos acreditados: ' + result.pointsAwarded);
    console.log('   Balance actualizado correctamente: ' + (balanceAfter === balanceBefore + result.pointsAwarded ? '✅' : '❌'));
    console.log('   Orden marcada como acreditada: ' + (updatedOrder.loyaltyPointsCredited ? '✅' : '❌'));
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n❌ Error durante la prueba:', error);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }

  process.exit(0);
}

testFrontendFlow();
