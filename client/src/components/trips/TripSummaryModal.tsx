import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Package, DollarSign, User, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TripSummaryModalProps {
  trip: {
    id: number;
    tripNumber: string;
    totalOrders: number;
    totalAmount: string;
    assignedUser: {
      name: string;
      phone: string;
    };
    orders: Array<{
      orderNumber: string;
      totalAmount: string;
    }>;
  } | null;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function TripSummaryModal({ trip, open, onClose, onConfirm }: TripSummaryModalProps) {
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP'
    }).format(num);
  };

  const handleConfirm = async () => {
    if (!trip) return;

    setSending(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`/api/trips/${trip.id}/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notes }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error al enviar viaje');
      }

      toast({
        title: 'Viaje enviado exitosamente',
        description: `${trip.tripNumber} ha sido enviado a ${trip.assignedUser.name}`,
      });

      setNotes('');
      onConfirm();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'No se pudo enviar el viaje',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  if (!trip) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Confirmar Envío de Viaje</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Información del Viaje */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600" />
              {trip.tripNumber}
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Delivery Asignado</p>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">{trip.assignedUser.name}</span>
                </div>
                <p className="text-sm text-gray-500 ml-6">{trip.assignedUser.phone}</p>
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-1">Resumen</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-gray-500" />
                    <span className="text-sm">
                      <strong>{trip.totalOrders}</strong> pedidos
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-gray-500" />
                    <span className="text-sm">
                      <strong>{formatCurrency(trip.totalAmount)}</strong>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Lista de Pedidos */}
          <div>
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              Pedidos a entregar
              <Badge variant="secondary">{trip.orders.length}</Badge>
            </h4>
            <div className="max-h-60 overflow-y-auto space-y-2 border rounded-lg p-3 bg-gray-50">
              {trip.orders.map((order, index) => (
                <div
                  key={order.orderNumber}
                  className="flex items-center justify-between p-2 bg-white rounded border"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-semibold">
                      {index + 1}
                    </div>
                    <span className="font-medium">{order.orderNumber}</span>
                  </div>
                  <span className="text-gray-600 font-medium">
                    {formatCurrency(order.totalAmount)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Notas Opcionales */}
          <div>
            <Label htmlFor="notes" className="mb-2 block">
              Notas adicionales (opcional)
            </Label>
            <Textarea
              id="notes"
              placeholder="Ej: Ruta optimizada por zona norte, entregar antes de las 5pm..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Confirmación Visual */}
          <div className="bg-green-50 p-3 rounded-lg border border-green-200">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-green-900">
                  Al confirmar, el viaje será enviado inmediatamente
                </p>
                <p className="text-green-700 mt-1">
                  El delivery recibirá una notificación y podrá comenzar a marcar los pedidos como recogidos.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={sending}>
            {sending ? 'Enviando...' : 'Confirmar y Enviar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
