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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Search, 
  Filter, 
  Eye, 
  EyeOff, 
  FolderOpen,
  MoreHorizontal,
  Download,
  Upload,
  Grid3X3,
  List,
  Package,
  AlertTriangle
} from 'lucide-react';

const categorySchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  description: z.string().optional(),
  icon: z.string().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().min(0).default(0),
});

type CategoryFormData = z.infer<typeof categorySchema>;

interface Category {
  id: number;
  name: string;
  description?: string;
  icon?: string;
  isActive: boolean;
  sortOrder: number;
  productsCount?: number;
  createdAt: string;
  updatedAt: string;
}

const CategoriesManagement = () => {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/categories', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error('Error al cargar categorías');
      return response.json();
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (data: CategoryFormData) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Error al crear categoría');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
      setShowCreateDialog(false);
      createForm.reset();
      toast({ title: 'Categoría creada exitosamente' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error al crear categoría',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: CategoryFormData }) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/categories/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Error al actualizar categoría');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
      setShowEditDialog(false);
      setEditingCategory(null);
      toast({ title: 'Categoría actualizada exitosamente' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error al actualizar categoría',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/categories/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error al eliminar categoría');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/categories'] });
      setShowDeleteDialog(false);
      setDeletingCategory(null);
      toast({ title: 'Categoría eliminada exitosamente' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error al eliminar categoría',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const createForm = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: '',
      description: '',
      icon: '',
      isActive: true,
      sortOrder: 0,
    },
  });

  const editForm = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
  });

  const filteredCategories = useMemo(() => {
    let filtered = categories.filter((category) => {
      const matchesSearch = category.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        category.description?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesFilter = filterStatus === 'all' || 
        (filterStatus === 'active' && category.isActive) ||
        (filterStatus === 'inactive' && !category.isActive);

      return matchesSearch && matchesFilter;
    });

    // Ordenar por sortOrder y luego por nombre
    filtered.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.name.localeCompare(b.name);
    });

    return filtered;
  }, [categories, searchTerm, filterStatus]);

  // Paginación
  const totalPages = Math.ceil(filteredCategories.length / itemsPerPage);
  const paginatedCategories = filteredCategories.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    editForm.reset({
      name: category.name,
      description: category.description || '',
      icon: category.icon || '',
      isActive: category.isActive,
      sortOrder: category.sortOrder,
    });
    setShowEditDialog(true);
  };

  const handleDelete = (category: Category) => {
    setDeletingCategory(category);
    setShowDeleteDialog(true);
  };

  const onCreateSubmit = (data: CategoryFormData) => {
    createCategoryMutation.mutate(data);
  };

  const onEditSubmit = (data: CategoryFormData) => {
    if (editingCategory) {
      updateCategoryMutation.mutate({ id: editingCategory.id, data });
    }
  };

  const onDeleteConfirm = () => {
    if (deletingCategory) {
      deleteCategoryMutation.mutate(deletingCategory.id);
    }
  };

  const handleExport = () => {
    const csvData = categories.map(cat => ({
      ID: cat.id,
      Nombre: cat.name,
      Descripcion: cat.description || '',
      Icono: cat.icon || '',
      Estado: cat.isActive ? 'Activo' : 'Inactivo',
      Orden: cat.sortOrder,
      Productos: cat.productsCount || 0,
      'Fecha Creación': new Date(cat.createdAt).toLocaleDateString()
    }));

    const csv = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `categorias_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const stats = useMemo(() => {
    const total = categories.length;
    const active = categories.filter(c => c.isActive).length;
    const inactive = total - active;
    const totalProducts = categories.reduce((sum, c) => sum + (c.productsCount || 0), 0);
    
    return { total, active, inactive, totalProducts };
  }, [categories]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Cargando categorías...</div>
      </div>
    );
  }

  const CategoryForm = ({ 
    form, 
    onSubmit, 
    isLoading, 
    buttonText 
  }: { 
    form: any; 
    onSubmit: (data: CategoryFormData) => void; 
    isLoading: boolean; 
    buttonText: string;
  }) => (
    <Form {...form}>
      <div className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre *</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Nombre de la categoría" />
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
              <FormLabel>Descripción</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder="Descripción opcional" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="icon"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ícono (emoji o clase CSS)</FormLabel>
              <FormControl>
                <Input {...field} placeholder="📦 o fa-box" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="sortOrder"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Orden de visualización</FormLabel>
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
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex items-center space-x-2">
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <FormLabel>Categoría activa</FormLabel>
            </FormItem>
          )}
        />
      </div>
      <DialogFooter className="mt-6">
        <Button 
          onClick={form.handleSubmit(onSubmit)}
          disabled={isLoading}
        >
          {isLoading ? 'Guardando...' : buttonText}
        </Button>
      </DialogFooter>
    </Form>
  );

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Categorías</h1>
          <p className="text-muted-foreground">
            Administra las categorías de productos de tu tienda
          </p>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <MoreHorizontal className="h-4 w-4 mr-2" />
                Acciones
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Exportar CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowImportDialog(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Importar CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nueva Categoría
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear Nueva Categoría</DialogTitle>
                <DialogDescription>
                  Completa la información para crear una nueva categoría
                </DialogDescription>
              </DialogHeader>
              <CategoryForm
                form={createForm}
                onSubmit={onCreateSubmit}
                isLoading={createCategoryMutation.isPending}
                buttonText="Crear Categoría"
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Categorías</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
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
            <CardTitle className="text-sm font-medium">Total Productos</CardTitle>
            <Package className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.totalProducts}</div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-4 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar categorías..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterStatus} onValueChange={(value: 'all' | 'active' | 'inactive') => setFilterStatus(value)}>
            <SelectTrigger className="w-[200px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              <SelectItem value="active">Solo activas</SelectItem>
              <SelectItem value="inactive">Solo inactivas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('grid')}
          >
            <Grid3X3 className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'table' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('table')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginatedCategories.map((category) => (
            <Card key={category.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-100 rounded flex items-center justify-center">
                      {category.icon ? (
                        <span className="text-lg">{category.icon}</span>
                      ) : (
                        <FolderOpen className="h-5 w-5 text-blue-600" />
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{category.name}</CardTitle>
                      <Badge variant={category.isActive ? 'default' : 'secondary'} className="mt-1">
                        {category.isActive ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEdit(category)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDelete(category)}
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                {category.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {category.description}
                  </p>
                )}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">
                    Productos: <Badge variant="outline">{category.productsCount || 0}</Badge>
                  </span>
                  <span className="text-muted-foreground">
                    Orden: {category.sortOrder}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Categoría</th>
                    <th className="px-4 py-3 text-left font-medium">Estado</th>
                    <th className="px-4 py-3 text-left font-medium">Productos</th>
                    <th className="px-4 py-3 text-left font-medium">Orden</th>
                    <th className="px-4 py-3 text-left font-medium">Fecha</th>
                    <th className="px-4 py-3 text-center font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCategories.map((category) => (
                    <tr key={category.id} className="border-b hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-3">
                          {category.icon ? (
                            <span className="text-lg">{category.icon}</span>
                          ) : (
                            <FolderOpen className="h-5 w-5 text-blue-600" />
                          )}
                          <div>
                            <div className="font-medium">{category.name}</div>
                            {category.description && (
                              <div className="text-sm text-muted-foreground line-clamp-1">
                                {category.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={category.isActive ? 'default' : 'secondary'}>
                          {category.isActive ? 'Activa' : 'Inactiva'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{category.productsCount || 0}</Badge>
                      </td>
                      <td className="px-4 py-3">{category.sortOrder}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {new Date(category.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(category)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(category)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {currentPage} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
          >
            Siguiente
          </Button>
        </div>
      )}

      {/* Empty State */}
      {filteredCategories.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No se encontraron categorías</h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchTerm || filterStatus !== 'all' 
                ? 'Intenta ajustar los filtros de búsqueda'
                : 'Comienza creando tu primera categoría'
              }
            </p>
            {!searchTerm && filterStatus === 'all' && (
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Crear Primera Categoría
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Categoría</DialogTitle>
            <DialogDescription>
              Modifica la información de la categoría
            </DialogDescription>
          </DialogHeader>
          <CategoryForm
            form={editForm}
            onSubmit={onEditSubmit}
            isLoading={updateCategoryMutation.isPending}
            buttonText="Actualizar Categoría"
          />
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Eliminar Categoría
            </DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar la categoría "{deletingCategory?.name}"?
              {deletingCategory?.productsCount && deletingCategory.productsCount > 0 && (
                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-800">
                  <strong>Advertencia:</strong> Esta categoría tiene {deletingCategory.productsCount} productos asociados.
                  Los productos se moverán a "Sin categoría".
                </div>
              )}
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
              disabled={deleteCategoryMutation.isPending}
            >
              {deleteCategoryMutation.isPending ? 'Eliminando...' : 'Eliminar Categoría'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar Categorías</DialogTitle>
            <DialogDescription>
              Sube un archivo CSV con las categorías. Formato: Nombre,Descripción,Icono,Orden,Activo
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-sm text-gray-600 mb-2">
                Arrastra tu archivo CSV aquí o haz clic para seleccionar
              </p>
              <Button variant="outline" size="sm">
                Seleccionar archivo
              </Button>
            </div>
            <div className="text-xs text-gray-500">
              <strong>Ejemplo de formato CSV:</strong><br/>
              Nombre,Descripción,Icono,Orden,Activo<br/>
              Electrónicos,Productos electrónicos,📱,1,true<br/>
              Ropa,Artículos de vestir,👕,2,true
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              Cancelar
            </Button>
            <Button disabled>
              Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CategoriesManagement;
