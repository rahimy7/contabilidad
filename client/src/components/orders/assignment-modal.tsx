// client/src/components/orders/assignment-modal.tsx
import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { UserCheck, Zap, User } from "lucide-react";

interface AssignableUser {
  id: number;
  name: string;
  role: string;
  status: string;
}

interface OrderWithDetails {
  id: number;
  orderNumber: string;
  status: string;
  totalAmount: string;
  notes: string | null;
  description: string | null;
  priority: string;
  createdAt: string;
  updatedAt: string;
  assignedUserId: number | null;
  deliveryAddress?: string;
  customer: {
    id: number;
    name: string;
    phone: string;
    address: string | null;
  };
  assignedUser?: {
    id: number;
    name: string;
    role: string;
  } | null;
}

interface AssignmentModalProps {
  order: OrderWithDetails | null;
  isOpen: boolean;
  onClose: (assigned?: boolean) => void;
}

export default function AssignmentModal({ order, isOpen, onClose }: AssignmentModalProps) {
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState<string>("unassigned");
  
  // ✅ Debounce con useRef para evitar llamadas duplicadas
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: users = [], isLoading: usersLoading } = useQuery<AssignableUser[]>({
    queryKey: ['/api/assignment-rules/available-users'],
    enabled: isOpen,
    queryFn: async () => {
      const users = await apiRequest<any[]>("GET", "/api/assignment-rules/available-users");
      return users.map(user => ({
        id: user.id,
        name: user.name,
        role: user.role,
        status: user.status
      }));
    },
  });

  // ✅ Mutación con debounce
  const assignOrderMutation = useMutation({
    mutationFn: async ({ orderId, userId }: { orderId: number; userId: number | null }) => {
      // Si se asigna un usuario (no "unassigned")
      if (userId && order?.status === 'pending') {
        // Asignar a viaje del usuario específico
        try {
          return await apiRequest("POST", "/api/trips/assign-order-with-user", { orderId, userId });
        } catch (tripError) {
          console.warn('Error asignando a viaje:', tripError);
          // Fallback: solo actualizar el usuario asignado
          await apiRequest("PUT", `/api/orders/${orderId}`, { assignedUserId: userId });
          return { orderId, userId };
        }
      } else {
        // Si es "unassigned", solo actualizar el usuario
        await apiRequest("PUT", `/api/orders/${orderId}`, { assignedUserId: userId });
        return { orderId, userId };
      }
    },
    onSuccess: (data: any) => {
      toast({
        title: "Orden asignada",
        description: selectedUserId === "unassigned"
          ? "La asignación ha sido removida exitosamente."
          : data?.tripNumber
            ? `Asignada al viaje ${data.tripNumber} del usuario.`
            : "La orden ha sido asignada exitosamente.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      onClose(true);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo asignar la orden.",
        variant: "destructive",
      });
      console.error("Error assigning order:", error);
    },
  });

  // ✅ Auto-assign mutation
  const autoAssignMutation = useMutation({
    mutationFn: (orderId: number) => apiRequest("POST", `/api/orders/${orderId}/auto-assign`),
    onSuccess: (data: any) => {
      toast({
        title: "Asignación automática exitosa",
        description: data.message || "La orden ha sido asignada automáticamente.",
      });
      onClose(true);
    },
    onError: (error: any) => {
      toast({
        title: "Error en asignación automática",
        description: error.message || "No se pudo asignar la orden automáticamente.",
        variant: "destructive",
      });
    },
  });

  // ✅ Handler con debounce
  const handleAssign = () => {
    if (!order) return;
    
    // Cancelar timeout previo si existe
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Programar la asignación con debounce de 300ms
    debounceTimeoutRef.current = setTimeout(() => {
      const userId = selectedUserId === "unassigned" ? null : parseInt(selectedUserId);
      assignOrderMutation.mutate({ orderId: order.id, userId });
    }, 300);
  };

  const handleAutoAssign = () => {
    if (!order) return;
    autoAssignMutation.mutate(order.id);
  };

  const handleClose = () => {
    // Limpiar timeout al cerrar
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    setSelectedUserId("unassigned");
    onClose(false);
  };

  // Reset cuando cambia la orden
  useEffect(() => {
    if (order) {
      setSelectedUserId(order.assignedUserId ? order.assignedUserId.toString() : "unassigned");
    }
  }, [order]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  if (!order) return null;

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('es-DO', { 
      style: 'currency', 
      currency: 'DOP' 
    }).format(num);
  };

  const activeUsers = users.filter(u => u.status === 'active' || u.status === 'available');

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="w-5 h-5" />
            Asignar Orden #{order.orderNumber}
          </DialogTitle>
          <DialogDescription>
            Selecciona un técnico disponible o utiliza la asignación automática.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Información de la orden */}
          <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
            <CardContent className="p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-foreground">Cliente:</span>
                <span className="text-sm text-muted-foreground">{order.customer?.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-foreground">Monto:</span>
                <span className="text-sm font-bold text-primary">{formatCurrency(order.totalAmount)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-blue-900">Estado:</span>
                <Badge className="bg-blue-200 text-blue-800">{order.status}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Asignación actual */}
          {order.assignedUser && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-4">
                <p className="text-sm font-medium text-green-900 mb-2">
                  Actualmente asignado a:
                </p>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-green-700" />
                  <span className="text-green-800 font-semibold">
                    {order.assignedUser.name}
                  </span>
                  <Badge className="bg-green-200 text-green-800 text-xs">
                    {order.assignedUser.role}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Selector de usuario */}
          <div className="space-y-2">
            <Label htmlFor="assignedUser">Seleccionar Técnico</Label>
            <Select
              value={selectedUserId}
              onValueChange={setSelectedUserId}
              disabled={usersLoading || assignOrderMutation.isPending}
            >
              <SelectTrigger id="assignedUser">
                <SelectValue placeholder="Selecciona un técnico..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Sin asignar</SelectItem>
                {activeUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id.toString()}>
                    <div className="flex items-center gap-2">
                      <span>{user.name}</span>
                      <Badge className="text-xs">{user.role}</Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeUsers.length === 0 && !usersLoading && (
              <p className="text-sm text-amber-600">
                ⚠️ No hay técnicos activos disponibles
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleAutoAssign}
            disabled={autoAssignMutation.isPending || assignOrderMutation.isPending}
            className="w-full sm:w-auto"
          >
            <Zap className="w-4 h-4 mr-2" />
            {autoAssignMutation.isPending ? "Asignando..." : "Auto-asignar"}
          </Button>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
              disabled={assignOrderMutation.isPending || autoAssignMutation.isPending}
              className="flex-1 sm:flex-none"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAssign}
              disabled={assignOrderMutation.isPending || autoAssignMutation.isPending}
              className="flex-1 sm:flex-none"
            >
              {assignOrderMutation.isPending ? "Asignando..." : "Asignar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}