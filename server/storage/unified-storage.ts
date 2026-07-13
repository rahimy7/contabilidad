// server/storage/unified-storage.ts
// Interfaz unificada que combina master y tenant operations

import { StorageFactory } from './storage-factory';
import {
  UnifiedStorageInterface,
  MasterStorage,
  TenantStorage,
  DashboardMetrics,
  ReportFilters,
} from '../interfaces/storage';

import {
  VirtualStore,
  Product,
  Customer,
  Order,
  OrderWithDetails,
  Conversation,
  ConversationWithDetails,
  Message,
  AutoResponse,
  ProductCategory,
  EmployeeProfile,
  User,
  Notification,
  WhatsAppSettings,
  WhatsAppLog,
} from '@shared/schema';

export class UnifiedStorage implements UnifiedStorageInterface {
  private storageFactory: StorageFactory;
  private masterStorage: MasterStorage;
  private tenantStorage: TenantStorage | null = null;
  
  readonly storeId?: number;

  constructor(storeId?: number) {
    this.storeId = storeId;
    this.storageFactory = StorageFactory.getInstance();
    this.masterStorage = this.storageFactory.getMasterStorage();
  }

  // ========================================
  // STORAGE INSTANCES
  // ========================================

  /**
   * Acceso directo al Master Storage (siempre disponible)
   */
  get master(): MasterStorage {
    return this.masterStorage;
  }

  /**
   * Acceso al Tenant Storage (requiere storeId)
   */
  async tenant(): Promise<TenantStorage> {
    if (!this.storeId) {
      throw new Error('Store ID is required for tenant operations');
    }

    if (!this.tenantStorage) {
      this.tenantStorage = await this.storageFactory.getTenantStorage(this.storeId);
    }

    return this.tenantStorage;
  }

  // ========================================
  // CONVENIENCE METHODS - PRODUCTS
  // ========================================

  /**
   * Obtiene todos los productos de la tienda
   */
  async getProducts(): Promise<Product[]> {
    const tenantStorage = await this.tenant();
    return tenantStorage.getAllProducts();
  }

  /**
   * Obtiene un producto específico por ID
   */
  async getProduct(id: number): Promise<Product | null> {
    const tenantStorage = await this.tenant();
    return tenantStorage.getProductById(id);
  }

  /**
   * Crea un nuevo producto
   */
  async createProduct(productData: any): Promise<Product> {
    const tenantStorage = await this.tenant();
    return tenantStorage.createProduct(productData);
  }

  /**
   * Actualiza un producto existente
   */
  async updateProduct(id: number, updates: any): Promise<Product> {
    const tenantStorage = await this.tenant();
    return tenantStorage.updateProduct(id, updates);
  }

  /**
   * Elimina un producto
   */
  async deleteProduct(id: number): Promise<void> {
    const tenantStorage = await this.tenant();
    return tenantStorage.deleteProduct(id);
  }

  /**
   * Busca productos por término
   */
  async searchProducts(query: string): Promise<Product[]> {
    const tenantStorage = await this.tenant();
    return tenantStorage.searchProducts(query);
  }

  // ========================================
  // CONVENIENCE METHODS - CATEGORIES
  // ========================================

  /**
   * Obtiene todas las categorías de la tienda
   */
  async getCategories(): Promise<ProductCategory[]> {
    const tenantStorage = await this.tenant();
    return tenantStorage.getAllCategories();
  }

  /**
   * Crea una nueva categoría
   */
  async createCategory(categoryData: any): Promise<ProductCategory> {
    const tenantStorage = await this.tenant();
    return tenantStorage.createCategory(categoryData);
  }

  /**
   * Actualiza una categoría existente
   */
  async updateCategory(id: number, updates: any): Promise<ProductCategory> {
    const tenantStorage = await this.tenant();
    return tenantStorage.updateCategory(id, updates);
  }

  /**
   * Elimina una categoría
   */
  async deleteCategory(id: number): Promise<void> {
    const tenantStorage = await this.tenant();
    return tenantStorage.deleteCategory(id);
  }

  // ========================================
  // CONVENIENCE METHODS - CUSTOMERS
  // ========================================

  /**
   * Obtiene todos los clientes de la tienda
   */
  async getCustomers(): Promise<Customer[]> {
    const tenantStorage = await this.tenant();
    return tenantStorage.getAllCustomers();
  }

  /**
   * Obtiene un cliente específico por ID
   */
  async getCustomer(id: number): Promise<Customer | null> {
    const tenantStorage = await this.tenant();
    return tenantStorage.getCustomerById(id);
  }

  /**
   * Busca cliente por teléfono
   */
  async getCustomerByPhone(phone: string): Promise<Customer | null> {
    const tenantStorage = await this.tenant();
    return tenantStorage.getCustomerByPhone(phone);
  }

  /**
   * Crea un nuevo cliente
   */
  async createCustomer(customerData: any): Promise<Customer> {
    const tenantStorage = await this.tenant();
    return tenantStorage.createCustomer(customerData);
  }

  /**
   * Actualiza un cliente existente
   */
  async updateCustomer(id: number, updates: any): Promise<Customer> {
    const tenantStorage = await this.tenant();
    return tenantStorage.updateCustomer(id, updates);
  }

  /**
   * Elimina un cliente
   */
  async deleteCustomer(id: number): Promise<void> {
    const tenantStorage = await this.tenant();
    return tenantStorage.deleteCustomer(id);
  }

  // ========================================
  // CONVENIENCE METHODS - ORDERS
  // ========================================

  /**
   * Obtiene todas las órdenes de la tienda
   */
  async getOrders(): Promise<OrderWithDetails[]> {
    const tenantStorage = await this.tenant();
    return tenantStorage.getAllOrders();
  }

  /**
   * Obtiene una orden específica por ID
   */
  async getOrder(id: number): Promise<OrderWithDetails | null> {
    const tenantStorage = await this.tenant();
    return tenantStorage.getOrderById(id);
  }

  /**
   * Crea una nueva orden
   */
  async createOrder(orderData: any, items: any[]): Promise<OrderWithDetails> {
    const tenantStorage = await this.tenant();
    return tenantStorage.createOrder(orderData, items);
  }

  /**
   * Actualiza una orden existente
   */
  async updateOrder(id: number, updates: any): Promise<Order> {
    const tenantStorage = await this.tenant();
    return tenantStorage.updateOrder(id, updates);
  }

  /**
   * Asigna una orden a un técnico
   */
  async assignOrder(orderId: number, userId: number): Promise<Order> {
    const tenantStorage = await this.tenant();
    return tenantStorage.assignOrder(orderId, userId);
  }

  /**
   * Actualiza el estado de una orden
   */
  async updateOrderStatus(orderId: number, status: string, userId?: number, notes?: string): Promise<Order> {
    const tenantStorage = await this.tenant();
    return tenantStorage.updateOrderStatus(orderId, status, userId, notes);
  }

  // ========================================
  // CONVENIENCE METHODS - CONVERSATIONS
  // ========================================

  /**
   * Obtiene todas las conversaciones de la tienda
   */
  async getConversations(): Promise<ConversationWithDetails[]> {
    const tenantStorage = await this.tenant();
    return tenantStorage.getAllConversations();
  }

  /**
   * Obtiene una conversación específica por ID
   */
  async getConversation(id: number): Promise<ConversationWithDetails | null> {
    const tenantStorage = await this.tenant();
    return tenantStorage.getConversationById(id);
  }

  /**
   * Obtiene conversación por teléfono del cliente
   */
  async getConversationByPhone(phone: string): Promise<ConversationWithDetails | null> {
    const tenantStorage = await this.tenant();
    return tenantStorage.getConversationByCustomerPhone(phone);
  }

  /**
   * Obtiene mensajes de una conversación
   */
  async getMessages(conversationId: number): Promise<Message[]> {
    const tenantStorage = await this.tenant();
    return tenantStorage.getMessagesByConversation(conversationId);
  }

  /**
   * Crea un nuevo mensaje
   */
  async createMessage(messageData: any): Promise<Message> {
    const tenantStorage = await this.tenant();
    return tenantStorage.createMessage(messageData);
  }

  // ========================================
  // CONVENIENCE METHODS - STORES (MASTER)
  // ========================================

  /**
   * Obtiene todas las tiendas del sistema
   */
  async getAllStores(): Promise<VirtualStore[]> {
    return this.master.getAllVirtualStores();
  }

  /**
   * Obtiene información de la tienda actual
   */
  async getStore(): Promise<VirtualStore | null> {
    if (!this.storeId) return null;
    return this.master.getVirtualStore(this.storeId);
  }

  /**
   * Obtiene una tienda específica por ID
   */
  async getStoreById(storeId: number): Promise<VirtualStore | null> {
    return this.master.getVirtualStore(storeId);
  }

  /**
   * Crea una nueva tienda
   */
  async createStore(storeData: any): Promise<VirtualStore> {
    return this.master.createStore(storeData);
  }

  /**
   * Actualiza una tienda existente
   */
  async updateStore(storeId: number, updates: any): Promise<VirtualStore> {
    return this.master.updateStore(storeId, updates);
  }

  // ========================================
  // CONVENIENCE METHODS - USERS (MASTER)
  // ========================================

  /**
   * Autentica un usuario en cualquier nivel
   */
  async authenticateUser(username: string, password: string, storeId?: number): Promise<any> {
    return this.master.authenticateUser(username, password, storeId);
  }

  /**
   * Busca usuario en todos los niveles
   */
  async findUser(username: string): Promise<any> {
    return this.master.findUserAnyLevel(username);
  }

  /**
   * Obtiene estadísticas de usuarios
   */
  async getUserStats(): Promise<any> {
    return this.master.getUserStats();
  }

  /**
   * Crea usuario global (super admin)
   */
  async createGlobalUser(userData: any): Promise<any> {
    return this.master.createGlobalUser(userData);
  }

  /**
   * Crea usuario de tienda
   */
  async createStoreUser(userData: any): Promise<any> {
    return this.master.createStoreUser(userData);
  }

  // ========================================
  // CONVENIENCE METHODS - WHATSAPP (MASTER)
  // ========================================

  /**
   * Obtiene configuración de WhatsApp para la tienda
   */
  async getWhatsAppConfig(): Promise<WhatsAppSettings | null> {
    if (!this.storeId) {
      throw new Error('Store ID required for WhatsApp config');
    }
    return this.master.getWhatsAppConfig(this.storeId);
  }

  /**
   * Actualiza configuración de WhatsApp
   */
  async updateWhatsAppConfig(config: any): Promise<WhatsAppSettings> {
    if (!this.storeId) {
      throw new Error('Store ID required for WhatsApp config update');
    }
    return this.master.updateWhatsAppConfig(this.storeId, config);
  }

  /**
   * Obtiene configuración por phoneNumberId
   */
  async getWhatsAppConfigByPhoneNumber(phoneNumberId: string): Promise<WhatsAppSettings | null> {
    return this.master.getWhatsAppConfigByPhoneNumberId(phoneNumberId);
  }

  /**
   * Agrega log de WhatsApp
   */
  async addWhatsAppLog(logData: any): Promise<WhatsAppLog> {
    return this.master.addWhatsAppLog(logData);
  }

  // ========================================
  // CONVENIENCE METHODS - ANALYTICS
  // ========================================

  /**
   * Obtiene métricas del dashboard de la tienda
   */
  async getDashboardMetrics(warehouseId?: number): Promise<DashboardMetrics> {
    const tenantStorage = await this.tenant();
    return tenantStorage.getDashboardMetrics(warehouseId);
  }

  /**
   * Obtiene reportes de la tienda
   */
  async getReports(filters: ReportFilters): Promise<any> {
    const tenantStorage = await this.tenant();
    return tenantStorage.getReports(filters);
  }

  /**
   * Obtiene métricas del sistema (global)
   */
  async getSystemMetrics(): Promise<any> {
    return this.master.getSystemMetrics();
  }

  // ========================================
  // CONVENIENCE METHODS - AUTO RESPONSES
  // ========================================

  /**
   * Obtiene respuestas automáticas de la tienda
   */
  async getAutoResponses(): Promise<AutoResponse[]> {
    const tenantStorage = await this.tenant();
    return tenantStorage.getAllAutoResponses();
  }

  /**
   * Obtiene respuesta automática por trigger
   */
  async getAutoResponseByTrigger(trigger: string): Promise<AutoResponse | null> {
    const tenantStorage = await this.tenant();
    return tenantStorage.getAutoResponseByTrigger(trigger);
  }

  /**
   * Crea nueva respuesta automática
   */
  async createAutoResponse(responseData: any): Promise<AutoResponse> {
    const tenantStorage = await this.tenant();
    return tenantStorage.createAutoResponse(responseData);
  }

  // ========================================
  // CONVENIENCE METHODS - EMPLOYEES
  // ========================================

  /**
   * Obtiene todos los empleados de la tienda
   */
  async getEmployees(): Promise<(EmployeeProfile & { user: User })[]> {
    const tenantStorage = await this.tenant();
    return tenantStorage.getAllEmployeeProfiles();
  }

  /**
   * Crea perfil de empleado
   */
  async createEmployee(profileData: any): Promise<EmployeeProfile> {
    const tenantStorage = await this.tenant();
    return tenantStorage.createEmployeeProfile(profileData);
  }

  /**
   * Obtiene técnicos disponibles
   */
  async getAvailableTechnicians(specializations?: string[]): Promise<(EmployeeProfile & { user: User })[]> {
    const tenantStorage = await this.tenant();
    return tenantStorage.getAvailableTechnicians(specializations);
  }

  // ========================================
  // CONVENIENCE METHODS - NOTIFICATIONS
  // ========================================

  /**
   * Obtiene notificaciones de un usuario
   */
  async getUserNotifications(userId: number): Promise<Notification[]> {
    const tenantStorage = await this.tenant();
    return tenantStorage.getUserNotifications(userId);
  }

  /**
   * Crea nueva notificación
   */
  async createNotification(notificationData: any): Promise<Notification> {
    const tenantStorage = await this.tenant();
    return tenantStorage.createNotification(notificationData);
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Verifica si hay storeId configurado
   */
  hasTenantAccess(): boolean {
    return this.storeId !== undefined && this.storeId !== null;
  }

  /**
   * Obtiene el storeId actual
   */
  getStoreId(): number | undefined {
    return this.storeId;
  }

  /**
   * Crea nueva instancia para otra tienda
   */
  forStore(storeId: number): UnifiedStorage {
    return new UnifiedStorage(storeId);
  }

  /**
   * Refresca las conexiones cache
   */
  async refresh(): Promise<void> {
    if (this.storeId) {
      this.tenantStorage = null;
      await this.storageFactory.getTenantStorage(this.storeId);
    }
  }

  /**
   * Limpia el cache de la tienda actual
   */
 /*  clearCache(): void {
    if (this.storeId) {
      this.storageFactory.clearTenantCache(this.storeId);
      this.tenantStorage = null;
    }
  } */

  /**
   * Verifica el estado de salud de las conexiones
   */
/*   async healthCheck(): Promise<any> {
    return this.storageFactory.healthCheck();
  } */

  // ========================================
  // BATCH OPERATIONS
  // ========================================

  /**
   * Operaciones en lote para múltiples tiendas (solo super admin)
   */
  async batchOperation<T>(
    storeIds: number[],
    operation: (tenantStorage: TenantStorage) => Promise<T>
  ): Promise<Array<{ storeId: number; success: boolean; result?: T; error?: string }>> {
    const results = [];

    for (const storeId of storeIds) {
      try {
        const tenantStorage = await this.storageFactory.getTenantStorage(storeId);
        const result = await operation(tenantStorage);
        results.push({ storeId, success: true, result });
      } catch (error) {
        results.push({ 
          storeId, 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    return results;
  }

  /**
   * Ejecuta una consulta en todas las tiendas activas
   */
  async queryAllActiveStores<T>(
    query: (tenantStorage: TenantStorage) => Promise<T>
  ): Promise<Array<{ storeId: number; storeName: string; result: T }>> {
    const stores = await this.getAllStores();
    const activeStores = stores.filter(store => store.isActive);
    
    const results = await Promise.allSettled(
      activeStores.map(async (store) => {
        const tenantStorage = await this.storageFactory.getTenantStorage(store.id);
        const result = await query(tenantStorage);
        return { storeId: store.id, storeName: store.name, result };
      })
    );

    return results
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<any>).value);
  }
}

// ================================
// FACTORY FUNCTIONS
// ================================

/**
 * Crea instancia de UnifiedStorage para una tienda específica
 */
export function createUnifiedStorage(storeId?: number): UnifiedStorage {
  return new UnifiedStorage(storeId);
}

/**
 * Crea instancia para operaciones globales (solo master)
 */
export function createMasterOnlyStorage(): UnifiedStorage {
  return new UnifiedStorage();
}

// ================================
// EXPORT DEFAULT
// ================================

export default UnifiedStorage;