import 'dotenv/config';
import {
  AICreditsManager,
  AIConversationManager,
  shouldUseAI
} from './ai-credits-manager';
import { interpretAIMessage } from './ai-order-assistant';
import { CartItem } from './ai-credits-schema';

interface MessageContext {
  isAfterWelcome?: boolean;
  isAfterCatalog?: boolean;
  expectedResponses?: string[];
  lastAutoResponse?: string;
  isHelpMode?: boolean;
}

const conversationContexts = new Map<string, MessageContext>();

export function markWelcomeSent(phoneNumber: string) {
  conversationContexts.set(phoneNumber, {
    isAfterWelcome: true,
    isAfterCatalog: false,
    lastAutoResponse: 'welcome'
  });
  console.log(`✅ [AI-SMART] Marcado: ${phoneNumber} recibió bienvenida`);
}

export function markCatalogSent(phoneNumber: string) {
  const context = conversationContexts.get(phoneNumber) || {};
  conversationContexts.set(phoneNumber, {
    ...context,
    isAfterCatalog: true,
    lastAutoResponse: 'catalog'
  });
  console.log(`✅ [AI-SMART] Marcado: ${phoneNumber} recibió catálogo`);
}

export function markHelpRequested(phoneNumber: string) {
  const context = conversationContexts.get(phoneNumber) || {};
  conversationContexts.set(phoneNumber, {
    ...context,
    isAfterWelcome: true,
    isAfterCatalog: false,
    lastAutoResponse: 'help',
    isHelpMode: true
  });
  console.log(`✅ [AI-SMART] Marcado: ${phoneNumber} solicitó ayuda - IA activada`);
}

export function getContext(phoneNumber: string): MessageContext {
  return conversationContexts.get(phoneNumber) || {};
}

export function clearContext(phoneNumber: string) {
  conversationContexts.delete(phoneNumber);
  console.log(`🧹 [AI-SMART] Contexto limpiado para ${phoneNumber}`);
}

// ===== Helpers de carrito =====

function addToCart(cart: CartItem[], product: any, quantity: number): CartItem[] {
  const existing = cart.find((item) => item.productId === product.id);
  if (existing) {
    existing.quantity += quantity;
    existing.totalPrice = existing.quantity * existing.unitPrice;
  } else {
    cart.push({
      productId: product.id,
      productName: product.name,
      quantity,
      unitPrice: Number(product.price),
      totalPrice: Number(product.price) * quantity
    });
  }
  return cart;
}

function getCartSummary(cart: CartItem[]) {
  const total = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const summaryLines = cart.map(
    (i) => `• ${i.productName} x${i.quantity} — RD$${i.totalPrice}`
  );
  return {
    formattedSummary: summaryLines.join('\n') + `\n\n💰 Total: RD$${total.toFixed(2)}`
  };
}

function generateAddedToCartMessage(item: CartItem, summary: any) {
  return `🛒 Agregaste ${item.productName} x${item.quantity}.\n${summary.formattedSummary}`;
}

function generateProductSuggestionMessage(searchQuery: string, matches: any[]) {
  if (!matches.length) return `No encontré resultados para "${searchQuery}".`;
  const suggestions = matches
    .slice(0, 5)
    .map((p) => `• ${p.name} — RD$${p.price}`)
    .join('\n');
  return `Encontré estos productos similares a "${searchQuery}":\n${suggestions}`;
}

function generateOrderConfirmationMessage(cart: CartItem[], customerName: string) {
  const summary = getCartSummary(cart);
  return `✅ ${customerName}, tu pedido está listo para confirmar:\n${summary.formattedSummary}\n\n¿Deseas proceder con la orden?`;
}

async function searchProductsWithAI(query: string, allProducts: any[]) {
  const q = query.toLowerCase();
  return allProducts.filter(
    (p: any) =>
      p.name?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q)
  );
}

// ===== Crear orden desde carrito IA =====

export async function createOrderFromAICart(
  cart: CartItem[],
  customerId: number,
  storeId: number,
  tenantStorage: any
): Promise<number | null> {
  try {
    console.log('📦 [AI-SMART] Creando orden desde carrito IA...');

    if (!cart || cart.length === 0) {
      console.error('❌ [AI-SMART] Carrito vacío');
      return null;
    }

    const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
    const order = await tenantStorage.createOrder({
      customerId,
      storeId,
      status: 'pending',
      subtotal,
      totalAmount: subtotal,
      source: 'whatsapp_ai',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    for (const item of cart) {
      await tenantStorage.createOrderItem({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice
      });
    }

    console.log(`✅ [AI-SMART] Orden creada: #${order.id}`);
    return order.id;
  } catch (error: any) {
    console.error('❌ [AI-SMART] Error creando orden IA:', error);

    try {
      await AICreditsManager.consumeCredits(storeId, 'order', {
        storeId,
        conversationId: 0,
        customerId,
        customerPhone: '',
        operationType: 'order_creation',
        creditsCost: 0,
        outputText: `❌ Error al crear orden: ${error.message}`,
        wasSuccessful: false
      });
    } catch (logErr) {
      console.error('Error registrando fallo en créditos:', logErr);
    }

    return null;
  }
}

// ===== Proceso principal IA =====

export interface AIProcessResult {
  handled: boolean;
  responseMessage?: string;
  shouldCreateOrder?: boolean;
  cart?: CartItem[];
  needsConfirmation?: boolean;
}

export async function tryProcessWithAI(
  messageText: string,
  phoneNumber: string,
  storeId: number,
  customerId: number,
  customerName: string,
  conversationId: number,
  tenantStorage: any
): Promise<AIProcessResult> {
  try {
    console.log('🤖 [AI-SMART] Intentando procesar con IA...');
    const context = getContext(phoneNumber);
    console.log('📋 [AI-SMART] Contexto actual:', context);

    const should = await shouldUseAI(
      storeId,
      messageText,
      context.isAfterWelcome,
      context.isAfterCatalog,
      context.isHelpMode,
      tenantStorage
    );
    if (!should) {
      console.log('⚠️ [AI-SMART] Condiciones no cumplidas para usar IA');
      return { handled: false };
    }

    const hasCredits = await AICreditsManager.hasCredits(storeId, 'message', tenantStorage);
    if (!hasCredits) {
      console.log('❌ [AI-SMART] Sin créditos disponibles');
      return { handled: true, responseMessage: 'Disculpa, nuestro sistema está en mantenimiento. Un agente te atenderá pronto.' };
    }

    let aiConversation = await AIConversationManager.getActiveConversation(storeId, conversationId);
    if (!aiConversation) {
      aiConversation = await AIConversationManager.startConversation(storeId, conversationId, customerId, phoneNumber);
    }
    if (!aiConversation) {
      console.error('❌ [AI-SMART] No se pudo iniciar conversación IA');
      return { handled: false };
    }

    const allProducts = await tenantStorage.getAllProducts();
    const activeProducts = allProducts.filter((p: any) => p.isActive);
    console.log(`📦 [AI-SMART] ${activeProducts.length} productos activos disponibles`);

    const interpretation = await interpretAIMessage(messageText, {
      storeId,
      customerId,
      token: process.env.STORE_BEARER_TOKEN!,
      apiBaseUrl: process.env.API_BASE_URL!
    });

    console.log('🧠 [AI-SMART] Interpretación IA:', {
      intent: interpretation.intent,
      itemsCount: interpretation.items?.length,
      message: interpretation.message
    });

    await AICreditsManager.consumeCredits(storeId, 'message', {
      storeId,
      conversationId,
      customerId,
      customerPhone: phoneNumber,
      operationType: 'message_analysis',
      creditsCost: 1,
      inputText: messageText,
      outputText: interpretation.message,
      interpretation: JSON.stringify(interpretation),
      confidence: interpretation.items?.[0]?.confidence || 1,
      wasSuccessful: true,
      modelUsed: 'gpt-4o-mini'
    });

    let currentCart = aiConversation.cartItems || [];

    switch (interpretation.intent) {
      case 'add_to_cart':
        for (const item of interpretation.items) {
          if (item.suggestedProduct) {
            currentCart = addToCart(currentCart, item.suggestedProduct, item.quantity);
            console.log(`✅ [AI-SMART] Agregado: ${item.suggestedProduct.name} x${item.quantity}`);
          }
        }
        await AIConversationManager.updateCart(storeId, conversationId, currentCart);
        return {
          handled: true,
          responseMessage: generateAddedToCartMessage(currentCart[currentCart.length - 1], getCartSummary(currentCart)),
          cart: currentCart
        };

      case 'search_product': {
        const query = interpretation.items[0]?.searchQuery || messageText;
        const matches = await searchProductsWithAI(query, activeProducts);
        return {
          handled: true,
          responseMessage: generateProductSuggestionMessage(query, matches),
          needsConfirmation: true
        };
      }

      case 'confirm_order':
        if (currentCart.length === 0) {
          return { handled: true, responseMessage: '🛒 Tu carrito está vacío. ¿Qué te gustaría pedir?' };
        } else {
          const orderId = await createOrderFromAICart(currentCart, customerId, storeId, tenantStorage);
          if (orderId) {
            await AICreditsManager.consumeCredits(storeId, 'order', {
              storeId,
              conversationId,
              customerId,
              customerPhone: phoneNumber,
              operationType: 'order_creation',
              creditsCost: 5,
              outputText: `Orden #${orderId} creada automáticamente desde WhatsApp`,
              wasSuccessful: true
            });
            clearContext(phoneNumber);
            return {
              handled: true,
              responseMessage: `✅ Tu pedido ha sido confirmado exitosamente. Número de orden: #${orderId}`,
              shouldCreateOrder: true,
              cart: []
            };
          } else {
            return { handled: true, responseMessage: '❌ Hubo un problema creando tu orden. Intenta nuevamente.' };
          }
        }

      case 'view_cart':
        return {
          handled: true,
          responseMessage: getCartSummary(currentCart).formattedSummary + '\n\n¿Deseas confirmar tu pedido? 😊'
        };

      default:
        return { handled: true, responseMessage: interpretation.message };
    }
  } catch (error: any) {
    console.error('❌ [AI-SMART] Error procesando con IA:', error);
    try {
      await tenantStorage.logAIUsage({
        storeId,
        conversationId,
        customerId,
        customerPhone: phoneNumber,
        operationType: 'error',
        creditsCost: 0,
        inputText: messageText,
        wasSuccessful: false,
        errorMessage: error.message
      });
    } catch (logError) {
      console.error('[AI-SMART] Error logging AI error:', logError);
    }
    return { handled: false };
  }
}

// Limpieza periódica (logs informativos)
setInterval(() => {
  console.log(`🧹 [AI-SMART] Cleanup: ${conversationContexts.size} contextos activos`);
}, 30 * 60 * 1000);
