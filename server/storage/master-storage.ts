// server/storage/master-storage.ts
// Implementación completa del storage para operaciones del sistema global

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, desc, and, or, count, sql, ilike, gte, lt } from "drizzle-orm";
import * as schema from "@shared/schema";
import bcrypt from 'bcrypt';

import {
  VirtualStore,
  WhatsAppSettings,
  WhatsAppLog,
  InsertWhatsAppSettings,
  InsertWhatsAppLog,
} from "@shared/schema";
import ws from "ws";

// Definir interfaces localmente para evitar conflictos
interface UserStats {
  totalGlobalUsers: number;
  totalStoreUsers: number;
  activeStoreUsers: number;
  totalUsers: number;
}

interface WhatsAppLogFilters {
  type?: string;
  phoneNumber?: string;
  status?: string;
  storeId?: number;
}

interface CreateStoreData {
  name: string;
  description: string;
  domain: string;
  isActive: boolean;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  planType?: string;
  whatsappNumber?: string;
  logo?: string;
  timezone?: string;
  currency?: string;
}

// Tipos de usuario locales
type GlobalUser = typeof schema.users.$inferSelect;
type InsertGlobalUser = typeof schema.users.$inferInsert;
type StoreUser = typeof schema.systemUsers.$inferSelect;
type InsertStoreUser = typeof schema.systemUsers.$inferInsert;

interface StoreUserListItem {
  id: number;
  username: string;
  email: string;
  role: string;
  storeId: number;
  isActive: boolean;
  createdAt: Date;
  storeName?: string;
}

if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as any).WebSocket = ws;
}

export class MasterStorageService {
  private db: any;
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    this.db = drizzle(this.pool, { schema });
  }

  // ========================================
  // VIRTUAL STORES MANAGEMENT
  // ========================================

  async getAllVirtualStores(): Promise<VirtualStore[]> {
    try {
      const stores = await this.db
        .select()
        .from(schema.virtualStores)
        .orderBy(desc(schema.virtualStores.createdAt));

      console.log(`✅ Retrieved ${stores.length} virtual stores`);
      return stores;
    } catch (error) {
      console.error('Error getting virtual stores:', error);
      return [];
    }
  }

  async getVirtualStore(storeId: number): Promise<VirtualStore | null> {
    try {
      const [store] = await this.db
        .select()
        .from(schema.virtualStores)
        .where(eq(schema.virtualStores.id, storeId));

      return store || null;
    } catch (error) {
      console.error(`Error getting virtual store ${storeId}:`, error);
      return null;
    }
  }

  async createStore(storeData: CreateStoreData): Promise<VirtualStore> {
    try {
      console.log(`[CreateStore] 📦 Received data:`, storeData);

      // Validar campos requeridos
      if (!storeData.name || !storeData.domain) {
        throw new Error('Store name and domain are required');
      }

      // Generar slug automáticamente
      const slug = (storeData.domain || storeData.name)
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

      console.log(`[CreateStore] 🔤 Generated slug: "${slug}"`);

      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) {
        throw new Error('DATABASE_URL environment variable is not set');
      }

      console.log(`[CreateStore] 🗄️ Using DATABASE_URL`);

      const storeValues = {
        name: storeData.name,
        slug: slug,
        description: storeData.description || null,
        domain: storeData.domain,
        databaseUrl: databaseUrl,
        isActive: storeData.isActive !== false,
        whatsappNumber: storeData.whatsappNumber || null,
        address: storeData.address || null,
        logo: storeData.logo || null,
        timezone: storeData.timezone || 'America/Mexico_City',
        currency: storeData.currency || 'MXN',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      console.log(`[CreateStore] 📋 Prepared values for insert`);

      const [newStore] = await this.db
        .insert(schema.virtualStores)
        .values(storeValues as any)
        .returning();

      console.log(`[CreateStore] ✅ Store created: ID=${newStore.id}, name="${newStore.name}"`);

      // Ejecutar migración automática de schema para crear tablas
      try {
        console.log(`[CreateStore] 🔄 Running schema migration for store ${newStore.id}...`);
        const { migrateStoreToSeparateSchema } = await import('../schema-migration.js');
        const migrationResult = await migrateStoreToSeparateSchema(newStore.id);
        if (migrationResult.success) {
          console.log(`[CreateStore] ✅ Schema migration completed successfully`);
          console.log(`[CreateStore] 📊 Migrated tables:`, migrationResult.migratedTables.join(', '));
        } else {
          console.warn(`[CreateStore] ⚠️ Schema migration had errors:`, migrationResult.errors);
        }
      } catch (migrationError) {
        console.error(`[CreateStore] ❌ Schema migration failed:`, migrationError instanceof Error ? migrationError.message : migrationError);
        throw new Error(`Failed to create store schema: ${migrationError instanceof Error ? migrationError.message : String(migrationError)}`);
      }

      // Intentar inicializar el tenant storage
      try {
        console.log(`[CreateStore] 🔧 Initializing tenant storage for store ${newStore.id}...`);
        const { StorageFactory } = await import('./storage-factory.js');
        const factory = StorageFactory.getInstance();
        await factory.getTenantStorage(newStore.id);
        console.log(`[CreateStore] ✅ Tenant storage initialized successfully`);
      } catch (storageError) {
        console.warn(`[CreateStore] ⚠️ Could not initialize tenant storage:`, storageError instanceof Error ? storageError.message : storageError);
      }

      return newStore;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[CreateStore] ❌ Error: ${errorMsg}`);
      throw error;
    }
  }

  async updateStore(storeId: number, updates: Partial<VirtualStore>): Promise<VirtualStore> {
    try {
      const [updatedStore] = await this.db
        .update(schema.virtualStores)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(schema.virtualStores.id, storeId))
        .returning();

      console.log(`✅ Updated virtual store: ${storeId}`);
      return updatedStore;
    } catch (error) {
      console.error('Error updating virtual store:', error);
      throw error;
    }
  }

  async deleteStore(storeId: number): Promise<boolean> {
    try {
      await this.db
        .delete(schema.virtualStores)
        .where(eq(schema.virtualStores.id, storeId));

      console.log(`✅ Deleted virtual store: ${storeId}`);
      return true;
    } catch (error) {
      console.error('Error deleting virtual store:', error);
      return false;
    }
  }

  async isStoreActive(storeId: number): Promise<boolean> {
    try {
      const store = await this.getVirtualStore(storeId);
      return store?.isActive ?? false;
    } catch (error) {
      console.error('Error checking store status:', error);
      return false;
    }
  }

  // ========================================
  // GLOBAL USERS (Super Admins)
  // ========================================

  async createGlobalUser(userData: InsertGlobalUser): Promise<GlobalUser> {
    try {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      const [newUser] = await this.db
        .insert(schema.users)
        .values({
          ...userData,
          password: hashedPassword,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      console.log(`✅ Created global user: ${newUser.username}`);
      return newUser;
    } catch (error) {
      console.error('Error creating global user:', error);
      throw error;
    }
  }

  async getGlobalUser(username: string): Promise<GlobalUser | null> {
    try {
      const [user] = await this.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, username));

      return user || null;
    } catch (error) {
      console.error('Error getting global user:', error);
      return null;
    }
  }

  async getGlobalUserById(id: number): Promise<GlobalUser | null> {
    try {
      const [user] = await this.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, id));

      return user || null;
    } catch (error) {
      console.error('Error getting global user by ID:', error);
      return null;
    }
  }

  async listGlobalUsers(): Promise<GlobalUser[]> {
    try {
      const users = await this.db
        .select()
        .from(schema.users)
        .orderBy(desc(schema.users.createdAt));

      return users;
    } catch (error) {
      console.error('Error listing global users:', error);
      return [];
    }
  }

  async updateGlobalUser(id: number, updates: Partial<InsertGlobalUser>): Promise<GlobalUser> {
    try {
      const updateData: any = {
        ...updates,
        updatedAt: new Date()
      };

      if (updates.password) {
        updateData.password = await bcrypt.hash(updates.password, 10);
      }

      const [updatedUser] = await this.db
        .update(schema.users)
        .set(updateData)
        .where(eq(schema.users.id, id))
        .returning();

      console.log(`✅ Updated global user: ${id}`);
      return updatedUser;
    } catch (error) {
      console.error('Error updating global user:', error);
      throw error;
    }
  }

  async deleteGlobalUser(id: number): Promise<boolean> {
    try {
      await this.db
        .delete(schema.users)
        .where(eq(schema.users.id, id));

      console.log(`✅ Deleted global user: ${id}`);
      return true;
    } catch (error) {
      console.error('Error deleting global user:', error);
      return false;
    }
  }

  async getGlobalUserByUsername(username: string): Promise<GlobalUser | null> {
    return this.getGlobalUser(username);
  }

  // ========================================
  // STORE USERS (Owners, Admins)
  // ========================================

  async createStoreUser(userData: InsertStoreUser): Promise<StoreUser> {
    try {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      const [newUser] = await this.db
        .insert(schema.systemUsers)
        .values({
          ...userData,
          password: hashedPassword,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      console.log(`✅ Created store user: ${newUser.username} for store ${newUser.storeId}`);
      return newUser;
    } catch (error) {
      console.error('Error creating store user:', error);
      throw error;
    }
  }

  async getStoreUser(username: string): Promise<StoreUser | null> {
    try {
      const [user] = await this.db
        .select()
        .from(schema.systemUsers)
        .where(eq(schema.systemUsers.username, username));

      return user || null;
    } catch (error) {
      console.error('Error getting store user:', error);
      return null;
    }
  }

  async getStoreUserById(id: number): Promise<StoreUser | null> {
    try {
      const [user] = await this.db
        .select()
        .from(schema.systemUsers)
        .where(eq(schema.systemUsers.id, id));

      return user || null;
    } catch (error) {
      console.error('Error getting store user by ID:', error);
      return null;
    }
  }

  async listStoreUsers(): Promise<StoreUserListItem[]> {
    try {
      const users = await this.db
        .select({
          id: schema.systemUsers.id,
          username: schema.systemUsers.username,
          email: schema.systemUsers.email,
          role: schema.systemUsers.role,
          storeId: schema.systemUsers.storeId,
          isActive: schema.systemUsers.isActive,
          createdAt: schema.systemUsers.createdAt,
          storeName: schema.virtualStores.name
        })
        .from(schema.systemUsers)
        .leftJoin(schema.virtualStores, eq(schema.systemUsers.storeId, schema.virtualStores.id))
        .orderBy(desc(schema.systemUsers.createdAt));

      return users;
    } catch (error) {
      console.error('Error listing store users:', error);
      return [];
    }
  }

  async getStoreUsersByStoreId(storeId: number): Promise<StoreUser[]> {
    try {
      const users = await this.db
        .select()
        .from(schema.systemUsers)
        .where(eq(schema.systemUsers.storeId, storeId))
        .orderBy(desc(schema.systemUsers.createdAt));

      return users;
    } catch (error) {
      console.error(`Error getting store users for store ${storeId}:`, error);
      return [];
    }
  }

  async updateStoreUser(id: number, updates: Partial<InsertStoreUser>): Promise<StoreUser> {
    try {
      const updateData: any = {
        ...updates,
        updatedAt: new Date()
      };

      if (updates.password) {
        updateData.password = await bcrypt.hash(updates.password, 10);
      }

      const [updatedUser] = await this.db
        .update(schema.systemUsers)
        .set(updateData)
        .where(eq(schema.systemUsers.id, id))
        .returning();

      console.log(`✅ Updated store user: ${id}`);
      return updatedUser;
    } catch (error) {
      console.error('Error updating store user:', error);
      throw error;
    }
  }

  async deleteStoreUser(id: number): Promise<boolean> {
    try {
      await this.db
        .delete(schema.systemUsers)
        .where(eq(schema.systemUsers.id, id));

      console.log(`✅ Deleted store user: ${id}`);
      return true;
    } catch (error) {
      console.error('Error deleting store user:', error);
      return false;
    }
  }

  // ========================================
  // USER UTILITIES
  // ========================================

  async findUserAnyLevel(username: string): Promise<{
    user: any;
    level: 'global' | 'store' | null;
    storeId?: number;
  }> {
    try {
      // Check global users first
      const globalUser = await this.getGlobalUser(username);
      if (globalUser) {
        return {
          user: globalUser,
          level: 'global'
        };
      }

      // Check store users
      const storeUser = await this.getStoreUser(username);
      if (storeUser) {
        return {
          user: storeUser,
          level: 'store',
          storeId: storeUser.storeId
        };
      }

      return {
        user: null,
        level: null
      };
    } catch (error) {
      console.error('Error finding user:', error);
      return {
        user: null,
        level: null
      };
    }
  }

  async getUserStats(): Promise<UserStats> {
    try {
      const [globalCount] = await this.db
        .select({ count: count() })
        .from(schema.users);

      const [storeCount] = await this.db
        .select({ count: count() })
        .from(schema.systemUsers);

      const [activeStoreCount] = await this.db
        .select({ count: count() })
        .from(schema.systemUsers)
        .where(eq(schema.systemUsers.isActive, true));

      return {
        totalGlobalUsers: globalCount.count || 0,
        totalStoreUsers: storeCount.count || 0,
        activeStoreUsers: activeStoreCount.count || 0,
        totalUsers: (globalCount.count || 0) + (storeCount.count || 0)
      };
    } catch (error) {
      console.error('Error getting user stats:', error);
      return {
        totalGlobalUsers: 0,
        totalStoreUsers: 0,
        activeStoreUsers: 0,
        totalUsers: 0
      };
    }
  }

  async authenticateUser(username: string, password: string, storeId?: number): Promise<any | null> {
    try {
      const userInfo = await this.findUserAnyLevel(username);
      
      if (!userInfo.user) {
        return null;
      }

      const isValid = await bcrypt.compare(password, userInfo.user.password);
      if (!isValid) {
        return null;
      }

      // For store users, validate store access if storeId is provided
      if (userInfo.level === 'store' && storeId && userInfo.storeId !== storeId) {
        return null;
      }

      return {
        id: userInfo.user.id,
        username: userInfo.user.username,
        email: userInfo.user.email,
        role: userInfo.user.role,
        level: userInfo.level,
        storeId: userInfo.storeId,
        isActive: userInfo.user.isActive
      };
    } catch (error) {
      console.error('Error authenticating user:', error);
      return null;
    }
  }

  // ========================================
  // AUTO RESPONSES METHODS
  // ========================================

  async getAllAutoResponses(storeId?: number): Promise<any[]> {
    try {
      let query = this.db.select().from(schema.autoResponses);
      
      if (storeId) {
        query = query.where(eq(schema.autoResponses.storeId, storeId));
      }
      
      const responses = await query.orderBy(desc(schema.autoResponses.createdAt));
      console.log(`✅ Retrieved ${responses.length} auto-responses for store ${storeId || 'all'}`);
      return responses;
    } catch (error) {
      console.error('Error getting auto responses:', error);
      return [];
    }
  }

  async getAutoResponse(id: number): Promise<any | null> {
    try {
      const [response] = await this.db
        .select()
        .from(schema.autoResponses)
        .where(eq(schema.autoResponses.id, id));
      
      return response || null;
    } catch (error) {
      console.error('Error getting auto response:', error);
      return null;
    }
  }

  async createAutoResponse(responseData: any): Promise<any> {
    try {
      const [newResponse] = await this.db
        .insert(schema.autoResponses)
        .values({
          ...responseData,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      console.log(`✅ Created auto response: ${newResponse.name}`);
      return newResponse;
    } catch (error) {
      console.error('Error creating auto response:', error);
      throw error;
    }
  }

  async updateAutoResponse(id: number, updates: any, storeId?: number): Promise<any | null> {
    try {
      let whereCondition = eq(schema.autoResponses.id, id);
      
      if (storeId) {
        whereCondition = and(
          eq(schema.autoResponses.id, id),
          eq(schema.autoResponses.storeId, storeId)
        );
      }
      
      const [updatedResponse] = await this.db
        .update(schema.autoResponses)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(whereCondition)
        .returning();
      
      console.log(`✅ Updated auto response: ${id}`);
      return updatedResponse || null;
    } catch (error) {
      console.error('Error updating auto response:', error);
      throw error;
    }
  }

  async deleteAutoResponse(id: number, storeId?: number): Promise<void> {
    try {
      let whereCondition = eq(schema.autoResponses.id, id);
      
      if (storeId) {
        whereCondition = and(
          eq(schema.autoResponses.id, id),
          eq(schema.autoResponses.storeId, storeId)
        );
      }
      
      await this.db
        .delete(schema.autoResponses)
        .where(whereCondition);
      
      console.log(`✅ Deleted auto response: ${id}`);
    } catch (error) {
      console.error('Error deleting auto response:', error);
      throw error;
    }
  }

  async resetAutoResponsesToDefault(storeId: number): Promise<void> {
    try {
      console.log(`🔄 Resetting auto-responses for store ${storeId}`);
      
      // Clear existing responses for this store
      await this.db
        .delete(schema.autoResponses)
        .where(eq(schema.autoResponses.storeId, storeId));
      
      // Default responses
      const defaultResponses = [
        {
          name: "Bienvenida",
          trigger: "welcome",
          messageText: "¡Hola! 👋 Bienvenido a nuestro servicio.\n\n¿En qué puedo ayudarte hoy?",
          isActive: true,
          priority: 1,
          storeId: storeId,
          menuOptions: JSON.stringify([
            { label: "Ver Productos", action: "show_products" },
            { label: "Ver Servicios", action: "show_services" },
            { label: "Hablar con Agente", action: "contact_agent" },
            { label: "Ayuda", action: "show_help" }
          ])
        },
        {
          name: "Menú Principal",
          trigger: "menu",
          messageText: "📋 *MENÚ PRINCIPAL*\n\nSelecciona una opción:",
          isActive: true,
          priority: 2,
          storeId: storeId,
          menuOptions: JSON.stringify([
            { label: "🛍️ Productos", action: "show_products" },
            { label: "🔧 Servicios", action: "show_services" },
            { label: "📞 Contactar", action: "contact_agent" },
            { label: "❓ Ayuda", action: "show_help" }
          ])
        },
        {
          name: "Mostrar Productos",
          trigger: "show_products",
          messageText: "🛍️ *NUESTROS PRODUCTOS*\n\nAquí tienes nuestra selección de productos disponibles.\n\n¿Te interesa alguno en particular?",
          isActive: true,
          priority: 3,
          storeId: storeId,
          menuOptions: JSON.stringify([
            { label: "💰 Ver Precios", action: "show_prices" },
            { label: "📋 Catálogo Completo", action: "full_catalog" },
            { label: "🔙 Menú Principal", action: "main_menu" }
          ])
        }
      ];
      
      // Insert default responses
      for (const response of defaultResponses) {
        await this.createAutoResponse(response);
      }
      
      console.log(`✅ Reset auto-responses for store ${storeId}`);
    } catch (error) {
      console.error('Error resetting auto responses:', error);
      throw error;
    }
  }

  // ========================================
  // ASSIGNMENT RULES METHODS
  // ========================================

  async getAllAssignmentRules(storeId?: number): Promise<any[]> {
    try {
      let query = this.db.select().from(schema.assignmentRules);
      
      if (storeId) {
        query = query.where(eq(schema.assignmentRules.storeId, storeId));
      }
      
      const rules = await query.orderBy(desc(schema.assignmentRules.createdAt));
      console.log(`✅ Retrieved ${rules.length} assignment rules for store ${storeId || 'all'}`);
      return rules;
    } catch (error) {
      console.error('Error getting assignment rules:', error);
      return [];
    }
  }

  async getAssignmentRule(id: number): Promise<any | null> {
    try {
      const [rule] = await this.db
        .select()
        .from(schema.assignmentRules)
        .where(eq(schema.assignmentRules.id, id));
      
      return rule || null;
    } catch (error) {
      console.error('Error getting assignment rule:', error);
      return null;
    }
  }

  async createAssignmentRule(ruleData: any): Promise<any> {
    try {
      const [newRule] = await this.db
        .insert(schema.assignmentRules)
        .values({
          ...ruleData,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      console.log(`✅ Created assignment rule: ${newRule.name || newRule.id}`);
      return newRule;
    } catch (error) {
      console.error('Error creating assignment rule:', error);
      throw error;
    }
  }

  // ========================================
  // CART METHODS
  // ========================================

  async getCart(sessionId: string, userId?: number, storeId?: number): Promise<any> {
    try {
      let whereCondition = eq(schema.shoppingCart.sessionId, sessionId);
      
      if (userId) {
        whereCondition = and(
          eq(schema.shoppingCart.sessionId, sessionId),
          eq(schema.shoppingCart.userId, userId)
        );
      }
      
      const cartItems = await this.db
        .select({
          id: schema.shoppingCart.id,
          productId: schema.shoppingCart.productId,
          quantity: schema.shoppingCart.quantity,
          sessionId: schema.shoppingCart.sessionId,
          userId: schema.shoppingCart.userId,
          createdAt: schema.shoppingCart.createdAt,
        })
        .from(schema.shoppingCart)
        .where(whereCondition);
      
      console.log(`✅ Retrieved cart with ${cartItems.length} items`);
      
      return {
        sessionId,
        userId,
        items: cartItems,
        totalItems: cartItems.reduce((sum, item) => sum + item.quantity, 0)
      };
    } catch (error) {
      console.error('Error getting cart:', error);
      return { sessionId, userId, items: [], totalItems: 0 };
    }
  }

  async addToCart(sessionId: string, productId: number, quantity: number, userId?: number): Promise<void> {
    try {
      // Check if item already exists in cart
      let whereCondition = and(
        eq(schema.shoppingCart.sessionId, sessionId),
        eq(schema.shoppingCart.productId, productId)
      );
      
      if (userId) {
        whereCondition = and(
          eq(schema.shoppingCart.sessionId, sessionId),
          eq(schema.shoppingCart.productId, productId),
          eq(schema.shoppingCart.userId, userId)
        );
      }
      
      const [existingItem] = await this.db
        .select()
        .from(schema.shoppingCart)
        .where(whereCondition);
      
      if (existingItem) {
        // Update quantity
        await this.db
          .update(schema.shoppingCart)
          .set({
            quantity: existingItem.quantity + quantity,
            updatedAt: new Date()
          })
          .where(eq(schema.shoppingCart.id, existingItem.id));
        
        console.log(`✅ Updated cart item quantity: ${existingItem.quantity + quantity}`);
      } else {
        // Add new item
        await this.db
          .insert(schema.shoppingCart)
          .values({
            sessionId,
            productId,
            quantity,
            userId: userId || null,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        
        console.log(`✅ Added new item to cart: product ${productId}`);
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
      throw error;
    }
  }

  async updateCartItem(id: number, updates: any, storeId?: number): Promise<any | null> {
    try {
      const [updatedItem] = await this.db
        .update(schema.shoppingCart)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(schema.shoppingCart.id, id))
        .returning();
      
      console.log(`✅ Updated cart item: ${id}`);
      return updatedItem || null;
    } catch (error) {
      console.error('Error updating cart item:', error);
      throw error;
    }
  }

  async removeFromCart(sessionId: string, productId: number, userId?: number): Promise<void> {
    try {
      let whereCondition = and(
        eq(schema.shoppingCart.sessionId, sessionId),
        eq(schema.shoppingCart.productId, productId)
      );
      
      if (userId) {
        whereCondition = and(
          eq(schema.shoppingCart.sessionId, sessionId),
          eq(schema.shoppingCart.productId, productId),
          eq(schema.shoppingCart.userId, userId)
        );
      }
      
      await this.db
        .delete(schema.shoppingCart)
        .where(whereCondition);
      
      console.log(`✅ Removed product ${productId} from cart`);
    } catch (error) {
      console.error('Error removing from cart:', error);
      throw error;
    }
  }

  // ========================================
  // CUSTOMER METHODS
  // ========================================

  async getAllCustomers(storeId?: number): Promise<any[]> {
    try {
      let query = this.db.select().from(schema.customers);
      
      if (storeId) {
        query = query.where(eq(schema.customers.storeId, storeId));
      }
      
      const customers = await query.orderBy(desc(schema.customers.createdAt));
      console.log(`✅ Retrieved ${customers.length} customers for store ${storeId || 'all'}`);
      return customers;
    } catch (error) {
      console.error('Error getting customers:', error);
      return [];
    }
  }

  async createCustomer(customerData: any): Promise<any> {
    try {
      const [newCustomer] = await this.db
        .insert(schema.customers)
        .values({
          ...customerData,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      console.log(`✅ Created customer: ${newCustomer.name || newCustomer.phoneNumber}`);
      return newCustomer;
    } catch (error) {
      console.error('Error creating customer:', error);
      throw error;
    }
  }

  async updateCustomer(id: number, updates: any, storeId?: number): Promise<any | null> {
    try {
      let whereCondition = eq(schema.customers.id, id);
      
      if (storeId) {
        whereCondition = and(
          eq(schema.customers.id, id),
          eq(schema.customers.storeId, storeId)
        );
      }
      
      const [updatedCustomer] = await this.db
        .update(schema.customers)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(whereCondition)
        .returning();
      
      console.log(`✅ Updated customer: ${id}`);
      return updatedCustomer || null;
    } catch (error) {
      console.error('Error updating customer:', error);
      throw error;
    }
  }

  async deleteCustomer(id: number, storeId?: number): Promise<boolean> {
    try {
      let whereCondition = eq(schema.customers.id, id);
      
      if (storeId) {
        whereCondition = and(
          eq(schema.customers.id, id),
          eq(schema.customers.storeId, storeId)
        );
      }
      
      await this.db
        .delete(schema.customers)
        .where(whereCondition);
      
      console.log(`✅ Deleted customer: ${id}`);
      return true;
    } catch (error) {
      console.error('Error deleting customer:', error);
      return false;
    }
  }

  // ========================================
  // CONVERSATIONS METHODS
  // ========================================

  async getAllConversations(storeId?: number, limit = 50, offset = 0): Promise<any[]> {
    try {
      let query = this.db
        .select()
        .from(schema.conversations);

      if (storeId) {
        query = query.where(eq(schema.conversations.storeId, storeId));
      }

      const conversations = await query
        .orderBy(desc(schema.conversations.lastMessageAt))
        .limit(limit)
        .offset(offset);

      console.log(`✅ Retrieved ${conversations.length} conversations for store ${storeId || 'all'}`);
      return conversations;
    } catch (error) {
      console.error('Error getting conversations:', error);
      return [];
    }
  }

  async getConversationsByStore(storeId: number, limit = 50, offset = 0): Promise<any[]> {
    try {
      const conversations = await this.db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.storeId, storeId))
        .orderBy(desc(schema.conversations.lastMessageAt))
        .limit(limit)
        .offset(offset);

      console.log(`✅ Retrieved ${conversations.length} conversations for store ${storeId}`);
      return conversations;
    } catch (error) {
      console.error(`Error getting conversations for store ${storeId}:`, error);
      return [];
    }
  }

  async getConversation(id: number): Promise<any | null> {
    try {
      const [conversation] = await this.db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.id, id));

      return conversation || null;
    } catch (error) {
      console.error('Error getting conversation:', error);
      return null;
    }
  }

  async createConversation(conversationData: any): Promise<any> {
    try {
      const [newConversation] = await this.db
        .insert(schema.conversations)
        .values({
          ...conversationData,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessageAt: new Date()
        })
        .returning();

      console.log(`✅ Created conversation: ${newConversation.id}`);
      return newConversation;
    } catch (error) {
      console.error('Error creating conversation:', error);
      throw error;
    }
  }

  async updateConversation(id: number, updates: any): Promise<any | null> {
    try {
      const [updatedConversation] = await this.db
        .update(schema.conversations)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(schema.conversations.id, id))
        .returning();

      console.log(`✅ Updated conversation: ${id}`);
      return updatedConversation || null;
    } catch (error) {
      console.error('Error updating conversation:', error);
      throw error;
    }
  }

  // ========================================
  // MESSAGES METHODS
  // ========================================

  async getAllMessages(storeId?: number): Promise<any[]> {
    try {
      let query = this.db.select().from(schema.messages);
      
      if (storeId) {
        query = query.where(eq(schema.messages.storeId, storeId));
      }
      
      const messages = await query.orderBy(desc(schema.messages.createdAt));
      console.log(`✅ Retrieved ${messages.length} messages for store ${storeId || 'all'}`);
      return messages;
    } catch (error) {
      console.error('Error getting messages:', error);
      return [];
    }
  }

  async getMessagesByConversation(conversationId: number, storeId?: number): Promise<any[]> {
    try {
      let whereCondition = eq(schema.messages.conversationId, conversationId);
      
      if (storeId) {
        whereCondition = and(
          eq(schema.messages.conversationId, conversationId),
          eq(schema.messages.storeId, storeId)
        );
      }
      
      const messages = await this.db
        .select()
        .from(schema.messages)
        .where(whereCondition)
        .orderBy(schema.messages.createdAt);
      
      console.log(`✅ Retrieved ${messages.length} messages for conversation ${conversationId}`);
      return messages;
    } catch (error) {
      console.error('Error getting messages by conversation:', error);
      return [];
    }
  }

  async createMessage(messageData: any): Promise<any> {
    try {
      const [newMessage] = await this.db
        .insert(schema.messages)
        .values({
          ...messageData,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      console.log(`✅ Created message: ${newMessage.id}`);
      return newMessage;
    } catch (error) {
      console.error('Error creating message:', error);
      throw error;
    }
  }

  // ========================================
  // DASHBOARD METRICS METHODS
  // ========================================

  async getDashboardMetrics(storeId?: number): Promise<any> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get today's orders count - CORREGIDO
    const ordersQuery = this.db
      .select({ count: count() })
      .from(schema.orders)
      .where(
        storeId 
          ? and(gte(schema.orders.createdAt, today), eq(schema.orders.storeId, storeId))
          : gte(schema.orders.createdAt, today)
      );
    
    const [ordersResult] = await ordersQuery;
    
    // Get active conversations count - CORREGIDO
    const conversationsQuery = this.db
      .select({ count: count() })
      .from(schema.conversations)
      .where(
        storeId 
          ? and(eq(schema.conversations.status, 'active'), eq(schema.conversations.storeId, storeId))
          : eq(schema.conversations.status, 'active')
      );
    
    const [conversationsResult] = await conversationsQuery;
      
      const metrics = {
        ordersToday: ordersResult.count || 0,
        activeConversations: conversationsResult.count || 0,
        activeTechnicians: 0,
        dailyRevenue: 0
      };
      
      console.log(`✅ Retrieved dashboard metrics for store ${storeId || 'all'}`);
      return metrics;
    } catch (error) {
      console.error('Error getting dashboard metrics:', error);
      return {
        ordersToday: 0,
        activeConversations: 0,
        activeTechnicians: 0,
        dailyRevenue: 0
      };
    }
  }

  async getDashboardStats(storeId?: number): Promise<any> {
    return this.getDashboardMetrics(storeId);
  }

  // ========================================
  // WHATSAPP SETTINGS METHODS
  // ========================================

  async getWhatsAppConfig(storeId?: number): Promise<WhatsAppSettings | null> {
    try {
      let query = this.db.select().from(schema.whatsappSettings);
      
      if (storeId) {
        query = query.where(eq(schema.whatsappSettings.storeId, storeId));
      }
      
      const [config] = await query;
      return config || null;
    } catch (error) {
      console.error('Error getting WhatsApp config:', error);
      return null;
    }
  }

  async getWhatsAppConfigByPhoneNumberId(phoneNumberId: string): Promise<WhatsAppSettings | null> {
    try {
      const [config] = await this.db
        .select()
        .from(schema.whatsappSettings)
        .where(eq(schema.whatsappSettings.phoneNumberId, phoneNumberId));

      return config || null;
    } catch (error) {
      console.error('Error getting WhatsApp config by phone number ID:', error);
      return null;
    }
  }

  async updateWhatsAppConfig(configData: Partial<InsertWhatsAppSettings>, storeId: number): Promise<WhatsAppSettings> {
    try {
      const existingConfig = await this.getWhatsAppConfig(storeId);
      
      if (existingConfig) {
        const [updatedConfig] = await this.db
          .update(schema.whatsappSettings)
          .set({
            ...configData,
            updatedAt: new Date()
          })
          .where(eq(schema.whatsappSettings.storeId, storeId))
          .returning();
        
        console.log(`✅ Updated WhatsApp config for store ${storeId}`);
        return updatedConfig;
      } else {
        const [newConfig] = await this.db
          .insert(schema.whatsappSettings)
          .values({
            ...configData,
            storeId,
            createdAt: new Date(),
            updatedAt: new Date()
          })
          .returning();
        
        console.log(`✅ Created WhatsApp config for store ${storeId}`);
        return newConfig;
      }
    } catch (error) {
      console.error('Error updating WhatsApp config:', error);
      throw error;
    }
  }

  async getAllWhatsAppConfigs(): Promise<WhatsAppSettings[]> {
    try {
      const configs = await this.db
        .select()
        .from(schema.whatsappSettings)
        .orderBy(desc(schema.whatsappSettings.createdAt));

      console.log(`✅ Retrieved ${configs.length} WhatsApp configs`);
      return configs;
    } catch (error) {
      console.error('Error getting all WhatsApp configs:', error);
      return [];
    }
  }

  async updateWhatsAppConfigById(id: number, configData: Partial<InsertWhatsAppSettings>): Promise<WhatsAppSettings> {
    try {
      const [updatedConfig] = await this.db
        .update(schema.whatsappSettings)
        .set({
          ...configData,
          updatedAt: new Date()
        })
        .where(eq(schema.whatsappSettings.id, id))
        .returning();

      console.log(`✅ Updated WhatsApp config: ${id}`);
      return updatedConfig;
    } catch (error) {
      console.error('Error updating WhatsApp config by ID:', error);
      throw error;
    }
  }

  async deleteWhatsAppConfig(id: number): Promise<boolean> {
    try {
      await this.db
        .delete(schema.whatsappSettings)
        .where(eq(schema.whatsappSettings.id, id));

      console.log(`✅ Deleted WhatsApp config: ${id}`);
      return true;
    } catch (error) {
      console.error('Error deleting WhatsApp config:', error);
      return false;
    }
  }

  // ========================================
  // WHATSAPP LOGS METHODS
  // ========================================

  async getWhatsAppLogs(storeId?: number, limit?: number, offset?: number, filters?: WhatsAppLogFilters): Promise<WhatsAppLog[]> {
    try {
      // Valores por defecto
      const actualLimit = limit ?? 50;
      const actualOffset = offset ?? 0;
      
      let query = this.db.select().from(schema.whatsappLogs);

      const conditions = [];

      if (storeId !== undefined) {
        conditions.push(eq(schema.whatsappLogs.storeId, storeId));
      }

      if (filters) {
        if (filters.type) {
          conditions.push(eq(schema.whatsappLogs.type, filters.type));
        }
        if (filters.phoneNumber) {
          conditions.push(ilike(schema.whatsappLogs.phoneNumber, `%${filters.phoneNumber}%`));
        }
        if (filters.status) {
          conditions.push(eq(schema.whatsappLogs.status, filters.status));
        }
        if (filters.storeId !== undefined) {
          conditions.push(eq(schema.whatsappLogs.storeId, filters.storeId));
        }
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      const logs = await query
        .orderBy(desc(schema.whatsappLogs.timestamp))
        .limit(actualLimit)
        .offset(actualOffset);

      console.log(`✅ Retrieved ${logs.length} WhatsApp logs for store ${storeId || 'all'}`);
      return logs;
    } catch (error) {
      console.error('Error getting WhatsApp logs:', error);
      return [];
    }
  }

  async getAllWhatsAppLogs(limit?: number, offset?: number, filters?: WhatsAppLogFilters): Promise<WhatsAppLog[]> {
    return this.getWhatsAppLogs(undefined, limit, offset, filters);
  }

  async addWhatsAppLog(logData: InsertWhatsAppLog): Promise<WhatsAppLog> {
    try {
      const [newLog] = await this.db
        .insert(schema.whatsappLogs)
        .values({
          ...logData,
          timestamp: new Date()
        })
        .returning();

      console.log(`✅ Added WhatsApp log: ${newLog.type} for ${newLog.phoneNumber}`);
      return newLog;
    } catch (error) {
      console.error('Error adding WhatsApp log:', error);
      throw error;
    }
  }

  async getWhatsAppLogStats(storeId?: number): Promise<any> {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      let baseQuery = this.db.select({ count: count() }).from(schema.whatsappLogs);
      
      if (storeId) {
        baseQuery = baseQuery.where(eq(schema.whatsappLogs.storeId, storeId));
      }

      const [total] = await baseQuery;

      let successQuery = this.db.select({ count: count() }).from(schema.whatsappLogs)
        .where(eq(schema.whatsappLogs.status, 'success'));
      
      if (storeId) {
        successQuery = successQuery.where(and(
          eq(schema.whatsappLogs.status, 'success'),
          eq(schema.whatsappLogs.storeId, storeId)
        ));
      }

      const [success] = await successQuery;

      let errorQuery = this.db.select({ count: count() }).from(schema.whatsappLogs)
        .where(eq(schema.whatsappLogs.status, 'error'));
      
      if (storeId) {
        errorQuery = errorQuery.where(and(
          eq(schema.whatsappLogs.status, 'error'),
          eq(schema.whatsappLogs.storeId, storeId)
        ));
      }

      const [errors] = await errorQuery;

      let todayQuery = this.db.select({ count: count() }).from(schema.whatsappLogs)
        .where(gte(schema.whatsappLogs.timestamp, today));
      
      if (storeId) {
        todayQuery = todayQuery.where(and(
          gte(schema.whatsappLogs.timestamp, today),
          eq(schema.whatsappLogs.storeId, storeId)
        ));
      }

      const [todayLogs] = await todayQuery;

      return {
        total: total.count || 0,
        success: success.count || 0,
        errors: errors.count || 0,
        today: todayLogs.count || 0,
        thisWeek: 0,
        thisMonth: 0
      };
    } catch (error) {
      console.error('Error getting WhatsApp log stats:', error);
      return {
        total: 0,
        success: 0,
        errors: 0,
        today: 0,
        thisWeek: 0,
        thisMonth: 0
      };
    }
  }

  async cleanupOldWhatsAppLogs(days = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const result = await this.db
        .delete(schema.whatsappLogs)
        .where(lt(schema.whatsappLogs.timestamp, cutoffDate));

      console.log(`✅ Cleaned up WhatsApp logs older than ${days} days`);
      return result.rowCount || 0;
    } catch (error) {
      console.error('Error cleaning up WhatsApp logs:', error);
      return 0;
    }
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  async getUserById(id: number): Promise<any | null> {
    try {
      const globalUser = await this.getGlobalUserById(id);
      if (globalUser) {
        return {
          ...globalUser,
          level: 'global'
        };
      }

      const storeUser = await this.getStoreUserById(id);
      if (storeUser) {
        return {
          ...storeUser,
          level: 'store'
        };
      }

      return null;
    } catch (error) {
      console.error('Error getting user by ID:', error);
      return null;
    }
  }

  async testConnection(): Promise<{ connected: boolean; error?: string }> {
    try {
      await this.db.select().from(schema.virtualStores).limit(1);
      return { connected: true };
    } catch (error) {
      console.error('Database connection test failed:', error);
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async close(): Promise<void> {
    try {
      await this.pool.end();
      console.log('✅ Master storage connection closed');
    } catch (error) {
      console.error('Error closing master storage connection:', error);
    }
  }
}
