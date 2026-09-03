import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Truck, Package, DollarSign, Clock, Eye, Send, Calendar } from 'lucide-react';
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
  status: 'pending' | 'active' | 'processing' | 'completed' | 'cancelled';
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
  const [allTrips, setAllTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending'); // Por defecto pendientes
  
  // Modales
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [tripForSummary, setTripForSummary] = useState<TripForSummary | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    todayTotal: 0,
    pending: 0,
    active: 0,
    todayCompleted: 0
  });

  useEffect(() => {
    loadTrips();
  }, []);

  useEffect(() => {
    filterTrips();
  }, [statusFilter, allTrips]);

  const isToday = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const loadTrips = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/trips`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Error al cargar viajes');

      const data = await response.json();
      setAllTrips(data);

      // Calcular stats
      const todayTotal = data.filter((t: Trip) => isToday(t.createdAt)).length;
      const pending = data.filter((t: Trip) => t.status === 'pending').length;
      const active = data.filter((t: Trip) => t.status === 'active').length;
      const todayCompleted = data.filter((t: Trip) => 
        t.status === 'completed' && isToday(t.completedAt || t.createdAt)
      ).length;
      
      setStats({ todayTotal, pending, active, todayCompleted });
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

  const filterTrips = () => {
    let filtered = [...allTrips];

    switch (statusFilter) {
      case 'today':
        // Solo viajes del día de hoy
        filtered = filtered.filter(t => isToday(t.createdAt));
        break;
      case 'pending':
        // Todos los pendientes
        filtered = filtered.filter(t => t.status === 'pending');
        break;
      case 'active':
        // Todos los activos
        filtered = filtered.filter(t => t.status === 'active');
        break;
      case 'completed':
        // Solo completados del día
        filtered = filtered.filter(t => 
          t.status === 'completed' && isToday(t.completedAt || t.createdAt)
        );
        break;
    }

    setTrips(filtered);
  };

  const handleViewDetail = (tripId: number) => {
    setSelectedTripId(tripId);
    setShowDetail(true);
  };

  const handleSendClick = async (trip: Trip) => {

    // ✅ VALIDACIÓN AGREGADA
    if (!trip.assignedUserId || !trip.assignedUser) {
      toast({
        title: 'Error',
        description: 'Debes asignar un delivery antes de enviar el viaje',
        variant: 'destructive'
      });
      return;
    }
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

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP'
    }).format(num);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      pending: { label: 'Pendiente', className: 'bg-warning/15 text-warning' },
      active: { label: 'Activo', className: 'bg-accent text-accent-foreground' },
      processing: { label: 'En Progreso', className: 'bg-accent text-accent-foreground' },
      completed: { label: 'Completado', className: 'bg-success/10 text-success' },
      cancelled: { label: 'Cancelado', className: 'bg-destructive/10 text-destructive' }
    };

    const config = variants[status] || { label: status, className: 'bg-muted text-foreground' };
    return (
      <Badge className={config.className}>
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[20px] font-semibold tracking-tight md:text-3xl">Gestión de Viajes</h1>
      </div>

      {/* Stats Cards como Filtros - Una sola fila */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <button
          onClick={() => setStatusFilter('today')}
          className={`text-left transition-all ${
            statusFilter === 'today' 
              ? 'ring-2 ring-border-strong shadow-md' 
              : 'hover:shadow-md'
          }`}
        >
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-muted-foreground">Hoy</p>
                <Calendar className="h-3 w-3 text-muted-foreground" />
              </div>
              <p className="text-xl font-bold">{stats.todayTotal}</p>
            </CardContent>
          </Card>
        </button>

        <button
          onClick={() => setStatusFilter('pending')}
          className={`text-left transition-all ${
            statusFilter === 'pending' 
              ? 'ring-2 ring-warning shadow-md' 
              : 'hover:shadow-md'
          }`}
        >
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-warning">Pendientes</p>
                <Clock className="h-3 w-3 text-warning" />
              </div>
              <p className="text-xl font-bold">{stats.pending}</p>
            </CardContent>
          </Card>
        </button>

        <button
          onClick={() => setStatusFilter('active')}
          className={`text-left transition-all ${
            statusFilter === 'active' 
              ? 'ring-2 ring-primary shadow-md' 
              : 'hover:shadow-md'
          }`}
        >
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-primary">Activos</p>
                <Package className="h-3 w-3 text-primary" />
              </div>
              <p className="text-xl font-bold">{stats.active}</p>
            </CardContent>
          </Card>
        </button>

        <button
          onClick={() => setStatusFilter('completed')}
          className={`text-left transition-all ${
            statusFilter === 'completed' 
              ? 'ring-2 ring-success shadow-md' 
              : 'hover:shadow-md'
          }`}
        >
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-success">Completados</p>
                <DollarSign className="h-3 w-3 text-success" />
              </div>
              <p className="text-xl font-bold">{stats.todayCompleted}</p>
            </CardContent>
          </Card>
        </button>
      </div>

      {/* Lista de Viajes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            {statusFilter === 'today' && 'Viajes de Hoy'}
            {statusFilter === 'pending' && 'Viajes Pendientes'}
            {statusFilter === 'active' && 'Viajes Activos'}
            {statusFilter === 'completed' && 'Completados Hoy'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-chrome" />
            </div>
          ) : (
            <>
              {/* Vista Desktop - Tabla */}
              <div className="hidden lg:block">
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
                          <div className="text-sm text-muted-foreground">ID: {trip.id}</div>
                        </TableCell>
                        <TableCell>
                          <div>{trip.assignedUser?.name || 'Sin asignar'}</div>
                          <div className="text-sm text-muted-foreground">
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
                          {formatCurrency(trip.totalAmount)}
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
                            
                            <ReassignTripButton 
                              trip={trip} 
                              onSuccess={loadTrips}
                            />
                            
                            <DeleteTripButton
                              trip={trip}
                              onSuccess={loadTrips}
                            />
                            
                            {trip.status === 'pending' && (
                              <Button
                                size="sm"
                                onClick={() => handleSendClick(trip)}
                                className="bg-primary hover:bg-primary-hover"
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
              </div>

              {/* Vista Mobile/Tablet - Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:hidden">
                {trips.map((trip) => (
                  <Card key={trip.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-base font-bold">
                            {trip.tripNumber}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">ID: {trip.id}</p>
                        </div>
                        {getStatusBadge(trip.status)}
                      </div>
                    </CardHeader>
                    
                    <CardContent className="space-y-3">
                      {/* Delivery Info */}
                      <div className="flex items-start gap-2">
                        <Truck className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {trip.assignedUser?.name || 'Sin asignar'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {trip.assignedUser?.phone || ''}
                          </p>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            {trip.completedOrders}/{trip.totalOrders}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-success" />
                          <span className="text-sm font-bold">
                            {formatCurrency(trip.totalAmount)}
                          </span>
                        </div>
                      </div>

                      {/* Fecha */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(trip.createdAt).toLocaleDateString()}
                      </div>

                      {/* Acciones */}
                      <div className="flex flex-wrap gap-2 pt-2 border-t">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewDetail(trip.id)}
                          className="flex-1 min-w-[90px]"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Ver
                        </Button>
                        
                        <ReassignTripButton 
                          trip={trip} 
                          onSuccess={loadTrips}
                        />
                        
                        <DeleteTripButton
                          trip={trip}
                          onSuccess={loadTrips}
                        />
                        
                        {trip.status === 'pending' && (
                          <Button
                            size="sm"
                            onClick={() => handleSendClick(trip)}
                            className="flex-1 min-w-[90px] bg-primary hover:bg-primary-hover"
                          >
                            <Send className="h-4 w-4 mr-1" />
                            Enviar
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}

          {trips.length === 0 && !loading && (
            <div className="text-center py-12 text-muted-foreground">
              No hay viajes en esta categoría
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