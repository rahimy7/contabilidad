// client/src/pages/trips.tsx
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Truck, Package, DollarSign, Clock, Send, Eye, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Trip {
  id: number;
  tripNumber: string;
  assignedUserId: number;
  assignedUser: {
    name: string;
    phone: string;
  };
  status: 'pending' | 'active' | 'in_progress' | 'completed' | 'cancelled';
  totalOrders: number;
  completedOrders: number;
  totalAmount: string;
  createdAt: string;
  sentAt?: string;
  completedAt?: string;
}

interface TripDetail extends Trip {
  orders: Array<{
    id: number;
    orderNumber: string;
    orderId: number;
    status: string;
    pickedAt?: string;
    order: {
      customer: {
        name: string;
        phone: string;
        address: string;
      };
      totalAmount: string;
    };
  }>;
}

export default function TripsPage() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  const [selectedTrip, setSelectedTrip] = useState<TripDetail | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [sendingTrip, setSendingTrip] = useState(false);

  useEffect(() => {
    loadTrips();
  }, [statusFilter]);

  const loadTrips = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/trips?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setTrips(data.map((t: any) => ({
          ...t.trip,
          assignedUser: t.user,
        })));
      }
    } catch (error) {
      console.error('Error loading trips:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTripDetail = async (tripId: number) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/trips/${tripId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setSelectedTrip(data);
        setShowSummaryModal(true);
      }
    } catch (error) {
      console.error('Error loading trip detail:', error);
    }
  };

  const handleSendTrip = async () => {
    if (!selectedTrip) return;

    setSendingTrip(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/trips/${selectedTrip.id}/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        alert('Viaje enviado exitosamente');
        setShowSummaryModal(false);
        loadTrips();
      }
    } catch (error) {
      console.error('Error sending trip:', error);
      alert('Error al enviar viaje');
    } finally {
      setSendingTrip(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
      active: { label: 'Activo', color: 'bg-blue-100 text-blue-800' },
      in_progress: { label: 'En Progreso', color: 'bg-purple-100 text-purple-800' },
      completed: { label: 'Completado', color: 'bg-green-100 text-green-800' },
      cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800' },
    };

    const variant = variants[status as keyof typeof variants] || variants.pending;
    return <Badge className={`${variant.color} border-0`}>{variant.label}</Badge>;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Cargando viajes...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Viajes</h1>
          <p className="text-gray-600">Administra los viajes de entrega</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Viajes</CardTitle>
            <Truck className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{trips.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {trips.filter(t => t.status === 'pending').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Activos</CardTitle>
            <Package className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {trips.filter(t => t.status === 'active' || t.status === 'in_progress').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Completados Hoy</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {trips.filter(t => t.status === 'completed').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
                <SelectItem value="active">Activos</SelectItem>
                <SelectItem value="in_progress">En Progreso</SelectItem>
                <SelectItem value="completed">Completados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Trips Table */}
      <Card>
        <CardHeader>
          <CardTitle>Viajes</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Viaje</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Pedidos</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trips.map((trip) => (
                <TableRow key={trip.id}>
                  <TableCell>
                    <div className="font-medium">{trip.tripNumber}</div>
                    <div className="text-sm text-gray-500">ID: {trip.id}</div>
                  </TableCell>
                  <TableCell>
                    <div>{trip.assignedUser?.name || 'Sin asignar'}</div>
                    <div className="text-sm text-gray-500">
                      {trip.assignedUser?.phone || ''}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(trip.status)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Package className="h-4 w-4" />
                      <span>
                        {trip.completedOrders}/{trip.totalOrders}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    ${parseFloat(trip.totalAmount).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {new Date(trip.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => loadTripDetail(trip.id)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {trip.status === 'pending' && (
                        <Button
                          size="sm"
                          onClick={() => loadTripDetail(trip.id)}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <Send className="h-4 w-4 mr-1" />
                          Enviar
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {trips.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No hay viajes registrados
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Modal */}
      <Dialog open={showSummaryModal} onOpenChange={setShowSummaryModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Resumen del Viaje {selectedTrip?.tripNumber}
            </DialogTitle>
          </DialogHeader>

          {selectedTrip && (
            <div className="space-y-4">
              {/* Trip Info */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm text-gray-600">Delivery</p>
                  <p className="font-medium">{selectedTrip.assignedUser.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Pedidos</p>
                  <p className="font-medium">{selectedTrip.totalOrders}</p>
                </div>
              </div>

              {/* Orders List */}
              <div>
                <h4 className="font-medium mb-2">Pedidos del Viaje:</h4>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {selectedTrip.orders.map((order) => (
                    <div
                      key={order.id}
                      className="flex justify-between items-center p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{order.orderNumber}</p>
                        <p className="text-sm text-gray-600">
                          {order.order.customer.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          {order.order.customer.address}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">
                          ${parseFloat(order.order.totalAmount).toLocaleString()}
                        </p>
                        {order.status === 'picked' && (
                          <Badge className="bg-green-100 text-green-800">
                            Recogido
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center text-lg font-bold">
                  <span>TOTAL VIAJE:</span>
                  <span>${parseFloat(selectedTrip.totalAmount).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSummaryModal(false)}>
              Cancelar
            </Button>
            {selectedTrip?.status === 'pending' && (
              <Button
                onClick={handleSendTrip}
                disabled={sendingTrip}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Send className="h-4 w-4 mr-2" />
                {sendingTrip ? 'Enviando...' : 'Confirmar y Enviar'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}