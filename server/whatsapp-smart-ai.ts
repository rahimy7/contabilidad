import 'dotenv/config';
import {
  AICreditsManager,
  AIConversationManager,
  shouldUseAI
} from './ai-credits-manager';
import { interpretAIMessage } from './ai-order-assistant';
import { CartItem } from './ai-credits-schema';
import { generateSalesAgentResponse, interpretMessage } from './ai-service';

interface MessageContext {
  isAfterWelcome?: boolean;
  isAfterCatalog?: boolean;
  expectedResponses?: string[];
  lastAutoResponse?: string;
  isHelpMode?: boolean;
  orderFlowStep?: 'confirm_cart' | 'collect_address' | 'collect_payment' | 'collect_notes' | 'confirm_order' | null;
  pendingOrder?: {
    cartItems: CartItem[];
    address?: string;
    paymentMethod?: string;
    notes?: string;
  };
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
  tenantStorage: any,
  orderData?: {
    address?: string;
    paymentMethod?: string;
    notes?: string;
  }
): Promise<number | null> {
  try {
    console.log('📦 [AI-SMART] Creando orden desde carrito IA...');
    if (orderData) {
      console.log(`📍 [AI-SMART] Datos de entrega:`, {
        address: orderData.address?.substring(0, 50) + '...',
        payment: orderData.paymentMethod,
        notes: orderData.notes?.substring(0, 50) + '...'
      });
    }

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
      deliveryAddress: orderData?.address || '',
      paymentMethod: orderData?.paymentMethod || '',
      notes: orderData?.notes || '',
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

    console.log(`✅ [AI-SMART] Orden creada: #${order.id} con datos de entrega`);
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

// ===== Funciones de recolección de datos de orden =====

/**
 * Solicita dirección de entrega al cliente
 */
function getAddressCollectionPrompt(): string {
  return `📍 Para procesar tu pedido, necesito tu dirección de entrega.\n\nPuedes:\n✅ Enviar tu ubicación GPS (botón de ubicación)\n✅ Escribir tu dirección completa (ej: Calle Principal 123, Apt 4B, Santo Domingo)\n\n¿Cuál prefieres?`;
}

/**
 * Solicita método de pago al cliente
 */
function getPaymentCollectionPrompt(): string {
  return `💳 Ahora, ¿cuál es tu método de pago preferido?\n\nOpciones:\n1️⃣ Tarjeta de Crédito/Débito\n2️⃣ Transferencia Bancaria\n3️⃣ Efectivo (Contra Entrega)\n4️⃣ Otro\n\nDime el número o tu opción.`;
}

/**
 * Solicita notas especiales al cliente
 */
function getNotesCollectionPrompt(): string {
  return `📝 ¿Hay algo más que debamos saber? (instrucciones especiales, horario de entrega, etc.)\n\nPuedes escribir tus notas o escribir "Sin notas" para continuar.`;
}

/**
 * Genera mensaje de confirmación de orden con detalles
 */
function generateOrderConfirmationMessage(order: any, cartItems: CartItem[]): string {
  let message = `🎉 *RESUMEN DE TU PEDIDO*\n\n`;
  message += `📦 *PRODUCTOS:*\n`;

  let total = 0;
  cartItems.forEach((item, idx) => {
    total += item.totalPrice;
    message += `${idx + 1}. ${item.productName} x${item.quantity} = RD$${item.totalPrice.toFixed(2)}\n`;
  });

  message += `\n💰 *TOTAL:* RD$${total.toFixed(2)}\n`;
  message += `\n📍 *DIRECCIÓN:* ${order.address || 'No especificada'}\n`;
  message += `💳 *MÉTODO DE PAGO:* ${order.paymentMethod || 'No especificado'}\n`;

  if (order.notes) {
    message += `📝 *NOTAS:* ${order.notes}\n`;
  }

  message += `\n¿Confirmas tu pedido? Responde "Sí" para confirmar o "No" para modificar.`;

  return message;
}

/**
 * Valida y procesa dirección ingresada por el cliente
 */
function validateAndProcessAddress(input: string): { valid: boolean; address: string } {
  // Limpiar entrada
  const cleaned = input.trim();

  // Mínimo 10 caracteres para dirección válida
  if (cleaned.length >= 10) {
    return { valid: true, address: cleaned };
  }

  return { valid: false, address: '' };
}

/**
 * Valida y mapea método de pago
 */
function validateAndProcessPayment(input: string): { valid: boolean; method: string } {
  const lower = input.toLowerCase().trim();

  const paymentMappings: { [key: string]: string } = {
    '1': 'Tarjeta de Crédito/Débito',
    'tarjeta': 'Tarjeta de Crédito/Débito',
    'credito': 'Tarjeta de Crédito/Débito',
    'debito': 'Tarjeta de Crédito/Débito',
    '2': 'Transferencia Bancaria',
    'transferencia': 'Transferencia Bancaria',
    'banco': 'Transferencia Bancaria',
    '3': 'Efectivo (Contra Entrega)',
    'efectivo': 'Efectivo (Contra Entrega)',
    'contraentrega': 'Efectivo (Contra Entrega)',
    'contra': 'Efectivo (Contra Entrega)',
  };

  const mapped = paymentMappings[lower];
  if (mapped) {
    return { valid: true, method: mapped };
  }

  // Si no coincide, usar como está
  if (input.length >= 3) {
    return { valid: true, method: input };
  }

  return { valid: false, method: '' };
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

    // ✨ OBTENER HISTORIAL DE MENSAJES PARA CONTEXTO
    const recentMessages = await tenantStorage.getRecentMessages(conversationId, 10);
    console.log(`📜 [AI-SMART] Historial de ${recentMessages.length} mensajes cargado para contexto`);

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

    // ✅ NUEVO: Manejar flujo de recolección de datos del pedido
    const orderFlowStep = (aiConversation as any).orderFlowStep;
    if (orderFlowStep && (aiConversation as any).pendingOrder) {
      const pendingOrder = (aiConversation as any).pendingOrder;

      switch (orderFlowStep) {
        case 'collect_address':
          const addressValidation = validateAndProcessAddress(messageText);
          if (!addressValidation.valid) {
            console.log(`⚠️ [AI-SMART] Dirección inválida. Intentando interpretar...`);
            return {
              handled: true,
              responseMessage: getAddressCollectionPrompt() + '\n\n(Por favor proporciona una dirección más completa)'
            };
          }

          // ✅ Dirección válida - pasar a pago - GUARDAR EN DB
          const updatedConversation1 = {
            ...aiConversation,
            orderFlowStep: 'collect_payment',
            pendingOrder: {
              ...pendingOrder,
              address: addressValidation.address
            }
          } as any;
          await tenantStorage.updateAIConversation?.(storeId, conversationId, updatedConversation1);

          console.log(`📍 [AI-SMART] Dirección guardada: ${addressValidation.address}`);
          return {
            handled: true,
            responseMessage: getPaymentCollectionPrompt()
          };

        case 'collect_payment':
          const paymentValidation = validateAndProcessPayment(messageText);
          if (!paymentValidation.valid) {
            console.log(`⚠️ [AI-SMART] Método de pago no reconocido`);
            return {
              handled: true,
              responseMessage: getPaymentCollectionPrompt() + '\n\n(Opciones: Efectivo, Tarjeta, Transferencia)'
            };
          }

          // ✅ Pago válido - pasar a notas - GUARDAR EN DB
          const updatedConversation2 = {
            ...aiConversation,
            orderFlowStep: 'collect_notes',
            pendingOrder: {
              ...pendingOrder,
              address: pendingOrder.address,
              paymentMethod: paymentValidation.method
            }
          } as any;
          await tenantStorage.updateAIConversation?.(storeId, conversationId, updatedConversation2);

          console.log(`💳 [AI-SMART] Método de pago guardado: ${paymentValidation.method}`);
          return {
            handled: true,
            responseMessage: getNotesCollectionPrompt()
          };

        case 'collect_notes':
          // ✅ Permitir saltarse las notas con "sin notas" o similar
          const skipNotes = ['sin notas', 'ninguna', 'nada', 'ok', 'listo', 'siguiente'].some(
            keyword => messageText.toLowerCase().includes(keyword)
          );

          const notes = skipNotes ? '' : messageText;

          // ✅ Pasar a confirmación final - GUARDAR EN DB
          const updatedConversation3 = {
            ...aiConversation,
            orderFlowStep: 'confirm_order',
            pendingOrder: {
              ...pendingOrder,
              address: pendingOrder.address,
              paymentMethod: pendingOrder.paymentMethod,
              notes: notes
            }
          } as any;
          await tenantStorage.updateAIConversation?.(storeId, conversationId, updatedConversation3);

          const confirmationMessage = generateOrderConfirmationMessage(
            {
              address: pendingOrder.address,
              paymentMethod: pendingOrder.paymentMethod,
              notes: notes
            },
            pendingOrder.cartItems
          );

          console.log(`📝 [AI-SMART] Notas guardadas, mostrando confirmación`);
          return {
            handled: true,
            responseMessage: confirmationMessage + '\n\n¿Confirmas tu pedido? (responde SI para confirmar o CANCELAR para volver atrás)'
          };

        case 'confirm_order':
          // ✅ Detectar confirmación o cancelación
          const confirmationKeywords = ['si', 'sí', 'confirmar', 'yes', 'yep', 'ok', 'vale', 'adelante'];
          const cancellationKeywords = ['no', 'cancelar', 'cancel', 'atrás', 'volver'];

          const isConfirmed = confirmationKeywords.some(
            keyword => messageText.toLowerCase().includes(keyword)
          );
          const isCancelled = cancellationKeywords.some(
            keyword => messageText.toLowerCase().includes(keyword)
          );

          if (isCancelled) {
            // ✅ Limpiar contexto - GUARDAR EN DB
            const clearedConversation = {
              ...aiConversation,
              orderFlowStep: null,
              pendingOrder: undefined,
              cartItems: []
            } as any;
            await tenantStorage.updateAIConversation?.(storeId, conversationId, clearedConversation);

            return {
              handled: true,
              responseMessage: '❌ Pedido cancelado. ¿En qué más puedo ayudarte?'
            };
          }

          if (!isConfirmed) {
            return {
              handled: true,
              responseMessage: '⏳ Por favor confirma tu pedido respondiendo SI o escribe CANCELAR para volver atrás'
            };
          }

          // ✅ CREAR ORDEN CON TODOS LOS DATOS RECOLECTADOS
          try {
            console.log(`✅ [AI-SMART] Creando orden con datos recolectados...`);
            const orderId = await createOrderFromAICart(
              pendingOrder.cartItems,
              customerId,
              storeId,
              tenantStorage,
              {
                address: pendingOrder.address,
                paymentMethod: pendingOrder.paymentMethod,
                notes: pendingOrder.notes
              }
            );

            // ✅ Limpiar contexto después de crear la orden - GUARDAR EN DB
            const clearedConversation = {
              ...aiConversation,
              orderFlowStep: null,
              pendingOrder: undefined,
              cartItems: []
            } as any;
            await tenantStorage.updateAIConversation?.(storeId, conversationId, clearedConversation);

            return {
              handled: true,
              responseMessage: `✅ ¡Pedido confirmado! ID: ${orderId}\n\nEstaremos entregando en la dirección proporcionada. Gracias por tu compra.`
            };
          } catch (orderError: any) {
            console.error(`❌ [AI-SMART] Error creando orden:`, orderError);
            return {
              handled: true,
              responseMessage: '❌ Hubo un error al procesar tu pedido. Intenta nuevamente.'
            };
          }
      }
    }

    switch (interpretation.intent) {
      case 'add_to_cart':
        for (const item of interpretation.items) {
          if (item.suggestedProduct) {
            currentCart = addToCart(currentCart, item.suggestedProduct, item.quantity);
            console.log(`✅ [AI-SMART] Agregado: ${item.suggestedProduct.name} x${item.quantity}`);
          }
        }
        await AIConversationManager.updateCart(storeId, conversationId, currentCart);

        // ✨ Si no se agregó nada, buscar el producto y sugerir
        if (currentCart.length === 0) {
          const query = interpretation.items[0]?.searchQuery || messageText;
          const searchResponse = await generateSalesAgentResponse(
            messageText,
            await interpretMessage(messageText),
            activeProducts,
            {
              customerId,
              customerName: customerName,
              recentMessages,
              tenantStorage
            }
          );
          return {
            handled: true,
            responseMessage: searchResponse,
            needsConfirmation: true
          };
        }

        // ✨ Usar Sales Agent para mensaje de carrito persuasivo
        const addedItem = currentCart[currentCart.length - 1];
        const cartSummary = getCartSummary(currentCart);
        const salesResponse = await generateSalesAgentResponse(
          messageText,
          await interpretMessage(messageText),
          activeProducts,
          {
            customerId,
            customerName: customerName,
            recentMessages,
            tenantStorage
          }
        );

        return {
          handled: true,
          responseMessage: `✅ Agregado: ${addedItem.productName} x${addedItem.quantity} a tu carrito\n\n${cartSummary.formattedSummary}\n\n${salesResponse}`,
          cart: currentCart
        };

      case 'search_product': {
        // ✨ Usar el nuevo Sales Agent para generar respuesta persuasiva
        // Pass activeProducts instead of matches so the Sales Agent has the full catalog
        const searchResponse = await generateSalesAgentResponse(
          messageText,
          await interpretMessage(messageText),
          activeProducts,
          {
            customerId,
            customerName: customerName,
            recentMessages,
            tenantStorage
          }
        );

        return {
          handled: true,
          responseMessage: searchResponse,
          needsConfirmation: true
        };
      }

      case 'confirm_order':
        if (currentCart.length === 0) {
          return { handled: true, responseMessage: '🛒 Tu carrito está vacío. ¿Qué te gustaría pedir?' };
        } else {
          // ✅ NUEVO: Iniciar flujo de recolección de datos en lugar de crear orden directamente - GUARDAR EN DB
          const orderFlowConversation = {
            ...aiConversation,
            orderFlowStep: 'collect_address',
            pendingOrder: {
              cartItems: currentCart,
              address: undefined,
              paymentMethod: undefined,
              notes: undefined
            }
          } as any;
          await tenantStorage.updateAIConversation?.(storeId, conversationId, orderFlowConversation);

          console.log(`📍 [AI-SMART] Iniciando flujo de recolección para ${phoneNumber}`);
          return {
            handled: true,
            responseMessage: getAddressCollectionPrompt()
          };
        }

      default:
        // ✨ Usar Sales Agent para preguntas y otras intenciones también
        const defaultResponse = await generateSalesAgentResponse(
          messageText,
          await interpretMessage(messageText),
          activeProducts,
          {
            customerId,
            customerName: customerName,
            recentMessages,
            tenantStorage
          }
        );
        return { handled: true, responseMessage: defaultResponse };
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
