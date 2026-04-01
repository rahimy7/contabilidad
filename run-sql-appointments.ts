import { Pool } from '@neondatabase/serverless';
import 'dotenv/config';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const r1 = await pool.query(`
    INSERT INTO views (route_path, label, icon_name, permission_required, section, is_system)
    VALUES ('/appointments', 'Agenda de Citas', 'CalendarDays', 'manage_appointments', 'admin', true)
    ON CONFLICT (route_path) DO NOTHING;
  `);
  console.log('Views INSERT:', r1.rowCount, 'row(s)');

  const r2 = await pool.query(`
    INSERT INTO role_permissions (role_id, view_id, can_access, sort_order)
    SELECT r.id, v.id, true, 15
    FROM roles r, views v
    WHERE r.name = 'admin' AND v.route_path = '/appointments'
    AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.view_id = v.id
    );
  `);
  console.log('Role permissions INSERT:', r2.rowCount, 'row(s)');

  const check = await pool.query(`
    SELECT v.id, v.label, v.route_path, rp.can_access 
    FROM views v 
    LEFT JOIN role_permissions rp ON rp.view_id = v.id 
    WHERE v.route_path = '/appointments';
  `);
  console.log('Verification:', JSON.stringify(check.rows, null, 2));

  await pool.end();
}
run();
