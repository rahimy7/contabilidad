/**
 * Test específico para botones interactivos MASQUESALUD
 */

const webhookUrl = "https://whats-app-order-manager-rahimy7.replit.app/webhook";

// Test específico para MASQUESALUD (Store ID: 5) con botón interactivo
const interactivePayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "1438133463993189",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "+1 809-357-6939",
              phone_number_id: "690329620832620" // MASQUESALUD phoneNumberId
            },
            contacts: [
              {
                profile: {
                  name: "Test User MASQUESALUD"
                },
                wa_id: "525599997777"
              }
            ],
            messages: [
              {
                from: "525599997777",
                id: `test_interactive_button_${Date.now()}`,
                timestamp: Math.floor(Date.now() / 1000).toString(),
                interactive: {
                  type: "button_reply",
                  button_reply: {
                    id: "show_products",
                    title: "Ver Productos"
                  }
                },
                type: "interactive"
              }
            ]
          },
          field: "messages"
        }
      ]
    }
  ]
};

async function testInteractiveButton() {
  console.log('🧪 PROBANDO BOTÓN INTERACTIVO - MASQUESALUD\n');
  
  console.log('🏥 MASQUESALUD - Enviando botón "Ver Productos"');
  console.log('📱 PhoneNumberId: 690329620832620 (Store ID: 5)');
  console.log('🎯 Button ID: show_products\n');
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(interactivePayload)
    });
    
    console.log(`📡 Response Status: ${response.status}`);
    const responseText = await response.text();
    console.log(`📄 Response Body: ${responseText}\n`);
    
    if (response.status === 200 && responseText === "EVENT_RECEIVED") {
      console.log('✅ Webhook recibido correctamente');
      console.log('🔍 Revisar logs del servidor para verificar procesamiento del botón');
      console.log('📋 Se debe encontrar log: "Button pressed: show_products"');
      console.log('📤 Se debe enviar respuesta automática de "product_inquiry"');
    } else {
      console.log('❌ Error en el webhook');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Ejecutar test
testInteractiveButton();