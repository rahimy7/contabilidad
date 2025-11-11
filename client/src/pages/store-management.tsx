import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Store, Settings, Globe, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const storeSchema = z.object({
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres"),
  slug: z.string().min(3, "El slug debe tener al menos 3 caracteres"),
  description: z.string().optional(),
  whatsappNumber: z.string().optional(),
  address: z.string().optional(),
  timezone: z.string().default("America/Mexico_City"),
  currency: z.string().default("MXN"),
  subscription: z.string().default("free"),
});

type StoreFormData = z.infer<typeof storeSchema>;

interface VirtualStore {
  id: number;
  name: string;
  slug: string;
  description?: string;
  whatsappNumber?: string;
  address?: string;
  timezone: string;
  currency: string;
  isActive: boolean;
  subscription: string;
  subscriptionExpiry?: Date;
  databaseUrl: string;
  createdAt: Date;
  updatedAt: Date;
  ownerId?: number;
  settings?: string;
}

export default function StoreManagement() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<VirtualStore | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: stores, isLoading } = useQuery<VirtualStore[]>({
    queryKey: ["/api/super-admin/stores"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: StoreFormData) => {
      return apiRequest("POST", "/api/super-admin/stores", data);
    },
    onSuccess: () => {
      toast({
        title: "Tienda creada",
        description: "La tienda virtual ha sido creada exitosamente",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/stores"] });
      setIsCreateOpen(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo crear la tienda virtual",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<StoreFormData> }) => {
      return apiRequest("PUT", `/api/super-admin/stores/${id}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Tienda actualizada",
        description: "La información de la tienda ha sido actualizada",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/stores"] });
      setEditingStore(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar la tienda",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/super-admin/stores/${id}`, {});
    },
    onSuccess: () => {
      toast({
        title: "Tienda desactivada",
        description: "La tienda ha sido desactivada exitosamente",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/stores"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo desactivar la tienda",
        variant: "destructive",
      });
    },
  });

  const form = useForm<StoreFormData>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      whatsappNumber: "",
      address: "",
      timezone: "America/Mexico_City",
      currency: "MXN",
      subscription: "free",
    },
  });

  const onSubmit = (data: StoreFormData) => {
    if (editingStore) {
      updateMutation.mutate({ id: editingStore.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (store: VirtualStore) => {
    setEditingStore(store);
    form.reset({
      name: store.name,
      slug: store.slug,
      description: store.description || "",
      whatsappNumber: store.whatsappNumber || "",
      address: store.address || "",
      timezone: store.timezone,
      currency: store.currency,
      subscription: store.subscription,
    });
  };

  const handleCreateNew = () => {
    setEditingStore(null);
    form.reset();
    setIsCreateOpen(true);
  };

  const getSubscriptionBadge = (subscription: string) => {
    const variants = {
      free: "secondary",
      basic: "default",
      premium: "secondary",
      enterprise: "destructive",
    } as const;
    
    return (
      <Badge variant={variants[subscription as keyof typeof variants] || "secondary"}>
        {subscription.toUpperCase()}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Tiendas Virtuales</h1>
          <p className="text-muted-foreground">
            Administra todas las tiendas virtuales del sistema multi-tenant
          </p>
        </div>
        <Button onClick={handleCreateNew}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva Tienda
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stores?.map((store) => (
          <Card key={store.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Store className="w-5 h-5" />
                  {store.name}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {getSubscriptionBadge(store.subscription)}
                  <Switch checked={store.isActive} disabled />
                </div>
              </div>
              {store.slug && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Globe className="w-4 h-4" />
                  {store.slug}
                </p>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {store.description && (
                  <p className="text-sm text-muted-foreground">{store.description}</p>
                )}
                
                {store.whatsappNumber && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">WhatsApp:</span>
                    <span>{store.whatsappNumber}</span>
                  </div>
                )}

                {store.address && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">Dirección:</span>
                    <span className="text-muted-foreground truncate">{store.address}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Zona horaria:</span>
                  <span className="text-muted-foreground">{store.timezone}</span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Moneda:</span>
                  <span className="text-muted-foreground">{store.currency}</span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">Creada:</span>
                  <span className="text-muted-foreground">
                    {new Date(store.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(store)}
                    className="flex-1"
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteMutation.mutate(store.id)}
                    className="flex-1"
                    disabled={!store.isActive}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Desactivar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isCreateOpen || !!editingStore} onOpenChange={(open) => {
        if (!open) {
          setIsCreateOpen(false);
          setEditingStore(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingStore ? "Editar Tienda" : "Nueva Tienda Virtual"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre de la tienda</FormLabel>
                    <FormControl>
                      <Input placeholder="Mi Tienda Virtual" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug (URL amigable)</FormLabel>
                    <FormControl>
                      <Input placeholder="mi-tienda-virtual" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción (opcional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Descripción de la tienda..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="whatsappNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número de WhatsApp (opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="+52 55 1234 5678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dirección (opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Dirección de la tienda" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="timezone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Zona horaria</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="America/Mexico_City">México (CDMX)</SelectItem>
                          <SelectItem value="America/Cancun">México (Cancún)</SelectItem>
                          <SelectItem value="America/Monterrey">México (Monterrey)</SelectItem>
                          <SelectItem value="America/Tijuana">México (Tijuana)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Moneda</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="MXN">MXN (Peso Mexicano)</SelectItem>
                          <SelectItem value="USD">USD (Dólar)</SelectItem>
                          <SelectItem value="EUR">EUR (Euro)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="subscription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plan de suscripción</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar plan" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="free">Gratuito</SelectItem>
                        <SelectItem value="basic">Básico</SelectItem>
                        <SelectItem value="premium">Premium</SelectItem>
                        <SelectItem value="enterprise">Empresarial</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCreateOpen(false);
                    setEditingStore(null);
                  }}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1"
                >
                  {editingStore ? "Actualizar" : "Crear"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}