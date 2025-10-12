import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AutoResponse, InsertAutoResponse } from "@shared/schema";
import { Plus, Edit, Trash2, MessageSquare, Bot, RotateCcw, Zap } from "lucide-react";

interface MenuOption {
  label: string;
  value: string;
  action: string;
}

// Mapeo de triggers a nombres legibles
const triggerLabels: Record<string, string> = {
  welcome: "Bienvenida",
  menu: "Menú Principal",
  product_inquiry: "Consulta Productos",
  service_inquiry: "Consulta Servicios",
  contact_request: "Solicitud Contacto",
  registration: "Registro Cliente",
  order_status: "Estado Pedido",
  support: "Soporte Técnico",
  tracking: "Seguimiento",
  payment: "Información Pago",
  warranty: "Garantía",
  feedback: "Comentarios",
  collect_name: "Recopilar Nombre",
  collect_address: "Recopilar Dirección",
  collect_contact: "Recopilar Contacto",
  collect_payment: "Recopilar Pago",
  order_received: "Pedido Recibido",
  order_confirmed: "Pedido Confirmado",
  help: "Ayuda",
  ayuda: "Centro de Ayuda"
};

// Component for editing menu options visually
function MenuOptionsEditor({ value, onChange }: { value?: string; onChange: (value: string) => void }) {
  const [options, setOptions] = useState<MenuOption[]>(() => {
    try {
      return value ? JSON.parse(value) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      const newOptions = value ? JSON.parse(value) : [];
      setOptions(newOptions);
    } catch {
      setOptions([]);
    }
  }, [value]);

  const updateOptions = (newOptions: MenuOption[]) => {
    setOptions(newOptions);
    onChange(JSON.stringify(newOptions));
  };

  const addOption = () => {
    updateOptions([...options, { label: "", value: "", action: "" }]);
  };

  const removeOption = (index: number) => {
    updateOptions(options.filter((_, i) => i !== index));
  };

  const updateOption = (index: number, field: keyof MenuOption, value: string) => {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], [field]: value };
    updateOptions(newOptions);
  };

  return (
    <div className="space-y-3">
      {options.map((option, index) => (
        <div key={index} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div>
              <Label className="text-xs">Texto del Botón</Label>
              <Input
                value={option.label}
                onChange={(e) => updateOption(index, 'label', e.target.value)}
                placeholder="Ej: Ver Productos"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Valor</Label>
              <Input
                value={option.value}
                onChange={(e) => updateOption(index, 'value', e.target.value)}
                placeholder="Ej: products"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Acción</Label>
              <Input
                value={option.action}
                onChange={(e) => updateOption(index, 'action', e.target.value)}
                placeholder="Ej: show_products"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => removeOption(index)}
            className="h-6 px-2 text-xs text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Eliminar
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addOption}
        className="w-full h-8 text-sm border-dashed"
      >
        <Plus className="h-3 w-3 mr-1" />
        Agregar Opción
      </Button>
    </div>
  );
}

export default function AutoResponsesPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingResponse, setEditingResponse] = useState<AutoResponse | null>(null);
  const [formData, setFormData] = useState<Partial<InsertAutoResponse>>({
    name: "",
    trigger: "",
    messageText: "",
    menuOptions: "",
    nextAction: "",
    menuType: "buttons",
    showBackButton: false,
    allowFreeText: true,
    responseTimeout: 300,
    maxRetries: 3,
    fallbackMessage: "",
    conditionalDisplay: "",
    isActive: true,
  });

  const { toast } = useToast();

  // Fetch auto responses
 const { data: responses, isLoading } = useQuery<AutoResponse[]>({
  queryKey: ["/api/store-responses"],
  queryFn: () => apiRequest("GET", "/api/store-responses"),
});

  // Create response mutation
  const createResponseMutation = useMutation({
    mutationFn: async (data: Partial<InsertAutoResponse>) => {
      return apiRequest("POST", "/api/store-responses", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/store-responses"] });
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: "Respuesta creada",
        description: "La respuesta automática se ha creado correctamente.",
      });
    },
  });

  // Update response mutation
  const updateResponseMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & Partial<InsertAutoResponse>) => {
      return apiRequest("PUT", `/api/store-responses/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/store-responses"] });
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: "Respuesta actualizada",
        description: "La respuesta automática se ha actualizada correctamente.",
      });
    },
  });

  // Delete response mutation
  const deleteResponseMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/store-responses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/store-responses"] });
      toast({
        title: "Respuesta eliminada",
        description: "La configuración se ha eliminado correctamente.",
      });
    },
  });

  // Toggle active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return apiRequest("PUT", `/api/store-responses/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/store-responses"] });
      toast({
        title: "Estado actualizado",
        description: "El estado de la respuesta se ha actualizado correctamente.",
      });
    },
  });

  // Reset to defaults mutation
  const resetToDefaultsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/store-responses/reset-defaults");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/store-responses"] });
      toast({
        title: "Valores restaurados",
        description: "Se han restaurado las respuestas automáticas por defecto.",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      trigger: "",
      messageText: "",
      menuOptions: "",
      nextAction: "",
      menuType: "buttons",
      showBackButton: false,
      allowFreeText: true,
      responseTimeout: 300,
      maxRetries: 3,
      fallbackMessage: "",
      conditionalDisplay: "",
      isActive: true,
    });
    setEditingResponse(null);
  };

  const handleEdit = (response: AutoResponse) => {
    setEditingResponse(response);
    setFormData({
      name: response.name,
      trigger: response.trigger,
      messageText: response.messageText,
      menuOptions: response.menuOptions || "",
      nextAction: response.nextAction || "",
      menuType: response.menuType || "buttons",
      showBackButton: response.showBackButton ?? false,
      allowFreeText: response.allowFreeText ?? true,
      responseTimeout: response.responseTimeout ?? 300,
      maxRetries: response.maxRetries ?? 3,
      fallbackMessage: response.fallbackMessage || "",
      conditionalDisplay: response.conditionalDisplay || "",
      isActive: response.isActive ?? true,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingResponse) {
      updateResponseMutation.mutate({ id: editingResponse.id, ...formData });
    } else {
      createResponseMutation.mutate(formData);
    }
  };

  const triggerOptions = [
    { value: "welcome", label: "Mensaje de Bienvenida" },
    { value: "menu", label: "Menú Principal" },
    { value: "ayuda", label: "Centro de Ayuda" },
    { value: "help", label: "Ayuda en Inglés" },
    { value: "productos", label: "Ver Productos" },
    { value: "servicios", label: "Ver Servicios" },
    { value: "pedido", label: "Estado de Pedido" },
    { value: "ubicacion", label: "Actualizar Ubicación" },
    { value: "tecnico", label: "Contactar Técnico" },
    { value: "product_inquiry", label: "Consulta de Productos" },
    { value: "service_inquiry", label: "Consulta de Servicios" },
    { value: "contact_request", label: "Solicitud de Contacto" },
    { value: "registration", label: "Registro de Cliente" },
    { value: "order_status", label: "Estado de Orden" },
    { value: "support", label: "Soporte Técnico" },
    { value: "tracking", label: "Seguimiento" },
    { value: "payment", label: "Información de Pago" },
    { value: "warranty", label: "Garantía" },
    { value: "feedback", label: "Comentarios" }
  ];

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <Bot className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando respuestas automáticas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Fixed Header */}
      <div className="bg-white border-b border-gray-200 p-6 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Bot className="h-8 w-8 text-blue-600" />
              Respuestas Automáticas
            </h1>
            <p className="text-muted-foreground">
              Configure respuestas automáticas y menús interactivos para WhatsApp
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => resetToDefaultsMutation.mutate()}
              disabled={resetToDefaultsMutation.isPending}
              className="border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {resetToDefaultsMutation.isPending ? "Restaurando..." : "Restaurar Valores"}
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetForm} className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Respuesta
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingResponse ? "Editar Respuesta Automática" : "Nueva Respuesta Automática"}
                  </DialogTitle>
                  <DialogDescription>
                    Configure respuestas automáticas para WhatsApp con comandos personalizados
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nombre</Label>
                      <Input
                        id="name"
                        value={formData.name || ""}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ej: Menú Principal"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="trigger">Comando de Activación</Label>
                      <Input
                        id="trigger"
                        value={formData.trigger || ""}
                        onChange={(e) => setFormData({ ...formData, trigger: e.target.value })}
                        placeholder="Ej: menu, ayuda, productos"
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        Palabra que escribirá el cliente para activar esta respuesta
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="trigger-select">Disparador Predefinido</Label>
                      <Select
                        value=""
                        onValueChange={(value) => setFormData({ ...formData, trigger: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="O seleccione uno predefinido" />
                        </SelectTrigger>
                        <SelectContent>
                          {triggerOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Opcional: seleccione de la lista predefinida
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="content">Contenido del Mensaje</Label>
                    <Textarea
                      id="content"
                      value={formData.messageText || ""}
                      onChange={(e) => setFormData({ ...formData, messageText: e.target.value })}
                      placeholder="Mensaje que se enviará automáticamente..."
                      rows={4}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Opciones de Menú Interactivo</Label>
                    <MenuOptionsEditor
                      value={formData.menuOptions || ""}
                      onChange={(menuOptions) => setFormData({ ...formData, menuOptions })}
                    />
                  </div>

                  <div className="flex justify-end space-x-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createResponseMutation.isPending || updateResponseMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {createResponseMutation.isPending || updateResponseMutation.isPending 
                        ? "Guardando..." 
                        : editingResponse ? "Actualizar" : "Crear"
                      }
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-6">
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {responses?.map((response) => (
                <Card key={response.id} className="group hover:shadow-lg transition-all duration-200 border-l-4 border-l-blue-500">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg font-semibold text-gray-900 mb-2">
                          {response.name}
                        </CardTitle>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge 
                            variant={response.isActive ? "default" : "secondary"}
                            className={response.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}
                          >
                            <Zap className="h-3 w-3 mr-1" />
                            {response.isActive ? "Activa" : "Inactiva"}
                          </Badge>
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                            <MessageSquare className="h-3 w-3 mr-1" />
                            {triggerLabels[response.trigger] || response.trigger}
                          </Badge>
                        </div>
                      </div>
                      <Switch
                        checked={response.isActive ?? false}
                        onCheckedChange={(checked) => 
                          toggleActiveMutation.mutate({ id: response.id, isActive: checked })
                        }
                        className="ml-2"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">Comando de activación:</p>
                        <code className="text-sm bg-gray-100 px-2 py-1 rounded text-blue-600 font-mono">
                          {response.trigger}
                        </code>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-1">Mensaje:</p>
                        <p className="text-sm text-gray-600 line-clamp-3">
                          {response.messageText}
                        </p>
                      </div>
                      {response.menuOptions && (
                        <div>
                          <p className="text-sm font-medium text-gray-700 mb-1">Opciones de menú:</p>
                          <div className="flex flex-wrap gap-1">
                            {(() => {
                              try {
                                const options = JSON.parse(response.menuOptions);
                                return options.slice(0, 3).map((option: MenuOption, index: number) => (
                                  <Badge key={index} variant="outline" className="text-xs">
                                    {option.label}
                                  </Badge>
                                ));
                              } catch {
                                return null;
                              }
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end space-x-2 mt-4 pt-3 border-t border-gray-100">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(response)}
                        className="text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Editar
                      </Button>
                      {/* <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteResponseMutation.mutate(response.id)}
                        disabled={deleteResponseMutation.isPending}
                        className="text-red-600 border-red-200 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Eliminar
                      </Button> */}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}