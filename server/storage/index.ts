// server/storage/index.ts
// Versión simplificada para tienda única (4Life Bella Vista)

import { UnifiedStorage } from "./unified-storage";

// ========================================
// ⚙️ LAZY LOAD DE STORAGE FACTORY (compatible ESM)
// ========================================

let _storageFactory: any = null;

export const getStorageFactory = async () => {
  if (!_storageFactory) {
    const module = await import("./storage-factory");
    _storageFactory = module.StorageFactory.getInstance();
  }
  return _storageFactory;
};

// ========================================
// 🚀 FUNCIONES DE CONVENIENCIA
// ========================================

export const getMasterStorage = async () => {
  const factory = await getStorageFactory();
  return factory.getMasterStorage();
};

export const getTenantStorage = async (storeId: number = 1) => {
  const factory = await getStorageFactory();
  return factory.getTenantStorage(storeId);
};

// Función simplificada - en tienda única siempre es válido
export const validateTenantAccess = async (storeId: number = 1): Promise<boolean> => {
  if (storeId !== 1) {
    console.warn(`⚠️ Single store mode: storeId ${storeId} requested, but only ID 1 is valid`);
  }
  return true;
};

// ========================================
// 🧩 UNIFIED STORAGE
// ========================================

export const createUnifiedStorage = (storeId: number = 1) => {
  return new UnifiedStorage(storeId);
};

export const createMasterOnlyStorage = () => {
  return new UnifiedStorage(); // sin storeId
};

// ========================================
// 🧠 CACHE Y UTILIDADES
// ========================================

export const clearTenantCache = async (storeId?: number): Promise<void> => {
  const factory = await getStorageFactory();
  factory.clearCache();
};

export const refreshTenantStorage = async (storeId: number = 1) => {
  const factory = await getStorageFactory();
  factory.clearCache();
  return await factory.getTenantStorage(storeId);
};

export const healthCheck = async () => {
  const masterStorage = await getMasterStorage();
  const masterHealth = await masterStorage.testConnection();
  const factory = await getStorageFactory();
  const cacheStats = factory.getCacheStats();

  return {
    master: masterHealth,
    cache: cacheStats,
    timestamp: new Date().toISOString(),
    mode: 'single-store'
  };
};

export const debugStorageFactory = async () => {
  const factory = await getStorageFactory();
  const stats = factory.getCacheStats();
  console.log("🔍 Storage Factory Debug (Single Store Mode):", {
    tenantCacheSize: stats.tenantCacheSize,
    storeId: 1,
    timestamp: new Date().toISOString(),
  });
  return stats;
};

export const getStorageForUser = async (user: { storeId?: number }) => {
  // En tienda única, siempre retornamos el storage del ID 1
  return await getTenantStorage(1);
};

export const validateStoreMigration = async (storeId: number = 1): Promise<boolean> => {
  try {
    const tenantStorage = await getTenantStorage(storeId);
    await tenantStorage.getAllProducts();
    return true;
  } catch (error) {
    console.error(`Migration validation failed:`, error);
    return false;
  }
};

// ========================================
// 📦 EXPORTS
// ========================================

export { UnifiedStorage };

export default {
  getMasterStorage,
  getTenantStorage,
  validateTenantAccess,
  createUnifiedStorage,
  createMasterOnlyStorage,
  clearTenantCache,
  refreshTenantStorage,
  healthCheck,
  debugStorageFactory,
  getStorageForUser,
  validateStoreMigration,
};

console.log("✅ Single-store storage system initialized");
console.log("🏪 Storage ready for 4Life Bella Vista (store ID: 1)");
