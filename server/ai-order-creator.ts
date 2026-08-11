/**
 * AI ORDER CREATOR
 * Crea órdenes reales en la API interna usando token Bearer
 * Con validación completa y manejo de errores mejorado
 */
import axios from 'axios';

export type CreateOrderFromCartArgs = {
  storeId: number;
  customerId: number;
  items: Array<{ productId: number; quantity: number; unitPrice?: number; totalPrice?: number; notes?: string }>;
  notes?: string;
  tenantStorage?: any; // opcional
};

export async function createOrderFromCart(args: CreateOrderFromCartArgs) {
  const { storeId, customerId, items, notes, tenantStorage } = args;

  // ================================
  // VALIDACIÓN DE INPUTS
  // ================================
  if (!tenantStorage) {
    throw new Error('❌ [ORDER-CREATOR] tenantStorage es requerido en createOrderFromCart');
  }

  if (!storeId || storeId <= 0) {
    throw new Error('❌ [ORDER-CREATOR] storeId inválido o no proporcionado');
  }

  if (!customerId || customerId <= 0) {
    throw new Error('❌ [ORDER-CREATOR] customerId inválido o no proporcionado');
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('❌ [ORDER-CREATOR] items debe ser un array no vacío');
  }

  // Validar cada item
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.productId || item.productId <= 0) {
      throw new Error(`❌ [ORDER-CREATOR] Item ${i}: productId inválido`);
    }
    if (!item.quantity || item.quantity <= 0) {
      throw new Error(`❌ [ORDER-CREATOR] Item ${i}: quantity debe ser > 0`);
    }
  }

  console.log(`📦 [ORDER-CREATOR] Iniciando creación de orden para tienda ${storeId}, cliente ${customerId}`);

  try {
    // Validar que el cliente existe
    try {
      const customer = await tenantStorage.getCustomerById(customerId);
      if (!customer) {
        throw new Error(`Cliente con ID ${customerId} no existe`);
      }
      console.log(`✅ [ORDER-CREATOR] Cliente validado: ${customer.name || `ID ${customerId}`}`);
    } catch (error: any) {
      throw new Error(`❌ [ORDER-CREATOR] Error validando cliente: ${error.message}`);
    }

    // Cargar productos para completar precios que falten
    console.log(`📝 [ORDER-CREATOR] Cargando ${items.length} producto(s)...`);
    const productsMap = new Map<number, any>();
    const missingProducts: number[] = [];

    for (const it of items) {
      if (!productsMap.has(it.productId)) {
        const p = await tenantStorage.getProductById(it.productId);
        if (p) {
          productsMap.set(it.productId, p);
          console.log(`  ✅ Producto ${it.productId}: ${p.name} (RD$${p.price})`);
        } else {
          missingProducts.push(it.productId);
          console.warn(`  ⚠️ Producto ${it.productId} no encontrado`);
        }
      }
    }

    if (missingProducts.length > 0) {
      throw new Error(`❌ [ORDER-CREATOR] Productos no encontrados: ${missingProducts.join(', ')}`);
    }

    // Construir items de la orden con validación de stock
    const orderItems = items.map((it, idx) => {
      const p = productsMap.get(it.productId);
      if (!p) {
        throw new Error(`❌ [ORDER-CREATOR] Producto ${it.productId} no disponible`);
      }

      // Validar stock si existe
      const productStock = parseInt(String(p.stock || 0));
      if (productStock <= 0) {
        console.warn(`⚠️ [ORDER-CREATOR] Producto ${p.name} sin stock (disponible: ${productStock})`);
      }

      const unitPrice = it.unitPrice ?? (p?.price ? parseFloat(String(p.price)) : 0);
      const totalPrice = it.totalPrice ?? unitPrice * it.quantity;

      if (isNaN(unitPrice) || unitPrice < 0) {
        throw new Error(`❌ [ORDER-CREATOR] Precio inválido para producto ${p.name}`);
      }

      if (isNaN(totalPrice) || totalPrice < 0) {
        throw new Error(`❌ [ORDER-CREATOR] Precio total inválido para producto ${p.name}`);
      }

      return {
        storeId,
        productId: it.productId,
        quantity: it.quantity,
        unitPrice,
        totalPrice,
        notes: it.notes ?? null
      };
    });

    const totalAmount = orderItems.reduce((acc, x) => acc + (Number(x.totalPrice) || 0), 0);

    if (totalAmount <= 0) {
      throw new Error(`❌ [ORDER-CREATOR] Monto total inválido: RD$${totalAmount}`);
    }

    console.log(`💰 [ORDER-CREATOR] Monto total: RD$${totalAmount.toFixed(2)}`);

    // Crear la orden
    console.log(`📋 [ORDER-CREATOR] Creando orden en base de datos...`);
    const order = await tenantStorage.createOrder(
      {
        storeId,
        customerId,
        totalAmount,
        status: 'pending',
        notes: notes ?? null
      },
      orderItems
    );

    if (!order || !order.id) {
      throw new Error('❌ [ORDER-CREATOR] Error: Orden no fue creada correctamente');
    }

    console.log(`✅ [ORDER-CREATOR] Orden creada exitosamente - ID: ${order.id}`);

    // Reservar stock del pedido para que otro canal no prometa las mismas cajas
    // antes del despacho. La orden nace `pending` sin descontar inventario.
    try {
      const { reserveForOrder } = await import('./inventory/order-reservations.js');
      const { masterPool } = await import('./multi-tenant-db.js');
      const warehouseIdForReserve = (order as { warehouseId?: number }).warehouseId;
      if (warehouseIdForReserve) {
        const outcome = await reserveForOrder(
          masterPool,
          order.id,
          storeId,
          orderItems
            .filter((it: any) => it.productId && Number(it.quantity) > 0)
            .map((it: any) => ({
              productId: it.productId,
              warehouseId: warehouseIdForReserve,
              quantity: Number(it.quantity),
            })),
        );
        if (outcome.skipped.length) {
          console.warn(`[reservation] AI cart order ${order.id}: reserved ${outcome.reserved.length}, skipped ${outcome.skipped.length}`, outcome.skipped);
        }
      }
    } catch (resErr) {
      console.warn('[reservation] AI cart order failed:', resErr);
    }

    // Trae items enriquecidos para el mensaje de confirmación
    const itemsWithNames = await tenantStorage.getOrderItemsByOrderId(order.id);

    return {
      ...order,
      items: itemsWithNames,
      total: totalAmount
    };

  } catch (error: any) {
    console.error(`❌ [ORDER-CREATOR] Error en createOrderFromCart:`, error.message);
    throw error;
  }
}
export interface OrderItemPayload {
  productId: number;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface OrderPayload {
  customerId: number;
  items: OrderItemPayload[];
  notes?: string;
  paymentMethod?: string;
  receivedAmount?: number;
  changeAmount?: number;
}

export async function createOrderFromAI(
  token: string,
  apiBaseUrl: string,
  payload: OrderPayload
) {
  // ================================
  // VALIDACIÓN DE INPUTS
  // ================================
  if (!token || token.trim() === '') {
    throw new Error('❌ [ORDER-API] Token de autenticación no proporcionado');
  }

  if (!apiBaseUrl || apiBaseUrl.trim() === '') {
    throw new Error('❌ [ORDER-API] URL base de API no proporcionada');
  }

  if (!payload) {
    throw new Error('❌ [ORDER-API] Payload no proporcionado');
  }

  if (!payload.customerId || payload.customerId <= 0) {
    throw new Error('❌ [ORDER-API] customerId inválido en payload');
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new Error('❌ [ORDER-API] items debe ser un array no vacío');
  }

  console.log(`🌐 [ORDER-API] Creando orden vía API - Cliente: ${payload.customerId}, Items: ${payload.items.length}`);

  try {
    const url = `${apiBaseUrl}/orders/by-customer`;
    console.log(`📡 [ORDER-API] POST ${url}`);

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000, // 30 segundos timeout
      validateStatus: () => true // Permite cualquier status code
    });

    // Manejo de diferentes status codes
    if (response.status >= 200 && response.status < 300) {
      console.log(`✅ [ORDER-API] Orden creada exitosamente - ID: ${response.data?.id}`);
      return response.data;
    } else if (response.status === 400) {
      const errorMsg = response.data?.error || response.data?.message || 'Bad Request';
      throw new Error(`❌ [ORDER-API] Error 400 - Solicitud inválida: ${errorMsg}`);
    } else if (response.status === 401) {
      throw new Error(`❌ [ORDER-API] Error 401 - Token de autenticación inválido o expirado`);
    } else if (response.status === 403) {
      throw new Error(`❌ [ORDER-API] Error 403 - Acceso denegado. Permiso insuficiente`);
    } else if (response.status === 404) {
      throw new Error(`❌ [ORDER-API] Error 404 - Recurso no encontrado`);
    } else if (response.status === 409) {
      throw new Error(`❌ [ORDER-API] Error 409 - Conflicto (posiblemente stock insuficiente)`);
    } else if (response.status === 429) {
      throw new Error(`❌ [ORDER-API] Error 429 - Demasiadas solicitudes. Intenta más tarde`);
    } else if (response.status >= 500) {
      throw new Error(`❌ [ORDER-API] Error ${response.status} - Error del servidor. Intenta más tarde`);
    } else {
      throw new Error(`❌ [ORDER-API] Error HTTP ${response.status}: ${response.statusText}`);
    }

  } catch (err: any) {
    // Manejo de errores de conexión
    if (err.code === 'ECONNREFUSED') {
      console.error(`❌ [ORDER-API] Conexión rechazada - API no disponible en ${apiBaseUrl}`);
      throw new Error('❌ Error: El servidor de API no está disponible');
    } else if (err.code === 'ENOTFOUND') {
      console.error(`❌ [ORDER-API] Host no encontrado: ${apiBaseUrl}`);
      throw new Error('❌ Error: Host no encontrado');
    } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      console.error(`❌ [ORDER-API] Timeout de conexión`);
      throw new Error('❌ Error: Tiempo de espera agotado. Intenta más tarde');
    }

    // Si ya es un error lanzado arriba, re-lanzarlo
    if (err.message && err.message.startsWith('❌')) {
      throw err;
    }

    // Error genérico
    console.error(`❌ [ORDER-API] Error inesperado:`, err?.message || err);
    throw new Error(`❌ Error creando orden: ${err?.message || 'Error desconocido'}`);
  }
}
