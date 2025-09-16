// client/src/components/WebOrderModal.tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ShoppingCart, Phone, MapPin, Send, Loader2, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface WebOrderData {
  phone: string;
  address: string;
  notes?: string;
}

interface WebOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: any[];
  cartTotal: number;
  storeInfo: any;
  onOrderSubmitted: () => void;
}

export const WebOrderModal: React.FC<WebOrderModalProps> = ({
  isOpen,
  onClose,
  cart,
  cartTotal,
  storeInfo,
  onOrderSubmitted
}) => {
  const [orderData, setOrderData] = useState<WebOrderData>({
    phone: '',
    address: '',
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<WebOrderData>>({});
  const { toast } = useToast();

  const validateForm = (): boolean => {
    const newErrors: Partial<WebOrderData> = {};
    
    // Validar teléfono
    const phoneRegex = /^[0-9+\-\s()]{8,}$/;
    if (!orderData.phone.trim()) {
      newErrors.phone = 'El teléfono es requerido';
    } else if (!phoneRegex.test(orderData.phone.trim())) {
      newErrors.phone = 'Formato de teléfono inválido (mínimo 8 dígitos)';
    }
    
    // Validar dirección
    if (!orderData.address.trim()) {
      newErrors.address = 'La dirección es requerida';
    } else if (orderData.address.trim().length < 10) {
      newErrors.address = 'La dirección debe tener al menos 10 caracteres';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const formatCurrency = (amount: number): string => {
    return amount.toLocaleString('es-DO', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsSubmitting(true);
    
    try {
      // Crear payload de la orden
      const orderPayload = {
        customerPhone: orderData.phone.trim(),
        customerAddress: orderData.address.trim(),
        notes: orderData.notes?.trim() || '',
        items: cart.map(item => ({
          productId: item.id,
          productName: item.name,
          quantity: item.quantity,
          unitPrice: item.cartPrice || item.convertedPrice || parseFloat(item.price),
          totalPrice: (item.cartPrice || item.convertedPrice || parseFloat(item.price)) * item.quantity
        })),
        totalAmount: cartTotal,
        orderSource: 'web_catalog',
        storeId: storeInfo?.id
      };

      // Enviar al servidor
      const response = await fetch('/api/orders/create-web-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderPayload)
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Éxito
        toast({
          title: "¡Pedido creado exitosamente!",
          description: `Número de orden: ${result.orderNumber}. Tu pedido está siendo procesado.`,
          variant: "default",
        });
        
        // Mostrar mensaje adicional
        setTimeout(() => {
          toast({
            title: "Procesando pedido",
            description: "En unos momentos te estaremos informando sobre el estado del mismo.",
            variant: "default",
          });
        }, 2000);
        
        // Limpiar y cerrar
        setOrderData({ phone: '', address: '', notes: '' });
        setErrors({});
        onOrderSubmitted();
        onClose();
      } else {
        // Error del servidor
        toast({
          title: "Error al crear el pedido",
          description: result.message || "Por favor intenta nuevamente",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error al enviar pedido:', error);
      toast({
        title: "Error de conexión",
        description: "No se pudo enviar el pedido. Verifica tu conexión e intenta nuevamente.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof WebOrderData, value: string) => {
    setOrderData(prev => ({ ...prev, [field]: value }));
    // Limpiar error del campo cuando el usuario empiece a escribir
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setOrderData({ phone: '', address: '', notes: '' });
      setErrors({});
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md mx-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-blue-600" />
              Realizar Pedido Web
            </DialogTitle>
            {!isSubmitting && (
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Resumen del pedido */}
          <div className="bg-gray-50 p-4 rounded-lg border">
            <h3 className="font-semibold mb-3 text-gray-900">Resumen del pedido:</h3>
            <div className="space-y-2">
              {cart.map((item, index) => {
                const unitPrice = item.cartPrice || item.convertedPrice || parseFloat(item.price);
                const subtotal = unitPrice * item.quantity;
                
                return (
                  <div key={index} className="flex justify-between text-sm">
                    <div className="flex-1 pr-2">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-gray-600"> x{item.quantity}</span>
                    </div>
                    <span className="font-medium">${formatCurrency(subtotal)}</span>
                  </div>
                );
              })}
              <div className="border-t pt-2 mt-2">
                <div className="flex justify-between font-bold text-base">
                  <span>Total:</span>
                  <span className="text-blue-600">${formatCurrency(cartTotal)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Campo de teléfono */}
          <div className="space-y-2">
            <Label htmlFor="phone" className="flex items-center gap-2 font-medium">
              <Phone className="w-4 h-4 text-blue-600" />
              Número de teléfono *
            </Label>
            <Input
              id="phone"
              type="tel"
              placeholder="Ej: 809-555-1234 o +1-809-555-1234"
              value={orderData.phone}
              onChange={(e) => handleInputChange('phone', e.target.value)}
              className={`${errors.phone ? 'border-red-500 focus:border-red-500' : 'focus:border-blue-500'}`}
              disabled={isSubmitting}
              autoComplete="tel"
            />
            {errors.phone && (
              <p className="text-red-500 text-sm flex items-center gap-1">
                <span>⚠️</span>
                {errors.phone}
              </p>
            )}
          </div>

          {/* Campo de dirección */}
          <div className="space-y-2">
            <Label htmlFor="address" className="flex items-center gap-2 font-medium">
              <MapPin className="w-4 h-4 text-blue-600" />
              Dirección de entrega *
            </Label>
            <Textarea
              id="address"
              placeholder="Ingresa tu dirección completa: calle, número, sector, ciudad..."
              value={orderData.address}
              onChange={(e) => handleInputChange('address', e.target.value)}
              className={`${errors.address ? 'border-red-500 focus:border-red-500' : 'focus:border-blue-500'} min-h-[80px]`}
              disabled={isSubmitting}
              rows={3}
              autoComplete="street-address"
            />
            {errors.address && (
              <p className="text-red-500 text-sm flex items-center gap-1">
                <span>⚠️</span>
                {errors.address}
              </p>
            )}
          </div>

          {/* Campo de notas (opcional) */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="font-medium text-gray-700">
              Notas adicionales (opcional)
            </Label>
            <Textarea
              id="notes"
              placeholder="Instrucciones especiales, referencias del lugar, horario preferido..."
              value={orderData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              disabled={isSubmitting}
              rows={2}
              className="focus:border-blue-500"
            />
          </div>

          {/* Información adicional */}
          <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800 border border-blue-200">
            <p className="font-medium mb-1">ℹ️ Información importante:</p>
            <ul className="text-xs space-y-1">
              <li>• Tu pedido será procesado inmediatamente</li>
              <li>• Recibirás confirmación por WhatsApp (si está disponible)</li>
              <li>• Te contactaremos para coordinar la entrega</li>
            </ul>
          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || cart.length === 0}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Enviar Pedido
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};