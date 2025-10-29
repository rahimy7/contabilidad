import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  ShoppingCart, 
  Package, 
  Clock, 
  CheckCircle,
  XCircle,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Users,
  Building2,
  Eye,
  Download
} from "lucide-react";
import { useState } from "react";

interface GlobalOrder {
  id: number;
  orderNumber: string;
  storeId: number;
  storeName: string;
  customerName: string;
  customerPhone: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  totalAmount: number;
  orderDate: string;
  completedDate?: string;
  assignedTechnician?: string;
  items: {
    id: number;
    productName: string;
    quantity: number;
    price: number;
  }[];
  deliveryAddress: string;
  estimatedTime?: string;
}

interface GlobalOrderMetrics {
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  completionRate: number;
  pendingOrders: number;
  activeOrders: number;
  completedToday: number;
  cancelledOrders: number;
}

export default function GlobalOrders() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [storeFilter, setStoreFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  const { data: metrics, isLoading: metricsLoading } = useQuery<GlobalOrderMetrics>({
    queryKey: ["/api/super-admin/global-order-metrics"],
  });

  const { data: orders, isLoading: ordersLoading } = useQuery<GlobalOrder[]>({
    queryKey: ["/api/super-admin/global-orders"],
  });

  const { data: stores } = useQuery<Array<{id: number; name: string}>>({
    queryKey: ["/api/super-admin/stores-list"],
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'processing': return 'bg-orange-100 text-orange-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'bg-gray-100 text-gray-800';
      case 'medium': return 'bg-blue-100 text-blue-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'urgent': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="h-4 w-4" />;
      case 'processing': return <Package className="h-4 w-4" />;
      case 'completed': return <CheckCircle className="h-4 w-4" />;
      case 'cancelled': return <XCircle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const filteredOrders = orders?.filter(order => {
    const matchesSearch = 
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.storeName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    const matchesStore = storeFilter === "all" || order.storeId.toString() === storeFilter;
    
    let matchesDate = true;
    if (dateFilter !== "all") {
      const orderDate = new Date(order.orderDate);
      const now = new Date();
      switch (dateFilter) {
        case "today":
          matchesDate = orderDate.toDateString() === now.toDateString();
          break;
        case "week":
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          matchesDate = orderDate >= weekAgo;
          break;
        case "month":
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          matchesDate = orderDate >= monthAgo;
          break;
      }
    }
    
    return matchesSearch && matchesStatus && matchesStore && matchesDate;
  }) || [];

  if (metricsLoading || ordersLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">4️⃣ Pedidos Globales</h1>
          <p className="text-muted-foreground">Monitoreo y gestión de pedidos de todas las tiendas</p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button>
            <TrendingUp className="h-4 w-4 mr-2" />
            Analíticas
          </Button>
        </div>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pedidos</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(metrics?.totalOrders || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Pedidos registrados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(metrics?.totalRevenue || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Valor total de pedidos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Promedio</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(metrics?.avgOrderValue || 0).toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">Ticket promedio</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasa de Completado</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(metrics?.completionRate || 0).toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Pedidos completados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.pendingOrders || 0}</div>
            <p className="text-xs text-muted-foreground">Requieren atención</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">En Proceso</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.activeOrders || 0}</div>
            <p className="text-xs text-muted-foreground">Actualmente activos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completados Hoy</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.completedToday || 0}</div>
            <p className="text-xs text-muted-foreground">Finalizados hoy</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cancelados</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.cancelledOrders || 0}</div>
            <p className="text-xs text-muted-foreground">Pedidos cancelados</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros y búsqueda */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros de Pedidos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Input
              placeholder="Buscar por # pedido, cliente, tienda..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="all">Todos los estados</option>
              <option value="pending">Pendientes</option>
              <option value="processing">En proceso</option>
              <option value="completed">Completados</option>
              <option value="cancelled">Cancelados</option>
            </select>
            <select
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="all">Todas las tiendas</option>
              {stores?.map((store) => (
                <option key={store.id} value={store.id.toString()}>
                  {store.name}
                </option>
              ))}
            </select>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="all">Todas las fechas</option>
              <option value="today">Hoy</option>
              <option value="week">Última semana</option>
              <option value="month">Último mes</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Lista de pedidos */}
      <Card>
        <CardHeader>
          <CardTitle>Pedidos Globales ({filteredOrders.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredOrders.map((order) => (
              <div key={order.id} className="border rounded-lg p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(order.status)}
                      <div>
                        <h3 className="font-semibold">{order.orderNumber}</h3>
                        <p className="text-sm text-muted-foreground">
                          {order.customerName} • {order.customerPhone}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{order.storeName}</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge className={getStatusColor(order.status)}>
                      {order.status === 'pending' && 'Pendiente'}
                      {order.status === 'processing' && 'En Proceso'}
                      {order.status === 'completed' && 'Completado'}
                      {order.status === 'cancelled' && 'Cancelado'}
                    </Badge>
                    <Badge className={getPriorityColor(order.priority)}>
                      {order.priority === 'low' && 'Baja'}
                      {order.priority === 'medium' && 'Media'}
                      {order.priority === 'high' && 'Alta'}
                      {order.priority === 'urgent' && 'Urgente'}
                    </Badge>
                    <div className="text-right">
                      <div className="font-semibold text-lg">${order.totalAmount.toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4">
                  <div>
                    <span className="text-muted-foreground">Fecha del pedido:</span>
                    <div className="font-medium">{new Date(order.orderDate).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Técnico asignado:</span>
                    <div className="font-medium">{order.assignedTechnician || 'Sin asignar'}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tiempo estimado:</span>
                    <div className="font-medium">{order.estimatedTime || 'Por determinar'}</div>
                  </div>
                </div>

                <div className="mb-4">
                  <span className="text-muted-foreground text-sm">Dirección de entrega:</span>
                  <div className="font-medium">{order.deliveryAddress}</div>
                </div>

                <div className="mb-4">
                  <span className="text-muted-foreground text-sm">Productos ({order.items.length}):</span>
                  <div className="mt-2 space-y-1">
                    {order.items.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex justify-between items-center text-sm">
                        <span>{item.productName} (x{item.quantity})</span>
                        <span className="font-medium">${(item.price * item.quantity).toLocaleString()}</span>
                      </div>
                    ))}
                    {order.items.length > 3 && (
                      <div className="text-xs text-muted-foreground">
                        +{order.items.length - 3} productos más...
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button variant="outline" size="sm">
                    <Eye className="h-4 w-4 mr-2" />
                    Ver Detalles
                  </Button>
                  <Button variant="outline" size="sm">
                    Gestionar Pedido
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}