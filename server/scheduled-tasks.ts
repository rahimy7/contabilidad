import { getTenantStorage } from './storage/index.js';
import { db } from './db.js';
import { cleanupIncompleteAIConversations } from './ai-conversation-cleanup.js';
import { startStorageUpdateJob, startStorageLimitCheckJob } from './jobs/storage-jobs.js';

/**
 * 🕐 Tareas programadas para limpieza automática
 */

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
 * Limpiar conversaciones antiguas para todas las tiendas activas
 */
async function cleanupAllStoresConversations() {
  try {
    console.log('\n🧹 ===== STARTING SCHEDULED CONVERSATIONS CLEANUP =====');
    console.log(`⏰ ${new Date().toISOString()}`);
    
    const stores = await db.query.virtualStores.findMany({
      where: (stores, { eq }) => eq(stores.isActive, true)
    });
    
    console.log(`🏪 Found ${stores.length} active stores`);
    
    let totalConversationsDeleted = 0;
    let totalMessagesDeleted = 0;
    let successCount = 0;
    let errorCount = 0;
    
    for (const store of stores) {
      try {
        console.log(`\n🔄 Processing store: ${store.name} (ID: ${store.id})`);
        
        const tenantStorage = await getTenantStorage(store.id);
        const result = await tenantStorage.cleanupOldConversations(RETENTION_DAYS.CONVERSATIONS);
        
        totalConversationsDeleted += result.conversationsDeleted;
        totalMessagesDeleted += result.messagesDeleted;
        successCount++;
        
        if (result.conversationsDeleted > 0 || result.messagesDeleted > 0) {
          console.log(`✅ Store ${store.id}: ${result.conversationsDeleted} conversations, ${result.messagesDeleted} messages deleted`);
        } else {
          console.log(`✅ Store ${store.id}: No old conversations to clean`);
        }
        
      } catch (storeError) {
        errorCount++;
        console.error(`❌ Error processing store ${store.id} (${store.name}):`, storeError.message);
        // Continuar con la siguiente tienda
      }
    }
    
    console.log('\n📊 ===== CLEANUP SUMMARY =====');
    console.log(`✅ Stores processed successfully: ${successCount}/${stores.length}`);
    if (errorCount > 0) {
      console.log(`❌ Stores with errors: ${errorCount}`);
    }
    console.log(`🗑️ Total conversations deleted: ${totalConversationsDeleted}`);
    console.log(`💬 Total messages deleted: ${totalMessagesDeleted}`);
    console.log(`✅ Cleanup completed at: ${new Date().toISOString()}\n`);
    
    return { totalConversationsDeleted, totalMessagesDeleted, successCount, errorCount };
    
  } catch (error) {
    console.error('❌ Error in scheduled conversations cleanup:', error);
    return { totalConversationsDeleted: 0, totalMessagesDeleted: 0, successCount: 0, errorCount: 0 };
  }
}

/**
 * Limpiar flujos de registro expirados
 */
async function cleanupAllStoresRegistrationFlows() {
  try {
    console.log('\n🧹 ===== STARTING SCHEDULED FLOWS CLEANUP =====');
    
    const stores = await db.query.virtualStores.findMany({
      where: (stores, { eq }) => eq(stores.isActive, true)
    });
    
    let totalFlowsDeleted = 0;
    let successCount = 0;
    let errorCount = 0;
    
    for (const store of stores) {
      try {
        const tenantStorage = await getTenantStorage(store.id);
        const flowsDeleted = await tenantStorage.cleanupExpiredRegistrationFlows();
        totalFlowsDeleted += flowsDeleted;
        successCount++;
        
        if (flowsDeleted > 0) {
          console.log(`✅ Store ${store.id}: ${flowsDeleted} expired flows deleted`);
        }
      } catch (error) {
        errorCount++;
        console.error(`❌ Error cleaning flows for store ${store.id}:`, error.message);
      }
    }
    
    console.log(`\n✅ Total expired flows deleted: ${totalFlowsDeleted}`);
    console.log(`✅ Stores processed: ${successCount}/${stores.length}${errorCount > 0 ? ` (${errorCount} errors)` : ''}\n`);
    return { totalFlowsDeleted, successCount, errorCount };
    
  } catch (error) {
    console.error('❌ Error in scheduled flows cleanup:', error);
    return { totalFlowsDeleted: 0, successCount: 0, errorCount: 0 };
  }
}

/**
 * Limpiar conversaciones AI inconclusas (después de 30 minutos de inactividad)
 */
async function cleanupAllStoresAIConversations() {
  try {
    console.log('\n🧹 ===== STARTING SCHEDULED AI CONVERSATIONS CLEANUP =====');
    console.log(`⏰ ${new Date().toISOString()}`);

    const stores = await db.query.virtualStores.findMany({
      where: (stores, { eq }) => eq(stores.isActive, true)
    });

    console.log(`🏪 Found ${stores.length} active stores`);

    let totalConversationsCleaned = 0;
    let successCount = 0;
    let errorCount = 0;

    for (const store of stores) {
      try {
        console.log(`\n🔄 Processing AI cleanup for store: ${store.name} (ID: ${store.id})`);

        const tenantStorage = await getTenantStorage(store.id);
        const cleaned = await cleanupIncompleteAIConversations(
          store.id,
          tenantStorage,
          {
            inactivityThresholdMinutes: 30, // Limpiar después de 30 min de inactividad
            runIntervalMinutes: 30 // Se ejecutará cada 30 min automáticamente
          }
        );

        totalConversationsCleaned += cleaned;
        successCount++;

        if (cleaned > 0) {
          console.log(`✅ Store ${store.id}: ${cleaned} AI conversations cleaned`);
        } else {
          console.log(`✅ Store ${store.id}: No inactive AI conversations to clean`);
        }

      } catch (storeError) {
        errorCount++;
        console.error(`❌ Error processing AI cleanup for store ${store.id} (${store.name}):`, storeError.message);
        // Continuar con la siguiente tienda
      }
    }

    console.log('\n📊 ===== AI CLEANUP SUMMARY =====');
    console.log(`✅ Stores processed successfully: ${successCount}/${stores.length}`);
    if (errorCount > 0) {
      console.log(`❌ Stores with errors: ${errorCount}`);
    }
    console.log(`🗑️ Total AI conversations cleaned: ${totalConversationsCleaned}`);
    console.log(`✅ AI cleanup completed at: ${new Date().toISOString()}\n`);

    return { totalConversationsCleaned, successCount, errorCount };

  } catch (error) {
    console.error('❌ Error in scheduled AI conversations cleanup:', error);
    return { totalConversationsCleaned: 0, successCount: 0, errorCount: 0 };
  }
}

/**
 * Limpiar datos huérfanos
 */
async function cleanupAllStoresOrphanData() {
  try {
    console.log('\n🧹 ===== STARTING ORPHAN DATA CLEANUP =====');
    
    const stores = await db.query.virtualStores.findMany({
      where: (stores, { eq }) => eq(stores.isActive, true)
    });
    
    let totalConversationsFixed = 0;
    let totalMessagesFixed = 0;
    let successCount = 0;
    let errorCount = 0;
    
    for (const store of stores) {
      try {
        const tenantStorage = await getTenantStorage(store.id);
        const result = await tenantStorage.cleanupOrphanData();
        
        totalConversationsFixed += result.conversationsFixed;
        totalMessagesFixed += result.messagesFixed;
        successCount++;
        
        if (result.conversationsFixed > 0 || result.messagesFixed > 0) {
          console.log(`✅ Store ${store.id}: ${result.conversationsFixed} conversations, ${result.messagesFixed} messages fixed`);
        }
      } catch (error) {
        errorCount++;
        console.error(`❌ Error cleaning orphan data for store ${store.id}:`, error.message);
      }
    }
    
    console.log(`\n✅ Total orphan data fixed: ${totalConversationsFixed} conversations, ${totalMessagesFixed} messages`);
    console.log(`✅ Stores processed: ${successCount}/${stores.length}${errorCount > 0 ? ` (${errorCount} errors)` : ''}\n`);
    return { totalConversationsFixed, totalMessagesFixed, successCount, errorCount };
    
  } catch (error) {
    console.error('❌ Error in orphan data cleanup:', error);
    return { totalConversationsFixed: 0, totalMessagesFixed: 0, successCount: 0, errorCount: 0 };
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
    cleanupAllStoresAIConversations(); // ✅ Agregar limpieza de AI
  }, 60 * 1000);

  console.log('✅ All scheduled tasks started successfully\n');
}

/**
 * Ejecutar limpieza manual
 */
export async function runManualCleanup(daysOld: number = 7) {
  console.log(`\n🧹 Running manual cleanup for conversations older than ${daysOld} days...`);
  
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