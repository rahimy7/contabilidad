// client/src/components/orders/edit-order-modal.tsx
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit } from "lucide-react";

interface EditOrderModalProps {
  order: any;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (updates: any) => void;
  users: Array<{ id: number; name: string; role: string }>;
  isPending: boolean;
}

export default function EditOrderModal({ 
  order, 
  isOpen, 
  onClose, 
  onSubmit, 
  users, 
  isPending 
}: EditOrderModalProps) {
  
  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('es-DO', { 
      style: 'currency', 
      currency: 'DOP' 
    }).format(num);
  };

  if (!order) return null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const updates: any = {
      id: order.id,
      status: formData.get("status") as string,
      priority: formData.get("priority") as string,
      notes: formData.get("notes") as string,
      description: formData.get("description") as string,
      deliveryAddress: formData.get("deliveryAddress") as string,
      contactNumber: formData.get("contactNumber") as string,
      paymentMethod: formData.get("paymentMethod") as string,
      paymentStatus: formData.get("paymentStatus") as string,
    };

    // Manejar assignedUserId
    const formAssignedUserId = formData.get("assignedUserId") as string;
    if (formAssignedUserId === "unassigned") {
      updates.assignedUserId = null;
    } else if (formAssignedUserId) {
      updates.assignedUserId = parseInt(formAssignedUserId);
    }

    // Filtrar valores vacíos (pero permitir null para assignedUserId)
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([key, value]) => {
        if (key === 'id') return true;
        // Permitir null explícitamente para assignedUserId (desasignar)
        if (key === 'assignedUserId' && value === null) return true;
        return value !== null && value !== "" && value !== "none";
      })
    );

    // ✅ Llamar al handler que tiene debounce
    onSubmit(filteredUpdates);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5" />
              Editar Orden #{order.orderNumber}
            </DialogTitle>
            <DialogDescription>
              Modifica los detalles de la orden. Los campos marcados con * son obligatorios.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4 space-y-6">
            {/* Información del Cliente */}
            <Card className="bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
              <CardContent className="p-4 space-y-2">
                <h3 className="font-semibold text-blue-900 mb-2">Información del Cliente</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="font-medium text-blue-800">Nombre:</span>
                    <p className="text-blue-700">{order.customer?.name}</p>
                  </div>
                  <div>
                    <span className="font-medium text-blue-800">Teléfono:</span>
                    <p className="text-blue-700">{order.customer?.phone}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="font-medium text-blue-800">Dirección:</span>
                    <p className="text-blue-700">{order.customer?.address || 'No especificada'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Productos */}
            {order.items && order.items.length > 0 && (
              <Card className="border-gray-200">
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-3">Productos en la Orden</h3>
                  <div className="space-y-2">
                    {order.items.map((item: any) => (
                      <div key={item.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                        <div>
                          <p className="font-medium text-sm">{item.product?.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Cantidad: {item.quantity} × {formatCurrency(item.unitPrice)}
                          </p>
                        </div>
                        <p className="font-bold text-sm">{formatCurrency(item.totalPrice)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="border-t mt-3 pt-3">
                    <div className="flex justify-between items-center font-bold">
                      <span>Total:</span>
                      <span className="text-lg text-green-600">{formatCurrency(order.totalAmount)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Campos de edición */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status">Estado *</Label>
                <Select name="status" defaultValue={order.status}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="processing">En Progreso</SelectItem>
                    <SelectItem value="completed">Completado</SelectItem>
                    <SelectItem value="cancelled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Prioridad</Label>
                <Select name="priority" defaultValue={order.priority || "normal"}>
                  <SelectTrigger id="priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baja</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="assignedUserId">Técnico Asignado</Label>
                <Select 
                  name="assignedUserId" 
                  defaultValue={order.assignedUserId?.toString() || "unassigned"}
                >
                  <SelectTrigger id="assignedUserId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Sin asignar</SelectItem>
                    {users.filter(u => u.role === 'technician' || u.role === 'admin').map(user => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="deliveryAddress">Dirección de Entrega</Label>
                <Input
                  id="deliveryAddress"
                  name="deliveryAddress"
                  defaultValue={order.deliveryAddress || order.customer?.address || ""}
                  placeholder="Dirección completa..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactNumber">Teléfono de Contacto</Label>
                <Input
                  id="contactNumber"
                  name="contactNumber"
                  defaultValue={order.contactNumber || order.customer?.phone || ""}
                  placeholder="+1 (809) 555-0100"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentMethod">Método de Pago</Label>
                <Select name="paymentMethod" defaultValue={order.paymentMethod || "cash"}>
                  <SelectTrigger id="paymentMethod">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Efectivo</SelectItem>
                    <SelectItem value="card">Tarjeta</SelectItem>
                    <SelectItem value="transfer">Transferencia</SelectItem>
                    <SelectItem value="financing">Financiamiento</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentStatus">Estado de Pago</Label>
                <Select name="paymentStatus" defaultValue={order.paymentStatus || "pending"}>
                  <SelectTrigger id="paymentStatus">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="partial">Parcial</SelectItem>
                    <SelectItem value="paid">Pagado</SelectItem>
                    <SelectItem value="refunded">Reembolsado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="description">Descripción</Label>
                <Textarea
                  id="description"
                  name="description"
                  defaultValue={order.description || ""}
                  placeholder="Descripción del servicio o producto..."
                  rows={2}
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="notes">Notas Internas</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  defaultValue={order.notes || ""}
                  placeholder="Notas adicionales sobre la orden..."
                  rows={2}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="border-t pt-4 mt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}