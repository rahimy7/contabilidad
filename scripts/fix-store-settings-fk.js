import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

const STORES = [
  { schemaName: 'store_6', storeId: 6 },
  { schemaName: 'store_16', storeId: 16 },
  { schemaName: 'store_17', storeId: 17 },
  { schemaName: 'store_18', storeId: 18 },
];

// Use DATABASE_URL from .env
const connectionString = process.env.DATABASE_URL;

async function fixStoreForeignKey(schemaName) {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log(`\n🔧 Fixing store_settings FK in schema: ${schemaName}`);

    // Check if constraint exists
    const checkConstraint = `
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_schema = $1
      AND table_name = 'store_settings'
      AND constraint_name = 'store_settings_store_id_virtual_stores_id_fk';
    `;

    const result = await client.query(checkConstraint, [schemaName]);

    if (result.rows.length > 0) {
      // Drop the foreign key constraint
      const dropFK = `
        ALTER TABLE ${schemaName}.store_settings
        DROP CONSTRAINT store_settings_store_id_virtual_stores_id_fk;
      `;

      await client.query(dropFK);
      console.log(`✅ Removed foreign key constraint from ${schemaName}.store_settings`);
    } else {
      console.log(`⚠️  Constraint not found in ${schemaName}.store_settings (may have already been removed)`);
    }

  } catch (error) {
    console.error(`❌ Error fixing ${schemaName}:`, error.message);
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  if (!connectionString) {
    console.error('❌ DATABASE_URL is not set in .env file');
    process.exit(1);
  }

  console.log('🚀 Starting foreign key constraint removal process...');

  for (const store of STORES) {
    try {
      await fixStoreForeignKey(store.schemaName);
    } catch (error) {
      console.error(`Failed to fix ${store.schemaName}:`, error);
      process.exit(1);
    }
  }

  console.log('\n✅ All foreign key constraints have been successfully removed!');
}

main().catch(console.error);
