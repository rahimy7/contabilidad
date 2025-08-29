/**
 * Test completo para validar creación automática de órdenes desde catálogo web
 */

const testMessage = `🛍️ *NUEVO PEDIDO*

📋 *Resumen de tu compra:*

1. PLANTA NATURAL GARDEN POL ZAMIA
   Cantidad: 1
   Precio unitario: $714.00
   Subtotal: $714.00

2. AIRE ACONDICIONADO CETRON MCI24CDBWCC32 (EV/CO) INVERTER 24,000BTU SEER18
   Cantidad: 1
   Precio unitario: $49,410.00
   Subtotal: $49,410.00

*TOTAL: $50,124.00*

Por favor confirma tu pedido y proporciona tu dirección de entrega.`;

// Simular webhook payload de WhatsApp
const webhookPayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "690329620832620",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "18093576939",
              phone_number_id: "690329620832620"
            },
            messages: [
              {
                from: "18494553242",
                id: "wamid.test123456789",
                timestamp: "1751914000",
                text: {
                  body: testMessage
                },
                type: "text"
              }
            ]
          },
          field: "messages"
        }
      ]
    }
  ]
};

console.log('🧪 ENVIANDO WEBHOOK DE PRUEBA PARA ORDEN AUTOMÁTICA...\n');

fetch('https://whats-app-order-manager-rahimy7.replit.app/webhook', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(webhookPayload)
})
.then(response => response.text())
.then(data => {
  console.log('✅ RESPUESTA DEL WEBHOOK:');
  console.log(data);
  console.log('\n🔍 Revisa los logs de WhatsApp en el panel para ver el procesamiento detallado');
})
.catch(error => {
  console.error('❌ ERROR EN WEBHOOK:', error);
});