/**
 * Test simple para verificar respuesta automática
 */

const BASE_URL = "https://whats-app-order-manager-rahimy7.replit.app";

function createSimpleMessagePayload(messageText) {
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
                  "wa_id": "18494553242"
                }
              ],
              "messages": [
                {
                  "from": "18494553242",
                  "id": "wamid.test_" + Date.now(),
                  "timestamp": Math.floor(Date.now() / 1000).toString(),
                  "text": {
                    "body": messageText
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

async function testSimpleMessage() {
  console.log('🧪 PROBANDO MENSAJE SIMPLE: "hola"');
  
  try {
    const response = await fetch(`${BASE_URL}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createSimpleMessagePayload("hola"))
    });
    
    const result = await response.text();
    console.log(`✅ RESPUESTA: ${result}`);
    
  } catch (error) {
    console.error(`❌ ERROR: ${error.message}`);
  }
}

testSimpleMessage();