-- Migration: Add barcode field to products table
-- Description: Adds a barcode field to store product barcodes for easier scanning and searching
-- Date: 2025-12-03

-- Add barcode column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;

-- Create index on barcode for faster searches
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

-- Add comment to column
COMMENT ON COLUMN products.barcode IS 'Código de barras del producto para escaneo y búsqueda rápida';
