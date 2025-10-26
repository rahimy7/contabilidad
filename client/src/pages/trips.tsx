import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Truck, Package, DollarSign, Clock, Eye, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TripDetail } from '@/components/trips/TripDetail';
import { TripSummaryModal } from '@/components/trips/TripSummaryModal';
import { ReassignTripButton } from '@/components/trips/trip-reassign-modal';
import { DeleteTripButton } from '@/components/trips/delete-trip-button';

interface Trip {
  id: number;
  tripNumber: string;
  assignedUserId: number;
  assignedUser: {
    id: number;
    name: string;
    email: string;
    role: string;
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

interface TripForSummary extends Trip {
  orders: Array<{
    orderNumber: string;
    totalAmount: string;
  }>;
}

export default function TripsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Modales
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [tripForSummary, setTripForSummary] = useState<TripForSummary | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    active: 0,
    completed: 0
  });

  useEffect(() => {
    loadTrips();
  }, [statusFilter]);

  const loadTrips = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/trips?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Error al cargar viajes');

      const data = await response.json();
      setTrips(data);

      // Calcular stats
      const total = data.length;
      const pending = data.filter((t: Trip) => t.status === 'pending').length;
      const active = data.filter((t: Trip) => t.status === 'active').length;
      const completed = data.filter((t: Trip) => t.status === 'completed').length;
      
      setStats({ total, pending, active, completed });
    } catch (error) {
      console.error('Error loading trips:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los viajes',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetail = (tripId: number) => {
    setSelectedTripId(tripId);
    setShowDetail(true);
  };

  const handleSendClick = async (trip: Trip) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/trips/${trip.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Error al cargar detalles');

      const fullTrip = await response.json();
      setTripForSummary({
        ...trip,
        orders: fullTrip.orders.map((o: any) => ({
          orderNumber: o.orderNumber,
          totalAmount: o.order.totalAmount
        }))
      });
      setShowSummary(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los detalles del viaje',
        variant: 'destructive'
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      pending: { label: 'Pendiente', className: 'bg-yellow-100 text-yellow-800' },
      active: { label: 'Activo', className: 'bg-blue-100 text-blue-800' },
      in_progress: { label: 'En Progreso', className: 'bg-purple-100 text-purple-800' },
      completed: { label: 'Completado', className: 'bg-green-100 text-green-800' },
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
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Gestión de Viajes</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Viajes
            </CardTitle>
            <Truck className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600">
              Pendientes
            </CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">
              Activos
            </CardTitle>
            <Package className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-green-600">
              Completados
            </CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completed}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Viajes</CardTitle>
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
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900" />
            </div>
          ) : (
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
                          onClick={() => handleViewDetail(trip.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        
                        {/* Botón de reasignación */}
                        <ReassignTripButton 
                          trip={trip} 
                          onSuccess={loadTrips}
                        />
                        
                        {/* Botón de eliminar */}
                        <DeleteTripButton
                          trip={trip}
                          onSuccess={loadTrips}
                        />
                        
                        {trip.status === 'pending' && (
                          <Button
                            size="sm"
                            onClick={() => handleSendClick(trip)}
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
          )}

          {trips.length === 0 && !loading && (
            <div className="text-center py-12 text-gray-500">
              No hay viajes registrados
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modales */}
      {selectedTripId && (
        <TripDetail
          tripId={selectedTripId}
          open={showDetail}
          onClose={() => {
            setShowDetail(false);
            setSelectedTripId(null);
          }}
          onTripSent={() => {
            loadTrips();
            setShowDetail(false);
            setSelectedTripId(null);
          }}
        />
      )}

      <TripSummaryModal
        trip={tripForSummary}
        open={showSummary}
        onClose={() => {
          setShowSummary(false);
          setTripForSummary(null);
        }}
        onConfirm={() => {
          loadTrips();
          setShowSummary(false);
          setTripForSummary(null);
        }}
      />
    </div>
  );
}