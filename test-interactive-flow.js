/**
 * Test específico para flujo interactivo de recolección de datos
 */

const BASE_URL = "https://whats-app-order-manager-rahimy7.replit.app";

// Simular mensaje de orden desde catálogo
function createOrderWebhookPayload() {
  return {
    "object": "whatsapp_business_account",
    "entry": [
      {
        "id": "1438133463993189",
        "changes": [
          {
            "value": {
              "messaging_product": "whatsapp",
              "metadata": {
                "display_phone_number": "18093576939",
                "phone_number_id": "690329620832620"
              },
              "contacts": [
                {
                  "profile": {
                    "name": "Test User"
                  },
                  "wa_id": "5215512345678"
                }
              ],
              "messages": [
                {
                  "from": "5215512345678",
                  "id": "wamid.test123",
                  "timestamp": Math.floor(Date.now() / 1000).toString(),
                  "text": {
                    "body": "🛍️ *NUEVO PEDIDO*\n\n1. Mini Split 12,000 BTU Inverter - Cantidad: 1 - Precio: $15,000\n2. Instalación Profesional - Cantidad: 1 - Precio: $2,500\n\n💰 *Subtotal: $17,500*\n\nEnviado desde el catálogo web"
                  },
                  "type": "text"
                }
              ]
            },
            "field": "messages"
          }
        ]
      }
    ]
  };
}

// Simular botón interactivo para contacto
function createInteractiveContactPayload(buttonId) {
  return {
    "object": "whatsapp_business_account",
    "entry": [
      {
        "id": "1438133463993189",
        "changes": [
          {
            "value": {
              "messaging_product": "whatsapp",
              "metadata": {
                "display_phone_number": "18093576939",
                "phone_number_id": "690329620832620"
              },
              "contacts": [
                {
                  "profile": {
                    "name": "Test User"
                  },
                  "wa_id": "5215512345678"
                }
              ],
              "messages": [
                {
                  "from": "5215512345678",
                  "id": "wamid.interactive_test",
                  "timestamp": Math.floor(Date.now() / 1000).toString(),
                  "interactive": {
                    "type": "button_reply",
                    "button_reply": {
                      "id": buttonId,
                      "title": buttonId === "use_current" ? "Usar este número" : "Otro número"
                    }
                  },
                  "type": "interactive"
                }
              ]
            },
            "field": "messages"
          }
        ]
      }
    ]
  };
}

// Simular botón interactivo para pago
function createInteractivePaymentPayload(buttonId) {
  return {
    "object": "whatsapp_business_account",
    "entry": [
      {
        "id": "1438133463993189",
        "changes": [
          {
            "value": {
              "messaging_product": "whatsapp",
              "metadata": {
                "display_phone_number": "18093576939",
                "phone_number_id": "690329620832620"
              },
              "contacts": [
                {
                  "profile": {
                    "name": "Test User"
                  },
                  "wa_id": "5215512345678"
                }
              ],
              "messages": [
                {
                  "from": "5215512345678",
                  "id": "wamid.payment_test",
                  "timestamp": Math.floor(Date.now() / 1000).toString(),
                  "interactive": {
                    "type": "button_reply",
                    "button_reply": {
                      "id": buttonId,
                      "title": buttonId === "payment_card" ? "💳 Tarjeta" : buttonId === "payment_transfer" ? "🏦 Transferencia" : "💵 Efectivo"
                    }
                  },
                  "type": "interactive"
                }
              ]
            },
            "field": "messages"
          }
        ]
      }
    ]
  };
}

// Simular mensaje de texto
function createTextMessagePayload(text) {
  return {
    "object": "whatsapp_business_account",
    "entry": [
      {
        "id": "1438133463993189",
        "changes": [
          {
            "value": {
              "messaging_product": "whatsapp",
              "metadata": {
                "display_phone_number": "18093576939",
                "phone_number_id": "690329620832620"
              },
              "contacts": [
                {
                  "profile": {
                    "name": "Test User"
                  },
                  "wa_id": "5215512345678"
                }
              ],
              "messages": [
                {
                  "from": "5215512345678",
                  "id": "wamid.text_test_" + Date.now(),
                  "timestamp": Math.floor(Date.now() / 1000).toString(),
                  "text": {
                    "body": text
                  },
                  "type": "text"
                }
              ]
            },
            "field": "messages"
          }
        ]
      }
    ]
  };
}

async function sendWebhook(payload, description) {
  console.log(`\n🚀 ${description}...`);
  
  try {
    const response = await fetch(`${BASE_URL}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    const result = await response.text();
    console.log(`✅ RESPUESTA: ${result}`);
    
    // Esperar un poco para el procesamiento
    await new Promise(resolve => setTimeout(resolve, 2000));
    
  } catch (error) {
    console.error(`❌ ERROR: ${error.message}`);
  }
}

async function testFullInteractiveFlow() {
  console.log('🧪 INICIANDO PRUEBA COMPLETA DEL FLUJO INTERACTIVO\n');
  
  // 1. Crear orden automática desde catálogo
  await sendWebhook(createOrderWebhookPayload(), "PASO 1: Creando orden automática desde catálogo");
  
  // 2. Enviar nombre (texto)
  await sendWebhook(createTextMessagePayload("María González López"), "PASO 2: Enviando nombre del cliente");
  
  // 3. Enviar dirección (texto)
  await sendWebhook(createTextMessagePayload("Calle Reforma 123, Col. Centro, CP 11000, Ciudad de México"), "PASO 3: Enviando dirección completa");
  
  // 4. Confirmar contacto usando WhatsApp (botón interactivo)
  await sendWebhook(createInteractiveContactPayload("use_current"), "PASO 4: Confirmando usar número WhatsApp actual (botón)");
  
  // 5. Seleccionar método de pago: tarjeta (botón interactivo)
  await sendWebhook(createInteractivePaymentPayload("payment_card"), "PASO 5: Seleccionando pago con tarjeta (botón)");
  
  // 6. Agregar notas adicionales (texto)
  await sendWebhook(createTextMessagePayload("Disponible lunes a viernes de 9am a 6pm. Departamento en segundo piso."), "PASO 6: Agregando notas adicionales");
  
  console.log('\n✅ FLUJO COMPLETO ENVIADO');
  console.log('🔍 Revisa los logs del webhook para verificar el procesamiento completo');
  console.log('📋 La orden debe estar confirmada con todos los datos recopilados');
}

// Ejecutar test
testFullInteractiveFlow();