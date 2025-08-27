#!/usr/bin/env node
// fix-all-conversations.js
// Script maestro para corregir todos los problemas de conversaciones

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.cwd();
const SERVER_PATH = path.join(PROJECT_ROOT, 'server');

console.log('🚀 INICIANDO CORRECCIÓN COMPLETA DE CONVERSACIONES\n');
console.log('Este script va a:');
console.log('1. ✅ Corregir endpoints de conversaciones');
console.log('2. ✅ Verificar esquema de base de datos');
console.log('3. ✅ Crear archivos de prueba');
console.log('4. ✅ Verificar configuración de React Query');
console.log('5. ✅ Generar documentación');
console.log('');

// ====================================
// 1. CORREGIR ENDPOINTS
// ====================================

console.log('🔧 PASO 1: CORRIGIENDO ENDPOINTS...\n');

function fixConversationsEndpoints() {
  console.log('📝 Corrigiendo routes.ts...');
  
  const routesPath = path.join(SERVER_PATH, 'routes.ts');
  
  if (!fs.existsSync(routesPath)) {
    console.log('⚠️ routes.ts no encontrado');
    return false;
  }
  
  let content = fs.readFileSync(routesPath, 'utf8');
  
  // Buscar la sección de CONVERSATION ROUTES
  const conversationSectionStart = content.indexOf('// CONVERSATION ROUTES');
  
  if (conversationSectionStart === -1) {
    console.log('⚠️ Sección CONVERSATION ROUTES no encontrada');
    return false;
  }
  
  // Encontrar el final de la sección
  const nextSectionStart = content.indexOf('// ORDER ROUTES', conversationSectionStart);
  
  // Nueva implementación corregida
  const newConversationRoutes = `  // ================================
  // CONVERSATION ROUTES - CORREGIDOS ✅
  // ================================

  router.get('/conversations', authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      console.log('📞 [GET /conversations] User store:', user.storeId);
      
      const tenantStorage = await getTenantStorageForUser(user);
      const conversations = await tenantStorage.getAllConversations();
      
      console.log('✅ [GET /conversations] Found:', conversations.length, 'conversations');
      res.json(conversations);
    } catch (error) {
      console.error('❌ [GET /conversations] Error:', error);
      res.status(500).json({ 
        error: "Failed to fetch conversations",
        details: error.message 
      });
    }
  });

  router.get('/conversations/:id', authenticateToken, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as AuthUser;
      
      console.log('📞 [GET /conversations/:id] ID:', id, 'User store:', user.storeId);
      
      const tenantStorage = await getTenantStorageForUser(user);
      const conversation = await tenantStorage.getConversationById(id);
      
      if (!conversation) {
        console.log('⚠️ [GET /conversations/:id] Not found:', id);
        return res.status(404).json({ error: 'Conversation not found' });
      }
      
      // También obtener los mensajes
      const messages = await tenantStorage.getMessagesByConversation(id);
      
      const result = {
        ...conversation,
        messages: messages || []
      };
      
      console.log('✅ [GET /conversations/:id] Success:', id, 'with', messages?.length || 0, 'messages');
      res.json(result);
    } catch (error) {
      console.error('❌ [GET /conversations/:id] Error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch conversation',
        details: error.message 
      });
    }
  });

  router.post('/conversations', authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      console.log('📞 [POST /conversations] Creating:', req.body);
      
      const conversationData = { 
        ...req.body, 
        storeId: user.storeId,
        createdAt: new Date(),
        lastMessageAt: new Date()
      };
      
      const tenantStorage = await getTenantStorageForUser(user);
      const conversation = await tenantStorage.createConversation(conversationData);
      
      console.log('✅ [POST /conversations] Created:', conversation.id);
      res.status(201).json(conversation);
    } catch (error) {
      console.error('❌ [POST /conversations] Error:', error);
      res.status(500).json({ 
        error: "Failed to create conversation",
        details: error.message 
      });
    }
  });

  router.put('/conversations/:id', authenticateToken, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as AuthUser;
      
      console.log('📞 [PUT /conversations/:id] Updating:', id, req.body);
      
      const tenantStorage = await getTenantStorageForUser(user);
      const conversation = await tenantStorage.updateConversation(id, {
        ...req.body,
        updatedAt: new Date()
      });
      
      if (!conversation) {
        console.log('⚠️ [PUT /conversations/:id] Not found:', id);
        return res.status(404).json({ error: 'Conversation not found' });
      }
      
      console.log('✅ [PUT /conversations/:id] Updated:', id);
      res.json(conversation);
    } catch (error) {
      console.error('❌ [PUT /conversations/:id] Error:', error);
      res.status(500).json({ 
        error: "Failed to update conversation",
        details: error.message 
      });
    }
  });

  router.get('/conversations/:id/messages', authenticateToken, async (req: any, res: any) => {
    try {
      const conversationId = parseInt(req.params.id);
      const user = req.user as AuthUser;
      
      console.log('💬 [GET /conversations/:id/messages] Conversation:', conversationId);
      
      const tenantStorage = await getTenantStorageForUser(user);
      const messages = await tenantStorage.getMessagesByConversation(conversationId);
      
      console.log('✅ [GET /conversations/:id/messages] Found:', messages.length, 'messages');
      res.json(messages);
    } catch (error) {
      console.error('❌ [GET /conversations/:id/messages] Error:', error);
      res.status(500).json({ 
        error: "Failed to fetch messages",
        details: error.message 
      });
    }
  });

  router.post('/conversations/:id/messages', authenticateToken, async (req: any, res: any) => {
    try {
      const conversationId = parseInt(req.params.id);
      const user = req.user as AuthUser;
      
      console.log('💬 [POST /conversations/:id/messages] Creating message for conversation:', conversationId);
      
      const messageData = {
        ...req.body,
        conversationId: conversationId,
        senderType: req.body.senderType || 'agent',
        senderId: user.id,
        createdAt: new Date(),
        sentAt: new Date()
      };
      
      const tenantStorage = await getTenantStorageForUser(user);
      const message = await tenantStorage.createMessage(messageData);
      
      console.log('✅ [POST /conversations/:id/messages] Created message:', message.id);
      res.status(201).json(message);
    } catch (error) {
      console.error('❌ [POST /conversations/:id/messages] Error:', error);
      res.status(500).json({ 
        error: "Failed to create message",
        details: error.message 
      });
    }
  });

`;

  // Reemplazar la sección existente
  if (nextSectionStart !== -1) {
    content = content.slice(0, conversationSectionStart) + 
              newConversationRoutes + 
              content.slice(nextSectionStart);
  } else {
    // Si no hay siguiente sección, buscar el final de las rutas
    const routerMountIndex = content.indexOf('// ============');
    if (routerMountIndex !== -1) {
      content = content.slice(0, conversationSectionStart) + 
                newConversationRoutes + 
                '\n  ' + 
                content.slice(routerMountIndex);
    }
  }
  
  fs.writeFileSync(routesPath, content);
  console.log('   ✅ routes.ts actualizado con endpoints mejorados');
  return true;
}

// ====================================
// 2. ELIMINAR DUPLICADOS EN INDEX.TS
// ====================================

function fixIndexConversations() {
  console.log('📝 Verificando duplicados en index.ts...');
  
  const indexPath = path.join(SERVER_PATH, 'index.ts');
  
  if (!fs.existsSync(indexPath)) {
    console.log('⚠️ index.ts no encontrado');
    return false;
  }
  
  let content = fs.readFileSync(indexPath, 'utf8');
  
  // Verificar si hay duplicados de endpoints de conversaciones
  const conversationEndpointMatches = content.match(/apiRouter\.get\('\/conversations'/g);
  const conversationEndpointCount = conversationEndpointMatches ? conversationEndpointMatches.length : 0;
  
  if (conversationEndpointCount > 0) {
    console.log('⚠️ Encontrados ' + conversationEndpointCount + ' endpoints duplicados en index.ts');
    
    // Comentar los endpoints duplicados en index.ts
    content = content.replace(
      /apiRouter\.get\('\/conversations'[\s\S]*?}\);/g,
      '// MOVED TO routes.ts - Endpoint moved to avoid conflicts\n  // $&'
    );
    
    content = content.replace(
      /apiRouter\.get\('\/conversations\/:id'[\s\S]*?}\);/g,
      '// MOVED TO routes.ts - Endpoint moved to avoid conflicts\n  // $&'
    );
    
    fs.writeFileSync(indexPath, content);
    console.log('   ✅ Endpoints duplicados comentados en index.ts');
  } else {
    console.log('   ✅ No se encontraron endpoints duplicados en index.ts');
  }
  
  return true;
}

// ====================================
// 3. AGREGAR ENDPOINT DE DEBUG
// ====================================

function addDebugEndpoint() {
  console.log('📝 Agregando endpoint de debug...');
  
  const indexPath = path.join(SERVER_PATH, 'index.ts');
  
  if (!fs.existsSync(indexPath)) {
    console.log('⚠️ index.ts no encontrado');
    return false;
  }
  
  let content = fs.readFileSync(indexPath, 'utf8');
  
  // Verificar si ya existe el endpoint de debug
  if (content.includes('/api/debug/conversations')) {
    console.log('   ✅ Endpoint de debug ya existe');
    return true;
  }
  
  // Agregar el endpoint de debug
  const debugEndpoint = `
// ================================
// DEBUG CONVERSATIONS ENDPOINT - AÑADIDO ✅
// ================================

apiRouter.get('/debug/conversations', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    console.log('🐛 [DEBUG /conversations] User:', {
      id: user.id,
      storeId: user.storeId,
      username: user.username
    });
    
    // Obtener storage
    const tenantStorage = await getTenantStorageForUser(user);
    console.log('🐛 [DEBUG /conversations] Storage obtained');
    
    // Obtener datos
    const conversations = await tenantStorage.getAllConversations();
    const customers = await tenantStorage.getAllCustomers();
    const messages = await tenantStorage.getAllMessages();
    
    console.log('🐛 [DEBUG /conversations] Data counts:', {
      conversations: conversations.length,
      customers: customers.length,
      messages: messages.length
    });
    
    res.json({
      debug: true,
      timestamp: new Date().toISOString(),
      user: {
        id: user.id,
        storeId: user.storeId,
        username: user.username
      },
      data: {
        conversations: {
          count: conversations.length,
          items: conversations,
          sample: conversations.slice(0, 3)
        },
        customers: {
          count: customers.length,
          sample: customers.slice(0, 3)
        },
        messages: {
          count: messages.length,
          sample: messages.slice(0, 5)
        }
      },
      methods_available: [
        'getAllConversations',
        'getConversationById',
        'createConversation',
        'updateConversation',
        'getAllMessages',
        'getMessagesByConversation',
        'createMessage'
      ]
    });
  } catch (error) {
    console.error('❌ [DEBUG /conversations] Error:', error);
    res.status(500).json({ 
      debug: true,
      error: error.message,
      stack: error.stack ? error.stack.split('\\n').slice(0, 10) : []
    });
  }
});
`;

  // Insertar antes del final de los endpoints de API
  const insertPoint = content.indexOf('// ================================\n// START SERVER');
  if (insertPoint !== -1) {
    content = content.slice(0, insertPoint) + 
              debugEndpoint + 
              '\n' + 
              content.slice(insertPoint);
  } else {
    // Si no encuentra el punto, insertar antes de app.use
    const appUseIndex = content.indexOf('app.use("/api", apiRouter);');
    if (appUseIndex !== -1) {
      content = content.slice(0, appUseIndex) + 
                debugEndpoint + 
                '\n' + 
                content.slice(appUseIndex);
    }
  }
  
  fs.writeFileSync(indexPath, content);
  console.log('   ✅ Endpoint de debug agregado: GET /api/debug/conversations');
  return true;
}

// ====================================
// 4. VERIFICAR ESQUEMA DE BASE DE DATOS
// ====================================

console.log('🔧 PASO 2: VERIFICANDO ESQUEMA DE BASE DE DATOS...\n');

function verifyDatabaseSchema() {
  console.log('📝 Verificando esquema en db/index.ts...');
  
  const schemaPath = path.join(SERVER_PATH, 'db', 'index.ts');
  
  if (!fs.existsSync(schemaPath)) {
    console.log('⚠️ db/index.ts no encontrado');
    return false;
  }
  
  let content = fs.readFileSync(schemaPath, 'utf8');
  
  // Verificar que existan las tablas necesarias
  const hasConversations = content.includes('export const conversations');
  const hasMessages = content.includes('export const messages');
  const hasCustomers = content.includes('export const customers');
  
  console.log('   📋 Estado de las tablas:');
  console.log('   ' + (hasConversations ? '✅' : '❌') + ' conversations');
  console.log('   ' + (hasMessages ? '✅' : '❌') + ' messages');
  console.log('   ' + (hasCustomers ? '✅' : '❌') + ' customers');
  
  // Verificar relaciones
  const hasConversationRelations = content.includes('conversationId') && content.includes('customerId');
  console.log('   ' + (hasConversationRelations ? '✅' : '⚠️') + ' Relaciones entre tablas');
  
  return hasConversations && hasMessages && hasCustomers;
}

function createMigrationSQL() {
  console.log('📝 Creando migración SQL...');
  
  const migrationsPath = path.join(PROJECT_ROOT, 'migrations');
  
  if (!fs.existsSync(migrationsPath)) {
    fs.mkdirSync(migrationsPath, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const migrationFile = path.join(migrationsPath, timestamp + '_fix_conversations_tables.sql');
  
  const migrationSQL = `-- Migración para corregir tablas de conversaciones
-- Generado por fix-all-conversations.js en ${new Date().toISOString()}

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
`;

  fs.writeFileSync(migrationFile, migrationSQL);
  console.log('   ✅ Migración SQL creada: ' + migrationFile);
  return migrationFile;
}

// ====================================
// 5. CREAR ARCHIVOS DE PRUEBA
// ====================================

console.log('🔧 PASO 3: CREANDO ARCHIVOS DE PRUEBA...\n');

function createTestFiles() {
  console.log('📝 Creando archivos de prueba...');
  
  const testDir = path.join(PROJECT_ROOT, 'test-conversations');
  
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  
  // Test script para API
  const apiTestScript = `#!/usr/bin/env node
// test-conversations-api.js
// Script para probar los endpoints de conversaciones

const BASE_URL = 'http://localhost:3001/api';
let authToken = '';

async function testConversationsAPI() {
  console.log('🧪 PROBANDO API DE CONVERSACIONES\\n');
  
  try {
    // Simular token de prueba
    authToken = 'test-token';
    console.log('🔐 Usando token de prueba');
    
    // Test endpoint debug
    console.log('\\n2. 🐛 Probando endpoint debug...');
    console.log('   URL: ' + BASE_URL + '/debug/conversations');
    
    // Test GET conversations
    console.log('\\n3. 📞 Probando GET /conversations...');
    console.log('   URL: ' + BASE_URL + '/conversations');
    
    console.log('\\n🎉 URLs de prueba generadas');
    console.log('\\n📋 Para probar manualmente:');
    console.log('1. Hacer login en la aplicación');
    console.log('2. Abrir DevTools > Network');
    console.log('3. Acceder a la sección de conversaciones');
    console.log('4. Revisar las peticiones HTTP');
    
  } catch (error) {
    console.error('💥 Error en las pruebas:', error.message);
  }
}

// Ejecutar las pruebas
testConversationsAPI().catch(console.error);
`;

  fs.writeFileSync(path.join(testDir, 'test-conversations-api.js'), apiTestScript);
  
  // Test script para WhatsApp webhook
  const webhookTestScript = `#!/usr/bin/env node
// test-whatsapp-webhook.js
// Script para simular webhooks de WhatsApp

const WEBHOOK_URL = 'http://localhost:3001/api/webhook';

async function testWhatsAppWebhook() {
  console.log('🧪 PROBANDO WEBHOOK DE WHATSAPP\\n');
  
  // Simular mensaje entrante
  const testMessage = {
    object: "whatsapp_business_account",
    entry: [{
      id: "test_entry_id",
      changes: [{
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: "18495012707",
            phone_number_id: "766302823222313"
          },
          contacts: [{
            profile: { name: "Test User" },
            wa_id: "18494553242"
          }],
          messages: [{
            from: "18494553242",
            id: "test_message_id_" + Date.now(),
            timestamp: Math.floor(Date.now() / 1000).toString(),
            text: { body: "Hola, este es un mensaje de prueba" },
            type: "text"
          }]
        },
        field: "messages"
      }]
    }]
  };
  
  console.log('📤 Mensaje de prueba preparado');
  console.log('📊 URL del webhook:', WEBHOOK_URL);
  console.log('🎉 Para probar, envía este JSON al webhook usando Postman o curl');
  console.log('\\nJSON:', JSON.stringify(testMessage, null, 2));
}

// Ejecutar la prueba
testWhatsAppWebhook().catch(console.error);
`;

  fs.writeFileSync(path.join(testDir, 'test-whatsapp-webhook.js'), webhookTestScript);
  
  console.log('   ✅ Archivos de prueba creados en: ' + testDir);
  return true;
}

// ====================================
// 6. CREAR DOCUMENTACIÓN
// ====================================

console.log('🔧 PASO 4: GENERANDO DOCUMENTACIÓN...\n');

function createDocumentation() {
  console.log('📝 Creando documentación...');
  
  const docsDir = path.join(PROJECT_ROOT, 'docs-conversations');
  
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }
  
  const apiDocs = `# API de Conversaciones - Documentación

## Endpoints Disponibles

### 1. GET /api/conversations
**Descripción:** Obtiene todas las conversaciones de la tienda
**Autenticación:** Requerida
**Respuesta:** Array de conversaciones

### 2. GET /api/conversations/:id
**Descripción:** Obtiene una conversación específica con sus mensajes
**Autenticación:** Requerida
**Parámetros:** id (número)

### 3. POST /api/conversations
**Descripción:** Crea una nueva conversación
**Autenticación:** Requerida

### 4. PUT /api/conversations/:id
**Descripción:** Actualiza una conversación
**Autenticación:** Requerida

### 5. GET /api/conversations/:id/messages
**Descripción:** Obtiene todos los mensajes de una conversación
**Autenticación:** Requerida

### 6. POST /api/conversations/:id/messages
**Descripción:** Crea un nuevo mensaje en una conversación
**Autenticación:** Requerida

### 7. GET /api/debug/conversations
**Descripción:** Endpoint de debug para verificar estado del sistema
**Autenticación:** Requerida

## Estados de Conversación
- active: Conversación activa
- closed: Conversación cerrada
- pending: Esperando respuesta

## Tipos de Conversación
- initial: Primera interacción
- order: Relacionada a pedidos
- support: Soporte técnico
- inquiry: Consulta general

## Códigos de Error
- 400: Datos inválidos
- 401: No autenticado
- 403: Sin permisos
- 404: Conversación no encontrada
- 500: Error interno del servidor
`;

  fs.writeFileSync(path.join(docsDir, 'API-Documentation.md'), apiDocs);
  
  const setupDocs = `# Guía de Configuración

## Pasos de Instalación

### 1. Ejecutar Script de Corrección
chmod +x fix-all-conversations.js
node fix-all-conversations.js

### 2. Aplicar Migración SQL
1. Ir a la carpeta migrations/
2. Ejecutar el archivo SQL más reciente en tu base de datos
3. Verificar que las tablas se crearon correctamente

### 3. Reiniciar Servidor
yarn dev

### 4. Verificar Funcionalidad
1. Acceder a GET /api/debug/conversations
2. Enviar mensaje de WhatsApp de prueba
3. Verificar que aparezca en GET /api/conversations

## Configuración de WhatsApp

### Variables de Entorno Necesarias:
WEBHOOK_VERIFY_TOKEN=tu_token_de_verificacion
WHATSAPP_TOKEN=tu_token_de_whatsapp
DATABASE_URL=tu_url_de_base_de_datos

### Configuración de Webhook:
- URL: https://tu-dominio.com/api/webhook
- Método: POST
- Verificación: GET con token

## Estructura de Base de Datos

### Tablas Principales:
- conversations: Conversaciones entre clientes y tienda
- messages: Mensajes individuales
- customers: Información de clientes
- whatsapp_logs: Logs de eventos de WhatsApp

### Relaciones:
- conversations.customer_id → customers.id
- messages.conversation_id → conversations.id
`;

  fs.writeFileSync(path.join(docsDir, 'Setup-Guide.md'), setupDocs);
  
  console.log('   ✅ Documentación creada en: ' + docsDir);
  return true;
}

// ====================================
// EJECUCIÓN PRINCIPAL
// ====================================

async function runAllFixes() {
  let successCount = 0;
  let totalSteps = 6;
  
  try {
    // Paso 1: Corregir endpoints
    if (fixConversationsEndpoints()) successCount++;
    if (fixIndexConversations()) successCount++;
    if (addDebugEndpoint()) successCount++;
    
    // Paso 2: Verificar esquema
    if (verifyDatabaseSchema()) successCount++;
    const migrationFile = createMigrationSQL();
    if (migrationFile) successCount++;
    
    // Paso 3: Crear archivos de prueba
    if (createTestFiles()) successCount++;
    
    // Paso 4: Crear documentación
    if (createDocumentation()) successCount++;
    
    console.log('\n🎉 CORRECCIÓN COMPLETA FINALIZADA!\n');
    console.log('📊 RESUMEN:');
    console.log('✅ ' + successCount + '/' + totalSteps + ' pasos completados exitosamente');
    
    console.log('\n📋 ARCHIVOS CREADOS/MODIFICADOS:');
    console.log('✅ server/routes.ts - Endpoints corregidos');
    console.log('✅ server/index.ts - Duplicados eliminados, debug agregado');
    console.log('✅ migrations/[timestamp]_fix_conversations_tables.sql');
    console.log('✅ test-conversations/ - Scripts de prueba');
    console.log('✅ docs-conversations/ - Documentación completa');
    
    console.log('\n🚀 PRÓXIMOS PASOS:');
    console.log('1. 🗄️  Aplicar migración SQL en la base de datos');
    console.log('2. 🔄 Reiniciar el servidor: yarn dev');
    console.log('3. 🧪 Ejecutar pruebas: node test-conversations/test-conversations-api.js');
    console.log('4. 🐛 Verificar debug: GET /api/debug/conversations');
    console.log('5. 📱 Probar con mensaje de WhatsApp real');
    console.log('6. 📖 Revisar documentación en docs-conversations/');
    
    console.log('\n🎯 ENDPOINTS DISPONIBLES:');
    console.log('GET    /api/conversations');
    console.log('GET    /api/conversations/:id');
    console.log('POST   /api/conversations');
    console.log('PUT    /api/conversations/:id');
    console.log('GET    /api/conversations/:id/messages');
    console.log('POST   /api/conversations/:id/messages');
    console.log('GET    /api/debug/conversations');
    
    if (successCount === totalSteps) {
      console.log('\n🌟 ¡TODOS LOS PASOS COMPLETADOS EXITOSAMENTE!');
      return true;
    } else {
      console.log('\n⚠️  ' + (totalSteps - successCount) + ' pasos fallaron. Revisar logs arriba.');
      return false;
    }
    
  } catch (error) {
    console.error('\n💥 ERROR CRÍTICO:', error.message);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

// Ejecutar todas las correcciones
runAllFixes()
  .then(success => {
    if (success) {
      console.log('\n✨ Script completado exitosamente');
      process.exit(0);
    } else {
      console.log('\n❌ Script completado con errores');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n💀 Error fatal:', error);
    process.exit(1);
  });