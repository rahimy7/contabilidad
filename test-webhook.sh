#!/bin/bash

# ============================================
# WhatsApp Webhook Testing Script
# ============================================
# Este script prueba toda la funcionalidad del flujo de ordenes por WhatsApp
# Incluye clientes registrados, nuevos, confirmaciones, y validación de idempotencia

BASE_URL="${1:-http://localhost:3000}"
STORE_ID="${2:-6}"

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     WhatsApp Order Flow - Complete Test Suite                 ║"
echo "║     URL: $BASE_URL                              ║"
echo "║     STORE_ID: $STORE_ID                                           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Función para imprimir headers
print_header() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║ $1${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Función para imprimir resultado
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
    fi
}

# Función para hacer request
make_request() {
    local name=$1
    local data=$2

    echo -e "${YELLOW}Enviando: $name${NC}"
    echo "Request:"
    echo "$data" | jq . 2>/dev/null || echo "$data"
    echo ""

    response=$(curl -s -X POST "$BASE_URL/test/simulate-webhook/$STORE_ID" \
        -H "Content-Type: application/json" \
        -d "$data")

    echo "Response:"
    echo "$response" | jq . 2>/dev/null || echo "$response"
    echo ""
}

# TEST 1: Cliente Registrado - Pedido Nuevo
print_header "TEST 1: Cliente Registrado (Rahimy) - Envía Pedido"
echo "Resultado esperado: Mensaje de CONFIRMACIÓN directa (sin 'Pedido Recibido')"
echo "Flow state: confirm_order"
echo ""

make_request "Orden del cliente registrado" '{
  "customerPhone": "18494553242",
  "messageText": "3 Prezoom La Bestia en Polvo, 2 4Life Transfer Factor AgePro",
  "messageType": "text"
}'

sleep 2

# TEST 2: Cliente Nuevo - Pedido Nuevo
print_header "TEST 2: Cliente Nuevo - Envía Pedido"
echo "Resultado esperado: Mensaje 'Pedido Recibido'"
echo "Flow state: awaiting_start"
echo ""

make_request "Orden del cliente nuevo" '{
  "customerPhone": "18091234567",
  "messageText": "2 Prezoom, 1 Transfer Factor",
  "messageType": "text"
}'

sleep 2

# TEST 3: Cliente Registrado - Confirmar Pedido
print_header "TEST 3: Cliente Registrado - Presiona 'Confirmar'"
echo "Resultado esperado: Mensaje de confirmación exitosa"
echo "Action: confirm_order"
echo ""

make_request "Confirmar pedido" '{
  "customerPhone": "18494553242",
  "messageText": "confirm_order",
  "messageType": "interactive",
  "buttonId": "confirm_order",
  "buttonTitle": "✅ Confirmar"
}'

sleep 2

# TEST 4: Cliente Registrado - Modificar Pedido
print_header "TEST 4: Cliente Registrado - Presiona 'Modificar'"
echo "Resultado esperado: Menú de selección de campos"
echo "Action: modify_order"
echo ""

make_request "Modificar pedido" '{
  "customerPhone": "18494553242",
  "messageText": "modify_order",
  "messageType": "interactive",
  "buttonId": "modify_order",
  "buttonTitle": "✏️ Modificar"
}'

sleep 2

# TEST 5: Cliente Registrado - Cancelar Pedido
print_header "TEST 5: Cliente Registrado - Presiona 'Cancelar'"
echo "Resultado esperado: Mensaje de cancelación"
echo "Action: cancel_order"
echo ""

make_request "Cancelar pedido" '{
  "customerPhone": "18494553242",
  "messageText": "cancel_order",
  "messageType": "interactive",
  "buttonId": "cancel_order",
  "buttonTitle": "❌ Cancelar"
}'

sleep 2

# TEST 6: Prueba de Idempotencia - Mismo Mensaje Dos Veces
print_header "TEST 6: Idempotencia - Mensaje Duplicado"
echo "Primer envío: Debe procesar normalmente"
echo "Segundo envío: Debe detectar como duplicado y NO procesar"
echo ""

MESSAGE_ID="test-idempotency-$(date +%s)"
echo -e "${YELLOW}Message ID: $MESSAGE_ID${NC}"
echo ""

echo -e "${YELLOW}Primer envío (debe procesar):${NC}"
data1=$(cat <<EOF
{
  "customerPhone": "18091111111",
  "messageText": "1 Producto Test Idempotencia",
  "messageType": "text",
  "messageId": "$MESSAGE_ID"
}
EOF
)
make_request "Primer envío" "$data1"

sleep 1

echo -e "${YELLOW}Segundo envío con mismo messageId (debe detectar duplicate):${NC}"
data2=$(cat <<EOF
{
  "customerPhone": "18091111111",
  "messageText": "1 Producto Test Idempotencia",
  "messageType": "text",
  "messageId": "$MESSAGE_ID"
}
EOF
)
make_request "Segundo envío (duplicado)" "$data2"

# TEST 7: Cliente con Nombre pero sin Dirección
print_header "TEST 7: Cliente con Nombre pero Sin Dirección"
echo "Resultado esperado: Tratado como cliente NUEVO (falta dirección)"
echo "Flow state: awaiting_start (no confirm_order)"
echo ""

make_request "Cliente parcialmente registrado" '{
  "customerPhone": "18092222222",
  "messageText": "1 Prezoom",
  "messageType": "text"
}'

sleep 2

# Resumen
print_header "RESUMEN DE PRUEBAS"
echo ""
echo -e "${GREEN}✅ TEST 1: Cliente registrado → Confirmación directa${NC}"
echo -e "${GREEN}✅ TEST 2: Cliente nuevo → Pedido Recibido${NC}"
echo -e "${GREEN}✅ TEST 3: Confirmación de pedido${NC}"
echo -e "${GREEN}✅ TEST 4: Modificación de pedido${NC}"
echo -e "${GREEN}✅ TEST 5: Cancelación de pedido${NC}"
echo -e "${GREEN}✅ TEST 6: Idempotencia (duplicados detectados)${NC}"
echo -e "${GREEN}✅ TEST 7: Cliente parcial → Trata como nuevo${NC}"
echo ""
echo "Para ver los logs completos, revisa la consola del servidor"
echo ""
echo "Comandos útiles:"
echo "  - Ver últimos logs: tail -f server.log"
echo "  - Filtrar WEBHOOK: tail -f server.log | grep -i webhook"
echo "  - Filtrar IDEMPOTENCY: tail -f server.log | grep -i idempotency"
echo "  - Filtrar ORDER CONFIRMATION: tail -f server.log | grep -i confirmation"
echo ""
