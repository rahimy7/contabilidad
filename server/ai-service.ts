import 'dotenv/config';
import OpenAI from 'openai';
import axios from 'axios';
import FormData from 'form-data';
import { Readable } from 'stream';

// ========================================
// CONFIGURACIÓN DE OPENAI
// ========================================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ========================================
// TIPOS
// ========================================
interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}  

interface MessageInterpretation {
  intent: string;
  category: 'order' | 'question' | 'complaint' | 'greeting' | 'other';
  entities: {
    products?: string[];
    quantity?: number;
    location?: string;
    phoneNumber?: string;
  };
  sentiment: 'positive' | 'neutral' | 'negative';
  suggestedResponse: string;
  confidence: number;
}

export interface ConversationContext {
  customerId: number;
  customerName: string;
  recentMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  orderHistory?: any[];
   tenantStorage?: any;
}

// ========================================
// TRANSCRIPCIÓN DE AUDIO
// ========================================

/**
 * Descargar audio de WhatsApp usando su API
 */
async function downloadWhatsAppAudio(
  mediaId: string,
  accessToken: string
): Promise<Buffer> {
  try {
    console.log(`📥 Descargando audio de WhatsApp - Media ID: ${mediaId}`);
    
    // 1. Obtener URL del archivo
    const mediaUrlResponse = await axios.get(
      `https://graph.facebook.com/v23.0/${mediaId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    
    const mediaUrl = mediaUrlResponse.data.url;
    console.log(`🔗 URL de media obtenida: ${mediaUrl}`);
    
    // 2. Descargar el archivo de audio
    const audioResponse = await axios.get(mediaUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      responseType: 'arraybuffer'
    });
    
    console.log(`✅ Audio descargado - Tamaño: ${audioResponse.data.length} bytes`);
    return Buffer.from(audioResponse.data);
    
  } catch (error: any) {
    console.error('❌ Error descargando audio de WhatsApp:', error);
    throw new Error(`Error descargando audio: ${error.message}`);
  }
}

/**
 * Transcribir audio usando OpenAI Whisper
 */
async function transcribeAudio(audioBuffer: Buffer): Promise<TranscriptionResult> {
  try {
    console.log('🎙️ Transcribiendo audio con Whisper...');
    
    // Crear un stream desde el buffer
    const audioStream = Readable.from(audioBuffer);
    
    // Transcribir con Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: audioStream as any,
      model: 'whisper-1',
      language: 'es', // Español
      response_format: 'verbose_json'
    });
    
    console.log(`✅ Audio transcrito: "${transcription.text}"`);
    
    return {
      text: transcription.text,
      language: transcription.language,
      duration: transcription.duration
    };
    
  } catch (error: any) {
    console.error('❌ Error transcribiendo audio:', error);
    throw new Error(`Error en transcripción: ${error.message}`);
  }
}

/**
 * Procesar nota de voz completa (descargar + transcribir)
 */
export async function processVoiceNote(
  mediaId: string,
  accessToken: string
): Promise<TranscriptionResult> {
  try {
    // 1. Descargar audio
    const audioBuffer = await downloadWhatsAppAudio(mediaId, accessToken);
    
    // 2. Transcribir
    const transcription = await transcribeAudio(audioBuffer);
    
    return transcription;
    
  } catch (error: any) {
    console.error('❌ Error procesando nota de voz:', error);
    throw error;
  }
}

// ========================================
// INTERPRETACIÓN DE MENSAJES CON IA
// ========================================

/**
 * Interpretar intención y contexto del mensaje
 */
export async function interpretMessage(
  messageText: string,
  context?: ConversationContext
): Promise<MessageInterpretation> {
  try {
    console.log('🤖 Interpretando mensaje con IA...');
    
    const systemPrompt = `Eres un asistente de análisis de mensajes para un sistema de delivery.
Tu tarea es analizar mensajes de clientes y extraer:
1. Intención principal (order, question, complaint, greeting, other)
2. Categoría del mensaje
3. Entidades mencionadas (productos, cantidades, ubicaciones, teléfonos)
4. Sentimiento (positive, neutral, negative)
5. Sugerencia de respuesta apropiada
6. Nivel de confianza (0-1)

Responde SOLO con un JSON válido, sin texto adicional.`;

    const userPrompt = `Analiza este mensaje de cliente:
"${messageText}"

${context ? `
Contexto del cliente:
- Nombre: ${context.customerName}
- Mensajes recientes: ${context.recentMessages.length}
${context.orderHistory ? `- Órdenes previas: ${context.orderHistory.length}` : ''}
` : ''}

Responde con este formato JSON:
{
  "intent": "descripción corta de la intención",
  "category": "order|question|complaint|greeting|other",
  "entities": {
    "products": ["producto1", "producto2"],
    "quantity": 2,
    "location": "dirección si se menciona",
    "phoneNumber": "teléfono si se menciona"
  },
  "sentiment": "positive|neutral|negative",
  "suggestedResponse": "respuesta sugerida",
  "confidence": 0.95
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Modelo rápido y económico
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });
    
    const response = completion.choices[0].message.content;
    const interpretation: MessageInterpretation = JSON.parse(response || '{}');
    
    console.log('✅ Mensaje interpretado:', interpretation);
    return interpretation;
    
  } catch (error: any) {
    console.error('❌ Error interpretando mensaje:', error);
    
    // Retornar interpretación por defecto en caso de error
    return {
      intent: messageText,
      category: 'other',
      entities: {},
      sentiment: 'neutral',
      suggestedResponse: 'Gracias por tu mensaje. Un representante te atenderá pronto.',
      confidence: 0.5
    };
  }
}

/**
 * Generar respuesta inteligente basada en contexto
 */
export async function generateSmartResponse(
  messageText: string,
  interpretation: MessageInterpretation,
  context?: ConversationContext
): Promise<string> {
  try {
    console.log('🤖 Generando respuesta inteligente...');
    
    // Construir historial de conversación
    let conversationHistory = '';
    if (context?.recentMessages && context.recentMessages.length > 0) {
      conversationHistory = context.recentMessages
        .slice(-5) // Últimos 5 mensajes
        .map(msg => `${msg.role === 'user' ? 'Cliente' : 'Asistente'}: ${msg.content}`)
        .join('\n');
    }
    
    const systemPrompt = `Eres un asistente virtual amigable para un servicio de delivery en República Dominicana.
Características:
- Responde en español dominicano natural
- Sé amable pero profesional
- Usa emojis ocasionalmente
- Sé conciso (máximo 2-3 líneas)
- Si el cliente hace un pedido, confirma los productos y pide detalles de entrega
- Si hay duda, pide clarificación cortésmente`;

    const userPrompt = `Cliente dice: "${messageText}"

Interpretación:
- Intención: ${interpretation.intent}
- Categoría: ${interpretation.category}
- Sentimiento: ${interpretation.sentiment}
${interpretation.entities.products ? `- Productos mencionados: ${interpretation.entities.products.join(', ')}` : ''}

${conversationHistory ? `\nHistorial reciente:\n${conversationHistory}` : ''}

${context ? `\nDatos del cliente:
- Nombre: ${context.customerName}
${context.orderHistory?.length ? `- Ha realizado ${context.orderHistory.length} pedidos anteriores` : ''}` : ''}

Genera una respuesta apropiada:`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 150
    });
    
    const response = completion.choices[0].message.content || interpretation.suggestedResponse;
    
    console.log('✅ Respuesta generada:', response);
    return response;
    
  } catch (error: any) {
    console.error('❌ Error generando respuesta:', error);
    return interpretation.suggestedResponse;
  }
}

/**
 * Proceso completo: interpretar + generar respuesta
 */
export async function processTextMessage(
messageText: string, context?: ConversationContext, tenantStorage?: any): Promise<{
  interpretation: MessageInterpretation;
  suggestedResponse: string;
}> {
  try {
    // 1. Interpretar mensaje
    const interpretation = await interpretMessage(messageText, context);
    
    // 2. Generar respuesta inteligente
    const suggestedResponse = await generateSmartResponse(
      messageText,
      interpretation,
      context
    );
    
    return {
      interpretation,
      suggestedResponse
    };
    
  } catch (error: any) {
    console.error('❌ Error procesando mensaje de texto:', error);
    throw error;
  }
}

// ========================================
// FUNCIONES DE UTILIDAD
// ========================================

/**
 * Validar configuración de OpenAI
 */
export function validateAIConfiguration(): boolean {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY no está configurada');
    return false;
  }
  
  console.log('✅ Configuración de IA válida');
  return true;
}

/**
 * Obtener límites de uso de la API
 */
export async function getAPIUsage(): Promise<any> {
  try {
    // OpenAI no tiene un endpoint directo para esto
    // Puedes implementar tu propio tracking
    return {
      status: 'active',
      message: 'Tracking de uso no implementado'
    };
  } catch (error) {
    console.error('Error obteniendo uso de API:', error);
    return null;
  }
}
