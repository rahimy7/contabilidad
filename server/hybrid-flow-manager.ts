/**
 * HYBRID FLOW MANAGER
 *
 * Gestiona la alternancia entre flujo de IA y flujo automático
 * permitiendo que ambos trabajen con la misma estructura de órdenes
 */

import { CustomerRegistrationFlow } from '../shared/schema.js';

export type FlowType = 'ai_assisted' | 'automatic' | null;
export type FlowStep = 'add_products' | 'collect_address' | 'collect_payment' | 'collect_notes' | 'confirm_order' | 'collect_name' | 'collect_contact';

export interface FlowContext {
  flow: CustomerRegistrationFlow | null;
  shouldUseAI: boolean;
  shouldUseAutomatic: boolean;
  isTransitioning: boolean;
}

/**
 * Determina si se debe usar IA basado en el estado del flow
 */
export async function getFlowContext(
  phoneNumber: string,
  messageText: string,
  storeId: number,
  tenantStorage: any,
  hasWelcome: boolean = false
): Promise<FlowContext> {
  try {
    console.log(`🔄 [HYBRID] Analizando contexto de flujo para ${phoneNumber}`);

    // 1. Verificar si existe registration flow
    const flow = await tenantStorage.getRegistrationFlowByPhoneNumber(phoneNumber);

    // 2. Si no hay flow, SIEMPRE usar IA (MODO TEMPORAL: Solo IA hasta confirmación)
    if (!flow || flow.isCompleted) {
      console.log(`📭 [HYBRID] No hay flow activo`);
      console.log(`🤖 [HYBRID] MODO IA ACTIVO - Solo IA hasta confirmación de pedido`);
      return {
        flow: null,
        shouldUseAI: true,
        shouldUseAutomatic: false,
        isTransitioning: false
      };
    }

    // 3. Verificar si el flow ha expirado
    const now = new Date();
    const expiresAt = new Date(flow.expiresAt);
    if (now > expiresAt) {
      console.log(`⏰ [HYBRID] Flow expirado - limpiar y continuar con IA`);
      await tenantStorage.deleteRegistrationFlow(flow.customerId);
      
      // Después de flow expirado, si ya pasó bienvenida usar IA
      if (hasWelcome) {
        console.log(`✅ [HYBRID] Post-flow expirado con bienvenida - usar IA`);
        return {
          flow: null,
          shouldUseAI: true,
          shouldUseAutomatic: false,
          isTransitioning: false
        };
      }
      
      return {
        flow: null,
        shouldUseAI: false,
        shouldUseAutomatic: true,
        isTransitioning: false
      };
    }

    // 4. Si flow es AI-assisted en modo add_products, usar IA
    if (flow.flowType === 'ai_assisted' && flow.currentStep === 'add_products') {
      console.log(`🤖 [HYBRID] Flow AI activo - usar IA`);
      return {
        flow,
        shouldUseAI: true,
        shouldUseAutomatic: false,
        isTransitioning: false
      };
    }

    // 5. Si flow es automatic o está en pasos de confirmación, usar automático
    if (flow.flowType === 'automatic' ||
        ['confirm_order', 'collect_address', 'collect_payment', 'collect_notes', 'collect_name', 'collect_contact'].includes(flow.currentStep)) {
      console.log(`⚙️ [HYBRID] Flow automático activo - usar automático`);
      return {
        flow,
        shouldUseAI: false,
        shouldUseAutomatic: true,
        isTransitioning: false
      };
    }

    // 6. Default: usar automático si hay flow sin tipo definido
    console.log(`📋 [HYBRID] Flow sin tipo - usar automático por defecto`);
    return {
      flow,
      shouldUseAI: false,
      shouldUseAutomatic: true,
      isTransitioning: false
    };

  } catch (error) {
    console.error('❌ [HYBRID] Error obteniendo contexto:', error);
    
    // En caso de error, si ya recibió bienvenida permitir que IA intente procesar
    if (hasWelcome) {
      console.log(`⚠️ [HYBRID] Error pero usuario tiene bienvenida - intentar con IA`);
      return {
        flow: null,
        shouldUseAI: true,
        shouldUseAutomatic: false,
        isTransitioning: false
      };
    }
    
    // Sin bienvenida, usar automático
    return {
      flow: null,
      shouldUseAI: false,
      shouldUseAutomatic: true,
      isTransitioning: false
    };
  }
}

/**
 * Detecta si el mensaje es una confirmación para transicionar de IA a Automático
 */
export function isConfirmationForTransition(messageText: string): boolean {
  const confirmationKeywords = [
    'confirmar',
    'confirm',
    'proceder',
    'si',
    'sí',
    'yes',
    'adelante',
    'ok',
    'vale',
    'continuar',
    'listo'
  ];

  const messageLower = messageText.toLowerCase().trim();
  return confirmationKeywords.some(keyword => messageLower.includes(keyword));
}

/**
 * Transiciona de IA a automático cuando el usuario confirma
 */
export async function transitionToAutomatic(
  flow: CustomerRegistrationFlow,
  phoneNumber: string,
  storeId: number,
  tenantStorage: any
): Promise<boolean> {
  try {
    console.log(`🔄 [HYBRID] Iniciando transición IA → Automático`);
    console.log(`📋 [HYBRID] Flow ID: ${flow.id}, Orden: ${flow.orderId}`);

    // 1. Verificar que hay una orden
    if (!flow.orderId) {
      console.error(`❌ [HYBRID] No hay orden asociada al flow`);
      return false;
    }

    // 2. Obtener orden para verificar que tiene items
    const order = await tenantStorage.getOrderById(flow.orderId);
    if (!order || !order.items || order.items.length === 0) {
      console.error(`❌ [HYBRID] Orden sin items - no se puede confirmar`);
      return false;
    }

    // 3. Actualizar flow a modo automático
    await tenantStorage.updateRegistrationFlow(phoneNumber, {
      flowType: 'automatic',
      currentStep: 'confirm_order',
      updatedAt: new Date()
    });

    console.log(`✅ [HYBRID] Transición completada - Flow ahora es automático`);
    return true;

  } catch (error) {
    console.error('❌ [HYBRID] Error en transición:', error);
    return false;
  }
}

/**
 * Crea o actualiza un registration flow para IA
 */
export async function createOrUpdateAIFlow(
  customerId: number,
  phoneNumber: string,
  storeId: number,
  orderId: number,
  orderNumber: string,
  cartItems: any[],
  conversationId: number,
  tenantStorage: any
): Promise<CustomerRegistrationFlow> {
  try {
    console.log(`🤖 [HYBRID] Creando/actualizando flow AI`);

    // 1. Verificar si ya existe flow
    let flow = await tenantStorage.getRegistrationFlowByPhoneNumber(phoneNumber);

    const collectedData = {
      cartItems,
      aiContext: {
        lastIntent: 'add_to_cart',
        conversationId
      }
    };

    if (!flow) {
      // 2. Crear nuevo flow
      console.log(`✨ [HYBRID] Creando nuevo flow AI`);
      flow = await tenantStorage.createRegistrationFlow({
        customerId,
        phoneNumber,
        currentStep: 'add_products',
        flowType: 'ai_assisted',
        orderId,
        orderNumber,
        collectedData: JSON.stringify(collectedData),
        isCompleted: false,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 horas
      });
    } else {
      // 3. Actualizar flow existente
      console.log(`🔄 [HYBRID] Actualizando flow AI existente`);
      flow = await tenantStorage.updateRegistrationFlow(phoneNumber, {
        orderId,
        orderNumber,
        collectedData: JSON.stringify(collectedData),
        updatedAt: new Date()
      });
    }

    console.log(`✅ [HYBRID] Flow AI creado/actualizado - ID: ${flow.id}`);
    return flow;

  } catch (error) {
    console.error('❌ [HYBRID] Error creando/actualizando flow:', error);
    throw error;
  }
}

/**
 * Calcula el total de un carrito
 */
export function calculateCartTotal(cartItems: any[]): number {
  return cartItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
}

/**
 * Formatea un resumen del carrito para mostrar al usuario
 */
export function formatCartSummary(cartItems: any[]): string {
  if (!cartItems || cartItems.length === 0) {
    return '🛒 Tu carrito está vacío';
  }

  const total = calculateCartTotal(cartItems);
  const lines = cartItems.map(item =>
    `• ${item.productName} x${item.quantity} — RD$${item.totalPrice.toFixed(2)}`
  );

  return `🛒 **TU CARRITO**\n\n${lines.join('\n')}\n\n💰 **Total:** RD$${total.toFixed(2)}\n\n¿Deseas confirmar tu pedido?`;
}

/**
 * Verifica si un mensaje indica que el usuario quiere agregar más productos
 */
export function isAddingMoreProducts(messageText: string): boolean {
  const addKeywords = [
    'agregar',
    'añadir',
    'add',
    'quiero',
    'necesito',
    'dame',
    'más',
    'otro',
    'otra',
    'también'
  ];

  const messageLower = messageText.toLowerCase();
  return addKeywords.some(keyword => messageLower.includes(keyword));
}

/**
 * Log de diagnóstico del estado del flow
 */
export function logFlowState(flow: CustomerRegistrationFlow | null, prefix: string = '') {
  if (!flow) {
    console.log(`${prefix}📭 No hay flow activo`);
    return;
  }

  console.log(`${prefix}📋 FLOW STATE:`);
  console.log(`${prefix}  - ID: ${flow.id}`);
  console.log(`${prefix}  - Tipo: ${flow.flowType || 'null'}`);
  console.log(`${prefix}  - Paso: ${flow.currentStep}`);
  console.log(`${prefix}  - Orden: ${flow.orderId || 'null'}`);
  console.log(`${prefix}  - Completado: ${flow.isCompleted}`);
  console.log(`${prefix}  - Expira: ${flow.expiresAt}`);

  try {
    const data = JSON.parse(flow.collectedData || '{}');
    console.log(`${prefix}  - Items en carrito: ${data.cartItems?.length || 0}`);
  } catch (e) {
    console.log(`${prefix}  - Error parseando collectedData`);
  }
}
