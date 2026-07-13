// migrations/restructure-employees.ts
import { sql } from 'drizzle-orm';
import { db } from '../server/db';

export async function restructureEmployees() {
  console.log('Restructuring employee system...');
  
  // Remover userId de employee_profiles
  await db.execute(sql`
    ALTER TABLE employee_profiles 
    DROP COLUMN IF EXISTS user_id;
  `);
  
  // Agregar employeeProfileId a users
  await db.execute(sql`
    ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS employee_profile_id INTEGER REFERENCES employee_profiles(id),
    ADD COLUMN IF NOT EXISTS emergency_contact TEXT,
    ADD COLUMN IF NOT EXISTS emergency_phone TEXT,
    ADD COLUMN IF NOT EXISTS vehicle_info TEXT,
    ADD COLUMN IF NOT EXISTS current_orders INTEGER DEFAULT 0;
  `);
  
  console.log('✅ Restructure complete');
}