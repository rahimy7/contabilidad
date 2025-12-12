import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "../shared/schema.js";
import { eq, desc, and, or, count, sql, ilike, asc, like, lt, inArray, gte } from "drizzle-orm";
import { getTenantDb, masterDb } from "./multi-tenant-db.js";
import { ConversationWithDetails, CustomerRegistrationFlow, InsertUser, orders, User } from "../shared/schema.js";
import { ProductBrand, InsertProductBrand } from "@shared/types.js";
import { TenantStorage } from "./interfaces/storage.js";
import { getTenantStorage } from "./storage/index.js";

export function createTenantStorage(tenantDb: any, storeId: number, schemaType?: 'public' | 'tenant') {
  // ✅ VALIDACIÓN CRÍTICA AL INICIO
    console.log(`🏗️ createTenantStorage called with:`);
  console.log(`  - tenantDb: ${!!tenantDb}`);
  console.log(`  - storeId: ${storeId} (type: ${typeof storeId})`);
  console.log(`  - schemaType: ${schemaType}`);
  if (!tenantDb) {
    throw new Error(`❌ TenantDb is undefined for store ${storeId}`);
  }
  
  if (!tenantDb.execute || typeof tenantDb.execute !== 'function') {
    throw new Error(`❌ TenantDb.execute is not a function for store ${storeId}`);
  }

  const usePublicSchema = schemaType === 'public';
  
  console.log(`🏗️ Creating tenant storage for store ${storeId}, schema: ${schemaType}`);

  // ✅ RETORNAR OBJETO CON MÉTODOS QUE TIENEN ACCESO AL tenantDb EN SU CLOSURE
  return {
    storeId: storeId,
     schema: schema,
  tenantDb: tenantDb,

async getAllProducts() {
  try {
    console.log(`📦 Getting all products for store ${storeId} - tenantDb exists: ${!!tenantDb}`);

      // ✅ SOLUCIÓN: String interpolation directa
      const directQuery = `
        SELECT * FROM "store_${storeId}".products
        WHERE store_id = ${storeId} AND "is_active" = true
        ORDER BY created_at DESC
      `;
      console.log(`🚀 Executing direct query for store ${storeId}`);
      const result = await tenantDb.execute(directQuery);
      // 🎁 Transform snake_case to camelCase for all fields
      return result.rows.map((row: any) => {
        // Handle both snake_case and camelCase field names
        const loyaltyPointsPropertyName = row.loyalty_points_property_name || row.loyaltyPointsPropertyName;
        const loyaltyPointsValue = row.loyalty_points_value || row.loyaltyPointsValue;
        const isActive = row.is_active !== undefined ? row.is_active : row.isActive;

        return {
          ...row,
          loyalty_points_property_name: loyaltyPointsPropertyName, // Keep original snake_case
          loyalty_points_value: loyaltyPointsValue, // Keep original snake_case
          loyaltyPointsPropertyName: loyaltyPointsPropertyName, // Add camelCase
          loyaltyPointsValue: loyaltyPointsValue, // Add camelCase
          isActive: isActive, // Transform is_active to isActive for filtering
        };
      });
    } catch (error) {
    console.error(`❌ Error in getAllProducts for store ${storeId}:`, error);
    throw error;
  }
},



    async getProductById(id: number) {
      try {
        const [product] = await tenantDb.select()
          .from(schema.products)
          .where(eq(schema.products.id, id))
          .limit(1);
        if (!product) return null;
        // 🎁 Ensure both snake_case and camelCase fields are available
        const result = {
          ...product,
          // Add camelCase versions if they don't exist
          loyaltyPointsPropertyName: (product as any).loyaltyPointsPropertyName,
          loyaltyPointsValue: (product as any).loyaltyPointsValue,
          // Add snake_case versions for compatibility
          loyalty_points_property_name: (product as any).loyaltyPointsPropertyName,
          loyalty_points_value: (product as any).loyaltyPointsValue,
        };
        return result;
      } catch (error) {
        console.error('Error getting product by ID:', error);
        return null;
      }
    },

    async deleteCategory(id: number): Promise<void> {
      try {
        await tenantDb.delete(schema.productCategories)
          .where(eq(schema.productCategories.id, id));
      } catch (error) {
        console.error('Error deleting category:', error);
        throw error;
      }
    },

    async getProductBySku(sku: string) {
      try {
        const [product] = await tenantDb.select()
          .from(schema.products)
          .where(eq(schema.products.sku, sku))
          .limit(1);
        return product || null;
      } catch (error) {
        console.error('Error getting product by SKU:', error);
        return null;
      }
    },

    async deleteProduct(id: number): Promise<void> {
      try {
        await tenantDb.delete(schema.products)
          .where(eq(schema.products.id, id));
      } catch (error) {
        console.error('Error deleting product:', error);
        throw error;
      }
    },

    async getProductsByCategory(category: string) {
      try {
        return await tenantDb.select()
          .from(schema.products)
          .where(eq(schema.products.category, category));
      } catch (error) {
        console.error('Error getting products by category:', error);
        return [];
      }
    },

    

    /**
 * Actualiza la moneda base de un producto
 */
async updateProductCurrency(productId: number, baseCurrency: string): Promise<any> {
  try {
    console.log(`🔄 Updating product ${productId} base currency to ${baseCurrency}`);
    
    const updatedProduct = await this.tenantDb
      .update(schema.products)
      .set({ 
        baseCurrency: baseCurrency,
        updatedAt: new Date()
      })
      .where(eq(schema.products.id, productId))
      .returning();

    if (updatedProduct.length === 0) {
      throw new Error(`Product ${productId} not found`);
    }

    console.log(`✅ Product currency updated successfully`);
    return updatedProduct[0];
  } catch (error) {
    console.error('Error updating product currency:', error);
    throw error;
  }
},

/**
 * Obtiene productos con información de moneda
 */
async getProductsWithCurrency(): Promise<any[]> {
  try {
    const products = await this.tenantDb
      .select({
        id: schema.products.id,
        name: schema.products.name,
        description: schema.products.description,
        price: schema.products.price,
        baseCurrency: schema.products.baseCurrency,
        salePrice: schema.products.salePrice,
        category: schema.products.category,
        status: schema.products.status,
        imageUrl: schema.products.imageUrl,
        images: schema.products.images,
        sku: schema.products.sku,
        brand: schema.products.brand,
        model: schema.products.model,
        availability: schema.products.availability,
        stockQuantity: schema.products.stockQuantity,
        isPromoted: schema.products.isPromoted,
        promotionText: schema.products.promotionText,
        createdAt: schema.products.createdAt,
        updatedAt: schema.products.updatedAt
      })
      .from(schema.products)
      .where(eq(schema.products.status, 'active'))
      .orderBy(desc(schema.products.createdAt));

    return products;
  } catch (error) {
    console.error('Error getting products with currency:', error);
    throw error;
  }
},

// ================================
// MÉTODOS DE CATEGORÍAS
// ================================

async getAllCategories() {
  try {
    if (schema.productCategories) {
      const categories = await tenantDb.select()
        .from(schema.productCategories)
        .orderBy(asc(schema.productCategories.sortOrder), asc(schema.productCategories.name));
      
      console.log(`✅ Retrieved ${categories.length} categories from tenant DB`);
      return categories;
    }
    return [];
  } catch (error) {
    console.error('Error getting all categories:', error);
    return [];
  }
},

async createCategory(categoryData) {
  try {
    if (schema.productCategories) {
      const [newCategory] = await tenantDb.insert(schema.productCategories)
        .values({
          name: categoryData.name,
          description: categoryData.description || null,
          icon: categoryData.icon || null,
          isActive: categoryData.isActive !== undefined ? categoryData.isActive : true,
          sortOrder: categoryData.sortOrder || 0,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      console.log('✅ Category created:', newCategory.name);
      return newCategory;
    }
    throw new Error('productCategories schema not available');
  } catch (error) {
    console.error('Error creating category:', error);
    throw error;
  }
},

async updateCategory(id, updates) {
  try {
    if (schema.productCategories) {
      const [updatedCategory] = await tenantDb.update(schema.productCategories)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(schema.productCategories.id, id))
        .returning();
      
      if (!updatedCategory) {
        throw new Error('Category not found');
      }
      
      console.log('✅ Category updated:', updatedCategory.name);
      return updatedCategory;
    }
    throw new Error('productCategories schema not available');
  } catch (error) {
    console.error('Error updating category:', error);
    throw error;
  }
},


async getActiveCategories() {
  try {
    if (schema.productCategories) {
      const categories = await tenantDb.select()
        .from(schema.productCategories)
        .where(eq(schema.productCategories.isActive, true))
        .orderBy(asc(schema.productCategories.sortOrder), asc(schema.productCategories.name));
      
      return categories;
    }
    return [];
  } catch (error) {
    console.error('Error getting active categories:', error);
    return [];
  }
},
    // ORDERS
    async getAllOrders() {
      try {
        return await tenantDb.select()
          .from(schema.orders)
          .orderBy(desc(schema.orders.createdAt));
      } catch (error) {
        console.error('Error getting all orders:', error);
        return [];
      }
    },

  async getOrderById(id: number) {
  try {
    const [order] = await tenantDb.select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.id, id),
        )
      )
      .limit(1);
    return order || null;
  } catch (error) {
    console.error('Error getting order by ID:', error);
    return null;
  }
},

// 🎁 Helper function to calculate total loyalty points from order items
async calculateOrderLoyaltyPointsTotal(items: any[] = []): Promise<number> {
  try {
    if (!items || items.length === 0) {
      return 0;
    }

    let totalLoyaltyPoints = 0;

    // For each item, get the product and add its loyalty points value
    for (const item of items) {
      if (item.productId) {
        try {
          // Get the product to access loyaltyPointsValue
          const productQuery = `
            SELECT loyalty_points_value
            FROM "store_${storeId}".products
            WHERE id = ${item.productId} AND store_id = ${storeId}
          `;
          const productResult = await tenantDb.execute(productQuery);

          if (productResult.rows && productResult.rows.length > 0) {
            const product = productResult.rows[0];
            const loyaltyPointsValue = product.loyalty_points_value;

            if (loyaltyPointsValue) {
              // Multiply by quantity to get total for this line item
              const quantity = item.quantity || 1;
              const itemLoyaltyPoints = parseFloat(loyaltyPointsValue) * quantity;
              totalLoyaltyPoints += itemLoyaltyPoints;
            }
          }
        } catch (itemError) {
          console.warn(`⚠️ Error getting loyalty points for product ${item.productId}:`, itemError);
        }
      }
    }

    return totalLoyaltyPoints;
  } catch (error) {
    console.error('Error calculating loyalty points total:', error);
    return 0;
  }
},

// dYZ? Helper extendido: total de puntos + metadatos
async calculateOrderLoyaltyPointsData(items: any[] = []): Promise<{
  totalLoyaltyPoints: number;
  loyaltyPointsPropertyName: string | null;
  loyaltyPointsValue: number | null;
}> {
  const totalLoyaltyPoints = await this.calculateOrderLoyaltyPointsTotal(items);
  let loyaltyPointsPropertyName: string | null = null;
  let loyaltyPointsValue: number | null = null;

  if (!items || items.length === 0) {
    return { totalLoyaltyPoints, loyaltyPointsPropertyName, loyaltyPointsValue };
  }

  for (const item of items) {
    if (!item?.productId) continue;

    try {
      const productQuery = `
        SELECT loyalty_points_value, loyalty_points_property_name
        FROM "store_${storeId}".products
        WHERE id = ${item.productId} AND store_id = ${storeId}
        LIMIT 1
      `;
      const productResult = await tenantDb.execute(productQuery);
      const product = productResult?.rows?.[0];

      if (product) {
        if (!loyaltyPointsPropertyName && product.loyalty_points_property_name) {
          loyaltyPointsPropertyName = product.loyalty_points_property_name;
        }

        const rawValue = product.loyalty_points_value;
        if (rawValue !== null && rawValue !== undefined && !Number.isNaN(Number(rawValue))) {
          loyaltyPointsValue = loyaltyPointsValue ?? Number(rawValue);
        }
      }
    } catch (err) {
      console.warn(`No se pudieron obtener puntos de lealtad para el producto ${item.productId}:`, err);
    }
  }

  return { totalLoyaltyPoints, loyaltyPointsPropertyName, loyaltyPointsValue };
},

async createOrder(orderData: any, items: any[] = []) {
  try {
    // 🔥 GENERAR NÚMERO DE ORDEN ÚNICO
    const orderNumber = await this.generateOrderNumber();

    // 🎁 CALCULAR PUNTOS DE LEALTAD - Respetar valor del frontend si existe
    let totalLoyaltyPoints: number;
    let loyaltyPointsPropertyName: string | null;
    let loyaltyPointsValue: number | null;

    // Si el frontend ya envió loyaltyPointsTotal (con prorrateo de unidades), usarlo
    if (orderData.loyaltyPointsTotal !== undefined && orderData.loyaltyPointsTotal !== null) {
      totalLoyaltyPoints = Number(orderData.loyaltyPointsTotal);
      loyaltyPointsPropertyName = orderData.loyaltyPointsPropertyName || null;
      loyaltyPointsValue = orderData.loyaltyPointsValue !== undefined ? Number(orderData.loyaltyPointsValue) : null;
      console.log(`🎁 Using loyalty points from frontend: ${totalLoyaltyPoints}`);
    } else {
      // Si no viene del frontend, calcularlo
      const calculated = await this.calculateOrderLoyaltyPointsData(items);
      totalLoyaltyPoints = calculated.totalLoyaltyPoints;
      loyaltyPointsPropertyName = calculated.loyaltyPointsPropertyName;
      loyaltyPointsValue = calculated.loyaltyPointsValue;
      console.log(`🎁 Calculated loyalty points in backend: ${totalLoyaltyPoints}`);
    }

    const [order] = await tenantDb.insert(schema.orders)
      .values({
        ...orderData,
        orderNumber, // ✅ Agregar el número de orden generado
        loyaltyPointsTotal: totalLoyaltyPoints, // �o. Agregar puntos de lealtad calculados
        loyaltyPointsPropertyName: loyaltyPointsPropertyName,
        loyaltyPointsValue: loyaltyPointsValue,
        createdAt: new Date()
      })
      .returning();

    if (items && items.length > 0) {
      const itemsWithOrderId = items.map(item => ({
        ...item,
        orderId: order.id
      }));
      await tenantDb.insert(schema.orderItems).values(itemsWithOrderId);
    }

    return order;
  } catch (error) {
    console.error('Error creating order:', error);
    throw error;
  }
},

// 🔥 NUEVO MÉTODO: Generar número de orden único
async generateOrderNumber(): Promise<string> {
  try {
    // Opción 1: Formato simple con timestamp
    const timestamp = Date.now().toString().slice(-8); // Últimos 8 dígitos
    const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    return `ORD-${timestamp}-${random}`;
    
    // Opción 2: Formato con año y secuencial (descomentar si prefieres)
    /*
    const year = new Date().getFullYear();
    const count = await tenantDb.select({ count: sql`count(*)` })
      .from(schema.orders)
      .where(sql`extract(year from created_at) = ${year}`);
    
    const nextNumber = (count[0]?.count || 0) + 1;
    return `${year}-${nextNumber.toString().padStart(4, '0')}`;
    */
  } catch (error) {
    console.error('Error generating order number:', error);
    // Fallback en caso de error
    return `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }
},

    async updateOrder(id: number, orderData: any) {
      try {
        const [order] = await tenantDb.update(schema.orders)
          .set({ ...orderData, updatedAt: new Date() })
          .where(eq(schema.orders.id, id))
          .returning();
        return order;
      } catch (error) {
        console.error('Error updating order:', error);
        throw error;
      }
    },

    async updateOrderWithItems(id: number, orderData: any, items?: any[]) {
      try {
        console.log(`🔄 Updating order ${id} with items...`);

        // 2️⃣ Si se proporcionan items, reemplazar todos los items existentes
        if (items !== undefined) {
          console.log(`🗑️ Deleting existing items for order ${id}...`);

          // Eliminar items existentes
          await tenantDb.delete(schema.orderItems)
            .where(eq(schema.orderItems.orderId, id));

          console.log(`✅ Existing items deleted`);

          // Insertar nuevos items si hay alguno
          if (items.length > 0) {
            console.log(`➕ Inserting ${items.length} new items...`);

            const itemsWithOrderId = items.map(item => ({
              ...item,
              orderId: id
            }));

            await tenantDb.insert(schema.orderItems).values(itemsWithOrderId);
            console.log(`✅ New items inserted`);
          }

          // 🎁 RECALCULAR PUNTOS DE LEALTAD DESPUÉS DE ACTUALIZAR ITEMS
          const { totalLoyaltyPoints, loyaltyPointsPropertyName, loyaltyPointsValue } = await this.calculateOrderLoyaltyPointsData(items);
          console.log(`🎁 Recalculated loyalty points: ${totalLoyaltyPoints}`);
          orderData.loyaltyPointsTotal = totalLoyaltyPoints;
          orderData.loyaltyPointsPropertyName = loyaltyPointsPropertyName;
          orderData.loyaltyPointsValue = loyaltyPointsValue;
        }

        // 1️⃣ Actualizar la orden principal (ahora con puntos de lealtad recalculados si hubiera items)
        const [order] = await tenantDb.update(schema.orders)
          .set({ ...orderData, updatedAt: new Date() })
          .where(eq(schema.orders.id, id))
          .returning();

        if (!order) {
          throw new Error('Order not found');
        }

        // 3️⃣ Retornar la orden actualizada con sus items
        const updatedOrderWithItems = await this.getOrderById(id);
        console.log(`✅ Order ${id} updated successfully`);

        return updatedOrderWithItems;
      } catch (error) {
        console.error('❌ Error updating order with items:', error);
        throw error;
      }
    },

async deleteOrder(id: number) {
  try {
    console.log(`🗑️ Deleting order ${id}...`);
    
    // 1️⃣ PRIMERO: Eliminar customer_registration_flows relacionados
    try {
      const deletedFlows = await tenantDb
        .delete(schema.customerRegistrationFlows)
        .where(eq(schema.customerRegistrationFlows.orderId, id))
        .returning();
      
      if (deletedFlows.length > 0) {
        console.log(`✅ Deleted ${deletedFlows.length} registration flow(s) for order ${id}`);
      }
    } catch (flowError) {
      console.warn('⚠️ Error deleting registration flows (continuing):', flowError);
      // Continuar con la eliminación de la orden
    }
    
    // 2️⃣ LUEGO: Eliminar la orden
    await tenantDb.delete(schema.orders)
      .where(eq(schema.orders.id, id));
    
    console.log(`✅ Order ${id} deleted successfully`);
  } catch (error) {
    console.error('❌ Error deleting order:', error);
    throw error;
  }
},
 async getOrderItemsByOrderId(orderId: number) {
  try {
   // console.log(`🔍 GETTING ORDER ITEMS WITH PRODUCT NAMES - Order ID: ${orderId}`);
    
    // ✅ HACER JOIN entre order_items y products para obtener nombres
    const orderItemsWithProducts = await tenantDb
      .select({
        // Campos de order_items
        id: schema.orderItems.id,
        orderId: schema.orderItems.orderId,
        productId: schema.orderItems.productId,
        quantity: schema.orderItems.quantity,
        unitPrice: schema.orderItems.unitPrice,
        totalPrice: schema.orderItems.totalPrice,
        installationCost: schema.orderItems.installationCost,
        partsCost: schema.orderItems.partsCost,
        laborHours: schema.orderItems.laborHours,
        laborRate: schema.orderItems.laborRate,
        deliveryCost: schema.orderItems.deliveryCost,
        deliveryDistance: schema.orderItems.deliveryDistance,
        notes: schema.orderItems.notes,
        storeId: schema.orderItems.storeId,
        
        // ✅ CAMPOS DEL PRODUCTO (lo que necesitamos)
        productName: schema.products.name,
        productDescription: schema.products.description,
        productPrice: schema.products.price,
        productCategory: schema.products.category,
        productBrand: schema.products.brand,
        productModel: schema.products.model
      })
      .from(schema.orderItems)
      .leftJoin(
        schema.products,
        eq(schema.orderItems.productId, schema.products.id)
      )
      .where(eq(schema.orderItems.orderId, orderId))
      .orderBy(desc(schema.orderItems.id));

    //console.log(`📦 ORDER ITEMS WITH PRODUCTS FOUND: ${orderItemsWithProducts.length}`);
    
    // ✅ LOGGING DETALLADO para debugging
    orderItemsWithProducts.forEach((item, index) => {
      console.log(`  ${index + 1}. Product ID: ${item.productId} | Name: "${item.productName}" | Quantity: ${item.quantity}`);
    });

    return orderItemsWithProducts;
    
  } catch (error) {
    console.error('❌ Error getting order items with products:', error);
    return [];
  }
},


async getOrderItems(orderId: number) {
  return await this.db.select()
    .from(this.schema.orderItems)  // o como se llame tu tabla
    .where(eq(this.schema.orderItems.orderId, orderId));
},

async createOrderItem(itemData: any) {
  try {
    const [item] = await tenantDb.insert(schema.orderItems)
      .values({
        ...itemData,
        createdAt: new Date()
      })
      .returning();
    return item;
  } catch (error) {
    console.error('Error creating order item:', error);
    throw error;
  }
},

async updateOrderItem(id: number, itemData: any) {
  try {
    const [item] = await tenantDb.update(schema.orderItems)
      .set({ ...itemData, updatedAt: new Date() })
      .where(eq(schema.orderItems.id, id))
      .returning();
    return item;
  } catch (error) {
    console.error('Error updating order item:', error);
    throw error;
  }
},

async deleteOrderItem(id: number) {
  try {
    await tenantDb.delete(schema.orderItems)
      .where(eq(schema.orderItems.id, id));
  } catch (error) {
    console.error('Error deleting order item:', error);
    throw error;
  }
},

async updateCustomerLocation(customerId: number, locationData: {
  address: string;
  latitude?: number;
  longitude?: number;
  locationType: 'coordinates' | 'text';
  formattedAddress?: string;
}): Promise<void> {
  try {
    const updateData = {
      address: locationData.address,
      latitude: locationData.latitude || null,
      longitude: locationData.longitude || null,
      location_type: locationData.locationType,
      formatted_address: locationData.formattedAddress || locationData.address,
      updated_at: new Date()
    };

    await this.db
      .update(this.schema.customers)
      .set(updateData)
      .where(eq(this.schema.customers.id, customerId));

  } catch (error) {
    console.error('❌ Error updating customer location:', error);
    throw error;
  }
},

async getStoreLocation(storeId: number): Promise<any | null> {
  try {
    // Si no tienes tabla store_locations, crear ubicación por defecto
    return {
      id: 1,
      storeId: storeId,
      name: 'Tienda Principal',
      address: 'Santo Domingo, República Dominicana',
      latitude: 18.4861,  // Coordenadas de Santo Domingo
      longitude: -69.9312,
      isMainLocation: true
    };
  } catch (error) {
    console.error('❌ Error getting store location:', error);
    return null;
  }
},

// Agregar este método en tu TenantStorage class

    // PRODUCTS



   async createProduct(productData: any, storeId: number) {
  try {
    if (!productData.name) {
      throw new Error('Product name is required');
    }

    const productToInsert = {
      name: productData.name,
      description: productData.description || '',
      price: productData.price || '0.00',
      baseCurrency: productData.baseCurrency || 'DOP', // ✅ Campo de moneda
      category: productData.category || 'general',
      status: productData.status || 'active',
      imageUrl: productData.imageUrl || null,
      images: productData.images || null,
      sku: productData.sku || null,
      barcode: productData.barcode || null, // ✅ Código de barras
      brand: productData.brand || null,
      model: productData.model || null,
      specifications: productData.specifications || null,
      features: productData.features || null,
      warranty: productData.warranty || null,
      availability: productData.availability || 'in_stock',
      stockQuantity: productData.stockQuantity || 0,
      minQuantity: productData.minQuantity || 1,
      maxQuantity: productData.maxQuantity || null,
      lotNumber: productData.lotNumber || null, // ✅ Número de lote
      expirationDate: productData.expirationDate || null, // ✅ Fecha de vencimiento
      weight: productData.weight || null,
      dimensions: productData.dimensions || null,
      tags: productData.tags || null,
      salePrice: productData.salePrice || null,
      isPromoted: productData.isPromoted || false,
      promotionText: productData.promotionText || null,
      // 🎁 FIDELIZACIÓN - Campos opcionales para plan de puntos
      loyaltyPointsPropertyName: productData.loyaltyPointsPropertyName || null,
      loyaltyPointsValue: productData.loyaltyPointsValue || null,
      storeId: storeId,  // ← ¡Este campo falta!
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const [product] = await tenantDb.insert(schema.products)
      .values(productToInsert)
      .returning();

    return product;
  } catch (error) {
    console.error('Error creating product:', error);
    throw error;
  }
},

   async updateProduct(id: number, productData: any) {
  try {
    // Filtrar campos undefined
    const filteredData = Object.fromEntries(
      Object.entries(productData).filter(([_, value]) => value !== undefined)
    );

    const updateData = {
      ...filteredData,
      updatedAt: new Date()
    };

    const [product] = await tenantDb.update(schema.products)
      .set(updateData)
      .where(eq(schema.products.id, id))
      .returning();

    return product;
  } catch (error) {
    console.error('Error updating product:', error);
    throw error;
  }
},


    // MOVIMIENTOS DE INVENTARIO
    async createInventoryMovement(data: {
      productId: number;
      type: "purchase" | "sale" | "adjustment" | "return";
      quantity: number;
      unitId?: number;
      notes?: string;
      referenceType?: string;
      referenceId?: number;
      lotNumber?: string | null;
      expirationDate?: Date | null;
    }) {
      const { productId, type, quantity } = data;
      if (!productId || !quantity || !type) {
        throw new Error('productId, type y quantity son requeridos');
      }

      const [product] = await tenantDb.select().from(schema.products).where(eq(schema.products.id, productId)).limit(1);
      if (!product) {
        throw new Error(`Producto ${productId} no encontrado`);
      }

      const currentStock = product.stockQuantity || 0;

      let delta = quantity;
      if (type === 'sale') {
        delta = -Math.abs(quantity);
      } else if (type === 'purchase' || type === 'return') {
        delta = Math.abs(quantity);
      }

      const newStock = currentStock + delta;
      if (newStock < 0) {
        throw new Error(`Stock insuficiente para movimiento. Actual: ${currentStock}, delta: ${delta}`);
      }

      const [movement] = await tenantDb.insert(schema.inventoryMovements).values({
        storeId,
        productId,
        type,
        quantity: delta,
        unitId: data.unitId || null,
        notes: data.notes || null,
        referenceType: data.referenceType || null,
        referenceId: data.referenceId || null,
        lotNumber: data.lotNumber ?? product.lotNumber ?? null,
        expirationDate: data.expirationDate ?? product.expirationDate ?? null,
        createdAt: new Date(),
        createdBy: null,
      }).returning();

      await tenantDb.update(schema.products)
        .set({
          stockQuantity: newStock,
          lotNumber: data.lotNumber !== undefined ? data.lotNumber : product.lotNumber,
          expirationDate: data.expirationDate !== undefined ? data.expirationDate : product.expirationDate,
          updatedAt: new Date(),
        })
        .where(eq(schema.products.id, productId));

      return movement;
    },

    async getInventoryMovementsByProduct(productId: number) {
      return tenantDb.select()
        .from(schema.inventoryMovements)
        .where(eq(schema.inventoryMovements.productId, productId))
        .orderBy(desc(schema.inventoryMovements.createdAt))
        .limit(50);
    },
    // CUSTOMERS
async getAllCustomers() {
  if (usePublicSchema) {
    const result = await tenantDb.execute(sql`
      SELECT
        c.*,
        pc.id as "parentCustomer_id",
        pc.name as "parentCustomer_name"
      FROM ${schema.customers} c
      LEFT JOIN ${schema.customers} pc ON c.parent_customer_id = pc.id
      ORDER BY c.created_at DESC
    `);

    // Transform the flat result into nested structure and convert snake_case to camelCase
    return result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      storeId: row.store_id,
      whatsappId: row.whatsapp_id,
      customerTypeId: row.customer_type_id,
      parentCustomerId: row.parent_customer_id,
      category: row.category,
      latitude: row.latitude,
      longitude: row.longitude,
      mapLink: row.map_link,
      lastContact: row.last_contact,
      registrationDate: row.registration_date,
      totalOrders: row.total_orders,
      totalSpent: row.total_spent,
      isVip: row.is_vip,
      isActive: row.is_active,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      parentCustomer: row.parentCustomer_id ? {
        id: row.parentCustomer_id,
        name: row.parentCustomer_name
      } : undefined
    }));
  } else {
    const directQuery = `
      SELECT
        c.*,
        pc.id as "parentCustomer_id",
        pc.name as "parentCustomer_name"
      FROM "store_${storeId}".customers c
      LEFT JOIN "store_${storeId}".customers pc ON c.parent_customer_id = pc.id
      WHERE c.store_id = ${storeId}
      ORDER BY c.created_at DESC
    `;
    const result = await tenantDb.execute(sql.raw(directQuery));

    // Transform the flat result into nested structure and convert snake_case to camelCase
    return result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      storeId: row.store_id,
      whatsappId: row.whatsapp_id,
      customerTypeId: row.customer_type_id,
      parentCustomerId: row.parent_customer_id,
      category: row.category,
      latitude: row.latitude,
      longitude: row.longitude,
      mapLink: row.map_link,
      lastContact: row.last_contact,
      registrationDate: row.registration_date,
      totalOrders: row.total_orders,
      totalSpent: row.total_spent,
      isVip: row.is_vip,
      isActive: row.is_active,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      parentCustomer: row.parentCustomer_id ? {
        id: row.parentCustomer_id,
        name: row.parentCustomer_name
      } : undefined
    }));
  }
},
    async getCustomerById(id: number) {
      try {
        const result = await tenantDb.execute(sql`
          SELECT
            c.*,
            pc.id as "parentCustomer_id",
            pc.name as "parentCustomer_name"
          FROM ${schema.customers} c
          LEFT JOIN ${schema.customers} pc ON c.parent_customer_id = pc.id
          WHERE c.id = ${id}
          LIMIT 1
        `);

        if (!result.rows || result.rows.length === 0) {
          return null;
        }

        const row = result.rows[0];
        return {
          id: row.id,
          name: row.name,
          phone: row.phone,
          email: row.email,
          address: row.address,
          storeId: row.store_id,
          whatsappId: row.whatsapp_id,
          customerTypeId: row.customer_type_id,
          parentCustomerId: row.parent_customer_id,
          category: row.category,
          latitude: row.latitude,
          longitude: row.longitude,
          mapLink: row.map_link,
          lastContact: row.last_contact,
          registrationDate: row.registration_date,
          totalOrders: row.total_orders,
          totalSpent: row.total_spent,
          isVip: row.is_vip,
          isActive: row.is_active,
          notes: row.notes,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          parentCustomer: row.parentCustomer_id ? {
            id: row.parentCustomer_id,
            name: row.parentCustomer_name
          } : undefined
        };
      } catch (error) {
        console.error('Error getting customer by ID:', error);
        return null;
      }
    },

   // 🔧 FUNCIONES CORREGIDAS PARA tenant-storage.ts

// ✅ CORREGIR getCustomerByPhone - usar "phone" en lugar de "phoneNumber"
async getCustomerByPhone(phoneNumber: string) {
  try {
    console.log(`🔍 Searching customer by phone: ${phoneNumber} in store: ${storeId}`);
    
    if (usePublicSchema) {
      const [customer] = await tenantDb.select()
        .from(schema.customers)
        .where(eq(schema.customers.phone, phoneNumber))
        .limit(1);
      console.log(`✅ Customer found (public): ${customer ? customer.id : 'None'}`);
      return customer || null;
    } else {
      // Para esquemas de tenant, usar Pool directo para evitar problemas con drizzle
      return await this.getCustomerByPhoneFallback(phoneNumber);
    }
  } catch (error) {
    console.error('❌ Error getting customer by phone:', error);
    return await this.getCustomerByPhoneFallback(phoneNumber);
  }
},
async getCustomerByPhoneFallback(phoneNumber: string) {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    max: 1,
    idleTimeoutMillis: 5000
  });
  
  try {
    console.log(`🔄 Using fallback method for phone: ${phoneNumber}`);
    
    // Obtener el schema de la tienda
    const storeResult = await pool.query(`
      SELECT database_url FROM virtual_stores WHERE id = $1
    `, [storeId]);
    
    if (!storeResult.rows[0]) {
      console.error(`❌ Store ${storeId} not found`);
      return null;
    }
    
    const schemaMatch = storeResult.rows[0].database_url?.match(/schema=([^&]+)/);
    const schemaName = schemaMatch ? schemaMatch[1] : 'public';
    
    console.log(`🔄 Working in schema: ${schemaName}`);
    
    // Configurar search_path
    await pool.query(`SET search_path TO ${schemaName}, public`);
    
    // Buscar cliente
    const result = await pool.query(`
      SELECT * FROM customers 
      WHERE phone = $1 AND store_id = $2
      LIMIT 1
    `, [phoneNumber, storeId]);
    
    const customer = result.rows[0] || null;
    
    if (customer) {
      console.log(`✅ Customer found via fallback: ID ${customer.id}`);
      // Convertir snake_case a camelCase para compatibilidad
      return {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        latitude: customer.latitude,
        longitude: customer.longitude,
        notes: customer.notes,
        isVip: customer.is_vip,
        createdAt: customer.created_at,
        updatedAt: customer.updated_at,
        storeId: customer.store_id,
        whatsappName: customer.whatsapp_name,
        contactMethod: customer.contact_method,
        preferredContactTime: customer.preferred_contact_time,
        customerType: customer.customer_type,
        companyName: customer.company_name,
        taxId: customer.tax_id,
        mapLink: customer.map_link,
        whatsappId: customer.whatsapp_id,
        lastContact: customer.last_contact,
        registrationDate: customer.registration_date,
        totalOrders: customer.total_orders,
        totalSpent: customer.total_spent
      };
    } else {
      console.log(`❌ No customer found for phone: ${phoneNumber}`);
      return null;
    }
    
  } catch (error) {
    console.error('❌ Fallback method failed:', error);
    return null;
  } finally {
    await pool.end().catch(err => 
      console.log('⚠️ Pool close warning:', err.message)
    );
  }
},

async ensureCorrectSchema(): Promise<boolean> {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    max: 1,
    idleTimeoutMillis: 5000
  });
  
  try {
    // Obtener información de la tienda
    const storeResult = await pool.query(`
      SELECT database_url FROM virtual_stores WHERE id = $1
    `, [storeId]);
    
    if (!storeResult.rows[0]) {
      console.error(`❌ Store ${storeId} not found`);
      return false;
    }
    
    const schemaMatch = storeResult.rows[0].database_url?.match(/schema=([^&]+)/);
    const schemaName = schemaMatch ? schemaMatch[1] : 'public';
    
    console.log(`🔍 Schema verification for store ${storeId}: ${schemaName}`);
    
    // Verificar que la tabla customers existe en el schema
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = $1 AND table_name = 'customers'
      )
    `, [schemaName]);
    
    const tableExists = tableCheck.rows[0]?.exists;
    
    if (!tableExists) {
      console.error(`❌ Table 'customers' does not exist in schema '${schemaName}'`);
      return false;
    }
    
    console.log(`✅ Schema verification passed for store ${storeId}`);
    return true;
    
  } catch (error) {
    console.error('❌ Schema verification failed:', error);
    return false;
  } finally {
    await pool.end().catch(err => 
      console.log('⚠️ Pool close warning:', err.message)
    );
  }
},

// Agregar este método a la clase TenantStorage en server/tenant-storage.ts

// Agregar este método al objeto que se retorna en la función createTenantStorage()
// en server/tenant-storage.ts

// OPCIÓN 2: Agregar validación adicional al método getTechnicianOrders en server/tenant-storage.ts

async getTechnicianOrders(userId: number) {
  try {
    console.log('🔧 Getting orders for technician:', userId);
    
    // Obtener órdenes asignadas al técnico usando tenantDb
    const orders = await tenantDb.select()
      .from(schema.orders)
      .where(eq(schema.orders.assignedUserId, userId))
      .orderBy(desc(schema.orders.createdAt));
    
    console.log('📦 Found basic orders:', orders.length);
    
    if (orders.length === 0) {
      console.log('ℹ️ No orders found for technician:', userId);
      return [];
    }
    
    // Enriquecer con detalles de cliente y productos
    const enrichedOrders = await Promise.all(
      orders.map(async (order) => {
        try {
          // ✅ VALIDACIÓN: Verificar que order existe y tiene ID
          if (!order || !order.id) {
            console.warn('⚠️ Invalid order found:', order);
            return null;
          }

          // Obtener información del cliente con validación
          let customer = null;
          if (order.customerId) {
            try {
              const [customerResult] = await tenantDb.select()
                .from(schema.customers)
                .where(eq(schema.customers.id, order.customerId))
                .limit(1);
              customer = customerResult;
            } catch (customerError) {
              console.warn('⚠️ Error getting customer for order:', order.id, customerError);
            }
          }
          
          // Obtener información del usuario asignado con validación
          let assignedUser = null;
          if (order.assignedUserId) {
            try {
              const [userResult] = await tenantDb.select()
                .from(schema.users)
                .where(eq(schema.users.id, order.assignedUserId))
                .limit(1);
              assignedUser = userResult;
            } catch (userError) {
              console.warn('⚠️ Error getting assigned user for order:', order.id, userError);
            }
          }
          
          // Obtener items de la orden con validación
          let orderItems = [];
          try {
            orderItems = await tenantDb.select()
              .from(schema.orderItems)
              .where(eq(schema.orderItems.orderId, order.id));
          } catch (itemsError) {
            console.warn('⚠️ Error getting order items for order:', order.id, itemsError);
          }
          
          // Enriquecer items con información de productos
          const itemsWithProducts = await Promise.all(
            orderItems.map(async (item) => {
              try {
                if (!item || !item.productId) {
                  console.warn('⚠️ Invalid item found:', item);
                  return {
                    ...item,
                    productName: 'Producto desconocido',
                    productPrice: 0
                  };
                }

                const [product] = await tenantDb.select()
                  .from(schema.products)
                  .where(eq(schema.products.id, item.productId))
                  .limit(1);
                
                return {
                  ...item,
                  productName: product?.name || `Producto ${item.productId}`,
                  productPrice: product?.price ? parseFloat(product.price.toString()) : 0
                };
              } catch (error) {
                console.error('❌ Error getting product for item:', item?.productId, error);
                return {
                  ...item,
                  productName: `Producto ${item?.productId || 'desconocido'}`,
                  productPrice: 0
                };
              }
            })
          );
          
          // ✅ ESTRUCTURA FINAL CON VALIDACIONES
          const enrichedOrder = {
            ...order,
            // Asegurar que customer siempre tenga una estructura válida
            customer: customer ? {
              id: customer.id || 0,
              name: customer.name || 'Cliente desconocido',
              phone: customer.phone || order.contactNumber || '',
              email: customer.email || null,
              address: customer.address || order.deliveryAddress || null
            } : {
              id: order.customerId || 0,
              name: 'Cliente desconocido',
              phone: order.contactNumber || '',
              email: null,
              address: order.deliveryAddress || null
            },
            // Asegurar que assignedUser tenga una estructura válida
            assignedUser: assignedUser ? {
              id: assignedUser.id,
              username: assignedUser.username || 'Usuario',
              firstName: assignedUser.firstName || null,
              lastName: assignedUser.lastName || null,
              role: assignedUser.role || 'technician'
            } : null,
            // Asegurar que items siempre sea un array
            items: itemsWithProducts || []
          };

          // ✅ VALIDACIÓN FINAL: Verificar que la orden tiene la estructura mínima necesaria
          if (!enrichedOrder.orderNumber) {
            enrichedOrder.orderNumber = `ORD-${enrichedOrder.id}`;
          }
          if (!enrichedOrder.status) {
            enrichedOrder.status = 'pending';
          }
          if (!enrichedOrder.createdAt) {
            enrichedOrder.createdAt = new Date().toISOString();
          }
          if (!enrichedOrder.updatedAt) {
            enrichedOrder.updatedAt = enrichedOrder.createdAt;
          }

          return enrichedOrder;
          
        } catch (error) {
          console.error('❌ Error enriching order:', order?.id, error);
          
          // ✅ FALLBACK: En caso de error, devolver orden básica pero válida
          return {
            ...order,
            orderNumber: order.orderNumber || `ORD-${order.id}`,
            status: order.status || 'pending',
            createdAt: order.createdAt || new Date().toISOString(),
            updatedAt: order.updatedAt || order.createdAt || new Date().toISOString(),
            customer: {
              id: order.customerId || 0,
              name: 'Cliente desconocido',
              phone: order.contactNumber || '',
              email: null,
              address: order.deliveryAddress || null
            },
            assignedUser: null,
            items: []
          };
        }
      })
    );
    
    // ✅ FILTRAR ÓRDENES NULAS y verificar que tenemos datos válidos
    const validOrders = enrichedOrders.filter(order => order !== null && order !== undefined);
    
    console.log('✅ Found enriched orders for technician:', validOrders.length);
    console.log('📊 Sample order structure:', validOrders[0] ? {
      id: validOrders[0].id,
      orderNumber: validOrders[0].orderNumber,
      hasCustomer: !!validOrders[0].customer,
      customerName: validOrders[0].customer?.name,
      itemsCount: validOrders[0].items?.length || 0,
      sampleItem: validOrders[0].items?.[0]?.productName
    } : 'No orders found');
    
    return validOrders;
    
  } catch (error) {
    console.error('❌ Error getting technician orders:', error);
    // En lugar de throw, devolver array vacío para evitar crashes
    return [];
  }
},

// ✅ MEJORAR createCustomer con UPSERT y manejo de errores
async createCustomer(customerData: any) {
  try {
    // 🔍 PRIMERA VERIFICACIÓN: ¿Ya existe el cliente?
    const existingCustomer = await this.getCustomerByPhone(customerData.phone);
    if (existingCustomer) {
      console.log('Customer already exists, returning existing:', existingCustomer.id);
      return existingCustomer;
    }

    // 🚀 CREAR NUEVO CLIENTE
    const customerToInsert = {
      ...customerData,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const [customer] = await tenantDb.insert(schema.customers)
      .values(customerToInsert)
      .returning();
    
    console.log('✅ NEW CUSTOMER CREATED:', customer.id);
    return customer;
    
  } catch (error: any) {
    console.error('Error in createCustomer:', error);
    
    // 🚨 MANEJO DE ERROR DE CLAVE DUPLICADA
    if (error.message?.includes('duplicate key') || 
        error.message?.includes('unique constraint') ||
        error.code === '23505') {
      
      console.log('🔄 Handling duplicate key error - fetching existing customer');
      
      // Buscar el cliente existente
      const existingCustomer = await this.getCustomerByPhone(customerData.phone);
      if (existingCustomer) {
        console.log('✅ Retrieved existing customer:', existingCustomer.id);
        return existingCustomer;
      } else {
        console.error('❌ Could not retrieve existing customer after duplicate error');
        throw new Error(`Failed to handle duplicate customer: ${customerData.phone}`);
      }
    }
    
    // Re-lanzar otros tipos de errores
    throw error;
  }
},

// 🔄 ALTERNATIVA: Usar UPSERT para mayor robustez
async createOrUpdateCustomer(customerData: any) {
  try {
    const customerToInsert = {
      ...customerData,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const [customer] = await tenantDb.insert(schema.customers)
      .values(customerToInsert)
      .onConflictDoUpdate({
        target: schema.customers.phone,
        set: {
          lastContact: new Date(),
          updatedAt: new Date(),
          // Opcional: actualizar otros campos si es necesario
          name: customerToInsert.name,
          whatsappId: customerToInsert.whatsappId
        }
      })
      .returning();
    
    return customer;
  } catch (error) {
    console.error('Error in createOrUpdateCustomer:', error);
    throw error;
  }
},

    async updateCustomer(id: number, customerData: any) {
      try {
        const [customer] = await tenantDb.update(schema.customers)
          .set({ ...customerData, updatedAt: new Date() })
          .where(eq(schema.customers.id, id))
          .returning();
        return customer;
      } catch (error) {
        console.error('Error updating customer:', error);
        throw error;
      }
    },

    // USERS
    async getAllUsers() {
      try {
        return await tenantDb.select()
          .from(schema.users)
          .orderBy(desc(schema.users.createdAt));
      } catch (error) {
        console.error('Error getting all users:', error);
        return [];
      }
    },

    async getUserById(id: number) {
      try {
        const [user] = await tenantDb.select()
          .from(schema.users)
          .where(eq(schema.users.id, id))
          .limit(1);
        return user || null;
      } catch (error) {
        console.error('Error getting user by ID:', error);
        return null;
      }
    },

   async deleteUser(userId: number) {
  try {
    // Verificar que el usuario existe
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    // No permitir eliminar super admin
    if (user.role === 'super_admin') {
      throw new Error('Cannot delete super admin user');
    }
    
    await tenantDb
      .delete(schema.users)
      .where(eq(schema.users.id, userId));
    
    console.log('✅ User deleted:', userId);
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
},

    // NOTIFICATIONS

async getUserNotifications(userId: number) {
  if (usePublicSchema) {
    // Super admin busca en public
    return await tenantDb.select({
      id: schema.notifications.id,
      userId: schema.notifications.userId,
      title: schema.notifications.title,
      message: schema.notifications.message,
      type: schema.notifications.type,
      priority: schema.notifications.priority,
      isRead: schema.notifications.isRead,
      relatedId: schema.notifications.relatedId,
      relatedType: schema.notifications.relatedType,
      metadata: schema.notifications.metadata,
      createdAt: schema.notifications.createdAt
    })
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, userId))
    .orderBy(desc(schema.notifications.createdAt));
  } else {
    // Store users buscan en tenant schema
    const schemaName = `store_${storeId}`;
    const directQuery = `
  SELECT id, user_id, title, message, type, priority, is_read,
         related_id, related_type, metadata, created_at
  FROM "store_${storeId}".notifications 
  WHERE user_id = ${userId}
  ORDER BY created_at DESC
`;
const result = await tenantDb.execute(directQuery);
    return result.rows;
  }
},

    async getUnreadNotifications(userId: number) {
      try {
        return await tenantDb.select()
          .from(schema.notifications)
          .where(
            and(
              eq(schema.notifications.userId, userId),
              eq(schema.notifications.isRead, false)
            )
          )
          .orderBy(desc(schema.notifications.createdAt));
      } catch (error) {
        console.error('Error getting unread notifications:', error);
        return [];
      }
    },

async getNotificationCounts(userId: number) {
  try {
    if (usePublicSchema) {
      // Código existente para public schema
    } else {
      // Usar sql directo con template literals
      const query = `
        SELECT 
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE is_read = false)::int as unread
        FROM notifications 
        WHERE user_id = ${userId}
      `;
      
      const result = await tenantDb.execute(query);
      const row = result.rows[0];
      
      return {
        total: row.total || 0,
        unread: row.unread || 0
      };
    }
  } catch (error) {
    console.error('Error getting notification counts:', error);
    return { total: 0, unread: 0 };
  }
},

    async createNotification(notificationData: any) {
      try {
        const [notification] = await tenantDb.insert(schema.notifications)
          .values({
            ...notificationData,
            isRead: false,
            createdAt: new Date()
          })
          .returning();
        return notification;
      } catch (error) {
        console.error('Error creating notification:', error);
        throw error;
      }
    },

    async markNotificationAsRead(id: number) {
      try {
        const [notification] = await tenantDb.update(schema.notifications)
          .set({ isRead: true, updatedAt: new Date() })
          .where(eq(schema.notifications.id, id))
          .returning();
        return notification;
      } catch (error) {
        console.error('Error marking notification as read:', error);
        throw error;
      }
    },

    async markAllNotificationsAsRead(userId: number) {
      try {
        await tenantDb.update(schema.notifications)
          .set({ isRead: true, updatedAt: new Date() })
          .where(eq(schema.notifications.userId, userId));
      } catch (error) {
        console.error('Error marking all notifications as read:', error);
        throw error;
      }
    },

    async deleteNotification(id: number) {
      try {
        await tenantDb.delete(schema.notifications)
          .where(eq(schema.notifications.id, id));
      } catch (error) {
        console.error('Error deleting notification:', error);
        throw error;
      }
    },

async createUser(userData: any) {
  try {
    console.log('🔄 Creating tenant user in schema:', userData.username);
    
    const [user] = await tenantDb.insert(schema.users)
      .values({
        ...userData,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    
    console.log('✅ Tenant user created with ID:', user.id);
    return user;
  } catch (error) {
    console.error('❌ Error creating tenant user:', error);
    
    // Manejar errores de duplicados
    if (error.code === '23505' || error.message?.includes('duplicate key')) {
      throw new Error(`Username '${userData.username}' already exists`);
    }
    
    throw error;
  }
},

// ================================
// EMPLOYEE PROFILES
// ================================










// ================================
// EMPLOYEE PROFILES (PLANTILLAS REUTILIZABLES)
// ================================

// ✅ Obtener todas las plantillas de perfiles
async getAllEmployeeProfiles() {
  try {
    console.log('🔍 Getting all employee profile templates');
    
    const profiles = await tenantDb
      .select()
      .from(schema.employeeProfiles)
      .orderBy(desc(schema.employeeProfiles.createdAt));
    
    console.log(`✅ Retrieved ${profiles.length} employee profile templates`);
    return profiles;
  } catch (error) {
    console.error('Error getting employee profiles:', error);
    return [];
  }
},

// ✅ Obtener perfil por ID
async getEmployeeProfileById(id: number) {
  try {
    const [profile] = await tenantDb
      .select()
      .from(schema.employeeProfiles)
      .where(eq(schema.employeeProfiles.id, id))
      .limit(1);
    
    return profile || null;
  } catch (error) {
    console.error('Error getting employee profile:', error);
    return null;
  }
},

// ✅ Obtener perfil por employeeId (código único)
async getEmployeeProfileByEmployeeId(employeeId: string) {
  try {
    const [profile] = await tenantDb
      .select()
      .from(schema.employeeProfiles)
      .where(eq(schema.employeeProfiles.employeeId, employeeId))
      .limit(1);
    
    return profile || null;
  } catch (error) {
    console.error('Error getting employee profile by employeeId:', error);
    return null;
  }
},

// ✅ Crear nueva plantilla de perfil (sin usuario asociado)
async createEmployeeProfile(profileData: any) {
  try {
    console.log('🔄 Creating employee profile template:', profileData);
    
   
    const [profile] = await tenantDb
      .insert(schema.employeeProfiles)
      .values({
        ...profileData,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    
    console.log('✅ Employee profile template created:', profile.id);
    return profile;
  } catch (error) {
    console.error('Error creating employee profile:', error);
    throw error;
  }
},

// ✅ Actualizar plantilla de perfil
async updateEmployeeProfile(id: number, updates: any) {
  try {
    const [profile] = await tenantDb
      .update(schema.employeeProfiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.employeeProfiles.id, id))
      .returning();
    
    console.log('✅ Employee profile template updated:', id);
    return profile;
  } catch (error) {
    console.error('Error updating employee profile:', error);
    throw error;
  }
},

// ✅ Eliminar plantilla (solo si ningún usuario la usa)
async deleteEmployeeProfile(id: number) {
  try {
    // Verificar que no haya usuarios usando este perfil
    const usersWithProfile = await tenantDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.employeeProfileId, id));
    
    if (usersWithProfile.length > 0) {
      throw new Error(`Cannot delete profile: ${usersWithProfile.length} users are using it`);
    }
    
    await tenantDb
      .delete(schema.employeeProfiles)
      .where(eq(schema.employeeProfiles.id, id));
    
    console.log('✅ Employee profile template deleted:', id);
  } catch (error) {
    console.error('Error deleting employee profile:', error);
    throw error;
  }
},

// ================================
// EMPLOYEES (USUARIOS CON PERFIL ASIGNADO)
// ================================

// ✅ Obtener todos los empleados con sus perfiles
async getEmployeesWithProfiles() {
  try {
    const employees = await tenantDb
      .select({
        // Datos del usuario
        id: schema.users.id,
        username: schema.users.username,
        name: schema.users.name,
        email: schema.users.email,
        phone: schema.users.phone,
        role: schema.users.role,
        status: schema.users.status,
        employeeProfileId: schema.users.employeeProfileId,
        address: schema.users.address,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
        // Perfil asignado
        profile: schema.employeeProfiles
      })
      .from(schema.users)
      .leftJoin(
        schema.employeeProfiles, 
        eq(schema.users.employeeProfileId, schema.employeeProfiles.id)
      )
      // ❌ QUITAR FILTRO .where()
      .orderBy(desc(schema.users.createdAt));
    
    console.log(`✅ Retrieved ${employees.length} employees with profiles`);
    return employees;
  } catch (error) {
    console.error('Error getting employees with profiles:', error);
    return [];
  }
},

// ✅ Obtener perfil de UN usuario específico
async getEmployeeProfile(userId: number) {
  try {
    const [result] = await tenantDb
      .select({
        user: schema.users,
        profile: schema.employeeProfiles
      })
      .from(schema.users)
      .leftJoin(
        schema.employeeProfiles, 
        eq(schema.users.employeeProfileId, schema.employeeProfiles.id)
      )
      .where(eq(schema.users.id, userId))
      .limit(1);
    
    return result || null;
  } catch (error) {
    console.error('Error getting employee profile:', error);
    return null;
  }
},

// ✅ Asignar perfil a usuario (o quitar si profileId es null)
async assignProfileToUser(userId: number, profileId: number | null) {
  try {
    const [user] = await tenantDb
      .update(schema.users)
      .set({ 
        employeeProfileId: profileId,
        updatedAt: new Date() 
      })
      .where(eq(schema.users.id, userId))
      .returning();
    
    console.log(`✅ Profile ${profileId} assigned to user ${userId}`);
    return user;
  } catch (error) {
    console.error('Error assigning profile to user:', error);
    throw error;
  }
},

// ✅ Obtener empleados por departamento (del perfil)
async getEmployeesByDepartment(department: string) {
  try {
    const employees = await tenantDb
      .select({
        user: schema.users,
        profile: schema.employeeProfiles
      })
      .from(schema.users)
      .leftJoin(
        schema.employeeProfiles, 
        eq(schema.users.employeeProfileId, schema.employeeProfiles.id)
      )
      .where(eq(schema.employeeProfiles.department, department))
      .orderBy(desc(schema.users.createdAt));
    
    return employees;
  } catch (error) {
    console.error('Error getting employees by department:', error);
    return [];
  }
},

// ✅ Generar ID único para nuevo perfil
async generateEmployeeId(department: string) {
  try {
    const departmentPrefix = {
      'technical': 'TECH',
      'sales': 'SALES', 
      'delivery': 'DEL',
      'support': 'SUP',
      'admin': 'ADM'
    }[department] || 'EMP';
    
    const employees = await tenantDb
      .select()
      .from(schema.employeeProfiles)
      .where(eq(schema.employeeProfiles.department, department))
      .orderBy(desc(schema.employeeProfiles.employeeId));
    
    const nextNumber = employees.length + 1;
    const employeeId = `${departmentPrefix}-${String(nextNumber).padStart(3, '0')}`;
    
    return employeeId;
  } catch (error) {
    console.error('Error generating employee ID:', error);
    return `EMP-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
  }
},

// ✅ Obtener técnicos disponibles con filtros
async getAvailableTechnicians(specializations?: string[], maxDistance?: number, customerLocation?: { latitude: string; longitude: string }) {
  try {
    let query = tenantDb
      .select({
        user: schema.users,
        profile: schema.employeeProfiles
      })
      .from(schema.users)
      .leftJoin(
        schema.employeeProfiles,
        eq(schema.users.employeeProfileId, schema.employeeProfiles.id)
      )
      .where(
        and(
          or(
            eq(schema.users.role, 'technician'),
            eq(schema.users.role, 'technical')
          ),
          eq(schema.users.status, 'active')
        )
      );
    
    const technicians = await query;
    
    // Filtrar por especializaciones si se especifican
    if (specializations && specializations.length > 0) {
      return technicians.filter(tech => {
        if (!tech.profile?.specializations) return false;
        return specializations.some(spec => 
          tech.profile.specializations?.includes(spec)
        );
      });
    }
    
    return technicians;
  } catch (error) {
    console.error('Error getting available technicians:', error);
    return [];
  }
},

async getAllTechnicians() {
  try {
    console.log(`👥 Getting all technicians for store ${storeId}`);
    
    // Query simple sin especificar campos (funciona con schema actual)
    const result = await tenantDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.role, 'technical'));
    
    // Mapear a formato esperado (maneja campos que pueden no existir)
    const technicians = result.map((user: any) => ({
      id: user.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      province: user.province || null,
      municipality: user.municipality || null,
      sector: user.sector || null,
      coverageProvinces: user.coverage_provinces || user.coverageProvinces || [],
      coverageMunicipalities: user.coverage_municipalities || user.coverageMunicipalities || [],
      coverageSectors: user.coverage_sectors || user.coverageSectors || [],
      specializations: user.specializations || [],
      currentOrders: user.current_orders || user.currentOrders || 0,
      maxDailyOrders: user.max_daily_orders || user.maxDailyOrders || 10,
      skillLevel: user.skill_level || user.skillLevel || 1,
    }));
    
    console.log(`✅ Found ${technicians.length} technicians`);
    return technicians;
    
  } catch (error) {
    console.error(`❌ Error getting technicians for store ${storeId}:`, error);
    return [];
  }
},

// ================================
// FUNCIONES AUXILIARES
// ================================

// ✅ Contar usuarios por perfil
async getUserCountByProfile(profileId: number): Promise<number> {
  try {
    const users = await tenantDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.employeeProfileId, profileId));
    
    return users.length;
  } catch (error) {
    console.error('Error counting users by profile:', error);
    return 0;
  }
},

// ✅ Obtener todos los usuarios con un perfil específico
async getUsersByProfileId(profileId: number) {
  try {
    const users = await tenantDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.employeeProfileId, profileId));
    
    return users;
  } catch (error) {
    console.error('Error getting users by profile:', error);
    return [];
  }
},



async getAllRegistrationFlows(): Promise<CustomerRegistrationFlow[]> {
  try {
    console.log(`🔍 Getting all registration flows for store: ${storeId}`);
    
    // Usar drizzle para obtener todos los registration flows
    const flows = await tenantDb
      .select()
      .from(schema.customerRegistrationFlows)
      .orderBy(desc(schema.customerRegistrationFlows.createdAt));
    
    console.log(`✅ Found ${flows.length} registration flows`);
    return flows;
    
  } catch (error) {
    console.error('❌ Error getting all registration flows:', error);
    
    // Fallback a query directo si drizzle falla
    console.log('🔄 Trying fallback method...');
    
    const pool = new Pool({ 
      connectionString: process.env.DATABASE_URL,
      max: 1,
      idleTimeoutMillis: 5000
    });
    
    try {
      // Obtener el schema name
      const storeResult = await pool.query(`
        SELECT database_url FROM virtual_stores WHERE id = $1
      `, [storeId]);
      
      if (!storeResult.rows[0]) {
        console.error(`❌ Store ${storeId} not found`);
        return [];
      }
      
      const schemaMatch = storeResult.rows[0].database_url?.match(/schema=([^&]+)/);
      const schemaName = schemaMatch ? schemaMatch[1] : 'public';
      
      console.log(`🔄 Working in schema: ${schemaName}`);
      
      // Configurar search_path
      await pool.query(`SET search_path TO ${schemaName}, public`);
      
      // Obtener todos los flows
      const result = await pool.query(`
        SELECT * FROM customer_registration_flows 
        ORDER BY created_at DESC
      `);
      
      console.log(`✅ Found ${result.rows.length} registration flows (fallback)`);
      return result.rows.map(row => ({
        id: row.id,
        customerId: row.customer_id,
        phoneNumber: row.phone_number,
        currentStep: row.current_step,
        flowType: row.flow_type,
        orderId: row.order_id,
        orderNumber: row.order_number,
        collectedData: row.collected_data,
        requestedService: row.requested_service,
        isCompleted: row.is_completed,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
      
    } catch (fallbackError) {
      console.error('❌ Fallback method also failed:', fallbackError);
      return [];
    } finally {
      await pool.end().catch(err => 
        console.log('⚠️ Pool close warning in getAllRegistrationFlows:', err.message)
      );
    }
  }
},

// También necesitas agregar esta función helper si no existe:
async getRegistrationFlowById(id: number): Promise<CustomerRegistrationFlow | null> {
  try {
    console.log(`🔍 Getting registration flow by ID: ${id}`);
    
    // Usar drizzle para obtener el flow por ID
    const [flow] = await tenantDb
      .select()
      .from(schema.customerRegistrationFlows)
      .where(eq(schema.customerRegistrationFlows.id, id))
      .limit(1);
    
    if (flow) {
      console.log(`✅ Found registration flow: ${flow.phoneNumber}`);
      return flow;
    } else {
      console.log(`❌ Registration flow with ID ${id} not found`);
      return null;
    }
    
  } catch (error) {
    console.error('❌ Error getting registration flow by ID:', error);
    
    // Fallback a query directo
    const pool = new Pool({ 
      connectionString: process.env.DATABASE_URL,
      max: 1,
      idleTimeoutMillis: 5000
    });
    
    try {
      // Obtener el schema name
      const storeResult = await pool.query(`
        SELECT database_url FROM virtual_stores WHERE id = $1
      `, [storeId]);
      
      if (!storeResult.rows[0]) {
        console.error(`❌ Store ${storeId} not found`);
        return null;
      }
      
      const schemaMatch = storeResult.rows[0].database_url?.match(/schema=([^&]+)/);
      const schemaName = schemaMatch ? schemaMatch[1] : 'public';
      
      // Configurar search_path
      await pool.query(`SET search_path TO ${schemaName}, public`);
      
      // Obtener el flow por ID
      const result = await pool.query(`
        SELECT * FROM customer_registration_flows 
        WHERE id = $1
      `, [id]);
      
      if (result.rows[0]) {
        const row = result.rows[0];
        return {
          id: row.id,
          customerId: row.customer_id,
          phoneNumber: row.phone_number,
          currentStep: row.current_step,
          flowType: row.flow_type,
          orderId: row.order_id,
          orderNumber: row.order_number,
          collectedData: row.collected_data,
          requestedService: row.requested_service,
          isCompleted: row.is_completed,
          expiresAt: row.expires_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      } else {
        return null;
      }
      
    } catch (fallbackError) {
      console.error('❌ Fallback method also failed:', fallbackError);
      return null;
    } finally {
      await pool.end().catch(err => 
        console.log('⚠️ Pool close warning in getRegistrationFlowById:', err.message)
      );
    }
  }
},
      // Auto Responses
   
async getAllAutoResponses() {
  try {
    const responses = await tenantDb.select()
      .from(schema.autoResponses)
      .orderBy(asc(schema.autoResponses.priority));
    
    console.log(`📋 Retrieved ${responses.length} auto-responses for store ${storeId}`);
    
    // Si no hay respuestas, crear las por defecto
    if (responses.length === 0) {
      console.log(`⚠️ NO AUTO-RESPONSES FOUND - Creating defaults`);
      await this.createDefaultAutoResponses();
      
      // Volver a consultar
      return await tenantDb.select()
        .from(schema.autoResponses)
        .orderBy(asc(schema.autoResponses.priority));
    }
    
    responses.forEach(resp => {
      console.log(`  - ${resp.name} (Trigger: ${resp.trigger}, Active: ${resp.isActive})`);
    });
    
    return responses;
  } catch (error) {
    console.error('Error getting auto responses:', error);
    return [];
  }
},

async verifyRegistrationFlowHealth(phoneNumber: string): Promise<{
  isHealthy: boolean;
  issues: string[];
  flow: any;
}> {
  try {
    const flow = await this.getRegistrationFlowByPhoneNumber(phoneNumber);
    const issues: string[] = [];
    
    if (!flow) {
      return {
        isHealthy: false,
        issues: ['No registration flow found'],
        flow: null
      };
    }
    
    // Verificar si expiró
    if (flow.expiresAt && new Date() > flow.expiresAt) {
      issues.push('Flow has expired');
    }
    
    // Verificar si tiene orderId cuando debería
    if (flow.flowType === 'order_data_collection' && !flow.orderId) {
      issues.push('Missing orderId for order data collection flow');
    }
    
    // Verificar paso válido
    const validSteps = ['collect_name', 'collect_address', 'collect_contact', 'collect_contact_number', 'collect_payment', 'collect_notes', 'confirm_order', 'completed'];
    if (!validSteps.includes(flow.currentStep)) {
      issues.push(`Invalid step: ${flow.currentStep}`);
    }
    
    // Verificar datos recopilados
    try {
      if (flow.collectedData && typeof flow.collectedData === 'string') {
        JSON.parse(flow.collectedData);
      }
    } catch (parseError) {
      issues.push('Invalid JSON in collectedData');
    }
    
    return {
      isHealthy: issues.length === 0,
      issues,
      flow
    };
  } catch (error) {
    return {
      isHealthy: false,
      issues: [`Error verifying flow: ${error.message}`],
      flow: null
    };
  }
},

// 🔧 NUEVA FUNCIÓN: Reparar flujo de registro
async repairRegistrationFlow(phoneNumber: string): Promise<boolean> {
  try {
    console.log(`🔧 REPAIRING REGISTRATION FLOW for ${phoneNumber}`);
    
    const health = await this.verifyRegistrationFlowHealth(phoneNumber);
    
    if (health.isHealthy) {
      console.log(`✅ Flow is healthy, no repair needed`);
      return true;
    }
    
    console.log(`⚠️ Issues found:`, health.issues);
    
    if (!health.flow) {
      console.log(`❌ No flow to repair`);
      return false;
    }
    
    let repairData: any = {};
    
    // Reparar datos según los problemas encontrados
    if (health.issues.includes('Flow has expired')) {
      repairData.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
    
    if (health.issues.includes('Invalid JSON in collectedData')) {
      repairData.collectedData = JSON.stringify({});
    }
    
    if (health.issues.some(issue => issue.includes('Invalid step'))) {
      repairData.currentStep = 'collect_name';
    }
    
    // Aplicar reparaciones
    if (Object.keys(repairData).length > 0) {
      await this.updateRegistrationFlowByPhone(phoneNumber, {
        ...repairData,
        updatedAt: new Date()
      });
      
      console.log(`✅ Flow repaired with:`, repairData);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('❌ Error repairing registration flow:', error);
    return false;
  }
},

async getAutoResponse(id: number) {
  try {
    const [response] = await tenantDb.select()
      .from(schema.autoResponses)
      .where(
        and(
          eq(schema.autoResponses.id, id),
          eq(schema.autoResponses.storeId, storeId)
        )
      )
      .limit(1);
    return response || null;
  } catch (error) {
    console.error('Error getting auto response:', error);
    return null;
  }
},

async getAutoResponseByTrigger(trigger: string) {
  try {
    const responses = await this.getAutoResponsesByTrigger(trigger);
    return responses.length > 0 ? responses[0] : null;
  } catch (error) {
    console.error('Error getting auto response by trigger:', error);
    return null;
  }
},

// En tenant-storage.ts
async getTripById(tripId: number) {
  const [trip] = await tenantDb
    .select()
    .from(schema.trips)
    .where(eq(schema.trips.id, tripId))
    .limit(1);
  return trip;
},

async createAutoResponse(responseData: any) {
  try {
    const autoResponseToInsert = {
      name: responseData.name,
      trigger: responseData.trigger,
      messageText: responseData.messageText,
      storeId: storeId,  // ← Usar storeId del tenant
      isActive: responseData.isActive !== undefined ? responseData.isActive : true,
      priority: responseData.priority || 1,
      requiresRegistration: responseData.requiresRegistration || false,
      menuOptions: responseData.menuOptions || null,
      nextAction: responseData.nextAction || null,
      menuType: responseData.menuType || 'buttons',
      showBackButton: responseData.showBackButton || false,
      allowFreeText: responseData.allowFreeText !== undefined ? responseData.allowFreeText : true,
      responseTimeout: responseData.responseTimeout || 300,
      maxRetries: responseData.maxRetries || 3,
      fallbackMessage: responseData.fallbackMessage || null,
      conditionalDisplay: responseData.conditionalDisplay || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const [autoResponse] = await tenantDb.insert(schema.autoResponses)
      .values(autoResponseToInsert)
      .returning();
    
    console.log('✅ AUTO RESPONSE CREATED - ID:', autoResponse.id);
    return autoResponse;
  } catch (error) {
    console.error('Error creating auto response:', error);
    throw error;
  }
},

async updateAutoResponse(id: number, updates: any) {
  try {
    const filteredData = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );

    const updateData = {
      ...filteredData,
      updatedAt: new Date()
    };

    const [autoResponse] = await tenantDb.update(schema.autoResponses)
      .set(updateData)
      .where(
        and(
          eq(schema.autoResponses.id, id),
          eq(schema.autoResponses.storeId, storeId)
        )
      )
      .returning();
    
    return autoResponse;
  } catch (error) {
    console.error('Error updating auto response:', error);
    throw error;
  }
},

async deleteAutoResponse(id: number) {
  try {
    await tenantDb.delete(schema.autoResponses)
      .where(
        and(
          eq(schema.autoResponses.id, id),
          eq(schema.autoResponses.storeId, storeId)
        )
      );
    
    console.log('✅ AUTO RESPONSE DELETED - ID:', id);
  } catch (error) {
    console.error('Error deleting auto response:', error);
    throw error;
  }
},

async getAutoResponsesByTrigger(trigger: string) {
  try {
    console.log(`🔍 SEARCHING AUTO-RESPONSES BY TRIGGER: "${trigger}"`);
    
    const responses = await tenantDb.select()
      .from(schema.autoResponses)
      .where(
        and(
          eq(schema.autoResponses.trigger, trigger),
          eq(schema.autoResponses.isActive, true)
        )
      )
      .orderBy(asc(schema.autoResponses.priority));
    
    console.log(`📋 FOUND ${responses.length} responses for trigger "${trigger}"`);
    
    // Si no encuentra respuestas, intentar buscar por nombre
    if (responses.length === 0) {
      console.log(`🔍 FALLBACK: Searching by name containing "${trigger}"`);
      
      const fallbackResponses = await tenantDb.select()
        .from(schema.autoResponses)
        .where(
          and(
            or(
              like(schema.autoResponses.name, `%${trigger}%`),
              like(schema.autoResponses.trigger, `%${trigger}%`)
            ),
            eq(schema.autoResponses.isActive, true)
          )
        )
        .orderBy(asc(schema.autoResponses.priority));
      
      console.log(`📋 FALLBACK FOUND ${fallbackResponses.length} responses`);
      return fallbackResponses;
    }
    
    return responses;
  } catch (error) {
    console.error('Error getting auto responses by trigger:', error);
    return [];
  }
},

async clearAllAutoResponses() {
  try {
    await tenantDb.delete(schema.autoResponses)
      .where(eq(schema.autoResponses.storeId, storeId));
    
    console.log('✅ ALL AUTO RESPONSES CLEARED for store:', storeId);
  } catch (error) {
    console.error('Error clearing all auto responses:', error);
    throw error;
  }
},
async createDefaultAutoResponses() {
  try {
    console.log(`📝 CREATING DEFAULT AUTO-RESPONSES for store ${storeId}`);

    const defaultResponses = [
      {
        name: "Bienvenida General",
        trigger: "welcome",
        messageText: "¡Hola! 👋 Bienvenido a nuestro servicio.\n\n¿En qué puedo ayudarte hoy?",
        isActive: true,
        priority: 1,
        menuOptions: JSON.stringify([
          { label: "Ver Productos 📦", value: "products", action: "show_products" },
          { label: "Ver Servicios ⚙️", value: "services", action: "show_services" },
          { label: "Hacer Pedido 🛒", value: "order", action: "start_order" },
          { label: "Contactar Agente 👨‍💼", value: "contact", action: "contact_agent" }
        ]),
        menuType: "buttons",
        nextAction: "wait_selection"
      },
      {
        name: "Saludo",
        trigger: "hola",
        messageText: "¡Hola! 😊 Me da mucho gusto saludarte.\n\n¿En qué puedo ayudarte hoy?",
        isActive: true,
        priority: 2,
        nextAction: "show_menu"
      },
      {
        name: "Solicitar Nombre Cliente",
        trigger: "collect_name",
        messageText: "📝 *Paso 1/5: Datos Personales*\n\nPara completar tu pedido necesito tu nombre completo.\n\n👤 Por favor escribe tu nombre:",
        isActive: true,
        priority: 5,
        menuType: "text_only",
        nextAction: "collect_address",
        allowFreeText: true
      },
      {
        name: "Solicitar Dirección",
        trigger: "collect_address", 
        messageText: "📍 *Paso 2/5: Dirección de Entrega*\n\nPor favor proporciona tu dirección completa:\n\n🏠 Puedes escribir la dirección o compartir tu ubicación GPS",
        isActive: true,
        priority: 6,
        menuType: "text_only",
        nextAction: "collect_contact",
        allowFreeText: true
      },
      {
        name: "Solicitar Número Contacto",
        trigger: "collect_contact",
        messageText: "📞 *Paso 3/5: Número de Contacto*\n\n¿Deseas usar este número de WhatsApp como contacto principal o prefieres proporcionar otro número?",
        isActive: true,
        priority: 7,
        menuOptions: JSON.stringify([
          { label: "✅ Usar este número", value: "use_whatsapp", action: "collect_payment" },
          { label: "📱 Otro número", value: "other_number", action: "collect_contact_number" }
        ]),
        menuType: "buttons",
        nextAction: "collect_payment"
      },
      {
        name: "Solicitar Método de Pago",
        trigger: "collect_payment",
        messageText: "💳 *Paso 4/5: Método de Pago*\n\n¿Cómo deseas pagar tu pedido?",
        isActive: true,
        priority: 8,
        menuOptions: JSON.stringify([
          { label: "💳 Tarjeta", value: "card", action: "collect_notes" },
          { label: "🏦 Transferencia", value: "transfer", action: "collect_notes" },
          { label: "💵 Efectivo", value: "cash", action: "collect_notes" }
        ]),
        menuType: "buttons", 
        nextAction: "collect_notes"
      },
      {
        name: "Solicitar Notas",
        trigger: "collect_notes",
        messageText: "📝 *Paso 5/5: Notas Adicionales*\n\n¿Tienes alguna instrucción especial o comentario para tu pedido?\n\n(Opcional - puedes escribir 'continuar' si no tienes notas)",
        isActive: true,
        priority: 9,
        menuOptions: JSON.stringify([
          { label: "➡️ Continuar sin notas", value: "no_notes", action: "confirm_order" }
        ]),
        menuType: "buttons",
        nextAction: "confirm_order",
        allowFreeText: true
      },
      {
        name: "Confirmación de Pedido",
        trigger: "confirm_order",
        messageText: "📋 *CONFIRMACIÓN DE PEDIDO*\n\nPor favor revisa los datos y confirma si todo está correcto.",
        isActive: true,
        priority: 10,
        menuOptions: JSON.stringify([
          { label: "✅ Confirmar Pedido", value: "confirm", action: "complete_order" },
          { label: "✏️ Modificar", value: "modify", action: "modify_order" }
        ]),
        menuType: "buttons",
        nextAction: "complete_order"
      }
    ];

    let createdCount = 0;

    for (const response of defaultResponses) {
      try {
        // Verificar si ya existe
        const existing = await tenantDb.select()
          .from(schema.autoResponses)
          .where(
            and(
              eq(schema.autoResponses.trigger, response.trigger),
              eq(schema.autoResponses.storeId, storeId)
            )
          )
          .limit(1);

        if (existing.length === 0) {
          await tenantDb.insert(schema.autoResponses).values({
            ...response,
            storeId: storeId,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          createdCount++;
          console.log(`✅ Created auto-response: ${response.name}`);
        } else {
          console.log(`⚠️ Auto-response already exists: ${response.name}`);
        }
      } catch (insertError) {
        console.error(`❌ Error creating auto-response ${response.name}:`, insertError);
      }
    }

    console.log(`✅ Created ${createdCount} default auto-responses for store ${storeId}`);
    return createdCount;
  } catch (error) {
    console.error('Error creating default auto responses:', error);
    throw error;
  }
},

// ✅ Agregar este método en tenant-storage.ts

async getAllConversations() {
  try {
    if (usePublicSchema) {
      // Para schema público, usar drizzle con JOIN
      const conversations = await tenantDb.select({
        // Campos de conversación
        id: schema.conversations.id,
        customerId: schema.conversations.customerId,
        status: schema.conversations.status,
        lastMessageAt: schema.conversations.lastMessageAt,
        createdAt: schema.conversations.createdAt,
        updatedAt: schema.conversations.updatedAt,
        storeId: schema.conversations.storeId,
        conversationType: schema.conversations.conversationType,

        
        // Campos del cliente
        customerName: schema.customers.name,
        customerPhone: schema.customers.phone,
        customerEmail: schema.customers.email,
      })
      .from(schema.conversations)
      .leftJoin(schema.customers, eq(schema.conversations.customerId, schema.customers.id))
      .orderBy(desc(schema.conversations.lastMessageAt));

      // Mapear a formato esperado
      return conversations.map(conv => ({
        id: conv.id,
        customerId: conv.customerId,
        status: conv.status,
        lastMessageAt: conv.lastMessageAt,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        storeId: conv.storeId,
        conversationType: conv.conversationType,
        unreadCount: conv.unreadCount || 0,
        customer: {
          id: conv.customerId,
          name: conv.customerName || 'Cliente sin nombre',
          phone: conv.customerPhone || '',
          email: conv.customerEmail || null,
        }
      }));
      
    } else {
      // Para tenant schemas, usar query directo
      return await this.getAllConversationsFallback();
    }
  } catch (error) {
    console.error('❌ Error getting all conversations:', error);
    return await this.getAllConversationsFallback();
  }
},

// ✅ FUNCIÓN FALLBACK para tenant schemas
async getAllConversationsFallback() {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    max: 1,
    idleTimeoutMillis: 5000
  });
  
  try {
    console.log(`🔄 Using fallback method for conversations in store: ${storeId}`);
    
    // Obtener el schema de la tienda
    const storeResult = await pool.query(`
      SELECT database_url FROM virtual_stores WHERE id = $1
    `, [storeId]);
    
    if (!storeResult.rows[0]) {
      console.error(`❌ Store ${storeId} not found`);
      return [];
    }
    
    const schemaMatch = storeResult.rows[0].database_url?.match(/schema=([^&]+)/);
    const schemaName = schemaMatch ? schemaMatch[1] : 'public';
    
    console.log(`🔄 Working in schema: ${schemaName}`);
    
    // Configurar search_path
    await pool.query(`SET search_path TO ${schemaName}, public`);
    
    // Query con JOIN para obtener datos del cliente
    const result = await pool.query(`
      SELECT 
        c.id,
        c.customer_id,
        c.status,
        c.last_message_at,
        c.created_at,
        c.updated_at,
        c.store_id,
        c.conversation_type,
        c.unread_count,
        cu.name as customer_name,
        cu.phone as customer_phone,
        cu.email as customer_email
      FROM conversations c
      LEFT JOIN customers cu ON c.customer_id = cu.id
      WHERE c.store_id = $1
      ORDER BY c.last_message_at DESC
    `, [storeId]);
    
    // Mapear resultados
    return result.rows.map(row => ({
      id: row.id,
      customerId: row.customer_id,
      status: row.status,
      lastMessageAt: row.last_message_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      storeId: row.store_id,
      conversationType: row.conversation_type,
      unreadCount: row.unread_count || 0,
      customer: {
        id: row.customer_id,
        name: row.customer_name || 'Cliente sin nombre',
        phone: row.customer_phone || '',
        email: row.customer_email || null,
      }
    }));
    
  } catch (error) {
    console.error('❌ Fallback getAllConversations failed:', error);
    return [];
  } finally {
    await pool.end().catch(err => 
      console.log('⚠️ Pool close warning:', err.message)
    );
  }
},

// ✅ Activar modo WebApp (desactiva auto-respuestas temporalmente)
async switchToWebAppMode(conversationId: number, durationMinutes: number = 30) {
  try {
    const enabledUntil = new Date();
    enabledUntil.setMinutes(enabledUntil.getMinutes() + durationMinutes);
    
    const [conversation] = await tenantDb.update(schema.conversations)
      .set({ 
        channelType: 'webapp',
        webAppEnabledUntil: enabledUntil,
        updatedAt: new Date() 
      })
      .where(eq(schema.conversations.id, conversationId))
      .returning();
      
    console.log(`✅ WebApp mode enabled for conversation ${conversationId} until ${enabledUntil}`);
    return conversation;
  } catch (error) {
    console.error('❌ Error switching to webapp mode:', error);
    throw error;
  }
},

// ✅ Verificar y restaurar modo WhatsApp si expiró el tiempo
async checkAndRestoreWhatsAppMode(conversationId: number) {
  try {
    const [conversation] = await tenantDb.select()
      .from(schema.conversations)
      .where(eq(schema.conversations.id, conversationId))
      .limit(1);
    
    if (!conversation) return null;
    
    // Si está en modo webapp y el tiempo expiró
    if (conversation.channelType === 'webapp' && 
        conversation.webAppEnabledUntil && 
        new Date() > new Date(conversation.webAppEnabledUntil)) {
      
      const [updated] = await tenantDb.update(schema.conversations)
        .set({ 
          channelType: 'whatsapp',
          webAppEnabledUntil: null,
          updatedAt: new Date() 
        })
        .where(eq(schema.conversations.id, conversationId))
        .returning();
        
      console.log(`✅ WhatsApp mode restored for conversation ${conversationId}`);
      return updated;
    }
    
    return conversation;
  } catch (error) {
    console.error('❌ Error checking webapp mode:', error);
    return null;
  }
},

// ✅ Verificar si debe usar auto-respuestas
async shouldUseAutoResponses(conversationId: number): Promise<boolean> {
  try {
    const conversation = await this.checkAndRestoreWhatsAppMode(conversationId);
    
    if (!conversation) return true; // Por defecto usar auto-respuestas
    
    return conversation.channelType === 'whatsapp';
  } catch (error) {
    console.error('❌ Error checking auto-responses:', error);
    return true; // Por defecto usar auto-respuestas en caso de error
  }
},

async getTechnicianConversations(userId: number) {
  try {
    console.log('💬 Getting conversations for technician:', userId);
    
    // Obtener órdenes asignadas al técnico (solo activas)
    const assignedOrders = await tenantDb.select()
      .from(schema.orders)
      .where(and(
        eq(schema.orders.assignedUserId, userId),
        // Solo órdenes abiertas (no completadas ni canceladas)
        or(
         
          eq(schema.orders.status, 'pending'),
          eq(schema.orders.status, 'processing'),
       
        )
      ));

    if (assignedOrders.length === 0) {
      console.log('ℹ️ No assigned orders found for technician:', userId);
      return [];
    }
// Ejecutar consulta para obtener las órdenes del técnico
const technicianOrders = await tenantDb
  .select({ customerId: schema.orders.customerId })
  .from(schema.orders)
  .where(eq(schema.orders.assignedUserId, userId));

const customerIds = technicianOrders
  .map(order => order.customerId)
  .filter((id): id is number => typeof id === 'number' && !isNaN(id));

// Si el array está vacío, retorna temprano
if (customerIds.length === 0) {
  console.log('⚠️ No valid customer IDs found for technician');
  return [];
}

const conversations = await tenantDb.select({
      // Campos de conversación
      id: schema.conversations.id,
      customerId: schema.conversations.customerId,
      orderId: schema.conversations.orderId,
      conversationType: schema.conversations.conversationType,
      status: schema.conversations.status,
      lastMessageAt: schema.conversations.lastMessageAt,
      createdAt: schema.conversations.createdAt,
      updatedAt: schema.conversations.updatedAt,
      
      // Información del cliente
      customerPhone: schema.customers.phone,
      customerName: schema.customers.name,
      customerAddress: schema.customers.address,
      customerEmail: schema.customers.email,

      // Información de la orden (si existe)
      orderNumber: schema.orders.orderNumber,
      orderStatus: schema.orders.status,
      orderTotalAmount: schema.orders.totalAmount
    })
    .from(schema.conversations)
.leftJoin(schema.customers, eq(schema.conversations.customerId, schema.customers.id))
.leftJoin(schema.orders, eq(schema.conversations.orderId, schema.orders.id))
.where(and(
  inArray(schema.conversations.customerId, customerIds), // Ahora customerIds es number[]
  eq(schema.conversations.status, 'active')
))
.orderBy(desc(schema.conversations.lastMessageAt));

    console.log('💬 Found conversations for technician customers:', conversations.length);
    
    // Enriquecer con información adicional
    const enrichedConversations = await Promise.all(
      conversations.map(async (conversation) => {
        try {
          // Contar mensajes no leídos del cliente
          const [unreadResult] = await tenantDb.select({
            count: count()
          })
          .from(schema.messages)
          .where(and(
            eq(schema.messages.conversationId, conversation.id),
            eq(schema.messages.senderType, 'customer'),
            eq(schema.messages.isRead, false)
          ));

          // Buscar la orden más reciente asignada al técnico para este cliente
          const [latestOrder] = await tenantDb.select()
            .from(schema.orders)
            .where(and(
              eq(schema.orders.customerId, conversation.customerId),
              eq(schema.orders.assignedUserId, userId),
              or(
          
                eq(schema.orders.status, 'pending'),
                eq(schema.orders.status, 'processing')
        
              )
            ))
            .orderBy(desc(schema.orders.createdAt))
            .limit(1);

          return {
            ...conversation,
            unreadCount: unreadResult?.count || 0,
            // Información del cliente
            customer: {
              id: conversation.customerId,
              name: conversation.customerName || 'Cliente desconocido',
              phone: conversation.customerPhone || '',
              email: conversation.customerEmail || null,
              address: conversation.customerAddress || null
            },
            // Información de la orden más relevante
            order: latestOrder ? {
              id: latestOrder.id,
              orderNumber: latestOrder.orderNumber || `ORD-${latestOrder.id}`,
              status: latestOrder.status || 'unknown',
              totalAmount: latestOrder.totalAmount || '0'
            } : (conversation.orderId ? {
              id: conversation.orderId,
              orderNumber: conversation.orderNumber || `ORD-${conversation.orderId}`,
              status: conversation.orderStatus || 'unknown',
              totalAmount: conversation.orderTotalAmount || '0'
            } : null)
          };
        } catch (error) {
          console.error('Error enriching conversation:', conversation.id, error);
          return {
            ...conversation,
            unreadCount: 0,
            customer: {
              id: conversation.customerId,
              name: conversation.customerName || 'Cliente desconocido',
              phone: conversation.customerPhone || '',
              email: conversation.customerEmail || null,
              address: conversation.customerAddress || null
            },
            order: null
          };
        }
      })
    );

    console.log('✅ Enriched conversations for technician:', enrichedConversations.length);
    return enrichedConversations;
    
  } catch (error) {
    console.error('❌ Error getting technician conversations:', error);
    return []; // Devolver array vacío en lugar de throw para evitar crashes
  }
},  
async markConversationMessagesAsRead(conversationId: number) {
  try {
    console.log('📖 Marking messages as read for conversation:', conversationId);
    
    const result = await tenantDb.update(schema.messages)
      .set({ 
        isRead: true,
        updatedAt: new Date() 
      })
      .where(and(
        eq(schema.messages.conversationId, conversationId),
        eq(schema.messages.senderType, 'customer'),
        eq(schema.messages.isRead, false)
      ));

    console.log('✅ Marked messages as read for conversation:', conversationId);
    return true;
  } catch (error) {
    console.error('❌ Error marking messages as read:', error);
    return false;
  }
},

// CONVERSATIONS


  async getConversationById(id: number) {
  try {
    const [result] = await tenantDb
      .select({
        // Campos de conversation
        id: schema.conversations.id,
        customerId: schema.conversations.customerId,
        orderId: schema.conversations.orderId,
        conversationType: schema.conversations.conversationType,
        status: schema.conversations.status,
        lastMessageAt: schema.conversations.lastMessageAt,
        storeId: schema.conversations.storeId,
        createdAt: schema.conversations.createdAt,
        updatedAt: schema.conversations.updatedAt,
        
        // ✅ Campos del customer incluidos directamente
        customerName: schema.customers.name,
        customerPhone: schema.customers.phone,
        customerEmail: schema.customers.email,
      })
      .from(schema.conversations)
      .leftJoin(
        schema.customers,
        eq(schema.conversations.customerId, schema.customers.id)
      )
      .where(eq(schema.conversations.id, id))
      .limit(1);
    
    return result || null;
  } catch (error) {
    console.error('Error getting conversation by ID:', error);
    return null;
  }
},

  async getConversationByCustomerPhone(phone: string) {
  try {
    // 1. Primero buscar el cliente por teléfono
    const customer = await this.getCustomerByPhone(phone);
    if (!customer) {
      return null;
    }
    
    // 2. Luego buscar la conversación por customerId
    const [conversation] = await tenantDb.select()
      .from(schema.conversations)
      .where(eq(schema.conversations.customerId, customer.id))
      .orderBy(desc(schema.conversations.lastMessageAt))
      .limit(1);
    
    return conversation || null;
  } catch (error) {
    console.error('Error getting conversation by customer phone:', error);
    return null;
  }
},

    async createConversation(conversationData: any) {
      try {
        const [conversation] = await tenantDb.insert(schema.conversations)
          .values({
            ...conversationData,
            createdAt: new Date(),
            lastMessageAt: new Date()
          })
          .returning();
        return conversation;
      } catch (error) {
        console.error('Error creating conversation:', error);
        throw error;
      }
    },
async updateConversation(id: number, updates: any) {
  try {
    console.log(`🔄 Updating conversation ${id} with:`, Object.keys(updates));
    
    const [conversation] = await tenantDb.update(schema.conversations)
      .set({ 
        ...updates, 
        updatedAt: new Date() 
      })
      .where(eq(schema.conversations.id, id))
      .returning();
      
    if (conversation) {
      console.log(`✅ Conversation ${id} updated successfully`);
    } else {
      console.log(`⚠️ Conversation ${id} not found for update`);
    }
    
    return conversation;
  } catch (error) {
    console.error('❌ Error updating conversation:', error);
    throw error;
  }
},
 async getConversationWithCustomer(conversationId: number) {
  try {
    const [result] = await tenantDb.select({
      // Campos de conversación
      id: schema.conversations.id,
      customerId: schema.conversations.customerId,
      status: schema.conversations.status,
      lastMessageAt: schema.conversations.lastMessageAt,
      createdAt: schema.conversations.createdAt,
      
      // Información del cliente
      customerPhone: schema.customers.phone,
      customerName: schema.customers.name,
      customerAddress: schema.customers.address
    })
    .from(schema.conversations)
    .leftJoin(schema.customers, eq(schema.conversations.customerId, schema.customers.id))
    .where(eq(schema.conversations.id, conversationId))
    .limit(1);
    
    return result || null;
  } catch (error) {
    console.error('Error getting conversation with customer:', error);
    return null;
  }
},
     async getAllMessages() {
      try {
        return await tenantDb.select()
          .from(schema.messages)
          .orderBy(desc(schema.messages.sentAt));
      } catch (error) {
        console.error('Error getting all messages:', error);
        return [];
      }
    },

 async getMessagesByConversation(conversationId: number) {
  try {
    const messages = await tenantDb.select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId))
      .orderBy(asc(schema.messages.sentAt));

    // ✅ MAPEAR snake_case a camelCase
    return messages.map(msg => ({
      id: msg.id,
      conversationId: msg.conversation_id || msg.conversationId,
      content: msg.content || '',
      messageType: msg.message_type || msg.messageType || 'text',
      message_type: msg.message_type, // Mantener original
      senderType: msg.sender_type || msg.senderType || 'customer',
      sender_type: msg.sender_type, // Mantener original
      senderId: msg.sender_id,
      isRead: msg.is_read,
      is_read: msg.is_read, // Mantener original
      createdAt: msg.created_at || msg.createdAt,
      created_at: msg.created_at, // Mantener original
      sentAt: msg.sent_at || msg.sentAt,
      whatsappMessageId: msg.whatsapp_message_id,
    }));
  } catch (error) {
    console.error('❌ Error getting messages by conversation:', error);
    return [];
  }
},

/**
 * Obtiene los últimos N mensajes de una conversación (para contexto de IA)
 */
async getRecentMessages(conversationId: number, limit: number = 10) {
  try {
    console.log(`📜 Getting last ${limit} messages for conversation ${conversationId}`);

    const messages = await tenantDb.select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, conversationId))
      .orderBy(desc(schema.messages.sentAt))
      .limit(limit);

    // Revertir orden para tener cronológico (más viejo primero)
    const chronologicalMessages = messages.reverse();

    // Mapear a formato simple para IA
    const formattedMessages = chronologicalMessages.map(msg => ({
      role: (msg.sender_type === 'customer' || msg.sender_type === 'user') ? 'user' : 'assistant',
      content: msg.content || '',
      timestamp: msg.sent_at || msg.created_at
    }));

    console.log(`✅ Retrieved ${formattedMessages.length} recent messages`);
    return formattedMessages;
  } catch (error) {
    console.error('❌ Error getting recent messages:', error);
    return [];
  }
},

 async createMessage(messageData: any) {
  try {
    console.log('📝 CREATING MESSAGE - Data:', {
      conversationId: messageData.conversationId,
      content: messageData.content ? messageData.content.substring(0, 50) + '...' : 'No content',
      isFromCustomer: messageData.isFromCustomer,
      whatsappMessageId: messageData.whatsappMessageId
    });

    // ✅ MAPEAR CORRECTAMENTE LOS CAMPOS
    const messageToInsert = {
      conversationId: messageData.conversationId,
      senderId: messageData.senderId || null,
      content: messageData.content,
      messageType: messageData.messageType || 'text',
      whatsappMessageId: messageData.whatsappMessageId || null,
      isFromCustomer: messageData.isFromCustomer || false,
      isRead: messageData.isRead || false,
      sentAt: new Date(),
      createdAt: new Date()
    };

    const [message] = await tenantDb.insert(schema.messages)
      .values(messageToInsert)
      .returning();

    // ✅ ACTUALIZAR lastMessageAt de la conversación
    if (messageData.conversationId) {
      await tenantDb.update(schema.conversations)
        .set({ 
          lastMessageAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(schema.conversations.id, messageData.conversationId));
    }

    console.log('✅ MESSAGE CREATED - ID:', message.id);
    return message;
  } catch (error) {
    console.error('❌ ERROR CREATING MESSAGE:', error);
    
    // ✅ LOGGING DETALLADO DEL ERROR
    if (error.code === '23503') {
      console.error('   → Foreign key violation - conversationId might not exist');
    } else if (error.code === '23505') {
      console.error('   → Duplicate key - whatsappMessageId might already exist'); 
    }
    
    throw error;
  }
},

    async updateMessage(id: number, updates: any) {
      try {
        const filteredData = Object.fromEntries(
          Object.entries(updates).filter(([_, value]) => value !== undefined)
        );

        const [message] = await tenantDb.update(schema.messages)
          .set(filteredData)
          .where(eq(schema.messages.id, id))
          .returning();
        
        return message;
      } catch (error) {
        console.error('Error updating message:', error);
        throw error;
      }
    },

    async markMessagesAsRead(conversationId: number) {
      try {
        await tenantDb.update(schema.messages)
          .set({ isRead: true })
          .where(
            and(
              eq(schema.messages.conversationId, conversationId),
              eq(schema.messages.senderType, 'customer')
            )
          );
        
        console.log('✅ MESSAGES MARKED AS READ - Conversation:', conversationId);
      } catch (error) {
        console.error('Error marking messages as read:', error);
        throw error;
      }
    },


async getOrCreateConversationByPhone(phone: string, storeId: number) {
  try {
    console.log(`🔍 GETTING OR CREATING CONVERSATION for phone: ${phone}`);
    
    // 1. Buscar conversación existente
    let conversation = await this.getConversationByCustomerPhone(phone);
    
    if (conversation) {
      console.log(`✅ EXISTING CONVERSATION FOUND - ID: ${conversation.id}`);
      return conversation;
    }
    
    // 2. Si no existe, buscar o crear cliente
    let customer = await this.getCustomerByPhone(phone);
    
    if (!customer) {
      console.log(`➕ CREATING NEW CUSTOMER for phone: ${phone}`);
      
      customer = await this.createCustomer({
        name: `Cliente ${phone.slice(-4)}`,
        phone: phone,
        storeId: storeId,
        whatsappId: phone,
        address: null,
        latitude: null,
        longitude: null,
        lastContact: new Date(),
        registrationDate: new Date(),
        totalOrders: 0,
        totalSpent: "0.00",
        isVip: false,
        notes: 'Cliente creado automáticamente desde WhatsApp'
      });
      
      console.log(`✅ NEW CUSTOMER CREATED - ID: ${customer.id}`);
    } else {
      console.log(`✅ EXISTING CUSTOMER FOUND - ID: ${customer.id}`);
    }
    
    // 3. Crear nueva conversación
    console.log(`➕ CREATING NEW CONVERSATION for customer: ${customer.id}`);
    
    conversation = await this.createConversation({
      customerId: customer.id,
      conversationType: 'whatsapp',
      status: 'active',
      storeId: storeId,
      lastMessageAt: new Date()
    });
    
    console.log(`✅ NEW CONVERSATION CREATED - ID: ${conversation.id}`);
    return conversation;
    
  } catch (error) {
    console.error('❌ Error getting or creating conversation by phone:', error);
    throw error;
  }
},

// 🔧 FUNCIÓN DE VERIFICACIÓN DE SALUD
async verifyConversationHealth(): Promise<{
  isHealthy: boolean;
  issues: string[];
  stats: any;
}> {
  try {
    const issues: string[] = [];
    
    // Contar conversaciones sin cliente
    const orphanConversations = await tenantDb.select({ count: count() })
      .from(schema.conversations)
      .leftJoin(schema.customers, eq(schema.conversations.customerId, schema.customers.id))
      .where(eq(schema.customers.id, null));
    
    if (orphanConversations[0].count > 0) {
      issues.push(`${orphanConversations[0].count} conversaciones sin cliente válido`);
    }
    
    // Contar mensajes sin conversación
    const orphanMessages = await tenantDb.select({ count: count() })
      .from(schema.messages)
      .leftJoin(schema.conversations, eq(schema.messages.conversationId, schema.conversations.id))
      .where(eq(schema.conversations.id, null));
    
    if (orphanMessages[0].count > 0) {
      issues.push(`${orphanMessages[0].count} mensajes sin conversación válida`);
    }
    
    // Stats generales
    const totalConversations = await tenantDb.select({ count: count() })
      .from(schema.conversations);
    
    const totalMessages = await tenantDb.select({ count: count() })
      .from(schema.messages);
    
    const totalCustomers = await tenantDb.select({ count: count() })
      .from(schema.customers);
    
    const stats = {
      totalConversations: totalConversations[0].count,
      totalMessages: totalMessages[0].count,
      totalCustomers: totalCustomers[0].count,
      orphanConversations: orphanConversations[0].count,
      orphanMessages: orphanMessages[0].count
    };
    
    return {
      isHealthy: issues.length === 0,
      issues,
      stats
    };
    
  } catch (error) {
    console.error('Error verifying conversation health:', error);
    return {
      isHealthy: false,
      issues: [`Error verificando salud: ${error.message}`],
      stats: {}
    };
  }
},

async cleanupOrphanData(): Promise<{
  conversationsFixed: number;
  messagesFixed: number;
}> {
  try {
    console.log(`🧹 CLEANING UP ORPHAN DATA for store ${storeId}...`);
    
    let conversationsFixed = 0;
    let messagesFixed = 0;
    
    // 1️⃣ Eliminar conversaciones sin cliente válido
    try {
      const deletedConversations = await tenantDb.delete(schema.conversations)
        .where(
          sql`${schema.conversations.customerId} NOT IN (SELECT id FROM ${schema.customers})`
        )
        .returning();
      
      conversationsFixed = deletedConversations.length;
      if (conversationsFixed > 0) {
        console.log(`✅ Deleted ${conversationsFixed} orphan conversations`);
      }
    } catch (error) {
      console.warn(`⚠️ Could not clean orphan conversations for store ${storeId}:`, error.message);
    }
    
    // 2️⃣ Eliminar mensajes sin conversación válida
    try {
      const deletedMessages = await tenantDb.delete(schema.messages)
        .where(
          sql`${schema.messages.conversationId} NOT IN (SELECT id FROM ${schema.conversations})`
        )
        .returning();
      
      messagesFixed = deletedMessages.length;
      if (messagesFixed > 0) {
        console.log(`✅ Deleted ${messagesFixed} orphan messages`);
      }
    } catch (error) {
      console.warn(`⚠️ Could not clean orphan messages for store ${storeId}:`, error.message);
    }
    
    if (conversationsFixed > 0 || messagesFixed > 0) {
      console.log(`✅ CLEANUP COMPLETED: ${conversationsFixed} conversations, ${messagesFixed} messages`);
    }
    
    return { conversationsFixed, messagesFixed };
    
  } catch (error) {
    console.error(`❌ Error cleaning up orphan data for store ${storeId}:`, error.message);
    return { conversationsFixed: 0, messagesFixed: 0 };
  }
},

/**
 * 🧹 Limpiar conversaciones antiguas (más de X días)
 */
async cleanupOldConversations(daysOld: number = 7) {
  try {
    console.log(`🧹 Cleaning up conversations older than ${daysOld} days...`);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    console.log(`📅 Cutoff date: ${cutoffDate.toISOString()}`);
    
    // 1️⃣ Obtener conversaciones antiguas a eliminar
    const oldConversations = await tenantDb
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(lt(schema.conversations.lastMessageAt, cutoffDate));
    
    if (oldConversations.length === 0) {
      console.log('✅ No old conversations to clean up');
      return { conversationsDeleted: 0, messagesDeleted: 0 };
    }
    
    const conversationIds = oldConversations.map(c => c.id);
    console.log(`📋 Found ${conversationIds.length} conversations to delete`);
    
    // 2️⃣ Primero eliminar todos los mensajes de esas conversaciones
    const deletedMessages = await tenantDb
      .delete(schema.messages)
      .where(
        sql`${schema.messages.conversationId} IN (${sql.join(conversationIds.map(id => sql`${id}`), sql`, `)})`
      )
      .returning();
    
    console.log(`✅ Deleted ${deletedMessages.length} messages`);
    
    // 3️⃣ Luego eliminar las conversaciones
    const deletedConversations = await tenantDb
      .delete(schema.conversations)
      .where(
        sql`${schema.conversations.id} IN (${sql.join(conversationIds.map(id => sql`${id}`), sql`, `)})`
      )
      .returning();
    
    console.log(`✅ Deleted ${deletedConversations.length} conversations`);
    
    return {
      conversationsDeleted: deletedConversations.length,
      messagesDeleted: deletedMessages.length
    };
    
  } catch (error) {
    console.error('❌ Error cleaning up old conversations:', error);
    return { conversationsDeleted: 0, messagesDeleted: 0 };
  }
},

async getRegistrationFlowByPhoneNumber(phoneNumber: string): Promise<CustomerRegistrationFlow | null> {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    max: 1,
    idleTimeoutMillis: 5000
  });
  
  try {
    console.log(`🔍 Getting registration flow for phone: ${phoneNumber} in store: ${storeId}`);
    
    // Obtener schema de la tienda
    const storeResult = await pool.query(
      `SELECT database_url FROM virtual_stores WHERE id = $1`, 
      [storeId]
    );
    
    if (!storeResult.rows[0]) {
      console.error(`❌ Store ${storeId} not found`);
      return null;
    }
    
    const schemaMatch = storeResult.rows[0].database_url?.match(/schema=([^&]+)/);
    const schemaName = schemaMatch ? schemaMatch[1] : 'public';
    
    // Configurar schema y ejecutar consulta
    await pool.query(`SET search_path TO ${schemaName}, public`);
    
    const result = await pool.query(`
      SELECT * FROM customer_registration_flows 
      WHERE phone_number = $1 
      ORDER BY created_at DESC 
      LIMIT 1
    `, [phoneNumber]);
    
    const flow = result.rows[0] || null;
    console.log(`🔍 Registration flow: ${flow ? 'FOUND' : 'NOT FOUND'}`);
    
    // ✅ MAPEAR CORRECTAMENTE DE SNAKE_CASE A CAMELCASE
    if (!flow) return null;
    
    const mappedFlow = {
      id: flow.id,
      customerId: flow.customer_id,
      phoneNumber: flow.phone_number,
      currentStep: flow.current_step,           // ⬅️ CLAVE: snake_case → camelCase
      flowType: flow.flow_type,
      orderId: flow.order_id,
      orderNumber: flow.order_number,
      collectedData: flow.collected_data,       // ⬅️ CLAVE: snake_case → camelCase
      requestedService: flow.requested_service,
      isCompleted: flow.is_completed,           // ⬅️ CLAVE: snake_case → camelCase
      expiresAt: flow.expires_at,              // ⬅️ CLAVE: snake_case → camelCase
      createdAt: flow.created_at,
      updatedAt: flow.updated_at,
      storeId: flow.store_id
    };
    
    console.log(`📋 Mapped flow details:`);
    console.log(`   - ID: ${mappedFlow.id}`);
    console.log(`   - Current Step: ${mappedFlow.currentStep}`);
    console.log(`   - Is Completed: ${mappedFlow.isCompleted}`);
    console.log(`   - Order ID: ${mappedFlow.orderId}`);
    console.log(`   - Expires At: ${mappedFlow.expiresAt}`);
    
    return mappedFlow;
    
  } catch (error) {
    console.error('❌ Error getting registration flow:', error);
    return null;
  } finally {
    await pool.end().catch(err => 
      console.log('⚠️ Pool close warning:', err.message)
    );
  }
},

async updateRegistrationFlowByPhone(phoneNumber: string, updates: any) {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    max: 1,
    idleTimeoutMillis: 5000
  });
  
  try {
    console.log(`🔄 Updating registration flow for phone: ${phoneNumber}`, updates);
    
    // Obtener el schema name
    const storeResult = await pool.query(`
      SELECT database_url FROM virtual_stores WHERE id = $1
    `, [storeId]);
    
    if (!storeResult.rows[0]) {
      console.error(`❌ Store ${storeId} not found`);
      return null;
    }
    
    const schemaMatch = storeResult.rows[0].database_url?.match(/schema=([^&]+)/);
    const schemaName = schemaMatch ? schemaMatch[1] : 'public';
    
    console.log(`🔄 Updating in schema: ${schemaName}`);
    
    // Configurar search_path
    await pool.query(`SET search_path TO ${schemaName}, public`);
    
    // ✅ FILTRAR updated_at del objeto updates ANTES de procesarlo
    const filteredUpdates = { ...updates };
    delete filteredUpdates.updatedAt; // Remover si existe en camelCase
    delete filteredUpdates.updated_at; // Remover si existe en snake_case
    
    // Construir query de actualización dinámicamente
    const setParts = [];
    const values = [];
    let paramCounter = 1;
    
    Object.keys(filteredUpdates).forEach(key => {
      if (filteredUpdates[key] !== undefined) {
        // Convertir camelCase a snake_case para nombres de columna
        const columnName = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        setParts.push(`${columnName} = $${paramCounter}`);
        values.push(filteredUpdates[key]);
        paramCounter++;
      }
    });
    
    // Validar que hay campos para actualizar
    if (setParts.length === 0) {
      console.log(`⚠️ No fields to update for phone: ${phoneNumber}`);
      return null;
    }
    
    // ✅ SOLO UNA VEZ: Agregar updated_at al final
    setParts.push(`updated_at = NOW()`);
    values.push(phoneNumber);
    
    console.log(`📝 Updating fields: ${setParts.slice(0, -1).join(', ')}`);
    
    const result = await pool.query(`
      UPDATE customer_registration_flows 
      SET ${setParts.join(', ')}
      WHERE phone_number = $${paramCounter}
      RETURNING *
    `, values);
    
    const updatedFlow = result.rows[0] || null;
    
    if (updatedFlow) {
      console.log(`✅ Registration flow updated successfully for phone: ${phoneNumber}`);
      console.log(`📋 Updated step: ${updatedFlow.current_step}, Order ID: ${updatedFlow.order_id}`);
    } else {
      console.log(`⚠️ No registration flow found to update for phone: ${phoneNumber}`);
    }
    
    return updatedFlow;
    
  } catch (error) {
    console.error('❌ Error updating registration flow by phone:', error);
    
    // Log adicional para debugging
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
    if (error.message) {
      console.error(`   Error message: ${error.message}`);
    }
    
    return null;
  } finally {
    await pool.end().catch(err => 
      console.log('⚠️ Pool close warning in updateRegistrationFlowByPhone:', err.message)
    );
  }
},

async deleteRegistrationFlowByPhone(phoneNumber: string) {
  try {
    await tenantDb.delete(schema.customerRegistrationFlows)
      .where(eq(schema.customerRegistrationFlows.phoneNumber, phoneNumber));
    console.log(`✅ REGISTRATION FLOW DELETED - Phone: ${phoneNumber}`);
  } catch (error) {
    console.error('Error deleting registration flow by phone:', error);
    throw error;
  }
},
async createOrUpdateRegistrationFlow(flowData: any): Promise<any> {
  // ✅ VALIDACIÓN DE ENTRADA
  if (!flowData || !flowData.phoneNumber || !flowData.currentStep) {
    console.error(`❌ Invalid flowData: missing required fields`);
    return null;
  }
  
  console.log(`\n🔄 ===== CREATING/UPDATING REGISTRATION FLOW =====`);
  console.log(`👤 Customer ID: ${flowData.customerId}`);
  console.log(`📞 Phone: ${flowData.phoneNumber}`);
  console.log(`📋 Step: ${flowData.currentStep}`);
  console.log(`📦 Order ID: ${flowData.orderId || 'None'}`);
  
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    max: 1,
    idleTimeoutMillis: 5000
  });
  
  try {
    // Obtener el schema name
    const storeResult = await pool.query(`
      SELECT database_url FROM virtual_stores WHERE id = $1
    `, [storeId]);
    
    if (!storeResult.rows[0]) {
      console.error(`❌ Store ${storeId} not found`);
      return null;
    }
    
    const schemaMatch = storeResult.rows[0].database_url?.match(/schema=([^&]+)/);
    const schemaName = schemaMatch ? schemaMatch[1] : 'public';
    
    console.log(`🔄 Working in schema: ${schemaName}`);
    
    // Configurar search_path
    await pool.query(`SET search_path TO ${schemaName}, public`);
    
    // Verificar si ya existe un flujo para este teléfono
    const existingResult = await pool.query(`
      SELECT * FROM customer_registration_flows 
      WHERE phone_number = $1 
      ORDER BY created_at DESC 
      LIMIT 1
    `, [flowData.phoneNumber]);
    
    const existingFlow = existingResult.rows[0];
    console.log(`🔍 Existing flow: ${existingFlow ? `Found (ID: ${existingFlow.id})` : 'Not found'}`);
    
    // ✅ PREPARAR DATOS CON VALORES POR DEFECTO SEGUROS
    const safeFlowData = {
      customerId: flowData.customerId || null,
      phoneNumber: flowData.phoneNumber,
      currentStep: flowData.currentStep,
      flowType: flowData.flowType || 'order_data_collection',
      orderId: flowData.orderId || null,
      orderNumber: flowData.orderNumber || null,
      collectedData: flowData.collectedData || JSON.stringify({}),
      expiresAt: flowData.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000),
      isCompleted: flowData.isCompleted || false,
      requestedService: flowData.requestedService || null
    };
    
    let result;
    
    if (existingFlow) {
      console.log(`📝 UPDATING EXISTING FLOW - ID: ${existingFlow.id}`);
      
      // ✅ ACTUALIZACIÓN MEJORADA CON VALIDACIÓN
      result = await pool.query(`
        UPDATE customer_registration_flows 
        SET customer_id = $1,
            current_step = $2,
            flow_type = $3,
            order_id = $4,
            order_number = $5,
            collected_data = $6,
            expires_at = $7,
            is_completed = $8,
            requested_service = $9,
            updated_at = NOW()
        WHERE phone_number = $10
        RETURNING *
      `, [
        safeFlowData.customerId,
        safeFlowData.currentStep,
        safeFlowData.flowType,
        safeFlowData.orderId,
        safeFlowData.orderNumber,
        safeFlowData.collectedData,
        safeFlowData.expiresAt,
        safeFlowData.isCompleted,
        safeFlowData.requestedService,
        safeFlowData.phoneNumber
      ]);
      
      if (result.rows[0]) {
        console.log(`✅ FLOW UPDATED SUCCESSFULLY - ID: ${result.rows[0].id}`);
        console.log(`   Step: ${result.rows[0].current_step}`);
        console.log(`   Order ID: ${result.rows[0].order_id || 'None'}`);
        console.log(`   Completed: ${result.rows[0].is_completed}`);
      } else {
        console.log(`⚠️ Update returned no rows - flow might not exist`);
        return null;
      }
      
    } else {
      console.log(`➕ CREATING NEW FLOW`);
      
      // ✅ CREACIÓN MEJORADA CON VALIDACIÓN
      result = await pool.query(`
        INSERT INTO customer_registration_flows (
          customer_id, phone_number, current_step, flow_type,
          order_id, order_number, collected_data, expires_at,
          is_completed, requested_service, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        RETURNING *
      `, [
        safeFlowData.customerId,
        safeFlowData.phoneNumber,
        safeFlowData.currentStep,
        safeFlowData.flowType,
        safeFlowData.orderId,
        safeFlowData.orderNumber,
        safeFlowData.collectedData,
        safeFlowData.expiresAt,
        safeFlowData.isCompleted,
        safeFlowData.requestedService
      ]);
      
      if (result.rows[0]) {
        console.log(`✅ NEW FLOW CREATED SUCCESSFULLY - ID: ${result.rows[0].id}`);
        console.log(`   Step: ${result.rows[0].current_step}`);
        console.log(`   Order ID: ${result.rows[0].order_id || 'None'}`);
        console.log(`   Expires: ${result.rows[0].expires_at}`);
      } else {
        console.log(`❌ Insert returned no rows - creation failed`);
        return null;
      }
    }
    
    console.log(`🔄 ===== REGISTRATION FLOW OPERATION COMPLETED =====\n`);
    return result.rows[0];
    
  } catch (error) {
    console.error('❌ ERROR in createOrUpdateRegistrationFlow:', error);
    
    // ✅ MANEJO ESPECÍFICO DE ERRORES COMUNES
    if (error.code === '42703') {
      console.error('   ❌ Column does not exist - check table schema');
    } else if (error.code === '42P01') {
      console.error('   ❌ Table does not exist - check schema configuration');
    } else if (error.code === '23505') {
      console.error('   ❌ Duplicate key violation - flow might already exist');
    } else if (error.code === '23503') {
      console.error('   ❌ Foreign key violation - check referenced IDs');
    }
    
    // ✅ NO HACER THROW - DEVOLVER NULL PARA MANEJO GRACEFUL
    console.log(`🔄 ===== REGISTRATION FLOW OPERATION FAILED =====\n`);
    return null;
    
  } finally {
    await pool.end().catch(err => 
      console.log('⚠️ Pool close warning in createOrUpdateRegistrationFlow:', err.message)
    );
  }
},

async cleanupExpiredRegistrationFlows() {
  try {
    // Verificar si la tabla existe primero
    const tableExists = await tenantDb.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'customer_registration_flows'
      )
    `);
    
    if (!tableExists.rows[0]?.exists) {
      console.log(`⚠️ Table customer_registration_flows does not exist for store ${storeId}, skipping...`);
      return 0;
    }
    
    const expiredFlows = await tenantDb.delete(schema.customerRegistrationFlows)
      .where(
        and(
          lt(schema.customerRegistrationFlows.expiresAt, new Date()),
          eq(schema.customerRegistrationFlows.isCompleted, false)
        )
      )
      .returning();
    
    if (expiredFlows.length > 0) {
      console.log(`🧹 CLEANED UP ${expiredFlows.length} expired registration flows for store ${storeId}`);
    }
    
    return expiredFlows.length;
  } catch (error) {
    if (error.code === '42P01') {
      // Tabla no existe
      console.log(`⚠️ Table customer_registration_flows does not exist for store ${storeId}, skipping...`);
      return 0;
    }
    console.error(`Error cleaning up expired registration flows for store ${storeId}:`, error.message);
    return 0;
  }
},
async ensureRegistrationFlowTableExists(): Promise<void> {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    max: 1,
    idleTimeoutMillis: 5000
  });
  
  try {
    console.log(`🔍 Ensuring customer_registration_flows table exists for store: ${storeId}`);
    
    // Obtener el schema name
    const storeResult = await pool.query(`
      SELECT database_url, name FROM virtual_stores WHERE id = $1
    `, [storeId]);
    
    if (!storeResult.rows[0]) {
      console.error(`❌ Store ${storeId} not found - cannot ensure table`);
      return;
    }
    
    const store = storeResult.rows[0];
    const schemaMatch = store.database_url?.match(/schema=([^&]+)/);
    const schemaName = schemaMatch ? schemaMatch[1] : 'public';
    
    console.log(`🔍 Checking table in schema: ${schemaName} (Store: ${store.name})`);
    
    // Verificar si la tabla existe
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = $1 
        AND table_name = 'customer_registration_flows'
      ) as exists
    `, [schemaName]);
    
    if (!tableExists.rows[0].exists) {
      console.log(`📋 Creating customer_registration_flows in schema: ${schemaName}`);
      
      // ✅ CREAR SCHEMA SI NO EXISTE (importante para schemas de tiendas)
      await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
      console.log(`✅ Schema ${schemaName} ensured`);
      
      // ✅ CREAR LA TABLA CON TODOS LOS CAMPOS NECESARIOS
      await pool.query(`
        CREATE TABLE ${schemaName}.customer_registration_flows (
          id SERIAL PRIMARY KEY,
          customer_id INTEGER,
          phone_number TEXT NOT NULL,
          current_step TEXT NOT NULL,
          flow_type TEXT DEFAULT 'order_data_collection',
          order_id INTEGER,
          order_number TEXT,
          collected_data TEXT DEFAULT '{}',
          requested_service TEXT,
          is_completed BOOLEAN DEFAULT false,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
      `);
      
      console.log(`✅ Table customer_registration_flows created in schema: ${schemaName}`);
      
      // ✅ CREAR ÍNDICES OPTIMIZADOS
      const indexBaseName = schemaName.replace(/[^a-zA-Z0-9]/g, '_');
      
      // Índice principal por teléfono
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_reg_flows_phone_${indexBaseName} 
        ON ${schemaName}.customer_registration_flows(phone_number);
      `);
      
      // Índice por customer_id
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_reg_flows_customer_${indexBaseName} 
        ON ${schemaName}.customer_registration_flows(customer_id);
      `);
      
      // Índice por order_id
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_reg_flows_order_${indexBaseName} 
        ON ${schemaName}.customer_registration_flows(order_id);
      `);
      
      // Índice compuesto para consultas activas
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_reg_flows_active_${indexBaseName} 
        ON ${schemaName}.customer_registration_flows(phone_number, is_completed, expires_at);
      `);
      
      console.log(`✅ Indexes created for customer_registration_flows in schema: ${schemaName}`);
      
      // ✅ AGREGAR COMENTARIOS A LA TABLA
      await pool.query(`
        COMMENT ON TABLE ${schemaName}.customer_registration_flows IS 
        'Customer registration flows for order data collection - Store: ${store.name}';
      `);
      
      console.log(`📋 Table setup completed for schema: ${schemaName}`);
      
    } else {
      console.log(`✅ customer_registration_flows already exists in schema: ${schemaName}`);
      
      // ✅ VERIFICAR QUE TENGA TODAS LAS COLUMNAS NECESARIAS
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = $1 
        AND table_name = 'customer_registration_flows'
        ORDER BY ordinal_position
      `, [schemaName]);
      
      const existingColumns = columnCheck.rows.map(row => row.column_name);
      const requiredColumns = [
        'id', 'customer_id', 'phone_number', 'current_step', 
        'flow_type', 'order_id', 'order_number', 'collected_data',
        'requested_service', 'is_completed', 'expires_at', 
        'created_at', 'updated_at'
      ];
      
      const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
      
      if (missingColumns.length > 0) {
        console.log(`⚠️ Missing columns detected: ${missingColumns.join(', ')}`);
        
        // Agregar columnas faltantes
        for (const column of missingColumns) {
          let columnDef = '';
          
          switch (column) {
            case 'flow_type':
              columnDef = 'flow_type TEXT DEFAULT \'order_data_collection\'';
              break;
            case 'order_id':
              columnDef = 'order_id INTEGER';
              break;
            case 'order_number':
              columnDef = 'order_number TEXT';
              break;
            case 'collected_data':
              columnDef = 'collected_data TEXT DEFAULT \'{}\'';
              break;
            case 'requested_service':
              columnDef = 'requested_service TEXT';
              break;
            default:
              console.log(`⚠️ Unknown missing column: ${column}, skipping`);
              continue;
          }
          
          try {
            await pool.query(`
              ALTER TABLE ${schemaName}.customer_registration_flows 
              ADD COLUMN IF NOT EXISTS ${columnDef}
            `);
            console.log(`✅ Added missing column: ${column}`);
          } catch (addColError) {
            console.error(`❌ Error adding column ${column}:`, addColError);
          }
        }
      } else {
        console.log(`✅ All required columns present in table`);
      }
    }
    
    console.log(`🎯 Table verification completed for store ${storeId} (schema: ${schemaName})`);
    
  } catch (error) {
    console.error(`❌ Error ensuring customer_registration_flows table exists:`, error);
    
    // ✅ INFORMACIÓN ADICIONAL PARA DEBUGGING
    if (error.code) {
      console.error(`   Database Error Code: ${error.code}`);
    }
    if (error.message) {
      console.error(`   Error Message: ${error.message}`);
    }
    
    // ✅ NO HACER THROW - SOLO LOGEAR EL ERROR
    console.log(`⚠️ Table verification failed for store ${storeId}, but continuing...`);
    
  } finally {
    await pool.end().catch(err => 
      console.log('⚠️ Pool close warning in ensureRegistrationFlowTableExists:', err.message)
    );
  }
},


async getNotificationChannels() {
  try {
    return await tenantDb.select()
      .from(schema.notificationChannels)
      .orderBy(schema.notificationChannels.name);
  } catch (error) {
    console.error('Error getting notification channels:', error);
    return [];
  }
},

async updateNotificationChannel(id: number, data: any) {
  try {
    const [channel] = await tenantDb.update(schema.notificationChannels)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.notificationChannels.id, id))
      .returning();
    return channel;
  } catch (error) {
    console.error('Error updating notification channel:', error);
    throw error;
  }
},

async getNotificationEvents() {
  try {
    return await tenantDb.select()
      .from(schema.notificationEvents)
      .orderBy(schema.notificationEvents.eventType);
  } catch (error) {
    console.error('Error getting notification events:', error);
    return [];
  }
},

async getNotificationConfigs() {
  try {
    return await tenantDb.select({
      id: schema.notificationConfigs.id,
      eventId: schema.notificationConfigs.eventId,
      channelId: schema.notificationConfigs.channelId,
      isEnabled: schema.notificationConfigs.isEnabled,
      recipientType: schema.notificationConfigs.recipientType,
      customRecipients: schema.notificationConfigs.customRecipients,
      template: schema.notificationConfigs.template,
      priority: schema.notificationConfigs.priority,
      delayMinutes: schema.notificationConfigs.delayMinutes,
      eventName: schema.notificationEvents.eventName,
      channelName: schema.notificationChannels.name,
    })
    .from(schema.notificationConfigs)
    .leftJoin(schema.notificationEvents, eq(schema.notificationConfigs.eventId, schema.notificationEvents.id))
    .leftJoin(schema.notificationChannels, eq(schema.notificationConfigs.channelId, schema.notificationChannels.id));
  } catch (error) {
    console.error('Error getting notification configs:', error);
    return [];
  }
},

async createNotificationConfig(data: any) {
  try {
    const [config] = await tenantDb.insert(schema.notificationConfigs)
      .values(data)
      .returning();
    return config;
  } catch (error) {
    console.error('Error creating notification config:', error);
    throw error;
  }
},

async updateNotificationConfig(id: number, data: any) {
  try {
    const [config] = await tenantDb.update(schema.notificationConfigs)
      .set(data)
      .where(eq(schema.notificationConfigs.id, id))
      .returning();
    return config;
  } catch (error) {
    console.error('Error updating notification config:', error);
    throw error;
  }
},

async deleteNotificationConfig(id: number) {
  try {
    await tenantDb.delete(schema.notificationConfigs)
      .where(eq(schema.notificationConfigs.id, id));
    return true;
  } catch (error) {
    console.error('Error deleting notification config:', error);
    return false;
  }
},

async getNotificationHistory(params: any) {
  try {
    let query = tenantDb.select()
      .from(schema.notificationHistory);

    if (params.orderId) {
      query = query.where(eq(schema.notificationHistory.orderId, params.orderId));
    }
    if (params.channel) {
      query = query.where(eq(schema.notificationHistory.channel, params.channel));
    }
    if (params.status) {
      query = query.where(eq(schema.notificationHistory.status, params.status));
    }

    const offset = (params.page - 1) * params.limit;
    const history = await query
      .orderBy(desc(schema.notificationHistory.createdAt))
      .limit(params.limit)
      .offset(offset);

    return history;
  } catch (error) {
    console.error('Error getting notification history:', error);
    return [];
  }
},

async addNotificationHistory(data: any) {
  try {
    const [history] = await tenantDb.insert(schema.notificationHistory)
      .values(data)
      .returning();
    return history;
  } catch (error) {
    console.error('Error adding notification history:', error);
    throw error;
  }
},

async getStoreEmployeesAndAdmins() {
  try {
    console.log(`📋 Getting assignable users for store ${storeId}`);
    
    const users = await tenantDb
      .select()
      .from(schema.users)
      .where(
        and(
          // Sin storeId - ya estamos en el tenant schema
          or(
            eq(schema.users.role, 'technician'),
            eq(schema.users.role, 'specialist'),
            eq(schema.users.role, 'field_worker'),
            eq(schema.users.role, 'admin')
          ),
          eq(schema.users.status, 'active') // Sin isActive
        )
      );
    
    console.log(`✅ Found ${users.length} assignable users for store ${storeId}`);
    return users;
  } catch (error) {
    console.error('❌ Error fetching store employees and admins:', error);
    throw error;
  }
},

async getUserWorkload(userId: number) {
  try {
    const activeOrders = await tenantDb
      .select({ count: count() })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.assignedUserId, userId),
          or(
            eq(schema.orders.status, 'assigned'),
            eq(schema.orders.status, 'processing'),
            eq(schema.orders.status, 'preparing')
          )
        )
      );
    
    const workload = activeOrders[0]?.count || 0;
    console.log(`📊 User ${userId} workload: ${workload} active orders`);
    return workload;
  } catch (error) {
    console.error(`❌ Error getting workload for user ${userId}:`, error);
    return 0;
  }
},


async getAllBrands(): Promise<ProductBrand[]> {
  try {
    if (schema.productBrands) {
      return await tenantDb.select()
        .from(schema.productBrands)
        .orderBy(desc(schema.productBrands.sortOrder), asc(schema.productBrands.name));
    }
    return [];
  } catch (error) {
    console.error('Error getting all brands:', error);
    return [];
  }
},

async getBrandById(id: number): Promise<ProductBrand | null> {
  try {
    if (schema.productBrands) {
      const [brand] = await tenantDb.select()
        .from(schema.productBrands)
        .where(eq(schema.productBrands.id, id))
        .limit(1);
      return brand || null;
    }
    return null;
  } catch (error) {
    console.error('Error getting brand by ID:', error);
    return null;
  }
},

async getBrandByName(name: string): Promise<ProductBrand | null> {
  try {
    if (schema.productBrands) {
      const [brand] = await tenantDb.select()
        .from(schema.productBrands)
        .where(eq(schema.productBrands.name, name))
        .limit(1);
      return brand || null;
    }
    return null;
  } catch (error) {
    console.error('Error getting brand by name:', error);
    return null;
  }
},

async createBrand(brandData: InsertProductBrand): Promise<ProductBrand> {
  try {
    if (!schema.productBrands) {
      throw new Error('Brands table not available in tenant schema');
    }

    const [brand] = await tenantDb.insert(schema.productBrands)
      .values({
        ...brandData,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    return brand;
  } catch (error) {
    console.error('Error creating brand:', error);
    throw error;
  }
},

async updateBrand(id: number, updates: Partial<InsertProductBrand>): Promise<ProductBrand> {
  try {
    if (!schema.productBrands) {
      throw new Error('Brands table not available in tenant schema');
    }

    const [brand] = await tenantDb.update(schema.productBrands)
      .set({ 
        ...updates, 
        updatedAt: new Date() 
      })
      .where(eq(schema.productBrands.id, id))
      .returning();

    if (!brand) {
      throw new Error('Brand not found');
    }

    return brand;
  } catch (error) {
    console.error('Error updating brand:', error);
    throw error;
  }
},

async deleteBrand(id: number): Promise<void> {
  try {
    if (!schema.productBrands) {
      throw new Error('Brands table not available in tenant schema');
    }

    await tenantDb.delete(schema.productBrands)
      .where(eq(schema.productBrands.id, id));
  } catch (error) {
    console.error('Error deleting brand:', error);
    throw error;
  }
},

async getActiveBrands(): Promise<ProductBrand[]> {
  try {
    if (schema.productBrands) {
      return await tenantDb.select()
        .from(schema.productBrands)
        .where(eq(schema.productBrands.isActive, true))
        .orderBy(asc(schema.productBrands.sortOrder), asc(schema.productBrands.name));
    }
    return [];
  } catch (error) {
    console.error('Error getting active brands:', error);
    return [];
  }
},

async getProductsByBrand(brandId: number) {
  try {
    const query = `
      SELECT p.* 
      FROM products p
      INNER JOIN brands b ON p.brand = b.name
      WHERE b.id = ? AND p."isActive" = true
    `;
    
    const result = await this.db.execute(query, [brandId]);
    return result.rows || [];
  } catch (error) {
    console.error('Error in getProductsByBrand:', error);
    throw error;
  }
},

// server/tenant-storage.ts
// ✅ AGREGAR ESTOS MÉTODOS al objeto que se retorna en createTenantStorage

// ================================
// ASSIGNMENT RULES METHODS
// ================================

/**
 * Obtener todas las reglas de asignación de la tienda
 */
async getAllAssignmentRules() {
  try {
    const rules = await tenantDb
      .select()
      .from(schema.assignmentRules)
      .where(eq(schema.assignmentRules.storeId, storeId))
      .orderBy(desc(schema.assignmentRules.priority));
    
    return rules;
  } catch (error) {
    console.error('Error getting assignment rules:', error);
    return [];
  }
},

async createAssignmentRule(ruleData: any) {
  try {
    // ✅ Remover storeId si viene en ruleData
    const cleanData = { ...ruleData };
    delete cleanData.storeId;
    
    const [newRule] = await tenantDb
      .insert(schema.assignmentRules)
      .values({
        ...cleanData,
        storeId: storeId, // ✅ Usar el storeId del tenant (ya es number)
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    
    return newRule;
  } catch (error) {
    console.error('Error creating assignment rule:', error);
    throw error;
  }
},

/**
 * Actualizar regla de asignación
 */
async updateAssignmentRule(ruleId: number, ruleData: any) {
  try {
    const [updatedRule] = await tenantDb
      .update(schema.assignmentRules)
      .set({
        ...ruleData,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.assignmentRules.id, ruleId),
          eq(schema.assignmentRules.storeId, storeId)
        )
      )
      .returning();
    
    return updatedRule;
  } catch (error) {
    console.error('Error updating assignment rule:', error);
    throw error;
  }
},

/**
 * Eliminar regla de asignación
 */
async deleteAssignmentRule(ruleId: number) {
  try {
    await tenantDb
      .delete(schema.assignmentRules)
      .where(
        and(
          eq(schema.assignmentRules.id, ruleId),
          eq(schema.assignmentRules.storeId, storeId)
        )
      );
    
    return { success: true };
  } catch (error) {
    console.error('Error deleting assignment rule:', error);
    throw error;
  }
},

/**
 * Obtener regla por ID
 */
async getAssignmentRuleById(ruleId: number) {
  try {
    const [rule] = await tenantDb
      .select()
      .from(schema.assignmentRules)
      .where(
        and(
          eq(schema.assignmentRules.id, ruleId),
          eq(schema.assignmentRules.storeId, storeId)
        )
      )
      .limit(1);
    
    return rule || null;
  } catch (error) {
    console.error('Error getting assignment rule:', error);
    return null;
  }
},

/**
 * Obtener usuarios por rol
 */
async getUsersByRole(role: string) {
  try {
    console.log(`👥 Getting users with role: ${role}`);
    
    const result = await tenantDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.role, role));
    
    const users = result.map((user: any) => ({
      id: user.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      province: user.province || null,
      municipality: user.municipality || null,
      sector: user.sector || null,
      coverageProvinces: user.coverage_provinces || user.coverageProvinces || [],
      coverageMunicipalities: user.coverage_municipalities || user.coverageMunicipalities || [],
      coverageSectors: user.coverage_sectors || user.coverageSectors || [],
      specializations: user.specializations || [],
      currentOrders: user.current_orders || user.currentOrders || 0,
      maxDailyOrders: user.max_daily_orders || user.maxDailyOrders || 10,
      skillLevel: user.skill_level || user.skillLevel || 1,
    }));
    
    console.log(`✅ Found ${users.length} users with role ${role}`);
    return users;
    
  } catch (error) {
    console.error(`❌ Error getting users by role:`, error);
    return [];
  }
},

  // ========================================
  // MÉTODOS DE IA
  // ========================================

  /**
   * Obtener conversación de IA
   */
  async getAIConversation(conversationId: number) {
    try {
      console.log(`🔍 [AI-CONV] Obteniendo conversación AI para conversationId: ${conversationId}`);
      const [conversation] = await tenantDb
        .select()
        .from(schema.aiConversations)
        .where(eq(schema.aiConversations.conversationId, conversationId))
        .limit(1);
      
      if (conversation) {
        console.log(`✅ [AI-CONV] Conversación ${conversationId} encontrada (ID: ${conversation.id}, Cliente: ${conversation.customerId})`);
      } else {
        console.log(`❌ [AI-CONV] Conversación ${conversationId} NO encontrada`);
      }
      return conversation || null;
    } catch (error) {
      console.error('Error getting AI conversation:', error);
      return null;
    }
  },

  /**
   * Crear conversación de IA
   */
  async createAIConversation(data: any) {
    try {
      const [conversation] = await tenantDb
        .insert(schema.aiConversations)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      return conversation;
    } catch (error) {
      console.error('Error creating AI conversation:', error);
      throw error;
    }
  },

  /**
   * Actualizar conversación de IA
   */
  async updateAIConversation(conversationId: number, data: any) {
    try {
      console.log(`💾 [AI-CONV] Actualizando conversación ${conversationId} - Campos:`, Object.keys(data).filter(k => k !== 'updatedAt'));
      await tenantDb
        .update(schema.aiConversations)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.aiConversations.conversationId, conversationId));
      console.log(`✅ [AI-CONV] Conversación ${conversationId} actualizada exitosamente`);
    } catch (error) {
      console.error('Error updating AI conversation:', error);
      throw error;
    }
  },

  /**
   * Obtener conversaciones AI activas (para limpieza)
   */
  async getActiveAIConversations(storeId: number) {
    try {
      const conversations = await tenantDb
        .select()
        .from(schema.aiConversations)
        .where(eq(schema.aiConversations.storeId, storeId));
      return conversations || [];
    } catch (error) {
      console.error('Error getting active AI conversations:', error);
      return [];
    }
  },

  /**
   * Registrar uso de IA
   */
  async logAIUsage(data: any) {
    try {
      await tenantDb.insert(schema.aiUsageLog).values({
        ...data,
        createdAt: new Date()
      });
    } catch (error) {
      console.error('Error logging AI usage:', error);
    }
  },

  /**
   * Obtener estadísticas de uso de IA
   */
  async getAIUsageStats(days: number = 30) {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const logs = await tenantDb
        .select()
        .from(schema.aiUsageLog)
        .where(
          and(
            eq(schema.aiUsageLog.storeId, storeId),
            gte(schema.aiUsageLog.createdAt, since)
          )
        );

      const totalMessages = logs.filter(l => l.operationType === 'message_analysis').length;
      const totalOrders = logs.filter(l => l.operationType === 'order_creation').length;
      const totalVoiceNotes = logs.filter(l => l.operationType === 'voice_transcription').length;
      const totalCreditsUsed = logs.reduce((sum, l) => sum + (l.creditsCost || 0), 0);
      const avgConfidence = logs.length > 0
        ? logs.reduce((sum, l) => sum + (parseFloat(l.confidence as any) || 0), 0) / logs.length
        : 0;

      return {
        totalMessages,
        totalOrders,
        totalVoiceNotes,
        totalCreditsUsed,
        averageConfidence: avgConfidence
      };
    } catch (error) {
      console.error('Error getting AI usage stats:', error);
      return {
        totalMessages: 0,
        totalOrders: 0,
        totalVoiceNotes: 0,
        totalCreditsUsed: 0,
        averageConfidence: 0
      };
    }
  },

  /**
   * ✅ OBTENER CRÉDITOS DE IA - Consulta desde masterDb (schema público)
   * Fixed: Now queries from public schema instead of tenant schema
   */
  async getAICredits() {
    try {
      console.log(`🔍 [TENANT-STORAGE] Obteniendo créditos de IA para tienda ${storeId}...`);

      // Consultar desde el schema público usando masterDb
      const credits = await masterDb.select({
        id: schema.aiCredits.id,
        storeId: schema.aiCredits.storeId,
        totalCredits: schema.aiCredits.totalCredits,
        usedCredits: schema.aiCredits.usedCredits,
        availableCredits: schema.aiCredits.availableCredits,
        isEnabled: schema.aiCredits.isEnabled,
        costPerMessage: schema.aiCredits.costPerMessage,
        costPerOrder: schema.aiCredits.costPerOrder,
        costPerVoiceNote: schema.aiCredits.costPerVoiceNote
      })
        .from(schema.aiCredits)
        .where(eq(schema.aiCredits.storeId, storeId))
        .limit(1);

      if (credits && credits.length > 0) {
        const creditData = credits[0];
        console.log(`✅ [TENANT-STORAGE] Créditos encontrados para tienda ${storeId}:`, {
          available: creditData.availableCredits,
          isEnabled: creditData.isEnabled,
          totalCredits: creditData.totalCredits
        });
        return creditData;
      }

      console.log(`ℹ️ [TENANT-STORAGE] No hay créditos configurados para tienda ${storeId}`);
      return null;
    } catch (error) {
      console.error(`❌ [TENANT-STORAGE] Error obteniendo créditos para tienda ${storeId}:`, error);
      // Try fallback with minimal columns - using explicit public schema reference
      try {
        console.log(`🔄 [TENANT-STORAGE] Intentando consulta fallback con schema público explícito...`);
        const result = await masterDb.execute(`
          SELECT id, store_id, available_credits, is_enabled, total_credits
          FROM public.ai_credits
          WHERE store_id = ${storeId}
          LIMIT 1
        `);

        if (result && result.rows && result.rows.length > 0) {
          const row = result.rows[0];
          return {
            id: row[0],
            storeId: row[1],
            availableCredits: row[2],
            isEnabled: row[3],
            totalCredits: row[4]
          };
        }
      } catch (fallbackError) {
        console.error(`❌ [TENANT-STORAGE] Fallback también falló:`, fallbackError);
      }
      return null;
    }
  },

  // ================================
  // MÉTODOS PARA SISTEMA DE CONVERSIÓN DE UNIDADES
  // ================================

  /**
   * Obtener todas las unidades de medida de la tienda
   */
  async getAllMeasurementUnits() {
    try {
      const units = await tenantDb.select()
        .from(schema.measurementUnits)
        .where(eq(schema.measurementUnits.storeId, storeId))
        .orderBy(asc(schema.measurementUnits.sortOrder));
      return units;
    } catch (error) {
      console.error(`Error getting measurement units for store ${storeId}:`, error);
      throw error;
    }
  },

  /**
   * Obtener unidades activas de la tienda
   */
  async getActiveMeasurementUnits() {
    try {
      const units = await tenantDb.select()
        .from(schema.measurementUnits)
        .where(
          and(
            eq(schema.measurementUnits.storeId, storeId),
            eq(schema.measurementUnits.isActive, true)
          )
        )
        .orderBy(asc(schema.measurementUnits.sortOrder));
      return units;
    } catch (error) {
      console.error(`Error getting active measurement units for store ${storeId}:`, error);
      throw error;
    }
  },

  /**
   * Obtener unidad por ID
   */
  async getMeasurementUnitById(unitId: number) {
    try {
      const [unit] = await tenantDb.select()
        .from(schema.measurementUnits)
        .where(
          and(
            eq(schema.measurementUnits.id, unitId),
            eq(schema.measurementUnits.storeId, storeId)
          )
        )
        .limit(1);
      return unit || null;
    } catch (error) {
      console.error(`Error getting measurement unit ${unitId}:`, error);
      return null;
    }
  },

  /**
   * Crear nueva unidad de medida
   */
  async createMeasurementUnit(data: schema.InsertMeasurementUnit) {
    try {
      const [unit] = await tenantDb.insert(schema.measurementUnits)
        .values({ ...data, storeId })
        .returning();
      return unit;
    } catch (error) {
      console.error('Error creating measurement unit:', error);
      throw error;
    }
  },

  /**
   * Actualizar unidad de medida
   */
  async updateMeasurementUnit(unitId: number, data: Partial<schema.InsertMeasurementUnit>) {
    try {
      const [unit] = await tenantDb.update(schema.measurementUnits)
        .set({ ...data, updatedAt: new Date() })
        .where(
          and(
            eq(schema.measurementUnits.id, unitId),
            eq(schema.measurementUnits.storeId, storeId)
          )
        )
        .returning();
      return unit;
    } catch (error) {
      console.error(`Error updating measurement unit ${unitId}:`, error);
      throw error;
    }
  },

  /**
   * Eliminar unidad de medida (soft delete - marca como inactiva)
   */
  async deleteMeasurementUnit(unitId: number) {
    try {
      await tenantDb.update(schema.measurementUnits)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(schema.measurementUnits.id, unitId),
            eq(schema.measurementUnits.storeId, storeId)
          )
        );
      return true;
    } catch (error) {
      console.error(`Error deleting measurement unit ${unitId}:`, error);
      return false;
    }
  },

  /**
   * Obtener todas las conversiones de un producto
   */
  async getProductUnitConversions(productId: number) {
    try {
      const conversions = await tenantDb.select({
        id: schema.productUnitConversions.id,
        productId: schema.productUnitConversions.productId,
        sourceUnitId: schema.productUnitConversions.sourceUnitId,
        targetUnitId: schema.productUnitConversions.targetUnitId,
        conversionFactor: schema.productUnitConversions.conversionFactor,
        isActive: schema.productUnitConversions.isActive,
        notes: schema.productUnitConversions.notes,
        sourceUnit: schema.measurementUnits,
      })
        .from(schema.productUnitConversions)
        .leftJoin(
          schema.measurementUnits,
          eq(schema.productUnitConversions.sourceUnitId, schema.measurementUnits.id)
        )
        .where(
          and(
            eq(schema.productUnitConversions.productId, productId),
            eq(schema.productUnitConversions.storeId, storeId)
          )
        );
      return conversions;
    } catch (error) {
      console.error(`Error getting product unit conversions for product ${productId}:`, error);
      throw error;
    }
  },

  /**
   * Crear conversión de unidad para un producto
   */
  async createProductUnitConversion(data: schema.InsertProductUnitConversion) {
    try {
      const [conversion] = await tenantDb.insert(schema.productUnitConversions)
        .values({ ...data, storeId })
        .returning();
      return conversion;
    } catch (error) {
      console.error('Error creating product unit conversion:', error);
      throw error;
    }
  },

  /**
   * Actualizar conversión de unidad
   */
  async updateProductUnitConversion(
    conversionId: number,
    data: Partial<schema.InsertProductUnitConversion>
  ) {
    try {
      const [conversion] = await tenantDb.update(schema.productUnitConversions)
        .set({ ...data, updatedAt: new Date() })
        .where(
          and(
            eq(schema.productUnitConversions.id, conversionId),
            eq(schema.productUnitConversions.storeId, storeId)
          )
        )
        .returning();
      return conversion;
    } catch (error) {
      console.error(`Error updating product unit conversion ${conversionId}:`, error);
      throw error;
    }
  },

  /**
   * Eliminar conversión de unidad
   */
  async deleteProductUnitConversion(conversionId: number) {
    try {
      await tenantDb.delete(schema.productUnitConversions)
        .where(
          and(
            eq(schema.productUnitConversions.id, conversionId),
            eq(schema.productUnitConversions.storeId, storeId)
          )
        );
      return true;
    } catch (error) {
      console.error(`Error deleting product unit conversion ${conversionId}:`, error);
      return false;
    }
  },

  /**
   * Obtener unidades disponibles para un producto (con conversiones configuradas)
   */
  async getAvailableUnitsForProduct(productId: number) {
    try {
      // Obtener el producto para verificar si tiene conversión habilitada
      const [product] = await tenantDb.select()
        .from(schema.products)
        .where(eq(schema.products.id, productId))
        .limit(1);

      if (!product || !product.unitConversionEnabled || !product.baseUnitId) {
        return [];
      }

      // Obtener todas las conversiones configuradas
      const conversions = await tenantDb.select()
        .from(schema.productUnitConversions)
        .where(
          and(
            eq(schema.productUnitConversions.productId, productId),
            eq(schema.productUnitConversions.isActive, true)
          )
        );

      // Recopilar todos los IDs de unidades
      const unitIds = new Set<number>();
      unitIds.add(product.baseUnitId); // Siempre incluir unidad base

      conversions.forEach((conv) => {
        unitIds.add(conv.sourceUnitId);
        unitIds.add(conv.targetUnitId);
      });

      // Obtener detalles de las unidades
      const units = await tenantDb.select()
        .from(schema.measurementUnits)
        .where(
          and(
            eq(schema.measurementUnits.storeId, storeId),
            eq(schema.measurementUnits.isActive, true),
            inArray(schema.measurementUnits.id, Array.from(unitIds))
          )
        )
        .orderBy(asc(schema.measurementUnits.sortOrder));

      return units;
    } catch (error) {
      console.error(`Error getting available units for product ${productId}:`, error);
      throw error;
    }
  },

  /**
   * Crear orden con validación de stock y conversión de unidades
   * Este método reemplaza createOrder cuando se necesita control de inventario
   */
  async createOrderWithStockValidation(orderData: any, items: any[] = []) {
    try {
      console.log(`📦 Creating order with stock validation for store ${storeId}`);

      // Validar que haya items
      if (!items || items.length === 0) {
        throw new Error('No se pueden crear órdenes sin items');
      }

      // Paso 1: Validar stock y procesar conversiones
      const processedItems = [];
      const stockUpdates = [];

      for (const item of items) {
        const { productId, quantity, unitId } = item;

        if (!productId || !quantity) {
          throw new Error('Cada item debe tener productId y quantity');
        }

        // Obtener producto
        const [product] = await tenantDb.select()
          .from(schema.products)
          .where(eq(schema.products.id, productId))
          .limit(1);

        if (!product) {
          throw new Error(`Producto con ID ${productId} no encontrado`);
        }

        // Verificar si el producto está activo
        if (product.status !== 'active') {
          throw new Error(`Producto "${product.name}" no está disponible`);
        }

        let quantityInBaseUnit = quantity;
        let finalUnitId = unitId;

        // Si el producto tiene conversión de unidades habilitada
        if (product.unitConversionEnabled && product.baseUnitId) {
          if (!unitId) {
            // Si no se especifica unidad, usar la unidad base
            finalUnitId = product.baseUnitId;
            quantityInBaseUnit = quantity;
          } else {
            // Convertir a unidad base
            const conversion = await this.convertToBaseUnit(productId, quantity, unitId);

            if (!conversion.success) {
              throw new Error(
                `Error al convertir unidades para producto "${product.name}": ${conversion.error}`
              );
            }

            quantityInBaseUnit = conversion.convertedValue;
          }
        }

        // Validar stock disponible (en unidad base)
        const availableStock = product.stockQuantity || 0;
        if (availableStock < quantityInBaseUnit) {
          throw new Error(
            `Stock insuficiente para producto "${product.name}". ` +
            `Disponible: ${availableStock}, Requerido: ${quantityInBaseUnit}`
          );
        }

        // Guardar para actualizar stock después
        stockUpdates.push({
          productId: product.id,
          quantityToReduce: quantityInBaseUnit,
        });

        // Preparar item procesado
        processedItems.push({
          productId: product.id,
          quantity: quantity,
          unitId: finalUnitId,
          quantityInBaseUnit: quantityInBaseUnit,
          unitPrice: item.unitPrice || product.price,
          totalPrice: item.totalPrice || (parseFloat(product.price) * quantity),
          installationCost: item.installationCost,
          partsCost: item.partsCost,
          laborHours: item.laborHours,
          laborRate: item.laborRate,
          deliveryCost: item.deliveryCost || '0',
          deliveryDistance: item.deliveryDistance,
          notes: item.notes,
        });
      }

      // Paso 2: Generar número de orden
      const orderNumber = await this.generateOrderNumber();

      // Paso 3: Calcular puntos de lealtad - Respetar valor del frontend si existe
      let totalLoyaltyPoints: number;
      let loyaltyPointsPropertyName: string | null;
      let loyaltyPointsValue: number | null;

      if (orderData.loyaltyPointsTotal !== undefined && orderData.loyaltyPointsTotal !== null) {
        totalLoyaltyPoints = Number(orderData.loyaltyPointsTotal);
        loyaltyPointsPropertyName = orderData.loyaltyPointsPropertyName || null;
        loyaltyPointsValue = orderData.loyaltyPointsValue !== undefined ? Number(orderData.loyaltyPointsValue) : null;
        console.log(`🎁 Using loyalty points from frontend: ${totalLoyaltyPoints}`);
      } else {
        const calculated = await this.calculateOrderLoyaltyPointsData(items);
        totalLoyaltyPoints = calculated.totalLoyaltyPoints;
        loyaltyPointsPropertyName = calculated.loyaltyPointsPropertyName;
        loyaltyPointsValue = calculated.loyaltyPointsValue;
        console.log(`🎁 Calculated loyalty points in backend: ${totalLoyaltyPoints}`);
      }

      // Paso 4: Crear la orden
      const [order] = await tenantDb.insert(schema.orders)
        .values({
          ...orderData,
          orderNumber,
          loyaltyPointsTotal: totalLoyaltyPoints,
          loyaltyPointsPropertyName: loyaltyPointsPropertyName,
          loyaltyPointsValue: loyaltyPointsValue,
          storeId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      console.log(`✅ Order created with number: ${orderNumber}`);

      // Paso 5: Insertar items con conversiones
      const itemsWithOrderId = processedItems.map(item => ({
        ...item,
        orderId: order.id,
        storeId,
      }));

      await tenantDb.insert(schema.orderItems).values(itemsWithOrderId);
      console.log(`✅ ${itemsWithOrderId.length} items inserted`);

      // Paso 5.5: Registrar movimientos de inventario (salidas por venta)
      for (const item of itemsWithOrderId) {
        try {
          await tenantDb.insert(schema.inventoryMovements).values({
            storeId,
            productId: item.productId,
            type: 'sale',
            quantity: -(Number(item.quantityInBaseUnit || item.quantity || 0)),
            unitId: item.unitId || null,
            referenceType: 'order',
            referenceId: order.id,
            notes: 'Salida por venta POS/orden',
            createdAt: new Date(),
            createdBy: null,
          });
        } catch (movementError) {
          console.warn('No se pudo registrar movimiento de inventario para la venta:', movementError);
        }
      }
      // Paso 6: Reducir stock de productos
      for (const update of stockUpdates) {
        await tenantDb.update(schema.products)
          .set({
            stockQuantity: sql`stock_quantity - ${update.quantityToReduce}`,
            updatedAt: new Date(),
          })
          .where(eq(schema.products.id, update.productId));

        console.log(`📉 Stock reduced for product ${update.productId}: -${update.quantityToReduce}`);
      }

      console.log(`✅ Order ${orderNumber} created successfully with stock control`);

      return order;
    } catch (error) {
      console.error('❌ Error creating order with stock validation:', error);
      throw error;
    }
  },

  /**
   * Helper: Convertir cantidad a unidad base del producto
   * Wrapper del método de unit-conversion.ts para uso interno
   */
  async convertToBaseUnit(productId: number, quantity: number, unitId: number) {
    try {
      // Obtener producto
      const [product] = await tenantDb.select()
        .from(schema.products)
        .where(eq(schema.products.id, productId))
        .limit(1);

      if (!product) {
        return {
          success: false,
          convertedValue: 0,
          sourceUnit: null,
          targetUnit: null,
          conversionFactor: 0,
          error: `Producto ${productId} no encontrado`,
        };
      }

      if (!product.unitConversionEnabled) {
        return {
          success: false,
          convertedValue: 0,
          sourceUnit: null,
          targetUnit: null,
          conversionFactor: 0,
          error: `Conversión de unidades no habilitada para producto ${productId}`,
        };
      }

      if (!product.baseUnitId) {
        return {
          success: false,
          convertedValue: 0,
          sourceUnit: null,
          targetUnit: null,
          conversionFactor: 0,
          error: `Producto ${productId} no tiene unidad base configurada`,
        };
      }

      // Si la unidad es la misma que la base, no hace falta conversión
      if (unitId === product.baseUnitId) {
        const [unit] = await tenantDb.select()
          .from(schema.measurementUnits)
          .where(eq(schema.measurementUnits.id, unitId))
          .limit(1);

        return {
          success: true,
          convertedValue: quantity,
          sourceUnit: unit || null,
          targetUnit: unit || null,
          conversionFactor: 1,
        };
      }

      // Obtener unidades
      const [sourceUnit, targetUnit] = await Promise.all([
        tenantDb.select().from(schema.measurementUnits)
          .where(eq(schema.measurementUnits.id, unitId)).limit(1),
        tenantDb.select().from(schema.measurementUnits)
          .where(eq(schema.measurementUnits.id, product.baseUnitId)).limit(1),
      ]);

      if (!sourceUnit[0]) {
        return {
          success: false,
          convertedValue: 0,
          sourceUnit: null,
          targetUnit: targetUnit[0] || null,
          conversionFactor: 0,
          error: `Unidad origen ${unitId} no encontrada`,
        };
      }

      if (!targetUnit[0]) {
        return {
          success: false,
          convertedValue: 0,
          sourceUnit: sourceUnit[0],
          targetUnit: null,
          conversionFactor: 0,
          error: `Unidad base ${product.baseUnitId} no encontrada`,
        };
      }

      // Verificar que las unidades sean del mismo tipo
      if (sourceUnit[0].type !== targetUnit[0].type) {
        return {
          success: false,
          convertedValue: 0,
          sourceUnit: sourceUnit[0],
          targetUnit: targetUnit[0],
          conversionFactor: 0,
          error: `No se puede convertir entre tipos diferentes: ${sourceUnit[0].type} y ${targetUnit[0].type}`,
        };
      }

      // Buscar factor de conversión
      const [conversion] = await tenantDb.select()
        .from(schema.productUnitConversions)
        .where(
          and(
            eq(schema.productUnitConversions.productId, productId),
            eq(schema.productUnitConversions.sourceUnitId, unitId),
            eq(schema.productUnitConversions.targetUnitId, product.baseUnitId),
            eq(schema.productUnitConversions.isActive, true)
          )
        )
        .limit(1);

      if (!conversion) {
        // Intentar conversión inversa
        const [reverseConversion] = await tenantDb.select()
          .from(schema.productUnitConversions)
          .where(
            and(
              eq(schema.productUnitConversions.productId, productId),
              eq(schema.productUnitConversions.sourceUnitId, product.baseUnitId),
              eq(schema.productUnitConversions.targetUnitId, unitId),
              eq(schema.productUnitConversions.isActive, true)
            )
          )
          .limit(1);

        if (!reverseConversion) {
          return {
            success: false,
            convertedValue: 0,
            sourceUnit: sourceUnit[0],
            targetUnit: targetUnit[0],
            conversionFactor: 0,
            error: `No se encontró factor de conversión entre ${sourceUnit[0].symbol} y ${targetUnit[0].symbol}`,
          };
        }

        // Usar factor inverso
        const factor = 1 / parseFloat(reverseConversion.conversionFactor);
        return {
          success: true,
          convertedValue: quantity * factor,
          sourceUnit: sourceUnit[0],
          targetUnit: targetUnit[0],
          conversionFactor: factor,
        };
      }

      // Usar factor directo
      const factor = parseFloat(conversion.conversionFactor);
      return {
        success: true,
        convertedValue: quantity * factor,
        sourceUnit: sourceUnit[0],
        targetUnit: targetUnit[0],
        conversionFactor: factor,
      };
    } catch (error) {
      console.error('Error in convertToBaseUnit:', error);
      return {
        success: false,
        convertedValue: 0,
        sourceUnit: null,
        targetUnit: null,
        conversionFactor: 0,
        error: `Error interno: ${error.message}`,
      };
    }
  },

  // ================================
  // 🎁 LOYALTY POINTS - MÉTODOS
  // ================================

  /**
   * Acredita los puntos de lealtad de una orden cuando se completa
   */
  async creditLoyaltyPointsFromOrder(orderId: number) {
    const { LoyaltyPointsService } = await import('./services/loyalty-points-service.js');
    const loyaltyService = new LoyaltyPointsService(storeId);
    return await loyaltyService.creditLoyaltyPointsFromOrder(orderId);
  },

  /**
   * Revierte los puntos de lealtad de una orden
   */
  async revertLoyaltyPointsFromOrder(orderId: number) {
    const { LoyaltyPointsService } = await import('./services/loyalty-points-service.js');
    const loyaltyService = new LoyaltyPointsService(storeId);
    return await loyaltyService.revertLoyaltyPointsFromOrder(orderId);
  },

  /**
   * Obtiene el balance de puntos de un cliente
   */
  async getCustomerLoyaltyBalance(customerId: number) {
    try {
      const [balance] = await tenantDb
        .select()
        .from(schema.customerLoyaltyBalance)
        .where(eq(schema.customerLoyaltyBalance.customerId, customerId))
        .limit(1);

      return balance || null;
    } catch (error) {
      console.error('Error getting customer loyalty balance:', error);
      return null;
    }
  },

  }; // Fin del return del createTenantStorage

} // Fin de createTenantStorage

export async function getDefaultTenantStorage(): Promise<TenantStorage> {
  const publicTenantId = 1;
  return getTenantStorage(publicTenantId);
}


// En tenant-storage.ts - agregar al final del archivo
export async function createTenantStorageForStore(storeId: number) {
  const tenantDb = await getTenantDb(storeId);
  
  // ✅ DEBUGGING TEMPORAL
  console.log(`🔍 TenantDb validation for store ${storeId}:`, {
    exists: !!tenantDb,
    hasExecute: !!(tenantDb && tenantDb.execute),
    type: typeof tenantDb,
    keys: tenantDb ? Object.keys(tenantDb) : 'undefined'
  });
  
  return createTenantStorage(tenantDb, storeId);
}



