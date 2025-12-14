// server/storage/master-storage.ts
// Versión simplificada para tienda única (4Life Bella Vista)
// Solo accede a tablas que realmente existen en la nueva BD

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, desc, and, count, sql, ilike, gte } from "drizzle-orm";
import * as schema from "@shared/schema";
import bcrypt from 'bcrypt';
import ws from "ws";

import {
  WhatsAppSettings,
  WhatsAppLog,
  InsertWhatsAppSettings,
  InsertWhatsAppLog,
} from "@shared/schema";

// Configurar WebSocket para Neon
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as any).WebSocket = ws;
}

interface WhatsAppLogFilters {
  type?: string;
  phoneNumber?: string;
  status?: string;
  storeId?: number;
}

type User = typeof schema.users.$inferSelect;
type InsertUser = typeof schema.users.$inferInsert;

/**
 * MasterStorageService simplificado para tienda única
 * Solo accede a las tablas que existen en la nueva base de datos
 */
export class MasterStorageService {
  private db: any;
  private pool: Pool;
  private storeId: number = 1; // ID fijo para la tienda única

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    this.db = drizzle(this.pool, { schema });
  }

  // ========================================
  // USUARIOS (tabla: users)
  // ========================================

  async createUser(userData: InsertUser): Promise<User> {
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

      console.log(`✅ Created user: ${newUser.username}`);
      return newUser;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  async getUser(username: string): Promise<User | null> {
    try {
      const [user] = await this.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, username));

      return user || null;
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  }

  async getUserById(id: number): Promise<User | null> {
    try {
      const [user] = await this.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, id));

      return user || null;
    } catch (error) {
      console.error('Error getting user by ID:', error);
      return null;
    }
  }

  async listUsers(): Promise<User[]> {
    try {
      const users = await this.db
        .select()
        .from(schema.users)
        .orderBy(desc(schema.users.createdAt));

      return users;
    } catch (error) {
      console.error('Error listing users:', error);
      return [];
    }
  }

  async updateUser(id: number, updates: Partial<InsertUser>): Promise<User> {
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

      console.log(`✅ Updated user: ${id}`);
      return updatedUser;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  async deleteUser(id: number): Promise<boolean> {
    try {
      await this.db
        .delete(schema.users)
        .where(eq(schema.users.id, id));

      console.log(`✅ Deleted user: ${id}`);
      return true;
    } catch (error) {
      console.error('Error deleting user:', error);
      return false;
    }
  }

  async authenticateUser(username: string, password: string): Promise<any | null> {
    try {
      console.log(`🔐 Authenticating user: ${username}`);
      const user = await this.getUser(username);

      if (!user) {
        console.log(`❌ User not found: ${username}`);
        return null;
      }

      console.log(`👤 User found: ${username} (ID: ${user.id})`);
      console.log(`🔑 Comparing passwords...`);
      console.log(`   - Password provided length: ${password.length}`);
      console.log(`   - Stored hash: ${user.password.substring(0, 20)}...`);
      
      const isValid = await bcrypt.compare(password, user.password);
      
      console.log(`🔓 Password validation result: ${isValid}`);
      
      if (!isValid) {
        console.log(`❌ Password mismatch for user: ${username}`);
        return null;
      }

      console.log(`✅ Authentication successful for: ${username}`);
      return {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        name: user.name,
        storeId: this.storeId, // Siempre es 1 para tienda única
        status: user.status
      };
    } catch (error) {
      console.error('❌ Error authenticating user:', error);
      return null;
    }
  }

  // ========================================
  // TIENDA (tabla: store_settings)
  // ========================================

  async getStoreSettings(): Promise<any | null> {
    try {
      const [settings] = await this.db
        .select()
        .from(schema.storeSettings)
        .where(eq(schema.storeSettings.storeId, this.storeId));

      return settings || null;
    } catch (error) {
      console.error('Error getting store settings:', error);
      return null;
    }
  }

  async updateStoreSettings(updates: any): Promise<any> {
    try {
      const [updatedSettings] = await this.db
        .update(schema.storeSettings)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(schema.storeSettings.storeId, this.storeId))
        .returning();

      console.log(`✅ Updated store settings`);
      return updatedSettings;
    } catch (error) {
      console.error('Error updating store settings:', error);
      throw error;
    }
  }

  // ========================================
  // COMPATIBILIDAD CON CÓDIGO ANTIGUO
  // ========================================

  // Para compatibilidad con código que espera getVirtualStore
  async getVirtualStore(storeId: number): Promise<any | null> {
    console.log(`⚠️ getVirtualStore called with storeId ${storeId}, returning mock data`);
    return {
      id: this.storeId,
      name: '4Life Bella Vista',
      isActive: true,
      slug: '4life-bellavista',
      databaseUrl: process.env.DATABASE_URL
    };
  }

  // ========================================
  // AUTO RESPONSES
  // ========================================

  async getAllAutoResponses(storeId?: number): Promise<any[]> {
    try {
      const responses = await this.db
        .select()
        .from(schema.autoResponses)
        .where(eq(schema.autoResponses.storeId, this.storeId))
        .orderBy(desc(schema.autoResponses.createdAt));

      console.log(`✅ Retrieved ${responses.length} auto-responses`);
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
          storeId: this.storeId,
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
      const [updatedResponse] = await this.db
        .update(schema.autoResponses)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(schema.autoResponses.id, id),
            eq(schema.autoResponses.storeId, this.storeId)
          )
        )
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
      await this.db
        .delete(schema.autoResponses)
        .where(
          and(
            eq(schema.autoResponses.id, id),
            eq(schema.autoResponses.storeId, this.storeId)
          )
        );

      console.log(`✅ Deleted auto response: ${id}`);
    } catch (error) {
      console.error('Error deleting auto response:', error);
      throw error;
    }
  }

  // ========================================
  // ASSIGNMENT RULES
  // ========================================

  async getAllAssignmentRules(storeId?: number): Promise<any[]> {
    try {
      const rules = await this.db
        .select()
        .from(schema.assignmentRules)
        .where(eq(schema.assignmentRules.storeId, this.storeId))
        .orderBy(desc(schema.assignmentRules.createdAt));

      console.log(`✅ Retrieved ${rules.length} assignment rules`);
      return rules;
    } catch (error) {
      console.error('Error getting assignment rules:', error);
      return [];
    }
  }

  async createAssignmentRule(ruleData: any): Promise<any> {
    try {
      const [newRule] = await this.db
        .insert(schema.assignmentRules)
        .values({
          ...ruleData,
          storeId: this.storeId,
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
  // CART
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
      let whereCondition = and(
        eq(schema.shoppingCart.sessionId, sessionId),
        eq(schema.shoppingCart.productId, productId)
      );

      if (userId) {
        whereCondition = and(
          whereCondition,
          eq(schema.shoppingCart.userId, userId)
        );
      }

      const [existingItem] = await this.db
        .select()
        .from(schema.shoppingCart)
        .where(whereCondition);

      if (existingItem) {
        await this.db
          .update(schema.shoppingCart)
          .set({
            quantity: existingItem.quantity + quantity,
            updatedAt: new Date()
          })
          .where(eq(schema.shoppingCart.id, existingItem.id));

        console.log(`✅ Updated cart item quantity`);
      } else {
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

        console.log(`✅ Added new item to cart`);
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
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
          whereCondition,
          eq(schema.shoppingCart.userId, userId)
        );
      }

      await this.db
        .delete(schema.shoppingCart)
        .where(whereCondition);

      console.log(`✅ Removed product from cart`);
    } catch (error) {
      console.error('Error removing from cart:', error);
      throw error;
    }
  }

  // ========================================
  // CUSTOMERS
  // ========================================

  async getAllCustomers(storeId?: number): Promise<any[]> {
    try {
      const customers = await this.db
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.storeId, this.storeId))
        .orderBy(desc(schema.customers.createdAt));

      console.log(`✅ Retrieved ${customers.length} customers`);
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
          storeId: this.storeId,
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
      const [updatedCustomer] = await this.db
        .update(schema.customers)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(schema.customers.id, id),
            eq(schema.customers.storeId, this.storeId)
          )
        )
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
      await this.db
        .delete(schema.customers)
        .where(
          and(
            eq(schema.customers.id, id),
            eq(schema.customers.storeId, this.storeId)
          )
        );

      console.log(`✅ Deleted customer: ${id}`);
      return true;
    } catch (error) {
      console.error('Error deleting customer:', error);
      return false;
    }
  }

  // ========================================
  // CONVERSATIONS
  // ========================================

  async getAllConversations(storeId?: number, limit = 50, offset = 0): Promise<any[]> {
    try {
      const conversations = await this.db
        .select()
        .from(schema.conversations)
        .where(eq(schema.conversations.storeId, this.storeId))
        .orderBy(desc(schema.conversations.lastMessageAt))
        .limit(limit)
        .offset(offset);

      console.log(`✅ Retrieved ${conversations.length} conversations`);
      return conversations;
    } catch (error) {
      console.error('Error getting conversations:', error);
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
          storeId: this.storeId,
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
  // MESSAGES
  // ========================================

  async getAllMessages(storeId?: number): Promise<any[]> {
    try {
      const messages = await this.db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.storeId, this.storeId))
        .orderBy(desc(schema.messages.createdAt));

      console.log(`✅ Retrieved ${messages.length} messages`);
      return messages;
    } catch (error) {
      console.error('Error getting messages:', error);
      return [];
    }
  }

  async getMessagesByConversation(conversationId: number, storeId?: number): Promise<any[]> {
    try {
      const messages = await this.db
        .select()
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.conversationId, conversationId),
            eq(schema.messages.storeId, this.storeId)
          )
        )
        .orderBy(schema.messages.createdAt);

      console.log(`✅ Retrieved ${messages.length} messages for conversation`);
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
          storeId: this.storeId,
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
  // DASHBOARD METRICS
  // ========================================

  async getDashboardMetrics(storeId?: number): Promise<any> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get orders from tenant DB
      const { getTenantDb } = await import('../multi-tenant-db');
      const tenantDb = await getTenantDb(this.storeId);

      const ordersResult = await tenantDb
        .select({
          count: count(),
          totalAmount: sql<number>`COALESCE(SUM(CAST(${schema.orders.totalAmount} AS NUMERIC)), 0)`
        })
        .from(schema.orders)
        .where(
          and(
            gte(schema.orders.createdAt, today),
            eq(schema.orders.status, 'completed')
          )
        );

      const ordersData = ordersResult[0] || { count: 0, totalAmount: 0 };

      // Get conversations
      const [conversationsResult] = await this.db
        .select({ count: count() })
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.status, 'active'),
            eq(schema.conversations.storeId, this.storeId)
          )
        );

      // Get technicians
      const techniciansResult = await tenantDb
        .select({ count: count() })
        .from(schema.employeeProfiles)
        .where(eq(schema.employeeProfiles.department, 'technical'));

      const techniciansData = techniciansResult[0] || { count: 0 };

      const metrics = {
        ordersToday: ordersData.count || 0,
        activeConversations: conversationsResult.count || 0,
        activeTechnicians: techniciansData.count || 0,
        dailyRevenue: Math.round(parseFloat(String(ordersData.totalAmount || 0)) * 100) / 100
      };

      console.log(`✅ Retrieved dashboard metrics:`, metrics);
      return metrics;
    } catch (error) {
      console.error('❌ Error getting dashboard metrics:', error);
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
  // WHATSAPP SETTINGS
  // ========================================

  async getWhatsAppConfig(storeId?: number): Promise<WhatsAppSettings | null> {
    try {
      const [config] = await this.db
        .select()
        .from(schema.whatsappSettings)
        .where(eq(schema.whatsappSettings.storeId, this.storeId));

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

  async updateWhatsAppConfig(configData: Partial<InsertWhatsAppSettings>, storeId?: number): Promise<WhatsAppSettings> {
    try {
      const existingConfig = await this.getWhatsAppConfig();

      if (existingConfig) {
        const [updatedConfig] = await this.db
          .update(schema.whatsappSettings)
          .set({
            ...configData,
            updatedAt: new Date()
          })
          .where(eq(schema.whatsappSettings.storeId, this.storeId))
          .returning();

        console.log(`✅ Updated WhatsApp config`);
        return updatedConfig;
      } else {
        const [newConfig] = await this.db
          .insert(schema.whatsappSettings)
          .values({
            ...configData,
            storeId: this.storeId,
            createdAt: new Date(),
            updatedAt: new Date()
          })
          .returning();

        console.log(`✅ Created WhatsApp config`);
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
        .where(eq(schema.whatsappSettings.storeId, this.storeId))
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
  // WHATSAPP LOGS
  // ========================================

  async getWhatsAppLogs(storeId?: number, limit?: number, offset?: number, filters?: WhatsAppLogFilters): Promise<WhatsAppLog[]> {
    try {
      const actualLimit = limit ?? 50;
      const actualOffset = offset ?? 0;

      let query = this.db.select().from(schema.whatsappLogs);
      const conditions = [eq(schema.whatsappLogs.storeId, this.storeId)];

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
      }

      const logs = await query
        .where(and(...conditions))
        .orderBy(desc(schema.whatsappLogs.timestamp))
        .limit(actualLimit)
        .offset(actualOffset);

      console.log(`✅ Retrieved ${logs.length} WhatsApp logs`);
      return logs;
    } catch (error) {
      console.error('Error getting WhatsApp logs:', error);
      return [];
    }
  }

  async addWhatsAppLog(logData: InsertWhatsAppLog): Promise<WhatsAppLog> {
    try {
      const [newLog] = await this.db
        .insert(schema.whatsappLogs)
        .values({
          ...logData,
          storeId: this.storeId,
          timestamp: new Date()
        })
        .returning();

      console.log(`✅ Added WhatsApp log`);
      return newLog;
    } catch (error) {
      console.error('Error adding WhatsApp log:', error);
      throw error;
    }
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  async testConnection(): Promise<{ connected: boolean; error?: string }> {
    try {
      await this.db.select().from(schema.users).limit(1);
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
