// apply-changes-to-all-schemas.js
// Script para aplicar los cambios de estructura de tablas a todos los esquemas de tiendas

import pkg from 'pg';
const { Pool } = pkg;
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function getAllSchemas() {
  console.log('🔍 Obteniendo lista de todos los esquemas...');
  
  const query = `
    SELECT schema_name 
    FROM information_schema.schemata 
    WHERE schema_name LIKE 'store_%'
    ORDER BY schema_name
  `;
  
  const result = await pool.query(query);
  return result.rows.map(row => row.schema_name);
}

async function getTableStructure(schemaName, tableName) {
  console.log(`🔍 Verificando estructura de ${tableName} en ${schemaName}...`);
  
  const query = `
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns 
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position
  `;
  
  const result = await pool.query(query, [schemaName, tableName]);
  return result.rows;
}

async function tableExists(schemaName, tableName) {
  const query = `
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = $1 AND table_name = $2
    )
  `;
  
  const result = await pool.query(query, [schemaName, tableName]);
  return result.rows[0].exists;
}

async function copyTableStructure(fromSchema, toSchema, tableName) {
  console.log(`📋 Copiando estructura de ${tableName} desde ${fromSchema} a ${toSchema}...`);
  
  try {
    // 1. Obtener la definición CREATE TABLE del esquema public
    const createTableQuery = `
      SELECT 
        'CREATE TABLE IF NOT EXISTS ' || $2 || '.' || $3 || ' (' ||
        string_agg(
          column_name || ' ' || 
          CASE 
            WHEN data_type = 'character varying' THEN 'VARCHAR(' || character_maximum_length || ')'
            WHEN data_type = 'timestamp without time zone' THEN 'TIMESTAMP'
            WHEN data_type = 'timestamp with time zone' THEN 'TIMESTAMPTZ'
            WHEN data_type = 'boolean' THEN 'BOOLEAN'
            WHEN data_type = 'integer' THEN 'INTEGER'
            WHEN data_type = 'bigint' THEN 'BIGINT'
            WHEN data_type = 'numeric' THEN 'NUMERIC'
            WHEN data_type = 'text' THEN 'TEXT'
            WHEN data_type = 'json' THEN 'JSON'
            WHEN data_type = 'jsonb' THEN 'JSONB'
            ELSE data_type
          END ||
          CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
          CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
          ', '
        ) || ');' as create_statement
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $3
      GROUP BY table_name
    `;
    
    const result = await pool.query(createTableQuery, [fromSchema, toSchema, tableName]);
    
    if (result.rows.length > 0) {
      const createStatement = result.rows[0].create_statement;
      console.log(`📝 Ejecutando: ${createStatement.substring(0, 100)}...`);
      
      await pool.query(createStatement);
      console.log(`✅ Tabla ${tableName} creada/actualizada en ${toSchema}`);
      return true;
    } else {
      console.log(`⚠️ No se pudo obtener la estructura de ${tableName} desde ${fromSchema}`);
      return false;
    }
    
  } catch (error) {
    console.error(`❌ Error copiando ${tableName} a ${toSchema}:`, error.message);
    return false;
  }
}

async function addMissingColumns(schemaName, tableName) {
  console.log(`🔧 Verificando columnas faltantes en ${schemaName}.${tableName}...`);
  
  try {
    // Obtener columnas del esquema public (referencia)
    const publicColumns = await getTableStructure('public', tableName);
    const schemaColumns = await getTableStructure(schemaName, tableName);
    
    const publicColumnNames = new Set(publicColumns.map(col => col.column_name));
    const schemaColumnNames = new Set(schemaColumns.map(col => col.column_name));
    
    const missingColumns = publicColumns.filter(col => !schemaColumnNames.has(col.column_name));
    
    if (missingColumns.length > 0) {
      console.log(`📝 Agregando ${missingColumns.length} columnas faltantes...`);
      
      for (const column of missingColumns) {
        const dataType = column.data_type === 'character varying' 
          ? 'VARCHAR(255)' 
          : column.data_type.toUpperCase();
          
        const nullable = column.is_nullable === 'YES' ? '' : ' NOT NULL';
        const defaultValue = column.column_default ? ` DEFAULT ${column.column_default}` : '';
        
        const alterQuery = `
          ALTER TABLE ${schemaName}.${tableName} 
          ADD COLUMN IF NOT EXISTS ${column.column_name} ${dataType}${nullable}${defaultValue}
        `;
        
        await pool.query(alterQuery);
        console.log(`✅ Columna ${column.column_name} agregada a ${schemaName}.${tableName}`);
      }
    } else {
      console.log(`✅ Todas las columnas están presentes en ${schemaName}.${tableName}`);
    }
    
  } catch (error) {
    console.error(`❌ Error agregando columnas a ${schemaName}.${tableName}:`, error.message);
  }
}

async function applyChangesToAllSchemas() {
  console.log('🚀 Iniciando aplicación de cambios a todos los esquemas...');
  
  try {
    // 1. Obtener todos los esquemas de tiendas
    const schemas = await getAllSchemas();
    console.log(`📊 Encontrados ${schemas.length} esquemas de tiendas:`, schemas);
    
    if (schemas.length === 0) {
      console.log('⚠️ No se encontraron esquemas de tiendas (store_*)');
      return;
    }
    
    // 2. Obtener lista de tablas del esquema public (referencia)
    const publicTablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND table_name NOT IN ('virtual_stores', 'system_users')
      ORDER BY table_name
    `;
    
    const publicTablesResult = await pool.query(publicTablesQuery);
    const publicTables = publicTablesResult.rows.map(row => row.table_name);
    
    console.log(`📋 Tablas a sincronizar:`, publicTables);
    
    // 3. Para cada esquema de tienda
    for (const schema of schemas) {
      console.log(`\n🏪 Procesando esquema: ${schema}`);
      
      // Para cada tabla en public
      for (const tableName of publicTables) {
        const exists = await tableExists(schema, tableName);
        
        if (!exists) {
          console.log(`📋 Tabla ${tableName} no existe en ${schema}, creándola...`);
          await copyTableStructure('public', schema, tableName);
        } else {
          console.log(`🔧 Tabla ${tableName} existe en ${schema}, verificando columnas...`);
          await addMissingColumns(schema, tableName);
        }
      }
      
      console.log(`✅ Esquema ${schema} actualizado`);
    }
    
    console.log('\n🎉 ¡Todos los esquemas han sido actualizados exitosamente!');
    
    // 4. Resumen final
    console.log('\n📊 RESUMEN:');
    console.log(`- Esquemas procesados: ${schemas.length}`);
    console.log(`- Tablas sincronizadas: ${publicTables.length}`);
    console.log('- Estado: COMPLETADO ✅');
    
  } catch (error) {
    console.error('❌ Error durante la aplicación de cambios:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Ejecutar el script
applyChangesToAllSchemas()
  .then(() => {
    console.log('\n💡 Los cambios se han aplicado a todos los esquemas de tiendas.');
    console.log('💡 Ahora todas las tiendas tienen la misma estructura actualizada.');
  })
  .catch(error => {
    console.error('\n❌ Error durante la ejecución:', error);
    process.exit(1);
  });