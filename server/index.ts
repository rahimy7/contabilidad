import dotenv from 'dotenv';
dotenv.config();
// Zona horaria: República Dominicana (UTC-4, sin DST)
if (!process.env.TZ) process.env.TZ = 'America/Santo_Domingo';
// Agregar al inicio del archivo
import { getTenantStorageWithSchema } from './routes.ts';
import { StorageFactory } from './storage/storage-factory.js';
import { MasterStorageService } from './storage/master-storage.js';
import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from 'cookie-parser';
import jwt, { JwtPayload } from "jsonwebtoken";
import { registerRoutes } from "./routes";
import { registerUserManagementRoutes } from "./user-management-routes";
import { setupVite, serveStatic, log } from "./vite";
import { seedAutoResponses } from "./seed-auto-responses";
import { seedAssignmentRules } from "./seed-assignment-rules";
import { getStoreInfo, getTenantDb, masterDb, tenantMiddleware } from "./multi-tenant-db";
import * as schema from "@shared/schema";
import { eq } from "drizzle-orm";
import type { AuthenticatedRequest, AuthUser } from '@shared/auth.js';
import { WebSocketServer } from 'ws';
import { authenticateToken } from './authMiddleware.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import setupCorsForRailway from '../cors-config-railway.js';
import multer from 'multer';
import fs from 'fs';
import { SupabaseStorageManager } from './supabase-storage.js';
import { exchangeRateRoutes } from './exchange-rate.routes';
import { ExchangeRateService } from './services/exchange-rate.service.ts';
import { createWebOrder } from './routes/create-web-order.ts';
import { startScheduledTasks, startBillingCronJobs } from './scheduled-tasks.ts';
import { getTenantStorage, getTenantStorageBySlug } from './storage/index.js';
import { getDefaultTenantStorage } from './tenant-storage.ts';
import { setupPrintRoutes } from './print-routes';
import aiRoutes from './ai-routes';
import storeSettingsRoutes from './store-settings.routes';
import { validateAIConfiguration } from './ai-service';


// ================================
// 🔥 INSTANCIAS DE STORAGE
// ================================
const storageFactory = StorageFactory.getInstance();
const masterStorage = storageFactory.getMasterStorage();

// ================================
// CONFIGURACIÓN EXPRESS Y SERVER
// ================================
const app = express();
const server = createServer(app);


// Get the __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🏥 HEALTHCHECK RAILWAY - PRIMERA PRIORIDAD
app.get('/api/health', (req, res) => {
  console.log('🏥 Railway healthcheck hit');
  console.log('🔌 Port:', process.env.PORT);
  console.log('🌍 NODE_ENV:', process.env.NODE_ENV);
  
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    port: process.env.PORT,
    uptime: process.uptime()
  });
});

// También agregar un backup simple
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});



// ================================
// CONFIGURACIÓN MULTER
// ================================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máximo
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'));
    }
  }
});



// ================================
// MIDDLEWARE DE LOGGING PARA DEBUG
// ================================
app.use((req, res, next) => {
  console.log(`📝 ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});



// ================================
// CORS CONFIGURATION
// ================================
app.use((req, res, next) => {
  const origin = req.headers.origin || req.headers.referer || req.get('host') || 'localhost:5000';
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000',
    'http://127.0.0.1:5173',
    'http://10.0.0.3:5000',
    'https://delivery-web-production.up.railway.app/',
    process.env.RAILWAY_STATIC_URL
  ].filter(Boolean);
  const isAllowed = process.env.NODE_ENV === 'development' ||
    !req.headers.origin ||
    allowedOrigins.includes(req.headers.origin);
  if (isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    console.log(`✅ CORS: ${req.method} ${req.path} from ${req.headers.origin || 'no-origin'}`);
  } else {
    console.log(`❌ CORS BLOCKED: ${req.method} ${req.path} from ${req.headers.origin}`);
  }
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// ================================
// EXPRESS MIDDLEWARE
// ================================
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Middleware para parsear cookies
app.use('/api', aiRoutes);

app.post('/api/orders/create-web-order', createWebOrder);

setupPrintRoutes(app);

// ================================
// API ROUTER SETUP
// ================================
// registerRoutes(app); // ❌ COMENTADO - se llama después en la función async

const apiRouter = express.Router();
app.use('/api/exchange-rates', exchangeRateRoutes);

// ✅ REGISTRAR EL apiRouter PARA ENDPOINTS ADICIONALES
app.use('/api', apiRouter);

// 🧾 STORE SETTINGS ROUTES
app.use('/api', storeSettingsRoutes);

// ================================
// HEALTH & DEBUG ENDPOINTS
// ================================

apiRouter.get('/health', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    port: process.env.PORT || process.env.RAILWAY_PORT || 5000
  });
});

app.get('/api/debug/env', (req, res) => {
  res.json({
    environment: process.env.NODE_ENV,
    jwtSecret: process.env.JWT_SECRET ? 'CONFIGURED' : 'NOT_SET',
    databaseUrl: process.env.DATABASE_URL ? 'CONFIGURED' : 'NOT_SET',
    metaAppId: process.env.META_APP_ID ? 'CONFIGURED' : 'NOT_SET',
    port: process.env.PORT || '5000',
    railwayUrl: process.env.RAILWAY_STATIC_URL
  });
});

// Agregar este endpoint adicional para verificar secrets
apiRouter.get('/auth/debug-secrets', (req, res) => {
  const secret = process.env.JWT_SECRET || 'dev-secret';
  res.json({
    hasJwtSecret: !!process.env.JWT_SECRET,
    secretLength: secret.length,
    secretPreview: secret.substring(0, 5) + '...',
    environment: process.env.NODE_ENV
  });
});

// ================================
// AUTHENTICATION ENDPOINTS
// ================================

apiRouter.post('/tenant-users', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Validar permisos - solo admins y propietarios pueden crear usuarios
    if (!['store_owner', 'store_admin', 'admin', 'super_admin'].includes(user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions to create users' });
    }
    
    const { username, password, name, role, email, phone } = req.body;
    
    if (!username || !password || !name || !role) {
      return res.status(400).json({ 
        error: 'Missing required fields: username, password, name, role' 
      });
    }
    
    const bcrypt = await import('bcrypt');
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const userData = {
      username,
      password: hashedPassword,
      name,
      role,
      email: email || null,
      phone: phone || null,
      status: 'active',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const newUser = await tenantStorage.createUser(userData);
    const { password: _, ...safeUser } = newUser;
    
    console.log(`✅ Tenant user created: ${newUser.username} (${newUser.role}) in store ${user.storeId}`);
    res.status(201).json(safeUser);
    
  } catch (error) {
    console.error('Error creating tenant user:', error);
    if (error instanceof Error && error.message?.includes('already exists')) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});


// ================================
// EMERGENCY ADMIN PASSWORD RESET (TEMPORAL)
// ================================
apiRouter.post('/auth/emergency-reset-admin', async (req, res) => {
  try {
    const { username, newPassword, confirmPassword } = req.body;

    // Validaciones
    if (!username || !newPassword || !confirmPassword) {
      return res.status(400).json({ 
        error: 'Todos los campos son requeridos' 
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ 
        error: 'Las contraseñas no coinciden' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        error: 'La contraseña debe tener al menos 6 caracteres' 
      });
    }

    // Solo permitir para usuario admin
    if (username.toLowerCase() !== 'admin') {
      return res.status(403).json({ 
        error: 'Este endpoint solo está disponible para el usuario admin' 
      });
    }

    console.log('🔑 Emergency reset requested for admin user');

    // Buscar usuario admin en la tabla users (sistema de tienda única)
    const adminUser = await masterStorage.getUser('admin');
    
    if (!adminUser) {
      console.log('❌ Admin user not found in database');
      return res.status(404).json({ 
        error: 'Usuario admin no encontrado en el sistema' 
      });
    }

    console.log(`✅ Admin user found (ID: ${adminUser.id})`);

    // Actualizar contraseña (updateUser la hasheará automáticamente)
    await masterStorage.updateUser(adminUser.id, { 
      password: newPassword 
    });
    
    console.log(`💾 Password updated in database`);
    
    // Probar autenticación inmediata para verificar
    const testAuth = await masterStorage.authenticateUser(username, newPassword);
    console.log(`🧪 Test authentication: ${testAuth ? '✅ SUCCESS' : '❌ FAILED'}`);
    
    if (!testAuth) {
      console.error('⚠️ WARNING: Password was saved but immediate authentication test failed!');
      return res.status(500).json({ 
        error: 'La contraseña se guardó pero no se pudo verificar' 
      });
    }

    console.log('✅ Admin password reset successfully');
    
    return res.json({ 
      success: true, 
      message: 'Contraseña actualizada exitosamente' 
    });

  } catch (error) {
    console.error('❌ Error in emergency admin reset:', error);
    res.status(500).json({ 
      error: 'Error al resetear la contraseña',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

apiRouter.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log(`🔍 Login attempt for ${username}`);
    
    // Usar autenticación simplificada de master storage (tienda única)
    const user = await masterStorage.authenticateUser(username, password);
    
    if (!user) {
      console.log(`❌ Authentication failed for ${username}`);
      return res.status(401).json({ 
        success: false, 
        message: 'Credenciales inválidas' 
      });
    }
    
    // Crear token JWT con la información del usuario
    const tokenPayload = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      storeId: user.storeId, // Siempre será 1 en sistema de tienda única
      status: user.status,
      level: 'store' // Para compatibilidad con el frontend
    };
    
    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: '24h' }
    );

    console.log(`✅ Login successful, token generated`);

    res.setHeader('Content-Type', 'application/json');
    res.json({
      success: true,
      token,
      user: tokenPayload
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

apiRouter.post('/categories', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantStorage = await getTenantStorageWithSchema(user);
    const category = await tenantStorage.createCategory(req.body);
    res.status(201).json(category);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

apiRouter.put('/categories/:id', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const id = parseInt(req.params.id);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    const category = await tenantStorage.updateCategory(id, req.body);
    
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    

  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

apiRouter.delete('/categories/:id', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const id = parseInt(req.params.id);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    await tenantStorage.deleteCategory(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});



// Brands CRUD
apiRouter.get('/brands', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID required' });
    }
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    const brands = await tenantStorage.getAllBrands();
    res.json(brands);
  } catch (error) {
    console.error('Error fetching brands:', error);
    res.status(500).json({ error: 'Failed to fetch brands' });
  }
});

apiRouter.post('/brands', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    
    if (!user.storeId) {
      return res.status(403).json({ error: 'Store ID required' });
    }

    if (!req.body.name || req.body.name.trim() === '') {
      return res.status(400).json({ error: 'Brand name is required' });
    }

    const tenantStorage = await getTenantStorageWithSchema(user);
    
    const brandData = {
      ...req.body,
      name: req.body.name.trim(),
      description: req.body.description || '',
      website: req.body.website || null,
      logo: req.body.logo || null,
      isActive: req.body.isActive !== undefined ? req.body.isActive : true,
      sortOrder: req.body.sortOrder || 0
    };

    const brand = await tenantStorage.createBrand(brandData);
    console.log('✅ Brand created:', brand.name);
    
    res.status(201).json(brand);
  } catch (error) {
    console.error('Error creating brand:', error);
    res.status(500).json({ error: 'Failed to create brand' });
  }
});

apiRouter.get('/brands/:id', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const id = parseInt(req.params.id);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    const brand = await tenantStorage.getBrandById(id);
    
    if (!brand) {
      return res.status(404).json({ error: 'Brand not found' });
    }
    
    res.json(brand);
  } catch (error) {
    console.error('Error fetching brand:', error);
    res.status(500).json({ error: 'Failed to fetch brand' });
  }
});

apiRouter.put('/brands/:id', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const id = parseInt(req.params.id);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    // Verificar que existe
    const existingBrand = await tenantStorage.getBrandById(id);
    if (!existingBrand) {
      return res.status(404).json({ error: 'Brand not found' });
    }
    
    const brandData = {
      ...req.body,
      updatedAt: new Date()
    };

    const brand = await tenantStorage.updateBrand(id, brandData);
    res.json(brand);
  } catch (error) {
    console.error('Error updating brand:', error);
    res.status(500).json({ error: 'Failed to update brand' });
  }
});

apiRouter.delete('/brands/:id', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const id = parseInt(req.params.id);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    await tenantStorage.deleteBrand(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting brand:', error);
    res.status(500).json({ error: 'Failed to delete brand' });
  }
});

//=================================
// TASA DIVISA
//=================================

// Endpoint público para obtener tasas de cambio por store
app.get('/api/public/stores/:storeId/exchange-rates', async (req, res) => {
  try {
    const { storeId } = req.params;
    
    if (!storeId || isNaN(parseInt(storeId))) {
      return res.status(400).json({ error: 'Store ID válido requerido' });
    }

    const storeIdInt = parseInt(storeId);
    
    const tenantDb = await getTenantDb(storeIdInt);
    const exchangeService = new ExchangeRateService(tenantDb);
    
    const rates = await exchangeService.getAllRates(storeIdInt);
    
    const formattedRates = rates.map(rate => ({
      id: rate.id,
      baseCurrency: rate.baseCurrency,
      targetCurrency: rate.targetCurrency,
      rate: rate.rate,
      updatedAt: rate.updatedAt,
      isActive: rate.isActive
    }));

    res.setHeader('Content-Type', 'application/json');
    res.json(formattedRates);
    
  } catch (error) {
    console.error('Error getting public exchange rates:', error);
    res.status(500).json({ 
      error: 'Error obteniendo tasas de cambio públicas',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Endpoint para obtener tasa específica entre dos monedas
app.get('/api/public/stores/:storeId/exchange-rates/:from/:to', async (req, res) => {
  try {
    const { storeId, from, to } = req.params;
    
    if (!storeId || isNaN(parseInt(storeId))) {
      return res.status(400).json({ error: 'Store ID válido requerido' });
    }

    const storeIdInt = parseInt(storeId);
    
    const tenantDb = await getTenantDb(storeIdInt);
    const exchangeService = new ExchangeRateService(tenantDb);
    
    const rate = await exchangeService.getCurrentRate(
      from.toUpperCase(), 
      to.toUpperCase(), 
      storeIdInt
    );
    
    res.setHeader('Content-Type', 'application/json');
    res.json({ 
      from: from.toUpperCase(), 
      to: to.toUpperCase(), 
      rate,
      storeId: storeIdInt
    });
    
  } catch (error) {
    console.error('Error getting specific public rate:', error);
    res.status(404).json({ 
      error: 'Tasa de cambio no encontrada',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
// ================================
// SCHEMA VALIDATION ENDPOINTS
// ================================

apiRouter.get('/store/schema-status', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    
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
// TENANT STORAGE VALIDATION MIDDLEWARE
// ================================

const validateTenantStorage = async (req: any, res: any, next: any) => {
  try {
    const user = req.user;
    
    if (!user.storeId) {
      return res.status(400).json({ error: 'Store ID is required' });
    }
    
    const store = await masterStorage.getVirtualStore(user.storeId);
    
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }
    
    if (!store.databaseUrl?.includes('schema=')) {
      return res.status(400).json({ 
        error: 'Store not configured for tenant storage',
        storeId: user.storeId,
        storeName: store.name,
        needsMigration: true
      });
    }
    
    next();
  } catch (error) {
    console.error('Error validating tenant storage:', error);
    res.status(500).json({ error: 'Failed to validate tenant storage' });
  }
};

// POST - Crear usuario operacional en tenant schema
apiRouter.post('/users', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    console.log('🔄 Creating tenant user:', req.body.username);
    
    // Validar datos requeridos
    const { username, password, name, role } = req.body;
    if (!username || !password || !name || !role) {
      return res.status(400).json({ 
        error: 'Missing required fields: username, password, name, role' 
      });
    }
    
    // Hash password
    const bcrypt = await import('bcrypt');
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const userData = {
      ...req.body,
      password: hashedPassword,
      status: req.body.status || 'active',
      isActive: req.body.isActive !== false,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const newUser = await tenantStorage.createUser(userData);
    
    // Remove password from response
    const { password: _, ...safeUser } = newUser;
    console.log('✅ Tenant user created:', newUser.id);
    res.status(201).json(safeUser);
  } catch (error) {
    console.error('Error creating tenant user:', error);
    if (error instanceof Error && error.message?.includes('already exists')) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});


// ================================
// REPORTS/ANALYTICS ENDPOINTS (TENANT STORAGE)
// ================================

apiRouter.get('/reports', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
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

app.use('/api', apiRouter);
console.log('✅ API Router mounted successfully');

// Start the application
(async () => {
  try {
    console.log('🚀 Starting application with migrated storage...');

    // ================================
    // VALIDACIÓN DE CONFIGURACIÓN DE IA
    // ================================
    console.log('🔐 Validando configuración de IA...');
    const isAIConfigValid = validateAIConfiguration();
    if (!isAIConfigValid) {
      console.warn('⚠️ ADVERTENCIA: Configuración de OpenAI incompleta. Las funciones de IA estarán deshabilitadas.');
      console.warn('⚠️ Asegúrate de que OPENAI_API_KEY esté configurada en las variables de entorno.');
    } else {
      console.log('✅ Configuración de IA válida - Sistema listo para procesar mensajes con IA');
    }

    // Register other routes
    await registerRoutes(app);
    await registerUserManagementRoutes(app);

    // Schema migration endpoints
    app.post('/api/super-admin/stores/:id/migrate-schema', async (req, res) => {
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

    app.get('/api/super-admin/capacity', async (req, res) => {
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

    app.post('/api/super-admin/stores', async (req, res) => {
      try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: "Authorization header required" });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as any;
        
        if (decoded.role !== 'super_admin') {
          return res.status(403).json({ error: "Super admin access required" });
        }

        const storeData = {
          name: req.body.name,
          description: req.body.description || "",
          domain: req.body.domain,
          isActive: req.body.isActive ?? true
        };
        
        const result = await masterStorage.createStore(storeData);
        
        console.log('✅ Store created successfully:', result.name);
        res.json(result);
      } catch (error) {
        console.error('Error creating store:', error);
        res.status(500).json({ error: 'Failed to create store' });
      }
    });

    app.get('/api/super-admin/stores/:id/validate', async (req, res) => {
      try {
        console.log('=== VALIDACIÓN COMPLETA DE ECOSISTEMA MULTI-TENANT ===');
        const storeId = parseInt(req.params.id);
        console.log('Store ID:', storeId);
        
        const store = await getStoreInfo(storeId);
        
        if (!store) {
          return res.status(404).json({ 
            valid: false, 
            message: 'Tienda no encontrada en base de datos global' 
          });
        }

        console.log(`Validando tienda: ${store.name}`);

        const validationResults = {
          store: store.name,
          storeId: storeId,
          isActive: store.isActive,
          architecture: 'ANÁLISIS CRÍTICO',
          issues: [] as string[],
          recommendations: [] as string[]
        };

        try {
          const tenantDb = await getTenantDb(storeId);
          
          const criticalTables = [
            'users', 'customers', 'products', 'orders', 'order_items',
            'conversations', 'messages', 'auto_responses', 'store_settings',
            'whatsapp_settings', 'notifications', 'assignment_rules',
            'customer_history', 'shopping_cart', 'whatsapp_logs'
          ];

          for (const table of criticalTables) {
            try {
              await tenantDb.execute(`SELECT 1 FROM ${table} LIMIT 1`);
              console.log(`✅ Tabla ${table} existe`);
            } catch (error) {
              validationResults.issues.push(`❌ Tabla ${table} no existe`);
            }
          }

          const users = await tenantDb.select().from(schema.users).limit(1);
          if (users.length === 0) {
            validationResults.issues.push('⚠️ No hay usuarios creados');
            validationResults.recommendations.push('Crear al menos un usuario administrador');
          }

          const whatsappConfig = await tenantDb.select().from(schema.whatsappSettings).limit(1);
          if (whatsappConfig.length === 0) {
            validationResults.issues.push('⚠️ WhatsApp no configurado');
            validationResults.recommendations.push('Configurar credenciales de WhatsApp Business API');
          }

        } catch (error) {
          console.error('Error validando tenant DB:', error);
          validationResults.issues.push('❌ ERROR CRÍTICO: No se puede conectar a la base de datos del tenant');
          validationResults.recommendations.push('Verificar configuración de base de datos y permisos');
        }

        const valid = validationResults.issues.length === 0;
        const status = valid ? '✅ OPERACIONAL' : '❌ REQUIERE ATENCIÓN';

        res.json({
          valid,
          status,
          message: `${store.name} - ${status}`,
          ...validationResults
        });

      } catch (error) {
        console.error('Error en validación:', error);
        res.status(500).json({ 
          valid: false, 
          message: 'Error durante la validación',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    app.get('/api/super-admin/stores/:id/validate-migration', async (req, res) => {
      try {
        const storeId = parseInt(req.params.id);
        const store = await getStoreInfo(storeId);
        
        if (!store) {
          return res.status(404).json({
            valid: false,
            message: `Tienda con ID ${storeId} no encontrada`
          });
        }

        const schemaMatch = store.databaseUrl?.match(/schema=([^&]+)/);
        if (!schemaMatch) {
          return res.json({
            valid: false,
            migrationStatus: 'not_started',
            message: `${store.name} no tiene schema separado configurado`
          });
        }

        const schemaName = schemaMatch[1];
        const tenantDb = await getTenantDb(storeId);
        const tenantTables = await tenantDb.execute(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = '${schemaName}' 
          ORDER BY table_name
        `);
        
        const tables = tenantTables.rows.map((row: any) => row.table_name as string);
        const CRITICAL_TABLES = [
          'users', 'customers', 'products', 'orders', 'order_items',
          'conversations', 'messages', 'auto_responses', 'store_settings',
          'whatsapp_settings', 'notifications', 'assignment_rules',
          'customer_history', 'shopping_cart', 'whatsapp_logs'
        ];

        const missingTables = CRITICAL_TABLES.filter(table => !tables.includes(table));
        const isComplete = missingTables.length === 0;

        res.json({
          valid: isComplete,
          migrationStatus: isComplete ? 'completed' : 'partial',
          message: isComplete 
            ? `✅ MIGRACIÓN COMPLETA: ${store.name} - ${CRITICAL_TABLES.length} tablas en schema ${schemaName}`
            : `⚠️ MIGRACIÓN PARCIAL: ${store.name} - faltan ${missingTables.length} tablas`,
          details: {
            storeName: store.name,
            schemaName: schemaName,
            tablesCount: tables.length,
            missingTablesCount: missingTables.length,
            recommendations: isComplete ? ["✅ Operacional"] : [`Migrar: ${missingTables.join(', ')}`]
          }
        });

      } catch (error) {
        console.error('Error en validación:', error);
        res.status(500).json({ 
          valid: false, 
          message: 'Error interno',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    try {
      console.log('Starting seed process...');
      // await seedAutoResponses();
      // await seedAssignmentRules();
      console.log('Seed process completed.');
    } catch (error) {
      console.error('Error during seeding:', error);
    }

    // Error handling middleware
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
      console.error('Express error handler:', err);
    });

// ===================================================
// VERSIÓN PARA PRODUCCIÓN
// Reemplazar la versión de desarrollo si NODE_ENV === 'production'
// ===================================================

// ✅ MIDDLEWARE PARA SSR DE SHARE-PRODUCT (PRODUCCIÓN)
app.get('/share-product', async (req, res) => {
  try {
    const productId = req.query.productId as string;
    const storeId = req.query.store as string;
    
    console.log('🔍 Share-product SSR request:', { productId, storeId });

    if (!productId || !storeId) {
      return res.redirect('/');
    }

    const productIdInt = parseInt(productId);
    const storeIdInt = parseInt(storeId);

    let product: any = null;
    let store: any = null;

    try {
      const tenantStorage = await storageFactory.getTenantStorage(storeIdInt);
      product = await tenantStorage.getProductById(productIdInt);
      store = await masterStorage.getVirtualStore(storeIdInt);
    } catch (error) {
      console.error('Error fetching product for SSR:', error);
      return res.redirect('/');
    }

    if (!product || !store) {
      return res.redirect('/');
    }

    let productImage = 'https://via.placeholder.com/1200x630/25D366/FFFFFF?text=Producto';
    if (product.images && product.images.length > 0) {
      productImage = product.images[0];
    } else if (product.imageUrl) {
      productImage = product.imageUrl;
    }

    if (!productImage.startsWith('http')) {
      const baseUrl = process.env.RAILWAY_STATIC_URL || 
                     `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` ||
                     req.protocol + '://' + req.get('host');
      productImage = `${baseUrl}${productImage}`;
    }

    const formatPrice = (price: string | number, currency: string = 'DOP') => {
      const numPrice = typeof price === 'string' ? parseFloat(price) : price;
      
      // ✅ Siempre convertir a DOP para preview de WhatsApp
      let priceInDOP = numPrice;
      
      // Si el producto está en USD, convertir a DOP
      if (currency === 'USD') {
        // Tasa de cambio: 1 USD = ~60 DOP (ajustar según tu tasa actual)
        const exchangeRate = 60; // TODO: Obtener de la base de datos o API
        priceInDOP = numPrice * exchangeRate;
      }
      
      return new Intl.NumberFormat('es-DO', {
        style: 'currency',
        currency: 'DOP',
      }).format(priceInDOP);
    };

    const productPrice = formatPrice(product.price, product.baseCurrency || product.base_currency || 'DOP');
    const productUrl = `${req.protocol}://${req.get('host')}/share-product?productId=${productId}&store=${storeId}`;
    
    // Escapar caracteres HTML
    const escapeHtml = (text: string) => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const safeProductName = escapeHtml(product.name);
    const safeProductDesc = escapeHtml(product.description || `${product.name} - ${productPrice}`);
    const safeStoreName = escapeHtml(store.name);

    // En producción, leer el index.html compilado
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction) {
      // Leer el index.html del build
      const fs = await import('fs');
      const path = await import('path');
      const indexPath = path.join(process.cwd(), 'dist', 'public', 'index.html');
      
      let html = fs.readFileSync(indexPath, 'utf-8');
      
      // Inyectar meta tags en el <head>
      const metaTags = `
  <title>${safeProductName} - Comprar Ahora</title>
  <meta name="description" content="${safeProductDesc}">
  <meta property="og:type" content="product">
  <meta property="og:url" content="${productUrl}">
  <meta property="og:title" content="${safeProductName}">
  <meta property="og:description" content="${safeProductName} - ${productPrice}">
  <meta property="og:image" content="${productImage}">
  <meta property="og:image:secure_url" content="${productImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${safeProductName}">
  <meta property="og:site_name" content="${safeStoreName}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${productUrl}">
  <meta name="twitter:title" content="${safeProductName}">
  <meta name="twitter:description" content="${safeProductName} - ${productPrice}">
  <meta name="twitter:image" content="${productImage}">
      `;
      
      html = html.replace('</head>', `${metaTags}</head>`);
      
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    }

    // Desarrollo: HTML simple que carga Vite
    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeProductName} - Comprar Ahora</title>
  <meta name="description" content="${safeProductDesc}">
  <meta property="og:type" content="product">
  <meta property="og:url" content="${productUrl}">
  <meta property="og:title" content="${safeProductName}">
  <meta property="og:description" content="${safeProductName} - ${productPrice}">
  <meta property="og:image" content="${productImage}">
  <meta property="og:image:secure_url" content="${productImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${safeProductName}">
  <meta property="og:site_name" content="${safeStoreName}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${safeProductName}">
  <meta name="twitter:image" content="${productImage}">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
    `.trim();

    res.setHeader('Content-Type', 'text/html');
    res.send(html);

  } catch (error) {
    console.error('Error in share-product SSR:', error);
    res.redirect('/');
  }
});

    // Setup Vite or serve static files
    if (process.env.NODE_ENV === 'development') {
      await setupVite(app, server);
    } else {
      const staticPath = path.join(__dirname, '../dist/public');
      app.use(express.static(staticPath));

        
      
      app.get('*', (req, res) => {
        if (req.path.startsWith('/api/')) {
          return res.status(404).json({ error: 'API endpoint not found' });
        }
        res.sendFile(path.join(staticPath, 'index.html'));
      });
    }

  
    
    // WebSocket Server
    const wss = new WebSocketServer({ 
      server,
      handleProtocols: () => false,
      perMessageDeflate: false
    });

    wss.on('connection', (socket, req) => {
      console.log('🔌 Nueva conexión WebSocket');
      
      try {
        const url = new URL(req.url!, `http://${req.headers.host}`);
        const token = url.searchParams.get('token');

        console.log('Token recibido:', token ? `${token.substring(0, 10)}...` : 'null');

        if (token) {
          try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
            console.log('✅ Token válido para WebSocket');

            socket.send(JSON.stringify({ 
              type: 'connected', 
              message: 'WebSocket conectado exitosamente',
              timestamp: new Date().toISOString()
            }));
          } catch (jwtError: any) {
            console.log('❌ Token JWT inválido:', jwtError.message);
            socket.send(JSON.stringify({ 
              type: 'error', 
              message: 'Token inválido' 
            }));
            socket.close(1000, 'Token inválido');
            return;
          }
        } else {
          console.log('⚠️ WebSocket sin token - conexión limitada');
          socket.send(JSON.stringify({ 
            type: 'connected', 
            message: 'WebSocket conectado sin autenticación' 
          }));
        }

        socket.on('message', (data) => {
          try {
            const message = data.toString();
            console.log('📩 Mensaje WebSocket:', message);
            
            socket.send(JSON.stringify({ 
              type: 'echo', 
              data: message 
            }));
          } catch (error) {
            console.error('Error procesando mensaje WebSocket:', error);
          }
        });

        socket.on('close', (code, reason) => {
          console.log(`🔌 WebSocket cerrado - Code: ${code}, Reason: ${reason}`);
        });

        socket.on('error', (error) => {
          console.error('❌ Error WebSocket:', error.message);
        });

      } catch (error: any) {
        console.error('❌ Error configurando WebSocket:', error.message);
        try {
          socket.close(1000, 'Error de configuración');
        } catch (closeError) {
          console.error('Error cerrando socket:', closeError);
        }
      }
    });

    wss.on('error', (error) => {
      console.error('❌ Error del servidor WebSocket:', error.message);
    });

    console.log('🔌 Servidor WebSocket configurado con manejo de errores mejorado');

    const PORT = parseInt(process.env.PORT || '5000', 10);
    const HOST = '0.0.0.0';

    if (process.env.NODE_ENV !== 'test') {
  startScheduledTasks();
  startBillingCronJobs();
}

    server.listen(PORT, HOST, () => {
      log(`🚀 Server running on ${HOST}:${PORT}`);
      log(`📱 Health check available at http://${HOST}:${PORT}/api/health`);
      log(`🔌 WebSocket server ready`);
      log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      log(`✅ Storage migration applied successfully`);
      log(`🏢 Master Storage: Global operations`);
      log(`🏪 Tenant Storage: Store-specific operations`);
    });

  } catch (error) {
    console.error('Error starting application:', error);
    process.exit(1);
  }
})();


  

 


// ================================
// SCHEMA VALIDATION ENDPOINTS
// ================================

apiRouter.get('/store/schema-status', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    
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
// REPORTS/ANALYTICS ENDPOINTS (TENANT STORAGE)
// ================================

apiRouter.get('/reports', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
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

// ================================
// DEBUG TOKEN INFO ENDPOINT
// ================================

apiRouter.get('/debug/token-info', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('=== DEBUG TOKEN INFO ===');
    console.log('AuthHeader:', authHeader);
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.json({
        error: 'No token provided',
        authHeader: authHeader
      });
    }

    const token = authHeader.substring(7);
    console.log('Token:', token);
    
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    console.log('Decoded token:', decoded);
    
    const user = decoded;
    console.log('User object:', user);
    console.log('user.id:', user.id);
    console.log('user.role:', user.role);
    console.log('user.level:', user.level);
    console.log('user.username:', user.username);
    
    const condition1 = !user;
    const condition2 = user.level !== 'global';
    const condition3 = user.role !== 'super_admin';
    const overallCondition = condition1 || condition2 || condition3;
    
    console.log('Middleware checks:');
    console.log('!user:', condition1);
    console.log('user.level !== global:', condition2);
    console.log('user.role !== super_admin:', condition3);
    console.log('Overall (should fail):', overallCondition);
    
    res.json({
      success: true,
      user: user,
      middlewareChecks: {
        noUser: condition1,
        levelNotGlobal: condition2,
        roleNotSuperAdmin: condition3,
        wouldFail: overallCondition
      },
      tokenValid: true,
      jwtSecret: process.env.JWT_SECRET || 'dev-secret'
    });
    
  } catch (error) {
    console.error('Debug error:', error);
    res.json({
      error: error.message,
      jwtSecret: process.env.JWT_SECRET || 'dev-secret'
    });
  }
});

// ================================
// IMAGE UPLOAD ENDPOINTS
// ================================

apiRouter.post('/upload-image', authenticateToken, upload.single('image') as any, async (req, res) => {
  try {
    console.log('🔄 Upload image endpoint called');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const user = (req as any).user;
    console.log('📋 User:', { id: user.id, storeId: user.storeId });
    console.log('📁 File:', { 
      name: req.file.originalname, 
      size: req.file.size, 
      type: req.file.mimetype 
    });

    const storageManager = new SupabaseStorageManager(user.storeId);

    const file = {
      name: req.file.originalname,
      size: req.file.size,
      type: req.file.mimetype,
      arrayBuffer: async () => req.file!.buffer.buffer.slice(
        req.file!.buffer.byteOffset,
        req.file!.buffer.byteOffset + req.file!.buffer.byteLength
      )
    } as File;

    const imageUrl = await storageManager.uploadFile(file);
    
    console.log('✅ Image uploaded successfully:', imageUrl);
    
    res.json({ 
      success: true, 
      imageUrl: imageUrl,
      message: 'Imagen subida exitosamente'
    });

  } catch (error) {
    console.error('❌ Error uploading image:', error);
    res.status(500).json({ 
      error: 'Failed to upload image',
      message: (error as Error).message 
    });
  }
});

apiRouter.post('/process-image-url', authenticateToken, async (req, res) => {
  try {
    console.log('🔄 Process image URL endpoint called');
    
    const { imageUrl } = req.body;
    
    if (!imageUrl) {
      return res.status(400).json({ error: 'No imageUrl provided' });
    }

    const user = (req as any).user;
    console.log('📋 User:', { id: user.id, storeId: user.storeId });
    console.log('🔗 URL to process:', imageUrl);

    try {
      new URL(imageUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const storageManager = new SupabaseStorageManager(user.storeId);
    const processedImageUrl = await storageManager.uploadFromUrl(imageUrl);
    
    console.log('✅ URL processed successfully:', processedImageUrl);
    
    res.json({ 
      success: true, 
      imageUrl: processedImageUrl,
      originalUrl: imageUrl,
      message: 'URL procesada exitosamente'
    });

  } catch (error) {
    console.error('❌ Error processing image URL:', error);
    res.status(500).json({ 
      error: 'Failed to process image URL',
      message: (error as Error).message 
    });
  }
});




// Agregar al apiRouter en server/index.ts

apiRouter.get('/auth/debug-token', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('=== DEBUGGING TOKEN ===');
    console.log('AuthHeader:', authHeader);
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.json({
        error: 'No token provided',
        authHeader: authHeader
      });
    }

    const token = authHeader.substring(7);
    console.log('Token extracted:', token.substring(0, 20) + '...');
    
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    console.log('Token decoded:', decoded);
    
    const hasStoreId = 'storeId' in decoded;
    const isObject = typeof decoded === 'object' && decoded !== null;
    
    res.json({
      success: true,
      decoded: {
        id: decoded.id,
        username: decoded.username,
        role: decoded.role,
        storeId: decoded.storeId,
      },
      validation: {
        isObject,
        hasStoreId,
        storeIdValue: decoded.storeId,
        middlewareWouldPass: isObject && hasStoreId
      }
    });
    
  } catch (error) {
    res.json({
      error: error.message,
      step: 'JWT verification failed'
    });
  }
});

apiRouter.get('/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  const token = authHeader.substring(7);
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    
    res.setHeader('Content-Type', 'application/json');
    res.json({
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
      storeId: decoded.storeId,
    });
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

// ================================
// PUBLIC STORE ENDPOINTS
// ================================

app.get('/api/public/stores/:storeId/products', async (req, res) => {
  try {
    const storeId = parseInt(req.params.storeId);
    
    if (!storeId || isNaN(storeId)) {
      return res.status(400).json({ error: 'Valid store ID required' });
    }

    // ✅ USAR MASTER STORAGE PARA VERIFICAR TIENDA
    const store = await masterStorage.getVirtualStore(storeId);
    
    if (!store || !store.isActive) {
      return res.status(404).json({ error: 'Store not found or inactive' });
    }

    // ✅ USAR TENANT STORAGE PARA PRODUCTOS
    const tenantStorage = await storageFactory.getTenantStorage(storeId);
    const products = await tenantStorage.getAllProducts();
    const activeProducts = products.filter((product: any) => product.isActive !== false);
    
    res.json(activeProducts);
  } catch (error) {
    console.error('Error fetching public products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.get('/api/public/stores/:storeId/products/:productId', async (req, res) => {
  try {
    const storeId = parseInt(req.params.storeId);
    const productId = parseInt(req.params.productId);
    
    console.log(`📦 [PUBLIC] Getting product ${productId} from store ${storeId}`);
    
    if (!storeId || isNaN(storeId) || !productId || isNaN(productId)) {
      return res.status(400).json({ error: 'Valid store ID and product ID required' });
    }

    // ✅ VERIFICAR TIENDA (igual que el endpoint existente)
    const store = await masterStorage.getVirtualStore(storeId);
    
    if (!store || !store.isActive) {
      console.log('❌ [PUBLIC] Store not found or inactive:', storeId);
      return res.status(404).json({ error: 'Store not found or inactive' });
    }

    console.log(`✅ [PUBLIC] Store found: ${store.name}`);

    // ✅ OBTENER PRODUCTO (igual que el endpoint existente)
    const tenantStorage = await storageFactory.getTenantStorage(storeId);
    const product = await tenantStorage.getProductById(productId);
    
    if (!product) {
      console.log('❌ [PUBLIC] Product not found:', productId);
      return res.status(404).json({ error: 'Product not found' });
    }

    console.log(`🔍 [PUBLIC] Product found: ${product.name}`);
    console.log(`🔍 [PUBLIC] Product isActive:`, product.isActive);
    console.log(`🔍 [PUBLIC] Product is_active:`, product.is_active);

    // ✅ FILTRO IGUAL AL ENDPOINT EXISTENTE: isActive !== false
    // Esto permite productos con isActive = true o isActive = undefined/null
    if (product.isActive === false || product.is_active === false) {
      console.log('❌ [PUBLIC] Product not active:', productId);
      return res.status(404).json({ error: 'Product not available' });
    }

    console.log(`✅ [PUBLIC] Returning product:`, product.name);
    
    // Devolver producto con mapeo de campos
    res.json({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      baseCurrency: product.baseCurrency || product.base_currency,
      currency: product.baseCurrency || product.base_currency || 'DOP',
      category: product.category,
      brand: product.brand,
      model: product.model,
      sku: product.sku,
      images: product.images || [],
      imageUrl: product.imageUrl || product.image_url,
      stockQuantity: product.stockQuantity || product.stock_quantity || product.stock || 0,
      availability: product.availability || 'in_stock',
      isActive: product.isActive !== undefined ? product.isActive : product.is_active
    });
    
  } catch (error) {
    console.error('❌ [PUBLIC] Error getting product:', error);
    res.status(500).json({ 
      error: 'Failed to fetch product',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ✅ NUEVO ENDPOINT: Buscar productos por SKU
app.get('/api/public/stores/:storeId/products/search', async (req, res) => {
  try {
    const storeId = parseInt(req.params.storeId);
    const { sku, name, category } = req.query;

    if (!storeId || isNaN(storeId)) {
      return res.status(400).json({ error: 'Valid store ID required' });
    }

    // ✅ VERIFICAR TIENDA
    const store = await masterStorage.getVirtualStore(storeId);

    if (!store || !store.isActive) {
      return res.status(404).json({ error: 'Store not found or inactive' });
    }

    // ✅ OBTENER TODOS LOS PRODUCTOS
    const tenantStorage = await storageFactory.getTenantStorage(storeId);
    const allProducts = await tenantStorage.getAllProducts();

    // ✅ FILTRAR POR ESTADO ACTIVO
    let filteredProducts = allProducts.filter((product: any) => product.isActive !== false);

    // ✅ FILTRAR POR SKU (búsqueda insensible a mayúsculas)
    if (sku) {
      const skuLower = (sku as string).toLowerCase().trim();
      filteredProducts = filteredProducts.filter((product: any) =>
        product.sku && product.sku.toLowerCase().includes(skuLower)
      );
    }

    // ✅ FILTRAR POR NOMBRE (búsqueda insensible a mayúsculas)
    if (name) {
      const nameLower = (name as string).toLowerCase().trim();
      filteredProducts = filteredProducts.filter((product: any) =>
        product.name && product.name.toLowerCase().includes(nameLower)
      );
    }

    // ✅ FILTRAR POR CATEGORÍA
    if (category) {
      filteredProducts = filteredProducts.filter((product: any) =>
        product.category === category
      );
    }

    console.log(`🔍 [SEARCH] Found ${filteredProducts.length} products with SKU: ${sku} in store ${storeId}`);

    res.json(filteredProducts);
  } catch (error) {
    console.error('Error searching products:', error);
    res.status(500).json({
      error: 'Failed to search products',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/public/stores/:storeId/categories', async (req, res) => {
  try {
    const storeId = parseInt(req.params.storeId);
    
    if (!storeId || isNaN(storeId)) {
      return res.status(400).json({ error: 'Valid store ID required' });
    }

    const store = await masterStorage.getVirtualStore(storeId);
    
    if (!store || !store.isActive) {
      return res.status(404).json({ error: 'Store not found or inactive' });
    }

    const tenantStorage = await storageFactory.getTenantStorage(storeId);
    const categories = await tenantStorage.getAllCategories();
    
    res.json(categories);
  } catch (error) {
    console.error('Error fetching public categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.get('/api/public/stores/:storeId/info', async (req, res) => {
  try {
    const storeId = parseInt(req.params.storeId);
    
    if (!storeId || isNaN(storeId)) {
      return res.status(400).json({ error: 'Valid store ID required' });
    }

    // ✅ USAR MASTER STORAGE
    const store = await masterStorage.getVirtualStore(storeId);
    
    if (!store || !store.isActive) {
      return res.status(404).json({ error: 'Store not found or inactive' });
    }

    const publicInfo = {
      id: store.id,
      name: store.name,
      description: store.description,
      domain: store.domain,
      phone: store.whatsappNumber,
      address: store.address,
      logoUrl: store.logo,
      timezone: store.timezone,
      currency: store.currency,
      isActive: store.isActive
    };
    
    res.json(publicInfo);
  } catch (error) {
    console.error('Error fetching public store info:', error);
    res.status(500).json({ error: 'Failed to fetch store info' });
  }
});

app.get('/api/public/stores/:storeId/catalog-config', async (req, res) => {
  try {
    const storeId = parseInt(req.params.storeId);
    
    if (!storeId || isNaN(storeId)) {
      return res.status(400).json({ error: 'Valid store ID required' });
    }

    const store = await masterStorage.getVirtualStore(storeId);
    
    if (!store || !store.isActive) {
      return res.status(404).json({ error: 'Store not found or inactive' });
    }

    const catalogConfig = {
      storeName: store.name,
      whatsappNumber: store.whatsappNumber,
      showPrices: true,
      allowOrders: true,
      currency: store.currency || 'MXN',
      timezone: store.timezone || 'America/Mexico_City'
    };
    
    res.json(catalogConfig);
  } catch (error) {
    console.error('Error fetching catalog config:', error);
    res.status(500).json({ error: 'Failed to fetch catalog config' });
  }
});


app.get('/api/public/orders/:storeId/:orderId', async (req, res) => {
  try {
    const storeId = parseInt(req.params.storeId);
    const orderId = parseInt(req.params.orderId);

    if (isNaN(orderId) || isNaN(storeId)) {
      return res.status(400).json({ error: 'Invalid store or order ID' });
    }

    const tenantStorage = await getTenantStorage(storeId);
    const order = await tenantStorage.getOrderById(orderId);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Enriquecer con customer y items
    const customer = order.customerId ? await tenantStorage.getCustomerById(order.customerId) : null;
    const assignedUser = order.assignedUserId ? await tenantStorage.getUserById(order.assignedUserId).catch(() => null) : null;
    const items = tenantStorage.getOrderItems
      ? await tenantStorage.getOrderItemsByOrderId(order.id)
      : [];

    const enrichedOrder = {
      ...order,
     
      assignedUser: assignedUser
        ? {
            id: assignedUser.id,
            name: assignedUser.name,
            role: assignedUser.role
          }
        : null,
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
      totalItems: items.length,
      priority: order.priority || 'normal'
    };

    res.json(enrichedOrder);
  } catch (error) {
    console.error('❌ Error in public order endpoint:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});



// Asignar perfil a usuario
apiRouter.post('/users/:id/assign-profile', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { employeeProfileId } = req.body;
    const user = (req as any).user;
    const tenantStorage = await getTenantStorageWithSchema(user);
    
    const updated = await tenantStorage.assignProfileToUser(userId, employeeProfileId);
    res.json(updated);
  } catch (error) {
    console.error('Error assigning profile:', error);
    res.status(500).json({ error: 'Failed to assign profile' });
  }
});
// ================================
// AUTO RESPONSES ENDPOINTS (MASTER STORAGE)
// ================================

apiRouter.get('/store-responses', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user; 
    
    console.log(`🔍 Fetching store-responses for store: ${user.storeId}`);
    
    // ✅ USAR TENANT STORAGE en lugar de master storage
    const tenantStorage = await getTenantStorageWithSchema(user);
    let responses = await tenantStorage.getAllAutoResponses();
    
    console.log(`📋 Found ${responses.length} auto-responses`);
    
    // Si no hay respuestas, crear las por defecto
    if (responses.length === 0) {
      console.log(`⚠️ No responses found for store ${user.storeId}, creating defaults...`);
      await tenantStorage.createDefaultAutoResponses();
      responses = await tenantStorage.getAllAutoResponses();
      console.log(`✅ Created ${responses.length} default responses`);
    }
    
    res.setHeader('Content-Type', 'application/json');
    res.json(responses);
  } catch (error) {
    console.error('Error fetching store-responses:', error);
    res.status(500).json({ error: 'Failed to fetch store-responses', details: error.message });
  }
});

apiRouter.post('/store-responses', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const jwt = await import('jsonwebtoken');
    const payload = jwt.default.verify(token, process.env.JWT_SECRET || 'dev-secret') as AuthUser;
    
    const data = {
      ...req.body,
      storeId: payload.storeId
    };
    
    const response = await masterStorage.createAutoResponse(data);
    res.setHeader('Content-Type', 'application/json');
    res.status(201).json(response);
  } catch (error) {
    console.error('Error creating auto-response:', error);
    res.status(500).json({ error: 'Failed to create auto-response' });
  }
});

apiRouter.put('/store-responses/:id', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const jwt = await import('jsonwebtoken');
    const payload = jwt.default.verify(token, process.env.JWT_SECRET || 'dev-secret') as AuthUser;
    
    const id = parseInt(req.params.id);
    const response = await masterStorage.updateAutoResponse(id, req.body, payload.storeId);
    
    res.setHeader('Content-Type', 'application/json');
    res.json(response);
  } catch (error) {
    console.error('Error updating auto-response:', error);
    res.status(500).json({ error: 'Failed to update auto-response' });
  }
});

apiRouter.delete('/store-responses/:id', authenticateToken, async (req, res) => {
  try {
    const user = req.user as AuthUser;
    const id = parseInt(req.params.id);
    await masterStorage.deleteAutoResponse(id, user.storeId);

    res.setHeader('Content-Type', 'application/json');
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting auto-response:', error);
    res.status(500).json({ error: 'Failed to delete auto-response' });
  }
});

apiRouter.post('/store-responses/reset-defaults', async (req, res) => {
  try {
    const authHeader = Array.isArray(req.headers.authorization)
      ? req.headers.authorization[0]
      : req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as AuthUser;

    await masterStorage.resetAutoResponsesToDefault(payload.storeId!);
    res.json({ success: true, message: 'Auto-responses reset to defaults' });
  } catch (error) {
    console.error('Error resetting auto-responses:', error);
    res.status(500).json({ error: 'Failed to reset auto-responses' });
  }
});

// ================================
// SUPER ADMIN WHATSAPP MANAGEMENT (MASTER STORAGE)
// ================================

apiRouter.get('/super-admin/whatsapp-configs', async (req, res) => {
  try {
    const configs = await masterStorage.getAllWhatsAppConfigs();
    const stores = await masterStorage.getAllVirtualStores();
    
    const enrichedConfigs = configs.map(config => ({
      ...config,
      storeName: stores.find(store => store.id === config.storeId)?.name || `Tienda ${config.storeId}`
    }));
    
    res.json(enrichedConfigs);
  } catch (error) {
    console.error("Error getting WhatsApp configs:", error);
    res.status(500).json({ error: "Error al obtener configuraciones de WhatsApp" });
  }
});

apiRouter.post('/super-admin/whatsapp-configs', async (req, res) => {
  try {
    const { z } = await import('zod');
    const configData = z.object({
      storeId: z.number(),
      accessToken: z.string().min(1, "Token de acceso requerido"),
      phoneNumberId: z.string().min(1, "Phone Number ID requerido"),
      webhookVerifyToken: z.string().min(1, "Webhook verify token requerido"),
      businessAccountId: z.string().optional(),
      appId: z.string().optional(),
      isActive: z.boolean().default(true)
    }).parse(req.body);

    const config = await masterStorage.updateWhatsAppConfig(configData, configData.storeId);
    res.json({ success: true, config });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: "Datos de configuración inválidos", details: error.errors });
    }
    console.error("Error creating WhatsApp config:", error);
    res.status(500).json({ error: "Error al crear configuración de WhatsApp" });
  }
});

apiRouter.put('/super-admin/whatsapp-configs/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { z } = await import('zod');
    const configData = z.object({
      storeId: z.number(),
      accessToken: z.string().min(1, "Token de acceso requerido"),
      phoneNumberId: z.string().min(1, "Phone Number ID requerido"),
      webhookVerifyToken: z.string().min(1, "Webhook verify token requerido"),
      businessAccountId: z.string().optional(),
      appId: z.string().optional(),
      isActive: z.boolean().default(true)
    }).parse(req.body);

    const config = await masterStorage.updateWhatsAppConfigById(id, configData);
    res.json({ success: true, config });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: "Datos de configuración inválidos", details: error.errors });
    }
    console.error("Error updating WhatsApp config:", error);
    res.status(500).json({ error: "Error al actualizar configuración de WhatsApp" });
  }
});

apiRouter.delete('/super-admin/whatsapp-configs/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const success = await masterStorage.deleteWhatsAppConfig(id);
    
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Configuración no encontrada" });
    }
  } catch (error) {
    console.error("Error deleting WhatsApp config:", error);
    res.status(500).json({ error: "Error al eliminar configuración de WhatsApp" });
  }
});

apiRouter.post('/super-admin/whatsapp-test', async (req, res) => {
  try {
    const { storeId } = req.body;
    
    const config = await masterStorage.getWhatsAppConfig(storeId);
    
    if (!config) {
      return res.json({
        success: false,
        error: "NO_CONFIG",
        message: "No se encontró configuración de WhatsApp para esta tienda"
      });
    }

    const missingFields = [];
    if (!config.accessToken) missingFields.push("accessToken");
    if (!config.phoneNumberId) missingFields.push("phoneNumberId");
    
    if (missingFields.length > 0) {
      return res.json({
        success: false,
        error: "MISSING_CREDENTIALS",
        message: "Faltan credenciales obligatorias",
        missingFields
      });
    }

    res.json({
      success: true,
      message: "Configuración válida",
      details: {
        storeId,
        phoneNumberId: config.phoneNumberId,
        hasToken: !!config.accessToken,
        hasBusinessAccountId: !!config.businessAccountId,
        isActive: config.isActive
      }
    });
  } catch (error) {
    console.error("Error testing WhatsApp config:", error);
    res.status(500).json({ error: "Error al probar configuración" });
  }
});

apiRouter.get('/super-admin/stores', async (req, res) => {
  try {
    const stores = await masterStorage.getAllVirtualStores();
    res.json(stores);
  } catch (error) {
    console.error("Error getting stores:", error);
    res.status(500).json({ error: "Error al obtener tiendas" });
  }
});

// ================================
// WHATSAPP LOGS ENDPOINTS (MASTER STORAGE)
// ================================

apiRouter.get('/whatsapp/logs', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    
    const { limit = 50, offset = 0, type, phoneNumber, status } = req.query;
    
    const filters = {
      type: type ? String(type) : undefined,
      phoneNumber: phoneNumber ? String(phoneNumber) : undefined,
      status: status ? String(status) : undefined,
    };
    
    let logs;
    if (user.level === 'global') {
      logs = await masterStorage.getAllWhatsAppLogs(
        parseInt(String(limit)), 
        parseInt(String(offset)), 
        filters
      );
    } else {
      logs = await masterStorage.getWhatsAppLogs(
        user.storeId,
        parseInt(String(limit)), 
        parseInt(String(offset)), 
        filters
      );
    }
    
    res.setHeader('Content-Type', 'application/json');
    res.json({
      success: true,
      logs,
      pagination: {
        limit: parseInt(String(limit)),
        offset: parseInt(String(offset)),
        total: logs.length
      }
    });
  } catch (error) {
    console.error('Error getting WhatsApp logs:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error al obtener logs de WhatsApp' 
    });
  }
});

apiRouter.get('/whatsapp/logs/stats', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    
    let stats;
    if (user.level === 'global') {
      stats = await masterStorage.getWhatsAppLogStats();
    } else {
      stats = await masterStorage.getWhatsAppLogStats(user.storeId);
    }
    
    res.setHeader('Content-Type', 'application/json');
    res.json({
      success: true,
      stats: {
        total: stats.total || 0,
        success: stats.success || 0,
        errors: stats.errors || 0,
        today: stats.today || 0,
        thisWeek: stats.thisWeek || 0,
        thisMonth: stats.thisMonth || 0
      }
    });
  } catch (error) {
    console.error('Error getting WhatsApp log stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error al obtener estadísticas de logs' 
    });
  }
});

apiRouter.delete('/whatsapp/logs/cleanup', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    
    if (user.level !== 'global' || user.role !== 'super_admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Super admin access required' 
      });
    }
    
    const { days = 30 } = req.body;
    
    const deletedCount = await masterStorage.cleanupOldWhatsAppLogs(parseInt(String(days)));
    
    res.setHeader('Content-Type', 'application/json');
    res.json({
      success: true,
      message: `${deletedCount} logs eliminados`,
      deletedCount
    });
  } catch (error) {
    console.error('Error cleaning up WhatsApp logs:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error al limpiar logs antiguos' 
    });
  }
});

// ================================
// CONVERSATIONS ENDPOINTS (MASTER STORAGE)
// ================================

// MOVED TO routes.ts - Endpoint moved to avoid conflicts
  // apiRouter.get('/conversations', authenticateToken, async (req, res) => {
/*   try {
    const user = (req as any).user;
    const conversations = await masterStorage.getAllConversations(user.storeId);
    res.json(conversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
}); */

// MOVED TO routes.ts - Endpoint moved to avoid conflicts
  // apiRouter.get('/conversations/:id', authenticateToken, async (req, res) => {
/*   try {
    const id = parseInt(req.params.id);
    const conversation = await masterStorage.getConversation(id);
    
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    res.json(conversation);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
}); */

// ================================
// PRODUCTS ENDPOINTS (TENANT STORAGE)
// ================================

apiRouter.get('/products', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    
    // 🔍 DEBUGGING
    console.log('🔍 === PRODUCTS ENDPOINT DEBUG ===');
    console.log('👤 User from JWT:', {
      id: user.id,
      username: user.username,
      storeId: user.storeId,
      role: user.role
    });
    
    // ✅ Usar la función importada con debugging
  
    const tenantStorage = await getTenantStorageWithSchema(user);
    console.log('✅ Tenant storage obtained successfully');
    
    console.log('📦 Calling getAllProducts()...');
    const products = await tenantStorage.getAllProducts();
    
    console.log('✅ Products retrieved:', {
      count: products.length,
      sampleProduct: products[0] ? {
        id: products[0].id,
        name: products[0].name,
        // Verificar si tiene storeId en los datos
        hasStoreId: 'storeId' in products[0],
        storeId: products[0].storeId || 'NO_STORE_ID'
      } : 'No products found'
    });
    
    res.json(products);
  } catch (error) {
    console.error('❌ Error in products endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to fetch products',
      details: error.message 
    });
  }
});

apiRouter.get('/products/:id', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const id = parseInt(req.params.id);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    const product = await tenantStorage.getProductById(id);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// En index.ts, reemplaza el endpoint POST /products:

apiRouter.post('/products', authenticateToken, async (req, res) => {
  try {
    console.log('🔄 POST /api/products called');
    
    const user = (req as any).user;
    console.log('📋 User info:', { id: user.id, storeId: user.storeId });
    
    if (!user.storeId) {
      return res.status(403).json({ 
        error: 'Store ID is required' 
      });
    }

    // Validar nombre del producto
    if (!req.body.name || req.body.name.trim() === '') {
      return res.status(400).json({ 
        error: 'Product name is required'
      });
    }

    const tenantStorage = await getTenantStorageWithSchema(user);

    // ✅ ASIGNAR STOREID AUTOMÁTICAMENTE
    const productData = {
      ...req.body,
      storeId: user.storeId,  // ← CRÍTICO: Asignar storeId del usuario
      name: req.body.name.trim(),
      description: req.body.description || '',
      price: req.body.price || '0.00',
      category: req.body.category || 'general',
      status: req.body.status || 'active',
      stockQuantity: parseInt(req.body.stockQuantity) || 0,
      minQuantity: parseInt(req.body.minQuantity) || 1,
      isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : true
    };

    console.log('✅ Creating product with storeId:', productData.storeId);

    const product = await tenantStorage.createProduct(productData);
    
    res.status(201).json(product);
  } catch (error) {
    console.error('❌ Error creating product:', error);
    res.status(500).json({ 
      error: 'Failed to create product',
      message: error.message 
    });
  }
});

apiRouter.put('/products/:id', authenticateToken, async (req, res) => {
  try {
    console.log('🔄 PUT /products/:id called');
    
    const user = (req as any).user;
    const id = parseInt(req.params.id);
    
    console.log('📋 Update product request:', { 
      productId: id, 
      userId: user.id, 
      storeId: user.storeId,
      bodyKeys: Object.keys(req.body)
    });

    const tenantStorage = await getTenantStorageWithSchema(user);
    const updateData = { ...req.body };

    // ✅ NORMALIZE ARRAY FIELDS - features, tags, images must be arrays for Drizzle
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

    // Process images with URL validation
    if (updateData.images !== undefined) {
      console.log('🖼️ Processing images:', updateData.images);
      const normalizedImages = normalizeArrayField(updateData.images);
      
      const validUrls = normalizedImages.filter(url => {
        try {
          new URL(url);
          return true;
        } catch {
          console.warn('⚠️ Invalid image URL:', url);
          return false;
        }
      });

      updateData.images = validUrls;
      console.log('✅ Valid image URLs:', validUrls.length);
    }

    // Normalize features and tags arrays
    if (updateData.features !== undefined) {
      updateData.features = normalizeArrayField(updateData.features);
      console.log('✅ Normalized features:', updateData.features.length);
    }
    
    if (updateData.tags !== undefined) {
      updateData.tags = normalizeArrayField(updateData.tags);
      console.log('✅ Normalized tags:', updateData.tags.length);
    }

    // ✅ SANITIZE NUMERIC FIELDS - convert empty strings to null
    const numericFields = ['loyaltyPointsValue', 'salePrice', 'weight', 'price', 'installationCost'];
    for (const field of numericFields) {
      if (updateData[field] !== undefined) {
        if (updateData[field] === '' || updateData[field] === null) {
          delete updateData[field]; // Remove empty numeric fields
        } else if (typeof updateData[field] === 'string' && updateData[field].trim() === '') {
          delete updateData[field];
        }
      }
    }

    // ✅ SANITIZE INTEGER FIELDS - convert empty strings to null
    const integerFields = ['stockQuantity', 'minQuantity', 'maxQuantity', 'warrantyMonths'];
    for (const field of integerFields) {
      if (updateData[field] !== undefined) {
        if (updateData[field] === '' || updateData[field] === null) {
          delete updateData[field];
        } else if (typeof updateData[field] === 'string') {
          const parsed = parseInt(updateData[field]);
          if (isNaN(parsed)) {
            delete updateData[field];
          } else {
            updateData[field] = parsed;
          }
        }
      }
    }

    console.log('📊 Sanitized updateData keys:', Object.keys(updateData));

    const product = await tenantStorage.updateProduct(id, updateData);
    
    if (!product) {
      console.log('❌ Product not found:', id);
      return res.status(404).json({ error: 'Product not found' });
    }

    console.log('✅ Product updated successfully:', product.id);
    res.json(product);

  } catch (error) {
    console.error('❌ Error updating product:', error);
    res.status(500).json({ 
      error: 'Failed to update product',
      message: error.message 
    });
  }
});

apiRouter.delete('/products/:id', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const id = parseInt(req.params.id);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    await tenantStorage.deleteProduct(id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// ================================
// DEBUG SUPABASE STORAGE
// ================================

apiRouter.get('/debug/supabase-storage', async (req, res) => {
  try {
    console.log('🔍 Testing Supabase Storage...');
    
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    console.log('Environment check:', {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!serviceKey,
      urlPreview: supabaseUrl ? supabaseUrl.substring(0, 50) + '...' : null
    });

    if (!supabaseUrl || !serviceKey) {
      return res.json({
        status: 'error',
        message: 'Missing Supabase environment variables',
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!serviceKey
      });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    console.log('✅ Supabase client created');

    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.error('❌ Buckets error:', bucketsError);
      return res.json({
        status: 'error',
        message: 'Failed to list buckets',
        error: bucketsError.message
      });
    }

    console.log('✅ Buckets retrieved:', buckets?.length);

    const productsBucket = buckets?.find(b => b.name === 'products');
    console.log('Products bucket found:', !!productsBucket);

    let uploadTest = null;
    try {
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x04, 0x00, 0x00, 0x00, 0xB5, 0x1C, 0x0C, 0x02, 0x00, 0x00, 0x00, 0x0B,
        0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x62, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01,
        0xE5, 0x27, 0xDE, 0xFC, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ]);
      
      const testFileName = `debug/test-${Date.now()}.png`;
      
      console.log('🔄 Testing PNG upload...');
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('products')
        .upload(testFileName, pngBuffer, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'image/png'
        });

      if (uploadError) {
        console.error('❌ Upload error:', uploadError);
        uploadTest = { success: false, error: uploadError.message };
      } else {
        console.log('✅ Upload successful:', uploadData.path);
        uploadTest = { success: true, path: uploadData.path };
        
        const { data: urlData } = supabase.storage
          .from('products')
          .getPublicUrl(uploadData.path);
        
        uploadTest.publicUrl = urlData.publicUrl;
        console.log('🔗 Public URL:', urlData.publicUrl);
        
        const { error: deleteError } = await supabase.storage
          .from('products')
          .remove([uploadData.path]);
          
        if (deleteError) {
          console.warn('⚠️ Could not delete test file:', deleteError.message);
        } else {
          console.log('🧹 Test file cleaned up');
        }
      }
    } catch (error) {
      console.error('❌ Upload test error:', error);
      uploadTest = { success: false, error: error.message };
    }

    const result = {
      status: 'success',
      timestamp: new Date().toISOString(),
      config: {
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!serviceKey,
        urlPreview: supabaseUrl ? supabaseUrl.substring(0, 50) + '...' : null
      },
      buckets: buckets?.map(b => ({ 
        name: b.name, 
        public: b.public,
        created_at: b.created_at 
      })) || [],
      productsBucket: productsBucket ? {
        name: productsBucket.name,
        public: productsBucket.public,
        created_at: productsBucket.created_at
      } : null,
      uploadTest
    };

    console.log('📊 Final result:', result);
    res.json(result);

  } catch (error) {
    console.error('💥 Supabase debug error:', error);
    res.json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ================================
// CUSTOMERS ENDPOINTS - MOVED TO customer-management-routes.ts
// ================================

// ⚠️ DEPRECATED: Estos endpoints se han movido a server/routes/customer-management-routes.ts
// Los endpoints de clientes ahora incluyen loyalty balance, customer types y parent customers
// NO re-habilitar estos endpoints duplicados

// apiRouter.get('/customers') - Ver customer-management-routes.ts
// apiRouter.post('/customers') - Ver customer-management-routes.ts
// apiRouter.put('/customers/:id') - Ver customer-management-routes.ts
// apiRouter.delete('/customers/:id') - Ver customer-management-routes.ts

// ================================
// METRICS & DASHBOARD (MASTER STORAGE)
// ================================

apiRouter.get('/metrics', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const metrics = await masterStorage.getDashboardMetrics(user.storeId);
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

apiRouter.get('/dashboard/metrics', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const metrics = await masterStorage.getDashboardMetrics(user.storeId);
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard metrics' });
  }
});

apiRouter.get('/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const stats = await masterStorage.getDashboardStats(user.storeId);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});


// ================================
// USERS ENDPOINTS (TENANT STORAGE)
// ================================

apiRouter.get('/users', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantStorage = await getTenantStorageWithSchema(user);
    const users = await tenantStorage.getAllUsers();
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ================================
// NOTIFICATIONS ENDPOINTS (TENANT STORAGE)
// ================================

apiRouter.get('/notifications', authenticateToken, async (req, res) => {
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

apiRouter.get('/notifications/count', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const userId = parseInt(req.query.userId as string) || user.id;
    const tenantStorage = await getTenantStorageWithSchema(user);
    const counts = await tenantStorage.getNotificationCounts(userId);
    res.json(counts);
  } catch (error) {
    console.error('Error fetching notification counts:', error);
    res.status(500).json({ error: 'Failed to fetch notification counts' });
  }
});

// ================================
// STORE SETTINGS ENDPOINTS (TENANT STORAGE)
// ================================

apiRouter.get('/settings', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    
    // Usar master storage para obtener configuración de la tienda
    const storeSettings = await masterStorage.getVirtualStore(user.storeId);
    
    if (!storeSettings) {
      return res.status(404).json({ error: 'Store not found' });
    }
    
    res.json(storeSettings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

apiRouter.put('/settings', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantStorage = await getTenantStorageWithSchema(user);
    const settings = await tenantStorage.updateStoreSettings(req.body);
    res.json(settings);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ================================
// WHATSAPP SETTINGS ENDPOINTS (MASTER STORAGE)
// ================================

apiRouter.get('/whatsapp-settings', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const config = await masterStorage.getWhatsAppConfig(user.storeId);
    res.json(config || {});
  } catch (error) {
    console.error('Error fetching WhatsApp settings:', error);
    res.status(500).json({ error: 'Failed to fetch WhatsApp settings' });
  }
});

apiRouter.put('/whatsapp-settings', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const config = await masterStorage.updateWhatsAppConfig(req.body, user.storeId);
    res.json(config);
  } catch (error) {
    console.error('Error updating WhatsApp settings:', error);
    res.status(500).json({ error: 'Failed to update WhatsApp settings' });
  }
});

// ================================
// MESSAGES ENDPOINTS (MASTER STORAGE)
// ================================

apiRouter.get('/messages', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const conversationId = req.query.conversationId as string;
    
    if (conversationId) {
      const messages = await masterStorage.getMessagesByConversation(parseInt(conversationId), user.storeId);
      res.json(messages);
    } else {
      const messages = await masterStorage.getAllMessages(user.storeId);
      res.json(messages);
    }
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

apiRouter.post('/messages', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const { conversationId, content } = req.body;
    
    const tenantStorage = await getTenantStorageWithSchema(user.storeId);
    
    // ✅ ACTIVAR MODO WEBAPP (30 minutos por defecto)
    if (conversationId) {
      await tenantStorage.switchToWebAppMode(conversationId, 30);
    
    }
    
    const message = await tenantStorage.createMessage({
      conversationId,
      content,
      senderType: 'user',
      senderId: user.id,
      isFromCustomer: false
    });
    
    res.status(201).json(message);
  } catch (error) {
    console.error('Error creating message:', error);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

// ================================
// WEBHOOK WHATSAPP ENDPOINTS
// ================================

// ⚠️ REMOVED: Duplicate webhook handlers
// These handlers were processing the same webhook twice
// The primary webhook handlers are defined in routes.ts:1499 and routes.ts:1513
// DO NOT re-add these handlers as they cause duplicate message processing

// ================================
// STORES ENDPOINTS (MASTER STORAGE)
// ================================

apiRouter.get('/stores', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    
    if (user.level === 'global') {
      const stores = await masterStorage.getAllVirtualStores();
      res.json(stores);
    } else {
      const store = await getStoreInfo(user.storeId);
      res.json(store ? [store] : []);
    }
  } catch (error) {
    console.error('Error fetching stores:', error);
    res.status(500).json({ error: 'Failed to fetch stores' });
  }
});

// ================================
// AUTO RESPONSES ALIAS ENDPOINTS
// ================================

apiRouter.get('/auto-responses', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const responses = await masterStorage.getAllAutoResponses(user.storeId);
    res.json(responses);
  } catch (error) {
    console.error('Error fetching auto-responses:', error);
    res.status(500).json({ error: 'Failed to fetch auto-responses' });
  }
});

apiRouter.post('/auto-responses', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const responseData = { ...req.body, storeId: user.storeId };
    
    const response = await masterStorage.createAutoResponse(responseData);
    res.status(201).json(response);
  } catch (error) {
    console.error('Error creating auto-response:', error);
    res.status(500).json({ error: 'Failed to create auto-response' });
  }
});

apiRouter.put('/auto-responses/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const user = (req as any).user;
    
    const response = await masterStorage.updateAutoResponse(id, req.body, user.storeId);
    res.json(response);
  } catch (error) {
    console.error('Error updating auto-response:', error);
    res.status(500).json({ error: 'Failed to update auto-response' });
  }
});

apiRouter.delete('/auto-responses/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const user = (req as any).user;

    await masterStorage.deleteAutoResponse(id, user.storeId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting auto-response:', error);
    res.status(500).json({ error: 'Failed to delete auto-response' });
  }
});

// ================================
// ASSIGNMENT RULES ENDPOINTS (MASTER STORAGE)
// ================================

apiRouter.get('/assignment-rules', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const rules = await masterStorage.getAllAssignmentRules(user.storeId);
    res.json(rules);
  } catch (error) {
    console.error('Error fetching assignment rules:', error);
    res.status(500).json({ error: 'Failed to fetch assignment rules' });
  }
});

// ================================
// CART ENDPOINTS (MASTER STORAGE)
// ================================

apiRouter.get('/cart', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const sessionId = req.query.sessionId as string;
    const userId = user.id;
    
    const cart = await masterStorage.getCart(sessionId, userId, user.storeId);
    res.json(cart);
  } catch (error) {
    console.error('Error fetching cart:', error);
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

apiRouter.post('/cart', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const { sessionId, productId, quantity } = req.body as {
      sessionId: string;
      productId: number;
      quantity: number;
    };

    await masterStorage.addToCart(sessionId, productId, quantity, user.id);
    const cart = await masterStorage.getCart(sessionId, user.id);
    res.status(201).json(cart);
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({ error: 'Failed to add to cart' });
  }
});

apiRouter.put('/cart/:id', authenticateToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const user = (req as any).user;
    
    const cartItem = await masterStorage.updateCartItem(id, req.body, user.storeId);
    if (!cartItem) {
      return res.status(404).json({ error: 'Cart item not found' });
    }
    
    res.json(cartItem);
  } catch (error) {
    console.error('Error updating cart item:', error);
    res.status(500).json({ error: 'Failed to update cart item' });
  }
});

apiRouter.delete('/cart/:productId', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user as { id: number; storeId: number };
    const sessionId = req.query.sessionId as string;
    const productId = parseInt(req.params.productId, 10);

    await masterStorage.removeFromCart(sessionId, productId, user.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing cart item:', error);
    res.status(500).json({ error: 'Failed to remove cart item' });
  }
});

// ================================
// CATEGORIES ENDPOINTS (TENANT STORAGE)
// ================================

apiRouter.get('/categories', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const tenantStorage = await getTenantStorageWithSchema(user);
    const categories = await tenantStorage.getAllCategories();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

apiRouter.get('/categories/:id', authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const id = parseInt(req.params.id);
    
    const tenantStorage = await getTenantStorageWithSchema(user);
    const category = await tenantStorage.getCategoryById(id);
    
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    res.json(category);  // ✅ CORREGIDO - Agregué "category)" para cerrar la función
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({ error: 'Failed to fetch category' });
  }
});


// Agrega este endpoint temporal a tu index.ts para probar directamente:


apiRouter.get('/test-whatsapp-token/:storeId', async (req, res) => {
  try {
    const storeId = parseInt(req.params.storeId);
    console.log(`🧪 TESTING WHATSAPP TOKEN - Store ID: ${storeId}`);
    
    // ✅ CORRECTED: Use getMasterStorage from the new architecture
    const { getMasterStorage } = await import('./storage/index.js');
    const masterStorage = await getMasterStorage();
    const config = await masterStorage.getWhatsAppConfig(storeId);
    
    if (!config) {
      return res.json({ 
        success: false, 
        error: 'No config found',
        storeId 
      });
    }
    
    console.log('📋 Config found:', {
      phoneNumberId: config.phoneNumberId,
      tokenLength: config.accessToken.length,
      tokenPreview: config.accessToken.substring(0, 20) + '...'
    });
    
    // 2. Limpiar el token
    const rawToken = config.accessToken;
    const cleanToken = rawToken.trim().replace(/\s+/g, '');
    
    // 3. Test 1: Verificar el phone number
    const testUrl = `https://graph.facebook.com/v22.0/${config.phoneNumberId}`;
    console.log('🔍 Testing URL:', testUrl);
    
    const testResponse = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    const testResult = await testResponse.json();
    console.log('📊 Test result:', testResult);
    
    // 4. Log the test result
    await masterStorage.addWhatsAppLog({
      type: testResponse.ok ? 'success' : 'error',
      phoneNumber: 'TEST_CONNECTION',
      messageContent: `Test de token para store ${storeId}`,
      status: testResponse.ok ? 'connected' : 'failed',
      storeId: storeId,
      rawData: JSON.stringify({
        testUrl,
        response: testResult,
        status: testResponse.status
      })
    });
    
    // 5. Return results
    res.json({
      success: testResponse.ok,
      storeId,
      phoneNumberId: config.phoneNumberId,
      tokenValid: testResponse.ok,
      response: testResult,
      message: testResponse.ok ? 'Token válido' : 'Token inválido o expirado'
    });
    
  } catch (error) {
    console.error('Error testing WhatsApp token:', error);
    
    // Log error if possible
    try {
      const { getMasterStorage } = await import('./storage/index.js');
      const masterStorage = await getMasterStorage();
      await masterStorage.addWhatsAppLog({
        type: 'error',
        phoneNumber: 'TEST_ERROR',
        messageContent: `Error testing token for store ${req.params.storeId}`,
        status: 'error',
        storeId: parseInt(req.params.storeId),
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        rawData: JSON.stringify({ error: error instanceof Error ? error.message : error })
      });
    } catch (logError) {
      console.error('Could not log error:', logError);
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Test failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      storeId: parseInt(req.params.storeId)
    });
  }
});

apiRouter.get('/debug-whatsapp-tokens/:storeId', async (req, res) => {
  try {
    const storeId = parseInt(req.params.storeId);
    
    const { getMasterStorage } = await import('./storage/index.js');
    const masterStorage = await getMasterStorage();
    const config = await masterStorage.getWhatsAppConfig(storeId);
    
    if (!config) {
      return res.json({ 
        success: false, 
        error: 'No config found',
        storeId 
      });
    }
    
    // Show token details for debugging
    const token = config.accessToken;
    
    res.json({
      storeId,
      phoneNumberId: config.phoneNumberId,
      tokenInfo: {
        length: token.length,
        firstChars: token.substring(0, 20),
        lastChars: token.substring(token.length - 10),
        hasSpaces: token.includes(' '),
        hasNewlines: token.includes('\n'),
        hasCarriageReturns: token.includes('\r'),
        rawToken: token // ⚠️ Remove this in production!
      },
      postmanToken: {
        expected: "EAAKHVoxT6IUBPHtaPqe...", // From your Postman screenshot
        matches: token.startsWith("EAAKHVoxT6IUBPHtaPqe")
      }
    });
    
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Add this endpoint to test the exact token from database
apiRouter.post('/debug-send-with-db-token/:storeId', async (req, res) => {
  try {
    const storeId = parseInt(req.params.storeId);
    const { phoneNumber, message } = req.body;
    
    const { getMasterStorage } = await import('./storage/index.js');
    const masterStorage = await getMasterStorage();
    const config = await masterStorage.getWhatsAppConfig(storeId);
    
    if (!config) {
      return res.status(404).json({ error: 'Config not found' });
    }
    
    // Clean the token of any potential whitespace/newlines
    const cleanToken = config.accessToken.trim().replace(/\s+/g, '');
    
    console.log('🔍 TOKEN DEBUG:', {
      original: config.accessToken,
      cleaned: cleanToken,
      length: cleanToken.length
    });
    
    const messagePayload = {
      messaging_product: "whatsapp",
      to: phoneNumber || "18494553242",
      type: "text",
      text: {
        body: message || "Debug test message"
      }
    };
    
    const response = await fetch(`https://graph.facebook.com/v22.0/${config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messagePayload)
    });
    
    const result = await response.json();
    
    res.json({
      success: response.ok,
      status: response.status,
      result,
      tokenUsed: {
        length: cleanToken.length,
        preview: cleanToken.substring(0, 30) + '...'
      }
    });
    
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
