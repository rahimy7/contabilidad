import { interpretAIMessage } from './ai-order-assistant';
import { sendWhatsAppMessageDirect } from './whatsapp-simple';
import {
  processVoiceNote,
  processTextMessage,
  interpretMessage,
  ConversationContext
} from './ai-service';
import { getMasterStorage } from './storage';
import { getTenantStorageWithSchema } from './routes.ts';

interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'audio' | 'voice' | 'image' | 'document' | 'video';
  text?: { body: string };
  audio?: { id: string; mime_type: string };
  voice?: { id: string; mime_type: string };
}

interface WhatsAppEvent {
  from: string;
  text: string;
  storeId: number;
  customerId: number;
}

export async function handleIncomingAIMessage(event: WhatsAppEvent) {
  const { text, storeId, customerId, from } = event;
  const token = process.env.STORE_BEARER_TOKEN!;
  const apiBaseUrl = process.env.API_BASE_URL!;

  try {
    // 🧠 Inicializar tenantStorage con el schema correcto
    console.log(`🏪 Inicializando tenantStorage para tienda ${storeId}...`);
    const tenantStorage = await getTenantStorageWithSchema({
      storeId,
      schema: `store_${storeId}`
    });
    console.log(`✅ TenantStorage inicializado con schema store_${storeId}`);

    // 🔍 Pasar tenantStorage al flujo de interpretación
    const interpretation = await interpretAIMessage(text, {
      storeId,
      customerId,
      token,
      apiBaseUrl,
      tenantStorage // ✅ ahora IA puede consultar productos reales
    });

    await sendWhatsAppMessageDirect(from, interpretation.message, storeId);
  } catch (err) {
    console.error('❌ Error en flujo IA:', err);
    await sendWhatsAppMessageDirect(
      from,
      'Ocurrió un error procesando tu pedido. Intenta nuevamente.',
      storeId
    );
  }
}
