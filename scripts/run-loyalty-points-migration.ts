// Script para ejecutar la migración de loyalty points en todas las tiendas
import { Pool } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración de la base de datos maestra
const masterPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  console.log('🚀 Iniciando migración de loyalty points credited fields...\n');

  try {
    // 1. Obtener todas las tiendas activas
    const { rows: stores } = await masterPool.query(`
      SELECT id, name, slug, database_url
      FROM virtual_stores
      WHERE is_active = true
      ORDER BY id
    `);

    console.log(`📊 Se encontraron ${stores.length} tiendas activas\n`);

    // 2. Leer el archivo de migración
    const migrationPath = path.join(__dirname, '../migrations/add-loyalty-points-credited-field.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log('📄 Archivo de migración cargado\n');

    // 3. Ejecutar la migración en cada tienda
    let successCount = 0;
    let errorCount = 0;

    for (const store of stores) {
      try {
        console.log(`🔄 Procesando: ${store.name} (ID: ${store.id}, Schema: store_${store.id})`);

        // Conectar a la base de datos de la tienda
        const tenantPool = new Pool({
          connectionString: store.database_url,
        });

        // Ejecutar migración en el schema de la tienda
        await tenantPool.query(`SET search_path TO store_${store.id}`);
        await tenantPool.query(migrationSQL);

        await tenantPool.end();

        console.log(`   ✅ Migración exitosa para ${store.name}\n`);
        successCount++;

      } catch (error) {
        console.error(`   ❌ Error en ${store.name}:`, error.message);
        errorCount++;
      }
    }

    // 4. Resumen final
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DE MIGRACIÓN');
    console.log('='.repeat(60));
    console.log(`Total de tiendas:        ${stores.length}`);
    console.log(`Migraciones exitosas:    ${successCount} ✅`);
    console.log(`Errores:                 ${errorCount} ❌`);
    console.log('='.repeat(60));

    if (errorCount === 0) {
      console.log('\n🎉 ¡Migración completada exitosamente en todas las tiendas!');
    } else {
      console.log('\n⚠️  Migración completada con algunos errores. Revisa los logs arriba.');
    }

  } catch (error) {
    console.error('\n❌ Error fatal durante la migración:', error);
    process.exit(1);
  } finally {
    await masterPool.end();
  }
}

// Ejecutar migración
runMigration()
  .then(() => {
    console.log('\n✅ Script de migración finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error ejecutando script:', error);
    process.exit(1);
  });
