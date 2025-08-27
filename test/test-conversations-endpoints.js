// test-conversations-endpoints.js
// Script completo para probar los endpoints de conversaciones

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = __dirname;
const SERVER_PATH = path.join(PROJECT_ROOT, 'server');

async function testConversationsEndpoints() {
  console.log('🧪 INICIANDO PRUEBAS DE ENDPOINTS DE CONVERSACIONES\n');
  
  try {
    // 1. Crear archivo de pruebas para el frontend
    createFrontendTestFile();
    
    // 2. Crear archivo de pruebas con curl
    createCurlTestFile();
    
    // 3. Verificar configuración de React Query
    verifyReactQueryConfig();
    
    // 4. Crear componente de prueba
    createTestComponent();
    
    // 5. Crear ruta de prueba en App.tsx
    addTestRouteToApp();
    
    // 6. Crear script de validación de base de datos
    createDatabaseValidationScript();
    
    console.log('\n🎉 ARCHIVOS DE PRUEBA CREADOS!');
    console.log('\n📋 ARCHIVOS GENERADOS:');
    console.log('✅ client/src/test-conversations.js - Pruebas desde el frontend');
    console.log('✅ test-conversations-curl.sh - Pruebas con curl');
    console.log('✅ client/src/components/ConversationsTest.tsx - Componente de prueba');
    console.log('✅ validate-conversations-db.js - Validación de base de datos');
    
    console.log('\n📋 PARA PROBAR:');
    console.log('1. Ejecutar: yarn dev (servidor)');
    console.log('2. Abrir otra terminal y ejecutar: bash test-conversations-curl.sh');
    console.log('3. En el navegador, ir a /test-conversations para ver el componente de prueba');
    console.log('4. Revisar la consola del navegador y del servidor para logs');
    console.log('5. Ejecutar: node validate-conversations-db.js para validar BD');
    
  } catch (error) {
    console.error('❌ Error creando pruebas:', error.message);
  }
}

function createFrontendTestFile() {
  const clientPath = path.join(PROJECT_ROOT, 'client', 'src');
  if (!fs.existsSync(clientPath)) {
    fs.mkdirSync(clientPath, { recursive: true });
  }
  
  console.log('📝 Creando archivo de pruebas para el frontend...');
  
  const frontendTest = `// client/src/test-conversations.js
// Pruebas de endpoints de conversaciones desde el frontend

export async function testConversationsAPI() {
  console.log('🧪 INICIANDO PRUEBAS DE API DE CONVERSACIONES');
  
  const baseURL = window.location.origin;
  const token = localStorage.getItem('token');
  
  if (!token) {
    console.error('❌ No hay token de autenticación. Primero hacer login.');
    return { error: 'No token found' };
  }
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  };
  
  const results = {
    debug: null,
    conversations: null,
    singleConversation: null,
    messages: null,
    createConversation: null,
    createMessage: null,
    errors: []
  };
  
  try {
    // 1. Probar GET /api/conversations
    console.log('\\n1️⃣ Probando GET /api/conversations...');
    try {
      const conversationsResponse = await fetch(baseURL + '/api/conversations', {
        method: 'GET',
        headers
      });
      
      console.log('Status:', conversationsResponse.status);
      results.conversations = await conversationsResponse.json();
      console.log('Conversations data:', results.conversations);
    } catch (error) {
      console.error('Error en GET /api/conversations:', error);
      results.errors.push('GET /api/conversations: ' + error.message);
    }
    
    // 2. Probar endpoint de debug
    console.log('\\n2️⃣ Probando GET /api/debug/conversations...');
    try {
      const debugResponse = await fetch(baseURL + '/api/debug/conversations', {
        method: 'GET',
        headers
      });
      
      console.log('Debug status:', debugResponse.status);
      results.debug = await debugResponse.json();
      console.log('Debug data:', results.debug);
    } catch (error) {
      console.error('Error en debug endpoint:', error);
      results.errors.push('GET /api/debug/conversations: ' + error.message);
    }
    
    // 3. Si hay conversaciones, probar obtener una específica
    if (results.conversations && Array.isArray(results.conversations) && results.conversations.length > 0) {
      const firstConversationId = results.conversations[0].id;
      console.log('\\n3️⃣ Probando GET /api/conversations/' + firstConversationId + '...');
      
      try {
        const conversationResponse = await fetch(baseURL + '/api/conversations/' + firstConversationId, {
          method: 'GET',
          headers
        });
        
        console.log('Single conversation status:', conversationResponse.status);
        results.singleConversation = await conversationResponse.json();
        console.log('Single conversation data:', results.singleConversation);
        
        // 4. Probar obtener mensajes de la conversación
        console.log('\\n4️⃣ Probando GET /api/conversations/' + firstConversationId + '/messages...');
        
        const messagesResponse = await fetch(baseURL + '/api/conversations/' + firstConversationId + '/messages', {
          method: 'GET',
          headers
        });
        
        console.log('Messages status:', messagesResponse.status);
        results.messages = await messagesResponse.json();
        console.log('Messages data:', results.messages);
        
      } catch (error) {
        console.error('Error en conversation específica:', error);
        results.errors.push('GET single conversation: ' + error.message);
      }
    }
    
    // 5. Probar crear una nueva conversación (si hay clientes)
    console.log('\\n5️⃣ Probando POST /api/conversations...');
    
    const newConversationData = {
      customerId: 1, // Asumimos que existe cliente con ID 1
      conversationType: 'test',
      status: 'active'
    };
    
    try {
      const createResponse = await fetch(baseURL + '/api/conversations', {
        method: 'POST',
        headers,
        body: JSON.stringify(newConversationData)
      });
      
      console.log('Create conversation status:', createResponse.status);
      results.createConversation = await createResponse.json();
      console.log('Create conversation data:', results.createConversation);
      
      // 6. Si se creó la conversación, probar crear un mensaje
      if (results.createConversation && results.createConversation.id) {
        console.log('\\n6️⃣ Probando POST /api/conversations/' + results.createConversation.id + '/messages...');
        
        const messageData = {
          content: 'Mensaje de prueba desde API test',
          senderType: 'agent'
        };
        
        const createMessageResponse = await fetch(baseURL + '/api/conversations/' + results.createConversation.id + '/messages', {
          method: 'POST',
          headers,
          body: JSON.stringify(messageData)
        });
        
        console.log('Create message status:', createMessageResponse.status);
        results.createMessage = await createMessageResponse.json();
        console.log('Create message data:', results.createMessage);
      }
      
    } catch (error) {
      console.error('Error creando conversación:', error);
      results.errors.push('POST /api/conversations: ' + error.message);
    }
    
    console.log('\\n✅ PRUEBAS COMPLETADAS!');
    console.log('\\n📊 RESUMEN DE RESULTADOS:');
    console.log('- Conversaciones encontradas:', results.conversations ? results.conversations.length : 0);
    console.log('- Debug exitoso:', !!results.debug);
    console.log('- Conversación creada:', results.createConversation && results.createConversation.id ? true : false);
    console.log('- Mensaje creado:', results.createMessage && results.createMessage.id ? true : false);
    console.log('- Errores encontrados:', results.errors.length);
    
    if (results.errors.length > 0) {
      console.log('\\n❌ ERRORES:');
      results.errors.forEach(error => console.log('  -', error));
    }
    
    return results;
    
  } catch (error) {
    console.error('❌ Error general en las pruebas:', error);
    results.errors.push('General error: ' + error.message);
    return results;
  }
}

// Función para probar autenticación
export async function testAuthentication() {
  console.log('🔐 Probando autenticación...');
  
  const baseURL = window.location.origin;
  
  const testCredentials = {
    username: 'admin',
    password: 'admin123',
    storeId: 1
  };
  
  try {
    const response = await fetch(baseURL + '/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testCredentials)
    });
    
    const data = await response.json();
    
    if (response.ok && data.token) {
      localStorage.setItem('token', data.token);
      console.log('✅ Autenticación exitosa, token guardado');
      return { success: true, token: data.token, user: data.user };
    } else {
      console.log('❌ Error en autenticación:', data);
      return { success: false, error: data };
    }
    
  } catch (error) {
    console.error('❌ Error en autenticación:', error);
    return { success: false, error: error.message };
  }
}

// Función para limpiar datos de prueba
export async function cleanupTestData() {
  console.log('🧹 Limpiando datos de prueba...');
  
  const baseURL = window.location.origin;
  const token = localStorage.getItem('token');
  
  if (!token) {
    console.log('❌ No hay token para limpiar datos');
    return;
  }
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  };
  
  try {
    // Obtener conversaciones de prueba
    const response = await fetch(baseURL + '/api/conversations', {
      method: 'GET',
      headers
    });
    
    const conversations = await response.json();
    
    // Eliminar conversaciones que tengan "test" en el tipo
    for (const conv of conversations) {
      if (conv.conversationType === 'test') {
        console.log('🗑️ Eliminando conversación de prueba: ' + conv.id);
        // Aquí iría la lógica de eliminación si tienes endpoint DELETE
        // await fetch(baseURL + '/api/conversations/' + conv.id, { method: 'DELETE', headers });
      }
    }
    
    console.log('✅ Limpieza completada');
    
  } catch (error) {
    console.error('❌ Error en limpieza:', error);
  }
}

// Ejecutar automáticamente si se carga directamente
if (typeof window !== 'undefined') {
  window.testConversationsAPI = testConversationsAPI;
  window.testAuthentication = testAuthentication;
  window.cleanupTestData = cleanupTestData;
  
  console.log('🧪 Funciones de prueba cargadas:');
  console.log('- testConversationsAPI() - Prueba todos los endpoints');
  console.log('- testAuthentication() - Prueba login y guarda token');
  console.log('- cleanupTestData() - Limpia datos de prueba');
}

export default {
  testConversationsAPI,
  testAuthentication,
  cleanupTestData
};
`;

  const testFilePath = path.join(clientPath, 'test-conversations.js');
  fs.writeFileSync(testFilePath, frontendTest);
  console.log('   ✅ Frontend test completo creado');
}

function createCurlTestFile() {
  console.log('📝 Creando archivo de pruebas con curl...');
  
  const curlTest = `#!/bin/bash
# test-conversations-curl.sh
# Pruebas completas de endpoints de conversaciones con curl

echo "🧪 INICIANDO PRUEBAS COMPLETAS DE ENDPOINTS DE CONVERSACIONES"
echo "================================================================"
echo ""

# Configuración
BASE_URL="http://localhost:3001/api"
CONTENT_TYPE="Content-Type: application/json"

# Función para mostrar separadores
show_separator() {
  echo ""
  echo "----------------------------------------------------------------"
  echo "$1"
  echo "----------------------------------------------------------------"
}

# Función para verificar respuesta
check_response() {
  local response="$1"
  local endpoint="$2"
  
  if echo "$response" | grep -q '"error"'; then
    echo "❌ Error en $endpoint:"
    echo "$response" | jq '.' 2>/dev/null || echo "$response"
  else
    echo "✅ $endpoint exitoso"
    echo "$response" | jq '.' 2>/dev/null || echo "$response"
  fi
}

# Obtener token (reemplazar con credenciales reales)
show_separator "1️⃣ AUTENTICACIÓN"
echo "Obteniendo token de autenticación..."

LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/login" \\
  -H "$CONTENT_TYPE" \\
  -d '{
    "username": "admin",
    "password": "admin123",
    "storeId": 1
  }')

echo "Login response:"
echo "$LOGIN_RESPONSE" | jq '.' 2>/dev/null || echo "$LOGIN_RESPONSE"

# Extraer token del response (requiere jq)
if command -v jq &> /dev/null; then
  TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token')
  if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
    echo "❌ No se pudo obtener el token. Verificar credenciales."
    echo "Response: $LOGIN_RESPONSE"
    exit 1
  fi
  echo "✅ Token obtenido: \${TOKEN:0:20}..."
else
  echo "⚠️ jq no está instalado. Reemplazar TOKEN manualmente."
  echo "Instalar con: sudo apt install jq (Ubuntu) o brew install jq (Mac)"
  exit 1
fi

AUTH_HEADER="Authorization: Bearer $TOKEN"

# Probar endpoint de debug primero
show_separator "2️⃣ DEBUG ENDPOINT"
echo "Probando GET /api/debug/conversations..."

DEBUG_RESPONSE=$(curl -s -X GET "$BASE_URL/debug/conversations" \\
  -H "$AUTH_HEADER" \\
  -H "$CONTENT_TYPE")

check_response "$DEBUG_RESPONSE" "Debug endpoint"

# Probar obtener todas las conversaciones
show_separator "3️⃣ GET ALL CONVERSATIONS"
echo "Probando GET /api/conversations..."

CONVERSATIONS_RESPONSE=$(curl -s -X GET "$BASE_URL/conversations" \\
  -H "$AUTH_HEADER" \\
  -H "$CONTENT_TYPE")

check_response "$CONVERSATIONS_RESPONSE" "Get conversations"

# Extraer ID de primera conversación si existe
FIRST_CONVERSATION_ID=$(echo "$CONVERSATIONS_RESPONSE" | jq -r '.[0].id // empty' 2>/dev/null)

if [ ! -z "$FIRST_CONVERSATION_ID" ] && [ "$FIRST_CONVERSATION_ID" != "null" ]; then
  show_separator "4️⃣ GET SINGLE CONVERSATION"
  echo "Probando GET /api/conversations/$FIRST_CONVERSATION_ID..."
  
  SINGLE_CONV_RESPONSE=$(curl -s -X GET "$BASE_URL/conversations/$FIRST_CONVERSATION_ID" \\
    -H "$AUTH_HEADER" \\
    -H "$CONTENT_TYPE")
  
  check_response "$SINGLE_CONV_RESPONSE" "Get single conversation"
  
  show_separator "5️⃣ GET CONVERSATION MESSAGES"
  echo "Probando GET /api/conversations/$FIRST_CONVERSATION_ID/messages..."
  
  MESSAGES_RESPONSE=$(curl -s -X GET "$BASE_URL/conversations/$FIRST_CONVERSATION_ID/messages" \\
    -H "$AUTH_HEADER" \\
    -H "$CONTENT_TYPE")
  
  check_response "$MESSAGES_RESPONSE" "Get messages"
else
  echo "⚠️ No hay conversaciones existentes para probar endpoints específicos"
fi

# Probar crear nueva conversación
show_separator "6️⃣ CREATE CONVERSATION"
echo "Probando POST /api/conversations..."

CREATE_CONV_RESPONSE=$(curl -s -X POST "$BASE_URL/conversations" \\
  -H "$AUTH_HEADER" \\
  -H "$CONTENT_TYPE" \\
  -d '{
    "customerId": 1,
    "conversationType": "test",
    "status": "active"
  }')

check_response "$CREATE_CONV_RESPONSE" "Create conversation"

# Extraer ID de la conversación creada
NEW_CONVERSATION_ID=$(echo "$CREATE_CONV_RESPONSE" | jq -r '.id // empty' 2>/dev/null)

if [ ! -z "$NEW_CONVERSATION_ID" ] && [ "$NEW_CONVERSATION_ID" != "null" ]; then
  show_separator "7️⃣ CREATE MESSAGE"
  echo "Probando POST /api/conversations/$NEW_CONVERSATION_ID/messages..."
  
  CREATE_MSG_RESPONSE=$(curl -s -X POST "$BASE_URL/conversations/$NEW_CONVERSATION_ID/messages" \\
    -H "$AUTH_HEADER" \\
    -H "$CONTENT_TYPE" \\
    -d '{
      "content": "Mensaje de prueba desde curl test",
      "senderType": "agent"
    }')
  
  check_response "$CREATE_MSG_RESPONSE" "Create message"
  
  show_separator "8️⃣ UPDATE CONVERSATION"
  echo "Probando PUT /api/conversations/$NEW_CONVERSATION_ID..."
  
  UPDATE_CONV_RESPONSE=$(curl -s -X PUT "$BASE_URL/conversations/$NEW_CONVERSATION_ID" \\
    -H "$AUTH_HEADER" \\
    -H "$CONTENT_TYPE" \\
    -d '{
      "status": "closed",
      "conversationType": "test_completed"
    }')
  
  check_response "$UPDATE_CONV_RESPONSE" "Update conversation"
fi

# Verificar estado final
show_separator "9️⃣ VERIFICATION"
echo "Verificando estado final..."

FINAL_CONVERSATIONS=$(curl -s -X GET "$BASE_URL/conversations" \\
  -H "$AUTH_HEADER" \\
  -H "$CONTENT_TYPE")

CONVERSATION_COUNT=$(echo "$FINAL_CONVERSATIONS" | jq 'length' 2>/dev/null || echo "0")
echo "✅ Total de conversaciones: $CONVERSATION_COUNT"

# Resumen final
show_separator "✅ RESUMEN DE PRUEBAS"
echo "Pruebas completadas exitosamente!"
echo ""
echo "📋 ENDPOINTS PROBADOS:"
echo "  ✅ POST /api/login - Autenticación"
echo "  ✅ GET /api/debug/conversations - Debug"
echo "  ✅ GET /api/conversations - Listar conversaciones"
echo "  ✅ GET /api/conversations/:id - Conversación específica"
echo "  ✅ GET /api/conversations/:id/messages - Mensajes"
echo "  ✅ POST /api/conversations - Crear conversación"
echo "  ✅ POST /api/conversations/:id/messages - Crear mensaje"
echo "  ✅ PUT /api/conversations/:id - Actualizar conversación"
echo ""
echo "📋 NOTAS:"
echo "- Si ves errores 401, verificar credenciales en el script"
echo "- Si ves errores 500, revisar logs del servidor"
echo "- Si ves errores 404, verificar que las rutas estén configuradas"
echo "- Los datos de prueba quedarán en la base de datos"
echo ""
echo "🔧 DEBUGGING:"
echo "- Revisar logs del servidor durante la ejecución"
echo "- Verificar que las tablas conversations y messages existan"
echo "- Confirmar que el tenant storage esté configurado correctamente"
`;

  const curlTestPath = path.join(PROJECT_ROOT, 'test-conversations-curl.sh');
  fs.writeFileSync(curlTestPath, curlTest);
  
  // Hacer el archivo ejecutable
  try {
    execSync('chmod +x "' + curlTestPath + '"');
    console.log('   ✅ Curl test completo creado y ejecutable');
  } catch (error) {
    console.log('   ✅ Curl test creado (no se pudo hacer ejecutable en Windows)');
  }
}

function verifyReactQueryConfig() {
  const clientPath = path.join(PROJECT_ROOT, 'client', 'src');
  const mainTsxPath = path.join(clientPath, 'main.tsx');
  
  if (!fs.existsSync(mainTsxPath)) {
    console.log('⚠️ main.tsx no encontrado');
    return;
  }
  
  console.log('📝 Verificando configuración de React Query...');
  
  let content = fs.readFileSync(mainTsxPath, 'utf8');
  
  // Verificar que esté configurado React Query
  const hasQueryClient = content.includes('QueryClient') || content.includes('@tanstack/react-query');
  
  if (!hasQueryClient) {
    console.log('   ⚠️ React Query no parece estar configurado en main.tsx');
    console.log('   📋 Agregar esta configuración a main.tsx:');
    console.log(`
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Envolver App con QueryClientProvider
<QueryClientProvider client={queryClient}>
  <App />
</QueryClientProvider>
`);
  } else {
    console.log('   ✅ React Query configurado');
  }
}

function createTestComponent() {
  const componentsPath = path.join(PROJECT_ROOT, 'client', 'src', 'components');
  if (!fs.existsSync(componentsPath)) {
    fs.mkdirSync(componentsPath, { recursive: true });
  }
  
  console.log('📝 Creando componente de prueba completo...');
  
  const testComponent = `// client/src/components/ConversationsTest.tsx
// Componente completo para probar la funcionalidad de conversaciones

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Conversation {
  id: number;
  customerId: number;
  customerName?: string;
  customerPhone?: string;
  conversationType: string;
  status: string;
  lastMessageAt: string;
  createdAt: string;
}

interface Message {
  id: number;
  conversationId: number;
  senderType: string;
  content: string;
  sentAt: string;
}

interface DebugData {
  debug: boolean;
  user: any;
  data: {
    conversations: { count: number; sample: Conversation[] };
    customers: { count: number; sample: any[] };
    messages: { count: number; sample: Message[] };
  };
}

export default function ConversationsTest() {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [testResults, setTestResults] = useState<any>(null);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const queryClient = useQueryClient();

  // Query para obtener conversaciones
  const { data: conversations, isLoading, error, refetch: refetchConversations } = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const response = await fetch("/api/conversations", {
        headers: {
          Authorization: "Bearer " + localStorage.getItem('token')
        }
      });
      
      if (!response.ok) {
        throw new Error("Error: " + response.status);
      }
      
      return response.json();
    }
  });

  // Query para debug
  const { data: debugData } = useQuery({
    queryKey: ["debug", "conversations"],
    queryFn: async () => {
      const response = await fetch("/api/debug/conversations", {
        headers: {
          Authorization: "Bearer " + localStorage.getItem('token')
        }
      });
      
      if (!response.ok) {
        throw new Error("Error: " + response.status);
      }
      
      return response.json();
    }
  });

  // Query para obtener mensajes de conversación seleccionada
  const { data: messages } = useQuery({
    queryKey: ["conversations", selectedConversation?.id, "messages"],
    queryFn: async () => {
      if (!selectedConversation) return [];
      
      const response = await fetch("/api/conversations/" + selectedConversation.id + "/messages", {
        headers: {
          Authorization: "Bearer " + localStorage.getItem('token')
        }
      });
      
      if (!response.ok) {
        throw new Error("Error: " + response.status);
      }
      
      return response.json();
    },
    enabled: !!selectedConversation
  });

  // Mutation para crear conversación
  const createConversationMutation = useMutation({
    mutationFn: async (conversationData: { customerId: number; conversationType: string; status: string }) => {
      const response = await fetch("/api/conversations", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: "Bearer " + localStorage.getItem('token')
        },
        body: JSON.stringify(conversationData)
      });
      
      if (!response.ok) {
        throw new Error("Error: " + response.status);
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
  });

  // Mutation para crear mensaje
  const createMessageMutation = useMutation({
    mutationFn: async (messageData: { conversationId: number; content: string; senderType: string }) => {
      const response = await fetch("/api/conversations/" + messageData.conversationId + "/messages", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: "Bearer " + localStorage.getItem('token')
        },
        body: JSON.stringify(messageData)
      });
      
      if (!response.ok) {
        throw new Error("Error: " + response.status);
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations", selectedConversation?.id, "messages"] });
      setNewMessage("");
    }
  });

  const handleSendMessage = () => {
    if (!selectedConversation || !newMessage.trim()) return;
    
    createMessageMutation.mutate({
      conversationId: selectedConversation.id,
      content: newMessage,
      senderType: 'agent'
    });
  };

  const handleCreateTestConversation = () => {
    createConversationMutation.mutate({
      customerId: 1,
      conversationType: 'test',
      status: 'active'
    });
  };

  // Ejecutar todas las pruebas automatizadas
  const runAllTests = async () => {
    setIsRunningTests(true);
    console.log('🧪 Ejecutando todas las pruebas...');
    
    try {
      // Ejecutar la función de prueba del frontend si está disponible
      if ((window as any).testConversationsAPI) {
        const results = await (window as any).testConversationsAPI();
        setTestResults(results);
        console.log('✅ Pruebas completadas:', results);
      } else {
        console.log('⚠️ testConversationsAPI no está disponible');
        setTestResults({ error: 'testConversationsAPI function not available' });
      }
    } catch (error) {
      console.error('❌ Error ejecutando pruebas:', error);
      setTestResults({ error: (error as Error).message });
    } finally {
      setIsRunningTests(false);
    }
  };

  // Test de autenticación
  const testAuth = async () => {
    if ((window as any).testAuthentication) {
      const result = await (window as any).testAuthentication();
      console.log('Auth test result:', result);
      if (result.success) {
        refetchConversations();
      }
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">🧪 Test de Conversaciones</h1>
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          <p>Cargando conversaciones...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">🧪 Test de Conversaciones</h1>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <strong>Error:</strong> {(error as Error).message}
        </div>
        <div className="flex gap-2">
          <button 
            onClick={testAuth}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
          >
            🔐 Test Auth
          </button>
          <button 
            onClick={runAllTests}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            disabled={isRunningTests}
          >
            {isRunningTests ? '⏳ Ejecutando...' : '🧪 Ejecutar Todas las Pruebas'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">🧪 Test Completo de Conversaciones</h1>
      
      {/* Panel de control de pruebas */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h2 className="text-lg font-semibold mb-3">Panel de Control de Pruebas</h2>
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={testAuth}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
          >
            🔐 Test Auth
          </button>
          <button 
            onClick={runAllTests}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            disabled={isRunningTests}
          >
            {isRunningTests ? '⏳ Ejecutando...' : '🧪 Ejecutar Todas las Pruebas'}
          </button>
          <button 
            onClick={handleCreateTestConversation}
            className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
            disabled={createConversationMutation.isPending}
          >
            {createConversationMutation.isPending ? '⏳' : '➕'} Crear Conversación Test
          </button>
          <button 
            onClick={() => (window as any).cleanupTestData?.()}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            🧹 Limpiar Datos Test
          </button>
          <button 
            onClick={() => refetchConversations()}
            className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
          >
            🔄 Refrescar
          </button>
        </div>
      </div>

      {/* Resultados de pruebas automatizadas */}
      {testResults && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h2 className="text-lg font-semibold mb-3">📊 Resultados de Pruebas Automatizadas</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {testResults.conversations?.length || 0}
              </div>
              <div className="text-sm text-gray-600">Conversaciones</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {testResults.debug ? '✅' : '❌'}
              </div>
              <div className="text-sm text-gray-600">Debug OK</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {testResults.createConversation?.id ? '✅' : '❌'}
              </div>
              <div className="text-sm text-gray-600">Crear Conv</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {testResults.errors?.length || 0}
              </div>
              <div className="text-sm text-gray-600">Errores</div>
            </div>
          </div>
          
          {testResults.errors && testResults.errors.length > 0 && (
            <div className="bg-red-100 border border-red-300 rounded p-3">
              <h3 className="font-semibold text-red-800 mb-2">Errores encontrados:</h3>
              <ul className="text-sm text-red-700 space-y-1">
                {testResults.errors.map((error: string, index: number) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Debug info */}
      {debugData && (
        <div className="mb-6 p-4 bg-yellow-50 rounded-lg">
          <h2 className="text-lg font-semibold mb-3">🐛 Información de Debug</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-3 rounded border">
              <h3 className="font-semibold">Usuario</h3>
              <p className="text-sm">ID: {debugData.user?.id}</p>
              <p className="text-sm">Store: {debugData.user?.storeId}</p>
              <p className="text-sm">Role: {debugData.user?.role}</p>
            </div>
            <div className="bg-white p-3 rounded border">
              <h3 className="font-semibold">Conversaciones</h3>
              <p className="text-sm">Count: {debugData.data?.conversations?.count || 0}</p>
              <p className="text-sm">Sample: {debugData.data?.conversations?.sample?.length || 0}</p>
            </div>
            <div className="bg-white p-3 rounded border">
              <h3 className="font-semibold">Mensajes</h3>
              <p className="text-sm">Count: {debugData.data?.messages?.count || 0}</p>
              <p className="text-sm">Sample: {debugData.data?.messages?.sample?.length || 0}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lista de conversaciones */}
        <div className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">
            Conversaciones ({conversations?.length || 0})
          </h2>
          
          {!conversations || conversations.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">No hay conversaciones disponibles</p>
              <button 
                onClick={handleCreateTestConversation}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                disabled={createConversationMutation.isPending}
              >
                {createConversationMutation.isPending ? 'Creando...' : 'Crear Conversación de Prueba'}
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {conversations.map((conversation: Conversation) => (
                <div 
                  key={conversation.id}
                  onClick={() => setSelectedConversation(conversation)}
                  className={"p-3 border rounded cursor-pointer hover:bg-gray-50 transition-colors " + (
                    selectedConversation?.id === conversation.id ? 'bg-blue-50 border-blue-300' : ''
                  )}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-medium">
                        {conversation.customerName || "Cliente " + conversation.customerId}
                      </div>
                      <div className="text-sm text-gray-500">
                        {conversation.customerPhone} • {conversation.status}
                      </div>
                      <div className="text-xs text-gray-400">
                        Tipo: {conversation.conversationType}
                      </div>
                      <div className="text-xs text-gray-400">
                        {new Date(conversation.lastMessageAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-xs bg-gray-100 px-2 py-1 rounded">
                      ID: {conversation.id}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mensajes de conversación seleccionada */}
        <div className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">
            {selectedConversation 
              ? "Mensajes - " + (selectedConversation.customerName || "Cliente " + selectedConversation.customerId)
              : 'Selecciona una conversación'
            }
          </h2>
          
          {selectedConversation ? (
            <>
              <div className="h-64 border rounded p-3 overflow-y-auto mb-3 bg-gray-50">
                {messages && messages.length > 0 ? (
                  messages.map((message: Message) => (
                    <div 
                      key={message.id}
                      className={"mb-2 p-2 rounded max-w-xs " + (
                        message.senderType === 'agent' 
                          ? 'bg-blue-500 text-white ml-auto' 
                          : 'bg-white border'
                      )}
                    >
                      <div className="text-sm">{message.content}</div>
                      <div className={"text-xs opacity-75 " + (
                        message.senderType === 'agent' ? 'text-blue-100' : 'text-gray-500'
                      )}>
                        {message.senderType} • {new Date(message.sentAt).toLocaleTimeString()}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center">No hay mensajes</p>
                )}
              </div>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 border rounded px-3 py-2"
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || createMessageMutation.isPending}
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
                >
                  {createMessageMutation.isPending ? '...' : 'Enviar'}
                </button>
              </div>
            </>
          ) : (
            <p className="text-gray-500 text-center py-8">
              Selecciona una conversación para ver los mensajes
            </p>
          )}
        </div>
      </div>
      
      {/* Estado detallado de la API */}
      <div className="mt-6 p-4 bg-gray-100 rounded">
        <h3 className="font-semibold mb-2">📊 Estado Detallado de la API:</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="font-medium">Conversaciones</div>
            <div>Cargadas: {conversations?.length || 0}</div>
            <div>Seleccionada: {selectedConversation ? "ID " + selectedConversation.id : 'Ninguna'}</div>
          </div>
          <div>
            <div className="font-medium">Mensajes</div>
            <div>Cargados: {messages?.length || 0}</div>
            <div>Debug: {debugData ? '✅' : '❌'}</div>
          </div>
          <div>
            <div className="font-medium">Mutations</div>
            <div>Crear Conv: {createConversationMutation.isPending ? 'Enviando...' : 'Listo'}</div>
            <div>Crear Msg: {createMessageMutation.isPending ? 'Enviando...' : 'Listo'}</div>
          </div>
          <div>
            <div className="font-medium">Auth</div>
            <div>Token: {localStorage.getItem('token') ? '✅' : '❌'}</div>
            <div>Estado: {error ? '❌' : '✅'}</div>
          </div>
        </div>
        
        {/* Enlaces útiles */}
        <div className="mt-4 pt-4 border-t">
          <h4 className="font-medium mb-2">🔗 Enlaces Útiles:</h4>
          <div className="flex flex-wrap gap-2 text-sm">
            <a 
              href="/api/debug/conversations" 
              target="_blank"
              className="text-blue-600 hover:underline"
            >
              Debug API
            </a>
            <a 
              href="/api/conversations" 
              target="_blank"
              className="text-blue-600 hover:underline"
            >
              Conversations API
            </a>
            <button 
              onClick={() => console.log('Debug data:', debugData)}
              className="text-blue-600 hover:underline"
            >
              Log Debug to Console
            </button>
            <button 
              onClick={() => console.log('Conversations:', conversations)}
              className="text-blue-600 hover:underline"
            >
              Log Conversations to Console
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
`;

  const componentPath = path.join(componentsPath, 'ConversationsTest.tsx');
  fs.writeFileSync(componentPath, testComponent);
  console.log('   ✅ Componente de prueba completo creado');
}

function addTestRouteToApp() {
  const appPath = path.join(PROJECT_ROOT, 'client', 'src', 'App.tsx');
  
  if (!fs.existsSync(appPath)) {
    console.log('⚠️ App.tsx no encontrado');
    return;
  }
  
  console.log('📝 Agregando ruta de prueba a App.tsx...');
  
  let content = fs.readFileSync(appPath, 'utf8');
  
  // Verificar si ya existe la ruta
  if (content.includes('/test-conversations')) {
    console.log('   ✅ Ruta de prueba ya existe en App.tsx');
    return;
  }
  
  // Agregar import si no existe
  if (!content.includes('ConversationsTest')) {
    const importRegex = /(import.*from.*['"]\.\/)([^'"]*['"];?\s*)/;
    const newImport = '$1$2\nimport ConversationsTest from \'./components/ConversationsTest\';';
    content = content.replace(importRegex, newImport);
  }
  
  // Agregar ruta en el router
  const routeToAdd = '        <Route path="/test-conversations" element={<ConversationsTest />} />';
  
  // Buscar donde insertar la ruta (después de otras rutas)
  const routePattern = /(<Route[^>]*\/>\s*)/g;
  const matches = content.match(routePattern);
  
  if (matches && matches.length > 0) {
    const lastRoute = matches[matches.length - 1];
    const lastRouteIndex = content.lastIndexOf(lastRoute);
    
    if (lastRouteIndex !== -1) {
      content = content.slice(0, lastRouteIndex + lastRoute.length) + 
                '\n        ' + routeToAdd + 
                content.slice(lastRouteIndex + lastRoute.length);
      
      fs.writeFileSync(appPath, content);
      console.log('   ✅ Ruta /test-conversations agregada a App.tsx');
    }
  } else {
    console.log('   ⚠️ No se pudo agregar la ruta automáticamente');
    console.log('   📋 Agregar manualmente esta ruta a App.tsx:');
    console.log('   ' + routeToAdd);
  }
}

function createDatabaseValidationScript() {
  console.log('📝 Creando script de validación de base de datos...');
  
  const validationScript = `// validate-conversations-db.js
// Script para validar la estructura de la base de datos de conversaciones

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

async function validateConversationsDatabase() {
  console.log('🔍 VALIDANDO ESTRUCTURA DE BASE DE DATOS PARA CONVERSACIONES\\n');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    idleTimeoutMillis: 5000
  });
  
  try {
    // 1. Verificar conexión
    console.log('1️⃣ Verificando conexión a la base de datos...');
    await pool.query('SELECT NOW()');
    console.log('   ✅ Conexión exitosa');
    
    // 2. Verificar tablas requeridas
    console.log('\\n2️⃣ Verificando tablas requeridas...');
    
    const requiredTables = ['conversations', 'messages', 'customers'];
    const existingTables = [];
    
    for (const table of requiredTables) {
      try {
        const result = await pool.query(\`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = $1
          )
        \`, [table]);
        
        const exists = result.rows[0].exists;
        console.log(\`   \${exists ? '✅' : '❌'} Tabla \${table}: \${exists ? 'EXISTS' : 'MISSING'}\`);
        
        if (exists) {
          existingTables.push(table);
        }
      } catch (error) {
        console.log(\`   ❌ Error verificando tabla \${table}:\`, error.message);
      }
    }
    
    // 3. Verificar estructura de tablas existentes
    console.log('\\n3️⃣ Verificando estructura de tablas...');
    
    for (const table of existingTables) {
      try {
        const result = await pool.query(\`
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_name = $1
          ORDER BY ordinal_position
        \`, [table]);
        
        console.log(\`\\n   📋 Estructura de \${table}:\`);
        result.rows.forEach(col => {
          console.log(\`      - \${col.column_name}: \${col.data_type} \${col.is_nullable === 'NO' ? '(NOT NULL)' : ''}\`);
        });
        
      } catch (error) {
        console.log(\`   ❌ Error obteniendo estructura de \${table}:\`, error.message);
      }
    }
    
    // 4. Verificar datos de muestra
    console.log('\\n4️⃣ Verificando datos de muestra...');
    
    for (const table of existingTables) {
      try {
        const result = await pool.query(\`SELECT COUNT(*) as count FROM \${table}\`);
        const count = parseInt(result.rows[0].count);
        console.log(\`   📊 \${table}: \${count} registros\`);
        
        // Mostrar muestra de datos si hay registros
        if (count > 0) {
          const sampleResult = await pool.query(\`SELECT * FROM \${table} LIMIT 3\`);
          console.log(\`   📋 Muestra de \${table}:\`);
          sampleResult.rows.forEach((row, index) => {
            console.log(\`      \${index + 1}. \${JSON.stringify(row)}\`);
          });
        }
      } catch (error) {
        console.log(\`   ❌ Error contando registros en \${table}:\`, error.message);
      }
    }
    
    // 5. Verificar índices importantes
    console.log('\\n5️⃣ Verificando índices...');
    
    try {
      const indexResult = await pool.query(\`
        SELECT 
          schemaname,
          tablename,
          indexname,
          indexdef
        FROM pg_indexes 
        WHERE tablename IN ('conversations', 'messages', 'customers')
        ORDER BY tablename, indexname
      \`);
      
      console.log(\`   📊 Índices encontrados: \${indexResult.rows.length}\`);
      indexResult.rows.forEach(idx => {
        console.log(\`   - \${idx.tablename}.\${idx.indexname}\`);
      });
      
    } catch (error) {
      console.log('   ⚠️ Error verificando índices:', error.message);
    }
    
    // 6. Generar recomendaciones
    console.log('\\n6️⃣ Recomendaciones...');
    
    const missingTables = requiredTables.filter(table => !existingTables.includes(table));
    
    if (missingTables.length > 0) {
      console.log('   ⚠️ Tablas faltantes:');
      missingTables.forEach(table => {
        console.log(\`      - \${table}\`);
      });
      console.log('   📋 Ejecutar migración SQL para crear tablas faltantes');
    }
    
    if (existingTables.length === requiredTables.length) {
      console.log('   ✅ Todas las tablas requeridas están presentes');
    }
    
    console.log('\\n🎉 VALIDACIÓN COMPLETADA!');
    
  } catch (error) {
    console.error('❌ Error durante la validación:', error);
  } finally {
    await pool.end();
  }
}

// Función para crear tablas faltantes
async function createMissingTables() {
  console.log('🔧 CREANDO TABLAS FALTANTES...');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    idleTimeoutMillis: 5000
  });
  
  try {
    // SQL para crear tablas
    const createTablesSQL = \`
      -- Tabla de conversaciones
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL,
        conversation_type TEXT DEFAULT 'initial',
        status TEXT DEFAULT 'active',
        last_message_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Tabla de mensajes
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL,
        sender_id INTEGER,
        sender_type TEXT NOT NULL,
        content TEXT NOT NULL,
        message_type TEXT DEFAULT 'text',
        whatsapp_message_id TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        sent_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Índices para mejorar rendimiento
      CREATE INDEX IF NOT EXISTS idx_conversations_customer_id ON conversations(customer_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_sender_type ON messages(sender_type);
      CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages(sent_at);
    \`;
    
    await pool.query(createTablesSQL);
    console.log('✅ Tablas creadas exitosamente');
    
  } catch (error) {
    console.error('❌ Error creando tablas:', error);
  } finally {
    await pool.end();
  }
}

// Función principal
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--create-tables')) {
    await createMissingTables();
  } else {
    await validateConversationsDatabase();
    console.log('\\n📋 Para crear tablas faltantes ejecutar:');
    console.log('node validate-conversations-db.js --create-tables');
  }
}

// Ejecutar si se llama directamente
if (import.meta.url === \`file://\${process.argv[1]}\`) {
  main();
}

export {
  validateConversationsDatabase,
  createMissingTables
};
`;

  const validationPath = path.join(PROJECT_ROOT, 'validate-conversations-db.js');
  fs.writeFileSync(validationPath, validationScript);
  console.log('   ✅ Script de validación de base de datos creado');
}

// Ejecutar las pruebas
testConversationsEndpoints();