import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Iniciando migración: Agregar columnas de productos pendientes...\n');
    
    // Obtener todos los schemas que empiecen con "store_"
    const schemasResult = await client.query(`
      SELECT nspname 
      FROM pg_namespace 
      WHERE nspname LIKE 'store_%'
      ORDER BY nspname
    `);
    
    const schemas = schemasResult.rows.map(r => r.nspname);
    console.log(`📋 Encontrados ${schemas.length} schemas de tiendas: ${schemas.join(', ')}\n`);
    
    for (const schemaName of schemas) {
      console.log(`\n📦 Procesando schema: ${schemaName}`);
      
      // Verificar si existe la tabla ai_conversations
      const tableExists = await client.query(`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.tables 
          WHERE table_schema = $1 
          AND table_name = 'ai_conversations'
        )
      `, [schemaName]);
      
      if (!tableExists.rows[0].exists) {
        console.log(`  ⚠️  Tabla ai_conversations no existe en ${schemaName}`);
        continue;
      }
      
      // Verificar si ya existe pending_product_selection
      const col1Exists = await client.query(`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_schema = $1 
          AND table_name = 'ai_conversations' 
          AND column_name = 'pending_product_selection'
        )
      `, [schemaName]);
      
      if (!col1Exists.rows[0].exists) {
        await client.query(`
          ALTER TABLE ${schemaName}.ai_conversations 
          ADD COLUMN pending_product_selection TEXT
        `);
        console.log(`  ✅ Agregada columna pending_product_selection`);
      } else {
        console.log(`  ℹ️  Columna pending_product_selection ya existe`);
      }
      
      // Verificar si ya existe pending_products_by_index
      const col2Exists = await client.query(`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_schema = $1 
          AND table_name = 'ai_conversations' 
          AND column_name = 'pending_products_by_index'
        )
      `, [schemaName]);
      
      if (!col2Exists.rows[0].exists) {
        await client.query(`
          ALTER TABLE ${schemaName}.ai_conversations 
          ADD COLUMN pending_products_by_index TEXT
        `);
        console.log(`  ✅ Agregada columna pending_products_by_index`);
      } else {
        console.log(`  ℹ️  Columna pending_products_by_index ya existe`);
      }
    }
    
    console.log('\n\n🎉 Migración completada exitosamente!\n');
    
    // Verificar las columnas agregadas
    console.log('📊 Verificando columnas agregadas:\n');
    const verification = await client.query(`
      SELECT 
        table_schema,
        table_name,
        column_name,
        data_type
      FROM information_schema.columns
      WHERE table_name = 'ai_conversations'
      AND column_name IN ('pending_product_selection', 'pending_products_by_index')
      AND table_schema LIKE 'store_%'
      ORDER BY table_schema, column_name
    `);
    
    console.table(verification.rows);
    
  } catch (error) {
    console.error('❌ Error ejecutando migración:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
