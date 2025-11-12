// server/interfaces/storage.ts
// Interfaces base para el sistema de storage reorganizado

import {
  User,
  Customer,
  Product,
  Order,
  OrderItem,
  OrderHistory,
  Conversation,
  Message,
  WhatsAppSettings,
  WhatsAppLog,
  AutoResponse,
  CustomerRegistrationFlow,
  EmployeeProfile,
  AssignmentRule,
  Notification,
  ShoppingCart,
  ProductCategory,
  StoreSettings,
  VirtualStore,
  CustomerHistory,
  type InsertUser,
  type InsertCustomer,
  type InsertProduct,
  type InsertOrder,
  type InsertOrderItem,
  type InsertOrderHistory,
  type InsertConversation,
  type InsertMessage,
  type InsertWhatsAppSettings,
  type InsertWhatsAppLog,
  type InsertAutoResponse,
  type InsertCustomerRegistrationFlow,
  type InsertEmployeeProfile,
  type InsertAssignmentRule,
  type InsertNotification,
  type InsertShoppingCart,
  type InsertProductCategory,
  type InsertCustomerHistory,
  type OrderItemWithProduct,
  type OrderWithDetails,
  type ConversationWithDetails,
  Brand,
  NotificationConfig,
  NotificationHistory,
  RegistrationFlow,
  UserWorkload,
  NotificationChannel,
  NotificationEvent,
} from "@shared/schema";
import { InsertProductBrand, ProductBrand } from "@shared/types";

// ================================
// TIPOS ESPECÍFICOS PARA USUARIOS
// ================================

// Usuarios globales (super admins)
export type InsertGlobalUser = typeof import("@shared/schema").users.$inferInsert;
export type GlobalUser = typeof import("@shared/schema").users.$inferSelect;

// Usuarios de sistema/tienda (store owners, admins)
export type InsertStoreUser = typeof import("@shared/schema").systemUsers.$inferInsert;
export type StoreUser = typeof import("@shared/schema").systemUsers.$inferSelect;

// Lista enriquecida de usuarios de tienda con nombre de tienda
export interface StoreUserListItem {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  storeId: number;
  createdAt: Date;
  storeName?: string;
}

// Estadísticas de usuarios
export interface UserStats {
  globalUsers: number;
  storeUsers: number;
  activeStoreUsers: number;
  usersByRole: Record<string, number>;
}

// ================================
// TIPOS PARA CREACIÓN DE TIENDAS
// ================================

export interface CreateStoreData {
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

// ================================
// TIPOS PARA MÉTRICAS Y REPORTES
// ================================

export interface DashboardMetrics {
  ordersToday: number;
  activeConversations: number;
  activeTechnicians: number;
  dailyRevenue: number;
  totalOrders?: number;
  pendingOrders?: number;
  totalCustomers?: number;
  averageOrderValue?: number;
}

export interface ReportFilters {
  type?: string;
  startDate?: string;
  endDate?: string;
  category?: string;
  status?: string;
}

export interface WhatsAppLogFilters {
  storeId: any;
  type?: string;
  phoneNumber?: string;
  status?: string;
}

// ================================
// TIPOS PARA CARRITO DE COMPRAS
// ================================

export interface CartWithItems {
  items: (ShoppingCart & { product: Product })[];
  subtotal: number;
}

// ================================
// TIPOS PARA ASIGNACIÓN AUTOMÁTICA
// ================================

export interface TechnicianMatch {
  technician: EmployeeProfile & { user: User };
  distance?: number;
  estimatedTime: number;
  matchingRules: AssignmentRule[];
}

export interface AutoAssignResult {
  success: boolean;
  assignedTechnician?: EmployeeProfile & { user: User };
  reason?: string;
}

export interface ServicePriceCalculation {
  basePrice: number;
  installationCost: number;
  partsCost: number;
  laborHours: number;
  laborRate: number;
  deliveryCost: number;
  deliveryDistance: number;
  totalPrice: number;
}

export interface DeliveryCalculation {
  distance: number;
  cost: number;
  estimatedTime: number;
}

// ================================
// INTERFACE BASE PARA STORAGE
// ================================

export interface BaseStorage {
  // Métodos comunes que todas las implementaciones deben tener
}

// ================================
// INTERFACE PARA MASTER STORAGE
// ================================

export interface MasterStorage extends BaseStorage {
  // ========================================
  // VIRTUAL STORES MANAGEMENT
  // ========================================
  getAllVirtualStores(): Promise<VirtualStore[]>;
  getVirtualStore(storeId: number): Promise<VirtualStore | null>;
  createStore(storeData: CreateStoreData): Promise<VirtualStore>;
  updateStore(storeId: number, updates: Partial<VirtualStore>): Promise<VirtualStore>;
  deleteStore(storeId: number): Promise<boolean>;
  isStoreActive(storeId: number): Promise<boolean>;

  // ========================================
  // GLOBAL USERS (Super Admins)
  // ========================================
  createGlobalUser(userData: InsertGlobalUser): Promise<GlobalUser>;
  getGlobalUser(username: string): Promise<GlobalUser | null>;
  getGlobalUserById(id: number): Promise<GlobalUser | null>;
  listGlobalUsers(): Promise<GlobalUser[]>;
  updateGlobalUser(id: number, updates: Partial<InsertGlobalUser>): Promise<GlobalUser>;
  deleteGlobalUser(id: number): Promise<boolean>;
  getGlobalUserByUsername(username: string): Promise<GlobalUser | null>;


  // ========================================
  // STORE USERS (Owners, Admins)
  // ========================================
  createStoreUser(userData: InsertStoreUser): Promise<StoreUser>;
  getStoreUser(username: string): Promise<StoreUser | null>;
  getStoreUserById(id: number): Promise<StoreUser | null>;
  listStoreUsers(): Promise<StoreUserListItem[]>;
  getStoreUsersByStoreId(storeId: number): Promise<StoreUser[]>;
  updateStoreUser(id: number, updates: Partial<InsertStoreUser>): Promise<StoreUser>;
  deleteStoreUser(id: number): Promise<boolean>;

  // ========================================
  // USER UTILITIES
  // ========================================
  findUserAnyLevel(username: string): Promise<{
    user: any;
    level: 'global' | 'store' | null;
    storeId?: number;
  }>;
  getUserStats(): Promise<UserStats>;
  authenticateUser(username: string, password: string, storeId?: number): Promise<any>;

  // ========================================
  // WHATSAPP CENTRAL MANAGEMENT
  // ========================================
  getAllWhatsAppConfigs(): Promise<WhatsAppSettings[]>;
  getWhatsAppConfig(storeId: number): Promise<WhatsAppSettings | null>;
  getWhatsAppConfigByPhoneNumberId(phoneNumberId: string): Promise<WhatsAppSettings | null>;
  createWhatsAppConfig(config: InsertWhatsAppSettings): Promise<WhatsAppSettings>;
  updateWhatsAppConfig(storeId: number, config: Partial<InsertWhatsAppSettings>): Promise<WhatsAppSettings>;
  updateWhatsAppConfigById(id: number, config: Partial<InsertWhatsAppSettings>): Promise<WhatsAppSettings>;
  deleteWhatsAppConfig(id: number): Promise<boolean>;

  // ========================================
  // WHATSAPP LOGS (CENTRAL)
  // ========================================
  getAllWhatsAppLogs(limit?: number, offset?: number, filters?: WhatsAppLogFilters): Promise<WhatsAppLog[]>;
  getWhatsAppLogStats(storeId?: number): Promise<any>;
  cleanupOldWhatsAppLogs(days?: number): Promise<number>;
  addWhatsAppLog(log: InsertWhatsAppLog): Promise<WhatsAppLog>;

  // ========================================
  // SYSTEM METRICS
  // ========================================
  getSystemMetrics(): Promise<{
    totalStores: number;
    activeStores: number;
    totalUsers: number;
    totalOrders: number;
    totalRevenue: number;
    totalMessages: number;
  }>;

   /**
   * Test de conectividad
   */
  testConnection(): Promise<{ connected: boolean; message: string }>;

  /**
   * Obtiene logs de WhatsApp
   */
  getWhatsAppLogs(
    storeId: number,
    phoneNumberId?: string,
    limit?: number,
    offset?: number
  ): Promise<WhatsAppLog[]>;

  /**
   * Gestión de tiendas virtuales
   */
  createStore(storeData: any): Promise<VirtualStore>;
  updateStore(id: number, updates: any): Promise<VirtualStore | null>;
  deleteStore(id: number): Promise<boolean>;
  getVirtualStore(id: number): Promise<VirtualStore | null>;
  getAllVirtualStores(): Promise<VirtualStore[]>;

  // ========================================
  // AI CREDITS MANAGEMENT
  // ========================================
  getAICredits(storeId: number): Promise<any>;
  updateAICredits(storeId: number, data: any): Promise<any>;
}

// ================================
// INTERFACE PARA TENANT STORAGE
// ================================

export interface TenantStorage extends BaseStorage {
  // Store context
  readonly storeId: number;

  // ========================================
  // PRODUCTS
  // ========================================
  getAllProducts(): Promise<Product[]>;
  getProductById(id: number): Promise<Product | null>;
  getProductBySku(sku: string): Promise<Product | null>;
  createProduct(productData: InsertProduct): Promise<Product>;
  updateProduct(id: number, updates: Partial<InsertProduct>): Promise<Product>;
  deleteProduct(id: number): Promise<void>;
  getProductsByCategory(category: string): Promise<Product[]>;
  searchProducts(query: string): Promise<Product[]>;

  // ========================================
  // CATEGORIES
  // ========================================
  getAllCategories(): Promise<ProductCategory[]>;
  getCategoryById(id: number): Promise<ProductCategory | null>;
  createCategory(categoryData: InsertProductCategory): Promise<ProductCategory>;
  updateCategory(id: number, updates: Partial<InsertProductCategory>): Promise<ProductCategory>;
  deleteCategory(id: number): Promise<void>;
  getActiveCategories(): Promise<ProductCategory[]>;

  // ========================================
// BRANDS
// ========================================
getAllBrands(): Promise<ProductBrand[]>;
getBrandById(id: number): Promise<ProductBrand | null>;
getBrandByName(name: string): Promise<ProductBrand | null>;
createBrand(brandData: InsertProductBrand): Promise<ProductBrand>;
updateBrand(id: number, updates: Partial<InsertProductBrand>): Promise<ProductBrand>;
deleteBrand(id: number): Promise<void>;
getActiveBrands(): Promise<ProductBrand[]>;

  // ========================================
  // CUSTOMERS
  // ========================================
  getAllCustomers(): Promise<Customer[]>;
  getCustomerById(id: number): Promise<Customer | null>;
  getCustomerByPhone(phone: string): Promise<Customer | null>;
  getCustomerByEmail(email: string): Promise<Customer | null>;
  createCustomer(customerData: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, updates: Partial<InsertCustomer>): Promise<Customer>;
  deleteCustomer(id: number): Promise<void>;
  updateCustomerLocation(id: number, location: {
    latitude: string;
    longitude: string;
    address: string;
    mapLink?: string;
  }): Promise<Customer>;
  getVipCustomers(): Promise<Customer[]>;

   // ========================================
  // CLEANUP & MAINTENANCE
  // ========================================
  cleanupExpiredRegistrationFlows(): Promise<number>;
  cleanupOldConversations(daysOld: number): Promise<{ conversationsDeleted: number; messagesDeleted: number }>;
  cleanupOrphanData(): Promise<{ conversationsFixed: number; messagesFixed: number }>;
  verifyConversationHealth(): Promise<{
    isHealthy: boolean;
    issues: string[];
    stats: any;
  }>;

  // ========================================
  // ORDERS
  // ========================================
  getAllOrders(): Promise<OrderWithDetails[]>;
  getOrderById(id: number): Promise<OrderWithDetails | null>;
  getOrderByNumber(orderNumber: string): Promise<OrderWithDetails | null>;
  createOrder(orderData: InsertOrder, items: InsertOrderItem[]): Promise<OrderWithDetails>;
  updateOrder(id: number, updates: Partial<InsertOrder>): Promise<Order>;
  deleteOrder(id: number): Promise<void>;
  assignOrder(orderId: number, userId: number): Promise<Order>;
  updateOrderStatus(orderId: number, status: string, userId?: number, notes?: string): Promise<Order>;
  getTechnicianOrders(userId: number): Promise<OrderWithDetails[]>;
  getOrdersByStatus(status: string): Promise<OrderWithDetails[]>;
  getOrdersByDateRange(startDate: Date, endDate: Date): Promise<OrderWithDetails[]>;

  // ========================================
  // ORDER ITEMS & HISTORY
  // ========================================
  getOrderItems(orderId: number): Promise<OrderItemWithProduct[]>;
  createOrderItem(orderItemData: InsertOrderItem): Promise<OrderItem>;
  updateOrderItem(id: number, updates: Partial<InsertOrderItem>): Promise<OrderItem>;
  deleteOrderItem(id: number): Promise<void>;
  getOrderHistory(orderId: number): Promise<OrderHistory[]>;
  addOrderHistory(historyData: InsertOrderHistory): Promise<OrderHistory>;

  // ========================================
  // CONVERSATIONS & MESSAGES
  // ========================================
  getAllConversations(): Promise<ConversationWithDetails[]>;
  getConversationById(id: number): Promise<ConversationWithDetails | null>;
  getConversationByCustomerId(customerId: number): Promise<ConversationWithDetails | null>;
  getConversationByCustomerPhone(phone: string): Promise<ConversationWithDetails | null>;
  createConversation(conversationData: InsertConversation): Promise<Conversation>;
  updateConversation(id: number, updates: Partial<InsertConversation>): Promise<Conversation>;
  getActiveConversations(): Promise<ConversationWithDetails[]>;

  getMessagesByConversation(conversationId: number): Promise<Message[]>;
  createMessage(messageData: InsertMessage): Promise<Message>;
  markMessagesAsRead(conversationId: number): Promise<void>;

  // ========================================
  // AUTO RESPONSES
  // ========================================
  getAllAutoResponses(): Promise<AutoResponse[]>;
  getAutoResponseById(id: number): Promise<AutoResponse | null>;
  getAutoResponsesByTrigger(trigger: string): Promise<AutoResponse[]>;
  getAutoResponseByTrigger(trigger: string): Promise<AutoResponse | null>;
  createAutoResponse(responseData: InsertAutoResponse): Promise<AutoResponse>;
  updateAutoResponse(id: number, updates: Partial<InsertAutoResponse>): Promise<AutoResponse>;
  deleteAutoResponse(id: number): Promise<void>;
  getActiveAutoResponses(): Promise<AutoResponse[]>;
  resetAutoResponsesToDefault(): Promise<void>;

  // ========================================
  // CUSTOMER REGISTRATION FLOWS
  // ========================================
  getRegistrationFlow(phoneNumber: string): Promise<CustomerRegistrationFlow | null>;
  getRegistrationFlowByCustomerId(customerId: number): Promise<CustomerRegistrationFlow | null>;
  getAllRegistrationFlows(): Promise<CustomerRegistrationFlow[]>;
  createRegistrationFlow(flowData: InsertCustomerRegistrationFlow): Promise<CustomerRegistrationFlow>;
  createOrUpdateRegistrationFlow(flowData: any): Promise<CustomerRegistrationFlow>;
  updateRegistrationFlow(phoneNumber: string, updates: Partial<InsertCustomerRegistrationFlow>): Promise<CustomerRegistrationFlow>;
  updateRegistrationFlowStep(customerId: number, newStep: string, newData?: any): Promise<CustomerRegistrationFlow>;
  deleteRegistrationFlow(customerId: number): Promise<void>;

  // ========================================
  // EMPLOYEE PROFILES
  // ========================================
  getAllEmployeeProfiles(): Promise<(EmployeeProfile & { user: User })[]>;
  getEmployeeProfile(userId: number): Promise<EmployeeProfile | null>;
  getEmployeeProfileByEmployeeId(employeeId: string): Promise<EmployeeProfile | null>;
  getTechnicianOrders(userId: number): Promise<OrderWithDetails[]>;
  createEmployeeProfile(profileData: InsertEmployeeProfile): Promise<EmployeeProfile>;
  updateEmployeeProfile(id: number, updates: Partial<InsertEmployeeProfile>): Promise<EmployeeProfile>;
  deleteEmployeeProfile(id: number): Promise<void>;
  getEmployeesByDepartment(department: string): Promise<(EmployeeProfile & { user: User })[]>;
  generateEmployeeId(department: string): Promise<string>;
  getAvailableTechnicians(specializations?: string[], maxDistance?: number, customerLocation?: { latitude: string; longitude: string }): Promise<(EmployeeProfile & { user: User })[]>;

  // ========================================
  // ASSIGNMENT RULES & AUTO ASSIGNMENT
  // ========================================
  getAllAssignmentRules(): Promise<AssignmentRule[]>;
  getAssignmentRule(id: number): Promise<AssignmentRule | null>;
  createAssignmentRule(ruleData: InsertAssignmentRule): Promise<AssignmentRule>;
  updateAssignmentRule(id: number, updates: Partial<InsertAssignmentRule>): Promise<AssignmentRule>;
  deleteAssignmentRule(id: number): Promise<void>;
  getActiveAssignmentRules(): Promise<AssignmentRule[]>;
  findBestTechnician(orderId: number, customerLocation?: { latitude: string; longitude: string }): Promise<TechnicianMatch | null>;
  autoAssignOrder(orderId: number): Promise<AutoAssignResult>;

  // ========================================
  // NOTIFICATIONS
  // ========================================
  getUserNotifications(userId: number): Promise<Notification[]>;
  getUnreadNotifications(userId: number): Promise<Notification[]>;
  createNotification(notificationData: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: number): Promise<Notification>;
  markAllNotificationsAsRead(userId: number): Promise<void>;
  deleteNotification(id: number): Promise<void>;
  getNotificationCounts(userId: number): Promise<{ total: number; unread: number }>;
getNotificationEvents(): Promise<NotificationEvent[]>;

  // ========================================
  // SHOPPING CART
  // ========================================
  getCart(sessionId: string, userId?: number): Promise<CartWithItems>;
  addToCart(sessionId: string, productId: number, quantity: number, userId?: number): Promise<void>;
  updateCartQuantity(sessionId: string, productId: number, quantity: number, userId?: number): Promise<void>;
  removeFromCart(sessionId: string, productId: number, userId?: number): Promise<void>;
  clearCart(sessionId: string, userId?: number): Promise<void>;

  // ========================================
  // CUSTOMER HISTORY
  // ========================================
  getCustomerHistory(customerId: number): Promise<CustomerHistory[]>;
  addCustomerHistoryEntry(entryData: InsertCustomerHistory): Promise<CustomerHistory>;
  updateCustomerStats(customerId: number): Promise<void>;
  getCustomerWithHistory(customerId: number): Promise<Customer & { history: CustomerHistory[] } | null>;

  // ========================================
  // WHATSAPP (TENANT SPECIFIC)
  // ========================================
  addWhatsAppLog(logData: InsertWhatsAppLog): Promise<WhatsAppLog>;
  getWhatsAppLogs(limit?: number, offset?: number, filters?: WhatsAppLogFilters): Promise<WhatsAppLog[]>;

  // ========================================
  // STORE SETTINGS
  // ========================================
  getStoreSettings(): Promise<StoreSettings | null>;
  updateStoreSettings(settings: Partial<StoreSettings>): Promise<StoreSettings>;

  // ========================================
  // TENANT USERS (OPERATIONAL)
  // ========================================
  getAllUsers(): Promise<User[]>;
  getUserById(id: number): Promise<User | null>;
  getUserByUsername(username: string): Promise<User | null>;
  createUser(userData: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<InsertUser>): Promise<User>;
  deleteUser(id: number): Promise<void>;
  getUsersByRole(role: string): Promise<User[]>;


  getOrderItems(orderId: number): Promise<any[]>;


  // ========================================
// BRANDS MANAGEMENT
// ========================================
getAllBrands(): Promise<Brand[]>;
getBrandById(id: number): Promise<Brand | null>;
createBrand(brandData: any): Promise<Brand>;
updateBrand(id: number, updates: any): Promise<Brand>;
deleteBrand(id: number): Promise<void>;
getProductsByBrand(brandId: number): Promise<Product[]>;

// ========================================
// NOTIFICATION MANAGEMENT
// ========================================
getNotificationConfigs(): Promise<NotificationConfig[]>;

getNotificationChannels(): Promise<NotificationChannel[]>;
getNotificationConfigById(id: number): Promise<NotificationConfig | null>;
createNotificationConfig(configData: any): Promise<NotificationConfig>;
updateNotificationConfig(id: number, updates: any): Promise<NotificationConfig>;
updateNotificationChannel(id: string, updates: any): Promise<NotificationChannel>;
deleteNotificationConfig(id: number): Promise<void>;
getNotificationCounts(userId: number): Promise<{ total: number; unread: number }>;
getUserNotifications(userId: number): Promise<Notification[]>;
markNotificationAsRead(id: number): Promise<void>;
markAllNotificationsAsRead(userId: number): Promise<void>;
createNotification(notificationData: any): Promise<Notification>;
getNotificationHistory(userId: number): Promise<NotificationHistory[]>;

// ========================================
// TECHNICIAN & CONVERSATIONS
// ========================================
getTechnicianConversations(technicianId: number): Promise<ConversationWithDetails[]>;
markConversationMessagesAsRead(conversationId: number, userId: number): Promise<void>;

// ========================================
// ORDER & ITEMS
// ========================================
getOrderItemsByOrderId(orderId: number): Promise<OrderItem[]>;

// ========================================
// STORE EMPLOYEES & SETTINGS
// ========================================
getStoreEmployeesAndAdmins(): Promise<User[]>;
getUserWorkload(userId: number): Promise<UserWorkload>;
testConnection(): Promise<boolean>;

// ========================================
// REGISTRATION FLOW
// ========================================
getRegistrationFlowById(id: number): Promise<RegistrationFlow | null>;
createRegistrationFlow(flowData: any): Promise<RegistrationFlow>;
updateRegistrationFlow(id: number, updates: any): Promise<RegistrationFlow>;
repairRegistrationFlow(flowData: any): Promise<RegistrationFlow>;

// ========================================
// EMPLOYEE PROFILES
// ========================================
getAllEmployeeProfiles(): Promise<EmployeeProfile[]>;
getEmployeeProfileById(id: number): Promise<EmployeeProfile | null>;
createEmployeeProfile(profileData: any): Promise<EmployeeProfile>;
updateEmployeeProfile(id: number, updates: any): Promise<EmployeeProfile>;
deleteEmployeeProfile(id: number): Promise<void>;

  // ========================================
  // METRICS & ANALYTICS
  // ========================================
  getDashboardMetrics(): Promise<DashboardMetrics>;
  getDashboardStats(): Promise<DashboardMetrics>;
  getReports(filters: ReportFilters): Promise<any>;
  calculateServicePrice(
    serviceId: number,
    installationComplexity: number,
    partsNeeded: Array<{productId: number; quantity: number}>,
    customerLatitude?: string,
    customerLongitude?: string
  ): Promise<ServicePriceCalculation>;

  // ========================================
  // UTILITIES
  // ========================================
  determineConversationType(customerId: number): Promise<'initial' | 'tracking' | 'support'>;

  // ========================================
  // AI CREDITS MANAGEMENT
  // ========================================
  getAICredits(): Promise<any>;
  logAIUsage(entry: any): Promise<any>;
  getAIUsageStats(days?: number): Promise<any>;

  // ========================================
  // AI CONVERSATIONS
  // ========================================
  getAIConversation(conversationId: number): Promise<any>;
  createAIConversation(data: any): Promise<any>;
  updateAIConversation(conversationId: number, updates: any): Promise<any>;
}

// ================================
// INTERFACE PARA STORAGE FACTORY
// ================================

export interface StorageFactory {
  getMasterStorage(): MasterStorage;
  getTenantStorage(storeId: number): Promise<TenantStorage>;
  clearTenantCache(storeId?: number): void;
}

// ================================
// INTERFACE PARA UNIFIED STORAGE
// ================================

export interface UnifiedStorageInterface {
  readonly storeId?: number;
  
  // Master operations
  master: MasterStorage;
  
  // Tenant operations (require storeId)
  tenant(): Promise<TenantStorage>;
  
  // Convenience methods
  getProducts(): Promise<Product[]>;
  getCustomers(): Promise<Customer[]>;
  getOrders(): Promise<OrderWithDetails[]>;
  getAllStores(): Promise<VirtualStore[]>;
  getStore(): Promise<VirtualStore | null>;
}
