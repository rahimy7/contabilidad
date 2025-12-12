import express, { Request, Response } from "express";
import bcrypt from "bcryptjs"; // ✅ Usar bcryptjs para compatibilidad
import jwt from "jsonwebtoken";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import { sql, eq, count, and, isNull, or, max, desc, asc } from "drizzle-orm";
import { exchangeRateRoutes } from './exchange-rate.routes';
import { productCurrencyMiddleware } from './middleware/currency.middleware.js';
import employeeRouter from './routes/employee-routes.js';
import tripRoutes from './routes/trip-routes';
import unitConversionRoutes from './routes/unit-conversion-routes';
import customerManagementRoutes from './routes/customer-management-routes';
import purchaseManagementRoutes from './routes/purchase-management-routes';

// Schema and Types
import {
  insertUserSchema,
  // selectUserSchema, // ❌ No existe, removido
  insertNotificationSchema,
  type User as SelectUser,
  // userRoleEnum, // ❌ No existe, removido
} from "@shared/schema";
import { type AuthUser } from "@shared/auth";

// Middleware
import { authenticateToken, requireSuperAdmin, requireAdmin } from "./authMiddleware";

// Storage Layer
import { StorageFactory } from './storage/storage-factory';
import { UnifiedStorage } from './storage/unified-storage';
import { getTenantStorage, healthCheck, TenantStorage } from './storage/index';
import { db as masterDb } from './db'; // ✅ Usar db como masterDb
import * as schema from '@shared/schema'; // ✅ Importar schema directamente
import { getTenantDb } from "./multi-tenant-db.js";
import { createTenantStorage } from "./tenant-storage.js";
import { NotificationService } from "./notification-service.js";
import superAdminRoutes from './routes/super-admin-routes';
import { executeAutoAssignment } from "./services/auto-assignment-service.js";
import { integrateWithAutoAssignment, TripService } from "./services/trip-service.js";


function getSchemaForUser(user: AuthUser): 'public' | 'tenant' {
  return user.role === 'super_admin' ? 'public' : 'tenant';
}

// ✅ Schema de validación para reglas de asignación
const assignmentRuleSchema = z.object({
  name: z.string().min(3, "Nombre requerido"),
  priority: z.number().min(1).max(10),
  isActive: z.boolean().default(true),
  useSectorBased: z.boolean().default(true),
  requiredProvince: z.string().optional(),
  requiredMunicipality: z.string().optional(),
  requiredSectors: z.array(z.string()).optional(),
  allowAdjacentMunicipalities: z.boolean().default(true),
  useSpecializationBased: z.boolean().default(false),
  requiredSpecializations: z.array(z.string()).optional(),
  useWorkloadBased: z.boolean().default(true),
  maxOrdersPerTechnician: z.number().min(1).max(20),
  useTimeBased: z.boolean().default(true),
  availabilityRequired: z.boolean().default(true),
  applicableProducts: z.array(z.string()).optional(),
  applicableServices: z.array(z.string()).optional(),
  assignmentMethod: z.enum(['closest_available', 'least_busy', 'highest_skill', 'round_robin', 'specific_users']),
  assignedUserIds: z.array(z.number()).optional(), // ✅ NUEVO
  autoAssign: z.boolean().default(true),
  notifyCustomer: z.boolean().default(true),
  estimatedResponseTime: z.number().default(60),
});

const byCustomerOrderSchema = z.object({
  customerId: z.coerce.number().int().positive(),
  totalAmount: z.coerce.number().nonnegative().optional(),
  notes: z.string().optional(),
  assignedUserId: z.coerce.number().int().positive().optional(),
  customerAddress: z.string().optional(),
  customerLatitude: z.coerce.number().optional(),
  customerLongitude: z.coerce.number().optional(),
  items: z.array(z.object({
    productId: z.coerce.number().int(),
    quantity: z.coerce.number().int().min(1).default(1),
    unitPrice: z.coerce.number().nonnegative().optional(),
    totalPrice: z.coerce.number().nonnegative().optional(),
    installationCost: z.coerce.number().optional(),
    partsCost: z.coerce.number().optional(),
    laborHours: z.coerce.number().optional(),
    laborRate: z.coerce.number().optional(),
    deliveryCost: z.coerce.number().optional(),
    deliveryDistance: z.coerce.number().optional(),
    notes: z.string().optional(),
  })).optional(),
}).passthrough();

export async function getTenantStorageWithSchema(user: any) {
  // ✅ Super admins deben usar endpoints de /api/super-admin/
  if (user.role === 'super_admin') {
    throw new Error('Super admin should use /api/super-admin/ endpoints');
  }

  if (!user.storeId) {
    throw new Error('Store ID required for tenant operations');
  }

  return storageFactory.getTenantStorage(user.storeId);
}

const storageFactory = StorageFactory.getInstance();

const routeWithSchemaRouting = (handler: Function) => {
  return async (req: any, res: any, next: any) => {
    try {
      const user = req.user as AuthUser;
      
      // Determinar si forzar public schema
      const forcePublic = user.role === 'super_admin';
      
      if (forcePublic) {
        console.log(`🔑 Super admin accessing PUBLIC schema`);
      } else {
        console.log(`🏪 Store user accessing TENANT schema for store ${user.storeId}`);
      }
      
      // Inyectar schema info en request
      req.schemaType = forcePublic ? 'public' : 'tenant';
      
      return await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
};



// ================================
// STORAGE INITIALIZATION
// ================================
const masterStorage = storageFactory.getMasterStorage();

// ================================
// CONFIGURATION
// ================================
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// ================================
// MULTER CONFIGURATION
// ================================
const upload = multer({
  storage: multer.memoryStorage(), // ← CRÍTICO: usar memoria en lugar de disco
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});




// ================================
// HELPER FUNCTIONS
// ================================

/**
 * Obtiene el storage unificado para un usuario específico
 */
async function getUnifiedStorageForUser(user: AuthUser): Promise<UnifiedStorage> {
  if (!user.storeId) {
    throw new Error('User must have a store ID');
  }
  return new UnifiedStorage(user.storeId);
}

async function syncOrderStatusWithTrip(
  storeId: number,
  orderId: number,
  newOrderStatus: string
): Promise<void> {
  try {
    console.log(`🔄 [SYNC] Sincronizando estado de orden ${orderId} con viaje... (nuevo estado: ${newOrderStatus})`);

    const db = await getTenantDb(storeId);

    // Obtener información completa de la orden
    const [order] = await db
      .select({
        tripId: schema.orders.tripId,
        assignedUserId: schema.orders.assignedUserId
      })
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId))
      .limit(1);

    if (!order) {
      console.log(`❌ [SYNC] Orden ${orderId} no encontrada`);
      return;
    }

    // ✅ NUEVO: Si la orden cambia a "processing" y NO está en un viaje, asignarla automáticamente
    if (newOrderStatus === 'processing' && !order.tripId) {
      console.log(`📌 [SYNC] Orden ${orderId} cambió a 'processing' sin viaje asignado. Asignando automáticamente...`);

      try {
        const result = await TripService.assignOrderToTripAutomatically(
          storeId,
          orderId,
          order.assignedUserId
        );

        console.log(`✅ [SYNC] Orden ${orderId} asignada automáticamente al viaje ${result.tripNumber} (ID: ${result.tripId})`);

        // ✅ CRÍTICO: Actualizar order.tripId para reflejar la asignación
        order.tripId = result.tripId;
      } catch (assignError) {
        console.error(`⚠️ [SYNC] Error asignando orden a viaje:`, assignError);
        // Continuar con la sincronización aunque falle la asignación automática
      }
    }

    // Si la orden no está en un viaje, no hay más qué sincronizar
    if (!order.tripId) {
      console.log(`ℹ️ [SYNC] Orden ${orderId} no está asociada a ningún viaje`);
      return;
    }

    const tripId = order.tripId;
    console.log(`🚚 [SYNC] Orden ${orderId} está en viaje ${tripId}`);

    // Mapear el estado de la orden al estado del tripOrder
    let tripOrderStatus: 'pending' | 'picked' | 'cancelled' = 'pending';

    // Si la orden está completada, delivered o picked_up -> marcar como 'picked' en el viaje
    if (['completed', 'delivered', 'picked_up'].includes(newOrderStatus)) {
      tripOrderStatus = 'picked';
    } else if (newOrderStatus === 'cancelled') {
      tripOrderStatus = 'cancelled';
    } else {
      tripOrderStatus = 'pending';
    }

    console.log(`📝 [SYNC] Actualizando tripOrder status a: ${tripOrderStatus}`);

    // Actualizar el estado en tripOrders
    await db
      .update(schema.tripOrders)
      .set({
        status: tripOrderStatus,
        pickedAt: tripOrderStatus === 'picked' ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(and(
        eq(schema.tripOrders.tripId, tripId),
        eq(schema.tripOrders.orderId, orderId)
      ));

    // Actualizar el progreso del viaje
    await updateTripProgress(db, tripId);

    // Verificar si el viaje debe completarse automáticamente
    const [tripData] = await db
      .select({
        totalOrders: schema.trips.totalOrders,
        completedOrders: schema.trips.completedOrders,
        status: schema.trips.status,
      })
      .from(schema.trips)
      .where(eq(schema.trips.id, tripId));

    // Si todas las órdenes están completadas y el viaje está activo, marcarlo como completado
    if (tripData &&
        tripData.completedOrders === tripData.totalOrders &&
        tripData.completedOrders > 0 &&
        (tripData.status === 'active' || tripData.status === 'processing')) {

      console.log(`✅ [SYNC] Todas las órdenes completadas. Marcando viaje ${tripId} como completado`);

      const [trip] = await db
        .select({ startedAt: schema.trips.startedAt })
        .from(schema.trips)
        .where(eq(schema.trips.id, tripId));

      const duration = trip?.startedAt
        ? Math.floor((new Date().getTime() - new Date(trip.startedAt).getTime()) / 60000)
        : null;

      await db
        .update(schema.trips)
        .set({
          status: 'completed',
          completedAt: new Date(),
          actualDuration: duration,
          updatedAt: new Date(),
        })
        .where(eq(schema.trips.id, tripId));

      console.log(`🎉 [SYNC] Viaje ${tripId} completado automáticamente`);
    }

    console.log(`✅ [SYNC] Sincronización completada para orden ${orderId}`);

  } catch (error) {
    console.error(`❌ [SYNC] Error sincronizando orden ${orderId} con viaje:`, error);
    // No lanzar el error para que no falle la actualización de la orden
  }
}

async function updateTripProgress(db: any, tripId: number) {
  try {
    const [orderCount] = await db
      .select({
        total: count(),
        // ✅ Cambio: Verificar estado en tabla 'orders', no 'tripOrders'
        completed: sql<number>`COUNT(CASE WHEN ${schema.orders.status} IN ('completed', 'picked_up') THEN 1 END)`,
      })
      .from(schema.tripOrders)
      .leftJoin(schema.orders, eq(schema.tripOrders.orderId, schema.orders.id))  // ✅ AGREGAR ESTA LÍNEA
      .where(eq(schema.tripOrders.tripId, tripId));

    const [amountSum] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${schema.orders.totalAmount}), 0)`,
      })
      .from(schema.tripOrders)
      .leftJoin(schema.orders, eq(schema.tripOrders.orderId, schema.orders.id))  // ✅ Ya existe este
      .where(eq(schema.tripOrders.tripId, tripId));

    const totalOrders = orderCount.total || 0;
    const completedOrders = orderCount.completed || 0;
    
    // ✅ AGREGAR: Auto-completar viaje si todas las órdenes están completadas
    let newStatus = undefined;
    if (totalOrders > 0 && completedOrders === totalOrders) {
      newStatus = 'completed';
    }

    const updateData: any = {
      totalOrders,
      completedOrders,
      totalAmount: amountSum.total || '0',
      updatedAt: new Date(),
    };

    // ✅ AGREGAR: Actualizar status si corresponde
    if (newStatus) {
      updateData.status = newStatus;
      updateData.completedAt = new Date();
    }

    await db
      .update(schema.trips)
      .set(updateData)
      .where(eq(schema.trips.id, tripId));

    console.log(`✅ [UPDATE-TRIP] Viaje ${tripId}: ${completedOrders}/${totalOrders} completadas`);
  } catch (error) {
    console.error(`❌ [UPDATE-TRIP] Error:`, error);
    throw error;
  }
}
/**
 * Obtiene el tenant storage directamente para un usuario
 */
async function getTenantStorageInternal(user: AuthUser) {
  if (!user.storeId) {
    throw new Error('User must have a store ID');
  }
  return await getTenantStorage(user.storeId);
}

/**
 * Valida acceso al tenant storage
 */
async function validateTenantAccess(storeId: number): Promise<void> {
  const store = await masterStorage.getVirtualStore(storeId);
  if (!store) {
    throw new Error('Store not found');
  }
  if (!store.databaseUrl?.includes('schema=')) {
    throw new Error('Store not configured for tenant storage');
  }
}

/**
 * Procesa imágenes de productos
 */
async function processProductImages(
  files: Express.Multer.File[],
  imageUrls: string[],
  storeId: number,
  productId?: number
): Promise<string[]> {
  const processedImages: string[] = [];

  try {
    // Con Supabase Storage (cuando esté configurado)
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      // Dinamically import SupabaseStorageManager to avoid build issues
      const { SupabaseStorageManager } = await import('./supabase-storage');
      const storageManager = new SupabaseStorageManager(storeId);
      
      // Procesar archivos subidos
      for (const file of files) {
        const fileObject = new File([new Uint8Array(file.buffer)], file.originalname, { type: file.mimetype });
        const imageUrl = await storageManager.uploadFile(fileObject, productId);
        processedImages.push(imageUrl);
      }

      // Procesar URLs de imágenes
      for (const url of imageUrls) {
        const imageUrl = await storageManager.uploadFromUrl(url, productId);
        processedImages.push(imageUrl);
      }
    } 
    // Placeholder para desarrollo
    else {
      console.log('📁 USING PLACEHOLDER STORAGE - Configure Supabase for production');
      
      // Procesar archivos subidos
      for (const file of files) {
        const imageUrl = `/uploads/${file.filename}`;
        processedImages.push(imageUrl);
      }

      // Procesar URLs de imágenes
      for (const url of imageUrls) {
        try {
          const response = await fetch(url, { method: 'HEAD' });
          if (response.ok) {
            processedImages.push(url);
          }
        } catch (error) {
          console.warn(`Error validating image URL: ${url}`, error);
        }
      }
    }

    return processedImages;
  } catch (error) {
    console.error('Error processing images:', error);
    throw error;
  }
}

/**
 * Genera link de Google Maps
 */
function generateGoogleMapsLink(latitude: string | number, longitude: string | number, address?: string): string {
  const lat = parseFloat(latitude.toString());
  const lng = parseFloat(longitude.toString());
  
  if (isNaN(lat) || isNaN(lng)) {
    return address || 'Ubicación no disponible';
  }
  
  const baseUrl = 'https://www.google.com/maps/search/';
  
  if (address && address.trim() !== '') {
    return `${baseUrl}${encodeURIComponent(address)}/@${lat},${lng},15z`;
  } else {
    return `${baseUrl}@${lat},${lng},15z`;
  }
}

/**
 * Formatea moneda
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(amount);
}

// ================================
// MIDDLEWARE
// ================================

/**
 * Middleware para validar tenant storage
 */
const requireTenantStorage = async (req: any, res: any, next: any) => {
  try {
    const user = req.user;
    
    if (!user.storeId) {
      return res.status(400).json({ error: 'Store ID required for this operation' });
    }
    
    await validateTenantAccess(user.storeId);
    const tenantStorage = await getTenantStorageInternal(user);
    
    req.tenantStorage = tenantStorage;
    next();
  } catch (error) {
    console.error('Tenant storage validation failed:', error);
    res.status(500).json({ error: 'Failed to access store data' });
  }
};

// ================================
// PRODUCT HANDLERS
// ================================

const getProductsHandler = async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;

    if (user.role === 'super_admin') {
      return res.status(403).json({
        error: "Super admin debe usar /api/super-admin/stores/:storeId/products"
      });
    }

    if (!user.storeId) {
      return res.status(403).json({
        error: "Store ID es requerido"
      });
    }

    console.log('🛍️ Getting products for store:', user.storeId);

    // ✅ CORRECCIÓN: Asignar el resultado a la variable products
    const tenantStorage = await getTenantStorageWithSchema(user); // ✅ Usar la función corregida
    const products = await tenantStorage.getAllProducts(); // ✅ Asignar resultado

    console.log(`✅ Retrieved ${products.length} products from tenant schema`);
    res.json(products);

  } catch (error) {
    console.error('❌ Error fetching products:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      user: user?.storeId
    });
    res.status(500).json({
      error: "Error al obtener productos",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

const getProductByIdHandler = async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const productId = parseInt(req.params.id);

    // ✅ Super admin puede especificar storeId vía query parameter
    const storeId = req.query.storeId
      ? parseInt(req.query.storeId as string)
      : user.storeId;

    if (!storeId) {
      return res.status(400).json({
        error: "Store ID is required. Super admins must provide storeId query parameter."
      });
    }

    console.log('🔍 Getting product', productId, 'for store:', storeId);

    // ✅ Obtener storage para la tienda específica
    const tenantStorage = user.role === 'super_admin'
      ? await storageFactory.getTenantStorage(storeId)
      : await getTenantStorageWithSchema(user);

    const product = await tenantStorage.getProductById(productId);

    if (!product) {
      console.log('❌ Product not found in store:', storeId);
      return res.status(404).json({ error: "Product not found" });
    }

    console.log('✅ Product found in tenant schema');
    res.json(product);
  } catch (error) {
    console.error('❌ Error fetching product:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      productId: req.params.id,
      storeId: req.query.storeId || req.user?.storeId
    });
    res.status(500).json({
      error: "Error al obtener producto",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

const createProductHandler = async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    
    if (!user.storeId) {
      return res.status(403).json({
        error: "Store ID es requerido"
      });
    }

    console.log('➕ Creating product for store:', user.storeId);
    console.log('📋 Request body received:', JSON.stringify(req.body, null, 2));

    // ✅ VALIDACIÓN EXPLÍCITA DEL NOMBRE
    if (!req.body || !req.body.name || req.body.name.trim() === '') {
      return res.status(400).json({
        error: "El nombre del producto es requerido"
      });
    }

    // ✅ NUEVA VALIDACIÓN DE MONEDA
    const supportedCurrencies = ['USD', 'DOP'];
    const requestedCurrency = req.body.baseCurrency || req.body.currency || 'DOP';
    
    if (!supportedCurrencies.includes(requestedCurrency.toUpperCase())) {
      return res.status(400).json({
        error: `Moneda no soportada: ${requestedCurrency}. Monedas soportadas: ${supportedCurrencies.join(', ')}`
      });
    }

    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // ✅ FUNCIÓN PARA NORMALIZAR ARRAYS (MISMA QUE EN UPDATE)
    const normalizeArrayField = (value: any): string[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value.filter(item => item && typeof item === 'string' && item.trim());
      if (typeof value === 'string') {
        if (value.trim() === '') return [];
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'string' && item.trim()) : [value.trim()];
        } catch {
          return value.trim() ? [value.trim()] : [];
        }
      }
      return [];
    };

    // ✅ CONSTRUCCIÓN EXPLÍCITA DE PRODUCTDATA CON ARRAYS NORMALIZADOS
    const productData = {
      name: req.body.name.trim(),
      description: req.body.description || '',
      price: req.body.price || '0.00',
      baseCurrency: requestedCurrency.toUpperCase(), // ✅ AGREGADO: Campo de moneda
      category: req.body.category || 'general',
      status: req.body.status || 'active',
      imageUrl: req.body.imageUrl || null,
      images: normalizeArrayField(req.body.images),    // ✅ NORMALIZADO
      sku: req.body.sku || null,
      barcode: req.body.barcode || null, // ✅ Código de barras
      brand: req.body.brand || null,
      model: req.body.model || null,
      specifications: req.body.specifications || null,
      features: normalizeArrayField(req.body.features), // ✅ NORMALIZADO - CRÍTICO
      warranty: req.body.warranty || null,
      availability: req.body.availability || 'in_stock',
      stockQuantity: parseInt(req.body.stockQuantity) || 0,
      minQuantity: parseInt(req.body.minQuantity) || 1,
      maxQuantity: req.body.maxQuantity ? parseInt(req.body.maxQuantity) : null,
      lotNumber: req.body.lotNumber || null, // ✅ Número de lote
      expirationDate: req.body.expirationDate || null, // ✅ Fecha de vencimiento
      weight: req.body.weight || null,
      dimensions: req.body.dimensions || null,
      tags: normalizeArrayField(req.body.tags),        // ✅ NORMALIZADO - CRÍTICO
      salePrice: req.body.salePrice || null,
      isPromoted: Boolean(req.body.isPromoted),
      promotionText: req.body.promotionText || null,
      // 🎁 FIDELIZACIÓN - Campos opcionales para plan de puntos
      loyaltyPointsPropertyName: req.body.loyaltyPointsPropertyName || null, // 'LP', 'PUNTOS', 'REWARDS', etc.
      loyaltyPointsValue: req.body.loyaltyPointsValue ? parseFloat(req.body.loyaltyPointsValue) : null, // Valor numérico de puntos
      isActive: req.body.isActive !== undefined ? req.body.isActive : true
    };

    console.log('📋 Final productData with normalized arrays:', {
      features: { original: req.body.features, normalized: productData.features },
      tags: { original: req.body.tags, normalized: productData.tags },
      images: { original: req.body.images, normalized: productData.images }
    });

    // Si hay archivos subidos, procesarlos
    if (req.files && req.files.length > 0) {
      const processedImages = await processProductImages(
        req.files,
        req.body.imageUrls || [],
        user.storeId,
        undefined
      );
      productData.images = processedImages;
    }

    const product = await tenantStorage.createProduct(productData);
    
    console.log('✅ Product created in tenant schema with currency:', product.baseCurrency);
    res.status(201).json(product);
    
  } catch (error) {
    console.error('Error creating product:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        return res.status(400).json({
          error: "Ya existe un producto con este SKU"
        });
      }
      
      if (error.message.includes('validation') || error.message.includes('required')) {
        return res.status(400).json({
          error: error.message
        });
      }
    }

    res.status(500).json({
      error: "Error interno del servidor",
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

const updateProductHandler = async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const productId = parseInt(req.params.id);

    if (!user.storeId) {
      return res.status(403).json({
        error: "Store ID es requerido"
      });
    }

    console.log('✏️ Updating product', productId, 'for store:', user.storeId);
    console.log('📋 Update request body:', JSON.stringify(req.body, null, 2));

    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Verificar que el producto existe
    const existingProduct = await tenantStorage.getProductById(productId);
    if (!existingProduct) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    // ✅ NUEVA VALIDACIÓN DE MONEDA SI SE ESTÁ ACTUALIZANDO
    const supportedCurrencies = ['USD', 'DOP'];
    let updateData = { ...req.body, updatedAt: new Date() };

    // Si se está actualizando la moneda, validarla
    if (req.body.baseCurrency || req.body.currency) {
      const requestedCurrency = req.body.baseCurrency || req.body.currency;
      
      if (!supportedCurrencies.includes(requestedCurrency.toUpperCase())) {
        console.log('❌ Currency validation failed in update:', {
          requested: requestedCurrency,
          supported: supportedCurrencies
        });
        return res.status(400).json({
          error: `Moneda no soportada: ${requestedCurrency}. Monedas soportadas: ${supportedCurrencies.join(', ')}`
        });
      }

      // Actualizar el campo baseCurrency
      updateData.baseCurrency = requestedCurrency.toUpperCase();
      console.log('💱 Updating product currency to:', updateData.baseCurrency);
    }

    // ✅ FUNCIÓN PARA NORMALIZAR ARRAYS
    const normalizeArrayField = (value: any): string[] => {
      if (!value) return [];
      if (Array.isArray(value)) return value.filter(item => item && typeof item === 'string' && item.trim());
      if (typeof value === 'string') {
        if (value.trim() === '') return [];
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'string' && item.trim()) : [value.trim()];
        } catch {
          // Si es un string simple, convertir a array de un elemento
          return value.trim() ? [value.trim()] : [];
        }
      }
      return [];
    };

    // ✅ NORMALIZAR TODOS LOS CAMPOS DE ARRAY PROBLEMÁTICOS
    const normalizedArrayFields = {
      images: normalizeArrayField(updateData.images),
      features: normalizeArrayField(updateData.features), // ← CRÍTICO
      tags: normalizeArrayField(updateData.tags),         // ← CRÍTICO
    };

    // Aplicar las normalizaciones
    updateData.images = normalizedArrayFields.images;
    updateData.features = normalizedArrayFields.features;
    updateData.tags = normalizedArrayFields.tags;

    // 🎁 FIDELIZACIÓN - Procesar campos opcionales de puntos de lealtad
    if (updateData.loyaltyPointsValue !== undefined && updateData.loyaltyPointsValue !== null) {
      updateData.loyaltyPointsValue = parseFloat(updateData.loyaltyPointsValue);
    } else if (updateData.loyaltyPointsValue === undefined) {
      // Si no se proporciona, no actualizar este campo
      delete updateData.loyaltyPointsValue;
    }

    console.log('📋 Normalized array fields:', {
      images: { original: req.body.images, normalized: normalizedArrayFields.images },
      features: { original: req.body.features, normalized: normalizedArrayFields.features },
      tags: { original: req.body.tags, normalized: normalizedArrayFields.tags }
    });

    // Si hay archivos nuevos, procesarlos
    if (req.files && req.files.length > 0) {
      const processedImages = await processProductImages(
        req.files,
        req.body.imageUrls || [],
        user.storeId,
        productId
      );
      updateData.images = processedImages;
    }

    const product = await tenantStorage.updateProduct(productId, updateData);
    
    console.log('✅ Product updated in tenant schema:', {
      id: product.id,
      baseCurrency: product.baseCurrency
    });
    res.json(product);
    
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      error: "Error interno del servidor"
    });
  }
};

const deleteProductHandler = async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const productId = parseInt(req.params.id);

    console.log('🗑️ Deleting product', productId, 'from store:', user.storeId);

    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Verificar que el producto existe
    const product = await tenantStorage.getProductById(productId);
    if (!product) {
      console.log('❌ Product not found in store:', user.storeId);
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    await tenantStorage.deleteProduct(productId);

    console.log('✅ Product deleted from tenant schema');
    res.json({ success: true });

  } catch (error) {
    console.error('Error deleting product:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('constraint') || error.message.includes('foreign key')) {
        return res.status(400).json({ 
          error: "No se puede eliminar: el producto está siendo usado en órdenes existentes" 
        });
      }
    }
    
    res.status(500).json({
      error: "Error interno del servidor"
    });
  }
};

// ================================
// CATEGORY HANDLERS
// ================================

const getCategoriesHandler = async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    
    if (!user.storeId) {
      return res.status(403).json({
        error: "Store ID es requerido"
      });
    }
    
    console.log('📂 Getting categories for store:', user.storeId);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    const categories = await tenantStorage.getAllCategories();
    
    console.log(`✅ Retrieved ${categories.length} categories from tenant schema`);
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      error: "Error interno del servidor"
    });
  }
};

const createCategoryHandler = async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    
    if (!user.storeId) {
      return res.status(403).json({
        error: "Store ID es requerido"
      });
    }
    
    console.log('📁 Creating category for store:', user.storeId);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    const categoryData = { 
      ...req.body,
      isActive: req.body.isActive !== undefined ? req.body.isActive : true,
      sortOrder: req.body.sortOrder || 0
    };
    
    const category = await tenantStorage.createCategory(categoryData);

    console.log('✅ Category created in tenant schema:', category.name);
    res.status(201).json(category);
  } catch (error) {
    console.error('Error creating category:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        return res.status(400).json({
          error: "Ya existe una categoría con este nombre"
        });
      }
    }
    
    res.status(500).json({
      error: "Error interno del servidor"
    });
  }
};

const updateCategoryHandler = async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const categoryId = parseInt(req.params.id);
    
    if (!user.storeId) {
      return res.status(403).json({
        error: "Store ID es requerido"
      });
    }
    
    console.log('✏️ Updating category', categoryId, 'for store:', user.storeId);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Verificar que la categoría existe
    const existingCategory = await tenantStorage.getCategoryById(categoryId);
    if (!existingCategory) {
      return res.status(404).json({ error: "Categoría no encontrada" });
    }
    
    const updateData = {
      ...req.body,
      updatedAt: new Date()
    };
    
    const category = await tenantStorage.updateCategory(categoryId, updateData);
    
    console.log('✅ Category updated in tenant schema');
    res.json(category);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({
      error: "Error interno del servidor"
    });
  }
};

const deleteCategoryHandler = async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const categoryId = parseInt(req.params.id);
    
    if (!user.storeId) {
      return res.status(403).json({
        error: "Store ID es requerido"
      });
    }
    
    console.log('🗑️ Deleting category', categoryId, 'from store:', user.storeId);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Verificar que la categoría existe
    const category = await tenantStorage.getCategoryById(categoryId);
    if (!category) {
      return res.status(404).json({ error: "Categoría no encontrada" });
    }
    
    await tenantStorage.deleteCategory(categoryId);
    
    console.log('✅ Category deleted from tenant schema');
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting category:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('constraint') || error.message.includes('foreign key')) {
        return res.status(400).json({ 
          error: "No se puede eliminar: la categoría está siendo usada por productos" 
        });
      }
    }
    
    res.status(500).json({
      error: "Error interno del servidor"
    });
  }
};




// BRAND HANDLERS - Agregar a server/routes.ts
// ================================

const getBrandsHandler = async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    
    if (!user.storeId) {
      return res.status(403).json({
        error: "Store ID es requerido"
      });
    }
    
    console.log('🏷️ Getting brands for store:', user.storeId);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    const brands = await tenantStorage.getAllBrands();
    
    console.log(`✅ Retrieved ${brands.length} brands from tenant schema`);
    res.json(brands);
  } catch (error) {
    console.error('Error fetching brands:', error);
    res.status(500).json({
      error: "Error interno del servidor"
    });
  }
};

const createBrandHandler = async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    
    if (!user.storeId) {
      return res.status(403).json({
        error: "Store ID es requerido"
      });
    }
    
    console.log('🏷️ Creating brand for store:', user.storeId);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    const brandData = { 
      ...req.body,
      storeId: user.storeId,
      isActive: req.body.isActive !== undefined ? req.body.isActive : true,
      sortOrder: req.body.sortOrder || 0
    };
    
    const brand = await tenantStorage.createBrand(brandData);

    console.log('✅ Brand created in tenant schema:', brand.name);
    res.status(201).json(brand);
  } catch (error) {
    console.error('Error creating brand:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        return res.status(400).json({
          error: "Ya existe una marca con este nombre"
        });
      }
    }
    
    res.status(500).json({
      error: "Error interno del servidor"
    });
  }
};

const updateBrandHandler = async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const brandId = parseInt(req.params.id);
    
    if (!user.storeId) {
      return res.status(403).json({
        error: "Store ID es requerido"
      });
    }
    
    console.log('✏️ Updating brand', brandId, 'for store:', user.storeId);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Verificar que la marca existe
    const existingBrand = await tenantStorage.getBrandById(brandId);
    if (!existingBrand) {
      return res.status(404).json({ error: "Marca no encontrada" });
    }
    
    const updateData = {
      ...req.body,
      updatedAt: new Date()
    };
    
    const brand = await tenantStorage.updateBrand(brandId, updateData);
    
    console.log('✅ Brand updated in tenant schema:', brand.name);
    res.json(brand);
  } catch (error) {
    console.error('Error updating brand:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        return res.status(400).json({
          error: "Ya existe una marca con este nombre"
        });
      }
    }
    
    res.status(500).json({
      error: "Error interno del servidor"
    });
  }
};

const deleteBrandHandler = async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const brandId = parseInt(req.params.id);
    
    if (!user.storeId) {
      return res.status(403).json({
        error: "Store ID es requerido"
      });
    }
    
    console.log('🗑️ Deleting brand', brandId, 'for store:', user.storeId);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Verificar que la marca existe
    const existingBrand = await tenantStorage.getBrandById(brandId);
    if (!existingBrand) {
      return res.status(404).json({ error: "Marca no encontrada" });
    }
    
    // Verificar si la marca tiene productos asociados
    const productsWithBrand = await tenantStorage.getProductsByBrand(brandId);
    if (productsWithBrand && productsWithBrand.length > 0) {
      return res.status(400).json({
        error: `No se puede eliminar la marca porque tiene ${productsWithBrand.length} productos asociados`
      });
    }
    
    await tenantStorage.deleteBrand(brandId);
    
    console.log('✅ Brand deleted from tenant schema');
    res.json({ success: true, message: "Marca eliminada exitosamente" });
  } catch (error) {
    console.error('Error deleting brand:', error);
    res.status(500).json({
      error: "Error interno del servidor"
    });
  }
};

const getBrandByIdHandler = async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const brandId = parseInt(req.params.id);
    
    if (!user.storeId) {
      return res.status(403).json({
        error: "Store ID es requerido"
      });
    }
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    const brand = await tenantStorage.getBrandById(brandId);
    
    if (!brand) {
      return res.status(404).json({ error: "Marca no encontrada" });
    }
    
    res.json(brand);
  } catch (error) {
    console.error('Error fetching brand:', error);
    res.status(500).json({
      error: "Error interno del servidor"
    });
  }
};

// ================================
// IMAGE HANDLERS
// ================================

const validateImageUrlHandler = async (req: any, res: any) => {
  try {
    const { imageUrl } = req.body;
    
    if (!imageUrl || typeof imageUrl !== 'string') {
      return res.status(400).json({ error: 'URL de imagen requerida' });
    }

    try {
      new URL(imageUrl);
    } catch {
      return res.status(400).json({ error: 'Formato de URL inválido' });
    }

    res.json({ 
      success: true, 
      imageUrl,
      message: 'URL válida' 
    });

  } catch (error) {
    console.error('Error validating image URL:', error);
    res.status(500).json({ 
      error: 'Error validando URL',
      message: (error as Error).message 
    });
  }
};

// Reemplaza el uploadImageHandler en routes.ts con esto:

const uploadImageHandler = async (req: any, res: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const user = req.user as AuthUser;
    console.log('📁 Processing uploaded file:', req.file.originalname);
    
    // ✅ USAR SUPABASE en lugar de local storage
    const { SupabaseStorageManager } = await import('./supabase-storage');
    const storageManager = new SupabaseStorageManager(user.storeId);
    
    // Upload usando el buffer del archivo
    const imageUrl = await storageManager.uploadFromBuffer(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );
    
    console.log('✅ Image uploaded to Supabase:', imageUrl);
    
    res.json({ 
      success: true, 
      imageUrl,
      originalName: req.file.originalname,
      message: 'Imagen subida a Supabase exitosamente'
    });

  } catch (error) {
    console.error('❌ Error uploading to Supabase:', error);
    res.status(500).json({ 
      error: 'Failed to upload image',
      message: (error as Error).message 
    });
  }
};
//carga a folder public
/* const uploadImageHandler = async (req: any, res: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const user = req.user as AuthUser;
    console.log('📁 Processing uploaded file:', req.file.originalname);
    
    const imageUrl = `/uploads/${req.file.filename}`;
    
    res.json({ 
      success: true, 
      imageUrl,
      originalName: req.file.originalname,
      message: 'Archivo subido exitosamente'
    });

  } catch (error) {
    console.error('❌ Error uploading image:', error);
    res.status(500).json({ 
      error: 'Failed to upload image',
      message: (error as Error).message 
    });
  }
}; */

// ================================
// USER MANAGEMENT FUNCTIONS
// ================================

export function setupUserManagementRoutes(app: any) {
  // Crear usuario global (super_admin, system_admin)
  app.post('/api/super-admin/global-users', authenticateToken, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const { name, username, email, password, role } = req.body;

      if (!['super_admin', 'system_admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role for global user' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = await masterStorage.createGlobalUser({
        name,
        username,
        email,
        password: hashedPassword,
        role,
        status: 'active',
      });

      res.status(201).json({
        id: newUser.id,
        username: newUser.username,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        message: 'Global user created successfully'
      });

    } catch (error) {
      console.error('Error creating global user:', error);
      if (error instanceof Error && error.message.includes('already exists')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to create global user' });
    }
  });

  // Listar usuarios globales
  app.get('/api/super-admin/global-users', authenticateToken, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const users = await masterStorage.listGlobalUsers();
      res.json(users);
    } catch (error) {
      console.error('Error fetching global users:', error);
      res.status(500).json({ error: 'Failed to fetch global users' });
    }
  });

  // Crear usuario de tienda
  app.post('/api/super-admin/users', authenticateToken, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const { name, email, role, storeId, username, password } = req.body;

      // Validar que la tienda existe
      const store = await masterStorage.getVirtualStore(storeId);
      if (!store) {
        return res.status(400).json({ error: 'Store not found' });
      }

      const finalUsername = username || `${name.toLowerCase().replace(/\s+/g, '')}_${Date.now()}`;
      const tempPassword = password || Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase();
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      const newUser = await masterStorage.createStoreUser({
        name,
        username: finalUsername,
        email,
        password: hashedPassword,
        role,
        storeId,
        isActive: true
      });

      res.status(201).json({
        id: newUser.id,
        username: newUser.username,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        storeId: newUser.storeId,
        isActive: newUser.isActive,
        tempPassword: tempPassword,
        storeName: store.name
      });

    } catch (error) {
      console.error('Error creating store user:', error);
      if (error instanceof Error && error.message.includes('already exists')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to create store user' });
    }
  });

  // Estadísticas de usuarios
/*   app.get('/api/super-admin/user-metrics', authenticateToken, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const stats = await masterStorage.getUserStats();
      
      res.json({
        totalUsers: stats.globalUsers + stats.storeUsers,
        activeUsers: stats.activeStoreUsers,
        storeOwners: stats.usersByRole.store_owner || 0,
        superAdmins: stats.globalUsers,
        suspendedUsers: stats.storeUsers - stats.activeStoreUsers,
        newUsersThisMonth: 0,
        globalUsers: stats.globalUsers,
        storeUsers: stats.storeUsers,
        usersByRole: stats.usersByRole
      });
    } catch (error) {
      console.error('Error fetching user metrics:', error);
      res.status(500).json({ error: 'Failed to fetch user metrics' });
    }
  }); */

  
}



// ================================
// WEBHOOK PROCESSORS
// ================================

async function processWhatsAppMessage(value: any) {
  console.log('🎯 PROCESSWHATSAPPMESSAGE - Iniciando procesamiento');
  console.log('🚀 WEBHOOK RECEIVED - Function called successfully');
  
  try {
    // ✅ USAR EL NOMBRE CORRECTO DE LA FUNCIÓN
    const { processWhatsAppMessageSafe } = await import('./whatsapp-simple.js');
    
    // ✅ LLAMAR A LA FUNCIÓN QUE REALMENTE EXISTE
    await processWhatsAppMessageSafe(value);
    
    console.log('✅ WhatsApp message processed successfully');
    
  } catch (error) {
    console.error('❌ Error processing WhatsApp message:', error);
    throw error;
  }
}

// ================================
// MAIN ROUTES REGISTRATION
// ================================

export async function registerRoutes(app: express.Application) {
  const router = express.Router();
app.use('/api', employeeRouter);
  // ================================
  // AUTHENTICATION ENDPOINTS
  // ================================

  router.post("/login", async (req: any, res: any) => {
    try {
      const { username, password, storeId } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }

      // Usar master storage para autenticación
      const user = await masterStorage.authenticateUser(username, password, storeId);

      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = jwt.sign(
        { userId: user.id, username: user.username, role: user.role, storeId: user.storeId },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Guardar token en cookie httpOnly
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24 horas
      });

      res.json({ token, user });
    } catch (error) {
      console.error("Error during login:", error);
      res.status(500).json({ error: "Failed to authenticate" });
    }
  });

  // Agregar este endpoint en server/routes.ts (sección de AUTH)

router.get('/auth/me', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    
    console.log('👤 [GET /auth/me] Getting user info for:', user.id);
    
    // Si es super admin, obtener de master storage
    if (user.role === 'super_admin') {
      const masterStorage = storageFactory.getMasterStorage();
      const globalUser = await masterStorage.getGlobalUserById(user.id);
      
      if (globalUser) {
        const { password, ...safeUser } = globalUser;
        return res.json(safeUser);
      }
    }
    
    // Para usuarios de tienda, obtener de tenant storage
    if (user.storeId) {
      const tenantStorage = await getTenantStorageWithSchema(user);
      const tenantUser = await tenantStorage.getUserById(user.id);
      
      if (tenantUser) {
        const { password, ...safeUser } = tenantUser;
        return res.json(safeUser);
      }
    }
    
    
  } catch (error) {
    console.error('❌ [GET /auth/me] Error:', error);
    res.status(500).json({ 
      error: "Failed to fetch user information",
      details: error.message 
    });
  }
});
  // ================================
  // WEBHOOK ENDPOINTS
  // ================================

  router.post('/webhook', async (req: Request, res: Response) => {
    try {
      const value = req.body;
      console.log('🎯 WEBHOOK RECEIVED - Processing WhatsApp message');
      
      await processWhatsAppMessage(value);
      
      res.sendStatus(200);
    } catch (error) {
      console.error('Error in webhook processing:', error);
      res.sendStatus(500);
    }
  });

  router.get('/webhook', (req: Request, res: Response) => {
    // Support both VERIFY_TOKEN and WEBHOOK_VERIFY_TOKEN for backwards compatibility
    const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || process.env.VERIFY_TOKEN || 'verifytoken12345';
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('🔍 Webhook verification request:', {
      mode,
      token: token ? '***' + String(token).slice(-4) : 'missing',
      expectedToken: VERIFY_TOKEN ? '***' + VERIFY_TOKEN.slice(-4) : 'missing',
      challenge: challenge ? 'present' : 'missing'
    });

    if (mode && token) {
      if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ WEBHOOK_VERIFIED - Sending challenge');
        res.status(200).send(challenge);
      } else {
        console.log('❌ WEBHOOK_VERIFICATION_FAILED - Invalid token');
        res.sendStatus(403);
      }
    } else {
      console.log('❌ WEBHOOK_VERIFICATION_FAILED - Missing parameters');
      res.sendStatus(400);
    }
  });


  // Agregar temporalmente en routes.ts para debuggear
router.post('/debug/clear-cache', authenticateToken, (req, res) => {
  storageFactory.clearAllCaches();
  res.json({ message: 'Cache cleared successfully' });
});

  // ================================
  // PRODUCT ROUTES
  // ================================

  router.get('/api/products', authenticateToken, productCurrencyMiddleware, getProductsHandler);
  router.get('/api/products/:id', authenticateToken, productCurrencyMiddleware, getProductByIdHandler);
router.post('/products', authenticateToken, createProductHandler);
      
    

  router.put('/products/:id', authenticateToken, updateProductHandler);
  router.delete('/products/:id', authenticateToken, deleteProductHandler);

  // Inventory movements
  router.get('/api/products/:id/inventory-movements', authenticateToken, async (req: any, res: any) => {
    try {
      const productId = parseInt(req.params.id);
      const user = req.user as AuthUser;
      const tenantStorage = await getTenantStorageWithSchema(user);
      const movements = await tenantStorage.getInventoryMovementsByProduct(productId);
      res.json(movements);
    } catch (error) {
      console.error('Error fetching inventory movements:', error);
      res.status(500).json({ error: 'No se pudieron obtener los movimientos de inventario' });
    }
  });

  router.post('/api/inventory-movements', authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      const tenantStorage = await getTenantStorageWithSchema(user);
      const movement = await tenantStorage.createInventoryMovement({
        productId: req.body.productId,
        type: req.body.type,
        quantity: Number(req.body.quantity || 0),
        unitId: req.body.unitId,
        notes: req.body.notes,
        referenceType: req.body.referenceType,
        referenceId: req.body.referenceId,
        lotNumber: req.body.lotNumber,
        expirationDate: req.body.expirationDate ? new Date(req.body.expirationDate) : undefined,
      });
      res.status(201).json(movement);
    } catch (error: any) {
      console.error('Error creating inventory movement:', error);
      res.status(400).json({ error: error.message || 'No se pudo registrar el movimiento' });
    }
  });

  // ================================
  // CATEGORY ROUTES
  // ================================

  router.get('/categories', authenticateToken, getCategoriesHandler);
  router.post('/categories', authenticateToken, createCategoryHandler);
  router.put('/categories/:id', authenticateToken, updateCategoryHandler);
  router.delete('/categories/:id', authenticateToken, deleteCategoryHandler);

  // ================================
// BRAND ROUTES - AGREGAR DESPUÉS DE CATEGORY ROUTES
// ================================

// Agregar después de las rutas de categorías:
router.get('/brands', authenticateToken, getBrandsHandler);
router.post('/brands', authenticateToken, createBrandHandler);
router.put('/brands/:id', authenticateToken, updateBrandHandler);
router.delete('/brands/:id', authenticateToken, deleteBrandHandler);

//===================================
// SUPER ADMIN 
//==================================

// Agregar a routes.ts en la sección SUPER ADMIN ROUTES

// GET - Usuarios por contexto (sin requerir storeId del usuario)
router.get('/super-admin/users', authenticateToken, requireSuperAdmin, async (req: any, res: any) => {
  try {
    const { level = 'global', storeId, search, page = 1, limit = 50 } = req.query;
    
    let users = [];
    let totalCount = 0;
    let source = '';

    if (storeId) {
      // Usuarios de tienda específica
      const storeIdInt = parseInt(storeId as string);
      const store = await masterStorage.getVirtualStore(storeIdInt);
      if (!store) {
        return res.status(404).json({ error: 'Store not found' });
      }

      if (level === 'tenant') {
        // Usuarios del schema de la tienda
        try {
          const tenantStorage = await storageFactory.getTenantStorage(storeIdInt);
          const tenantUsers = await tenantStorage.getAllUsers();
          users = tenantUsers.map(u => ({
            ...u,
            level: 'tenant',
            storeId: storeIdInt,
            storeName: store.name,
            source: 'tenant_schema'
          }));
          source = `tenant_schema_${store.name}`;
        } catch (error) {
          console.error(`Error fetching tenant users for store ${storeIdInt}:`, error);
          users = [];
        }
      } else {
         const tenantStorage = await storageFactory.getTenantStorage(storeIdInt);
    const storeUsers = await tenantStorage.getAllUsers();
    users = storeUsers.map(u => ({
      ...u,
      level: 'store',
      storeId: storeIdInt,
      storeName: store.name,
      source: 'tenant_schema'
    }));
    source = `tenant_schema_${store.name}`;
  }
    } else {
      // Sin storeId específico
      if (level === 'global') {
        const globalUsers = await masterStorage.listGlobalUsers();
        users = globalUsers.map(u => ({
          ...u,
          level: 'global',
          source: 'global_schema'
        }));
        source = 'global_schema';
      } else if (level === 'store') {
        const storeUsers = await masterStorage.listStoreUsers();
        users = storeUsers.map(u => ({
          ...u,
          level: 'store',
          source: 'system_users'
        }));
        source = 'system_users';
      } else {
        return res.status(400).json({ error: 'storeId required for tenant level' });
      }
    }

    // Filtro de búsqueda
    if (search) {
      const searchTerm = (search as string).toLowerCase();
      users = users.filter(u => 
        u.username?.toLowerCase().includes(searchTerm) ||
        u.email?.toLowerCase().includes(searchTerm) ||
        u.name?.toLowerCase().includes(searchTerm)
      );
    }

    totalCount = users.length;

    // Paginación
    const pageInt = parseInt(page as string);
    const limitInt = parseInt(limit as string);
    const offset = (pageInt - 1) * limitInt;
    const paginatedUsers = users.slice(offset, offset + limitInt);

    // Remover passwords
    const safeUsers = paginatedUsers.map(user => {
      const { password, ...safeUser } = user;
      return safeUser;
    });

    res.json({
      users: safeUsers,
      pagination: {
        page: pageInt,
        limit: limitInt,
        total: totalCount,
        pages: Math.ceil(totalCount / limitInt)
      },
      metadata: {
        source,
        storeId: storeId ? parseInt(storeId as string) : null,
        level: level || 'global'
      }
    });

  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// POST - Crear usuario (contexto específico)
router.post('/super-admin/users', authenticateToken, requireSuperAdmin, async (req: any, res: any) => {
  try {
    const { level = 'global', storeId, ...userData } = req.body;

    if (!userData.username || !userData.email || !userData.role) {
      return res.status(400).json({ 
        error: 'Missing required fields: username, email, role' 
      });
    }

    // Hash password
    const password = userData.password || Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(password, 10);
    const userDataWithPassword = {
      ...userData,
      password: hashedPassword
    };

    let newUser;

    if (level === 'global') {
      newUser = await masterStorage.createGlobalUser(userDataWithPassword);
      newUser.level = 'global';
      newUser.source = 'global_schema';
    } 
    else if (level === 'store') {
      if (!storeId) {
        return res.status(400).json({ error: 'storeId required for store level' });
      }
      newUser = await masterStorage.createStoreUser({
        ...userDataWithPassword,
        storeId: parseInt(storeId)
      });
      newUser.level = 'store';
      newUser.source = 'system_users';
    } 
    else if (level === 'tenant') {
      if (!storeId) {
        return res.status(400).json({ error: 'storeId required for tenant level' });
      }
      const tenantStorage = await storageFactory.getTenantStorage(parseInt(storeId));
      newUser = await tenantStorage.createUser(userDataWithPassword);
      newUser.level = 'tenant';
      newUser.source = 'tenant_schema';
      newUser.storeId = parseInt(storeId);
    }

    const { password: _, ...safeUser } = newUser;
    
    res.status(201).json({
      user: safeUser,
      tempPassword: password,
      message: `User created successfully in ${newUser.source}`
    });

  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// PUT - Actualizar usuario
router.put('/super-admin/users/:id', authenticateToken, requireSuperAdmin, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    const { level, storeId, ...updates } = req.body;

    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }

    let updatedUser;

    if (level === 'global') {
      updatedUser = await masterStorage.updateGlobalUser(id, updates);
    } 
    else if (level === 'store') {
      updatedUser = await masterStorage.updateStoreUser(id, updates);
    } 
    else if (level === 'tenant' && storeId) {
      const tenantStorage = await storageFactory.getTenantStorage(parseInt(storeId));
      updatedUser = await tenantStorage.updateUser(id, updates);
    } 
    else {
      return res.status(400).json({ error: "Missing level or storeId" });
    }

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const { password, ...safeUser } = updatedUser;
    res.json({ user: safeUser });

  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});


// Endpoint para limpieza manual (solo super admin)
router.post('/cleanup/conversations', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    
    if (user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    
    const { daysOld = 7 } = req.body;
    
    const { runManualCleanup } = await import('./scheduled-tasks.js');
    const result = await runManualCleanup(parseInt(daysOld));
    
    res.json({
      success: true,
      message: 'Cleanup completed successfully',
      result
    });
  } catch (error) {
    console.error('Error in manual cleanup:', error);
    res.status(500).json({ error: 'Failed to run cleanup' });
  }
});
// POST - Reset password
// POST - Reset password
router.post('/super-admin/users/:id/reset-password', authenticateToken, requireSuperAdmin, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    const { level, storeId } = req.body;
    
    const newPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    let result;

    if (level === 'global') {
      result = await masterStorage.updateGlobalUser(id, { password: hashedPassword });
    } 
    else if (level === 'store') {
      // ❌ PROBLEMA: busca en system_users en lugar del schema de la tienda
      if (!storeId) {
        result = await masterStorage.updateStoreUser(id, { password: hashedPassword });
      } else {
        // ✅ SOLUCIÓN: buscar en schema de la tienda
        const tenantStorage = await storageFactory.getTenantStorage(parseInt(storeId));
        result = await tenantStorage.updateUser(id, { password: hashedPassword });
      }
    } 
    else if (level === 'tenant' && storeId) {
      const tenantStorage = await storageFactory.getTenantStorage(parseInt(storeId));
      result = await tenantStorage.updateUser(id, { password: hashedPassword });
    }

    if (!result) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ 
      success: true, 
      newPassword,
      message: `Password reset for ${level} user`
    });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// DELETE - Eliminar usuario
router.delete('/super-admin/users/:id', authenticateToken, requireSuperAdmin, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    const { level, storeId } = req.query;

    let success = false;

    if (level === 'global') {
      success = await masterStorage.deleteGlobalUser(id);
    } 
    else if (level === 'store') {
      success = await masterStorage.deleteStoreUser(id);
    } 
    else if (level === 'tenant' && storeId) {
      const tenantStorage = await storageFactory.getTenantStorage(parseInt(storeId as string));
      await tenantStorage.deleteUser(id);
      success = true;
    }

    if (!success) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ success: true });

  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// GET - Métricas de usuarios
router.get('/super-admin/user-metrics', authenticateToken, requireSuperAdmin, async (req: any, res: any) => {
  try {
    const stats = await masterStorage.getUserStats();
    res.json(stats);
  } catch (error) {
    console.error("Error fetching user metrics:", error);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});



  // ================================
    // ================================
  // CONVERSATION ROUTES - CORREGIDOS ✅
  // ================================

router.get('/conversations', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    console.log('🔍 [GET /conversations] User:', user.id, 'Store:', user.storeId);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // ✅ OBTENER CONVERSACIONES CON DATOS DE CLIENTE INCLUIDOS
    const conversations = await tenantStorage.getAllConversations();
    
    // ✅ ENRIQUECER SOLO CON ÚLTIMO MENSAJE Y MENSAJES NO LEÍDOS
    const enrichedConversations = await Promise.all(
      conversations.map(async (conv: any) => {
        try {
          // Si ya tiene datos del customer del JOIN, usarlos directamente
          if (conv.customer) {
            // Obtener último mensaje
            const messages = await tenantStorage.getMessagesByConversation(conv.id);
            const lastMessage = messages[messages.length - 1];
            
            // Contar mensajes no leídos
            const unreadMessages = messages.filter(
              (msg: any) => msg.senderType === 'customer' && !msg.isRead
            );
            
            return {
              id: conv.id,
              status: conv.status,
              lastMessageAt: conv.lastMessageAt,
              createdAt: conv.createdAt,
              updatedAt: conv.updatedAt,
              unreadCount: unreadMessages.length,
              customer: conv.customer, // Usar datos del JOIN
              lastMessage: lastMessage ? {
                id: lastMessage.id,
                content: lastMessage.content,
                messageType: lastMessage.messageType,
                senderType: lastMessage.senderType,
                createdAt: lastMessage.createdAt,
              } : null,
            };
          } else {
            // Fallback: obtener cliente por separado si no vino del JOIN
            const customer = await tenantStorage.getCustomerById(conv.customerId);
            const messages = await tenantStorage.getMessagesByConversation(conv.id);
            const lastMessage = messages[messages.length - 1];
            const unreadMessages = messages.filter(
              (msg: any) => msg.senderType === 'customer' && !msg.isRead
            );
            
            return {
              id: conv.id,
              status: conv.status,
              lastMessageAt: conv.lastMessageAt,
              createdAt: conv.createdAt,
              updatedAt: conv.updatedAt,
              unreadCount: unreadMessages.length,
              customer: {
                id: customer?.id || conv.customerId,
                name: customer?.name || 'Cliente sin nombre',
                phone: customer?.phone || '',
                email: customer?.email || null,
              },
              lastMessage: lastMessage ? {
                id: lastMessage.id,
                content: lastMessage.content,
                messageType: lastMessage.messageType,
                senderType: lastMessage.senderType,
                createdAt: lastMessage.createdAt,
              } : null,
            };
          }
        } catch (error) {
          console.error('❌ Error enriching conversation:', conv.id, error);
          return {
            id: conv.id,
            status: conv.status,
            lastMessageAt: conv.lastMessageAt,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt,
            unreadCount: 0,
            customer: {
              id: conv.customerId,
              name: 'Cliente sin nombre',
              phone: '',
              email: null,
            },
            lastMessage: null,
          };
        }
      })
    );

    console.log('✅ [GET /conversations] Found conversations:', enrichedConversations.length);
    res.json(enrichedConversations);
  } catch (error) {
    console.error('❌ [GET /conversations] Error:', error);
    res.status(500).json({ 
      error: "Failed to fetch conversations",
      details: error.message 
    });
  }
});




  router.post('/conversations', authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      console.log('📞 [POST /conversations] Creating:', req.body);
      
      const conversationData = { 
        ...req.body, 
        storeId: user.storeId,
        createdAt: new Date(),
        lastMessageAt: new Date()
      };
      
      const tenantStorage = await getTenantStorageWithSchema(user);
      const conversation = await tenantStorage.createConversation(conversationData);
      
      console.log('✅ [POST /conversations] Created:', conversation.id);
      res.status(201).json(conversation);
    } catch (error) {
      console.error('❌ [POST /conversations] Error:', error);
      res.status(500).json({ 
        error: "Failed to create conversation",
        details: error.message 
      });
    }
  });

  router.get('/conversations/technician', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    
    // Verificar que el usuario sea técnico
    if (user.role !== 'technician') {
      return res.status(403).json({ error: 'Access denied. Technician role required.' });
    }
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    console.log('💬 [GET /conversations/technician] Getting conversations for technician:', user.id);
    
    // Obtener conversaciones de órdenes asignadas al técnico
    const conversations = await tenantStorage.getTechnicianConversations(user.id);
    
    console.log('✅ [GET /conversations/technician] Found conversations:', conversations.length);
    res.json(conversations);
  } catch (error) {
    console.error('❌ [GET /conversations/technician] Error:', error);
    res.status(500).json({ 
      error: "Failed to fetch technician conversations",
      details: error.message 
    });
  }
});
router.patch('/conversations/:id/mark-read', authenticateToken, async (req: any, res: any) => {
  try {
    const conversationId = parseInt(req.params.id);
    const user = req.user as AuthUser;
    
    console.log('📖 [PATCH /conversations/:id/mark-read] Marking as read:', conversationId);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Verificar que la conversación existe
    const conversation = await tenantStorage.getConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    // Marcar mensajes como leídos
      await tenantStorage.markConversationMessagesAsRead(conversationId, user.id);
    
    console.log('✅ [PATCH /conversations/:id/mark-read] Marked as read:', conversationId);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ [PATCH /conversations/:id/mark-read] Error:', error);
    res.status(500).json({ 
      error: "Failed to mark messages as read",
      details: error.message 
    });
  }
});
  router.put('/conversations/:id', authenticateToken, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as AuthUser;
      
      console.log('📞 [PUT /conversations/:id] Updating:', id, req.body);
      
      const tenantStorage = await getTenantStorageWithSchema(user);
      const conversation = await tenantStorage.updateConversation(id, {
        ...req.body,
        updatedAt: new Date()
      });
      
      if (!conversation) {
        console.log('⚠️ [PUT /conversations/:id] Not found:', id);
        return res.status(404).json({ error: 'Conversation not found' });
      }
      
      console.log('✅ [PUT /conversations/:id] Updated:', id);
      res.json(conversation);
    } catch (error) {
      console.error('❌ [PUT /conversations/:id] Error:', error);
      res.status(500).json({ 
        error: "Failed to update conversation",
        details: error.message 
      });
    }
  });

// Corregir el endpoint en server/routes.ts para validar el ID antes de procesar
router.get('/conversations/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    const user = req.user as AuthUser;
    
    // Validación para evitar NaN
    if (isNaN(id) || !Number.isInteger(id) || id <= 0) {
      console.log('⚠️ [GET /conversations/:id] Invalid ID provided:', req.params.id);
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }
    
    console.log('📞 [GET /conversations/:id] ID:', id, 'User store:', user.storeId);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    const conversation = await tenantStorage.getConversationById(id);
    
    if (!conversation) {
      console.log('⚠️ [GET /conversations/:id] Not found:', id);
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    console.log('✅ [GET /conversations/:id] Found:', id);
    res.json(conversation);
  } catch (error) {
    console.error('❌ [GET /conversations/:id] Error:', error);
    res.status(500).json({ 
      error: "Failed to fetch conversation",
      details: error.message 
    });
  }
});

// También corregir el endpoint de mensajes
router.get('/conversations/:id/messages', authenticateToken, async (req: any, res: any) => {
  try {
    const conversationId = parseInt(req.params.id);
    const user = req.user as AuthUser;
    
    // Validación para evitar NaN
    if (isNaN(conversationId) || !Number.isInteger(conversationId) || conversationId <= 0) {
      console.log('⚠️ [GET /conversations/:id/messages] Invalid ID provided:', req.params.id);
      return res.status(400).json({ error: 'Invalid conversation ID' });
    }
    
    console.log('📋 [GET /conversations/:id/messages] Getting messages for conversation:', conversationId);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Verificar que la conversación existe
    const conversation = await tenantStorage.getConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    // Obtener mensajes
    const messages = await tenantStorage.getMessagesByConversation(conversationId);
    
    console.log('✅ [GET /conversations/:id/messages] Found messages:', messages.length);
    res.json(messages);
  } catch (error) {
    console.error('❌ [GET /conversations/:id/messages] Error:', error);
    res.status(500).json({ 
      error: "Failed to fetch messages",
      details: error.message 
    });
  }
});

// En routes.ts - ELIMINAR la segunda definición duplicada y mantener solo esta:

// Reemplaza la ruta actual con esta versión que copia el envío automático
// ✅ ENDPOINT CORREGIDO - /conversations/:id/messages
router.post('/conversations/:id/messages', authenticateToken, async (req: any, res: any) => {
  try {
    const conversationId = parseInt(req.params.id);
    const { content, messageType = 'text' } = req.body;
    const user = req.user as AuthUser;
    
    console.log('📤 [POST MESSAGES] Starting send process:', { conversationId, storeId: user.storeId });
    
    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Message content is required' });
    }
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Verificar conversación
    const conversation = await tenantStorage.getConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Obtener cliente
    const customer = await tenantStorage.getCustomerById(conversation.customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    console.log(`📞 Sending to phone: ${customer.phone}`);

    // ✅ OBTENER CONFIGURACIÓN DE WHATSAPP
    const config = await masterStorage.getWhatsAppConfig(user.storeId);
    
    if (!config) {
      return res.status(404).json({ 
        error: 'WhatsApp configuration not found',
        storeId: user.storeId 
      });
    }

    // ✅ VALIDAR CONFIGURACIÓN
    if (!config.accessToken || !config.phoneNumberId || !config.isActive) {
      return res.status(400).json({ 
        error: 'Incomplete or inactive WhatsApp configuration',
        details: {
          hasToken: !!config.accessToken,
          hasPhoneId: !!config.phoneNumberId,
          isActive: config.isActive
        }
      });
    }

    // ✅ USAR v23.0 (LA VERSIÓN QUE TIENES CONFIGURADA)
    const url = `https://graph.facebook.com/v23.0/${config.phoneNumberId}/messages`;
    
    // ✅ LIMPIAR NÚMERO DE TELÉFONO
    const cleanPhone = customer.phone.replace(/[^\d+]/g, '');
    
    // ✅ CONSTRUIR PAYLOAD SEGÚN ESPECIFICACIONES DE META
    const payload = {
      messaging_product: "whatsapp",
      to: cleanPhone,
      type: "text",
      text: { 
        body: content.trim() 
      }
    };

    console.log(`🌐 API Call:`, {
      url,
      phoneId: config.phoneNumberId,
      to: cleanPhone,
      tokenPreview: `${config.accessToken.substring(0, 10)}...`
    });

    // ✅ REALIZAR LLAMADA A LA API
    let whatsappSuccess = false;
    let whatsappMessageId = null;
    let whatsappError = null;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.accessToken.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      console.log(`📊 Response: ${response.status} - ${responseText}`);

      if (response.ok) {
        const result = JSON.parse(responseText);
        whatsappSuccess = true;
        whatsappMessageId = result.messages?.[0]?.id;
        console.log('✅ WhatsApp message sent successfully:', whatsappMessageId);
      } else {
        whatsappError = `API Error ${response.status}: ${responseText}`;
        console.error('❌ WhatsApp API Error:', whatsappError);
      }
    } catch (fetchError: any) {
      whatsappError = `Network Error: ${fetchError.message}`;
      console.error('❌ WhatsApp Network Error:', whatsappError);
    }
    
    // ✅ GUARDAR MENSAJE EN BD (SIEMPRE)
    const messageData = {
      conversationId,
      content: content.trim(),
      messageType,
      senderType: 'staff',
      senderId: user.id,
      isRead: true,
      createdAt: new Date(),
      sentAt: new Date(),
      whatsappMessageId: whatsappMessageId,
      deliveryStatus: whatsappSuccess ? 'sent' : 'failed'
    };
    
    const newMessage = await tenantStorage.createMessage(messageData);
    
    // ✅ ACTUALIZAR CONVERSACIÓN
    await tenantStorage.updateConversation(conversationId, {
      lastMessageAt: new Date(),
    });
    
    // ✅ RESPUESTA COMPLETA
    const response = {
      ...newMessage,
      whatsappDelivered: whatsappSuccess,
      whatsappMessageId: whatsappMessageId,
      whatsappError: whatsappError,
      customerPhone: customer.phone,
      storeId: user.storeId,
      apiVersion: 'v23.0'
    };
    
    console.log(`📋 Final result - Success: ${whatsappSuccess}, MessageID: ${whatsappMessageId}`);
    
    // ✅ RETORNAR CÓDIGO 201 SIEMPRE (SE GUARDÓ EN BD)
    res.status(201).json(response);
    
  } catch (error: any) {
    console.error('💥 [MESSAGES ENDPOINT] Critical Error:', error);
    res.status(500).json({ 
      error: "Failed to send message",
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ✅ RUTA ADICIONAL PARA DEBUG (mantener separada)
router.post('/conversations/:id/test-whatsapp', authenticateToken, async (req: any, res: any) => {
  try {
    const conversationId = parseInt(req.params.id);
    const { testMessage = '🧪 Test message from API' } = req.body;
    const user = req.user as AuthUser;
    
    console.log('🧪 [POST /conversations/:id/test-whatsapp] Testing WhatsApp for conversation:', conversationId);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    const conversation = await tenantStorage.getConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const customer = await tenantStorage.getCustomerById(conversation.customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // ✅ ENVÍO DE PRUEBA DIRECTO
    const config = await masterStorage.getWhatsAppConfig(user.storeId);
    
    if (!config) {
      return res.status(404).json({ 
        error: 'WhatsApp config not found',
        storeId: user.storeId 
      });
    }

    const url = `https://graph.facebook.com/v22.0/${config.phoneNumberId}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to: customer.phone,
      type: "text",
      text: { body: testMessage }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.accessToken.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    res.json({
      success: response.ok,
      status: response.status,
      phoneNumber: customer.phone,
      testMessage,
      result,
      config: {
        storeId: user.storeId,
        phoneNumberId: config.phoneNumberId,
        hasToken: !!config.accessToken
      }
    });
    
  } catch (error) {
    console.error('❌ Test WhatsApp error:', error);
    res.status(500).json({ 
      error: 'Test failed',
      details: error.message 
    });
  }
});



// ✅ TAMBIÉN AGREGAR UNA RUTA DE DEBUG PARA PROBAR ENVÍO DIRECTO
router.post('/conversations/:id/test-whatsapp', authenticateToken, async (req: any, res: any) => {
  try {
    const conversationId = parseInt(req.params.id);
    const { testMessage = '🧪 Test message from conversation' } = req.body;
    const user = req.user as AuthUser;
    
    console.log('🧪 [POST /conversations/:id/test-whatsapp] Testing WhatsApp for conversation:', conversationId);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Obtener conversación y cliente
    const conversation = await tenantStorage.getConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const customer = await tenantStorage.getCustomerById(conversation.customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Probar envío directo
    try {
      const { sendWhatsAppMessageDirect } = await import('./whatsapp-simple.js');
      
      console.log(`🧪 Testing WhatsApp send to ${customer.phone}`);
      await sendWhatsAppMessageDirect(customer.phone, testMessage, user.storeId);
      
      res.json({
        success: true,
        message: 'WhatsApp test message sent successfully',
        customerPhone: customer.phone,
        testMessage: testMessage,
        conversationId: conversationId,
        timestamp: new Date().toISOString()
      });
      
    } catch (whatsappError) {
      res.status(500).json({
        success: false,
        error: 'WhatsApp test failed',
        details: whatsappError.message,
        customerPhone: customer.phone,
        conversationId: conversationId
      });
    }
    
  } catch (error) {
    console.error('❌ [POST /conversations/:id/test-whatsapp] Error:', error);
    res.status(500).json({ 
      error: "Failed to test WhatsApp",
      details: error.message 
    });
  }
});


  router.post('/conversations/:id/mark-read', authenticateToken, async (req: any, res: any) => {
  try {
    const conversationId = parseInt(req.params.id);
    const user = req.user as AuthUser;
    
    console.log('👁️ [POST /conversations/:id/mark-read] Marking conversation as read:', conversationId);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Marcar todos los mensajes de la conversación como leídos
    await tenantStorage.markMessagesAsRead(conversationId);
    
    // También actualizar el contador de mensajes no leídos en la conversación
    await tenantStorage.updateConversation(conversationId, {
      updatedAt: new Date()
    });
    
    console.log('✅ [POST /conversations/:id/mark-read] Conversation marked as read:', conversationId);
    res.json({ success: true, message: 'Conversation marked as read' });
  } catch (error) {
    console.error('❌ [POST /conversations/:id/mark-read] Error:', error);
    res.status(500).json({ 
      error: "Failed to mark conversation as read",
      details: error.message 
    });
  }
});

// ================================
// BILLING ROUTES (BÁSICOS)
// ================================

router.get('/billing', authenticateToken, async (req, res) => {
  try {
    // Por ahora retornar datos básicos hasta que implementes billing completo
    res.json({
      currentPlan: 'basic',
      billingCycle: 'monthly',
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      isActive: true
    });
  } catch (error) {
    console.error('Error fetching billing:', error);
    res.status(500).json({ error: 'Failed to fetch billing info' });
  }
});

router.get('/billing/summary', authenticateToken, async (req, res) => {
  try {
    // Datos básicos de resumen
    res.json({
      totalCharges: 0,
      currentBalance: 0,
      nextPaymentAmount: 29.99,
      nextPaymentDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });
  } catch (error) {
    console.error('Error fetching billing summary:', error);
    res.status(500).json({ error: 'Failed to fetch billing summary' });
  }
});
// ================================
// NOTIFICATIONS ENDPOINTS (TENANT STORAGE)
// ================================

router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantStorage = await getTenantStorageWithSchema(user);
    const notifications = await tenantStorage.getUserNotifications(user.id);
    res.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.get('/notifications/count', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    console.log(`🔢 Getting notification counts for user ${user.id}, store ${user.storeId}`);
    
    const counts = await tenantStorage.getNotificationCounts(user.id);
    
    res.json(counts);
  } catch (error) {
    console.error('Error fetching notification counts:', error);
    res.status(500).json({ 
      error: 'Failed to fetch notification counts',
      total: 0,
      unread: 0 
    });
  }
});



// ================================
// CUSTOMER MANAGEMENT ROUTES ADICIONALES
// ================================

  // ================================
  // CUSTOMER ROUTES
  // ================================


  router.post('/customers', authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      const customerData = { ...req.body, storeId: user.storeId };
      
      const tenantStorage = await getTenantStorageWithSchema(user);
      const customer = await tenantStorage.createCustomer(customerData);
      res.status(201).json(customer);
    } catch (error) {
      console.error('Error creating customer:', error);
      res.status(500).json({ error: "Failed to create customer" });
    }
  });

  router.put('/customers/:id', authenticateToken, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as AuthUser;
      
      const tenantStorage = await getTenantStorageWithSchema(user);
      const customer = await tenantStorage.updateCustomer(id, req.body);
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      
      res.json(customer);
    } catch (error) {
      console.error('Error updating customer:', error);
      res.status(500).json({ error: 'Failed to update customer' });
    }
  });

  router.delete('/customers/:id', authenticateToken, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as AuthUser;
      
      const tenantStorage = await getTenantStorageWithSchema(user);
      await tenantStorage.deleteCustomer(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting customer:', error);
      res.status(500).json({ error: 'Failed to delete customer' });
    }
  });


// ✅ ENDPOINT FALTANTE: Marcar conversación como leída
router.post('/conversations/:id/mark-read', authenticateToken, async (req: any, res: any) => {
  try {
    const conversationId = parseInt(req.params.id);
    const user = req.user as AuthUser;
    
    console.log('👁️ [POST /conversations/:id/mark-read] Marking conversation as read:', conversationId);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Marcar todos los mensajes de la conversación como leídos
    await tenantStorage.markMessagesAsRead(conversationId);
    
    // También actualizar el contador de mensajes no leídos en la conversación
    await tenantStorage.updateConversation(conversationId, {
      updatedAt: new Date()
    });
    
    console.log('✅ [POST /conversations/:id/mark-read] Conversation marked as read:', conversationId);
    res.json({ success: true, message: 'Conversation marked as read' });
  } catch (error) {
    console.error('❌ [POST /conversations/:id/mark-read] Error:', error);
    res.status(500).json({ 
      error: "Failed to mark conversation as read",
      details: error.message 
    });
  }
});


router.get('/customers/:id/details', authenticateToken, async (req: any, res: any) => {
  try {
    const customerId = parseInt(req.params.id);
    const user = req.user as AuthUser;
    
    console.log('👤 [GET /customers/:id/details] Getting customer details:', customerId);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Obtener información básica del cliente
    const customer = await tenantStorage.getCustomerById(customerId);
    
    if (!customer) {
      console.log('⚠️ [GET /customers/:id/details] Customer not found:', customerId);
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    // Obtener estadísticas básicas usando métodos existentes
    let totalOrders = 0;
    let totalSpent = '0.00';
    
    try {
      // ✅ CORRECCIÓN: Usar getAllOrders y filtrar por customerId
      const allOrders = await tenantStorage.getAllOrders();
      const customerOrders = allOrders.filter(order => order.customerId === customerId);
      
      totalOrders = customerOrders.length;
      
      // Calcular total gastado
      const totalAmount = customerOrders.reduce((sum: number, order: any) => {
        return sum + parseFloat(order.totalAmount || '0');
      }, 0);
      
      totalSpent = totalAmount.toFixed(2);
      
      console.log(`📊 Customer ${customerId} stats: ${totalOrders} orders, $${totalSpent} spent`);
      
    } catch (statsError) {
      console.warn('Could not calculate customer stats:', statsError);
      // Usar valores por defecto en caso de error
    }
    
    // Determinar si es VIP
    const isVip = totalOrders >= 5 || parseFloat(totalSpent) >= 1000;
    
    const customerDetails = {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      isVip: isVip,
      totalOrders: totalOrders,
      totalSpent: totalSpent,
      createdAt: customer.createdAt
    };
    
    console.log('✅ [GET /customers/:id/details] Customer details:', customerDetails);
    res.json(customerDetails);
    
  } catch (error) {
    console.error('❌ [GET /customers/:id/details] Error:', error);
    res.status(500).json({ 
      error: "Failed to get customer details",
      details: error.message 
    });
  }
});


// Buscar clientes por nombre o teléfono
router.get('/customers/search', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const query = req.query.q as string;

    if (!query || query.trim().length < 2) {
      return res.json([]);
    }

    console.log('🔍 [GET /customers/search] Searching customers:', query);

    const tenantStorage = await getTenantStorageWithSchema(user);
    const allCustomers = await tenantStorage.getAllCustomers();

    // Filtrar clientes por nombre o teléfono
    const searchTerm = query.toLowerCase().trim();
    const results = allCustomers.filter((customer: any) =>
      customer.name?.toLowerCase().includes(searchTerm) ||
      customer.phone?.includes(searchTerm)
    ).slice(0, 10); // Limitar a 10 resultados

    console.log('✅ [GET /customers/search] Found results:', results.length);
    res.json(results);
  } catch (error) {
    console.error('❌ [GET /customers/search] Error:', error);
    res.status(500).json({ error: "Failed to search customers" });
  }
});

// ⚠️ DEPRECATED: Endpoint movido a customer-management-routes.ts
// Este endpoint ahora incluye loyalty balance, customer types y parent customers
// NO re-habilitar este endpoint duplicado

// Obtener todos los clientes - MOVED TO customer-management-routes.ts
/* router.get('/customers', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    console.log('👥 [GET /customers] Getting all customers for store:', user.storeId);

    if (user.role === 'super_admin') {
      return res.status(403).json({
        error: "Super admin debe usar /api/super-admin/stores/:storeId/customers"
      });
    }

    if (!user.storeId) {
      return res.status(403).json({
        error: "Store ID is required"
      });
    }

    const tenantStorage = await getTenantStorageWithSchema(user);
    const customers = await tenantStorage.getAllCustomers();

    console.log('✅ [GET /customers] Found customers:', customers.length);
    res.json(customers);
  } catch (error) {
    console.error('❌ [GET /customers] Error:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      user: (req.user as AuthUser)?.storeId
    });
    res.status(500).json({
      error: "Failed to fetch customers",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}); */

// Obtener un cliente específico - MOVED TO customer-management-routes.ts
/* router.get('/customers/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const customerId = parseInt(req.params.id);
    const user = req.user as AuthUser;

    console.log('👤 [GET /customers/:id] Getting customer:', customerId);

    if (!user.storeId) {
      return res.status(403).json({
        error: "Store ID is required"
      });
    }

    const tenantStorage = await getTenantStorageWithSchema(user);
    const customer = await tenantStorage.getCustomerById(customerId);

    if (!customer) {
      console.log('⚠️ [GET /customers/:id] Customer not found:', customerId);
      return res.status(404).json({ error: 'Customer not found' });
    }

    console.log('✅ [GET /customers/:id] Customer retrieved:', customerId);
    res.json(customer);
  } catch (error) {
    console.error('❌ [GET /customers/:id] Error:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      customerId: req.params.id,
      user: (req.user as AuthUser)?.storeId
    });
    res.status(500).json({
      error: "Failed to fetch customer",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
}); */

// ORDER ROUTES
  // ================================

// server/routes.ts - Reemplazar la sección ORDER ROUTES (líneas ~42-80)

  // ================================
  // ORDER ROUTES - MEJORADOS
  // ================================

 router.get('/orders', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    console.log('📦 Fetching orders for store:', user.storeId);
    
    // Obtener órdenes básicas
    const orders = await tenantStorage.getAllOrders();
    
    // Enriquecer con información adicional
    const enrichedOrders = await Promise.all(orders.map(async (order: any) => {
      try {
        // Obtener información del cliente
        let customer = null;
        if (order.customerId) {
          customer = await tenantStorage.getCustomerById(order.customerId);
        }
        
        // Obtener información del usuario asignado
        let assignedUser = null;
        if (order.assignedUserId) {
          try {
            assignedUser = await tenantStorage.getUserById(order.assignedUserId);
          } catch (err) {
            console.warn(`⚠️ User ${order.assignedUserId} not found for order ${order.id}`);
          }
        }
        
        // Obtener items
        let items = [];
        try {
          items = await tenantStorage.getOrderItemsByOrderId(order.id);
        } catch (err) {
          console.log(`ℹ️ No items found for order ${order.id}`);
        }
        const totalItems = items.length;
        
        // Obtener información del viaje si existe
        let tripNumber = null;
        if (order.tripId) {
          try {
            const trip = await tenantStorage.getTripById(order.tripId);
            tripNumber = trip?.tripNumber || null;
          } catch (err) {
            console.warn(`⚠️ Trip ${order.tripId} not found for order ${order.id}`);
          }
        }
        
        return {
          id: order.id,
          orderNumber: order.orderNumber,
          customerId: order.customerId,
          assignedUserId: order.assignedUserId,
          status: order.status,
          priority: order.priority || 'normal',
          totalAmount: order.totalAmount,
          deliveryCost: order.deliveryCost || '0.00',
          loyaltyPointsTotal: (order as any).loyaltyPointsTotal ?? (order as any).loyalty_points_total ?? 0,
          loyaltyPointsPropertyName: (order as any).loyaltyPointsPropertyName ?? (order as any).loyalty_points_property_name ?? null,
          loyaltyPointsValue: (order as any).loyaltyPointsValue ?? (order as any).loyalty_points_value ?? null,
          // Dirección completa combinada
deliveryAddress: order.customerAddress || order.deliveryAddress,
customerLocation: {
  province: order.customerProvince || null,
  municipality: order.customerMunicipality || null,
  sector: order.customerSector || null,
  address: order.customerAddress || null,
  latitude: order.customerLatitude || null,
  longitude: order.customerLongitude || null,
},
          contactNumber: order.contactNumber,
          estimatedDelivery: order.estimatedDelivery,
          estimatedDeliveryTime: order.estimatedDeliveryTime,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          description: order.description,
          notes: order.notes,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          lastStatusUpdate: order.lastStatusUpdate,
          customerLastInteraction: order.customerLastInteraction,
          modificationCount: order.modificationCount || 0,
          storeId: order.storeId,
          
          // ✅ CAMPOS DE VIAJE
          tripId: order.tripId || null,
          tripNumber: tripNumber,
          
          // Información expandida del cliente
         customer: customer ? {
  id: customer.id,
  name: customer.name || 'Cliente',
  phone: customer.phone || order.contactNumber,
  email: customer.email,
  address:
    customer.address ||
    order.customerAddress ||
    [order.customerSector, order.customerMunicipality, order.customerProvince]
      .filter(Boolean)
      .join(', ') ||
    'Sin dirección'
} : {
  id: order.customerId,
  name: 'Cliente no encontrado',
  phone: order.contactNumber,
  email: null,
  address:
    order.customerAddress ||
    [order.customerSector, order.customerMunicipality, order.customerProvince]
      .filter(Boolean)
      .join(', ') ||
    'Sin dirección'
},

          
          // Usuario asignado
          assignedUser: assignedUser ? {
            id: assignedUser.id,
            name: assignedUser.name,
            role: assignedUser.role
          } : null,
          
          // Items de la orden
          items: items.map((item: any) => ({
            id: item.id,
            orderId: item.orderId,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            installationCost: item.installationCost || '0.00',
            partsCost: item.partsCost || '0.00',
            laborHours: item.laborHours || '0',
            laborRate: item.laborRate || '0.00',
            deliveryCost: item.deliveryCost || '0.00',
            deliveryDistance: item.deliveryDistance || '0',
            notes: item.notes,
            product: {
              id: item.productId,
              name: item.productName || 'Producto sin nombre',
              description: item.productDescription || '',
              category: item.productCategory || 'product',
              price: item.productPrice || item.unitPrice
            }
          })),
          totalItems
        };
      } catch (error) {
        console.error(`❌ Error enriching order ${order.id}:`, error);
        // En caso de error, devolver orden básica con estructura mínima
        return {
          ...order,
          tripId: order.tripId || null,
          tripNumber: null,
          customer: {
            id: order.customerId,
            name: 'Cliente',
            phone: order.contactNumber,
            email: null,
            address: order.deliveryAddress
          },
          assignedUser: null,
          items: [],
          totalItems: 0,
          priority: order.priority || 'normal'
        };
      }
    }));
    
    // Aplicar filtros de query parameters
    let filteredOrders = enrichedOrders;
    const { status, limit, offset, priority, customerId } = req.query;
    
    if (status && status !== 'all') {
      filteredOrders = filteredOrders.filter((order: any) => order.status === status);
    }
    
    if (priority && priority !== 'all') {
      filteredOrders = filteredOrders.filter((order: any) => order.priority === priority);
    }
    
    if (customerId) {
      filteredOrders = filteredOrders.filter((order: any) => order.customerId === parseInt(customerId));
    }
    
    if (offset) {
      const offsetNum = parseInt(offset as string);
      filteredOrders = filteredOrders.slice(offsetNum);
    }
    
    if (limit) {
      const limitNum = parseInt(limit as string);
      filteredOrders = filteredOrders.slice(0, limitNum);
    }
    
    console.log(`✅ Returning ${filteredOrders.length} enriched orders`);
    res.json(filteredOrders);
    
  } catch (error) {
    console.error('❌ Error fetching orders:', error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

router.post('/orders/by-customer', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const storeId = typeof user.storeId === 'string' ? parseInt(user.storeId) : user.storeId;
    const tenantStorage = await getTenantStorageWithSchema(user);

    // Validar payload con Zod y devolver errores detallados (422)
    const parsed = byCustomerOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i: any) => ({
        path: Array.isArray(i.path) ? i.path.join('.') : String(i.path),
        message: i.message,
        code: i.code,
      }));
      return res.status(422).json({ error: 'Validation failed', issues });
    }
    const validated = parsed.data;
    const customerId = validated.customerId;
    const customer = await tenantStorage.getCustomerById(customerId);
    if (!customer) {
      return res.status(400).json({ error: `El cliente ${customerId} no existe` });
    }

    const rawItems = Array.isArray(validated.items) ? validated.items : [];

    // Calcular totalAmount si no viene y hay items
    let totalAmount = validated.totalAmount as any;
    if ((totalAmount === undefined || totalAmount === null || totalAmount === '') && rawItems.length > 0) {
      const sum = rawItems.reduce((acc: number, it: any) => {
        const qty = Number(it.quantity || 0);
        const unit = Number(it.unitPrice || 0);
        const total = it.totalPrice !== undefined ? Number(it.totalPrice) : (qty * unit);
        return acc + (isNaN(total) ? 0 : total);
      }, 0);
      totalAmount = sum;
    }

    // Preparar datos de la orden, hidratando con datos del cliente si faltan
    const { items: _omitItems, totalAmount: _omitTotal, customerId: _omitCustomerId, ...rest } = validated as any;
    const orderData: any = {
      ...rest,
      storeId,
      customerId,
      customerAddress: validated.customerAddress ?? customer.address ?? null,
      customerLatitude: validated.customerLatitude ?? customer.latitude ?? null,
      customerLongitude: validated.customerLongitude ?? customer.longitude ?? null,
    };

    if (totalAmount !== undefined && totalAmount !== null && totalAmount !== '') {
      orderData.totalAmount = String(totalAmount);
    }

    if (orderData.contactNumber === undefined && customer.phone) {
      orderData.contactNumber = customer.phone;
    }

    // Normalizar items al formato esperado por storage (coincide con create-web-order)
    const normalizedItems = rawItems.map((it: any) => {
      const qty = Number(it.quantity ?? 1);
      const unit = it.unitPrice !== undefined ? Number(it.unitPrice) : (it.price !== undefined ? Number(it.price) : 0);
      const total = it.totalPrice !== undefined ? Number(it.totalPrice) : (qty * unit);
      return {
        productId: Number(it.productId),
        quantity: qty,
        unitPrice: String(unit),
        totalPrice: String(total),
        // Campos opcionales si vienen
        installationCost: it.installationCost !== undefined ? String(it.installationCost) : undefined,
        partsCost: it.partsCost !== undefined ? String(it.partsCost) : undefined,
        laborHours: it.laborHours !== undefined ? String(it.laborHours) : undefined,
        laborRate: it.laborRate !== undefined ? String(it.laborRate) : undefined,
        deliveryCost: it.deliveryCost !== undefined ? String(it.deliveryCost) : undefined,
        deliveryDistance: it.deliveryDistance !== undefined ? String(it.deliveryDistance) : undefined,
        notes: it.notes,
      };
    });

    // Crear la orden principal con items normalizados
    const order = await tenantStorage.createOrder(orderData, normalizedItems);

    // Registrar historial si el storage lo soporta (mismo patrón que create-web-order)
    try {
      if (typeof (tenantStorage as any).addOrderHistory === 'function') {
        await (tenantStorage as any).addOrderHistory({
          orderId: order.id,
          action: 'order_created_by_customer',
          statusFrom: null,
          statusTo: 'pending',
          notes: validated.notes || 'Orden creada con /orders/by-customer'
        });
      }
    } catch (logError) {
      console.warn('No se pudo registrar historial de orden:', logError);
    }

    // Notificaciones
    const notificationService = new NotificationService(tenantStorage, storeId);
    await notificationService.triggerOrderNotifications({
      orderId: order.id,
      eventType: 'order_created',
      customData: { source: 'by_customer_creation' }
    });

    // No recrear items manualmente para evitar duplicados; seguimos el patrón de create-web-order

    // Integrar con viajes si hay assignedUserId
    let tripInfo = null;
    if (orderData.assignedUserId) {
      try {
        const tripResult = await integrateWithAutoAssignment(
          storeId,
          order.id,
          orderData.assignedUserId
        );
        if (tripResult) {
          tripInfo = {
            tripId: tripResult.tripId,
            tripNumber: tripResult.tripNumber
          };
        }
      } catch (tripError) {
        console.error('Error integrando con viajes:', tripError);
      }
    }

    return res.status(201).json({ order, trip: tripInfo });
  } catch (error: any) {
    console.error('Error creando orden por customerId:', error);
    return res.status(500).json({ error: 'Failed to create order by customerId', details: error.message });
  }
});


router.post('/orders', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const storeId = typeof user.storeId === 'string' ? parseInt(user.storeId) : user.storeId;
    const orderData = { ...req.body, storeId };
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Crear la orden
    const order = await tenantStorage.createOrder(orderData, req.body.items || []);
    
    // Trigger notificación
    const notificationService = new NotificationService(tenantStorage, storeId);
    await notificationService.triggerOrderNotifications({
      orderId: order.id,
      eventType: 'order_created',
      customData: { source: 'manual_creation' }
    });
    
    // Items
    if (req.body.items && Array.isArray(req.body.items) && req.body.items.length > 0) {
      try {
        for (const item of req.body.items) {
          if (tenantStorage.createOrderItem) {
            await tenantStorage.createOrderItem({
              orderId: order.id,
              ...item
            });
          }
        }
      } catch (itemError) {
        console.warn('⚠️ Could not create order items:', itemError);
      }
    }
    
    // ✅ INTEGRAR CON VIAJES
    let tripInfo = null;
    if (orderData.assignedUserId) {
      try {
        const tripResult = await integrateWithAutoAssignment(
          storeId,
          order.id,
          orderData.assignedUserId
        );
        
        if (tripResult) {
          tripInfo = {
            tripId: tripResult.tripId,
            tripNumber: tripResult.tripNumber
          };
        }
      } catch (tripError) {
        console.error('❌ [TRIP] Error:', tripError);
      }
    }
    
    res.status(201).json({ order, trip: tripInfo });
  } catch (error) {
    console.error('❌ Error creating order:', error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// Endpoint para probar asignación automática manualmente (usar en testing)
router.post('/orders/:orderId/auto-assign', authenticateToken, async (req: any, res: any) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const user = req.user as AuthUser;
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    console.log(`🧪 [TEST AUTO-ASSIGN] Testing auto-assignment for order: ${orderId}`);
    
    const result = await executeAutoAssignment(orderId, tenantStorage);
    
    if (result.success) {
      const updatedOrder = await tenantStorage.getOrder(orderId);
      res.json({
        success: true,
        message: result.message,
        order: updatedOrder
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
    
  } catch (error) {
    console.error('❌ [TEST AUTO-ASSIGN] Error:', error);
    res.status(500).json({ 
      error: 'Failed to test auto-assignment',
      details: error.message 
    });
  }
});

router.get('/team/availability-stats', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Get all users and filter technicians
    const allUsers = await tenantStorage.getAllUsers();
    const technicians = allUsers.filter((u: any) => 
      u.role === 'technical' || u.role === 'technician'
    );
    
    // Get employee profiles for each technician
    const techStats = await Promise.all(
      technicians.map(async (tech: any) => {
        try {
          const profile = await tenantStorage.getEmployeeProfile(tech.id);
          return {
            id: tech.id,
            name: tech.name,
            status: tech.status || 'offline',
            currentOrders: profile?.currentOrders || 0,
            maxDailyOrders: profile?.maxDailyOrders || 5,
            province: profile?.province,
            municipality: profile?.municipality,
            sector: profile?.sector,
            specializations: profile?.specializations || [],
            skillLevel: profile?.skillLevel || 3,
          };
        } catch (err) {
          console.warn(`Could not get profile for tech ${tech.id}:`, err);
          return {
            id: tech.id,
            name: tech.name,
            status: tech.status || 'offline',
            currentOrders: 0,
            maxDailyOrders: 5,
            specializations: [],
            skillLevel: 3,
          };
        }
      })
    );
    
    // Calculate stats
    const stats = {
      total: techStats.length,
      available: techStats.filter(t => t.status === 'active' && t.currentOrders < t.maxDailyOrders).length,
      busy: techStats.filter(t => t.status === 'busy' || t.currentOrders >= t.maxDailyOrders).length,
      offline: techStats.filter(t => t.status === 'offline').length,
      byProvince: techStats.reduce((acc: any, t) => {
        const province = t.province || 'Sin asignar';
        acc[province] = (acc[province] || 0) + 1;
        return acc;
      }, {}),
      averageLoad: techStats.length > 0 
        ? (techStats.reduce((sum, t) => sum + (t.currentOrders / t.maxDailyOrders), 0) / techStats.length * 100).toFixed(1)
        : "0",
      technicians: techStats.map(t => ({
        ...t,
        availabilityPercentage: ((1 - (t.currentOrders / t.maxDailyOrders)) * 100).toFixed(0),
        isAvailable: t.status === 'active' && t.currentOrders < t.maxDailyOrders
      }))
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching team availability:', error);
    res.status(500).json({ 
      error: 'Failed to fetch team availability',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});


router.patch('/orders/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    const user = req.user as AuthUser;
    const storeId = typeof user.storeId === 'string' ? parseInt(user.storeId) : user.storeId;

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    const tenantStorage = await getTenantStorageWithSchema(user);

    // ✅ Obtener orden anterior para comparar
    const previousOrder = await tenantStorage.getOrderById(id);

    // ✅ Separar items del resto de datos de la orden
    const { items, ...orderData } = req.body;

    // ✅ Actualizar orden con o sin items según lo que se envíe
    let order;
    if (items !== undefined) {
      // Si se envían items, usar la función que actualiza items
      order = await tenantStorage.updateOrderWithItems(id, orderData, items);
    } else {
      // Si no se envían items, solo actualizar la orden principal
      order = await tenantStorage.updateOrder(id, orderData);
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // ✅ NUEVO: Si cambió el estado de la orden, sincronizar con viaje
    if (orderData.status && previousOrder?.status !== orderData.status) {
      console.log(`🔄 [PATCH /orders/:id] Estado cambió de ${previousOrder?.status} a ${orderData.status}`);
      await syncOrderStatusWithTrip(storeId, id, orderData.status);

      // 🎁 NUEVO: Acreditar loyalty points si la orden se completó
      if (orderData.status === 'completed' && previousOrder?.status !== 'completed') {
        try {
          console.log(`🎁 [LOYALTY] Orden ${id} completada, acreditando puntos...`);
          const result = await tenantStorage.creditLoyaltyPointsFromOrder(id);

          if (result.success) {
            console.log(`✅ [LOYALTY] ${result.message}`);
          } else {
            console.warn(`⚠️ [LOYALTY] ${result.message}`);
          }
        } catch (loyaltyError) {
          console.error(`❌ [LOYALTY] Error acreditando puntos:`, loyaltyError);
        }
      }

      // 🔄 NUEVO: Revertir loyalty points si se cancela después de completada
      if (orderData.status === 'cancelled' && previousOrder?.status === 'completed') {
        try {
          console.log(`↩️ [LOYALTY] Orden ${id} cancelada después de completarse, revirtiendo puntos...`);
          const result = await tenantStorage.revertLoyaltyPointsFromOrder(id);

          if (result.success) {
            console.log(`✅ [LOYALTY] ${result.message}`);
          } else {
            console.warn(`⚠️ [LOYALTY] ${result.message}`);
          }
        } catch (loyaltyError) {
          console.error(`❌ [LOYALTY] Error revirtiendo puntos:`, loyaltyError);
        }
      }
    }

    res.json(order);
  } catch (error) {
    console.error('❌ Error updating order (PATCH):', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// ✅ 2. PUT /orders/:id/status
router.put('/orders/:id/status', authenticateToken, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;
    const user = req.user as AuthUser;
    const storeId = typeof user.storeId === 'string' ? parseInt(user.storeId) : user.storeId;
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // ✅ Obtener orden anterior para comparar
    const previousOrder = await tenantStorage.getOrderById(id);
    
    const updateData = { 
      status,
      lastStatusUpdate: new Date().toISOString()
    };
    
    const order = await tenantStorage.updateOrder(id, updateData);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // ✅ NUEVO: Sincronizar con viaje si cambió el estado
    if (previousOrder?.status !== status) {
      console.log(`🔄 [PUT /orders/:id/status] Estado cambió de ${previousOrder?.status} a ${status}`);
      await syncOrderStatusWithTrip(storeId, id, status);

      // 🎁 NUEVO: Acreditar loyalty points si la orden se completó
      if (status === 'completed' && previousOrder?.status !== 'completed') {
        try {
          console.log(`🎁 [LOYALTY] Orden ${id} completada, acreditando puntos...`);
          const result = await tenantStorage.creditLoyaltyPointsFromOrder(id);

          if (result.success) {
            console.log(`✅ [LOYALTY] ${result.message}`);
          } else {
            console.warn(`⚠️ [LOYALTY] ${result.message}`);
          }
        } catch (loyaltyError) {
          console.error(`❌ [LOYALTY] Error acreditando puntos:`, loyaltyError);
          // No fallar la actualización de la orden si falla la acreditación de puntos
        }
      }

      // 🔄 NUEVO: Revertir loyalty points si se cancela una orden que estaba completada
      if (status === 'cancelled' && previousOrder?.status === 'completed') {
        try {
          console.log(`↩️ [LOYALTY] Orden ${id} cancelada después de completarse, revirtiendo puntos...`);
          const result = await tenantStorage.revertLoyaltyPointsFromOrder(id);

          if (result.success) {
            console.log(`✅ [LOYALTY] ${result.message}`);
          } else {
            console.warn(`⚠️ [LOYALTY] ${result.message}`);
          }
        } catch (loyaltyError) {
          console.error(`❌ [LOYALTY] Error revirtiendo puntos:`, loyaltyError);
          // No fallar la actualización de la orden
        }
      }
    }

    res.json(order);
  } catch (error) {
    console.error('❌ Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

router.delete('/orders/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    const user = req.user as AuthUser;
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Verificar que la orden existe
    const order = await tenantStorage.getOrderById(id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Eliminar items si existen
    try {
      if (tenantStorage.deleteOrderItem) {
        await tenantStorage.deleteOrderItem(id);
      }
    } catch (itemError) {
      console.warn('⚠️ Could not delete order items:', itemError);
    }
    
    // Eliminar la orden
    await tenantStorage.deleteOrder(id);
    
    res.json({ success: true, message: 'Order deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting order:', error);
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

// ✅ 3. PUT /orders/:id (versión completa con notificaciones)
router.put('/orders/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    const user = req.user as AuthUser;
    const storeId = typeof user.storeId === 'string' ? parseInt(user.storeId) : user.storeId;

    const tenantStorage = await getTenantStorageWithSchema(user);

    // Obtener orden anterior para comparar
    const previousOrder = await tenantStorage.getOrderById(id);

    // ✅ Separar items del resto de datos de la orden
    const { items, ...orderData } = req.body;

    // ✅ Actualizar orden con o sin items según lo que se envíe
    let order;
    if (items !== undefined) {
      // Si se envían items, usar la función que actualiza items
      order = await tenantStorage.updateOrderWithItems(id, orderData, items);
    } else {
      // Si no se envían items, solo actualizar la orden principal
      order = await tenantStorage.updateOrder(id, orderData);
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // ✅ NUEVO: Si cambió el estado de la orden, sincronizar con viaje
    if (orderData.status && previousOrder?.status !== orderData.status) {
      console.log(`🔄 [PUT /orders/:id] Estado cambió de ${previousOrder?.status} a ${orderData.status}`);
      await syncOrderStatusWithTrip(storeId, id, orderData.status);

      // 🎁 NUEVO: Acreditar loyalty points si la orden se completó
      if (orderData.status === 'completed' && previousOrder?.status !== 'completed') {
        try {
          console.log(`🎁 [LOYALTY] Orden ${id} completada, acreditando puntos...`);
          const result = await tenantStorage.creditLoyaltyPointsFromOrder(id);

          if (result.success) {
            console.log(`✅ [LOYALTY] ${result.message}`);
          } else {
            console.warn(`⚠️ [LOYALTY] ${result.message}`);
          }
        } catch (loyaltyError) {
          console.error(`❌ [LOYALTY] Error acreditando puntos:`, loyaltyError);
        }
      }

      // 🔄 NUEVO: Revertir loyalty points si se cancela después de completada
      if (orderData.status === 'cancelled' && previousOrder?.status === 'completed') {
        try {
          console.log(`↩️ [LOYALTY] Orden ${id} cancelada después de completarse, revirtiendo puntos...`);
          const result = await tenantStorage.revertLoyaltyPointsFromOrder(id);

          if (result.success) {
            console.log(`✅ [LOYALTY] ${result.message}`);
          } else {
            console.warn(`⚠️ [LOYALTY] ${result.message}`);
          }
        } catch (loyaltyError) {
          console.error(`❌ [LOYALTY] Error revirtiendo puntos:`, loyaltyError);
        }
      }
    }

    // ✅ SI CAMBIÓ LA ASIGNACIÓN, INTEGRAR CON VIAJES (código existente)
    if (orderData.assignedUserId &&
        previousOrder?.assignedUserId !== orderData.assignedUserId) {

      console.log('🚚 [TRIP] Order assignment changed, checking trip integration...');

      try {
        const tripResult = await integrateWithAutoAssignment(
          storeId,
          id,
          orderData.assignedUserId
        );

        if (tripResult) {
          console.log(`✅ [TRIP] Order ${id} added to trip ${tripResult.tripNumber}`);
        }
      } catch (tripError) {
        console.error('❌ [TRIP] Error integrating with trips:', tripError);
        // No fallar la actualización si falla la integración de viajes
      }
    }

    // Trigger notificaciones (código existente)
    const notificationService = new NotificationService(tenantStorage, storeId);

    if (previousOrder?.status !== order.status) {
      await notificationService.triggerOrderNotifications({
        orderId: order.id,
        eventType: 'order_status_changed',
        customData: {
          previousStatus: previousOrder?.status,
          newStatus: order.status
        }
      });
    }

    if (previousOrder?.assignedUserId !== order.assignedUserId) {
      await notificationService.triggerOrderNotifications({
        orderId: order.id,
        eventType: 'assignment_changed',
        customData: {
          previousTechnician: previousOrder?.assignedUserId,
          newTechnician: order.assignedUserId
        }
      });
    }

    res.json(order);
  } catch (error) {
    console.error('❌ Error updating order:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

 // ✅ NUEVO: Endpoint de auto-asignación de órdenes
router.post('/orders/:id/auto-assign', authenticateToken, async (req: any, res: any) => {
  try {
    const orderId = parseInt(req.params.id);
    const user = req.user as AuthUser;
    const storeId = typeof user.storeId === 'string' ? parseInt(user.storeId) : user.storeId;
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    const order = await tenantStorage.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (order.assignedUserId) {
      return res.status(400).json({ 
        error: 'Order is already assigned',
        assignedUser: order.assignedUserId
      });
    }
    
    const availableUsers = await tenantStorage.getStoreEmployeesAndAdmins();
    
    if (availableUsers.length === 0) {
      return res.status(404).json({ 
        error: 'No available users for assignment',
        message: 'No active employees or administrators found in this store'
      });
    }
    
    const userWorkloads = await Promise.all(
      availableUsers.map(async (u: any) => {
        const currentWorkload = await tenantStorage.getUserWorkload(u.id);
        return { user: u, currentWorkload };
      })
    );
    
    userWorkloads.sort((a, b) => a.currentWorkload.workloadScore - b.currentWorkload.workloadScore);
    const selectedUser = userWorkloads[0].user;
    
    const updateData = {
      assignedUserId: selectedUser.id,
      status: order.status === 'pending' ? 'assigned' : order.status,
      lastStatusUpdate: new Date().toISOString()
    };
    
    const updatedOrder = await tenantStorage.updateOrder(orderId, updateData);
    
    // ✅ INTEGRAR CON VIAJES
    let tripInfo = null;
    try {
      const tripResult = await integrateWithAutoAssignment(
        storeId,
        orderId,
        selectedUser.id
      );
      
      if (tripResult) {
        tripInfo = {
          tripId: tripResult.tripId,
          tripNumber: tripResult.tripNumber
        };
        console.log(`✅ [TRIP] Order ${orderId} added to trip ${tripResult.tripNumber}`);
      }
    } catch (tripError) {
      console.error('❌ [TRIP] Error integrating with trips:', tripError);
    }
    
    res.json({
      success: true,
      message: `Order assigned to ${selectedUser.name}`,
      assignedUser: {
        id: selectedUser.id,
        name: selectedUser.name,
        role: selectedUser.role,
        storeId: storeId
      },
      order: updatedOrder,
      trip: tripInfo,
      algorithm: {
        method: 'workload_balancing',
        selectedFrom: availableUsers.length,
        userWorkload: userWorkloads[0].currentWorkload
      }
    });
    
  } catch (error) {
    console.error('❌ Error in auto-assignment:', error);
    res.status(500).json({ error: 'Failed to auto-assign order' });
  }
});


  // ✅ NUEVO: Endpoint para obtener estadísticas de asignación

     router.get('/orders/assignment/stats', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    const [orders, availableUsers] = await Promise.all([
      tenantStorage.getAllOrders(),
      tenantStorage.getStoreEmployeesAndAdmins() // ✅ CORRECCIÓN: Usar método específico
    ]);
    
    const assignedOrders = orders.filter((o: any) => o.assignedUserId);
    const unassignedOrders = orders.filter((o: any) => !o.assignedUserId);
    
    // Estadísticas por usuario - solo empleados/admins de la tienda
    const userStats = await Promise.all(
      availableUsers.map(async (u: any) => {
        const userOrders = orders.filter((o: any) => o.assignedUserId === u.id);
        const activeOrders = userOrders.filter((o: any) => 
          ['assigned', 'processing', 'preparing'].includes(o.status)
        );
        
        return {
          userId: u.id,
          userName: u.name,
          userRole: u.role,
          totalOrders: userOrders.length,
          activeOrders: activeOrders.length,
          completedOrders: userOrders.filter((o: any) => o.status === 'completed').length
        };
      })
    );
    
    res.json({
      storeId: user.storeId,
      summary: {
        totalOrders: orders.length,
        assignedOrders: assignedOrders.length,
        unassignedOrders: unassignedOrders.length,
        availableUsers: availableUsers.length,
        assignmentRate: orders.length > 0 ? 
          Math.round((assignedOrders.length / orders.length) * 100) : 0
      },
      userStats: userStats.sort((a, b) => b.activeOrders - a.activeOrders),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error fetching assignment stats:', error);
    res.status(500).json({ error: 'Failed to fetch assignment statistics' });
  }
}); 

// ✅ Actualizar estado de orden
router.patch('/orders/:id/status', authenticateToken, async (req: any, res: any) => {
  try {
    const orderId = parseInt(req.params.id);
    const user = req.user as AuthUser;
    const storeId = typeof user.storeId === 'string' ? parseInt(user.storeId) : user.storeId;
    const { status, notes } = req.body;

    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    console.log(`📝 [PATCH /orders/${orderId}/status] Updating to:`, status);

    const tenantStorage = await getTenantStorageWithSchema(user);

    const order = await tenantStorage.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const updatedOrder = await tenantStorage.updateOrder(orderId, {
      status,
      updatedAt: new Date()
    });

    // ✅ NUEVO: Sincronizar cambio de estado con viaje
    if (order.status !== status) {
      console.log(`🔄 [PATCH /orders/:id/status] Sincronizando estado con viaje...`);
      await syncOrderStatusWithTrip(storeId, orderId, status);

      // 🎁 NUEVO: Acreditar loyalty points si la orden se completó
      if (status === 'completed' && order.status !== 'completed') {
        try {
          console.log(`🎁 [LOYALTY] Orden ${orderId} completada, acreditando puntos...`);
          const result = await tenantStorage.creditLoyaltyPointsFromOrder(orderId);

          if (result.success) {
            console.log(`✅ [LOYALTY] ${result.message}`);
          } else {
            console.warn(`⚠️ [LOYALTY] ${result.message}`);
          }
        } catch (loyaltyError) {
          console.error(`❌ [LOYALTY] Error acreditando puntos:`, loyaltyError);
          // No fallar la actualización de la orden si falla la acreditación de puntos
        }
      }

      // 🔄 NUEVO: Revertir loyalty points si se cancela una orden que estaba completada
      if (status === 'cancelled' && order.status === 'completed') {
        try {
          console.log(`↩️ [LOYALTY] Orden ${orderId} cancelada después de completarse, revirtiendo puntos...`);
          const result = await tenantStorage.revertLoyaltyPointsFromOrder(orderId);

          if (result.success) {
            console.log(`✅ [LOYALTY] ${result.message}`);
          } else {
            console.warn(`⚠️ [LOYALTY] ${result.message}`);
          }
        } catch (loyaltyError) {
          console.error(`❌ [LOYALTY] Error revirtiendo puntos:`, loyaltyError);
          // No fallar la actualización de la orden
        }
      }
    }

    console.log(`✅ Updated successfully`);
    res.json(updatedOrder);

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      error: 'Failed to update order status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ================================
// TECHNICIAN SPECIFIC ENDPOINTS
// ================================

// Endpoint para obtener órdenes del técnico
router.get('/orders/technician', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    
    // Verificar que el usuario sea técnico
    if (user.role !== 'technician') {
      return res.status(403).json({ error: 'Access denied. Technician role required.' });
    }
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    console.log('🔧 [GET /orders/technician] Getting orders for technician:', user.id);
    
    // Obtener órdenes asignadas al técnico
    const orders = await tenantStorage.getTechnicianOrders(user.id);
    
    console.log('✅ [GET /orders/technician] Found orders:', orders.length);
    res.json(orders);
  } catch (error) {
    console.error('❌ [GET /orders/technician] Error:', error);
    res.status(500).json({ 
      error: "Failed to fetch technician orders",
      details: error.message 
    });
  }
});

// Endpoint para métricas específicas del técnico
router.get('/dashboard/technician/metrics', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    
    // Verificar que el usuario sea técnico
    if (user.role !== 'technician') {
      return res.status(403).json({ error: 'Access denied. Technician role required.' });
    }
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    console.log('📊 [GET /dashboard/technician/metrics] Getting metrics for technician:', user.id);
    
    // Obtener órdenes del técnico
    const allOrders = await tenantStorage.getTechnicianOrders(user.id);
    
    // Calcular métricas
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const ordersToday = allOrders.filter(order => {
      const orderDate = new Date(order.createdAt);
      orderDate.setHours(0, 0, 0, 0);
      return orderDate.getTime() === today.getTime();
    });
    
    const pendingOrders = allOrders.filter(order => 
      order.status === 'assigned' || order.status === 'pending'
    );
    
    const inProgressOrders = allOrders.filter(order => 
      order.status === 'processing'
    );
    
    const completedOrders = allOrders.filter(order => 
      order.status === 'completed'
    );
    
    // Calcular ingresos del día
    const todayIncome = ordersToday
      .filter(order => order.status === 'completed')
      .reduce((sum, order) => sum + parseFloat(order.totalAmount || '0'), 0);
    
    const metrics = {
      ordersToday: ordersToday.length,
      pendingOrders: pendingOrders.length,
      inProgressOrders: inProgressOrders.length,
      completedOrders: completedOrders.length,
      todayIncome: todayIncome
    };
    
    console.log('✅ [GET /dashboard/technician/metrics] Calculated metrics:', metrics);
    res.json(metrics);
  } catch (error) {
    console.error('❌ [GET /dashboard/technician/metrics] Error:', error);
    res.status(500).json({ 
      error: "Failed to fetch technician metrics",
      details: error.message 
    });
  }
});

// Endpoint adicional: Obtener órdenes asignadas al técnico por estado
router.get('/orders/technician/status/:status', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const status = req.params.status;
    
    // Verificar que el usuario sea técnico
    if (user.role !== 'technician') {
      return res.status(403).json({ error: 'Access denied. Technician role required.' });
    }
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    console.log('🔧 [GET /orders/technician/status] Getting orders by status:', status, 'for technician:', user.id);
    
    // Obtener órdenes del técnico filtradas por estado
    const allOrders = await tenantStorage.getTechnicianOrders(user.id);
    const filteredOrders = allOrders.filter(order => order.status === status);
    
    console.log('✅ [GET /orders/technician/status] Found orders:', filteredOrders.length);
    res.json(filteredOrders);
  } catch (error) {
    console.error('❌ [GET /orders/technician/status] Error:', error);
    res.status(500).json({ 
      error: "Failed to fetch technician orders by status",
      details: error.message 
    });
  }
});

// Endpoint para actualizar el estado del técnico (disponible, ocupado, etc.)
router.patch('/users/:userId/status', authenticateToken, async (req: any, res: any) => {
  try {
    const userId = parseInt(req.params.userId);
    const user = req.user as AuthUser;
    const { status } = req.body;
    
    // Verificar que el usuario pueda actualizar su propio estado o sea admin
    if (user.id !== userId && user.role !== 'admin' && user.role !== 'store_admin') {
      return res.status(403).json({ error: 'Access denied. Can only update own status.' });
    }
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    console.log('👤 [PATCH /users/:userId/status] Updating status for user:', userId, 'to:', status);
    
    // Actualizar el estado del usuario
    const updatedUser = await tenantStorage.updateUser(userId, { status });
    
    console.log('✅ [PATCH /users/:userId/status] Status updated successfully');
    res.json(updatedUser);
  } catch (error) {
    console.error('❌ [PATCH /users/:userId/status] Error:', error);
    res.status(500).json({ 
      error: "Failed to update user status",
      details: error.message 
    });
  }
});


  router.get('/orders/:id', authenticateToken, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as AuthUser;
      
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid order ID' });
      }
      
      const tenantStorage = await getTenantStorageWithSchema(user);
      const order = await tenantStorage.getOrderById(id);
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      // Enriquecer la orden individual con información completa
      let customer = null;
      if (order.customerId) {
        customer = await tenantStorage.getCustomerById(order.customerId);
      }
      
      let assignedUser = null;
      if (order.assignedUserId) {
        try {
          assignedUser = await tenantStorage.getUserById(order.assignedUserId);
        } catch (err) {
          console.warn(`⚠️ User ${order.assignedUserId} not found`);
        }
      }
      
      // Obtener items si existe el método
      let items = [];
      try {
        if (tenantStorage.getOrderItems) {
          items = await tenantStorage.getOrderItemsByOrderId(order.id);
        }
      } catch (err) {
        console.log(`ℹ️ No items found for order ${order.id}`);
      }
      
      const enrichedOrder = {
        ...order,
        customer: customer ? {
          id: customer.id,
          name: customer.name || 'Cliente',
          phone: customer.phone || order.contactNumber,
          email: customer.email,
          address: customer.address || order.deliveryAddress
        } : {
          id: order.customerId,
          name: 'Cliente no encontrado',
          phone: order.contactNumber,
          email: null,
          address:
    order.customerAddress ||
    [order.customerSector, order.customerMunicipality, order.customerProvince]
      .filter(Boolean)
      .join(', ') ||
    'Sin dirección'
},
        assignedUser: assignedUser ? {
          id: assignedUser.id,
          name: assignedUser.name,
          role: assignedUser.role
        } : null,
        items: items.map((item: any) => ({
  id: item.id,
  orderId: item.orderId,
  productId: item.productId,
  quantity: item.quantity,
  unitPrice: item.unitPrice,
  totalPrice: item.totalPrice,
  installationCost: item.installationCost || '0.00',
  partsCost: item.partsCost || '0.00',
  laborHours: item.laborHours || '0',
  laborRate: item.laborRate || '0.00',
  deliveryCost: item.deliveryCost || '0.00',
  deliveryDistance: item.deliveryDistance || '0',
  notes: item.notes,
  product: {
    id: item.productId,
    name: item.productName || 'Producto sin nombre',  // ✅ USA productName del JOIN
    description: item.productDescription || '',
    category: item.productCategory || 'product',
    price: item.productPrice || item.unitPrice
  }
        })),
        totalItems: items.length,
        priority: order.priority || 'normal'
      };
      
      res.json(enrichedOrder);
    } catch (error) {
      console.error('❌ Error fetching order:', error);
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  });
  // ================================
  // REGISTRATION FLOW ROUTES
  // ================================

  router.get('/registration-flows', authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      const tenantStorage = await getTenantStorageWithSchema(user);
      const flows = await tenantStorage.getAllRegistrationFlows();
      res.json(flows);
    } catch (error) {
      console.error("Error getting registration flows:", error);
      res.status(500).json({ error: "Failed to fetch registration flows" });
    }
  });

  router.get('/registration-flows/:id', authenticateToken, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as AuthUser;
      
      const tenantStorage = await getTenantStorageWithSchema(user);
      const flow = await tenantStorage.getRegistrationFlowById(id);
      
      if (!flow) {
        return res.status(404).json({ error: 'Registration flow not found' });
      }
      
      res.json(flow);
    } catch (error) {
      console.error("Error getting registration flow:", error);
      res.status(500).json({ error: "Failed to fetch registration flow" });
    }
  });

  router.post('/registration-flows', authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      const flowData = { ...req.body, storeId: user.storeId };
      
      const tenantStorage = await getTenantStorageWithSchema(user);
      const flow = await tenantStorage.repairRegistrationFlow(flowData);
      res.status(201).json(flow);
    } catch (error) {
      console.error("Error creating registration flow:", error);
      res.status(500).json({ error: "Failed to create registration flow" });
    }
  });

  router.put('/registration-flows/:id', authenticateToken, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as AuthUser;
      
      const tenantStorage = await getTenantStorageWithSchema(user);
      const flow = await tenantStorage.updateRegistrationFlow(id, req.body);
      
      if (!flow) {
        return res.status(404).json({ error: 'Registration flow not found' });
      }
      
      res.json(flow);
    } catch (error) {
      console.error("Error updating registration flow:", error);
      res.status(500).json({ error: "Failed to update registration flow" });
    }
  });

  router.delete('/registration-flows/:id', authenticateToken, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as AuthUser;
      
      const tenantStorage = await getTenantStorageWithSchema(user);
      await tenantStorage.deleteRegistrationFlow(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting registration flow:", error);
      res.status(500).json({ error: "Failed to delete registration flow" });
    }
  });

  // ================================
  // USER MANAGEMENT ROUTES (TENANT LEVEL)
  // ================================

// GET - Endpoint unificado para obtener usuarios
router.get('/users', authenticateToken, requireSuperAdmin, async (req: any, res: any) => {
  try {
    const { storeId, level, search, page = 1, limit = 50 } = req.query;
    const user = req.user as AuthUser;
    
    let users = [];
    let totalCount = 0;
    let source = '';

    // Si se especifica storeId, obtener usuarios del schema de esa tienda
    if (storeId) {
      const storeIdInt = parseInt(storeId as string);
      
      // Verificar que la tienda existe
      const store = await masterStorage.getVirtualStore(storeIdInt);
      if (!store) {
        return res.status(404).json({ error: 'Store not found' });
      }

      try {
        const tenantStorage = await storageFactory.getTenantStorage(storeIdInt);
        const tenantUsers = await tenantStorage.getAllUsers();
        
        users = tenantUsers.map(u => ({
          ...u,
          level: 'tenant',
          storeId: storeIdInt,
          storeName: store.name,
          source: 'tenant_schema'
        }));
        
        source = `tenant_schema_${store.name}`;
      } catch (error) {
        console.error(`Error fetching tenant users for store ${storeIdInt}:`, error);
        users = [];
      }
    } 
    // Si se especifica level=global, obtener usuarios globales
    else if (level === 'global') {
      const globalUsers = await masterStorage.listGlobalUsers();
      users = globalUsers.map(u => ({
        ...u,
        level: 'global',
        source: 'global_schema'
      }));
      source = 'global_schema';
    }
    // Si se especifica level=store, obtener usuarios de tienda (system_users)
    else if (level === 'store') {
      const storeUsers = await masterStorage.listStoreUsers();
      users = storeUsers.map(u => ({
        ...u,
        level: 'store',
        source: 'system_users'
      }));
      source = 'system_users';
    }
    // Por defecto, obtener usuarios globales (sin storeId especificado)
    else {
      const globalUsers = await masterStorage.listGlobalUsers();
      users = globalUsers.map(u => ({
        ...u,
        level: 'global',
        source: 'global_schema'
      }));
      source = 'global_schema';
    }

    // Aplicar filtro de búsqueda
    if (search) {
      const searchTerm = (search as string).toLowerCase();
      users = users.filter(u => 
        u.username?.toLowerCase().includes(searchTerm) ||
        u.email?.toLowerCase().includes(searchTerm) ||
        u.name?.toLowerCase().includes(searchTerm) ||
        u.firstName?.toLowerCase().includes(searchTerm) ||
        u.lastName?.toLowerCase().includes(searchTerm)
      );
    }

    totalCount = users.length;

    // Aplicar paginación
    const pageInt = parseInt(page as string);
    const limitInt = parseInt(limit as string);
    const offset = (pageInt - 1) * limitInt;
    const paginatedUsers = users.slice(offset, offset + limitInt);

    // Remover passwords de la respuesta
    const safeUsers = paginatedUsers.map(user => {
      const { password, ...safeUser } = user;
      return safeUser;
    });

    res.json({
      users: safeUsers,
      pagination: {
        page: pageInt,
        limit: limitInt,
        total: totalCount,
        pages: Math.ceil(totalCount / limitInt)
      },
      metadata: {
        source,
        storeId: storeId ? parseInt(storeId as string) : null,
        level: level || 'global',
        filters: {
          search: search || null
        }
      }
    });

  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// POST - Crear usuario (mejorado para manejar diferentes contextos)
router.post('/users', authenticateToken, requireSuperAdmin, async (req: any, res: any) => {
  try {
    const { storeId, level = 'global', ...userData } = req.body;
    const user = req.user as AuthUser;

    // Validar datos requeridos
    if (!userData.username || !userData.password || !userData.role) {
      return res.status(400).json({ 
        error: 'Missing required fields: username, password, role' 
      });
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const userDataWithPassword = {
      ...userData,
      password: hashedPassword
    };

    let newUser;

    // Crear según el contexto especificado
    if (storeId && level === 'tenant') {
      // Crear usuario en schema de tienda específica
      const tenantStorage = await storageFactory.getTenantStorage(parseInt(storeId));
      newUser = await tenantStorage.createUser({
        ...userDataWithPassword,
        storeId: parseInt(storeId)
      });
      newUser.level = 'tenant';
      newUser.source = 'tenant_schema';
    } 
    else if (level === 'store') {
      // Crear usuario de tienda (system_users)
      newUser = await masterStorage.createStoreUser({
        ...userDataWithPassword,
        storeId: storeId ? parseInt(storeId) : null
      });
      newUser.level = 'store';
      newUser.source = 'system_users';
    } 
    else {
      // Crear usuario global (por defecto)
      newUser = await masterStorage.createGlobalUser(userDataWithPassword);
      newUser.level = 'global';
      newUser.source = 'global_schema';
    }

    // Remover password de la respuesta
    const { password, ...safeUser } = newUser;
    
    res.status(201).json({
      user: safeUser,
      message: `User created successfully in ${newUser.source}`
    });

  } catch (error) {
    console.error("Error creating user:", error);
    
    if (error instanceof Error && error.message?.includes('already exists')) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    
    res.status(500).json({ error: "Failed to create user" });
  }
});

// GET - Obtener stores disponibles para el selector
router.get('/stores', authenticateToken, requireSuperAdmin, async (req: any, res: any) => {
  try {
    const stores = await masterStorage.getAllVirtualStores();
    
    const storesWithUserCounts = await Promise.all(
      stores.map(async (store) => {
        let userCount = 0;
        try {
          const tenantStorage = await storageFactory.getTenantStorage(store.id);
          const users = await tenantStorage.getAllUsers();
          userCount = users.length;
        } catch (error) {
          console.error(`Error counting users for store ${store.id}:`, error);
        }
        
        return {
          id: store.id,
          name: store.name,
          isActive: store.isActive,
          userCount,
          hasSchema: !!store.databaseUrl?.includes('schema=')
        };
      })
    );

    res.json(storesWithUserCounts);
  } catch (error) {
    console.error("Error fetching stores:", error);
    res.status(500).json({ error: "Failed to fetch stores" });
  }
});

  router.get('/users/:id', authenticateToken, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as AuthUser;
      
      const tenantStorage = await getTenantStorageWithSchema(user);
      const targetUser = await tenantStorage.getUserById(id);
      
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json(targetUser);
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });


// PUT - Actualizar usuario (contexto unificado)
// Endpoint específico para admins de tienda
router.put('/users/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const id = parseInt(req.params.id);
    
    // Solo admins de tienda pueden usar este endpoint
    if (!['admin', 'store_admin', 'store_owner'].includes(user.role)) {
      return res.status(403).json({ 
        error: 'Store admin access required' 
      });
    }
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    const updateData = { ...req.body };
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }
    
    const updatedUser = await tenantStorage.updateUser(id, updateData);
    
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const { password, ...safeUser } = updatedUser;
    res.json(safeUser);
    
  } catch (error) {
    console.error('Error updating store user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// POST - Reset password (contexto unificado)
router.post('/users/:id/reset-password', authenticateToken, requireSuperAdmin, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    const { newPassword, storeId, level } = req.body;
    const user = req.user as AuthUser;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    let result;

    // Resetear según contexto
    if (level === 'global') {
      result = await masterStorage.updateGlobalUser(id, { password: hashedPassword });
    } 
    else if (level === 'store') {
      result = await masterStorage.updateStoreUser(id, { password: hashedPassword });
    } 
    else if (level === 'tenant' && storeId) {
      const tenantStorage = await storageFactory.getTenantStorage(parseInt(storeId));
      result = await tenantStorage.updateUser(id, { password: hashedPassword });
    } 
    else {
      return res.status(400).json({ error: "Missing level or storeId for context" });
    }

    if (!result) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ 
      success: true, 
      message: `Password reset successfully for ${level} user`
    });

  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// DELETE - Eliminar usuario (contexto unificado)
router.delete('/users/:id', authenticateToken, requireSuperAdmin, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    const { storeId, level } = req.query;
    const user = req.user as AuthUser;

    // Evitar auto-eliminación
    if (id === user.id) {
      return res.status(400).json({ error: "Cannot delete yourself" });
    }

    let success = false;

    // Eliminar según contexto
    if (level === 'global') {
      success = await masterStorage.deleteGlobalUser(id);
    } 
    else if (level === 'store') {
      success = await masterStorage.deleteStoreUser(id);
    } 
    else if (level === 'tenant' && storeId) {
      const tenantStorage = await storageFactory.getTenantStorage(parseInt(storeId as string));
      await tenantStorage.deleteUser(id);
      success = true;
    } 
    else {
      return res.status(400).json({ error: "Missing level or storeId for context" });
    }

    if (!success) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ 
      success: true, 
      message: `User deleted successfully from ${level} context`
    });

  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

  router.patch('/users/:id/status', authenticateToken, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = z.object({ status: z.string() }).parse(req.body);
      const user = req.user as AuthUser;
      
      const tenantStorage = await getTenantStorageWithSchema(user);
      const updatedUser = await tenantStorage.updateUser(id, { status });
      
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(updatedUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid status data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update user status" });
    }
  });

  // ================================
  // NOTIFICATION ROUTES
  // ================================

  router.get("/notifications/count/:userId", authenticateToken, async (req: any, res: any) => {
    try {
      const { userId } = req.params;
      const user = req.user as AuthUser;
      
      const tenantStorage = await getTenantStorageWithSchema(user);
      const counts = await tenantStorage.getNotificationCounts(parseInt(userId));
      
      res.json(counts);
    } catch (error) {
      console.error("Error fetching notification counts:", error);
      res.status(500).json({ error: "Failed to fetch notification counts" });
    }
  });

router.get("/notifications/:userId", authenticateToken, async (req: any, res: any) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    const user = req.user as AuthUser;
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Usar getUserNotifications en lugar de getNotifications
    const allNotifications = await tenantStorage.getUserNotifications(parseInt(userId));
    
    // Aplicar paginación manualmente
    const startIndex = parseInt(offset as string);
    const endIndex = startIndex + parseInt(limit as string);
    const notifications = allNotifications.slice(startIndex, endIndex);
    
    res.json({
      notifications,
      pagination: {
        total: allNotifications.length,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: endIndex < allNotifications.length
      }
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

  router.post("/notifications", authenticateToken, async (req: any, res: any) => {
    try {
      const notificationData = insertNotificationSchema.parse(req.body);
      const user = req.user as AuthUser;
      
      const tenantStorage = await getTenantStorageWithSchema(user);
      const notification = await tenantStorage.createNotification(notificationData);
      
      res.status(201).json(notification);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid notification data", details: error.errors });
      }
      console.error("Error creating notification:", error);
      res.status(500).json({ error: "Failed to create notification" });
    }
  });

  router.put("/notifications/:id/read", authenticateToken, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as AuthUser;
      
      const tenantStorage = await getTenantStorageWithSchema(user);
      const notification = await tenantStorage.markNotificationAsRead(id);
      
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      res.json(notification);
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  router.put("/notifications/read-all", authenticateToken, async (req: any, res: any) => {
    try {
      const userId = req.body.userId;
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }
      
      const user = req.user as AuthUser;
      const tenantStorage = await getTenantStorageWithSchema(user);
      await tenantStorage.markAllNotificationsAsRead(parseInt(userId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({ error: "Failed to mark notifications as read" });
    }
  });

  // ================================
  // WHATSAPP CONFIGURATION ROUTES
  // ================================

  router.get("/whatsapp-config", authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      
      // WhatsApp config se almacena en master storage (configuración global por tienda)
      const config = await masterStorage.getWhatsAppConfig(user.storeId);
      
      res.json(config);
    } catch (error) {
      console.error("Error fetching WhatsApp config:", error);
      res.status(500).json({ error: "Failed to fetch WhatsApp config" });
    }
  });

  router.put("/whatsapp-config", authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      const configData = { ...req.body, storeId: user.storeId };
      
      // WhatsApp config se almacena en master storage
      const config = await masterStorage.updateWhatsAppConfig(user.storeId, configData);
      
      res.json(config);
    } catch (error) {
      console.error("Error updating WhatsApp config:", error);
      res.status(500).json({ error: "Failed to update WhatsApp config" });
    }
  });

  // ================================
  // WHATSAPP LOG ROUTES
  // ================================

  router.get("/whatsapp-logs", authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      const { phoneNumberId, limit = 50, offset = 0 } = req.query;
      
      // WhatsApp logs en master storage (centralizados)
      const logs = await masterStorage.getWhatsAppLogs(
        user.storeId,
        phoneNumberId as integer,
        parseInt(limit as string),
        parseInt(offset as string)
      );
      
      res.json(logs);
    } catch (error) {
      console.error("Error fetching WhatsApp logs:", error);
      res.status(500).json({ error: "Failed to fetch WhatsApp logs" });
    }
  });

  router.post("/whatsapp-logs", authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      const logData = { ...req.body, storeId: user.storeId };
      
      // WhatsApp logs en master storage
      const log = await masterStorage.addWhatsAppLog(logData);
      res.status(201).json(log);
    } catch (error) {
      console.error("Error creating WhatsApp log:", error);
      res.status(500).json({ error: "Failed to create WhatsApp log" });
    }
  });

  // ================================
  // AUTO-RESPONSE ROUTES
  // ================================

  router.get('/auto-responses', authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      const tenantStorage = await getTenantStorageWithSchema(user);
      const autoResponses = await tenantStorage.getAllAutoResponses();
      res.json(autoResponses);
    } catch (error) {
      console.error('Error fetching auto-responses:', error);
      res.status(500).json({ error: 'Failed to fetch auto-responses' });
    }
  });

  router.get('/auto-responses/:id', authenticateToken, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as AuthUser;
      
      const tenantStorage = await getTenantStorageWithSchema(user);
      const autoResponse = await tenantStorage.getAutoResponseById(id);
      
      if (!autoResponse) {
        return res.status(404).json({ error: 'Auto-response not found' });
      }
      
      res.json(autoResponse);
    } catch (error) {
      console.error('Error fetching auto-response:', error);
      res.status(500).json({ error: 'Failed to fetch auto-response' });
    }
  });

  router.post('/auto-responses', authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      const autoResponseData = { ...req.body, storeId: user.storeId };
      
      const tenantStorage = await getTenantStorageWithSchema(user);
      const autoResponse = await tenantStorage.createAutoResponse(autoResponseData);
      res.status(201).json(autoResponse);
    } catch (error) {
      console.error('Error creating auto-response:', error);
      res.status(500).json({ error: 'Failed to create auto-response' });
    }
  });

  router.put('/auto-responses/:id', authenticateToken, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as AuthUser;
      
      const tenantStorage = await getTenantStorageWithSchema(user);
      const autoResponse = await tenantStorage.updateAutoResponse(id, req.body);
      
      if (!autoResponse) {
        return res.status(404).json({ error: 'Auto-response not found' });
      }
      
      res.json(autoResponse);
    } catch (error) {
      console.error('Error updating auto-response:', error);
      res.status(500).json({ error: 'Failed to update auto-response' });
    }
  });

  router.delete('/auto-responses/:id', authenticateToken, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as AuthUser;
      
      const tenantStorage = await getTenantStorageWithSchema(user);
      await tenantStorage.deleteAutoResponse(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting auto-response:', error);
      res.status(500).json({ error: 'Failed to delete auto-response' });
    }
  });

  // ================================
  // IMAGE HANDLING ROUTES
  // ================================

  router.post('/validate-image-url', authenticateToken, validateImageUrlHandler);
  
  router.post('/upload-image', authenticateToken, (req: any, res: any, next: any) => {
    upload.single('image')(req, res, (err: any) => {
      if (err) return res.status(400).json({ error: err.message });
      uploadImageHandler(req, res);
    });
  });

  router.post('/process-image-url', authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      const { imageUrl } = req.body;
      
      const processedUrls = await processProductImages([], [imageUrl], user.storeId!);
      
      res.json({
        success: true,
        imageUrl: processedUrls[0] || imageUrl,
        originalUrl: imageUrl,
        message: 'URL procesada exitosamente'
      });
    } catch (error) {
      console.error('Error processing image URL:', error);
      res.status(500).json({ 
        error: 'Failed to process image URL',
        message: (error as Error).message 
      });
    }
  });

  // ================================
  // STORE/SCHEMA STATUS ROUTES
  // ================================

  router.get('/store/schema-status', authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      
      const store = await masterStorage.getVirtualStore(user.storeId);
      
      if (!store) {
        return res.status(404).json({ error: 'Store not found' });
      }
      
      const schemaMatch = store.databaseUrl?.match(/schema=([^&]+)/);
      const hasSchema = !!schemaMatch;
      const schemaName = schemaMatch ? schemaMatch[1] : null;
      
      let tenantConnectionValid = false;
      try {
        const tenantStorage = await getTenantStorageWithSchema(user);
        await tenantStorage.getAllProducts();
        tenantConnectionValid = true;
      } catch (error) {
        console.error('Tenant connection test failed:', error);
      }
      
      res.json({
        storeId: user.storeId,
        storeName: store.name,
        hasSchema,
        schemaName,
        tenantConnectionValid,
        status: hasSchema && tenantConnectionValid ? 'ready' : 'needs_migration',
        databaseUrl: store.databaseUrl
      });
    } catch (error) {
      console.error('Error checking schema status:', error);
      res.status(500).json({ error: 'Failed to check schema status' });
    }
  });

  // ================================
// STORE-SPECIFIC USER ROUTES
// ================================

// POST - Crear usuario para una tienda específica
router.post('/stores/:storeId/users', authenticateToken, async (req: any, res: any) => {
  try {
    const storeId = parseInt(req.params.storeId);
    const user = req.user as AuthUser;
    
    // Verificar permisos: solo super_admin o admin de la misma tienda
     if (!['super_admin', 'store_admin'].includes(user.role) && user.storeId !== storeId) {
      return res.status(403).json({ error: 'Not authorized to create users for this store' });
    }
    
    // Verificar que la tienda existe
    const store = await masterStorage.getVirtualStore(storeId);
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }
    
    const userData = { 
      ...req.body, 
      storeId: storeId,
      level: 'store' // Asegurarmos que es un usuario de tienda
    };
    
    // Validar datos requeridos
    if (!userData.username || !userData.password || !userData.role) {
      return res.status(400).json({ 
        error: 'Missing required fields: username, password, role' 
      });
    }
    
    // Hash de la contraseña si no viene hasheada
    if (userData.password && !userData.password.startsWith('$2')) {
      userData.password = await bcrypt.hash(userData.password, 10);
    }
    
    // Crear usuario usando master storage
    const newUser = await masterStorage.createStoreUser(userData);
    
    // Remover contraseña de la respuesta
    const { password, ...safeUser } = newUser;
    
    console.log(`✅ User created for store ${storeId}: ${newUser.username}`);
    res.status(201).json(safeUser);
    
  } catch (error) {
    console.error("Error creating user for store:", error);
    
    if (error instanceof Error && error.message?.includes('already exists')) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    
    res.status(500).json({ error: "Failed to create user" });
  }
});

// GET - Listar usuarios de una tienda específica
router.get('/stores/:storeId/users', authenticateToken, async (req: any, res: any) => {
  try {
    const storeId = parseInt(req.params.storeId);
    const user = req.user as AuthUser;
    
    // Verificar permisos
    if (user.role !== 'super_admin' && user.storeId !== storeId) {
      return res.status(403).json({ error: 'Not authorized to view users for this store' });
    }
    
    // ✅ USAR EL NOMBRE CORRECTO DE LA FUNCIÓN
    const users = await masterStorage.getStoreUsersByStoreId(storeId);
    
    // Remover contraseñas de la respuesta
    const safeUsers = users.map(user => {
      const { password, ...safeUser } = user;
      return safeUser;
    });
    
    res.json(safeUsers);
    
  } catch (error) {
    console.error("Error fetching store users:", error);
    res.status(500).json({ error: "Failed to fetch store users" });
  }
});

// PUT - Actualizar usuario de una tienda específica
router.put('/stores/:storeId/users/:userId', authenticateToken, async (req: any, res: any) => {
  try {
    const storeId = parseInt(req.params.storeId);
    const userId = parseInt(req.params.userId);
    const user = req.user as AuthUser;
    
    
    // ✅ PERMITIR store_admin
    if (!['super_admin', 'store_admin'].includes(user.role) && user.storeId !== storeId) {
      return res.status(403).json({ error: 'Not authorized to update users for this store' });
    }
    
    const updateData = req.body;
    
    // Hash contraseña si se está actualizando
    if (updateData.password && !updateData.password.startsWith('$2')) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }
    
    // Actualizar usuario usando master storage
   const tenantStorage = await storageFactory.getTenantStorage(storeId);
const updatedUser = await tenantStorage.updateUser(userId, updateData);
    
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Remover contraseña de la respuesta
    const { password, ...safeUser } = updatedUser;
    
    res.json(safeUser);
    
  } catch (error) {
    console.error("Error updating store user:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// DELETE - Eliminar usuario de una tienda específica
router.delete('/stores/:storeId/users/:userId', authenticateToken, async (req: any, res: any) => {
  try {
    const storeId = parseInt(req.params.storeId);
    const userId = parseInt(req.params.userId);
    const user = req.user as AuthUser;
    
    // Verificar permisos
     if (!['super_admin', 'store_admin'].includes(user.role) && user.storeId !== storeId) {
      return res.status(403).json({ error: 'Not authorized to delete users for this store' });
    }
    
    // No permitir que se elimine a sí mismo
    if (user.id === userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    const success = await masterStorage.deleteStoreUser(userId);
    
    if (!success) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ success: true, message: 'User deleted successfully' });
    
  } catch (error) {
    console.error("Error deleting store user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

  // ================================
  // REPORTS/ANALYTICS ROUTES
  // ================================

  router.get('/reports', authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      const { type, startDate, endDate } = req.query;
      
      const tenantStorage = await getTenantStorageWithSchema(user);
      const reports = await tenantStorage.getReports({
        type: type as string,
        startDate: startDate as string,
        endDate: endDate as string
      });
      
      res.json(reports);
    } catch (error) {
      console.error('Error fetching reports:', error);
      res.status(500).json({ error: 'Failed to fetch reports' });
    }
  });

  router.get('/reports/dashboard', authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      const tenantStorage = await getTenantStorageWithSchema(user);
      
      const dashboardData = await tenantStorage.getDashboardMetrics();
      res.json(dashboardData);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
  });

  // ================================
  // TESTING ROUTES
  // ================================

  router.post('/test/simulate-webhook/:storeId', async (req: any, res: any) => {
    try {
      const storeId = parseInt(req.params.storeId);
      const { phoneNumber = '18494553242', messageText = 'Hola' } = req.body;
      
      console.log(`🎭 SIMULATING MESSAGE WEBHOOK - Store: ${storeId}, Phone: ${phoneNumber}, Message: "${messageText}"`);
      
      const whatsappConfig = await masterStorage.getWhatsAppConfig(storeId);
      
      if (!whatsappConfig) {
        return res.json({
          success: false,
          error: "No WhatsApp config found - Cannot simulate webhook"
        });
      }
      
      const simulatedWebhook = {
        object: "whatsapp_business_account",
        entry: [{
          id: "TEST_BUSINESS_ACCOUNT_ID",
          changes: [{
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: whatsappConfig.phoneNumberId,
                phone_number_id: whatsappConfig.phoneNumberId
              },
              messages: [{
                from: phoneNumber,
                id: `test_${Date.now()}`,
                timestamp: Math.floor(Date.now() / 1000).toString(),
                text: {
                  body: messageText
                },
                type: "text"
              }]
            },
            field: "messages"
          }]
        }]
      };
      
      console.log(`📤 PROCESSING SIMULATED WEBHOOK...`);
      
      await processWhatsAppMessage(simulatedWebhook);
      
      console.log(`✅ WEBHOOK SIMULATION COMPLETED`);
      
      res.json({
        success: true,
        message: "Webhook simulado exitosamente",
        details: {
          storeId,
          phoneNumber,
          messageText,
          phoneNumberId: whatsappConfig.phoneNumberId
        }
      });
      
    } catch (error) {
      console.error('❌ ERROR SIMULATING WEBHOOK:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ================================
  // HEALTH CHECK ROUTES
  // ================================

  router.get('/health', async (req: any, res: any) => {
    try {
      const healthStatus = await healthCheck();
      
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        storage: healthStatus,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0'
      });
    } catch (error) {
      console.error('Health check failed:', error);
      res.status(500).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.get('/health/storage', authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      
      // Test master storage
      const masterHealth = await masterStorage.testConnection();
      
      // Test tenant storage if user has storeId
      let tenantHealth = null;
      if (user.storeId) {
        try {
          const tenantStorage = await getTenantStorageWithSchema(user);
          tenantHealth = await tenantStorage.testConnection();
        } catch (error) {
          tenantHealth = { 
            connected: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          };
        }
      }
      
      res.json({
        master: masterHealth,
        tenant: tenantHealth,
        storeId: user.storeId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Storage health check failed:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // ================================
  // SUPER ADMIN ROUTES (GLOBAL OPERATIONS)
  // ================================

  router.get('/super-admin/stores', authenticateToken, requireAdmin, async (req: any, res: any) => {
    try {
      console.log('🏪 [GET /super-admin/stores] Fetching all stores...');

      const stores = await masterStorage.getAllVirtualStores();

      console.log(`✅ [GET /super-admin/stores] Found ${stores.length} stores`);

      res.json({
        stores: stores,
        count: stores.length,
        pagination: {
          page: 1,
          limit: stores.length,
          totalPages: 1
        }
      });
    } catch (error) {
      console.error('❌ [GET /super-admin/stores] Error:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        type: error instanceof Error ? error.constructor.name : typeof error
      });

      res.status(500).json({
        error: 'Failed to fetch stores',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.post('/super-admin/stores', authenticateToken, requireAdmin, async (req: any, res: any) => {
    try {
      const storeData = req.body;

      // Validar campos requeridos
      if (!storeData.name || storeData.name.trim() === '') {
        return res.status(400).json({
          error: 'Validation error',
          message: 'Store name is required'
        });
      }

      if (!storeData.description || storeData.description.trim() === '') {
        return res.status(400).json({
          error: 'Validation error',
          message: 'Store description is required'
        });
      }

      if (!storeData.domain || storeData.domain.trim() === '') {
        return res.status(400).json({
          error: 'Validation error',
          message: 'Store domain is required'
        });
      }

      console.log('[Store Creation] 📦 Creating new store:', storeData);
      const store = await masterStorage.createStore(storeData);
      console.log('[Store Creation] ✅ Store created successfully:', store.id, store.name);

      res.status(201).json({
        success: true,
        data: store,
        message: `Store "${store.name}" created successfully`
      });
    } catch (error) {
      console.error('[Store Creation] ❌ Error creating store:', error);
      res.status(500).json({
        error: 'Failed to create store',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.put('/super-admin/stores/:id', authenticateToken, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const updateData = req.body;
      console.log('[Store Update] Updating store:', id, updateData);

      const store = await masterStorage.updateStore(id, updateData);
      console.log('[Store Update] Store updated successfully:', id);

      if (!store) {
        return res.status(404).json({ error: 'Store not found' });
      }

      res.json(store);
    } catch (error) {
      console.error('[Store Update] Error updating store:', error);
      res.status(500).json({
        error: 'Failed to update store',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.delete('/super-admin/stores/:id', authenticateToken, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      console.log('[Store Deletion] Deleting store:', id);

      const success = await masterStorage.deleteStore(id);
      console.log('[Store Deletion] Store deleted successfully:', id);

      res.json({ success });
    } catch (error) {
      console.error('[Store Deletion] Error deleting store:', error);
      res.status(500).json({
        error: 'Failed to delete store',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Migración de esquemas
  router.post('/super-admin/stores/:id/migrate-schema', authenticateToken, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const { migrateStoreToSeparateSchema } = await import('./schema-migration');
      const storeId = parseInt(req.params.id);
      const result = await migrateStoreToSeparateSchema(storeId);
      res.json(result);
    } catch (error) {
      console.error('Error during schema migration:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Métricas del sistema
  router.get('/super-admin/metrics', authenticateToken, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const stores = await masterDb.select().from(schema.virtualStores);
      const users = await masterDb.select().from(schema.systemUsers);
      
      const totalStores = stores.length;
      const activeStores = stores.filter(store => store.isActive).length;
      const totalUsers = users.length;
      
      const [totalOrdersResult] = await masterDb
        .select({ count: sql<number>`count(*)` })
        .from(schema.orders);
      
      const [todayOrdersResult] = await masterDb
        .select({ count: sql<number>`count(*)` })
        .from(schema.orders)
        .where(sql`DATE(${schema.orders.createdAt}) = DATE(${new Date().toISOString()})`);
      
      const [totalMessagesResult] = await masterDb
        .select({ count: sql<number>`count(*)` })
        .from(schema.messages);
      
      const [revenueResult] = await masterDb
        .select({ total: sql<number>`COALESCE(SUM(CAST(${schema.orders.totalAmount} AS DECIMAL)), 0)` })
        .from(schema.orders)
        .where(eq(schema.orders.status, 'completed'));
      
      const metrics = {
        totalStores,
        activeStores,
        totalUsers,
        totalOrders: totalOrdersResult?.count || 0,
        ordersToday: todayOrdersResult?.count || 0,
        totalRevenue: Number(revenueResult?.total || 0).toFixed(2),
        totalMessages: totalMessagesResult?.count || 0,
        storageUsed: "N/A",
        systemStatus: "healthy" as const
      };

      res.json(metrics);
    } catch (error) {
      console.error('Error fetching super admin metrics:', error);
      res.status(500).json({ error: 'Failed to fetch metrics' });
    }
  });

  // Capacidad del sistema
  router.get('/super-admin/capacity', authenticateToken, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const { calculateStoreCapacity, validateCapacityForNewStores } = await import('./schema-migration');
      const capacity = calculateStoreCapacity();
      const newStoresParam = req.query.newStores;
      const newStores = newStoresParam ? parseInt(newStoresParam as string) : 0;
      const validation = validateCapacityForNewStores(newStores);
      
      res.json({
        capacity,
        validation: newStores > 0 ? validation : null
      });
    } catch (error) {
      console.error('Error calculating capacity:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });


  // Nuevo endpoint para actualizar moneda base de producto
app.patch('/api/products/:id/currency', authenticateToken, requireTenantStorage, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const productId = parseInt(req.params.id);
    const { base_currency } = req.body;

    if (!base_currency || !['USD', 'DOP'].includes(base_currency)) {
      return res.status(400).json({ error: 'Moneda base inválida. Use USD o DOP.' });
    }

    const tenantStorage = req.tenantStorage;
    
    // Actualizar producto con nueva moneda base
    const updatedProduct = await tenantStorage.updateProductCurrency(productId, base_currency);
    
    if (!updatedProduct) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json(updatedProduct);
  } catch (error) {
    console.error('Error updating product currency:', error);
    res.status(500).json({ error: 'Error actualizando moneda del producto' });
  }
});

// Endpoint para obtener configuración de monedas soportadas
app.get('/api/currencies/supported', authenticateToken, (req: any, res: any) => {
  res.json({
    supported: [
      { code: 'USD', name: 'Dólar Estadounidense', symbol: '$' },
      { code: 'DOP', name: 'Peso Dominicano', symbol: 'RD$' }
    ],
    default: 'DOP'
  });
});

  // ================================
  // STATIC FILE SERVING
  // ================================

  router.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // ================================
  // ERROR HANDLING MIDDLEWARE
  // ================================

  router.use((error: any, req: any, res: any, next: any) => {
    console.error('Route error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors
      });
    }
    
    if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
      return res.status(400).json({
        error: 'Duplicate entry',
        message: error.message
      });
    }
    
    if (error.message?.includes('foreign key') || error.message?.includes('constraint')) {
      return res.status(400).json({
        error: 'Constraint violation',
        message: 'Cannot complete operation due to existing dependencies'
      });
    }
    
    res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  });

  // Configuración de canales
router.get('/notification-channels', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const tenantStorage = await getTenantStorageWithSchema(user);
    const channels = await tenantStorage.getNotificationChannels();
    res.json(channels);
  } catch (error) {
    console.error('Error fetching notification channels:', error);
    res.status(500).json({ error: 'Failed to fetch notification channels' });
  }
});

router.put('/notification-channels/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const id = req.params.id; // Mantener como string
    const user = req.user as AuthUser;
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    const channel = await tenantStorage.updateNotificationChannel(id, req.body);
    res.json(channel);
  } catch (error) {
    console.error('Error updating notification channel:', error);
    res.status(500).json({ error: 'Failed to update notification channel' });
  }
});

// Eventos de notificación
router.get('/notification-events', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const tenantStorage = await getTenantStorageWithSchema(user);
    const events = await tenantStorage.getNotificationEvents();
    res.json(events);
  } catch (error) {
    console.error('Error fetching notification events:', error);
    res.status(500).json({ error: 'Failed to fetch notification events' });
  }
});

// Configuraciones de notificación
router.get('/notification-configs', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const tenantStorage = await getTenantStorageWithSchema(user);
    const configs = await tenantStorage.getNotificationConfigs();
    res.json(configs);
  } catch (error) {
    console.error('Error fetching notification configs:', error);
    res.status(500).json({ error: 'Failed to fetch notification configs' });
  }
});

router.post('/notification-configs', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    const config = await tenantStorage.createNotificationConfig(req.body);
    res.json(config);
  } catch (error) {
    console.error('Error creating notification config:', error);
    res.status(500).json({ error: 'Failed to create notification config' });
  }
});

router.put('/notification-configs/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    const user = req.user as AuthUser;
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    const config = await tenantStorage.updateNotificationConfig(id, req.body);
    res.json(config);
  } catch (error) {
    console.error('Error updating notification config:', error);
    res.status(500).json({ error: 'Failed to update notification config' });
  }
});

router.delete('/notification-configs/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    const user = req.user as AuthUser;
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    await tenantStorage.deleteNotificationConfig(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting notification config:', error);
    res.status(500).json({ error: 'Failed to delete notification config' });
  }
});


// Endpoint específico para obtener usuarios asignables (técnicos, especialistas, admin)
router.get('/tenant-users/assignable', authenticateToken, async (req: any, res: any) => {
  try {

     res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    const user = req.user as AuthUser;
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    console.log(`🎯 Getting assignable users for store ${user.storeId}`);
    
    // Usar el nuevo método que filtra solo empleados/admins asignables
    const assignableUsers = await tenantStorage.getStoreEmployeesAndAdmins();
    
    // Formatear respuesta para el frontend
    const formattedUsers = assignableUsers.map(u => ({
      id: u.id,
      name: u.name,
      role: u.role,
      email: u.email,
      phone: u.phone,
      status: u.status,
      storeId: u.storeId
    }));
    
    console.log(`✅ Found ${formattedUsers.length} assignable users`);
    
    res.json(formattedUsers);
  } catch (error) {
    console.error('❌ Error fetching assignable users:', error);
    res.status(500).json({ 
      error: 'Failed to fetch assignable users',
      users: [] // Fallback vacío
    });
  }
});
// ===================================================
// AGREGAR ESTOS ENDPOINTS EN server/routes.ts
// En la sección de PUBLIC ROUTES (sin autenticación)
// ===================================================


// ✅ ENDPOINT PÚBLICO: Obtener información de la tienda (para branding en página compartida)
router.get('/public/stores/:storeId/info', async (req: any, res: any) => {
  try {
    const { storeId } = req.params;
    
    console.log(`🏪 [PUBLIC] Getting store info for ${storeId}`);
    
    const storeIdInt = parseInt(storeId);
    
    if (isNaN(storeIdInt)) {
      return res.status(400).json({ error: 'Invalid store ID' });
    }

    const store = await masterStorage.getVirtualStore(storeIdInt);
    
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    console.log(`✅ [PUBLIC] Store found:`, store.name);
    
    res.json({
      id: store.id,
      name: store.name,
      description: store.description,
      phone: store.whatsappNumber || null, // ✅ Usar whatsappNumber en lugar de phone
      whatsappNumber: store.whatsappNumber,
      address: store.address,
      logo: store.logo
    });
    
  } catch (error) {
    console.error('❌ [PUBLIC] Error getting store info:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Historial de notificaciones
router.get('/notification-history', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const { page = 1, limit = 20, orderId, channel, status } = req.query;
    const tenantStorage = await getTenantStorageWithSchema(user);
    
   const history = await tenantStorage.getNotificationHistory(user.id);
    
    res.json(history);
  } catch (error) {
    console.error('Error fetching notification history:', error);
    res.status(500).json({ error: 'Failed to fetch notification history' });
  }
});
// server/routes.ts - Agregar estos endpoints



// ✅ Schema de validación para reglas de asignación
const assignmentRuleSchema = z.object({
  name: z.string().min(3, "Nombre requerido"),
  priority: z.number().min(1).max(10),
  isActive: z.boolean().default(true),
  useSectorBased: z.boolean().default(true),
  requiredProvince: z.string().optional(),
  requiredMunicipality: z.string().optional(),
  requiredSectors: z.array(z.string()).optional(),
  allowAdjacentMunicipalities: z.boolean().default(true),
  useSpecializationBased: z.boolean().default(false),
  requiredSpecializations: z.array(z.string()).optional(),
  useWorkloadBased: z.boolean().default(true),
  maxOrdersPerTechnician: z.number().min(1).max(20),
  useTimeBased: z.boolean().default(true),
  availabilityRequired: z.boolean().default(true),
  applicableProducts: z.array(z.string()).optional(),
  applicableServices: z.array(z.string()).optional(),
  assignmentMethod: z.enum(['closest_available', 'least_busy', 'highest_skill', 'round_robin', 'specific_users']),
  assignedUserIds: z.array(z.number()).optional(), // ✅ NUEVO
  autoAssign: z.boolean().default(true),
  notifyCustomer: z.boolean().default(true),
  estimatedResponseTime: z.number().default(60),
});

// ================================
// ASSIGNMENT RULES CRUD
// ================================

// ✅ NUEVO: Obtener usuarios técnicos de la tienda para el selector

router.get('/assignment-rules/available-users', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Obtener TODOS los usuarios activos
    const allUsers = await tenantStorage.getAllUsers();
    const activeUsers = allUsers.filter(u => u.status === 'active');
    
    res.json(activeUsers.map(u => ({
      id: u.id,
      name: u.name,
      role: u.role,
      status: u.status
    })));
  } catch (error) {
    console.error('Error fetching available users:', error);
    res.status(500).json({ error: 'Failed to fetch available users' });
  }
});
// GET - Obtener todas las reglas de la tienda
router.get('/assignment-rules', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    
    if (!user.storeId) {
      return res.status(400).json({ error: 'Store ID is required' });
    }
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // ✅ Usar el método correcto del tenantStorage
    const rules = await tenantStorage.getAllAssignmentRules();
    
    res.json(rules);
  } catch (error) {
    console.error('Error fetching assignment rules:', error);
    res.status(500).json({ error: 'Failed to fetch assignment rules' });
  }
});

// GET - Obtener una regla específica
router.get('/assignment-rules/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    const user = req.user as AuthUser;
    
    if (!user.storeId) {
      return res.status(400).json({ error: 'Store ID is required' });
    }
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    const rule = await tenantStorage.getAssignmentRuleById(id);
    
    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    
    res.json(rule);
  } catch (error) {
    console.error('Error fetching assignment rule:', error);
    res.status(500).json({ error: 'Failed to fetch assignment rule' });
  }
});

// POST - Crear nueva regla
router.get('/assignment-rules', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    
    if (!user.storeId) {
      return res.status(400).json({ error: 'Store ID is required' });
    }
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // ✅ Usar el método correcto del tenantStorage
    const rules = await tenantStorage.getAllAssignmentRules();
    
    res.json(rules);
  } catch (error) {
    console.error('Error fetching assignment rules:', error);
    res.status(500).json({ error: 'Failed to fetch assignment rules' });
  }
});

// POST - Crear nueva regla
router.post('/assignment-rules', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    
    if (!user.storeId) {
      return res.status(400).json({ error: 'Store ID is required' });
    }
    
    // Validar datos
    const validatedData = assignmentRuleSchema.parse(req.body);
    
    // Validar usuarios específicos si aplica
    if (validatedData.assignmentMethod === 'specific_users') {
      if (!validatedData.assignedUserIds || validatedData.assignedUserIds.length === 0) {
        return res.status(400).json({ 
          error: 'Debes seleccionar al menos un usuario cuando el método es "Usuarios Específicos"' 
        });
      }
    }
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Agregar storeId a los datos
    const ruleData = {
      ...validatedData,
      storeId: user.storeId
    };
    
    // Crear la regla
    const newRule = await tenantStorage.createAssignmentRule(ruleData);
    
    console.log(`✅ Assignment rule created: "${newRule.name}"`);
    
    res.status(201).json(newRule);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.errors 
      });
    }
    
    console.error('Error creating assignment rule:', error);
    res.status(500).json({ error: 'Failed to create assignment rule' });
  }
});

// PUT - Actualizar regla existente
router.put('/assignment-rules/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    const user = req.user as AuthUser;
    
    if (!user.storeId) {
      return res.status(400).json({ error: 'Store ID is required' });
    }
    
    // Validar datos
    const validatedData = assignmentRuleSchema.parse(req.body);
    
    // ✅ Validar usuarios específicos
    if (validatedData.assignmentMethod === 'specific_users') {
      if (!validatedData.assignedUserIds || validatedData.assignedUserIds.length === 0) {
        return res.status(400).json({ 
          error: 'Debes seleccionar al menos un usuario cuando el método es "Usuarios Específicos"' 
        });
      }
    }
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Verificar que la regla existe
    const existingRule = await tenantStorage.getAssignmentRuleById(id);
    
    if (!existingRule) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    
    // Actualizar la regla
    const updatedRule = await tenantStorage.updateAssignmentRule(id, validatedData);
    
    console.log(`✅ Assignment rule updated: "${updatedRule.name}"`);
    
    res.json(updatedRule);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.errors 
      });
    }
    
    console.error('Error updating assignment rule:', error);
    res.status(500).json({ error: 'Failed to update assignment rule' });
  }
});

// DELETE - Eliminar regla
router.delete('/assignment-rules/:id', authenticateToken, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    const user = req.user as AuthUser;
    
    if (!user.storeId) {
      return res.status(400).json({ error: 'Store ID is required' });
    }
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Verificar que la regla existe
    const existingRule = await tenantStorage.getAssignmentRuleById(id);
    
    if (!existingRule) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    
    // Verificar si hay órdenes usando esta regla
    const orders = await tenantStorage.getAllOrders();
    const ordersUsingRule = orders.filter((o: any) => o.assignedRuleId === id);
    
    if (ordersUsingRule.length > 0) {
      return res.status(400).json({ 
        error: 'No se puede eliminar la regla porque hay órdenes asignadas con ella',
        suggestion: 'Desactiva la regla en lugar de eliminarla'
      });
    }
    
    // Eliminar la regla
    await tenantStorage.deleteAssignmentRule(id);
    
    console.log(`✅ Assignment rule deleted: ID ${id}`);
    
    res.json({ success: true, message: 'Rule deleted successfully' });
  } catch (error) {
    console.error('Error deleting assignment rule:', error);
    res.status(500).json({ error: 'Failed to delete assignment rule' });
  }
});

// PATCH - Activar/Desactivar regla rápidamente
router.patch('/assignment-rules/:id/toggle', authenticateToken, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    const user = req.user as AuthUser;
    
    if (!user.storeId) {
      return res.status(400).json({ error: 'Store ID is required' });
    }
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Obtener estado actual
    const rule = await tenantStorage.getAssignmentRuleById(id);
    
    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    
    // Cambiar estado
    const updatedRule = await tenantStorage.updateAssignmentRule(id, {
      isActive: !rule.isActive,
    });
    
    res.json(updatedRule);
  } catch (error) {
    console.error('Error toggling assignment rule:', error);
    res.status(500).json({ error: 'Failed to toggle assignment rule' });
  }
});





  // ================================
  // MOUNT ROUTER ON APP
  // ================================

  app.use("/api", router);
  app.use('/api/exchange-rates', exchangeRateRoutes);
  app.use('/api/super-admin', superAdminRoutes);
  app.use('/api', tripRoutes);
  app.use('/api', unitConversionRoutes);
  app.use('/api', customerManagementRoutes);
  app.use('/api', purchaseManagementRoutes);

  console.log("✅ Routes registered successfully with migrated storage");
}

// ================================
// ADDITIONAL ROUTE REGISTRATION FUNCTIONS
// ================================

export async function registerUserManagementRoutes(app: express.Application) {
  // Setup user management routes
  setupUserManagementRoutes(app);
  console.log("✅ User management routes registered");
}

export async function registerGlobalRoutes(app: express.Application) {
  // Global/system routes that don't require tenant context
  
  app.get("/api/super-admin/subscriptions", authenticateToken, requireSuperAdmin, (req, res) => {
    res.json([]);
  });

  app.get("/api/super-admin/subscription-metrics", authenticateToken, requireSuperAdmin, (req, res) => {
    res.json({
      total: 0,
      active: 0,
      expired: 0
    });
  });

  // Debug endpoints
  app.get('/api/debug/supabase', async (req, res) => {
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      const result = {
        status: 'debug',
        timestamp: new Date().toISOString(),
        config: {
          hasUrl: !!supabaseUrl,
          hasServiceKey: !!serviceKey,
          urlPreview: supabaseUrl ? supabaseUrl.substring(0, 50) + '...' : null
        },
        message: 'Supabase configuration debug'
      };

      res.json(result);
    } catch (error) {
      console.error('Supabase debug error:', error);
      res.json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Cambiar contraseña
app.post('/auth/change-password', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'Se requiere la contraseña actual y la nueva contraseña' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        error: 'La nueva contraseña debe tener al menos 6 caracteres' 
      });
    }

    // Obtener usuario de la base de datos
    const [dbUser] = await masterDb
      .select()
      .from(schema.systemUsers)
      .where(eq(schema.systemUsers.id, user.id))
      .limit(1);

    if (!dbUser) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Verificar contraseña actual
    const bcrypt = require('bcrypt');
    const isValidPassword = await bcrypt.compare(currentPassword, dbUser.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    // Hashear nueva contraseña
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Actualizar contraseña
    await masterDb
      .update(schema.systemUsers)
      .set({ 
        password: hashedNewPassword,
        updatedAt: new Date()
      })
      .where(eq(schema.systemUsers.id, user.id));

    console.log('✅ Password changed successfully for user:', user.id);

    res.json({ 
      success: true,
      message: 'Contraseña cambiada correctamente' 
    });

  } catch (error) {
    console.error('❌ Error changing password:', error);
    res.status(500).json({ 
      error: 'Error al cambiar la contraseña',
      details: error.message 
    });
  }
});

// NUEVO: Crear orden usando solo customerId, hidratando datos del cliente si faltan




// Obtener perfil del usuario actual
app.get('/auth/me', authenticateToken, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;

    // Obtener datos completos del usuario
    const [dbUser] = await masterDb
      .select({
        id: schema.systemUsers.id,
        username: schema.systemUsers.username,
        name: schema.systemUsers.name,
        email: schema.systemUsers.email,
        role: schema.systemUsers.role,
        storeId: schema.systemUsers.storeId,
        isActive: schema.systemUsers.isActive,
      })
      .from(schema.systemUsers)
      .where(eq(schema.systemUsers.id, user.id))
      .limit(1);

    if (!dbUser) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(dbUser);

  } catch (error) {
    console.error('❌ Error getting user profile:', error);
    res.status(500).json({ 
      error: 'Error al obtener el perfil',
      details: error.message 
    });
  }
});

  console.log("✅ Global routes registered");
}

// ================================
// EXPORT DEFAULT
// ================================

export default registerRoutes;

