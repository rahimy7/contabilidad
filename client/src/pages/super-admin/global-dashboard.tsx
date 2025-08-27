// client/src/pages/super-admin/global-dashboard-optimized.tsx
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useOptimizedDashboard, useDashboardPerformance } from "@/hooks/useOptimizedDashboard";
import DashboardConfigManager from "@/components/DashboardConfigManager";
import { 
  Building2, 
  TrendingUp, 
  DollarSign, 
  Users, 
  ShoppingCart,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Settings,
  Zap,
  Eye,
  Filter,
  Download,
  Gauge
} from "lucide-react";

export default function OptimizedGlobalDashboard() {
  const [showConfig, setShowConfig] = useState(false);
  const { toast } = useToast();
  
  // ✅ Hook principal optimizado
  const {
    metrics,
    stores,
    systemHealth,
    state,
    config,
    setCurrentTab,
    refreshData,
    optimizeNow,
    updateConfig,
    getPerformanceStats,
    isLoading,
    hasErrors,
    isRefreshing
  } = useOptimizedDashboard();

  // ✅ Estadísticas de performance
  const performanceStats = useDashboardPerformance();

  // ✅ Manejar optimización
  const handleOptimize = async () => {
    const result = await optimizeNow();
    
    toast({
      title: result.success ? "✅ Dashboard Optimizado" : "❌ Error en Optimización",
      description: result.message,
      variant: result.success ? "default" : "destructive"
    });
  };

  // ✅ Cambiar pestaña con lazy loading
  const handleTabChange = (tab: string) => {
    setCurrentTab(tab);
    
    // Log para debugging
    if (config.debugMode) {
      console.log(`[Dashboard] Switched to ${tab}, lazy loading: ${config.lazyLoading}`);
    }
  };

  // ✅ Loading state optimizado
  if (isLoading && state.currentTab === 'overview') {
    return <OptimizedSkeleton />;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header optimizado con indicadores */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Building2 className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold">🚀 Panel de Control Optimizado</h1>
            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
              <span>
                Rendimiento del dashboard mejorado
              </span>
              {state.lastRefresh && (
                <span className="flex items-center space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>Última actualización: {state.lastRefresh.toLocaleTimeString()}</span>
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          {/* Indicador de estado */}
          {systemHealth.data && (
            <Badge 
              variant={systemHealth.data.status === 'healthy' ? 'default' : 'destructive'}
              className="flex items-center space-x-1"
            >
              {systemHealth.data.status === 'healthy' ? (
                <>
                  <CheckCircle className="w-3 h-3" />
                  <span>Sistema OK</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3 h-3" />
                  <span>{systemHealth.data.status}</span>
                </>
              )}
            </Badge>
          )}

          {/* Estadísticas de rendimiento */}
          <Badge variant="outline" className="flex items-center space-x-1">
            <Gauge className="w-3 h-3" />
            <span>{state.requestCount} requests</span>
          </Badge>

          {/* Botones de control */}
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowConfig(!showConfig)}
          >
            <Settings className="w-4 h-4 mr-1" />
            Config
          </Button>

          <Button 
            variant="outline" 
            size="sm"
            onClick={refreshData}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Actualizando...' : 'Actualizar'}
          </Button>

          <Button 
            size="sm"
            onClick={handleOptimize}
            className="bg-green-600 hover:bg-green-700"
          >
            <Zap className="w-4 h-4 mr-1" />
            Optimizar
          </Button>
        </div>
      </div>

      {/* Panel de configuración deslizable */}
      {showConfig && (
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <DashboardConfigManager />
          </CardContent>
        </Card>
      )}

      {/* Panel de estadísticas de performance */}
      {config.debugMode && (
        <Card className="bg-gray-50 dark:bg-gray-900">
          <CardHeader>
            <CardTitle className="text-sm flex items-center space-x-2">
              <Activity className="w-4 h-4" />
              <span>Performance Stats</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Queries:</span>
                <span className="ml-2 font-mono">{performanceStats.superAdminQueries}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Loading:</span>
                <span className="ml-2 font-mono">{performanceStats.loadingQueries}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Errors:</span>
                <span className="ml-2 font-mono text-red-500">{performanceStats.errorQueries}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Cache Hit:</span>
                <span className="ml-2 font-mono text-green-500">{performanceStats.cacheHitRate}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs principales con lazy loading */}
      <Tabs value={state.currentTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">
            Vista General
            {config.lazyLoading && state.currentTab !== 'overview' && (
              <Badge variant="secondary" className="ml-2 text-xs">Lazy</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="stores">
            Tiendas
            {stores.isLoading && <RefreshCw className="w-3 h-3 ml-2 animate-spin" />}
          </TabsTrigger>
          <TabsTrigger value="metrics">Métricas</TabsTrigger>
          <TabsTrigger value="system">Sistema</TabsTrigger>
        </TabsList>

        {/* TAB: Vista General */}
        <TabsContent value="overview" className="space-y-6">
          {/* Métricas principales */}
          {config.enableMetrics && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <OptimizedMetricCard
                title="Total de Tiendas"
                value={metrics.data?.totalStores || 0}
                icon={Building2}
                color="blue"
                subtitle={`${metrics.data?.activeStores || 0} activas`}
                isLoading={metrics.isLoading}
                error={metrics.error}
              />
              
              <OptimizedMetricCard
                title="Ingresos Mensuales"
                value={`$${(metrics.data?.monthlyRevenue || 0).toLocaleString()}`}
                icon={DollarSign}
                color="green"
                subtitle="Este mes"
                isLoading={metrics.isLoading}
                error={metrics.error}
              />
              
              <OptimizedMetricCard
                title="Órdenes Totales"
                value={metrics.data?.totalOrders || 0}
                icon={ShoppingCart}
                color="purple"
                subtitle="Todas las tiendas"
                isLoading={metrics.isLoading}
                error={metrics.error}
              />
              
              <OptimizedMetricCard
                title="Soporte Pendiente"
                value={metrics.data?.pendingSupport || 0}
                icon={AlertTriangle}
                color={(metrics.data?.pendingSupport || 0) > 0 ? "red" : "gray"}
                subtitle="Tickets abiertos"
                isLoading={metrics.isLoading}
                error={metrics.error}
              />
            </div>
          )}

          {/* System Health */}
          {config.enableSystemHealth && systemHealth.data && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Activity className="w-5 h-5" />
                  <span>Salud del Sistema</span>
                  {config.enablePolling && (
                    <Badge variant="outline" className="text-xs">
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Auto-refresh
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {systemHealth.data.uptimeHuman}
                    </div>
                    <div className="text-sm text-muted-foreground">Uptime</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {systemHealth.data.responseTime}ms
                    </div>
                    <div className="text-sm text-muted-foreground">Response Time</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {100 - systemHealth.data.errorRate}%
                    </div>
                    <div className="text-sm text-muted-foreground">Success Rate</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {Object.values(systemHealth.data.checks).filter(c => c === 'ok').length}/
                      {Object.values(systemHealth.data.checks).length}
                    </div>
                    <div className="text-sm text-muted-foreground">Health Checks</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Placeholder para gráficos */}
          <Card>
            <CardHeader>
              <CardTitle>Tendencias de Rendimiento</CardTitle>
              <CardDescription>
                Evolución de métricas clave (implementar con Chart.js)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] flex items-center justify-center border-2 border-dashed border-gray-300 rounded">
                <div className="text-center text-muted-foreground">
                  <TrendingUp className="w-8 h-8 mx-auto mb-2" />
                  <p>Gráfico de tendencias</p>
                  <p className="text-sm">Datos cargados: {metrics.data ? 'Sí' : 'No'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Tiendas con lazy loading */}
        <TabsContent value="stores" className="space-y-6">
          {config.enableStores ? (
            <>
              {stores.isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(6)].map((_, i) => (
                    <Card key={i} className="animate-pulse">
                      <CardHeader>
                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                      </CardHeader>
                      <CardContent>
                        <div className="h-3 bg-gray-200 rounded mb-2"></div>
                        <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : stores.error ? (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-red-500" />
                      <p className="text-red-600">Error al cargar tiendas</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {stores.error.message}
                      </p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-3"
                        onClick={() => refreshData()}
                      >
                        Reintentar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">
                      Tiendas Registradas ({stores.data.length})
                    </h3>
                    {stores.pagination && (
                      <div className="text-sm text-muted-foreground">
                        Página {stores.pagination.page} de {stores.pagination.totalPages}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {stores.data.map((store: any) => (
                      <OptimizedStoreCard key={store.id} store={store} />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  <Building2 className="w-8 h-8 mx-auto mb-2" />
                  <p>Vista de tiendas deshabilitada</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-3"
                    onClick={() => updateConfig({ enableStores: true })}
                  >
                    Habilitar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB: Métricas */}
        <TabsContent value="metrics" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {metrics.data && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Retención Promedio</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold mb-2">
                      {metrics.data.averageRetention}%
                    </div>
                    <Progress value={metrics.data.averageRetention} className="mb-2" />
                    <div className="text-sm text-muted-foreground">
                      {metrics.data.activeStores} de {metrics.data.totalStores} tiendas activas
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Métricas Adicionales</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span>Valor promedio por orden:</span>
                      <span className="font-mono">${metrics.data.averageOrderValue || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Órdenes por tienda:</span>
                      <span className="font-mono">{metrics.data.ordersPerStore || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Usuarios activos:</span>
                      <span className="font-mono">{metrics.data.activeUsers || 0}</span>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </TabsContent>

        {/* TAB: Sistema */}
        <TabsContent value="system" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Configuración del Dashboard */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Settings className="w-5 h-5" />
                  <span>Configuración Actual</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span>Lazy Loading:</span>
                  <Badge variant={config.lazyLoading ? "default" : "secondary"}>
                    {config.lazyLoading ? "Habilitado" : "Deshabilitado"}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Cache:</span>
                  <Badge variant={config.cacheEnabled ? "default" : "secondary"}>
                    {config.cacheEnabled ? "Habilitado" : "Deshabilitado"}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Auto Refresh:</span>
                  <Badge variant={config.autoRefresh ? "default" : "secondary"}>
                    {config.autoRefresh ? `${config.refreshInterval}s` : "Deshabilitado"}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Polling:</span>
                  <Badge variant={config.enablePolling ? "default" : "secondary"}>
                    {config.enablePolling ? "Habilitado" : "Deshabilitado"}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Performance Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Gauge className="w-5 h-5" />
                  <span>Estadísticas de Rendimiento</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span>Queries Totales:</span>
                  <Badge variant="outline">{performanceStats.totalQueries}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Super Admin:</span>
                  <Badge variant="outline">{performanceStats.superAdminQueries}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Cache Hit Rate:</span>
                  <Badge variant="outline" className="text-green-600">
                    {performanceStats.cacheHitRate}%
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span>Response Time:</span>
                  <Badge variant="outline">{performanceStats.averageResponseTime}ms</Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Acciones del Sistema */}
          <Card>
            <CardHeader>
              <CardTitle>Acciones del Sistema</CardTitle>
              <CardDescription>
                Herramientas de administración y optimización
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button 
                  variant="outline" 
                  className="h-20 flex-col"
                  onClick={() => setShowConfig(true)}
                >
                  <Settings className="w-6 h-6 mb-2" />
                  Configuración Avanzada
                </Button>
                
                <Button 
                  variant="outline" 
                  className="h-20 flex-col"
                  onClick={handleOptimize}
                >
                  <Zap className="w-6 h-6 mb-2" />
                  Optimizar Ahora
                </Button>
                
                <Button 
                  variant="outline" 
                  className="h-20 flex-col"
                  onClick={() => {
                    const stats = getPerformanceStats();
                    console.table(stats);
                    toast({
                      title: "📊 Stats",
                      description: "Estadísticas mostradas en consola"
                    });
                  }}
                >
                  <Activity className="w-6 h-6 mb-2" />
                  Ver Estadísticas
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Debug Info */}
          {config.debugMode && (
            <Card className="bg-gray-50 dark:bg-gray-900 border-dashed">
              <CardHeader>
                <CardTitle className="text-lg">🐛 Información de Debug</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm font-mono">
                  <div>
                    <h4 className="font-bold mb-2">Estado Actual:</h4>
                    <pre className="text-xs">
{JSON.stringify({
  tab: state.currentTab,
  optimized: state.isOptimized,
  requests: state.requestCount,
  lastRefresh: state.lastRefresh?.toISOString()
}, null, 2)}
                    </pre>
                  </div>
                  
                  <div>
                    <h4 className="font-bold mb-2">Configuración:</h4>
                    <pre className="text-xs">
{JSON.stringify({
  lazyLoading: config.lazyLoading,
  cache: config.cacheEnabled,
  autoRefresh: config.autoRefresh,
  polling: config.enablePolling
}, null, 2)}
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ✅ Componente de métrica optimizado con estados de carga
interface OptimizedMetricCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: 'blue' | 'green' | 'purple' | 'red' | 'gray';
  subtitle?: string;
  isLoading?: boolean;
  error?: any;
}

function OptimizedMetricCard({ 
  title, 
  value, 
  icon: Icon, 
  color, 
  subtitle, 
  isLoading, 
  error 
}: OptimizedMetricCardProps) {
  const colorClasses = {
    blue: 'text-blue-600 bg-blue-50 dark:bg-blue-950',
    green: 'text-green-600 bg-green-50 dark:bg-green-950',
    purple: 'text-purple-600 bg-purple-50 dark:bg-purple-950',
    red: 'text-red-600 bg-red-50 dark:bg-red-950',
    gray: 'text-gray-600 bg-gray-50 dark:bg-gray-950'
  };

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="p-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-24"></div>
              <div className="h-6 bg-gray-200 rounded w-16"></div>
              <div className="h-3 bg-gray-200 rounded w-20"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="p-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-red-50 text-red-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">{title}</p>
              <p className="text-sm text-red-600">Error de carga</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && (
              <p className="text-xs text-gray-500">{subtitle}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ✅ Componente de tienda optimizado
interface OptimizedStoreCardProps {
  store: any;
}

function OptimizedStoreCard({ store }: OptimizedStoreCardProps) {
  const statusColors = {
    active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    suspended: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
  };

  const subscriptionColors = {
    trial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    expired: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg truncate">{store.name}</CardTitle>
          <Badge className={statusColors[store.status] || statusColors.inactive}>
            {store.status || 'inactive'}
          </Badge>
        </div>
        <Badge 
          variant="outline" 
          className={subscriptionColors[store.subscriptionStatus] || subscriptionColors.cancelled}
        >
          {store.subscriptionStatus || 'unknown'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Órdenes/mes:</span>
            <span className="ml-1 font-semibold">{store.monthlyOrders || 0}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Ingresos:</span>
            <span className="ml-1 font-semibold">${store.monthlyRevenue || 0}</span>
          </div>
        </div>
        
        <div className="text-xs text-muted-foreground">
          <span>Última actividad: {store.lastActivity || 'Desconocida'}</span>
        </div>
        
        {(store.supportTickets || 0) > 0 && (
          <div className="flex justify-between items-center pt-2 border-t">
            <span className="text-xs text-muted-foreground">Tickets:</span>
            <Badge variant="destructive" className="text-xs">
              {store.supportTickets}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ✅ Skeleton optimizado
function OptimizedSkeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gray-200 rounded"></div>
          <div>
            <div className="h-8 bg-gray-200 rounded w-64 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-96"></div>
          </div>
        </div>
        <div className="flex space-x-2">
          <div className="h-8 bg-gray-200 rounded w-20"></div>
          <div className="h-8 bg-gray-200 rounded w-24"></div>
          <div className="h-8 bg-gray-200 rounded w-24"></div>
        </div>
      </div>

      {/* Metrics skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-24"></div>
                  <div className="h-6 bg-gray-200 rounded w-16"></div>
                  <div className="h-3 bg-gray-200 rounded w-20"></div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Content skeleton */}
      <Card className="animate-pulse">
        <CardHeader>
          <div className="h-6 bg-gray-200 rounded w-48 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-64"></div>
        </CardHeader>
        <CardContent>
          <div className="h-48 bg-gray-200 rounded"></div>
        </CardContent>
      </Card>
    </div>
  );
}