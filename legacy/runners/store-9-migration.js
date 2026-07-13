-- Direct SQL migration for Store 9
-- Run this directly in your PostgreSQL database

-- Create schema for store 9
CREATE SCHEMA IF NOT EXISTS store_9;

-- Create complete products table in store_9 schema
CREATE TABLE IF NOT EXISTS store_9.products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  base_currency TEXT NOT NULL DEFAULT 'DOP',
  price DECIMAL(10,2) NOT NULL,
  category TEXT NOT NULL DEFAULT 'product',
  status TEXT NOT NULL DEFAULT 'active',
  image_url TEXT,
  images TEXT[] DEFAULT '{}',
  sku TEXT,
  brand TEXT,
  model TEXT,
  specifications TEXT,
  features TEXT[] DEFAULT '{}',
  warranty TEXT,
  availability TEXT NOT NULL DEFAULT 'in_stock',
  stock_quantity INTEGER DEFAULT 0,
  min_quantity INTEGER DEFAULT 1,
  max_quantity INTEGER,
  weight DECIMAL(8,2),
  dimensions TEXT,
  tags TEXT[] DEFAULT '{}',
  sale_price DECIMAL(10,2),
  is_promoted BOOLEAN DEFAULT FALSE,
  promotion_text TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  store_id INTEGER NOT NULL DEFAULT 9
);

-- Add unique constraint on SKU
ALTER TABLE store_9.products ADD CONSTRAINT IF NOT EXISTS products_sku_unique UNIQUE (sku);

-- Update virtual_stores to use the new schema
UPDATE virtual_stores 
SET database_url = CASE 
  WHEN database_url LIKE '%?schema=%' 
    THEN REGEXP_REPLACE(database_url, 'schema=[^&]+', 'schema=store_9')
  ELSE database_url || '?schema=store_9'
END
WHERE id = 9;

-- Copy existing products data if any exists in public schema for store 9
INSERT INTO store_9.products (
  name, description, price, created_at, updated_at, store_id
)
SELECT 
  name, 
  description, 
  price,
  COALESCE(created_at, NOW()),
  COALESCE(updated_at, NOW()),
  9
FROM public.products 
WHERE store_id = 9
ON CONFLICT DO NOTHING;

-- Verify the setup
SELECT 
  'store_9.products' as table_name,
  COUNT(*) as row_count,
  array_agg(DISTINCT column_name ORDER BY column_name) as columns
FROM information_schema.columns 
WHERE table_schema = 'store_9' AND table_name = 'products'
GROUP BY table_schema, table_name;
