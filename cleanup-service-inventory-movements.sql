-- Limpieza: Eliminar movimientos de inventario de productos tipo 'service'
-- Los servicios no manejan stock, estos registros son residuales.

-- 1. Ver cuántos movimientos serán eliminados (verificación previa)
SELECT
  COUNT(*) AS total_a_eliminar,
  p.name AS producto,
  p.type AS tipo
FROM inventory_movements im
JOIN products p ON p.id = im.product_id
WHERE p.type = 'service'
GROUP BY p.name, p.type;

-- 2. Eliminar los movimientos residuales de servicios
DELETE FROM inventory_movements
WHERE product_id IN (
  SELECT id FROM products WHERE type = 'service'
);

-- 3. Confirmar que no quedan movimientos de servicios
SELECT COUNT(*) AS restantes
FROM inventory_movements im
JOIN products p ON p.id = im.product_id
WHERE p.type = 'service';
