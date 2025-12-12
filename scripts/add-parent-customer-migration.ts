import { pool } from '../server/db';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🚀 Ejecutando migración: add-parent-customer-relationship.sql');

    const migrationSQL = readFileSync(
      join(process.cwd(), 'migrations', 'add-parent-customer-relationship.sql'),
      'utf-8'
    );

    await client.query(migrationSQL);

    console.log('✅ Migración completada exitosamente');
    console.log('📋 Cambios aplicados:');
    console.log('   - Columna parent_customer_id agregada a customers');
    console.log('   - Índice idx_customers_parent_customer_id creado');
    console.log('   - Restricción chk_not_self_parent agregada');

  } catch (error) {
    console.error('❌ Error ejecutando migración:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(console.error);
