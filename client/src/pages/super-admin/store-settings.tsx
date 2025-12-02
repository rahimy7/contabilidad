import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Store, Settings, CreditCard, Package, MessageSquare, Users } from "lucide-react";
import type { SubscriptionPlan } from "@shared/schema";

export default function StoreSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [storeId, setStoreId] = useState<number | null>(null);

  // Get store ID from URL params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const storeParam = urlParams.get('store');
    if (storeParam) {
      setStoreId(parseInt(storeParam));
    }
  }, []);

  // Fetch store info
  const { data: store, isLoading } = useQuery({
    queryKey: [`/api/super-admin/stores/${storeId}`],
    queryFn: () => apiRequest("GET", `/api/super-admin/stores/${storeId}`),
    enabled: !!storeId,
  });

  // ✅ CORREGIDO: Fetch subscription plans con tipado correcto
  const { data: subscriptionPlans = [], isLoading: plansLoading } = useQuery<SubscriptionPlan[]>({
    queryKey: ['/api/super-admin/subscription-plans'],
    queryFn: () => apiRequest<SubscriptionPlan[]>('GET', '/api/super-admin/subscription-plans'),
  });

  // ✅ CORREGIDO: Remover .then(res => res.json())
  const updateStoreMutation = useMutation({
    mutationFn: (data: any) => 
      apiRequest("PUT", `/api/super-admin/stores/${storeId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/super-admin/stores`] });
      toast({
        title: "Configuración actualizada",
        description: "Los cambios se han guardado exitosamente",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "No se pudo actualizar la configuración",
        variant: "destructive",
      });
    },
  });

  const [selectedPlanId, setSelectedPlanId] = useState<string>('');

  // Initialize selected plan when store data loads
  useEffect(() => {
    if (store?.subscriptionPlanId) {
      setSelectedPlanId(store.subscriptionPlanId.toString());
    }
  }, [store]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      domain: formData.get('domain') as string,
      description: formData.get('description') as string,
      subscriptionPlanId: selectedPlanId ? parseInt(selectedPlanId) : null,
      contactEmail: formData.get('contactEmail') as string,
      contactPhone: formData.get('contactPhone') as string,
      address: formData.get('address') as string,
      isActive: formData.get('isActive') === 'on',
    };
    updateStoreMutation.mutate(data);
  };

  if (!storeId) {
    return (
      <div className="p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-600 mb-4">
            ID de tienda requerido
          </h1>
          <p className="text-gray-500">
            Por favor, especifica un ID de tienda válido en la URL
          </p>
        </div>
      </div>
    );
  }

  if (isLoading || plansLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-600 mb-4">
            Tienda no encontrada
          </h1>
          <p className="text-gray-500">
            No se pudo encontrar la tienda con ID {storeId}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => window.history.back()}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Configuración de Tienda</h1>
          <p className="text-gray-600">
            Gestiona la configuración de {store.name}
          </p>
        </div>
      </div>

      {/* Store Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Estado de la Tienda
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{store.name}</h3>
              <p className="text-sm text-gray-600">{store.domain}</p>
            </div>
            <Badge variant={store.isActive ? "default" : "secondary"}>
              {store.isActive ? "Activa" : "Inactiva"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configuración General
          </CardTitle>
          <CardDescription>
            Actualiza la información básica de la tienda
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre de la Tienda</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={store.name}
                  placeholder="Nombre de la tienda"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="domain">Dominio</Label>
                <Input
                  id="domain"
                  name="domain"
                  defaultValue={store.domain}
                  placeholder="ejemplo.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={store.description}
                placeholder="Descripción de la tienda"
                rows={3}
              />
            </div>

            {/* Contact Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contactEmail">Email de Contacto</Label>
                <Input
                  id="contactEmail"
                  name="contactEmail"
                  type="email"
                  defaultValue={store.contactEmail}
                  placeholder="contacto@tienda.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPhone">Teléfono de Contacto</Label>
                <Input
                  id="contactPhone"
                  name="contactPhone"
                  defaultValue={store.contactPhone}
                  placeholder="+1234567890"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Dirección</Label>
              <Textarea
                id="address"
                name="address"
                defaultValue={store.address}
                placeholder="Dirección completa"
                rows={2}
              />
            </div>

            {/* Subscription Plan */}
            <div className="space-y-2">
              <Label htmlFor="subscriptionPlan">Plan de Suscripción</Label>
              <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un plan" />
                </SelectTrigger>
                <SelectContent>
                  {Array.isArray(subscriptionPlans) && subscriptionPlans.map((plan: SubscriptionPlan) => (
                    <SelectItem key={plan.id} value={plan.id.toString()}>
                      {plan.name} - ${plan.monthlyPrice}/mes
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Store Status */}
            <div className="flex items-center space-x-2">
              <Switch
                id="isActive"
                name="isActive"
                defaultChecked={store.isActive}
              />
              <Label htmlFor="isActive">Tienda activa</Label>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end">
              <Button 
                type="submit" 
                disabled={updateStoreMutation.isPending}
              >
                {updateStoreMutation.isPending ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:bg-gray-50" 
              onClick={() => window.location.href = `/super-admin/store-products?store=${storeId}`}>
          <CardContent className="p-4 text-center">
            <Package className="h-8 w-8 mx-auto mb-2 text-blue-600" />
            <h3 className="font-semibold">Productos</h3>
            <p className="text-sm text-gray-600">Gestionar catálogo</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-gray-50 border-green-200 bg-green-50"
              onClick={() => window.location.href = `/super-admin/stores/${storeId}/whatsapp`}>
          <CardContent className="p-4 text-center">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 text-green-600" />
            <h3 className="font-semibold text-green-700">WhatsApp</h3>
            <p className="text-sm text-green-600">Configurar API</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-gray-50"
              onClick={() => window.location.href = `/super-admin/store-themes?store=${storeId}`}>
          <CardContent className="p-4 text-center">
            <CreditCard className="h-8 w-8 mx-auto mb-2 text-purple-600" />
            <h3 className="font-semibold">Temas</h3>
            <p className="text-sm text-gray-600">Personalizar diseño</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-gray-50">
          <CardContent className="p-4 text-center">
            <Users className="h-8 w-8 mx-auto mb-2 text-orange-600" />
            <h3 className="font-semibold">Usuarios</h3>
            <p className="text-sm text-gray-600">Gestionar equipo</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}