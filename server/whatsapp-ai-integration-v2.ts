/**
 * WHATSAPP AI INTEGRATION V2
 *
 * Integración completa de IA en el flujo de WhatsApp.
 * Incluye:
 *  - Análisis inteligente de intención con IA
 *  - Consulta a catálogo real (tenantStorage)
 *  - Sugerencias de productos y manejo de carrito
 *  - Creación automática de órdenes
 *  - Gestión de créditos IA
 */

import { AICreditsManager, AIConversationManager, shouldUseAI } from "./ai-credits-manager";
import { interpretOrderMessage } from "./ai-order-analyzer";
import {
  addToCart,
  removeFromCart,
  updateQuantity,
  getCartSummary,
  generateAddedToCartMessage,
  generateOrderConfirmationMessage
} from "./ai-order-assistant";
import { CartItem } from "./ai-credits-schema";

// ========================================
// INTEGRACIÓN PRINCIPAL
// ========================================

export interface AIProcessResult {
  shouldContinue: boolean;
  responseMessage?: string;
  createOrder?: boolean;
  cart?: CartItem[];
  needsMoreInfo?: boolean;
}

/**
 * Procesar mensaje con IA (punto de entrada principal)
 */
export async function processMessageWithAI(
  messageText: string,
  storeId: number,
  conversationId: number,
  customerId: number,
  customerPhone: string,
  customerName: string,
  tenantStorage: any,
  context: {
    isAfterWelcome?: boolean;
    isAfterCatalog?: boolean;
    expectedResponses?: string[];
  } = {}
): Promise<AIProcessResult> {
  try {
    console.log("\n🤖 ========================================");
    console.log("   PROCESAMIENTO CON IA INICIADO");
    console.log("========================================");
    console.log(`📱 Cliente: ${customerPhone}`);
    console.log(`💬 Mensaje: "${messageText}"`);

    // ========================================
    // PASO 1: Verificar si debe usar IA
    // ========================================

    if (context.expectedResponses && context.expectedResponses.length > 0) {
      const messageLower = messageText.toLowerCase().trim();
      const matches = context.expectedResponses.some(expected =>
        messageLower === expected.toLowerCase() ||
        messageLower.includes(expected.toLowerCase())
      );

      if (matches) {
        console.log("✅ Respuesta esperada detectada - flujo normal");
        return { shouldContinue: true };
      }
    }

    const useAI = await shouldUseAI(
      storeId,
      messageText,
      context.isAfterWelcome,
      context.isAfterCatalog
    );

    if (!useAI) {
      console.log("⏭️ IA no aplicable - continuar flujo normal");
      return { shouldContinue: true };
    }

    // ========================================
    // PASO 2: Obtener o iniciar conversación IA
    // ========================================

    let aiConversation = await AIConversationManager.getActiveConversation(storeId, conversationId);

    if (!aiConversation) {
      aiConversation = await AIConversationManager.startConversation(
        storeId,
        conversationId,
        customerId,
        customerPhone
      );

      if (!aiConversation) {
        console.error("❌ No se pudo iniciar conversación IA");
        return { shouldContinue: true };
      }
    }

    // ========================================
    // PASO 3: Interpretar mensaje con IA
    // ========================================

    console.log("🧠 Analizando mensaje del cliente con IA de pedidos...");
    const interpretation = await interpretOrderMessage(messageText, tenantStorage, storeId);

    console.log(`🎯 Intención detectada: ${interpretation.intent}`);
    console.log(`📊 Confianza: ${(interpretation.confidence * 100).toFixed(0)}%`);

    // Consumir crédito por análisis
    await AICreditsManager.consumeCredits(storeId, "message", {
      operationType: "message_analysis",
      customerPhone,
      creditsCost: 1,
      inputText: messageText,
      outputText: interpretation.message,
      interpretation: JSON.stringify(interpretation),
      confidence: interpretation.confidence,
      wasSuccessful: true,
      storeId: 0
    }, tenantStorage);

    // ========================================
    // PASO 4: Procesar según intención
    // ========================================

    let cart = [...(aiConversation.cartItems || [])];
    let responseMessage = interpretation.message;
    let createOrder = false;
    let needsMoreInfo = false;

    switch (interpretation.intent) {
      case "order":
        console.log("🛒 Procesando pedido detectado");

        if (interpretation.items.length > 0) {
          for (const item of interpretation.items) {
            if (item.suggestedProduct) {
              cart = addToCart(cart, item.suggestedProduct, item.quantity);
              console.log(`✅ Agregado: ${item.suggestedProduct.name} x${item.quantity}`);
            }
          }

          await AIConversationManager.updateCart(storeId, conversationId, cart);
          const cartSummary = getCartSummary(cart);
          responseMessage = generateAddedToCartMessage(cart[cart.length - 1], cartSummary);
          createOrder = true;

          await AICreditsManager.consumeCredits(storeId, "order", {
            operationType: "order_creation",
            customerPhone,
            creditsCost: 5,
            inputText: messageText,
            outputText: responseMessage,
            wasSuccessful: true,
            storeId: 0
          }, tenantStorage);
        } else {
          responseMessage = interpretation.message;
        }
        break;

      case "question":
        console.log("❓ Pregunta general detectada");
        responseMessage = interpretation.message;
        break;

      case "catalog":
        console.log("📖 Sugiriendo catálogo");
        responseMessage = interpretation.message;
        break;

      case "greeting":
        console.log("👋 Saludo detectado");
        responseMessage = "¡Hola! 😊 ¿Te gustaría ver nuestro catálogo de productos?";
        break;

      default:
        console.log("❓ Intención desconocida");
        responseMessage = interpretation.message;
        break;
    }

    // ========================================
    // PASO 5: Retornar resultado
    // ========================================

    console.log("✅ Procesamiento IA completado");
    console.log("========================================\n");

    return {
      shouldContinue: !needsMoreInfo,
      responseMessage,
      createOrder,
      cart,
      needsMoreInfo
    };

  } catch (error: any) {
    console.error("❌ Error en procesamiento IA:", error);
    return {
      shouldContinue: true,
      responseMessage: "Disculpa, ocurrió un error. ¿Podrías repetir tu mensaje? 😊"
    };
  }
}

// ========================================
// FUNCIÓN DE INTEGRACIÓN EN WHATSAPP-SIMPLE.TS
// ========================================

export async function tryProcessWithAI(
  messageText: string,
  storeMapping: any,
  conversation: any,
  customer: any,
  tenantStorage: any,
  context: {
    isAfterWelcome?: boolean;
    isAfterCatalog?: boolean;
    expectedResponses?: string[];
  }
): Promise<{
  handled: boolean;
  responseMessage?: string;
  shouldCreateOrder?: boolean;
  cart?: CartItem[];
}> {
  try {
    const result = await processMessageWithAI(
      messageText,
      storeMapping.storeId,
      conversation.id,
      customer.id,
      customer.phone,
      customer.name,
      tenantStorage,
      context
    );

    if (result.shouldContinue) {
      return { handled: false };
    }

    return {
      handled: true,
      responseMessage: result.responseMessage,
      shouldCreateOrder: result.createOrder,
      cart: result.cart
    };
  } catch (error) {
    console.error("Error en tryProcessWithAI:", error);
    return { handled: false };
  }
}

// ========================================
// CREAR ORDEN DESDE CARRITO
// ========================================

export async function createOrderFromCart(
  cart: CartItem[],
  customer: any,
  storeId: number,
  tenantStorage: any
): Promise<any> {
  try {
    console.log("📦 Creando orden desde carrito IA...");

    const cartSummary = getCartSummary(cart);

    const order = await tenantStorage.createOrder(
      {
        customerId: customer.id,
        totalAmount: cartSummary.totalAmount.toString(),
        status: "pending",
        notes: "Creado mediante asistente IA",
        storeId: storeId
      },
      cart.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
        totalPrice: item.totalPrice.toString()
      }))
    );

    console.log(`✅ Orden creada - ID: ${order.id}, Número: ${order.orderNumber}`);
    return order;
  } catch (error: any) {
    console.error("❌ Error creando orden:", error);
    throw error;
  }
}
