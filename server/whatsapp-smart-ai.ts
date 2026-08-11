import 'dotenv/config';
import {
  AICreditsManager,
  AIConversationManager,
  shouldUseAI
} from './ai-credits-manager';
import { interpretAIMessage } from './ai-order-assistant';
import { CartItem } from './ai-credits-schema';
import { generateSalesAgentResponse, interpretMessage } from './ai-service';
import {
  getFlowContext,
  isConfirmationForTransition,
  transitionToAutomatic,
  createOrUpdateAIFlow,
  calculateCartTotal,
  formatCartSummary,
  logFlowState
} from './hybrid-flow-manager';

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

/**
 * Sincroniza el contexto desde la base de datos cuando no existe en memoria
 * Útil después de un reinicio del servidor
 */
export async function syncContextFromDB(
  phoneNumber: string,
  conversationId: number,
  tenantStorage: any
): Promise<MessageContext> {
  // Si ya existe en memoria, retornar
  const existing = conversationContexts.get(phoneNumber);
  if (existing && existing.lastAutoResponse) {
    return existing;
  }

  // Consultar mensajes recientes para detectar si ya se envió bienvenida
  try {
    const recentMessages = await tenantStorage.getRecentMessages(conversationId, 20);
    
    let isAfterWelcome = false;
    let isAfterCatalog = false;
    let lastAutoResponse: string | undefined;

    // Buscar mensajes del asistente que indiquen respuestas automáticas
    for (const msg of recentMessages) {
      if (msg.role === 'assistant') {
        const content = msg.content.toLowerCase();
        
        // Detectar bienvenida
        if (content.includes('bienvenid') || content.includes('hola') && content.includes('en qué puedo ayudarte')) {
          isAfterWelcome = true;
          lastAutoResponse = 'welcome';
        }
        
        // Detectar catálogo
        if (content.includes('catálogo') || content.includes('productos disponibles') || content.includes('nuestros productos')) {
          isAfterCatalog = true;
          lastAutoResponse = 'catalog';
        }
      }
    }

    const context: MessageContext = {
      isAfterWelcome,
      isAfterCatalog,
      lastAutoResponse
    };

    // Guardar en memoria para próximas consultas
    if (isAfterWelcome || isAfterCatalog) {
      conversationContexts.set(phoneNumber, context);
      console.log(`✅ [AI-SMART] Contexto sincronizado desde BD para ${phoneNumber}:`, context);
    }

    return context;
  } catch (error) {
    console.error('❌ [AI-SMART] Error sincronizando contexto desde BD:', error);
    return {};
  }
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
    originalMessages?: string[]; // Mensajes originales del cliente
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
    
    // 📝 Construir notas con mensajes originales del cliente
    let orderNotes = orderData?.notes || '';
    if (orderData?.originalMessages && orderData.originalMessages.length > 0) {
      const customerMessages = orderData.originalMessages
        .filter(msg => msg.trim().length > 0)
        .map(msg => `- "${msg}"`)
        .join('\n');
      
      if (customerMessages) {
        orderNotes = `💬 MENSAJES ORIGINALES DEL CLIENTE:\n${customerMessages}\n\n${orderNotes}`.trim();
        console.log(`📝 [AI-SMART] Agregadas ${orderData.originalMessages.length} mensajes del cliente a las notas`);
      }
    }
    
    const order = await tenantStorage.createOrder({
      customerId,
      storeId,
      status: 'pending',
      subtotal,
      totalAmount: subtotal,
      source: 'whatsapp_ai',
      deliveryAddress: orderData?.address || '',
      paymentMethod: orderData?.paymentMethod || '',
      notes: orderNotes,
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

    // Reservar stock: la orden nace en `pending` sin descontar; sin reserva,
    // el mismo producto aparece disponible para otro cliente que llega por
    // otro canal (POS, web) antes de que ésta se despache.
    try {
      const { reserveForOrder } = await import('./inventory/order-reservations.js');
      const { masterPool } = await import('./multi-tenant-db.js');
      const warehouseIdForReserve = (order as { warehouseId?: number }).warehouseId;
      if (warehouseIdForReserve) {
        const outcome = await reserveForOrder(
          masterPool,
          order.id,
          storeId,
          cart
            .filter((it) => it.productId && it.quantity > 0)
            .map((it) => ({
              productId: it.productId,
              warehouseId: warehouseIdForReserve,
              quantity: it.quantity,
            })),
        );
        if (outcome.skipped.length) {
          console.warn(`[reservation] AI order ${order.id}: reserved ${outcome.reserved.length}, skipped ${outcome.skipped.length}`, outcome.skipped);
        }
      }
    } catch (resErr) {
      console.warn('[reservation] AI order failed:', resErr);
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
  useButtons?: boolean;
  buttons?: Array<{
    id: string;
    title: string;
    productId?: number;
    productName?: string;
    productPrice?: number;
  }>;
  productData?: Record<number, any>;
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
    
    // Sincronizar contexto desde BD si no existe en memoria
    const context = await syncContextFromDB(phoneNumber, conversationId, tenantStorage);
    console.log('📋 [AI-SMART] Contexto actual:', context);

    // ✅ HÍBRIDO: Verificar flow context primero
    const flowContext = await getFlowContext(
      phoneNumber,
      messageText,
      storeId,
      tenantStorage,
      context.isAfterWelcome
    );

    console.log(`🔄 [HYBRID] Flow context - shouldUseAI: ${flowContext.shouldUseAI}, shouldUseAutomatic: ${flowContext.shouldUseAutomatic}`);

    // Si flow dice usar automático, no procesar con IA
    if (flowContext.shouldUseAutomatic && !flowContext.shouldUseAI) {
      console.log('⚙️ [HYBRID] Flow indica usar automático - IA no procesa');
      logFlowState(flowContext.flow, '📋 [HYBRID] ');
      return { handled: false };
    }

    // Si flow dice usar IA, proceder independiente de otros criterios
    if (flowContext.shouldUseAI) {
      console.log('🤖 [HYBRID] Flow indica usar IA - procediendo');
      // Continuar con el flujo normal de IA
    } else {
      // Si no hay indicación de flow, usar criterios normales
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

    // 🔍 Obtener productos pendientes de selección si existen
    let pendingProducts: any[] = [];
    if (aiConversation.pendingProductSelection) {
      const pendingSelection = typeof aiConversation.pendingProductSelection === 'string'
        ? JSON.parse(aiConversation.pendingProductSelection)
        : aiConversation.pendingProductSelection;
      pendingProducts = Object.values(pendingSelection);
      console.log(`📋 [AI-SMART] ${pendingProducts.length} productos pendientes de selección detectados`);
    }

    const interpretation = await interpretAIMessage(messageText, {
      storeId,
      customerId,
      token: process.env.STORE_BEARER_TOKEN!,
      apiBaseUrl: process.env.API_BASE_URL!,
      pendingProducts: pendingProducts // Pasar productos pendientes al contexto
    }, recentMessages);

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

    // ✅ OBTENER CARRITO ACTUAL - Nunca limpiarlo automáticamente, solo cuando el cliente confirme
    let currentCart = aiConversation.cartItems || [];
    
    // Log del estado del carrito
    if (currentCart.length > 0) {
      console.log(`🛒 [AI-SMART] Carrito existente con ${currentCart.length} items - Manteniendo`);
    } else {
      console.log(`🛒 [AI-SMART] Carrito vacío - Empezando nuevo`);
    }
    
    // Solo limpiar carrito si flow existe y está completado (orden ya finalizada)
    const existingFlow = await tenantStorage.getRegistrationFlowByPhoneNumber(phoneNumber);
    if (existingFlow && existingFlow.isCompleted) {
      console.log(`🧹 [AI-SMART] Limpiando carrito - pedido anterior completado`);
      currentCart = [];
      aiConversation.cartItems = [];
      await tenantStorage.updateAIConversation?.(storeId, conversationId, aiConversation);
    }

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
            
            // 📝 Capturar mensajes originales del cliente
            const customerMessages = recentMessages
              .filter((msg: any) => msg.role === 'user' && msg.content && msg.content.trim().length > 0)
              .map((msg: any) => msg.content.trim())
              .slice(-10); // Últimos 10 mensajes del cliente
            
            const orderId = await createOrderFromAICart(
              pendingOrder.cartItems,
              customerId,
              storeId,
              tenantStorage,
              {
                address: pendingOrder.address,
                paymentMethod: pendingOrder.paymentMethod,
                notes: pendingOrder.notes,
                originalMessages: customerMessages
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
      case 'search_product':
        // 🔍 MODO CONVERSACIONAL: Mostrar información del producto
        console.log(`🔍 [AI-SMART] Cliente buscando producto - modo conversacional`);
        console.log(`📝 [AI-SMART] Mensaje actual:`, interpretation.message?.substring(0, 100));
        
        // Si ya tenemos el mensaje con opciones formateado, enviarlo directamente con botones si están disponibles
        if (interpretation.message && interpretation.message.includes('🔍 Encontré')) {
          console.log(`✅ [AI-SMART] Enviando opciones de búsqueda directamente (${interpretation.message.length} chars)`);
          
          const useButtons = (interpretation as any).useButtons || false;
          const productOptions = (interpretation as any).productOptions || [];
          const productData = (interpretation as any).productData || {};
          const productsByIndex = (interpretation as any).productsByIndex || {};
          
          // ✅ Si tiene opciones Y useButtons está activo, preparar botones interactivos
          if (useButtons && productOptions.length > 0) {
            console.log(`🔘 [AI-SMART] Enviando ${productOptions.length} botones interactivos de WhatsApp`);
            
            // Guardar productData Y productsByIndex en la conversación para procesar clicks y números
            if (Object.keys(productData).length > 0) {
              aiConversation.pendingProductSelection = productData;
              aiConversation.pendingProductsByIndex = productsByIndex;
              await tenantStorage.updateAIConversation(conversationId, {
                pendingProductSelection: JSON.stringify(productData),
                pendingProductsByIndex: JSON.stringify(productsByIndex),
                updatedAt: new Date()
              });
              console.log(`💾 [AI-SMART] Guardados ${Object.keys(productData).length} productos por ID y ${Object.keys(productsByIndex).length} por índice`);
            }
            
            return {
              handled: true,
              responseMessage: interpretation.message,
              useButtons: true,
              buttons: productOptions,
              productData: productData
            };
          }
          
          // Sin opciones o sin botones, retorno normal
          return {
            handled: true,
            responseMessage: interpretation.message
          };
        }
        
        console.log(`⚠️ [AI-SMART] Mensaje NO contiene opciones formateadas, llamando Sales Agent`);
        
        // Si no, usar agente de ventas inteligente para conversar
        const searchResponse = await generateSalesAgentResponse(
          messageText,
          await interpretMessage(messageText, {
            customerId,
            customerName: customerName,
            recentMessages,
            tenantStorage
          }),
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
          responseMessage: searchResponse
        };
      
      case 'add_to_cart':
        // ✅ AGREGAR AL CARRITO: Solo cuando hay confirmación explícita
        console.log(`✅ [AI-SMART] Cliente confirmó agregar al carrito`);
        
        // 🔍 BUSCAR PRODUCTO DEL CONTEXTO si no viene en interpretation
        let itemsToAdd = interpretation.items.filter(i => i.suggestedProduct);
        
        if (itemsToAdd.length === 0) {
          console.log(`🔍 [AI-SMART] No hay producto en interpretation, buscando en contexto...`);
          
          // Buscar en mensajes recientes qué producto se mencionó
          for (let i = recentMessages.length - 1; i >= 0; i--) {
            const msg = recentMessages[i];
            if (msg.role === 'assistant') {
              // Buscar patrón: "Tenemos *PRODUCTO* a *RD$PRECIO*"
              const productMatch = msg.content.match(/Tenemos \*([^*]+)\* a \*RD\$([0-9.]+)\*/);
              if (productMatch) {
                const productName = productMatch[1];
                const productPrice = parseFloat(productMatch[2]);
                console.log(`✅ [AI-SMART] Producto encontrado en contexto: ${productName} - RD$${productPrice}`);
                
                // Buscar el producto en el catálogo
                const foundProduct = activeProducts.find(p => 
                  p.name.toLowerCase().includes(productName.toLowerCase()) || 
                  productName.toLowerCase().includes(p.name.toLowerCase())
                );
                
                if (foundProduct) {
                  // Buscar cantidad en mensajes del usuario
                  let quantity = 1;
                  for (let j = recentMessages.length - 1; j >= 0; j--) {
                    const userMsg = recentMessages[j];
                    if (userMsg.role === 'user') {
                      const qtyMatch = userMsg.content.match(/\b(\d+)\b/);
                      if (qtyMatch) {
                        quantity = parseInt(qtyMatch[1]);
                        console.log(`✅ [AI-SMART] Cantidad encontrada en contexto: ${quantity}`);
                        break;
                      }
                    }
                  }
                  
                  itemsToAdd = [{
                    suggestedProduct: foundProduct,
                    quantity,
                    searchQuery: productName,
                    confidence: 0.9
                  }];
                  console.log(`✅ [AI-SMART] Producto reconstruido desde contexto:`, itemsToAdd[0]);
                  break;
                }
              }
            }
          }
        }
        
        // Agregar items al carrito
        console.log(`🔍 [AI-SMART] Carrito ANTES de agregar:`, currentCart);
        for (const item of itemsToAdd) {
          if (item.suggestedProduct) {
            console.log(`🔍 [AI-SMART] Agregando: ${item.suggestedProduct.name} x${item.quantity} (precio: RD$${item.suggestedProduct.price})`);
            currentCart = addToCart(currentCart, item.suggestedProduct, item.quantity);
            console.log(`✅ [AI-SMART] Agregado: ${item.suggestedProduct.name} x${item.quantity}`);
            console.log(`🔍 [AI-SMART] Carrito DESPUÉS:`, currentCart);
          }
        }
        await AIConversationManager.updateCart(storeId, conversationId, currentCart);

        // ✨ Si no se agregó nada, buscar y mostrar primero
        if (currentCart.length === 0) {
          console.log(`⚠️ [AI-SMART] No se pudo agregar nada al carrito - carrito vacío`);
          const searchResponse = await generateSalesAgentResponse(
            messageText,
            await interpretMessage(messageText, {
              customerId,
              customerName: customerName,
              recentMessages,
              tenantStorage
            }),
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
            responseMessage: searchResponse
          };
        }

        // ✅ PASO 1 COMPLETADO: Producto agregado
        // ✅ SOLO GUARDAR EN CONVERSACIÓN - NO crear registration flow aún
        console.log(`💾 [AI-SMART] Guardando carrito en conversación (sin flow todavía)`);

        const cartTotal = calculateCartTotal(currentCart);

        // Actualizar AI conversation con carrito
        const orderFlowConversation = {
          ...aiConversation,
          cartItems: currentCart,
          orderFlowStep: 'add_products',
          pendingOrder: {
            cartItems: currentCart
          }
        } as any;
        await tenantStorage.updateAIConversation?.(storeId, conversationId, orderFlowConversation);

        // Generar respuesta
        const addedItem = currentCart[currentCart.length - 1];
        const responseMessage = `✅ ${addedItem.productName} x${addedItem.quantity} agregado\n\n${formatCartSummary(currentCart)}\n\n💬 Puedes:\n• Agregar más productos (ej: "dame un rite start")\n• Escribir *"confirmar pedido"* cuando termines`;

        console.log(`💾 [AI-SMART] Carrito guardado - ${currentCart.length} items - RD$${cartTotal}`);

        return {
          handled: true,
          responseMessage,
          cart: currentCart
        };

      case 'remove_from_cart':
        // 🗑️ ELIMINAR DEL CARRITO
        console.log(`🗑️ [AI-SMART] Solicitud de eliminar del carrito`);
        
        if (currentCart.length === 0) {
          return {
            handled: true,
            responseMessage: '🛒 Tu carrito está vacío. No hay productos para eliminar.'
          };
        }

        // Detectar si es por índice o por nombre
        const itemToRemove = interpretation.items[0];
        let removedProduct = null;
        let removeIndex = -1;

        if (itemToRemove?.removeByIndex) {
          // Eliminar por índice (1-based)
          removeIndex = itemToRemove.removeByIndex - 1; // Convertir a 0-based
          console.log(`🔍 [AI-SMART] Eliminar por índice: ${itemToRemove.removeByIndex} (posición ${removeIndex})`);
          
          if (removeIndex >= 0 && removeIndex < currentCart.length) {
            removedProduct = currentCart[removeIndex];
            currentCart.splice(removeIndex, 1);
            console.log(`✅ [AI-SMART] Eliminado: ${removedProduct.productName}`);
          } else {
            return {
              handled: true,
              responseMessage: `❌ No existe el producto #${itemToRemove.removeByIndex} en tu carrito.\n\n${formatCartSummary(currentCart)}`
            };
          }
        } else if (itemToRemove?.removeByName) {
          // Eliminar por nombre
          const searchQuery = itemToRemove.searchQuery.toLowerCase();
          console.log(`🔍 [AI-SMART] Eliminar por nombre: "${searchQuery}"`);
          
          removeIndex = currentCart.findIndex(item => 
            item.productName.toLowerCase().includes(searchQuery) ||
            searchQuery.includes(item.productName.toLowerCase())
          );
          
          if (removeIndex !== -1) {
            removedProduct = currentCart[removeIndex];
            currentCart.splice(removeIndex, 1);
            console.log(`✅ [AI-SMART] Eliminado: ${removedProduct.productName}`);
          } else {
            return {
              handled: true,
              responseMessage: `❌ No encontré "${itemToRemove.searchQuery}" en tu carrito.\n\n${formatCartSummary(currentCart)}`
            };
          }
        }

        // Actualizar carrito en conversación
        await AIConversationManager.updateCart(storeId, conversationId, currentCart);

        // Generar respuesta
        if (currentCart.length === 0) {
          return {
            handled: true,
            responseMessage: `✅ *${removedProduct.productName}* eliminado.\n\n🛒 Tu carrito está vacío. ¿Qué te gustaría agregar?`,
            cart: currentCart
          };
        } else {
          return {
            handled: true,
            responseMessage: `✅ *${removedProduct.productName}* eliminado.\n\n${formatCartSummary(currentCart)}\n\n💬 Puedes:\n• Agregar más productos\n• Escribir *"confirmar pedido"* cuando termines`,
            cart: currentCart
          };
        }

      case 'search_product': {
        // ✨ Usar el nuevo Sales Agent para generar respuesta persuasiva
        // Pass activeProducts instead of matches so the Sales Agent has the full catalog
        const searchResponse = await generateSalesAgentResponse(
          messageText,
          await interpretMessage(messageText, {
            customerId,
            customerName: customerName,
            recentMessages,
            tenantStorage
          }),
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
        // ✅ CONFIRMACIÓN DE PEDIDO - Verificar registro del cliente primero
        console.log(`🔄 [AI-SMART] Detectada confirmación de pedido`);

        // 1. Si el carrito está vacío pero hay pendingOrder, recuperarlo
        if (currentCart.length === 0 && (aiConversation as any).pendingOrder?.cartItems?.length > 0) {
          console.log(`🔄 [AI-SMART] Recuperando carrito de pendingOrder: ${(aiConversation as any).pendingOrder.cartItems.length} items`);
          currentCart = (aiConversation as any).pendingOrder.cartItems;
        }

        if (currentCart.length === 0) {
          return { handled: true, responseMessage: '🛒 Tu carrito está vacío. ¿Qué te gustaría pedir?' };
        }

        // 2. Verificar si el cliente ya está registrado con dirección
        const customerInfo = await tenantStorage.getCustomerById(customerId);
        const hasCompleteInfo = customerInfo && customerInfo.address && customerInfo.address.trim() !== '';
        
        console.log(`👤 [AI-SMART] Cliente ${customerId} - Registrado: ${hasCompleteInfo ? 'SÍ' : 'NO'}`);

        if (hasCompleteInfo) {
          // ✅ Cliente registrado - crear orden final
          console.log(`✅ [AI-SMART] Cliente registrado - creando orden final`);
          
          // 📝 Capturar mensajes originales del cliente de esta conversación
          const customerMessages = recentMessages
            .filter((msg: any) => msg.role === 'user' && msg.content && msg.content.trim().length > 0)
            .map((msg: any) => msg.content.trim())
            .slice(-10); // Últimos 10 mensajes del cliente
          
          console.log(`📝 [AI-SMART] Capturados ${customerMessages.length} mensajes del cliente para notas`);
          
          const cartTotal = calculateCartTotal(currentCart);
          
          // Construir notas con mensajes originales
          const orderNotes = customerMessages.length > 0 
            ? `📬 MENSAJES ORIGINALES DEL CLIENTE:\n${customerMessages.map((msg: string) => `- "${msg}"`).join('\n')}`
            : '';
          
          const finalOrder = await tenantStorage.createOrder({
            customerId,
            storeId,
            status: 'pending',
            items: currentCart.map((item: CartItem) => ({
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              price: item.unitPrice
            })),
            totalAmount: cartTotal,
            customerName: customerInfo.name || 'Cliente',
            customerPhone: phoneNumber,
            address: customerInfo.address,
            paymentMethod: 'cash',
            notes: orderNotes
          });

          console.log(`✅ [AI-SMART] Orden creada: ${finalOrder.orderNumber} (ID: ${finalOrder.id})`);

          // Limpiar carrito, contexto y flow
          await AIConversationManager.updateCart(storeId, conversationId, []);
          const clearedConversation = {
            ...aiConversation,
            orderFlowStep: null,
            pendingOrder: undefined,
            cartItems: []
          } as any;
          await tenantStorage.updateAIConversation?.(storeId, conversationId, clearedConversation);

          // Limpiar registration flow si existe
          const existingFlow = await tenantStorage.getRegistrationFlowByPhoneNumber(phoneNumber);
          if (existingFlow) {
            await tenantStorage.updateRegistrationFlow(phoneNumber, {
              isCompleted: true,
              updatedAt: new Date()
            });
          }

          return {
            handled: true,
            responseMessage: `✅ *¡Pedido confirmado!*\n\n📦 Orden: ${finalOrder.orderNumber}\n💰 Total: RD$${cartTotal}\n📍 Dirección: ${customerInfo.address}\n💳 Pago: Efectivo\n\n¡Gracias por tu compra! Te contactaremos pronto.`
          };
        } else {
          // ❌ Cliente NO registrado - crear orden draft y recolectar datos
          console.log(`📝 [AI-SMART] Cliente sin dirección - creando orden draft y recolectando datos`);
          
          // 📝 Capturar mensajes originales del cliente
          const customerMessages = recentMessages
            .filter((msg: any) => msg.role === 'user' && msg.content && msg.content.trim().length > 0)
            .map((msg: any) => msg.content.trim())
            .slice(-10); // Últimos 10 mensajes del cliente
          
          const orderNotes = customerMessages.length > 0 
            ? `📬 MENSAJES ORIGINALES DEL CLIENTE:\n${customerMessages.map((msg: string) => `- "${msg}"`).join('\n')}`
            : '';
          
          const cartTotal = calculateCartTotal(currentCart);
          const draftOrder = await tenantStorage.createOrder({
            customerId,
            storeId,
            status: 'draft',
            items: currentCart.map((item: CartItem) => ({
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              price: item.unitPrice
            })),
            totalAmount: cartTotal,
            customerName: customerInfo?.name || 'Cliente',
            customerPhone: phoneNumber,
            notes: orderNotes
          });

          console.log(`📦 [AI-SMART] Orden draft creada: ${draftOrder.orderNumber} (ID: ${draftOrder.id})`);

          // Crear registration flow para recolectar datos
          await tenantStorage.createOrUpdateRegistrationFlow({
            customerId,
            phoneNumber,
            currentStep: 'collect_address',
            flowType: 'ai_assisted',
            orderId: draftOrder.id,
            orderNumber: draftOrder.orderNumber,
            collectedData: JSON.stringify({ cartItems: currentCart }),
            isCompleted: false,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
          });

          // Actualizar conversación
          const updatedConversation = {
            ...aiConversation,
            orderFlowStep: 'collect_address',
            pendingOrder: {
              cartItems: currentCart,
              orderId: draftOrder.id,
              orderNumber: draftOrder.orderNumber
            }
          } as any;
          await tenantStorage.updateAIConversation?.(storeId, conversationId, updatedConversation);

          return {
            handled: true,
            responseMessage: `✅ *Pedido listo:*\n\n${formatCartSummary(currentCart)}\n\n📍 Para confirmar, necesito tu *dirección de entrega completa*.\n\n¿Cuál es tu dirección?`
          };
        }

      default:
        // ✨ Usar Sales Agent para preguntas y otras intenciones también
        const defaultResponse = await generateSalesAgentResponse(
          messageText,
          await interpretMessage(messageText, {
            customerId,
            customerName: customerName,
            recentMessages,
            tenantStorage
          }),
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
