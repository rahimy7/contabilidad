import { getTenantDb } from './server/multi-tenant-db.js';
import * as schema from './shared/schema.js';
import { eq, sql } from 'drizzle-orm';

async function checkLoyaltyBalance() {
  const storeId = 9; // Store ID de la tienda
  
  try {
    console.log('🔍 Conectando a la base de datos del store', storeId, '...\n');
    
    const db = await getTenantDb(storeId);
    
    // Contar clientes
    const customersResult = await db
      .select({ count: sql`count(*)` })
      .from(schema.customers)
      .where(eq(schema.customers.storeId, storeId));
    
    console.log(`📊 Total de clientes: ${customersResult[0].count}\n`);
    
    // Contar balances de puntos
    const balancesResult = await db
      .select({ count: sql`count(*)` })
      .from(schema.customerLoyaltyBalance)
      .where(eq(schema.customerLoyaltyBalance.storeId, storeId));
    
    console.log(`💰 Clientes con loyalty balance: ${balancesResult[0].count}\n`);
    
    // Encontrar clientes sin balance (usando LEFT JOIN)
    const missingBalances = await db
      .select({
        id: schema.customers.id,
        name: schema.customers.name,
        storeId: schema.customers.storeId,
      })
      .from(schema.customers)
      .leftJoin(
        schema.customerLoyaltyBalance,
        eq(schema.customers.id, schema.customerLoyaltyBalance.customerId)
      )
      .where(
        sql`${schema.customers.storeId} = ${storeId} AND ${schema.customerLoyaltyBalance.id} IS NULL`
      );
    
    if (missingBalances.length > 0) {
      console.log(`⚠️  Clientes sin balance de puntos: ${missingBalances.length}\n`);
      console.log('Creando balances para estos clientes...\n');
      
      for (const customer of missingBalances) {
        await db.insert(schema.customerLoyaltyBalance).values({
          customerId: customer.id,
          storeId: customer.storeId,
          currentBalance: '0',
          totalPointsEarned: '0',
          totalPointsRedeemed: '0',
        });
        
        console.log(`✅ Balance creado para: ${customer.name} (ID: ${customer.id})`);
      }
      
      console.log('\n✨ Todos los balances han sido creados!\n');
    } else {
      console.log('✅ Todos los clientes ya tienen balance de puntos\n');
    }
    
    // Mostrar muestra de balances
    const sampleBalances = await db
      .select({
        customerId: schema.customers.id,
        customerName: schema.customers.name,
        currentBalance: schema.customerLoyaltyBalance.currentBalance,
        totalPointsEarned: schema.customerLoyaltyBalance.totalPointsEarned,
        totalPointsRedeemed: schema.customerLoyaltyBalance.totalPointsRedeemed,
        pointsPropertyName: schema.customerLoyaltyBalance.pointsPropertyName,
      })
      .from(schema.customers)
      .leftJoin(
        schema.customerLoyaltyBalance,
        eq(schema.customers.id, schema.customerLoyaltyBalance.customerId)
      )
      .where(eq(schema.customers.storeId, storeId))
      .limit(5);
    
    console.log('📋 Muestra de clientes con sus balances:');
    console.log('═══════════════════════════════════════════════════════════\n');
    for (const row of sampleBalances) {
      console.log(`Cliente: ${row.customerName} (ID: ${row.customerId})`);
      if (row.currentBalance !== null) {
        console.log(`  Balance actual: ${row.currentBalance}`);
        console.log(`  Total ganado: ${row.totalPointsEarned}`);
        console.log(`  Total canjeado: ${row.totalPointsRedeemed}`);
        console.log(`  Nombre de puntos: ${row.pointsPropertyName || 'No configurado'}`);
      } else {
        console.log(`  ⚠️  Sin balance de puntos`);
      }
      console.log('');
    }
    
    console.log('✅ Verificación completada\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
  
  process.exit(0);
}

checkLoyaltyBalance();
