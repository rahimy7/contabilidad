import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface Trip {
  id: number;
  tripNumber: string;
  status: string;
  totalOrders: number;
}

interface DeleteTripButtonProps {
  trip: Trip;
  onSuccess: () => void;
}

export function DeleteTripButton({ trip, onSuccess }: DeleteTripButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  // No mostrar botón si está en progreso
  if (trip.status === 'processing') {
    return null;
  }

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await apiRequest('DELETE', `/api/trips/${trip.id}`);

      toast({
        title: 'Viaje eliminado',
        description: `${trip.tripNumber} fue eliminado correctamente`
      });

      onSuccess();
      setShowDialog(false);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'No se pudo eliminar el viaje'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowDialog(true)}
        className="text-red-600 hover:text-red-700 hover:bg-red-50"
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar viaje?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el viaje <strong>{trip.tripNumber}</strong>.
              <br />
              Las {trip.totalOrders} órdenes asociadas NO serán eliminadas, 
              solo se desvinculará el viaje.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}