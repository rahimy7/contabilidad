/**
 * GUÍA DE INTEGRACIÓN - Sistema de IA con WhatsApp Webhook
 * 
 * Este archivo muestra cómo integrar el nuevo sistema de IA
 * con el procesamiento de webhooks existente en whatsapp-simple.ts
 */

import { processWhatsAppMessageWithAI } from './whatsapp-ai-handler';

// ========================================
// MODIFICACIÓN EN whatsapp-simple.ts
// ========================================

/**
 * PASO 1: Importar el handler de IA al inicio del archivo
 * 
 * Agregar al inicio de whatsapp-simple.ts:
 */

// import { processWhatsAppMessageWithAI } from './whatsapp-ai-handler';

/**
 * PASO 2: Modificar la función processUserMessage
 * 
 * Buscar la función processUserMessage en whatsapp-simple.ts
 * y agregar el procesamiento de IA ANTES de guardar el mensaje
 */

/*
async function processUserMessage(
  message: any,
  storeMapping: any,
  tenantStorage: any
): Promise<void> {
  try {
    const phoneNumber = message.from;
    const messageText = message.text?.body || '';
    const messageId = message.id;
    const messageType = message.type; // 'text', 'audio', 'voice', etc.
    
    console.log(`👤 MENSAJE DE USUARIO - De: ${phoneNumber}, Tipo: ${messageType}`);
    
    // ========================================
    // ✨ NUEVO: PROCESAMIENTO CON IA
    // ========================================
    let aiProcessing = null;
    let finalMessageText = messageText;
    
    try {
      // Procesar con IA (funciona para texto y audio)
      aiProcessing = await processWhatsAppMessageWithAI(
        message,
        storeMapping,
        tenantStorage
      );
      
      // Si es nota de voz, usar el texto transcrito
      if ((messageType === 'audio' || messageType === 'voice') && aiProcessing.processedText) {
        finalMessageText = `🎙️ [Nota de voz]: ${aiProcessing.processedText}`;
        console.log(`✅ Audio transcrito: "${aiProcessing.processedText}"`);
      }
      
      // Logging de IA
      if (aiProcessing.interpretation) {
        console.log(`🤖 IA - Intención: ${aiProcessing.interpretation.intent}`);
        console.log(`🤖 IA - Categoría: ${aiProcessing.interpretation.category}`);
        console.log(`🤖 IA - Confianza: ${aiProcessing.interpretation.confidence}`);
      }
      
    } catch (aiError) {
      console.error('⚠️ Error en procesamiento IA (continuando sin IA):', aiError);
      // Continuar sin IA si hay error
    }
    
    // ========================================
    // CÓDIGO EXISTENTE: Buscar o crear conversación
    // ========================================
    const conversation = await tenantStorage.getOrCreateConversationByPhone(
      phoneNumber,
      storeMapping.storeId
    );
    
    // Guardar mensaje en base de datos
    const savedMessage = await tenantStorage.createMessage({
      conversationId: conversation.id,
      content: finalMessageText, // Usar texto transcrito si es audio
      messageType: 'text', // Siempre guardar como texto
      senderType: 'customer',
      whatsappMessageId: messageId,
      isRead: false,
      createdAt: new Date(),
      sentAt: new Date(),
      deliveryStatus: 'received'
    });
    
    console.log(`✅ Mensaje guardado - ID: ${savedMessage.id}`);
    
    // ========================================
    // ✨ NUEVO: AUTO-RESPUESTA CON IA (OPCIONAL)
    // ========================================
    if (aiProcessing?.shouldAutoRespond && aiProcessing.suggestedResponse) {
      console.log('🤖 Enviando respuesta automática de IA...');
      
      // Opcional: Agregar delay para que parezca más natural
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      try {
        await sendWhatsAppMessage(
          phoneNumber,
          aiProcessing.suggestedResponse,
          storeMapping.storeId,
          conversation.id,
          tenantStorage
        );
        
        console.log(`✅ Respuesta automática enviada: "${aiProcessing.suggestedResponse}"`);
      } catch (error) {
        console.error('❌ Error enviando respuesta automática:', error);
      }
    }
    
    // ========================================
    // CÓDIGO EXISTENTE: Respuestas automáticas tradicionales
    // (Este código se mantiene como fallback)
    // ========================================
    const autoResponses = await tenantStorage.getActiveAutoResponses();
    // ... resto del código existente ...
    
  } catch (error: any) {
    console.error('❌ ERROR PROCESANDO MENSAJE DE USUARIO:', error);
    throw error;
  }
}
*/

/**
 * PASO 3: Agregar helper para enviar mensajes de WhatsApp
 * 
 * Si no existe, agregar esta función:
 */

/*
async function sendWhatsAppMessage(
  phoneNumber: string,
  messageText: string,
  storeId: number,
  conversationId: number,
  tenantStorage: any
): Promise<void> {
  try {
    const masterStorage = await getMasterStorage();
    const whatsappConfig = await masterStorage.getWhatsAppConfig(storeId);
    
    if (!whatsappConfig?.accessToken || !whatsappConfig?.phoneNumberId) {
      throw new Error('WhatsApp no configurado');
    }
    
    const url = `https://graph.facebook.com/v23.0/${whatsappConfig.phoneNumberId}/messages`;
    const cleanPhone = phoneNumber.replace(/[^\d+]/g, '');
    
    const payload = {
      messaging_product: "whatsapp",
      to: cleanPhone,
      type: "text",
      text: { 
        body: messageText 
      }
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${whatsappConfig.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      throw new Error(`WhatsApp API error: ${response.status}`);
    }
    
    const result = await response.json();
    const whatsappMessageId = result.messages?.[0]?.id;
    
    // Guardar mensaje enviado en BD
    await tenantStorage.createMessage({
      conversationId: conversationId,
      content: messageText,
      messageType: 'text',
      senderType: 'system', // o 'staff' si prefieres
      whatsappMessageId: whatsappMessageId,
      isRead: true,
      createdAt: new Date(),
      sentAt: new Date(),
      deliveryStatus: 'sent'
    });
    
    console.log(`✅ Mensaje enviado - WhatsApp ID: ${whatsappMessageId}`);
    
  } catch (error) {
    console.error('❌ Error enviando mensaje de WhatsApp:', error);
    throw error;
  }
}
*/

// ========================================
// CONFIGURACIÓN RECOMENDADA
// ========================================

export const AI_CONFIG = {
  // Activar/desactivar IA globalmente
  ENABLED: true,
  
  // Nivel mínimo de confianza para auto-responder (0.0 - 1.0)
  MIN_CONFIDENCE_FOR_AUTO_RESPONSE: 0.7,
  
  // Delay antes de enviar respuesta automática (ms)
  AUTO_RESPONSE_DELAY: 2000,
  
  // Categorías que pueden recibir auto-respuesta
  AUTO_RESPOND_CATEGORIES: ['greeting', 'question'],
  
  // Máximo de mensajes en contexto
  MAX_CONTEXT_MESSAGES: 10,
  
  // Activar transcripción de audio
  ENABLE_VOICE_TRANSCRIPTION: true,
  
  // Guardar análisis de IA en logs
  SAVE_AI_ANALYSIS: true
};

// ========================================
// FUNCIONES DE UTILIDAD
// ========================================

/**
 * Verificar si un mensaje debe ser procesado por IA
 */
export function shouldProcessWithAI(messageType: string): boolean {
  const supportedTypes = ['text', 'audio', 'voice'];
  return AI_CONFIG.ENABLED && supportedTypes.includes(messageType);
}

/**
 * Formatear texto transcrito para mostrar en UI
 */
export function formatTranscribedMessage(text: string, duration?: number): string {
  const durationText = duration ? ` (${Math.round(duration)}s)` : '';
  return `🎙️ [Nota de voz${durationText}]: ${text}`;
}

/**
 * Verificar si debe enviar auto-respuesta basado en configuración
 */
export function canAutoRespond(
  interpretation: any,
  config: typeof AI_CONFIG = AI_CONFIG
): boolean {
  if (!interpretation) return false;
  
  return (
    interpretation.confidence >= config.MIN_CONFIDENCE_FOR_AUTO_RESPONSE &&
    config.AUTO_RESPOND_CATEGORIES.includes(interpretation.category)
  );
}

// ========================================
// EJEMPLO DE USO EN CÓDIGO EXISTENTE
// ========================================

/*
// En tu archivo routes.ts o donde manejes el webhook:

import { processWhatsAppMessageWithAI } from './whatsapp-ai-handler';
import { AI_CONFIG, shouldProcessWithAI, canAutoRespond } from './whatsapp-ai-integration';

router.post('/webhook', async (req, res) => {
  try {
    const webhookData = req.body;
    const messages = webhookData.entry?.[0]?.changes?.[0]?.value?.messages;
    
    if (messages && messages.length > 0) {
      for (const message of messages) {
        // Verificar si debe procesarse con IA
        if (shouldProcessWithAI(message.type)) {
          try {
            const aiResult = await processWhatsAppMessageWithAI(
              message,
              storeMapping,
              tenantStorage
            );
            
            // Decidir si auto-responder
            if (canAutoRespond(aiResult.interpretation)) {
              // Enviar respuesta automática
              await sendWhatsAppMessage(
                message.from,
                aiResult.suggestedResponse,
                storeId,
                conversationId,
                tenantStorage
              );
            }
          } catch (aiError) {
            console.error('Error en procesamiento IA:', aiError);
            // Continuar con procesamiento normal
          }
        }
      }
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Error en webhook:', error);
    res.sendStatus(500);
  }
});
*/

export default {
  AI_CONFIG,
  shouldProcessWithAI,
  formatTranscribedMessage,
  canAutoRespond
};
