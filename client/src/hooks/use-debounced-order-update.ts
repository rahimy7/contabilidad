// client/src/hooks/use-debounced-order-update.ts
import { useRef, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface UpdateOrderParams {
  id: number;
  [key: string]: any;
}

export function useDebouncedOrderUpdate() {
  const { toast } = useToast();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdateRef = useRef<UpdateOrderParams | null>(null);

  const updateOrderMutation = useMutation({
    mutationFn: async ({ id, ...data }: UpdateOrderParams) => {
      return apiRequest("PUT", `/api/orders/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Orden actualizada",
        description: "Los cambios se han guardado correctamente.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo actualizar la orden.",
        variant: "destructive",
      });
      console.error("Error updating order:", error);
    },
  });

  const debouncedUpdate = useCallback((params: UpdateOrderParams) => {
    // Cancelar cualquier actualización pendiente
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Fusionar con actualización pendiente si existe
    if (pendingUpdateRef.current && pendingUpdateRef.current.id === params.id) {
      pendingUpdateRef.current = {
        ...pendingUpdateRef.current,
        ...params
      };
    } else {
      pendingUpdateRef.current = params;
    }

    // Programar nueva actualización
    timeoutRef.current = setTimeout(() => {
      if (pendingUpdateRef.current) {
        updateOrderMutation.mutate(pendingUpdateRef.current);
        pendingUpdateRef.current = null;
      }
      timeoutRef.current = null;
    }, 300); // 300ms de espera

  }, [updateOrderMutation]);

  const immediateUpdate = useCallback((params: UpdateOrderParams) => {
    // Cancelar cualquier actualización pendiente
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    pendingUpdateRef.current = null;
    
    // Ejecutar inmediatamente
    updateOrderMutation.mutate(params);
  }, [updateOrderMutation]);

  return {
    debouncedUpdate,
    immediateUpdate,
    isPending: updateOrderMutation.isPending
  };
}