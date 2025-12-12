// Script para crear una orden de prueba con loyalty points
import { getTenantDb } from '../server/multi-tenant-db.js';
import { createTenantStorage } from '../server/tenant-storage.js';

const STORE_ID = 16;

async function createTestOrder() {
  console.log('🎁 Creando orden de prueba con loyalty points\n');
  console.log('='.repeat(80));

  const db = await getTenantDb(STORE_ID);
  const storage = createTenantStorage(db, STORE_ID);

  // 1. Buscar o crear cliente de prueba
  console.log('1️⃣  Buscando cliente de prueba...');
  let customer = await storage.getCustomerByPhone('8099991111');

  if (!customer) {
    customer = await storage.createCustomer({
      name: 'Cliente Prueba Loyalty System',
      phone: '8099991111',
      storeId: STORE_ID,
    });
    console.log(`   ✅ Cliente creado: ${customer.name} (ID: ${customer.id})`);
  } else {
    console.log(`   ✅ Cliente existente: ${customer.name} (ID: ${customer.id})`);
  }

  // 2. Crear balance de puntos
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
    console.log(`   ✅ Balance de puntos creado`);
  }

  const initialBalance = parseFloat(balance.currentBalance || '0');
  console.log(`   📊 Balance inicial: ${initialBalance} puntos\n`);

  // 3. Crear orden con 150 puntos de lealtad
  console.log('2️⃣  Creando orden con 150 puntos...');

  const order = await storage.createOrder({
    customerId: customer.id,
    storeId: STORE_ID,
    status: 'pending',
    priority: 'normal',
    totalAmount: '1500.00',
    loyaltyPointsTotal: 150,  // ✅ 150 puntos
    loyaltyPointsPropertyName: 'puntos',
    loyaltyPointsValue: 1,
    description: 'Orden de prueba para sistema de loyalty points',
  }, []);

  console.log(`   ✅ Orden creada:`);
  console.log(`      ID: ${order.id}`);
  console.log(`      Número: ${order.orderNumber}`);
  console.log(`      Estado: ${order.status}`);
  console.log(`      Puntos: ${order.loyaltyPointsTotal}`);
  console.log(`      Acreditados: ${order.loyaltyPointsCredited}`);

  console.log('\n' + '='.repeat(80));
  console.log('✅ ORDEN LISTA PARA PRUEBA\n');
  console.log(`   Para completar la orden y acreditar puntos:`);
  console.log(`   1. Ve a: http://localhost:5000/orders`);
  console.log(`   2. Busca la orden: ${order.orderNumber}`);
  console.log(`   3. Haz clic en "Ver" para abrir el modal`);
  console.log(`   4. Cambia el estado a "Completado"`);
  console.log(`   5. Revisa los logs del servidor\n`);
  console.log(`   O ejecuta este comando:`);
  console.log(`   npx tsx scripts/complete-order-test.ts ${order.id}`);
  console.log('='.repeat(80));

  process.exit(0);
}

createTestOrder();
