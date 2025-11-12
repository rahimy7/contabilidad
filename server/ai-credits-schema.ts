/**
 * ESQUEMA DE CRÉDITOS DE IA
 *
 * Tabla para controlar el uso de créditos de IA por tienda
 */

import { pgTable, text, serial, integer, boolean, timestamp, decimal } from "drizzle-orm/pg-core";

// ========================================
// TABLA: AI_CREDITS (en base de datos MAESTRA)
// ========================================
export const aiCredits = pgTable("ai_credits", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().unique(), // Una configuración por tienda

  // Créditos disponibles
  totalCredits: integer("total_credits").notNull().default(0), // Total de créditos asignados
  usedCredits: integer("used_credits").notNull().default(0),   // Créditos consumidos
  availableCredits: integer("available_credits").notNull().default(0), // Créditos restantes

  // Control de uso
  isEnabled: boolean("is_enabled").notNull().default(true), // Si la IA está habilitada
  autoRecharge: boolean("auto_recharge").default(false),   // Recarga automática
  rechargeThreshold: integer("recharge_threshold").default(100), // Recarga cuando queden X créditos
  rechargeAmount: integer("recharge_amount").default(1000),     // Cantidad a recargar

  // Costos por operación (en créditos)
  costPerMessage: integer("cost_per_message").default(1),      // Costo por análisis de mensaje
  costPerOrder: integer("cost_per_order").default(5),          // Costo por procesar pedido
  costPerVoiceNote: integer("cost_per_voice_note").default(10), // Costo por transcribir audio

  // Configuración de comportamiento
  fallbackWhenNoCredits: boolean("fallback_when_no_credits").default(true), // Volver a flujo manual
  notifyLowCredits: boolean("notify_low_credits").default(true),
  lowCreditThreshold: integer("low_credit_threshold").default(50),

  // Estadísticas
  totalMessagesProcessed: integer("total_messages_processed").default(0),
  totalOrdersCreated: integer("total_orders_created").default(0),
  totalVoiceNotesTranscribed: integer("total_voice_notes_transcribed").default(0),

  // Fechas
  lastRecharge: timestamp("last_recharge"),
  lastUsage: timestamp("last_usage"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ========================================
// TABLA: AI_USAGE_LOG (en base de datos de TIENDA)
// ========================================
export const aiUsageLog = pgTable("ai_usage_log", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),

  // Identificación
  conversationId: integer("conversation_id"), // Si está vinculado a una conversación
  customerId: integer("customer_id"),         // Cliente que generó el uso
  customerPhone: text("customer_phone"),

  // Tipo de operación
  operationType: text("operation_type").notNull(), // 'message_analysis', 'order_creation', 'voice_transcription', 'product_search'

  // Costos
  creditsCost: integer("credits_cost").notNull(), // Créditos consumidos

  // Detalles de la operación
  inputText: text("input_text"),           // Mensaje original del cliente
  outputText: text("output_text"),         // Respuesta generada por IA
  interpretation: text("interpretation"),   // JSON con análisis de intención
  confidence: decimal("confidence", { precision: 3, scale: 2 }), // Nivel de confianza

  // Resultado
  wasSuccessful: boolean("was_successful").default(true),
  errorMessage: text("error_message"),

  // Metadatos
  processingTimeMs: integer("processing_time_ms"), // Tiempo de procesamiento
  modelUsed: text("model_used").default("gpt-4o-mini"),
  tokensUsed: integer("tokens_used"),

  // Fecha
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ========================================
// TABLA: AI_CONVERSATIONS (en base de datos de TIENDA)
// ========================================
export const aiConversations = pgTable("ai_conversations", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),

  // Identificación
  conversationId: integer("conversation_id").notNull(), // Vinculado a conversación de WhatsApp
  customerId: integer("customer_id").notNull(),
  customerPhone: text("customer_phone").notNull(),

  // Estado de la conversación con IA
  isActive: boolean("is_active").default(true),
  mode: text("mode").default("assistant"), // 'assistant', 'order_taking', 'product_search', 'support'

  // Contexto de la conversación
  conversationContext: text("conversation_context"), // JSON con mensajes recientes
  currentIntent: text("current_intent"),             // Última intención detectada

  // Carrito/Pedido en proceso
  draftOrderId: integer("draft_order_id"),           // ID de pedido borrador
  cartItems: text("cart_items"),                     // JSON con items en el carrito

  // Métricas
  messageCount: integer("message_count").default(0),
  lastMessageAt: timestamp("last_message_at"),

  // Fechas
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ========================================
// TABLA: AI_PRODUCT_MATCHES (en base de datos de TIENDA)
// ========================================
// Cachea resultados de búsqueda de productos para mejorar rendimiento
export const aiProductMatches = pgTable("ai_product_matches", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),

  // Query de búsqueda
  searchQuery: text("search_query").notNull(), // Texto original de búsqueda
  normalizedQuery: text("normalized_query").notNull(), // Query normalizada

  // Productos encontrados
  matchedProducts: text("matched_products").notNull(), // JSON con array de productos
  matchCount: integer("match_count").default(0),

  // Calidad del match
  confidence: decimal("confidence", { precision: 3, scale: 2 }),

  // Uso
  timesUsed: integer("times_used").default(1),
  lastUsedAt: timestamp("last_used_at").notNull().defaultNow(),

  // Fechas
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"), // Cache expira después de X días
});

// ========================================
// TIPOS TYPESCRIPT
// ========================================

export interface AICreditsConfig {
  storeId: number;
  totalCredits: number;
  availableCredits: number;
  isEnabled: boolean;
  costPerMessage: number;
  costPerOrder: number;
  costPerVoiceNote: number;
}

export interface AIUsageLogEntry {
  storeId: number;
  conversationId?: number;
  customerId?: number;
  customerPhone?: string;

  operationType: 'message_analysis' | 'order_creation' | 'voice_transcription' | 'product_search';
  creditsCost: number;

  inputText?: string;
  outputText?: string;

  // 🔧 Campos que causaban error — añadidos ahora
  interpretation?: string;
  confidence?: number;
  wasSuccessful?: boolean;

  errorMessage?: string;
  processingTimeMs?: number;
  modelUsed?: string;
  tokensUsed?: number;
  createdAt?: Date;
}

export interface AIConversationState {
  conversationId: number;
  customerId: number;
  mode: 'assistant' | 'order_taking' | 'product_search' | 'support';
  cartItems?: CartItem[];
  currentIntent?: string;
}

export interface CartItem {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}
