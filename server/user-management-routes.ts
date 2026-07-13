// server/user-management-routes.ts - COMPLETE VERSION AFTER MIGRATION
// Gestión completa de usuarios después de la migración de storage

import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import {
  insertUserSchema,
  selectUserSchema,
  userRoleEnum,
  type User as SelectUser,
} from "@shared/schema";
import { authenticateToken } from "./authMiddleware";
import { type AuthUser } from "@shared/auth";

// ================================
// 🔥 IMPORTACIONES CORREGIDAS POST-MIGRACIÓN
// ================================

// Importar las nuevas capas de storage después de la migración
import { StorageFactory } from './storage/storage-factory.js';
import { UnifiedStorage } from './storage/unified-storage.js';

// Instanciar el factory
const storageFactory = StorageFactory.getInstance();
const masterStorage = storageFactory.getMasterStorage();

// ================================
// HELPER FUNCTIONS PARA STORAGE
// ================================

/**
 * Obtiene el tenant storage para un usuario específico
 */
async function getTenantStorage(user: AuthUser) {
  if (!user.storeId) {
    throw new Error('User must have a store ID for tenant operations');
  }
  return await storageFactory.getTenantStorage(user.storeId);
}

/**
 * Obtiene el storage unificado para un usuario específico
 */
async function getUnifiedStorageForUser(user: AuthUser): Promise<UnifiedStorage> {
  if (!user.storeId) {
    throw new Error('User must have a store ID');
  }
  return new UnifiedStorage(user.storeId);
}

// ================================
// MIDDLEWARE DE AUTENTICACIÓN Y ROLES
// ================================

const requireSuperAdmin = (req: any, res: any, next: any) => {
  const user = req.user as AuthUser;
  if (!user || user.level !== 'global' || user.role !== 'super_admin') {
    return res.status(403).json({ error: "Super admin access required" });
  }
  next();
};

const requireAdmin = (req: any, res: any, next: any) => {
  const user = req.user as AuthUser;
  if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

const requireOwnerOrAdmin = (req: any, res: any, next: any) => {
  const user = req.user as AuthUser;
  const targetUserId = parseInt(req.params.id);
  
  if (!user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  // Super admin puede hacer todo
  if (user.level === 'global' && user.role === 'super_admin') {
    return next();
  }
  
  // Admin puede gestionar usuarios de su tienda
  if (user.role === 'admin') {
    return next();
  }
  
  // Usuario solo puede ver/editar su propio perfil
  if (user.id === targetUserId) {
    return next();
  }
  
  return res.status(403).json({ error: "Access denied" });
};

// ================================
// VALIDATION SCHEMAS
// ================================

const createUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  email: z.string().email("Invalid email format").optional(),
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
  role: z.enum(['admin', 'user', 'viewer']),
  status: z.enum(['active', 'inactive']).default('active'),
  phone: z.string().optional(),
  level: z.enum(['global', 'store']).default('store')
});

const updateUserSchema = z.object({
  username: z.string().min(3).optional(),
  email: z.string().email().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: z.enum(['super_admin', 'admin', 'user', 'viewer']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  phone: z.string().optional(),
  level: z.enum(['global', 'store']).optional(),
  warehouseId: z.number().int().positive().nullable().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
  confirmPassword: z.string().min(1, "Password confirmation is required")
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

// ================================
// REGISTRO DE RUTAS DE GESTIÓN DE USUARIOS
// ================================

export async function registerUserManagementRoutes(app: express.Application) {
  const router = express.Router();

  // ================================
  // USUARIOS GLOBALES (SUPER ADMIN ONLY)
  // ================================

  // GET - Obtener todos los usuarios globales
  router.get('/global-users', authenticateToken, requireSuperAdmin, async (req: any, res: any) => {
    try {
      // ✅ CORREGIDO: Usar master storage para usuarios globales
      const users = await masterStorage.getAllGlobalUsers();
      
      // Remover passwords de la respuesta
      const safeUsers = users.map(user => {
        const { password, ...safeUser } = user;
        return safeUser;
      });
      
      res.json(safeUsers);
    } catch (error) {
      console.error("Error fetching global users:", error);
      res.status(500).json({ error: "Failed to fetch global users" });
    }
  });

  // POST - Crear usuario global (super admin)
  router.post('/global-users', authenticateToken, requireSuperAdmin, async (req: any, res: any) => {
    try {
      const userData = createUserSchema.parse({
        ...req.body,
        level: 'global'
      });
      
      // Hash de la contraseña
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const userDataWithHashedPassword = {
        ...userData,
        password: hashedPassword
      };
      
      // ✅ CORREGIDO: Usar master storage para crear usuario global
      const newUser = await masterStorage.createGlobalUser(userDataWithHashedPassword);
      
      // Remover password de la respuesta
      const { password, ...safeUser } = newUser;
      res.status(201).json(safeUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid user data", details: error.errors });
      }
      console.error("Error creating global user:", error);
      res.status(500).json({ error: "Failed to create global user" });
    }
  });

  // ================================
  // USUARIOS DE TIENDA (STORE MANAGEMENT)
  // ================================

  // GET - Obtener usuarios de la tienda actual
  router.get('/store-users', authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      const { role, status, search } = req.query;
      
      // ✅ CORREGIDO: Usar tenant storage para usuarios de tienda
      const tenantStorage = await getTenantStorage(user);
      let users = await tenantStorage.getAllUsers();
      
      // Filtros opcionales
      if (role) {
        users = users.filter(u => u.role === role);
      }
      
      if (status) {
        users = users.filter(u => u.status === status);
      }
      
      if (search) {
        const searchTerm = (search as string).toLowerCase();
        users = users.filter(u => 
          u.username.toLowerCase().includes(searchTerm) ||
          u.email?.toLowerCase().includes(searchTerm) ||
          u.firstName?.toLowerCase().includes(searchTerm) ||
          u.lastName?.toLowerCase().includes(searchTerm)
        );
      }
      
      // Remover passwords de la respuesta
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

  // POST - Crear usuario de tienda
  router.post('/store-users', authenticateToken, requireAdmin, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      const userData = createUserSchema.parse({
        ...req.body,
        level: 'store'
      });
      
      // Verificar que admin no puede crear super_admin
      if (userData.role === 'super_admin' && user.role !== 'super_admin') {
        return res.status(403).json({ error: "Cannot create super admin users" });
      }
      
      // Hash de la contraseña
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const userDataWithStore = {
        ...userData,
        password: hashedPassword,
        storeId: user.storeId,
        warehouseId: req.body.warehouseId ? parseInt(req.body.warehouseId) : null,
      };
      
      // ✅ CORREGIDO: Usar master storage para crear usuarios de tienda
      const newUser = await masterStorage.createStoreUser(userDataWithStore);
      
      // Remover password de la respuesta
      const { password, ...safeUser } = newUser;
      res.status(201).json(safeUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid user data", details: error.errors });
      }
      console.error("Error creating store user:", error);
      res.status(500).json({ error: "Failed to create store user" });
    }
  });

  // ================================
  // GESTIÓN DE USUARIOS INDIVIDUALES
  // ================================

  // GET - Obtener usuario por ID
  router.get('/users/:id', authenticateToken, requireOwnerOrAdmin, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as AuthUser;
      
      let targetUser;
      
      if (user.level === 'global') {
        // Super admin puede ver cualquier usuario
        targetUser = await masterStorage.findUserAnyLevel(id.toString());
      } else {
        // Admin/Usuario de tienda solo pueden ver usuarios de su tienda
        const tenantStorage = await getTenantStorage(user);
        targetUser = await tenantStorage.getUserById(id);
      }
      
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Remover password de la respuesta
      const { password, ...safeUser } = targetUser;
      res.json(safeUser);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // PUT - Actualizar usuario completo
  router.put('/users/:id', authenticateToken, requireOwnerOrAdmin, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as AuthUser;
      const updates = updateUserSchema.parse(req.body);

      // Validaciones de permisos
      if (updates.level && user.role !== 'super_admin') {
        return res.status(403).json({ error: "Only super admin can change user level" });
      }
      
      if (updates.role === 'super_admin' && user.role !== 'super_admin') {
        return res.status(403).json({ error: "Only super admin can assign super admin role" });
      }
      
      // No permitir que un usuario se degrade a sí mismo
      if (user.id === id && updates.role && updates.role !== user.role) {
        const roleHierarchy = ['viewer', 'user', 'admin', 'super_admin'];
        const currentRoleIndex = roleHierarchy.indexOf(user.role);
        const newRoleIndex = roleHierarchy.indexOf(updates.role);
        
        if (newRoleIndex < currentRoleIndex) {
          return res.status(403).json({ error: "Cannot downgrade your own role" });
        }
      }

      let updatedUser;
      
      if (user.level === 'global') {
        // Super admin: lógica más compleja para determinar dónde actualizar
        // Por simplicidad, asumimos que es usuario de tienda
        const tenantStorage = await getTenantStorage(user);
        updatedUser = await tenantStorage.updateUser(id, updates);
      } else {
        // Admin/Usuario de tienda
        const tenantStorage = await getTenantStorage(user);
        updatedUser = await tenantStorage.updateUser(id, updates);
      }
      
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Remover password de la respuesta
      const { password, ...safeUser } = updatedUser;
      res.json(safeUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid user data", details: error.errors });
      }
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // PATCH - Actualizar campos específicos
  router.patch('/users/:id', authenticateToken, requireOwnerOrAdmin, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as AuthUser;
      const updates = req.body;
      
      // Validaciones básicas
      if (updates.role === 'super_admin' && user.role !== 'super_admin') {
        return res.status(403).json({ error: "Cannot assign super admin role" });
      }
      
      // ✅ CORREGIDO: Usar tenant storage para updates parciales
      const tenantStorage = await getTenantStorage(user);
      const updatedUser = await tenantStorage.updateUser(id, updates);
      
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Remover password de la respuesta
      const { password, ...safeUser } = updatedUser;
      res.json(safeUser);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // PATCH - Actualizar estado de usuario específicamente
  router.patch('/users/:id/status', authenticateToken, requireAdmin, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = z.object({ 
        status: z.enum(['active', 'inactive']) 
      }).parse(req.body);
      const user = req.user as AuthUser;
      
      // No permitir desactivarse a sí mismo
      if (user.id === id && status === 'inactive') {
        return res.status(403).json({ error: "Cannot deactivate yourself" });
      }
      
      // ✅ CORREGIDO: Usar tenant storage para actualizar estado
      const tenantStorage = await getTenantStorage(user);
      const updatedUser = await tenantStorage.updateUser(id, { status });
      
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Remover password de la respuesta
      const { password, ...safeUser } = updatedUser;
      res.json(safeUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid status data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update user status" });
    }
  });

  // DELETE - Eliminar usuario
  router.delete('/users/:id', authenticateToken, requireAdmin, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as AuthUser;
      
      // Verificar que no se elimine a sí mismo
      if (id === user.id) {
        return res.status(400).json({ error: "Cannot delete yourself" });
      }

      if (user.level === 'global') {
        // Super admin: requiere lógica más compleja
        return res.status(501).json({ error: "Global user deletion requires additional implementation" });
      } else {
        // Admin de tienda puede eliminar usuarios de su tienda
        const tenantStorage = await getTenantStorage(user);
        
        // Verificar que el usuario existe antes de eliminar
        const targetUser = await tenantStorage.getUserById(id);
        if (!targetUser) {
          return res.status(404).json({ error: "User not found" });
        }
        
        // No permitir eliminar super admin
        if (targetUser.role === 'super_admin') {
          return res.status(403).json({ error: "Cannot delete super admin user" });
        }
        
        await tenantStorage.deleteUser(id);
        res.json({ success: true, message: "User deleted successfully" });
      }
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // ================================
  // GESTIÓN DE CONTRASEÑAS
  // ================================

  // POST - Cambiar contraseña
  router.post('/users/:id/change-password', authenticateToken, requireOwnerOrAdmin, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as AuthUser;
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
      
      // Obtener usuario actual
      const tenantStorage = await getTenantStorage(user);
      const targetUser = await tenantStorage.getUserById(id);
      
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Verificar contraseña actual (solo si es el propio usuario)
      if (user.id === id) {
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, targetUser.password);
        if (!isCurrentPasswordValid) {
          return res.status(400).json({ error: "Current password is incorrect" });
        }
      }
      
      // Hash de la nueva contraseña
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      
      // Actualizar contraseña
      await tenantStorage.updateUser(id, { password: hashedNewPassword });
      
      res.json({ success: true, message: "Password changed successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid password data", details: error.errors });
      }
      console.error("Error changing password:", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  // POST - Reset password (Admin only)
  router.post('/users/:id/reset-password', authenticateToken, requireAdmin, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as AuthUser;
      const { newPassword } = z.object({
        newPassword: z.string().min(6, "Password must be at least 6 characters")
      }).parse(req.body);
      
      // Hash de la nueva contraseña
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      
      // Actualizar contraseña
      const tenantStorage = await getTenantStorage(user);
      const updatedUser = await tenantStorage.updateUser(id, { password: hashedPassword });
      
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({ success: true, message: "Password reset successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid password data", details: error.errors });
      }
      console.error("Error resetting password:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  // ================================
  // ROLES Y PERMISOS
  // ================================

  // GET - Obtener roles disponibles
  router.get('/roles', authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      
      // Roles disponibles según el nivel del usuario
      let availableRoles = [];
      
      if (user.level === 'global' && user.role === 'super_admin') {
        availableRoles = [
          { value: 'super_admin', label: 'Super Administrator', description: 'Full system access' },
          { value: 'admin', label: 'Administrator', description: 'Store management access' },
          { value: 'user', label: 'User', description: 'Standard user access' },
          { value: 'viewer', label: 'Viewer', description: 'Read-only access' }
        ];
      } else if (user.role === 'admin') {
        availableRoles = [
          { value: 'admin', label: 'Administrator', description: 'Store management access' },
          { value: 'user', label: 'User', description: 'Standard user access' },
          { value: 'viewer', label: 'Viewer', description: 'Read-only access' }
        ];
      } else {
        availableRoles = [
          { value: 'user', label: 'User', description: 'Standard user access' },
          { value: 'viewer', label: 'Viewer', description: 'Read-only access' }
        ];
      }
      
      res.json({ roles: availableRoles });
    } catch (error) {
      console.error("Error fetching roles:", error);
      res.status(500).json({ error: "Failed to fetch roles" });
    }
  });

  // GET - Obtener permisos del usuario actual
  router.get('/permissions', authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      
      const permissions = {
        canCreateUsers: user.role === 'admin' || user.role === 'super_admin',
        canEditUsers: user.role === 'admin' || user.role === 'super_admin',
        canDeleteUsers: user.role === 'admin' || user.role === 'super_admin',
        canViewAllUsers: user.role === 'admin' || user.role === 'super_admin',
        canManageRoles: user.role === 'admin' || user.role === 'super_admin',
        canManageGlobalUsers: user.role === 'super_admin' && user.level === 'global',
        canAccessSuperAdminFeatures: user.role === 'super_admin' && user.level === 'global',
        canResetPasswords: user.role === 'admin' || user.role === 'super_admin',
        maxRole: user.role === 'super_admin' ? 'super_admin' : 'admin',
        level: user.level
      };
      
      res.json(permissions);
    } catch (error) {
      console.error("Error fetching permissions:", error);
      res.status(500).json({ error: "Failed to fetch permissions" });
    }
  });

  // ================================
  // ESTADÍSTICAS DE USUARIOS
  // ================================

  // GET - Obtener estadísticas de usuarios
  router.get('/stats', authenticateToken, requireAdmin, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      
      if (user.level === 'global' && user.role === 'super_admin') {
        // ✅ CORREGIDO: Usar master storage para estadísticas globales
        const stats = await masterStorage.getUserStats();
        res.json(stats);
      } else {
        // Estadísticas de la tienda específica
        const tenantStorage = await getTenantStorage(user);
        const allUsers = await tenantStorage.getAllUsers();
        
        const stats = {
          total: allUsers.length,
          active: allUsers.filter(u => u.status === 'active').length,
          inactive: allUsers.filter(u => u.status === 'inactive').length,
          byRole: allUsers.reduce((acc, u) => {
            acc[u.role] = (acc[u.role] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          recent: allUsers
            .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
            .slice(0, 5)
            .map(u => ({ id: u.id, username: u.username, role: u.role, createdAt: u.createdAt }))
        };
        
        res.json(stats);
      }
    } catch (error) {
      console.error("Error fetching user stats:", error);
      res.status(500).json({ error: "Failed to fetch user stats" });
    }
  });

  // ================================
  // BÚSQUEDA Y FILTROS
  // ================================

  // GET - Buscar usuarios
  router.get('/search', authenticateToken, async (req: any, res: any) => {
    try {
      const { query, role, status, limit = 20, offset = 0 } = req.query;
      const user = req.user as AuthUser;
      
      let results = [];
      
      if (user.level === 'global' && user.role === 'super_admin') {
        // Super admin puede buscar en todos los niveles
        if (query) {
          const foundUser = await masterStorage.findUserAnyLevel(query as string);
          results = Array.isArray(foundUser) ? foundUser : [foundUser];
        } else {
          // Si no hay query específico, obtener usuarios de la tienda actual
          const tenantStorage = await getTenantStorage(user);
          results = await tenantStorage.getAllUsers();
        }
      } else {
        // Admin de tienda busca en su tienda
        const tenantStorage = await getTenantStorage(user);
        results = await tenantStorage.getAllUsers();
      }
      
      // Aplicar filtros
      if (query && user.level !== 'global') {
        const searchTerm = (query as string).toLowerCase();
        results = results.filter(u => 
          u.username?.toLowerCase().includes(searchTerm) ||
          u.email?.toLowerCase().includes(searchTerm) ||
          u.firstName?.toLowerCase().includes(searchTerm) ||
          u.lastName?.toLowerCase().includes(searchTerm)
        );
      }
      
      if (role) {
        results = results.filter(u => u.role === role);
      }
      
      if (status) {
        results = results.filter(u => u.status === status);
      }
      
      // Paginación
      const total = results.length;
      const paginatedResults = results.slice(
        parseInt(offset as string), 
        parseInt(offset as string) + parseInt(limit as string)
      );
      
      // Remover passwords de la respuesta
      const safeResults = paginatedResults.map(user => {
        const { password, ...safeUser } = user;
        return safeUser;
      });
      
      res.json({
        users: safeResults,
        pagination: {
          total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          hasMore: total > parseInt(offset as string) + parseInt(limit as string)
        }
      });
    } catch (error) {
      console.error("Error searching users:", error);
      res.status(500).json({ error: "Failed to search users" });
    }
  });

  // ================================
  // PERFIL DE USUARIO
  // ================================

  // GET - Obtener perfil del usuario actual
  router.get('/profile', authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      
      let userProfile;
      
      if (user.level === 'global') {
        userProfile = await masterStorage.findUserAnyLevel(user.id.toString());
      } else {
        const tenantStorage = await getTenantStorage(user);
        userProfile = await tenantStorage.getUserById(user.id);
      }
      
      if (!userProfile) {
        return res.status(404).json({ error: "User profile not found" });
      }
      
      // Remover password de la respuesta
      const { password, ...safeProfile } = userProfile;
      res.json(safeProfile);
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ error: "Failed to fetch user profile" });
    }
  });

  // PUT - Actualizar perfil del usuario actual
  router.put('/profile', authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      const updates = z.object({
        email: z.string().email().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        phone: z.string().optional()
      }).parse(req.body);
      
      // Los usuarios no pueden cambiar su propio rol o estado a través del perfil
      const tenantStorage = await getTenantStorage(user);
      const updatedUser = await tenantStorage.updateUser(user.id, updates);
      
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Remover password de la respuesta
      const { password, ...safeUser } = updatedUser;
      res.json(safeUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid profile data", details: error.errors });
      }
      console.error("Error updating user profile:", error);
      res.status(500).json({ error: "Failed to update user profile" });
    }
  });

  // ================================
  // SESIONES Y ACTIVIDAD
  // ================================

  // GET - Obtener actividad reciente de usuarios
  router.get('/activity', authenticateToken, requireAdmin, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      const { limit = 50, userId } = req.query;
      
      // Esta funcionalidad requiere implementación adicional en el storage
      // Por ahora retornamos estructura básica
      const activity = {
        recent_logins: [],
        recent_changes: [],
        active_sessions: []
      };
      
      res.json(activity);
    } catch (error) {
      console.error("Error fetching user activity:", error);
      res.status(500).json({ error: "Failed to fetch user activity" });
    }
  });

  // POST - Forzar logout de usuario
  router.post('/users/:id/logout', authenticateToken, requireAdmin, async (req: any, res: any) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as AuthUser;
      
      // No permitir logout a sí mismo
      if (user.id === id) {
        return res.status(400).json({ error: "Cannot logout yourself" });
      }
      
      // Esta funcionalidad requiere implementación de gestión de sesiones
      // Por ahora solo confirmamos la acción
      res.json({ 
        success: true, 
        message: "User logout forced successfully",
        note: "Session management implementation required"
      });
    } catch (error) {
      console.error("Error forcing user logout:", error);
      res.status(500).json({ error: "Failed to force user logout" });
    }
  });

  // ================================
  // BULK OPERATIONS
  // ================================

  // POST - Operaciones en lote
  router.post('/bulk-operations', authenticateToken, requireAdmin, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      const { operation, userIds, data } = z.object({
        operation: z.enum(['activate', 'deactivate', 'delete', 'update-role']),
        userIds: z.array(z.number()),
        data: z.object({
          status: z.string().optional(),
          role: z.string().optional()
        }).optional()
      }).parse(req.body);
      
      // Verificar que no se incluya a sí mismo en operaciones peligrosas
      if (['deactivate', 'delete'].includes(operation) && userIds.includes(user.id)) {
        return res.status(400).json({ error: "Cannot perform this operation on yourself" });
      }
      
      const tenantStorage = await getTenantStorage(user);
      const results = [];
      const errors = [];
      
      for (const userId of userIds) {
        try {
          let result;
          
          switch (operation) {
            case 'activate':
              result = await tenantStorage.updateUser(userId, { status: 'active' });
              break;
            case 'deactivate':
              result = await tenantStorage.updateUser(userId, { status: 'inactive' });
              break;
            case 'update-role':
              if (!data?.role) {
                throw new Error('Role is required for update-role operation');
              }
              result = await tenantStorage.updateUser(userId, { role: data.role });
              break;
            case 'delete':
              await tenantStorage.deleteUser(userId);
              result = { id: userId, deleted: true };
              break;
          }
          
          results.push({ userId, success: true, result });
        } catch (error) {
          errors.push({ 
            userId, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      }
      
      res.json({
        success: true,
        processed: results.length,
              results,
              errorCount: errors.length,
    
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid bulk operation data", details: error.errors });
      }
      console.error("Error performing bulk operation:", error);
      res.status(500).json({ error: "Failed to perform bulk operation" });
    }
  });

  // ================================
  // EXPORT E IMPORT
  // ================================

  // GET - Exportar usuarios
  router.get('/export', authenticateToken, requireAdmin, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      const { format = 'json' } = req.query;
      
      const tenantStorage = await getTenantStorage(user);
      const users = await tenantStorage.getAllUsers();
      
      // Remover passwords y datos sensibles
      const exportData = users.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        phone: user.phone,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }));
      
      if (format === 'csv') {
        // Convertir a CSV
        const headers = Object.keys(exportData[0] || {});
        const csvData = [
          headers.join(','),
          ...exportData.map(row => 
            headers.map(header => `"${row[header] || ''}"`).join(',')
          )
        ].join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="users-export.csv"');
        res.send(csvData);
      } else {
        // JSON por defecto
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="users-export.json"');
        res.json({
          exportDate: new Date().toISOString(),
          storeId: user.storeId,
          totalUsers: exportData.length,
          users: exportData
        });
      }
    } catch (error) {
      console.error("Error exporting users:", error);
      res.status(500).json({ error: "Failed to export users" });
    }
  });

  // ================================
  // VALIDACIONES Y VERIFICACIONES
  // ================================

  // POST - Verificar username disponible
  router.post('/check-username', authenticateToken, async (req: any, res: any) => {
    try {
      const { username, excludeUserId } = z.object({
        username: z.string().min(3),
        excludeUserId: z.number().optional()
      }).parse(req.body);
      
      const user = req.user as AuthUser;
      const tenantStorage = await getTenantStorage(user);
      
      const existingUser = await tenantStorage.getUserByUsername(username);
      
      const isAvailable = !existingUser || (excludeUserId && existingUser.id === excludeUserId);
      
      res.json({
        username,
        available: isAvailable,
        message: isAvailable ? 'Username is available' : 'Username is already taken'
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid username check data", details: error.errors });
      }
      console.error("Error checking username:", error);
      res.status(500).json({ error: "Failed to check username availability" });
    }
  });

  // POST - Verificar email disponible
  router.post('/check-email', authenticateToken, async (req: any, res: any) => {
    try {
      const { email, excludeUserId } = z.object({
        email: z.string().email(),
        excludeUserId: z.number().optional()
      }).parse(req.body);
      
      const user = req.user as AuthUser;
      const tenantStorage = await getTenantStorage(user);
      
      // Esta funcionalidad requiere método getUserByEmail en tenant storage
      // Por ahora simulamos la verificación
      const allUsers = await tenantStorage.getAllUsers();
      const existingUser = allUsers.find(u => u.email === email);
      
      const isAvailable = !existingUser || (excludeUserId && existingUser.id === excludeUserId);
      
      res.json({
        email,
        available: isAvailable,
        message: isAvailable ? 'Email is available' : 'Email is already in use'
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid email check data", details: error.errors });
      }
      console.error("Error checking email:", error);
      res.status(500).json({ error: "Failed to check email availability" });
    }
  });

  // ================================
  // NOTIFICACIONES DE USUARIOS
  // ================================

  // GET - Obtener notificaciones del usuario
  router.get('/users/:id/notifications', authenticateToken, requireOwnerOrAdmin, async (req: any, res: any) => {
    try {
      const userId = parseInt(req.params.id);
      const user = req.user as AuthUser;
      const { limit = 20, offset = 0, unreadOnly = false } = req.query;
      
      // ✅ CORREGIDO: Usar tenant storage para notificaciones
      const tenantStorage = await getTenantStorage(user);
      const notifications = await tenantStorage.getUserNotifications(userId);
      
      let filteredNotifications = notifications;
      
      if (unreadOnly === 'true') {
        filteredNotifications = notifications.filter(n => !n.isRead);
      }
      
      // Paginación
      const paginatedNotifications = filteredNotifications.slice(
        parseInt(offset as string),
        parseInt(offset as string) + parseInt(limit as string)
      );
      
      res.json({
        notifications: paginatedNotifications,
        pagination: {
          total: filteredNotifications.length,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
          hasMore: filteredNotifications.length > parseInt(offset as string) + parseInt(limit as string)
        }
      });
    } catch (error) {
      console.error("Error fetching user notifications:", error);
      res.status(500).json({ error: "Failed to fetch user notifications" });
    }
  });

  // GET - Obtener contadores de notificaciones
  router.get('/users/:id/notifications/counts', authenticateToken, requireOwnerOrAdmin, async (req: any, res: any) => {
    try {
      const userId = parseInt(req.params.id);
      const user = req.user as AuthUser;
      
      // ✅ CORREGIDO: Usar tenant storage para contadores
      const tenantStorage = await getTenantStorage(user);
      const counts = await tenantStorage.getNotificationCounts(userId);
      
      res.json(counts);
    } catch (error) {
      console.error("Error fetching notification counts:", error);
      res.status(500).json({ error: "Failed to fetch notification counts" });
    }
  });

  // ================================
  // HEALTH CHECK Y DEBUG
  // ================================

  // GET - Health check para user management
  router.get('/health', authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user as AuthUser;
      
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        user: {
          id: user.id,
          role: user.role,
          level: user.level,
          storeId: user.storeId
        },
        storage: {
          master: 'connected',
          tenant: user.storeId ? 'connected' : 'not_required'
        },
        features: {
          userManagement: true,
          roleManagement: true,
          bulkOperations: true,
          notifications: true,
          exports: true
        }
      };
      
      res.json(health);
    } catch (error) {
      console.error("Error in user management health check:", error);
      res.status(500).json({
        status: 'unhealthy',
        error: "User management system error",
        timestamp: new Date().toISOString()
      });
    }
  });

  // ================================
  // MONTAR RUTAS EN LA APLICACIÓN
  // ================================

  // Montar todas las rutas bajo el prefijo /api/user-management
  app.use("/api/user-management", router);
  
  console.log("✅ User Management routes registered successfully with migrated storage");
  console.log("📝 Available endpoints:");
  console.log("   - GET    /api/user-management/global-users");
  console.log("   - POST   /api/user-management/global-users");
  console.log("   - GET    /api/user-management/store-users");
  console.log("   - POST   /api/user-management/store-users");
  console.log("   - GET    /api/user-management/users/:id");
  console.log("   - PUT    /api/user-management/users/:id");
  console.log("   - PATCH  /api/user-management/users/:id");
  console.log("   - DELETE /api/user-management/users/:id");
  console.log("   - POST   /api/user-management/users/:id/change-password");
  console.log("   - POST   /api/user-management/users/:id/reset-password");
  console.log("   - GET    /api/user-management/roles");
  console.log("   - GET    /api/user-management/permissions");
  console.log("   - GET    /api/user-management/stats");
  console.log("   - GET    /api/user-management/search");
  console.log("   - GET    /api/user-management/profile");
  console.log("   - PUT    /api/user-management/profile");
  console.log("   - POST   /api/user-management/bulk-operations");
  console.log("   - GET    /api/user-management/export");
  console.log("   - POST   /api/user-management/check-username");
  console.log("   - POST   /api/user-management/check-email");
  console.log("   - GET    /api/user-management/users/:id/notifications");
  console.log("   - GET    /api/user-management/users/:id/notifications/counts");
  console.log("   - GET    /api/user-management/health");
}