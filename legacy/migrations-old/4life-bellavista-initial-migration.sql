-- ================================
-- MIGRACIÓN INICIAL COMPLETA - 4LIFE BELLA VISTA
-- Base de datos única (no multi-tenant)
-- Fecha: 2025-12-14
-- ================================

-- Limpiar esquema existente si es necesario
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- ================================
-- CONFIGURACIÓN DE TIENDA
-- ================================

CREATE TABLE IF NOT EXISTS store_settings (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  store_whatsapp_number TEXT NOT NULL,
  store_name TEXT NOT NULL,
  store_address TEXT,
  store_email TEXT,
  store_phone TEXT,

  -- Logo y facturación
  logo_url TEXT,
  logo_storage_path TEXT,
  invoice_footer TEXT,
  invoice_number INTEGER DEFAULT 1,

  -- Información de la tienda
  business_hours TEXT DEFAULT '09:00-18:00',
  delivery_radius TEXT DEFAULT '50',
  base_site_url TEXT,

  -- Configuraciones generales
  enable_notifications BOOLEAN DEFAULT TRUE,
  auto_assign_orders BOOLEAN DEFAULT TRUE,
  currency TEXT DEFAULT 'DOP',
  tax_percentage DECIMAL(5, 2) DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ================================
-- USUARIOS Y EMPLEADOS
-- ================================

CREATE TABLE IF NOT EXISTS employee_profiles (
  id SERIAL PRIMARY KEY,
  employee_id TEXT UNIQUE,
  department TEXT NOT NULL,
  position TEXT NOT NULL,
  specializations TEXT[],
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL,
  address TEXT,
  status TEXT DEFAULT 'active',
  employee_profile_id INTEGER REFERENCES employee_profiles(id),
  last_login TIMESTAMP,
  current_orders INTEGER DEFAULT 0,

  -- Ubicación del técnico
  province TEXT,
  municipality TEXT,
  sector TEXT,

  -- Cobertura geográfica
  coverage_provinces TEXT[],
  coverage_municipalities TEXT[],
  coverage_sectors TEXT[],

  -- Especializaciones
  specializations TEXT[],

  -- Carga de trabajo
  max_daily_orders INTEGER DEFAULT 10,

  -- Nivel de habilidad
  skill_level INTEGER DEFAULT 1,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ================================
-- TIPOS DE CLIENTES Y CLIENTES
-- ================================

CREATE TABLE IF NOT EXISTS customer_types (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  description TEXT,
  discount_percentage DECIMAL(5, 2) DEFAULT 0.00,
  is_active BOOLEAN DEFAULT TRUE,
  color TEXT DEFAULT '#3b82f6',
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  store_id INTEGER NOT NULL DEFAULT 1,
  whatsapp_id TEXT,
  email TEXT UNIQUE NOT NULL,

  -- Categorización
  customer_type_id INTEGER REFERENCES customer_types(id),
  category TEXT DEFAULT 'regular',
  parent_customer_id INTEGER REFERENCES customers(id),

  -- Ubicación
  address TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  map_link TEXT,

  -- Contacto
  last_contact TIMESTAMP,
  registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Estadísticas
  total_orders INTEGER DEFAULT 0,
  total_spent DECIMAL(10, 2) DEFAULT 0.00,

  -- Estado
  is_vip BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,

  -- Notas
  notes TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_history (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) NOT NULL,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(10, 2),
  metadata TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ================================
-- SISTEMA DE PUNTOS DE LEALTAD
-- ================================

CREATE TABLE IF NOT EXISTS customer_loyalty_balance (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) NOT NULL UNIQUE,
  store_id INTEGER NOT NULL DEFAULT 1,

  -- Balance de puntos
  total_points_earned DECIMAL(12, 2) DEFAULT 0.00,
  total_points_redeemed DECIMAL(12, 2) DEFAULT 0.00,
  current_balance DECIMAL(12, 2) DEFAULT 0.00,

  -- Información del programa
  loyalty_program_name TEXT,
  points_property_name TEXT,

  -- Fechas
  last_earned_at TIMESTAMP,
  last_redeemed_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loyalty_points_transactions (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) NOT NULL,
  store_id INTEGER NOT NULL DEFAULT 1,

  -- Tipo de transacción
  type TEXT NOT NULL,

  -- Puntos
  points DECIMAL(12, 2) NOT NULL,
  balance_before DECIMAL(12, 2) NOT NULL,
  balance_after DECIMAL(12, 2) NOT NULL,

  -- Referencia
  order_id INTEGER,
  description TEXT NOT NULL,

  -- Metadata
  metadata TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ================================
-- NOTIFICACIONES
-- ================================

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  related_id INTEGER,
  related_type TEXT,
  metadata TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP
);

-- ================================
-- PRODUCTOS Y CATEGORÍAS
-- ================================

CREATE TABLE IF NOT EXISTS product_brands (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  description TEXT,
  logo TEXT,
  website TEXT,
  country_of_origin TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_categories (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  description TEXT,
  parent_id INTEGER,
  image_url TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS measurement_units (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  type TEXT NOT NULL,
  abbreviation TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  base_currency TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',

  -- Catálogo
  image_url TEXT,
  images TEXT[],
  sku TEXT UNIQUE,
  barcode TEXT,
  brand TEXT,
  model TEXT,
  specifications TEXT,
  features TEXT[],
  warranty TEXT,
  availability TEXT NOT NULL DEFAULT 'in_stock',
  stock_quantity INTEGER DEFAULT 0,
  min_quantity INTEGER DEFAULT 1,
  max_quantity INTEGER,
  lot_number TEXT,
  expiration_date TIMESTAMP,
  weight DECIMAL(8, 2),
  dimensions TEXT,
  tags TEXT[],
  sale_price DECIMAL(10, 2),
  is_promoted BOOLEAN DEFAULT FALSE,
  promotion_text TEXT,

  -- Fidelización
  loyalty_points_property_name TEXT,
  loyalty_points_value DECIMAL(10, 2),

  -- Sistema de conversión de unidades
  unit_conversion_enabled BOOLEAN DEFAULT FALSE,
  base_unit_id INTEGER,

  store_id INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_unit_conversions (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) NOT NULL,
  store_id INTEGER NOT NULL DEFAULT 1,
  source_unit_id INTEGER REFERENCES measurement_units(id) NOT NULL,
  target_unit_id INTEGER REFERENCES measurement_units(id) NOT NULL,
  conversion_factor DECIMAL(15, 6) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ================================
-- PROVEEDORES Y COMPRAS
-- ================================

CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  tax_id TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  purchase_number TEXT NOT NULL UNIQUE,
  supplier_id INTEGER REFERENCES suppliers(id),
  supplier_name TEXT,

  -- Fechas
  order_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expected_delivery_date TIMESTAMP,
  received_date TIMESTAMP,

  -- Estado
  status TEXT NOT NULL DEFAULT 'pending',

  -- Montos
  subtotal DECIMAL(12, 2) DEFAULT 0.00,
  tax DECIMAL(12, 2) DEFAULT 0.00,
  discount DECIMAL(12, 2) DEFAULT 0.00,
  shipping_cost DECIMAL(12, 2) DEFAULT 0.00,
  total_amount DECIMAL(12, 2) NOT NULL,
  currency TEXT DEFAULT 'DOP',

  -- Referencias
  invoice_number TEXT,
  reference_number TEXT,

  -- Detalles
  notes TEXT,
  payment_terms TEXT,
  payment_status TEXT DEFAULT 'unpaid',

  -- Auditoría
  created_by INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id SERIAL PRIMARY KEY,
  purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE CASCADE NOT NULL,
  store_id INTEGER NOT NULL DEFAULT 1,

  -- Producto
  product_id INTEGER REFERENCES products(id),
  product_name TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,

  -- Cantidad y unidades
  quantity DECIMAL(12, 2) NOT NULL,
  quantity_received DECIMAL(12, 2) DEFAULT 0.00,
  unit_id INTEGER,

  -- Trazabilidad
  lot_number TEXT,
  expiration_date TIMESTAMP,
  manufacturing_date TIMESTAMP,

  -- Precios
  unit_cost DECIMAL(12, 2) NOT NULL,
  tax_rate DECIMAL(5, 2) DEFAULT 0.00,
  discount_rate DECIMAL(5, 2) DEFAULT 0.00,
  total_cost DECIMAL(12, 2) NOT NULL,

  -- Notas
  notes TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  product_id INTEGER REFERENCES products(id) NOT NULL,

  -- Tipo de movimiento
  type TEXT NOT NULL,

  -- Cantidad
  quantity DECIMAL(12, 2) NOT NULL,
  quantity_before DECIMAL(12, 2),
  quantity_after DECIMAL(12, 2),
  unit_id INTEGER,

  -- Trazabilidad
  lot_number TEXT,
  expiration_date TIMESTAMP,

  -- Costos
  unit_cost DECIMAL(12, 2),
  total_cost DECIMAL(12, 2),

  -- Referencias
  reference_type TEXT,
  reference_id INTEGER,
  supplier_id INTEGER REFERENCES suppliers(id),

  -- Detalles
  notes TEXT,
  reason TEXT,

  -- Auditoría
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by INTEGER
);

-- ================================
-- ÓRDENES Y VIAJES
-- ================================

CREATE TABLE IF NOT EXISTS trips (
  id SERIAL PRIMARY KEY,
  trip_number TEXT NOT NULL UNIQUE,
  assigned_user_id INTEGER REFERENCES users(id),
  store_id INTEGER NOT NULL DEFAULT 1,

  status TEXT NOT NULL DEFAULT 'pending',

  total_orders INTEGER DEFAULT 0,
  completed_orders INTEGER DEFAULT 0,
  total_amount DECIMAL(10, 2) DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  sent_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  -- Metadatos
  notes TEXT,
  estimated_duration INTEGER,
  actual_duration INTEGER
);

CREATE TABLE IF NOT EXISTS assignment_rules (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 1,

  -- Criterios de ubicación
  use_sector_based BOOLEAN DEFAULT TRUE,
  required_province TEXT,
  required_municipality TEXT,
  required_sectors TEXT[],
  allow_adjacent_municipalities BOOLEAN DEFAULT TRUE,

  -- Criterios de especialización
  use_specialization_based BOOLEAN DEFAULT TRUE,
  required_specializations TEXT[],

  -- Criterios de carga de trabajo
  use_workload_based BOOLEAN DEFAULT TRUE,
  max_orders_per_technician INTEGER DEFAULT 5,

  -- Criterios de tiempo
  use_time_based BOOLEAN DEFAULT TRUE,
  availability_required BOOLEAN DEFAULT TRUE,

  -- Aplicabilidad
  applicable_products TEXT[],
  applicable_services TEXT[],

  -- Usuarios específicos
  assigned_user_ids INTEGER[],

  -- Comportamiento
  assignment_method TEXT DEFAULT 'closest_available',
  auto_assign BOOLEAN DEFAULT TRUE,
  notify_customer BOOLEAN DEFAULT TRUE,
  estimated_response_time INTEGER DEFAULT 60,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  store_id INTEGER NOT NULL DEFAULT 1,

  -- Información de ubicación del cliente
  customer_province TEXT,
  customer_municipality TEXT,
  customer_sector TEXT,
  customer_address TEXT,
  customer_latitude DECIMAL(10, 8),
  customer_longitude DECIMAL(11, 8),

  -- Asignación
  assigned_user_id INTEGER REFERENCES users(id),
  assigned_rule_id INTEGER REFERENCES assignment_rules(id),
  auto_assigned BOOLEAN DEFAULT FALSE,
  assignment_attempts INTEGER DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT DEFAULT 'normal',
  service_type TEXT,
  description TEXT,
  total_amount DECIMAL(10, 2) DEFAULT 0,

  -- Fidelización
  loyalty_points_property_name TEXT,
  loyalty_points_value DECIMAL(10, 2),
  loyalty_points_total DECIMAL(12, 2) DEFAULT 0,
  loyalty_points_credited BOOLEAN DEFAULT FALSE,
  loyalty_points_credited_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  scheduled_date TIMESTAMP,
  completed_date TIMESTAMP,

  trip_id INTEGER REFERENCES trips(id)
);

-- Añadir la referencia inversa en loyalty_points_transactions
ALTER TABLE loyalty_points_transactions ADD CONSTRAINT fk_order FOREIGN KEY (order_id) REFERENCES orders(id);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) NOT NULL,
  product_id INTEGER REFERENCES products(id) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL,
  total_price DECIMAL(10, 2) NOT NULL,

  -- Componentes de precio para servicios
  installation_cost DECIMAL(10, 2),
  parts_cost DECIMAL(10, 2),
  labor_hours DECIMAL(4, 2),
  labor_rate DECIMAL(10, 2),

  -- Costo de entrega
  delivery_cost DECIMAL(10, 2) DEFAULT 0,
  delivery_distance DECIMAL(8, 2),

  -- Sistema de conversión de unidades
  unit_id INTEGER,
  quantity_in_base_unit DECIMAL(12, 4),

  notes TEXT,
  store_id INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS trip_orders (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER REFERENCES trips(id) NOT NULL,
  order_id INTEGER REFERENCES orders(id) NOT NULL,
  store_id INTEGER NOT NULL DEFAULT 1,

  status TEXT NOT NULL DEFAULT 'pending',

  picked_at TIMESTAMP,
  scanned_qr BOOLEAN DEFAULT FALSE,

  sequence_number INTEGER,
  notes TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS order_history (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) NOT NULL,
  user_id INTEGER REFERENCES users(id),
  status_from TEXT,
  status_to TEXT NOT NULL,
  action TEXT NOT NULL,
  notes TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ================================
-- CONVERSACIONES Y MENSAJES
-- ================================

CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) NOT NULL,
  order_id INTEGER REFERENCES orders(id),
  conversation_type TEXT NOT NULL DEFAULT 'initial',
  channel_type TEXT NOT NULL DEFAULT 'whatsapp',
  webapp_enabled_until TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'active',
  last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  store_id INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES conversations(id) NOT NULL,
  sender_id INTEGER REFERENCES users(id),
  sender TEXT,
  sender_type TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  content TEXT NOT NULL,
  whatsapp_message_id TEXT,
  metadata TEXT,
  store_id INTEGER DEFAULT 1,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "isFromCustomer" BOOLEAN DEFAULT FALSE
);

-- ================================
-- WHATSAPP Y RESPUESTAS AUTOMÁTICAS
-- ================================

CREATE TABLE IF NOT EXISTS whatsapp_settings (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  access_token TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  webhook_verify_token TEXT NOT NULL,
  business_account_id TEXT,
  app_id TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS whatsapp_logs (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  phone_number TEXT,
  store_id INTEGER NOT NULL DEFAULT 1,
  message_content TEXT,
  message_id TEXT,
  status TEXT,
  error_message TEXT,
  raw_data TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS auto_responses (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  message TEXT NOT NULL,
  is_interactive BOOLEAN DEFAULT FALSE,
  interactive_data JSONB,
  trigger_text TEXT,
  name TEXT NOT NULL,
  trigger TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 1,
  message_text TEXT NOT NULL,
  requires_registration BOOLEAN DEFAULT FALSE,
  menu_options TEXT,
  next_action TEXT,
  menu_type TEXT DEFAULT 'buttons',
  show_back_button BOOLEAN DEFAULT FALSE,
  allow_free_text BOOLEAN DEFAULT TRUE,
  response_timeout INTEGER DEFAULT 300,
  max_retries INTEGER DEFAULT 3,
  fallback_message TEXT,
  conditional_display TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_registration_flows (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  phone_number TEXT NOT NULL,
  current_step TEXT NOT NULL,
  flow_type TEXT,
  order_id INTEGER REFERENCES orders(id),
  order_number TEXT,
  collected_data TEXT,
  requested_service TEXT,
  is_completed BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ================================
-- CARRITO DE COMPRAS
-- ================================

CREATE TABLE IF NOT EXISTS shopping_cart (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  product_id INTEGER REFERENCES products(id) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ================================
-- TASAS DE CAMBIO
-- ================================

CREATE TABLE IF NOT EXISTS exchange_rates (
  id SERIAL PRIMARY KEY,
  base_currency TEXT NOT NULL,
  target_currency TEXT NOT NULL,
  rate DECIMAL(10, 6) NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  store_id INTEGER NOT NULL DEFAULT 1,
  updated_by INTEGER REFERENCES users(id)
);

-- ================================
-- SISTEMA DE NOTIFICACIONES
-- ================================

CREATE TABLE IF NOT EXISTS notification_channels (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  settings JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_events (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  event_name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_configs (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES notification_events(id) NOT NULL,
  channel_id INTEGER REFERENCES notification_channels(id) NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  recipient_type TEXT NOT NULL,
  custom_recipients TEXT[],
  template TEXT NOT NULL,
  priority TEXT DEFAULT 'normal',
  delay_minutes INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_history (
  id SERIAL PRIMARY KEY,
  config_id INTEGER REFERENCES notification_configs(id),
  order_id INTEGER,
  recipient_id INTEGER,
  recipient_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ================================
-- SISTEMA DE IA
-- ================================

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,

  -- Identificación
  conversation_id INTEGER,
  customer_id INTEGER,
  customer_phone TEXT,

  -- Tipo de operación
  operation_type TEXT NOT NULL,

  -- Costos
  credits_cost INTEGER NOT NULL,

  -- Detalles
  input_text TEXT,
  output_text TEXT,
  interpretation TEXT,
  confidence DECIMAL(3, 2),

  -- Resultado
  was_successful BOOLEAN DEFAULT TRUE,
  error_message TEXT,

  -- Metadatos
  processing_time_ms INTEGER,
  model_used TEXT DEFAULT 'gpt-4o-mini',
  tokens_used INTEGER,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,

  -- Identificación
  conversation_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  customer_phone TEXT NOT NULL,

  -- Estado
  is_active BOOLEAN DEFAULT TRUE,
  mode TEXT DEFAULT 'assistant',

  -- Contexto
  conversation_context TEXT,
  current_intent TEXT,

  -- Carrito/Pedido
  draft_order_id INTEGER,
  cart_items TEXT,

  -- Productos pendientes
  pending_product_selection TEXT,
  pending_products_by_index TEXT,

  -- Métricas
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMP,

  -- Fechas
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_product_matches (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,

  -- Query
  search_query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,

  -- Productos encontrados
  matched_products TEXT NOT NULL,
  match_count INTEGER DEFAULT 0,

  -- Calidad
  confidence DECIMAL(3, 2),

  -- Uso
  times_used INTEGER DEFAULT 1,
  last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  expires_at TIMESTAMP
);

-- ================================
-- DATOS INICIALES
-- ================================

-- Insertar configuración inicial de la tienda
INSERT INTO store_settings (
  store_id,
  store_whatsapp_number,
  store_name,
  store_address,
  store_email,
  store_phone,
  currency,
  business_hours
) VALUES (
  1,
  '',  -- Configurar después
  '4Life Bella Vista',
  '',  -- Configurar después
  '',  -- Configurar después
  '',  -- Configurar después
  'DOP',
  '09:00-18:00'
) ON CONFLICT DO NOTHING;

-- Insertar usuario admin por defecto
INSERT INTO users (
  username,
  password,
  name,
  email,
  role,
  status
) VALUES (
  'admin',
  '$2b$10$YourHashedPasswordHere',  -- Cambiar por hash real
  'Administrador',
  'admin@4lifebellavista.com',
  'admin',
  'active'
) ON CONFLICT (username) DO NOTHING;

-- ================================
-- ÍNDICES PARA MEJOR RENDIMIENTO
-- ================================

-- Índices para clientes
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_store_id ON customers(store_id);
CREATE INDEX IF NOT EXISTS idx_customers_customer_type_id ON customers(customer_type_id);

-- Índices para órdenes
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_user_id ON orders(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- Índices para productos
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

-- Índices para conversaciones
CREATE INDEX IF NOT EXISTS idx_conversations_customer_id ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_order_id ON conversations(order_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);

-- Índices para mensajes
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Índices para usuarios
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- ================================
-- GRANTS Y PERMISOS
-- ================================

-- Otorgar permisos al usuario de la base de datos
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO neondb_owner;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO neondb_owner;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO neondb_owner;

-- ================================
-- FIN DE MIGRACIÓN
-- ================================

SELECT 'Migración completada exitosamente para 4Life Bella Vista' AS status;
