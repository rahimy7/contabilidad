import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, MessageCircle, Edit, UserPlus, RefreshCw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OrderWithDetails } from "@shared/schema";

interface OrderTableProps {
  orders: OrderWithDetails[];
  isLoading: boolean;
  onAssignOrder: (order: OrderWithDetails) => void;
}

export default function OrderTable({ orders, isLoading, onAssignOrder }: OrderTableProps) {
  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      pending: { label: "Pendiente", className: "bg-red-100 text-red-800" },
      assigned: { label: "Asignado", className: "bg-blue-100 text-blue-800" },
      processing: { label: "En proceso", className: "bg-yellow-100 text-yellow-800" },
      completed: { label: "Completado", className: "bg-green-100 text-green-800" },
      cancelled: { label: "Cancelado", className: "bg-gray-100 text-gray-800" },
    };

    return variants[status] || variants.pending;
  };

  const formatTime = (date: string | Date) => {
    const now = new Date();
    const orderDate = new Date(date);
    const diffInHours = Math.floor((now.getTime() - orderDate.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return "Hace menos de 1 hora";
    if (diffInHours === 1) return "Hace 1 hora";
    return `Hace ${diffInHours} horas`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Todos los Pedidos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="animate-pulse h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <CardTitle className="text-lg font-semibold text-gray-900">Todos los Pedidos</CardTitle>
          <div className="flex items-center space-x-2">
            <Select defaultValue="all">
              <SelectTrigger className="w-full md:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="assigned">Asignado</SelectItem>
                <SelectItem value="processing">En proceso</SelectItem>
                <SelectItem value="completed">Completado</SelectItem>
              </SelectContent>
            </Select>
            <Button size="icon" variant="ghost">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pedido</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Asignado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {orders.map((order: OrderWithDetails) => {
                const statusBadge = getStatusBadge(order.status);
                return (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{order.orderNumber}</div>
                      <div className="text-sm text-gray-500">{formatTime(order.createdAt)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center mr-3">
                          <span className="text-xs font-medium text-gray-600">
                            {order.customer.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{order.customer.name}</div>
                          <div className="text-sm text-gray-500">{order.customer.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {order.assignedUser ? (
                        <div>
                          <div className="text-sm text-gray-900">{order.assignedUser.name}</div>
                          <div className="text-sm text-gray-500 capitalize">{order.assignedUser.role}</div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">Sin asignar</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge className={statusBadge.className}>
                        {statusBadge.label}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      ${parseFloat(order.totalAmount).toLocaleString('es-MX')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        {!order.assignedUser && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="text-primary"
                            onClick={() => onAssignOrder(order)}
                          >
                            <UserPlus className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="text-primary">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" className="whatsapp-text">
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" className="text-gray-400">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden space-y-4">
          {orders.map((order: OrderWithDetails) => {
            const statusBadge = getStatusBadge(order.status);
            return (
              <div key={order.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-600">
                        {order.customer.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                      </span>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{order.orderNumber}</div>
                      <div className="text-xs text-gray-500">{formatTime(order.createdAt)}</div>
                    </div>
                  </div>
                  <Badge className={statusBadge.className}>
                    {statusBadge.label}
                  </Badge>
                </div>

                <div className="space-y-2 mb-4">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{order.customer.name}</div>
                    <div className="text-xs text-gray-500">{order.customer.phone}</div>
                  </div>
                  
                  {order.assignedUser ? (
                    <div>
                      <div className="text-sm text-gray-700">Asignado a: {order.assignedUser.name}</div>
                      <div className="text-xs text-gray-500 capitalize">{order.assignedUser.role}</div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">Sin asignar</div>
                  )}
                  
                  <div className="text-lg font-bold text-gray-900">
                    ${parseFloat(order.totalAmount).toLocaleString('es-MX')}
                  </div>
                </div>

                <div className="flex space-x-2">
                  {!order.assignedUser && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-primary flex-1"
                      onClick={() => onAssignOrder(order)}
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      Asignar
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="text-primary">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" className="whatsapp-text">
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" className="text-gray-400">
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
