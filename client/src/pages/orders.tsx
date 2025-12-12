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
import { Plus, Search, Edit, Trash2, Eye, UserCheck, Clock, CheckCircle, XCircle, Package, MapPin, Phone, Download, Printer, ShoppingCart, Filter, MessageCircle } from "lucide-react";
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
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);

  const { debouncedUpdate, isPending } = useDebouncedOrderUpdate();

  const { data: orders = [], isLoading } = useQuery<OrderWithDetails[]>({
    queryKey: ["/api/orders"],
    staleTime: 30_000,
  });

  const { data: users = [], isLoading: usersLoading } = useQuery<Array<{id: number, name: string, role: string, status: string}>>({
    queryKey: ["/api/assignment-rules/available-users"],
    queryFn: () => apiRequest("GET", "/api/assignment-rules/available-users"),
    staleTime: 30_000,
  });

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

  const handleUpdateOrder = (updates: Partial<OrderWithDetails> & { id: number }) => {
    debouncedUpdate(updates);
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

  const handleAssignToTrip = (order: OrderWithDetails) => {
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
    
    if (order.status === 'pending') {
      toast({
        title: "Asignando a viaje compartido",
        description: "La orden se confirmará y agregará al viaje",
      });
    }
    
    assignToTripMutation.mutate(order.id);
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

  const isToday = (dateString: string) => {
    const orderDate = new Date(dateString);
    const today = new Date();
    return (
      orderDate.getDate() === today.getDate() &&
      orderDate.getMonth() === today.getMonth() &&
      orderDate.getFullYear() === today.getFullYear()
    );
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch = !searchTerm || 
      order.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer?.phone?.includes(searchTerm);
    
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    
    const matchesDate = dateFilter === "all" || 
      (dateFilter === "today" && (
        isToday(order.createdAt) || 
        (order.lastStatusUpdate && isToday(order.lastStatusUpdate))
      ));
    
    return matchesSearch && matchesStatus && matchesDate;
  });

  const orderStats = {
    today: orders.filter(o => 
      isToday(o.createdAt) || 
      (o.lastStatusUpdate && isToday(o.lastStatusUpdate))
    ).length,
    pending: orders.filter(o => o.status === 'pending').length,
    inProgress: orders.filter(o => o.status === 'processing').length,
    completed: orders.filter(o => o.status === 'completed').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
  };

  const handleStatClick = (filterType: string) => {
    if (filterType === "today") {
      setDateFilter("today");
      setStatusFilter("all");
    } else {
      setDateFilter("all");
      setStatusFilter(filterType);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      pending: { label: "Pendiente", className: "bg-yellow-100 text-yellow-800" },
      processing: { label: "En Progreso", className: "bg-purple-100 text-purple-800" },
      completed: { label: "Completado", className: "bg-green-100 text-green-800" },
      cancelled: { label: "Cancelado", className: "bg-red-100 text-red-800" },
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
const generateOrderPrint = async (order: OrderWithDetails) => {
  try {
    // Construir ticket ESC/POS
    const ticket = buildESCPOSTicket(order);

    // Enviar al backend
    const response = await fetch('/api/print/thermal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket })
    });

    if (!response.ok) {
      throw new Error('Error al imprimir');
    }

    const result = await response.json();

    toast({
      title: "✓ Impreso",
      description: `Enviado por ${result.method}`,
    });

    // ✅ NUEVO: Después de imprimir, asignar a viaje automáticamente (igual que el botón del carrito)
    if (order.status === 'pending' && !order.tripId) {
      try {
        const assignResponse = await fetch('/api/trips/assign-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: order.id })
        });

        if (assignResponse.ok) {
          const assignResult = await assignResponse.json();
          toast({
            title: "✓ Orden asignada",
            description: `Asignada al viaje ${assignResult.tripNumber}`,
          });
          // Recargar órdenes para mostrar el viaje asignado
          queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        } else {
          console.warn('No se pudo asignar a viaje automáticamente');
        }
      } catch (assignError) {
        console.warn('Error asignando a viaje:', assignError);
        // No fallar la impresión si falla la asignación
      }
    }

  } catch (error: any) {
    console.error('Print error:', error);
    toast({
      title: "Error de impresión",
      description: error.message || "Verifica la conexión de la impresora",
      variant: "destructive",
    });
  }
};


  // ✅ IMPRESIÓN DIRECTA A TÉRMICA (sin diálogo)
  const printDirectToThermal = async (order: OrderWithDetails) => {
    // @ts-ignore
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    
    const ticket = buildESCPOSTicket(order);
    const encoder = new TextEncoder();
    const writer = port.writable.getWriter();
    
    await writer.write(encoder.encode(ticket));
    await writer.close();
    await port.close();
    
    toast({
      title: "✓ Impreso",
      description: "Ticket enviado a impresora térmica"
    });
  };

  // Construir ticket con comandos ESC/POS
const buildESCPOSTicket = (order: OrderWithDetails): string => {
  const ESC = '\x1B';
  const GS = '\x1D';
  const INIT = ESC + '@';
  const CENTER = ESC + 'a' + '\x01';
  const LEFT = ESC + 'a' + '\x00';
  const BOLD_ON = ESC + 'E' + '\x01';
  const BOLD_OFF = ESC + 'E' + '\x00';
  const SIZE_DOUBLE = GS + '!' + '\x11';
  const SIZE_NORMAL = GS + '!' + '\x00';
  const CUT = GS + 'V' + '\x00';
  const LINE = '-'.repeat(32);
  
  let ticket = INIT;
  
  // Header
  ticket += CENTER + SIZE_DOUBLE + BOLD_ON;
  ticket += 'ORDEN DE SERVICIO\n';
  ticket += order.orderNumber + '\n';
  ticket += BOLD_OFF + SIZE_NORMAL;
  ticket += new Date(order.createdAt).toLocaleString('es-DO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }) + '\n';
  ticket += LINE + '\n';
  
  // Cliente
  ticket += LEFT + BOLD_ON + 'Cliente:\n' + BOLD_OFF;
  ticket += '  ' + (order.customer?.name || 'N/A') + '\n';
  ticket += BOLD_ON + 'Tel: ' + BOLD_OFF + (order.customer?.phone || 'N/A') + '\n';
  if (order.customer?.address) {
    ticket += BOLD_ON + 'Dir:\n' + BOLD_OFF;
    ticket += '  ' + order.customer.address + '\n';
  }
  ticket += LINE + '\n';
  
  // Estado
  const statusText = 
    order.status === 'pending' ? 'PENDIENTE' :
    order.status === 'processing' ? 'EN PROCESO' :
    order.status === 'completed' ? 'COMPLETADO' : 'CANCELADO';
  
  ticket += BOLD_ON + 'Estado: ' + BOLD_OFF + statusText + '\n';
  
  if (order.assignedUser) {
    ticket += BOLD_ON + 'Tecnico: ' + BOLD_OFF + order.assignedUser.name + '\n';
  }
  ticket += LINE + '\n';
  
  // Productos
  ticket += BOLD_ON + 'PRODUCTOS:\n' + BOLD_OFF;
  order.items?.forEach(item => {
    ticket += BOLD_ON + (item.product?.name || 'Producto') + '\n' + BOLD_OFF;
    const qty = `${item.quantity} x ${formatCurrency(item.unitPrice)}`;
    const total = formatCurrency(item.totalPrice);
    const spaces = 32 - qty.length - total.length;
    ticket += '  ' + qty + ' '.repeat(Math.max(1, spaces)) + total + '\n';
  });
  ticket += LINE + '\n';
  
  // Total
  if (order.deliveryCost && parseFloat(order.deliveryCost) > 0) {
    const deliveryLabel = 'Entrega:';
    const deliveryAmt = formatCurrency(order.deliveryCost);
    const spaces = 32 - deliveryLabel.length - deliveryAmt.length;
    ticket += deliveryLabel + ' '.repeat(Math.max(1, spaces)) + deliveryAmt + '\n';
  }
  
  ticket += SIZE_DOUBLE + BOLD_ON;
  const totalLabel = 'TOTAL:';
  const totalAmt = formatCurrency(order.totalAmount);
  const totalSpaces = 16 - totalLabel.length - totalAmt.length / 2;
  ticket += totalLabel + ' '.repeat(Math.max(1, totalSpaces)) + totalAmt + '\n';
  ticket += BOLD_OFF + SIZE_NORMAL;
  ticket += LINE + '\n';
  
  // Footer
  ticket += CENTER + '\nGracias por su preferencia!\n';
  
  // Notas del cliente
  if (order.notes && order.notes.trim() !== '') {
    ticket += LEFT + LINE + '\n';
    
    // Si son mensajes originales del cliente, formatear mejor
    if (order.notes.includes('MENSAJES ORIGINALES')) {
      ticket += CENTER + BOLD_ON + 'PEDIDO DEL CLIENTE:\n' + BOLD_OFF;
      ticket += LEFT + order.notes.replace('📬 MENSAJES ORIGINALES DEL CLIENTE:', '').trim() + '\n';
    } else {
      ticket += CENTER + BOLD_ON + 'NOTA:\n' + BOLD_OFF;
      ticket += LEFT + order.notes + '\n';
    }
    
    ticket += LINE + '\n';
  }
  
  ticket += '\n\n\n';
  ticket += CUT;
  
  return ticket;
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
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
          >
            <Filter className="w-4 h-4" />
            {showFilters ? 'Ocultar Filtros' : 'Filtros'}
          </Button>
          <Button onClick={() => setLocation('/orders/new')}>
            <Plus className="w-4 h-4 mr-2" />
            Nueva Orden
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-3">
        <Card 
          className={`cursor-pointer transition-all hover:shadow-md ${
            dateFilter === "today" && statusFilter === "all" 
              ? "ring-2 ring-blue-500 bg-blue-50" 
              : "bg-gradient-to-r from-blue-50 to-blue-100"
          } border-blue-200`}
          onClick={() => handleStatClick("today")}
        >
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-blue-600">Total Hoy</p>
                <p className="text-xl font-bold text-blue-800">{orderStats.today}</p>
              </div>
              <Package className="h-6 w-6 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all hover:shadow-md ${
            statusFilter === "pending" && dateFilter === "all"
              ? "ring-2 ring-yellow-500 bg-yellow-50" 
              : "bg-gradient-to-r from-yellow-50 to-yellow-100"
          } border-yellow-200`}
          onClick={() => handleStatClick("pending")}
        >
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-yellow-600">Pendientes</p>
                <p className="text-xl font-bold text-yellow-800">{orderStats.pending}</p>
              </div>
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all hover:shadow-md ${
            statusFilter === "processing" && dateFilter === "all"
              ? "ring-2 ring-purple-500 bg-purple-50" 
              : "bg-gradient-to-r from-purple-50 to-purple-100"
          } border-purple-200`}
          onClick={() => handleStatClick("processing")}
        >
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-purple-600">En Progreso</p>
                <p className="text-xl font-bold text-purple-800">{orderStats.inProgress}</p>
              </div>
              <UserCheck className="h-6 w-6 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all hover:shadow-md ${
            statusFilter === "completed" && dateFilter === "all"
              ? "ring-2 ring-green-500 bg-green-50" 
              : "bg-gradient-to-r from-green-50 to-green-100"
          } border-green-200`}
          onClick={() => handleStatClick("completed")}
        >
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-green-600">Completados</p>
                <p className="text-xl font-bold text-green-800">{orderStats.completed}</p>
              </div>
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all hover:shadow-md ${
            statusFilter === "cancelled" && dateFilter === "all"
              ? "ring-2 ring-red-500 bg-red-50" 
              : "bg-gradient-to-r from-red-50 to-red-100"
          } border-red-200`}
          onClick={() => handleStatClick("cancelled")}
        >
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-red-600">Cancelados</p>
                <p className="text-xl font-bold text-red-800">{orderStats.cancelled}</p>
              </div>
              <XCircle className="h-6 w-6 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      {showFilters && (
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
                  <SelectItem value="processing">En Progreso</SelectItem>
                  <SelectItem value="completed">Completado</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Fecha" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las fechas</SelectItem>
                  <SelectItem value="today">Hoy</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Orders List */}
      <div className="grid gap-4">
        {filteredOrders.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Package className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No se encontraron órdenes</h3>
              <p className="text-muted-foreground text-center">
                {searchTerm || statusFilter !== "all" || dateFilter !== "all"
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
              onClick={() => handleViewOrder(order)}
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
                    
                    {/* Indicador de notas del cliente */}
                    {order.notes && order.notes.trim() !== '' && (
                      <div className="mt-2 flex items-start gap-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
                        <MessageCircle className="w-3 h-3 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="text-blue-800 line-clamp-2 flex-1">
                          <span className="font-semibold">Mensaje del cliente:</span>{' '}
                          {order.notes.length > 100 
                            ? order.notes.substring(0, 100) + '...' 
                            : order.notes}
                        </div>
                      </div>
                    )}
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
                          handleDeleteOrder(order);
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

      {/* Modals */}
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

      <OrderDetailModal 
        order={selectedOrder as any}
        isOpen={isViewDialogOpen}
        onClose={() => setIsViewDialogOpen(false)}
      />

      <AssignmentModal 
        order={selectedOrder}
        isOpen={isAssignDialogOpen}
        onClose={handleCloseAssignModal}
      />
    </div>
  );
}