-- Add unit conversion system for products
-- This migration adds tables and fields to support unit conversions in products

-- ================================
-- 1. Add unit conversion fields to products table
-- ================================
ALTER TABLE products
ADD COLUMN unit_conversion_enabled boolean DEFAULT false, -- Enable/disable unit conversion for this product
ADD COLUMN base_unit_id integer; -- Reference to the base unit for this product (measurement_units table)

COMMENT ON COLUMN products.unit_conversion_enabled IS 'Enable unit conversion system for this product';
COMMENT ON COLUMN products.base_unit_id IS 'Reference to the base measurement unit (FK to measurement_units)';

-- ================================
-- 2. Create measurement_units table
-- ================================
CREATE TABLE measurement_units (
    id serial PRIMARY KEY,
    store_id integer NOT NULL,
    name text NOT NULL, -- Full name: "Kilogramo", "Gramo", "Litro", "Mililitro", "Unidad"
    symbol text NOT NULL, -- Short symbol: "kg", "g", "L", "ml", "unid"
    type text NOT NULL, -- Type: "weight", "volume", "unit", "length"
    abbreviation text, -- Alternative abbreviation
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0, -- For sorting in dropdowns
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX idx_measurement_units_store_id ON measurement_units(store_id);
CREATE INDEX idx_measurement_units_type ON measurement_units(type);
CREATE INDEX idx_measurement_units_active ON measurement_units(is_active);

-- Add comments
COMMENT ON TABLE measurement_units IS 'Catalog of measurement units per store (kg, g, L, ml, etc.)';
COMMENT ON COLUMN measurement_units.name IS 'Full name of the unit (e.g., Kilogramo, Gramo)';
COMMENT ON COLUMN measurement_units.symbol IS 'Short symbol for the unit (e.g., kg, g, L)';
COMMENT ON COLUMN measurement_units.type IS 'Type of measurement: weight, volume, unit, or length';
COMMENT ON COLUMN measurement_units.abbreviation IS 'Alternative abbreviation for the unit';
COMMENT ON COLUMN measurement_units.sort_order IS 'Order for displaying in dropdowns';

-- ================================
-- 3. Create product_unit_conversions table
-- ================================
CREATE TABLE product_unit_conversions (
    id serial PRIMARY KEY,
    product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    store_id integer NOT NULL,
    source_unit_id integer NOT NULL REFERENCES measurement_units(id) ON DELETE CASCADE,
    target_unit_id integer NOT NULL REFERENCES measurement_units(id) ON DELETE CASCADE,
    conversion_factor numeric(15, 6) NOT NULL, -- Conversion factor between units
    is_active boolean DEFAULT true,
    notes text, -- Optional notes about the conversion
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now(),

    -- Ensure unique conversion pairs per product
    UNIQUE(product_id, source_unit_id, target_unit_id)
);

-- Add indexes for performance
CREATE INDEX idx_product_unit_conversions_product_id ON product_unit_conversions(product_id);
CREATE INDEX idx_product_unit_conversions_store_id ON product_unit_conversions(store_id);
CREATE INDEX idx_product_unit_conversions_source_unit ON product_unit_conversions(source_unit_id);
CREATE INDEX idx_product_unit_conversions_target_unit ON product_unit_conversions(target_unit_id);
CREATE INDEX idx_product_unit_conversions_active ON product_unit_conversions(is_active);

-- Add comments
COMMENT ON TABLE product_unit_conversions IS 'Conversion factors between different units for products';
COMMENT ON COLUMN product_unit_conversions.source_unit_id IS 'The unit to convert FROM';
COMMENT ON COLUMN product_unit_conversions.target_unit_id IS 'The unit to convert TO (usually the base unit)';
COMMENT ON COLUMN product_unit_conversions.conversion_factor IS 'Factor to multiply source by to get target (e.g., 1 kg = 1000 g, factor = 1000)';
COMMENT ON COLUMN product_unit_conversions.notes IS 'Optional notes about this conversion';

-- ================================
-- 4. Add unit conversion fields to order_items table
-- ================================
ALTER TABLE order_items
ADD COLUMN unit_id integer, -- The unit used when placing the order
ADD COLUMN quantity_in_base_unit numeric(12, 4); -- Quantity normalized to base unit

-- Add foreign key constraint
ALTER TABLE order_items
ADD CONSTRAINT fk_order_items_unit_id
FOREIGN KEY (unit_id) REFERENCES measurement_units(id) ON DELETE SET NULL;

-- Add index
CREATE INDEX idx_order_items_unit_id ON order_items(unit_id);

-- Add comments
COMMENT ON COLUMN order_items.unit_id IS 'The measurement unit used when placing this order (FK to measurement_units)';
COMMENT ON COLUMN order_items.quantity_in_base_unit IS 'Quantity converted to the product base unit for inventory control';

-- ================================
-- 5. Add foreign key constraint for products.base_unit_id
-- ================================
ALTER TABLE products
ADD CONSTRAINT fk_products_base_unit_id
FOREIGN KEY (base_unit_id) REFERENCES measurement_units(id) ON DELETE SET NULL;

-- Add index
CREATE INDEX idx_products_base_unit_id ON products(base_unit_id);
CREATE INDEX idx_products_unit_conversion_enabled ON products(unit_conversion_enabled);

-- ================================
-- 6. Insert default measurement units (optional - can be customized per store)
-- ================================
-- This is a template - stores can create their own units
-- Weight units
INSERT INTO measurement_units (store_id, name, symbol, type, abbreviation, sort_order)
SELECT
    id as store_id,
    'Kilogramo' as name,
    'kg' as symbol,
    'weight' as type,
    'kilo' as abbreviation,
    1 as sort_order
FROM virtual_stores
WHERE NOT EXISTS (
    SELECT 1 FROM measurement_units WHERE store_id = virtual_stores.id AND symbol = 'kg'
);

INSERT INTO measurement_units (store_id, name, symbol, type, abbreviation, sort_order)
SELECT
    id as store_id,
    'Gramo' as name,
    'g' as symbol,
    'weight' as type,
    'gr' as abbreviation,
    2 as sort_order
FROM virtual_stores
WHERE NOT EXISTS (
    SELECT 1 FROM measurement_units WHERE store_id = virtual_stores.id AND symbol = 'g'
);

INSERT INTO measurement_units (store_id, name, symbol, type, abbreviation, sort_order)
SELECT
    id as store_id,
    'Libra' as name,
    'lb' as symbol,
    'weight' as type,
    'libra' as abbreviation,
    3 as sort_order
FROM virtual_stores
WHERE NOT EXISTS (
    SELECT 1 FROM measurement_units WHERE store_id = virtual_stores.id AND symbol = 'lb'
);

INSERT INTO measurement_units (store_id, name, symbol, type, abbreviation, sort_order)
SELECT
    id as store_id,
    'Onza' as name,
    'oz' as symbol,
    'weight' as type,
    'onza' as abbreviation,
    4 as sort_order
FROM virtual_stores
WHERE NOT EXISTS (
    SELECT 1 FROM measurement_units WHERE store_id = virtual_stores.id AND symbol = 'oz'
);

-- Volume units
INSERT INTO measurement_units (store_id, name, symbol, type, abbreviation, sort_order)
SELECT
    id as store_id,
    'Litro' as name,
    'L' as symbol,
    'volume' as type,
    'litro' as abbreviation,
    5 as sort_order
FROM virtual_stores
WHERE NOT EXISTS (
    SELECT 1 FROM measurement_units WHERE store_id = virtual_stores.id AND symbol = 'L'
);

INSERT INTO measurement_units (store_id, name, symbol, type, abbreviation, sort_order)
SELECT
    id as store_id,
    'Mililitro' as name,
    'ml' as symbol,
    'volume' as type,
    'mili' as abbreviation,
    6 as sort_order
FROM virtual_stores
WHERE NOT EXISTS (
    SELECT 1 FROM measurement_units WHERE store_id = virtual_stores.id AND symbol = 'ml'
);

INSERT INTO measurement_units (store_id, name, symbol, type, abbreviation, sort_order)
SELECT
    id as store_id,
    'Galón' as name,
    'gal' as symbol,
    'volume' as type,
    'galon' as abbreviation,
    7 as sort_order
FROM virtual_stores
WHERE NOT EXISTS (
    SELECT 1 FROM measurement_units WHERE store_id = virtual_stores.id AND symbol = 'gal'
);

-- Count/Unit
INSERT INTO measurement_units (store_id, name, symbol, type, abbreviation, sort_order)
SELECT
    id as store_id,
    'Unidad' as name,
    'unid' as symbol,
    'unit' as type,
    'ud' as abbreviation,
    8 as sort_order
FROM virtual_stores
WHERE NOT EXISTS (
    SELECT 1 FROM measurement_units WHERE store_id = virtual_stores.id AND symbol = 'unid'
);

INSERT INTO measurement_units (store_id, name, symbol, type, abbreviation, sort_order)
SELECT
    id as store_id,
    'Caja' as name,
    'caja' as symbol,
    'unit' as type,
    'cj' as abbreviation,
    9 as sort_order
FROM virtual_stores
WHERE NOT EXISTS (
    SELECT 1 FROM measurement_units WHERE store_id = virtual_stores.id AND symbol = 'caja'
);

INSERT INTO measurement_units (store_id, name, symbol, type, abbreviation, sort_order)
SELECT
    id as store_id,
    'Paquete' as name,
    'paq' as symbol,
    'unit' as type,
    'pq' as abbreviation,
    10 as sort_order
FROM virtual_stores
WHERE NOT EXISTS (
    SELECT 1 FROM measurement_units WHERE store_id = virtual_stores.id AND symbol = 'paq'
);

-- Length units
INSERT INTO measurement_units (store_id, name, symbol, type, abbreviation, sort_order)
SELECT
    id as store_id,
    'Metro' as name,
    'm' as symbol,
    'length' as type,
    'metro' as abbreviation,
    11 as sort_order
FROM virtual_stores
WHERE NOT EXISTS (
    SELECT 1 FROM measurement_units WHERE store_id = virtual_stores.id AND symbol = 'm'
);

INSERT INTO measurement_units (store_id, name, symbol, type, abbreviation, sort_order)
SELECT
    id as store_id,
    'Centímetro' as name,
    'cm' as symbol,
    'length' as type,
    'centi' as abbreviation,
    12 as sort_order
FROM virtual_stores
WHERE NOT EXISTS (
    SELECT 1 FROM measurement_units WHERE store_id = virtual_stores.id AND symbol = 'cm'
);
