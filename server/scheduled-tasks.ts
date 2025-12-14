// server/scheduled-tasks.ts
// Versión simplificada para tienda única (4Life Bella Vista)

import { getTenantStorage } from './storage/index.js';
import { cleanupIncompleteAIConversations } from './ai-conversation-cleanup.js';
import { startStorageUpdateJob, startStorageLimitCheckJob } from './jobs/storage-jobs.js';

/**
 * 🕐 Tareas programadas para limpieza automática - Tienda Única
 */

// ID fijo de la tienda única
const SINGLE_STORE_ID = 1;
const STORE_NAME = '4Life Bella Vista';

// Configuración de intervalos
const CLEANUP_INTERVALS = {
  CONVERSATIONS: 24 * 60 * 60 * 1000, // 24 horas
  REGISTRATION_FLOWS: 6 * 60 * 60 * 1000, // 6 horas
  ORPHAN_DATA: 12 * 60 * 60 * 1000, // 12 horas
  AI_CONVERSATIONS: 30 * 60 * 1000, // 30 minutos - Limpiar conversaciones AI inconclusas
};

// Configuración de retención
const RETENTION_DAYS = {
  CONVERSATIONS: 7, // Conservar conversaciones por 7 días
  REGISTRATION_FLOWS: 1, // Conservar flujos expirados por 1 día
};

/**
 * Limpiar conversaciones antiguas (tienda única)
 */
async function cleanupAllStoresConversations() {
  try {
    console.log('\n🧹 ===== STARTING SCHEDULED CONVERSATIONS CLEANUP =====');
    console.log(`⏰ ${new Date().toISOString()}`);
    console.log(`🏪 Cleaning store: ${STORE_NAME} (ID: ${SINGLE_STORE_ID})`);

    const tenantStorage = await getTenantStorage(SINGLE_STORE_ID);
    const result = await tenantStorage.cleanupOldConversations(RETENTION_DAYS.CONVERSATIONS);

    if (result.conversationsDeleted > 0 || result.messagesDeleted > 0) {
      console.log(`✅ ${result.conversationsDeleted} conversations, ${result.messagesDeleted} messages deleted`);
    } else {
      console.log(`✅ No old conversations to clean`);
    }

    console.log(`✅ Cleanup completed at: ${new Date().toISOString()}\n`);

    return {
      totalConversationsDeleted: result.conversationsDeleted,
      totalMessagesDeleted: result.messagesDeleted,
      successCount: 1,
      errorCount: 0
    };

  } catch (error) {
    console.error('❌ Error in scheduled conversations cleanup:', error);
    return {
      totalConversationsDeleted: 0,
      totalMessagesDeleted: 0,
      successCount: 0,
      errorCount: 1
    };
  }
}

/**
 * Limpiar flujos de registro expirados (tienda única)
 */
async function cleanupAllStoresRegistrationFlows() {
  try {
    console.log('\n🧹 ===== STARTING SCHEDULED FLOWS CLEANUP =====');
    console.log(`🏪 Cleaning store: ${STORE_NAME} (ID: ${SINGLE_STORE_ID})`);

    const tenantStorage = await getTenantStorage(SINGLE_STORE_ID);
    const flowsDeleted = await tenantStorage.cleanupExpiredRegistrationFlows();

    if (flowsDeleted > 0) {
      console.log(`✅ ${flowsDeleted} expired flows deleted`);
    } else {
      console.log(`✅ No expired flows to clean`);
    }

    return {
      totalFlowsDeleted: flowsDeleted,
      successCount: 1,
      errorCount: 0
    };

  } catch (error) {
    console.error('❌ Error in scheduled flows cleanup:', error);
    return {
      totalFlowsDeleted: 0,
      successCount: 0,
      errorCount: 1
    };
  }
}

/**
 * Limpiar conversaciones AI inconclusas (tienda única)
 */
async function cleanupAllStoresAIConversations() {
  try {
    console.log('\n🧹 ===== STARTING SCHEDULED AI CONVERSATIONS CLEANUP =====');
    console.log(`⏰ ${new Date().toISOString()}`);
    console.log(`🏪 Cleaning AI conversations for: ${STORE_NAME} (ID: ${SINGLE_STORE_ID})`);

    const tenantStorage = await getTenantStorage(SINGLE_STORE_ID);
    const cleaned = await cleanupIncompleteAIConversations(
      SINGLE_STORE_ID,
      tenantStorage,
      {
        inactivityThresholdMinutes: 30, // Limpiar después de 30 min de inactividad
        runIntervalMinutes: 30 // Se ejecutará cada 30 min automáticamente
      }
    );

    if (cleaned > 0) {
      console.log(`✅ ${cleaned} AI conversations cleaned`);
    } else {
      console.log(`✅ No inactive AI conversations to clean`);
    }

    console.log(`✅ AI cleanup completed at: ${new Date().toISOString()}\n`);

    return {
      totalConversationsCleaned: cleaned,
      successCount: 1,
      errorCount: 0
    };

  } catch (error) {
    console.error('❌ Error in scheduled AI conversations cleanup:', error);
    return {
      totalConversationsCleaned: 0,
      successCount: 0,
      errorCount: 1
    };
  }
}

/**
 * Limpiar datos huérfanos (tienda única)
 */
async function cleanupAllStoresOrphanData() {
  try {
    console.log('\n🧹 ===== STARTING ORPHAN DATA CLEANUP =====');
    console.log(`🏪 Cleaning orphan data for: ${STORE_NAME} (ID: ${SINGLE_STORE_ID})`);

    const tenantStorage = await getTenantStorage(SINGLE_STORE_ID);
    const result = await tenantStorage.cleanupOrphanData();

    if (result.conversationsFixed > 0 || result.messagesFixed > 0) {
      console.log(`✅ ${result.conversationsFixed} conversations, ${result.messagesFixed} messages fixed`);
    } else {
      console.log(`✅ No orphan data to clean`);
    }

    return {
      totalConversationsFixed: result.conversationsFixed,
      totalMessagesFixed: result.messagesFixed,
      successCount: 1,
      errorCount: 0
    };

  } catch (error) {
    console.error('❌ Error in orphan data cleanup:', error);
    return {
      totalConversationsFixed: 0,
      totalMessagesFixed: 0,
      successCount: 0,
      errorCount: 1
    };
  }
}

/**
 * Iniciar todas las tareas programadas
 */
export function startScheduledTasks() {
  console.log('\n🚀 ===== STARTING SCHEDULED TASKS =====');
  console.log(`⏰ Current time: ${new Date().toISOString()}`);

  // 1️⃣ Limpiar conversaciones antiguas cada 24 horas
  console.log(`📅 Conversations cleanup: Every ${CLEANUP_INTERVALS.CONVERSATIONS / (60 * 60 * 1000)} hours`);
  setInterval(cleanupAllStoresConversations, CLEANUP_INTERVALS.CONVERSATIONS);

  // 2️⃣ Limpiar flujos expirados cada 6 horas
  console.log(`📅 Registration flows cleanup: Every ${CLEANUP_INTERVALS.REGISTRATION_FLOWS / (60 * 60 * 1000)} hours`);
  setInterval(cleanupAllStoresRegistrationFlows, CLEANUP_INTERVALS.REGISTRATION_FLOWS);

  // 3️⃣ Limpiar datos huérfanos cada 12 horas
  console.log(`📅 Orphan data cleanup: Every ${CLEANUP_INTERVALS.ORPHAN_DATA / (60 * 60 * 1000)} hours`);
  setInterval(cleanupAllStoresOrphanData, CLEANUP_INTERVALS.ORPHAN_DATA);

  // 4️⃣ Limpiar conversaciones AI inconclusas cada 30 minutos
  console.log(`📅 AI conversations cleanup: Every ${CLEANUP_INTERVALS.AI_CONVERSATIONS / (60 * 1000)} minutes`);
  setInterval(cleanupAllStoresAIConversations, CLEANUP_INTERVALS.AI_CONVERSATIONS);

  // 5️⃣ Iniciar cron jobs de facturación
  startBillingCronJobs();

  // 6️⃣ Iniciar cron jobs de cálculo de almacenamiento
  console.log('📅 Storage update job: Daily at 3:00 AM');
  startStorageUpdateJob();

  console.log('📅 Storage limit check job: Every hour');
  startStorageLimitCheckJob();

  // Ejecutar limpieza inicial después de 1 minuto
  console.log('⏳ Running initial cleanup in 1 minute...');
  setTimeout(() => {
    cleanupAllStoresConversations();
    cleanupAllStoresRegistrationFlows();
    cleanupAllStoresOrphanData();
    cleanupAllStoresAIConversations();
  }, 60 * 1000);

  console.log('✅ All scheduled tasks started successfully\n');
}

/**
 * Ejecutar limpieza manual
 */
export async function runManualCleanup(daysOld: number = 7) {
  console.log(`\n🧹 Running manual cleanup for conversations older than ${daysOld} days...`);
  console.log(`🏪 Store: ${STORE_NAME} (ID: ${SINGLE_STORE_ID})`);

  const conversations = await cleanupAllStoresConversations();
  const flows = await cleanupAllStoresRegistrationFlows();
  const orphans = await cleanupAllStoresOrphanData();

  return {
    conversations,
    flows,
    orphans
  };
}

/**
 * Placeholder para cron jobs de facturación
 * Estos serán restaurados cuando los servicios de billing estén disponibles
 */
export function startBillingCronJobs() {
  console.log('🚀 Billing cron jobs placeholder - services not available');
}

export {
  cleanupAllStoresConversations,
  cleanupAllStoresRegistrationFlows,
  cleanupAllStoresOrphanData,
  cleanupAllStoresAIConversations
};
