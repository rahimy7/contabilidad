import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ShoppingBag, 
  Plus, 
  Search, 
  Filter, 
  Eye, 
  Edit, 
  Trash2, 
  Clock, 
  CheckCircle,
  XCircle,
  AlertCircle,
  User,
  Phone,
  MapPin,
  Package
} from "lucide-react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";


interface Order {
  id: number;
  orderNumber: string;
  customerId: number;
  status: string;
  totalAmount: string;
  notes: string | null;
  createdAt: string;
  customer: {
    name: string;
    phone: string;
    address: string | null;
  };
  items?: Array<{
    id: number;
    quantity: number;
    unitPrice: string;
    totalPrice: string;
    product: {
      name: string;
      category: string;
    };
  }>;
}

const statusConfig = {
  pending: { label: "Pendiente", color: "bg-yellow-100 text-yellow-800", icon: Clock },
  processing: { label: "En Progreso", color: "bg-orange-100 text-orange-800", icon: AlertCircle },
  completed: { label: "Completado", color: "bg-green-100 text-green-800", icon: CheckCircle },
  cancelled: { label: "Cancelado", color: "bg-red-100 text-red-800", icon: XCircle },
};

export default function OrderManagement() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["/api/orders"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const deleteOrderMutation = useMutation({
    mutationFn: (orderId: number) => apiRequest("DELETE", `/api/orders/${orderId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Orden eliminada",
        description: "La orden ha sido eliminada exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo eliminar la orden. Inténtalo de nuevo.",
        variant: "destructive",
      });
    },
  });

  const updateOrderStatusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: number; status: string }) =>
      apiRequest("PUT", `/api/orders/${orderId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Estado actualizado",
        description: "El estado de la orden ha sido actualizado exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado de la orden.",
        variant: "destructive",
      });
    },
  });

  const filteredOrders = Array.isArray(orders) ? orders.filter((order: Order) => {
    const matchesSearch = 
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer?.phone.includes(searchTerm);
    
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  }) : [];

  const getStatusInfo = (status: string) => {
    return statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
  };

  const handleDeleteOrder = async (orderId: number) => {
    if (window.confirm("¿Estás seguro de que deseas eliminar esta orden?")) {
      deleteOrderMutation.mutate(orderId);
    }
  };

  const handleStatusUpdate = (orderId: number, newStatus: string) => {
    updateOrderStatusMutation.mutate({ orderId, status: newStatus });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <ShoppingBag className="h-8 w-8 text-primary" />
            Gestión de Órdenes
          </h1>
          <p className="text-gray-600 mt-2">
            Administra y supervisa todas las órdenes de manera centralizada
          </p>
        </div>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros y Búsqueda
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar por número de orden, cliente o teléfono..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="w-full md:w-48">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  {Object.entries(statusConfig).map(([value, config]) => (
                    <SelectItem key={value} value={value}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(statusConfig).map(([status, config]) => {
          const count = filteredOrders.filter((order: Order) => order.status === status).length;
          const Icon = config.icon;
          
          return (
            <Card key={status} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-lg ${config.color.replace('text-', 'bg-').replace('100', '200')}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">{config.label}</p>
                    <p className="text-2xl font-bold text-gray-900">{count}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Órdenes ({filteredOrders.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredOrders.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingBag className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No se encontraron órdenes
              </h3>
              <p className="text-gray-600">
                {searchTerm || statusFilter !== "all" 
                  ? "Intenta ajustar los filtros de búsqueda"
                  : "Aún no hay órdenes registradas en el sistema"
                }
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Orden</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order: Order) => {
                    const statusInfo = getStatusInfo(order.status);
                    const StatusIcon = statusInfo.icon;
                    
                    return (
                      <TableRow key={order.id} className="hover:bg-gray-50">
                        <TableCell>
                          <div>
                            <p className="font-medium">{order.orderNumber}</p>
                            <p className="text-sm text-gray-500">ID: {order.id}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{order.customer?.name || 'N/A'}</p>
                            <div className="flex items-center gap-1 text-sm text-gray-500">
                              <Phone className="h-3 w-3" />
                              {order.customer?.phone || 'N/A'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${statusInfo.color} border-0`}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">
                            ${parseFloat(order.totalAmount || "0").toLocaleString('es-MX')}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p>{new Date(order.createdAt).toLocaleDateString('es-MX')}</p>
                            <p className="text-gray-500">
                              {new Date(order.createdAt).toLocaleTimeString('es-MX', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedOrder(order)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Detalles de la Orden</DialogTitle>
                                  <DialogDescription>
                                    Información completa de la orden {order.orderNumber}
                                  </DialogDescription>
                                </DialogHeader>
                                <OrderDetailsModal order={order} onStatusUpdate={handleStatusUpdate} />
                              </DialogContent>
                            </Dialog>
                            
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteOrder(order.id)}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OrderDetailsModal({ 
  order, 
  onStatusUpdate 
}: { 
  order: Order; 
  onStatusUpdate: (orderId: number, status: string) => void;
}) {
  const statusInfo = statusConfig[order.status as keyof typeof statusConfig] || statusConfig.pending;
  const StatusIcon = statusInfo.icon;

  return (
    <div className="space-y-6">
      {/* Order Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Información de la Orden</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-600">Número de Orden</p>
              <p className="text-lg font-semibold">{order.orderNumber}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Estado</p>
              <Badge className={`${statusInfo.color} border-0 mt-1`}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {statusInfo.label}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Total</p>
              <p className="text-lg font-semibold text-green-600">
                ${parseFloat(order.totalAmount || "0").toLocaleString('es-MX')}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">Fecha de Creación</p>
              <p>{new Date(order.createdAt).toLocaleString('es-MX')}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Información del Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-gray-400" />
              <span>{order.customer?.name || 'N/A'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-gray-400" />
              <span>{order.customer?.phone || 'N/A'}</span>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
              <span className="text-sm">{order.customer?.address || 'Dirección no disponible'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Order Items */}
      {order.items && order.items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Productos ({order.items.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {order.items.map((item, index) => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">{item.product.name}</p>
                    <p className="text-sm text-gray-600">
                      Categoría: {item.product.category} | Cantidad: {item.quantity}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      ${parseFloat(item.totalPrice).toLocaleString('es-MX')}
                    </p>
                    <p className="text-sm text-gray-600">
                      ${parseFloat(item.unitPrice).toLocaleString('es-MX')} c/u
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {order.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700">{order.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Status Update */}
      <Card>
        <CardHeader>
          <CardTitle>Actualizar Estado</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            {Object.entries(statusConfig).map(([status, config]) => {
              const Icon = config.icon;
              const isCurrentStatus = order.status === status;
              
              return (
                <Button
                  key={status}
                  variant={isCurrentStatus ? "default" : "outline"}
                  size="sm"
                  onClick={() => !isCurrentStatus && onStatusUpdate(order.id, status)}
                  disabled={isCurrentStatus}
                  className="flex items-center gap-2"
                >
                  <Icon className="h-4 w-4" />
                  {config.label}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}