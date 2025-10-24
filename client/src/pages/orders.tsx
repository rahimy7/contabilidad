import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Search, Edit, Trash2, Eye, UserCheck, Clock, CheckCircle, XCircle, Package, MapPin, Phone, User as UserIcon, User, Download, Printer, ShoppingCart } from "lucide-react";
import AssignmentModal from "@/components/orders/assignment-modal";
import OrderDetailModal from "@/components/orders/order-detail-modal";
import EditOrderModal from "@/components/orders/edit-order-modal";


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
  const [isProductsModalOpen, setIsProductsModalOpen] = useState(false);

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

  // Effect to handle URL parameters from dashboard
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
}
 else if (assignId) {
        const order = orders.find(o => o.id === parseInt(assignId));
        if (order) {
          setSelectedOrder(order);
          setIsAssignDialogOpen(true);
          setLocation('/orders');
        }
      }
    }
  }, [orders, search, setLocation]);

  // Update order mutation
  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<OrderWithDetails>) => {
      return apiRequest("PUT", `/api/orders/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setIsEditDialogOpen(false);
      setSelectedOrder(null);
      toast({
        title: "Orden actualizada",
        description: "Los cambios se han guardado correctamente.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo actualizar la orden.",
        variant: "destructive",
      });
      console.error("Error updating order:", error);
    },
  });

  const assignOrderMutation = useMutation({
    mutationFn: async ({ orderId, userId }: { orderId: number; userId: number | null }) => {
      return apiRequest("PUT", `/api/orders/${orderId}`, { 
        assignedUserId: userId
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setIsAssignDialogOpen(false);
      setSelectedOrder(null);
      toast({
        title: "Orden asignada",
        description: "La orden ha sido asignada exitosamente.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo asignar la orden.",
        variant: "destructive",
      });
      console.error("Error assigning order:", error);
    },
  });

  const handleAssignOrder = (userId: number | null) => {
    if (selectedOrder) {
      assignOrderMutation.mutate({ 
        orderId: selectedOrder.id, 
        userId 
      });
    }
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

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: any; color: string }> = {
      pending: { 
        label: 'Pendiente', 
        variant: 'default',
        color: 'bg-yellow-100 text-yellow-800 border-yellow-200'
      },
      confirmed: { 
        label: 'Confirmado', 
        variant: 'default',
        color: 'bg-blue-100 text-blue-800 border-blue-200'
      },
      assigned: { 
        label: 'Asignado', 
        variant: 'default',
        color: 'bg-purple-100 text-purple-800 border-purple-200'
      },
      preparing: { 
        label: 'Preparando', 
        variant: 'default',
        color: 'bg-orange-100 text-orange-800 border-orange-200'
      },
      ready: { 
        label: 'Listo', 
        variant: 'default',
        color: 'bg-indigo-100 text-indigo-800 border-indigo-200'
      },
      in_transit: { 
        label: 'En Tránsito', 
        variant: 'default',
        color: 'bg-cyan-100 text-cyan-800 border-cyan-200'
      },
      delivered: { 
        label: 'Entregado', 
        variant: 'default',
        color: 'bg-green-100 text-green-800 border-green-200'
      },
      completed: { 
        label: 'Completado', 
        variant: 'default',
        color: 'bg-green-100 text-green-800 border-green-200'
      },
      cancelled: { 
        label: 'Cancelado', 
        variant: 'destructive',
        color: 'bg-red-100 text-red-800 border-red-200'
      },
      returned: { 
        label: 'Devuelto', 
        variant: 'secondary',
        color: 'bg-gray-100 text-gray-800 border-gray-200'
      }
    };
    
    const config = statusConfig[status] || statusConfig.pending;
    return (
      <Badge variant={config.variant} className={config.color}>
        {config.label}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const priorityConfig: Record<string, { label: string; color: string }> = {
      low: { label: 'Baja', color: 'bg-gray-100 text-gray-600' },
      normal: { label: 'Normal', color: 'bg-blue-100 text-blue-600' },
      high: { label: 'Alta', color: 'bg-orange-100 text-orange-600' },
      urgent: { label: 'Urgente', color: 'bg-red-100 text-red-600' }
    };
    
    const config = priorityConfig[priority] || priorityConfig.normal;
    return (
      <Badge variant="outline" className={config.color}>
        {config.label}
      </Badge>
    );
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch = 
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer?.phone.includes(searchTerm) ||
      (order.deliveryAddress && order.deliveryAddress.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const orderStats = {
    total: orders.length,
    pending: orders.filter(order => order.status === 'pending').length,
    confirmed: orders.filter(order => order.status === 'confirmed').length,
    assigned: orders.filter(order => order.status === 'assigned').length,
    in_progress: orders.filter(order => order.status === 'in_progress').length,
    completed: orders.filter(order => order.status === 'completed').length,
    cancelled: orders.filter(order => order.status === 'cancelled').length,
    unassigned: orders.filter(order => !order.assignedUserId).length,
    highPriority: orders.filter(order => ['high', 'urgent'].includes(order.priority)).length,
    recentOrders: orders.filter(order => {
      const orderDate = new Date(order.createdAt);
      const now = new Date();
      const daysDiff = (now.getTime() - orderDate.getTime()) / (1000 * 3600 * 24);
      return daysDiff <= 1;
    }).length
  };

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(num)) return '$0.00';
    return new Intl.NumberFormat('es-MX', { 
      style: 'currency', 
      currency: 'MXN' 
    }).format(num);
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Ahora';
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h`;
    if (diffInMinutes < 10080) return `${Math.floor(diffInMinutes / 1440)}d`;
    
    return date.toLocaleDateString('es-MX');
  };

  const getPriorityColor = (priority: string) => {
    const colors = {
      low: 'text-gray-500',
      normal: 'text-blue-500',
      high: 'text-orange-500',
      urgent: 'text-red-500'
    };
    return colors[priority as keyof typeof colors] || colors.normal;
  };

  // Function to generate Google Maps link from address or coordinates
  const generateGoogleMapsLink = (address: string, latitude?: string, longitude?: string): string => {
    if (latitude && longitude) {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      const query = address ? encodeURIComponent(address) : `${lat},${lng}`;
      return `https://www.google.com/maps/@${lat},${lng},15z?q=${query}`;
    } else if (address) {
      return `https://www.google.com/maps/search/${encodeURIComponent(address)}`;
    }
    return '';
  };

  const handleViewOrder = (order: OrderWithDetails) => {
    setSelectedOrder(order);
    setIsViewDialogOpen(true);
  };

const handleUpdateOrder = (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  if (!selectedOrder) return;

  const formData = new FormData(e.currentTarget);

  const updates: Partial<OrderWithDetails> = {
    status: formData.get("status") as string,
    priority: formData.get("priority") as string,
    notes: formData.get("notes") as string,
    description: formData.get("description") as string,
    deliveryAddress: formData.get("deliveryAddress") as string,
    contactNumber: formData.get("contactNumber") as string,
    paymentMethod: formData.get("paymentMethod") as string,
    paymentStatus: formData.get("paymentStatus") as string,
  };

  // ✅ Lógica sólida para assignedUserId: detectar cambio real
  const formAssignedUserId = formData.get("assignedUserId") as string;

  let assignedUserId: number | null | undefined = undefined;
  if (formAssignedUserId === "unassigned") {
    assignedUserId = null;
  } else if (formAssignedUserId) {
    assignedUserId = parseInt(formAssignedUserId);
  }

  if (
    (assignedUserId === null && selectedOrder.assignedUserId !== null) ||
    (assignedUserId !== null && assignedUserId !== selectedOrder.assignedUserId)
  ) {
    updates.assignedUserId = assignedUserId;
  }

  // ✅ Filtrado de campos vacíos o no modificados
  const filteredUpdates = Object.fromEntries(
    Object.entries(updates).filter(([_, value]) =>
      value !== null && value !== "" && value !== "none"
    )
  );

  updateOrderMutation.mutate({
    id: selectedOrder.id,
    ...filteredUpdates,
  });
};



  const handleEditOrder = (order: OrderWithDetails) => {
    setSelectedOrder(order);
    setIsEditDialogOpen(true);
  };

  const handleQuickAssign = (order: OrderWithDetails) => {
    setSelectedOrder(order);
    setIsAssignDialogOpen(true);
  };

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

  const handleAutoAssign = (orderId: number) => {
    autoAssignMutation.mutate(orderId);
  };

  // Función para generar e imprimir la orden
  const generateOrderPrint = (order: OrderWithDetails) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Debug: verificar que los items existen
    console.log('Order items for print:', order.items);

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Orden ${order.orderNumber}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .order-info { display: flex; justify-content: space-between; margin-bottom: 20px; }
          .section { margin-bottom: 20px; }
          .section h3 { background: #f5f5f5; padding: 8px; margin: 0 0 10px 0; }
          .items-table { width: 100%; border-collapse: collapse; }
          .items-table th, .items-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          .items-table th { background: #f5f5f5; }
          .total { text-align: right; font-size: 18px; font-weight: bold; margin-top: 10px; }
          .status { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
          .status-pending { background: #fff3cd; color: #856404; }
          .status-confirmed { background: #d1ecf1; color: #0c5460; }
          .status-completed { background: #d4edda; color: #155724; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>ORDEN DE TRABAJO</h1>
          <h2>Orden #${order.orderNumber}</h2>
        </div>
        
        <div class="order-info">
          <div>
            <strong>Fecha:</strong> ${new Date(order.createdAt).toLocaleDateString('es-MX')}<br>
            <strong>Estado:</strong> <span class="status status-${order.status}">${order.status}</span><br>
            <strong>Prioridad:</strong> ${order.priority || 'Normal'}
          </div>
          <div>
            <strong>Total:</strong> ${formatCurrency(order.totalAmount)}<br>
            <strong>Asignado a:</strong> ${assignedUser(order)}
          </div>
        </div>

        <div class="section">
          <h3>INFORMACIÓN DEL CLIENTE</h3>
          <strong>Nombre:</strong> ${order.customer?.name || 'N/A'}<br>
          <strong>Teléfono:</strong> ${order.customer?.phone || 'N/A'}<br>
          <strong>Dirección:</strong> ${order.customer?.address || order.deliveryAddress || 'N/A'}
        </div>

        <div class="section">
          <h3>PRODUCTOS Y SERVICIOS</h3>
          <table class="items-table">
            <thead>
              <tr>
                <th>Producto/Servicio</th>
                <th>Categoría</th>
                <th>Cantidad</th>
                <th>Precio Unitario</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${order.items && order.items.length > 0 ? order.items.map(item => `
                <tr>
                  <td>${item.product?.name || 'Producto sin nombre'}</td>
                  <td>${item.product?.category === 'product' ? 'Producto' : 'Servicio'}</td>
                  <td>${item.quantity || 0}</td>
                  <td>${formatCurrency(item.unitPrice || '0')}</td>
                  <td>${formatCurrency(item.totalPrice || '0')}</td>
                </tr>
              `).join('') : '<tr><td colspan="5" style="text-align: center;">No hay productos en esta orden</td></tr>'}
            </tbody>
          </table>
          <div class="total">TOTAL: ${formatCurrency(order.totalAmount)}</div>
        </div>

        ${order.description ? `
        <div class="section">
          <h3>DESCRIPCIÓN</h3>
          <p>${order.description}</p>
        </div>
        ` : ''}

        ${order.notes ? `
        <div class="section">
          <h3>NOTAS INTERNAS</h3>
          <p>${order.notes}</p>
        </div>
        ` : ''}

        <div class="section" style="margin-top: 40px; text-align: center; font-size: 12px; color: #666;">
          <p>Documento generado el ${new Date().toLocaleString('es-MX')}</p>
        </div>

        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() {
              window.close();
            };
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  // Función para descargar como PDF (usando print to PDF del navegador)
  const handleDownloadOrder = (order: OrderWithDetails) => {
    generateOrderPrint(order);
  };



const assignedUser = (order: OrderWithDetails) => {
  if (!order.assignedUserId) return "Sin asignar";
  
  // ✅ Usar la información del usuario que YA viene en la orden
  if (order.assignedUser && order.assignedUser.name) {
    return order.assignedUser.name;
  }
  
  // ✅ Fallback: buscar en users[] si no viene en la orden
  const user = users.find(u => u.id === order.assignedUserId);
  if (user) {
    return user.name;
  }
  
  // ✅ Último recurso: mostrar ID en lugar de "no encontrado"
  console.warn(`⚠️ Usuario ${order.assignedUserId} no encontrado para orden ${order.id}`);
  return `Usuario ${order.assignedUserId} (no disponible)`;
};

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestión de Órdenes</h1>
          <p className="text-muted-foreground">
            Administra todas las órdenes y pedidos del sistema
          </p>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
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
                <p className="text-sm font-medium text-purple-600">Confirmados</p>
                <p className="text-2xl font-bold text-purple-800">{orderStats.confirmed}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-orange-50 to-orange-100 border-orange-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-600">Asignados</p>
                <p className="text-2xl font-bold text-orange-800">{orderStats.assigned}</p>
              </div>
              <UserCheck className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-indigo-50 to-indigo-100 border-indigo-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-indigo-600">En Progreso</p>
                <p className="text-2xl font-bold text-indigo-800">{orderStats.in_progress}</p>
              </div>
              <Clock className="h-8 w-8 text-indigo-600" />
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
            <Card key={order.id} className="hover:shadow-md transition-shadow">
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
                    
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewOrder(order);
                        }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
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
                          deleteOrderMutation.mutate(order.id);
                        }}
                        disabled={deleteOrderMutation.isPending}
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

   <EditOrderModal 
  order={selectedOrder}
  isOpen={isEditDialogOpen}
  onClose={() => setIsEditDialogOpen(false)}
  onSubmit={handleUpdateOrder}
  users={users}
  isPending={updateOrderMutation.isPending}
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