import dotenv from 'dotenv';

// Cargar variables de entorno explícitamente
dotenv.config();
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq } from 'drizzle-orm';
import ws from "ws";
import * as schema from "@shared/schema";
import { VirtualStore } from "@shared/schema";

// Configurar WebSocket para Neon
neonConfig.webSocketConstructor = ws;

// Cache de conexiones de base de datos por tienda
const dbConnections = new Map<number, any>();

// Pool principal para la base de datos maestra (sistema multi-tenant)
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

export const masterPool = new Pool({ connectionString: process.env.DATABASE_URL });
export const masterDb = drizzle({ client: masterPool, schema });

/**
 * Obtiene la conexión de base de datos para una tienda específica
 * Si no existe, la crea y la almacena en caché
 */
export async function getTenantDb(storeId: number, forcePublic = false): Promise<any> {
  const cacheKey = forcePublic ? `public_${storeId}` : storeId;
  
  if (dbConnections.has(cacheKey)) {
    return dbConnections.get(cacheKey);
  }

  const [store] = await masterDb
    .select()
    .from(schema.virtualStores)
    .where(eq(schema.virtualStores.id, storeId))
    .limit(1);

  if (!store) {
    throw new Error(`Store with ID ${storeId} not found`);
  }

  let tenantDb;
  
  if (forcePublic) {
    // Super admin usa public schema
    tenantDb = masterDb;
    console.log(`✅ Using PUBLIC schema for super admin`);
  } else {
    // Store users usan tenant schema
    const schemaMatch = store.databaseUrl?.match(/schema=([^&]+)/);
    const schemaName = schemaMatch ? schemaMatch[1] : 'public';
    
    const baseUrl = process.env.DATABASE_URL;
    const tenantUrl = `${baseUrl}&options=-c%20search_path%3D${schemaName}`;
    
    const tenantPool = new Pool({ connectionString: tenantUrl });
    tenantDb = drizzle({ client: tenantPool, schema });
    
    console.log(`✅ Using TENANT schema: ${schemaName}`);
  }

  dbConnections.set(cacheKey, tenantDb);
  return tenantDb;
}

/**
 * Crea configuraciones predeterminadas para una tienda virtual
 * NOTA: Actualmente todas las tiendas usan la misma BD con filtros por storeId
 * En el futuro esto se migrará a bases de datos separadas
 */
export async function createTenantDatabase(store: VirtualStore): Promise<string> {
  try {
    console.log(`Configurando tienda: ${store.name} (ID: ${store.id})`);
    
    // IMPORTANTE: Actualmente usamos la misma BD para todas las tiendas
    // Esto es temporal hasta que implementemos verdaderas BDs separadas
    const databaseUrl = store.databaseUrl || process.env.DATABASE_URL || '';
    
    // Copiar/crear configuraciones predeterminadas
    await copyDefaultConfigurationsToTenant(store.id);
    
    console.log(`Setup completed for store: ${store.name}`);
    return databaseUrl;
  } catch (error) {
    console.error(`Failed to setup store ${store.id}:`, error);
    throw error;
  }
}

/**
 * Copia configuraciones predeterminadas (respuestas automáticas, productos base, etc.)
 * desde la base de datos maestra a una nueva tienda
 */
export async function copyDefaultConfigurationsToTenant(storeId: number): Promise<void> {
  try {
    // Obtener respuestas automáticas predeterminadas de la base de datos maestra
    const defaultAutoResponses = await masterDb.select().from(schema.autoResponses);
    
    // Obtener la conexión de la tienda específica
    const tenantDb = await getTenantDb(storeId);
    
    // Copiar respuestas automáticas a la nueva tienda
    if (defaultAutoResponses.length > 0) {
      const responsesToInsert = defaultAutoResponses.map(response => ({
        name: response.name,
        trigger: response.trigger,
        isActive: response.isActive,
        priority: response.priority,
        messageText: response.messageText?.replace(
          /https:\/\/[^\/]*\.replit\.dev/g, 
          `https://${process.env.REPL_SLUG || 'localhost:5000'}.replit.dev`
        ) || response.messageText, // Actualizar URLs con el dominio correcto
        requiresRegistration: response.requiresRegistration,
        menuOptions: response.menuOptions,
        nextAction: response.nextAction,
        menuType: response.menuType,
        showBackButton: response.showBackButton,
        allowFreeText: response.allowFreeText,
        responseTimeout: response.responseTimeout,
        maxRetries: response.maxRetries,
        fallbackMessage: response.fallbackMessage,
        conditionalDisplay: response.conditionalDisplay,
      }));
      
      await tenantDb.insert(schema.autoResponses).values(responsesToInsert);
      console.log(`Copied ${responsesToInsert.length} auto responses to store ${storeId}`);
    }
    
    // Verificar si ya existen productos para esta tienda (evitar duplicados)
    const existingProducts = await tenantDb.select().from(schema.products).limit(1);
    
    if (existingProducts.length === 0) {
      // Crear productos base únicos para esta tienda
      const baseProducts = [
        {
          name: "Instalación de Aire Acondicionado",
          description: "Instalación profesional de equipos de aire acondicionado",
          price: "2500.00",
          category: "servicios",
          type: "service",
          isActive: true,
          sku: `STORE${storeId}-INSTALL-AC-001`,
          stock: null,
          imageUrl: null,
          specifications: "Instalación completa con materiales básicos",
          installationCost: "0.00",
          warrantyMonths: 12,
        },
        {
          name: "Mini Split 12,000 BTU Inverter",
          description: "Aire acondicionado mini split inverter de alta eficiencia",
          price: "8500.00", 
          category: "electrodomesticos",
          type: "product",
          isActive: true,
          sku: `STORE${storeId}-AC-12K-001`,
          stock: 10,
          imageUrl: null,
          specifications: "12,000 BTU, Inverter, R410A",
          installationCost: "1500.00",
          warrantyMonths: 24,
        },
        {
          name: "Servicio de Mantenimiento",
          description: "Mantenimiento preventivo de equipos de refrigeración",
          price: "800.00",
          category: "servicios", 
          type: "service",
          isActive: true,
          sku: `STORE${storeId}-MAINT-001`,
          stock: null,
          imageUrl: null,
          specifications: "Limpieza, revisión y ajustes",
          installationCost: "0.00",
          warrantyMonths: 3,
        }
      ];
      
      await tenantDb.insert(schema.products).values(baseProducts);
      console.log(`Created ${baseProducts.length} base products for store ${storeId}`);
    } else {
      console.log(`Store ${storeId} already has products, skipping product creation`);
    }
    
    console.log(`Configurations copied successfully for store ${storeId}`);
    
  } catch (error) {
    console.error(`Failed to copy default configurations to store ${storeId}:`, error);
    throw error;
  }
}

/**
 * DEPRECATED: Esta función será reemplazada por configuraciones separadas
 * Mantenida temporalmente para compatibilidad
 */
async function createLegacyStoreSettings(storeId: number) {
  try {
    // Obtener información de la tienda desde la base de datos maestra
    const [storeInfo] = await masterDb
      .select()
      .from(schema.virtualStores)
      .where(eq(schema.virtualStores.id, storeId))
      .limit(1);
    
    if (storeInfo) {
      console.log(`Legacy settings for store ${storeId} - data available`);
    } else {
      console.log(`No store info found for store ${storeId}`);
    }
    
  } catch (error) {
    console.error(`Failed to copy default configurations to store ${storeId}:`, error);
    throw error;
  }
}

/**
 * Cierra todas las conexiones de base de datos
 */
export async function closeAllConnections(): Promise<void> {
  const connections = Array.from(dbConnections.entries());
  for (const [storeId, db] of connections) {
    try {
      await db.$client.end();
      dbConnections.delete(storeId);
    } catch (error) {
      console.error(`Error closing connection for store ${storeId}:`, error);
    }
  }
}

/**
 * Invalida la conexión en caché para una tienda específica
 */
export async function invalidateTenantConnection(storeId: number): Promise<void> {
  if (dbConnections.has(storeId)) {
    const db = dbConnections.get(storeId);
    try {
      await db.$client.end();
    } catch (error) {
      console.error(`Error closing connection for store ${storeId}:`, error);
    }
    dbConnections.delete(storeId);
  }
}

/**
 * Middleware para extraer el storeId del usuario autenticado y configurar la base de datos específica
 */
export function tenantMiddleware() {
  return async (req: any, res: any, next: any) => {
    try {
      console.log('=== TENANT MIDDLEWARE EJECUTÁNDOSE ===');
      console.log('Path:', req.path);
      console.log('Method:', req.method);
      console.log('User exists:', !!req.user);
      
      // Obtener storeId del usuario autenticado si existe
      let storeId = req.headers['x-store-id'] || req.session?.storeId || req.user?.storeId;
      
      // Si el usuario está autenticado y tiene storeId, usarlo
      if (req.user && req.user.storeId && req.user.level !== 'global') {
        storeId = req.user.storeId;
      }
      
      // Debugging específico para órdenes
      if (req.path === '/orders') {
        console.log('=== ORDERS ENDPOINT DEBUG ===');
        console.log('User:', req.user ? `${req.user.username} (ID: ${req.user.id}, storeId: ${req.user.storeId}, level: ${req.user.level})` : 'No user');
        console.log('Final storeId:', storeId);
      }
      
      if (storeId) {
        const tenantDb = await getTenantDb(parseInt(storeId));
        req.tenantDb = tenantDb;
        req.storeId = parseInt(storeId);
        
        if (req.path === '/orders') {
          console.log('✅ Using tenant DB for store:', storeId);
        }
      } else {
        // Usar base de datos maestra solo para super admin o usuarios sin tienda
        req.tenantDb = masterDb;
        req.storeId = null;
        
        if (req.path === '/orders') {
          console.log('❌ Using master DB (no storeId)');
        }
      }
      
      next();
    } catch (error) {
      console.error('Tenant middleware error:', error);
      res.status(400).json({ error: 'Invalid store configuration' });
    }
  };
}

/**
 * Obtiene información de la tienda desde la base de datos maestra
 */
export async function getStoreInfo(storeId: number): Promise<VirtualStore | null> {
  const [store] = await masterDb
    .select()
    .from(schema.virtualStores)
    .where(eq(schema.virtualStores.id, storeId))
    .limit(1);
    
  return store || null;
}

/**
 * Verifica si una tienda está activa y configurada correctamente
 */
export async function validateStore(storeId: number): Promise<boolean> {
  const store = await getStoreInfo(storeId);
  return store !== null && Boolean(store.isActive) && !!store.databaseUrl;
}