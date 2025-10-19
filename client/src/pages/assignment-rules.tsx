import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MapPin, Users, Zap, Plus, Edit, Trash2, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PROVINCES = [
  "Distrito Nacional", "Santo Domingo", "Santiago", "La Vega",
  "San Cristóbal", "Puerto Plata", "La Altagracia"
];

const ruleSchema = z.object({
  name: z.string().min(3, "Nombre debe tener al menos 3 caracteres"),
  priority: z.number().min(1).max(10),
  isActive: z.boolean().default(true),
  useSectorBased: z.boolean().default(true),
  requiredProvince: z.string().optional(),
  requiredMunicipality: z.string().optional(),
  useWorkloadBased: z.boolean().default(true),
  maxOrdersPerTechnician: z.number().min(1).max(20),
  assignmentMethod: z.enum(["closest_available", "least_busy", "highest_skill", "round_robin", "specific_users"]),
  assignedUserIds: z.array(z.number()).optional(),
  autoAssign: z.boolean().default(true),
  estimatedResponseTime: z.number().default(60),
});

type RuleForm = z.infer<typeof ruleSchema>;

interface Rule extends RuleForm {
  id: number;
  createdAt: string;
  updatedAt: string;
}

interface User {
  id: number;
  name: string;
  role: string;
  status: string;
}

export  function AssignmentRulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const { toast } = useToast();

  const form = useForm<RuleForm>({
    resolver: zodResolver(ruleSchema),
    defaultValues: {
      priority: 5,
      isActive: true,
      useSectorBased: true,
      useWorkloadBased: true,
      maxOrdersPerTechnician: 5,
      assignmentMethod: "closest_available",
      autoAssign: true,
      estimatedResponseTime: 60,
      assignedUserIds: [],
    },
  });

  useEffect(() => {
    loadRules();
    loadUsers();
  }, []);

  const loadRules = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch("/api/assignment-rules", {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!res.ok) {
        throw new Error(`Error ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      setRules(data);
    } catch (error) {
      console.error("Error loading rules:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las reglas",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch("/api/assignment-rules/available-users", {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!res.ok) {
        throw new Error(`Error ${res.status}`);
      }
      
      const data = await res.json();
      setUsers(data); // Ya vienen filtrados del backend
    } catch (error) {
      console.error("Error loading users:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los usuarios",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async () => {
    const data = form.getValues();
    
    try {
      const token = localStorage.getItem('auth_token');
      const url = editingRule 
        ? `/api/assignment-rules/${editingRule.id}` 
        : "/api/assignment-rules";
      
      const method = editingRule ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Error al guardar regla");
      }

      toast({
        title: "Éxito",
        description: editingRule ? "Regla actualizada" : "Regla creada",
      });

      setDialogOpen(false);
      setEditingRule(null);
      form.reset();
      loadRules();
    } catch (error: any) {
      console.error("Error saving rule:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo guardar la regla",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (rule: Rule) => {
    setEditingRule(rule);
    form.reset(rule);
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Eliminar esta regla?")) return;

    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`/api/assignment-rules/${id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Error al eliminar");
      }

      toast({
        title: "Éxito",
        description: "Regla eliminada",
      });

      loadRules();
    } catch (error: any) {
      console.error("Error deleting rule:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar la regla",
        variant: "destructive",
      });
    }
  };

  const openNewRuleDialog = () => {
    setEditingRule(null);
    form.reset();
    setDialogOpen(true);
  };

  const assignmentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      closest_available: "Más Cercano",
      least_busy: "Menos Ocupado",
      highest_skill: "Mayor Habilidad",
      round_robin: "Rotación",
      specific_users: "Usuarios Específicos",
    };
    return labels[method] || method;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Reglas de Asignación Automática</h1>
          <p className="text-gray-600 mt-1">
            Configura reglas para asignar órdenes automáticamente a técnicos
          </p>
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewRuleDialog} className="gap-2">
              <Plus className="h-4 w-4" />
              Nueva Regla
            </Button>
          </DialogTrigger>
          
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingRule ? "Editar Regla" : "Crear Nueva Regla"}
              </DialogTitle>
              <DialogDescription>
                Configure los criterios de asignación automática
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 mt-4">
              {/* Información Básica */}
              <Card>
                <CardHeader>
                  <CardTitle>Información Básica</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Nombre de la Regla</Label>
                      <Input {...form.register("name")} placeholder="Ej: Santo Domingo - Usuario X" />
                    </div>

                    <div className="space-y-2">
                      <Label>Prioridad (1-10)</Label>
                      <Input type="number" {...form.register("priority", { valueAsNumber: true })} min={1} max={10} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <Label>Regla Activa</Label>
                      <p className="text-sm text-gray-600">Se evaluará para nuevas órdenes</p>
                    </div>
                    <Switch 
                      checked={form.watch("isActive")}
                      onCheckedChange={(checked) => form.setValue("isActive", checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg bg-blue-50 border-blue-200">
                    <div>
                      <Label className="text-blue-900">🤖 Auto-Asignar al Crear Orden</Label>
                      <p className="text-sm text-blue-700">Ejecutar automáticamente</p>
                    </div>
                    <Switch 
                      checked={form.watch("autoAssign")}
                      onCheckedChange={(checked) => form.setValue("autoAssign", checked)}
                    />
                  </div>
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
                        <SelectItem value="specific_users">👥 Usuarios Específicos</SelectItem>
                        <SelectItem value="closest_available">📍 Más Cercano Disponible</SelectItem>
                        <SelectItem value="least_busy">⚖️ Menos Ocupado</SelectItem>
                        <SelectItem value="highest_skill">⭐ Mayor Habilidad</SelectItem>
                        <SelectItem value="round_robin">🔄 Rotación Equitativa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {form.watch("assignmentMethod") === "specific_users" && (
                    <div className="space-y-2 p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
                      <Label className="text-blue-900">Usuarios Específicos</Label>
                      <p className="text-sm text-blue-700 mb-2">
                        Solo estos usuarios recibirán órdenes de esta regla
                      </p>
                      
                      <div className="space-y-2">
                        {users.map((user) => (
                          <div key={user.id} className="flex items-center space-x-2 p-2 border rounded bg-white">
                            <input
                              type="checkbox"
                              id={`user-${user.id}`}
                              checked={(form.watch("assignedUserIds") || []).includes(user.id)}
                              onChange={(e) => {
                                const current = form.watch("assignedUserIds") || [];
                                if (e.target.checked) {
                                  form.setValue("assignedUserIds", [...current, user.id]);
                                } else {
                                  form.setValue("assignedUserIds", current.filter(id => id !== user.id));
                                }
                              }}
                              className="w-4 h-4"
                            />
                            <label htmlFor={`user-${user.id}`} className="flex-1 cursor-pointer">
                              <span className="font-medium">{user.name}</span>
                              <Badge variant="secondary" className="ml-2">
                                {user.role}
                              </Badge>
                            </label>
                          </div>
                        ))}
                      </div>

                      {(form.watch("assignedUserIds") || []).length === 0 && (
                        <p className="text-sm text-red-600 mt-2">
                          ⚠️ Debes seleccionar al menos un usuario
                        </p>
                      )}
                    </div>
                  )}

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

              {/* Criterios de Ubicación */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Criterios de Ubicación
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Usar asignación basada en sectores</Label>
                    <Switch 
                      checked={form.watch("useSectorBased")}
                      onCheckedChange={(checked) => form.setValue("useSectorBased", checked)}
                    />
                  </div>

                  {form.watch("useSectorBased") && (
                    <div className="space-y-4 pl-4 border-l-2 border-blue-200">
                      <div className="space-y-2">
                        <Label>Provincia Requerida</Label>
                        <Select
                          value={form.watch("requiredProvince") || "ALL"}
                          onValueChange={(value) => 
                            form.setValue("requiredProvince", value === "ALL" ? undefined : value)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Todas las provincias" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALL">Todas las provincias</SelectItem>
                            {PROVINCES.map((province) => (
                              <SelectItem key={province} value={province}>
                                {province}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Criterios de Carga */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Criterios de Carga de Trabajo
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Considerar carga de trabajo</Label>
                    <Switch 
                      checked={form.watch("useWorkloadBased")}
                      onCheckedChange={(checked) => form.setValue("useWorkloadBased", checked)}
                    />
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
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-end gap-4 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmit}>
                  {editingRule ? "Actualizar Regla" : "Crear Regla"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabla de Reglas */}
      <Card>
        <CardHeader>
          <CardTitle>Reglas Configuradas</CardTitle>
          <CardDescription>
            {rules.length} regla{rules.length !== 1 ? 's' : ''} configurada{rules.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Cargando reglas...</div>
          ) : rules.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No hay reglas configuradas. Crea una nueva regla para comenzar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Custom Table */}
              <div className="min-w-full">
                {/* Table Header */}
                <div className="grid grid-cols-7 gap-4 p-4 bg-gray-50 font-semibold text-sm border-b">
                  <div>Nombre</div>
                  <div className="text-center">Prioridad</div>
                  <div>Método</div>
                  <div>Provincia</div>
                  <div className="text-center">Estado</div>
                  <div className="text-center">Auto</div>
                  <div className="text-right">Acciones</div>
                </div>
                
                {/* Table Body */}
                {rules.map((rule) => (
                  <div key={rule.id} className="grid grid-cols-7 gap-4 p-4 border-b hover:bg-gray-50 items-center">
                    <div className="font-medium">{rule.name}</div>
                    <div className="text-center">
                      <Badge variant={rule.priority >= 8 ? "default" : "secondary"}>
                        {rule.priority}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-sm">
                        {assignmentMethodLabel(rule.assignmentMethod)}
                      </span>
                      {rule.assignmentMethod === "specific_users" && rule.assignedUserIds && (
                        <Badge variant="outline" className="ml-2">
                          {rule.assignedUserIds.length} usuario{rule.assignedUserIds.length !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                    <div>
                      {rule.requiredProvince || (
                        <span className="text-gray-400">Todas</span>
                      )}
                    </div>
                    <div className="text-center">
                      {rule.isActive ? (
                        <CheckCircle className="h-5 w-5 text-green-600 inline" />
                      ) : (
                        <XCircle className="h-5 w-5 text-gray-400 inline" />
                      )}
                    </div>
                    <div className="text-center">
                      {rule.autoAssign ? (
                        <Badge variant="default" className="bg-blue-600">
                          Sí
                        </Badge>
                      ) : (
                        <Badge variant="secondary">No</Badge>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(rule)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(rule.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AssignmentRulesPage;