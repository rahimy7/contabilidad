const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

const sql = neon(process.env.DATABASE_URL);

async function createTenantUnitTables() {
  try {
    console.log('🚀 Creating unit conversion tables in tenant schemas...');
    console.log('📡 Connecting to database...');

    const schemas = ['store_6', 'store_16', 'store_17', 'store_18'];

    for (const schema of schemas) {
      console.log(`\n📦 Creating tables in schema: ${schema}`);

      try {
        // Create measurement_units table in tenant schema
        const createMeasurementUnitsQuery = `
          CREATE TABLE IF NOT EXISTS "${schema}".measurement_units (
            id SERIAL PRIMARY KEY,
            store_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            symbol TEXT NOT NULL,
            type TEXT NOT NULL,
            abbreviation TEXT,
            is_active BOOLEAN DEFAULT true,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            CONSTRAINT chk_measurement_unit_type CHECK (type IN ('weight', 'volume', 'unit', 'length'))
          )
        `;
        await sql.query(createMeasurementUnitsQuery);
        console.log(`  ✅ Created ${schema}.measurement_units table`);

        // Create indexes for measurement_units
        await sql.query(`
          CREATE INDEX IF NOT EXISTS idx_measurement_units_store_id
          ON "${schema}".measurement_units(store_id)
        `);
        await sql.query(`
          CREATE INDEX IF NOT EXISTS idx_measurement_units_type
          ON "${schema}".measurement_units(type)
        `);
        await sql.query(`
          CREATE INDEX IF NOT EXISTS idx_measurement_units_active
          ON "${schema}".measurement_units(is_active)
          WHERE is_active = true
        `);
        console.log(`  ✅ Created indexes on ${schema}.measurement_units`);

        // Create product_unit_conversions table in tenant schema
        const createConversionsQuery = `
          CREATE TABLE IF NOT EXISTS "${schema}".product_unit_conversions (
            id SERIAL PRIMARY KEY,
            product_id INTEGER NOT NULL,
            store_id INTEGER NOT NULL,
            source_unit_id INTEGER NOT NULL,
            target_unit_id INTEGER NOT NULL,
            conversion_factor NUMERIC(15,6) NOT NULL,
            is_active BOOLEAN DEFAULT true,
            notes TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            CONSTRAINT unique_product_conversion UNIQUE(product_id, source_unit_id, target_unit_id),
            CONSTRAINT fk_product_id FOREIGN KEY (product_id) REFERENCES "${schema}".products(id) ON DELETE CASCADE,
            CONSTRAINT fk_source_unit_id FOREIGN KEY (source_unit_id) REFERENCES "${schema}".measurement_units(id) ON DELETE CASCADE,
            CONSTRAINT fk_target_unit_id FOREIGN KEY (target_unit_id) REFERENCES "${schema}".measurement_units(id) ON DELETE CASCADE
          )
        `;
        await sql.query(createConversionsQuery);
        console.log(`  ✅ Created ${schema}.product_unit_conversions table`);

        // Create indexes for product_unit_conversions
        await sql.query(`
          CREATE INDEX IF NOT EXISTS idx_product_unit_conversions_product_id
          ON "${schema}".product_unit_conversions(product_id)
        `);
        await sql.query(`
          CREATE INDEX IF NOT EXISTS idx_product_unit_conversions_store_id
          ON "${schema}".product_unit_conversions(store_id)
        `);
        await sql.query(`
          CREATE INDEX IF NOT EXISTS idx_product_unit_conversions_source_unit
          ON "${schema}".product_unit_conversions(source_unit_id)
        `);
        await sql.query(`
          CREATE INDEX IF NOT EXISTS idx_product_unit_conversions_target_unit
          ON "${schema}".product_unit_conversions(target_unit_id)
        `);
        await sql.query(`
          CREATE INDEX IF NOT EXISTS idx_product_unit_conversions_active
          ON "${schema}".product_unit_conversions(is_active)
          WHERE is_active = true
        `);
        console.log(`  ✅ Created indexes on ${schema}.product_unit_conversions`);

        // Update foreign key constraint on products table to reference tenant schema
        await sql.query(`
          DO $$
          BEGIN
            -- Drop old FK if exists
            IF EXISTS (
              SELECT 1 FROM information_schema.table_constraints
              WHERE constraint_name = 'fk_products_base_unit_id'
              AND table_schema = '${schema}'
            ) THEN
              ALTER TABLE "${schema}".products DROP CONSTRAINT fk_products_base_unit_id;
            END IF;

            -- Add new FK pointing to tenant schema
            ALTER TABLE "${schema}".products
            ADD CONSTRAINT fk_products_base_unit_id
            FOREIGN KEY (base_unit_id)
            REFERENCES "${schema}".measurement_units(id)
            ON DELETE SET NULL;
          END $$;
        `);
        console.log(`  ✅ Updated FK constraint for ${schema}.products.base_unit_id`);

        // Update foreign key constraint on order_items table to reference tenant schema
        await sql.query(`
          DO $$
          BEGIN
            -- Drop old FK if exists
            IF EXISTS (
              SELECT 1 FROM information_schema.table_constraints
              WHERE constraint_name = 'fk_order_items_unit_id'
              AND table_schema = '${schema}'
            ) THEN
              ALTER TABLE "${schema}".order_items DROP CONSTRAINT fk_order_items_unit_id;
            END IF;

            -- Add new FK pointing to tenant schema
            ALTER TABLE "${schema}".order_items
            ADD CONSTRAINT fk_order_items_unit_id
            FOREIGN KEY (unit_id)
            REFERENCES "${schema}".measurement_units(id)
            ON DELETE SET NULL;
          END $$;
        `);
        console.log(`  ✅ Updated FK constraint for ${schema}.order_items.unit_id`);

        // Copy measurement units data from public schema
        const storeId = parseInt(schema.replace('store_', ''));
        await sql.query(`
          INSERT INTO "${schema}".measurement_units (store_id, name, symbol, type, abbreviation, is_active, sort_order)
          SELECT store_id, name, symbol, type, abbreviation, is_active, sort_order
          FROM public.measurement_units
          WHERE store_id = ${storeId}
          ON CONFLICT DO NOTHING
        `);
        console.log(`  ✅ Copied measurement units data for store ${storeId}`);

        console.log(`✨ Schema ${schema} completed successfully!`);
      } catch (error) {
        console.error(`❌ Error creating tables in schema ${schema}:`, error.message);
        throw error;
      }
    }

    console.log('\n🎉 All tenant schemas updated successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

createTenantUnitTables();
