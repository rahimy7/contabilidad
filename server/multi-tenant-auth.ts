/**
 * Sistema de autenticación multi-tenant
 * Maneja diferentes niveles de acceso según la arquitectura correcta
 * 
 * 🚨 CORRECCIÓN CRÍTICA: Super admins están en tabla `users`, NO en `system_users`
 */

import { eq } from 'drizzle-orm';
import { getTenantDb, masterDb } from './multi-tenant-db.js';
import * as schema from '../shared/schema.ts';

export interface AuthUser {
  id: number;
  username: string;
  role: string;
  storeId?: number;
  level: 'global' | 'store' | 'tenant';
}

/**
 * Determina el nivel de acceso del usuario según su rol y ubicación
 */
export function getUserAccessLevel(user: any): 'global' | 'store' | 'tenant' {
  // Usuarios globales (tabla users) - acceso a todo el sistema
  if (user.role === 'super_admin' || user.role === 'system_admin') {
    return 'global';
  }
  
  // Usuarios de tienda (tabla system_users) - acceso a administración de tienda
  if (user.role === 'store_owner' || user.role === 'store_admin') {
    return 'store';
  }
  
  // Usuarios operacionales (schemas de tienda) - acceso solo a operaciones
  if (user.role === 'technician' || user.role === 'seller' || user.role === 'admin') {
    return 'tenant';
  }
  
  return 'tenant';
}

export async function authenticateGlobalUser(username: string, password: string): Promise<AuthUser | null> {
  try {
    const [user] = await masterDb
      .select({
        id: schema.users.id,
        username: schema.users.username,
        password: schema.users.password,
        name: schema.users.name,
        role: schema.users.role,
        status: schema.users.status  // ✅ Solo columnas que existen
      })
      .from(schema.users)
      .where(eq(schema.users.username, username))
      .limit(1);

    if (!user) {
      console.log(`Global user '${username}' not found in users table`);
      return null;
    }

    // Verificar que el usuario tiene rol de super admin
    if (user.role !== 'super_admin' && user.role !== 'system_admin') {
      console.log(`User '${username}' found but role '${user.role}' is not super_admin`);
      return null;
    }

    // ✅ Verificar que el usuario está activo usando 'status' en lugar de 'isActive'
    if (user.status !== 'active') {
      console.log(`Super admin '${username}' is not active (status: ${user.status})`);
      return null;
    }

    // Verificar contraseña
    const bcrypt = await import('bcrypt');
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      console.log(`Invalid password for super admin '${username}'`);
      return null;
    }

    console.log(`✅ Super admin '${username}' authenticated successfully from users table`);
    
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      level: 'global'
    };
  } catch (error) {
    console.error('Error authenticating global user:', error);
    return null;
  }
}


export async function authenticateStoreUser(username: string, password: string): Promise<AuthUser | null> {
  try {
    const bcrypt = await import('bcrypt');
    
    const [user] = await masterDb
      .select()
      .from(schema.systemUsers)  // ← CORRECTO para store users
      .where(eq(schema.systemUsers.username, username))
      .limit(1);

    if (!user) {
      return null;
    }

    // Verificar contraseña
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      storeId: user.storeId !== null ? user.storeId : undefined,
      level: 'store' as 'store'
    };
  } catch (error) {
    console.error('Error authenticating store user:', error);
    return null;
  }
}

import { Pool } from '@neondatabase/serverless';

export async function authenticateTenantUser(
  username: string, 
  password: string, 
  storeId: number
): Promise<AuthUser | null> {
  let pool: Pool | null = null;
  
  try {
    console.log(`🔍 Attempting tenant authentication for ${username} in store ${storeId}`);
    
    // 1. Crear pool directo para evitar problemas con Drizzle
    pool = new Pool({ 
      connectionString: process.env.DATABASE_URL,
      max: 1,
      idleTimeoutMillis: 5000
    });
    
    // 2. Obtener schema de la tienda
    const storeResult = await pool.query(`
      SELECT database_url FROM virtual_stores WHERE id = $1
    `, [storeId]);
    
    if (!storeResult.rows[0]) {
      console.log(`❌ Store ${storeId} not found`);
      return null;
    }
    
    const schemaMatch = storeResult.rows[0].database_url?.match(/schema=([^&]+)/);
    if (!schemaMatch) {
      console.log(`❌ No schema found for store ${storeId}`);
      return null;
    }
    
    const schemaName = schemaMatch[1];
    console.log(`🏪 Using schema: ${schemaName}`);
    
    // 3. Buscar usuario en el schema específico
    console.log(`🔍 Executing SQL query with username: ${username}`);
    const userResult = await pool.query(`
      SELECT id, username, password, name, role, status, is_active, phone, email, department
      FROM "${schemaName}".users 
      WHERE username = $1 
      LIMIT 1
    `, [username]);
    
    console.log(`📋 Query result: ${userResult.rows.length} rows found`);
    
    if (userResult.rows.length === 0) {
      console.log(`❌ Tenant user '${username}' not found in schema '${schemaName}'`);
      return null;
    }
    
    const user = userResult.rows[0] as any;
    console.log(`👤 Found user: ${user.username}, active: ${user.is_active}`);
    
    // 4. Verificar que el usuario está activo
    if (!user.is_active) {
      console.log(`❌ Tenant user '${username}' is not active`);
      return null;
    }
    
    // 5. Verificar contraseña
    const bcrypt = await import('bcrypt');
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      console.log(`❌ Invalid password for tenant user '${username}'`);
      return null;
    }
    
    console.log(`✅ Tenant user '${username}' authenticated successfully from schema '${schemaName}'`);
    
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      storeId: storeId,
      level: 'tenant' as const
    };
    
  } catch (error) {
    console.error(`❌ Error authenticating tenant user '${username}' for store ${storeId}:`, error);
    return null;
  } finally {
    if (pool) {
      await pool.end().catch(err => 
        console.log('⚠️ Pool close warning:', err.message)
      );
    }
  }
}


export async function authenticateUser(username: string, password: string, storeId?: number): Promise<AuthUser | null> {
  console.log(`🔍 Attempting authentication for username: ${username}`);
  
  // 1. Intentar autenticación global (super admin únicamente)
  console.log('1️⃣ Trying global authentication (public schema users)...');
  let user = await authenticateGlobalUser(username, password);
  if (user) {
    console.log('✅ Global authentication successful');
    return user;
  }

  // 2. Si se proporciona storeId, buscar ÚNICAMENTE en ese esquema específico
  if (storeId) {
    console.log(`2️⃣ Trying tenant authentication for store ${storeId} ONLY...`);
    user = await authenticateTenantUser(username, password, storeId);
    if (user) {
      console.log('✅ Tenant authentication successful');
      return user;
    }
    // ❌ IMPORTANTE: Si se proporciona storeId y no se encuentra, NO buscar en otras tiendas
    console.log(`❌ User '${username}' not found in store ${storeId}. Stopping search.`);
    return null;
  }

  // 3. Si no se proporciona storeId, no buscar en tiendas (requiere storeId específico)
  console.log('3️⃣ No storeId provided. Tenant authentication requires specific store ID.');
  console.log('❌ Authentication failed - storeId required for tenant users');
  return null;
}

/**
 * Middleware para verificar permisos según nivel de acceso
 */
export function requireAccessLevel(requiredLevel: 'global' | 'store' | 'tenant') {
  return (req: any, res: any, next: any) => {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userLevel = getUserAccessLevel(user);
    
    // Global puede acceder a todo
    if (userLevel === 'global') {
      return next();
    }
    
    // Store puede acceder a store y tenant
    if (userLevel === 'store' && (requiredLevel === 'store' || requiredLevel === 'tenant')) {
      return next();
    }
    
    // Tenant solo puede acceder a tenant
    if (userLevel === 'tenant' && requiredLevel === 'tenant') {
      return next();
    }
    
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

/**
 * Middleware para verificar que el usuario pertenece a la tienda específica
 */
export function requireStoreAccess(storeId: number) {
  return (req: any, res: any, next: any) => {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Usuarios globales pueden acceder a cualquier tienda
    if (user.level === 'global') {
      return next();
    }
    
    // Usuarios de tienda y tenant deben pertenecer a la tienda específica
    if (user.storeId === storeId) {
      return next();
    }
    
    return res.status(403).json({ error: 'Access to this store denied' });
  };
}
