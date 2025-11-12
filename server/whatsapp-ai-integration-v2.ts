/**
 * WHATSAPP AI INTEGRATION V2
 *
 * Integración completa de IA en el flujo de WhatsApp
 * Con gestión de créditos, carritos y pedidos inteligentes
 */

import { AICreditsManager, AIConversationManager, shouldUseAI } from './ai-credits-manager';
import {
  interpretOrderMessage,
  addToCart,
  removeFromCart,
  updateQuantity,
  getCartSummary,
  generateAddedToCartMessage,
  generateProductSuggestionMessage,
  generateOrderConfirmationMessage,
  searchProductsWithAI,
  looksLikeOrder,
  hasHighConfidence
} from './ai-order-assistant';
import { CartItem } from './ai-credits-schema';

// ========================================
// INTEGRACIÓN PRINCIPAL
// ========================================

export interface AIProcessResult {
  shouldContinue: boolean;    // Si debe continuar con el flujo normal
  responseMessage?: string;    // Mensaje para enviar al cliente
  createOrder?: boolean;       // Si debe crear la orden
  cart?: CartItem[];           // Carrito actualizado
  needsMoreInfo?: boolean;     // Si necesita más información del cliente
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
    expectedResponses?: string[]; // Respuestas esperadas del flujo normal
  } = {}
): Promise<AIProcessResult> {
  try {
    console.log('\n🤖 ========================================');
    console.log('   PROCESAMIENTO CON IA INICIADO');
    console.log('========================================');
    console.log(`📱 Cliente: ${customerPhone}`);
    console.log(`💬 Mensaje: "${messageText}"`);

    // ========================================
    // PASO 1: Verificar si debe usar IA
    // ========================================

    // Si el mensaje coincide con respuestas esperadas, no usar IA
    if (context.expectedResponses && context.expectedResponses.length > 0) {
      const messageLower = messageText.toLowerCase().trim();
      const matches = context.expectedResponses.some(expected =>
        messageLower === expected.toLowerCase() ||
        messageLower.includes(expected.toLowerCase())
      );

      if (matches) {
        console.log('✅ Respuesta esperada detectada - flujo normal');
        return { shouldContinue: true };
      }
    }

    // Verificar si debe usar IA
    const useAI = await shouldUseAI(
      storeId,
      messageText,
      context.isAfterWelcome,
      context.isAfterCatalog
    );

    if (!useAI) {
      console.log('⏭️ IA no aplicable - continuar flujo normal');
      return { shouldContinue: true };
    }

    // ========================================
    // PASO 2: Iniciar/obtener conversación IA
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
        console.error('❌ No se pudo iniciar conversación IA');
        return { shouldContinue: true };
      }
    }

    // ========================================
    // PASO 3: Obtener productos disponibles
    // ========================================

    const allProducts = await tenantStorage.getAllProducts();
    const activeProducts = allProducts.filter((p: any) => p.isActive);

    console.log(`📦 Productos disponibles: ${activeProducts.length}`);

    // ========================================
    // PASO 4: Interpretar mensaje
    // ========================================

    const interpretation = await interpretOrderMessage(
      messageText,
      aiConversation.cartItems || [],
      activeProducts
    );

    console.log(`🎯 Intención detectada: ${interpretation.intent}`);
    console.log(`📊 Confianza: ${(interpretation.confidence * 100).toFixed(0)}%`);

    // Consumir crédito por análisis de mensaje
    await AICreditsManager.consumeCredits(storeId, 'message', {
      operationType: 'message_analysis',
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
    // PASO 5: Procesar según intención
    // ========================================

    let cart = [...(aiConversation.cartItems || [])];
    let responseMessage = interpretation.message;
    let createOrder = false;
    let needsMoreInfo = false;

    switch (interpretation.intent) {
      // ────────────────────────────────────
      // AGREGAR AL CARRITO
      // ────────────────────────────────────
      case 'add_to_cart':
        console.log('➕ Procesando: AGREGAR AL CARRITO');

        if (interpretation.items.length === 0) {
          responseMessage = '¿Qué te gustaría ordenar? 😊';
          break;
        }

        for (const item of interpretation.items) {
          if (item.suggestedProduct) {
            // Producto encontrado - agregar al carrito
            cart = addToCart(cart, item.suggestedProduct, item.quantity);

            console.log(`✅ Agregado: ${item.suggestedProduct.name} x${item.quantity}`);

            const cartSummary = getCartSummary(cart);
            responseMessage = generateAddedToCartMessage(
              cart[cart.length - 1],
              cartSummary
            );

            // Consumir crédito por operación de orden
            await AICreditsManager.consumeCredits(storeId, 'order', {
              operationType: 'order_creation',
              customerPhone,
              creditsCost: 5,
              inputText: messageText,
              outputText: responseMessage,
              wasSuccessful: true,
              storeId: 0
            });
          } else {
            // Producto no encontrado - buscar y sugerir
            const matches = await searchProductsWithAI(item.searchQuery, activeProducts);

            if (matches.length > 0) {
              responseMessage = generateProductSuggestionMessage(item.searchQuery, matches);
            } else {
              responseMessage = `No encontré "${item.searchQuery}" en nuestro catálogo. ¿Podrías describirlo de otra forma? 😊`;
            }
          }
        }

        // Actualizar carrito en conversación
        await AIConversationManager.updateCart(storeId, conversationId, cart);
        break;

      // ────────────────────────────────────
      // QUITAR DEL CARRITO
      // ────────────────────────────────────
      case 'remove_from_cart':
        console.log('➖ Procesando: QUITAR DEL CARRITO');

        if (interpretation.items.length > 0 && interpretation.items[0].suggestedProduct) {
          cart = removeFromCart(cart, interpretation.items[0].suggestedProduct.id);
          await AIConversationManager.updateCart(storeId, conversationId, cart);

          const cartSummary = getCartSummary(cart);
          responseMessage = `✅ Producto eliminado.\n\n${cartSummary.formattedSummary}`;
        }
        break;

      // ────────────────────────────────────
      // MODIFICAR CANTIDAD
      // ────────────────────────────────────
      case 'modify_quantity':
        console.log('🔄 Procesando: MODIFICAR CANTIDAD');

        if (interpretation.items.length > 0 && interpretation.items[0].suggestedProduct) {
          cart = updateQuantity(
            cart,
            interpretation.items[0].suggestedProduct.id,
            interpretation.items[0].quantity
          );
          await AIConversationManager.updateCart(storeId, conversationId, cart);

          const cartSummary = getCartSummary(cart);
          responseMessage = `✅ Cantidad actualizada.\n\n${cartSummary.formattedSummary}`;
        }
        break;

      // ────────────────────────────────────
      // VER CARRITO
      // ────────────────────────────────────
      case 'view_cart':
        console.log('👀 Procesando: VER CARRITO');

        const cartSummary = getCartSummary(cart);
        responseMessage = cartSummary.formattedSummary;

        if (cart.length > 0) {
          responseMessage += '\n\n¿Deseas confirmar tu pedido? 😊';
        }
        break;

      // ────────────────────────────────────
      // CONFIRMAR PEDIDO
      // ────────────────────────────────────
      case 'confirm_order':
        console.log('✅ Procesando: CONFIRMAR PEDIDO');

        if (cart.length === 0) {
          responseMessage = 'Tu carrito está vacío. ¿Qué te gustaría ordenar? 😊';
        } else {
          responseMessage = generateOrderConfirmationMessage(cart, customerName);
          createOrder = true;
          needsMoreInfo = true;

          // Cambiar modo a toma de pedido
          await AIConversationManager.setMode(storeId, conversationId, 'order_taking');
        }
        break;

      // ────────────────────────────────────
      // BUSCAR PRODUCTO
      // ────────────────────────────────────
      case 'search_product':
        console.log('🔍 Procesando: BUSCAR PRODUCTO');

        if (interpretation.items.length > 0) {
          const matches = await searchProductsWithAI(
            interpretation.items[0].searchQuery,
            activeProducts
          );
          responseMessage = generateProductSuggestionMessage(
            interpretation.items[0].searchQuery,
            matches
          );
        }
        break;

      // ────────────────────────────────────
      // PREGUNTA
      // ────────────────────────────────────
      case 'ask_question':
        console.log('❓ Procesando: PREGUNTA');
        // La IA ya generó la respuesta en interpretation.message
        break;

      default:
        console.log('❓ Intención no reconocida');
    }

    // ========================================
    // PASO 6: Retornar resultado
    // ========================================

    console.log('✅ Procesamiento IA completado');
    console.log('========================================\n');

    return {
      shouldContinue: !needsMoreInfo, // Si necesita más info, detener flujo normal
      responseMessage,
      createOrder,
      cart,
      needsMoreInfo
    };

  } catch (error: any) {
    console.error('❌ Error en procesamiento IA:', error);

    // En caso de error, continuar con flujo normal
    return {
      shouldContinue: true,
      responseMessage: 'Disculpa, ocurrió un error. ¿Podrías repetir tu mensaje? 😊'
    };
  }
}

// ========================================
// FUNCIÓN DE INTEGRACIÓN EN WHATSAPP-SIMPLE.TS
// ========================================

/**
 * Integrar en el flujo existente de WhatsApp
 *
 * INSERTAR ESTA FUNCIÓN EN whatsapp-simple.ts
 * DESPUÉS de verificar si es mensaje esperado
 * Y ANTES de procesar auto-respuestas
 */
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
      // No fue manejado por IA, continuar flujo normal
      return { handled: false };
    }

    // Fue manejado por IA
    return {
      handled: true,
      responseMessage: result.responseMessage,
      shouldCreateOrder: result.createOrder,
      cart: result.cart
    };

  } catch (error) {
    console.error('Error en tryProcessWithAI:', error);
    return { handled: false };
  }
}

// ========================================
// HELPERS PARA CREAR ORDEN DESDE CARRITO
// ========================================

/**
 * Crear orden desde carrito de IA
 */
export async function createOrderFromCart(
  cart: CartItem[],
  customer: any,
  storeId: number,
  tenantStorage: any
): Promise<any> {
  try {
    console.log('📦 Creando orden desde carrito IA...');

    const cartSummary = getCartSummary(cart);

    // Crear orden
    const order = await tenantStorage.createOrder({
      customerId: customer.id,
      totalAmount: cartSummary.totalAmount.toString(),
      status: 'pending',
      notes: 'Creado mediante asistente IA',
      storeId: storeId
    }, cart.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toString(),
      totalPrice: item.totalPrice.toString()
    })));

    console.log(`✅ Orden creada - ID: ${order.id}, Número: ${order.orderNumber}`);

    return order;

  } catch (error: any) {
    console.error('❌ Error creando orden:', error);
    throw error;
  }
}
