-- ================================
-- Migración: Agenda de Citas
-- ================================

-- 1. Crear tabla de citas
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

-- 2. Índices para rendimiento
CREATE INDEX IF NOT EXISTS idx_appointments_store_id ON appointments(store_id);
CREATE INDEX IF NOT EXISTS idx_appointments_customer_id ON appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

-- 3. Insertar la vista en la tabla views (para que aparezca en sidebar vía RBAC)
INSERT INTO views (route_path, label, icon_name, permission_required, section, is_system)
VALUES ('/appointments', 'Agenda de Citas', 'CalendarDays', 'manage_appointments', 'admin', true)
ON CONFLICT (route_path) DO NOTHING;

-- 4. Asignar la vista al rol admin (ajustar role_id según tu BD)
-- Primero obtener el ID del rol admin y el ID de la vista recién creada
INSERT INTO role_permissions (role_id, view_id, can_access, sort_order)
SELECT r.id, v.id, true, 15
FROM roles r, views v
WHERE r.name = 'admin' AND v.route_path = '/appointments'
ON CONFLICT DO NOTHING;
