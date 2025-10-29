import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
  assignedUser?: {
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

      // ✅ FIX: Validar que assignedUser exista antes de acceder a .name
      const userName = trip.assignedUser?.name || 'el usuario asignado';
      
      toast({
        title: 'Viaje enviado',
        description: `${trip.tripNumber} fue enviado a ${userName}`
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

  const handleViewOrder = async (orderId: number) => {
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`/api/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Error al cargar orden');
      
      const data = await res.json();
      setOrderDetails(data);
      setOrderDetailOpen(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo cargar la orden',
        variant: 'destructive'
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      pending: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-800' },
      picked: { label: 'Recogido', className: 'bg-blue-100 text-blue-800' },
      delivered: { label: 'Entregado', className: 'bg-green-100 text-green-800' },
      cancelled: { label: 'Cancelado', className: 'bg-red-100 text-red-800' }
    };

    const config = variants[status] || { label: status, className: 'bg-gray-100 text-gray-800' };
    return (
      <Badge className={config.className}>
        {config.label}
      </Badge>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle del Viaje {trip?.tripNumber}</DialogTitle>
            {/* ✅ FIX: Agregar DialogDescription para accesibilidad */}
            <DialogDescription>
              Información completa del viaje y sus órdenes asociadas
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900" />
            </div>
          ) : trip ? (
            <div className="space-y-6">
              {/* Info del viaje */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Delivery Asignado
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* ✅ FIX: Validar que assignedUser exista */}
                    {trip.assignedUser ? (
                      <>
                        <p className="font-medium">{trip.assignedUser.name}</p>
                        <p className="text-sm text-gray-500">{trip.assignedUser.phone}</p>
                      </>
                    ) : (
                      <p className="text-sm text-gray-500">Sin asignar</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Estado del Viaje
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {getStatusBadge(trip.status)}
                      <p className="text-sm text-gray-500">
                        {trip.completedOrders}/{trip.totalOrders} órdenes completadas
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Fechas
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1 text-sm">
                      <p>
                        <span className="text-gray-500">Creado:</span>{' '}
                        {new Date(trip.createdAt).toLocaleString()}
                      </p>
                      {trip.sentAt && (
                        <p>
                          <span className="text-gray-500">Enviado:</span>{' '}
                          {new Date(trip.sentAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      Total
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">
                      ${parseFloat(trip.totalAmount).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Lista de órdenes */}
              <Card>
                <CardHeader>
                  <CardTitle>Órdenes del Viaje</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {trip.orders.map((order) => (
                      <div
                        key={order.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{order.orderNumber}</span>
                            {getStatusBadge(order.status)}
                            {order.scannedQR && (
                              <Badge variant="outline" className="text-xs">
                                QR Escaneado
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-gray-600">
                            <p className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {order.order.customer.name}
                            </p>
                            <p className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {order.order.customer.address}
                            </p>
                          </div>
                        </div>
                        <div className="text-right space-x-2">
                          <span className="font-bold">
                            ${parseFloat(order.order.totalAmount).toLocaleString()}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewOrder(order.orderId)}
                          >
                            Ver
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Botón de enviar */}
              {trip.status === 'pending' && (
                <div className="flex justify-end">
                  <Button
                    onClick={handleSendTrip}
                    disabled={sending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {sending ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Enviar Viaje
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No se encontró el viaje
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de detalle de orden */}
      {orderDetails && (
        <OrderDetailModal
          order={orderDetails}
          isOpen={orderDetailOpen}
          onClose={() => {
            setOrderDetailOpen(false);
            setOrderDetails(null);
          }}
        />
      )}
    </>
  );
}