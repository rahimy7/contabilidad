import { Pool } from '@neondatabase/serverless';
import 'dotenv/config';

async function migrateAppointments() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('🔄 Starting appointments migration...\n');

    // 1. Create appointments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        store_id INTEGER NOT NULL,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        title TEXT NOT NULL,
        description TEXT,
        appointment_date TIMESTAMP NOT NULL,
        appointment_end_date TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'scheduled',
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log('✅ appointments table created');

    // 2. Create indexes
    await pool.query('CREATE INDEX IF NOT EXISTS idx_appointments_store_id ON appointments(store_id);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_appointments_customer_id ON appointments(customer_id);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);');
    console.log('✅ Indexes created');

    // 3. Insert view for sidebar
    await pool.query(`
      INSERT INTO views (route_path, label, icon_name, permission_required, section, is_system)
      VALUES ('/appointments', 'Agenda de Citas', 'CalendarDays', 'manage_appointments', 'admin', true)
      ON CONFLICT (route_path) DO NOTHING;
    `);
    console.log('✅ View inserted into views table');

    // 4. Assign view to admin role
    const res = await pool.query(`
      INSERT INTO role_permissions (role_id, view_id, can_access, sort_order)
      SELECT r.id, v.id, true, 15
      FROM roles r, views v
      WHERE r.name = 'admin' AND v.route_path = '/appointments'
      AND NOT EXISTS (
        SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.view_id = v.id
      )
      RETURNING id;
    `);
    console.log(`✅ Role permissions assigned: ${res.rowCount} row(s)`);

    await pool.end();
    console.log('\n🎉 Appointments migration complete!');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

migrateAppointments();
