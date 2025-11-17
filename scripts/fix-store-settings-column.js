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

const connectionString = process.env.DATABASE_URL;

async function fixStoreSettingsColumn(schemaName) {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log(`\n🔧 Fixing store_settings table in schema: ${schemaName}`);

    // Check if setting_key column exists
    const checkColumn = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = $1
      AND table_name = 'store_settings'
      AND column_name = 'setting_key';
    `;

    const result = await client.query(checkColumn, [schemaName]);

    if (result.rows.length > 0) {
      // Drop the setting_key column
      const dropColumn = `
        ALTER TABLE ${schemaName}.store_settings
        DROP COLUMN IF EXISTS setting_key;
      `;

      await client.query(dropColumn);
      console.log(`✅ Removed setting_key column from ${schemaName}.store_settings`);
    } else {
      console.log(`⚠️  setting_key column not found in ${schemaName}.store_settings`);
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

  console.log('🚀 Starting store_settings column removal process...');

  for (const store of STORES) {
    try {
      await fixStoreSettingsColumn(store.schemaName);
    } catch (error) {
      console.error(`Failed to fix ${store.schemaName}:`, error);
      process.exit(1);
    }
  }

  console.log('\n✅ All store_settings tables have been fixed!');
}

main().catch(console.error);
