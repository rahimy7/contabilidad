/**
 * WHATSAPP SMART AI - Detección inteligente de flujo
 *
 * Integra IA en WhatsApp para procesar pedidos de forma inteligente
 * Solo se activa después de bienvenida o catálogo si usuario no responde opciones esperadas
 */

import 'dotenv/config';
import { AICreditsManager, AIConversationManager, shouldUseAI } from './ai-credits-manager';
import {
  interpretOrderMessage,
  searchProductsWithAI,
  addToCart,
  getCartSummary,
  generateAddedToCartMessage,
  generateProductSuggestionMessage,
  generateOrderConfirmationMessage
} from './ai-order-assistant';
import { CartItem } from './ai-credits-schema';

// ========================================
// CONTEXTO DE CONVERSACIÓN
// ========================================

interface MessageContext {
  isAfterWelcome?: boolean;
  isAfterCatalog?: boolean;
  expectedResponses?: string[];
  lastAutoResponse?: string;
  isHelpMode?: boolean;  // ✅ Nuevo: indica si el usuario pidió ayuda
}

// Mapa de contextos por teléfono (en producción usar Redis o DB)
const conversationContexts = new Map<string, MessageContext>();

/**
 * Registrar que se envió mensaje de bienvenida
 */
export function markWelcomeSent(phoneNumber: string) {
  conversationContexts.set(phoneNumber, {
    isAfterWelcome: true,
    isAfterCatalog: false,
    lastAutoResponse: 'welcome'
  });
  console.log(`✅ [AI-SMART] Marcado: ${phoneNumber} recibió bienvenida`);
}

/**
 * Registrar que se envió catálogo
 */
export function markCatalogSent(phoneNumber: string) {
  const context = conversationContexts.get(phoneNumber) || {};
  conversationContexts.set(phoneNumber, {
    ...context,
    isAfterCatalog: true,
    lastAutoResponse: 'catalog'
  });
  console.log(`✅ [AI-SMART] Marcado: ${phoneNumber} recibió catálogo`);
}

/**
 * Registrar que se solicitó ayuda (Obtener Ayuda)
 * Activa la IA para responder a consultas de ayuda
 */
export function markHelpRequested(phoneNumber: string) {
  const context = conversationContexts.get(phoneNumber) || {};
  conversationContexts.set(phoneNumber, {
    ...context,
    isAfterWelcome: true,  // Activar IA como si fuera después de bienvenida
    isAfterCatalog: false,
    lastAutoResponse: 'help',
    isHelpMode: true  // Bandero especial para saber que el usuario pidió ayuda
  });
  console.log(`✅ [AI-SMART] Marcado: ${phoneNumber} solicitó ayuda - IA activada para responder`);
}

/**
 * Obtener contexto actual
 */
export function getContext(phoneNumber: string): MessageContext {
  return conversationContexts.get(phoneNumber) || {};
}

/**
 * Limpiar contexto (después de orden creada o timeout)
 */
export function clearContext(phoneNumber: string) {
  conversationContexts.delete(phoneNumber);
  console.log(`🧹 [AI-SMART] Contexto limpiado para ${phoneNumber}`);
}

// ========================================
// PROCESAMIENTO CON IA
// ========================================

export interface AIProcessResult {
  handled: boolean;
  responseMessage?: string;
  shouldCreateOrder?: boolean;
  cart?: CartItem[];
  needsConfirmation?: boolean;
}

/**
 * Intentar procesar mensaje con IA
 * Solo se activa si:
 * 1. Hay créditos disponibles
 * 2. Está después de bienvenida o catálogo
 * 3. Usuario no respondió con opciones esperadas
 */
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

    // 1. Obtener contexto
    const context = getContext(phoneNumber);
    console.log('📋 [AI-SMART] Contexto:', context);

    // 2. Decidir si usar IA
    const shouldUse = await shouldUseAI(
      storeId,
      messageText,
      context.isAfterWelcome,
      context.isAfterCatalog,
      context.isHelpMode,  // ✅ Pasar el modo de ayuda
      tenantStorage  // ✅ Pasar tenantStorage para tenant-aware credits check
    );

    if (!shouldUse) {
      console.log('⚠️ [AI-SMART] No se cumplieron condiciones para usar IA');
      return { handled: false };
    }

    // 3. Verificar créditos disponibles
    const hasCredits = await AICreditsManager.hasCredits(storeId, 'message', tenantStorage);
    if (!hasCredits) {
      console.log('❌ [AI-SMART] Sin créditos disponibles');
      return {
        handled: true,
        responseMessage: 'Disculpa, nuestro sistema está en mantenimiento. Un agente te atenderá pronto.'
      };
    }

    // 4. Iniciar o recuperar conversación AI
    let aiConversation = await AIConversationManager.getActiveConversation(storeId, conversationId);

    if (!aiConversation) {
      aiConversation = await AIConversationManager.startConversation(
        storeId,
        conversationId,
        customerId,
        phoneNumber
      );
    }

    if (!aiConversation) {
      console.error('❌ [AI-SMART] No se pudo iniciar conversación AI');
      return { handled: false };
    }

    // 5. Obtener productos disponibles
    const allProducts = await tenantStorage.getAllProducts();
    const activeProducts = allProducts.filter((p: any) => p.isActive);
    console.log(`📦 [AI-SMART] ${activeProducts.length} productos activos disponibles`);

    // 6. Interpretar mensaje con IA
    const interpretation = await interpretOrderMessage(
      messageText,
      aiConversation.cartItems || [],
      activeProducts
    );

    console.log('🧠 [AI-SMART] Interpretación IA:', {
      intent: interpretation.intent,
      itemsCount: interpretation.items.length,
      confidence: interpretation.confidence
    });

    // 7. Consumir créditos
    await AICreditsManager.consumeCredits(storeId, 'message', {
      conversationId,
      customerId,
      customerPhone: phoneNumber,
      operationType: 'message_analysis', // Usar tipo válido
      creditsCost: 1, // Se establece en consumeCredits
      inputText: messageText,
      outputText: interpretation.message,
      interpretation: JSON.stringify(interpretation),
      confidence: interpretation.confidence,
      wasSuccessful: true,
      modelUsed: 'gpt-4o-mini'
    });

    // 8. Procesar según intención
    let currentCart = aiConversation.cartItems || [];

    switch (interpretation.intent) {
      case 'add_to_cart':
        // Agregar productos al carrito
        for (const item of interpretation.items) {
          if (item.suggestedProduct) {
            currentCart = addToCart(currentCart, item.suggestedProduct, item.quantity);
            console.log(`✅ [AI-SMART] Agregado: ${item.suggestedProduct.name} x${item.quantity}`);
          }
        }

        // Actualizar carrito en conversación
        await AIConversationManager.updateCart(storeId, conversationId, currentCart);

        // Generar mensaje de confirmación
        const cartSummary = getCartSummary(currentCart);
        const addedItem = currentCart[currentCart.length - 1];
        const confirmationMsg = generateAddedToCartMessage(addedItem, cartSummary);

        return {
          handled: true,
          responseMessage: confirmationMsg,
          cart: currentCart,
          needsConfirmation: false
        };

      case 'search_product':
        // Buscar productos
        const searchQuery = interpretation.items[0]?.searchQuery || messageText;
        const matches = await searchProductsWithAI(searchQuery, activeProducts);

        const suggestionMsg = generateProductSuggestionMessage(searchQuery, matches);

        return {
          handled: true,
          responseMessage: suggestionMsg,
          needsConfirmation: true
        };

      case 'confirm_order':
        // Confirmar orden
        if (currentCart.length === 0) {
          return {
            handled: true,
            responseMessage: '🛒 Tu carrito está vacío. ¿Qué te gustaría pedir?'
          };
        }

        const finalMsg = generateOrderConfirmationMessage(currentCart, customerName);

        return {
          handled: true,
          responseMessage: finalMsg,
          shouldCreateOrder: true,
          cart: currentCart
        };

      case 'view_cart':
        // Ver carrito
        const summary = getCartSummary(currentCart);
        return {
          handled: true,
          responseMessage: summary.formattedSummary + '\n\n¿Deseas confirmar tu pedido? 😊'
        };

      case 'remove_from_cart':
      case 'modify_quantity':
        // Por ahora solo mostrar mensaje de IA
        return {
          handled: true,
          responseMessage: interpretation.message
        };

      case 'ask_question':
      default:
        // Preguntas generales
        return {
          handled: true,
          responseMessage: interpretation.message
        };
    }

  } catch (error: any) {
    console.error('❌ [AI-SMART] Error procesando con IA:', error);

    // Registrar error en logs
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

/**
 * Crear orden desde carrito AI
 */
export async function createOrderFromAICart(
  cart: CartItem[],
  customerId: number,
  storeId: number,
  tenantStorage: any
): Promise<number | null> {
  try {
    console.log('📦 [AI-SMART] Creando orden desde carrito AI...');

    if (cart.length === 0) {
      console.error('❌ [AI-SMART] Carrito vacío');
      return null;
    }

    // Calcular total
    const subtotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
    const total = subtotal; // Aquí podrías agregar delivery, impuestos, etc.

    // Crear orden
    const order = await tenantStorage.createOrder({
      customerId,
      storeId,
      status: 'pending',
      subtotal,
      totalAmount: total,
      source: 'whatsapp_ai',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log(`✅ [AI-SMART] Orden creada: #${order.id}`);

    // Crear items de la orden
    for (const item of cart) {
      await tenantStorage.createOrderItem({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice
      });
    }

    console.log(`✅ [AI-SMART] ${cart.length} items agregados a la orden`);

    // Consumir créditos por creación de orden
    await AICreditsManager.consumeCredits(storeId, 'order', {
      conversationId: 0,
      customerId,
      customerPhone: '',
      operationType: 'order_creation', // Usar tipo válido
      creditsCost: 5, // Se establece en consumeCredits
      outputText: `Orden #${order.id} creada con ${cart.length} items`,
      wasSuccessful: true
    });

    return order.id;

  } catch (error) {
    console.error('❌ [AI-SMART] Error creando orden desde AI:', error);
    return null;
  }
}

// Limpiar contextos viejos cada 30 minutos
setInterval(() => {
  const now = Date.now();
  console.log(`🧹 [AI-SMART] Cleanup: ${conversationContexts.size} contextos activos`);
}, 30 * 60 * 1000);
