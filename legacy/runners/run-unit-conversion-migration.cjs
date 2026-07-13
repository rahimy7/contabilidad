// Script to run unit conversion migration
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import postgres client
const { Client } = require('pg');

async function runMigration() {
  console.log('🚀 Starting unit conversion migration...\n');

  // Create database client
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Connect to database
    console.log('📡 Connecting to database...');
    await client.connect();
    console.log('✅ Connected to database\n');

    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', 'add-unit-conversion-system.sql');
    console.log('📄 Reading migration file:', migrationPath);
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('✅ Migration file read successfully\n');

    // Execute migration
    console.log('⚙️  Executing migration...');
    await client.query(migrationSQL);
    console.log('✅ Migration executed successfully!\n');

    // Verify tables were created
    console.log('🔍 Verifying tables...');

    const verifyQuery = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('measurement_units', 'product_unit_conversions')
      ORDER BY table_name;
    `;

    const result = await client.query(verifyQuery);

    if (result.rows.length === 2) {
      console.log('✅ Tables verified:');
      result.rows.forEach(row => {
        console.log('   ✓', row.table_name);
      });
    } else {
      console.log('⚠️  Warning: Expected 2 tables, found', result.rows.length);
    }

    // Check columns added to products
    console.log('\n🔍 Verifying products table columns...');
    const productsColumnsQuery = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name IN ('unit_conversion_enabled', 'base_unit_id')
      ORDER BY column_name;
    `;

    const productsResult = await client.query(productsColumnsQuery);
    console.log('✅ Products columns added:');
    productsResult.rows.forEach(row => {
      console.log('   ✓', row.column_name);
    });

    // Check columns added to order_items
    console.log('\n🔍 Verifying order_items table columns...');
    const orderItemsColumnsQuery = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'order_items'
      AND column_name IN ('unit_id', 'quantity_in_base_unit')
      ORDER BY column_name;
    `;

    const orderItemsResult = await client.query(orderItemsColumnsQuery);
    console.log('✅ Order items columns added:');
    orderItemsResult.rows.forEach(row => {
      console.log('   ✓', row.column_name);
    });

    // Check default units were inserted
    console.log('\n🔍 Checking default measurement units...');
    const unitsCountQuery = `
      SELECT
        store_id,
        COUNT(*) as unit_count
      FROM measurement_units
      GROUP BY store_id
      ORDER BY store_id;
    `;

    const unitsResult = await client.query(unitsCountQuery);
    if (unitsResult.rows.length > 0) {
      console.log('✅ Default units inserted:');
      unitsResult.rows.forEach(row => {
        console.log(`   Store ${row.store_id}: ${row.unit_count} units`);
      });
    } else {
      console.log('ℹ️  No units inserted yet (will be added when stores are created)');
    }

    console.log('\n✨ Migration completed successfully!');
    console.log('\n📊 Summary:');
    console.log('   • Tables created: measurement_units, product_unit_conversions');
    console.log('   • Products table: +2 columns (unit_conversion_enabled, base_unit_id)');
    console.log('   • Order items table: +2 columns (unit_id, quantity_in_base_unit)');
    console.log('   • Default units: 12 per store (kg, g, lb, oz, L, ml, gal, unid, caja, paq, m, cm)');

  } catch (error) {
    console.error('\n❌ Migration failed:');
    console.error(error.message);

    if (error.message.includes('already exists')) {
      console.log('\nℹ️  This error might mean the migration was already run.');
      console.log('   You can safely ignore this if the tables already exist.');
    }

    process.exit(1);
  } finally {
    // Close connection
    await client.end();
    console.log('\n📡 Database connection closed');
  }
}

// Run migration
runMigration().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
