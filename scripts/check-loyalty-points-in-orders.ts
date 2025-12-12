// Script para verificar qué órdenes tienen puntos de lealtad configurados
import { getTenantDb } from '../server/multi-tenant-db.js';

const STORE_ID = 16;

async function checkLoyaltyPoints() {
  console.log('🔍 Verificando órdenes con loyalty points\n');
  console.log('='.repeat(80));

  const db = await getTenantDb(STORE_ID);

  // Ver todas las órdenes con sus puntos
  const result = await db.execute(`
    SELECT
      o.id,
      o.order_number,
      o.customer_id,
      o.status,
      o.loyalty_points_total,
      o.loyalty_points_credited,
      o.loyalty_points_credited_at,
      o.loyalty_points_property_name,
      o.loyalty_points_value,
      c.name as customer_name,
      c.phone as customer_phone,
      (SELECT current_balance FROM store_${STORE_ID}.customer_loyalty_balance WHERE customer_id = o.customer_id) as customer_balance
    FROM store_${STORE_ID}.orders o
    JOIN store_${STORE_ID}.customers c ON o.customer_id = c.id
    WHERE o.status != 'cancelled'
    ORDER BY o.created_at DESC
    LIMIT 10
  `);

  console.log(`\n📊 Últimas 10 órdenes:\n`);

  result.rows.forEach((order: any, i: number) => {
    console.log(`${i + 1}. Orden #${order.order_number} (ID: ${order.id})`);
    console.log(`   Cliente: ${order.customer_name} (${order.customer_phone})`);
    console.log(`   Estado: ${order.status}`);
    console.log(`   Puntos totales: ${order.loyalty_points_total || '0'}`);
    console.log(`   Puntos acreditados: ${order.loyalty_points_credited ? '✅ Sí' : '❌ No'}`);
    if (order.loyalty_points_credited_at) {
      console.log(`   Fecha acreditación: ${order.loyalty_points_credited_at}`);
    }
    console.log(`   Balance del cliente: ${order.customer_balance || '0'} puntos`);
    console.log('');
  });

  // Resumen
  const stats = result.rows.reduce((acc: any, order: any) => {
    const points = parseFloat(order.loyalty_points_total || '0');
    if (points > 0) acc.withPoints++;
    if (order.loyalty_points_credited) acc.credited++;
    return acc;
  }, { withPoints: 0, credited: 0 });

  console.log('='.repeat(80));
  console.log(`📊 Resumen:`);
  console.log(`   Total órdenes revisadas: ${result.rows.length}`);
  console.log(`   Órdenes con puntos (> 0): ${stats.withPoints}`);
  console.log(`   Órdenes con puntos acreditados: ${stats.credited}`);
  console.log('='.repeat(80));

  process.exit(0);
}

checkLoyaltyPoints();
