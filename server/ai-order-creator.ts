/**
 * AI ORDER CREATOR
 * Crea órdenes reales en la API interna usando token Bearer
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
  if (!tenantStorage) throw new Error('tenantStorage es requerido en createOrderFromCart');

  // Cargar productos para completar precios que falten
  const productsMap = new Map<number, any>();
  for (const it of items) {
    if (!productsMap.has(it.productId)) {
      const p = await tenantStorage.getProductById(it.productId);
      if (p) productsMap.set(it.productId, p);
    }
  }

  const orderItems = items.map(it => {
    const p = productsMap.get(it.productId);
    const unitPrice = it.unitPrice ?? (p?.price ? parseFloat(p.price) : 0);
    const totalPrice = it.totalPrice ?? unitPrice * it.quantity;

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

  // Trae items enriquecidos para el mensaje de confirmación
  const itemsWithNames = await tenantStorage.getOrderItemsByOrderId(order.id);

  return {
    ...order,
    items: itemsWithNames,
    total: totalAmount
  };
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
  try {
    const response = await axios.post(
      `${apiBaseUrl}/orders/by-customer`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.status >= 200 && response.status < 300) {
      return response.data;
    } else {
      throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (err: any) {
    console.error('❌ Error creating order from AI:', err?.response?.data || err?.message || err);
    throw err;
  }
}
