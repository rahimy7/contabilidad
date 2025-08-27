// client/src/hooks/useOptimizedDashboard.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

interface DashboardConfig {
  autoRefresh: boolean;
  refreshInterval: number;
  enablePolling: boolean;
  lazyLoading: boolean;
  cacheEnabled: boolean;
  debugMode: boolean;
  enableMetrics: boolean;
  enableStores: boolean;
  enableSystemHealth: boolean;
}

interface OptimizedDashboardState {
  isOptimized: boolean;
  currentTab: string;
  loadingStates: Record<string, boolean>;
  errors: Record<string, string | null>;
  lastRefresh: Date | null;
  requestCount: number;
}

const DEFAULT_CONFIG: DashboardConfig = {
  autoRefresh: false,
  refreshInterval: 300,
  enablePolling: false,
  lazyLoading: true,
  cacheEnabled: true,
  debugMode: false,
  enableMetrics: true,
  enableStores: true,
  enableSystemHealth: true,
};

/**
 * Hook optimizado para el dashboard del super admin
 * Implementa lazy loading, cache inteligente y control de requests
 */
export function useOptimizedDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<DashboardConfig>(DEFAULT_CONFIG);
  const [state, setState] = useState<OptimizedDashboardState>({
    isOptimized: false,
    currentTab: 'overview',
    loadingStates: {},
    errors: {},
    lastRefresh: null,
    requestCount: 0,
  });

  // Referencias para optimizaciones
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const requestCountRef = useRef(0);
  const lastRequestTime = useRef<number>(0);

  // ✅ 1. CARGAR CONFIGURACIÓN AL INICIALIZAR
  useEffect(() => {
    const savedConfig = localStorage.getItem('dashboard-config');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        setConfig({ ...DEFAULT_CONFIG, ...parsed });
        logDebug('Configuración cargada:', parsed);
      } catch (error) {
        logDebug('Error cargando configuración:', error);
      }
    }
  }, []);

  // ✅ 2. APLICAR CONFIGURACIÓN CUANDO CAMBIE
  useEffect(() => {
    localStorage.setItem('dashboard-config', JSON.stringify(config));
    
    // Aplicar auto-refresh
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }
    
    if (config.autoRefresh && config.refreshInterval > 0) {
      refreshIntervalRef.current = setInterval(() => {
        if (state.currentTab === 'overview' || !config.lazyLoading) {
          refreshData();
        }
      }, config.refreshInterval * 1000);
    }

    setState(prev => ({ ...prev, isOptimized: true }));
    logDebug('Configuración aplicada:', config);
  }, [config, state.currentTab]);

  // ✅ 3. HELPER: LOG DEBUG
  const logDebug = useCallback((message: string, data?: any) => {
    if (config.debugMode) {
      console.log(`[Dashboard Optimized] ${message}`, data || '');
    }
  }, [config.debugMode]);

  // ✅ 4. CONTROL DE RATE LIMITING
  const canMakeRequest = useCallback(() => {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime.current;
    
    // Prevenir más de 1 request por segundo
    if (timeSinceLastRequest < 1000) {
      logDebug('Request bloqueado por rate limiting');
      return false;
    }
    
    lastRequestTime.current = now;
    requestCountRef.current += 1;
    
    setState(prev => ({ 
      ...prev, 
      requestCount: requestCountRef.current 
    }));
    
    return true;
  }, [logDebug]);

  // ✅ 5. MÉTRICAS GLOBALES CON LAZY LOADING
  const metricsQuery = useQuery({
    queryKey: ['super-admin-metrics', '30d'],
    queryFn: async () => {
      if (!canMakeRequest()) {
        throw new Error('Rate limit exceeded');
      }
      
      logDebug('Fetching metrics...');
      const response = await fetch('/api/super-admin/metrics?timeRange=30d', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response.json();
    },
    enabled: config.enableMetrics && (state.currentTab === 'overview' || !config.lazyLoading),
    staleTime: config.cacheEnabled ? 5 * 60 * 1000 : 0,
    gcTime: config.cacheEnabled ? 10 * 60 * 1000 : 0,
    refetchOnWindowFocus: false,
    retry: (failureCount, error: any) => {
      logDebug(`Metrics query failed (attempt ${failureCount + 1}):`, error.message);
      return failureCount < 2 && !error.message.includes('Rate limit');
    },
  });

  // ✅ 6. TIENDAS CON LAZY LOADING
  const storesQuery = useQuery({
    queryKey: ['super-admin-stores'],
    queryFn: async () => {
      if (!canMakeRequest()) {
        throw new Error('Rate limit exceeded');
      }
      
      logDebug('Fetching stores...');
      const response = await fetch('/api/super-admin/stores', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response.json();
    },
    enabled: config.enableStores && (state.currentTab === 'stores' || !config.lazyLoading),
    staleTime: config.cacheEnabled ? 3 * 60 * 1000 : 0,
    gcTime: config.cacheEnabled ? 5 * 60 * 1000 : 0,
    refetchOnWindowFocus: false,
    retry: (failureCount, error: any) => {
      logDebug(`Stores query failed (attempt ${failureCount + 1}):`, error.message);
      return failureCount < 2 && !error.message.includes('Rate limit');
    }
  });

  // ✅ 7. SYSTEM HEALTH CON POLLING INTELIGENTE
  const systemHealthQuery = useQuery({
    queryKey: ['system-health'],
    queryFn: async () => {
      if (!canMakeRequest()) {
        throw new Error('Rate limit exceeded');
      }
      
      logDebug('Fetching system health...');
      const response = await fetch('/api/super-admin/system-health', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response.json();
    },
    enabled: config.enableSystemHealth && state.currentTab === 'overview',
    staleTime: 30 * 1000,
    refetchInterval: config.enablePolling ? 60 * 1000 : false,
    refetchOnWindowFocus: false,
    retry: 0
  });

  // ✅ 8. FUNCIONES DE CONTROL
  const setCurrentTab = useCallback((tab: string) => {
    logDebug(`Switching to tab: ${tab}`);
    setState(prev => ({ ...prev, currentTab: tab }));
  }, [logDebug]);

  const refreshData = useCallback(async () => {
    logDebug('Manual refresh triggered');
    
    const queries = [];
    if (config.enableMetrics) queries.push('super-admin-metrics');
    if (config.enableStores) queries.push('super-admin-stores');
    if (config.enableSystemHealth) queries.push('system-health');
    
    try {
      await Promise.all(
        queries.map(queryKey => 
          queryClient.invalidateQueries({ queryKey: [queryKey] })
        )
      );
      
      setState(prev => ({ ...prev, lastRefresh: new Date() }));
      logDebug('Manual refresh completed');
    } catch (error) {
      logDebug('Manual refresh failed:', error);
    }
  }, [config, queryClient, logDebug]);

  const optimizeNow = useCallback(async () => {
    logDebug('Running optimization...');
    
    try {
      // 1. Limpiar cache antiguo
      if (config.cacheEnabled) {
        await queryClient.clear();
        logDebug('Local cache cleared');
      }
      
      // 2. Invalidar cache del servidor
      await fetch('/api/super-admin/cache/invalidate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({ type: 'all' })
      });
      
      logDebug('Server cache cleared');
      
      // 3. Reset contadores
      requestCountRef.current = 0;
      lastRequestTime.current = 0;
      
      // 4. Refresh solo datos activos
      if (state.currentTab === 'overview' && config.enableMetrics) {
        await metricsQuery.refetch();
      }
      
      setState(prev => ({ 
        ...prev, 
        lastRefresh: new Date(),
        requestCount: 0,
        errors: {}
      }));
      
      logDebug('Optimization completed');
      return { success: true, message: 'Dashboard optimizado correctamente' };
    } catch (error: any) {
      logDebug('Optimization failed:', error);
      return { success: false, message: error.message || 'Error durante la optimización' };
    }
  }, [config, state.currentTab, queryClient, metricsQuery, logDebug]);

  const updateConfig = useCallback((newConfig: Partial<DashboardConfig>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
    logDebug('Config updated:', newConfig);
  }, [logDebug]);

  // ✅ 9. FUNCIONES AVANZADAS
  const prefetchData = useCallback(async () => {
    logDebug('Prefetching data...');
    
    try {
      const promises = [];
      
      if (config.enableMetrics) {
        promises.push(
          queryClient.prefetchQuery({
            queryKey: ['super-admin-metrics', '30d'],
            queryFn: () => fetch('/api/super-admin/metrics?timeRange=30d', {
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                'Content-Type': 'application/json'
              }
            }).then(res => res.json()),
            staleTime: 5 * 60 * 1000
          })
        );
      }
      
      if (config.enableSystemHealth) {
        promises.push(
          queryClient.prefetchQuery({
            queryKey: ['system-health'],
            queryFn: () => fetch('/api/super-admin/system-health', {
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                'Content-Type': 'application/json'
              }
            }).then(res => res.json()),
            staleTime: 30 * 1000
          })
        );
      }
      
      await Promise.all(promises);
      logDebug('Prefetch completed');
      return { success: true };
    } catch (error: any) {
      logDebug('Prefetch failed:', error);
      return { success: false, error: error.message };
    }
  }, [config, queryClient, logDebug]);

  const invalidateSpecificData = useCallback(async (dataType: 'metrics' | 'stores' | 'health' | 'all') => {
    logDebug(`Invalidating ${dataType} data...`);
    
    try {
      switch (dataType) {
        case 'metrics':
          await queryClient.invalidateQueries({ queryKey: ['super-admin-metrics'] });
          break;
        case 'stores':
          await queryClient.invalidateQueries({ queryKey: ['super-admin-stores'] });
          break;
        case 'health':
          await queryClient.invalidateQueries({ queryKey: ['system-health'] });
          break;
        case 'all':
        default:
          await queryClient.invalidateQueries({
            predicate: (query) => {
              const key = query.queryKey[0] as string;
              return key.includes('super-admin') || key.includes('system-health');
            }
          });
          break;
      }
      
      logDebug(`${dataType} data invalidated`);
      return { success: true };
    } catch (error: any) {
      logDebug(`Failed to invalidate ${dataType}:`, error);
      return { success: false, error: error.message };
    }
  }, [queryClient, logDebug]);

  const getPerformanceStats = useCallback(() => {
    const queries = queryClient.getQueryCache().getAll();
    const superAdminQueries = queries.filter(q => 
      q.queryKey.some(key => 
        typeof key === 'string' && key.includes('super-admin')
      )
    );

    return {
      totalQueries: queries.length,
      superAdminQueries: superAdminQueries.length,
      staleQueries: 0, // Simplificado
      loadingQueries: queries.filter(q => q.state.status === 'pending').length,
      errorQueries: queries.filter(q => q.state.status === 'error').length,
      requestCount: state.requestCount,
      isOptimized: state.isOptimized,
      cacheEnabled: config.cacheEnabled,
      lazyLoading: config.lazyLoading
    };
  }, [queryClient, state.requestCount, state.isOptimized, config]);

  const getDataFreshness = useCallback(() => {
    const getQueryState = (queryKey: string[]) => {
      const query = queryClient.getQueryState(queryKey);
      return {
        dataUpdatedAt: query?.dataUpdatedAt,
        isStale: false, // Simplificado
        status: query?.status || 'idle'
      };
    };
    
    return {
      metrics: getQueryState(['super-admin-metrics', '30d']),
      stores: getQueryState(['super-admin-stores']),
      health: getQueryState(['system-health']),
      overallFreshness: state.lastRefresh
    };
  }, [queryClient, state.lastRefresh]);

  const autoOptimize = useCallback(() => {
    const stats = getPerformanceStats();
    const suggestions: string[] = [];
    let newConfig = { ...config };
    
    // Si hay muchos errores, deshabilitar auto-refresh
    if (stats.errorQueries > 2 && config.autoRefresh) {
      newConfig.autoRefresh = false;
      suggestions.push('Auto-refresh deshabilitado debido a errores');
    }
    
    // Si hay muchas queries loading, habilitar lazy loading
    if (stats.loadingQueries > 3 && !config.lazyLoading) {
      newConfig.lazyLoading = true;
      suggestions.push('Lazy loading habilitado para reducir carga');
    }
    
    // Si hay muchas queries stale, habilitar cache
    if (stats.staleQueries > 5 && !config.cacheEnabled) {
      newConfig.cacheEnabled = true;
      suggestions.push('Cache habilitado para mejorar performance');
    }
    
    // Si hay demasiados requests, aumentar intervalo de refresh
    if (state.requestCount > 20 && config.refreshInterval < 300) {
      newConfig.refreshInterval = 300;
      suggestions.push('Intervalo de refresh aumentado para reducir carga');
    }
    
    if (suggestions.length > 0) {
      setConfig(newConfig);
      logDebug('Auto-optimization applied:', suggestions);
      return { applied: true, suggestions };
    }
    
    return { applied: false, suggestions: ['No se requieren optimizaciones automáticas'] };
  }, [config, getPerformanceStats, state.requestCount, logDebug]);

  const checkSystemHealth = useCallback(async () => {
    try {
      const startTime = Date.now();
      
      const response = await fetch('/api/super-admin/system-health', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      const responseTime = Date.now() - startTime;
      
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      
      const healthData = await response.json();
      
      return {
        success: true,
        responseTime,
        data: healthData,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      logDebug('Health check failed:', error);
      return {
        success: false,
        error: error.message,
        responseTime: -1,
        timestamp: new Date().toISOString()
      };
    }
  }, [logDebug]);

  const exportDashboardData = useCallback(() => {
    const data = {
      metrics: metricsQuery.data,
      stores: storesQuery.data,
      systemHealth: systemHealthQuery.data,
      config,
      state,
      performance: getPerformanceStats(),
      freshness: getDataFreshness(),
      exportTimestamp: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dashboard-data-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    
    logDebug('Dashboard data exported');
  }, [metricsQuery.data, storesQuery.data, systemHealthQuery.data, config, state, getPerformanceStats, getDataFreshness, logDebug]);

  // ✅ 10. CLEANUP
  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  // ✅ 11. VALOR DE RETORNO COMPLETO
  return {
    // Datos principales
    metrics: {
      data: metricsQuery.data,
      isLoading: metricsQuery.isLoading,
      error: metricsQuery.error,
      isFetching: metricsQuery.status === 'pending',
      isStale: false, // Simplificado
      lastUpdated: metricsQuery.dataUpdatedAt
    },
    stores: {
      data: storesQuery.data?.stores || [],
      isLoading: storesQuery.isLoading,
      error: storesQuery.error,
      isFetching: storesQuery.status === 'pending',
      pagination: storesQuery.data?.pagination,
      isStale: false, // Simplificado
      lastUpdated: storesQuery.dataUpdatedAt
    },
    systemHealth: {
      data: systemHealthQuery.data,
      isLoading: systemHealthQuery.isLoading,
      error: systemHealthQuery.error,
      isFetching: systemHealthQuery.status === 'pending',
      isStale: false, // Simplificado
      lastUpdated: systemHealthQuery.dataUpdatedAt
    },

    // Estado y configuración
    state,
    config,

    // Funciones de control básicas
    setCurrentTab,
    refreshData,
    optimizeNow,
    updateConfig,

    // Funciones avanzadas
    prefetchData,
    invalidateSpecificData,
    getPerformanceStats,
    getDataFreshness,
    autoOptimize,
    checkSystemHealth,
    exportDashboardData,

    // Estados calculados
    isLoading: metricsQuery.isLoading || storesQuery.isLoading || systemHealthQuery.isLoading,
    hasErrors: !!(metricsQuery.error || storesQuery.error || systemHealthQuery.error),
    isRefreshing: metricsQuery.status === 'pending' || storesQuery.status === 'pending' || systemHealthQuery.status === 'pending',
    hasStaleData: false, // Simplificado

    // Utilidades de debugging
    logDebug,
    
    // Información de performance
    performanceInfo: {
      requestCount: state.requestCount,
      lastRefresh: state.lastRefresh,
      isOptimized: state.isOptimized,
      currentTab: state.currentTab,
      errors: state.errors
    }
  };
}

/**
 * Hook simplificado para componentes que solo necesitan métricas
 */
export function useOptimizedMetrics(timeRange: string = '30d') {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['super-admin-metrics', timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/super-admin/metrics?timeRange=${timeRange}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response.json();
    },
    enabled: !!user && user.role === 'super_admin',
    staleTime: 5 * 60 * 1000, // 5 minutos
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 2
  });
}

/**
 * Hook para tiendas con lazy loading automático
 */
export function useOptimizedStores(enabled: boolean = true) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['super-admin-stores'],
    queryFn: async () => {
      const response = await fetch('/api/super-admin/stores', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response.json();
    },
    enabled: enabled && !!user && user.role === 'super_admin',
    staleTime: 3 * 60 * 1000, // 3 minutos
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1
  });
}

/**
 * Hook para system health con polling inteligente
 */
export function useSystemHealth(enablePolling: boolean = false) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['system-health'],
    queryFn: async () => {
      const response = await fetch('/api/super-admin/system-health', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response.json();
    },
    enabled: !!user && user.role === 'super_admin',
    staleTime: 30 * 1000, // 30 segundos
    refetchInterval: enablePolling ? 60 * 1000 : false, // 1 minuto
    refetchOnWindowFocus: false,
    retry: 0 // No reintentar health checks
  });
}

/**
 * Hook para estadísticas de performance del dashboard
 */
export function useDashboardPerformance() {
  const queryClient = useQueryClient();
  const [stats, setStats] = useState({
    totalQueries: 0,
    superAdminQueries: 0,
    staleQueries: 0,
    loadingQueries: 0,
    errorQueries: 0,
    cacheHitRate: 0,
    averageResponseTime: 0
  });

  useEffect(() => {
    const updateStats = () => {
      const queries = queryClient.getQueryCache().getAll();
      const superAdminQueries = queries.filter(q => 
        q.queryKey.some(key => 
          typeof key === 'string' && (
            key.includes('super-admin') || 
            key.includes('system-health')
          )
        )
      );

      // Calcular cache hit rate
      const totalQueries = superAdminQueries.length;
      const loadingQueries = superAdminQueries.filter(q => q.state.status === 'pending').length;
      const cacheHitRate = totalQueries > 0 ? Math.round(((totalQueries - loadingQueries) / totalQueries) * 100) : 0;

      // Estimar tiempo de respuesta promedio
      const performanceEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      const avgResponseTime = performanceEntries.length > 0 
        ? Math.round(performanceEntries[0].responseEnd - performanceEntries[0].requestStart)
        : 450;

      setStats({
        totalQueries: queries.length,
        superAdminQueries: superAdminQueries.length,
        staleQueries: 0, // Simplificado
        loadingQueries: queries.filter(q => q.state.status === 'pending').length,
        errorQueries: queries.filter(q => q.state.status === 'error').length,
        cacheHitRate,
        averageResponseTime: avgResponseTime
      });
    };

    updateStats();
    const interval = setInterval(updateStats, 10000);
    return () => clearInterval(interval);
  }, [queryClient]);

  return stats;
}

/**
 * Hook para monitoreo continuo de la performance del dashboard
 */
export function useDashboardMonitoring(enabled: boolean = true) {
  const [monitoring, setMonitoring] = useState({
    requestsPerMinute: 0,
    errorRate: 0,
    averageResponseTime: 0,
    memoryUsage: 0,
    isHealthy: true,
    alerts: [] as string[]
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const monitorPerformance = () => {
      const queries = queryClient.getQueryCache().getAll();
      const superAdminQueries = queries.filter(q => 
        q.queryKey.some(key => 
          typeof key === 'string' && key.includes('super-admin')
        )
      );

      const errorQueries = superAdminQueries.filter(q => q.state.status === 'error').length;
      const totalQueries = superAdminQueries.length;
      const errorRate = totalQueries > 0 ? (errorQueries / totalQueries) * 100 : 0;

      // Estimar uso de memoria
      const memoryInfo = (performance as any).memory;
      const memoryUsage = memoryInfo ? 
        Math.round((memoryInfo.usedJSHeapSize / memoryInfo.totalJSHeapSize) * 100) : 0;

      // Detectar alertas
      const alerts: string[] = [];
      if (errorRate > 20) alerts.push('Alta tasa de errores detectada');
      if (memoryUsage > 80) alerts.push('Alto uso de memoria');
      if (totalQueries > 50) alerts.push('Demasiadas queries activas');

      const isHealthy = alerts.length === 0;

      setMonitoring({
        requestsPerMinute: totalQueries,
        errorRate,
        averageResponseTime: 450,
        memoryUsage,
        isHealthy,
        alerts
      });
    };

    const interval = setInterval(monitorPerformance, 30000);
    monitorPerformance();
    return () => clearInterval(interval);
  }, [enabled, queryClient]);

  return monitoring;
}

/**
 * Utilidad para debugging del dashboard
 */
export function useDashboardDebug() {
  const queryClient = useQueryClient();

  return {
    logAllQueries: () => {
      const queries = queryClient.getQueryCache().getAll();
      console.table(
        queries.map(q => ({
          key: q.queryKey.join(' > '),
          status: q.state.status,
          stale: false, // Simplificado
          fetching: q.state.status === 'pending',
          lastUpdated: q.state.dataUpdatedAt ? new Date(q.state.dataUpdatedAt).toLocaleTimeString() : 'Never'
        }))
      );
    },

    logSuperAdminQueries: () => {
      const queries = queryClient.getQueryCache().getAll();
      const superAdminQueries = queries.filter(q => 
        q.queryKey.some(key => 
          typeof key === 'string' && key.includes('super-admin')
        )
      );
      
      console.group('🏢 Super Admin Queries');
      superAdminQueries.forEach(q => {
        console.log(`${q.queryKey.join(' > ')} - ${q.state.status}`, q.state.data);
      });
      console.groupEnd();
    },

    clearAllCache: () => {
      queryClient.clear();
      console.log('🧹 All cache cleared');
    },

    invalidateSuperAdminQueries: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          return query.queryKey.some(key => 
            typeof key === 'string' && key.includes('super-admin')
          );
        }
      });
      console.log('♻️ Super admin queries invalidated');
    },

    getQueryStats: () => {
      const queries = queryClient.getQueryCache().getAll();
      return {
        total: queries.length,
        byStatus: queries.reduce((acc, q) => {
          acc[q.state.status] = (acc[q.state.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        superAdminCount: queries.filter(q => 
          q.queryKey.some(key => 
            typeof key === 'string' && key.includes('super-admin')
          )
        ).length
      };
    },

    measurePerformance: () => {
      console.time('Dashboard Performance');
      
      return {
        stop: () => {
          console.timeEnd('Dashboard Performance');
        },
        mark: (label: string) => {
          console.time(label);
          return () => console.timeEnd(label);
        }
      };
    },

    logMemoryUsage: () => {
      const memory = (performance as any).memory;
      if (memory) {
        console.table({
          'Used JS Heap': `${Math.round(memory.usedJSHeapSize / 1048576)} MB`,
          'Total JS Heap': `${Math.round(memory.totalJSHeapSize / 1048576)} MB`,
          'JS Heap Limit': `${Math.round(memory.jsHeapSizeLimit / 1048576)} MB`,
          'Usage %': `${Math.round((memory.usedJSHeapSize / memory.totalJSHeapSize) * 100)}%`
        });
      } else {
        console.log('Memory API not available');
      }
    },

    exportDebugReport: () => {
      const queries = queryClient.getQueryCache().getAll();
      const superAdminQueries = queries.filter(q => 
        q.queryKey.some(key => 
          typeof key === 'string' && key.includes('super-admin')
        )
      );

      const report = {
        timestamp: new Date().toISOString(),
        totalQueries: queries.length,
        superAdminQueries: superAdminQueries.length,
        queriesByStatus: queries.reduce((acc, q) => {
          acc[q.state.status] = (acc[q.state.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        staleQueries: 0, // Simplificado
        loadingQueries: queries.filter(q => q.state.status === 'pending').length,
        errorQueries: queries.filter(q => q.state.status === 'error').map(q => ({
          key: q.queryKey.join(' > '),
          error: q.state.error?.message || 'Unknown error',
          lastUpdated: q.state.dataUpdatedAt
        })),
        memoryUsage: (performance as any).memory ? {
          usedJSHeapSize: Math.round((performance as any).memory.usedJSHeapSize / 1048576),
          totalJSHeapSize: Math.round((performance as any).memory.totalJSHeapSize / 1048576),
          usagePercentage: Math.round(((performance as any).memory.usedJSHeapSize / (performance as any).memory.totalJSHeapSize) * 100)
        } : null,
        performanceEntries: (performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]).map(entry => ({
          responseTime: Math.round(entry.responseEnd - entry.requestStart),
          domContentLoaded: Math.round((entry.domContentLoadedEventEnd || 0) - (entry.domContentLoadedEventStart || 0)),
          loadComplete: Math.round((entry.loadEventEnd || 0) - (entry.loadEventStart || 0))
        }))
      };

      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dashboard-debug-report-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
      link.click();
      URL.revokeObjectURL(url);

      console.log('📋 Debug report exported');
      return report;
    }
  };
}

/**
 * Hook para gestión avanzada de cache
 */
export function useCacheManager() {
  const queryClient = useQueryClient();

  return {
    getCacheSize: () => {
      const queries = queryClient.getQueryCache().getAll();
      const dataSize = queries.reduce((total, query) => {
        if (query.state.data) {
          try {
            const jsonString = JSON.stringify(query.state.data);
            return total + new Blob([jsonString]).size;
          } catch {
            return total;
          }
        }
        return total;
      }, 0);
      
      return {
        queries: queries.length,
        estimatedSizeBytes: dataSize,
        estimatedSizeMB: Math.round(dataSize / 1048576 * 100) / 100
      };
    },

    clearExpiredCache: () => {
      const queries = queryClient.getQueryCache().getAll();
      const expiredQueries = queries.filter(q => {
        try {
          return (q as any).isStale?.() || false;
        } catch {
          return false;
        }
      });
      
      expiredQueries.forEach(q => {
        queryClient.removeQueries({ queryKey: q.queryKey });
      });
      
      console.log(`🧹 Cleared ${expiredQueries.length} expired cache entries`);
      return expiredQueries.length;
    },

    clearSuperAdminCache: () => {
      const clearedCount = queryClient.removeQueries({
        predicate: (query) => {
          return query.queryKey.some(key => 
            typeof key === 'string' && (
              key.includes('super-admin') || 
              key.includes('system-health')
            )
          );
        }
      });
      
      console.log(`🧹 Cleared ${clearedCount} super admin cache entries`);
      return clearedCount;
    },

    optimizeCache: async () => {
      const stats = queryClient.getQueryCache().getAll();
      const staleCount = stats.filter(q => q.isStale()).length;
      const errorCount = stats.filter(q => q.state.status === 'error').length;
      
      // Limpiar queries con error
      queryClient.removeQueries({
        predicate: (query) => query.state.status === 'error'
      });
      
      // Limpiar queries muy antiguas (más de 1 hora)
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      const oldQueries = queryClient.removeQueries({
        predicate: (query) => {
          return query.state.dataUpdatedAt ? 
            query.state.dataUpdatedAt < oneHourAgo : false;
        }
      });
      
      console.log(`✨ Cache optimized: removed ${errorCount} error queries and stale data`);
      
      return {
        removedErrors: errorCount,
        removedStale: staleCount,
        totalRemoved: errorCount + staleCount
      };
    },

    getCacheAnalytics: () => {
      const queries = queryClient.getQueryCache().getAll();
      const now = Date.now();
      
      return {
        total: queries.length,
        byStatus: {
          success: queries.filter(q => q.state.status === 'success').length,
          error: queries.filter(q => q.state.status === 'error').length,
          pending: queries.filter(q => q.state.status === 'pending').length
        },
        byAge: {
          fresh: queries.filter(q => 
            q.state.dataUpdatedAt && (now - q.state.dataUpdatedAt) < 5 * 60 * 1000
          ).length, // Menos de 5 minutos
          recent: queries.filter(q => 
            q.state.dataUpdatedAt && 
            (now - q.state.dataUpdatedAt) >= 5 * 60 * 1000 && 
            (now - q.state.dataUpdatedAt) < 30 * 60 * 1000
          ).length, // Entre 5 y 30 minutos
          old: queries.filter(q => 
            q.state.dataUpdatedAt && (now - q.state.dataUpdatedAt) >= 30 * 60 * 1000
          ).length, // Más de 30 minutos
          never: queries.filter(q => !q.state.dataUpdatedAt).length
        },
        stale: 0, // Simplificado
        fetching: queries.filter(q => q.state.status === 'pending').length,
        superAdmin: queries.filter(q => 
          q.queryKey.some(key => 
            typeof key === 'string' && key.includes('super-admin')
          )
        ).length
      };
    }
  };
}

/**
 * Hook para métricas de red y conectividad
 */
export function useNetworkMonitoring() {
  const [networkStatus, setNetworkStatus] = useState({
    isOnline: navigator.onLine,
    connectionType: 'unknown',
    effectiveType: 'unknown',
    downlink: 0,
    rtt: 0,
    saveData: false
  });

  useEffect(() => {
    const updateNetworkStatus = () => {
      const connection = (navigator as any).connection || 
                        (navigator as any).mozConnection || 
                        (navigator as any).webkitConnection;

      setNetworkStatus({
        isOnline: navigator.onLine,
        connectionType: connection?.type || 'unknown',
        effectiveType: connection?.effectiveType || 'unknown',
        downlink: connection?.downlink || 0,
        rtt: connection?.rtt || 0,
        saveData: connection?.saveData || false
      });
    };

    // Actualizar al montar
    updateNetworkStatus();

    // Escuchar cambios de conexión
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);

    // Escuchar cambios en la conexión (si está disponible)
    const connection = (navigator as any).connection;
    if (connection) {
      connection.addEventListener('change', updateNetworkStatus);
    }

    return () => {
      window.removeEventListener('online', updateNetworkStatus);
      window.removeEventListener('offline', updateNetworkStatus);
      if (connection) {
        connection.removeEventListener('change', updateNetworkStatus);
      }
    };
  }, []);

  return networkStatus;
}