/**
 * AI CONVERSATION CLEANUP
 *
 * Limpia conversaciones inconclusas de IA después de un período de inactividad
 * para evitar que estados antiguos interfieran con nuevas conversaciones
 */

import { AIConversationManager } from './ai-credits-manager';

interface CleanupConfig {
  inactivityThresholdMinutes: number; // Tiempo sin actividad antes de limpiar
  runIntervalMinutes: number; // Cada cuánto ejecutar la limpieza
}

const DEFAULT_CONFIG: CleanupConfig = {
  inactivityThresholdMinutes: 30, // 30 minutos de inactividad
  runIntervalMinutes: 15 // Ejecutar cada 15 minutos
};

/**
 * Limpia conversaciones IA inconclusas (con orderFlowStep activo pero sin actividad reciente)
 */
export async function cleanupIncompleteAIConversations(
  storeId: number,
  tenantStorage: any,
  config: CleanupConfig = DEFAULT_CONFIG
): Promise<number> {
  try {
    console.log(`🧹 [AI-CLEANUP] Iniciando limpieza de conversaciones inconclusas para tienda ${storeId}`);

    const thresholdDate = new Date(Date.now() - config.inactivityThresholdMinutes * 60 * 1000);
    console.log(`⏰ [AI-CLEANUP] Buscando conversaciones inactivas desde: ${thresholdDate.toISOString()}`);

    // Obtener todas las conversaciones AI activas de la tienda
    const conversations = await tenantStorage.getActiveAIConversations?.(storeId);

    if (!conversations || conversations.length === 0) {
      console.log(`✅ [AI-CLEANUP] No hay conversaciones activas para limpiar`);
      return 0;
    }

    console.log(`📊 [AI-CLEANUP] Encontradas ${conversations.length} conversaciones activas`);

    let cleanedCount = 0;

    for (const conversation of conversations) {
      // Verificar si tiene un flujo de orden activo (inconcluso)
      const hasActiveOrderFlow = conversation.orderFlowStep && conversation.orderFlowStep !== null;

      if (!hasActiveOrderFlow) {
        continue; // Solo limpiar conversaciones con flujos activos
      }

      // Verificar si está inactiva
      const lastActivity = conversation.updatedAt || conversation.createdAt;
      const isInactive = lastActivity < thresholdDate;

      if (isInactive) {
        console.log(`🧹 [AI-CLEANUP] Limpiando conversación ${conversation.conversationId}:`);
        console.log(`   - Último estado: ${conversation.orderFlowStep}`);
        console.log(`   - Última actividad: ${lastActivity.toISOString()}`);
        console.log(`   - Items en carrito: ${conversation.pendingOrder?.cartItems?.length || 0}`);

        // Limpiar el estado del flujo pero mantener el carrito por si acaso
        const cleanedConversation = {
          ...conversation,
          orderFlowStep: null,
          pendingOrder: undefined
          // Mantenemos cartItems por si el usuario quiere retomar
        };

        await tenantStorage.updateAIConversation?.(
          storeId,
          conversation.conversationId,
          cleanedConversation
        );

        cleanedCount++;
        console.log(`✅ [AI-CLEANUP] Conversación ${conversation.conversationId} limpiada`);
      }
    }

    console.log(`🎉 [AI-CLEANUP] Limpieza completada: ${cleanedCount} conversaciones limpiadas`);
    return cleanedCount;

  } catch (error) {
    console.error(`❌ [AI-CLEANUP] Error en limpieza:`, error);
    return 0;
  }
}

/**
 * Inicia el proceso de limpieza automática periódica
 */
export function startAIConversationCleanup(
  storeId: number,
  tenantStorage: any,
  config: CleanupConfig = DEFAULT_CONFIG
) {
  console.log(`🚀 [AI-CLEANUP] Iniciando limpieza automática para tienda ${storeId}`);
  console.log(`   - Umbral de inactividad: ${config.inactivityThresholdMinutes} minutos`);
  console.log(`   - Intervalo de ejecución: ${config.runIntervalMinutes} minutos`);

  // Ejecutar inmediatamente una vez
  cleanupIncompleteAIConversations(storeId, tenantStorage, config).catch(err => {
    console.error(`❌ [AI-CLEANUP] Error en ejecución inicial:`, err);
  });

  // Configurar ejecución periódica
  const intervalMs = config.runIntervalMinutes * 60 * 1000;
  const intervalId = setInterval(() => {
    cleanupIncompleteAIConversations(storeId, tenantStorage, config).catch(err => {
      console.error(`❌ [AI-CLEANUP] Error en ejecución periódica:`, err);
    });
  }, intervalMs);

  console.log(`✅ [AI-CLEANUP] Limpieza automática configurada (intervalo: ${intervalId})`);

  return intervalId;
}

/**
 * Detiene el proceso de limpieza automática
 */
export function stopAIConversationCleanup(intervalId: NodeJS.Timeout) {
  clearInterval(intervalId);
  console.log(`🛑 [AI-CLEANUP] Limpieza automática detenida`);
}
