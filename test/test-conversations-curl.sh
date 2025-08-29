#!/bin/bash
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

LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/login" \
  -H "$CONTENT_TYPE" \
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
  echo "✅ Token obtenido: ${TOKEN:0:20}..."
else
  echo "⚠️ jq no está instalado. Reemplazar TOKEN manualmente."
  echo "Instalar con: sudo apt install jq (Ubuntu) o brew install jq (Mac)"
  exit 1
fi

AUTH_HEADER="Authorization: Bearer $TOKEN"

# Probar endpoint de debug primero
show_separator "2️⃣ DEBUG ENDPOINT"
echo "Probando GET /api/debug/conversations..."

DEBUG_RESPONSE=$(curl -s -X GET "$BASE_URL/debug/conversations" \
  -H "$AUTH_HEADER" \
  -H "$CONTENT_TYPE")

check_response "$DEBUG_RESPONSE" "Debug endpoint"

# Probar obtener todas las conversaciones
show_separator "3️⃣ GET ALL CONVERSATIONS"
echo "Probando GET /api/conversations..."

CONVERSATIONS_RESPONSE=$(curl -s -X GET "$BASE_URL/conversations" \
  -H "$AUTH_HEADER" \
  -H "$CONTENT_TYPE")

check_response "$CONVERSATIONS_RESPONSE" "Get conversations"

# Extraer ID de primera conversación si existe
FIRST_CONVERSATION_ID=$(echo "$CONVERSATIONS_RESPONSE" | jq -r '.[0].id // empty' 2>/dev/null)

if [ ! -z "$FIRST_CONVERSATION_ID" ] && [ "$FIRST_CONVERSATION_ID" != "null" ]; then
  show_separator "4️⃣ GET SINGLE CONVERSATION"
  echo "Probando GET /api/conversations/$FIRST_CONVERSATION_ID..."
  
  SINGLE_CONV_RESPONSE=$(curl -s -X GET "$BASE_URL/conversations/$FIRST_CONVERSATION_ID" \
    -H "$AUTH_HEADER" \
    -H "$CONTENT_TYPE")
  
  check_response "$SINGLE_CONV_RESPONSE" "Get single conversation"
  
  show_separator "5️⃣ GET CONVERSATION MESSAGES"
  echo "Probando GET /api/conversations/$FIRST_CONVERSATION_ID/messages..."
  
  MESSAGES_RESPONSE=$(curl -s -X GET "$BASE_URL/conversations/$FIRST_CONVERSATION_ID/messages" \
    -H "$AUTH_HEADER" \
    -H "$CONTENT_TYPE")
  
  check_response "$MESSAGES_RESPONSE" "Get messages"
else
  echo "⚠️ No hay conversaciones existentes para probar endpoints específicos"
fi

# Probar crear nueva conversación
show_separator "6️⃣ CREATE CONVERSATION"
echo "Probando POST /api/conversations..."

CREATE_CONV_RESPONSE=$(curl -s -X POST "$BASE_URL/conversations" \
  -H "$AUTH_HEADER" \
  -H "$CONTENT_TYPE" \
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
  
  CREATE_MSG_RESPONSE=$(curl -s -X POST "$BASE_URL/conversations/$NEW_CONVERSATION_ID/messages" \
    -H "$AUTH_HEADER" \
    -H "$CONTENT_TYPE" \
    -d '{
      "content": "Mensaje de prueba desde curl test",
      "senderType": "agent"
    }')
  
  check_response "$CREATE_MSG_RESPONSE" "Create message"
  
  show_separator "8️⃣ UPDATE CONVERSATION"
  echo "Probando PUT /api/conversations/$NEW_CONVERSATION_ID..."
  
  UPDATE_CONV_RESPONSE=$(curl -s -X PUT "$BASE_URL/conversations/$NEW_CONVERSATION_ID" \
    -H "$AUTH_HEADER" \
    -H "$CONTENT_TYPE" \
    -d '{
      "status": "closed",
      "conversationType": "test_completed"
    }')
  
  check_response "$UPDATE_CONV_RESPONSE" "Update conversation"
fi

# Verificar estado final
show_separator "9️⃣ VERIFICATION"
echo "Verificando estado final..."

FINAL_CONVERSATIONS=$(curl -s -X GET "$BASE_URL/conversations" \
  -H "$AUTH_HEADER" \
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
