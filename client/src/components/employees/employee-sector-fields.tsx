// client/src/components/employees/employee-sector-fields.tsx

import { useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Plus, X } from "lucide-react";

interface EmployeeSectorFieldsProps {
  form: UseFormReturn<any>;
}

// Datos de República Dominicana
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
  "La Vega": [
    "La Vega",
    "Constanza",
    "Jarabacoa",
    "Jima Abajo"
  ],
  "San Cristóbal": [
    "San Cristóbal",
    "Bajos de Haina",
    "Cambita Garabitos",
    "San Gregorio de Nigua",
    "Sabana Grande de Palenque",
    "Villa Altagracia",
    "Yaguate"
  ],
  // Agrega más según necesites
};

// Sectores comunes de Santo Domingo como ejemplo
const COMMON_SECTORS = [
  // Santo Domingo Este
  "Los Minas", "San Luis", "Alma Rosa I", "Alma Rosa II", "Mendoza",
  "Los Prados", "Ozama", "Villa Duarte", "Invivienda", "Los Trinitarios",
  
  // Santo Domingo Norte
  "Villa Mella", "Los Guaricanos", "Sabana Perdida", "La Victoria",
  "Villa Francisca", "El Millón", "Capotillo",
  
  // Santo Domingo Oeste
  "Herrera", "Pantoja", "Engombe", "Palamara", "Palmarejo",
  
  // Distrito Nacional
  "Gazcue", "Bella Vista", "Naco", "Piantini", "La Esperilla",
  "La Castellana", "Los Cacicazgos", "Paraíso", "Ensanche Julieta",
  "Villa Juana", "La Fe", "Cristo Rey", "Villas Agrícolas",
];

export default function EmployeeSectorFields({ form }: EmployeeSectorFieldsProps) {
  const [sectorInput, setSectorInput] = useState("");
  const [selectedProvince, setSelectedProvince] = useState("");
  const [coverageProvinceInput, setCoverageProvinceInput] = useState("");
  const [coverageMunicipalityInput, setCoverageMunicipalityInput] = useState("");
  const [coverageSectorInput, setCoverageSectorInput] = useState("");

  // Obtener municipios según provincia seleccionada
  const availableMunicipalities = selectedProvince 
    ? MUNICIPALITIES[selectedProvince] || []
    : [];

  // Agregar sector a cobertura
  const addCoverageSector = () => {
    if (coverageSectorInput.trim()) {
      const current = form.getValues("coverageSectors") || [];
      if (!current.includes(coverageSectorInput.trim())) {
        form.setValue("coverageSectors", [...current, coverageSectorInput.trim()]);
      }
      setCoverageSectorInput("");
    }
  };

  // Eliminar sector de cobertura
  const removeCoverageSector = (sector: string) => {
    const current = form.getValues("coverageSectors") || [];
    form.setValue("coverageSectors", current.filter(s => s !== sector));
  };

  // Agregar provincia de cobertura
  const addCoverageProvince = () => {
    if (coverageProvinceInput) {
      const current = form.getValues("coverageProvinces") || [];
      if (!current.includes(coverageProvinceInput)) {
        form.setValue("coverageProvinces", [...current, coverageProvinceInput]);
      }
      setCoverageProvinceInput("");
    }
  };

  // Agregar municipio de cobertura
  const addCoverageMunicipality = () => {
    if (coverageMunicipalityInput) {
      const current = form.getValues("coverageMunicipalities") || [];
      if (!current.includes(coverageMunicipalityInput)) {
        form.setValue("coverageMunicipalities", [...current, coverageMunicipalityInput]);
      }
      setCoverageMunicipalityInput("");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Ubicación y Cobertura de Servicio
        </CardTitle>
        <CardDescription>
          Define la ubicación base del empleado y las zonas que puede cubrir
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* UBICACIÓN BASE */}
        <div className="space-y-4 p-4 border rounded-lg bg-blue-50/50">
          <h3 className="font-semibold text-sm text-blue-900">📍 Ubicación Base</h3>
          <p className="text-xs text-blue-700">
            La ubicación principal donde opera el empleado
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Provincia Base */}
            <div className="space-y-2">
              <Label>Provincia *</Label>
              <Select
                value={form.watch("province")}
                onValueChange={(value) => {
                  form.setValue("province", value);
                  setSelectedProvince(value);
                  // Reset municipio y sector si cambia provincia
                  form.setValue("municipality", "");
                  form.setValue("sector", "");
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
            </div>

            {/* Municipio Base */}
            <div className="space-y-2">
              <Label>Municipio</Label>
              <Select
                value={form.watch("municipality")}
                onValueChange={(value) => form.setValue("municipality", value)}
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
            </div>

            {/* Sector Base */}
            <div className="space-y-2">
              <Label>Sector</Label>
              <Input
                value={form.watch("sector") || ""}
                onChange={(e) => form.setValue("sector", e.target.value)}
                placeholder="Ej: Los Prados"
                list="sector-suggestions"
              />
              <datalist id="sector-suggestions">
                {COMMON_SECTORS.map((sector) => (
                  <option key={sector} value={sector} />
                ))}
              </datalist>
              <p className="text-xs text-gray-500">
                Sector o barrio específico
              </p>
            </div>
          </div>

          {/* Dirección completa */}
          <div className="space-y-2">
            <Label>Dirección Base Completa</Label>
            <Input
              value={form.watch("baseAddress") || ""}
              onChange={(e) => form.setValue("baseAddress", e.target.value)}
              placeholder="Ej: Calle Principal #123, Los Prados, Santo Domingo Este"
            />
          </div>
        </div>

        {/* COBERTURA AMPLIADA */}
        <div className="space-y-4 p-4 border rounded-lg bg-green-50/50">
          <h3 className="font-semibold text-sm text-green-900">🗺️ Áreas de Cobertura</h3>
          <p className="text-xs text-green-700">
            Provincias, municipios y sectores adicionales que puede atender
          </p>

          {/* Provincias de cobertura */}
          <div className="space-y-2">
            <Label>Provincias que Cubre</Label>
            <div className="flex gap-2">
              <Select
                value={coverageProvinceInput}
                onValueChange={setCoverageProvinceInput}
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
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={addCoverageProvince}
                disabled={!coverageProvinceInput}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {(form.watch("coverageProvinces") || []).map((province: string) => (
                <Badge key={province} variant="secondary" className="gap-1">
                  {province}
                  <button
                    type="button"
                    onClick={() => {
                      const current = form.getValues("coverageProvinces") || [];
                      form.setValue("coverageProvinces", current.filter(p => p !== province));
                    }}
                    className="ml-1 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          {/* Municipios de cobertura */}
          <div className="space-y-2">
            <Label>Municipios que Cubre</Label>
            <div className="flex gap-2">
              <Input
                value={coverageMunicipalityInput}
                onChange={(e) => setCoverageMunicipalityInput(e.target.value)}
                placeholder="Escribe el municipio"
                list="municipality-suggestions"
              />
              <datalist id="municipality-suggestions">
                {Object.values(MUNICIPALITIES).flat().map((municipality) => (
                  <option key={municipality} value={municipality} />
                ))}
              </datalist>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={addCoverageMunicipality}
                disabled={!coverageMunicipalityInput.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {(form.watch("coverageMunicipalities") || []).map((municipality: string) => (
                <Badge key={municipality} variant="secondary" className="gap-1">
                  {municipality}
                  <button
                    type="button"
                    onClick={() => {
                      const current = form.getValues("coverageMunicipalities") || [];
                      form.setValue("coverageMunicipalities", current.filter(m => m !== municipality));
                    }}
                    className="ml-1 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          {/* Sectores de cobertura */}
          <div className="space-y-2">
            <Label>Sectores Específicos que Cubre</Label>
            <div className="flex gap-2">
              <Input
                value={coverageSectorInput}
                onChange={(e) => setCoverageSectorInput(e.target.value)}
                placeholder="Ej: Bella Vista, Naco, Piantini"
                list="coverage-sector-suggestions"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCoverageSector();
                  }
                }}
              />
              <datalist id="coverage-sector-suggestions">
                {COMMON_SECTORS.map((sector) => (
                  <option key={sector} value={sector} />
                ))}
              </datalist>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={addCoverageSector}
                disabled={!coverageSectorInput.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Presiona Enter o click en + para agregar
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {(form.watch("coverageSectors") || []).map((sector: string) => (
                <Badge key={sector} variant="secondary" className="gap-1">
                  {sector}
                  <button
                    type="button"
                    onClick={() => removeCoverageSector(sector)}
                    className="ml-1 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* CONFIGURACIÓN ADICIONAL */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Radio de Servicio (km)</Label>
            <Input
              type="number"
              step="0.5"
              min="1"
              max="100"
              value={form.watch("serviceRadius") || ""}
              onChange={(e) => form.setValue("serviceRadius", e.target.value)}
              placeholder="10"
            />
            <p className="text-xs text-gray-500">
              Distancia máxima desde ubicación base
            </p>
          </div>

          <div className="space-y-2">
            <Label>Órdenes Máximas por Día</Label>
            <Input
              type="number"
              min="1"
              max="20"
              value={form.watch("maxDailyOrders") || ""}
              onChange={(e) => form.setValue("maxDailyOrders", e.target.value)}
              placeholder="5"
            />
            <p className="text-xs text-gray-500">
              Capacidad diaria de órdenes
            </p>
          </div>
        </div>

        {/* Coordenadas GPS (opcional) */}
        <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
          <h3 className="font-semibold text-sm text-gray-900">🌍 Coordenadas GPS (Opcional)</h3>
          <p className="text-xs text-gray-600">
            Para cálculos de distancia precisos en el futuro
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Latitud</Label>
              <Input
                type="text"
                value={form.watch("baseLatitude") || ""}
                onChange={(e) => form.setValue("baseLatitude", e.target.value)}
                placeholder="18.4861"
              />
            </div>
            <div className="space-y-2">
              <Label>Longitud</Label>
              <Input
                type="text"
                value={form.watch("baseLongitude") || ""}
                onChange={(e) => form.setValue("baseLongitude", e.target.value)}
                placeholder="-69.8908"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}