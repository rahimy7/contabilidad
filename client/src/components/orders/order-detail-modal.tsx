import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
  User,
  Package,
  Phone,
  MessageCircle,
  Printer,
  FileText,
  Edit,
} from "lucide-react";
import { OrderWithDetails } from "@shared/schema";
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
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  const [notesSheetOpen, setNotesSheetOpen] = useState(false);
  const { toast } = useToast();

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
      toast({
        title: "Estado actualizado",
        description: "El estado del pedido ha sido actualizado correctamente",
      });
      setStatusNotes("");
      setStatusSheetOpen(false);
      setNotesSheetOpen(false);
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
      processing: "bg-orange-100 text-orange-800",
      completed: "bg-green-100 text-green-800",
      cancelled: "bg-gray-100 text-gray-800",
    };
    return colors[status] || colors.pending;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: "Pendiente",
      assigned: "Asignado",
      processing: "En Proceso",
      completed: "Completado",
      cancelled: "Cancelado",
    };
    return labels[status] || status;
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

  const handleStatusUpdate = () => {
    if (newStatus !== order.status && order.id) {
      updateStatusMutation.mutate({
        orderId: order.id,
        status: newStatus,
        notes: statusNotes || undefined,
      });
    }
  };

const handlePrintQR = async () => {
  if (!order) return;

  const storeId = order.storeId || 1;
  const qrUrl = `${window.location.origin}/orders/public/${storeId}/${order.id}`;

  if (order.status !== "processing") {
    await updateStatusMutation.mutateAsync({
      orderId: order.id,
      status: "processing",
      notes: "Estado actualizado al imprimir QR",
    });
  }

  const qrWindow = window.open("", "_blank");
  if (!qrWindow) return;

  qrWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>QR - ${order.orderNumber}</title>
        <style>
          @media print { @page { margin: 1cm; } body { margin: 0; } }
          body {
            font-family: Arial, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
          }
          .invoice {
            max-width: 400px;
            text-align: center;
            border: 2px solid #333;
            padding: 30px;
            border-radius: 10px;
          }
          h1 { margin: 0 0 10px 0; font-size: 24px; }
          .order-number { font-size: 28px; font-weight: bold; margin: 10px 0 20px; }
          .customer-info { margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px; text-align: left; }
          .customer-info p { margin: 5px 0; font-size: 14px; }
          .customer-name { font-weight: bold; font-size: 16px; }
          .qr-container { margin: 20px 0; padding: 15px; background: #fff; border-radius: 8px; }
          .instruction { font-size: 14px; color: #666; margin: 15px 0; }
          .url { font-size: 10px; color: #999; word-break: break-all; margin-top: 10px; }
          .footer { margin-top: 20px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="invoice">
          <h1>FACTURA</h1>
          <div class="order-number">${order.orderNumber}</div>
          
          <div class="customer-info">
            <p class="customer-name">${order.customer.name}</p>
            <p>${order.customer.phone}</p>
            ${order.customer.address ? `<p>${order.customer.address}</p>` : ''}
           ${(order as any).deliveryAddress && (order as any).deliveryAddress !== order.customer.address ? `<p>${(order as any).deliveryAddress}</p>` : ''}
          </div>
          
          <div class="qr-container">
            <canvas id="qrcode"></canvas>
          </div>
          
          <p class="instruction">
            <strong>Escanea este código QR</strong><br>
            para ver el detalle de tu pedido
          </p>
          
          <p class="url">${qrUrl}</p>
          <div class="footer">Gracias por tu compra</div>
        </div>
        
        <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
        <script>
          QRCode.toCanvas(
            document.getElementById("qrcode"), 
            "${qrUrl}", 
            { width: 200, margin: 2 }, 
            (error) => { if (error) console.error(error); }
          );
          window.onload = () => setTimeout(() => window.print(), 500);
        </script>
      </body>
    </html>
  `);
  qrWindow.document.close();
};

const handlePrintOrder = () => {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  const formatMoney = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Pedido ${order.orderNumber}</title>
        <style>
          @media print { @page { margin: 1cm; } body { margin: 0; } }
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px; }
          .header h1 { margin: 0; font-size: 28px; }
          .order-number { font-size: 20px; color: #666; margin-top: 10px; }
          .status { display: inline-block; padding: 5px 15px; border-radius: 5px; margin-top: 10px; }
          .section { margin-bottom: 20px; }
          .section-title { font-size: 16px; font-weight: bold; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px; }
          .info-row { display: flex; justify-content: space-between; padding: 5px 0; }
          .item { border-bottom: 1px solid #eee; padding: 10px 0; }
          .item:last-child { border-bottom: none; }
          .total { font-size: 20px; font-weight: bold; text-align: right; margin-top: 20px; padding-top: 20px; border-top: 2px solid #333; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>PEDIDO</h1>
          <div class="order-number">${order.orderNumber}</div>
          <span class="status">${getStatusLabel(order.status)}</span>
        </div>

        <div class="section">
          <div class="section-title">Cliente</div>
          <div class="info-row"><span>Nombre:</span><span>${order.customer.name}</span></div>
          <div class="info-row"><span>Teléfono:</span><span>${order.customer.phone}</span></div>
          ${order.customer.address ? `<div class="info-row"><span>Dirección:</span><span>${order.customer.address}</span></div>` : ''}
        </div>

        ${order.assignedUser ? `
        <div class="section">
          <div class="section-title">Asignado a</div>
          <div class="info-row"><span>${order.assignedUser.name}</span><span>${order.assignedUser.role}</span></div>
        </div>
        ` : ''}

        <div class="section">
          <div class="section-title">Productos</div>
          ${order.items.map(item => `
            <div class="item">
              <div class="info-row">
                <span><strong>${item.product?.name || 'Producto'}</strong></span>
                <span><strong>$${formatMoney(parseFloat(item.unitPrice) * item.quantity)}</strong></span>
              </div>
              <div class="info-row">
                <span>Cantidad: ${item.quantity}</span>
                <span>Precio unitario: $${formatMoney(item.unitPrice)}</span>
              </div>
              ${item.installationCost && parseFloat(item.installationCost) > 0 ? `
                <div class="info-row">
                  <span>Instalación</span>
                  <span>$${formatMoney(item.installationCost)}</span>
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>

        <div class="total">
          Total: $${formatMoney(calculateTotalCost())}
        </div>

        <script>
          window.onload = () => setTimeout(() => window.print(), 500);
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
};

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Pedido - {order.orderNumber}</span>
            <Badge className={getStatusColor(order.status)}>
              {getStatusLabel(order.status)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
                Productos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {order.items?.map((item, index) => (
                  <div key={index} className="border-b pb-2 last:border-0 text-sm">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-medium">{item.product?.name || 'Producto'}</p>
                        <p className="text-xs text-gray-500">
                          {item.quantity} × ${parseFloat(item.unitPrice).toFixed(2)}
                        </p>
                      </div>
                      <p className="font-semibold">
                        ${(parseFloat(item.unitPrice) * item.quantity).toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {(order as any).loyaltyPointsTotal && Number((order as any).loyaltyPointsTotal) > 0 && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md flex items-center justify-between text-sm">
                  <div className="flex flex-col">
                    <span className="font-semibold text-amber-800">Puntos acumulados</span>
                    <span className="text-amber-700">
                      {(order as any).loyaltyPointsPropertyName || 'Puntos'}
                    </span>
                  </div>
                  <span className="text-lg font-bold text-amber-700">
                    {Number((order as any).loyaltyPointsTotal).toFixed(2)}
                  </span>
                </div>
              )}
              
              <div className="border-t pt-3 mt-3 flex justify-between items-center">
                <span className="font-bold">Total</span>
                <span className="text-xl font-bold text-green-600">
                  ${calculateTotalCost().toLocaleString("es-MX")}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Acciones */}
          <div className="grid grid-cols-2 gap-3">
            {/* Cambiar Estado */}
            <Sheet open={statusSheetOpen} onOpenChange={setStatusSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="w-full">
                  <Edit className="h-4 w-4 mr-2" />
                  Cambiar Estado
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Cambiar Estado</SheetTitle>
                </SheetHeader>
                <div className="space-y-4 mt-4">
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendiente</SelectItem>
                      <SelectItem value="assigned">Asignado</SelectItem>
                      <SelectItem value="processing">En Proceso</SelectItem>
                      <SelectItem value="completed">Completado</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <div>
                    <label className="text-sm font-medium">Notas (opcional)</label>
                    <Textarea
                      placeholder="Agregar notas..."
                      value={statusNotes}
                      onChange={(e) => setStatusNotes(e.target.value)}
                      rows={3}
                    />
                  </div>

                  <Button
                    onClick={handleStatusUpdate}
                    disabled={newStatus === order.status || updateStatusMutation.isPending}
                    className="w-full"
                  >
                    {updateStatusMutation.isPending ? "Actualizando..." : "Actualizar Estado"}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>

            {/* Agregar Nota */}
            <Sheet open={notesSheetOpen} onOpenChange={setNotesSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="w-full">
                  <FileText className="h-4 w-4 mr-2" />
                  Agregar Nota
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Agregar Nota</SheetTitle>
                </SheetHeader>
                <div className="space-y-4 mt-4">
                  <Textarea
                    placeholder="Escribe una nota sobre este pedido..."
                    value={statusNotes}
                    onChange={(e) => setStatusNotes(e.target.value)}
                    rows={5}
                  />

                  <Button
                    onClick={() => {
                      if (statusNotes.trim()) {
                        updateStatusMutation.mutate({
                          orderId: order.id,
                          status: order.status,
                          notes: statusNotes,
                        });
                      }
                    }}
                    disabled={!statusNotes.trim() || updateStatusMutation.isPending}
                    className="w-full"
                  >
                    {updateStatusMutation.isPending ? "Guardando..." : "Guardar Nota"}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>

            {/* Imprimir QR */}
            <Button onClick={handlePrintQR} size="lg" className="w-full">
              <Printer className="h-5 w-5 mr-2" />
              Imprimir QR
            </Button>

            {/* Imprimir Pedido */}
            <Button onClick={handlePrintOrder} size="lg" variant="secondary" className="w-full">
              <FileText className="h-5 w-5 mr-2" />
              Imprimir Pedido
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
