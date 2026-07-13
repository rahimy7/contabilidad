/**
 * WarehouseSwitcher — componente de selección de almacén para el sidebar.
 *
 * - Si el usuario es admin/super_admin: muestra un Select con todos los almacenes + opción "Todos"
 * - Si el usuario es operativo: muestra solo un badge con el nombre de su almacén asignado
 */

import { useWarehouse } from '@/contexts/WarehouseContext';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building2 } from 'lucide-react';
import React from 'react';

interface Warehouse {
  id: number;
  name: string;
  code?: string;
}

export function WarehouseSwitcher() {
  const { activeWarehouseId, setActiveWarehouseId, canViewAll, activeWarehouseName } = useWarehouse();

  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ['/api/warehouses'],
    queryFn: () => apiRequest('GET', '/api/warehouses') as Promise<Warehouse[]>,
    enabled: canViewAll,
    staleTime: 5 * 60 * 1000,
  });

  if (!canViewAll) {
    // Usuarios operativos: solo un badge informativo
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium truncate">{activeWarehouseName}</span>
      </div>
    );
  }

  // Admin: selector completo
  const value = activeWarehouseId === null ? 'all' : String(activeWarehouseId);

  const handleChange = (val: string) => {
    setActiveWarehouseId(val === 'all' ? null : parseInt(val));
  };

  return (
    <Select value={value} onValueChange={handleChange}>
      <SelectTrigger className="h-8 text-xs gap-1.5 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <SelectValue placeholder="Almacén" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos los almacenes</SelectItem>
        {warehouses.map((wh) => (
          <SelectItem key={wh.id} value={String(wh.id)}>
            {wh.name}
            {wh.code ? ` (${wh.code})` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
