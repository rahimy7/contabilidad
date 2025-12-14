// server/storage/storage-factory.ts
// CORRECCIÓN COMPLETA - Factory pattern para gestionar instancias de storage

import { Pool } from "@neondatabase/serverless";
import { drizzle } from 'drizzle-orm/neon-serverless';
import { MasterStorageService } from './master-storage.js';
import { createTenantStorage } from '../tenant-storage.js';
import * as schema from '../../shared/schema.js';
import ws from "ws";

// Configurar WebSocket para Neon
// @ts-ignore
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = ws as any;
}

/**
 * Factory para gestionar instancias de storage con cache y validaciones
 */
export class StorageFactory {
  private static instance: StorageFactory | null = null;
  private static masterStorage: MasterStorageService | null = null;
  private static tenantStorageCache = new Map<number, any>();
  private static connectionCache = new Map<number, any>();

  // SINGLETON PATTERN
  static getInstance(): StorageFactory {
    if (!this.instance) {
      this.instance = new StorageFactory();
    }
    return this.instance;
  }

  // MASTER STORAGE MANAGEMENT
  getMasterStorage(): MasterStorageService {
    if (!StorageFactory.masterStorage) {
      if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL must be set for master storage');
      }

      StorageFactory.masterStorage = new MasterStorageService(process.env.DATABASE_URL);
      console.log('✅ Master Storage instance created');
    }

    return StorageFactory.masterStorage;
  }

  // TENANT STORAGE MANAGEMENT
async getTenantStorage(storeId: number): Promise<TenantStorage> {
  try {
    // Verificar parámetros
    if (!storeId || storeId <= 0) {
      throw new Error('Invalid store ID provided');
    }

    // Verificar cache
    if (StorageFactory.tenantStorageCache.has(storeId)) {
      const cachedStorage = StorageFactory.tenantStorageCache.get(storeId)!;
      console.log(`♻️ Using cached tenant storage for store ${storeId}`);
      return cachedStorage;
    }

    console.log(`🔄 Creating new tenant storage for store ${storeId}`);

    // Obtener configuración de la tienda desde master storage
    const masterStorage = this.getMasterStorage();
    const store = await masterStorage.getVirtualStore(storeId);

    if (!store) {
      throw new Error(`Store with ID ${storeId} not found in master storage`);
    }

    if (!store.isActive) {
      throw new Error(`Store with ID ${storeId} is not active`);
    }

    // ✅ CORRECCIÓN: Usar getTenantDb en lugar de conexión master
    const { getTenantDb } = await import('../multi-tenant-db.js');
    const tenantDb = await getTenantDb(storeId);
    
    console.log(`✅ Connection test passed for store ${storeId}`);

    // ✅ CORRECCIÓN: Usar la conexión tenant correcta
    const tenantStorage = createTenantStorage(tenantDb, storeId);
    
    // Cache the storage instance
    StorageFactory.tenantStorageCache.set(storeId, tenantStorage);
    console.log(`✅ Tenant storage created and cached for store ${storeId}`);
    
    return tenantStorage;

  } catch (error) {
    console.error(`❌ Error creating tenant storage for store ${storeId}:`, error);
    
    // Limpiar cache en caso de error
    this.clearCacheForStore(storeId);
    
    throw new Error(`Failed to initialize tenant storage for store ${storeId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

  // CACHE MANAGEMENT
  clearCacheForStore(storeId: number): void {
    if (StorageFactory.tenantStorageCache.has(storeId)) {
      StorageFactory.tenantStorageCache.delete(storeId);
      console.log(`🧹 Cache cleared for store ${storeId}`);
    }
    
    if (StorageFactory.connectionCache.has(storeId)) {
      StorageFactory.connectionCache.delete(storeId);
    }
  }

  clearAllCaches(): void {
    StorageFactory.tenantStorageCache.clear();
    StorageFactory.connectionCache.clear();
    console.log('🧹 All caches cleared');
  }

  // UTILITIES
  getCacheStats(): { tenantCacheSize: number; connectionCacheSize: number } {
    return {
      tenantCacheSize: StorageFactory.tenantStorageCache.size,
      connectionCacheSize: StorageFactory.connectionCache.size
    };
  }

}



// HELPER FUNCTION
// ✅ CORRECTO - Debería recibir el objeto user
/* export async function getTenantStorageForUser(user: { storeId: number }): Promise<any> {
  try {
    const factory = StorageFactory.getInstance();
    
    if (!user.storeId) {
      throw new Error('User must have a storeId for tenant operations');
    }

    return await factory.getTenantStorage(user.storeId);
  } catch (error) {
    console.error(`Error getting tenant storage for user with storeId ${user.storeId}:`, error);
    throw error;
  }
} */