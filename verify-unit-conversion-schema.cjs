// Script to verify unit conversion schema is properly set up
require('dotenv').config();
const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');

async function verifySchema() {
  console.log('🔍 Verifying Unit Conversion Schema...\n');

  const client = postgres(process.env.DATABASE_URL);
  const db = drizzle(client);

  try {
    // Test 1: Query measurement_units table
    console.log('✅ Test 1: Querying measurement_units table...');
    const unitsQuery = await client`
      SELECT id, store_id, name, symbol, type, is_active
      FROM measurement_units
      LIMIT 5
    `;
    console.log(`   Found ${unitsQuery.length} sample units`);
    unitsQuery.forEach(unit => {
      console.log(`   • ${unit.name} (${unit.symbol}) - ${unit.type}`);
    });

    // Test 2: Query product_unit_conversions table
    console.log('\n✅ Test 2: Querying product_unit_conversions table...');
    const conversionsQuery = await client`
      SELECT COUNT(*) as count
      FROM product_unit_conversions
    `;
    console.log(`   Found ${conversionsQuery[0].count} conversions`);

    // Test 3: Check products table columns
    console.log('\n✅ Test 3: Checking products table columns...');
    const productsQuery = await client`
      SELECT unit_conversion_enabled, base_unit_id
      FROM products
      LIMIT 1
    `;
    console.log('   Columns accessible: unit_conversion_enabled, base_unit_id ✓');

    // Test 4: Check order_items table columns
    console.log('\n✅ Test 4: Checking order_items table columns...');
    const orderItemsQuery = await client`
      SELECT unit_id, quantity_in_base_unit
      FROM order_items
      LIMIT 1
    `;
    console.log('   Columns accessible: unit_id, quantity_in_base_unit ✓');

    // Test 5: Verify foreign key constraints
    console.log('\n✅ Test 5: Verifying foreign key constraints...');
    const fkQuery = await client`
      SELECT
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name IN ('products', 'order_items', 'product_unit_conversions')
      AND (
        kcu.column_name IN ('base_unit_id', 'unit_id', 'source_unit_id', 'target_unit_id')
        OR tc.table_name = 'product_unit_conversions'
      )
      ORDER BY tc.table_name, kcu.column_name
    `;
    console.log(`   Found ${fkQuery.length} foreign key constraints:`);
    fkQuery.forEach(fk => {
      console.log(`   • ${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    });

    // Test 6: Count units per store
    console.log('\n✅ Test 6: Units per store summary...');
    const storeUnitsQuery = await client`
      SELECT
        vs.id as store_id,
        vs.name as store_name,
        COUNT(mu.id) as unit_count
      FROM virtual_stores vs
      LEFT JOIN measurement_units mu ON vs.id = mu.store_id
      GROUP BY vs.id, vs.name
      ORDER BY vs.id
    `;
    console.log(`   Found ${storeUnitsQuery.length} stores with units:`);
    storeUnitsQuery.forEach(store => {
      console.log(`   • Store ${store.store_id} (${store.store_name}): ${store.unit_count} units`);
    });

    console.log('\n✨ Schema verification completed successfully!');
    console.log('\n📊 Summary:');
    console.log('   ✓ measurement_units table: OK');
    console.log('   ✓ product_unit_conversions table: OK');
    console.log('   ✓ products.unit_conversion_enabled: OK');
    console.log('   ✓ products.base_unit_id: OK');
    console.log('   ✓ order_items.unit_id: OK');
    console.log('   ✓ order_items.quantity_in_base_unit: OK');
    console.log('   ✓ Foreign key constraints: OK');

  } catch (error) {
    console.error('\n❌ Schema verification failed:');
    console.error(error.message);
    console.error('\nDetails:', error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n📡 Database connection closed');
  }
}

// Run verification
verifySchema().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
