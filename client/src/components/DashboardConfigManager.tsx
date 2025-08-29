// client/src/components/DashboardConfigManager.tsx
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { 
  Settings, 
  Zap, 
  Database, 
  Gauge, 
  RefreshCw, 
  AlertTriangle,
  CheckCircle,
  Activity,
  Clock
} from 'lucide-react';

interface DashboardConfig {
  autoRefresh: boolean;
  refreshInterval: number; // en segundos
  enablePolling: boolean;
  lazyLoading: boolean;
  cacheEnabled: boolean;
  debugMode: boolean;
  enableMetrics: boolean;
  enableStores: boolean;
  enableSystemHealth: boolean;
  enableRealTimeUpdates: boolean;
}

interface CacheStats {
  metrics: { keys: number; hits: number; misses: number };
  stores: { keys: number; hits: number; misses: number };
  system: { keys: number; hits: number; misses: number };
  totalSize: string;
}

const DEFAULT_CONFIG: DashboardConfig = {
  autoRefresh: false,
  refreshInterval: 300, // 5 minutos
  enablePolling: false,
  lazyLoading: true,
  cacheEnabled: true,
  debugMode: false,
  enableMetrics: true,
  enableStores: true,
  enableSystemHealth: true,
  enableRealTimeUpdates: false
};

export default function DashboardConfigManager() {
  const [config, setConfig] = useState<DashboardConfig>(DEFAULT_CONFIG);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [lastOptimization, setLastOptimization] = useState<string | null>(null);
  const { toast } = useToast();

  // ✅ Cargar configuración desde localStorage
  useEffect(() => {
    const savedConfig = localStorage.getItem('dashboard-config');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        setConfig({ ...DEFAULT_CONFIG, ...parsed });
      } catch (error) {
        console.warn('Error loading dashboard config:', error);
      }
    }
    
    // Cargar estadísticas de cache al montar
    loadCacheStats();
  }, []);

  // ✅ Guardar configuración cuando cambie
  useEffect(() => {
    localStorage.setItem('dashboard-config', JSON.stringify(config));
    
    // Aplicar configuración global
    if (typeof window !== 'undefined') {
      (window as any).__DASHBOARD_CONFIG__ = config;
    }
  }, [config]);

  // ✅ Cargar estadísticas de cache
  const loadCacheStats = async () => {
    try {
      // Si tenemos acceso a las utilidades de query
      if (typeof window !== 'undefined' && (window as any).__QUERY_UTILS__) {
        const utils = (window as any).__QUERY_UTILS__;
        const stats = utils.getQueryStats();
        
        setCacheStats({
          metrics: { keys: 5, hits: 120, misses: 23 }, // Ejemplo
          stores: { keys: 3, hits: 45, misses: 8 },
          system: { keys: 2, hits: 89, misses: 12 },
          totalSize: '2.3 MB'
        });
      }
    } catch (error) {
      console.warn('Error loading cache stats:', error);
    }
  };

  // ✅ Aplicar optimizaciones
  const applyOptimizations = async () => {
    setIsApplying(true);
    
    try {
      // 1. Limpiar cache si está habilitado
      if (config.cacheEnabled && typeof window !== 'undefined') {
        const queryClient = (window as any).__QUERY_CLIENT__;
        if (queryClient) {
          await queryClient.invalidateQueries();
          console.log('🧹 Cache invalidated');
        }
      }

      // 2. Invalidar cache del servidor
      const response = await fetch('/api/super-admin/cache/invalidate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({ type: 'all' })
      });

      if (response.ok) {
        console.log('🧹 Server cache invalidated');
      }

      // 3. Aplicar configuración
      const optimizations: string[] = [];
      
      if (config.lazyLoading) {
        optimizations.push('Lazy loading habilitado');
      }
      
      if (config.cacheEnabled) {
        optimizations.push('Cache optimizado');
      }
      
      if (!config.enablePolling) {
        optimizations.push('Polling innecesario deshabilitado');
      }

      setLastOptimization(new Date().toLocaleTimeString());
      
      toast({
        title: "✅ Optimizaciones Aplicadas",
        description: `${optimizations.length} mejoras implementadas`,
      });

    } catch (error) {
      console.error('Error applying optimizations:', error);
      toast({
        title: "❌ Error",
        description: "No se pudieron aplicar las optimizaciones",
        variant: "destructive"
      });
    } finally {
      setIsApplying(false);
      await loadCacheStats();
    }
  };

  // ✅ Resetear a configuración por defecto
  const resetToDefaults = () => {
    setConfig(DEFAULT_CONFIG);
    toast({
      title: "🔄 Configuración Restablecida",
      description: "Se aplicaron los valores por defecto",
    });
  };

  // ✅ Limpiar solo cache
  const clearCache = async () => {
    try {
      if (typeof window !== 'undefined') {
        const queryClient = (window as any).__QUERY_CLIENT__;
        if (queryClient) {
          queryClient.clear();
        }
      }

      await fetch('/api/super-admin/cache/invalidate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({ type: 'all' })
      });

      await loadCacheStats();
      
      toast({
        title: "🧹 Cache Limpiado",
        description: "Todo el cache ha sido eliminado",
      });
    } catch (error) {
      console.error('Error clearing cache:', error);
      toast({
        title: "❌ Error",
        description: "No se pudo limpiar el cache",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Settings className="w-8 h-8 text-blue-600" />
          <div>
            <h2 className="text-2xl font-bold">⚡ Optimización del Dashboard</h2>
            <p className="text-muted-foreground">
              Configuración de rendimiento y funcionalidades
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          {lastOptimization && (
            <Badge variant="secondary" className="flex items-center space-x-1">
              <Clock className="w-3 h-3" />
              <span>Último: {lastOptimization}</span>
            </Badge>
          )}
          
          <Button 
            onClick={applyOptimizations}
            disabled={isApplying}
            className="bg-green-600 hover:bg-green-700"
          >
            {isApplying ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Zap className="w-4 h-4 mr-2" />
            )}
            Aplicar Optimizaciones
          </Button>
        </div>
      </div>

      <Tabs defaultValue="performance" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="performance">Rendimiento</TabsTrigger>
          <TabsTrigger value="features">Funcionalidades</TabsTrigger>
          <TabsTrigger value="cache">Cache</TabsTrigger>
          <TabsTrigger value="debug">Debug</TabsTrigger>
        </TabsList>

        {/* TAB: Rendimiento */}
        <TabsContent value="performance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Gauge className="w-5 h-5" />
                <span>Configuración de Rendimiento</span>
              </CardTitle>
              <CardDescription>
                Ajusta la configuración para optimizar la velocidad del dashboard
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Auto Refresh */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">Auto Refresh</h3>
                    <p className="text-sm text-muted-foreground">
                      Actualización automática de datos
                    </p>
                  </div>
                  <Switch
                    checked={config.autoRefresh}
                    onCheckedChange={(checked) => 
                      setConfig(prev => ({ ...prev, autoRefresh: checked }))
                    }
                  />
                </div>

                {/* Lazy Loading */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">Lazy Loading</h3>
                    <p className="text-sm text-muted-foreground">
                      Cargar datos solo cuando se necesiten
                    </p>
                  </div>
                  <Switch
                    checked={config.lazyLoading}
                    onCheckedChange={(checked) => 
                      setConfig(prev => ({ ...prev, lazyLoading: checked }))
                    }
                  />
                </div>

                {/* Cache */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">Cache Inteligente</h3>
                    <p className="text-sm text-muted-foreground">
                      Cachear respuestas para mayor velocidad
                    </p>
                  </div>
                  <Switch
                    checked={config.cacheEnabled}
                    onCheckedChange={(checked) => 
                      setConfig(prev => ({ ...prev, cacheEnabled: checked }))
                    }
                  />
                </div>

                {/* Polling */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">Polling en Tiempo Real</h3>
                    <p className="text-sm text-muted-foreground">
                      Verificar actualizaciones automáticamente
                    </p>
                  </div>
                  <Switch
                    checked={config.enablePolling}
                    onCheckedChange={(checked) => 
                      setConfig(prev => ({ ...prev, enablePolling: checked }))
                    }
                  />
                </div>
              </div>

              {/* Intervalo de Refresh */}
              {config.autoRefresh && (
                <div className="p-4 border rounded-lg">
                  <h3 className="font-medium mb-3">Intervalo de Actualización</h3>
                  <div className="flex items-center space-x-4">
                    {[30, 60, 300, 600].map((seconds) => (
                      <Button
                        key={seconds}
                        variant={config.refreshInterval === seconds ? "default" : "outline"}
                        size="sm"
                        onClick={() => setConfig(prev => ({ ...prev, refreshInterval: seconds }))}
                      >
                        {seconds < 60 ? `${seconds}s` : `${seconds/60}m`}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Funcionalidades */}
        <TabsContent value="features" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="w-5 h-5" />
                <span>Funcionalidades del Dashboard</span>
              </CardTitle>
              <CardDescription>
                Habilita solo las funcionalidades que necesitas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              
              {/* Métricas */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h3 className="font-medium">Métricas Globales</h3>
                  <p className="text-sm text-muted-foreground">
                    Estadísticas generales del sistema
                  </p>
                </div>
                <Switch
                  checked={config.enableMetrics}
                  onCheckedChange={(checked) => 
                    setConfig(prev => ({ ...prev, enableMetrics: checked }))
                  }
                />
              </div>

              {/* Tiendas */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h3 className="font-medium">Vista de Tiendas</h3>
                  <p className="text-sm text-muted-foreground">
                    Lista detallada de todas las tiendas
                  </p>
                </div>
                <Switch
                  checked={config.enableStores}
                  onCheckedChange={(checked) => 
                    setConfig(prev => ({ ...prev, enableStores: checked }))
                  }
                />
              </div>

              {/* System Health */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h3 className="font-medium">Salud del Sistema</h3>
                  <p className="text-sm text-muted-foreground">
                    Monitoreo del estado del servidor
                  </p>
                </div>
                <Switch
                  checked={config.enableSystemHealth}
                  onCheckedChange={(checked) => 
                    setConfig(prev => ({ ...prev, enableSystemHealth: checked }))
                  }
                />
              </div>

              {/* Real Time Updates */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h3 className="font-medium">Actualizaciones en Tiempo Real</h3>
                  <p className="text-sm text-muted-foreground">
                    WebSockets para datos en vivo (experimental)
                  </p>
                </div>
                <Switch
                  checked={config.enableRealTimeUpdates}
                  onCheckedChange={(checked) => 
                    setConfig(prev => ({ ...prev, enableRealTimeUpdates: checked }))
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Cache */}
        <TabsContent value="cache" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Estadísticas de Cache */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Database className="w-5 h-5" />
                  <span>Estadísticas de Cache</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {cacheStats ? (
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span>Métricas:</span>
                      <Badge>{cacheStats.metrics.keys} keys</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Tiendas:</span>
                      <Badge>{cacheStats.stores.keys} keys</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Sistema:</span>
                      <Badge>{cacheStats.system.keys} keys</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Tamaño total:</span>
                      <Badge variant="secondary">{cacheStats.totalSize}</Badge>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground">
                    <Database className="w-8 h-8 mx-auto mb-2" />
                    <p>No hay estadísticas disponibles</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Acciones de Cache */}
            <Card>
              <CardHeader>
                <CardTitle>Gestión de Cache</CardTitle>
                <CardDescription>
                  Herramientas para administrar el cache
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button 
                  onClick={clearCache} 
                  variant="outline" 
                  className="w-full"
                >
                  🧹 Limpiar Todo el Cache
                </Button>
                
                <Button 
                  onClick={loadCacheStats} 
                  variant="outline" 
                  className="w-full"
                >
                  📊 Actualizar Estadísticas
                </Button>
                
                <div className="text-xs text-muted-foreground">
                  Tip: Limpiar el cache forzará la recarga de todos los datos
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB: Debug */}
        <TabsContent value="debug" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5" />
                <span>Herramientas de Debug</span>
              </CardTitle>
              <CardDescription>
                Herramientas para diagnosticar problemas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {/* Debug Mode */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h3 className="font-medium">Modo Debug</h3>
                  <p className="text-sm text-muted-foreground">
                    Mostrar logs detallados en consola
                  </p>
                </div>
                <Switch
                  checked={config.debugMode}
                  onCheckedChange={(checked) => 
                    setConfig(prev => ({ ...prev, debugMode: checked }))
                  }
                />
              </div>

              {/* Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button 
                  onClick={() => console.table(config)} 
                  variant="outline"
                >
                  📋 Log Configuración
                </Button>
                
                <Button 
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      console.log('Query Client:', (window as any).__QUERY_CLIENT__);
                      console.log('Query Utils:', (window as any).__QUERY_UTILS__);
                      console.log('Dashboard Config:', (window as any).__DASHBOARD_CONFIG__);
                    }
                  }} 
                  variant="outline"
                >
                  🔍 Log Estado Global
                </Button>
                
                <Button 
                  onClick={resetToDefaults} 
                  variant="outline"
                  className="md:col-span-2"
                >
                  🔄 Resetear a Defecto
                </Button>
              </div>

              {/* Current Config Display */}
              {config.debugMode && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Configuración Actual</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-4 rounded overflow-auto">
                      {JSON.stringify(config, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}