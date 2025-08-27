import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CheckCircle, Clock, AlertCircle, User, Phone, MapPin, DollarSign, Search, Bell, Settings, Package, Play, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

type OrderWithDetails = {
  id: number;
  orderNumber: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  assignedUserId: number | null;
  totalAmount: string;
  customer: {
    id: number;
    name: string;
    phone: string;
    email: string | null;
    address: string | null;
  };
  assignedUser: {
    id: number;
    username: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
  } | null;
  items: Array<{
    id: number;
    productId: number;
    quantity: number;
    unitPrice: string;
    productName: string;
    productPrice: number;
  }>;
};

type TechnicianMetrics = {
  ordersToday: number;
  pendingOrders: number;
  inProgressOrders: number;
  completedOrders: number;
  todayIncome: number;
};

type User = {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  status: string;
};

// Helper functions
const getOrderProductName = (order: OrderWithDetails): string => {
  if (order.items && order.items.length > 0) {
    if (order.items.length === 1) {
      return order.items[0].productName;
    }
    return `${order.items[0].productName} (+${order.items.length - 1} más)`;
  }
  return 'Sin productos';
};

const getOrderTotal = (order: OrderWithDetails): number => {
  if (order.totalAmount) {
    return parseFloat(order.totalAmount);
  }
  return order.items?.reduce((sum, item) => {
    return sum + (parseFloat(item.unitPrice) * item.quantity);
  }, 0) || 0;
};

const safeRenderOrder = (order: OrderWithDetails) => {
  if (!order) {
    console.warn('Order is undefined or null');
    return null;
  }

  if (!order.customer) {
    console.warn('Order customer is undefined:', order.id);
    return null;
  }

  if (!order.items) {
    console.warn('Order items is undefined:', order.id);
    order.items = [];
  }

  return order;
};

function StatusBadge({ status }: { status: string }) {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'pending':
        return { label: 'Pendiente', variant: 'secondary' as const };
      case 'confirmed':
        return { label: 'Confirmado', variant: 'default' as const };
      case 'assigned':
        return { label: 'Asignado', variant: 'default' as const };
      case 'in_progress':
        return { label: 'En Progreso', variant: 'default' as const };
      case 'completed':
        return { label: 'Completado', variant: 'default' as const };
      case 'cancelled':
        return { label: 'Cancelado', variant: 'destructive' as const };
      default:
        return { label: status, variant: 'secondary' as const };
    }
  };

  const config = getStatusConfig(status);
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

function OrderDetailModal({ order }: { order: OrderWithDetails }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="px-3">
          <Eye className="w-4 h-4 mr-1" />
          Ver Detalle
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Detalle de Orden #{order.orderNumber}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Estado y Información Básica */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Estado</label>
              <div>
                <StatusBadge status={order.status} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Total</label>
              <div className="text-xl font-bold text-green-600">${getOrderTotal(order).toFixed(2)}</div>
            </div>
          </div>

          {/* Información del Cliente */}
          <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
            <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <User className="w-5 h-5" />
              Información del Cliente
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Nombre</label>
                <p className="text-gray-900 dark:text-white">{order.customer.name}</p>
              </div>
              {order.customer.phone && (
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Teléfono</label>
                  <p className="text-gray-900 dark:text-white flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    {order.customer.phone}
                  </p>
                </div>
              )}
              {order.customer.email && (
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</label>
                  <p className="text-gray-900 dark:text-white">{order.customer.email}</p>
                </div>
              )}
              {order.customer.address && (
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Dirección</label>
                  <p className="text-gray-900 dark:text-white flex items-start gap-2">
                    <MapPin className="w-4 h-4 mt-1 flex-shrink-0" />
                    {order.customer.address}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Productos/Items */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <Package className="w-5 h-5" />
              Productos ({order.items?.length || 0})
            </h3>
            {order.items && order.items.length > 0 ? (
              <div className="space-y-3">
                {order.items.map((item, index) => (
                  <div key={item.id || index} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900 dark:text-white">
                        {item.productName || `Producto ${item.productId}`}
                      </h4>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Cantidad: {item.quantity} × ${parseFloat(item.unitPrice).toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900 dark:text-white">
                        ${(parseFloat(item.unitPrice) * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="border-t pt-3 flex justify-between items-center font-bold text-lg">
                  <span>Total:</span>
                  <span className="text-green-600">${getOrderTotal(order).toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                No hay productos en esta orden
              </p>
            )}
          </div>

          {/* Información de Técnico Asignado */}
          {order.assignedUser && (
            <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20">
              <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                <User className="w-5 h-5" />
                Técnico Asignado
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Usuario</label>
                  <p className="text-gray-900 dark:text-white">{order.assignedUser.username}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Nombre</label>
                  <p className="text-gray-900 dark:text-white">
                    {order.assignedUser.firstName && order.assignedUser.lastName 
                      ? `${order.assignedUser.firstName} ${order.assignedUser.lastName}`
                      : order.assignedUser.username
                    }
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Información de Fechas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Fecha de Creación</label>
              <p className="text-gray-900 dark:text-white">
                {new Date(order.createdAt).toLocaleDateString('es-ES', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Última Actualización</label>
              <p className="text-gray-900 dark:text-white">
                {new Date(order.updatedAt).toLocaleDateString('es-ES', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function TechnicianDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch current user
  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/me"],
  });

  // Fetch technician orders
  const { data: orders = [], isLoading: ordersLoading } = useQuery<OrderWithDetails[]>({
    queryKey: ["/api/orders/technician"],
  });

  // Fetch technician metrics
  const { data: technicianMetrics = {} as TechnicianMetrics } = useQuery<TechnicianMetrics>({
    queryKey: ["/api/dashboard/technician/metrics"],
  });

  // Update user status mutation
  const updateUserStatus = useMutation({
    mutationFn: async (status: string) => {
      return apiRequest("PATCH", `/api/users/${user?.id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Estado actualizado",
        description: "Tu estado ha sido actualizado correctamente",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado",
        variant: "destructive",
      });
    },
  });

  // Update order status mutation
  const updateOrderStatus = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: number; status: string }) => {
      return apiRequest("PATCH", `/api/orders/${orderId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders/technician"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/technician/metrics"] });
      toast({
        title: "Orden actualizada",
        description: "El estado de la orden ha sido actualizado",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar la orden",
        variant: "destructive",
      });
    },
  });

  // Filter orders by status
  const pendingOrders = orders.filter(order => order.status === 'assigned' || order.status === 'pending');
  const inProgressOrders = orders.filter(order => order.status === 'in_progress');
  const completedOrders = orders.filter(order => order.status === 'completed');
  
  // Calculate completed today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const completedToday = completedOrders.filter(order => {
    const orderDate = new Date(order.updatedAt);
    orderDate.setHours(0, 0, 0, 0);
    return order.status === 'completed' && orderDate.getTime() === today.getTime();
  });

  // Fetch notification count
  const { data: notificationCount } = useQuery<{ total: number; unread: number }>({
    queryKey: ["/api/notifications/count"],
    refetchInterval: 30000,
  });

  // Filter orders only by search term
  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         order.customer.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  // Filtered orders by status
  const filteredPendingOrders = filteredOrders.filter(order => order.status === 'assigned' || order.status === 'pending');
  const filteredInProgressOrders = filteredOrders.filter(order => order.status === 'in_progress');
  const filteredCompletedOrders = filteredOrders.filter(order => order.status === 'completed');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header con logo y saludo personalizado */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {/* Logo */}
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Package className="w-5 h-5 text-white" />
              </div>
              {/* Nombre de la App */}
              <span className="font-bold text-lg text-gray-900 dark:text-white hidden sm:block">
                ServicePro
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Notificaciones */}
            <Button variant="ghost" size="sm" className="relative">
              <Bell className="w-5 h-5" />
              {notificationCount && notificationCount.unread > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {notificationCount.unread}
                </span>
              )}
            </Button>
            
            {/* Perfil */}
            <Button variant="ghost" size="sm">
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </div>
        
        {/* Saludo personalizado */}
        <div className="mt-3">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Hola, {user?.name || 'Técnico'} 👋
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <div className="text-sm text-gray-600 dark:text-gray-400">Estado:</div>
            <div className="flex gap-1">
              <Button
                variant={user?.status === 'active' ? 'default' : 'ghost'}
                size="sm"
                className="px-2 py-1 text-xs"
                onClick={() => updateUserStatus.mutate('active')}
                disabled={updateUserStatus.isPending}
              >
                <CheckCircle className="w-3 h-3 mr-1" />
                <span className="hidden sm:inline">Disponible</span>
              </Button>
              <Button
                variant={user?.status === 'busy' ? 'default' : 'ghost'}
                size="sm"
                className="px-2 py-1 text-xs"
                onClick={() => updateUserStatus.mutate('busy')}
                disabled={updateUserStatus.isPending}
              >
                <Clock className="w-3 h-3 mr-1" />
                <span className="hidden sm:inline">Ocupado</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Resumen rápido */}
        <Card className="bg-white dark:bg-gray-800 shadow-sm border-0 rounded-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold">Resumen rápido</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">📦</div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">{pendingOrders.length}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Asignados</div>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">✅</div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">{completedOrders.length}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Finalizados</div>
              </div>
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">⏳</div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">{inProgressOrders.length}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">En Proceso</div>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">⚠️</div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">{completedToday.length}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Hoy</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Solo búsqueda */}
        <Card className="bg-white dark:bg-gray-800 shadow-sm border-0 rounded-lg">
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="🔍 Buscar pedido o cliente"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Órdenes de Trabajo */}
        <Card className="bg-white dark:bg-gray-800 shadow-sm border-0 rounded-lg">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold">Mis Órdenes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Tabs defaultValue="pending" className="w-full">
              <TabsList className="grid w-full grid-cols-3 h-12 bg-gray-50 dark:bg-gray-700/50 rounded-lg m-4 mb-0">
                <TabsTrigger value="pending" className="text-sm font-medium">
                  Pendientes ({filteredPendingOrders.length})
                </TabsTrigger>
                <TabsTrigger value="progress" className="text-sm font-medium">
                  En Progreso ({filteredInProgressOrders.length})
                </TabsTrigger>
                <TabsTrigger value="completed" className="text-sm font-medium">
                  Historial ({filteredCompletedOrders.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending" className="p-4 space-y-3">
                {filteredPendingOrders.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No se encontraron órdenes pendientes</p>
                  </div>
                ) : (
                  filteredPendingOrders.map((order) => (
                    <div key={order.id} className="bg-white dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 shadow-sm">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white">#{order.orderNumber}</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{getOrderProductName(order)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200 text-xs rounded-full">
                            🟠 Pendiente
                          </span>
                        </div>
                      </div>
                      
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">Cliente:</span>
                          <span>{order.customer.name}</span>
                        </div>
                        {order.customer.phone && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="w-4 h-4 text-gray-500" />
                            <span className="font-medium">Teléfono:</span>
                            <span>{order.customer.phone}</span>
                          </div>
                        )}
                        {order.customer.address && (
                          <div className="flex items-center gap-2 text-sm">
                            <MapPin className="w-4 h-4 text-gray-500" />
                            <span className="font-medium">Dirección:</span>
                            <span className="truncate">{order.customer.address}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">Total:</span>
                          <span className="font-bold text-green-600">${getOrderTotal(order).toFixed(2)}</span>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button 
                          size="sm"
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                          onClick={() => updateOrderStatus.mutate({ orderId: order.id, status: 'in_progress' })}
                          disabled={updateOrderStatus.isPending}
                        >
                          <Play className="w-4 h-4 mr-2" />
                          Iniciar Trabajo
                        </Button>
                        <OrderDetailModal order={order} />
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="progress" className="p-4 space-y-3">
                {filteredInProgressOrders.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No se encontraron órdenes en progreso</p>
                  </div>
                ) : (
                  filteredInProgressOrders.map((order) => (
                    <div key={order.id} className="bg-white dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 shadow-sm">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white">#{order.orderNumber}</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{getOrderProductName(order)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200 text-xs rounded-full">
                            🟡 En Progreso
                          </span>
                        </div>
                      </div>
                      
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">Cliente:</span>
                          <span>{order.customer.name}</span>
                        </div>
                        {order.customer.phone && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="w-4 h-4 text-gray-500" />
                            <span className="font-medium">Teléfono:</span>
                            <span>{order.customer.phone}</span>
                          </div>
                        )}
                        {order.customer.address && (
                          <div className="flex items-center gap-2 text-sm">
                            <MapPin className="w-4 h-4 text-gray-500" />
                            <span className="font-medium">Dirección:</span>
                            <span className="truncate">{order.customer.address}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">Total:</span>
                          <span className="font-bold text-green-600">${getOrderTotal(order).toFixed(2)}</span>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button 
                          size="sm"
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => updateOrderStatus.mutate({ orderId: order.id, status: 'completed' })}
                          disabled={updateOrderStatus.isPending}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Completar
                        </Button>
                        <OrderDetailModal order={order} />
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="completed" className="p-4 space-y-3">
                {filteredCompletedOrders.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No se encontraron órdenes completadas</p>
                  </div>
                ) : (
                  filteredCompletedOrders.slice(0, 10).map((order) => (
                    <div key={order.id} className="bg-white dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600 shadow-sm">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white">#{order.orderNumber}</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{getOrderProductName(order)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200 text-xs rounded-full">
                            ✅ Completado
                          </span>
                        </div>
                      </div>
                      
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">Cliente:</span>
                          <span>{order.customer.name}</span>
                        </div>
                        {order.customer.phone && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="w-4 h-4 text-gray-500" />
                            <span>{order.customer.phone}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span>Completado: {new Date(order.updatedAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-medium">Total:</span>
                          <span className="font-bold text-green-600">${getOrderTotal(order).toFixed(2)}</span>
                        </div>
                      </div>
                      
                      <OrderDetailModal order={order} />
                    </div>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Acciones adicionales */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="bg-white dark:bg-gray-800 shadow-sm border-0 rounded-lg">
            <CardContent className="p-4">
              <Button 
                variant="outline" 
                className="w-full justify-start"
                size="lg"
              >
                <MapPin className="w-5 h-5 mr-3" />
                Ver mapa de ubicaciones asignadas
              </Button>
            </CardContent>
          </Card>
          
          <Card className="bg-white dark:bg-gray-800 shadow-sm border-0 rounded-lg">
            <CardContent className="p-4">
              <Button 
                variant="outline" 
                className="w-full justify-start"
                size="lg"
              >
                <Package className="w-5 h-5 mr-3" />
                Nuevo Reporte
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}