// fix-conversations-endpoints.js
// Script para corregir los endpoints de conversaciones

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.cwd();
const SERVER_PATH = path.join(PROJECT_ROOT, 'server');

function fixConversationsEndpoints() {
  console.log('🔧 INICIANDO CORRECCIÓN DE ENDPOINTS DE CONVERSACIONES\n');
  
  try {
    // 1. Verificar y corregir routes.ts
    fixRoutesConversations();
    
    // 2. Verificar y corregir index.ts
    fixIndexConversations();
    
    // 3. Agregar endpoint de debug para conversaciones
    addConversationsDebugEndpoint();
    
    console.log('\n🎉 CORRECCIÓN COMPLETADA!');
    console.log('\n📋 ENDPOINTS DE CONVERSACIONES CORREGIDOS:');
    console.log('✅ GET /api/conversations - Lista todas las conversaciones');
    console.log('✅ GET /api/conversations/:id - Obtiene conversación específica');
    console.log('✅ POST /api/conversations - Crea nueva conversación');
    console.log('✅ PUT /api/conversations/:id - Actualiza conversación');
    console.log('✅ GET /api/conversations/:id/messages - Obtiene mensajes de conversación');
    console.log('✅ POST /api/conversations/:id/messages - Crea nuevo mensaje');
    console.log('✅ GET /api/debug/conversations - Endpoint de debug');
    
    console.log('\n📋 PRÓXIMOS PASOS:');
    console.log('1. Reiniciar el servidor: yarn dev');
    console.log('2. Probar el endpoint: GET /api/conversations');
    console.log('3. Verificar en la consola del navegador que lleguen los datos');
    console.log('4. Si hay errores, revisar logs del servidor');
    
  } catch (error) {
    console.error('❌ Error corrigiendo endpoints:', error.message);
  }
}

function fixRoutesConversations() {
  const routesPath = path.join(SERVER_PATH, 'routes.ts');
  
  if (!fs.existsSync(routesPath)) {
    console.log('⚠️ routes.ts no encontrado');
    return;
  }
  
  console.log('📝 Corrigiendo endpoints en routes.ts...');
  
  let content = fs.readFileSync(routesPath, 'utf8');
  
  // Buscar la sección de CONVERSATION ROUTES
  const conversationSectionStart = content.indexOf('// CONVERSATION ROUTES');
  const nextSectionStart = content.indexOf('// ORDER ROUTES', conversationSectionStart);
  
  if (conversationSectionStart === -1) {
    console.log('⚠️ Sección CONVERSATION ROUTES no encontrada en routes.ts');
    return;
  }
  
  // Crear la nueva sección de conversaciones mejorada
  const newConversationRoutes = `  // ================================
  // CONVERSATION ROUTES - CORREGIDOS
  // ================================

  router.get('/conversations', authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      console.log('📞 Fetching conversations for user:', user.storeId);
      
      const tenantStorage = await getTenantStorageForUser(user);
      const conversations = await tenantStorage.getAllConversations();
      
      console.log('✅ Conversations found:', conversations.length);
      res.json(conversations);
    } catch (error) {
      console.error('❌ Error fetching conversations:', error);
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
      
      console.log('📞 Fetching conversation:', id);
      
      const tenantStorage = await getTenantStorageForUser(user);
      const conversation = await tenantStorage.getConversationById(id);
      
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      
      // También obtener los mensajes de la conversación
      const messages = await tenantStorage.getMessagesByConversation(id);
      
      res.json({
        ...conversation,
        messages: messages || []
      });
    } catch (error) {
      console.error('❌ Error fetching conversation:', error);
      res.status(500).json({ 
        error: 'Failed to fetch conversation',
        details: error.message 
      });
    }
  });

  router.post('/conversations', authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      console.log('📞 Creating new conversation:', req.body);
      
      const conversationData = { 
        ...req.body, 
        storeId: user.storeId,
        createdAt: new Date(),
        lastMessageAt: new Date()
      };
      
      const tenantStorage = await getTenantStorageForUser(user);
      const conversation = await tenantStorage.createConversation(conversationData);
      
      console.log('✅ Conversation created:', conversation.id);
      res.status(201).json(conversation);
    } catch (error) {
      console.error('❌ Error creating conversation:', error);
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
      
      console.log('📞 Updating conversation:', id, req.body);
      
      const tenantStorage = await getTenantStorageForUser(user);
      const conversation = await tenantStorage.updateConversation(id, {
        ...req.body,
        updatedAt: new Date()
      });
      
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      
      console.log('✅ Conversation updated:', id);
      res.json(conversation);
    } catch (error) {
      console.error('❌ Error updating conversation:', error);
      res.status(500).json({ 
        error: "Failed to update conversation",
        details: error.message 
      });
    }
  });

  // Endpoints para mensajes dentro de conversaciones
  router.get('/conversations/:id/messages', authenticateToken, async (req: any, res: any) => {
    try {
      const conversationId = parseInt(req.params.id);
      const user = req.user as AuthUser;
      
      console.log('💬 Fetching messages for conversation:', conversationId);
      
      const tenantStorage = await getTenantStorageForUser(user);
      const messages = await tenantStorage.getMessagesByConversation(conversationId);
      
      console.log('✅ Messages found:', messages.length);
      res.json(messages);
    } catch (error) {
      console.error('❌ Error fetching messages:', error);
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
      
      console.log('💬 Creating message for conversation:', conversationId, req.body);
      
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
      
      console.log('✅ Message created:', message.id);
      res.status(201).json(message);
    } catch (error) {
      console.error('❌ Error creating message:', error);
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
    // Si no hay siguiente sección, reemplazar hasta el final de las rutas
    const routerMountIndex = content.indexOf('app.use("/api", router);');
    if (routerMountIndex !== -1) {
      content = content.slice(0, conversationSectionStart) + 
                newConversationRoutes + 
                '\n  ' + 
                content.slice(routerMountIndex);
    }
  }
  
  fs.writeFileSync(routesPath, content);
  console.log('   ✅ routes.ts actualizado');
}

function fixIndexConversations() {
  const indexPath = path.join(SERVER_PATH, 'index.ts');
  
  if (!fs.existsSync(indexPath)) {
    console.log('⚠️ index.ts no encontrado');
    return;
  }
  
  console.log('📝 Verificando endpoints en index.ts...');
  
  let content = fs.readFileSync(indexPath, 'utf8');
  
  // Verificar si hay duplicados de endpoints de conversaciones
  const conversationEndpointCount = (content.match(/apiRouter\.get\('\/conversations'/g) || []).length;
  
  if (conversationEndpointCount > 0) {
    console.log(`⚠️ Encontrados ${conversationEndpointCount} endpoints de conversaciones en index.ts`);
    console.log('   Estos pueden estar causando conflictos con routes.ts');
    
    // Comentar los endpoints duplicados en index.ts
    content = content.replace(
      /apiRouter\.get\('\/conversations'[\s\S]*?}\);/g,
      '// MOVED TO routes.ts - Endpoint moved to avoid conflicts\n// $&'
    );
    
    content = content.replace(
      /apiRouter\.get\('\/conversations\/:id'[\s\S]*?}\);/g,
      '// MOVED TO routes.ts - Endpoint moved to avoid conflicts\n// $&'
    );
    
    fs.writeFileSync(indexPath, content);
    console.log('   ✅ Endpoints duplicados comentados en index.ts');
  } else {
    console.log('   ✅ No se encontraron endpoints duplicados en index.ts');
  }
}

function addConversationsDebugEndpoint() {
  const indexPath = path.join(SERVER_PATH, 'index.ts');
  
  if (!fs.existsSync(indexPath)) {
    console.log('⚠️ index.ts no encontrado');
    return;
  }
  
  console.log('📝 Agregando endpoint de debug para conversaciones...');
  
  let content = fs.readFileSync(indexPath, 'utf8');
  
  // Verificar si ya existe el endpoint de debug
  if (content.includes('/api/debug/conversations')) {
    console.log('   ✅ Endpoint de debug ya existe');
    return;
  }
  
  // Agregar el endpoint de debug después de los otros endpoints de debug
  const debugEndpoint = `
// ================================
// DEBUG CONVERSATIONS ENDPOINT
// ================================

apiRouter.get('/debug/conversations', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    console.log('🐛 DEBUG CONVERSATIONS - User:', user);
    
    // Obtener storage
    const tenantStorage = await getTenantStorageForUser(user);
    console.log('🐛 DEBUG CONVERSATIONS - Storage obtained');
    
    // Obtener conversaciones
    const conversations = await tenantStorage.getAllConversations();
    console.log('🐛 DEBUG CONVERSATIONS - Found:', conversations.length);
    
    // Obtener información adicional
    const customers = await tenantStorage.getAllCustomers();
    const messages = await tenantStorage.getAllMessages();
    
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
          items: conversations
        },
        customers: {
          count: customers.length,
          sample: customers.slice(0, 3)
        },
        messages: {
          count: messages.length,
          sample: messages.slice(0, 5)
        }
      }
    });
  } catch (error) {
    console.error('❌ Error in debug conversations:', error);
    res.status(500).json({ 
      debug: true,
      error: error.message,
      stack: error.stack 
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
}

// Ejecutar la corrección
fixConversationsEndpoints();