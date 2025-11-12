/**
 * WHATSAPP AI INTEGRATION v2
 * -----------------------------------------------------
 * Flujo actualizado de integración entre WhatsApp y la IA de pedidos.
 *
 * Reemplaza el sistema antiguo basado en addToCart/removeFromCart/updateQuantity
 * por el flujo unificado con interpretOrderMessage() + createOrderFromCart().
 */

import { interpretOrderMessage } from './ai-order-analyzer';
import { createOrderFromCart } from './ai-order-creator';
import { sendWhatsAppMessageDirect } from './whatsapp-simple';
import { getTenantStorageWithSchema } from './routes.ts';
import { AICreditsManager } from './ai-credits-manager';
import { getMasterStorage } from './storage';


interface WhatsAppEvent {
  from: string;
  text: string;
  storeId: number;
  customerId: number;
}

/**
 * Procesa un mensaje entrante de WhatsApp con IA
 */
export async function handleAIOrderMessage(event: WhatsAppEvent) {
  const { text, storeId, customerId, from } = event;

  console.log(`\n🤖 [IA-WHATSAPP] Procesando mensaje de cliente ${from}: "${text}"`);

  try {
    // 1️⃣ Crear conexión tenant
    const tenantStorage = await getTenantStorageWithSchema({
      storeId,
      schema: `store_${storeId}`,
    });

    // 2️⃣ Validar créditos IA
    const credits = new AICreditsManager(tenantStorage);
    const hasCredits = await credits.verifyCredits(storeId, 'message');
    if (!hasCredits) {
      await sendWhatsAppMessageDirect(
        from,
        '⚠️ Lo siento, no hay créditos disponibles para procesar tu mensaje.',
        storeId
      );
      return;
    }

    // 3️⃣ Interpretar el mensaje con IA (buscar productos, intención, etc.)
    const interpretation = await interpretOrderMessage(text, tenantStorage);

    if (!interpretation || !interpretation.items?.length) {
      console.log('❌ No se detectaron productos en el mensaje.');
      await sendWhatsAppMessageDirect(
        from,
        interpretation?.message || 'No pude entender tu pedido. ¿Podrías aclararlo?',
        storeId
      );
      return;
    }

    // 4️⃣ Crear la orden a partir del carrito IA
    const order = await createOrderFromCart({
      storeId,
      customerId,
      items: interpretation.items,
      notes: interpretation.message,
      tenantStorage,
    });

    // 5️⃣ Registrar uso de créditos
    await credits.consumeCredits(storeId, 'order');

    // 6️⃣ Enviar confirmación al cliente
    const confirmation = `🧾 Tu pedido ha sido registrado con éxito.\n\n` +
      order.items.map(i => `• ${i.quantity} × ${i.productName}`).join('\n') +
      `\n\n💰 Total: ${order.total.toFixed(2)}\n\nGracias por tu compra 🙏`;

    await sendWhatsAppMessageDirect(from, confirmation, storeId);

    console.log(`✅ Pedido IA creado con éxito (ID: ${order.id})`);
  } catch (err: any) {
    console.error('❌ Error procesando pedido IA:', err);
    await sendWhatsAppMessageDirect(
      from,
      'Ocurrió un error procesando tu pedido. Intenta nuevamente más tarde.',
      storeId
    );
  }
}
