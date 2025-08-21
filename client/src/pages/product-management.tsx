// client/src/pages/product-management.tsx - Modificaciones para multimoneda

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCurrency } from '@/hooks/useCurrency';
import { CurrencySelector } from '@/components/CurrencySelector';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DollarSign, Eye, RefreshCw, Edit, Plus } from 'lucide-react';

const productSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  description: z.string().optional(),
  price: z.number().min(0.01, 'Precio debe ser mayor a 0'),
  baseCurrency: z.enum(['USD', 'DOP']),
  category: z.string().min(1, 'Categoría requerida'),
  sku: z.string().optional(),
  brand: z.string().optional(),
});

type ProductFormData = z.infer<typeof productSchema>;

interface Product extends ProductFormData {
  id: number;
  createdAt: string;
  updatedAt: string;
}

export default function ProductManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [previewCurrency, setPreviewCurrency] = useState<'USD' | 'DOP'>('DOP');
  
  const { 
    convertPrice, 
    formatCurrency, 
    selectedCurrency,
    getConversionRate 
  } = useCurrency();

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      baseCurrency: 'DOP',
      category: 'product'
    }
  });

  const watchedPrice = form.watch('price');
  const watchedBaseCurrency = form.watch('baseCurrency');

  // Queries
  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['/api/products']
  });

  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ['/api/categories']
  });

  // Mutations
  const createProductMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const response = await fetch('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) throw new Error('Error creating product');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: 'Producto creado exitosamente' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Error al crear producto', variant: 'destructive' });
    }
  });

  const updateProductMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ProductFormData }) => {
      const response = await fetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) throw new Error('Error updating product');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      setIsDialogOpen(false);
      setEditingProduct(null);
      form.reset();
      toast({ title: 'Producto actualizado exitosamente' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Error al actualizar producto', variant: 'destructive' });
    }
  });

  // Handlers
  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    form.reset(product);
    setIsDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingProduct(null);
    form.reset({ baseCurrency: 'DOP', category: 'product' });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: ProductFormData) => {
    if (editingProduct) {
      updateProductMutation.mutate({ id: editingProduct.id, data });
    } else {
      createProductMutation.mutate(data);
    }
  };

  // Preview de precio convertido en tiempo real
  const getPreviewPrice = () => {
    if (!watchedPrice || !watchedBaseCurrency) return 0;
    
    if (watchedBaseCurrency === previewCurrency) {
      return watchedPrice;
    }
    
    return convertPrice(watchedPrice, watchedBaseCurrency);
  };

  const previewPrice = getPreviewPrice();
  const conversionRate = getConversionRate(watchedBaseCurrency || 'DOP', previewCurrency);

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Productos</h1>
          <p className="text-gray-600">Precios mostrados en {selectedCurrency}</p>
        </div>
        <div className="flex gap-3">
          <CurrencySelector variant="compact" />
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Producto
          </Button>
        </div>
      </div>

      {/* Lista de productos */}
      <Card>
        <CardHeader>
          <CardTitle>Productos ({products.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Cargando productos...</div>
          ) : (
            <div className="space-y-4">
              {products.map(product => {
                const convertedPrice = convertPrice(
                  parseFloat(product.price.toString()), 
                  product.baseCurrency
                );
                
                return (
                  <div key={product.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium">{product.name}</h3>
                        <Badge variant="outline">
                          {product.baseCurrency}
                        </Badge>
                        {product.baseCurrency !== selectedCurrency && (
                          <Badge variant="secondary" className="text-xs">
                            Convertido
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{product.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-sm">
                        <span className="font-medium">
                          {formatCurrency(convertedPrice)}
                        </span>
                        {product.baseCurrency !== selectedCurrency && (
                          <span className="text-gray-500">
                            Base: {formatCurrency(parseFloat(product.price.toString()), product.baseCurrency)}
                          </span>
                        )}
                        <span className="text-gray-400">•</span>
                        <span className="text-gray-500">{product.category}</span>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleEdit(product)}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Editar
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de creación/edición */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              {/* Nombre */}
              <div className="col-span-2">
                <Label htmlFor="name">Nombre del Producto</Label>
                <Input
                  id="name"
                  {...form.register('name')}
                  placeholder="Ej: Aire Acondicionado 12000 BTU"
                />
                {form.formState.errors.name && (
                  <span className="text-sm text-red-500">
                    {form.formState.errors.name.message}
                  </span>
                )}
              </div>

              {/* Precio y Moneda Base */}
              <div>
                <Label htmlFor="price">Precio</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  {...form.register('price', { valueAsNumber: true })}
                  placeholder="0.00"
                />
                {form.formState.errors.price && (
                  <span className="text-sm text-red-500">
                    {form.formState.errors.price.message}
                  </span>
                )}
              </div>

              <div>
                <Label htmlFor="baseCurrency">Moneda Base</Label>
                <Select
                  value={form.watch('baseCurrency')}
                  onValueChange={(value: 'USD' | 'DOP') => form.setValue('baseCurrency', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD - Dólar</SelectItem>
                    <SelectItem value="DOP">DOP - Peso Dominicano</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Preview de conversión */}
              {watchedPrice && watchedBaseCurrency && (
                <div className="col-span-2 p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Vista previa en:</span>
                    <Select
                      value={previewCurrency}
                      onValueChange={(value: 'USD' | 'DOP') => setPreviewCurrency(value)}
                    >
                      <SelectTrigger className="w-32 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="DOP">DOP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-lg font-bold text-blue-600">
                    {formatCurrency(previewPrice, previewCurrency)}
                  </div>
                  {watchedBaseCurrency !== previewCurrency && (
                    <div className="text-xs text-gray-600 mt-1">
                      Tasa: 1 {watchedBaseCurrency} = {conversionRate.toFixed(4)} {previewCurrency}
                    </div>
                  )}
                </div>
              )}

              {/* Categoría */}
              <div>
                <Label htmlFor="category">Categoría</Label>
                <Select
                  value={form.watch('category')}
                  onValueChange={(value) => form.setValue('category', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product">Producto</SelectItem>
                    <SelectItem value="service">Servicio</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* SKU */}
              <div>
                <Label htmlFor="sku">SKU (Opcional)</Label>
                <Input
                  id="sku"
                  {...form.register('sku')}
                  placeholder="ABC-123"
                />
              </div>

              {/* Marca */}
              <div>
                <Label htmlFor="brand">Marca (Opcional)</Label>
                <Input
                  id="brand"
                  {...form.register('brand')}
                  placeholder="Ej: Samsung"
                />
              </div>

              {/* Descripción */}
              <div className="col-span-2">
                <Label htmlFor="description">Descripción</Label>
                <textarea
                  id="description"
                  {...form.register('description')}
                  rows={3}
                  className="w-full p-2 border rounded-md"
                  placeholder="Descripción del producto..."
                />
              </div>
            </div>

            {/* Botones */}
            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createProductMutation.isPending || updateProductMutation.isPending}
              >
                {editingProduct ? 'Actualizar' : 'Crear'} Producto
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}