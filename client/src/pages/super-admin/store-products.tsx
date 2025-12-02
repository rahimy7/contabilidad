import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Search, Package, Plus, Edit3, Trash2, Eye, DollarSign, Tag, Image, Star, Store } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  categoryId: number;
  isActive: boolean;
  images: string[];
  sku?: string;
  brand?: string;
  model?: string;
  weight?: string;
  dimensions?: string;
  categoryName?: string;
  storeId: number;
}

interface Category {
  id: number;
  name: string;
  description?: string;
  storeId: number;
}

interface Store {
  id: number;
  name: string;
  description?: string;
  address?: string;
}

export default function StoreProducts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [storeId, setStoreId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);

  // Get store ID from URL params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const storeParam = urlParams.get('store');
    if (storeParam) {
      setStoreId(parseInt(storeParam));
    }
  }, []);

  // Fetch all stores for selector
  const { data: storesData = {} } = useQuery({
    queryKey: [`/api/super-admin/stores`],
  });

  const stores = (storesData as any)?.stores || [];

  // Fetch store info
  const { data: store } = useQuery({
    queryKey: [`/api/super-admin/stores`, storeId],
    enabled: !!storeId,
    select: (data: any) => {
      const stores = data?.stores || [];
      return stores.find((s: any) => s.id === storeId);
    }
  });

  // Handle store selection
  const handleStoreChange = (selectedStoreId: string) => {
    const newStoreId = parseInt(selectedStoreId);
    setStoreId(newStoreId);
    // Update URL params
    const url = new URL(window.location.href);
    url.searchParams.set('store', selectedStoreId);
    window.history.pushState({}, '', url.toString());
  };

  // ✅ CORREGIDO: Fetch products for specific store from super-admin endpoint
  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: [`/api/super-admin/stores/${storeId}/products`],
    queryFn: () => apiRequest<Product[]>("GET", `/api/super-admin/stores/${storeId}/products`),
    enabled: !!storeId,
  });

  // ✅ CORREGIDO: Fetch categories for specific store from super-admin endpoint
  const { data: categories = [], isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: [`/api/super-admin/stores/${storeId}/categories`],
    queryFn: () => apiRequest<Category[]>("GET", `/api/super-admin/stores/${storeId}/categories`),
    enabled: !!storeId,
  });

  // ✅ CORREGIDO: Create product mutation with proper typing
  const createProductMutation = useMutation<any, Error, any>({
    mutationFn: (data: any) => apiRequest("POST", `/api/super-admin/stores/${storeId}/products`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/super-admin/stores/${storeId}/products`] });
      setShowCreateDialog(false);
      toast({
        title: "Producto creado",
        description: "El producto se ha creado exitosamente",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "No se pudo crear el producto",
        variant: "destructive",
      });
    },
  });

  // ✅ CORREGIDO: Update product mutation with proper typing
  const updateProductMutation = useMutation<any, Error, { id: number; data: any }>({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/super-admin/stores/${storeId}/products/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/super-admin/stores/${storeId}/products`] });
      setShowEditDialog(false);
      setSelectedProduct(null);
      toast({
        title: "Producto actualizado",
        description: "Los cambios se han guardado exitosamente",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "No se pudo actualizar el producto",
        variant: "destructive",
      });
    },
  });

  // ✅ CORREGIDO: Delete product mutation with proper typing
  const deleteProductMutation = useMutation<any, Error, number>({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/super-admin/stores/${storeId}/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/super-admin/stores/${storeId}/products`] });
      toast({
        title: "Producto eliminado",
        description: "El producto se ha eliminado exitosamente",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "No se pudo eliminar el producto",
        variant: "destructive",
      });
    },
  });

  // ✅ CORREGIDO: Filter products with proper array handling
  const filteredProducts = Array.isArray(products) ? products.filter((product: Product) => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || product.categoryId.toString() === selectedCategory;
    return matchesSearch && matchesCategory;
  }) : [];

  const handleCreateProduct = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      price: parseFloat(formData.get('price') as string),
      categoryId: parseInt(formData.get('categoryId') as string),
      sku: formData.get('sku') as string,
      brand: formData.get('brand') as string,
      model: formData.get('model') as string,
      isActive: formData.get('isActive') === 'on',
    };
    createProductMutation.mutate(data);
  };

  const handleEditProduct = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProduct) return;
    
    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      description: formData.get('description') as string,
      price: parseFloat(formData.get('price') as string),
      categoryId: parseInt(formData.get('categoryId') as string),
      sku: formData.get('sku') as string,
      brand: formData.get('brand') as string,
      model: formData.get('model') as string,
      isActive: formData.get('isActive') === 'on',
    };
    updateProductMutation.mutate({ id: selectedProduct.id, data });
  };

  if (!storeId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 mb-6">
          <Store className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold">Gestión de Productos</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Selecciona una Tienda</CardTitle>
            <CardDescription>
              Elige la tienda para administrar sus productos
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stores.length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No hay tiendas disponibles</p>
              </div>
            ) : (
              <div className="space-y-4">
                <Label htmlFor="store-select">Tienda</Label>
                <Select onValueChange={handleStoreChange}>
                  <SelectTrigger id="store-select" className="w-full">
                    <SelectValue placeholder="Selecciona una tienda..." />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((s: Store) => (
                      <SelectItem key={s.id} value={s.id.toString()}>
                        <div className="flex items-center gap-2">
                          <Store className="h-4 w-4" />
                          {s.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-500 mt-4">
                  Total de tiendas: {stores.length}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (productsLoading || categoriesLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h1 className="text-3xl font-bold">Productos de {store?.name}</h1>
            <p className="text-gray-600">
              Gestiona el catálogo de productos de la tienda
            </p>
          </div>
          <div className="w-48">
            <Label htmlFor="header-store-select" className="text-sm">Cambiar tienda</Label>
            <Select value={storeId.toString()} onValueChange={handleStoreChange}>
              <SelectTrigger id="header-store-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s: Store) => (
                  <SelectItem key={s.id} value={s.id.toString()}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end">
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Producto
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Crear Nuevo Producto</DialogTitle>
                <DialogDescription>
                  Agrega un nuevo producto al catálogo de la tienda
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateProduct} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nombre del Producto</Label>
                    <Input
                      id="name"
                      name="name"
                      placeholder="Nombre del producto"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="price">Precio</Label>
                    <Input
                      id="price"
                      name="price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descripción</Label>
                  <Textarea
                    id="description"
                    name="description"
                    placeholder="Descripción del producto"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="categoryId">Categoría</Label>
                    <Select name="categoryId" required>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona una categoría" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.isArray(categories) && categories.map((category: Category) => (
                          <SelectItem key={category.id} value={category.id.toString()}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sku">SKU</Label>
                    <Input
                      id="sku"
                      name="sku"
                      placeholder="Código SKU"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="brand">Marca</Label>
                    <Input
                      id="brand"
                      name="brand"
                      placeholder="Marca del producto"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="model">Modelo</Label>
                    <Input
                      id="model"
                      name="model"
                      placeholder="Modelo del producto"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch id="isActive" name="isActive" defaultChecked />
                  <Label htmlFor="isActive">Producto activo</Label>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateDialog(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={createProductMutation.isPending}
                  >
                    {createProductMutation.isPending ? "Creando..." : "Crear Producto"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Buscar productos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {Array.isArray(categories) && categories.map((category: Category) => (
              <SelectItem key={category.id} value={category.id.toString()}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Products Grid */}
      <div className="grid gap-6">
        {filteredProducts.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-600 mb-2">
                No se encontraron productos
              </h3>
              <p className="text-gray-500">
                {searchTerm || selectedCategory !== "all" 
                  ? "Intenta cambiar los filtros de búsqueda"
                  : "Crea tu primer producto para comenzar"
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredProducts.map((product: Product) => (
            <Card key={product.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-xl">{product.name}</CardTitle>
                      <Badge variant={product.isActive ? "default" : "secondary"}>
                        {product.isActive ? "Activo" : "Inactivo"}
                      </Badge>
                    </div>
                    {product.sku && (
                      <p className="text-sm text-gray-600">SKU: {product.sku}</p>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedProduct(product);
                        setShowEditDialog(true);
                      }}
                    >
                      <Edit3 className="h-4 w-4 mr-1" />
                      Editar
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm('¿Estás seguro de eliminar este producto?')) {
                          deleteProductMutation.mutate(product.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-gray-600">{product.description}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4" />
                        ${product.price.toFixed(2)}
                      </span>
                      {product.brand && (
                        <span className="flex items-center gap-1">
                          <Tag className="h-4 w-4" />
                          {product.brand}
                        </span>
                      )}
                      {product.categoryName && (
                        <Badge variant="outline">{product.categoryName}</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Edit Product Dialog */}
      {selectedProduct && (
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Editar Producto</DialogTitle>
              <DialogDescription>
                Modifica la información del producto
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleEditProduct} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Nombre del Producto</Label>
                  <Input
                    id="edit-name"
                    name="name"
                    defaultValue={selectedProduct.name}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-price">Precio</Label>
                  <Input
                    id="edit-price"
                    name="price"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={selectedProduct.price}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">Descripción</Label>
                <Textarea
                  id="edit-description"
                  name="description"
                  defaultValue={selectedProduct.description}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-categoryId">Categoría</Label>
                  <Select name="categoryId" defaultValue={selectedProduct.categoryId.toString()}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona una categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.isArray(categories) && categories.map((category: Category) => (
                        <SelectItem key={category.id} value={category.id.toString()}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-sku">SKU</Label>
                  <Input
                    id="edit-sku"
                    name="sku"
                    defaultValue={selectedProduct.sku}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-brand">Marca</Label>
                  <Input
                    id="edit-brand"
                    name="brand"
                    defaultValue={selectedProduct.brand}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-model">Modelo</Label>
                  <Input
                    id="edit-model"
                    name="model"
                    defaultValue={selectedProduct.model}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch 
                  id="edit-isActive" 
                  name="isActive" 
                  defaultChecked={selectedProduct.isActive} 
                />
                <Label htmlFor="edit-isActive">Producto activo</Label>
              </div>

              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowEditDialog(false);
                    setSelectedProduct(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateProductMutation.isPending}
                >
                  {updateProductMutation.isPending ? "Guardando..." : "Guardar Cambios"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}