/**
 * WarehouseSwitcher — el almacén activo.
 *
 * - Admin/super_admin: desplegable con todos los almacenes + "Todos".
 * - Usuario operativo: sólo el nombre del almacén que tiene asignado.
 *
 * `variant="bar"` lo compacta para la franja de contexto, donde convive con el
 * período contable: los dos son estado, no acción, y por eso van en gris y no
 * en color.
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
import { Warehouse as WarehouseIcon } from 'lucide-react';
import React from 'react';

interface Warehouse {
  id: number;
  name: string;
  code?: string;
}

interface WarehouseSwitcherProps {
  variant?: 'panel' | 'bar';
}

export function WarehouseSwitcher({ variant = 'panel' }: WarehouseSwitcherProps) {
  const { activeWarehouseId, setActiveWarehouseId, canViewAll, activeWarehouseName } = useWarehouse();
  const bar = variant === 'bar';

  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ['/api/warehouses'],
    queryFn: () => apiRequest('GET', '/api/warehouses') as Promise<Warehouse[]>,
    enabled: canViewAll,
    staleTime: 5 * 60 * 1000,
  });

  if (!canViewAll) {
    return (
      <div className="flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-[12px] text-muted-foreground">
        <WarehouseIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate font-medium">{activeWarehouseName}</span>
      </div>
    );
  }

  const value = activeWarehouseId === null ? 'all' : String(activeWarehouseId);

  const handleChange = (val: string) => {
    setActiveWarehouseId(val === 'all' ? null : parseInt(val));
  };

  return (
    <Select value={value} onValueChange={handleChange}>
      <SelectTrigger
        className={
          bar
            ? 'h-[26px] gap-1.5 border-border px-2 text-[12px] text-muted-foreground'
            : 'h-8 gap-1.5 text-[12px]'
        }
      >
        <WarehouseIcon className="h-3.5 w-3.5 shrink-0" />
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
