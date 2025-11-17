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

${context && context.recentMessages.length > 0 ? `
Contexto del cliente:
- Nombre: ${context.customerName}
${context.orderHistory ? `- Órdenes previas: ${context.orderHistory.length}` : ''}

HISTORIAL DE CONVERSACIÓN RECIENTE (usa esto para entender el contexto):
${context.recentMessages.map((msg, idx) =>
  `${idx + 1}. ${msg.role === 'user' ? 'Cliente' : 'Asistente'}: "${msg.content}"`
).join('\n')}

IMPORTANTE: Usa el historial para entender referencias a productos mencionados anteriormente.
Por ejemplo, si el cliente dijo "Un renuvo" y ahora dice "Quiero 3", debes interpretar que quiere 3 unidades de renuvo.
` : context ? `
Contexto del cliente:
- Nombre: ${context.customerName}
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
 * 🔍 Buscar productos similares en el catálogo real
 */
function findMatchingProducts(query: string, availableProducts: any[]): any[] {
  if (!query || !availableProducts || availableProducts.length === 0) return [];

  const queryLower = query.toLowerCase().trim();

  // Búsqueda exacta o parcial por nombre y descripción
  return availableProducts.filter(p =>
    p.name?.toLowerCase().includes(queryLower) ||
    p.description?.toLowerCase().includes(queryLower) ||
    p.category?.toLowerCase().includes(queryLower)
  );
}

/**
 * ✨ NUEVA FUNCIÓN: Generar respuesta como AGENTE DE VENTAS
 * SOLO usa datos REALES de la base de datos, nunca inventa
 */
export async function generateSalesAgentResponse(
  messageText: string,
  interpretation: MessageInterpretation,
  availableProducts?: any[],
  context?: ConversationContext
): Promise<string> {
  try {
    console.log('🤖 [SALES-AGENT] Generando respuesta de vendedor con datos REALES...');

    // 1️⃣ BUSCAR PRODUCTOS REALES que el cliente preguntó
    let matchedProducts: any[] = [];
    let recommendedProducts: any[] = [];

    console.log(`📊 [SALES-AGENT] Productos disponibles en catálogo: ${availableProducts?.length || 0}`);
    if (availableProducts && availableProducts.length > 0) {
      console.log(`📦 [SALES-AGENT] Listado de productos:`);
      availableProducts.forEach((p: any, idx: number) => {
        console.log(`   ${idx + 1}. ${p.name} - RD$${p.price} (${p.category})`);
      });
    }

    if (interpretation.entities.products && interpretation.entities.products.length > 0) {
      console.log(`🔍 [SALES-AGENT] Cliente busca: ${interpretation.entities.products.join(', ')}`);
      // Buscar cada producto mencionado
      for (const productQuery of interpretation.entities.products) {
        const matches = findMatchingProducts(productQuery, availableProducts || []);
        console.log(`   → Búsqueda de "${productQuery}": ${matches.length} coincidencia(s)`);
        matchedProducts.push(...matches);
      }
    }

    // Si no hay coincidencia exacta, sugerir productos del catálogo
    if (matchedProducts.length === 0 && availableProducts && availableProducts.length > 0) {
      console.log(`⚠️ [SALES-AGENT] Sin coincidencia exacta - Usando primeros 3 productos del catálogo`);
      recommendedProducts = availableProducts.slice(0, 3);
    }

    // 2️⃣ CONSTRUIR CATÁLOGO CON DATOS REALES
    let productCatalog = '\n\n📦 CATÁLOGO DE LA TIENDA:\n';
    const productsToShow = matchedProducts.length > 0 ? matchedProducts : recommendedProducts;

    if (productsToShow.length > 0) {
      productsToShow.forEach(p => {
        const price = p.price || 'No especificado';
        const category = p.category || 'General';
        const description = p.description ? ` - ${p.description}` : '';
        productCatalog += `✓ ${p.name}: RD$${price} (${category})${description}\n`;
      });
    } else {
      productCatalog = '\n\n⚠️ CATÁLOGO VACÍO: No hay productos disponibles en este momento.';
    }

    // Determinar si hay productos disponibles
    const hasProducts = productsToShow.length > 0;

    let systemPrompt: string;

    if (hasProducts) {
      systemPrompt = `Eres un AGENTE DE VENTAS profesional para una tienda en República Dominicana.

🎯 REGLA FUNDAMENTAL: SOLO recomienda y habla de productos reales que están en el catálogo.
⚠️ NUNCA inventes nombres de productos, precios o especificaciones.
✅ SIEMPRE usa datos exactos de la tienda.

CARACTERÍSTICAS:
✓ Vendedor real, no asistente genérico
✓ Entusiasta sobre productos reales
✓ Responde en español dominicano natural
✓ Cierra vendiendo (máximo 3-4 líneas)
✓ Si no tienes producto exacto, ofrece alternativas reales

INSTRUCCIONES DE RESPUESTA:
1. SI EL CLIENTE PREGUNTA POR UN PRODUCTO:
   - Confirma si existe en nuestro catálogo
   - Usa NOMBRE, PRECIO y DESCRIPCIÓN reales
   - Pregunta cantidad y cierra la venta

2. SI NO EXISTE EL PRODUCTO EXACTO:
   - Ofrece alternativas REALES del catálogo abajo
   - Explica por qué pueden interesarle

3. SI PREGUNTA POR DISPONIBILIDAD:
   - Responde basándote SOLO en el catálogo real
   - Nunca digas que tenemos algo que no está en la lista

${productCatalog}`;
    } else {
      systemPrompt = `Eres un AGENTE DE SERVICIO AL CLIENTE profesional para una tienda en República Dominicana.

⚠️ SITUACIÓN CRÍTICA: ${productCatalog}

REGLAS ESTRICTAS:
❌ NUNCA sugieras productos (aunque sean creíbles)
❌ NUNCA menciones "alternativas" que no sean reales
❌ NUNCA inventes marcas, modelos o categorías de productos
✅ Solo reconoce la solicitud del cliente
✅ Sé honesto: "No contamos con eso en este momento"
✅ Ofrece contacto directo para más información

Tu objetivo es SERVIR AL CLIENTE con honestidad, no vender lo que no existe.`;
    }

    const userPrompt = `Cliente dice: "${messageText}"

DATOS DEL CLIENTE:
- Intención: ${interpretation.intent}
- Busca: ${interpretation.entities.products?.join(', ') || 'No especificado'}
- Cantidad: ${interpretation.entities.quantity || 'No especificada'}
- Sentimiento: ${interpretation.sentiment}

PRODUCTOS ENCONTRADOS EN NUESTRO CATÁLOGO:
${matchedProducts.length > 0
  ? matchedProducts.map(p => `✓ ${p.name}: RD$${p.price}`).join('\n')
  : 'No hay coincidencia exacta'}

${hasProducts
  ? 'Responde como VENDEDOR usando SOLO los datos reales anteriores. Sé entusiasta pero honesto:'
  : 'Responde como AGENTE DE SERVICIO al CLIENTE. Sé honesto y cortés. NO sugieras productos:'}`;

    console.log(`\n📤 [SALES-AGENT] ENVIANDO A OPENAI:`);
    console.log(`   Productos que se envían: ${productsToShow.length > 0 ? productsToShow.map((p: any) => p.name).join(', ') : 'NINGUNO'}`);
    console.log(`   Modo: ${hasProducts ? 'VENDEDOR (con productos)' : 'SERVICIO (sin productos)'}`);
    console.log(`   Prompt resumido: ${userPrompt.substring(0, 150)}...`);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 200
    });

    const response = completion.choices[0].message.content || interpretation.suggestedResponse;
    console.log(`\n✅ [SALES-AGENT] RESPUESTA GENERADA:\n${response}`);
    return response;

  } catch (error: any) {
    console.error('❌ [SALES-AGENT] Error generando respuesta:', error);
    return interpretation.suggestedResponse;
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
