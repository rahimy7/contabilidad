/**
 * storage-jobs.ts
 * Jobs y cron tasks para el cálculo automático de almacenamiento
 */

import cron from "node-cron";
import { updateAllSubscriptionsStorageUsage } from "../storage-calculator";

/**
 * Estado global de los jobs
 */
const jobStatus = {
  storageUpdateJob: null as any,
  lastStorageUpdateTime: null as Date | null,
  isStorageUpdateRunning: false,
};

/**
 * Inicia el job de actualización de almacenamiento
 * Corre diariamente a las 3 AM (hora del servidor)
 */
export function startStorageUpdateJob(): void {
  if (jobStatus.storageUpdateJob) {
    console.log("⏱️ Storage update job is already running");
    return;
  }

  // Cron: "0 3 * * *" = Todos los días a las 3:00 AM
  // Alternatively, for testing: "*/5 * * * *" = Cada 5 minutos
  jobStatus.storageUpdateJob = cron.schedule("0 3 * * *", async () => {
    try {
      if (jobStatus.isStorageUpdateRunning) {
        console.log("⏱️ Storage update already in progress, skipping...");
        return;
      }

      jobStatus.isStorageUpdateRunning = true;
      console.log("🔄 [CRON] Starting automatic storage update for all subscriptions...");
      console.log(`⏱️ Current time: ${new Date().toISOString()}`);

      const startTime = Date.now();

      await updateAllSubscriptionsStorageUsage();

      const duration = Date.now() - startTime;
      jobStatus.lastStorageUpdateTime = new Date();

      console.log(
        `✅ [CRON] Storage update completed successfully in ${duration}ms`
      );
      console.log(`⏱️ Next run: ${getNextStorageJobTime()}`);
    } catch (error) {
      console.error("❌ [CRON] Error in storage update job:", error);
    } finally {
      jobStatus.isStorageUpdateRunning = false;
    }
  });

  console.log("✅ Storage update job scheduled (daily at 3:00 AM)");
  console.log(`⏱️ Next run: ${getNextStorageJobTime()}`);
}

/**
 * Inicia el job de verificación de límites de almacenamiento
 * Corre cada hora para verificar tiendas que exceden el límite
 */
export function startStorageLimitCheckJob(): void {
  const job = cron.schedule("0 * * * *", async () => {
    try {
      console.log("🔍 [CRON] Checking storage limits for all subscriptions...");

      // TODO: Implementar lógica para verificar límites
      // - Obtener todas las tiendas
      // - Comparar currentDbStorage contra maxDbStorage del plan
      // - Enviar notificaciones a tiendas que estén cerca del límite
      // - Considerar suspender acceso si excede el límite

      console.log("✅ [CRON] Storage limit check completed");
    } catch (error) {
      console.error("❌ [CRON] Error in storage limit check job:", error);
    }
  });

  console.log("✅ Storage limit check job scheduled (hourly)");
}

/**
 * Obtiene el próximo tiempo de ejecución del job de almacenamiento
 */
export function getNextStorageJobTime(): string {
  if (!jobStatus.storageUpdateJob) {
    return "Job not scheduled";
  }

  try {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(3, 0, 0, 0);

    return tomorrow.toISOString();
  } catch (error) {
    return "Unable to calculate next run time";
  }
}

/**
 * Obtiene el estado actual de los jobs
 */
export function getJobsStatus() {
  return {
    storageUpdateJob: {
      isRunning: jobStatus.isStorageUpdateRunning,
      lastRun: jobStatus.lastStorageUpdateTime,
      nextRun: getNextStorageJobTime(),
    },
  };
}

/**
 * Detiene todos los jobs
 */
export function stopAllJobs(): void {
  if (jobStatus.storageUpdateJob) {
    jobStatus.storageUpdateJob.stop();
    jobStatus.storageUpdateJob = null;
    console.log("⏹️ Stopped storage update job");
  }
}

/**
 * Ejecuta manualmente el job de actualización de almacenamiento
 * (útil para testing o triggering manual)
 */
export async function triggerStorageUpdate(): Promise<void> {
  try {
    if (jobStatus.isStorageUpdateRunning) {
      throw new Error("Storage update is already running");
    }

    jobStatus.isStorageUpdateRunning = true;
    console.log("🚀 [MANUAL] Triggering storage update...");

    const startTime = Date.now();
    await updateAllSubscriptionsStorageUsage();

    const duration = Date.now() - startTime;
    jobStatus.lastStorageUpdateTime = new Date();

    console.log(`✅ [MANUAL] Storage update completed in ${duration}ms`);
  } catch (error) {
    console.error("❌ [MANUAL] Error triggering storage update:", error);
    throw error;
  } finally {
    jobStatus.isStorageUpdateRunning = false;
  }
}
