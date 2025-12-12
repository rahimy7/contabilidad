-- Script para crear balances de puntos para clientes existentes que no tienen
-- Este script debe ejecutarse en la base de datos del tenant (store_9)

-- 1. Verificar cuántos clientes no tienen balance
SELECT 
  'Clientes sin balance:' as status,
  COUNT(*) as count
FROM customers c
LEFT JOIN customer_loyalty_balance clb ON c.id = clb.customer_id
WHERE clb.id IS NULL AND c.store_id = 9;

-- 2. Crear balances para clientes sin balance
INSERT INTO customer_loyalty_balance (customer_id, store_id, current_balance, total_points_earned, total_points_redeemed, created_at, updated_at)
SELECT 
  c.id,
  c.store_id,
  '0.00',
  '0.00',
  '0.00',
  NOW(),
  NOW()
FROM customers c
LEFT JOIN customer_loyalty_balance clb ON c.id = clb.customer_id
WHERE clb.id IS NULL AND c.store_id = 9;

-- 3. Verificar que todos los clientes ahora tienen balance
SELECT 
  'Clientes con balance:' as status,
  COUNT(*) as count
FROM customers c
INNER JOIN customer_loyalty_balance clb ON c.id = clb.customer_id
WHERE c.store_id = 9;

-- 4. Mostrar algunos ejemplos de balances creados
SELECT 
  c.id,
  c.name,
  clb.current_balance,
  clb.total_points_earned,
  clb.points_property_name
FROM customers c
INNER JOIN customer_loyalty_balance clb ON c.id = clb.customer_id
WHERE c.store_id = 9
LIMIT 10;
