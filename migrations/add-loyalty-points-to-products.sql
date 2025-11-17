-- Add loyalty/fidelization points fields to products table
-- These fields allow assigning loyalty points to products as part of a loyalty/rewards program

ALTER TABLE products
ADD COLUMN loyalty_points_property_name text, -- Name of the loyalty property (e.g., 'LP', 'PUNTOS', 'REWARDS')
ADD COLUMN loyalty_points_value numeric(10, 2); -- Numeric value of loyalty points for this product

-- Add comments for documentation
COMMENT ON COLUMN products.loyalty_points_property_name IS 'Optional: Name of the loyalty property (LP, PUNTOS, REWARDS, etc.)';
COMMENT ON COLUMN products.loyalty_points_value IS 'Optional: Numeric value of loyalty points to assign when this product is purchased';
