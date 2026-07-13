// client/src/lib/queryClient.ts
import { QueryClient, DefaultOptions } from "@tanstack/react-query";

/* -------------------------------------------------------------------------- */
/* 1. CONFIGURACIÓN OPTIMIZADA DE TANSTACK QUERY                             */
/* -------------------------------------------------------------------------- */

const defaultQueryOptions: DefaultOptions = {
  queries: {
    // ✅ Cache más agresivo para datos del super admin
    staleTime: 5 * 60 * 1000, // 5 minutos antes de considerar stale
    gcTime: 10 * 60 * 1000, // 10 minutos en cache
    
    // ✅ Reduce llamadas innecesarias
    refetchOnWindowFocus: false, // No refrescar al cambiar de ventana
    refetchOnReconnect: true, // Sí refrescar al reconectarse
    refetchIntervalInBackground: false, // No refrescar en background
    
    // ✅ Manejo de errores más robusto
    retry: (failureCount, error: any) => {
      // No reintentar errores de autenticación
      if (error?.status === 401 || error?.status === 403) {
        return false;
      }
      // Solo reintentar errores del servidor hasta 2 veces
      if (error?.status >= 500) {
        return failureCount < 2;
      }
      // Para otros errores, reintentar una vez
      return failureCount < 1;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    
    // ✅ Query function optimizada con mejor manejo de errores
    queryFn: ({ queryKey, signal }) => {
      const url = queryKey[0] as string;
      return apiRequest("GET", url, undefined, { signal });
    },
  },
  mutations: {
    retry: 1,
    retryDelay: 1000,
  },
};

// ✅ Cliente con configuración de desarrollo para debugging
export const queryClient = new QueryClient({
  defaultOptions: defaultQueryOptions,
});

/* -------------------------------------------------------------------------- */
/* 2. HELPER HTTP OPTIMIZADO CON MEJOR MANEJO DE ERRORES                     */
/* -------------------------------------------------------------------------- */

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface ApiError extends Error {
  status?: number;
  statusText?: string;
  data?: any;
}

/**
 * Cliente HTTP optimizado con manejo robusto de errores y caché
 */
export async function apiRequest<T = unknown>(
  method: HttpMethod,
  url: string,
  data?: unknown,
  options: RequestInit = {},
): Promise<T> {
  
  const startTime = Date.now();
  
  try {
    /* ------------------------------ Headers --------------------------------- */
    const token = localStorage.getItem("auth_token");
    
    const headers: HeadersInit = {
      Accept: "application/json",
      ...(method !== "GET" && { "Content-Type": "application/json" }),
      ...options.headers,
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // Active company for the multi-company accounting/fiscal API. The server
    // still verifies membership against user_companies, so a tampered value is
    // rejected rather than trusted; absent, the server uses the user's default.
    const activeCompanyId = localStorage.getItem("active_company_id");
    if (activeCompanyId) {
      headers["X-Company-Id"] = activeCompanyId;
    }

    /* ------------------------------ Request --------------------------------- */
    const fetchOptions: RequestInit = {
      ...options,
      method,
      headers,
      credentials: "include",
      // ✅ Timeout para evitar requests colgados
      signal: options.signal || AbortSignal.timeout(30000),
    };

    if (data && method !== "GET") {
      fetchOptions.body = JSON.stringify(data);
    }

    const fullUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;
    
    // ✅ Log solo en desarrollo con información útil
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔗 ${method} ${fullUrl}`, {
        hasAuth: !!token,
        hasData: !!data,
        signal: !!options.signal
      });
    }

    const response = await fetch(fullUrl, fetchOptions);
    const endTime = Date.now();
    
    // ✅ Log de performance en desarrollo
    if (process.env.NODE_ENV === 'development') {
      console.log(`⏱️ ${method} ${fullUrl} - ${endTime - startTime}ms - ${response.status}`);
    }

    /* ------------------------------ Error Handling -------------------------- */
    if (!response.ok) {
      let errorData: any = null;
      let message = `${response.status} ${response.statusText}`;
      
      try {
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          errorData = await response.json();
          message = errorData?.message || errorData?.error || message;
        } else {
          const textError = await response.text();
          if (textError) message = textError;
        }
      } catch (parseError) {
        console.warn("Could not parse error response:", parseError);
      }

      const apiError: ApiError = new Error(message);
      apiError.status = response.status;
      apiError.statusText = response.statusText;
      apiError.data = errorData;
      
      throw apiError;
    }

    /* ------------------------------ Success Response ----------------------- */
    const contentType = response.headers.get("content-type") || "";
    
    // No content (204)
    if (response.status === 204 || !contentType) {
      return undefined as T;
    }
    
    // JSON response
    if (contentType.includes("application/json")) {
      const jsonData = await response.json();
      return jsonData as T;
    }
    
    // Text/other response
    const textData = await response.text();
    return textData as T;
    
  } catch (error) {
    // ✅ Manejo mejorado de errores de red/timeout
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.warn(`Request timeout: ${method} ${url}`);
        throw new Error('La solicitud tardó demasiado en responder');
      }
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        console.error(`Network error: ${method} ${url}`, error);
        throw new Error('Error de conexión. Verifique su internet.');
      }
    }
    
    // Re-throw el error original
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* 3. HELPERS ESPECÍFICOS PARA SUPER ADMIN                                   */
/* -------------------------------------------------------------------------- */

/**
 * Obtiene métricas globales con cache inteligente
 */
export async function fetchGlobalMetrics(timeRange: string = '30d'): Promise<any> {
  return apiRequest("GET", `/api/super-admin/metrics?timeRange=${timeRange}`);
}

/**
 * Obtiene lista de tiendas con paginación opcional
 */
export async function fetchStores(): Promise<any> {
  return apiRequest("GET", "/api/super-admin/stores");
}

/**
 * Obtiene estado de salud del sistema
 */
export async function fetchSystemHealth(): Promise<any> {
  return apiRequest("GET", "/api/super-admin/system-health");
}

/* -------------------------------------------------------------------------- */
/* 4. UTILIDADES DE CACHE Y INVALIDACIÓN                                     */
/* -------------------------------------------------------------------------- */

/**
 * Invalida todas las queries relacionadas con super admin
 */
export function invalidateSuperAdminQueries() {
  queryClient.invalidateQueries({ 
    predicate: (query) => {
      const queryKey = query.queryKey[0] as string;
      return queryKey.startsWith('/api/super-admin/') || 
             queryKey.startsWith('super-admin-');
    }
  });
}

/**
 * Pre-carga datos importantes del super admin
 */
export function prefetchSuperAdminData() {
  // Pre-cargar métricas principales
  queryClient.prefetchQuery({
    queryKey: ['super-admin-metrics', '30d'],
    queryFn: () => fetchGlobalMetrics('30d'),
    staleTime: 3 * 60 * 1000, // 3 minutos
  });
  
  // Pre-cargar salud del sistema
  queryClient.prefetchQuery({
    queryKey: ['system-health'],
    queryFn: fetchSystemHealth,
    staleTime: 30 * 1000, // 30 segundos
  });
}

export async function apiGet<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  return apiRequest<T>("GET", url, undefined, options);
}

/**
 * Limpia cache antiguo para liberar memoria
 */
export function cleanupOldCache() {
  queryClient.getQueryCache().clear();
}

/* -------------------------------------------------------------------------- */
/* 5. HOOKS PERSONALIZADOS OPTIMIZADOS                                       */
/* -------------------------------------------------------------------------- */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Hook optimizado para métricas globales
 */
export function useGlobalMetrics(timeRange: string = '30d') {
  return useQuery({
    queryKey: ['super-admin-metrics', timeRange],
    queryFn: () => fetchGlobalMetrics(timeRange),
    staleTime: 5 * 60 * 1000, // 5 minutos
    gcTime: 10 * 60 * 1000, // 10 minutos
    refetchOnWindowFocus: false,
    retry: 2,
  });
}

/**
 * Hook optimizado para lista de tiendas con lazy loading
 */
export function useStores(enabled: boolean = true) {
  return useQuery({
    queryKey: ['super-admin-stores'],
    queryFn: fetchStores,
    enabled,
    staleTime: 3 * 60 * 1000, // 3 minutos
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook para salud del sistema con polling inteligente
 */
export function useSystemHealth(enabled: boolean = true) {
  return useQuery({
    queryKey: ['system-health'],
    queryFn: fetchSystemHealth,
    enabled,
    staleTime: 30 * 1000, // 30 segundos
    refetchInterval: enabled ? 60 * 1000 : false, // Polling cada minuto
    retry: 0, // No reintentar health checks
  });
}

/* -------------------------------------------------------------------------- */
/* 6. CONFIGURACIÓN DE DESARROLLO Y DEBUGGING                                */
/* -------------------------------------------------------------------------- */

// ✅ Solo en desarrollo: herramientas de debug
if (process.env.NODE_ENV === 'development') {
  // Exponer queryClient globalmente para debugging
  (window as any).__QUERY_CLIENT__ = queryClient;
  
  // Log de cambios de cache
  queryClient.getQueryCache().subscribe((event) => {
    if (event?.type === 'updated') {
      console.log(`[Query Cache] Updated: ${event.query.queryKey.join(' > ')}`);
    }
  });
  
  // Herramientas de debugging
  (window as any).__QUERY_UTILS__ = {
    invalidateAll: () => queryClient.invalidateQueries(),
    clearCache: () => queryClient.clear(),
    getSuperAdminQueries: () => {
      return queryClient.getQueryCache().findAll({
        predicate: (query) => {
          const key = query.queryKey[0] as string;
          return key.includes('super-admin') || key.includes('/api/super-admin/');
        }
      });
    },
    getQueryStats: () => {
      const cache = queryClient.getQueryCache();
      const queries = cache.getAll();
      
      return {
        total: queries.length,
        stale: 0, // Simplificado
        loading: queries.filter(q => q.state.status === 'pending').length,
        error: queries.filter(q => q.state.status === 'error').length,
        success: queries.filter(q => q.state.status === 'success').length,
      };
    }
  };
  
  // Log periódico del estado del cache (solo en desarrollo)
  setInterval(() => {
    const stats = (window as any).__QUERY_UTILS__.getQueryStats();
    console.log(`[Query Stats] Total: ${stats.total} | Stale: ${stats.stale} | Loading: ${stats.loading} | Errors: ${stats.error}`);
  }, 30000); // Cada 30 segundos
}
