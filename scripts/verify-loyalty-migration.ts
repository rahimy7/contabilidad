// Script para verificar si la migración fue aplicada correctamente
import { Pool } from '@neondatabase/serverless';

const masterPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function verifyMigration() {
  console.log('🔍 Verificando migración de loyalty points...\n');

  try {
    // Obtener todas las tiendas
    const { rows: stores } = await masterPool.query(`
      SELECT id, name, slug, database_url, is_active
      FROM virtual_stores
      ORDER BY id
    `);

    console.log(`📊 Total de tiendas: ${stores.length}\n`);
    console.log('='.repeat(80));

    for (const store of stores) {
      try {
        console.log(`\n🏪 ${store.name} (ID: ${store.id}) - ${store.is_active ? 'ACTIVA' : 'INACTIVA'}`);
        console.log(`   Schema: store_${store.id}`);

        const tenantPool = new Pool({
          connectionString: store.database_url,
        });

        // Verificar si los campos existen
        const { rows } = await tenantPool.query(`
          SET search_path TO store_${store.id};
          SELECT
            column_name,
            data_type,
            is_nullable
          FROM information_schema.columns
          WHERE table_name = 'orders'
            AND column_name IN ('loyalty_points_credited', 'loyalty_points_credited_at')
          ORDER BY column_name;
        `);

        if (rows.length === 2) {
          console.log('   ✅ Migración aplicada correctamente');
          rows.forEach(col => {
            console.log(`      - ${col.column_name}: ${col.data_type}`);
          });
        } else if (rows.length === 1) {
          console.log('   ⚠️  Migración parcial (solo 1 campo)');
          rows.forEach(col => {
            console.log(`      - ${col.column_name}: ${col.data_type}`);
          });
        } else {
          console.log('   ❌ Migración NO aplicada');
        }

        await tenantPool.end();

      } catch (storeError) {
        console.log(`   ❌ Error verificando: ${storeError.message}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Verificación completada');

  } catch (error) {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  } finally {
    await masterPool.end();
  }
}

verifyMigration();
