/**
 * MIGRACIÓN DE TABLAS DE IA
 *
 * Este script crea las tablas de IA en:
 * 1. Base de datos MAESTRA (ai_credits)
 * 2. Cada base de datos de TIENDA (ai_usage_log, ai_conversations, ai_product_matches)
 */

import 'dotenv/config';
import { Pool } from '@neondatabase/serverless';
import { getMasterStorage } from './storage/index.js';

// ========================================
// SQL PARA CREAR TABLAS
// ========================================

const CREATE_AI_CREDITS_TABLE = `
CREATE TABLE IF NOT EXISTS ai_credits (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL UNIQUE,

  total_credits INTEGER NOT NULL DEFAULT 0,
  used_credits INTEGER NOT NULL DEFAULT 0,
  available_credits INTEGER NOT NULL DEFAULT 0,

  is_enabled BOOLEAN NOT NULL DEFAULT true,
  auto_recharge BOOLEAN DEFAULT false,
  recharge_threshold INTEGER DEFAULT 100,
  recharge_amount INTEGER DEFAULT 1000,

  cost_per_message INTEGER DEFAULT 1,
  cost_per_order INTEGER DEFAULT 5,
  cost_per_voice_note INTEGER DEFAULT 10,

  fallback_when_no_credits BOOLEAN DEFAULT true,
  notify_low_credits BOOLEAN DEFAULT true,
  low_credit_threshold INTEGER DEFAULT 50,

  total_messages_processed INTEGER DEFAULT 0,
  total_orders_created INTEGER DEFAULT 0,
  total_voice_notes_transcribed INTEGER DEFAULT 0,

  last_recharge TIMESTAMP,
  last_usage TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

const CREATE_AI_USAGE_LOG_TABLE = `
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL,

  conversation_id INTEGER,
  customer_id INTEGER,
  customer_phone TEXT,

  operation_type TEXT NOT NULL,
  credits_cost INTEGER NOT NULL,

  input_text TEXT,
  output_text TEXT,
  interpretation TEXT,
  confidence DECIMAL(3,2),

  was_successful BOOLEAN DEFAULT true,
  error_message TEXT,

  processing_time_ms INTEGER,
  model_used TEXT DEFAULT 'gpt-4o-mini',
  tokens_used INTEGER,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_store_date
  ON ai_usage_log(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_customer
  ON ai_usage_log(customer_id, created_at DESC);
`;

const CREATE_AI_CONVERSATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS ai_conversations (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL,

  conversation_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  customer_phone TEXT NOT NULL,

  is_active BOOLEAN DEFAULT true,
  mode TEXT DEFAULT 'assistant',

  conversation_context TEXT,
  current_intent TEXT,

  draft_order_id INTEGER,
  cart_items TEXT,

  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMP,

  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_conversation
  ON ai_conversations(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_customer
  ON ai_conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_active
  ON ai_conversations(is_active, store_id);
`;

const CREATE_AI_PRODUCT_MATCHES_TABLE = `
CREATE TABLE IF NOT EXISTS ai_product_matches (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL,

  search_query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,

  matched_products TEXT NOT NULL,
  match_count INTEGER DEFAULT 0,
  confidence DECIMAL(3,2),

  times_used INTEGER DEFAULT 1,
  last_used_at TIMESTAMP NOT NULL DEFAULT NOW(),

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_product_matches_query
  ON ai_product_matches(normalized_query, store_id);
`;

// ========================================
// FUNCIONES DE MIGRACIÓN
// ========================================

/**
 * Crear tabla de créditos en base de datos maestra
 */
async function createAICreditsTableInMaster(masterDb: any) {
  console.log('\n📊 Creando tabla ai_credits en base de datos MAESTRA...');

  try {
    await masterDb.execute(CREATE_AI_CREDITS_TABLE);
    console.log('✅ Tabla ai_credits creada exitosamente');
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      console.log('ℹ️ Tabla ai_credits ya existe');
    } else {
      console.error('❌ Error creando tabla ai_credits:', error);
      throw error;
    }
  }
}

/**
 * Crear tablas de IA en base de datos de tienda
 */
async function createAITablesInTenant(tenantDbUrl: string, storeName: string) {
  console.log(`\n🏪 Procesando tienda: ${storeName}`);

  const pool = new Pool({ connectionString: tenantDbUrl });

  try {
    // Crear tabla ai_usage_log
    console.log('  📝 Creando ai_usage_log...');
    await pool.query(CREATE_AI_USAGE_LOG_TABLE);
    console.log('  ✅ ai_usage_log creada');

    // Crear tabla ai_conversations
    console.log('  💬 Creando ai_conversations...');
    await pool.query(CREATE_AI_CONVERSATIONS_TABLE);
    console.log('  ✅ ai_conversations creada');

    // Crear tabla ai_product_matches
    console.log('  🔍 Creando ai_product_matches...');
    await pool.query(CREATE_AI_PRODUCT_MATCHES_TABLE);
    console.log('  ✅ ai_product_matches creada');

  } catch (error: any) {
    if (error.message.includes('already exists')) {
      console.log('  ℹ️ Tablas ya existen');
    } else {
      console.error(`  ❌ Error en ${storeName}:`, error);
      throw error;
    }
  } finally {
    await pool.end();
  }
}

/**
 * Inicializar créditos para una tienda
 */
async function initializeCreditsForStore(masterStorage: any, storeId: number, storeName: string) {
  try {
    const existingCredits = await masterStorage.getAICredits(storeId);

    if (!existingCredits) {
      console.log(`  💳 Inicializando créditos para ${storeName}...`);
      await masterStorage.createAICredits(storeId, 1000);
      console.log(`  ✅ Créditos inicializados: 1000 créditos`);
    } else {
      console.log(`  ℹ️ Créditos ya existen: ${existingCredits.availableCredits} disponibles`);
    }
  } catch (error) {
    console.error(`  ❌ Error inicializando créditos:`, error);
  }
}

// ========================================
// EJECUCIÓN PRINCIPAL
// ========================================

async function runMigration() {
  console.log('\n🚀 ==========================================');
  console.log('   MIGRACIÓN DE TABLAS DE IA');
  console.log('==========================================\n');

  try {
    // Obtener master storage
    const masterStorage = await getMasterStorage();

    // 1. Crear tabla de créditos en BD maestra
    await createAICreditsTableInMaster((masterStorage as any).db);

    // 2. Obtener todas las tiendas
    const stores = await masterStorage.getAllStores();
    console.log(`\n📍 Encontradas ${stores.length} tienda(s)\n`);

    // 3. Crear tablas en cada tienda
    for (const store of stores) {
      try {
        // Crear tablas de IA
        await createAITablesInTenant(store.databaseUrl, store.name);

        // Inicializar créditos
        await initializeCreditsForStore(masterStorage, store.id, store.name);

      } catch (error) {
        console.error(`⚠️ Error procesando ${store.name}, continuando...`);
      }
    }

    console.log('\n✅ ==========================================');
    console.log('   MIGRACIÓN COMPLETADA EXITOSAMENTE');
    console.log('==========================================\n');

    // Mostrar resumen
    console.log('📊 RESUMEN:');
    console.log(`   - Tiendas procesadas: ${stores.length}`);
    console.log(`   - Tablas creadas por tienda: 3`);
    console.log(`   - Tabla maestra: 1`);
    console.log(`   - Total tablas: ${stores.length * 3 + 1}\n`);

    process.exit(0);

  } catch (error: any) {
    console.error('\n❌ ERROR EN MIGRACIÓN:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Ejecutar migración
runMigration();
