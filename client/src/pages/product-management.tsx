// client/src/pages/product-management.tsx
// CAMBIOS MÍNIMOS: Solo agregar selector de moneda al precio

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Badge,
} from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  Search,
  Plus,
  Eye,
  Edit,
  Trash2,
  Package,
  Tag,
  X,
  Upload,
  Link as LinkIcon,
  ChevronLeft,
  ChevronRight,
  Globe,
  Check,
} from 'lucide-react';
import { useLocation } from 'wouter';




// Monedas soportadas
const SUPPORTED_CURRENCIES = [
  { code: 'DOP', name: 'Peso Dominicano', symbol: 'RD$' },
  { code: 'USD', name: 'Dólar Estadounidense', symbol: '$' },
];

// Esquemas de validación - ACTUALIZADO
const productSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  description: z.string().min(1, 'La descripción es requerida'),
  price: z.string().min(1, 'El precio es requerido'),
  currency: z.enum(['DOP', 'USD'], {
    errorMap: () => ({ message: 'Selecciona una moneda válida (DOP o USD)' })
  }),
  category: z.string().min(1, 'La categoría es requerida'),
  type: z.string().default('product'),
  brand: z.string().optional(),
  model: z.string().optional(),
  sku: z.string().optional(),
  isActive: z.boolean().default(true),
  stock: z.number().min(0).default(0),
  specifications: z.string().optional(),
  installationCost: z.string().optional(),
  warrantyMonths: z.number().min(0).default(0),
  images: z.array(z.string()).default([]),
  // 🎁 FIDELIZACIÓN - Campos opcionales para plan de puntos
  loyaltyPointsPropertyName: z.string().optional(), // 'LP', 'PUNTOS', 'REWARDS', etc.
  loyaltyPointsValue: z.string().optional(), // Valor numérico de puntos
});

type ProductFormData = z.infer<typeof productSchema>;

interface Product {
  id: number;
  name: string;
  description?: string;
  price?: string;
  currency?: string;        // Para compatibilidad con frontend
  baseCurrency?: string;    // ✅ AGREGADO: Campo del backend
  category?: string;
  type?: string;
  brand?: string;
  model?: string;
  sku?: string;
  isActive?: boolean;
  stock?: number;
  specifications?: string;
  installationCost?: string;
  warrantyMonths?: number;
  images?: string[];
  imageUrl?: string;
  // 🎁 FIDELIZACIÓN - Campos opcionales para plan de puntos
  loyaltyPointsPropertyName?: string;
  loyaltyPointsValue?: string;
}

interface Category {
  id: number;
  name: string;
  description?: string;
}

interface ImageData {
  id: string;
  url: string;
  file?: File;
  isUploaded: boolean;
  source: 'file' | 'url';
  name: string;
}

// Componente principal
export default function ImprovedProductManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | 'view'>('create');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [productImages, setProductImages] = useState<ImageData[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [, setLocation] = useLocation();

  // 🎁 FIDELIZACIÓN - Estados para edición inline de puntos de lealtad
  const [isEditingLoyalty, setIsEditingLoyalty] = useState(false);
  const [tempLoyaltyPropertyName, setTempLoyaltyPropertyName] = useState("");
  const [tempLoyaltyPointsValue, setTempLoyaltyPointsValue] = useState("");

  // Queries para obtener datos reales
  const { data: products = [], isLoading: loadingProducts, error: productsError } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: categories = [], isLoading: loadingCategories, error: categoriesError } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  // Mutations para crear/actualizar productos - ACTUALIZADO
  const createProductMutation = useMutation({
  mutationFn: async (data: ProductFormData) => {
    console.log('🔄 Creating product with data:', data);
    
    const formData = new FormData();
    
    // ✅ MAPEAR CORRECTAMENTE LOS CAMPOS DE MONEDA
    Object.entries(data).forEach(([key, value]) => {
      if (key === 'currency') {
        // Enviar como baseCurrency para el backend
        formData.append('baseCurrency', value as string);
        console.log('💱 Setting baseCurrency to:', value);
      } else if (value !== null && value !== undefined) {
        if (Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, value.toString());
        }
      }
    });

    // Agregar imágenes de archivos
    productImages.forEach((image, index) => {
      if (image.file) {
        formData.append(`files`, image.file);
      }
    });

    // Agregar URLs de imágenes externas
    const imageUrls = productImages
      .filter(img => !img.file && img.source === 'url')
      .map(img => img.url);
    
    if (imageUrls.length > 0) {
      formData.append('imageUrls', JSON.stringify(imageUrls));
    }

    console.log('📤 Sending FormData with baseCurrency');

    const response = await fetch('/api/products', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Create product error:', errorData);
      throw new Error(errorData.error || 'Error al crear producto');
    }

    const result = await response.json();
    console.log('✅ Product created successfully:', result);
    return result;
  },
  onSuccess: () => {
    toast({
      title: "Producto creado",
      description: "El producto se ha creado correctamente con la moneda especificada",
    });
    queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    closeDialog();
  },
  onError: (error: any) => {
    console.error('Create product mutation error:', error);
    toast({
      title: "Error",
      description: error.message || "Error al crear el producto",
      variant: "destructive",
    });
  }
});

const updateProductMutation = useMutation({
  mutationFn: async (data: ProductFormData & { id: number }) => {
    console.log('🔄 Updating product with data:', data);
    
    const formData = new FormData();
    
    // ✅ MAPEAR CORRECTAMENTE LOS CAMPOS DE MONEDA
    Object.entries(data).forEach(([key, value]) => {
      if (key === 'currency') {
        // Enviar como baseCurrency para el backend
        formData.append('baseCurrency', value as string);
        console.log('💱 Updating baseCurrency to:', value);
      } else if (key !== 'id' && value !== null && value !== undefined) {
        if (Array.isArray(value)) {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, value.toString());
        }
      }
    });

    // Agregar imágenes de archivos
    productImages.forEach((image, index) => {
      if (image.file) {
        formData.append(`files`, image.file);
      }
    });

    // Agregar URLs de imágenes externas
    const imageUrls = productImages
      .filter(img => !img.file && img.source === 'url')
      .map(img => img.url);
    
    if (imageUrls.length > 0) {
      formData.append('imageUrls', JSON.stringify(imageUrls));
    }

    console.log('📤 Sending FormData with baseCurrency for update');

    const response = await fetch(`/api/products/${data.id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ Update product error:', errorData);
      throw new Error(errorData.error || 'Error al actualizar producto');
    }

    const result = await response.json();
    console.log('✅ Product updated successfully:', result);
    return result;
  },
  onSuccess: () => {
    toast({
      title: "Producto actualizado",
      description: "El producto se ha actualizado correctamente con la nueva moneda",
    });
    queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    closeDialog();
  },
  onError: (error: any) => {
    console.error('Update product mutation error:', error);
    toast({
      title: "Error",
      description: error.message || "Error al actualizar el producto",
      variant: "destructive",
    });
  }
});

  // Mutation para eliminar producto
  const deleteProductMutation = useMutation({
   mutationFn: async (id: number) => {
    const response = await fetch(`/api/products/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Error al eliminar el producto');
    }

    return response.json();
  },
    onSuccess: () => {
      toast({
        title: "Producto eliminado",
        description: "El producto se ha eliminado correctamente",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Error al eliminar el producto",
        variant: "destructive",
      });
    }
  });

  // Formulario - ACTUALIZADO con currency
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      type: "product",
      isActive: true,
      stock: 0,
      warrantyMonths: 0,
      images: [],
      currency: "DOP", // Moneda por defecto
    },
  });
const validateCurrency = (currency: string | undefined): "DOP" | "USD" => {
  if (currency === "DOP" || currency === "USD") {
    return currency;
  }
  console.warn(`⚠️ Invalid currency detected: ${currency}, defaulting to DOP`);
  return "DOP";
};
  // Efectos - ACTUALIZADO
useEffect(() => {
  if (selectedProduct && (dialogMode === 'edit' || dialogMode === 'view')) {
    console.log('📋 Loading existing product data:', selectedProduct);

    reset({
      name: selectedProduct.name,
      description: selectedProduct.description || "",
      price: selectedProduct.price || "",
      // ✅ CORREGIR: Usar selectedProduct en lugar de productData
      currency: validateCurrency(selectedProduct.baseCurrency || selectedProduct.currency),
      category: selectedProduct.category || "",
      type: selectedProduct.type || "product",
      brand: selectedProduct.brand || "",
      model: selectedProduct.model || "",
      sku: selectedProduct.sku || "",
      isActive: selectedProduct.isActive ?? true,
      stock: selectedProduct.stock || 0,
      specifications: selectedProduct.specifications || "",
      installationCost: selectedProduct.installationCost || "",
      warrantyMonths: selectedProduct.warrantyMonths || 0,
      images: selectedProduct.images || [],
    });

    // 🎁 FIDELIZACIÓN - Cargar valores de lealtad
    setTempLoyaltyPropertyName(selectedProduct.loyaltyPointsPropertyName || "");
    setTempLoyaltyPointsValue(selectedProduct.loyaltyPointsValue || "");
    setIsEditingLoyalty(false);

    console.log('💱 Loaded currency:', selectedProduct.baseCurrency || selectedProduct.currency || "DOP");

    // Cargar imágenes existentes del producto
    if (selectedProduct.images && selectedProduct.images.length > 0) {
      loadExistingImages(selectedProduct.images);
    } else if (selectedProduct.imageUrl) {
      loadExistingImages([selectedProduct.imageUrl]);
    } else {
      setProductImages([]);
    }
  } else if (dialogMode === 'create') {
    console.log('📋 Resetting form for new product');
    reset({
      type: "product",
      isActive: true,
      stock: 0,
      warrantyMonths: 0,
      images: [],
      currency: "DOP", // ✅ VALOR POR DEFECTO DOP
    });
    setProductImages([]);
    setTempLoyaltyPropertyName("");
    setTempLoyaltyPointsValue("");
    setIsEditingLoyalty(false);
  }
}, [selectedProduct, dialogMode, reset]);

  // Funciones auxiliares (sin cambios)
  const loadExistingImages = (imageUrls: string[]) => {
    const existingImages: ImageData[] = imageUrls.map((url, index) => ({
      id: `existing-${index}-${Date.now()}`,
      url,
      isUploaded: true,
      source: 'url' as const,
      name: `imagen-${index + 1}`
    }));
    setProductImages(existingImages);
  };

  const openDialog = (mode: 'create' | 'edit' | 'view', product?: Product) => {
    if (mode === 'edit' && product) {
      window.location.href = `/add-product?mode=edit&id=${product.id}`;
      return;
    }

    if (mode === 'create') {
      window.location.href = `/add-product`;
      return;
    }
    
    setDialogMode(mode);
    setSelectedProduct(product || null);
    setIsDialogOpen(true);
    setCurrentImageIndex(0);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setSelectedProduct(null);
    setProductImages([]);
    reset();
  };

  const onSubmit = (data: ProductFormData) => {
    console.log('Enviando formulario:', data);
    console.log('Imágenes:', productImages);
    
    if (dialogMode === 'create') {
      createProductMutation.mutate(data);
    } else if (dialogMode === 'edit' && selectedProduct) {
      updateProductMutation.mutate({ ...data, id: selectedProduct.id });
    }
  };

  const handleDeleteProduct = (productId: number) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar este producto?')) {
      deleteProductMutation.mutate(productId);
    }
  };

  // 🎁 FIDELIZACIÓN - Función para guardar puntos de lealtad inline
  const handleSaveLoyaltyPoints = async () => {
    if (!selectedProduct) return;

    try {
      const response = await fetch(`/api/products/${selectedProduct.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          loyaltyPointsPropertyName: tempLoyaltyPropertyName || null,
          loyaltyPointsValue: tempLoyaltyPointsValue ? parseFloat(tempLoyaltyPointsValue) : null
        })
      });

      if (!response.ok) {
        throw new Error('Error al guardar puntos de lealtad');
      }

      const updatedProduct = await response.json();

      // Actualizar el producto seleccionado
      setSelectedProduct(updatedProduct);

      // Actualizar la lista de productos
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });

      // Salir del modo edición
      setIsEditingLoyalty(false);

      toast({
        title: "Puntos de lealtad actualizados",
        description: "Los puntos de lealtad se han guardado correctamente",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al guardar puntos",
        variant: "destructive",
      });
    }
  };

  // Gestión de imágenes (sin cambios)
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const id = `file-${Date.now()}-${Math.random()}`;
      const url = URL.createObjectURL(file);
      
      setProductImages((prev) => [
        ...prev,
        {
          id,
          url,
          file,
          isUploaded: false,
          source: 'file',
          name: file.name,
        },
      ]);
    });
  };

  const handleAddImageUrl = () => {
    const url = prompt("Ingresa la URL de la imagen:");
    if (url && url.trim()) {
      const id = `url-${Date.now()}-${Math.random()}`;
      setProductImages((prev) => [
        ...prev,
        {
          id,
          url: url.trim(),
          isUploaded: true,
          source: 'url',
          name: 'Imagen externa',
        },
      ]);
    }
  };

  const removeImage = (id: string) => {
    setProductImages((prev) => {
      const imageToRemove = prev.find(img => img.id === id);
      if (imageToRemove?.file && imageToRemove.url.startsWith('blob:')) {
        URL.revokeObjectURL(imageToRemove.url);
      }
      return prev.filter(img => img.id !== id);
    });
  };

  const nextImage = () => {
    if (productImages.length > 0) {
      setCurrentImageIndex((prev) => (prev + 1) % productImages.length);
    }
  };

  const prevImage = () => {
    if (productImages.length > 0) {
      setCurrentImageIndex((prev) => (prev - 1 + productImages.length) % productImages.length);
    }
  };

  // Filtrado (sin cambios)
  const filteredProducts = products.filter((product) => {
    const matchesSearch = 
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.description || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.sku || "").toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = filterCategory === "all" || product.category === filterCategory;
    const isActive = product.isActive !== false;
    
    return matchesSearch && matchesCategory && isActive;
  });

  // Función de formateo de moneda - ACTUALIZADA
const formatCurrency = (price: string | number, currency: string = 'DOP') => {
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  
  if (isNaN(numPrice)) return 'N/A';

  // Usar la configuración correcta para cada moneda
  const currencyConfig = SUPPORTED_CURRENCIES.find(c => c.code === currency);
  
  if (!currencyConfig) {
    return `${numPrice.toFixed(2)} ${currency}`;
  }

  // Formatear según la moneda
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(numPrice);
  } else if (currency === 'DOP') {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(numPrice);
  }

  return `${currencyConfig.symbol}${numPrice.toFixed(2)}`;
};

  // Funciones de imagen (sin cambios)
  const getProductMainImage = (product: Product) => {
    if (product.images && product.images.length > 0) {
      return product.images[0];
    }
    if (product.imageUrl) {
      return product.imageUrl;
    }
    return null;
  };

  const getProductImages = (product: Product) => {
    const images = [];
    
    if (product.images && product.images.length > 0) {
      images.push(...product.images);
    }
    
    if (product.imageUrl && !images.includes(product.imageUrl)) {
      images.push(product.imageUrl);
    }
    
    return images;
  };

  if (loadingProducts || loadingCategories) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (productsError || categoriesError) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="text-center py-12">
            <Package className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Error al cargar datos
            </h3>
            <p className="text-gray-600 mb-4">
              {productsError?.message || categoriesError?.message || 'Hubo un problema al cargar los productos'}
            </p>
            <Button onClick={() => window.location.reload()}>
              Reintentar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isReadOnly = dialogMode === 'view';

  return (
    <div className="container mx-auto p-6">
   {/* Header */}
<div className="flex justify-between items-center mb-6">
  <div>
    <h1 className="text-3xl font-bold text-gray-900">Gestión de Productos</h1>
    <p className="text-gray-600 mt-1">
      Administra tu catálogo de productos y servicios
    </p>
  </div>
  <div className="flex gap-2">
    <Button
      onClick={() => setViewMode(viewMode === 'grid' ? 'table' : 'grid')}
      variant="outline"
    >
      {viewMode === 'grid' ? 'Vista Tabla' : 'Vista Tarjetas'}
    </Button>
    <Button
      onClick={() => openDialog('create')}
      className="flex items-center gap-2"
    >
      <Plus className="w-4 h-4" />
      Nuevo Producto
    </Button>

    {/* 🚀 Nuevos botones de navegación */}
    <Button
      variant="secondary"
      onClick={() => setLocation('/admin/brands')}
      className="flex items-center gap-2"
    >
      <Tag className="w-4 h-4" />
      Gestión Marcas
    </Button>
    <Button
      variant="secondary"
      onClick={() => setLocation('/admin/categories-brands')}
      className="flex items-center gap-2"
    >
      <Tag className="w-4 h-4" />
      Gestión Categorías
    </Button>
  </div>
</div>


      {/* Búsqueda y filtros */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Buscar productos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.name}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista de productos */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProducts.map((product) => (
            <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              <CardHeader className="pb-4">
                {/* Imagen del producto */}
                <div className="w-full h-48 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg flex items-center justify-center relative overflow-hidden group">
                  {getProductMainImage(product) ? (
                    <img
                      src={getProductMainImage(product)}
                      alt={product.name}
                      className="w-full h-full object-cover rounded-lg"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                  ) : (
                    <Package className="w-16 h-16 text-gray-400" />
                  )}
                  
                  <div className="hidden absolute inset-0 items-center justify-center">
                    <Package className="w-16 h-16 text-gray-400" />
                  </div>
                  
                  {getProductImages(product).length > 1 && (
                    <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
                      +{getProductImages(product).length - 1} más
                    </div>
                  )}

                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openDialog('view', product)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openDialog('edit', product)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteProduct(product.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <CardTitle className="text-lg line-clamp-2 mt-3">{product.name}</CardTitle>
                <CardDescription className="text-sm text-gray-600 line-clamp-2">
                  {product.description}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="pt-0">
                <div className="flex items-center justify-between mb-3">
                <div className="text-sm text-gray-500">
  {formatCurrency(product.price || 0, product.baseCurrency || product.currency || 'DOP')}
</div>
                  <Badge variant="secondary" className="text-xs">
                    {product.category}
                  </Badge>
                </div>

                {/* 🎁 FIDELIZACIÓN - Mostrar puntos de lealtad si existen */}
                {product.loyaltyPointsPropertyName && product.loyaltyPointsValue && (
                  <div className="mb-3 p-2 bg-amber-50 rounded border border-amber-200">
                    <span className="text-xs text-amber-700 font-medium">
                      {product.loyaltyPointsValue} {product.loyaltyPointsPropertyName}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    Stock: {product.stock || 0}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openDialog('view', product)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openDialog('edit', product)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteProduct(product.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        // Vista de tabla
        <Card>
          <CardHeader>
            <CardTitle>Productos ({filteredProducts.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredProducts.map((product) => (
                <div key={product.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                      {getProductMainImage(product) ? (
                        <img
                          src={getProductMainImage(product)}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                      ) : (
                        <Package className="w-8 h-8 text-gray-400" />
                      )}
                      <div className="hidden">
                        <Package className="w-8 h-8 text-gray-400" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">{product.name}</h3>
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{product.description}</p>
                      <div className="flex items-center space-x-2 mt-2 flex-wrap">
                        <Badge variant={product.type === "service" ? "secondary" : "default"}>
                          {product.type === "service" ? "Servicio" : "Producto"}
                        </Badge>
                        <Badge variant="outline">{product.category}</Badge>
                        <span className="text-sm font-medium text-green-600">
                         {formatCurrency(product.price || "0", product.baseCurrency || product.currency || 'DOP')}
                        </span>
                        {/* 🎁 FIDELIZACIÓN - Mostrar puntos de lealtad si existen */}
                        {product.loyaltyPointsPropertyName && product.loyaltyPointsValue && (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200">
                            {product.loyaltyPointsValue} {product.loyaltyPointsPropertyName}
                          </Badge>
                        )}
                        {getProductImages(product).length > 1 && (
                          <Badge variant="outline" className="text-xs">
                            {getProductImages(product).length} imágenes
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openDialog('view', product)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openDialog('edit', product)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteProduct(product.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog solo para modo view - ACTUALIZADO con campo moneda */}
      <Dialog open={isDialogOpen && dialogMode === 'view'} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Detalles del Producto</DialogTitle>
            <DialogDescription>
              Información detallada del producto
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Columna izquierda: Información básica */}
              <div className="space-y-4">
                <div>
                  <Label>Nombre del Producto</Label>
                  <Input
                    value={selectedProduct?.name || ''}
                    disabled
                    className="bg-gray-50"
                  />
                </div>

                <div>
                  <Label>Descripción</Label>
                  <Textarea
                    value={selectedProduct?.description || ''}
                    disabled
                    className="bg-gray-50"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
  <div className="col-span-2">
    <Label>Precio</Label>
    <Input
      value={formatCurrency(selectedProduct?.price || "0", selectedProduct?.baseCurrency || selectedProduct?.currency || 'DOP')}
      disabled
      className="bg-gray-50"
    />
  </div>
  <div>
    <Label>Moneda</Label>
    <div className="bg-gray-50 border rounded-md px-3 py-2 text-sm flex items-center gap-2">
      <Globe className="w-4 h-4" />
      <div className="flex flex-col">
        <span className="font-medium">
          {SUPPORTED_CURRENCIES.find(c => c.code === (selectedProduct?.baseCurrency || selectedProduct?.currency))?.name || 'Peso Dominicano'}
        </span>
        <span className="text-xs text-gray-500">
          {SUPPORTED_CURRENCIES.find(c => c.code === (selectedProduct?.baseCurrency || selectedProduct?.currency))?.symbol || 'RD$'} ({selectedProduct?.baseCurrency || selectedProduct?.currency || 'DOP'})
        </span>
      </div>
    </div>
  </div>
</div>

                <div>
                  <Label>Costo Instalación</Label>
                  <Input
                    value={selectedProduct?.installationCost ? formatCurrency(selectedProduct.installationCost, selectedProduct?.baseCurrency || selectedProduct?.currency || 'DOP') : 'No especificado'}
                    className="bg-gray-50"
                  />
                </div>

                <div>
                  <Label>Categoría</Label>
                  <Input
                    value={selectedProduct?.category || ''}
                    disabled
                    className="bg-gray-50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Marca</Label>
                    <Input
                      value={selectedProduct?.brand || 'No especificada'}
                      disabled
                      className="bg-gray-50"
                    />
                  </div>
                  <div>
                    <Label>SKU</Label>
                    <Input
                      value={selectedProduct?.sku || 'No especificado'}
                      disabled
                      className="bg-gray-50 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Stock</Label>
                    <Input
                      value={selectedProduct?.stock?.toString() || '0'}
                      disabled
                      className="bg-gray-50"
                    />
                  </div>
                  <div>
                    <Label>Garantía (meses)</Label>
                    <Input
                      value={selectedProduct?.warrantyMonths?.toString() || '0'}
                      disabled
                      className="bg-gray-50"
                    />
                  </div>
                </div>

                {selectedProduct?.specifications && (
                  <div>
                    <Label>Especificaciones</Label>
                    <Textarea
                      value={selectedProduct.specifications}
                      disabled
                      className="bg-gray-50"
                      rows={3}
                    />
                  </div>
                )}
              </div>

              {/* Columna derecha: Imágenes e información adicional */}
              <div className="space-y-4">
                <div>
                  <Label>Imágenes del Producto</Label>
                  
                  {getProductImages(selectedProduct || {} as Product).length > 0 ? (
                    <div className="space-y-4">
                      {/* Imagen principal */}
                      <div className="relative w-full h-64 bg-gray-100 rounded-lg overflow-hidden">
                        <img
                          src={getProductImages(selectedProduct || {} as Product)[currentImageIndex]}
                          alt={`Imagen ${currentImageIndex + 1}`}
                          className="w-full h-full object-cover"
                        />
                        
                        {/* Controles de navegación */}
                        {getProductImages(selectedProduct || {} as Product).length > 1 && (
                          <>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="absolute left-2 top-1/2 transform -translate-y-1/2"
                              onClick={prevImage}
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="absolute right-2 top-1/2 transform -translate-y-1/2"
                              onClick={nextImage}
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </>
                        )}

                        {/* Indicador de posición */}
                        {getProductImages(selectedProduct || {} as Product).length > 1 && (
                          <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
                            {currentImageIndex + 1} / {getProductImages(selectedProduct || {} as Product).length}
                          </div>
                        )}
                      </div>

                      {/* Miniaturas */}
                      {getProductImages(selectedProduct || {} as Product).length > 1 && (
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {getProductImages(selectedProduct || {} as Product).map((image, index) => (
                            <button
                              key={index}
                              type="button"
                              className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 ${
                                index === currentImageIndex ? 'border-blue-500' : 'border-gray-200'
                              }`}
                              onClick={() => setCurrentImageIndex(index)}
                            >
                              <img
                                src={image}
                                alt={`Miniatura ${index + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-full h-64 bg-gray-100 rounded-lg flex items-center justify-center">
                      <div className="text-center">
                        <Package className="w-16 h-16 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-500">Sin imágenes</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Información adicional */}
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-2">Información del Producto</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Tipo:</span>
                        <Badge variant="outline" className="ml-2">
                          {selectedProduct?.type === "service" ? "Servicio" : "Producto"}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-gray-600">Estado:</span>
                        <Badge variant={selectedProduct?.isActive ? "default" : "secondary"} className="ml-2">
                          {selectedProduct?.isActive ? "Activo" : "Inactivo"}
                        </Badge>
                      </div>
                      {selectedProduct?.brand && (
                        <div>
                          <span className="text-gray-600">Marca:</span>
                          <span className="ml-2 font-medium">{selectedProduct.brand}</span>
                        </div>
                      )}
                      {selectedProduct?.model && (
                        <div>
                          <span className="text-gray-600">Modelo:</span>
                          <span className="ml-2 font-medium">{selectedProduct.model}</span>
                        </div>
                      )}
                      {selectedProduct?.sku && (
                        <div>
                          <span className="text-gray-600">SKU:</span>
                          <span className="ml-2 font-mono text-xs bg-gray-200 px-2 py-1 rounded">
                            {selectedProduct.sku}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-gray-600">Stock:</span>
                        <span className="ml-2 font-medium">{selectedProduct?.stock || 0}</span>
                      </div>
                      {selectedProduct?.warrantyMonths && selectedProduct.warrantyMonths > 0 && (
                        <div>
                          <span className="text-gray-600">Garantía:</span>
                          <span className="ml-2 font-medium">{selectedProduct.warrantyMonths} meses</span>
                        </div>
                      )}
                      {selectedProduct?.installationCost && (
                        <div>
                          <span className="text-gray-600">Costo instalación:</span>
                          <span className="ml-2 font-medium text-green-600">
                            {formatCurrency(selectedProduct.installationCost, selectedProduct?.baseCurrency || selectedProduct?.currency || 'DOP')}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-gray-600">Puntos de Lealtad:</span>
                        {!isEditingLoyalty ? (
                          <div className="flex items-center justify-between mt-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                            <span className="font-medium text-amber-600">
                              {selectedProduct?.loyaltyPointsPropertyName && selectedProduct?.loyaltyPointsValue
                                ? `${selectedProduct.loyaltyPointsValue} ${selectedProduct.loyaltyPointsPropertyName}`
                                : 'No configurado'}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setIsEditingLoyalty(true)}
                            >
                              <Edit className="w-3 h-3 mr-1" />
                              Editar
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-3 mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                            <div>
                              <Label htmlFor="loyaltyName" className="text-xs">Nombre de Propiedad</Label>
                              <Input
                                id="loyaltyName"
                                placeholder="Ej: LP, PUNTOS, REWARDS"
                                value={tempLoyaltyPropertyName}
                                onChange={(e) => setTempLoyaltyPropertyName(e.target.value)}
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label htmlFor="loyaltyValue" className="text-xs">Valor de Puntos</Label>
                              <Input
                                id="loyaltyValue"
                                placeholder="0.00"
                                type="number"
                                step="0.01"
                                value={tempLoyaltyPointsValue}
                                onChange={(e) => setTempLoyaltyPointsValue(e.target.value)}
                                className="mt-1"
                              />
                            </div>
                            <div className="flex gap-2 justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setIsEditingLoyalty(false);
                                  setTempLoyaltyPropertyName(selectedProduct?.loyaltyPointsPropertyName || "");
                                  setTempLoyaltyPointsValue(selectedProduct?.loyaltyPointsValue || "");
                                }}
                              >
                                Cancelar
                              </Button>
                              <Button
                                size="sm"
                                className="bg-amber-600 hover:bg-amber-700"
                                onClick={handleSaveLoyaltyPoints}
                              >
                                <Check className="w-3 h-3 mr-1" />
                                Guardar
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {selectedProduct?.specifications && (
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <h4 className="font-medium text-blue-900 mb-2">Especificaciones Técnicas</h4>
                      <p className="text-sm text-blue-800 whitespace-pre-line">
                        {selectedProduct.specifications}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer del dialog */}
          <DialogFooter className="flex gap-2">
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cerrar
            </Button>
            
            {selectedProduct && (
              <Button
                type="button"
                onClick={() => {
                  closeDialog();
                  openDialog('edit', selectedProduct);
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Edit className="w-4 h-4 mr-2" />
                Editar Producto
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Estado vacío */}
      {filteredProducts.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No se encontraron productos
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm || filterCategory !== "all"
                ? "Intenta ajustar tus filtros de búsqueda"
                : "Comienza agregando tu primer producto al catálogo"}
            </p>
            {(!searchTerm && filterCategory === "all") && (
              <Button onClick={() => openDialog('create')}>
                <Plus className="w-4 h-4 mr-2" />
                Crear Primer Producto
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
