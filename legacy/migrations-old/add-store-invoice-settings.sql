-- Add invoice and extended settings to store_settings table
-- This migration adds fields for logos, footer text, and other invoice-related configuration

ALTER TABLE store_settings
ADD COLUMN IF NOT EXISTS store_phone text,
ADD COLUMN IF NOT EXISTS logo_url text,
ADD COLUMN IF NOT EXISTS logo_storage_path text,
ADD COLUMN IF NOT EXISTS invoice_footer text,
ADD COLUMN IF NOT EXISTS invoice_number integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'DOP',
ADD COLUMN IF NOT EXISTS tax_percentage decimal(5, 2) DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN store_settings.logo_url IS 'URL of the store logo stored in Supabase';
COMMENT ON COLUMN store_settings.logo_storage_path IS 'Storage path for the logo in Supabase (e.g., store-1/logo)';
COMMENT ON COLUMN store_settings.invoice_footer IS 'Custom text for invoice footer';
COMMENT ON COLUMN store_settings.invoice_number IS 'Sequential invoice number for reference';
COMMENT ON COLUMN store_settings.store_phone IS 'Store phone number for invoices';
COMMENT ON COLUMN store_settings.currency IS 'Store default currency (DOP, USD, etc.)';
COMMENT ON COLUMN store_settings.tax_percentage IS 'Default tax percentage for calculations';
