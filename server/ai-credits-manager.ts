/**
 * AI CREDITS MANAGER
 *
 * Gestiona créditos de IA, conversaciones y registro de uso
 */

import { getMasterStorage } from './storage/index.js';
import { getTenantStorage } from './storage/index.js';
import { AICreditsConfig, AIUsageLogEntry, AIConversationState, CartItem } from './ai-credits-schema';

// ========================================
// GESTIÓN DE CRÉDITOS
// ========================================

export class AICreditsManager {
  /**
   * Verificar si una tienda tiene créditos disponibles
   * ✅ AHORA USA tenantStorage para respetar el esquema de la tienda
   */
  static async hasCredits(
    storeId: number,
    operation: 'message' | 'order' | 'voice',
    tenantStorage?: any  // ✅ Nuevo parámetro opcional
  ): Promise<boolean> {
    try {
      // ✅ Si no se proporciona tenantStorage, usar masterStorage como fallback
      let credits;
      if (tenantStorage) {
        console.log(`🔍 [AI-CREDITS] Usando tenantStorage para tienda ${storeId}`);
        credits = await tenantStorage.getAICredits();
      } else {
        console.log(`🔍 [AI-CREDITS] Usando masterStorage como fallback para tienda ${storeId}`);
        const masterStorage = await getMasterStorage();
        credits = await masterStorage.getAICredits(storeId);
      }

      console.log(`🔍 [AI-CREDITS] Verificando créditos para tienda ${storeId}:`, JSON.stringify(credits));

      if (!credits) {
        console.log(`ℹ️ [AI-CREDITS] No hay configuración de créditos para tienda ${storeId} → Usar auto-respuestas`);
        return false;
      }

      // ✅ CORREGIR: Verificar ambas formas (camelCase y snake_case)
      const isEnabled = credits.isEnabled || credits.is_enabled;
      if (!isEnabled) {
        console.log(`ℹ️ [AI-CREDITS] IA deshabilitada para tienda ${storeId} → Usar auto-respuestas`);
        return false;
      }

      const costMap = {
        message: credits.costPerMessage || credits.cost_per_message || 1,
        order: credits.costPerOrder || credits.cost_per_order || 5,
        voice: credits.costPerVoiceNote || credits.cost_per_voice_note || 10
      };

      const cost = costMap[operation];
      const available = credits.availableCredits || credits.available_credits || 0;
      const hasEnough = available >= cost;

      console.log(`💰 [AI-CREDITS] Tienda ${storeId} - Op: ${operation}, Costo: ${cost}, Disponibles: ${available}, ¿Suficiente?: ${hasEnough}`);

      if (hasEnough) {
        console.log(`✅ [AI-CREDITS] Créditos SUFICIENTES - Activar IA`);
        return true;
      } else {
        console.log(`ℹ️ [AI-CREDITS] Créditos insuficientes (${available} < ${cost}) → Usar auto-respuestas`);
        return false;
      }
    } catch (error) {
      console.error('❌ [AI-CREDITS] Error verificando créditos:', error);
      return false;
    }
  }

  /**
   * Consumir créditos
   */
  static async consumeCredits(
    storeId: number,
    operation: 'message' | 'order' | 'voice',
    details?: AIUsageLogEntry
  ): Promise<boolean> {
    try {
      const masterStorage = await getMasterStorage();
      const credits = await masterStorage.getAICredits(storeId);

      if (!credits) {
        throw new Error('Configuración de créditos no encontrada');
      }

      const costMap = {
        message: credits.costPerMessage || 1,
        order: credits.costPerOrder || 5,
        voice: credits.costPerVoiceNote || 10
      };

      const cost = costMap[operation];

      // Verificar disponibilidad
      if (credits.availableCredits < cost) {
        console.error(`❌ Créditos insuficientes para ${operation}`);
        return false;
      }

      // Consumir créditos
      await masterStorage.updateAICredits(storeId, {
        usedCredits: credits.usedCredits + cost,
        availableCredits: credits.availableCredits - cost,
        lastUsage: new Date(),
        // Actualizar estadísticas
        ...(operation === 'message' && {
          totalMessagesProcessed: (credits.totalMessagesProcessed || 0) + 1
        }),
        ...(operation === 'order' && {
          totalOrdersCreated: (credits.totalOrdersCreated || 0) + 1
        }),
        ...(operation === 'voice' && {
          totalVoiceNotesTranscribed: (credits.totalVoiceNotesTranscribed || 0) + 1
        })
      });

      // Registrar uso en log (si hay detalles)
      if (details) {
        const tenantStorage = await getTenantStorage(storeId);
        await tenantStorage.logAIUsage({
          ...details,
          storeId,
          creditsCost: cost,
          createdAt: new Date()
        });
      }

      console.log(`✅ Consumidos ${cost} créditos. Restantes: ${credits.availableCredits - cost}`);

      // Verificar si necesita notificación de créditos bajos
      if (credits.notifyLowCredits && (credits.availableCredits - cost) <= (credits.lowCreditThreshold || 50)) {
        await this.notifyLowCredits(storeId, credits.availableCredits - cost);
      }

      return true;
    } catch (error) {
      console.error('Error consumiendo créditos:', error);
      return false;
    }
  }

  /**
   * Recargar créditos
   */
  static async rechargeCredits(storeId: number, amount: number): Promise<boolean> {
    try {
      const masterStorage = await getMasterStorage();
      const credits = await masterStorage.getAICredits(storeId);

      if (!credits) {
        throw new Error('Configuración de créditos no encontrada');
      }

      await masterStorage.updateAICredits(storeId, {
        totalCredits: credits.totalCredits + amount,
        availableCredits: credits.availableCredits + amount,
        lastRecharge: new Date()
      });

      console.log(`💳 Recargados ${amount} créditos para tienda ${storeId}`);
      return true;
    } catch (error) {
      console.error('Error recargando créditos:', error);
      return false;
    }
  }

  /**
   * Notificar créditos bajos
   */
  private static async notifyLowCredits(storeId: number, remainingCredits: number): Promise<void> {
    console.warn(`⚠️ ALERTA: Tienda ${storeId} tiene solo ${remainingCredits} créditos restantes`);
    // Aquí podrías enviar email, notificación, etc.
  }

  /**
   * Obtener estadísticas de uso
   */
  static async getUsageStats(storeId: number, days: number = 30): Promise<any> {
    try {
      const tenantStorage = await getTenantStorage(storeId);
      const stats = await tenantStorage.getAIUsageStats(days);
      return stats;
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      return null;
    }
  }
}

// ========================================
// GESTIÓN DE CONVERSACIONES CON IA
// ========================================

export class AIConversationManager {
  /**
   * Iniciar conversación con IA
   */
  static async startConversation(
    storeId: number,
    conversationId: number,
    customerId: number,
    customerPhone: string
  ): Promise<AIConversationState | null> {
    try {
      const tenantStorage = await getTenantStorage(storeId);

      // Verificar si ya existe conversación activa
      let aiConversation = await tenantStorage.getAIConversation(conversationId);

      if (!aiConversation) {
        // Crear nueva conversación
        aiConversation = await tenantStorage.createAIConversation({
          storeId,
          conversationId,
          customerId,
          customerPhone,
          isActive: true,
          mode: 'assistant',
          messageCount: 0,
          startedAt: new Date()
        });
      }

      console.log(`🤖 Conversación IA iniciada - ID: ${aiConversation.id}`);

      return {
        conversationId: aiConversation.conversationId,
        customerId: aiConversation.customerId,
        mode: aiConversation.mode as any,
        cartItems: aiConversation.cartItems ? JSON.parse(aiConversation.cartItems) : [],
        currentIntent: aiConversation.currentIntent || undefined
      };
    } catch (error) {
      console.error('Error iniciando conversación IA:', error);
      return null;
    }
  }

  /**
   * Obtener conversación activa
   */
  static async getActiveConversation(
    storeId: number,
    conversationId: number
  ): Promise<AIConversationState | null> {
    try {
      const tenantStorage = await getTenantStorage(storeId);
      const aiConversation = await tenantStorage.getAIConversation(conversationId);

      if (!aiConversation || !aiConversation.isActive) {
        return null;
      }

      return {
        conversationId: aiConversation.conversationId,
        customerId: aiConversation.customerId,
        mode: aiConversation.mode as any,
        cartItems: aiConversation.cartItems ? JSON.parse(aiConversation.cartItems) : [],
        currentIntent: aiConversation.currentIntent || undefined
      };
    } catch (error) {
      console.error('Error obteniendo conversación:', error);
      return null;
    }
  }

  /**
   * Actualizar carrito en conversación
   */
  static async updateCart(
    storeId: number,
    conversationId: number,
    cartItems: CartItem[]
  ): Promise<void> {
    try {
      const tenantStorage = await getTenantStorage(storeId);

      await tenantStorage.updateAIConversation(conversationId, {
        cartItems: JSON.stringify(cartItems),
        messageCount: await this.incrementMessageCount(storeId, conversationId),
        lastMessageAt: new Date(),
        updatedAt: new Date()
      });

      console.log(`🛒 Carrito actualizado - ${cartItems.length} items`);
    } catch (error) {
      console.error('Error actualizando carrito:', error);
    }
  }

  /**
   * Cambiar modo de conversación
   */
  static async setMode(
    storeId: number,
    conversationId: number,
    mode: 'assistant' | 'order_taking' | 'product_search' | 'support'
  ): Promise<void> {
    try {
      const tenantStorage = await getTenantStorage(storeId);

      await tenantStorage.updateAIConversation(conversationId, {
        mode,
        updatedAt: new Date()
      });

      console.log(`🔄 Modo cambiado a: ${mode}`);
    } catch (error) {
      console.error('Error cambiando modo:', error);
    }
  }

  /**
   * Finalizar conversación
   */
  static async endConversation(
    storeId: number,
    conversationId: number
  ): Promise<void> {
    try {
      const tenantStorage = await getTenantStorage(storeId);

      await tenantStorage.updateAIConversation(conversationId, {
        isActive: false,
        endedAt: new Date(),
        updatedAt: new Date()
      });

      console.log(`✅ Conversación IA finalizada - ID: ${conversationId}`);
    } catch (error) {
      console.error('Error finalizando conversación:', error);
    }
  }

  /**
   * Incrementar contador de mensajes
   */
  private static async incrementMessageCount(
    storeId: number,
    conversationId: number
  ): Promise<number> {
    try {
      const tenantStorage = await getTenantStorage(storeId);
      const aiConversation = await tenantStorage.getAIConversation(conversationId);

      if (!aiConversation) return 1;

      return (aiConversation.messageCount || 0) + 1;
    } catch (error) {
      return 1;
    }
  }

  /**
   * Guardar contexto de conversación
   */
  static async saveContext(
    storeId: number,
    conversationId: number,
    context: any
  ): Promise<void> {
    try {
      const tenantStorage = await getTenantStorage(storeId);

      await tenantStorage.updateAIConversation(conversationId, {
        conversationContext: JSON.stringify(context),
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Error guardando contexto:', error);
    }
  }
}

// ========================================
// UTILIDADES
// ========================================

/**
 * Verificar si se debe usar IA para este mensaje
 */
export async function shouldUseAI(
  storeId: number,
  messageText: string,
  isAfterWelcome: boolean = false,
  isAfterCatalog: boolean = false,
  isHelpMode: boolean = false,  // ✅ Nuevo: si el usuario pidió ayuda
  tenantStorage?: any  // ✅ Parámetro opcional para tenant-aware credits check
): Promise<boolean> {
  // Verificar créditos disponibles
  const hasCredits = await AICreditsManager.hasCredits(storeId, 'message', tenantStorage);

  if (!hasCredits) {
    console.log('⚠️ Sin créditos disponibles para IA');
    return false;
  }

  // Condiciones para usar IA:
  // 1. Después del mensaje de bienvenida
  // 2. Después del catálogo de productos
  // 3. Cuando el usuario solicitó ayuda (Help Mode)
  // 4. Si no respondió con opciones esperadas

  if (isAfterWelcome || isAfterCatalog || isHelpMode) {
    console.log(`✅ Usando IA - flujo cumplido (welcome: ${isAfterWelcome}, catalog: ${isAfterCatalog}, help: ${isHelpMode})`);
    return true;
  }

  // Si el mensaje parece ser un pedido o pregunta compleja
  const looksComplex = messageText.length > 20 &&
    (messageText.includes('?') ||
     messageText.toLowerCase().includes('quiero') ||
     messageText.toLowerCase().includes('necesito'));

  return looksComplex;
}
