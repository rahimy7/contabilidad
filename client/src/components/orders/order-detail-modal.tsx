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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Clock,
  User,
  Package,
  Phone,
  MessageCircle,
  CheckCircle,
  XCircle,
  Play,
  Printer,
} from "lucide-react";
import { OrderWithDetails, OrderHistory } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface OrderDetailModalProps {
  order: OrderWithDetails | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function OrderDetailModal({
  order,
  isOpen,
  onClose,
}: OrderDetailModalProps) {
  const [newStatus, setNewStatus] = useState<string>("");
  const [statusNotes, setStatusNotes] = useState("");
  const { toast } = useToast();

  const { data: orderHistory = [] } = useQuery<OrderHistory[]>({
    queryKey: ["/api/orders", order?.id, "history"],
    enabled: !!order?.id,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      orderId,
      status,
      notes,
    }: {
      orderId: number;
      status: string;
      notes?: string;
    }) => {
      return apiRequest("PATCH", `/api/orders/${orderId}/status`, {
        status,
        notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/orders", order?.id, "history"],
      });
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
    order.items.forEach((item) => {
      const basePrice = parseFloat(item.unitPrice) * item.quantity;
      const installationCost = parseFloat(item.installationCost || "0");
      const partsCost = parseFloat(item.partsCost || "0");
      const laborCost =
        parseFloat(item.laborHours || "0") * parseFloat(item.laborRate || "0");
      total += basePrice + installationCost + partsCost + laborCost;
    });
    return total;
  };

  const handlePrintQR = async () => {
    if (!order) return;

    const qrUrl = `https://tuservidor.com/orders/public/${order.id}`;

    // Actualizar estado a in_progress si no lo está
    if (order.status !== "in_progress") {
      await updateStatusMutation.mutateAsync({
        orderId: order.id,
        status: "in_progress",
        notes: "Estado actualizado al imprimir QR",
      });
    }

    const qrWindow = window.open("", "_blank");
    if (!qrWindow) return;

    qrWindow.document.write(`
      <html>
        <head><title>QR Pedido ${order.orderNumber}</title></head>
        <body style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif;">
          <div style="text-align: center;">
            <h1>Pedido ${order.orderNumber}</h1>
            <canvas id="qrcode"></canvas>
            <p>Escanea este código para ver el pedido</p>
            <p style="font-size: 12px; color: gray">${qrUrl}</p>
          </div>
          <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
          <script>
            QRCode.toCanvas(document.getElementById("qrcode"), "${qrUrl}", { width: 200 }, function (error) {
              if (error) console.error(error);
            });
            window.onload = () => window.print();
          </script>
        </body>
      </html>
    `);
    qrWindow.document.close();
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
          {/* MAIN CONTENT */}
          <div className="lg:col-span-2 space-y-4">
            {/* Cliente */}
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

            {/* Productos */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center text-base">
                  <Package className="h-4 w-4 mr-2" />
                  Productos y Servicios
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* ... contenido de productos ... */}
                <div className="border-t pt-3 mt-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Total del Pedido</span>
                    <span className="text-xl font-bold text-green-600">
                      ${calculateTotalCost().toLocaleString("es-MX")}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* SIDEBAR */}
          <div className="space-y-4">
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
                  disabled={
                    newStatus === order.status || updateStatusMutation.isPending
                  }
                  className="w-full h-8 text-xs"
                >
                  {updateStatusMutation.isPending
                    ? "Actualizando..."
                    : "Actualizar Estado"}
                </Button>

                <Button
                  variant="outline"
                  onClick={handlePrintQR}
                  className="w-full h-8 text-xs"
                >
                  <Printer className="h-3 w-3 mr-1" />
                  Imprimir QR
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
