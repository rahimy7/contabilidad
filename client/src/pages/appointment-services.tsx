import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Settings2, Plus, Pencil, Trash2, User, Stethoscope, Star, CheckCircle2, XCircle, DollarSign,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

// ================================
// API Helper
// ================================
async function apiCall(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('auth_token');
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
    throw new Error(errorData.error || `Error ${response.status}`);
  }
  return response.json();
}

// ================================
// Schemas
// ================================
const titularSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  specialty: z.string().optional(),
  isActive: z.boolean().default(true),
});
type TitularForm = z.infer<typeof titularSchema>;

const serviceTypeSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  category: z.enum(['general', 'programa_especial']),
  description: z.string().optional(),
  duration: z.string().optional(),
  basePrice: z.string().optional().default('0'),
  priceType: z.enum(['fixed', 'variable', 'range']).default('fixed'),
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
  isActive: z.boolean().default(true),
});
type ServiceTypeForm = z.infer<typeof serviceTypeSchema>;

// ================================
// Category Labels
// ================================
const categoryLabels: Record<string, { label: string; color: string }> = {
  general: { label: 'General', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  programa_especial: { label: 'Programa Especial', color: 'bg-purple-100 text-purple-800 border-purple-200' },
};

// ================================
// Main Component
// ================================
export default function AppointmentServicesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('services');

  // Service dialog state
  const [isServiceOpen, setIsServiceOpen] = useState(false);
  const [editingService, setEditingService] = useState<any>(null);
  const [isServiceDeleteOpen, setIsServiceDeleteOpen] = useState(false);
  const [deletingService, setDeletingService] = useState<any>(null);

  // Titular dialog state
  const [isTitularOpen, setIsTitularOpen] = useState(false);
  const [editingTitular, setEditingTitular] = useState<any>(null);
  const [isTitularDeleteOpen, setIsTitularDeleteOpen] = useState(false);
  const [deletingTitular, setDeletingTitular] = useState<any>(null);

  // ================================
  // Queries
  // ================================
  const { data: services = [] } = useQuery({
    queryKey: ['/api/appointment-service-types'],
    queryFn: () => apiCall('/api/appointment-service-types'),
  });

  const { data: titulares = [] } = useQuery({
    queryKey: ['/api/appointment-titulares'],
    queryFn: () => apiCall('/api/appointment-titulares'),
  });

  // ================================
  // Service Mutations
  // ================================
  const createServiceMutation = useMutation({
    mutationFn: (data: any) => apiCall('/api/appointment-service-types', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: 'Servicio creado exitosamente' });
      queryClient.invalidateQueries({ queryKey: ['/api/appointment-service-types'] });
      setIsServiceOpen(false);
      serviceForm.reset();
    },
    onError: (e: Error) => toast({ title: 'Error al crear servicio', description: e.message, variant: 'destructive' }),
  });

  const updateServiceMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiCall(`/api/appointment-service-types/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: 'Servicio actualizado' });
      queryClient.invalidateQueries({ queryKey: ['/api/appointment-service-types'] });
      setIsServiceOpen(false);
      setEditingService(null);
    },
    onError: (e: Error) => toast({ title: 'Error al actualizar servicio', description: e.message, variant: 'destructive' }),
  });

  const deleteServiceMutation = useMutation({
    mutationFn: (id: number) => apiCall(`/api/appointment-service-types/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast({ title: 'Servicio eliminado' });
      queryClient.invalidateQueries({ queryKey: ['/api/appointment-service-types'] });
      setIsServiceDeleteOpen(false);
      setDeletingService(null);
    },
    onError: (e: Error) => toast({ title: 'Error al eliminar servicio', description: e.message, variant: 'destructive' }),
  });

  // ================================
  // Titular Mutations
  // ================================
  const createTitularMutation = useMutation({
    mutationFn: (data: any) => apiCall('/api/appointment-titulares', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: 'Titular creado exitosamente' });
      queryClient.invalidateQueries({ queryKey: ['/api/appointment-titulares'] });
      setIsTitularOpen(false);
      titularForm.reset();
    },
    onError: (e: Error) => toast({ title: 'Error al crear titular', description: e.message, variant: 'destructive' }),
  });

  const updateTitularMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiCall(`/api/appointment-titulares/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: 'Titular actualizado' });
      queryClient.invalidateQueries({ queryKey: ['/api/appointment-titulares'] });
      setIsTitularOpen(false);
      setEditingTitular(null);
    },
    onError: (e: Error) => toast({ title: 'Error al actualizar titular', description: e.message, variant: 'destructive' }),
  });

  const deleteTitularMutation = useMutation({
    mutationFn: (id: number) => apiCall(`/api/appointment-titulares/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast({ title: 'Titular eliminado' });
      queryClient.invalidateQueries({ queryKey: ['/api/appointment-titulares'] });
      setIsTitularDeleteOpen(false);
      setDeletingTitular(null);
    },
    onError: (e: Error) => toast({ title: 'Error al eliminar titular', description: e.message, variant: 'destructive' }),
  });

  // ================================
  // Forms
  // ================================
  const serviceForm = useForm<ServiceTypeForm>({
    resolver: zodResolver(serviceTypeSchema),
    defaultValues: { name: '', category: 'general', description: '', duration: '', basePrice: '0', priceType: 'fixed', minPrice: '', maxPrice: '', isActive: true },
  });

  const titularForm = useForm<TitularForm>({
    resolver: zodResolver(titularSchema),
    defaultValues: { name: '', specialty: '', isActive: true },
  });

  // ================================
  // Handlers
  // ================================
  function handleServiceSubmit(data: ServiceTypeForm) {
    const payload = {
      name: data.name,
      category: data.category,
      description: data.description || null,
      duration: data.duration ? parseInt(data.duration) : null,
      basePrice: data.basePrice || '0',
      priceType: data.priceType || 'fixed',
      minPrice: data.priceType !== 'fixed' ? (data.minPrice || null) : null,
      maxPrice: data.priceType !== 'fixed' ? (data.maxPrice || null) : null,
      isActive: data.isActive,
    };
    if (editingService) {
      updateServiceMutation.mutate({ id: editingService.id, data: payload });
    } else {
      createServiceMutation.mutate(payload);
    }
  }

  function openEditService(svc: any) {
    setEditingService(svc);
    serviceForm.reset({
      name: svc.name,
      category: svc.category,
      description: svc.description || '',
      duration: svc.duration ? String(svc.duration) : '',
      basePrice: svc.basePrice || svc.base_price || '0',
      priceType: svc.priceType || svc.price_type || 'fixed',
      minPrice: svc.minPrice || svc.min_price || '',
      maxPrice: svc.maxPrice || svc.max_price || '',
      isActive: svc.isActive ?? svc.is_active ?? true,
    });
    setIsServiceOpen(true);
  }

  function handleTitularSubmit(data: TitularForm) {
    const payload = { name: data.name, specialty: data.specialty || null, isActive: data.isActive };
    if (editingTitular) {
      updateTitularMutation.mutate({ id: editingTitular.id, data: payload });
    } else {
      createTitularMutation.mutate(payload);
    }
  }

  function openEditTitular(titular: any) {
    setEditingTitular(titular);
    titularForm.reset({ name: titular.name, specialty: titular.specialty || '', isActive: titular.isActive });
    setIsTitularOpen(true);
  }

  const specialPrograms = services.filter((s: any) => s.category === 'programa_especial');
  const generalServices = services.filter((s: any) => s.category === 'general');

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings2 className="h-7 w-7 text-purple-600" />
            Servicios de Consultas
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestiona los servicios, programas especiales y titulares de consultas
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-blue-600">{generalServices.length}</div>
            <p className="text-xs text-muted-foreground">Servicios Generales</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-purple-600">{specialPrograms.length}</div>
            <p className="text-xs text-muted-foreground">Programas Especiales</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-green-600">{titulares.length}</div>
            <p className="text-xs text-muted-foreground">Titulares</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-orange-600">
              {services.filter((s: any) => s.isActive).length}
            </div>
            <p className="text-xs text-muted-foreground">Servicios Activos</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="services">
            <Stethoscope className="h-4 w-4 mr-2" />
            Servicios
          </TabsTrigger>
          <TabsTrigger value="titulares">
            <User className="h-4 w-4 mr-2" />
            Titulares
          </TabsTrigger>
        </TabsList>

        {/* ============== SERVICES TAB ============== */}
        <TabsContent value="services" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => {
              setEditingService(null);
              serviceForm.reset({ name: '', category: 'general', description: '', duration: '', basePrice: '0', priceType: 'fixed', minPrice: '', maxPrice: '', isActive: true });
              setIsServiceOpen(true);
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Servicio
            </Button>
          </div>

          {/* Programas Especiales */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Star className="h-5 w-5 text-purple-600" />
                Programas Especiales
              </CardTitle>
            </CardHeader>
            <CardContent>
              {specialPrograms.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No hay programas especiales registrados
                </p>
              ) : (
                <div className="space-y-2">
                  {specialPrograms.map((svc: any) => (
                    <ServiceCard
                      key={svc.id}
                      service={svc}
                      onEdit={() => openEditService(svc)}
                      onDelete={() => { setDeletingService(svc); setIsServiceDeleteOpen(true); }}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Servicios Generales */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Stethoscope className="h-5 w-5 text-blue-600" />
                Servicios Generales
              </CardTitle>
            </CardHeader>
            <CardContent>
              {generalServices.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No hay servicios generales registrados
                </p>
              ) : (
                <div className="space-y-2">
                  {generalServices.map((svc: any) => (
                    <ServiceCard
                      key={svc.id}
                      service={svc}
                      onEdit={() => openEditService(svc)}
                      onDelete={() => { setDeletingService(svc); setIsServiceDeleteOpen(true); }}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============== TITULARES TAB ============== */}
        <TabsContent value="titulares" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => {
              setEditingTitular(null);
              titularForm.reset({ name: '', specialty: '', isActive: true });
              setIsTitularOpen(true);
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Titular
            </Button>
          </div>

          <Card>
            <CardContent className="pt-4">
              {titulares.length === 0 ? (
                <div className="text-center py-12">
                  <User className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No hay titulares registrados</h3>
                  <p className="text-muted-foreground">Agrega titulares para asignarlos a las citas</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {titulares.map((titular: any) => (
                    <div
                      key={titular.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-green-100 flex items-center justify-center">
                          <User className="h-4 w-4 text-green-700" />
                        </div>
                        <div>
                          <p className="font-medium">{titular.name}</p>
                          {titular.specialty && (
                            <p className="text-sm text-muted-foreground">{titular.specialty}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {titular.isActive ? (
                          <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Activo
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200 gap-1">
                            <XCircle className="h-3 w-3" /> Inactivo
                          </Badge>
                        )}
                        <Button size="sm" variant="outline" onClick={() => openEditTitular(titular)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => { setDeletingTitular(titular); setIsTitularDeleteOpen(true); }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============== SERVICE DIALOG ============== */}
      <Dialog open={isServiceOpen} onOpenChange={(open) => { setIsServiceOpen(open); if (!open) setEditingService(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingService ? 'Editar Servicio' : 'Nuevo Servicio'}</DialogTitle>
            <DialogDescription>
              {editingService ? 'Modifica los datos del servicio' : 'Registra un nuevo servicio o programa especial'}
            </DialogDescription>
          </DialogHeader>
          <Form {...serviceForm}>
            <form onSubmit={serviceForm.handleSubmit(handleServiceSubmit)} className="space-y-4">
              <FormField control={serviceForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Programa Anticelulitis, Vacum, Drenaje..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={serviceForm.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoría *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="programa_especial">Programa Especial</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={serviceForm.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Descripción del servicio..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={serviceForm.control} name="duration" render={({ field }) => (
                <FormItem>
                  <FormLabel>Duración (minutos)</FormLabel>
                  <FormControl>
                    <Input type="number" min={1} placeholder="Ej: 60" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Pricing Fields */}
              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-600" />
                  Precio del Servicio
                </h4>

                <FormField control={serviceForm.control} name="priceType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Precio</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="fixed">Precio Fijo</SelectItem>
                        <SelectItem value="variable">Precio Variable</SelectItem>
                        <SelectItem value="range">Rango de Precios</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={serviceForm.control} name="basePrice" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{serviceForm.watch('priceType') === 'fixed' ? 'Precio Base (RD$)' : 'Precio Sugerido (RD$)'}</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="0.01" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {serviceForm.watch('priceType') !== 'fixed' && (
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={serviceForm.control} name="minPrice" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Precio Mínimo (RD$)</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} step="0.01" placeholder="0.00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={serviceForm.control} name="maxPrice" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Precio Máximo (RD$)</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} step="0.01" placeholder="0.00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                )}
              </div>

              <FormField control={serviceForm.control} name="isActive" render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">Activo</FormLabel>
                </FormItem>
              )} />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsServiceOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createServiceMutation.isPending || updateServiceMutation.isPending}>
                  {editingService ? 'Guardar Cambios' : 'Crear Servicio'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ============== SERVICE DELETE DIALOG ============== */}
      <Dialog open={isServiceDeleteOpen} onOpenChange={setIsServiceDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Servicio</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar "{deletingService?.name}"? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsServiceDeleteOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => deletingService && deleteServiceMutation.mutate(deletingService.id)}
              disabled={deleteServiceMutation.isPending}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== TITULAR DIALOG ============== */}
      <Dialog open={isTitularOpen} onOpenChange={(open) => { setIsTitularOpen(open); if (!open) setEditingTitular(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTitular ? 'Editar Titular' : 'Nuevo Titular'}</DialogTitle>
            <DialogDescription>
              {editingTitular ? 'Modifica los datos del titular' : 'Registra un nuevo titular de consultas'}
            </DialogDescription>
          </DialogHeader>
          <Form {...titularForm}>
            <form onSubmit={titularForm.handleSubmit(handleTitularSubmit)} className="space-y-4">
              <FormField control={titularForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre *</FormLabel>
                  <FormControl>
                    <Input placeholder="Nombre completo del titular" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={titularForm.control} name="specialty" render={({ field }) => (
                <FormItem>
                  <FormLabel>Especialidad</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Nutricionista, Esteticista..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={titularForm.control} name="isActive" render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">Activo</FormLabel>
                </FormItem>
              )} />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsTitularOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createTitularMutation.isPending || updateTitularMutation.isPending}>
                  {editingTitular ? 'Guardar Cambios' : 'Crear Titular'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ============== TITULAR DELETE DIALOG ============== */}
      <Dialog open={isTitularDeleteOpen} onOpenChange={setIsTitularDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Titular</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar "{deletingTitular?.name}"? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTitularDeleteOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => deletingTitular && deleteTitularMutation.mutate(deletingTitular.id)}
              disabled={deleteTitularMutation.isPending}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ================================
// ServiceCard sub-component
// ================================
function ServiceCard({ service, onEdit, onDelete }: { service: any; onEdit: () => void; onDelete: () => void }) {
  const cat = categoryLabels[service.category] || categoryLabels.general;
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3">
        <div className={`h-9 w-9 rounded-full flex items-center justify-center ${service.category === 'programa_especial' ? 'bg-purple-100' : 'bg-blue-100'}`}>
          {service.category === 'programa_especial'
            ? <Star className="h-4 w-4 text-purple-700" />
            : <Stethoscope className="h-4 w-4 text-blue-700" />}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium">{service.name}</p>
            <Badge variant="outline" className={`text-xs ${cat.color}`}>{cat.label}</Badge>
            {!service.isActive && (
              <Badge variant="outline" className="text-xs bg-gray-100 text-gray-600 border-gray-200">Inactivo</Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            {service.description && <p className="text-sm text-muted-foreground">{service.description}</p>}
            {service.duration && <span className="text-xs text-muted-foreground">{service.duration} min</span>}
            {parseFloat(service.basePrice || service.base_price || '0') > 0 && (
              <span className="text-sm font-semibold text-green-700">
                RD$ {parseFloat(service.basePrice || service.base_price || '0').toFixed(2)}
                {(service.priceType || service.price_type) === 'variable' && ' (variable)'}
                {(service.priceType || service.price_type) === 'range' && (
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    ({parseFloat(service.minPrice || service.min_price || '0').toFixed(2)} - {parseFloat(service.maxPrice || service.max_price || '0').toFixed(2)})
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
