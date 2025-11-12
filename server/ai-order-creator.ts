// ai-order-creator.ts
import axios from 'axios';

interface OrderItem {
  productId: number;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface OrderPayload {
  customerId: number;
  items: OrderItem[];
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
    console.error('❌ Error creating order from AI:', err.response?.data || err.message);
    throw err;
  }
}
