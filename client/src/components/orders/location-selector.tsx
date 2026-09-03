import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Navigation, Calculator } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LocationSelectorProps {
  onLocationSelected: (location: {
    address: string;
    latitude: string;
    longitude: string;
  }) => void;
  selectedLocation?: {
    address: string;
    latitude: string;
    longitude: string;
  } | null;
}

export default function LocationSelector({ onLocationSelected, selectedLocation }: LocationSelectorProps) {
  const [address, setAddress] = useState(selectedLocation?.address || "");
  const [latitude, setLatitude] = useState(selectedLocation?.latitude || "");
  const [longitude, setLongitude] = useState(selectedLocation?.longitude || "");
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const { toast } = useToast();

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
        
        // Simulate reverse geocoding (in real app, use Google Maps API)
        const mockAddress = `Lat: ${lat.substring(0, 7)}, Lng: ${lng.substring(0, 8)}`;
        
        setLatitude(lat);
        setLongitude(lng);
        setAddress(mockAddress);
        setIsGettingLocation(false);
        
        onLocationSelected({
          address: mockAddress,
          latitude: lat,
          longitude: lng,
        });

        toast({
          title: "Ubicación obtenida",
          description: "Se ha obtenido tu ubicación actual",
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

  const handleManualLocation = () => {
    if (!latitude || !longitude) {
      toast({
        title: "Coordenadas requeridas",
        description: "Por favor ingresa latitud y longitud",
        variant: "destructive",
      });
      return;
    }

    const location = {
      address: address || `${latitude}, ${longitude}`,
      latitude,
      longitude,
    };

    onLocationSelected(location);
    
    toast({
      title: "Ubicación establecida",
      description: "Se ha establecido la ubicación manualmente",
    });
  };

  // Predefined locations for CDMX
  const predefinedLocations = [
    {
      name: "Centro Histórico",
      address: "Av. Reforma 123, Col. Centro, CDMX",
      latitude: "19.4326",
      longitude: "-99.1332",
    },
    {
      name: "Roma Norte",
      address: "Calle 5 de Mayo 456, Col. Roma Norte, CDMX",
      latitude: "19.4195",
      longitude: "-99.1570",
    },
    {
      name: "Del Valle",
      address: "Av. Insurgentes Sur 789, Col. Del Valle, CDMX",
      latitude: "19.3889",
      longitude: "-99.1677",
    },
    {
      name: "Polanco",
      address: "Av. Presidente Masaryk 234, Col. Polanco, CDMX",
      latitude: "19.4338",
      longitude: "-99.1921",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <MapPin className="h-5 w-5 mr-2" />
          Ubicación del Cliente
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Location Button */}
        <Button
          onClick={handleGetCurrentLocation}
          disabled={isGettingLocation}
          variant="outline"
          className="w-full"
        >
          <Navigation className="h-4 w-4 mr-2" />
          {isGettingLocation ? "Obteniendo ubicación..." : "Usar ubicación actual"}
        </Button>

        {/* Predefined Locations */}
        <div>
          <Label className="text-sm font-medium">Ubicaciones Frecuentes</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            {predefinedLocations.map((location) => (
              <Button
                key={location.name}
                onClick={() => {
                  setAddress(location.address);
                  setLatitude(location.latitude);
                  setLongitude(location.longitude);
                  onLocationSelected(location);
                }}
                variant="outline"
                size="sm"
                className="text-left justify-start"
              >
                <div className="truncate">
                  <div className="font-medium">{location.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{location.address}</div>
                </div>
              </Button>
            ))}
          </div>
        </div>

        {/* Manual Entry */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Ubicación Manual</Label>
          <div>
            <Label htmlFor="address" className="text-xs">Dirección</Label>
            <Input
              id="address"
              placeholder="Ingresa la dirección del cliente"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="latitude" className="text-xs">Latitud</Label>
              <Input
                id="latitude"
                placeholder="19.4326"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="longitude" className="text-xs">Longitud</Label>
              <Input
                id="longitude"
                placeholder="-99.1332"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
              />
            </div>
          </div>
          <Button
            onClick={handleManualLocation}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <Calculator className="h-4 w-4 mr-2" />
            Establecer ubicación
          </Button>
        </div>

        {/* Selected Location Display */}
        {selectedLocation && (
          <div className="p-3 bg-success/10 border border-success/40 rounded-lg">
            <div className="flex items-start space-x-2">
              <MapPin className="h-4 w-4 text-success mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-success">Ubicación seleccionada</p>
                <p className="text-xs text-success truncate">{selectedLocation.address}</p>
                <p className="text-xs text-success">
                  {selectedLocation.latitude}, {selectedLocation.longitude}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}