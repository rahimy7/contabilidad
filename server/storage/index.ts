// server/storage/index.ts
// Funciones helper y exports principales - CORRECCIÓN COMPLETA

import { StorageFactory } from './storage-factory';
import { UnifiedStorage } from './unified-storage';
import {
  MasterStorage,
  TenantStorage,
  UnifiedStorageInterface
} from '../interfaces/storage';

// ========================================
// FACTORY INSTANCE
// ========================================

export const storageFactory = StorageFactory.getInstance();

// ========================================
// FUNCIONES DE CONVENIENCIA PARA USO DIRECTO
// ========================================

/**
 * Obtiene Master Storage para operaciones globales
 */
export const getMasterStorage = (): MasterStorage => {
  return storageFactory.getMasterStorage();
};

/**
 * Obtiene Tenant Storage para operaciones específicas de tienda
 */
export const getTenantStorage = (storeId: number): Promise<TenantStorage> => {
  return storageFactory.getTenantStorage(storeId);
};



/**
 * Valida acceso a una tienda específica
 */
export const validateTenantAccess = async (storeId: number): Promise<boolean> => {
  if (!storeId || storeId <= 0) {
    throw new Error('Invalid store ID');
  }
  
  const masterStorage = getMasterStorage();
  const store = await masterStorage.getVirtualStore(storeId);
  
  if (!store) {
    throw new Error(`Store with ID ${storeId} not found`);
  }
  
  if (!store.isActive) {
    throw new Error(`Store with ID ${storeId} is not active`);
  }
  
  return true;
};

// ========================================
// UNIFIED STORAGE CREATORS
// ========================================

/**
 * Crea una instancia de Unified Storage para una tienda específica
 */
export const createUnifiedStorage = (storeId: number): UnifiedStorageInterface => {
  return new UnifiedStorage(storeId);
};

/**
 * Crea una instancia de Unified Storage solo para operaciones master
 */
export const createMasterOnlyStorage = (): UnifiedStorageInterface => {
  return new UnifiedStorage(); // Sin storeId
};

// ========================================
// FUNCIONES DE GESTIÓN DE CACHE
// ========================================

/**
 * Limpia cache de tenant storages
 */
export const clearTenantCache = (storeId?: number): void => {
  if (storeId) {
    storageFactory.clearCacheForStore(storeId);
  } else {
    storageFactory.clearAllCaches();
  }
};

/**
 * Refresca tenant storage para una tienda específica
 */
export const refreshTenantStorage = async (storeId: number): Promise<TenantStorage> => {
  storageFactory.clearCacheForStore(storeId);
  return await storageFactory.getTenantStorage(storeId);
};

// ========================================
// FUNCIONES DE UTILIDAD Y DEBUGGING
// ========================================

/**
 * Health check del sistema de storage
 */
export const healthCheck = async () => {
  const masterStorage = getMasterStorage();
  const masterHealth = await masterStorage.testConnection();
  const cacheStats = storageFactory.getCacheStats();
  
  return {
    master: masterHealth,
    cache: cacheStats,
    timestamp: new Date().toISOString()
  };
};

/**
 * Debug del storage factory
 */
export const debugStorageFactory = () => {
  const stats = storageFactory.getCacheStats();
  console.log('🔍 Storage Factory Debug:', {
    tenantCacheSize: stats.tenantCacheSize,
    connectionCacheSize: stats.connectionCacheSize,
    timestamp: new Date().toISOString()
  });
  return stats;
};

/**
 * Obtiene storage para un usuario (función de conveniencia)
 */
export const getStorageForUser = async (user: { storeId: number }) => {
  if (!user.storeId) {
    throw new Error('User must have a store ID for this operation');
  }
  return await getTenantStorage(user.storeId);
};

/**
 * Valida migración de tienda
 */
export const validateStoreMigration = async (storeId: number): Promise<boolean> => {
  try {
    const tenantStorage = await getTenantStorage(storeId);
    // Test básico de conectividad
    await tenantStorage.getAllProducts();
    return true;
  } catch (error) {
    console.error(`Migration validation failed for store ${storeId}:`, error);
    return false;
  }
};

// ========================================
// EXPORTS PRINCIPALES
// ========================================

// Exportar clases principales
export { StorageFactory } from './storage-factory';
export { UnifiedStorage } from './unified-storage';
export { MasterStorageService } from './master-storage';

// Exportar tipos
export type {
  MasterStorage,
  TenantStorage,
  UnifiedStorageInterface
} from '../interfaces/storage';

// ================================
// DEFAULT EXPORT
// ================================

export default {
  // Funciones principales
  getMasterStorage,
  getTenantStorage,
  validateTenantAccess,
  
  // Unified Storage
  createUnifiedStorage,
  createMasterOnlyStorage,
  
  // Cache management
  clearTenantCache,
  refreshTenantStorage,
  
  // Utilities
  healthCheck,
  debugStorageFactory,
  getStorageForUser,
  validateStoreMigration,
  
  // Factory instance
  storageFactory
};

// ================================
// INICIALIZACIÓN
// ================================

console.log('✅ Multi-tenant storage system initialized');
console.log('🏭 Storage Factory ready for multi-tenant operations');