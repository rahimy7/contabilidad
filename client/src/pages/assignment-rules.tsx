// client/src/pages/assignment-rules-sectors.tsx - FORMULARIO ACTUALIZADO

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Users, Briefcase, Zap } from "lucide-react";

// Schema de validación actualizado para sectores
const assignmentRuleSchema = z.object({
  name: z.string().min(3, "Nombre debe tener al menos 3 caracteres"),
  priority: z.number().min(1).max(10),
  isActive: z.boolean().default(true),
  
  // ✅ Criterios de sectores (reemplazan distancia)
  useSectorBased: z.boolean().default(true),
  requiredProvince: z.string().optional(),
  requiredMunicipality: z.string().optional(),
  requiredSectors: z.array(z.string()).optional(),
  allowAdjacentMunicipalities: z.boolean().default(true),
  
  // Criterios de especialización
  useSpecializationBased: z.boolean().default(false),
  requiredSpecializations: z.array(z.string()).optional(),
  
  // Criterios de carga de trabajo
  useWorkloadBased: z.boolean().default(true),
  maxOrdersPerTechnician: z.number().min(1).max(20),
  
  // Criterios de tiempo
  useTimeBased: z.boolean().default(true),
  availabilityRequired: z.boolean().default(true),
  
  // Aplicabilidad
  applicableServices: z.array(z.string()).optional(),
  
  // Comportamiento
  assignmentMethod: z.enum(["closest_available", "least_busy", "highest_skill", "round_robin"]),
  autoAssign: z.boolean().default(true), // ✅ Auto-asignar al crear orden
  notifyCustomer: z.boolean().default(true),
  estimatedResponseTime: z.number().default(60),
});

type AssignmentRuleForm = z.infer<typeof assignmentRuleSchema>;

export function AssignmentRuleFormSectors() {
  const [sectorsInput, setSectorsInput] = useState("");
  const [specializationsInput, setSpecializationsInput] = useState("");

  const form = useForm<AssignmentRuleForm>({
    resolver: zodResolver(assignmentRuleSchema),
    defaultValues: {
      priority: 5,
      isActive: true,
      useSectorBased: true,
      allowAdjacentMunicipalities: true,
      useWorkloadBased: true,
      maxOrdersPerTechnician: 5,
      useTimeBased: true,
      availabilityRequired: true,
      assignmentMethod: "closest_available",
      autoAssign: true,
      notifyCustomer: true,
      estimatedResponseTime: 60,
    },
  });

  // Provincias de República Dominicana (ejemplo)
  const provinces = [
    "Distrito Nacional",
    "Santo Domingo",
    "Santiago",
    "La Vega",
    "San Cristóbal",
    "Duarte",
    "La Altagracia",
    "San Pedro de Macorís",
    "Espaillat",
    "Puerto Plata",
    // ... más provincias
  ];

  // Municipios por provincia (ejemplo simplificado)
  const municipalities: Record<string, string[]> = {
    "Santo Domingo": [
      "Santo Domingo Este",
      "Santo Domingo Norte",
      "Santo Domingo Oeste",
      "Boca Chica",
      "Los Alcarrizos",
    ],
    "Distrito Nacional": [
      "Distrito Nacional",
    ],
    "Santiago": [
      "Santiago",
      "Villa González",
      "Tamboril",
      "Licey al Medio",
    ],
    // ... más municipios
  };

  const onSubmit = async (data: AssignmentRuleForm) => {
    try {
      // Aquí iría la llamada a la API
      console.log("Creando regla:", data);
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const selectedProvince = form.watch("requiredProvince");

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* Información básica */}
      <Card>
        <CardHeader>
          <CardTitle>Información Básica</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nombre de la Regla</Label>
              <Input
                {...form.register("name")}
                placeholder="Ej: Asignación por Sector"
              />
              {form.formState.errors.name && (
                <p className="text-sm text-red-500">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Prioridad (1-10)</Label>
              <Input
                type="number"
                {...form.register("priority", { valueAsNumber: true })}
                min={1}
                max={10}
              />
              <p className="text-xs text-gray-600">Mayor número = mayor prioridad</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <Label>Regla Activa</Label>
              <p className="text-sm text-gray-600">La regla se evaluará para nuevas órdenes</p>
            </div>
            <Switch {...form.register("isActive")} />
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg bg-blue-50 border-blue-200">
            <div>
              <Label className="text-blue-900">🤖 Auto-Asignar al Crear Orden</Label>
              <p className="text-sm text-blue-700">
                Si está activa, se ejecutará automáticamente cuando se cree una orden
              </p>
            </div>
            <Switch {...form.register("autoAssign")} />
          </div>
        </CardContent>
      </Card>

      {/* ✅ Criterios de Ubicación por Sectores */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Criterios de Ubicación (Sectores)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Usar asignación basada en sectores</Label>
            <Switch {...form.register("useSectorBased")} />
          </div>

          {form.watch("useSectorBased") && (
            <div className="space-y-4 pl-4 border-l-2 border-blue-200">
              <div className="space-y-2">
                <Label>Provincia Requerida</Label>
                <Select
                  value={form.watch("requiredProvince")}
                  onValueChange={(value) => form.setValue("requiredProvince", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar provincia" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todas las provincias</SelectItem>
                    {provinces.map((province) => (
                      <SelectItem key={province} value={province}>
                        {province}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-600">
                  Solo técnicos que cubran esta provincia
                </p>
              </div>

              {selectedProvince && (
                <div className="space-y-2">
                  <Label>Municipio Específico (Opcional)</Label>
                  <Select
                    value={form.watch("requiredMunicipality")}
                    onValueChange={(value) => form.setValue("requiredMunicipality", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todos los municipios" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todos los municipios</SelectItem>
                      {municipalities[selectedProvince]?.map((municipality) => (
                        <SelectItem key={municipality} value={municipality}>
                          {municipality}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Sectores Específicos (Opcional)</Label>
                <div className="flex gap-2">
                  <Input
                    value={sectorsInput}
                    onChange={(e) => setSectorsInput(e.target.value)}
                    placeholder="Ej: Los Prados, Bella Vista"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const sectors = form.watch("requiredSectors") || [];
                        form.setValue("requiredSectors", [...sectors, sectorsInput.trim()]);
                        setSectorsInput("");
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (sectorsInput.trim()) {
                        const sectors = form.watch("requiredSectors") || [];
                        form.setValue("requiredSectors", [...sectors, sectorsInput.trim()]);
                        setSectorsInput("");
                      }
                    }}
                  >
                    Agregar
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {form.watch("requiredSectors")?.map((sector, idx) => (
                    <Badge key={idx} variant="secondary">
                      {sector}
                      <button
                        type="button"
                        onClick={() => {
                          const sectors = form.watch("requiredSectors") || [];
                          form.setValue("requiredSectors", sectors.filter((_, i) => i !== idx));
                        }}
                        className="ml-2 text-red-600 hover:text-red-800"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-gray-600">
                  Presiona Enter o click en Agregar para añadir sectores
                </p>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <Label>Permitir Municipios Adyacentes</Label>
                  <p className="text-xs text-gray-600">
                    Ampliar búsqueda a municipios cercanos si no hay técnicos en el municipio exacto
                  </p>
                </div>
                <Switch {...form.register("allowAdjacentMunicipalities")} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Criterios de Especialización */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Criterios de Especialización
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Requerir especialización específica</Label>
            <Switch {...form.register("useSpecializationBased")} />
          </div>

          {form.watch("useSpecializationBased") && (
            <div className="space-y-2 pl-4 border-l-2 border-blue-200">
              <Label>Especializaciones Requeridas</Label>
              <div className="flex gap-2">
                <Input
                  value={specializationsInput}
                  onChange={(e) => setSpecializationsInput(e.target.value)}
                  placeholder="Ej: aire_acondicionado, electricidad"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const specs = form.watch("requiredSpecializations") || [];
                      form.setValue("requiredSpecializations", [...specs, specializationsInput.trim()]);
                      setSpecializationsInput("");
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (specializationsInput.trim()) {
                      const specs = form.watch("requiredSpecializations") || [];
                      form.setValue("requiredSpecializations", [...specs, specializationsInput.trim()]);
                      setSpecializationsInput("");
                    }
                  }}
                >
                  Agregar
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {form.watch("requiredSpecializations")?.map((spec, idx) => (
                  <Badge key={idx} variant="secondary">
                    {spec}
                    <button
                      type="button"
                      onClick={() => {
                        const specs = form.watch("requiredSpecializations") || [];
                        form.setValue("requiredSpecializations", specs.filter((_, i) => i !== idx));
                      }}
                      className="ml-2 text-red-600 hover:text-red-800"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Criterios de Carga de Trabajo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Criterios de Carga de Trabajo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Considerar carga de trabajo actual</Label>
            <Switch {...form.register("useWorkloadBased")} />
          </div>

          {form.watch("useWorkloadBased") && (
            <div className="space-y-2 pl-4 border-l-2 border-blue-200">
              <Label>Máximo de órdenes por técnico</Label>
              <Input
                type="number"
                {...form.register("maxOrdersPerTechnician", { valueAsNumber: true })}
                min={1}
                max={20}
              />
              <p className="text-xs text-gray-600">
                No asignar a técnicos que tengan este número de órdenes activas
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Método de Asignación */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Método de Asignación
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Algoritmo de Selección</Label>
            <Select
              value={form.watch("assignmentMethod")}
              onValueChange={(value: any) => form.setValue("assignmentMethod", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="closest_available">Más Cercano Disponible</SelectItem>
                <SelectItem value="least_busy">Menos Ocupado</SelectItem>
                <SelectItem value="highest_skill">Mayor Habilidad</SelectItem>
                <SelectItem value="round_robin">Rotación Equitativa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tiempo de Respuesta Estimado (minutos)</Label>
            <Input
              type="number"
              {...form.register("estimatedResponseTime", { valueAsNumber: true })}
              min={15}
              max={480}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline">
          Cancelar
        </Button>
        <Button type="submit">
          Crear Regla
        </Button>
      </div>
    </form>
  );
}

export default AssignmentRuleFormSectors;