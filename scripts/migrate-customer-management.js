// Script para ejecutar la migración del sistema de gestión de clientes en todos los esquemas
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración de la base de datos maestra
const masterConnectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/delivery_db';

async function migrateAllStores() {
  console.log('🚀 Iniciando migración del sistema de gestión de clientes...\n');

  // Conexión a la base de datos maestra
  const masterSql = postgres(masterConnectionString);
  const masterDb = drizzle(masterSql);

  try {
    // Obtener todas las tiendas activas
    const stores = await masterSql`
      SELECT id, name, slug, database_url
      FROM virtual_stores
      WHERE is_active = true
      ORDER BY id
    `;

    console.log(`📊 Encontradas ${stores.length} tienda(s) activa(s)\n`);

    if (stores.length === 0) {
      console.log('⚠️  No hay tiendas activas para migrar');
      await masterSql.end();
      return;
    }

    // Leer el archivo SQL de migración
    const migrationPath = path.join(__dirname, '..', 'migrations', 'add-customer-management-system.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    let successCount = 0;
    let errorCount = 0;

    // Ejecutar migración en cada tienda
    for (const store of stores) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🏪 Procesando tienda: ${store.name} (ID: ${store.id})`);
      console.log(`${'='.repeat(60)}`);

      try {
        // Extraer el nombre del esquema de la URL de la base de datos
        const dbUrl = store.database_url;
        const schemaMatch = dbUrl.match(/schema=([^&]+)/);

        if (!schemaMatch) {
          console.error(`❌ No se pudo extraer el esquema de la URL de la tienda ${store.id}`);
          errorCount++;
          continue;
        }

        const schemaName = schemaMatch[1];
        console.log(`📂 Esquema: ${schemaName}`);

        // Conectar a la base de datos de la tienda
        const storeSql = postgres(dbUrl);

        // Ejecutar la migración
        console.log('📝 Ejecutando migración...');

        // Establecer el search_path al esquema de la tienda
        await storeSql`SET search_path TO ${storeSql(schemaName)}, public`;

        // Dividir el SQL en comandos individuales y ejecutarlos
        const commands = migrationSQL
          .split(';')
          .map(cmd => cmd.trim())
          .filter(cmd => cmd.length > 0 && !cmd.startsWith('--') && !cmd.startsWith('/*'));

        let tablesCreated = 0;
        let tablesSkipped = 0;

        for (const command of commands) {
          // Saltar comentarios y comandos vacíos
          if (!command || command.startsWith('--') || command.startsWith('COMMENT ON')) {
            continue;
          }

          if (command.includes('CREATE TABLE') ||
              command.includes('CREATE INDEX') ||
              command.includes('ALTER TABLE')) {
            try {
              await storeSql.unsafe(command);
              if (command.includes('CREATE TABLE')) {
                tablesCreated++;
                console.log(`   ✓ Tabla creada`);
              }
            } catch (error) {
              // Si la tabla ya existe, continuar
              if (error.code === '42P07' || error.message.includes('already exists')) {
                if (command.includes('CREATE TABLE')) {
                  tablesSkipped++;
                  console.log(`   ⊙ Tabla ya existe, omitida`);
                }
                continue;
              }
              // Si es un error de columna que ya existe en ALTER TABLE, continuar
              if (error.code === '42701' || error.message.includes('column') && error.message.includes('already exists')) {
                console.log(`   ⊙ Columna ya existe, omitida`);
                continue;
              }
              // Mostrar detalles del error para debugging
              console.error(`   ❌ Error en comando: ${command.substring(0, 100)}...`);
              throw error;
            }
          }
        }

        if (tablesSkipped > 0) {
          console.log(`⚠️  ${tablesSkipped} tabla(s) ya existían, fueron omitidas`);
        }
        if (tablesCreated > 0) {
          console.log(`✅ ${tablesCreated} tabla(s) creada(s) exitosamente`);
        }

        // Insertar tipos de clientes por defecto
        console.log('📦 Insertando tipos de clientes por defecto...');
        await storeSql`
          INSERT INTO ${storeSql(schemaName)}.customer_types
            (store_id, name, description, discount_percentage, color, sort_order)
          VALUES
            (${store.id}, 'Minorista', 'Cliente minorista estándar', 0.00, '#3b82f6', 1),
            (${store.id}, 'Mayorista', 'Cliente que compra al por mayor', 10.00, '#10b981', 2),
            (${store.id}, 'Revendedor', 'Socio revendedor autorizado', 15.00, '#f59e0b', 3),
            (${store.id}, 'Distribuidor', 'Distribuidor oficial', 20.00, '#8b5cf6', 4)
          ON CONFLICT DO NOTHING
        `;

        // Actualizar clientes existentes con valores por defecto
        console.log('🔄 Actualizando clientes existentes...');
        const updateResult = await storeSql`
          UPDATE ${storeSql(schemaName)}.customers
          SET
            category = COALESCE(category, 'regular'),
            is_active = COALESCE(is_active, true)
          WHERE category IS NULL OR is_active IS NULL
        `;

        console.log(`✅ Migración completada exitosamente`);
        console.log(`   - Tipos de clientes creados: 4`);
        console.log(`   - Clientes actualizados: ${updateResult.count || 0}`);

        successCount++;
        await storeSql.end();

      } catch (error) {
        console.error(`❌ Error al procesar tienda ${store.name}:`, error.message);
        console.error(`   Detalles:`, error);
        errorCount++;
      }
    }

    // Resumen final
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 RESUMEN DE MIGRACIÓN');
    console.log(`${'='.repeat(60)}`);
    console.log(`✅ Tiendas migradas exitosamente: ${successCount}`);
    console.log(`❌ Tiendas con errores: ${errorCount}`);
    console.log(`📦 Total de tiendas procesadas: ${stores.length}`);
    console.log(`${'='.repeat(60)}\n`);

    if (successCount === stores.length) {
      console.log('🎉 ¡Migración completada con éxito en todas las tiendas!');
    } else if (successCount > 0) {
      console.log('⚠️  Migración completada con algunas advertencias');
    } else {
      console.log('❌ La migración falló en todas las tiendas');
    }

  } catch (error) {
    console.error('❌ Error crítico durante la migración:', error);
    throw error;
  } finally {
    await masterSql.end();
  }
}

// Ejecutar la migración
migrateAllStores()
  .then(() => {
    console.log('\n✨ Proceso de migración finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Error fatal:', error);
    process.exit(1);
  });
