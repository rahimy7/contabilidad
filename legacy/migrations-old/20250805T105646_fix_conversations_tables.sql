-- Migración para corregir tablas de conversaciones
-- Generado por fix-all-conversations.js en 2025-08-05T10:56:46.316Z

-- ================================
-- TABLA CONVERSATIONS
-- ================================
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  conversation_type TEXT DEFAULT 'initial',
  status TEXT DEFAULT 'active',
  last_message_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ================================
-- TABLA MESSAGES
-- ================================
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL,
  sender_id INTEGER,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'agent')),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  whatsapp_message_id TEXT UNIQUE,
  is_read BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ================================
-- ÍNDICES PARA RENDIMIENTO
-- ================================
CREATE INDEX IF NOT EXISTS idx_conversations_customer_id ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_type ON messages(sender_type);
CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_id ON messages(whatsapp_message_id);

-- ================================
-- COMENTARIOS
-- ================================
COMMENT ON TABLE conversations IS 'Conversaciones entre clientes y la tienda via WhatsApp';
COMMENT ON TABLE messages IS 'Mensajes individuales dentro de las conversaciones';

COMMENT ON COLUMN conversations.conversation_type IS 'Tipo: initial, order, support, etc.';
COMMENT ON COLUMN conversations.status IS 'Estado: active, closed, pending';
COMMENT ON COLUMN messages.sender_type IS 'Quien envió: customer o agent';
COMMENT ON COLUMN messages.message_type IS 'Tipo: text, image, audio, document, etc.';
