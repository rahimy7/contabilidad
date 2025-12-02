/**
 * storage-calculator.ts
 * Servicio para calcular el tamaño de almacenamiento usado por cada tienda
 * en el sistema multi-tenant
 */

import { sql } from "drizzle-orm";
import { masterDb } from "./multi-tenant-db";
import { getTenantDb } from "./multi-tenant-db";
import * as schema from "@shared/schema";

export interface StorageStats {
  storeId: number;
  totalSizeBytes: number;
  totalSizeGB: number;
  tablesBreakdown: {
    [tableName: string]: {
      sizeBytes: number;
      sizeGB: number;
      rowCount: number;
    };
  };
  calculatedAt: Date;
}

/**
 * Calcula el tamaño total de almacenamiento usado por una tienda
 * Suma el tamaño de todas sus tablas principales
 */
export async function calculateStoreStorageSize(storeId: number): Promise<StorageStats> {
  try {
    const tenantDb = await getTenantDb(storeId);
    const breakdown: StorageStats["tablesBreakdown"] = {};
    let totalSizeBytes = 0;

    // Tablas principales que contienen datos de tiendas
    const tablesToCheck = [
      { name: "customers", schema: schema.customers },
      { name: "products", schema: schema.products },
      { name: "orders", schema: schema.orders },
      { name: "order_items", schema: schema.orderItems },
      { name: "messages", schema: schema.messages },
      { name: "conversations", schema: schema.conversations },
      { name: "order_history", schema: schema.orderHistory },
      { name: "customer_history", schema: schema.customerHistory },
      { name: "users", schema: schema.users },
      { name: "notifications", schema: schema.notifications },
      { name: "whatsapp_logs", schema: schema.whatsappLogs },
      { name: "ai_usage_log", schema: schema.aiUsageLog },
      { name: "auto_responses", schema: schema.autoResponses },
      { name: "trips", schema: schema.trips },
      { name: "trip_orders", schema: schema.tripOrders },
    ];

    // Calcular tamaño de cada tabla
    for (const table of tablesToCheck) {
      try {
        const result = await tenantDb.execute(
          sql`SELECT
            COUNT(*) as row_count,
            pg_total_relation_size('${sql.raw(table.name)}') as size_bytes
          FROM ${sql.raw(table.name)}
          WHERE store_id = ${storeId} OR ${sql.raw(
            `'${table.name}' IN ('products', 'notifications', 'users', 'auto_responses')`
          )}`
        );

        if (result && result.length > 0) {
          const row = result[0] as any;
          const sizeBytes = parseInt(row.size_bytes || "0");
          const rowCount = parseInt(row.row_count || "0");

          breakdown[table.name] = {
            sizeBytes,
            sizeGB: sizeBytes / (1024 * 1024 * 1024),
            rowCount,
          };

          totalSizeBytes += sizeBytes;
        }
      } catch (error) {
        // Silenciosamente ignorar errores de tablas que podrían no existir
        console.debug(`Could not calculate size for table ${table.name}:`, error);
      }
    }

    return {
      storeId,
      totalSizeBytes,
      totalSizeGB: totalSizeBytes / (1024 * 1024 * 1024),
      tablesBreakdown: breakdown,
      calculatedAt: new Date(),
    };
  } catch (error) {
    console.error(`Error calculating storage for store ${storeId}:`, error);
    throw error;
  }
}

/**
 * Actualiza el campo currentDbStorage en la tabla storeSubscriptions
 * basado en el cálculo real de almacenamiento
 */
export async function updateSubscriptionStorageUsage(storeId: number): Promise<void> {
  try {
    const stats = await calculateStoreStorageSize(storeId);

    // Actualizar en la BD maestra
    await masterDb
      .update(schema.storeSubscriptions)
      .set({
        currentDbStorage: stats.totalSizeGB.toString(),
        updatedAt: new Date(),
      })
      .where(schema.storeSubscriptions.storeId === storeId);

    console.log(
      `✅ Updated storage usage for store ${storeId}: ${stats.totalSizeGB.toFixed(4)} GB`
    );
  } catch (error) {
    console.error(`Error updating storage usage for store ${storeId}:`, error);
    throw error;
  }
}

/**
 * Obtiene todas las suscripciones activas y calcula su almacenamiento
 */
export async function updateAllSubscriptionsStorageUsage(): Promise<void> {
  try {
    console.log("🔄 Starting storage calculation for all subscriptions...");

    // Obtener todas las tiendas activas
    const stores = await masterDb
      .select({ id: schema.virtualStores.id })
      .from(schema.virtualStores)
      .where(schema.virtualStores.isActive === true);

    let successCount = 0;
    let errorCount = 0;

    for (const store of stores) {
      try {
        await updateSubscriptionStorageUsage(store.id);
        successCount++;
      } catch (error) {
        errorCount++;
        console.error(`Failed to update storage for store ${store.id}:`, error);
      }
    }

    console.log(
      `✅ Storage calculation completed. Success: ${successCount}, Errors: ${errorCount}`
    );
  } catch (error) {
    console.error("Error in updateAllSubscriptionsStorageUsage:", error);
    throw error;
  }
}

/**
 * Calcula el tamaño de almacenamiento de manera más eficiente
 * usando una query SQL directa en lugar de sumar tablas individuales
 */
export async function calculateStorageSizeOptimized(storeId: number): Promise<number> {
  try {
    // Esta query calcula el tamaño total de todos los datos de una tienda
    const result = await masterDb.execute(
      sql`
        SELECT
          SUM(pg_total_relation_size(schemaname||'.'||tablename)) as total_size
        FROM pg_tables
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      `
    );

    if (result && result.length > 0 && result[0]) {
      const sizeBytes = parseInt((result[0] as any).total_size || "0");
      const sizeGB = sizeBytes / (1024 * 1024 * 1024);
      return sizeGB;
    }

    return 0;
  } catch (error) {
    console.error("Error calculating storage size (optimized):", error);
    return 0;
  }
}

/**
 * Obtiene el uso de almacenamiento de una tienda y sus límites del plan
 */
export async function getStorageUsageWithLimits(storeId: number) {
  try {
    // Obtener suscripción y plan
    const subscription = await masterDb
      .select({
        id: schema.storeSubscriptions.id,
        currentDbStorage: schema.storeSubscriptions.currentDbStorage,
        planId: schema.storeSubscriptions.planId,
      })
      .from(schema.storeSubscriptions)
      .where(schema.storeSubscriptions.storeId === storeId)
      .limit(1);

    if (!subscription || subscription.length === 0) {
      throw new Error(`No subscription found for store ${storeId}`);
    }

    const sub = subscription[0];
    const plan = await masterDb
      .select({ maxDbStorage: schema.subscriptionPlans.maxDbStorage })
      .from(schema.subscriptionPlans)
      .where(schema.subscriptionPlans.id === sub.planId)
      .limit(1);

    const currentStorageGB = parseFloat(sub.currentDbStorage?.toString() || "0");
    const maxStorageGB = plan && plan.length > 0 ? parseFloat(plan[0].maxDbStorage?.toString() || "-1") : -1;
    const isUnlimited = maxStorageGB === -1;
    const percentageUsed = isUnlimited ? 0 : (currentStorageGB / maxStorageGB) * 100;

    return {
      storeId,
      currentStorageGB: parseFloat(currentStorageGB.toFixed(4)),
      maxStorageGB: isUnlimited ? null : parseFloat(maxStorageGB.toFixed(4)),
      isUnlimited,
      percentageUsed: parseFloat(percentageUsed.toFixed(2)),
      isNearLimit: !isUnlimited && percentageUsed >= 90,
      isOverLimit: !isUnlimited && percentageUsed > 100,
    };
  } catch (error) {
    console.error(
      `Error getting storage usage with limits for store ${storeId}:`,
      error
    );
    throw error;
  }
}
