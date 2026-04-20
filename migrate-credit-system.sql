-- =====================================================
-- MIGRATION: Credit System, Appointment Pricing, Order Payment & Discount Fields
-- =====================================================

-- 1. Add pricing fields to appointment_service_types
ALTER TABLE appointment_service_types ADD COLUMN IF NOT EXISTS base_price DECIMAL(10,2) DEFAULT 0;
ALTER TABLE appointment_service_types ADD COLUMN IF NOT EXISTS price_type TEXT NOT NULL DEFAULT 'fixed';
ALTER TABLE appointment_service_types ADD COLUMN IF NOT EXISTS min_price DECIMAL(10,2);
ALTER TABLE appointment_service_types ADD COLUMN IF NOT EXISTS max_price DECIMAL(10,2);

-- 2. Add pricing/payment fields to appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS price DECIMAL(10,2) DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES orders(id);

-- 3. Add payment + discount fields to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS received_amount DECIMAL(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS change_amount DECIMAL(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'sale';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_percentage DECIMAL(5,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0;

-- 4. Create customer credit accounts table
CREATE TABLE IF NOT EXISTS customer_credit_accounts (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  store_id INTEGER NOT NULL,
  total_credit DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_paid DECIMAL(12,2) NOT NULL DEFAULT 0,
  current_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  credit_limit DECIMAL(12,2),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Unique constraint: one credit account per customer per store
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_accounts_customer_store 
  ON customer_credit_accounts(customer_id, store_id);

-- 5. Create credit transactions table
CREATE TABLE IF NOT EXISTS credit_transactions (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  store_id INTEGER NOT NULL,
  order_id INTEGER REFERENCES orders(id),
  type TEXT NOT NULL, -- 'charge' or 'payment'
  amount DECIMAL(10,2) NOT NULL,
  balance_before DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  description TEXT,
  payment_method TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_credit_transactions_customer ON credit_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_store ON credit_transactions(store_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_order ON credit_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_appointments_order ON appointments(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_type ON orders(order_type);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);

-- 6. Add doctor dashboard RBAC view entry
INSERT INTO views (name, label, route_path, icon_name, permission_required, sort_order, is_active, category)
VALUES ('doctor_dashboard', 'Panel de Doctores', '/doctor-dashboard', 'Stethoscope', 'manage_appointments', 31, true, 'appointments')
ON CONFLICT DO NOTHING;
