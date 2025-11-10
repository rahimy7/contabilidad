import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Package, MapPin, Phone, CheckCircle, Clock, User } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TripOrder {
  id: number;
  orderId: number;
  orderNumber: string;
  status: string;
  pickedAt?: string;
  customer: {
    name: string;
    phone: string;
    address: string;
  };
  totalAmount: string;
}

interface TripOrdersListProps {
  tripId: number;
  open: boolean;
  onClose: () => void;
  onOrderMarked: () => void;
}

export function TripOrdersList({ tripId, open, onClose, onOrderMarked }: TripOrdersListProps) {
  const [orders, setOrders] = useState<TripOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingOrder, setMarkingOrder] = useState<number | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<TripOrder | null>(null);
  const [notes, setNotes] = useState('');
  const { toast } = useToast();

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP'
    }).format(num);
  };

  useEffect(() => {
    if (open) {
      loadOrders();
    }
  }, [open, tripId]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`/api/trips/${tripId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Error al cargar pedidos');
      
      const data = await res.json();
      setOrders(data.orders || []);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los pedidos',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMarkOrder = async (order: TripOrder) => {
    if (order.status === 'picked') {
      toast({
        title: 'Pedido ya recogido',
        description: `${order.orderNumber} ya fue marcado como recogido`,
        variant: 'destructive'
      });
      return;
    }

    setSelectedOrder(order);
  };

  const confirmMarkOrder = async () => {
    if (!selectedOrder) return;

    setMarkingOrder(selectedOrder.orderId);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`/api/trips/${tripId}/mark-order`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          orderId: selectedOrder.orderId,
          notes: notes.trim() || undefined
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error al marcar pedido');
      }

      toast({
        title: 'Pedido recogido',
        description: `${selectedOrder.orderNumber} marcado exitosamente`
      });

      setSelectedOrder(null);
      setNotes('');
      onOrderMarked();
      await loadOrders();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo marcar el pedido',
        variant: 'destructive'
      });
    } finally {
      setMarkingOrder(null);
    }
  };

  const pendingOrders = orders.filter(o => o.status === 'pending');
  const pickedOrders = orders.filter(o => o.status === 'picked');

  return (
    <>
      {/* Lista Principal */}
      <Dialog open={open && !selectedOrder} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Pedidos del Viaje
              <Badge variant="secondary">{orders.length} total</Badge>
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Pendientes */}
              {pendingOrders.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    Pendientes
                    <Badge variant="secondary">{pendingOrders.length}</Badge>
                  </h3>
                  <div className="space-y-3">
                    {pendingOrders.map((order) => (
                      <Card key={order.id} className="border-2 border-orange-200 bg-orange-50">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{order.orderNumber}</span>
                                <Badge variant="outline">Pendiente</Badge>
                              </div>
                              
                              <div className="space-y-1 text-sm">
                                <div className="flex items-center gap-2 text-gray-700">
                                  <User className="h-4 w-4" />
                                  {order.customer.name}
                                </div>
                                <div className="flex items-center gap-2 text-gray-600">
                                  <Phone className="h-4 w-4" />
                                  {order.customer.phone}
                                </div>
                                <div className="flex items-start gap-2 text-gray-600">
                                  <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                  <span>{order.customer.address}</span>
                                </div>
                              </div>
                            </div>

                            <div className="text-right flex flex-col gap-2">
                              <p className="font-semibold text-lg">
                                {formatCurrency(order.totalAmount)}
                              </p>
                              <Button
                                size="sm"
                                onClick={() => handleMarkOrder(order)}
                                disabled={markingOrder === order.orderId}
                              >
                                Marcar Recogido
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Recogidos */}
              {pickedOrders.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2 text-green-700">
                    <CheckCircle className="h-5 w-5" />
                    Recogidos
                    <Badge variant="default" className="bg-green-500">
                      {pickedOrders.length}
                    </Badge>
                  </h3>
                  <div className="space-y-3">
                    {pickedOrders.map((order) => (
                      <Card key={order.id} className="border-2 border-green-200 bg-green-50">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold">{order.orderNumber}</span>
                                <Badge className="bg-green-600">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Recogido
                                </Badge>
                              </div>
                              
                              <div className="text-sm text-gray-700">
                                {order.customer.name}
                              </div>

                              {order.pickedAt && (
                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                  <Clock className="h-3 w-3" />
                                  {new Date(order.pickedAt).toLocaleString()}
                                </div>
                              )}
                            </div>

                            <div className="text-right">
                              <p className="font-semibold">
                                {formatCurrency(order.totalAmount)}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {orders.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No hay pedidos en este viaje
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmación */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar recogida</DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm text-gray-500">Pedido</p>
                      <p className="font-semibold">{selectedOrder.orderNumber}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Cliente</p>
                      <p className="font-medium">{selectedOrder.customer.name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Dirección</p>
                      <p className="text-sm">{selectedOrder.customer.address}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Monto</p>
                      <p className="font-semibold text-lg">
                        {formatCurrency(selectedOrder.totalAmount)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div>
                <Label htmlFor="notes">Notas (opcional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Ej: Entregado en portería, cliente no estaba..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="mt-1"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setSelectedOrder(null)}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1"
                  onClick={confirmMarkOrder}
                  disabled={markingOrder === selectedOrder.orderId}
                >
                  {markingOrder === selectedOrder.orderId ? 'Marcando...' : 'Confirmar'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
