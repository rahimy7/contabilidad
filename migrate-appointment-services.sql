-- =====================================================
-- MIGRACIÓN: TITULARES Y SERVICIOS DE CITAS + CUMPLEAÑOS
-- =====================================================

-- 1. Agregar campo birthday_date a customers (si no existe)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS birthday_date TIMESTAMP;

-- 2. Crear tabla appointment_titulares
CREATE TABLE IF NOT EXISTS appointment_titulares (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  specialty TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 3. Crear tabla appointment_service_types
CREATE TABLE IF NOT EXISTS appointment_service_types (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  description TEXT,
  duration INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 4. Agregar columnas titular_id y service_type_id a appointments (si no existen)
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS titular_id INTEGER REFERENCES appointment_titulares(id),
  ADD COLUMN IF NOT EXISTS service_type_id INTEGER REFERENCES appointment_service_types(id);

-- 5. Insertar algunos servicios predefinidos de ejemplo (puedes ajustar store_id)
-- Estos se insertan solo si la tabla está vacía para store_id = 1
INSERT INTO appointment_service_types (store_id, name, category, description)
SELECT 1, 'Consulta General', 'general', 'Consulta general de evaluación'
WHERE NOT EXISTS (SELECT 1 FROM appointment_service_types WHERE store_id = 1 AND name = 'Consulta General');

INSERT INTO appointment_service_types (store_id, name, category, description)
SELECT 1, 'Programa Anticelulitis', 'programa_especial', 'Tratamiento integral anticelulitis'
WHERE NOT EXISTS (SELECT 1 FROM appointment_service_types WHERE store_id = 1 AND name = 'Programa Anticelulitis');

INSERT INTO appointment_service_types (store_id, name, category, description)
SELECT 1, 'Vacum', 'programa_especial', 'Terapia de vacum para modelado corporal'
WHERE NOT EXISTS (SELECT 1 FROM appointment_service_types WHERE store_id = 1 AND name = 'Vacum');

INSERT INTO appointment_service_types (store_id, name, category, description)
SELECT 1, 'Drenaje Linfático', 'programa_especial', 'Drenaje linfático manual o mecánico'
WHERE NOT EXISTS (SELECT 1 FROM appointment_service_types WHERE store_id = 1 AND name = 'Drenaje Linfático');

INSERT INTO appointment_service_types (store_id, name, category, description)
SELECT 1, 'Radiofrecuencia', 'programa_especial', 'Tratamiento de radiofrecuencia facial y corporal'
WHERE NOT EXISTS (SELECT 1 FROM appointment_service_types WHERE store_id = 1 AND name = 'Radiofrecuencia');

INSERT INTO appointment_service_types (store_id, name, category, description)
SELECT 1, 'Ultrasonido Cavitación', 'programa_especial', 'Reducción de grasa localizada por ultrasonido'
WHERE NOT EXISTS (SELECT 1 FROM appointment_service_types WHERE store_id = 1 AND name = 'Ultrasonido Cavitación');
