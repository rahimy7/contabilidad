-- Migración: Añadir columna 'type' a la tabla products
-- Permite distinguir productos tangibles ('product') de servicios ('service')
-- Los servicios no manejan stock ni movimientos de inventario

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'product';

-- Índice para consultas frecuentes por tipo
CREATE INDEX IF NOT EXISTS idx_products_type ON products (type);

-- Comentario en la columna
COMMENT ON COLUMN products.type IS '''product'' | ''service'' — los servicios no manejan stock ni inventario';
