import { sql } from 'drizzle-orm';
import { getTenantDb } from '../multi-tenant-db';

const schemaReadyByStore = new Set<number>();
const pendingByStore = new Map<number, Promise<void>>();

async function applySchemaGuard(storeId: number): Promise<void> {
  const db = await getTenantDb(storeId);

  // Ensure pricing columns exist for appointment service types.
  await db.execute(sql`ALTER TABLE appointment_service_types ADD COLUMN IF NOT EXISTS base_price DECIMAL(10,2) DEFAULT 0`);
  await db.execute(sql`ALTER TABLE appointment_service_types ADD COLUMN IF NOT EXISTS price_type TEXT NOT NULL DEFAULT 'fixed'`);
  await db.execute(sql`ALTER TABLE appointment_service_types ADD COLUMN IF NOT EXISTS min_price DECIMAL(10,2)`);
  await db.execute(sql`ALTER TABLE appointment_service_types ADD COLUMN IF NOT EXISTS max_price DECIMAL(10,2)`);

  // Ensure appointment payment fields exist.
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS price DECIMAL(10,2) DEFAULT 0`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_method TEXT`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS order_id INTEGER`);

  // Ensure optional appointment relation columns exist.
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS titular_id INTEGER`);
  await db.execute(sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_type_id INTEGER`);

  // Ensure orders table has payment + extended fields used by credit payment flow.
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_province TEXT`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_municipality TEXT`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_sector TEXT`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_address TEXT`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_latitude DECIMAL(10,8)`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_longitude DECIMAL(11,8)`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_user_id INTEGER`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_rule_id INTEGER`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS auto_assigned BOOLEAN DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS assignment_attempts INTEGER DEFAULT 0`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal'`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_type TEXT`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS description TEXT`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS received_amount DECIMAL(10,2)`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS change_amount DECIMAL(10,2)`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'sale'`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal_amount DECIMAL(10,2) DEFAULT 0`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_percentage DECIMAL(5,2) DEFAULT 0`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_points_property_name TEXT`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_points_value DECIMAL(10,2)`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_points_total DECIMAL(12,2) DEFAULT 0`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_points_credited BOOLEAN DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_points_credited_at TIMESTAMP`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS scheduled_date TIMESTAMP`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS completed_date TIMESTAMP`);
  await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS trip_id INTEGER`);

  // Ensure credit tables exist for charge/payment endpoints.
  await db.execute(sql`
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
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS credit_transactions (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      store_id INTEGER NOT NULL,
      order_id INTEGER REFERENCES orders(id),
      type TEXT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      balance_before DECIMAL(12,2) NOT NULL,
      balance_after DECIMAL(12,2) NOT NULL,
      description TEXT,
      payment_method TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

export async function ensureAppointmentCreditSchema(storeId: number): Promise<void> {
  if (schemaReadyByStore.has(storeId)) {
    return;
  }

  const pending = pendingByStore.get(storeId);
  if (pending) {
    await pending;
    return;
  }

  const run = applySchemaGuard(storeId)
    .then(() => {
      schemaReadyByStore.add(storeId);
    })
    .finally(() => {
      pendingByStore.delete(storeId);
    });

  pendingByStore.set(storeId, run);
  await run;
}
