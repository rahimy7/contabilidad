const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

const sql = neon(process.env.DATABASE_URL);

async function runTenantMigration() {
  try {
    console.log('🚀 Starting tenant schema unit conversion migration...');
    console.log('📡 Connecting to database...');

    // Get all tenant schemas
    const schemas = ['store_6', 'store_16', 'store_17', 'store_18'];

    for (const schema of schemas) {
      console.log(`\n📦 Migrating schema: ${schema}`);

      try {
        // Add columns to products table
        const alterProductsQuery = `
          ALTER TABLE "${schema}".products
          ADD COLUMN IF NOT EXISTS unit_conversion_enabled BOOLEAN DEFAULT false,
          ADD COLUMN IF NOT EXISTS base_unit_id INTEGER
        `;
        await sql.query(alterProductsQuery);
        console.log(`  ✅ Added columns to ${schema}.products`);

        // Add columns to order_items table
        const alterOrderItemsQuery = `
          ALTER TABLE "${schema}".order_items
          ADD COLUMN IF NOT EXISTS unit_id INTEGER,
          ADD COLUMN IF NOT EXISTS quantity_in_base_unit NUMERIC(12,4)
        `;
        await sql.query(alterOrderItemsQuery);
        console.log(`  ✅ Added columns to ${schema}.order_items`);

        // Create indexes for products table
        const createIndex1Query = `
          CREATE INDEX IF NOT EXISTS idx_products_base_unit_id
          ON "${schema}".products(base_unit_id)
        `;
        await sql.query(createIndex1Query);

        const createIndex2Query = `
          CREATE INDEX IF NOT EXISTS idx_products_unit_conversion_enabled
          ON "${schema}".products(unit_conversion_enabled)
          WHERE unit_conversion_enabled = true
        `;
        await sql.query(createIndex2Query);
        console.log(`  ✅ Created indexes on ${schema}.products`);

        // Create index for order_items table
        const createIndex3Query = `
          CREATE INDEX IF NOT EXISTS idx_order_items_unit_id
          ON "${schema}".order_items(unit_id)
        `;
        await sql.query(createIndex3Query);
        console.log(`  ✅ Created indexes on ${schema}.order_items`);

        // Add foreign key constraints
        // Note: Foreign keys reference the PUBLIC schema measurement_units table
        const addFkProducts = `
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.table_constraints
              WHERE constraint_name = 'fk_products_base_unit_id'
              AND table_schema = '${schema}'
            ) THEN
              ALTER TABLE "${schema}".products
              ADD CONSTRAINT fk_products_base_unit_id
              FOREIGN KEY (base_unit_id)
              REFERENCES public.measurement_units(id)
              ON DELETE SET NULL;
            END IF;
          END $$;
        `;
        await sql.query(addFkProducts);
        console.log(`  ✅ Added FK constraint for ${schema}.products.base_unit_id`);

        const addFkOrderItems = `
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.table_constraints
              WHERE constraint_name = 'fk_order_items_unit_id'
              AND table_schema = '${schema}'
            ) THEN
              ALTER TABLE "${schema}".order_items
              ADD CONSTRAINT fk_order_items_unit_id
              FOREIGN KEY (unit_id)
              REFERENCES public.measurement_units(id)
              ON DELETE SET NULL;
            END IF;
          END $$;
        `;
        await sql.query(addFkOrderItems);
        console.log(`  ✅ Added FK constraint for ${schema}.order_items.unit_id`);

        console.log(`✨ Schema ${schema} migration completed successfully!`);
      } catch (error) {
        console.error(`❌ Error migrating schema ${schema}:`, error.message);
        throw error;
      }
    }

    console.log('\n🎉 All tenant schemas migrated successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runTenantMigration();
