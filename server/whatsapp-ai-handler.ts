import { 
  processVoiceNote, 
  processTextMessage,
  interpretMessage,
  ConversationContext 
} from './ai-service';
import { getMasterStorage } from './storage';


// ========================================
// TIPOS WHATSAPP
// ========================================
interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'audio' | 'voice' | 'image' | 'document' | 'video';
  text?: {
    body: string;
  };
  audio?: {
    id: string;
    mime_type: string;
  };
  voice?: {
    id: string;
    mime_type: string;
  };
}

// ========================================
// PROCESAR MENSAJES CON IA
// ========================================

/**
 * Procesar mensaje de WhatsApp con IA
 */
export async function processWhatsAppMessageWithAI(
  message: WhatsAppMessage,
  storeMapping: any,
  tenantStorage: any
): Promise<{
  processedText: string;
  interpretation: any;
  shouldAutoRespond: boolean;
  suggestedResponse?: string;
}> {
  try {
    let processedText = '';
    let isVoiceNote = false;
    
    // ========================================
    // 1. PROCESAR SEGÚN TIPO DE MENSAJE
    // ========================================
    
    if (message.type === 'text' && message.text?.body) {
      // Mensaje de texto normal
      processedText = message.text.body;
      console.log(`📝 Mensaje de texto: "${processedText}"`);
      
    } else if (message.type === 'audio' || message.type === 'voice') {
      // Nota de voz
      isVoiceNote = true;
      console.log('🎙️ Nota de voz detectada');
      
      const mediaId = message.audio?.id || message.voice?.id;
      if (!mediaId) {
        throw new Error('No se encontró ID de media en nota de voz');
      }
      
      // Obtener configuración de WhatsApp
      const masterStorage = await getMasterStorage();
      const whatsappConfig = await masterStorage.getWhatsAppConfig(storeMapping.storeId);
      
      if (!whatsappConfig?.accessToken) {
        throw new Error('No se encontró token de acceso de WhatsApp');
      }
      
      // Transcribir audio
      console.log('🔄 Iniciando transcripción de audio...');
      const transcription = await processVoiceNote(mediaId, whatsappConfig.accessToken);
      processedText = transcription.text;
      
      console.log(`✅ Audio transcrito: "${processedText}"`);
      console.log(`📊 Idioma: ${transcription.language}, Duración: ${transcription.duration}s`);
      
      // Guardar transcripción en la base de datos
      await saveTranscriptionLog(
        message.from,
        mediaId,
        processedText,
        transcription,
        storeMapping.storeId
      );
    } else {
      // Tipo de mensaje no soportado para IA
      console.log(`ℹ️ Tipo de mensaje no procesable con IA: ${message.type}`);
      return {
        processedText: '',
        interpretation: null,
        shouldAutoRespond: false
      };
    }
    
    // ========================================
    // 2. OBTENER CONTEXTO DEL CLIENTE
    // ========================================
    
    const context = await buildConversationContext(
      message.from,
      tenantStorage,
      storeMapping.storeId
    );
    
    // ========================================
    // 3. INTERPRETAR MENSAJE CON IA
    // ========================================
    
    console.log('🤖 Analizando mensaje con IA...');
  const { interpretation, suggestedResponse } = await processTextMessage(
  processedText,
  context,
  tenantStorage
);

    
    // Guardar análisis en la base de datos
    await saveAIAnalysis(
      message.from,
      processedText,
      interpretation,
      suggestedResponse,
      storeMapping.storeId
    );
    
    // ========================================
    // 4. DECIDIR SI AUTO-RESPONDER
    // ========================================
    
    const shouldAutoRespond = await shouldSendAutoResponse(
      interpretation,
      context,
      storeMapping.storeId
    );
    
    console.log(`✅ Procesamiento IA completado`);
    console.log(`   - Intención: ${interpretation.intent}`);
    console.log(`   - Categoría: ${interpretation.category}`);
    console.log(`   - Sentimiento: ${interpretation.sentiment}`);
    console.log(`   - Confianza: ${interpretation.confidence}`);
    console.log(`   - Auto-responder: ${shouldAutoRespond ? 'SÍ' : 'NO'}`);
    
    if (isVoiceNote) {
      console.log(`   - 🎙️ Transcripción: "${processedText}"`);
    }
    
    return {
      processedText,
      interpretation,
      shouldAutoRespond,
      suggestedResponse: shouldAutoRespond ? suggestedResponse : undefined
    };
    
  } catch (error: any) {
    console.error('❌ Error procesando mensaje con IA:', error);
    
    // En caso de error, retornar valores por defecto
    return {
      processedText: message.text?.body || '',
      interpretation: null,
      shouldAutoRespond: false
    };
  }
}

// ========================================
// FUNCIONES AUXILIARES
// ========================================

/**
 * Construir contexto de conversación para la IA
 */
async function buildConversationContext(
  phoneNumber: string,
  tenantStorage: any,
  storeId: number
): Promise<ConversationContext | undefined> {
  try {
    // Buscar cliente
    const customer = await tenantStorage.getCustomerByPhone(phoneNumber);
    
    if (!customer) {
      console.log('ℹ️ Cliente no encontrado, sin contexto');
      return undefined;
    }
    
    // Buscar conversación
    const conversation = await tenantStorage.getConversationByCustomerPhone(phoneNumber);
    
    if (!conversation) {
      return {
        customerId: customer.id,
        customerName: customer.name,
        recentMessages: []
      };
    }
    
    // Obtener mensajes recientes
    const messages = await tenantStorage.getMessagesByConversation(conversation.id);
    const recentMessages = messages
      .slice(-10) // Últimos 10 mensajes
      .map((msg: any) => ({
        role: msg.senderType === 'customer' ? 'user' : 'assistant',
        content: msg.content,
        timestamp: msg.createdAt
      }));
    
    // Obtener historial de órdenes
    const orders = await tenantStorage.getOrdersByCustomerId(customer.id);
    
    return {
      customerId: customer.id,
      customerName: customer.name,
      recentMessages,
      orderHistory: orders
    };
    
  } catch (error) {
    console.error('Error construyendo contexto:', error);
    return undefined;
  }
}

/**
 * Decidir si enviar respuesta automática
 */
async function shouldSendAutoResponse(
  interpretation: any,
  context: ConversationContext | undefined,
  storeId: number
): Promise<boolean> {
  try {
    // Obtener configuración de auto-respuestas
    const masterStorage = await getMasterStorage();
    const whatsappConfig = await masterStorage.getWhatsAppConfig(storeId);
    
    // Si las auto-respuestas están desactivadas
    if (!whatsappConfig?.isActive) {
      return false;
    }
    
    // No auto-responder si hay baja confianza
    if (interpretation.confidence < 0.6) {
      console.log('⚠️ Confianza baja, no auto-responder');
      return false;
    }
    
    // No auto-responder si es una queja o negativo
    if (interpretation.category === 'complaint' || interpretation.sentiment === 'negative') {
      console.log('⚠️ Queja o sentimiento negativo, requiere atención humana');
      return false;
    }
    
    // Auto-responder solo para saludos simples y preguntas básicas
    if (interpretation.category === 'greeting' || 
        (interpretation.category === 'question' && interpretation.confidence > 0.8)) {
      return true;
    }
    
    // Para órdenes, solo confirmar recepción (no procesar)
    if (interpretation.category === 'order') {
      return true; // Enviará un mensaje de confirmación
    }
    
    return false;
    
  } catch (error) {
    console.error('Error decidiendo auto-respuesta:', error);
    return false;
  }
}

/**
 * Guardar log de transcripción
 */
async function saveTranscriptionLog(
  phoneNumber: string,
  mediaId: string,
  transcribedText: string,
  transcription: any,
  storeId: number
): Promise<void> {
  try {
    const masterStorage = await getMasterStorage();
    
    await masterStorage.addWhatsAppLog({
      type: 'voice_transcription',
      phoneNumber: phoneNumber,
      messageContent: transcribedText,
      messageId: mediaId,
      status: 'success',
      rawData: JSON.stringify({
        transcription,
        mediaId,
        processedAt: new Date().toISOString()
      }),
      storeId: storeId
    });
    
    console.log('✅ Log de transcripción guardado');
    
  } catch (error) {
    console.error('Error guardando log de transcripción:', error);
  }
}

/**
 * Guardar análisis de IA
 */
async function saveAIAnalysis(
  phoneNumber: string,
  messageText: string,
  interpretation: any,
  suggestedResponse: string,
  storeId: number
): Promise<void> {
  try {
    const masterStorage = await getMasterStorage();
    
    await masterStorage.addWhatsAppLog({
      type: 'ai_analysis',
      phoneNumber: phoneNumber,
      messageContent: messageText,
      status: 'analyzed',
      rawData: JSON.stringify({
        interpretation,
        suggestedResponse,
        analyzedAt: new Date().toISOString()
      }),
      storeId: storeId
    });
    
    console.log('✅ Análisis de IA guardado');
    
  } catch (error) {
    console.error('Error guardando análisis de IA:', error);
  }
}

/**
 * Obtener respuesta personalizada según categoría
 */
export function getResponseForCategory(
  category: string,
  interpretation: any
): string {
  switch (category) {
    case 'greeting':
      return interpretation.suggestedResponse;
      
    case 'order':
      return `¡Recibido! 📦 He registrado tu pedido. Un momento mientras lo procesamos y te confirmamos los detalles.`;
      
    case 'question':
      return interpretation.suggestedResponse;
      
    case 'complaint':
      return `Lamento que hayas tenido esta experiencia. Un supervisor revisará tu caso de inmediato. ¿Puedes darme más detalles?`;
      
    default:
      return `Gracias por tu mensaje. Un representante te atenderá pronto.`;
  }
}
