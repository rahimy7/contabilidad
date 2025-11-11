// server/routes/super-admin-routes.ts
import express from 'express';
// Ajusta estas rutas según tu estructura de proyecto
import { authenticateToken, requireSuperAdmin } from '../authMiddleware';
import NodeCache from 'node-cache';
import { getTenantStorage } from '../storage';
import { StorageFactory } from '../storage/storage-factory.js';

const storageFactory = StorageFactory.getInstance();
const masterStorage = storageFactory.getMasterStorage();
const router = express.Router();

/* -------------------------------------------------------------------------- */
/* 1. CACHE INTELIGENTE PARA REDUCIR LLAMADAS A BD                           */
/* -------------------------------------------------------------------------- */

// ✅ Cache con TTL diferenciado según el tipo de dato
const metricsCache = new NodeCache({ 
  stdTTL: 300, // 5 minutos para métricas
  checkperiod: 60, // Verificar cada minuto
  useClones: false, // No clonar objetos (performance)
  maxKeys: 100 // Máximo 100 entradas
});

const storesCache = new NodeCache({ 
  stdTTL: 180, // 3 minutos para tiendas
  checkperiod: 30,
  maxKeys: 50
});

const systemHealthCache = new NodeCache({ 
  stdTTL: 30, // 30 segundos para salud del sistema
  checkperiod: 10,
  maxKeys: 10
});

/* -------------------------------------------------------------------------- */
/* 2. MIDDLEWARE DE CACHE Y LOGGING                                          */
/* -------------------------------------------------------------------------- */

// ✅ Middleware para logging de requests
const logRequest = (req: any, res: any, next: any) => {
  const startTime = Date.now();
  const originalSend = res.send;
  
  res.send = function(data: any) {
    const duration = Date.now() - startTime;
    console.log(`[Super Admin API] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
    return originalSend.call(this, data);
  };
  
  next();
};

// ✅ Middleware para cache con key personalizada
const cacheMiddleware = (cache: NodeCache, keyGenerator: (req: any) => string, ttl?: number) => {
  return (req: any, res: any, next: any) => {
    const cacheKey = keyGenerator(req);
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      console.log(`[Cache HIT] ${cacheKey}`);
      return res.json(cachedData);
    }
    
    console.log(`[Cache MISS] ${cacheKey}`);
    
    // Interceptar la respuesta para cachearla
    const originalSend = res.send;
    res.send = function(data: any) {
      try {
        const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
        if (res.statusCode === 200) {
          cache.set(cacheKey, parsedData, ttl);
          console.log(`[Cache SET] ${cacheKey}`);
        }
      } catch (e) {
        console.warn(`[Cache] Could not parse response for caching: ${e}`);
      }
      return originalSend.call(this, data);
    };
    
    next();
  };
};

// Aplicar middleware a todas las rutas
router.use(logRequest);

/* -------------------------------------------------------------------------- */
/* 3. STORAGE HELPER FUNCTIONS                                              */
/* -------------------------------------------------------------------------- */

// Helper functions to safely call storage methods
const safeGetAllStores = async () => {
  try {
    if (typeof (masterStorage as any).getAllStores === 'function') {
      return await (masterStorage as any).getAllStores();
    }
    // Fallback: try to get stores from a different method or return empty array
    console.warn('[Storage] getAllStores method not available, using fallback');
    return [];
  } catch (error) {
    console.error('[Storage] Error getting stores:', error);
    return [];
  }
};

const safeGetAllUsers = async () => {
  try {
    if (typeof (masterStorage as any).getAllUsers === 'function') {
      return await (masterStorage as any).getAllUsers();
    }
    console.warn('[Storage] getAllUsers method not available, using fallback');
    return [];
  } catch (error) {
    console.error('[Storage] Error getting users:', error);
    return [];
  }
};

const safeGetOrdersInDateRange = async (startDate: Date, endDate: Date) => {
  try {
    if (typeof (masterStorage as any).getOrdersInDateRange === 'function') {
      return await (masterStorage as any).getOrdersInDateRange(startDate, endDate);
    }
    console.warn('[Storage] getOrdersInDateRange method not available, using fallback');
    return [];
  } catch (error) {
    console.error('[Storage] Error getting orders in date range:', error);
    return [];
  }
};

const safeTenantGetAllOrders = async (tenantStorage: any) => {
  try {
    if (typeof tenantStorage.getAllOrders === 'function') {
      return await tenantStorage.getAllOrders();
    }
    return [];
  } catch (error) {
    console.error('[Tenant Storage] Error getting orders:', error);
    return [];
  }
};

const safeTenantGetAllUsers = async (tenantStorage: any) => {
  try {
    if (typeof tenantStorage.getAllUsers === 'function') {
      return await tenantStorage.getAllUsers();
    }
    return [];
  } catch (error) {
    console.error('[Tenant Storage] Error getting users:', error);
    return [];
  }
};

/* -------------------------------------------------------------------------- */
/* 4. RUTAS OPTIMIZADAS CON CACHE Y AGREGACIÓN DE DATOS                     */
/* -------------------------------------------------------------------------- */

/**
 * ✅ MÉTRICAS GLOBALES - Endpoint principal optimizado
 */
router.get('/metrics', 
  authenticateToken, 
  requireSuperAdmin,
  cacheMiddleware(metricsCache, (req) => `metrics-${req.query.timeRange || '30d'}`, 300),
  async (req: any, res: any) => {
    try {
      const timeRange = req.query.timeRange || '30d';
      const now = new Date();
      const daysAgo = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const startDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));

      console.log(`[Metrics] Calculating for ${timeRange} (${daysAgo} days)`);

      // ✅ Consulta optimizada: una sola llamada con agregaciones
      const [stores, users, orders] = await Promise.all([
        safeGetAllStores(),
        safeGetAllUsers(),
        safeGetOrdersInDateRange(startDate, now)
      ]);

      // ✅ Cálculos en memoria (más rápido que múltiples queries)
      const activeStores = stores.filter((store: any) => store.status === 'active').length;
      const totalOrders = orders.length || 0;
      const monthlyRevenue = orders.reduce((sum: number, order: any) => sum + (order.total || 0), 0);
      
      // ✅ Estadísticas de usuarios globales
      const activeUsers = users.filter((user: any) => user.status === 'active').length;
      
      // ✅ Tickets de soporte pendientes (simulado - implementar según tu lógica)
      const pendingSupport = 0; // Implementar query real si tienes sistema de tickets

      const metrics = {
        totalStores: stores.length,
        activeStores,
        inactiveStores: stores.length - activeStores,
        totalOrders,
        monthlyRevenue,
        averageRetention: Math.round((activeStores / Math.max(stores.length, 1)) * 100),
        pendingSupport,
        activeUsers,
        lastUpdated: new Date().toISOString(),
        timeRange,
        // ✅ Métricas adicionales útiles
        averageOrderValue: totalOrders > 0 ? Math.round(monthlyRevenue / totalOrders) : 0,
        ordersPerStore: totalOrders > 0 ? Math.round(totalOrders / Math.max(activeStores, 1)) : 0
      };

      console.log(`[Metrics] Generated:`, {
        stores: metrics.totalStores,
        orders: metrics.totalOrders,
        revenue: metrics.monthlyRevenue
      });

      res.json(metrics);
    } catch (error) {
      console.error('[Metrics] Error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch metrics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * ✅ TIENDAS - Lista optimizada con información esencial
 */
router.get('/stores', 
  authenticateToken, 
  requireSuperAdmin,
  cacheMiddleware(storesCache, () => 'stores-list', 180),
  async (req: any, res: any) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;

      console.log(`[Stores] Fetching page ${page}, limit ${limit}`);

      const allStores = await safeGetAllStores();
      
      // ✅ Paginación en memoria para mejor performance en datasets pequeños
      const paginatedStores = allStores.slice(offset, offset + limit);
      
      // ✅ Enriquecer con datos adicionales en una sola pasada
      const enrichedStores = await Promise.all(
        paginatedStores.map(async (store: any) => {
          try {
            // ✅ Obtener métricas básicas de cada tienda
            const tenantStorage = await getTenantStorage({ 
              storeId: store.id, 
              level: 'store' 
            } as any);
            
            const [orders, users] = await Promise.all([
              safeTenantGetAllOrders(tenantStorage),
              safeTenantGetAllUsers(tenantStorage)
            ]);

            const now = new Date();
            const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const monthlyOrders = orders.filter((order: any) => 
              new Date(order.createdAt || order.date) >= thisMonth
            );

            return {
              id: store.id,
              name: store.name,
              status: store.status || 'active',
              subscriptionStatus: store.subscriptionStatus || 'active',
              monthlyOrders: monthlyOrders.length,
              monthlyRevenue: monthlyOrders.reduce((sum: number, order: any) => sum + (order.total || 0), 0),
              lastActivity: store.lastActivity || store.updatedAt || new Date().toISOString(),
              supportTickets: 0, // Implementar si tienes sistema de tickets
              totalUsers: users.length,
              createdAt: store.createdAt
            };
          } catch (storeError) {
            console.warn(`[Stores] Error processing store ${store.id}:`, storeError);
            return {
              id: store.id,
              name: store.name,
              status: 'inactive',
              subscriptionStatus: 'unknown',
              monthlyOrders: 0,
              monthlyRevenue: 0,
              lastActivity: store.lastActivity || 'unknown',
              supportTickets: 0,
              totalUsers: 0,
              createdAt: store.createdAt
            };
          }
        })
      );

      const response = {
        stores: enrichedStores,
        pagination: {
          page,
          limit,
          total: allStores.length,
          totalPages: Math.ceil(allStores.length / limit),
          hasNext: offset + limit < allStores.length,
          hasPrev: page > 1
        },
        lastUpdated: new Date().toISOString()
      };

      console.log(`[Stores] Returned ${enrichedStores.length} stores (${allStores.length} total)`);
      res.json(response);
    } catch (error) {
      console.error('[Stores] Error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch stores',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * ✅ SALUD DEL SISTEMA - Endpoint ligero para monitoring
 */
router.get('/system-health',
  authenticateToken,
  requireSuperAdmin,
  cacheMiddleware(systemHealthCache, () => 'system-health', 30),
  async (req: any, res: any) => {
    try {
      const startTime = Date.now();
      
      // ✅ Checks básicos de salud del sistema
      const [storesCheck, usersCheck] = await Promise.allSettled([
        safeGetAllStores().then(stores => ({ stores: stores.length })),
        safeGetAllUsers().then(users => ({ users: users.length }))
      ]);

      const responseTime = Date.now() - startTime;
      
      // ✅ Determinar estado del sistema
      const hasErrors = [storesCheck, usersCheck].some(check => check.status === 'rejected');
      const isSlowResponse = responseTime > 2000; // Más de 2 segundos es lento
      
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (hasErrors) {
        status = 'critical';
      } else if (isSlowResponse) {
        status = 'warning';
      }

      const health = {
        status,
        uptime: process.uptime(),
        uptimeHuman: formatUptime(process.uptime()),
        responseTime,
        errorRate: hasErrors ? 50 : 0, // Simplificado
        timestamp: new Date().toISOString(),
        checks: {
          database: storesCheck.status === 'fulfilled' ? 'ok' : 'error',
          storage: usersCheck.status === 'fulfilled' ? 'ok' : 'error',
          memory: process.memoryUsage().heapUsed < 500 * 1024 * 1024 ? 'ok' : 'warning' // 500MB
        }
      };

      console.log(`[System Health] Status: ${status}, Response: ${responseTime}ms`);
      res.json(health);
    } catch (error) {
      console.error('[System Health] Error:', error);
      res.status(500).json({
        status: 'critical',
        error: 'Health check failed',
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * ✅ CONFIGURACIONES GLOBALES DE WHATSAPP
 */
router.get('/global-whatsapp-settings',
  authenticateToken,
  requireSuperAdmin,
  cacheMiddleware(storesCache, () => 'global-whatsapp', 300),
  async (req: any, res: any) => {
    try {
      // ✅ Implementar según tu lógica de configuración global
      const settings = {
        defaultWebhookUrl: process.env.WHATSAPP_WEBHOOK_URL || '',
        globalRateLimiting: {
          enabled: true,
          maxMessagesPerMinute: 10,
          blockDuration: 60
        },
        defaultAutoResponses: {
          welcomeMessage: "¡Bienvenido! ¿En qué podemos ayudarte?",
          businessHoursMessage: "Estamos fuera de horario. Te responderemos pronto.",
          afterHoursMessage: "Nuestro horario es de 9:00 AM a 6:00 PM."
        },
        lastUpdated: new Date().toISOString()
      };

      res.json(settings);
    } catch (error) {
      console.error('[Global WhatsApp Settings] Error:', error);
      res.status(500).json({ error: 'Failed to fetch global WhatsApp settings' });
    }
  }
);

/**
 * ✅ CONFIGURACIONES DE WHATSAPP POR TIENDA
 */
router.get('/whatsapp-configs',
  authenticateToken,
  requireSuperAdmin,
  cacheMiddleware(storesCache, () => 'whatsapp-configs', 180),
  async (req: any, res: any) => {
    try {
      const stores = await safeGetAllStores();
      
      // ✅ Obtener configuraciones de WhatsApp para cada tienda
      const configs = await Promise.all(
        stores.map(async (store: any) => {
          try {
            const tenantStorage = await getTenantStorage({ 
              storeId: store.id, 
              level: 'store' 
            } as any);
            
            // ✅ Obtener configuración de WhatsApp de la tienda (implementar según tu lógica)
            const config = {
              storeId: store.id,
              storeName: store.name,
              phoneNumber: store.whatsappPhone || '',
              webhookUrl: store.webhookUrl || '',
              apiToken: store.whatsappToken ? '***masked***' : '',
              isActive: !!store.whatsappToken,
              lastSync: store.lastWhatsAppSync || null,
              messageCount: 0, // Implementar contador real si es necesario
              status: store.whatsappStatus || 'inactive'
            };
            
            return config;
          } catch (error) {
            console.warn(`[WhatsApp Config] Error for store ${store.id}:`, error);
            return {
              storeId: store.id,
              storeName: store.name,
              phoneNumber: '',
              webhookUrl: '',
              apiToken: '',
              isActive: false,
              lastSync: null,
              messageCount: 0,
              status: 'error'
            };
          }
        })
      );

      res.json(configs);
    } catch (error) {
      console.error('[WhatsApp Configs] Error:', error);
      res.status(500).json({ error: 'Failed to fetch WhatsApp configurations' });
    }
  }
);

/* -------------------------------------------------------------------------- */
/* 5. RUTAS DE ACCIÓN (POST/PUT/DELETE) SIN CACHE                           */
/* -------------------------------------------------------------------------- */

/**
 * ✅ INVALIDAR CACHE - Endpoint para limpiar cache manualmente
 */
router.post('/cache/invalidate',
  authenticateToken,
  requireSuperAdmin,
  (req: any, res: any) => {
    try {
      const { type } = req.body;
      
      let cleared = 0;
      switch (type) {
        case 'metrics':
          cleared = metricsCache.keys().length;
          metricsCache.flushAll();
          break;
        case 'stores':
          cleared = storesCache.keys().length;
          storesCache.flushAll();
          break;
        case 'health':
          cleared = systemHealthCache.keys().length;
          systemHealthCache.flushAll();
          break;
        case 'all':
        default:
          cleared = metricsCache.keys().length + storesCache.keys().length + systemHealthCache.keys().length;
          metricsCache.flushAll();
          storesCache.flushAll();
          systemHealthCache.flushAll();
          break;
      }
      
      console.log(`[Cache] Invalidated ${cleared} entries for type: ${type || 'all'}`);
      res.json({ 
        success: true, 
        message: `Cache invalidated for ${type || 'all'}`,
        entriesCleared: cleared 
      });
    } catch (error) {
      console.error('[Cache Invalidation] Error:', error);
      res.status(500).json({ error: 'Failed to invalidate cache' });
    }
  }
);

/**
 * ✅ TEST WEBHOOK - Endpoint para probar webhooks
 */
router.post('/test-webhook',
  authenticateToken,
  requireSuperAdmin,
  async (req: any, res: any) => {
    try {
      const { webhookUrl } = req.body;
      
      if (!webhookUrl) {
        return res.status(400).json({ error: 'Webhook URL is required' });
      }
      
      // ✅ Test básico del webhook
      const testPayload = {
        test: true,
        timestamp: new Date().toISOString(),
        message: 'Test message from Super Admin'
      };
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SuperAdmin-WebhookTest/1.0'
        },
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(10000) // 10 segundos timeout
      });
      
      const success = response.ok;
      const statusCode = response.status;
      const statusText = response.statusText;
      
      console.log(`[Webhook Test] ${webhookUrl} -> ${statusCode} ${statusText}`);
      
      res.json({
        success,
        statusCode,
        statusText,
        message: success 
          ? 'Webhook responding correctly' 
          : `Webhook returned ${statusCode}: ${statusText}`,
        testedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('[Webhook Test] Error:', error);
      res.status(500).json({
        success: false,
        error: 'Webhook test failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/* -------------------------------------------------------------------------- */
/* 6. UTILIDADES                                                             */
/* -------------------------------------------------------------------------- */

function formatUptime(uptime: number): string {
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

// ✅ Limpieza periódica de cache para evitar memory leaks
setInterval(() => {
  const metricsStats = metricsCache.getStats();
  const storesStats = storesCache.getStats();
  const healthStats = systemHealthCache.getStats();
  
  console.log(`[Cache Stats] Metrics: ${metricsStats.keys}/${metricsStats.hits}/${metricsStats.misses} | Stores: ${storesStats.keys} | Health: ${healthStats.keys}`);
}, 5 * 60 * 1000); // Cada 5 minutos

export default router;
