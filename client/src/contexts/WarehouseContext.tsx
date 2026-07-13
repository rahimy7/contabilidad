/**
 * WarehouseContext — contexto global del almacén activo.
 *
 * Reglas:
 * - Usuarios operativos (cajero/ventas): usan su warehouseId del JWT, no pueden cambiarlo.
 * - Admin / super_admin: pueden seleccionar cualquier almacén, o "todos" (null).
 *
 * Uso:
 *   const { activeWarehouseId, setActiveWarehouseId, canViewAll } = useWarehouse();
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import React from 'react';

interface WarehouseContextType {
  /** null = corporativo (todos los almacenes); number = almacén específico */
  activeWarehouseId: number | null;
  /** Solo cambia si canViewAll === true */
  setActiveWarehouseId: (id: number | null) => void;
  /** true si el usuario puede ver todos los almacenes */
  canViewAll: boolean;
  /** Nombre del almacén activo o "Todos" si es corporativo */
  activeWarehouseName: string;
}

const WarehouseContext = createContext<WarehouseContextType | undefined>(undefined);

const CAN_VIEW_ALL_ROLES = ['admin', 'super_admin'];

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const canViewAll = CAN_VIEW_ALL_ROLES.includes(user?.role ?? '');

  // El almacén activo es el del usuario (fijo) si no puede ver todos, o el seleccionado si puede
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Sincronizar cuando el usuario cambia (login/logout)
  useEffect(() => {
    if (!user) {
      setSelectedId(null);
      return;
    }
    if (!canViewAll && user.warehouseId) {
      setSelectedId(user.warehouseId);
    } else if (canViewAll) {
      // Admin: por defecto ver todos (null)
      const stored = localStorage.getItem('selected_warehouse_id');
      setSelectedId(stored ? parseInt(stored) || null : null);
    }
  }, [user?.id, user?.warehouseId, canViewAll]);

  const setActiveWarehouseId = (id: number | null) => {
    if (!canViewAll) return; // operativos no pueden cambiar
    setSelectedId(id);
    if (id === null) {
      localStorage.removeItem('selected_warehouse_id');
    } else {
      localStorage.setItem('selected_warehouse_id', String(id));
    }
  };

  const activeWarehouseId = !canViewAll ? (user?.warehouseId ?? null) : selectedId;

  const activeWarehouseName =
    activeWarehouseId === null
      ? 'Todos los almacenes'
      : (user?.warehouseId === activeWarehouseId && user?.warehouseName)
        ? user.warehouseName
        : `Almacén ${activeWarehouseId}`;

  return (
    <WarehouseContext.Provider
      value={{ activeWarehouseId, setActiveWarehouseId, canViewAll, activeWarehouseName }}
    >
      {children}
    </WarehouseContext.Provider>
  );
}

export function useWarehouse(): WarehouseContextType {
  const ctx = useContext(WarehouseContext);
  if (!ctx) throw new Error('useWarehouse must be used inside WarehouseProvider');
  return ctx;
}
