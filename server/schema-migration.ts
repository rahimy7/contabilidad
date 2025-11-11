import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq } from 'drizzle-orm';
import ws from "ws";
import * as schema from "@shared/schema";

// Configurar WebSocket para Neon
// @ts-ignore
globalThis.WebSocket = ws;

// Schema de referencia para copiar estructura de tablas
const MODEL_SCHEMA = 'store_6';

export interface MigrationResult {
  success: boolean;
  storeId: number;
  storeName: string;
  schemaName: string;
  migratedTables: string[];
  errors: string[];
  summary: {
    totalTables: number;
    migratedSuccessfully: number;
    errors: number;
  };
}

/**
 * Migra todas las tablas de una tienda desde el schema global al schema específico
 */
export async function migrateStoreToSeparateSchema(storeId: number): Promise<MigrationResult> {
  const masterPool = new Pool({ connectionString: process.env.DATABASE_URL });
  const masterDb = drizzle({ client: masterPool, schema });
  
  console.log(`🔄 Iniciando migración de tienda ID: ${storeId}`);
  
  try {
    // Obtener información de la tienda
    const [store] = await masterDb
      .select()
      .from(schema.virtualStores)
      .where(eq(schema.virtualStores.id, storeId))
      .limit(1);

    if (!store) {
      throw new Error(`Tienda con ID ${storeId} no encontrada`);
    }

    // Generar nombre del schema (siempre store_ID)
    const schemaName = `store_${storeId}`;
    
    console.log(`📋 Migrando tienda: ${store.name} al schema: ${schemaName}`);

    const result: MigrationResult = {
      success: false,
      storeId,
      storeName: store.name,
      schemaName,
      migratedTables: [],
      errors: [],
      summary: {
        totalTables: 0,
        migratedSuccessfully: 0,
        errors: 0
      }
    };

    // Crear schema si no existe
    await masterPool.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
    console.log(`✅ Schema "${schemaName}" creado/verificado`);

    // Obtener dinámicamente las tablas del schema de referencia (modelo)
    console.log(`🔍 Leyendo estructura de tablas del ${MODEL_SCHEMA} (modelo)...`);
    const tablesQuery = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    const tablesResult = await masterPool.query(tablesQuery, [MODEL_SCHEMA]);
    const modelTables = tablesResult.rows.map((row: any) => row.table_name);

    if (modelTables.length === 0) {
      throw new Error(`No se encontraron tablas en el schema modelo ${MODEL_SCHEMA}. Asegúrate que ${MODEL_SCHEMA} existe.`);
    }

    console.log(`📋 Tablas encontradas en ${MODEL_SCHEMA}: ${modelTables.join(', ')}`);
    result.summary.totalTables = modelTables.length;

    // Migrar cada tabla copiando la estructura del schema modelo
    for (const tableName of modelTables) {
      try {
        console.log(`🔄 Migrando tabla: ${tableName}`);

        // Verificar si la tabla ya existe en el schema de destino
        const tableExistsQuery = `
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = $1 AND table_name = $2
          )
        `;
        const tableExistsResult = await masterPool.query(tableExistsQuery, [schemaName, tableName]);
        const tableExists = tableExistsResult.rows[0].exists;

        if (tableExists) {
          console.log(`⚠️ Tabla ${tableName} ya existe en schema ${schemaName}, omitiendo`);
          continue;
        }

        // Crear tabla en el nuevo schema copiando estructura del modelo
        const createTableQuery = `
          CREATE TABLE "${schemaName}"."${tableName}"
          (LIKE "${MODEL_SCHEMA}"."${tableName}" INCLUDING ALL)
        `;
        await masterPool.query(createTableQuery);
        console.log(`✅ Estructura de tabla ${tableName} creada en ${schemaName} (copiada de ${MODEL_SCHEMA})`);

        // Copiar datos específicos de la tienda (donde sea aplicable)
        if (await hasStoreIdColumnInSchema(masterPool, MODEL_SCHEMA, tableName)) {
          const copyDataQuery = `
            INSERT INTO "${schemaName}"."${tableName}"
            SELECT * FROM "${MODEL_SCHEMA}"."${tableName}"
            WHERE store_id = $1
          `;
          const copyResult = await masterPool.query(copyDataQuery, [storeId]);
          console.log(`✅ ${copyResult.rowCount} registros copiados para ${tableName}`);
        } else {
          // Para tablas sin store_id, copiar todo (como auto_responses, system tables)
          const copyAllQuery = `
            INSERT INTO "${schemaName}"."${tableName}"
            SELECT * FROM "${MODEL_SCHEMA}"."${tableName}"
          `;
          const copyResult = await masterPool.query(copyAllQuery);
          console.log(`✅ ${copyResult.rowCount} registros copiados para ${tableName} (sin filtro)`);
        }

        result.migratedTables.push(tableName);
        result.summary.migratedSuccessfully++;

      } catch (error) {
        const errorMsg = `Error migrando ${tableName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(`❌ ${errorMsg}`);
        result.errors.push(errorMsg);
        result.summary.errors++;
      }
    }

    // Actualizar la URL de la tienda para usar el schema correcto
    const newDatabaseUrl = store.databaseUrl?.includes('?schema=') 
      ? store.databaseUrl.replace(/schema=[^&]+/, `schema=${schemaName}`)
      : `${store.databaseUrl}?schema=${schemaName}`;

    await masterDb
      .update(schema.virtualStores)
      .set({ databaseUrl: newDatabaseUrl })
      .where(eq(schema.virtualStores.id, storeId));

    console.log(`✅ URL de BD actualizada para ${store.name}: ${newDatabaseUrl}`);

    result.success = result.summary.errors === 0;
    console.log(`🏁 Migración completada para ${store.name}. Éxito: ${result.success}`);

    await masterPool.end();
    return result;

  } catch (error) {
    console.error(`❌ Error durante migración:`, error);
    await masterPool.end();
    throw error;
  }
}

/**
 * Verifica si una tabla en un schema específico tiene columna store_id
 */
async function hasStoreIdColumnInSchema(pool: Pool, schemaName: string, tableName: string): Promise<boolean> {
  try {
    const query = `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = $1
        AND table_name = $2
        AND column_name = 'store_id'
      )
    `;
    const result = await pool.query(query, [schemaName, tableName]);
    return result.rows[0].exists;
  } catch (error) {
    console.error(`Error verificando columna store_id en ${schemaName}.${tableName}:`, error);
    return false;
  }
}

/**
 * Calcula la capacidad máxima de tiendas basada en limitaciones de PostgreSQL
 */
export function calculateStoreCapacity(): {
  maxSchemas: number;
  maxStores: number;
  currentStores: number;
  availableCapacity: number;
  limitations: string[];
} {
  // PostgreSQL permite hasta 100 schemas por defecto, pero puede configurarse hasta 2^32
  const maxSchemas = 100; // Límite conservador
  const reservedSchemas = 10; // public, information_schema, pg_catalog, etc.
  const maxStores = maxSchemas - reservedSchemas;
  const currentStores = 1; // Solo PECADORES ANONIMOS
  
  return {
    maxSchemas,
    maxStores,
    currentStores,
    availableCapacity: maxStores - currentStores,
    limitations: [
      'PostgreSQL permite hasta 100 schemas por defecto',
      'Neon Database plan gratuito: 1 base de datos, schemas ilimitados', 
      'Cada tienda usa 1 schema con ~15 tablas',
      'Plan pago Neon: múltiples bases de datos disponibles',
      'Recursos de conexión: hasta 1000 conexiones concurrentes'
    ]
  };
}

/**
 * Valida si el sistema puede soportar N tiendas adicionales
 */
export function validateCapacityForNewStores(newStores: number): {
  canSupport: boolean;
  maxPossible: number;
  recommendations: string[];
} {
  const capacity = calculateStoreCapacity();
  const totalRequired = capacity.currentStores + newStores;
  
  return {
    canSupport: totalRequired <= capacity.maxStores,
    maxPossible: capacity.availableCapacity,
    recommendations: totalRequired > capacity.maxStores ? [
      'Considerar upgrade a plan pago de Neon para múltiples bases de datos',
      'Implementar particionado horizontal para grandes volúmenes',
      'Evaluar migración a PostgreSQL autohospedado'
    ] : [
      'Capacidad suficiente con configuración actual',
      'Monitorear uso de recursos conforme se agreguen tiendas'
    ]
  };
}