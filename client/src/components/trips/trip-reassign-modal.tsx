import { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiGet, apiRequest } from '@/lib/queryClient';
import { Loader2, Users, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Trip {
  id: number;
  tripNumber: string;
  assignedUserId: number;
  assignedUser?: {
    id: number;
    name: string;
    email: string;
    role: string;
  };
  status: string;
  totalOrders: number;
  totalAmount: string;
}

interface Candidate {
  id: number;
  name: string;
  email: string;
  role: string;
  phone?: string;
}

interface TripReassignModalProps {
  trip: Trip;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function TripReassignModal({ 
  trip, 
  isOpen, 
  onClose, 
  onSuccess 
}: TripReassignModalProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const { toast } = useToast();

  // Cargar candidatos cuando se abre el modal
  useEffect(() => {
    if (isOpen && trip) {
      loadCandidates();
    }
  }, [isOpen, trip]);

  const loadCandidates = async () => {
    setIsLoadingCandidates(true);
    try {
      const response = await apiGet<any>(
        `/api/trips/${trip.id}/reassignment-candidates`
      );
      setCandidates(response.candidates || []);
    } catch (error) {
      console.error('Error cargando candidatos:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudieron cargar los candidatos disponibles'
      });
    } finally {
      setIsLoadingCandidates(false);
    }
  };

  const handleReassign = async () => {
    if (!selectedUserId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Debes seleccionar un usuario'
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest<any>(
        'PATCH',
        `/api/trips/${trip.id}/reassign`,
        {
          newUserId: parseInt(selectedUserId),
          reason: reason.trim() || undefined
        }
      );

      toast({
        title: 'Viaje reasignado',
        description: response.message
      });

      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Error reasignando viaje:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'No se pudo reasignar el viaje'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedUserId('');
    setReason('');
    onClose();
  };

  const selectedCandidate = candidates.find(c => c.id === parseInt(selectedUserId));

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Reasignar Viaje
          </DialogTitle>
          <DialogDescription>
            Reasigna el viaje {trip.tripNumber} a otro usuario. 
            Todas las órdenes del viaje serán actualizadas automáticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Info del viaje actual */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                <p className="font-medium">Usuario actual: {trip.assignedUser?.name}</p>
                <p className="text-sm text-muted-foreground">
                  {trip.totalOrders} órdenes · ${trip.totalAmount}
                </p>
              </div>
            </AlertDescription>
          </Alert>

          {/* Selector de nuevo usuario */}
          <div className="space-y-2">
            <Label htmlFor="newUser">
              Reasignar a <span className="text-destructive">*</span>
            </Label>
            {isLoadingCandidates ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : candidates.length === 0 ? (
              <Alert variant="destructive">
                <AlertDescription>
                  No hay otros usuarios disponibles para reasignar este viaje
                </AlertDescription>
              </Alert>
            ) : (
              <Select
                value={selectedUserId}
                onValueChange={setSelectedUserId}
              >
                <SelectTrigger id="newUser">
                  <SelectValue placeholder="Selecciona un usuario..." />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((candidate) => (
                    <SelectItem 
                      key={candidate.id} 
                      value={candidate.id.toString()}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{candidate.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {candidate.role} · {candidate.email}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Vista previa del cambio */}
          {selectedCandidate && (
            <Alert>
              <AlertDescription>
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {trip.assignedUser?.name} → {selectedCandidate.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Se actualizarán {trip.totalOrders} órdenes
                  </p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Razón de reasignación */}
          <div className="space-y-2">
            <Label htmlFor="reason">
              Razón de reasignación (opcional)
            </Label>
            <Textarea
              id="reason"
              placeholder="Ej: Usuario no disponible, cambio de ruta, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleReassign}
            disabled={!selectedUserId || isLoading || candidates.length === 0}
          >
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Reasignar Viaje
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// Botón para abrir el modal (usar en la lista de viajes)
// ============================================

interface ReassignTripButtonProps {
  trip: Trip;
  onSuccess: () => void;
}

export function ReassignTripButton({ trip, onSuccess }: ReassignTripButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Solo mostrar el botón si el viaje no está completado o cancelado
  if (trip.status === 'completed' || trip.status === 'cancelled') {
    return null;
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsModalOpen(true)}
      >
        <Users className="w-4 h-4 mr-2" />
        Reasignar
      </Button>

      <TripReassignModal
        trip={trip}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={onSuccess}
      />
    </>
  );
}