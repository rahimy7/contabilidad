// server/migrations/add-sector-fields.ts

import { sql } from 'drizzle-orm';
import { db } from '../server/db';

/**
 * Migración para agregar campos de sectores al sistema
 * Reemplaza el sistema de distancia por sectores geográficos
 */

export async function migrateSectorFields() {
  try {
    console.log('🔄 Starting migration: Add sector fields...');

    // 1. Agregar campos de sectores a employee_profiles
    console.log('📝 Adding sector fields to employee_profiles...');
    
    await db.execute(sql`
      ALTER TABLE employee_profiles
      ADD COLUMN IF NOT EXISTS province TEXT,
      ADD COLUMN IF NOT EXISTS municipality TEXT,
      ADD COLUMN IF NOT EXISTS sector TEXT,
      ADD COLUMN IF NOT EXISTS coverage_provinces TEXT[],
      ADD COLUMN IF NOT EXISTS coverage_municipalities TEXT[],
      ADD COLUMN IF NOT EXISTS coverage_sectors TEXT[];
    `);

    console.log('✅ Sector fields added to employee_profiles');

    // 2. Actualizar campos de assignment_rules
    console.log('📝 Updating assignment_rules schema...');
    
    await db.execute(sql`
      ALTER TABLE assignment_rules
      DROP COLUMN IF EXISTS use_location_based,
      DROP COLUMN IF EXISTS max_distance_km,
      ADD COLUMN IF NOT EXISTS use_sector_based BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS required_province TEXT,
      ADD COLUMN IF NOT EXISTS required_municipality TEXT,
      ADD COLUMN IF NOT EXISTS required_sectors TEXT[],
      ADD COLUMN IF NOT EXISTS allow_adjacent_municipalities BOOLEAN DEFAULT TRUE;
    `);

    console.log('✅ Assignment rules schema updated');

    // 3. Agregar campos de sectores a orders
    console.log('📝 Adding sector fields to orders...');
    
    await db.execute(sql`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS customer_province TEXT,
      ADD COLUMN IF NOT EXISTS customer_municipality TEXT,
      ADD COLUMN IF NOT EXISTS customer_sector TEXT,
      ADD COLUMN IF NOT EXISTS assigned_rule_id INTEGER REFERENCES assignment_rules(id),
      ADD COLUMN IF NOT EXISTS auto_assigned BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS assignment_attempts INTEGER DEFAULT 0;
    `);

    console.log('✅ Sector fields added to orders');

    // 4. Migrar datos existentes (convertir territory a province)
    console.log('📝 Migrating existing territory data...');
    
    await db.execute(sql`
      UPDATE employee_profiles
      SET province = territory
      WHERE territory IS NOT NULL AND province IS NULL;
    `);

    console.log('✅ Existing territory data migrated');

    // 5. Actualizar reglas existentes
    console.log('📝 Updating existing assignment rules...');
    
    await db.execute(sql`
      UPDATE assignment_rules
      SET use_sector_based = TRUE
      WHERE use_sector_based IS NULL;
    `);

    console.log('✅ Existing rules updated');

    // 6. Crear índices para mejor performance
    console.log('📝 Creating indexes for sector fields...');
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_employee_province ON employee_profiles(province);
      CREATE INDEX IF NOT EXISTS idx_employee_municipality ON employee_profiles(municipality);
      CREATE INDEX IF NOT EXISTS idx_employee_sector ON employee_profiles(sector);
      CREATE INDEX IF NOT EXISTS idx_order_province ON orders(customer_province);
      CREATE INDEX IF NOT EXISTS idx_order_municipality ON orders(customer_municipality);
    `);

    console.log('✅ Indexes created');

    console.log('✨ Migration completed successfully!');
    return { success: true, message: 'Sector fields migration completed' };

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Función para revertir la migración si es necesario
 */
export async function rollbackSectorFields() {
  try {
    console.log('🔄 Rolling back sector fields migration...');

    await db.execute(sql`
      ALTER TABLE employee_profiles
      DROP COLUMN IF EXISTS province,
      DROP COLUMN IF EXISTS municipality,
      DROP COLUMN IF EXISTS sector,
      DROP COLUMN IF EXISTS coverage_provinces,
      DROP COLUMN IF EXISTS coverage_municipalities,
      DROP COLUMN IF EXISTS coverage_sectors;
    `);

    await db.execute(sql`
      ALTER TABLE assignment_rules
      DROP COLUMN IF EXISTS use_sector_based,
      DROP COLUMN IF EXISTS required_province,
      DROP COLUMN IF EXISTS required_municipality,
      DROP COLUMN IF EXISTS required_sectors,
      DROP COLUMN IF EXISTS allow_adjacent_municipalities,
      ADD COLUMN IF NOT EXISTS use_location_based BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS max_distance_km DECIMAL(5, 2) DEFAULT 15.0;
    `);

    await db.execute(sql`
      ALTER TABLE orders
      DROP COLUMN IF EXISTS customer_province,
      DROP COLUMN IF EXISTS customer_municipality,
      DROP COLUMN IF EXISTS customer_sector,
      DROP COLUMN IF EXISTS assigned_rule_id,
      DROP COLUMN IF EXISTS auto_assigned,
      DROP COLUMN IF EXISTS assignment_attempts;
    `);

    console.log('✅ Rollback completed');
    return { success: true, message: 'Migration rolled back successfully' };

  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

// Ejecutar migración si se llama directamente
if (require.main === module) {
  migrateSectorFields()
    .then(() => {
      console.log('Migration script finished');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}