import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Clock, 
  User, 
  Package, 
  Phone, 
  MessageCircle,
  CheckCircle,
  XCircle,
  Play,
} from "lucide-react";
import { OrderWithDetails, OrderHistory } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface OrderDetailModalProps {
  order: OrderWithDetails | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function OrderDetailModal({ order, isOpen, onClose }: OrderDetailModalProps) {
  const [newStatus, setNewStatus] = useState<string>("");
  const [statusNotes, setStatusNotes] = useState("");
  const { toast } = useToast();

  const { data: orderHistory = [] } = useQuery<OrderHistory[]>({
    queryKey: ["/api/orders", order?.id, "history"],
    enabled: !!order?.id,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status, notes }: { orderId: number; status: string; notes?: string }) => {
      return apiRequest("PATCH", `/api/orders/${orderId}/status`, { status, notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", order?.id, "history"] });
      toast({
        title: "Estado actualizado",
        description: "El estado del pedido ha sido actualizado correctamente",
      });
      setStatusNotes("");
    },
  });

  useEffect(() => {
    if (order) {
      setNewStatus(order.status);
    }
  }, [order]);

  if (!order) return null;

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800",
      assigned: "bg-blue-100 text-blue-800",
      in_progress: "bg-orange-100 text-orange-800",
      completed: "bg-green-100 text-green-800",
      cancelled: "bg-gray-100 text-gray-800",
    };
    return colors[status] || colors.pending;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: "Pendiente",
      assigned: "Asignado",
      in_progress: "En Proceso",
      completed: "Completado",
      cancelled: "Cancelado",
    };
    return labels[status] || status;
  };

  const getActionIcon = (action: string) => {
    const icons: Record<string, any> = {
      created: Clock,
      assigned: User,
      started: Play,
      completed: CheckCircle,
      cancelled: XCircle,
      updated: Package,
    };
    return icons[action] || Clock;
  };

  const handleStatusUpdate = () => {
    if (newStatus !== order.status && order.id) {
      updateStatusMutation.mutate({
        orderId: order.id,
        status: newStatus,
        notes: statusNotes || undefined,
      });
    }
  };

  const calculateTotalCost = () => {
    let total = 0;
    order.items.forEach(item => {
      const basePrice = parseFloat(item.unitPrice) * item.quantity;
      const installationCost = parseFloat(item.installationCost || "0");
      const partsCost = parseFloat(item.partsCost || "0");
      const laborCost = parseFloat(item.laborHours || "0") * parseFloat(item.laborRate || "0");
      total += basePrice + installationCost + partsCost + laborCost;
    });
    return total;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Pedido - {order.orderNumber}</span>
            <Badge className={getStatusColor(order.status)}>
              {getStatusLabel(order.status)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 overflow-y-auto flex-1 pr-2">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-4">
            {/* Customer Information */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center text-base">
                  <User className="h-4 w-4 mr-2" />
                  Cliente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-sm">{order.customer.name}</p>
                    <p className="text-xs text-gray-500 flex items-center mt-1">
                      <Phone className="h-3 w-3 mr-1" />
                      {order.customer.phone}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs">
                      <MessageCircle className="h-3 w-3 mr-1" />
                      WhatsApp
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs">
                      <Phone className="h-3 w-3 mr-1" />
                      Llamar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Order Items with Service Pricing */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center text-base">
                  <Package className="h-4 w-4 mr-2" />
                  Productos y Servicios
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {order.items.map((item, index) => {
                    const basePrice = parseFloat(item.unitPrice) * item.quantity;
                    const installationCost = parseFloat(item.installationCost || "0");
                    const partsCost = parseFloat(item.partsCost || "0");
                    const laborCost = parseFloat(item.laborHours || "0") * parseFloat(item.laborRate || "0");
                    const itemTotal = basePrice + installationCost + partsCost + laborCost;

                    return (
                      <div key={index} className="border rounded-lg p-3">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-medium text-sm">{item.product.name}</h4>
                            <p className="text-xs text-gray-500">Cantidad: {item.quantity}</p>
                            {item.product.category === "service" && (
                              <Badge variant="secondary" className="mt-1 text-xs">Servicio</Badge>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-sm">${itemTotal.toLocaleString('es-MX')}</p>
                          </div>
                        </div>

                        {item.product.category === "service" && (
                          <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 p-2 rounded">
                            <div>
                              <p className="text-gray-600">Precio Base</p>
                              <p className="font-medium">${basePrice.toLocaleString('es-MX')}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Instalación</p>
                              <p className="font-medium">${installationCost.toLocaleString('es-MX')}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Piezas</p>
                              <p className="font-medium">${partsCost.toLocaleString('es-MX')}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">M. de Obra</p>
                              <p className="font-medium">${laborCost.toLocaleString('es-MX')}</p>
                              {item.laborHours && item.laborRate && (
                                <p className="text-[10px] text-gray-500">
                                  {item.laborHours}h × ${item.laborRate}/h
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {item.notes && (
                          <div className="mt-2 p-2 bg-blue-50 rounded text-xs">
                            <p className="text-blue-800">{item.notes}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="border-t pt-3 mt-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Total del Pedido</span>
                    <span className="text-xl font-bold text-green-600">
                      ${calculateTotalCost().toLocaleString('es-MX')}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Order Description and Notes */}
            {(order.description || (order as any).notes) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Detalles Adicionales</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {order.description && (
                    <div>
                      <p className="font-medium text-xs text-gray-600">Descripción</p>
                      <p className="text-xs">{order.description}</p>
                    </div>
                  )}
                  {(order as any).notes && (
                    <div>
                      <p className="font-medium text-xs text-gray-600">Notas</p>
                      <p className="text-xs">{(order as any).notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Status Management */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Gestión de Estado</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs font-medium">Cambiar Estado</label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendiente</SelectItem>
                      <SelectItem value="assigned">Asignado</SelectItem>
                      <SelectItem value="in_progress">En Proceso</SelectItem>
                      <SelectItem value="completed">Completado</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-medium">Notas del Cambio</label>
                  <Textarea 
                    placeholder="Agregar notas..."
                    value={statusNotes}
                    onChange={(e) => setStatusNotes(e.target.value)}
                    rows={2}
                    className="text-xs"
                  />
                </div>

                <Button 
                  onClick={handleStatusUpdate}
                  disabled={newStatus === order.status || updateStatusMutation.isPending}
                  className="w-full h-8 text-xs"
                >
                  {updateStatusMutation.isPending ? "Actualizando..." : "Actualizar Estado"}
                </Button>
              </CardContent>
            </Card>

            {/* Assignment Info */}
            {order.assignedUser && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Técnico Asignado</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-xs font-medium text-blue-600">
                        {order.assignedUser.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-sm">{order.assignedUser.name}</p>
                      <p className="text-xs text-gray-500 capitalize">{order.assignedUser.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Order Timeline */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Historial</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {orderHistory.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-2">Sin historial disponible</p>
                  ) : (
                    orderHistory.map((entry) => {
                      const Icon = getActionIcon(entry.action);
                      return (
                        <div key={entry.id} className="flex items-start space-x-2">
                          <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <Icon className="h-3 w-3 text-gray-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium">
                              {entry.statusTo && `Estado: ${getStatusLabel(entry.statusTo)}`}
                            </p>
                            {entry.notes && (
                              <p className="text-[10px] text-gray-500">{entry.notes}</p>
                            )}
                            <p className="text-[10px] text-gray-400">
                              {new Date(entry.timestamp).toLocaleString('es-MX')}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}