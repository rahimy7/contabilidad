# WhatsApp Webhook Testing - CURL Commands

## Prerequisitos

1. El servidor debe estar corriendo en `http://localhost:3000`
2. Reemplaza `STORE_ID` con el ID real de tu tienda
3. Reemplaza `PHONE_NUMBER_ID` con el número de teléfono actual de la tienda

---

## Opción 1: Usar el Endpoint de Simulación (Recomendado)

### TEST 1: Cliente Registrado Envía Pedido

```bash
curl -X POST http://localhost:3000/test/simulate-webhook/6 \
  -H "Content-Type: application/json" \
  -d '{
  "customerPhone": "18494553242",
  "messageText": "3 Prezoom La Bestia en Polvo, 2 4Life Transfer Factor AgePro",
  "messageType": "text"
}'
```

**Expected Response:**
```json
{
  "status": "success",
  "message": "Webhook processed",
  "orderId": 193,
  "orderNumber": "WEB-1762823335896",
  "messagesSent": 1,
  "messageType": "confirmation"
}
```

**Expected Logs:**
```
🎯 WEBHOOK RECEIVED - Processing WhatsApp message
✅ IDEMPOTENCY: Marked messageId... as processed
🔍 CUSTOMER REGISTRATION CHECK - Fully Registered: true
⏭️ CUSTOMER FULLY REGISTERED - Skipping "Order received", sending confirmation directly
📋 GENERATING INTERACTIVE ORDER CONFIRMATION
✅ INTERACTIVE ORDER CONFIRMATION SENT
```

---

### TEST 2: Cliente Nuevo Envía Pedido

```bash
curl -X POST http://localhost:3000/test/simulate-webhook/6 \
  -H "Content-Type: application/json" \
  -d '{
  "customerPhone": "18091234567",
  "messageText": "2 Prezoom, 1 Transfer Factor",
  "messageType": "text"
}'
```

**Expected Response:**
```json
{
  "status": "success",
  "message": "Webhook processed",
  "orderId": 194,
  "orderNumber": "WEB-1762823400000",
  "messagesSent": 1,
  "messageType": "order_received"
}
```

**Expected Logs:**
```
🎯 WEBHOOK RECEIVED - Processing WhatsApp message
✅ IDEMPOTENCY: Marked messageId... as processed
🔍 CUSTOMER REGISTRATION CHECK - Fully Registered: false
✅ CUSTOMER NOT REGISTERED - Sending "Order received" message
🎯 TRIGGERING order_received AUTO-RESPONSE...
✅ order_received AUTO-RESPONSE SENT SUCCESSFULLY
```

---

## Opción 2: Usar el Endpoint Principal con Webhook Real

### Estructura del Webhook de WhatsApp

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "BUSINESS_ACCOUNT_ID",
      "changes": [
        {
          "field": "messages",
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "16505551234",
              "phone_number_id": "PHONE_NUMBER_ID"
            },
            "contacts": [
              {
                "profile": {
                  "name": "Rahimy"
                },
                "wa_id": "18494553242"
              }
            ],
            "messages": [
              {
                "from": "18494553242",
                "id": "wamid.HBgLMTg0OTQ1NTMyNDIVAgARGBIwNDVGNTAwNjM2RkE1OUUxODAA",
                "timestamp": "1702294134",
                "type": "text",
                "text": {
                  "body": "3 Prezoom La Bestia en Polvo, 2 4Life Transfer Factor AgePro"
                }
              }
            ]
          }
        }
      ]
    }
  ]
}
```

### TEST 3: Cliente Registrado (Con Webhook Real)

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "123456789",
      "changes": [
        {
          "field": "messages",
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "16505551234",
              "phone_number_id": "1234567890"
            },
            "contacts": [
              {
                "profile": {
                  "name": "Rahimy"
                },
                "wa_id": "18494553242"
              }
            ],
            "messages": [
              {
                "from": "18494553242",
                "id": "wamid.test.registered.customer.'$(date +%s)'",
                "timestamp": "'$(date +%s)'",
                "type": "text",
                "text": {
                  "body": "3 Prezoom La Bestia en Polvo, 2 4Life Transfer Factor AgePro"
                }
              }
            ]
          }
        }
      ]
    }
  ]
}'
```

### TEST 4: Cliente Nuevo (Con Webhook Real)

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "123456789",
      "changes": [
        {
          "field": "messages",
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "16505551234",
              "phone_number_id": "1234567890"
            },
            "contacts": [
              {
                "profile": {
                  "name": "+18091234567"
                },
                "wa_id": "18091234567"
              }
            ],
            "messages": [
              {
                "from": "18091234567",
                "id": "wamid.test.new.customer.'$(date +%s)'",
                "timestamp": "'$(date +%s)'",
                "type": "text",
                "text": {
                  "body": "2 Prezoom, 1 Transfer Factor"
                }
              }
            ]
          }
        }
      ]
    }
  ]
}'
```

---

## Opción 3: Simular con Button Press (Confirmación)

Después de que un cliente registrado recibe la confirmación, puede presionar el botón "Confirmar":

```bash
curl -X POST http://localhost:3000/test/simulate-webhook/6 \
  -H "Content-Type: application/json" \
  -d '{
  "customerPhone": "18494553242",
  "messageText": "confirm_order",
  "messageType": "interactive",
  "buttonId": "confirm_order",
  "buttonTitle": "✅ Confirmar"
}'
```

**Expected Response:**
```json
{
  "status": "success",
  "message": "Webhook processed",
  "action": "confirm_order",
  "result": "Order confirmed"
}
```

**Expected Logs:**
```
🎯 WEBHOOK RECEIVED - Processing WhatsApp message
✅ IDEMPOTENCY: Marked messageId... as processed
📱 Processing incoming user message
🔍 CHECKING IF MESSAGE IS AN ORDER...
🛍️ IS ORDER MESSAGE: false
🔍 CUSTOMER HAS REGISTRATION FLOW
✅ ENTERING handleRegistrationFlow
✅ Current Step: confirm_order
✅ USER CONFIRMED ORDER
🎉 Completing order registration...
✅ ORDER COMPLETION SUCCESSFUL
```

---

## Opción 4: Simular Button Press - Modificar

```bash
curl -X POST http://localhost:3000/test/simulate-webhook/6 \
  -H "Content-Type: application/json" \
  -d '{
  "customerPhone": "18494553242",
  "messageText": "modify_order",
  "messageType": "interactive",
  "buttonId": "modify_order",
  "buttonTitle": "✏️ Modificar"
}'
```

**Expected Response:**
```json
{
  "status": "success",
  "message": "Webhook processed",
  "action": "modify_order",
  "result": "Field selection menu sent"
}
```

**Expected Logs:**
```
✏️ USER WANTS TO MODIFY ORDER
🔄 PROCESSING MODIFY MENU - Sending field selection options
📤 Sending field selector: 1=Nombre, 2=Dirección, 3=Contacto, 4=Pago, 5=Notas
```

---

## Opción 5: Simular Button Press - Cancelar

```bash
curl -X POST http://localhost:3000/test/simulate-webhook/6 \
  -H "Content-Type: application/json" \
  -d '{
  "customerPhone": "18494553242",
  "messageText": "cancel_order",
  "messageType": "interactive",
  "buttonId": "cancel_order",
  "buttonTitle": "❌ Cancelar"
}'
```

**Expected Response:**
```json
{
  "status": "success",
  "message": "Webhook processed",
  "action": "cancel_order",
  "result": "Order cancelled"
}
```

**Expected Logs:**
```
❌ USER WANTS TO CANCEL ORDER
✅ REGISTRATION FLOW DELETED
```

---

## Opción 6: Prueba de Idempotencia - Enviar el Mismo Mensaje Dos Veces

```bash
# Primer envío - Debe procesar
curl -X POST http://localhost:3000/test/simulate-webhook/6 \
  -H "Content-Type: application/json" \
  -d '{
  "customerPhone": "18494553242",
  "messageText": "3 Prezoom, 2 Transfer Factor",
  "messageType": "text",
  "messageId": "test-idempotency-123"
}'

# Segundo envío - Debe detectar como duplicado
curl -X POST http://localhost:3000/test/simulate-webhook/6 \
  -H "Content-Type: application/json" \
  -d '{
  "customerPhone": "18494553242",
  "messageText": "3 Prezoom, 2 Transfer Factor",
  "messageType": "text",
  "messageId": "test-idempotency-123"
}'
```

**Expected Logs para segundo intento:**
```
⚠️ DUPLICATE MESSAGE DETECTED - MessageId: test-idempotency-123 was already processed. Skipping.
```

---

## Script de Prueba Completa (Bash)

Crear archivo `test-webhook.sh`:

```bash
#!/bin/bash

BASE_URL="http://localhost:3000"
STORE_ID="6"

echo "=========================================="
echo "TEST 1: Cliente Registrado - Orden Nueva"
echo "=========================================="
curl -X POST $BASE_URL/test/simulate-webhook/$STORE_ID \
  -H "Content-Type: application/json" \
  -d '{
  "customerPhone": "18494553242",
  "messageText": "3 Prezoom La Bestia en Polvo, 2 4Life Transfer Factor AgePro",
  "messageType": "text"
}' | jq .

sleep 2

echo ""
echo "=========================================="
echo "TEST 2: Cliente Nuevo - Orden Nueva"
echo "=========================================="
curl -X POST $BASE_URL/test/simulate-webhook/$STORE_ID \
  -H "Content-Type: application/json" \
  -d '{
  "customerPhone": "18091234567",
  "messageText": "2 Prezoom, 1 Transfer Factor",
  "messageType": "text"
}' | jq .

sleep 2

echo ""
echo "=========================================="
echo "TEST 3: Confirmar Orden (Cliente Registrado)"
echo "=========================================="
curl -X POST $BASE_URL/test/simulate-webhook/$STORE_ID \
  -H "Content-Type: application/json" \
  -d '{
  "customerPhone": "18494553242",
  "messageText": "confirm_order",
  "messageType": "interactive",
  "buttonId": "confirm_order"
}' | jq .

sleep 2

echo ""
echo "=========================================="
echo "TEST 4: Idempotencia - Mismo Mensaje Dos Veces"
echo "=========================================="
MESSAGE_ID="test-$(date +%s)"

echo "Primer envío:"
curl -X POST $BASE_URL/test/simulate-webhook/$STORE_ID \
  -H "Content-Type: application/json" \
  -d "{
  \"customerPhone\": \"18091111111\",
  \"messageText\": \"1 Producto Test\",
  \"messageType\": \"text\",
  \"messageId\": \"$MESSAGE_ID\"
}" | jq .

sleep 1

echo "Segundo envío (debe detectar duplicate):"
curl -X POST $BASE_URL/test/simulate-webhook/$STORE_ID \
  -H "Content-Type: application/json" \
  -d "{
  \"customerPhone\": \"18091111111\",
  \"messageText\": \"1 Producto Test\",
  \"messageType\": \"text\",
  \"messageId\": \"$MESSAGE_ID\"
}" | jq .

echo ""
echo "=========================================="
echo "Pruebas completadas"
echo "=========================================="
```

**Ejecutar:**
```bash
bash test-webhook.sh
```

---

## Monitorear Logs en Tiempo Real

En otra terminal:
```bash
# En Windows con Git Bash o WSL:
tail -f server.log | grep -E "(WEBHOOK|IDEMPOTENCY|CUSTOMER REGISTRATION|ORDER CONFIRMATION)"

# O si tienes el servidor con output en consola:
# Los logs aparecerán automáticamente
```

---

## Validación

Después de cada test, verifica:

1. **Un solo mensaje enviado** (no duplicados)
2. **Logs muestran el flujo correcto**
3. **Base de datos actualizada correctamente**
4. **Flow state es el correcto (confirm_order vs awaiting_start)**

---

## Troubleshooting

### Error: "No store found for phoneNumberId"
- Asegúrate que el PHONE_NUMBER_ID existe en la tienda
- Verifica en la base de datos: `SELECT * FROM whatsapp_configs WHERE storeId = 6`

### Error: "Customer not found"
- El sistema crea clientes automáticamente si no existen
- Verifica en DB: `SELECT * FROM customers WHERE phone = '18494553242'`

### No se envía el mensaje
- Verifica que el webhook handler esté activo
- Revisa logs para errores en `processWhatsAppMessage`
- Confirma que `tenantStorage` está inicializado correctamente

### Mensajes duplicados aún aparecen
- Limpia el cache de idempotencia (servidor se reinicia)
- Verifica que no hay dos handlers de webhook activos
- Revisa `server/index.ts` no tenga más webhook handlers

