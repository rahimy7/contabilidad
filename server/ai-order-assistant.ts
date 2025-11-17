/**
 * AI ORDER ASSISTANT
 *
 * Interpreta los mensajes del cliente, busca productos y crea la orden si se confirma.
 * Usa la misma lógica de whatsapp-simple.ts para crear pedidos reales.
 */
import { searchProducts } from './ai-product-search';
import { createOrderFromAI } from './ai-order-creator';
import { interpretMessage } from './ai-service';

interface Product {
  id: number;
  name: string;
  description: string;
  price: string;
  category: string;
  brand?: string;
  isActive: boolean;
}

interface OrderInterpretationItem {
  searchQuery: string;
  suggestedProduct?: Product;
  quantity: number;
  confidence: number;
}
export interface OrderInterpretation {
  intent:
    | "add_to_cart"
    | "confirm_order"
    | "ask_question"
    | "search_product"
    | "other";

  items: Array<{
    productId?: number;
    productName?: string;
    searchQuery?: string;
    suggestedProduct?: Product;
    quantity: number;
    confidence?: number;
  }>;

  message: string;
  confidence: number;
}



interface AIContext {
  storeId: number;
  customerId: number;
  token: string;
  apiBaseUrl: string;
  tenantStorage?: any; 
}

/**
 * Analizar mensaje con IA real usando OpenAI GPT-4o-mini
 * Extrae productos, cantidades e intención del mensaje
 */
async function analyzeMessageWithAI(message: string, context?: AIContext, recentMessages: any[] = []): Promise<OrderInterpretation> {
  try {
    console.log(`🤖 [AI-ASSISTANT] Analizando mensaje: "${message}"`);

    // Usar interpretMessage real de ai-service
    const interpretation = await interpretMessage(message, context ? {
      customerId: context.customerId,
      customerName: `Customer ${context.customerId}`,
      recentMessages: recentMessages
    } : undefined);

    console.log(`✅ [AI-ASSISTANT] Interpretación obtenida:`, interpretation);

    // Mapear categoría a intención
    let intent: 'add_to_cart' | 'confirm_order' | 'ask_question' | 'search_product' | 'other' = 'search_product';

    // ✅ DETECTAR CONFIRMACIONES: "Si", "Si procede", "Confirmar", etc.
    const confirmationKeywords = ['si', 'sí', 'yes', 'confirmar', 'confirm', 'procede', 'proceder', 'ok', 'vale', 'adelante'];
    const isConfirmation = confirmationKeywords.some(keyword => message.toLowerCase().includes(keyword));

    if (interpretation.intent === 'confirm order' || (interpretation.category === 'order' && isConfirmation)) {
      intent = 'confirm_order';
    } else if (interpretation.category === 'order' && interpretation.entities.products?.length) {
      intent = 'add_to_cart';
    } else if (interpretation.category === 'question') {
      intent = 'ask_question';
    } else if (interpretation.category === 'greeting') {
      intent = 'other';
    }

    // Construir items desde productos mencionados
    const items = interpretation.entities.products?.map(product => ({
      searchQuery: product,
      quantity: interpretation.entities.quantity || 1,
      confidence: interpretation.confidence
    })) || [{ searchQuery: message, quantity: 1, confidence: interpretation.confidence }];

    return {
      intent,
      items,
      message: interpretation.suggestedResponse,
      confidence: interpretation.confidence
    };

  } catch (error: any) {
    console.error(`❌ [AI-ASSISTANT] Error analizando mensaje:`, error);

    // Fallback: buscar producto por palabras clave
    return {
      intent: 'search_product',
      items: [{ searchQuery: message, quantity: 1, confidence: 0.5 }],
      message: `No pude analizar el mensaje correctamente. ¿Podrías especificar qué producto deseas?`,
      confidence: 0.5
    };
  }
}

export async function interpretAIMessage(message: string, context: AIContext, recentMessages: any[] = []) {
  const { storeId, customerId, token, apiBaseUrl } = context;

  const interpretation = await analyzeMessageWithAI(message, context, recentMessages);

  switch (interpretation.intent) {
    case 'search_product':
    case 'add_to_cart': {
      for (const item of interpretation.items) {
        const found: Product[] = await searchProducts(item.searchQuery, storeId);
        if (Array.isArray(found) && found.length > 0) {
          const product = found[0];
          item.suggestedProduct = product;
          interpretation.message = `Encontré ${product.name} a RD$${product.price}. ¿Deseas agregarlo al pedido?`;
        } else {
          interpretation.message = `No encontré resultados para "${item.searchQuery}". ¿Podrías especificar más?`;
        }
      }
      break;
    }

    case 'confirm_order': {
      const validItems = interpretation.items.filter(i => i.suggestedProduct?.id);
      if (validItems.length === 0) {
        interpretation.message = 'No hay productos en tu carrito. Escribe lo que deseas pedir.';
        return interpretation;
      }

      const payload = {
        customerId,
        items: validItems.map(p => ({
          productId: p.suggestedProduct!.id,
          quantity: p.quantity || 1,
          unitPrice: Number(p.suggestedProduct!.price) || 0,
          totalPrice: (Number(p.suggestedProduct!.price) || 0) * (p.quantity || 1)
        })),
        notes: 'Pedido generado automáticamente por IA desde WhatsApp',
        paymentMethod: 'cash'
      };

      const order = await createOrderFromAI(token, apiBaseUrl, payload);
      interpretation.message = `✅ Tu pedido fue confirmado correctamente. Número de orden: ${order.id}`;
      break;
    }

    default:
      interpretation.message ||= 'No entendí tu solicitud, ¿podrías repetirla?';
  }

  return interpretation;
}
