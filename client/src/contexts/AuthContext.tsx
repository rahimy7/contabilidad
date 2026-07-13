import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { AuthUser } from '@shared/auth';
import { apiRequest } from '@/lib/queryClient';
import React from "react";


interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ✅ Usar useCallback para evitar re-creación en cada render
  const checkAuthStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setIsLoading(false);
        return;
      }

      // Decode JWT token locally instead of making API call
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        
        // Check if token is expired
        const currentTime = Date.now() / 1000;
        if (payload.exp && payload.exp < currentTime) {
          throw new Error('Token expired');
        }

        // Set user data from token
        setUser({
          id: payload.userId ?? payload.id,
          username: payload.username,
          name: payload.name || payload.username,
          role: payload.role,
          status: payload.status || 'active',
          storeId: payload.storeId,
          level: payload.level,
          warehouseId: payload.warehouseId ?? undefined,
          warehouseName: payload.warehouseName ?? undefined,
        });
      } catch (tokenError) {
        console.log('Invalid or expired token');
        localStorage.removeItem('auth_token');
        setUser(null);
      }
    } catch (error) {
      console.log('No active session found');
      localStorage.removeItem('auth_token');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const login = async (username: string, password: string) => {
    const loginData = { username, password };

    const response = await apiRequest('POST', '/api/auth/login', loginData);
    const { user: userData, token } = response as { user: AuthUser; token: string };

    localStorage.setItem('auth_token', token);
    setUser(userData);

    // Redirección automática después del login exitoso
    setTimeout(() => {
      window.location.href = '/';
    }, 100);
  };

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    setUser(null);
    // Recargar la página para limpiar cualquier estado persistente
    window.location.href = '/login';
  }, []);

  // ✅ CORREGIDO: Era `!AuthContext.tsx!user` (typo)
  const value = {
    user,
    isLoading,
    login,
    logout,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}