import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Truck, Clock, MapPin, Calculator } from "lucide-react";
import { Product } from "@shared/schema";

interface PricingCalculatorProps {
  product: Product;
  quantity: number;
  customerLocation?: {
    address: string;
    latitude: string;
    longitude: string;
  } | null;
  installationComplexity?: number;
  partsNeeded?: Array<{productId: number; quantity: number}>;
  onPricingUpdate: (pricing: {
    basePrice: number;
    deliveryCost: number;
    installationCost?: number;
    partsCost?: number;
    laborCost?: number;
    totalPrice: number;
    deliveryTime?: number;
    deliveryDistance?: number;
  }) => void;
}

export default function PricingCalculator({ 
  product, 
  quantity, 
  customerLocation, 
  installationComplexity = 1,
  partsNeeded = [],
  onPricingUpdate 
}: PricingCalculatorProps) {
  const [pricing, setPricing] = useState<any>(null);

  // Calculate delivery cost
  const { data: deliveryInfo } = useQuery({
    queryKey: ["/api/delivery/calculate-cost", customerLocation?.latitude, customerLocation?.longitude, product.category],
    queryFn: () => {
      if (!customerLocation?.latitude || !customerLocation?.longitude) return null;
      return apiRequest("POST", "/api/delivery/calculate-cost", {
        customerLatitude: customerLocation.latitude,
        customerLongitude: customerLocation.longitude,
        productCategory: product.category
      });
    },
    enabled: !!(customerLocation?.latitude && customerLocation?.longitude),
  });

  // Calculate service pricing (for services only)
  const { data: servicePricing } = useQuery({
    queryKey: [
      "/api/services", 
      product.id, 
      "calculate-price", 
      installationComplexity, 
      partsNeeded,
      customerLocation?.latitude,
      customerLocation?.longitude
    ],
    queryFn: () => {
      if ((product as any).type !== "service" && product.category !== "service") return null;
      return apiRequest("POST", `/api/services/${product.id}/calculate-price`, {
        installationComplexity,
        partsNeeded,
        customerLatitude: customerLocation?.latitude,
        customerLongitude: customerLocation?.longitude
      });
    },
    enabled: (product as any).type === "service" || product.category === "service",
  });

  useEffect(() => {
    const isService = (product as any).type === "service" || product.category === "service";
    if (!isService) {
      // For products: base price + delivery
      const basePrice = parseFloat(product.price) * quantity;
      const deliveryCost = deliveryInfo?.cost || 0;
      const totalPrice = basePrice + deliveryCost;

      const calculatedPricing = {
        basePrice,
        deliveryCost,
        totalPrice,
        deliveryTime: deliveryInfo?.estimatedTime,
        deliveryDistance: deliveryInfo?.distance,
      };

      setPricing(calculatedPricing);
      onPricingUpdate(calculatedPricing);
    } else if (isService && servicePricing) {
      // For services: use calculated service pricing
      const basePrice = servicePricing.basePrice * quantity;
      const installationCost = servicePricing.installationCost * quantity;
      const partsCost = servicePricing.partsCost;
      const laborCost = servicePricing.laborHours * servicePricing.laborRate * quantity;
      const deliveryCost = servicePricing.deliveryCost || 0;
      const totalPrice = servicePricing.totalPrice * quantity;

      const calculatedPricing = {
        basePrice,
        deliveryCost,
        installationCost,
        partsCost,
        laborCost,
        totalPrice,
        deliveryTime: deliveryInfo?.estimatedTime,
        deliveryDistance: servicePricing.deliveryDistance,
      };

      setPricing(calculatedPricing);
      onPricingUpdate(calculatedPricing);
    }
  }, [product, quantity, deliveryInfo, servicePricing, installationComplexity, partsNeeded, customerLocation, onPricingUpdate]);

  if (!pricing) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center space-x-2 text-gray-500">
            <Calculator className="h-4 w-4 animate-spin" />
            <span className="text-sm">Calculando precios...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center">
            <Calculator className="h-5 w-5 mr-2" />
            Desglose de Precios
          </span>
          <Badge variant={(product as any).type === "service" || product.category === "service" ? "default" : "secondary"}>
            {(product as any).type === "service" || product.category === "service" ? "Servicio" : "Producto"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Base Price */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">
            Precio base {quantity > 1 && `(${quantity} unidades)`}
          </span>
          <span className="font-medium">${pricing.basePrice.toLocaleString('es-MX')}</span>
        </div>

        {/* Service-specific pricing */}
        {((product as any).type === "service" || product.category === "service") && (
          <>
            {pricing.installationCost > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Costo de instalación</span>
                <span className="font-medium">${pricing.installationCost.toLocaleString('es-MX')}</span>
              </div>
            )}
            
            {pricing.partsCost > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Costo de piezas</span>
                <span className="font-medium">${pricing.partsCost.toLocaleString('es-MX')}</span>
              </div>
            )}
            
            {pricing.laborCost > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Mano de obra</span>
                <span className="font-medium">${pricing.laborCost.toLocaleString('es-MX')}</span>
              </div>
            )}
          </>
        )}

        {/* Delivery Information */}
        {customerLocation && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center text-sm font-medium text-gray-700">
                <Truck className="h-4 w-4 mr-2" />
                Información de Entrega
              </div>
              
              <div className="pl-6 space-y-2">
                {pricing.deliveryDistance && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center text-gray-600">
                      <MapPin className="h-3 w-3 mr-1" />
                      Distancia
                    </span>
                    <span>{pricing.deliveryDistance} km</span>
                  </div>
                )}
                
                {pricing.deliveryTime && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center text-gray-600">
                      <Clock className="h-3 w-3 mr-1" />
                      Tiempo estimado
                    </span>
                    <span>{pricing.deliveryTime} min</span>
                  </div>
                )}
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Costo de entrega</span>
                  <span className="font-medium">${pricing.deliveryCost.toLocaleString('es-MX')}</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Total */}
        <Separator />
        <div className="flex justify-between items-center text-lg font-bold">
          <span>Total</span>
          <span className="text-green-600">${pricing.totalPrice.toLocaleString('es-MX')}</span>
        </div>

        {/* Location Info */}
        {customerLocation && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start space-x-2">
              <MapPin className="h-4 w-4 text-blue-600 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-blue-800">Entrega a:</p>
                <p className="text-xs text-blue-700 truncate">{customerLocation.address}</p>
              </div>
            </div>
          </div>
        )}

        {/* No location warning */}
        {!customerLocation && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start space-x-2">
              <MapPin className="h-4 w-4 text-amber-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-medium text-amber-800">Ubicación no especificada</p>
                <p className="text-xs text-amber-700">
                  Selecciona la ubicación del cliente para calcular el costo de entrega
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
