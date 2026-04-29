import { pgTable, text, serial, integer, boolean, timestamp, decimal, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { makeInsertSchema } from "./schema.utils";

// ================================
// SISTEMA TIENDA ÚNICA - NO MULTI-TENANT
// ================================
// ⚠️ NOTA: virtualStores y systemUsers ya NO existen en la base de datos
// El sistema ahora usa una única tienda con ID fijo = 1
// Todas las configuraciones están en store_settings

// ❌ TABLA REMOVIDA - Ya no existe en la BD
// export const virtualStores = pgTable("virtual_stores", {
//   ...
// });
// Usar store_settings en su lugar

// ❌ TABLA REMOVIDA - Ya no existe en la BD
// Ahora se usa la tabla "users" para todos los usuarios
// export const systemUsers = pgTable("system_users", {
//   ...
// });

// ❌ TABLAS REMOVIDAS - Sistema multi-tenant ya no existe
// export const subscriptionPlans = pgTable("subscription_plans", { ... });
// export const storeSubscriptions = pgTable("store_subscriptions", { ... });
// export const usageHistory = pgTable("usage_history", { ... });
// export const systemAuditLog = pgTable("system_audit_log", { ... });

// NOTA: Si necesitas estas tablas más adelante, descomenta y crea las migraciones
/*
export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  type: text("type").notNull().default("fixed"), // 'fixed', 'usage_based', 'hybrid'
  isActive: boolean("is_active").default(true),
  
  // Precios
  monthlyPrice: decimal("monthly_price", { precision: 10, scale: 2 }).default("0.00"),
  
  // Límites de recursos
  maxProducts: integer("max_products").default(-1), // -1 = ilimitado
  maxDbStorage: decimal("max_db_storage", { precision: 10, scale: 2 }).default("-1"), // GB, -1 = ilimitado
  maxWhatsappMessages: integer("max_whatsapp_messages").default(-1), // por mes, -1 = ilimitado
  maxUsers: integer("max_users").default(-1), // usuarios de la tienda
  maxOrders: integer("max_orders").default(-1), // órdenes por mes
  maxCustomers: integer("max_customers").default(-1), // -1 = ilimitado
  
  // Precios por uso (para planes usage_based o hybrid)
  pricePerProduct: decimal("price_per_product", { precision: 10, scale: 4 }).default("0.00"),
  pricePerMessage: decimal("price_per_message", { precision: 10, scale: 4 }).default("0.00"),
  pricePerGbStorage: decimal("price_per_gb_storage", { precision: 10, scale: 2 }).default("0.00"),
  pricePerOrder: decimal("price_per_order", { precision: 10, scale: 4 }).default("0.00"),

  // Créditos de IA incluidos en el plan
  aiCreditsIncluded: integer("ai_credits_included").default(0), // Créditos mensuales incluidos
  aiCostPerMessage: integer("ai_cost_per_message").default(1), // Costo en créditos por mensaje procesado
  aiCostPerOrder: integer("ai_cost_per_order").default(5), // Costo en créditos por orden creada
  aiCostPerVoiceNote: integer("ai_cost_per_voice_note").default(10), // Costo en créditos por nota de voz
  aiAutoRecharge: boolean("ai_auto_recharge").default(false), // Auto-recargar créditos al terminar
  aiRechargeAmount: integer("ai_recharge_amount").default(1000), // Cantidad a recargar automáticamente

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
*/

// Suscripciones activas de las tiendas (COMENTADO - No existe)
/*
export const storeSubscriptions = pgTable("store_subscriptions", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => virtualStores.id).notNull(),
  planId: integer("plan_id").references(() => subscriptionPlans.id).notNull(),
  
  status: text("status").notNull().default("active"), // 'active', 'suspended', 'cancelled', 'expired'
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date"),
  autoRenew: boolean("auto_renew").default(true),
  
  // Uso actual del período
  currentProducts: integer("current_products").default(0),
  currentDbStorage: decimal("current_db_storage_gb", { precision: 8, scale: 2 }).default("0.00"),
  currentWhatsappMessages: integer("current_whatsapp_messages").default(0),
  currentUsers: integer("current_users").default(0),
  currentOrders: integer("current_orders").default(0),
  currentCustomers: integer("current_customers").default(0),
  
  // Facturación
  lastBillingDate: timestamp("last_billing_date"),
  nextBillingDate: timestamp("next_billing_date"),
  billingCycle: text("billing_cycle").default("monthly"), // 'monthly', 'yearly'

  // Estados de pago
  paymentStatus: text("payment_status").default("pending"), // 'pending', 'paid', 'overdue', 'failed'
  lastPaymentDate: timestamp("last_payment_date"),
  totalPaid: decimal("total_paid", { precision: 12, scale: 2 }).default("0.00"),
  totalDue: decimal("total_due", { precision: 12, scale: 2 }).default("0.00"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
*/

// Historial de uso y facturación (COMENTADO - No existe)
/*
export const usageHistory = pgTable("usage_history", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => virtualStores.id).notNull(),
  subscriptionId: integer("subscription_id").references(() => storeSubscriptions.id).notNull(),
  
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  
  // Uso registrado en el período
  productsUsed: integer("products_used").default(0),
  dbStorageUsed: decimal("db_storage_used_gb", { precision: 8, scale: 2 }).default("0.00"),
  whatsappMessagesUsed: integer("whatsapp_messages_used").default(0),
  usersActive: integer("users_active").default(0),
  ordersProcessed: integer("orders_processed").default(0),
  customersActive: integer("customers_active").default(0),
  
  // Costos calculados
  fixedCost: decimal("fixed_cost", { precision: 10, scale: 2 }).default("0.00"),
  usageCost: decimal("usage_cost", { precision: 10, scale: 2 }).default("0.00"),
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }).default("0.00"),
  
  createdAt: timestamp("created_at").defaultNow(),
});
*/

// Tabla de auditoría para el sistema multi-tenant (COMENTADO - No existe)
/*
export const systemAuditLog = pgTable("system_audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => systemUsers.id),
  storeId: integer("store_id").references(() => virtualStores.id),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: text("resource_id"),
  details: text("details"), // JSON con detalles de la acción
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});
*/

// ================================
// CONFIGURACIÓN DE TIENDA ÚNICA
// ================================

// ✅ Store configuration table (TABLA PRINCIPAL PARA TIENDA ÚNICA)
export const storeSettings = pgTable("store_settings", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  storeWhatsAppNumber: text("store_whatsapp_number").notNull(),
  storeName: text("store_name").notNull(),
  storeAddress: text("store_address"),
  storeEmail: text("store_email"),
  storePhone: text("store_phone"),
  // 🧾 FACTURA - Logo y campos para factura
  logoUrl: text("logo_url"), // URL del logo en Supabase
  logoStoragePath: text("logo_storage_path"), // Ruta en Supabase storage
  invoiceFooter: text("invoice_footer"), // Texto personalizado para pie de factura
  invoiceNumber: integer("invoice_number").default(1), // Número secuencial de facturas
  // 🏪 Información de la tienda
  businessHours: text("business_hours").default("09:00-18:00"),
  deliveryRadius: text("delivery_radius").default("50"),
  baseSiteUrl: text("base_site_url"),
  // ⚙️ Configuraciones generales
  enableNotifications: boolean("enable_notifications").default(true),
  autoAssignOrders: boolean("auto_assign_orders").default(true),
  currency: text("currency").default("DOP"),
  taxPercentage: decimal("tax_percentage", { precision: 5, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ================================
// ESQUEMAS PARA BASES DE DATOS POR TIENDA
// ================================

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  role: text('role').notNull(),
  address: text('address'),
  status: text('status').default('active'),
  employeeProfileId: integer('employee_profile_id').references(() => employeeProfiles.id), // Nueva columna
  lastLogin: timestamp('last_login'),
  currentOrders: integer('current_orders').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),

   // ✅ NUEVOS CAMPOS - Ubicación del técnico
  province: text('province'),
  municipality: text('municipality'),
  sector: text('sector'),
  
  // ✅ NUEVOS CAMPOS - Cobertura geográfica (arrays)
  coverageProvinces: text('coverage_provinces').array(),
  coverageMunicipalities: text('coverage_municipalities').array(),
  coverageSectors: text('coverage_sectors').array(),
  
  // ✅ NUEVOS CAMPOS - Especializaciones (array)
  specializations: text('specializations').array(),
  
  // ✅ NUEVOS CAMPOS - Carga de trabajo

  maxDailyOrders: integer('max_daily_orders').default(10),
  
  // ✅ NUEVOS CAMPOS - Nivel de habilidad
  skillLevel: integer('skill_level').default(1),
});

// ================================
// SISTEMA DE ROLES Y PERMISOS (RBAC)
// ================================

// Tabla de roles del sistema
export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(), // Identificador interno (ej: 'admin', 'supervisor')
  displayName: text('display_name').notNull(), // Nombre para mostrar (ej: 'Administrador', 'Supervisor')
  description: text('description'), // Descripción del rol
  isSystem: boolean('is_system').default(false), // true para roles no editables (admin)
  isActive: boolean('is_active').default(true), // Estado del rol
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Tabla de vistas/páginas disponibles en el sistema
export const views = pgTable('views', {
  id: serial('id').primaryKey(),
  routePath: text('route_path').notNull().unique(), // Ruta de la vista (ej: '/dashboard', '/orders')
  label: text('label').notNull(), // Etiqueta para mostrar (ej: 'Dashboard', 'Pedidos')
  iconName: text('icon_name').notNull(), // Nombre del ícono de lucide-react (ej: 'ChartLine', 'ShoppingCart')
  permissionRequired: text('permission_required').notNull(), // Permiso requerido (ej: 'view_dashboard', 'manage_orders')
  section: text('section'), // Sección a la que pertenece (ej: 'core', 'admin', 'sales')
  isSystem: boolean('is_system').default(false), // true para vistas del sistema que no se pueden eliminar
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Tabla de permisos de vistas por rol (incluye orden de visualización)
export const rolePermissions = pgTable('role_permissions', {
  id: serial('id').primaryKey(),
  roleId: integer('role_id').references(() => roles.id, { onDelete: 'cascade' }).notNull(),
  viewId: integer('view_id').references(() => views.id, { onDelete: 'cascade' }).notNull(),
  canAccess: boolean('can_access').default(true), // Permiso de acceso
  sortOrder: integer('sort_order').default(0), // Orden de visualización en el sidebar (menor = primero)
  createdAt: timestamp('created_at').defaultNow(),
});

// Tabla de asignación de roles a usuarios
export const userRoles = pgTable('user_roles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  roleId: integer('role_id').references(() => roles.id, { onDelete: 'restrict' }).notNull(),
  isPrimary: boolean('is_primary').default(true), // true para el rol principal del usuario
  assignedAt: timestamp('assigned_at').defaultNow(),
});

// ================================
// TIPOS DE CLIENTES Y CATEGORIZACIÓN
// ================================

// Tabla de tipos de clientes (Minorista, Mayorista, Revendedor, etc.)
export const customerTypes = pgTable("customer_types", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  name: text("name").notNull(), // "Minorista", "Mayorista", "Revendedor"
  description: text("description"),
  discountPercentage: decimal("discount_percentage", { precision: 5, scale: 2 }).default("0.00"), // % de descuento
  isActive: boolean("is_active").default(true),
  color: text("color").default("#3b82f6"), // Color para identificación visual
  icon: text("icon"), // Icono opcional
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  storeId: integer("store_id").notNull(),
  whatsappId: text("whatsapp_id"),
  email: text("email").unique().notNull(),

  // Categorización
  customerTypeId: integer("customer_type_id").references(() => customerTypes.id), // Tipo de cliente
  category: text("category").default("regular"), // "regular", "vip", "wholesale", "reseller"
  parentCustomerId: integer("parent_customer_id").references(() => customers.id), // Cliente padre (los puntos se acumulan al padre)

  // Ubicación
  address: text("address"),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  mapLink: text("map_link"),

  // Contacto
  lastContact: timestamp("last_contact"),
  registrationDate: timestamp("registration_date").defaultNow(),
  birthdayDate: timestamp("birthday_date"),

  // Estadísticas
  totalOrders: integer("total_orders").default(0),
  totalSpent: decimal("total_spent", { precision: 10, scale: 2 }).default("0.00"),

  // Estado
  isVip: boolean("is_vip").default(false),
  isActive: boolean("is_active").default(true),

  // Notas
  notes: text("notes"),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});


export const customerHistory = pgTable("customer_history", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  action: text("action").notNull(), // 'order_created', 'order_completed', 'contact_updated', 'note_added'
  description: text("description").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }),
  metadata: text("metadata"), // JSON string for additional data
  createdAt: timestamp("created_at").defaultNow(),
});

// ================================
// SISTEMA DE PUNTOS DE LEALTAD
// ================================

// Balance de puntos de lealtad por cliente
export const customerLoyaltyBalance = pgTable("customer_loyalty_balance", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customers.id).notNull().unique(), // Un balance por cliente
  storeId: integer("store_id").notNull(),

  // Balance de puntos
  totalPointsEarned: decimal("total_points_earned", { precision: 12, scale: 2 }).default("0.00"), // Total ganado histórico
  totalPointsRedeemed: decimal("total_points_redeemed", { precision: 12, scale: 2 }).default("0.00"), // Total canjeado
  currentBalance: decimal("current_balance", { precision: 12, scale: 2 }).default("0.00"), // Balance actual

  // Información del programa de puntos
  loyaltyProgramName: text("loyalty_program_name"), // Nombre del programa (ej: "Puntos VIP", "Rewards")
  pointsPropertyName: text("points_property_name"), // Nombre de la unidad (ej: "LP", "PUNTOS", "REWARDS")

  // Fechas
  lastEarnedAt: timestamp("last_earned_at"), // Última vez que ganó puntos
  lastRedeemedAt: timestamp("last_redeemed_at"), // Última vez que canjeó puntos

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Transacciones de puntos de lealtad
export const loyaltyPointsTransactions = pgTable("loyalty_points_transactions", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  storeId: integer("store_id").notNull(),

  // Tipo de transacción
  type: text("type").notNull(), // "earned" (ganado), "redeemed" (canjeado), "expired" (expirado), "adjusted" (ajuste manual)

  // Puntos
  points: decimal("points", { precision: 12, scale: 2 }).notNull(), // Positivo para earned, negativo para redeemed
  balanceBefore: decimal("balance_before", { precision: 12, scale: 2 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 12, scale: 2 }).notNull(),

  // Referencia
  orderId: integer("order_id").references(() => orders.id), // Orden relacionada (si aplica)
  description: text("description").notNull(), // Descripción de la transacción

  // Metadata
  metadata: text("metadata"), // JSON con información adicional

  createdAt: timestamp("created_at").defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull(), // 'order', 'message', 'system', 'assignment', 'urgent'
  priority: text("priority").notNull().default("normal"), // 'low', 'normal', 'high', 'urgent'
  isRead: boolean("is_read").notNull().default(false),
  relatedId: integer("related_id"), // ID of related entity (order, message, etc.)
  relatedType: text("related_type"), // 'order', 'message', 'customer', 'user'
  metadata: text("metadata"), // JSON string for additional data
  createdAt: timestamp("created_at").defaultNow(),
  readAt: timestamp("read_at"),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
   baseCurrency: text("base_currency").notNull(), // 'USD', 'DOP'
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  category: text("category").notNull(), // 'product', 'service'
  status: text("status").notNull().default("active"), // 'active', 'inactive'
  // Catalog functionality
  imageUrl: text("image_url"),
  images: text("images").array(), // Array of image URLs for gallery
  sku: text("sku").unique(), // Product SKU/code
  barcode: text("barcode"), // Código de barras del producto
  brand: text("brand"),
  model: text("model"),
  specifications: text("specifications"), // JSON string for technical specs
  features: text("features").array(), // Array of feature descriptions
  warranty: text("warranty"),
  availability: text("availability").notNull().default("in_stock"), // 'in_stock', 'out_of_stock', 'limited', 'pre_order'
  stockQuantity: integer("stock_quantity").default(0),
  minQuantity: integer("min_quantity").default(1),
  maxQuantity: integer("max_quantity"),
  lotNumber: text("lot_number"),
  expirationDate: timestamp("expiration_date"),
  weight: decimal("weight", { precision: 8, scale: 2 }), // kg
  dimensions: text("dimensions"), // JSON string: {"length": 100, "width": 50, "height": 30}
  tags: text("tags").array(), // Array of search tags
  salePrice: decimal("sale_price", { precision: 10, scale: 2 }), // Optional discounted price
  isPromoted: boolean("is_promoted").default(false),
  promotionText: text("promotion_text"),
  // Fidelización - Plan de puntos
  loyaltyPointsPropertyName: text("loyalty_points_property_name"), // 'LP', 'PUNTOS', 'REWARDS', etc. (OPCIONAL)
  loyaltyPointsValue: decimal("loyalty_points_value", { precision: 10, scale: 2 }), // Valor numérico de puntos (OPCIONAL)
  // Sistema de conversión de unidades
  unitConversionEnabled: boolean("unit_conversion_enabled").default(false), // Activar conversión de unidades
  baseUnitId: integer("base_unit_id"), // Unidad base del producto (referencia a measurementUnits)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
   storeId: integer("store_id").notNull(),
});

// 🔧 SCHEMA COMPLETO para la tabla orders
// Incluye campo específico para número de contacto de entrega

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  customerId: integer("customer_id").references(() => customers.id),
  storeId: integer('store_id').notNull(),

  // Información de ubicación del cliente
  customerProvince: text("customer_province"),
  customerMunicipality: text("customer_municipality"),
  customerSector: text("customer_sector"),
  customerAddress: text("customer_address"),
  customerLatitude: decimal("customer_latitude", { precision: 10, scale: 8 }),
  customerLongitude: decimal("customer_longitude", { precision: 11, scale: 8 }),

  // ... resto de campos existentes
  assignedUserId: integer("assigned_user_id").references(() => users.id),
  assignedRuleId: integer("assigned_rule_id").references(() => assignmentRules.id),
  autoAssigned: boolean("auto_assigned").default(false),
  assignmentAttempts: integer("assignment_attempts").default(0),

  status: text("status").notNull().default("pending"),
  priority: text("priority").default("normal"),
  serviceType: text("service_type"),
  description: text("description"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).default("0"),
  // Payment info
  paymentMethod: text("payment_method"), // cash, card, transfer, credit
  paymentStatus: text("payment_status").notNull().default("pending"), // pending, paid, partial, credit
  receivedAmount: decimal("received_amount", { precision: 10, scale: 2 }),
  changeAmount: decimal("change_amount", { precision: 10, scale: 2 }),
  orderType: text("order_type").notNull().default("sale"), // sale, appointment, credit_payment
  // Discount info
  subtotalAmount: decimal("subtotal_amount", { precision: 10, scale: 2 }).default("0"),
  discountPercentage: decimal("discount_percentage", { precision: 5, scale: 2 }).default("0"),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).default("0"),
  // Fidelización - datos de puntos asociados a la orden
  loyaltyPointsPropertyName: text("loyalty_points_property_name"),
  loyaltyPointsValue: decimal("loyalty_points_value", { precision: 10, scale: 2 }),
  loyaltyPointsTotal: decimal("loyalty_points_total", { precision: 12, scale: 2 }).default("0"),
  loyaltyPointsCredited: boolean("loyalty_points_credited").default(false), // ✅ NUEVO: Indica si los puntos ya fueron acreditados
  loyaltyPointsCreditedAt: timestamp("loyalty_points_credited_at"), // ✅ NUEVO: Fecha de acreditación

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  scheduledDate: timestamp("scheduled_date"),
  completedDate: timestamp("completed_date"),
  // Agregar campo:
tripId: integer("trip_id").references(() => trips.id),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
  // Service-specific pricing components (only for services)
  installationCost: decimal("installation_cost", { precision: 10, scale: 2 }),
  partsCost: decimal("parts_cost", { precision: 10, scale: 2 }),
  laborHours: decimal("labor_hours", { precision: 4, scale: 2 }),
  laborRate: decimal("labor_rate", { precision: 10, scale: 2 }),
  // Delivery/shipping cost (for products and services)
  deliveryCost: decimal("delivery_cost", { precision: 10, scale: 2 }).default("0"),
  deliveryDistance: decimal("delivery_distance", { precision: 8, scale: 2 }), // km
  // Sistema de conversión de unidades
  unitId: integer("unit_id"), // Unidad en la que se realizó el pedido (referencia a measurementUnits)
  quantityInBaseUnit: decimal("quantity_in_base_unit", { precision: 12, scale: 4 }), // Cantidad normalizada a unidad base
  notes: text("notes"),
  storeId: integer("store_id"),
});

// ================================
// SISTEMA DE COMPRAS Y TRAZABILIDAD
// ================================

// Proveedores
export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  taxId: text("tax_id"), // RNC o cédula
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Órdenes de compra
export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  purchaseNumber: text("purchase_number").notNull().unique(), // PO-001, PO-002, etc.
  supplierId: integer("supplier_id").references(() => suppliers.id),
  supplierName: text("supplier_name"), // Cache del nombre del proveedor

  // Fechas
  orderDate: timestamp("order_date").notNull().defaultNow(),
  expectedDeliveryDate: timestamp("expected_delivery_date"),
  receivedDate: timestamp("received_date"),

  // Estado
  status: text("status").notNull().default("pending"), // pending, received, partial, cancelled

  // Montos
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).default("0.00"),
  tax: decimal("tax", { precision: 12, scale: 2 }).default("0.00"),
  discount: decimal("discount", { precision: 12, scale: 2 }).default("0.00"),
  shippingCost: decimal("shipping_cost", { precision: 12, scale: 2 }).default("0.00"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").default("DOP"), // DOP, USD

  // Referencias
  invoiceNumber: text("invoice_number"), // Número de factura del proveedor
  referenceNumber: text("reference_number"), // Número de referencia adicional

  // Detalles
  notes: text("notes"),
  paymentTerms: text("payment_terms"), // Términos de pago
  paymentStatus: text("payment_status").default("unpaid"), // unpaid, partial, paid

  // Auditoría
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Items de la orden de compra
export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: serial("id").primaryKey(),
  purchaseOrderId: integer("purchase_order_id").references(() => purchaseOrders.id, { onDelete: "cascade" }).notNull(),
  storeId: integer("store_id").notNull(),

  // Producto
  productId: integer("product_id").references(() => products.id),
  productName: text("product_name").notNull(), // Cache
  sku: text("sku"), // Cache
  barcode: text("barcode"), // Cache

  // Cantidad y unidades
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  quantityReceived: decimal("quantity_received", { precision: 12, scale: 2 }).default("0.00"),
  unitId: integer("unit_id"), // Unidad de medida

  // Trazabilidad
  lotNumber: text("lot_number"),
  expirationDate: timestamp("expiration_date"),
  manufacturingDate: timestamp("manufacturing_date"),

  // Precios
  unitCost: decimal("unit_cost", { precision: 12, scale: 2 }).notNull(),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0.00"), // Porcentaje de impuesto
  discountRate: decimal("discount_rate", { precision: 5, scale: 2 }).default("0.00"),
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }).notNull(),

  // Notas
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow(),
});

// Movimientos de inventario (actualizado con más campos)
export const inventoryMovements = pgTable("inventory_movements", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),

  // Tipo de movimiento
  type: text("type").notNull(), // purchase, sale, adjustment, return, transfer, damage, expired

  // Cantidad
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  quantityBefore: decimal("quantity_before", { precision: 12, scale: 2 }), // Stock anterior
  quantityAfter: decimal("quantity_after", { precision: 12, scale: 2 }), // Stock resultante
  unitId: integer("unit_id"),

  // Trazabilidad
  lotNumber: text("lot_number"),
  expirationDate: timestamp("expiration_date"),

  // Costos (para compras)
  unitCost: decimal("unit_cost", { precision: 12, scale: 2 }),
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }),

  // Referencias
  referenceType: text("reference_type"), // order, purchase_order, adjustment, return
  referenceId: integer("reference_id"),
  supplierId: integer("supplier_id").references(() => suppliers.id),

  // Detalles
  notes: text("notes"),
  reason: text("reason"), // Para ajustes, daños, etc.

  // Auditoría
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by"),
});

// Order workflow tracking
export const orderHistory = pgTable("order_history", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id).notNull(),
  userId: integer("user_id").references(() => users.id),
  statusFrom: text("status_from"),
  statusTo: text("status_to").notNull(),
  action: text("action").notNull(), // 'created', 'assigned', 'started', 'completed', 'cancelled', 'notes_added'
  notes: text("notes"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  orderId: integer("order_id").references(() => orders.id),
  conversationType: text("conversation_type").notNull().default("initial"), // 'initial', 'tracking', 'support'
  channelType: text("channel_type").notNull().default("whatsapp"), // ← NUEVO
  webAppEnabledUntil: timestamp("webapp_enabled_until"), // ← NUEVO
  status: text("status").notNull().default("active"), // 'active', 'closed'
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  storeId: integer("store_id").notNull(),
  // ✅ Agregar campos faltantes
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => conversations.id).notNull(),
  senderId: integer("sender_id").references(() => users.id),
  sender: text("sender"), // ✅ Agregar
  senderType: text("sender_type").notNull(), // 'customer', 'user'
  messageType: text("message_type").notNull().default("text"), // 'text', 'image', 'document'
  content: text("content").notNull(),
  whatsappMessageId: text("whatsapp_message_id"),
  metadata: text("metadata"), // ✅ Agregar
  storeId: integer("store_id"), // ✅ Agregar
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(), // ✅ Agregar
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  isFromCustomer: boolean("isFromCustomer").default(false), // ✅ Agregar
});

export const whatsappSettings = pgTable("whatsapp_settings", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(), // ID de tienda (siempre 1)
  accessToken: text("access_token").notNull(),
  phoneNumberId: text("phone_number_id").notNull(),
  webhookVerifyToken: text("webhook_verify_token").notNull(),
  businessAccountId: text("business_account_id"),
  appId: text("app_id"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const whatsappLogs = pgTable("whatsapp_logs", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // 'incoming', 'outgoing', 'webhook', 'error'
  phoneNumber: text("phone_number"),
  storeId: integer("store_id").notNull(), // ID de tienda (siempre 1)
  messageContent: text("message_content"),
  messageId: text("message_id"),
  status: text("status"), // 'sent', 'delivered', 'read', 'failed'
  errorMessage: text("error_message"),
  rawData: text("raw_data"), // JSON string
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const autoResponses = pgTable("auto_responses", {
  id: serial("id").primaryKey(),
   storeId: integer("store_id").notNull(), // ← Debe estar presente
  message: text("message").notNull(),     // ← Debe estar presente
  isInteractive: boolean("is_interactive").default(false), // ← Debe estar presente
  interactiveData: jsonb("interactive_data"), // ← Debe estar presente
  triggerText: text("trigger_text"),      // ← Debe estar presente
  name: text("name").notNull(),
  trigger: text("trigger").notNull(), // welcome, menu, product_inquiry, service_inquiry, contact_request, order_status, support, tracking
  isActive: boolean("is_active").default(true),
  priority: integer("priority").default(1),
  messageText: text("message_text").notNull(),
  requiresRegistration: boolean("requires_registration").default(false),
  menuOptions: text("menu_options"), // JSON array of menu options
  nextAction: text("next_action"), // next_menu, collect_data, create_order, assign_technician, show_products, show_services
  menuType: text("menu_type").default("buttons"), // buttons, list, quick_reply, text_only
  showBackButton: boolean("show_back_button").default(false),
  allowFreeText: boolean("allow_free_text").default(true),
  responseTimeout: integer("response_timeout").default(300), // seconds
  maxRetries: integer("max_retries").default(3),
  fallbackMessage: text("fallback_message"),
  conditionalDisplay: text("conditional_display"), // JSON conditions for when to show this response
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const customerRegistrationFlows = pgTable("customer_registration_flows", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customers.id),
  phoneNumber: text("phone_number").notNull(),
  currentStep: text("current_step").notNull(),
  flowType: text("flow_type"), // ✅ Agregar si no existe
  orderId: integer("order_id").references(() => orders.id), // ✅ AGREGAR ESTA LÍNEA
  orderNumber: text("order_number"),
  collectedData: text("collected_data"),
  requestedService: text("requested_service"),
  isCompleted: boolean("is_completed").default(false),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const trips = pgTable("trips", {
  id: serial("id").primaryKey(),
  tripNumber: text("trip_number").notNull().unique(), // TRIP-001, TRIP-002
  assignedUserId: integer("assigned_user_id").references(() => users.id),
  storeId: integer("store_id").notNull(),
  
  status: text("status").notNull().default("pending"), 
  // pending: Creado pero no enviado
  // active: Enviado al delivery
  // processing: Delivery empezó a recoger
  // completed: Todos los pedidos recogidos
  // cancelled: Cancelado
  
  totalOrders: integer("total_orders").default(0),
  completedOrders: integer("completed_orders").default(0),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).default("0"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  sentAt: timestamp("sent_at"), // Cuando admin envía el viaje
  startedAt: timestamp("started_at"), // Cuando delivery empieza
  completedAt: timestamp("completed_at"), // Cuando se completa
  
  // Metadatos
  notes: text("notes"),
  estimatedDuration: integer("estimated_duration"), // minutos
  actualDuration: integer("actual_duration"), // minutos
});

export const tripOrders = pgTable("trip_orders", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").references(() => trips.id).notNull(),
  orderId: integer("order_id").references(() => orders.id).notNull(),
  storeId: integer("store_id").notNull(),
  
  status: text("status").notNull().default("pending"),
  // pending: No recogido
  // picked: Recogido/Escaneado
  // skipped: Saltado (no disponible)
  
  pickedAt: timestamp("picked_at"),
  scannedQR: boolean("scanned_qr").default(false),
  
  sequenceNumber: integer("sequence_number"), // Orden de recogida
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});


// Employee management for different roles
export const employeeProfiles = pgTable('employee_profiles', {
  id: serial('id').primaryKey(),
  employeeId: text('employee_id').unique(),
  department: text('department').notNull(),
  position: text('position').notNull(),
  specializations: text('specializations').array(),
   notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Schema de validación para productos
export const ProductSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  description: z.string().min(1, "Descripción requerida"),
  price: z.string().refine(val => !isNaN(parseFloat(val)), "Precio inválido"),
  category: z.string().min(1, "Categoría requerida"),
  type: z.string().default("product"),
  brand: z.string().optional(),
  model: z.string().optional(),
  sku: z.string().optional(),
  isActive: z.boolean().default(true),
  stock: z.number().default(0),
  specifications: z.string().optional(),
  installationCost: z.string().optional(),
  warrantyMonths: z.number().default(0),
  imageUrls: z.array(z.string().url()).optional() // URLs de imágenes desde frontend
});


// shared/schema.ts - Actualización de assignmentRules

// ✅ AGREGAR ESTE CAMPO AL ESQUEMA EXISTENTE
export const assignmentRules = pgTable("assignment_rules", {
  id: serial("id").primaryKey(),
  storeId: integer('store_id').notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true),
  priority: integer("priority").default(1),
  
  // Criterios de ubicación
  useSectorBased: boolean("use_sector_based").default(true),
  requiredProvince: text("required_province"),
  requiredMunicipality: text("required_municipality"),
  requiredSectors: text("required_sectors").array(),
  allowAdjacentMunicipalities: boolean("allow_adjacent_municipalities").default(true),
  
  // Criterios de especialización
  useSpecializationBased: boolean("use_specialization_based").default(true),
  requiredSpecializations: text("required_specializations").array(),
  
  // Criterios de carga de trabajo
  useWorkloadBased: boolean("use_workload_based").default(true),
  maxOrdersPerTechnician: integer("max_orders_per_technician").default(5),
  
  // Criterios de tiempo
  useTimeBased: boolean("use_time_based").default(true),
  availabilityRequired: boolean("availability_required").default(true),
  
  // Aplicabilidad
  applicableProducts: text("applicable_products").array(),
  applicableServices: text("applicable_services").array(),
  
  // ✅ NUEVO: Usuarios específicos para asignación
  assignedUserIds: integer("assigned_user_ids").array(), // Array de user IDs específicos
  
  // Comportamiento de asignación
  assignmentMethod: text("assignment_method").default("closest_available"),
  autoAssign: boolean("auto_assign").default(true),
  notifyCustomer: boolean("notify_customer").default(true),
  estimatedResponseTime: integer("estimated_response_time").default(60),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Shopping cart for catalog system
export const shoppingCart = pgTable("shopping_cart", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(), // For guest users
  userId: integer("user_id").references(() => users.id), // For logged-in users
  productId: integer("product_id").references(() => products.id).notNull(),
  quantity: integer("quantity").notNull().default(1),
  notes: text("notes"), // Special instructions
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Product categories for better organization
export const productCategories = pgTable("product_categories", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  parentId: integer("parent_id"), // For subcategories - self-reference
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  
});

// Insert schemas
export const insertUserSchema = makeInsertSchema(users, {
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["admin", "technician", "seller", "delivery", ]),
  status: z.enum(["active", "busy", "break", "offline"]).optional(),
}, ["id", "createdAt", "updatedAt", "lastLogin"]);


export const insertCustomerTypeSchema = makeInsertSchema(customerTypes, {
  storeId: z.number(),
  name: z.string().min(1, "Nombre es requerido"),
  description: z.string().optional(),
  discountPercentage: z.string().refine(
    val => !isNaN(parseFloat(val)) && parseFloat(val) >= 0 && parseFloat(val) <= 100,
    "El descuento debe estar entre 0 y 100"
  ).optional(),
  isActive: z.boolean().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  sortOrder: z.number().optional(),
}, ["id", "createdAt", "updatedAt"]);

export const insertCustomerSchema = makeInsertSchema(customers, {
  storeId: z.number(),
  customerTypeId: z.number().optional(),
  category: z.enum(["regular", "vip", "wholesale", "reseller"]).optional(),
  lastContact: z.date().optional(),
  totalOrders: z.number().optional(),
  totalSpent: z.string().optional(),
  isVip: z.boolean().optional(),
  isActive: z.boolean().optional(),
}, ["id", "createdAt", "updatedAt"]);

export const insertCustomerLoyaltyBalanceSchema = makeInsertSchema(customerLoyaltyBalance, {
  customerId: z.number(),
  storeId: z.number(),
  totalPointsEarned: z.string().optional(),
  totalPointsRedeemed: z.string().optional(),
  currentBalance: z.string().optional(),
  loyaltyProgramName: z.string().optional(),
  pointsPropertyName: z.string().optional(),
}, ["id", "createdAt", "updatedAt"]);

export const insertLoyaltyPointsTransactionSchema = makeInsertSchema(loyaltyPointsTransactions, {
  customerId: z.number(),
  storeId: z.number(),
  type: z.enum(["earned", "redeemed", "expired", "adjusted"]),
  points: z.string().refine(val => !isNaN(parseFloat(val)), "Puntos deben ser un número válido"),
  balanceBefore: z.string(),
  balanceAfter: z.string(),
  orderId: z.number().optional(),
  description: z.string().min(1, "Descripción es requerida"),
  metadata: z.string().optional(),
}, ["id", "createdAt"]);

export const exchangeRates = pgTable("exchange_rates", {
  id: serial("id").primaryKey(),
  baseCurrency: text("base_currency").notNull(), // 'USD', 'DOP'
  targetCurrency: text("target_currency").notNull(), // 'USD', 'DOP'
  rate: decimal("rate", { precision: 10, scale: 6 }).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  isActive: boolean("is_active").default(true),
  storeId: integer("store_id").notNull(),
  updatedBy: integer("updated_by").references(() => users.id), // Usuario que actualizó
});


// Configuración de canales de notificación
export const notificationChannels = pgTable("notification_channels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // whatsapp, email, app
  isEnabled: boolean("is_enabled").default(true),
  settings: jsonb("settings"), // Configuraciones específicas del canal
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Configuración de eventos de notificación
export const notificationEvents = pgTable("notification_events", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(), // order_created, order_status_changed, assignment_changed
  eventName: text("event_name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Configuración de notificaciones por evento
export const notificationConfigs = pgTable("notification_configs", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").references(() => notificationEvents.id).notNull(),
  channelId: integer("channel_id").references(() => notificationChannels.id).notNull(),
  isEnabled: boolean("is_enabled").default(true),
  recipientType: text("recipient_type").notNull(), // customer, technician, admin, custom
  customRecipients: text("custom_recipients").array(), // Para recipientType = custom
  template: text("template").notNull(), // Template del mensaje
  priority: text("priority").default("normal"), // low, normal, high, urgent
  delayMinutes: integer("delay_minutes").default(0), // Retraso en envío
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Historial de notificaciones enviadas
export const notificationHistory = pgTable("notification_history", {
  id: serial("id").primaryKey(),
  configId: integer("config_id").references(() => notificationConfigs.id),
  orderId: integer("order_id"), // Referencia a la orden que disparó la notificación
  recipientId: integer("recipient_id"), // ID del usuario destinatario
  recipientType: text("recipient_type").notNull(),
  channel: text("channel").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  status: text("status").default("pending"), // pending, sent, delivered, failed
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"), // Datos adicionales (IDs de WhatsApp, etc.)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const productBrands = pgTable("product_brands", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  logo: text("logo"), // URL del logo de la marca
  website: text("website"),
  countryOfOrigin: text("country_of_origin"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ================================
// SISTEMA DE CONVERSIÓN DE UNIDADES
// ================================

// Catálogo de unidades de medida por tienda
export const measurementUnits = pgTable("measurement_units", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  name: text("name").notNull(), // "Kilogramo", "Gramo", "Litro", "Mililitro", "Unidad"
  symbol: text("symbol").notNull(), // "kg", "g", "L", "ml", "unid"
  type: text("type").notNull(), // "weight", "volume", "unit", "length"
  abbreviation: text("abbreviation"), // Abreviación alternativa
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0), // Para ordenar en select
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Factores de conversión entre unidades por producto
export const productUnitConversions = pgTable("product_unit_conversions", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id).notNull(),
  storeId: integer("store_id").notNull(),
  sourceUnitId: integer("source_unit_id").references(() => measurementUnits.id).notNull(), // Unidad origen
  targetUnitId: integer("target_unit_id").references(() => measurementUnits.id).notNull(), // Unidad destino (base)
  conversionFactor: decimal("conversion_factor", { precision: 15, scale: 6 }).notNull(), // Factor de conversión
  // Ejemplo: sourceUnit=kg, targetUnit=g, factor=1000 → 1kg = 1000g
  // Ejemplo: sourceUnit=g, targetUnit=kg, factor=0.001 → 1g = 0.001kg
  isActive: boolean("is_active").default(true),
  notes: text("notes"), // Notas sobre la conversión
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProductBrandSchema = makeInsertSchema(productBrands, {
  storeId: z.number(),
  name: z.string().min(1, "Nombre es requerido"),
  description: z.string().optional(),
  website: z.string().url().optional(),
}, ["id", "createdAt", "updatedAt"]);

export const insertMeasurementUnitSchema = makeInsertSchema(measurementUnits, {
  storeId: z.number(),
  name: z.string().min(1, "Nombre es requerido"),
  symbol: z.string().min(1, "Símbolo es requerido"),
  type: z.enum(["weight", "volume", "unit", "length"], {
    errorMap: () => ({ message: "Tipo debe ser: weight, volume, unit o length" })
  }),
  abbreviation: z.string().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().optional(),
}, ["id", "createdAt", "updatedAt"]);

export const insertProductUnitConversionSchema = makeInsertSchema(productUnitConversions, {
  productId: z.number().int().positive(),
  storeId: z.number().int().positive(),
  sourceUnitId: z.number().int().positive(),
  targetUnitId: z.number().int().positive(),
  conversionFactor: z.string().refine(
    val => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    "Factor de conversión debe ser un número positivo"
  ),
  isActive: z.boolean().optional(),
  notes: z.string().optional(),
}, ["id", "createdAt", "updatedAt"]);

export const insertProductSchema = makeInsertSchema(products, {
  loyaltyPointsPropertyName: z.string().optional(),
  loyaltyPointsValue: z.string().refine(val => val === undefined || !isNaN(parseFloat(val)), "Loyalty points value must be a valid number").optional(),
  lotNumber: z.string().optional(),
  expirationDate: z.string().optional(),
});

export const insertOrderSchema = makeInsertSchema(orders, {
  orderNumber: z.string().optional(),
  loyaltyPointsPropertyName: z.string().optional(),
  loyaltyPointsValue: z.string().optional(),
  loyaltyPointsTotal: z.string().optional(),
});

export const insertOrderItemSchema = makeInsertSchema(orderItems);

export const insertSupplierSchema = makeInsertSchema(suppliers, {
  storeId: z.number(),
  name: z.string().min(1, "Nombre del proveedor es requerido"),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  isActive: z.boolean().optional(),
}, ["id", "createdAt", "updatedAt"]);

export const insertPurchaseOrderSchema = makeInsertSchema(purchaseOrders, {
  storeId: z.number(),
  purchaseNumber: z.string(),
  supplierId: z.number().optional(),
  totalAmount: z.string().refine(val => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, "Monto total debe ser válido"),
  status: z.enum(["pending", "received", "partial", "cancelled"]).optional(),
  paymentStatus: z.enum(["unpaid", "partial", "paid"]).optional(),
  currency: z.enum(["DOP", "USD"]).optional(),
  createdBy: z.number(),
}, ["id", "createdAt", "updatedAt"]);

export const insertPurchaseOrderItemSchema = makeInsertSchema(purchaseOrderItems, {
  purchaseOrderId: z.number(),
  storeId: z.number(),
  productName: z.string().min(1, "Nombre del producto es requerido"),
  quantity: z.string().refine(val => !isNaN(parseFloat(val)) && parseFloat(val) > 0, "Cantidad debe ser mayor a 0"),
  unitCost: z.string().refine(val => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, "Costo unitario debe ser válido"),
  totalCost: z.string().refine(val => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, "Costo total debe ser válido"),
}, ["id", "createdAt"]);

export const insertInventoryMovementSchema = makeInsertSchema(inventoryMovements, {
  storeId: z.number(),
  productId: z.number(),
  type: z.enum(["purchase", "sale", "adjustment", "return", "transfer", "damage", "expired"]),
  quantity: z.string().refine(val => !isNaN(parseFloat(val)), "Cantidad debe ser un número válido"),
}, ["id", "createdAt"]);

export const insertOrderHistorySchema = makeInsertSchema(orderHistory, {
  statusFrom: z.string().nullable().optional()
}, ["id", "timestamp"]);


export const insertConversationSchema = makeInsertSchema(conversations, { orderId: z.number().nullable().optional() }, ["id", "lastMessageAt"]);

export const insertMessageSchema = makeInsertSchema(messages, {}, ["id", "sentAt"]);

export const insertWebMessageSchema = makeInsertSchema(messages, {}, ["id", "sentAt", "conversationId"]);

export const insertWhatsAppSettingsSchema = makeInsertSchema(whatsappSettings);

export const insertWhatsAppLogSchema = makeInsertSchema(whatsappLogs, {}, ["id", "timestamp"]);

export const insertAutoResponseSchema = makeInsertSchema(autoResponses);

export const insertCustomerRegistrationFlowSchema = makeInsertSchema(customerRegistrationFlows);

export const insertEmployeeProfileSchema = makeInsertSchema(employeeProfiles);

export const insertAssignmentRuleSchema = makeInsertSchema(assignmentRules);

export const insertShoppingCartSchema = makeInsertSchema(shoppingCart);

export const insertProductCategorySchema = makeInsertSchema(productCategories);

// ❌ Schemas multi-tenant comentados (tablas no existen)
// export const insertSubscriptionPlanSchema = makeInsertSchema(subscriptionPlans, { ... });
// export const insertStoreSubscriptionSchema = makeInsertSchema(storeSubscriptions);
// export const insertUsageHistorySchema = makeInsertSchema(usageHistory, {}, ["id", "createdAt"]);

export const insertNotificationSchema = makeInsertSchema(notifications, {}, ["id", "createdAt"]);

export const insertStoreSettingsSchema = makeInsertSchema(storeSettings);

// ❌ Schemas comentados (tablas no existen)
// export const insertVirtualStoreSchema = makeInsertSchema(virtualStores, {}, [
//   "id", "createdAt", "updatedAt", "databaseUrl",
// ]);
// export const insertSystemUserSchema = makeInsertSchema(systemUsers, {}, [
//   "id", "createdAt", "updatedAt", "lastLogin",
// ]);
// export const insertSystemAuditLogSchema = makeInsertSchema(systemAuditLog, {}, ["id", "createdAt"]);

export const insertCustomerHistorySchema = makeInsertSchema(customerHistory);

// ================================
// CIERRE DE CAJA / CASH REGISTER SESSIONS
// ================================
export const cashRegisterSessions = pgTable("cash_register_sessions", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  cashierId: integer("cashier_id").references(() => users.id).notNull(),
  sessionType: text("session_type").notNull().default("shift"), // 'shift' | 'day'
  status: text("status").notNull().default("open"), // 'open' | 'closed' | 'approved' | 'rejected'

  // Apertura
  openingAmount: decimal("opening_amount", { precision: 12, scale: 2 }).default("0"),
  openedAt: timestamp("opened_at").defaultNow().notNull(),
  openingNotes: text("opening_notes"),

  // Cierre — reportado por cajera
  cashReported: decimal("cash_reported", { precision: 12, scale: 2 }),
  cardReported: decimal("card_reported", { precision: 12, scale: 2 }),
  transferReported: decimal("transfer_reported", { precision: 12, scale: 2 }),
  creditReported: decimal("credit_reported", { precision: 12, scale: 2 }),
  closedAt: timestamp("closed_at"),
  closedByUserId: integer("closed_by_user_id").references(() => users.id),

  // Calculado por sistema al momento del cierre
  cashExpected: decimal("cash_expected", { precision: 12, scale: 2 }),
  cardExpected: decimal("card_expected", { precision: 12, scale: 2 }),
  transferExpected: decimal("transfer_expected", { precision: 12, scale: 2 }),
  creditExpected: decimal("credit_expected", { precision: 12, scale: 2 }),

  // Diferencias (positivo = sobrante, negativo = faltante)
  cashDifference: decimal("cash_difference", { precision: 12, scale: 2 }),
  cardDifference: decimal("card_difference", { precision: 12, scale: 2 }),
  transferDifference: decimal("transfer_difference", { precision: 12, scale: 2 }),
  creditDifference: decimal("credit_difference", { precision: 12, scale: 2 }),
  totalDifference: decimal("total_difference", { precision: 12, scale: 2 }),

  // Resumen de operaciones
  totalOrders: integer("total_orders").default(0),
  totalSalesAmount: decimal("total_sales_amount", { precision: 12, scale: 2 }).default("0"),
  totalCancellations: integer("total_cancellations").default(0),
  totalDiscountsAmount: decimal("total_discounts_amount", { precision: 12, scale: 2 }).default("0"),
  totalExpected: decimal("total_expected", { precision: 12, scale: 2 }),
  totalReported: decimal("total_reported", { precision: 12, scale: 2 }),

  // Notas de discrepancia (obligatoria si |totalDifference| > umbral)
  discrepancyNote: text("discrepancy_note"),

  // Aprobación del supervisor
  approvedByUserId: integer("approved_by_user_id").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCashRegisterSessionSchema = makeInsertSchema(cashRegisterSessions, {}, [
  "id", "createdAt", "updatedAt", "openedAt",
]);

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type CustomerType = typeof customerTypes.$inferSelect;
export type InsertCustomerType = z.infer<typeof insertCustomerTypeSchema>;

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

export type CustomerLoyaltyBalance = typeof customerLoyaltyBalance.$inferSelect;
export type InsertCustomerLoyaltyBalance = z.infer<typeof insertCustomerLoyaltyBalanceSchema>;

export type LoyaltyPointsTransaction = typeof loyaltyPointsTransactions.$inferSelect;
export type InsertLoyaltyPointsTransaction = z.infer<typeof insertLoyaltyPointsTransactionSchema>;

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;

export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;

export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;
export type InsertPurchaseOrderItem = z.infer<typeof insertPurchaseOrderItemSchema>;

export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type InsertInventoryMovement = z.infer<typeof insertInventoryMovementSchema>;

export type OrderHistory = typeof orderHistory.$inferSelect;
export type InsertOrderHistory = z.infer<typeof insertOrderHistorySchema>;

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type WhatsAppSettings = typeof whatsappSettings.$inferSelect;
export type InsertWhatsAppSettings = z.infer<typeof insertWhatsAppSettingsSchema>;

export type WhatsAppLog = typeof whatsappLogs.$inferSelect;
export type InsertWhatsAppLog = z.infer<typeof insertWhatsAppLogSchema>;

export type AutoResponse = typeof autoResponses.$inferSelect;
export type InsertAutoResponse = z.infer<typeof insertAutoResponseSchema>;

export type CustomerRegistrationFlow = typeof customerRegistrationFlows.$inferSelect;
export type InsertCustomerRegistrationFlow = z.infer<typeof insertCustomerRegistrationFlowSchema>;

export type EmployeeProfile = typeof employeeProfiles.$inferSelect;
export type InsertEmployeeProfile = z.infer<typeof insertEmployeeProfileSchema>;

export type AssignmentRule = typeof assignmentRules.$inferSelect;
export type InsertAssignmentRule = z.infer<typeof insertAssignmentRuleSchema>;

export type ShoppingCart = typeof shoppingCart.$inferSelect;
export type InsertShoppingCart = z.infer<typeof insertShoppingCartSchema>;

export type ProductCategory = typeof productCategories.$inferSelect;
export type InsertProductCategory = z.infer<typeof insertProductCategorySchema>;

// Unit conversion types
export type MeasurementUnit = typeof measurementUnits.$inferSelect;
export type InsertMeasurementUnit = z.infer<typeof insertMeasurementUnitSchema>;

export type ProductUnitConversion = typeof productUnitConversions.$inferSelect;
export type InsertProductUnitConversion = z.infer<typeof insertProductUnitConversionSchema>;

// ❌ Subscription types comentados (tablas no existen)
// export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
// export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
// export type StoreSubscription = typeof storeSubscriptions.$inferSelect;
// export type InsertStoreSubscription = z.infer<typeof insertStoreSubscriptionSchema>;
// export type UsageHistory = typeof usageHistory.$inferSelect;
// export type InsertUsageHistory = z.infer<typeof insertUsageHistorySchema>;

export type CartItem = typeof shoppingCart.$inferSelect;
export type InsertCartItem = z.infer<typeof insertShoppingCartSchema>;

export type CustomerHistory = typeof customerHistory.$inferSelect;
export type InsertCustomerHistory = z.infer<typeof insertCustomerHistorySchema>;

export type CashRegisterSession = typeof cashRegisterSessions.$inferSelect;
export type InsertCashRegisterSession = z.infer<typeof insertCashRegisterSessionSchema>;

export type Trip = typeof trips.$inferSelect;
export type NewTrip = typeof trips.$inferInsert;
export type TripOrder = typeof tripOrders.$inferSelect;
export type NewTripOrder = typeof tripOrders.$inferInsert;

export type TripStatus = 'pending' | 'active' | 'processing' | 'completed' | 'cancelled';
export type TripOrderStatus = 'pending' | 'picked' | 'skipped';

// Extended types for API responses
export type OrderItemWithProduct = OrderItem & {
  product: Product;
};

export type OrderWithDetails = Order & {
  customer: Customer;
  assignedUser?: User;
  items: (OrderItem & { product: Product })[];
};

export type ConversationWithDetails = Conversation & {
  customer: Customer;
  order?: Order;
  lastMessage?: Message;
  unreadCount: number;
};

export type MessageWithSender = Message & {
  sender?: User;
};


export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;




export type StoreSettings = typeof storeSettings.$inferSelect;
export type InsertStoreSettings = z.infer<typeof insertStoreSettingsSchema>;

// ================================
// TIPOS MULTI-TENANT (COMENTADOS - No existen)
// ================================
// export type VirtualStore = typeof virtualStores.$inferSelect;
// export type InsertVirtualStore = z.infer<typeof insertVirtualStoreSchema>;
// export type SystemUser = typeof systemUsers.$inferSelect;
// export type InsertSystemUser = z.infer<typeof insertSystemUserSchema>;
// export type SystemAuditLog = typeof systemAuditLog.$inferSelect;
// export type InsertSystemAuditLog = z.infer<typeof insertSystemAuditLogSchema>;

export type Brand = {
  id: number;
  name: string;
  description?: string;
  logo?: string;
  website?: string;
  isActive: boolean;
  storeId: number;
  createdAt: Date;
  updatedAt?: Date;
};

// NotificationConfig types  
export type NotificationConfig = {
  id: number;
  storeId: number;
  eventName: string;
  channel: string;
  isEnabled: boolean;
  template: string;
  recipients: string; // JSON string
  createdAt: Date;
  updatedAt?: Date;
};

// NotificationHistory types
export type NotificationHistory = {
  id: number;
  configId: number;
  orderId: number;
  recipientId: number;
  recipientType: string;
  channel: string;
  title: string;
  message: string;
  status: string;
  sentAt?: Date;
  errorMessage?: string;
  createdAt: Date;
};

// UserWorkload types
export type UserWorkload = {
  userId: number;
  assignedOrders: number;
  activeConversations: number;
  completedOrdersToday: number;
  averageResponseTime: number;
  workloadScore: number;
};

// RegistrationFlow types
export type RegistrationFlow = {
  id: number;
  storeId: number;
  name: string;
  description?: string;
  isActive: boolean;
  steps: string; // JSON string
  createdAt: Date;
  updatedAt?: Date;
};

// Extended types for multi-tenant API responses (COMENTADOS - No existen)
// export type VirtualStoreWithOwner = VirtualStore & {
//   owner?: SystemUser;
//   userCount?: number;
//   orderCount?: number;
//   lastActivity?: Date;
// };
// export type SystemUserWithStore = SystemUser & {
//   store?: VirtualStore;
// };

export type NotificationChannel = {
  id: string;
  name: string;
  enabled: boolean;
  description?: string;
};

export type NotificationEvent = {
  id: string;
  name: string;
  description: string;
  category: string;
};

export const schema = {
  // ❌ Sistema multi-tenant (tablas comentadas - no existen)
  // virtualStores,
  // systemUsers,
  // subscriptionPlans,
  // storeSubscriptions,
  // usageHistory,
  // systemAuditLog,
  
  // ✅ Configuración de tienda única
  storeSettings,

  // ✅ Esquemas operacionales (schema público)
  users,
  customers,
  customerTypes,
  customerHistory,
  customerLoyaltyBalance,
  loyaltyPointsTransactions,
  notifications,
  products,
  productCategories,
  productBrands,
  measurementUnits,
  productUnitConversions,
  suppliers,
  purchaseOrders,
  purchaseOrderItems,
  inventoryMovements,
  orders,
  orderItems,
  orderHistory,
  conversations,
  messages,
  whatsappSettings,
  whatsappLogs,
  autoResponses,
  customerRegistrationFlows,
  employeeProfiles,
  assignmentRules,
  shoppingCart,
  trips,
  tripOrders,
  exchangeRates,
  // RBAC tables
  roles,
  views,
  rolePermissions,
  userRoles,
};

// ================================
// SISTEMA DE IA - TABLAS
// ================================

// Tabla de créditos de IA (en base de datos MAESTRA)
export const aiCredits = pgTable("ai_credits", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().unique(),

  // Créditos disponibles
  totalCredits: integer("total_credits").notNull().default(0),
  usedCredits: integer("used_credits").notNull().default(0),
  availableCredits: integer("available_credits").notNull().default(0),

  // Control de uso
  isEnabled: boolean("is_enabled").notNull().default(true),
  autoRecharge: boolean("auto_recharge").default(false),
  rechargeThreshold: integer("recharge_threshold").default(100),
  rechargeAmount: integer("recharge_amount").default(1000),

  // Costos por operación
  costPerMessage: integer("cost_per_message").default(1),
  costPerOrder: integer("cost_per_order").default(5),
  costPerVoiceNote: integer("cost_per_voice_note").default(10),

  // Configuración
  fallbackWhenNoCredits: boolean("fallback_when_no_credits").default(true),
  notifyLowCredits: boolean("notify_low_credits").default(true),
  lowCreditThreshold: integer("low_credit_threshold").default(50),

  // Estadísticas
  totalMessagesProcessed: integer("total_messages_processed").default(0),
  totalOrdersCreated: integer("total_orders_created").default(0),
  totalVoiceNotesTranscribed: integer("total_voice_notes_transcribed").default(0),

  // Fechas
  lastRecharge: timestamp("last_recharge"),
  lastUsage: timestamp("last_usage"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Tabla de log de uso de IA (en base de datos de TIENDA)
export const aiUsageLog = pgTable("ai_usage_log", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),

  // Identificación
  conversationId: integer("conversation_id"),
  customerId: integer("customer_id"),
  customerPhone: text("customer_phone"),

  // Tipo de operación
  operationType: text("operation_type").notNull(),

  // Costos
  creditsCost: integer("credits_cost").notNull(),

  // Detalles
  inputText: text("input_text"),
  outputText: text("output_text"),
  interpretation: text("interpretation"),
  confidence: decimal("confidence", { precision: 3, scale: 2 }),

  // Resultado
  wasSuccessful: boolean("was_successful").default(true),
  errorMessage: text("error_message"),

  // Metadatos
  processingTimeMs: integer("processing_time_ms"),
  modelUsed: text("model_used").default("gpt-4o-mini"),
  tokensUsed: integer("tokens_used"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Tabla de conversaciones con IA (en base de datos de TIENDA)
export const aiConversations = pgTable("ai_conversations", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),

  // Identificación
  conversationId: integer("conversation_id").notNull(),
  customerId: integer("customer_id").notNull(),
  customerPhone: text("customer_phone").notNull(),

  // Estado
  isActive: boolean("is_active").default(true),
  mode: text("mode").default("assistant"),

  // Contexto
  conversationContext: text("conversation_context"),
  currentIntent: text("current_intent"),

  // Carrito/Pedido
  draftOrderId: integer("draft_order_id"),
  cartItems: text("cart_items"),
  
  // Productos pendientes de selección (para botones/opciones)
  pendingProductSelection: text("pending_product_selection"), // JSON: productos indexados por ID
  pendingProductsByIndex: text("pending_products_by_index"), // JSON: productos indexados por número (1-5)

  // Métricas
  messageCount: integer("message_count").default(0),
  lastMessageAt: timestamp("last_message_at"),

  // Fechas
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Tabla de cache de búsqueda de productos (en base de datos de TIENDA)
export const aiProductMatches = pgTable("ai_product_matches", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),

  // Query
  searchQuery: text("search_query").notNull(),
  normalizedQuery: text("normalized_query").notNull(),

  // Productos encontrados
  matchedProducts: text("matched_products").notNull(),
  matchCount: integer("match_count").default(0),

  // Calidad
  confidence: decimal("confidence", { precision: 3, scale: 2 }),

  // Uso
  timesUsed: integer("times_used").default(1),
  lastUsedAt: timestamp("last_used_at").notNull().defaultNow(),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
});

// ================================
// SISTEMA DE FACTURACIÓN Y PAGOS (COMENTADO - No existe en sistema single-store)
// ================================

// Tabla de facturas (Base de datos maestra) - COMENTADO
/*
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(), // Ej: INV-2025-001
  storeId: integer("store_id").references(() => virtualStores.id).notNull(),
  subscriptionId: integer("subscription_id").references(() => storeSubscriptions.id),

  // Período de la factura
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),

  // Montos
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull().default("0.00"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default("0.00"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull().default("0.00"),
  currency: text("currency").default("MXN"),

  // Estado
  status: text("status").notNull().default("draft"), // 'draft', 'issued', 'sent', 'paid', 'partially_paid', 'overdue', 'cancelled'
  paymentMethod: text("payment_method"), // 'paypal', 'bank_transfer', 'other'

  // Fechas
  issuedDate: timestamp("issued_date"),
  dueDate: timestamp("due_date"),
  paidDate: timestamp("paid_date"),

  // Documentos
  pdfUrl: text("pdf_url"), // URL en Supabase
  fileStoragePath: text("file_storage_path"), // Ruta en storage

  // Notas
  notes: text("notes"),
  internalNotes: text("internal_notes"),

  // Auditoría
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdBy: integer("created_by").references(() => systemUsers.id),
});
*/

// Tabla de pagos (Base de datos maestra) - COMENTADO
/*
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").references(() => invoices.id).notNull(),
  storeId: integer("store_id").references(() => virtualStores.id).notNull(),

  // ID de transacción de PayPal
  paypalOrderId: text("paypal_order_id"),
  paypalTransactionId: text("paypal_transaction_id").unique(),

  // Montos
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").default("MXN"),

  // Estado
  status: text("status").notNull().default("pending"), // 'pending', 'completed', 'failed', 'refunded', 'cancelled'
  paymentMethod: text("payment_method").default("paypal_checkout"), // 'paypal_checkout', 'paypal_recurring', 'bank_transfer'

  // Información del pagador
  payerEmail: text("payer_email"),

  // Metadatos
  metadata: jsonb("metadata"), // Respuesta completa de PayPal

  // Reintentos
  retryCount: integer("retry_count").default(0),
  lastRetryAt: timestamp("last_retry_at"),
  failureReason: text("failure_reason"),

  // Fechas
  processedAt: timestamp("processed_at"),
  confirmedAt: timestamp("confirmed_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
*/

// Tabla de transacciones de créditos de IA (Base de datos maestra) - COMENTADO
/*
export const creditTransactions = pgTable("credit_transactions", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => virtualStores.id).notNull(),

  // Tipo de transacción
  type: text("type").notNull(), // 'purchase', 'usage', 'refund', 'admin_adjustment'

  // Créditos
  creditsBefore: decimal("credits_before", { precision: 12, scale: 2 }).notNull(),
  creditsAmount: decimal("credits_amount", { precision: 12, scale: 2 }).notNull(),
  creditsAfter: decimal("credits_after", { precision: 12, scale: 2 }).notNull(),

  // Relaciones
  relatedInvoiceId: integer("related_invoice_id").references(() => invoices.id),
  relatedPaymentId: integer("related_payment_id").references(() => payments.id),
  relatedAiUsageId: integer("related_ai_usage_id"), // ID de aiUsageLog (en BD de tienda)

  // Razón y descripción
  reason: text("reason").notNull(),
  description: text("description"),

  // Metadatos
  metadata: jsonb("metadata"),

  // Auditoría
  createdBy: integer("created_by").references(() => systemUsers.id),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});
*/

// Tabla de configuración de PayPal (Base de datos maestra) - COMENTADO
/*
export const paypalIntegration = pgTable("paypal_integration", {
  id: serial("id").primaryKey(),

  // Credenciales
  clientId: text("client_id").notNull().unique(),
  clientSecret: text("client_secret").notNull(), // Encriptado

  // Modo
  mode: text("mode").notNull().default("live"), // 'sandbox', 'live'
  isActive: boolean("is_active").default(true),

  // Webhooks
  webhookUrl: text("webhook_url"),
  webhookId: text("webhook_id"), // ID de webhook en PayPal

  // Configuración
  apiVersion: text("api_version").default("v2"),

  // Auditoría
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: integer("updated_by").references(() => systemUsers.id),
});
*/

// ================================
// VALIDACIÓN ZOD PARA TABLAS DE FACTURACIÓN (COMENTADO - No existe)
// ================================

// Validaciones para invoices - COMENTADO
/*
export const createInvoiceSchema = z.object({
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  storeId: z.number().int().positive(),
  subscriptionId: z.number().int().positive().optional(),
  periodStart: z.date(),
  periodEnd: z.date(),
  subtotal: z.number().nonnegative(),
  taxAmount: z.number().nonnegative().optional(),
  totalAmount: z.number().positive(),
  currency: z.string().default("MXN"),
  status: z.enum(["draft", "issued", "sent", "paid", "partially_paid", "overdue", "cancelled"]).default("draft"),
  paymentMethod: z.string().optional(),
  issuedDate: z.date().optional(),
  dueDate: z.date().optional(),
  paidDate: z.date().optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
});

export const updateInvoiceSchema = createInvoiceSchema.partial();

// Validaciones para payments
export const createPaymentSchema = z.object({
  invoiceId: z.number().int().positive(),
  storeId: z.number().int().positive(),
  amount: z.number().positive(),
  currency: z.string().default("MXN"),
  paypalOrderId: z.string().optional(),
  paypalTransactionId: z.string().optional(),
  status: z.enum(["pending", "completed", "failed", "refunded", "cancelled"]).default("pending"),
  paymentMethod: z.string().default("paypal_checkout"),
  payerEmail: z.string().email().optional(),
  metadata: z.record(z.any()).optional(),
});

export const updatePaymentSchema = createPaymentSchema.partial();

// Validaciones para creditTransactions
export const createCreditTransactionSchema = z.object({
  storeId: z.number().int().positive(),
  type: z.enum(["purchase", "usage", "refund", "admin_adjustment"]),
  creditsBefore: z.number().nonnegative(),
  creditsAmount: z.number(),
  creditsAfter: z.number().nonnegative(),
  relatedInvoiceId: z.number().int().positive().optional(),
  relatedPaymentId: z.number().int().positive().optional(),
  relatedAiUsageId: z.number().int().positive().optional(),
  reason: z.string().min(1, "Reason is required"),
  description: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// Validaciones para PayPal integration
export const createPayPalIntegrationSchema = z.object({
  clientId: z.string().min(1, "Client ID is required"),
  clientSecret: z.string().min(1, "Client Secret is required"),
  mode: z.enum(["sandbox", "live"]).default("live"),
  isActive: z.boolean().default(true),
  webhookUrl: z.string().url().optional(),
  webhookId: z.string().optional(),
  apiVersion: z.string().default("v2"),
});

export const updatePayPalIntegrationSchema = createPayPalIntegrationSchema.partial();
*/

// ================================
// SISTEMA DE AGENDA DE CITAS
// ================================

// ================================
// TITULARES DE CITAS
// ================================
export const appointmentTitulares = pgTable("appointment_titulares", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  name: text("name").notNull(),
  specialty: text("specialty"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAppointmentTitularSchema = z.object({
  storeId: z.number().int().positive(),
  name: z.string().min(1, "El nombre es requerido"),
  specialty: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const updateAppointmentTitularSchema = insertAppointmentTitularSchema.partial().omit({ storeId: true });

// ================================
// TIPOS DE SERVICIOS DE CITAS
// ================================
export const appointmentServiceTypes = pgTable("appointment_service_types", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("general"), // general, programa_especial
  description: text("description"),
  duration: integer("duration"), // duration in minutes
  // Pricing
  basePrice: decimal("base_price", { precision: 10, scale: 2 }).default("0"),
  priceType: text("price_type").notNull().default("fixed"), // fixed, variable, range
  minPrice: decimal("min_price", { precision: 10, scale: 2 }),
  maxPrice: decimal("max_price", { precision: 10, scale: 2 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAppointmentServiceTypeSchema = z.object({
  storeId: z.number().int().positive(),
  name: z.string().min(1, "El nombre es requerido"),
  category: z.enum(["general", "programa_especial"]).default("general"),
  description: z.string().optional().nullable(),
  duration: z.number().int().positive().optional().nullable(),
  basePrice: z.string().optional().default("0"),
  priceType: z.enum(["fixed", "variable", "range"]).default("fixed"),
  minPrice: z.string().optional().nullable(),
  maxPrice: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const updateAppointmentServiceTypeSchema = insertAppointmentServiceTypeSchema.partial().omit({ storeId: true });

// ================================
// CITAS
// ================================
export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  titularId: integer("titular_id").references(() => appointmentTitulares.id),
  serviceTypeId: integer("service_type_id").references(() => appointmentServiceTypes.id),
  title: text("title").notNull(),
  description: text("description"),
  appointmentDate: timestamp("appointment_date").notNull(),
  appointmentEndDate: timestamp("appointment_end_date"),
  status: text("status").notNull().default("scheduled"), // scheduled, completed, cancelled, no_show
  // Pricing & Payment
  price: decimal("price", { precision: 10, scale: 2 }).default("0"),
  paymentStatus: text("payment_status").notNull().default("pending"), // pending, paid, partial, credit
  paymentMethod: text("payment_method"), // cash, card, transfer, credit
  orderId: integer("order_id").references(() => orders.id),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Validación Zod para citas
export const insertAppointmentSchema = z.object({
  storeId: z.number().int().positive(),
  customerId: z.number().int().positive(),
  titularId: z.number().int().positive().optional().nullable(),
  serviceTypeId: z.number().int().positive().optional().nullable(),
  title: z.string().min(1, "El título es requerido"),
  description: z.string().optional().nullable(),
  appointmentDate: z.string().or(z.date()),
  appointmentEndDate: z.string().or(z.date()).optional().nullable(),
  status: z.enum(["scheduled", "completed", "cancelled", "no_show"]).default("scheduled"),
  price: z.string().optional().default("0"),
  paymentStatus: z.enum(["pending", "paid", "partial", "credit"]).default("pending"),
  paymentMethod: z.string().optional().nullable(),
  orderId: z.number().int().positive().optional().nullable(),
  notes: z.string().optional().nullable(),
  createdBy: z.number().int().positive().optional(),
});

export const updateAppointmentSchema = insertAppointmentSchema.partial().omit({ storeId: true });

// ================================
// AJUSTE DE INVENTARIO
// ================================

export const inventoryAdjustments = pgTable("inventory_adjustments", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull(),
  adjustedBy: integer("adjusted_by").references(() => users.id),
  notes: text("notes"),
  totalItems: integer("total_items").notNull().default(0),
  surplusItems: integer("surplus_items").notNull().default(0),
  deficitItems: integer("deficit_items").notNull().default(0),
  surplusValue: decimal("surplus_value", { precision: 14, scale: 2 }).notNull().default("0"),
  deficitValue: decimal("deficit_value", { precision: 14, scale: 2 }).notNull().default("0"),
  netAdjustmentValue: decimal("net_adjustment_value", { precision: 14, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const inventoryAdjustmentItems = pgTable("inventory_adjustment_items", {
  id: serial("id").primaryKey(),
  adjustmentId: integer("adjustment_id").references(() => inventoryAdjustments.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  productName: text("product_name").notNull(),
  previousStock: integer("previous_stock").notNull().default(0),
  realStock: integer("real_stock").notNull().default(0),
  difference: integer("difference").notNull().default(0),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull().default("0"),
  baseCurrency: text("base_currency").notNull().default("DOP"),
  adjustmentAmount: decimal("adjustment_amount", { precision: 14, scale: 2 }).notNull().default("0"),
});

export const insertInventoryAdjustmentSchema = z.object({
  storeId: z.number().int().optional(), // ignored; backend uses user.storeId from JWT
  adjustedBy: z.number().int().positive().optional(),
  notes: z.string().optional().nullable(),
  items: z.array(z.object({
    productId: z.number().int().positive(),
    productName: z.string(),
    previousStock: z.number().int(),
    realStock: z.number().int(),
    difference: z.number().int(),
    unitPrice: z.string(),
    baseCurrency: z.string().default("DOP"),
    adjustmentAmount: z.string(),
  })).min(1, "Se requiere al menos un producto"),
});

export type InventoryAdjustment = typeof inventoryAdjustments.$inferSelect;
export type InventoryAdjustmentItem = typeof inventoryAdjustmentItems.$inferSelect;

// ================================
// SISTEMA DE CRÉDITO DE CLIENTES
// ================================

export const customerCreditAccounts = pgTable("customer_credit_accounts", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  storeId: integer("store_id").notNull(),
  totalCredit: decimal("total_credit", { precision: 12, scale: 2 }).notNull().default("0"),
  totalPaid: decimal("total_paid", { precision: 12, scale: 2 }).notNull().default("0"),
  currentBalance: decimal("current_balance", { precision: 12, scale: 2 }).notNull().default("0"),
  creditLimit: decimal("credit_limit", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const creditTransactions = pgTable("credit_transactions", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  storeId: integer("store_id").notNull(),
  orderId: integer("order_id").references(() => orders.id),
  type: text("type").notNull(), // charge, payment
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  balanceBefore: decimal("balance_before", { precision: 12, scale: 2 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 12, scale: 2 }).notNull(),
  description: text("description"),
  paymentMethod: text("payment_method"), // for payment type: cash, card, transfer
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCreditTransactionSchema = z.object({
  customerId: z.number().int().positive(),
  storeId: z.number().int().positive(),
  orderId: z.number().int().positive().optional().nullable(),
  type: z.enum(["charge", "payment"]),
  amount: z.string().refine(val => !isNaN(parseFloat(val)) && parseFloat(val) > 0, "Monto debe ser positivo"),
  description: z.string().optional().nullable(),
  paymentMethod: z.string().optional().nullable(),
});

export type CustomerCreditAccount = typeof customerCreditAccounts.$inferSelect;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
