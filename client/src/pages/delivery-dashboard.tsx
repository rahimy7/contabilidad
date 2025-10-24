// client/src/pages/delivery-dashboard.tsx
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { QrCode, List, Check, MapPin, Phone, Package, CheckCircle } from 'lucide-react';

interface Order {
  id: number;
  orderNumber: string;
  orderId: number;
  status: 'pending' | 'picked' | 'skipped';
  pickedAt?: string;
  customer: {
    name: string;
    phone: string;
    address: string;
  };
  totalAmount: string;
  qrCode: string;
}

interface ActiveTrip {
  id: number;
  tripNumber: string;
  status: string;
  totalOrders: number;
  completedOrders: number;
  totalAmount: string;
  orders: Order[];
}

export default function DeliveryDashboard() {
  const { user } = useAuth();
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [showManualInput, setShowManualInput] = useState(false);
  const [showOrdersList, setShowOrdersList] = useState(false);
  const [manualQR, setManualQR] = useState('');
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    loadActiveTrip();
    
    const interval = setInterval(loadActiveTrip, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadActiveTrip = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/trips/my-active', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setActiveTrip(data);
      } else {
        setActiveTrip(null);
      }
    } catch (error) {
      console.error('Error loading active trip:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManualQRSubmit = async () => {
    if (!manualQR.trim() || !activeTrip || scanning) return;

    setScanning(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/trips/${activeTrip.id}/scan-order`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ qrCode: manualQR }),
      });

      if (response.ok) {
        await loadActiveTrip();
        showSuccessToast('Pedido escaneado correctamente');
        setManualQR('');
        setTimeout(() => {
          setShowManualInput(false);
        }, 1000);
      } else {
        const error = await response.json();
        showErrorToast(error.error || 'Error al escanear pedido');
      }
    } catch (error) {
      console.error('Error scanning QR:', error);
      showErrorToast('Error al procesar QR');
    } finally {
      setScanning(false);
    }
  };

  const handleMarkOrder = async (orderId: number) => {
    if (!activeTrip) return;

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/trips/${activeTrip.id}/mark-order`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId }),
      });

      if (response.ok) {
        showSuccessToast('Pedido marcado como recogido');
        await loadActiveTrip();
      } else {
        const error = await response.json();
        showErrorToast(error.error || 'Error al marcar pedido');
      }
    } catch (error) {
      console.error('Error marking order:', error);
      showErrorToast('Error al marcar pedido');
    }
  };

  const handleCompleteTrip = async () => {
    if (!activeTrip) return;

    if (!confirm('¿Finalizar este viaje? Todos los pedidos han sido recogidos.')) {
      return;
    }

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/trips/${activeTrip.id}/complete`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (response.ok) {
        alert('¡Viaje completado exitosamente!');
        setActiveTrip(null);
        setShowOrdersList(false);
      } else {
        const error = await response.json();
        alert(error.error || 'Error al completar viaje');
      }
    } catch (error) {
      console.error('Error completing trip:', error);
      alert('Error al completar viaje');
    }
  };

  const showSuccessToast = (message: string) => {
    console.log('✅', message);
    // TODO: Implementar toast notification con tu librería de UI
  };

  const showErrorToast = (message: string) => {
    console.log('❌', message);
    // TODO: Implementar toast notification con tu librería de UI
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Package className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-500" />
          <p>Cargando viaje...</p>
        </div>
      </div>
    );
  }

  if (!activeTrip) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <h2 className="text-2xl font-bold mb-2">No tienes viajes activos</h2>
            <p className="text-gray-600">
              Cuando se te asigne un viaje, aparecerá aquí
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const progress = (activeTrip.completedOrders / activeTrip.totalOrders) * 100;
  const allCompleted = activeTrip.completedOrders === activeTrip.totalOrders;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Mi Viaje Activo</h1>
        <p className="text-gray-600">Viaje {activeTrip.tripNumber}</p>
      </div>

      {/* Progress Card */}
      <Card className="border-2 border-blue-500">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Progreso del Viaje</span>
            <Badge className="bg-blue-100 text-blue-800 text-lg px-4 py-1">
              {activeTrip.completedOrders}/{activeTrip.totalOrders}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={progress} className="h-3" />
          
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Total Pedidos</p>
              <p className="text-3xl font-bold">{activeTrip.totalOrders}</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Monto Total</p>
              <p className="text-3xl font-bold">
                ${parseFloat(activeTrip.totalAmount).toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Button
          size="lg"
          className="h-32 text-lg bg-blue-600 hover:bg-blue-700"
          onClick={() => setShowManualInput(true)}
        >
          <QrCode className="h-8 w-8 mr-3" />
          Ingresar Código QR
        </Button>

        <Button
          size="lg"
          variant="outline"
          className="h-32 text-lg"
          onClick={() => setShowOrdersList(true)}
        >
          <List className="h-8 w-8 mr-3" />
          Ver Lista Manual
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pendientes</p>
                <p className="text-2xl font-bold">
                  {activeTrip.orders.filter(o => o.status === 'pending').length}
                </p>
              </div>
              <Package className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Recogidos</p>
                <p className="text-2xl font-bold text-green-600">
                  {activeTrip.completedOrders}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Progreso</p>
                <p className="text-2xl font-bold">{Math.round(progress)}%</p>
              </div>
              <Package className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Complete Trip Button */}
      {allCompleted && (
        <Card className="border-2 border-green-500 bg-green-50">
          <CardContent className="py-6">
            <div className="text-center">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-3" />
              <h3 className="text-xl font-bold mb-2">
                ¡Todos los pedidos recogidos!
              </h3>
              <p className="text-gray-600 mb-4">
                Puedes finalizar este viaje ahora
              </p>
              <Button
                size="lg"
                className="bg-green-600 hover:bg-green-700"
                onClick={handleCompleteTrip}
              >
                <Check className="h-5 w-5 mr-2" />
                Finalizar Viaje
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual QR Input Modal */}
      <Dialog open={showManualInput} onOpenChange={setShowManualInput}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ingresar Código QR</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Ingresa manualmente el código QR del pedido
            </p>
            
            <Input
              placeholder="Ej: QR-ORD-123-1-1234567890"
              value={manualQR}
              onChange={(e) => setManualQR(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleManualQRSubmit()}
              disabled={scanning}
            />
            
            <Button
              className="w-full"
              onClick={handleManualQRSubmit}
              disabled={!manualQR.trim() || scanning}
            >
              {scanning ? 'Procesando...' : 'Confirmar'}
            </Button>
            
            <p className="text-xs text-gray-500 text-center">
              Tip: También puedes usar un lector de códigos QR externo
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Orders List Modal */}
      <Dialog open={showOrdersList} onOpenChange={setShowOrdersList}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lista de Pedidos</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-3">
            {activeTrip.orders.map((order) => (
              <Card
                key={order.id}
                className={
                  order.status === 'picked'
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200'
                }
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-bold">{order.orderNumber}</h4>
                        {order.status === 'picked' && (
                          <Badge className="bg-green-100 text-green-800">
                            <Check className="h-3 w-3 mr-1" />
                            Recogido
                          </Badge>
                        )}
                      </div>
                      
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-gray-500" />
                          <span>{order.customer.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-gray-500" />
                          <span>{order.customer.phone}</span>
                        </div>
                        <p className="text-gray-600 ml-6">
                          {order.customer.address}
                        </p>
                      </div>
                      
                      <div className="mt-2 font-bold text-lg">
                        ${parseFloat(order.totalAmount).toLocaleString()}
                      </div>
                      
                      {order.pickedAt && (
                        <p className="text-xs text-gray-500 mt-1">
                          Recogido: {new Date(order.pickedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    
                    <div>
                      {order.status === 'pending' ? (
                        <Button
                          onClick={() => handleMarkOrder(order.orderId)}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Marcar
                        </Button>
                      ) : (
                        <CheckCircle className="h-8 w-8 text-green-600" />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          {allCompleted && (
            <div className="mt-6 p-4 bg-green-50 rounded-lg text-center">
              <p className="font-medium mb-3">
                ¡Todos los pedidos recogidos!
              </p>
              <Button
                size="lg"
                className="w-full bg-green-600 hover:bg-green-700"
                onClick={handleCompleteTrip}
              >
                <Check className="h-5 w-5 mr-2" />
                Finalizar Viaje
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}