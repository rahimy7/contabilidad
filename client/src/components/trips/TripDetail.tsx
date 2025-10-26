import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Package, User, MapPin, Clock, CheckCircle, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

import { OrderWithDetails } from '@shared/schema';
import OrderDetailModal from '../orders/order-detail-modal';

interface TripDetailProps {
  tripId: number;
  open: boolean;
  onClose: () => void;
  onTripSent?: () => void;
}

interface TripOrder {
  id: number;
  orderId: number;
  orderNumber: string;
  status: string;
  pickedAt?: string;
  scannedQR: boolean;
  order: {
    customer: {
      name: string;
      phone: string;
      address: string;
    };
    totalAmount: string;
  };
}

interface Trip {
  id: number;
  tripNumber: string;
  status: string;
  totalOrders: number;
  completedOrders: number;
  totalAmount: string;
  createdAt: string;
  sentAt?: string;
  assignedUser: {
    name: string;
    phone: string;
  };
  orders: TripOrder[];
}

export function TripDetail({ tripId, open, onClose, onTripSent }: TripDetailProps) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [orderDetailOpen, setOrderDetailOpen] = useState(false);
  const [orderDetails, setOrderDetails] = useState<OrderWithDetails | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open && tripId) {
      loadTripDetails();
    }
  }, [open, tripId]);

  const loadTripDetails = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`/api/trips/${tripId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Error al cargar viaje');
      const data = await res.json();
      setTrip(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo cargar el viaje',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendTrip = async () => {
    if (!trip) return;

    setSending(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`/api/trips/${tripId}/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) throw new Error('Error al enviar viaje');

      toast({
        title: 'Viaje enviado',
        description: `${trip.tripNumber} fue enviado a ${trip.assignedUser.name}`
      });

      onTripSent?.();
      onClose();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo enviar el viaje',
        variant: 'destructive'
      });
    } finally {
      setSending(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: any }> = {
      pending: { label: 'Pendiente', variant: 'secondary' },
      active: { label: 'Activo', variant: 'default' },
      in_progress: { label: 'En Progreso', variant: 'default' },
      completed: { label: 'Completado', variant: 'default' },
      cancelled: { label: 'Cancelado', variant: 'destructive' }
    };

    const config = variants[status] || { label: status, variant: 'secondary' };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const openOrderDetails = async (orderId: number) => {
    const token = localStorage.getItem('auth_token');
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Error al cargar detalle del pedido');
      const data = await res.json();

      setOrderDetails(data);
      setOrderDetailOpen(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo cargar el detalle del pedido',
        variant: 'destructive'
      });
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Cargando...</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!trip) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Package className="h-6 w-6" />
            {trip.tripNumber}
            {getStatusBadge(trip.status)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Info del Delivery */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5" />
                Información del Delivery
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Nombre</p>
                  <p className="font-medium">{trip.assignedUser.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Teléfono</p>
                  <p className="font-medium">{trip.assignedUser.phone}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resumen */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resumen del Viaje</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold">{trip.totalOrders}</p>
                  <p className="text-sm text-gray-500">Total Pedidos</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">{trip.completedOrders}</p>
                  <p className="text-sm text-gray-500">Completados</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">
                    ${parseFloat(trip.totalAmount).toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-500">Monto Total</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lista de Pedidos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pedidos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {trip.orders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-start justify-between p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                    onClick={() => openOrderDetails(order.orderId)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium">{order.orderNumber}</span>
                        {order.status === 'picked' ? (
                          <Badge variant="default" className="bg-green-500">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Recogido
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Pendiente</Badge>
                        )}
                        {order.scannedQR && (
                          <Badge variant="outline" className="text-xs">QR</Badge>
                        )}
                      </div>

                      <div className="text-sm text-gray-600 space-y-1">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          {order.order.customer.name}
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          {order.order.customer.address}
                        </div>
                      </div>

                      {order.pickedAt && (
                        <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                          <Clock className="h-3 w-3" />
                          Recogido: {new Date(order.pickedAt).toLocaleString()}
                        </div>
                      )}
                    </div>

                    <div className="text-right">
                      <p className="font-semibold">
                        ${parseFloat(order.order.totalAmount).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Acciones */}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>

            {trip.status === 'pending' && (
              <Button onClick={handleSendTrip} disabled={sending}>
                <Send className="h-4 w-4 mr-2" />
                {sending ? 'Enviando...' : 'Enviar Viaje'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Modal de Detalle de Orden */}
      <OrderDetailModal
        order={orderDetails}
        isOpen={orderDetailOpen}
        onClose={() => setOrderDetailOpen(false)}
      />
    </Dialog>
  );
}
