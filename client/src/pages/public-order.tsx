// src/pages/public-order.tsx
import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { Loader2, Package, AlertCircle } from "lucide-react";

interface OrderItem {
  id: number;
  productId: number;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  product: {
    id: number;
    name: string;
    description?: string;
  };
}

interface Order {
  id: number;
  orderNumber: string;
  status: string;
  totalAmount: string;
  items: OrderItem[];
  customer?: {
    name: string;
    phone?: string;
    address?: string;
  };
  deliveryAddress?: string;
  contactNumber?: string;
}

export default function PublicOrder() {
  const [, params] = useRoute("/orders/public/:storeId/:orderId");
  const { storeId, orderId } = (params as { storeId: string; orderId: string }) ?? {};
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!storeId || !orderId) {
      setError('Parámetros inválidos');
      setLoading(false);
      return;
    }
    
    console.log('🔍 Fetching order:', storeId, orderId);
    
    fetch(`/api/public/orders/${storeId}/${orderId}`)
      .then((res) => {
        console.log('📡 Response status:', res.status);
        if (!res.ok) throw new Error('Order not found');
        return res.json();
      })
      .then((data) => {
        console.log('✅ Order data:', data);
        setOrder(data);
        setError('');
      })
      .catch((err) => {
        console.error('❌ Error:', err);
        setError('Pedido no encontrado');
      })
      .finally(() => setLoading(false));
  }, [storeId, orderId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="animate-spin w-8 h-8 text-blue-600" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4">
        <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
        <p className="text-gray-600 text-center font-medium">{error || 'Pedido no encontrado'}</p>
      </div>
    );
  }

  const total = parseFloat(order.totalAmount || '0');
  const hasItems = order.items && Array.isArray(order.items) && order.items.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 text-white px-6 py-4">
          <h1 className="text-2xl font-bold">Pedido</h1>
          <p className="text-blue-100 text-lg mt-1">{order.orderNumber}</p>
        </div>

        {/* Items */}
        <div className="px-6 py-4">
          <h2 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Package className="w-5 h-5" />
            Productos {hasItems && `(${order.items.length})`}
          </h2>
          
          {!hasItems ? (
            <div className="text-center py-8 text-gray-400">
              <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No hay productos en este pedido</p>
            </div>
          ) : (
            <div className="space-y-3">
              {order.items.map((item: OrderItem, i: number) => {
                const itemTotal = parseFloat(item.totalPrice || '0') || 
                                (parseFloat(item.unitPrice || '0') * item.quantity);
                
                return (
                  <div key={i} className="flex justify-between items-start py-3 border-b last:border-0">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {item.product?.name || 'Producto'}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Cantidad: {item.quantity}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="font-semibold text-gray-900">
                        ${parseFloat(item.unitPrice || '0').toFixed(2)}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        ${itemTotal.toFixed(2)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Total */}
        <div className="bg-gray-50 px-6 py-4 border-t-2 border-gray-200">
          <div className="flex justify-between items-center">
            <span className="text-lg font-semibold text-gray-700">Total</span>
            <span className="text-2xl font-bold text-blue-600">
              ${total.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}