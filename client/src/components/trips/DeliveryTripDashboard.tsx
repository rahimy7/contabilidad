import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Package, QrCode, List, MapPin, Clock, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TripOrder {
  id: number;
  orderId: number;
  orderNumber: string;
  status: string;
  customer: {
    name: string;
    phone: string;
    address: string;
  };
  totalAmount: string;
}

interface ActiveTrip {
  id: number;
  tripNumber: string;
  status: string;
  totalOrders: number;
  completedOrders: number;
  orders: TripOrder[];
}

interface DeliveryTripDashboardProps {
  onScanQR: () => void;
  onViewList: () => void;
}

export function DeliveryTripDashboard({ onScanQR, onViewList }: DeliveryTripDashboardProps) {
  const [trip, setTrip] = useState<ActiveTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const { toast } = useToast();

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP'
    }).format(num);
  };

  useEffect(() => {
    loadActiveTrip();
    // Recargar cada 30 segundos
    const interval = setInterval(loadActiveTrip, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadActiveTrip = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch('/api/trips/my-active', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Error al cargar viaje');
      
      const data = await res.json();
      setTrip(data);
    } catch (error) {
      console.error('Error loading trip:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteTrip = async () => {
    if (!trip) return;

    if (trip.completedOrders !== trip.totalOrders) {
      toast({
        title: 'No se puede completar',
        description: 'Debes recoger todos los pedidos primero',
        variant: 'destructive'
      });
      return;
    }

    setCompleting(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`/api/trips/${trip.id}/complete`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) throw new Error('Error al completar viaje');

      toast({
        title: 'Viaje completado',
        description: `${trip.tripNumber} ha sido completado exitosamente`
      });

      setTrip(null);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo completar el viaje',
        variant: 'destructive'
      });
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900" />
        </CardContent>
      </Card>
    );
  }

  if (!trip) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center p-12 text-center">
          <Package className="h-16 w-16 text-gray-300 mb-4" />
          <h3 className="text-xl font-semibold mb-2">No hay viaje activo</h3>
          <p className="text-gray-500">
            Espera a que te asignen pedidos para comenzar un nuevo viaje
          </p>
        </CardContent>
      </Card>
    );
  }

  const progress = trip.totalOrders > 0 
    ? (trip.completedOrders / trip.totalOrders) * 100 
    : 0;

  const allCompleted = trip.completedOrders === trip.totalOrders;

  return (
    <div className="space-y-6">
      {/* Header del Viaje */}
      <Card className="bg-gradient-to-r from-primary to-primary/80 text-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl text-white">{trip.tripNumber}</CardTitle>
              <p className="text-primary-foreground/80 mt-1">Viaje Activo</p>
            </div>
            <Badge variant="secondary" className="bg-white text-blue-600">
              {trip.status === 'active' ? 'Activo' : 'En Progreso'}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Progreso */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Progreso del viaje</p>
                <p className="text-2xl font-bold">
                  {trip.completedOrders} / {trip.totalOrders}
                </p>
                <p className="text-sm text-gray-600">pedidos recogidos</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-blue-600">
                  {progress.toFixed(0)}%
                </p>
              </div>
            </div>
            
            <Progress value={progress} className="h-3" />

            {allCompleted && (
              <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <p className="text-sm font-medium text-green-800">
                  ¡Todos los pedidos recogidos!
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Acciones Rápidas */}
      <Card>
        <CardHeader>
          <CardTitle>¿Cómo deseas marcar los pedidos?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button 
            className="w-full h-16 text-lg" 
            size="lg"
            onClick={onScanQR}
            disabled={allCompleted}
          >
            <QrCode className="h-6 w-6 mr-3" />
            Escanear Código QR
          </Button>

          <Button 
            className="w-full h-16 text-lg" 
            variant="outline" 
            size="lg"
            onClick={onViewList}
          >
            <List className="h-6 w-6 mr-3" />
            Ver Lista de Pedidos
          </Button>
        </CardContent>
      </Card>

      {/* Próximos Pedidos */}
      <Card>
        <CardHeader>
          <CardTitle>Próximos pedidos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {trip.orders
              .filter(order => order.status === 'pending')
              .slice(0, 3)
              .map((order) => (
                <div 
                  key={order.id}
                  className="flex items-start gap-3 p-3 border rounded-lg"
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <Package className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{order.orderNumber}</p>
                    <p className="text-sm text-gray-600">{order.customer.name}</p>
                    <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{order.customer.address}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-semibold">
                      {formatCurrency(order.totalAmount)}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Botón Completar */}
      {allCompleted && (
        <Button 
          className="w-full h-14 text-lg bg-green-600 hover:bg-green-700"
          size="lg"
          onClick={handleCompleteTrip}
          disabled={completing}
        >
          <CheckCircle className="h-6 w-6 mr-3" />
          {completing ? 'Completando...' : 'Finalizar Viaje'}
        </Button>
      )}
    </div>
  );
}
