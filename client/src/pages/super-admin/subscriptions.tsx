import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  CreditCard, 
  DollarSign, 
  Calendar, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  Users,
  Building2
} from "lucide-react";
import { useState } from "react";

interface Subscription {
  id: number;
  storeId: number;
  storeName: string;
  plan: 'basic' | 'premium' | 'enterprise';
  status: 'active' | 'cancelled' | 'expired' | 'trial';
  monthlyPrice: number;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  lastPayment: string;
  nextPayment: string;
  totalRevenue: number;
  invoicesCount: number;
}

interface SubscriptionMetrics {
  totalRevenue: number;
  monthlyRecurring: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  churnRate: number;
  avgRevenuePerUser: number;
}

export default function Subscriptions() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");

  const { data: metrics, isLoading: metricsLoading } = useQuery<SubscriptionMetrics>({
    queryKey: ["/api/super-admin/subscription-metrics"],
  });

  const { data: subscriptionsResponse, isLoading: subscriptionsLoading } = useQuery<{
    subscriptions: Subscription[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>({
    queryKey: ["/api/super-admin/subscriptions"],
  });

  const subscriptions = subscriptionsResponse?.subscriptions || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'trial': return 'bg-blue-100 text-blue-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'expired': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPlanColor = (plan: string) => {
    switch (plan) {
      case 'basic': return 'bg-yellow-100 text-yellow-800';
      case 'premium': return 'bg-purple-100 text-purple-800';
      case 'enterprise': return 'bg-indigo-100 text-indigo-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredSubscriptions = subscriptions?.filter(sub => {
    const matchesSearch = sub.storeName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || sub.status === statusFilter;
    const matchesPlan = planFilter === "all" || sub.plan === planFilter;
    return matchesSearch && matchesStatus && matchesPlan;
  }) || [];

  if (metricsLoading || subscriptionsLoading) {
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
          <h1 className="text-3xl font-bold">3️⃣ Suscripciones y Facturación</h1>
          <p className="text-muted-foreground">Gestión de suscripciones y ingresos del ecosistema</p>
        </div>
        <Button>
          <CreditCard className="h-4 w-4 mr-2" />
          Generar Reporte
        </Button>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(metrics?.totalRevenue || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Ingresos acumulados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MRR</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(metrics?.monthlyRecurring || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Ingresos mensuales recurrentes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Suscripciones Activas</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.activeSubscriptions || 0}</div>
            <p className="text-xs text-muted-foreground">Tiendas con suscripción activa</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pruebas Gratuitas</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.trialSubscriptions || 0}</div>
            <p className="text-xs text-muted-foreground">Tiendas en período de prueba</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasa de Abandono</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(metrics?.churnRate || 0).toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Cancelaciones mensuales</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ARPU</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(metrics?.avgRevenuePerUser || 0).toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">Ingreso promedio por usuario</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros y búsqueda */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros de Suscripciones</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <Input
              placeholder="Buscar por nombre de tienda..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="all">Todos los estados</option>
              <option value="active">Activas</option>
              <option value="trial">Prueba gratuita</option>
              <option value="cancelled">Canceladas</option>
              <option value="expired">Expiradas</option>
            </select>
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="all">Todos los planes</option>
              <option value="basic">Básico</option>
              <option value="premium">Premium</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Lista de suscripciones */}
      <Card>
        <CardHeader>
          <CardTitle>Suscripciones Registradas ({filteredSubscriptions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredSubscriptions.map((subscription) => (
              <div key={subscription.id} className="border rounded-lg p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <h3 className="font-semibold">{subscription.storeName}</h3>
                        <p className="text-sm text-muted-foreground">ID: {subscription.storeId}</p>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Badge className={getStatusColor(subscription.status)}>
                        {subscription.status === 'active' && 'Activa'}
                        {subscription.status === 'trial' && 'Prueba'}
                        {subscription.status === 'cancelled' && 'Cancelada'}
                        {subscription.status === 'expired' && 'Expirada'}
                      </Badge>
                      <Badge className={getPlanColor(subscription.plan)}>
                        {subscription.plan === 'basic' && 'Básico'}
                        {subscription.plan === 'premium' && 'Premium'}
                        {subscription.plan === 'enterprise' && 'Enterprise'}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-lg">${subscription.monthlyPrice}/mes</div>
                    <div className="text-sm text-muted-foreground">
                      Ingresos totales: ${subscription.totalRevenue.toLocaleString()}
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Inicio:</span>
                    <div className="font-medium">{new Date(subscription.startDate).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Próximo pago:</span>
                    <div className="font-medium">{new Date(subscription.nextPayment).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Auto-renovación:</span>
                    <div className="font-medium">{subscription.autoRenew ? 'Sí' : 'No'}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Facturas:</span>
                    <div className="font-medium">{subscription.invoicesCount}</div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end space-x-2">
                  <Button variant="outline" size="sm">
                    Ver Facturas
                  </Button>
                  <Button variant="outline" size="sm">
                    Gestionar Suscripción
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