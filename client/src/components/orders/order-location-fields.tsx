// client/src/components/orders/order-location-fields.tsx

import { useState, useEffect } from "react";
import { UseFormReturn } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Navigation } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface OrderLocationFieldsProps {
  form: UseFormReturn<any>;
}

// Mismos datos de provincias y municipios
const PROVINCES = [
  "Azua", "Baoruco", "Barahona", "Dajabón", "Distrito Nacional", "Duarte",
  "El Seibo", "Elías Piña", "Espaillat", "Hato Mayor", "Hermanas Mirabal",
  "Independencia", "La Altagracia", "La Romana", "La Vega", "María Trinidad Sánchez",
  "Monseñor Nouel", "Monte Cristi", "Monte Plata", "Pedernales", "Peravia",
  "Puerto Plata", "Samaná", "San Cristóbal", "San José de Ocoa", "San Juan",
  "San Pedro de Macorís", "Sánchez Ramírez", "Santiago", "Santiago Rodríguez",
  "Santo Domingo", "Valverde"
];

const MUNICIPALITIES: Record<string, string[]> = {
  "Santo Domingo": [
    "Santo Domingo Este",
    "Santo Domingo Norte",
    "Santo Domingo Oeste",
    "Boca Chica",
    "Los Alcarrizos",
    "Pedro Brand",
    "San Antonio de Guerra"
  ],
  "Distrito Nacional": ["Distrito Nacional"],
  "Santiago": [
    "Santiago",
    "Bisonó",
    "Jánico",
    "Licey al Medio",
    "Puñal",
    "San José de las Matas",
    "Tamboril",
    "Villa Bisonó",
    "Villa González"
  ],
  // ... más municipios según necesidad
};

const COMMON_SECTORS = [
  "Los Minas", "San Luis", "Alma Rosa I", "Alma Rosa II", "Mendoza",
  "Los Prados", "Ozama", "Villa Duarte", "Invivienda", "Los Trinitarios",
  "Villa Mella", "Los Guaricanos", "Sabana Perdida", "La Victoria",
  "Herrera", "Pantoja", "Engombe", "Palamara", "Palmarejo",
  "Gazcue", "Bella Vista", "Naco", "Piantini", "La Esperilla",
  "La Castellana", "Los Cacicazgos", "Paraíso", "Ensanche Julieta",
];

export default function OrderLocationFields({ form }: OrderLocationFieldsProps) {
  const { toast } = useToast();
  const [selectedProvince, setSelectedProvince] = useState("");
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  // Actualizar provincia seleccionada
  useEffect(() => {
    const province = form.watch("customerProvince");
    if (province) {
      setSelectedProvince(province);
    }
  }, [form.watch("customerProvince")]);

  // Obtener municipios disponibles
  const availableMunicipalities = selectedProvince 
    ? MUNICIPALITIES[selectedProvince] || []
    : [];

  // Obtener ubicación GPS del navegador
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: "Geolocalización no disponible",
        description: "Tu navegador no soporta geolocalización",
        variant: "destructive",
      });
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude.toString();
        const lng = position.coords.longitude.toString();
        
        form.setValue("customerLatitude", lat);
        form.setValue("customerLongitude", lng);
        
        setIsGettingLocation(false);
        
        toast({
          title: "Ubicación obtenida",
          description: "Coordenadas GPS guardadas. Completa provincia, municipio y sector manualmente.",
        });
      },
      (error) => {
        setIsGettingLocation(false);
        toast({
          title: "Error al obtener ubicación",
          description: "No se pudo obtener tu ubicación actual",
          variant: "destructive",
        });
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Ubicación del Cliente
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alerta informativa */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">
            <strong>💡 Importante:</strong> La ubicación precisa ayuda a asignar el técnico más cercano.
            Completa todos los campos para mejor asignación automática.
          </p>
        </div>

        {/* Provincia, Municipio, Sector */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Provincia */}
          <div className="space-y-2">
            <Label>
              Provincia *
              <span className="text-red-500 ml-1">●</span>
            </Label>
            <Select
              value={form.watch("customerProvince") || ""}
              onValueChange={(value) => {
                form.setValue("customerProvince", value);
                setSelectedProvince(value);
                // Resetear municipio y sector
                form.setValue("customerMunicipality", "");
                form.setValue("customerSector", "");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar provincia" />
              </SelectTrigger>
              <SelectContent>
                {PROVINCES.map((province) => (
                  <SelectItem key={province} value={province}>
                    {province}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.customerProvince && (
              <p className="text-xs text-red-500">
                {form.formState.errors.customerProvince.message as string}
              </p>
            )}
          </div>

          {/* Municipio */}
          <div className="space-y-2">
            <Label>
              Municipio *
              <span className="text-red-500 ml-1">●</span>
            </Label>
            <Select
              value={form.watch("customerMunicipality") || ""}
              onValueChange={(value) => form.setValue("customerMunicipality", value)}
              disabled={!selectedProvince}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar municipio" />
              </SelectTrigger>
              <SelectContent>
                {availableMunicipalities.map((municipality) => (
                  <SelectItem key={municipality} value={municipality}>
                    {municipality}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!selectedProvince && (
              <p className="text-xs text-gray-500">Primero selecciona una provincia</p>
            )}
            {form.formState.errors.customerMunicipality && (
              <p className="text-xs text-red-500">
                {form.formState.errors.customerMunicipality.message as string}
              </p>
            )}
          </div>

          {/* Sector */}
          <div className="space-y-2">
            <Label>
              Sector / Barrio *
              <span className="text-red-500 ml-1">●</span>
            </Label>
            <Input
              value={form.watch("customerSector") || ""}
              onChange={(e) => form.setValue("customerSector", e.target.value)}
              placeholder="Ej: Los Prados"
              list="order-sector-suggestions"
            />
            <datalist id="order-sector-suggestions">
              {COMMON_SECTORS.map((sector) => (
                <option key={sector} value={sector} />
              ))}
            </datalist>
            {form.formState.errors.customerSector && (
              <p className="text-xs text-red-500">
                {form.formState.errors.customerSector.message as string}
              </p>
            )}
          </div>
        </div>

        {/* Dirección completa */}
        <div className="space-y-2">
          <Label>
            Dirección Completa *
            <span className="text-red-500 ml-1">●</span>
          </Label>
          <Input
            value={form.watch("customerAddress") || ""}
            onChange={(e) => form.setValue("customerAddress", e.target.value)}
            placeholder="Calle, número, referencias, etc."
          />
          <p className="text-xs text-gray-500">
            Incluye detalles como número de casa, edificio, referencias cercanas
          </p>
          {form.formState.errors.customerAddress && (
            <p className="text-xs text-red-500">
              {form.formState.errors.customerAddress.message as string}
            </p>
          )}
        </div>

        {/* Teléfono de contacto en ubicación */}
        <div className="space-y-2">
          <Label>Teléfono de Contacto en Ubicación</Label>
          <Input
            value={form.watch("deliveryContactPhone") || ""}
            onChange={(e) => form.setValue("deliveryContactPhone", e.target.value)}
            placeholder="809-555-1234"
            type="tel"
          />
          <p className="text-xs text-gray-500">
            Si es diferente al teléfono principal del cliente
          </p>
        </div>

        {/* Coordenadas GPS (opcional pero útil) */}
        <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-sm">Coordenadas GPS (Opcional)</h4>
              <p className="text-xs text-gray-600">
                Permite cálculos de distancia más precisos
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGetCurrentLocation}
              disabled={isGettingLocation}
            >
              <Navigation className="h-4 w-4 mr-2" />
              {isGettingLocation ? "Obteniendo..." : "Obtener mi ubicación"}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Latitud</Label>
              <Input
                type="text"
                value={form.watch("customerLatitude") || ""}
                onChange={(e) => form.setValue("customerLatitude", e.target.value)}
                placeholder="18.4861"
                readOnly
                className="bg-white"
              />
            </div>
            <div className="space-y-2">
              <Label>Longitud</Label>
              <Input
                type="text"
                value={form.watch("customerLongitude") || ""}
                onChange={(e) => form.setValue("customerLongitude", e.target.value)}
                placeholder="-69.8908"
                readOnly
                className="bg-white"
              />
            </div>
          </div>
        </div>

        {/* Resumen visual de ubicación */}
        {form.watch("customerProvince") && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <h4 className="font-semibold text-sm text-green-900 mb-2">
              📍 Ubicación Seleccionada
            </h4>
            <div className="space-y-1 text-sm">
              <p>
                <strong>Provincia:</strong> {form.watch("customerProvince")}
              </p>
              {form.watch("customerMunicipality") && (
                <p>
                  <strong>Municipio:</strong> {form.watch("customerMunicipality")}
                </p>
              )}
              {form.watch("customerSector") && (
                <p>
                  <strong>Sector:</strong> {form.watch("customerSector")}
                </p>
              )}
              {form.watch("customerAddress") && (
                <p className="text-gray-700">
                  {form.watch("customerAddress")}
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}