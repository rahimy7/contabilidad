// src/pages/public-order.tsx
import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export default function PublicOrder() {
  const [, params] = useRoute("/orders/public/:id");
 const { id } = (params as { id: string }) ?? {};
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/public/orders/${id}`)
      .then((res) => res.json())
      .then(setOrder)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin w-8 h-8 text-gray-500" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        Pedido no encontrado
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-center">
        Pedido #{order.orderNumber}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-medium">{order.customer.name}</p>
          <p className="text-sm text-gray-600">{order.customer.address}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Productos</CardTitle>
        </CardHeader>
        <CardContent>
          {order.items.map((item: any, i: number) => (
            <div key={i} className="border-b py-2">
              <p className="font-medium">{item.product.name}</p>
              <p className="text-sm text-gray-500">
                Cantidad: {item.quantity} × ${item.unitPrice}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            Estado
            <Badge variant="outline">{order.status}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-right font-bold text-green-600">
          Total: $
          {order.items
            .reduce(
              (acc: number, item: any) =>
                acc + parseFloat(item.unitPrice) * item.quantity,
              0
            )
            .toLocaleString("es-MX")}
        </CardContent>
      </Card>
    </div>
  );
}
