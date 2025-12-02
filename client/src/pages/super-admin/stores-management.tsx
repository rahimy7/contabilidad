import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus, Search, Settings, Pause, Play, AlertTriangle, CheckCircle, XCircle, Wrench, MessageSquare } from "lucide-react";

interface VirtualStore {
  id: number;
  name: string;
  description: string;
  domain: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  planType: string;
  status: 'active' | 'inactive' | 'suspended';
  isActive: boolean;
  schema: string;
  databaseUrl?: string;
  createdAt: string;
  updatedAt: string;
}

interface ValidationResponse {
  valid: boolean;
  message: string;
}

interface RepairResponse {
  success: boolean;
  message: string;
}

const storeSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  description: z.string().min(1, "Descripción requerida"),
  domain: z.string().min(1, "Dominio requerido"),
  contactEmail: z.string().email("Email inválido"),
  contactPhone: z.string().min(1, "Teléfono requerido"),
  address: z.string().min(1, "Dirección requerida"),
  planType: z.enum(['basic', 'premium', 'enterprise']),
});

type StoreFormData = z.infer<typeof storeSchema>;

export default function StoresManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedStore, setSelectedStore] = useState<VirtualStore | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();

  // ✅ CORREGIDO: Endpoint retorna { stores: [...], pagination: {...} }
  const { data: responseData = { stores: [], pagination: {} }, isLoading, error } = useQuery<{
    stores: VirtualStore[];
    pagination?: any;
    lastUpdated?: string;
  }>({
    queryKey: ['/api/super-admin/stores'],
    queryFn: () => apiRequest('GET', '/api/super-admin/stores'),
    staleTime: 30_000,
  });

  // Extract stores array safely
  const stores = Array.isArray(responseData?.stores) ? responseData.stores : [];

  // Debug log para verificar datos
  console.log('=== DEBUG STORES CORREGIDO ===');
  console.log('Response data received:', responseData);
  console.log('Stores data extracted:', stores);
  console.log('Array length:', stores?.length);
  console.log('Query error:', error);
  console.log('Is loading:', isLoading);
  console.log('Stores type:', typeof stores);
  console.log('===================');

  // ✅ CORREGIDO: Remover .json() innecesario
  const createStoreMutation = useMutation({
    mutationFn: (data: StoreFormData) => apiRequest("POST", "/api/super-admin/stores", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/stores'] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Tienda creada",
        description: "La nueva tienda ha sido creada exitosamente",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Error al crear la tienda",
        variant: "destructive",
      });
    }
  });

  // ✅ CORREGIDO: Remover .json() innecesario
  const toggleStoreMutation = useMutation({
    mutationFn: ({ storeId, action }: { storeId: number, action: 'enable' | 'disable' | 'suspend' }) =>
      apiRequest("PATCH", `/api/super-admin/stores/${storeId}/status`, { action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/stores'] });
      toast({
        title: "Estado actualizado",
        description: "El estado de la tienda ha sido actualizado",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Error al actualizar estado",
        variant: "destructive",
      });
    }
  });

  const form = useForm<StoreFormData>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      name: "",
      description: "",
      domain: "",
      contactEmail: "",
      contactPhone: "",
      address: "",
      planType: "basic",
    },
  });

  // ✅ CORREGIDO: Simplificar el procesamiento de stores
  const filteredStores = stores.filter(store => {
    const matchesSearch = store.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         store.domain.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || store.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  console.log('Filtered stores to render:', filteredStores);
  console.log('First store details:', filteredStores[0]);

  const onSubmit = (data: StoreFormData) => {
    createStoreMutation.mutate(data);
  };

  const handleToggleStore = (storeId: number, action: 'enable' | 'disable' | 'suspend') => {
    toggleStoreMutation.mutate({ storeId, action });
  };

  // ✅ CORREGIDO: Funciones de validación y reparación con tipado correcto
  const handleValidateStore = async (storeId: number) => {
    try {
      const validation = await apiRequest<ValidationResponse>("GET", `/api/super-admin/stores/${storeId}/validate`);
      
      if (!validation.valid) {
        // Si la validación falla, preguntar si quiere reparar
        const shouldRepair = confirm(
          `${validation.message}\n\n¿Deseas reparar automáticamente el ecosistema de base de datos?`
        );
        
        if (shouldRepair) {
          await handleRepairStore(storeId);
          return;
        }
      }
      
      toast({
        title: validation.valid ? "Ecosistema Válido" : "Problemas Detectados",
        description: validation.message || "Validación completada",
        variant: validation.valid ? "default" : "destructive",
      });
    } catch (error: any) {
      toast({
        title: "Error en validación",
        description: error.message || "No se pudo validar el ecosistema",
        variant: "destructive",
      });
    }
  };

  const handleRepairStore = async (storeId: number) => {
    try {
      const result = await apiRequest<RepairResponse>("POST", `/api/super-admin/stores/${storeId}/repair`);
      
      toast({
        title: "Reparación completada",
        description: result.message || "El ecosistema ha sido reparado exitosamente",
      });
      
      // Refrescar la lista de tiendas
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/stores'] });
    } catch (error: any) {
      toast({
        title: "Error en reparación",
        description: error.message || "No se pudo reparar el ecosistema",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string, isActive: boolean) => {
    if (!isActive || status === 'suspended') {
      return <Badge variant="destructive">Suspendida</Badge>;
    }
    
    switch (status) {
      case 'active':
        return <Badge variant="default">Activa</Badge>;
      case 'inactive':
        return <Badge variant="secondary">Inactiva</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getStatusIcon = (status: string, isActive: boolean) => {
    if (!isActive || status === 'suspended') {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }
    
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'inactive':
        return <Pause className="h-4 w-4 text-gray-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Gestión de Tiendas</h1>
        </div>
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-20 bg-gray-200 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Gestión de Tiendas</h1>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-red-600">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Error al cargar tiendas</h3>
              <p className="text-sm">{error.message || 'Error desconocido'}</p>
              <Button 
                onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/super-admin/stores'] })}
                className="mt-4"
              >
                Reintentar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Tiendas</h1>
          <p className="text-gray-600">
            Administra las tiendas virtuales del sistema
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nueva Tienda
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Crear Nueva Tienda</DialogTitle>
              <DialogDescription>
                Completa la información para crear una nueva tienda virtual
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre de la Tienda</FormLabel>
                        <FormControl>
                          <Input placeholder="Mi Tienda Virtual" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="domain"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dominio</FormLabel>
                        <FormControl>
                          <Input placeholder="mitienda.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descripción</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Descripción de la tienda..." 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="contactEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email de Contacto</FormLabel>
                        <FormControl>
                          <Input 
                            type="email" 
                            placeholder="contacto@mitienda.com" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contactPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Teléfono de Contacto</FormLabel>
                        <FormControl>
                          <Input placeholder="+1234567890" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dirección</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Dirección completa de la tienda..." 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="planType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Plan</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona un plan" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="basic">Básico</SelectItem>
                          <SelectItem value="premium">Premium</SelectItem>
                          <SelectItem value="enterprise">Enterprise</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createStoreMutation.isPending}
                  >
                    {createStoreMutation.isPending ? "Creando..." : "Crear Tienda"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Buscar tiendas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="active">Activas</SelectItem>
            <SelectItem value="inactive">Inactivas</SelectItem>
            <SelectItem value="suspended">Suspendidas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stores Grid */}
      <div className="grid gap-6">
        {filteredStores.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-600 mb-2">
                No se encontraron tiendas
              </h3>
              <p className="text-gray-500">
                {searchTerm || statusFilter !== "all" 
                  ? "Intenta cambiar los filtros de búsqueda"
                  : "Crea tu primera tienda para comenzar"
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredStores.map((store) => (
            <Card key={store.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(store.status, store.isActive)}
                      <CardTitle className="text-xl">{store.name}</CardTitle>
                      {getStatusBadge(store.status, store.isActive)}
                    </div>
                    <CardDescription className="text-sm">
                      {store.description}
                    </CardDescription>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleValidateStore(store.id)}
                    >
                      <Wrench className="h-4 w-4 mr-1" />
                      Validar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation(`/super-admin/stores/${store.id}/whatsapp`)}
                      className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                    >
                      <MessageSquare className="h-4 w-4 mr-1" />
                      WhatsApp
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation(`/super-admin/store-settings?store=${store.id}`)}
                    >
                      <Settings className="h-4 w-4 mr-1" />
                      Configurar
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <strong>Dominio:</strong>
                    <p className="text-gray-600">{store.domain}</p>
                  </div>
                  <div>
                    <strong>Plan:</strong>
                    <p className="text-gray-600 capitalize">{store.planType}</p>
                  </div>
                  <div>
                    <strong>Creada:</strong>
                    <p className="text-gray-600">
                      {new Date(store.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end space-x-2 mt-4">
                  {store.status === 'active' ? (
                    <>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Pause className="h-4 w-4 mr-1" />
                            Pausar
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Pausar tienda?</AlertDialogTitle>
                            <AlertDialogDescription>
                              La tienda {store.name} será pausada temporalmente. 
                              Los usuarios no podrán acceder hasta que la reactives.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleToggleStore(store.id, 'disable')}
                            >
                              Pausar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            <XCircle className="h-4 w-4 mr-1" />
                            Suspender
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Suspender tienda?</AlertDialogTitle>
                            <AlertDialogDescription>
                              La tienda {store.name} será suspendida. Esta acción 
                              requiere intervención manual para reactivar.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleToggleStore(store.id, 'suspend')}
                            >
                              Suspender
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleToggleStore(store.id, 'enable')}
                    >
                      <Play className="h-4 w-4 mr-1" />
                      Activar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}