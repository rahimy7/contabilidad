import { UnifiedStorage } from "./unified-storage";
import {
  MasterStorage,
  TenantStorage,
  UnifiedStorageInterface,
} from "../interfaces/storage";

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

export const getMasterStorage = async (): Promise<MasterStorage> => {
  const factory = await getStorageFactory();
  return factory.getMasterStorage();
};

export const getTenantStorage = async (
  storeId: number
): Promise<TenantStorage> => {
  const factory = await getStorageFactory();
  return factory.getTenantStorage(storeId);
};

export const validateTenantAccess = async (
  storeId: number
): Promise<boolean> => {
  if (!storeId || storeId <= 0) throw new Error("Invalid store ID");

  const masterStorage = await getMasterStorage();
  const store = await masterStorage.getVirtualStore(storeId);

  if (!store) throw new Error(`Store with ID ${storeId} not found`);
  if (!store.isActive) throw new Error(`Store with ID ${storeId} is not active`);

  return true;
};

// ========================================
// 🧩 UNIFIED STORAGE
// ========================================

export const createUnifiedStorage = (
  storeId: number
): UnifiedStorageInterface => {
  return new UnifiedStorage(storeId);
};

export const createMasterOnlyStorage = (): UnifiedStorageInterface => {
  return new UnifiedStorage(); // sin storeId
};

// ========================================
// 🧠 CACHE Y UTILIDADES
// ========================================

export const clearTenantCache = async (storeId?: number): Promise<void> => {
  const factory = await getStorageFactory();
  if (storeId) {
    factory.clearCacheForStore(storeId);
  } else {
    factory.clearAllCaches();
  }
};

export const refreshTenantStorage = async (
  storeId: number
): Promise<TenantStorage> => {
  const factory = await getStorageFactory();
  factory.clearCacheForStore(storeId);
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
  };
};

export const debugStorageFactory = async () => {
  const factory = await getStorageFactory();
  const stats = factory.getCacheStats();
  console.log("🔍 Storage Factory Debug:", {
    tenantCacheSize: stats.tenantCacheSize,
    connectionCacheSize: stats.connectionCacheSize,
    timestamp: new Date().toISOString(),
  });
  return stats;
};

export const getStorageForUser = async (user: { storeId: number }) => {
  if (!user.storeId)
    throw new Error("User must have a store ID for this operation");
  return await getTenantStorage(user.storeId);
};

export const validateStoreMigration = async (
  storeId: number
): Promise<boolean> => {
  try {
    const tenantStorage = await getTenantStorage(storeId);
    await tenantStorage.getAllProducts();
    return true;
  } catch (error) {
    console.error(`Migration validation failed for store ${storeId}:`, error);
    return false;
  }
};

export const getTenantStorageBySlug = async (slug: string): Promise<TenantStorage> => {
  const factory = await getStorageFactory();
  return factory.getTenantStorageBySlug(slug);
};

// ========================================
// 📦 EXPORTS
// ========================================

export type {
  MasterStorage,
  TenantStorage,
  UnifiedStorageInterface,
} from "../interfaces/storage";

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

console.log("✅ Multi-tenant storage system initialized");
console.log("🏭 Storage Factory ready for multi-tenant operations");
