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
  });

  // Fetch users for assignment
const { data: users = [], isLoading: usersLoading } = useQuery<User[], Error>({
  queryKey: ["/api/employees/users"],
  queryFn: async () => {
    const employees = await apiRequest<any[]>("GET", "/api/employees");
    return employees
      .filter(emp => emp.user && emp.user.status === 'active')
      .filter(emp => ['technician', 'specialist', 'field_worker', 'admin', 'store_admin'].includes(emp.user.role))
      .map(emp => emp.user);
  },
  staleTime: 30_000,
  initialData: [],
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

  // Función para abrir modal de productos
  const handleViewProducts = (order: OrderWithDetails) => {
    setSelectedOrder(order);
    setIsProductsModalOpen(true);
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
                          handleViewProducts(order);
                        }}
                        className="text-orange-600 hover:text-orange-700"
                      >
                        <ShoppingCart className="w-4 h-4" />
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

      {/* Edit Order Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <form key={selectedOrder?.id} onSubmit={handleUpdateOrder}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="w-5 h-5" />
                Editar Orden #{selectedOrder?.orderNumber}
              </DialogTitle>
              <DialogDescription>
                Modifica los detalles de la orden. Los campos marcados con * son obligatorios.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-6 py-6">
              {/* Información básica */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status">Estado *</Label>
                  <Select name="status" defaultValue={selectedOrder?.status || "pending"}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendiente</SelectItem>
                      <SelectItem value="confirmed">Confirmado</SelectItem>
                      <SelectItem value="assigned">Asignado</SelectItem>
                      <SelectItem value="preparing">Preparando</SelectItem>
                      <SelectItem value="ready">Listo</SelectItem>
                      <SelectItem value="in_transit">En Tránsito</SelectItem>
                      <SelectItem value="delivered">Entregado</SelectItem>
                      <SelectItem value="completed">Completado</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                      <SelectItem value="returned">Devuelto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">Prioridad *</Label>
                  <Select name="priority" defaultValue={selectedOrder?.priority || 'normal'}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar prioridad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Baja</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">Alta</SelectItem>
                      <SelectItem value="urgent">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

               <div className="space-y-2">
  <Label htmlFor="assignedUserId">Asignar a</Label>
  <Select
    name="assignedUserId"
    defaultValue={
      selectedOrder?.assignedUserId !== null && selectedOrder?.assignedUserId !== undefined
        ? selectedOrder.assignedUserId.toString()
        : "unassigned"
    }
  >
    <SelectTrigger>
      <SelectValue placeholder="Seleccionar usuario" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="unassigned">Sin asignar</SelectItem>
      {users.map((user) => (
        <SelectItem key={user.id} value={user.id.toString()}>
          {user.name} ({user.role})
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>

              </div>

              {/* ✅ INFORMACIÓN DE ASIGNACIÓN ACTUAL */}
              {selectedOrder?.assignedUser && (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm font-medium text-blue-800 mb-1">
                    Actualmente asignado a:
                  </p>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-blue-700">
                      {selectedOrder.assignedUser.name}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {selectedOrder.assignedUser.role}
                    </Badge>
                  </div>
                </div>
              )}

              {/* ✅ DEBUG INFO (OPCIONAL) */}
              {process.env.NODE_ENV === 'development' && selectedOrder && (
                <div className="p-3 bg-gray-50 rounded text-xs text-gray-600">
                  <strong>Debug:</strong> 
                  assignedUserId: {selectedOrder.assignedUserId || 'null'} | 
                  assignedUser: {selectedOrder.assignedUser?.name || 'null'}
                </div>
              )}

              {/* Información de contacto y entrega */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactNumber">Número de Contacto</Label>
                  <Input
                    name="contactNumber"
                    type="tel"
                    placeholder="Ej: +1234567890"
                    defaultValue={selectedOrder?.contactNumber || selectedOrder?.customer?.phone || ''}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="deliveryAddress">Dirección de Entrega</Label>
                  <Input
                    name="deliveryAddress"
                    placeholder="Dirección completa"
                    defaultValue={selectedOrder?.deliveryAddress || selectedOrder?.customer?.address || ''}
                  />
                </div>
              </div>

              {/* Información de pago */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paymentMethod">Método de Pago</Label>
                  <Select name="paymentMethod" defaultValue={selectedOrder?.paymentMethod || 'none'}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar método" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin especificar</SelectItem>
                      <SelectItem value="cash">Efectivo</SelectItem>
                      <SelectItem value="card">Tarjeta de Crédito/Débito</SelectItem>
                      <SelectItem value="transfer">Transferencia Bancaria</SelectItem>
                      <SelectItem value="check">Cheque</SelectItem>
                      <SelectItem value="financing">Financiamiento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paymentStatus">Estado del Pago</Label>
                  <Select name="paymentStatus" defaultValue={selectedOrder?.paymentStatus || 'pending'}>
                    <SelectTrigger>
                      <SelectValue placeholder="Estado del pago" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendiente</SelectItem>
                      <SelectItem value="processing">Procesando</SelectItem>
                      <SelectItem value="completed">Completado</SelectItem>
                      <SelectItem value="failed">Fallido</SelectItem>
                      <SelectItem value="refunded">Reembolsado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Descripción y notas */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="description">Descripción</Label>
                  <Textarea
                    name="description"
                    placeholder="Descripción general de la orden..."
                    rows={3}
                    defaultValue={selectedOrder?.description || ''}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notas Internas</Label>
                  <Textarea
                    name="notes"
                    placeholder="Notas internas para el equipo..."
                    rows={3}
                    defaultValue={selectedOrder?.notes || ''}
                  />
                </div>
              </div>

              {/* Información del cliente (solo lectura) */}
              {selectedOrder?.customer && (
                <Card className="bg-gray-50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Información del Cliente</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2">
                      <UserIcon className="w-4 h-4 text-gray-500" />
                      <span className="font-medium">{selectedOrder.customer.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-gray-500" />
                      <span>{selectedOrder.customer.phone}</span>
                    </div>
                    {selectedOrder.customer.address && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-gray-500" />
                        <span className="text-sm">{selectedOrder.customer.address}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Información de items (solo lectura) */}
              {selectedOrder?.items && selectedOrder.items.length > 0 && (
                <Card className="bg-gray-50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Items de la Orden ({selectedOrder.items.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {selectedOrder.items.slice(0, 3).map((item, index) => (
                        <div key={item.id} className="flex items-center justify-between p-2 bg-white rounded border">
                          <div>
                            <p className="font-medium text-sm">{item.product.name}</p>
                            <p className="text-xs text-gray-500">
                              Cantidad: {item.quantity} | Precio: {formatCurrency(item.unitPrice)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-green-600">
                              {formatCurrency(item.totalPrice)}
                            </p>
                          </div>
                        </div>
                      ))}
                      {selectedOrder.items.length > 3 && (
                        <p className="text-sm text-gray-500 text-center">
                          ... y {selectedOrder.items.length - 3} items más
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
            
            <DialogFooter className="gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsEditDialogOpen(false)}
                disabled={updateOrderMutation.isPending}
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={updateOrderMutation.isPending}
              >
                {updateOrderMutation.isPending ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Order Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Detalles de la Orden {selectedOrder?.orderNumber}
            </DialogTitle>
            <DialogDescription>
              Información completa de la orden incluyendo productos, servicios y costos
            </DialogDescription>
          </DialogHeader>
          
          {selectedOrder && (
            <div className="grid gap-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Cliente</Label>
                  <p className="text-sm">{selectedOrder.customer?.name || "No especificado"}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Teléfono</Label>
                  <p className="text-sm">{selectedOrder.customer?.phone || "No disponible"}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Estado</Label>
                  <div className="mt-1">{getStatusBadge(selectedOrder.status)}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Total</Label>
                  <p className="text-sm font-bold text-green-600">{formatCurrency(selectedOrder.totalAmount)}</p>
                </div>
                <div className="col-span-2">
                  <Label className="text-sm font-medium text-muted-foreground">Dirección de Entrega</Label>
                  {(() => {
                    const address = selectedOrder.customer?.address || selectedOrder.description || "No especificada";
                    const latitude = selectedOrder.customer?.latitude;
                    const longitude = selectedOrder.customer?.longitude;
                    const mapLink = generateGoogleMapsLink(address, latitude, longitude);
                    
                    if (mapLink && address !== "No especificada") {
                      return (
                        <div className="flex items-center gap-2">
                          <a 
                            href={mapLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                          >
                            <MapPin className="h-4 w-4" />
                            {address}
                          </a>
                        </div>
                      );
                    } else {
                      return <p className="text-sm">{address}</p>;
                    }
                  })()}
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Asignado a</Label>
                  <p className="text-sm">{assignedUser(selectedOrder)}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Fecha de Creación</Label>
                  <p className="text-sm">{new Date(selectedOrder.createdAt || '').toLocaleString('es-MX')}</p>
                </div>
                {selectedOrder.notes && (
                  <div className="col-span-2">
                    <Label className="text-sm font-medium text-muted-foreground">Notas</Label>
                    <p className="text-sm bg-gray-50 p-3 rounded-md mt-1">{selectedOrder.notes}</p>
                  </div>
                )}
              </div>
              
              {/* Products/Services Section */}
              {selectedOrder.items && selectedOrder.items.length > 0 && (
                <div className="mt-6">
                  <Label className="text-sm font-medium text-muted-foreground">Productos/Servicios</Label>
                  <div className="mt-3 space-y-3">
                    {selectedOrder.items.map((item, index) => (
                      <div key={index} className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-blue-500" />
                            <span className="font-medium">{item.product.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {item.product.category === 'product' ? 'Producto' : 'Servicio'}
                            </Badge>
                          </div>
                          <div className="text-sm font-medium text-green-600">
                            {formatCurrency(item.totalPrice)}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                          <div>Cantidad: {item.quantity}</div>
                          <div>Precio unitario: {formatCurrency(item.unitPrice)}</div>
                          {item.deliveryCost !== "0.00" && (
                            <>
                              <div>Costo de entrega: {formatCurrency(item.deliveryCost || "0")}</div>
                              <div>Distancia: {item.deliveryDistance} km</div>
                            </>
                          )}
                        </div>
                        {item.product.description && (
                          <p className="text-xs text-muted-foreground mt-2">
                            {item.product.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <div className="flex justify-between w-full">
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => generateOrderPrint(selectedOrder)}
                  className="text-green-600 hover:text-green-700"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Imprimir
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => handleDownloadOrder(selectedOrder)}
                  className="text-purple-600 hover:text-purple-700"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Descargar
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                  Cerrar
                </Button>
                <Button onClick={() => {
                  setIsViewDialogOpen(false);
                  if (selectedOrder) handleEditOrder(selectedOrder);
                }}>
                  Editar
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Products Modal */}
      <Dialog open={isProductsModalOpen} onOpenChange={setIsProductsModalOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Productos/Servicios - Orden {selectedOrder?.orderNumber}
            </DialogTitle>
            <DialogDescription>
              Lista completa de productos y servicios de esta orden
            </DialogDescription>
          </DialogHeader>
          
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <span className="text-sm font-medium text-gray-600">Total Items:</span>
                  <span className="ml-2 font-semibold">{selectedOrder.items?.length || 0}</span>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-600">Total Orden:</span>
                  <span className="ml-2 font-semibold text-green-600">{formatCurrency(selectedOrder.totalAmount)}</span>
                </div>
              </div>

              {selectedOrder.items && selectedOrder.items.length > 0 ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {selectedOrder.items.map((item, index) => (
                    <div key={index} className="border rounded-lg p-4 bg-white">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Package className="w-5 h-5 text-blue-500" />
                          <div>
                            <h4 className="font-medium">{item.product?.name || 'Producto sin nombre'}</h4>
                            <Badge variant="outline" className="text-xs mt-1">
                              {item.product?.category === 'product' ? 'Producto' : 'Servicio'}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg text-green-600">
                            {formatCurrency(item.totalPrice)}
                          </p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 text-sm text-gray-600 mt-3">
                        <div>
                          <span className="font-medium">Cantidad:</span>
                          <span className="ml-1">{item.quantity}</span>
                        </div>
                        <div>
                          <span className="font-medium">Precio Unitario:</span>
                          <span className="ml-1">{formatCurrency(item.unitPrice)}</span>
                        </div>
                        <div>
                          <span className="font-medium">Subtotal:</span>
                          <span className="ml-1 font-semibold text-green-600">{formatCurrency(item.totalPrice)}</span>
                        </div>
                      </div>

                      {item.product?.description && (
                        <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                          <span className="font-medium text-gray-700">Descripción:</span>
                          <p className="text-gray-600 mt-1">{item.product.description}</p>
                        </div>
                      )}

                      {item.notes && (
                        <div className="mt-3 p-2 bg-blue-50 rounded text-sm">
                          <span className="font-medium text-blue-700">Notas:</span>
                          <p className="text-blue-600 mt-1">{item.notes}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Sin productos
                  </h3>
                  <p className="text-gray-600">
                    Esta orden no tiene productos asociados
                  </p>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsProductsModalOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assignment Modal */}
      <AssignmentModal 
        order={selectedOrder}
        isOpen={isAssignDialogOpen}
        onClose={handleCloseAssignModal}
      />

    </div>
  );
}