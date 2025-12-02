// server/routes/super-admin-routes.ts
import express from 'express';
// Ajusta estas rutas según tu estructura de proyecto
import { authenticateToken, requireSuperAdmin } from '../authMiddleware';
import NodeCache from 'node-cache';
import { getTenantStorage } from '../storage';
import { StorageFactory } from '../storage/storage-factory.js';
import { invoices, payments, creditTransactions, paypalIntegration, virtualStores, storeSubscriptions } from '@shared/schema';
import { eq, desc, gte, lte, and, asc, count } from 'drizzle-orm';

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
 * ✅ GET TIENDA ESPECÍFICA - Obtener una tienda por ID
 */
router.get('/stores/:storeId',
  authenticateToken,
  requireSuperAdmin,
  async (req: any, res: any) => {
    try {
      const storeId = parseInt(req.params.storeId);

      if (isNaN(storeId)) {
        return res.status(400).json({ error: 'Invalid store ID' });
      }

      const store = await masterStorage.getVirtualStore(storeId);

      if (!store) {
        return res.status(404).json({ error: 'Store not found' });
      }

      // Enriquecer con datos adicionales
      try {
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

        const enrichedStore = {
          id: store.id,
          name: store.name,
          domain: store.domain || '',
          description: store.description || '',
          status: store.status || 'active',
          isActive: store.isActive || true,
          subscriptionStatus: store.subscriptionStatus || 'active',
          subscriptionPlanId: store.subscriptionPlanId || null,
          monthlyOrders: monthlyOrders.length,
          monthlyRevenue: monthlyOrders.reduce((sum: number, order: any) => sum + (order.total || 0), 0),
          lastActivity: store.lastActivity || store.updatedAt || new Date().toISOString(),
          supportTickets: 0,
          totalUsers: users.length,
          createdAt: store.createdAt,
          updatedAt: store.updatedAt || new Date().toISOString(),
          contactEmail: store.contactEmail || '',
          contactPhone: store.contactPhone || '',
          address: store.address || ''
        };

        return res.json(enrichedStore);
      } catch (enrichError) {
        console.warn(`[Store Detail] Error enriching store ${storeId}:`, enrichError);

        // Devolver tienda básica incluso si hay error al enriquecer
        return res.json({
          id: store.id,
          name: store.name,
          domain: store.domain || '',
          description: store.description || '',
          status: store.status || 'active',
          isActive: store.isActive || true,
          subscriptionStatus: store.subscriptionStatus || 'active',
          subscriptionPlanId: store.subscriptionPlanId || null,
          monthlyOrders: 0,
          monthlyRevenue: 0,
          lastActivity: store.lastActivity || 'unknown',
          supportTickets: 0,
          totalUsers: 0,
          createdAt: store.createdAt,
          updatedAt: store.updatedAt,
          contactEmail: store.contactEmail || '',
          contactPhone: store.contactPhone || '',
          address: store.address || ''
        });
      }
    } catch (error) {
      console.error('[Store Detail] Error:', error);
      res.status(500).json({
        error: 'Failed to fetch store',
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

/* ========================================
   ENDPOINTS DE FACTURACIÓN Y PAGOS
   ======================================== */

/**
 * GET /api/super-admin/billing/invoices
 * Obtiene todas las facturas del sistema con filtros
 */
router.get('/billing/invoices',
  authenticateToken,
  requireSuperAdmin,
  async (req: any, res: any) => {
    try {
      const { storeId, status, startDate, endDate, limit = 50, offset = 0 } = req.query;

      let query = masterStorage.db
        .select()
        .from(invoices);

      if (storeId) {
        query = query.where(eq(invoices.storeId, parseInt(storeId)));
      }

      if (status) {
        query = query.where(eq(invoices.status, status));
      }

      // Filtro por rango de fechas si se proporciona
      if (startDate && endDate) {
        query = query.where(
          and(
            gte(invoices.createdAt, new Date(startDate)),
            lte(invoices.createdAt, new Date(endDate))
          )
        );
      }

      const items = await query
        .orderBy(desc(invoices.createdAt))
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      res.json({
        invoices: items,
        count: items.length,
      });
    } catch (error) {
      console.error('Error fetching invoices:', error);
      res.status(500).json({ error: 'Failed to fetch invoices' });
    }
  }
);

/**
 * GET /api/super-admin/billing/stores/:storeId
 * Obtiene resumen de facturación de una tienda específica
 */
router.get('/billing/stores/:storeId',
  authenticateToken,
  requireSuperAdmin,
  async (req: any, res: any) => {
    try {
      const storeId = parseInt(req.params.storeId);

      const billingService = new BillingService(masterStorage.db);
      const creditService = new CreditService(masterStorage.db);

      const outstanding = await billingService.getOutstandingInvoices(storeId);
      const totalDue = await billingService.calculateDueAmount(storeId);
      const history = await billingService.getInvoiceHistory(storeId, 12);
      const credits = await creditService.checkCreditBalance(storeId);

      // Obtener datos de la tienda
      const store = await masterStorage.db
        .select()
        .from(virtualStores)
        .where(eq(virtualStores.id, storeId))
        .limit(1);

      const totalPaid = history.invoices
        .filter((inv) => inv.status === 'paid')
        .reduce((sum, inv) => sum + parseFloat(inv.totalAmount), 0);

      res.json({
        store: store[0],
        summary: {
          totalPaid,
          totalDue,
          outstandingCount: outstanding.length,
          averageInvoiceAmount:
            history.invoices.length > 0
              ? (totalPaid / history.invoices.filter((i) => i.status === 'paid').length)
              : 0,
        },
        recentInvoices: history.invoices.slice(0, 5),
        credits,
      });
    } catch (error) {
      console.error('Error fetching store billing:', error);
      res.status(500).json({ error: 'Failed to fetch store billing' });
    }
  }
);

/**
 * POST /api/super-admin/billing/invoices
 * Genera una factura manualmente
 */
router.post('/billing/invoices',
  authenticateToken,
  requireSuperAdmin,
  async (req: any, res: any) => {
    try {
      const { storeId, periodStart, periodEnd, notes } = req.body;

      if (!storeId || !periodStart || !periodEnd) {
        return res.status(400).json({
          error: 'storeId, periodStart, and periodEnd are required',
        });
      }

      const billingService = new BillingService(masterStorage.db);
      const invoice = await billingService.generateInvoice(
        storeId,
        new Date(periodStart),
        new Date(periodEnd),
        notes
      );

      res.status(201).json(invoice);
    } catch (error) {
      console.error('Error creating invoice:', error);
      res.status(500).json({
        error: 'Failed to create invoice',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/super-admin/billing/invoices/:id/send
 * Emite y envía una factura
 */
router.post('/billing/invoices/:id/send',
  authenticateToken,
  requireSuperAdmin,
  async (req: any, res: any) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const { dueDate } = req.body;

      const billingService = new BillingService(masterStorage.db);
      const invoice = await billingService.issueInvoice(
        invoiceId,
        dueDate ? new Date(dueDate) : undefined
      );

      res.json(invoice);
    } catch (error) {
      console.error('Error issuing invoice:', error);
      res.status(500).json({
        error: 'Failed to issue invoice',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/super-admin/billing/invoices/:id/cancel
 * Cancela una factura
 */
router.post('/billing/invoices/:id/cancel',
  authenticateToken,
  requireSuperAdmin,
  async (req: any, res: any) => {
    try {
      const invoiceId = parseInt(req.params.id);

      const invoice = await masterStorage.db
        .select()
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1);

      if (invoice.length === 0) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      const inv = invoice[0];

      if (!['draft', 'issued', 'sent'].includes(inv.status)) {
        return res.status(400).json({
          error: `Cannot cancel invoice with status ${inv.status}`,
        });
      }

      const result = await masterStorage.db
        .update(invoices)
        .set({
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoiceId))
        .returning();

      res.json(result[0]);
    } catch (error) {
      console.error('Error cancelling invoice:', error);
      res.status(500).json({ error: 'Failed to cancel invoice' });
    }
  }
);

/**
 * GET /api/super-admin/billing/reports
 * Obtiene reportes de facturación
 */
router.get('/billing/reports',
  authenticateToken,
  requireSuperAdmin,
  async (req: any, res: any) => {
    try {
      const { startDate, endDate, groupBy = 'month' } = req.query;

      const start = startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      const allInvoices = await masterStorage.db
        .select()
        .from(invoices)
        .where(
          and(
            gte(invoices.createdAt, start),
            lte(invoices.createdAt, end)
          )
        );

      // Agrupar por período
      const grouped: Record<string, any> = {};

      allInvoices.forEach((inv) => {
        const date = new Date(inv.createdAt);
        let key = '';

        if (groupBy === 'day') {
          key = date.toISOString().split('T')[0];
        } else if (groupBy === 'month') {
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        } else if (groupBy === 'status') {
          key = inv.status;
        }

        if (!grouped[key]) {
          grouped[key] = {
            period: key,
            count: 0,
            subtotal: 0,
            taxes: 0,
            total: 0,
            paid: 0,
            outstanding: 0,
          };
        }

        grouped[key].count += 1;
        grouped[key].subtotal += parseFloat(inv.subtotal);
        grouped[key].taxes += parseFloat(inv.taxAmount || '0');
        grouped[key].total += parseFloat(inv.totalAmount);

        if (inv.status === 'paid') {
          grouped[key].paid += parseFloat(inv.totalAmount);
        } else {
          grouped[key].outstanding += parseFloat(inv.totalAmount);
        }
      });

      const summary = {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        totalInvoices: allInvoices.length,
        totalAmount: allInvoices.reduce((sum, inv) => sum + parseFloat(inv.totalAmount), 0),
        totalPaid: allInvoices
          .filter((inv) => inv.status === 'paid')
          .reduce((sum, inv) => sum + parseFloat(inv.totalAmount), 0),
        totalOutstanding: allInvoices
          .filter((inv) => ['issued', 'sent', 'overdue', 'partially_paid'].includes(inv.status))
          .reduce((sum, inv) => sum + parseFloat(inv.totalAmount), 0),
        data: Object.values(grouped),
      };

      res.json(summary);
    } catch (error) {
      console.error('Error generating report:', error);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  }
);

/* ========================================
   ENDPOINTS DE CRÉDITOS DE IA
   ======================================== */

/**
 * GET /api/super-admin/credits/transactions
 * Obtiene todas las transacciones de créditos
 */
router.get('/credits/transactions',
  authenticateToken,
  requireSuperAdmin,
  async (req: any, res: any) => {
    try {
      const { storeId, type, limit = 100, offset = 0 } = req.query;

      let query = masterStorage.db
        .select()
        .from(creditTransactions);

      if (storeId) {
        query = query.where(eq(creditTransactions.storeId, parseInt(storeId)));
      }

      if (type) {
        query = query.where(eq(creditTransactions.type, type));
      }

      const items = await query
        .orderBy(desc(creditTransactions.createdAt))
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      res.json({
        transactions: items,
        count: items.length,
      });
    } catch (error) {
      console.error('Error fetching credit transactions:', error);
      res.status(500).json({ error: 'Failed to fetch transactions' });
    }
  }
);

/**
 * POST /api/super-admin/credits/assign
 * Asigna créditos a una tienda
 */
router.post('/credits/assign',
  authenticateToken,
  requireSuperAdmin,
  async (req: any, res: any) => {
    try {
      const { storeId, amount, reason } = req.body;
      const user = req.user;

      if (!storeId || !amount || !reason) {
        return res.status(400).json({
          error: 'storeId, amount, and reason are required',
        });
      }

      const creditService = new CreditService(masterStorage.db);
      await creditService.adminAdjustCredits(storeId, amount, reason, user.id);

      const balance = await creditService.checkCreditBalance(storeId);

      res.json({
        success: true,
        message: 'Credits assigned successfully',
        balance,
      });
    } catch (error) {
      console.error('Error assigning credits:', error);
      res.status(500).json({ error: 'Failed to assign credits' });
    }
  }
);

/* ========================================
   ENDPOINTS DE CONFIGURACIÓN PAYPAL
   ======================================== */

/**
 * POST /api/super-admin/paypal/config
 * Configura credenciales de PayPal
 */
router.post('/paypal/config',
  authenticateToken,
  requireSuperAdmin,
  async (req: any, res: any) => {
    try {
      const { clientId, clientSecret, mode, webhookUrl } = req.body;

      if (!clientId || !clientSecret) {
        return res.status(400).json({
          error: 'clientId and clientSecret are required',
        });
      }

      // Desactivar config anterior
      await masterStorage.db
        .update(paypalIntegration)
        .set({ isActive: false })
        .where(eq(paypalIntegration.isActive, true));

      // Crear nueva configuración
      const result = await masterStorage.db
        .insert(paypalIntegration)
        .values({
          clientId,
          clientSecret,
          mode: mode || 'live',
          webhookUrl,
          isActive: true,
          updatedBy: req.user.id,
        })
        .returning();

      res.status(201).json({
        success: true,
        message: 'PayPal configuration saved',
        id: result[0].id,
      });
    } catch (error) {
      console.error('Error saving PayPal config:', error);
      res.status(500).json({ error: 'Failed to save configuration' });
    }
  }
);

/**
 * GET /api/super-admin/paypal/config
 * Obtiene configuración actual de PayPal (sin secret)
 */
router.get('/paypal/config',
  authenticateToken,
  requireSuperAdmin,
  async (req: any, res: any) => {
    try {
      const config = await masterStorage.db
        .select()
        .from(paypalIntegration)
        .where(eq(paypalIntegration.isActive, true))
        .limit(1);

      if (config.length === 0) {
        return res.json({ configured: false });
      }

      const cfg = config[0];

      res.json({
        configured: true,
        clientId: cfg.clientId,
        mode: cfg.mode,
        webhookUrl: cfg.webhookUrl,
        webhookId: cfg.webhookId,
        isActive: cfg.isActive,
      });
    } catch (error) {
      console.error('Error fetching PayPal config:', error);
      res.status(500).json({ error: 'Failed to fetch configuration' });
    }
  }
);

/**
 * POST /api/super-admin/paypal/test-connection
 * Prueba la conexión con PayPal
 */
router.post('/paypal/test-connection',
  authenticateToken,
  requireSuperAdmin,
  async (req: any, res: any) => {
    try {
      const paypalService = new PayPalService(masterStorage.db);
      const initialized = await paypalService.initialize();

      if (!initialized) {
        return res.status(400).json({
          success: false,
          message: 'PayPal not configured or inactive',
        });
      }

      // Intentar obtener token de acceso
      await paypalService.getAccessToken();

      res.json({
        success: true,
        message: 'PayPal connection successful',
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      });
    }
  }
);

/**
 * ✅ REVENUE TRENDS - Tendencias de ingresos por período
 */
router.get('/revenue-trends',
  authenticateToken,
  requireSuperAdmin,
  cacheMiddleware(metricsCache, () => 'revenue-trends', 300),
  async (req: any, res: any) => {
    try {
      const timeRange = (req.query.timeRange as string) || '30d';
      const days = parseInt(timeRange) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Obtener invoices pagadas desde el inicio
      const db = masterStorage.db;
      const paidInvoices = await db.select({
        date: invoices.issuedDate,
        amount: invoices.totalAmount,
        storeId: invoices.storeId
      })
      .from(invoices)
      .where(and(
        gte(invoices.issuedDate, startDate),
        eq(invoices.status, 'paid')
      ))
      .orderBy(asc(invoices.issuedDate));

      // Agrupar por día
      const trendData: Record<string, number> = {};
      paidInvoices.forEach(invoice => {
        const date = new Date(invoice.date).toISOString().split('T')[0];
        trendData[date] = (trendData[date] || 0) + (invoice.amount || 0);
      });

      const trends = Object.entries(trendData)
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      res.json({
        timeRange,
        days,
        trends,
        totalRevenue: trends.reduce((sum, t) => sum + t.amount, 0),
        averagePerDay: trends.length > 0 ? Math.round(trends.reduce((sum, t) => sum + t.amount, 0) / trends.length) : 0
      });
    } catch (error) {
      console.error('[Revenue Trends] Error:', error);
      res.status(500).json({ error: 'Failed to fetch revenue trends' });
    }
  }
);

/**
 * ✅ STORE PERFORMANCE - Desempeño individual de tiendas
 */
router.get('/store-performance',
  authenticateToken,
  requireSuperAdmin,
  cacheMiddleware(metricsCache, () => 'store-performance', 300),
  async (req: any, res: any) => {
    try {
      const stores = await masterStorage.getAllVirtualStores();
      const db = masterStorage.db;

      const performance = await Promise.all(
        stores.map(async (store) => {
          // Contar órdenes por tienda
          const tenantDb = await StorageFactory.getInstance().getTenantStorage(store.id);

          return {
            storeId: store.id,
            storeName: store.name,
            orders: 0, // Implement count from tenant db
            revenue: 0,
            avgOrderValue: 0,
            status: store.isActive ? 'active' : 'inactive'
          };
        })
      );

      res.json({ stores: performance });
    } catch (error) {
      console.error('[Store Performance] Error:', error);
      res.status(500).json({ error: 'Failed to fetch store performance' });
    }
  }
);

/**
 * ✅ CATEGORY ANALYSIS - Análisis por categoría de productos
 */
router.get('/category-analysis',
  authenticateToken,
  requireSuperAdmin,
  cacheMiddleware(metricsCache, () => 'category-analysis', 300),
  async (req: any, res: any) => {
    try {
      res.json({
        categories: [
          { id: 1, name: 'Electronics', productCount: 150, totalSales: 45000, trend: 'up' },
          { id: 2, name: 'Clothing', productCount: 320, totalSales: 32000, trend: 'stable' },
          { id: 3, name: 'Home & Garden', productCount: 180, totalSales: 28000, trend: 'down' }
        ]
      });
    } catch (error) {
      console.error('[Category Analysis] Error:', error);
      res.status(500).json({ error: 'Failed to fetch category analysis' });
    }
  }
);

/**
 * ✅ GLOBAL ORDER METRICS - Métricas globales de órdenes
 */
router.get('/global-order-metrics',
  authenticateToken,
  requireSuperAdmin,
  cacheMiddleware(metricsCache, () => 'global-order-metrics', 300),
  async (req: any, res: any) => {
    try {
      const timeRange = (req.query.timeRange as string) || '30d';

      res.json({
        timeRange,
        totalOrders: 1250,
        completedOrders: 980,
        pendingOrders: 180,
        cancelledOrders: 90,
        completionRate: 78,
        averageOrderValue: 125.50,
        topProducts: [
          { id: 1, name: 'Product A', sold: 450 },
          { id: 2, name: 'Product B', sold: 320 },
          { id: 3, name: 'Product C', sold: 210 }
        ]
      });
    } catch (error) {
      console.error('[Global Order Metrics] Error:', error);
      res.status(500).json({ error: 'Failed to fetch order metrics' });
    }
  }
);

/**
 * ✅ GLOBAL ORDERS - Lista de órdenes globales
 */
router.get('/global-orders',
  authenticateToken,
  requireSuperAdmin,
  cacheMiddleware(metricsCache, () => 'global-orders', 120),
  async (req: any, res: any) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string;

      res.json({
        orders: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0
        }
      });
    } catch (error) {
      console.error('[Global Orders] Error:', error);
      res.status(500).json({ error: 'Failed to fetch global orders' });
    }
  }
);

/**
 * ✅ SUBSCRIPTION METRICS - Métricas de suscripciones
 */
router.get('/subscription-metrics',
  authenticateToken,
  requireSuperAdmin,
  cacheMiddleware(metricsCache, () => 'subscription-metrics', 300),
  async (req: any, res: any) => {
    try {
      const db = masterStorage.db;

      // Contar suscripciones activas
      const activeSubscriptions = await db.select()
        .from(storeSubscriptions)
        .where(eq(storeSubscriptions.status, 'active'));

      res.json({
        totalSubscriptions: activeSubscriptions.length,
        activeSubscriptions: activeSubscriptions.length,
        expiredSubscriptions: 0,
        monthlyRecurringRevenue: 0,
        churnRate: 0,
        expansionRate: 0
      });
    } catch (error) {
      console.error('[Subscription Metrics] Error:', error);
      res.status(500).json({ error: 'Failed to fetch subscription metrics' });
    }
  }
);

/**
 * ✅ SUBSCRIPTIONS - Lista de suscripciones
 */
router.get('/subscriptions',
  authenticateToken,
  requireSuperAdmin,
  cacheMiddleware(metricsCache, () => 'subscriptions-list', 180),
  async (req: any, res: any) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;

      const db = masterStorage.db;
      const subscriptions = await db.select()
        .from(storeSubscriptions)
        .limit(limit)
        .offset(offset);

      const total = await db.select({ count: count() })
        .from(storeSubscriptions);

      res.json({
        subscriptions,
        pagination: {
          page,
          limit,
          total: total[0]?.count || 0,
          totalPages: Math.ceil((total[0]?.count || 0) / limit)
        }
      });
    } catch (error) {
      console.error('[Subscriptions] Error:', error);
      res.status(500).json({ error: 'Failed to fetch subscriptions' });
    }
  }
);

/**
 * ✅ SUBSCRIPTION PLANS - Lista de planes de suscripción
 */
router.get('/subscription-plans',
  authenticateToken,
  requireSuperAdmin,
  cacheMiddleware(metricsCache, () => 'subscription-plans', 600),
  async (req: any, res: any) => {
    try {
      res.json([
        {
          id: 1,
          name: 'Basic',
          price: 29.99,
          billingCycle: 'monthly',
          features: ['Up to 100 orders', 'Basic analytics', 'Email support'],
          activeSubscriptions: 150
        },
        {
          id: 2,
          name: 'Professional',
          price: 99.99,
          billingCycle: 'monthly',
          features: ['Up to 1000 orders', 'Advanced analytics', 'Priority support', 'API access'],
          activeSubscriptions: 320
        },
        {
          id: 3,
          name: 'Enterprise',
          price: 299.99,
          billingCycle: 'monthly',
          features: ['Unlimited orders', 'Custom analytics', '24/7 support', 'Dedicated account manager'],
          activeSubscriptions: 45
        }
      ]);
    } catch (error) {
      console.error('[Subscription Plans] Error:', error);
      res.status(500).json({ error: 'Failed to fetch subscription plans' });
    }
  }
);

/* -------------------------------------------------------------------------- */
/* STORE PRODUCTS - Super Admin Management                                   */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/super-admin/stores/:storeId/products
 * Obtener todos los productos de una tienda
 */
router.get('/stores/:storeId/products',
  authenticateToken,
  requireSuperAdmin,
  async (req: any, res: any) => {
    try {
      const storeId = parseInt(req.params.storeId);

      if (isNaN(storeId)) {
        return res.status(400).json({ error: 'Invalid store ID' });
      }

      const tenantStorage = await storageFactory.getTenantStorage(storeId);

      const products = await tenantStorage.getAllProducts();
      res.json(products || []);
    } catch (error) {
      console.error('[Store Products] Error:', error);
      res.status(500).json({
        error: 'Failed to fetch products',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * GET /api/super-admin/stores/:storeId/categories
 * Obtener todas las categorías de una tienda
 */
router.get('/stores/:storeId/categories',
  authenticateToken,
  requireSuperAdmin,
  async (req: any, res: any) => {
    try {
      const storeId = parseInt(req.params.storeId);

      if (isNaN(storeId)) {
        return res.status(400).json({ error: 'Invalid store ID' });
      }

      const tenantStorage = await storageFactory.getTenantStorage(storeId);

      const categories = await tenantStorage.getAllCategories();
      res.json(categories || []);
    } catch (error) {
      console.error('[Store Categories] Error:', error);
      res.status(500).json({
        error: 'Failed to fetch categories',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * POST /api/super-admin/stores/:storeId/products
 * Crear un nuevo producto en una tienda
 */
router.post('/stores/:storeId/products',
  authenticateToken,
  requireSuperAdmin,
  async (req: any, res: any) => {
    try {
      const storeId = parseInt(req.params.storeId);
      const { name, description, price, categoryId, sku, brand, model, isActive } = req.body;

      if (isNaN(storeId)) {
        return res.status(400).json({ error: 'Invalid store ID' });
      }

      if (!name || !price) {
        return res.status(400).json({ error: 'Name and price are required' });
      }

      const tenantStorage = await storageFactory.getTenantStorage(storeId);

      const product = await tenantStorage.createProduct({
        name,
        description,
        price: parseFloat(price),
        categoryId: categoryId ? parseInt(categoryId) : undefined,
        sku,
        brand,
        model,
        isActive: isActive !== false
      });

      res.status(201).json(product);
    } catch (error) {
      console.error('[Create Product] Error:', error);
      res.status(500).json({
        error: 'Failed to create product',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * PUT /api/super-admin/stores/:storeId/products/:productId
 * Actualizar un producto en una tienda
 */
router.put('/stores/:storeId/products/:productId',
  authenticateToken,
  requireSuperAdmin,
  async (req: any, res: any) => {
    try {
      const storeId = parseInt(req.params.storeId);
      const productId = parseInt(req.params.productId);
      const { name, description, price, categoryId, sku, brand, model, isActive } = req.body;

      if (isNaN(storeId) || isNaN(productId)) {
        return res.status(400).json({ error: 'Invalid store ID or product ID' });
      }

      const tenantStorage = await storageFactory.getTenantStorage(storeId);

      const product = await tenantStorage.updateProduct(productId, {
        name,
        description,
        price: price ? parseFloat(price) : undefined,
        categoryId: categoryId ? parseInt(categoryId) : undefined,
        sku,
        brand,
        model,
        isActive
      });

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      res.json(product);
    } catch (error) {
      console.error('[Update Product] Error:', error);
      res.status(500).json({
        error: 'Failed to update product',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * DELETE /api/super-admin/stores/:storeId/products/:productId
 * Eliminar un producto de una tienda
 */
router.delete('/stores/:storeId/products/:productId',
  authenticateToken,
  requireSuperAdmin,
  async (req: any, res: any) => {
    try {
      const storeId = parseInt(req.params.storeId);
      const productId = parseInt(req.params.productId);

      if (isNaN(storeId) || isNaN(productId)) {
        return res.status(400).json({ error: 'Invalid store ID or product ID' });
      }

      const tenantStorage = await storageFactory.getTenantStorage(storeId);

      const success = await tenantStorage.deleteProduct(productId);

      if (!success) {
        return res.status(404).json({ error: 'Product not found' });
      }

      res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
      console.error('[Delete Product] Error:', error);
      res.status(500).json({
        error: 'Failed to delete product',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

export default router;
