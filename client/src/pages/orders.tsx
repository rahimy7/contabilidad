// client/src/pages/orders.tsx
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Search, Edit, Trash2, Eye, UserCheck, Clock, CheckCircle, XCircle, Package, MapPin, Phone, Download, Printer, ShoppingCart } from "lucide-react";
import AssignmentModal from "@/components/orders/assignment-modal";
import OrderDetailModal from "@/components/orders/order-detail-modal";
import EditOrderModal from "@/components/orders/edit-order-modal";
import { useDebouncedOrderUpdate } from "@/hooks/use-debounced-order-update";
import { Truck } from 'lucide-react';

type OrderWithDetails = {
  id: number;
  orderNumber: string;
  customerId: number;
  assignedUserId: number | null;
  status: string;
  priority: string;
  totalAmount: string;
  deliveryCost: string;
  deliveryAddress?: string | null;
  contactNumber?: string | null;
  estimatedDelivery?: string | null;
  estimatedDeliveryTime?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string;
  notes: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  lastStatusUpdate?: string | null;
  customerLastInteraction?: string | null;
  modificationCount?: number;
  storeId: number;
  
  // ✅ AGREGAR ESTOS DOS CAMPOS:
  tripId?: number | null;
  tripNumber?: string | null;
  
  customer: {
    longitude: any;
    latitude: any;
    id: number;
    name: string;
    phone: string;
    email?: string | null;
    address: string | null;
  };
  
  assignedUser?: {
    id: number;
    name: string;
    role: string;
  } | null;
  
  items: Array<{
    id: number;
    orderId: number;
    productId: number;
    quantity: number;
    unitPrice: string;
    totalPrice: string;
    installationCost?: string;
    partsCost?: string;
    laborHours?: string;
    laborRate?: string;
    deliveryCost?: string;
    deliveryDistance?: string;
    notes: string | null;
    product: {
      id: number;
      name: string;
      description?: string;
      price: string;
      category?: string;
      status?: string;
    };
  }>;
  
  totalItems?: number;
};

export default function OrdersPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);

  // ✅ Usar hook con debounce
  const { debouncedUpdate, immediateUpdate, isPending } = useDebouncedOrderUpdate();

  // Fetch orders
  const { data: orders = [], isLoading } = useQuery<OrderWithDetails[]>({
    queryKey: ["/api/orders"],
    staleTime: 30_000,
  });

  // Fetch users for assignment
  const { data: users = [], isLoading: usersLoading } = useQuery<Array<{id: number, name: string, role: string, status: string}>>({
    queryKey: ["/api/assignment-rules/available-users"],
    queryFn: () => apiRequest("GET", "/api/assignment-rules/available-users"),
    staleTime: 30_000,
  });

  // Effect to handle URL parameters
  useEffect(() => {
    const params = new URLSearchParams(search);
    const viewId = params.get('view');
    const editId = params.get('edit');
    const assignId = params.get('assign');

    if (orders.length > 0) {
      if (viewId) {
        const order = orders.find(o => o.id === parseInt(viewId));
        if (order) {
          setSelectedOrder(order);
          setIsViewDialogOpen(true);
          setLocation('/orders');
        }
      } else if (editId && !usersLoading) {
        const order = orders.find(o => o.id === parseInt(editId));
        if (order) {
          setSelectedOrder(order);
          setIsEditDialogOpen(true);
          setLocation('/orders');
        }
      } else if (assignId) {
        const order = orders.find(o => o.id === parseInt(assignId));
        if (order) {
          setSelectedOrder(order);
          setIsAssignDialogOpen(true);
          setLocation('/orders');
        }
      }
    }
  }, [orders, search, setLocation, usersLoading]);

  // ✅ Handler para actualizar orden con debounce
  const handleUpdateOrder = (updates: Partial<OrderWithDetails> & { id: number }) => {
    // Usar debounce para cambios normales
    debouncedUpdate(updates);
    
    // Cerrar modal después de programar la actualización
    setIsEditDialogOpen(false);
    setSelectedOrder(null);
  };

  const handleCloseAssignModal = (assigned: boolean = false) => {
    setIsAssignDialogOpen(false);
    setSelectedOrder(null);
    
    if (assigned) {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    }
  };

  // Delete order mutation
 const deleteOrderMutation = useMutation({
  mutationFn: async (id: number) => {
    return apiRequest("DELETE", `/api/orders/${id}`);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    toast({
      title: "Orden eliminada",
      description: "La orden se ha eliminado correctamente.",
    });
  },
  onError: (error) => {
    toast({
      title: "Error",
      description: "No se pudo eliminar la orden.",
      variant: "destructive",
    });
    console.error("Error deleting order:", error);
  },
});

const handleDeleteOrder = (order: OrderWithDetails) => {
  if (window.confirm(`¿Estás seguro de eliminar la orden ${order.orderNumber}? Esta acción no se puede deshacer.`)) {
    deleteOrderMutation.mutate(order.id);
  }
};

// Agregar después de handleDeleteOrder:
const handleAssignToTrip = (order: OrderWithDetails) => {
  // ✅ PERMITIR órdenes pending SIN usuario para viajes compartidos
  if (order.status === 'pending' && order.assignedUserId) {
    toast({
      title: "Advertencia",
      description: "Las órdenes con usuario asignado deben confirmarse primero",
      variant: "destructive",
    });
    return;
  }
  
  if (order.tripId) {
    toast({
      title: "Información",
      description: `Esta orden ya está en el viaje ${order.tripNumber || order.tripId}`,
    });
    return;
  }
  
  // Mostrar mensaje apropiado
  if (order.status === 'pending') {
    toast({
      title: "Asignando a viaje compartido",
      description: "La orden se confirmará y agregará al viaje",
    });
  }
  
  assignToTripMutation.mutate(order.id);
};
  // Auto-assign mutation
  const autoAssignMutation = useMutation({
    mutationFn: (orderId: number) => apiRequest("POST", `/api/orders/${orderId}/auto-assign`),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Asignación automática exitosa",
        description: data.message || "La orden ha sido asignada automáticamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error en asignación automática",
        description: error.message || "No se pudo asignar la orden automáticamente.",
        variant: "destructive",
      });
    },
  });

  // Agregar después de las otras mutations (deleteOrderMutation, etc.)
interface AssignToTripResponse {
  success: boolean;
  message: string;
  tripId: number;
  tripNumber: string;
  orderStatus: string;
  trip: any;
}

const assignToTripMutation = useMutation<AssignToTripResponse, Error, number>({
  mutationFn: async (orderId: number) => {
    return apiRequest("POST", "/api/trips/assign-order", { orderId });
  },
  onSuccess: (data) => {
    queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    toast({
      title: "Orden asignada",
      description: `Orden asignada al viaje ${data.tripNumber}`,
    });
  },
  onError: (error) => {
    toast({
      title: "Error",
      description: error.message || "No se pudo asignar la orden al viaje",
      variant: "destructive",
    });
  },
});

  const filteredOrders = orders.filter((order) => {
    const matchesSearch = !searchTerm || 
      order.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer?.phone?.includes(searchTerm);
    
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const orderStats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    inProgress: orders.filter(o => o.status === 'in_progress').length,
    completed: orders.filter(o => o.status === 'completed').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      pending: { label: "Pendiente", className: "bg-yellow-100 text-yellow-800" },
      confirmed: { label: "Confirmado", className: "bg-blue-100 text-blue-800" },
      in_progress: { label: "En Progreso", className: "bg-purple-100 text-purple-800" },
      completed: { label: "Completado", className: "bg-green-100 text-green-800" },
      cancelled: { label: "Cancelado", className: "bg-red-100 text-red-800" },
      assigned: { label: "Asignado", className: "bg-indigo-100 text-indigo-800" },
    };

    const config = statusConfig[status] || { label: status, className: "bg-gray-100 text-gray-800" };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('es-DO', { 
      style: 'currency', 
      currency: 'DOP' 
    }).format(num);
  };

  const assignedUser = (order: OrderWithDetails) => {
    if (!order.assignedUserId) {
      return "Sin asignar";
    }
    return order.assignedUser?.name || `Usuario #${order.assignedUserId}`;
  };

  const handleViewOrder = (order: OrderWithDetails) => {
    setSelectedOrder(order);
    setIsViewDialogOpen(true);
  };

  const handleEditOrder = (order: OrderWithDetails) => {
    setSelectedOrder(order);
    setIsEditDialogOpen(true);
  };

  const handleQuickAssign = (order: OrderWithDetails) => {
    setSelectedOrder(order);
    setIsAssignDialogOpen(true);
  };

  const generateOrderPrint = (order: OrderWithDetails) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Orden ${order.orderNumber}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #333; }
          .section { margin: 20px 0; }
          .label { font-weight: bold; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          @media print { button { display: none; } }
        </style>
      </head>
      <body>
        <h1>Orden ${order.orderNumber}</h1>
        <div class="section">
          <p><span class="label">Cliente:</span> ${order.customer?.name}</p>
          <p><span class="label">Teléfono:</span> ${order.customer?.phone}</p>
          <p><span class="label">Dirección:</span> ${order.customer?.address || 'N/A'}</p>
        </div>
        <div class="section">
          <p><span class="label">Estado:</span> ${order.status}</p>
          <p><span class="label">Total:</span> ${formatCurrency(order.totalAmount)}</p>
          <p><span class="label">Técnico:</span> ${assignedUser(order)}</p>
        </div>
        <div class="section">
          <h3>Productos</h3>
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Precio</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${order.items?.map(item => `
                <tr>
                  <td>${item.product?.name || 'Producto'}</td>
                  <td>${item.quantity}</td>
                  <td>${formatCurrency(item.unitPrice)}</td>
                  <td>${formatCurrency(item.totalPrice)}</td>
                </tr>
              `).join('') || '<tr><td colspan="4">No hay productos</td></tr>'}
            </tbody>
          </table>
        </div>
        <button onclick="window.print()">Imprimir</button>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  const handleDownloadOrder = (order: OrderWithDetails) => {
    const orderData = {
      orderNumber: order.orderNumber,
      customer: order.customer,
      status: order.status,
      totalAmount: order.totalAmount,
      assignedUser: order.assignedUser,
      items: order.items,
      createdAt: order.createdAt,
    };

    const blob = new Blob([JSON.stringify(orderData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orden-${order.orderNumber}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4 animate-pulse" />
          <p className="text-muted-foreground">Cargando órdenes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Órdenes</h1>
          <p className="text-muted-foreground">
            Gestiona y monitorea todas las órdenes del sistema
          </p>
        </div>
        <Button onClick={() => setLocation('/orders/new')}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva Orden
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">Total</p>
                <p className="text-2xl font-bold text-blue-800">{orderStats.total}</p>
              </div>
              <Package className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-yellow-50 to-yellow-100 border-yellow-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-yellow-600">Pendientes</p>
                <p className="text-2xl font-bold text-yellow-800">{orderStats.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600">En Progreso</p>
                <p className="text-2xl font-bold text-purple-800">{orderStats.inProgress}</p>
              </div>
              <UserCheck className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-green-50 to-green-100 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">Completados</p>
                <p className="text-2xl font-bold text-green-800">{orderStats.completed}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-red-50 to-red-100 border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-600">Cancelados</p>
                <p className="text-2xl font-bold text-red-800">{orderStats.cancelled}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros de Búsqueda</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por número de orden, cliente o teléfono..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="confirmed">Confirmado</SelectItem>
                <SelectItem value="in_progress">En Progreso</SelectItem>
                <SelectItem value="completed">Completado</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Orders List */}
      <div className="grid gap-4">
        {filteredOrders.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Package className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No se encontraron órdenes</h3>
              <p className="text-muted-foreground text-center">
                {searchTerm || statusFilter !== "all"
                  ? "Intenta ajustar los filtros de búsqueda"
                  : "Aún no hay órdenes en el sistema"}
              </p>
            </CardContent>
          </Card>
        ) : (
      filteredOrders.map((order) => (
  <Card 
    key={order.id} 
    className="hover:shadow-md transition-shadow cursor-pointer"
    onClick={() => handleViewOrder(order)} // ← NUEVO: Click abre detalle
  >
    <CardContent className="p-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">{order.orderNumber}</h3>
            {getStatusBadge(order.status)}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4" />
              <span>{order.customer?.name || "Cliente no especificado"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span>📞</span>
              <span>{order.customer?.phone || "Teléfono no disponible"}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              <span>{order.customer?.address || order.description || "Dirección no especificada"}</span>
            </div>
            <div className="flex items-center gap-2">
              <span>👷</span>
              <span>{assignedUser(order)}</span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="text-right">
            <div className="text-lg font-bold text-green-600">
              {formatCurrency(order.totalAmount)}
            </div>
            <div className="text-xs text-muted-foreground">
              {new Date(order.createdAt || '').toLocaleDateString('es-MX')}
            </div>
          </div>
          
          {/* ✅ Todos los botones ya tienen stopPropagation */}
          <div className="flex gap-2">
          {!order.tripId && (order.status !== 'pending' || !order.assignedUserId) && (
  <Button
    variant="outline"
    size="sm"
    onClick={(e) => {
      e.stopPropagation();
      handleAssignToTrip(order);
    }}
    disabled={assignToTripMutation.isPending}
    className="text-green-600 hover:text-green-700"
    title={
      order.status === 'pending' && !order.assignedUserId
        ? "Asignar a viaje compartido"
        : "Asignar a viaje"
    }
  >
    <Truck className="w-4 h-4" />
  </Button>
)}

{order.tripId && (
  <Button
    variant="outline"
    size="sm"
    disabled
    className="text-gray-400"
    title={`Ya asignada a viaje ${order.tripNumber || order.tripId}`}
  >
    <Truck className="w-4 h-4" />
  </Button>
)}
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleEditOrder(order);
              }}
            >
              <Edit className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleQuickAssign(order);
              }}
              className="text-blue-600 hover:text-blue-700"
            >
              <UserCheck className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                generateOrderPrint(order);
              }}
              className="text-green-600 hover:text-green-700"
            >
              <Printer className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleDownloadOrder(order);
              }}
              className="text-purple-600 hover:text-purple-700"
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteOrder(order); // ← CAMBIO: Usa la nueva función
              }}
              disabled={deleteOrderMutation.isPending}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
))
        )}
      </div>

      {/* Edit Order Modal */}
      <EditOrderModal 
        order={selectedOrder}
        isOpen={isEditDialogOpen}
        onClose={() => {
          setIsEditDialogOpen(false);
          setSelectedOrder(null);
        }}
        onSubmit={handleUpdateOrder}
        users={users}
        isPending={isPending}
      />

      {/* View Order Modal */}
      <OrderDetailModal 
        order={selectedOrder as any}
        isOpen={isViewDialogOpen}
        onClose={() => setIsViewDialogOpen(false)}
      />

      {/* Assignment Modal */}
      <AssignmentModal 
        order={selectedOrder}
        isOpen={isAssignDialogOpen}
        onClose={handleCloseAssignModal}
      />
    </div>
  );
}