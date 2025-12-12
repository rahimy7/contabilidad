// Script simple para verificar los campos de loyalty
import { getTenantDb } from '../server/multi-tenant-db.js';

async function verify() {
  console.log('🔍 Verificando campos de loyalty points...\n');

  const storeIds = [6, 16, 17, 18];

  for (const storeId of storeIds) {
    try {
      console.log(`📊 Verificando store ${storeId}...`);

      const db = await getTenantDb(storeId);

      const result = await db.execute(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'store_${storeId}'
          AND table_name = 'orders'
          AND column_name IN ('loyalty_points_credited', 'loyalty_points_credited_at')
        ORDER BY column_name;
      `);

      if (result.rows && result.rows.length > 0) {
        console.log(`   ✅ Campos encontrados: ${result.rows.length}`);
        result.rows.forEach((row: any) => {
          console.log(`      - ${row.column_name}: ${row.data_type}`);
        });
      } else {
        console.log(`   ⚠️  Campos NO encontrados. Ejecutando migración...`);

        // Ejecutar migración
        await db.execute(`
          ALTER TABLE store_${storeId}.orders
          ADD COLUMN IF NOT EXISTS loyalty_points_credited BOOLEAN DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS loyalty_points_credited_at TIMESTAMP;
        `);

        console.log(`   ✅ Migración ejecutada para store ${storeId}`);
      }

      console.log('');

    } catch (error) {
      console.error(`   ❌ Error en store ${storeId}:`, error.message);
      console.log('');
    }
  }

  console.log('✅ Verificación completada');
  process.exit(0);
}

verify();
