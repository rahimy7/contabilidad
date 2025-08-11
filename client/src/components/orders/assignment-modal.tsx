// client/src/components/orders/assignment-modal.tsx

import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { User, MapPin, Phone, Package, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { User as UserType } from '@shared/schema';

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

  // Fetch available users
  const { data: users = [], isLoading: usersLoading } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
    enabled: isOpen, // Solo cargar cuando el modal esté abierto
  });

  // Assign order mutation
  const assignOrderMutation = useMutation({
    mutationFn: async ({ orderId, userId }: { orderId: number; userId: number | null }) => {
      return apiRequest("PUT", `/api/orders/${orderId}`, { 
        assignedUserId: userId,
        // Si se asigna a alguien y el estado es pending, cambiar a assigned
        ...(userId && order?.status === 'pending' && { status: 'assigned' })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Orden asignada",
        description: selectedUserId === "unassigned" 
          ? "La asignación ha sido removida exitosamente."
          : "La orden ha sido asignada exitosamente.",
      });
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

  const handleAssign = () => {
    if (!order) return;
    
    const userId = selectedUserId === "unassigned" ? null : parseInt(selectedUserId);
    assignOrderMutation.mutate({ orderId: order.id, userId });
  };

  const handleClose = () => {
    setSelectedUserId("unassigned");
    onClose(false);
  };

  // Reset selectedUserId when order changes
  React.useEffect(() => {
    if (order) {
      setSelectedUserId(order.assignedUserId ? order.assignedUserId.toString() : "unassigned");
    }
  }, [order]);

  // Filtrar usuarios que pueden ser asignados (técnicos, admins, etc.)
  const availableUsers = users.filter(user => 
    ['technician', 'admin', 'manager', 'specialist'].includes(user.role?.toLowerCase() || '')
  );

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: any }> = {
      pending: { label: 'Pendiente', variant: 'secondary' },
      assigned: { label: 'Asignado', variant: 'default' },
      in_progress: { label: 'En Progreso', variant: 'default' },
      completed: { label: 'Completado', variant: 'default' },
      cancelled: { label: 'Cancelado', variant: 'destructive' },
    };
    
    const config = statusConfig[status] || { label: status, variant: 'secondary' };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const priorityConfig: Record<string, { label: string; variant: any }> = {
      low: { label: 'Baja', variant: 'outline' },
      normal: { label: 'Normal', variant: 'secondary' },
      high: { label: 'Alta', variant: 'default' },
      urgent: { label: 'Urgente', variant: 'destructive' },
    };
    
    const config = priorityConfig[priority] || { label: priority, variant: 'secondary' };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (!order) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Asignar Orden #{order.orderNumber}
          </DialogTitle>
          <DialogDescription>
            Selecciona un usuario para asignar esta orden o déjalo sin asignar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Información de la orden */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Estado:</span>
                {getStatusBadge(order.status)}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Prioridad:</span>
                {getPriorityBadge(order.priority)}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Total:</span>
                <span className="font-semibold text-green-600">
                  ${parseFloat(order.totalAmount || "0").toLocaleString('es-MX')}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <User className="w-4 h-4 mt-0.5 text-gray-400" />
                <div className="text-sm">
                  <p className="font-medium">{order.customer.name}</p>
                  <div className="flex items-center gap-1 text-gray-500">
                    <Phone className="w-3 h-3" />
                    {order.customer.phone}
                  </div>
                </div>
              </div>
              {(order.deliveryAddress || order.customer.address) && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 mt-0.5 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    {order.deliveryAddress || order.customer.address}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">
                  Creado: {new Date(order.createdAt).toLocaleDateString('es-MX')}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Asignación actual */}
          {order.assignedUser && (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm font-medium text-blue-800 mb-1">Asignado actualmente a:</p>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" />
                <span className="text-sm text-blue-700">{order.assignedUser.name}</span>
                <Badge variant="outline" className="text-xs">
                  {order.assignedUser.role}
                </Badge>
              </div>
            </div>
          )}

          {/* Selector de usuario */}
          <div className="space-y-2">
            <Label htmlFor="user-select">Asignar a usuario</Label>
            <Select 
              value={selectedUserId} 
              onValueChange={setSelectedUserId}
              disabled={usersLoading || assignOrderMutation.isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder={usersLoading ? "Cargando usuarios..." : "Seleccionar usuario"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">
                  <div className="flex items-center gap-2">
                    <span>Sin asignar</span>
                  </div>
                </SelectItem>
                {availableUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id.toString()}>
                    <div className="flex items-center gap-2">
                      <span>{user.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {user.role}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {availableUsers.length === 0 && !usersLoading && (
            <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-sm text-yellow-800">
                No hay usuarios disponibles para asignar. Asegúrate de que existan usuarios con roles apropiados (técnico, admin, etc.).
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={handleClose}
            disabled={assignOrderMutation.isPending}
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleAssign}
            disabled={assignOrderMutation.isPending || usersLoading}
          >
            {assignOrderMutation.isPending ? "Asignando..." : "Asignar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}