import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Search, Filter, Eye, EyeOff, Building2 } from 'lucide-react';

const brandSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  description: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  logo: z.string().url().optional().or(z.literal('')),
  isActive: z.boolean().default(true),
  sortOrder: z.number().min(0).default(0),
});

type BrandFormData = z.infer<typeof brandSchema>;

interface Brand {
  id: number;
  name: string;
  description?: string;
  website?: string;
  logo?: string;
  isActive: boolean;
  sortOrder: number;
  productsCount?: number;
  createdAt: string;
  updatedAt: string;
}

const BrandsManagement = () => {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [deletingBrand, setDeletingBrand] = useState<Brand | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: brands = [], isLoading } = useQuery<Brand[]>({
    queryKey: ['/api/brands'],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/brands', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error('Error al cargar marcas');
      return response.json();
    },
  });

  const createBrandMutation = useMutation({
    mutationFn: async (data: BrandFormData) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/brands', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Error al crear marca');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brands'] });
      setShowCreateDialog(false);
      createForm.reset();
      toast({ title: 'Marca creada exitosamente' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error al crear marca',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateBrandMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: BrandFormData }) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/brands/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Error al actualizar marca');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brands'] });
      setShowEditDialog(false);
      setEditingBrand(null);
      toast({ title: 'Marca actualizada exitosamente' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error al actualizar marca',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteBrandMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/brands/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error('Error al eliminar marca');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/brands'] });
      setShowDeleteDialog(false);
      setDeletingBrand(null);
      toast({ title: 'Marca eliminada exitosamente' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error al eliminar marca',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const createForm = useForm<BrandFormData>({
    resolver: zodResolver(brandSchema),
    defaultValues: {
      name: '',
      description: '',
      website: '',
      logo: '',
      isActive: true,
      sortOrder: 0,
    },
  });

  const editForm = useForm<BrandFormData>({
    resolver: zodResolver(brandSchema),
  });

  const filteredBrands = useMemo(() => {
    return brands.filter((brand) => {
      const matchesSearch = brand.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        brand.description?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesFilter = filterStatus === 'all' || 
        (filterStatus === 'active' && brand.isActive) ||
        (filterStatus === 'inactive' && !brand.isActive);

      return matchesSearch && matchesFilter;
    });
  }, [brands, searchTerm, filterStatus]);

  const handleEdit = (brand: Brand) => {
    setEditingBrand(brand);
    editForm.reset({
      name: brand.name,
      description: brand.description || '',
      website: brand.website || '',
      logo: brand.logo || '',
      isActive: brand.isActive,
      sortOrder: brand.sortOrder,
    });
    setShowEditDialog(true);
  };

  const handleDelete = (brand: Brand) => {
    setDeletingBrand(brand);
    setShowDeleteDialog(true);
  };

  const onCreateSubmit = (data: BrandFormData) => {
    createBrandMutation.mutate(data);
  };

  const onEditSubmit = (data: BrandFormData) => {
    if (editingBrand) {
      updateBrandMutation.mutate({ id: editingBrand.id, data });
    }
  };

  const onDeleteConfirm = () => {
    if (deletingBrand) {
      deleteBrandMutation.mutate(deletingBrand.id);
    }
  };

  const stats = useMemo(() => {
    const total = brands.length;
    const active = brands.filter(b => b.isActive).length;
    const inactive = total - active;
    const withWebsite = brands.filter(b => b.website).length;
    
    return { total, active, inactive, withWebsite };
  }, [brands]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Cargando marcas...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Marcas</h1>
          <p className="text-muted-foreground">
            Administra las marcas de productos de tu tienda
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nueva Marca
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Crear Nueva Marca</DialogTitle>
              <DialogDescription>
                Completa la información para crear una nueva marca
              </DialogDescription>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                <FormField
                  control={createForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Nombre de la marca" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descripción</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Descripción opcional" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sitio Web</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="https://ejemplo.com" type="url" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="logo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL del Logo</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="https://ejemplo.com/logo.png" type="url" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="sortOrder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Orden</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field} 
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          placeholder="0"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel>Marca activa</FormLabel>
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button 
                    type="submit" 
                    disabled={createBrandMutation.isPending}
                  >
                    {createBrandMutation.isPending ? 'Creando...' : 'Crear Marca'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Marcas</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Activas</CardTitle>
            <Eye className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactivas</CardTitle>
            <EyeOff className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.inactive}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Con Sitio Web</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.withWebsite}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar marcas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={(value: 'all' | 'active' | 'inactive') => setFilterStatus(value)}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las marcas</SelectItem>
            <SelectItem value="active">Solo activas</SelectItem>
            <SelectItem value="inactive">Solo inactivas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredBrands.map((brand) => (
          <Card key={brand.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  {brand.logo ? (
                    <img 
                      src={brand.logo} 
                      alt={brand.name}
                      className="w-10 h-10 object-contain rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-gray-400" />
                    </div>
                  )}
                  <div>
                    <CardTitle className="text-lg">{brand.name}</CardTitle>
                    <Badge variant={brand.isActive ? 'default' : 'secondary'} className="mt-1">
                      {brand.isActive ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(brand)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(brand)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {brand.description && (
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                  {brand.description}
                </p>
              )}
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">
                  Productos: <Badge variant="outline">{brand.productsCount || 0}</Badge>
                </span>
                {brand.website && (
                  <a 
                    href={brand.website} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800"
                  >
                    Sitio Web
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredBrands.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No se encontraron marcas</h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchTerm || filterStatus !== 'all' 
                ? 'Intenta ajustar los filtros de búsqueda'
                : 'Comienza creando tu primera marca'
              }
            </p>
            {!searchTerm && filterStatus === 'all' && (
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Crear Primera Marca
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Marca</DialogTitle>
            <DialogDescription>
              Modifica la información de la marca
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Nombre de la marca" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Descripción opcional" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sitio Web</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="https://ejemplo.com" type="url" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="logo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL del Logo</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="https://ejemplo.com/logo.png" type="url" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Orden</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        {...field} 
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center space-x-2">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel>Marca activa</FormLabel>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button 
                  type="submit" 
                  disabled={updateBrandMutation.isPending}
                >
                  {updateBrandMutation.isPending ? 'Actualizando...' : 'Actualizar Marca'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Marca</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar la marca "{deletingBrand?.name}"?
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={onDeleteConfirm}
              disabled={deleteBrandMutation.isPending}
            >
              {deleteBrandMutation.isPending ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BrandsManagement;
