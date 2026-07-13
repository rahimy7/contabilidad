-- Add loyalty points total field to orders table
-- This field stores the sum of loyalty points from all items in the order

ALTER TABLE orders
ADD COLUMN loyalty_points_total decimal(10, 2) DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN orders.loyalty_points_total IS 'Total sum of loyalty points from all items in this order';
