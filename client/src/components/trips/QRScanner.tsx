import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Camera, X, CheckCircle, AlertCircle, Keyboard } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface QRScannerProps {
  tripId: number;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function QRScanner({ tripId, open, onClose, onSuccess }: QRScannerProps) {
  const [manualMode, setManualMode] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open && !manualMode) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => stopCamera();
  }, [open, manualMode]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('No se pudo acceder a la cámara. Usa modo manual.');
      setManualMode(true);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const handleScan = async (qrCode: string) => {
    if (scanning) return;
    
    setScanning(true);
    setError('');

    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`/api/trips/${tripId}/scan-order`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ qrCode })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al escanear');
      }

      toast({
        title: 'Pedido recogido',
        description: `${data.order.orderNumber} marcado correctamente`,
      });

      setManualCode('');
      onSuccess();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al procesar QR';
      setError(message);
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });
    } finally {
      setScanning(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      handleScan(manualCode.trim());
    }
  };

  const handleClose = () => {
    stopCamera();
    setManualCode('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {manualMode ? <Keyboard className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
            {manualMode ? 'Ingresar Código' : 'Escanear Código QR'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!manualMode ? (
            <>
              {/* Visor de Cámara */}
              <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                
                {/* Overlay de guía */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-64 h-64 border-4 border-white rounded-lg shadow-lg">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500" />
                  </div>
                </div>

                {/* Instrucción */}
                <div className="absolute bottom-4 left-0 right-0 text-center">
                  <p className="text-white text-sm bg-black bg-opacity-50 px-4 py-2 rounded inline-block">
                    Centra el código QR en el recuadro
                  </p>
                </div>
              </div>

              {/* Nota: En producción, aquí deberías usar una librería como 'react-qr-reader' */}
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Nota de desarrollo:</strong> Implementar librería de escaneo QR 
                  como <code>react-qr-reader</code> o <code>@zxing/browser</code>
                </AlertDescription>
              </Alert>
            </>
          ) : (
            /* Modo Manual */
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Código del Pedido
                </label>
                <Input
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Ej: QR-ORD-101-1-1729771200"
                  disabled={scanning}
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">
                  Ingresa el código completo del QR
                </p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button 
                type="submit" 
                className="w-full"
                disabled={!manualCode.trim() || scanning}
              >
                {scanning ? 'Procesando...' : 'Marcar Pedido'}
              </Button>
            </form>
          )}

          {/* Cambiar Modo */}
          <div className="flex items-center justify-center gap-4 pt-2 border-t">
            <Button
              variant={manualMode ? 'outline' : 'ghost'}
              size="sm"
              onClick={() => setManualMode(false)}
            >
              <Camera className="h-4 w-4 mr-2" />
              Cámara
            </Button>
            <Button
              variant={!manualMode ? 'outline' : 'ghost'}
              size="sm"
              onClick={() => setManualMode(true)}
            >
              <Keyboard className="h-4 w-4 mr-2" />
              Manual
            </Button>
          </div>

          {/* Cerrar */}
          <Button variant="outline" className="w-full" onClick={handleClose}>
            <X className="h-4 w-4 mr-2" />
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* 
 * NOTA PARA IMPLEMENTACIÓN COMPLETA:
 * 
 * Instalar librería de escaneo QR:
 * npm install react-qr-reader
 * 
 * Luego reemplazar el video por:
 * 
 * import { QrReader } from 'react-qr-reader';
 * 
 * <QrReader
 *   onResult={(result, error) => {
 *     if (result) {
 *       handleScan(result.getText());
 *     }
 *     if (error) {
 *       console.error(error);
 *     }
 *   }}
 *   constraints={{ facingMode: 'environment' }}
 *   containerStyle={{ width: '100%' }}
 * />
 */
