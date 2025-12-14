// server/multi-tenant-db-simple.ts
// Versión simplificada para tienda única (4Life Bella Vista)

import { db, pool } from './db';
import * as schema from "@shared/schema";

// Para compatibilidad, exportamos la instancia de DB como masterDb
export const masterDb = db;
export const masterPool = pool;

/**
 * Obtiene la información de la tienda (siempre tienda ID 1 para 4Life Bella Vista)
 * @param storeId - ID de la tienda (siempre debería ser 1)
 * @returns Información básica de la tienda
 */
export async function getStoreInfo(storeId: number = 1) {
  // En un sistema de tienda única, siempre devolvemos la información de la tienda principal
  return {
    id: 1,
    name: '4Life Bella Vista',
    slug: '4life-bellavista',
    isActive: true,
    databaseUrl: process.env.DATABASE_URL
  };
}

/**
 * Obtiene la conexión de base de datos (siempre la misma para tienda única)
 * @param storeId - ID de la tienda (ignorado en tienda única)
 * @param forcePublic - Flag para compatibilidad (ignorado)
 * @returns Instancia de base de datos
 */
export async function getTenantDb(storeId: number = 1, forcePublic: boolean = false) {
  // En tienda única, siempre retornamos la misma conexión
  return db;
}

/**
 * Middleware para tenant (no-op en tienda única)
 */
export function tenantMiddleware(req: any, res: any, next: any) {
  // En tienda única, simplemente continuamos
  // Podríamos agregar aquí la verificación de store_id si fuera necesario
  next();
}

/**
 * Crea base de datos de tenant (no-op en tienda única)
 */
export async function createTenantDatabase(store: any): Promise<string> {
  console.log('⚠️ createTenantDatabase llamado en modo tienda única - no-op');
  return process.env.DATABASE_URL || '';
}

/**
 * Copia configuraciones predeterminadas (no-op en tienda única)
 */
export async function copyDefaultConfigurationsToTenant(storeId: number): Promise<void> {
  console.log('⚠️ copyDefaultConfigurationsToTenant llamado en modo tienda única - no-op');
}

export default {
  masterDb,
  masterPool,
  getStoreInfo,
  getTenantDb,
  tenantMiddleware,
  createTenantDatabase,
  copyDefaultConfigurationsToTenant
};
