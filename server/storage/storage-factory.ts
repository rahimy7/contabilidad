// server/storage/storage-factory.ts
// Versión simplificada para tienda única (4Life Bella Vista)

import { MasterStorageService } from './master-storage.js';
import { createTenantStorage } from '../tenant-storage.js';

/**
 * Factory simplificado para tienda única
 * Siempre retorna la misma instancia de storage
 */
export class StorageFactory {
  private static instance: StorageFactory | null = null;
  private static masterStorage: MasterStorageService | null = null;
  private static tenantStorageCache: any = null;
  private static readonly DEFAULT_STORE_ID = 1;

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
      console.log('✅ Master Storage instance created for single store');
    }

    return StorageFactory.masterStorage;
  }

  // TENANT STORAGE MANAGEMENT (simplificado para tienda única)
  async getTenantStorage(storeId: number = StorageFactory.DEFAULT_STORE_ID): Promise<any> {
    try {
      // En modo tienda única, ignoramos el storeId y siempre usamos el ID 1
      if (storeId !== StorageFactory.DEFAULT_STORE_ID) {
        console.warn(`⚠️ Requested storeId ${storeId}, but using default ${StorageFactory.DEFAULT_STORE_ID} for single store mode`);
      }

      // Verificar cache
      if (StorageFactory.tenantStorageCache) {
        console.log(`♻️ Using cached tenant storage`);
        return StorageFactory.tenantStorageCache;
      }

      console.log(`🔄 Creating tenant storage for single store (ID: ${StorageFactory.DEFAULT_STORE_ID})`);

      // Usar la conexión simplificada multi-tenant-db
      const { getTenantDb } = await import('../multi-tenant-db.js');
      const tenantDb = await getTenantDb(StorageFactory.DEFAULT_STORE_ID);

      console.log(`✅ Connection established for store ${StorageFactory.DEFAULT_STORE_ID}`);

      // Crear tenant storage
      const tenantStorage = createTenantStorage(tenantDb, StorageFactory.DEFAULT_STORE_ID);

      // Cache the storage instance
      StorageFactory.tenantStorageCache = tenantStorage;
      console.log(`✅ Tenant storage created and cached`);

      return tenantStorage;

    } catch (error) {
      console.error(`❌ Error creating tenant storage:`, error);

      // Limpiar cache en caso de error
      this.clearCache();

      throw new Error(`Failed to initialize tenant storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // CACHE MANAGEMENT
  clearCache(): void {
    StorageFactory.tenantStorageCache = null;
    console.log('🧹 Tenant storage cache cleared');
  }

  // UTILITIES
  getCacheStats(): { tenantCacheSize: number; connectionCacheSize: number } {
    return {
      tenantCacheSize: StorageFactory.tenantStorageCache ? 1 : 0,
      connectionCacheSize: 0 // No usado en modo tienda única
    };
  }

  // COMPATIBILIDAD - Métodos legacy que pueden ser llamados por código antiguo
  clearCacheForStore(storeId: number): void {
    console.log(`⚠️ clearCacheForStore called for store ${storeId}, clearing all cache`);
    this.clearCache();
  }

  clearAllCaches(): void {
    this.clearCache();
  }
}
