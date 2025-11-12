/**
 * AI ORDER ASSISTANT
 *
 * Interpreta los mensajes del cliente, busca productos y crea la orden si se confirma.
 * Usa la misma lógica de whatsapp-simple.ts para crear pedidos reales.
 */

import { searchProducts } from './ai-product-search';
import { createOrderFromAI } from './ai-order-creator';

interface Product {
  id: number;
  name: string;
  description: string;
  price: string;
  category: string;
  brand?: string;
  isActive: boolean;
}

interface OrderItem {
  searchQuery: string;
  suggestedProduct?: Product;
  quantity: number;
  confidence: number;
}

interface OrderInterpretation {
  intent:
    | 'add_to_cart'
    | 'remove_from_cart'
    | 'modify_quantity'
    | 'confirm_order'
    | 'view_cart'
    | 'search_product'
    | 'ask_question';
  items: OrderItem[];
  message: string;
}

interface AIContext {
  storeId: number;
  customerId: number;
  token: string;
  apiBaseUrl: string;
}

/**
 * Ejemplo: simulación temporal hasta integrar tu IA real (OpenAI o Gemini)
 */
async function analyzeMessageWithAI(message: string): Promise<OrderInterpretation> {
  return {
    intent: 'search_product',
    items: [{ searchQuery: message, quantity: 1, confidence: 0.9 }],
    message: `Buscando producto para: ${message}`,
  };
}

export async function interpretAIMessage(message: string, context: AIContext) {
  const { storeId, customerId, token, apiBaseUrl } = context;

  const interpretation = await analyzeMessageWithAI(message);

  switch (interpretation.intent) {
    case 'search_product':
    case 'add_to_cart': {
      for (const item of interpretation.items) {
        // ✅ Aseguramos tipado correcto
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
      const validItems = interpretation.items.filter((i) => i.suggestedProduct?.id);
      if (validItems.length === 0) {
        interpretation.message =
          'No hay productos en tu carrito. Escribe lo que deseas pedir.';
        return interpretation;
      }

      const payload = {
        customerId,
        items: validItems.map((p) => ({
          productId: p.suggestedProduct!.id,
          quantity: p.quantity || 1,
          unitPrice: Number(p.suggestedProduct!.price) || 0,
          totalPrice: (Number(p.suggestedProduct!.price) || 0) * (p.quantity || 1),
        })),
        notes: 'Pedido generado automáticamente por IA desde WhatsApp',
        paymentMethod: 'cash',
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
