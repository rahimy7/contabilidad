import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, User, Phone, MapPin, Package, User as UserIcon } from "lucide-react";

interface EditOrderModalProps {
  order: any;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
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
    return new Intl.NumberFormat('es-MX', { 
      style: 'currency', 
      currency: 'MXN' 
    }).format(num);
  };

  if (!order) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5" />
              Editar Orden #{order.orderNumber}
            </DialogTitle>
            <DialogDescription>
              Modifica los detalles de la orden. Los campos marcados con * son obligatorios.
            </DialogDescription>
          </DialogHeader>
          
          <div className="overflow-y-auto flex-1 min-h-0 pr-2">
            <div className="grid gap-4 py-4">
              {/* Información básica */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="status" className="text-sm">Estado *</Label>
                  <Select name="status" defaultValue={order.status || "pending"}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendiente</SelectItem>
                      <SelectItem value="confirmed">Confirmado</SelectItem>
                      <SelectItem value="assigned">Asignado</SelectItem>
                      <SelectItem value="preparing">Preparando</SelectItem>
                      <SelectItem value="ready">Listo</SelectItem>
                      <SelectItem value="in_transit">En Tránsito</SelectItem>
                      <SelectItem value="delivered">Entregado</SelectItem>
                      <SelectItem value="completed">Completado</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                      <SelectItem value="returned">Devuelto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority" className="text-sm">Prioridad *</Label>
                  <Select name="priority" defaultValue={order.priority || 'normal'}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Seleccionar prioridad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Baja</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">Alta</SelectItem>
                      <SelectItem value="urgent">Urgente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="assignedUserId" className="text-sm">Asignar a</Label>
                  <Select
                    name="assignedUserId"
                    defaultValue={
                      order.assignedUserId !== null && order.assignedUserId !== undefined
                        ? order.assignedUserId.toString()
                        : "unassigned"
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Seleccionar usuario" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Sin asignar</SelectItem>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.name} ({user.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Asignación actual */}
              {order.assignedUser && (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs font-medium text-blue-800 mb-1">
                    Actualmente asignado a:
                  </p>
                  <div className="flex items-center gap-2">
                    <User className="w-3 h-3 text-blue-600" />
                    <span className="text-xs text-blue-700">
                      {order.assignedUser.name}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {order.assignedUser.role}
                    </Badge>
                  </div>
                </div>
              )}

              {/* Contacto y entrega */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="contactNumber" className="text-sm">Número de Contacto</Label>
                  <Input
                    name="contactNumber"
                    type="tel"
                    className="h-9"
                    placeholder="Ej: +1234567890"
                    defaultValue={order.contactNumber || order.customer?.phone || ''}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="deliveryAddress" className="text-sm">Dirección de Entrega</Label>
                  <Input
                    name="deliveryAddress"
                    className="h-9"
                    placeholder="Dirección completa"
                    defaultValue={order.deliveryAddress || order.customer?.address || ''}
                  />
                </div>
              </div>

              {/* Pago */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="paymentMethod" className="text-sm">Método de Pago</Label>
                  <Select name="paymentMethod" defaultValue={order.paymentMethod || 'none'}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Seleccionar método" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin especificar</SelectItem>
                      <SelectItem value="cash">Efectivo</SelectItem>
                      <SelectItem value="card">Tarjeta</SelectItem>
                      <SelectItem value="transfer">Transferencia</SelectItem>
                      <SelectItem value="check">Cheque</SelectItem>
                      <SelectItem value="financing">Financiamiento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paymentStatus" className="text-sm">Estado del Pago</Label>
                  <Select name="paymentStatus" defaultValue={order.paymentStatus || 'pending'}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Estado del pago" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendiente</SelectItem>
                      <SelectItem value="processing">Procesando</SelectItem>
                      <SelectItem value="completed">Completado</SelectItem>
                      <SelectItem value="failed">Fallido</SelectItem>
                      <SelectItem value="refunded">Reembolsado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Descripción y notas */}
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-sm">Descripción</Label>
                  <Textarea
                    name="description"
                    placeholder="Descripción general..."
                    rows={2}
                    className="text-sm"
                    defaultValue={order.description || ''}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes" className="text-sm">Notas Internas</Label>
                  <Textarea
                    name="notes"
                    placeholder="Notas para el equipo..."
                    rows={2}
                    className="text-sm"
                    defaultValue={order.notes || ''}
                  />
                </div>
              </div>

              {/* Info del cliente */}
              {order.customer && (
                <Card className="bg-gray-50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Cliente</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <UserIcon className="w-3 h-3 text-gray-500" />
                      <span className="font-medium">{order.customer.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Phone className="w-3 h-3 text-gray-500" />
                      <span>{order.customer.phone}</span>
                    </div>
                    {order.customer.address && (
                      <div className="flex items-center gap-2 text-xs">
                        <MapPin className="w-3 h-3 text-gray-500" />
                        <span>{order.customer.address}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Items */}
              {order.items && order.items.length > 0 && (
                <Card className="bg-gray-50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Package className="w-3 h-3" />
                      Items ({order.items.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {order.items.slice(0, 3).map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between p-2 bg-white rounded border text-xs">
                          <div>
                            <p className="font-medium">{item.product.name}</p>
                            <p className="text-[10px] text-gray-500">
                              Cant: {item.quantity} | Precio: {formatCurrency(item.unitPrice)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-green-600">
                              {formatCurrency(item.totalPrice)}
                            </p>
                          </div>
                        </div>
                      ))}
                      {order.items.length > 3 && (
                        <p className="text-xs text-gray-500 text-center">
                          ... y {order.items.length - 3} items más
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
          
          <DialogFooter className="gap-2 border-t pt-4 mt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              disabled={isPending}
              className="h-9"
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={isPending}
              className="h-9"
            >
              {isPending ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}