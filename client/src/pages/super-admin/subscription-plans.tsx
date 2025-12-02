import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, DollarSign, Users, MessageSquare, Package, Server } from 'lucide-react';
import type { SubscriptionPlan, InsertSubscriptionPlan } from '@shared/schema';

export default function SubscriptionPlansPage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch subscription plans
  const { data: plans = [], isLoading } = useQuery<SubscriptionPlan[]>({
    queryKey: ['/api/super-admin/subscription-plans'],
  });

  // Create plan mutation
  const createPlanMutation = useMutation({
    mutationFn: (data: InsertSubscriptionPlan) =>
      apiRequest('POST', '/api/super-admin/subscription-plans', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/subscription-plans'] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Plan creado",
        description: "El plan de suscripción ha sido creado exitosamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Error al crear el plan de suscripción",
        variant: "destructive",
      });
    },
  });

  // Update plan mutation
  const updatePlanMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertSubscriptionPlan> }) =>
      apiRequest('PUT', `/api/super-admin/subscription-plans/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/subscription-plans'] });
      setIsEditDialogOpen(false);
      setEditingPlan(null);
      toast({
        title: "Plan actualizado",
        description: "El plan de suscripción ha sido actualizado exitosamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Error al actualizar el plan de suscripción",
        variant: "destructive",
      });
    },
  });

  // Delete plan mutation
  const deletePlanMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest('DELETE', `/api/super-admin/subscription-plans/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/super-admin/subscription-plans'] });
      toast({
        title: "Plan eliminado",
        description: "El plan de suscripción ha sido eliminado exitosamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Error al eliminar el plan de suscripción",
        variant: "destructive",
      });
    },
  });

  const getPlanTypeColor = (type: string) => {
    switch (type) {
      case 'fixed': return 'bg-blue-100 text-blue-800';
      case 'usage_based': return 'bg-green-100 text-green-800';
      case 'hybrid': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatPrice = (price: string | null) => {
    if (!price) return 'N/A';
    return `$${parseFloat(price).toLocaleString('es-MX')}`;
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Planes de Suscripción</h1>
          <p className="text-gray-600 mt-2">Gestiona los planes de suscripción disponibles para las tiendas</p>
        </div>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" />
              Crear Plan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Crear Nuevo Plan</DialogTitle>
              <DialogDescription>
                Configura un nuevo plan de suscripción con límites de recursos y precios
              </DialogDescription>
            </DialogHeader>
            <PlanForm 
              onSubmit={(data) => createPlanMutation.mutate(data)}
              isLoading={createPlanMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((plan: SubscriptionPlan) => (
          <Card key={plan.id} className="relative">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription className="mt-1">{plan.description}</CardDescription>
                </div>
                <Badge className={getPlanTypeColor(plan.type)}>
                  {plan.type === 'fixed' ? 'Fijo' : 
                   plan.type === 'usage_based' ? 'Por Uso' : 'Híbrido'}
                </Badge>
              </div>
              
              <div className="text-2xl font-bold text-blue-600">
                {formatPrice(plan.monthlyPrice?.toString())}
                <span className="text-sm font-normal text-gray-500">/mes</span>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {/* Resource Limits */}
              <div className="space-y-2">
                <div className="flex items-center text-sm">
                  <Package className="h-4 w-4 mr-2 text-gray-500" />
                  <span>Productos: {plan.maxProducts === -1 ? 'Ilimitados' : plan.maxProducts}</span>
                </div>
                <div className="flex items-center text-sm">
                  <MessageSquare className="h-4 w-4 mr-2 text-gray-500" />
                  <span>WhatsApp: {plan.maxWhatsappMessages === -1 ? 'Ilimitados' : plan.maxWhatsappMessages}</span>
                </div>
                <div className="flex items-center text-sm">
                  <Users className="h-4 w-4 mr-2 text-gray-500" />
                  <span>Usuarios: {plan.maxUsers === -1 ? 'Ilimitados' : plan.maxUsers}</span>
                </div>
                <div className="flex items-center text-sm">
                  <Server className="h-4 w-4 mr-2 text-gray-500" />
                  <span>Base de datos: {plan.maxDbStorage === null ? 'N/A' : `${plan.maxDbStorage}GB`}</span>
                </div>
              </div>

              {/* Pricing per unit (for usage-based) */}
              {(plan.type === 'usage_based' || plan.type === 'hybrid') && (
                <div className="border-t pt-3 space-y-1">
                  <div className="text-xs text-gray-600">Precios por unidad:</div>
                  {plan.pricePerProduct && (
                    <div className="text-xs">Producto: {formatPrice(plan.pricePerProduct.toString())}</div>
                  )}
                  {plan.pricePerMessage && (
                    <div className="text-xs">Mensaje: {formatPrice(plan.pricePerMessage.toString())}</div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-3 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingPlan(plan);
                    setIsEditDialogOpen(true);
                  }}
                  className="flex-1"
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (confirm('¿Estás seguro de que quieres eliminar este plan?')) {
                      deletePlanMutation.mutate(plan.id);
                    }
                  }}
                  className="text-red-600 hover:text-red-700 hover:border-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {plans.length === 0 && (
          <div className="col-span-full text-center py-12">
            <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No hay planes creados</h3>
            <p className="text-gray-500 mb-4">Crea tu primer plan de suscripción para empezar</p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Crear Plan
            </Button>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Plan</DialogTitle>
            <DialogDescription>
              Modifica la configuración del plan de suscripción
            </DialogDescription>
          </DialogHeader>
          {editingPlan && (
            <PlanForm 
              plan={editingPlan}
              onSubmit={(data) => updatePlanMutation.mutate({ id: editingPlan.id, data })}
              isLoading={updatePlanMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Plan Form Component
function PlanForm({ 
  plan, 
  onSubmit, 
  isLoading 
}: { 
  plan?: SubscriptionPlan; 
  onSubmit: (data: InsertSubscriptionPlan) => void; 
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState<InsertSubscriptionPlan>({
    name: plan?.name || '',
    description: plan?.description || '',
    type: plan?.type || 'fixed',
    monthlyPrice: plan?.monthlyPrice?.toString() || null,
    maxProducts: plan?.maxProducts || -1,
    maxWhatsappMessages: plan?.maxWhatsappMessages || -1,
    maxUsers: plan?.maxUsers || -1,
    maxOrders: plan?.maxOrders || -1,
    maxCustomers: plan?.maxCustomers || -1,
    maxDbStorage: plan?.maxDbStorage?.toString() || null,
    pricePerProduct: plan?.pricePerProduct?.toString() || null,
    pricePerMessage: plan?.pricePerMessage?.toString() || null,
    pricePerGbStorage: plan?.pricePerGbStorage?.toString() || null,
    pricePerOrder: plan?.pricePerOrder?.toString() || null,
    isActive: plan?.isActive ?? true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="name">Nombre del Plan</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>
        
        <div>
          <Label htmlFor="description">Descripción</Label>
          <Textarea
            id="description"
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
          />
        </div>

        <div>
          <Label htmlFor="type">Tipo de Plan</Label>
          <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value as any })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Precio Fijo</SelectItem>
              <SelectItem value="usage_based">Basado en Uso</SelectItem>
              <SelectItem value="hybrid">Híbrido (Fijo + Uso)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(formData.type === 'fixed' || formData.type === 'hybrid') && (
          <div>
            <Label htmlFor="monthlyPrice">Precio Mensual Fijo</Label>
            <Input
              id="monthlyPrice"
              type="number"
              step="0.01"
              value={formData.monthlyPrice || ''}
              onChange={(e) => setFormData({ ...formData, monthlyPrice: e.target.value || null })}
              placeholder="0.00"
            />
          </div>
        )}
      </div>

      {/* Resource Limits */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Límites de Recursos</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="maxProducts">Máximo Productos</Label>
            <Input
              id="maxProducts"
              type="number"
              value={formData.maxProducts === -1 ? '' : formData.maxProducts}
              onChange={(e) => setFormData({ ...formData, maxProducts: e.target.value ? parseInt(e.target.value) : -1 })}
              placeholder="Ilimitado"
            />
          </div>
          
          <div>
            <Label htmlFor="maxWhatsappMessages">Máximo Mensajes WhatsApp</Label>
            <Input
              id="maxWhatsappMessages"
              type="number"
              value={formData.maxWhatsappMessages === -1 ? '' : formData.maxWhatsappMessages}
              onChange={(e) => setFormData({ ...formData, maxWhatsappMessages: e.target.value ? parseInt(e.target.value) : -1 })}
              placeholder="Ilimitado"
            />
          </div>
          
          <div>
            <Label htmlFor="maxUsers">Máximo Usuarios</Label>
            <Input
              id="maxUsers"
              type="number"
              value={formData.maxUsers === -1 ? '' : formData.maxUsers}
              onChange={(e) => setFormData({ ...formData, maxUsers: e.target.value ? parseInt(e.target.value) : -1 })}
              placeholder="Ilimitado"
            />
          </div>
          
          <div>
            <Label htmlFor="maxDbStorage">Almacenamiento BD (GB)</Label>
            <Input
              id="maxDbStorage"
              type="number"
              step="0.1"
              value={formData.maxDbStorage || ''}
              onChange={(e) => setFormData({ ...formData, maxDbStorage: e.target.value || null })}
              placeholder="Ilimitado"
            />
          </div>
        </div>
      </div>

      {/* Usage-based pricing */}
      {(formData.type === 'usage_based' || formData.type === 'hybrid') && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Precios por Uso</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pricePerProduct">Precio por Producto</Label>
              <Input
                id="pricePerProduct"
                type="number"
                step="0.01"
                value={formData.pricePerProduct || ''}
                onChange={(e) => setFormData({ ...formData, pricePerProduct: e.target.value || null })}
                placeholder="0.00"
              />
            </div>
            
            <div>
              <Label htmlFor="pricePerMessage">Precio por Mensaje</Label>
              <Input
                id="pricePerMessage"
                type="number"
                step="0.001"
                value={formData.pricePerMessage || ''}
                onChange={(e) => setFormData({ ...formData, pricePerMessage: e.target.value || null })}
                placeholder="0.000"
              />
            </div>
            
            <div>
              <Label htmlFor="pricePerGbStorage">Precio por GB</Label>
              <Input
                id="pricePerGbStorage"
                type="number"
                step="0.01"
                value={formData.pricePerGbStorage || ''}
                onChange={(e) => setFormData({ ...formData, pricePerGbStorage: e.target.value || null })}
                placeholder="0.00"
              />
            </div>
            
            <div>
              <Label htmlFor="pricePerOrder">Precio por Orden</Label>
              <Input
                id="pricePerOrder"
                type="number"
                step="0.01"
                value={formData.pricePerOrder || ''}
                onChange={(e) => setFormData({ ...formData, pricePerOrder: e.target.value || null })}
                placeholder="0.00"
              />
            </div>
          </div>
        </div>
      )}

      {/* Active Status */}
      <div className="flex items-center space-x-2">
        <Switch
          id="isActive"
          checked={formData.isActive}
          onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
        />
        <Label htmlFor="isActive">Plan Activo</Label>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end space-x-2">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Guardando...' : plan ? 'Actualizar Plan' : 'Crear Plan'}
        </Button>
      </div>
    </form>
  );
}