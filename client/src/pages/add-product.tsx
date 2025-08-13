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
  ArrowLeft,
  Save,
  Plus,
  Upload,
  Link as LinkIcon,
  X,
  ChevronLeft,
  ChevronRight,
  Package,
  Wand2,
  AlertCircle,
  Check,
  Loader2,
} from 'lucide-react';

// Schema de validación
const productSchema = z.object({
  name: z.string().min(1, "El nombre del producto es requerido"),
  description: z.string().min(1, "La descripción es requerida"),
  price: z.string().min(1, "El precio es requerido"),
  category: z.string().min(1, "La categoría es requerida"),
  type: z.string().default("product"),
  brand: z.string().optional(),
  model: z.string().optional(),
  sku: z.string().optional(),
  isActive: z.boolean().default(true),
  stock: z.number().min(0, "El stock no puede ser negativo").default(0),
  specifications: z.string().optional(),
  installationCost: z.string().optional(),
  warrantyMonths: z.number().min(0).default(0),
  images: z.array(z.string()).default([]),
  features: z.string().optional(),
  warranty: z.string().optional(),
  availability: z.string().default("in_stock"),
  stockQuantity: z.number().min(0).default(0),
  minQuantity: z.number().min(1).default(1),
  maxQuantity: z.number().optional(),
  weight: z.string().optional(),
  dimensions: z.string().optional(),
  tags: z.string().optional(),
  salePrice: z.string().optional(),
  isPromoted: z.boolean().default(false),
  promotionText: z.string().optional(),
});

type ProductFormData = z.infer<typeof productSchema>;

interface ImageData {
  id: string;
  url: string;
  file?: File;
  isUploaded: boolean;
  source: 'file' | 'url';
  name: string;
  uploadStatus?: 'pending' | 'uploading' | 'success' | 'error';
  uploadProgress?: number;
}

interface Category {
  id: number;
  name: string;
  description?: string;
}

interface Product {
  id: number;
  name: string;
  description?: string;
  price?: string;
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
  features?: string;
  warranty?: string;
  availability?: string;
  stockQuantity?: number;
  minQuantity?: number;
  maxQuantity?: number;
  weight?: string;
  dimensions?: string;
  tags?: string;
  salePrice?: string;
  isPromoted?: boolean;
  promotionText?: string;
}

const mockBrands = ["Hikvision", "Dahua", "DSC", "Honeywell", "Bosch", "Axis", "Pelco"];

export default function EnhancedAddProduct() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Estados para determinar el modo (crear/editar)
  const [isEditMode, setIsEditMode] = useState(false);
  const [productId, setProductId] = useState<number | null>(null);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  
  // Estados para gestión de imágenes
  const [productImages, setProductImages] = useState<ImageData[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  
  // Estados para manejo de marcas
  const [existingBrands, setExistingBrands] = useState<string[]>(mockBrands);
  const [brandInput, setBrandInput] = useState("");
  const [showBrandInput, setShowBrandInput] = useState(false);

  // Detectar modo desde URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    const id = urlParams.get('id');
    
    console.log('🔍 Detectando modo desde URL:', { mode, id });
    
    if (mode === 'edit' && id) {
      setIsEditMode(true);
      setProductId(parseInt(id));
      console.log('✏️ Modo edición activado para producto ID:', parseInt(id));
    } else {
      console.log('➕ Modo creación activado');
    }
  }, []);

  // Queries para obtener datos reales
  const { data: categories = [], isLoading: loadingCategories } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: productData, isLoading: loadingProductData } = useQuery<Product>({
    queryKey: ["/api/products", productId],
    enabled: isEditMode && !!productId,
  });

  // Configurar formulario
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
      availability: "in_stock",
      stockQuantity: 0,
      minQuantity: 1,
      isPromoted: false,
      images: [],
    },
  });

  // Cargar datos del producto en modo edición
  useEffect(() => {
    if (isEditMode && productData) {
      console.log('🔄 Cargando producto para edición:', productData);
      
      reset({
        name: productData.name,
        description: productData.description || "",
        price: productData.price || "",
        category: productData.category || "",
        type: productData.type || "product",
        brand: productData.brand || "",
        model: productData.model || "",
        sku: productData.sku || "",
        isActive: productData.isActive ?? true,
        stock: productData.stock || 0,
        specifications: productData.specifications || "",
        installationCost: productData.installationCost || "",
        warrantyMonths: productData.warrantyMonths || 0,
        images: productData.images || [],
      });

      // Cargar imágenes existentes
      const imagesToLoad = [];
      if (productData.images && productData.images.length > 0) {
        imagesToLoad.push(...productData.images);
      }
      if (productData.imageUrl && !imagesToLoad.includes(productData.imageUrl)) {
        imagesToLoad.push(productData.imageUrl);
      }
      
      if (imagesToLoad.length > 0) {
        loadExistingImages(imagesToLoad);
      }
    }
  }, [isEditMode, productData, reset]);

  // Funciones para gestión de imágenes
  const loadExistingImages = (imageUrls: string[]) => {
    console.log('📸 Cargando imágenes existentes:', imageUrls);
    
    const existingImages: ImageData[] = imageUrls.map((url, index) => ({
      id: `existing-${index}-${Date.now()}-${Math.random()}`,
      url,
      isUploaded: true,
      source: 'url' as const,
      name: `imagen-${index + 1}`,
      uploadStatus: 'success'
    }));
    
    setProductImages(existingImages);
    setCurrentImageIndex(0);
  };

  // ✅ FUNCIÓN MEJORADA: Upload de archivo a Supabase
  const uploadFileToSupabase = async (file: File): Promise<string> => {
    try {
      console.log('🔄 Subiendo archivo a Supabase:', file.name);
      
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('No hay token de autenticación disponible');
      }
      
      const formData = new FormData();
      formData.append('image', file);
      
      const response = await fetch('/api/upload-image', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al subir imagen');
      }

      const data = await response.json();
      console.log('✅ Archivo subido exitosamente:', data.imageUrl);
      
      return data.imageUrl;
    } catch (error) {
      console.error('❌ Error subiendo archivo:', error);
      throw error;
    }
  };

  // ✅ FUNCIÓN MEJORADA: Procesar URL de imagen
  const processImageUrl = async (imageUrl: string): Promise<string> => {
    try {
      console.log('🔄 Procesando URL de imagen:', imageUrl);
      
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('No hay token de autenticación disponible');
      }
      
      const response = await fetch('/api/process-image-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ imageUrl }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al procesar URL');
      }

      const data = await response.json();
      console.log('✅ URL procesada exitosamente:', data.imageUrl);
      
      return data.imageUrl;
    } catch (error) {
      console.error('❌ Error procesando URL:', error);
      throw error;
    }
  };

  // ✅ FUNCIÓN MEJORADA: Manejar upload de archivos con progreso
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    setIsProcessingImages(true);

    for (const file of Array.from(files)) {
      // Validaciones
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Archivo inválido",
          description: `${file.name} no es una imagen válida`,
          variant: "destructive",
        });
        continue;
      }

      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Archivo muy grande",
          description: `${file.name} excede el límite de 5MB`,
          variant: "destructive",
        });
        continue;
      }

      const id = `file-${Date.now()}-${Math.random()}`;
      const tempUrl = URL.createObjectURL(file);
      
      // Agregar imagen con estado inicial
      const newImage: ImageData = {
        id,
        url: tempUrl,
        file,
        isUploaded: false,
        source: 'file',
        name: file.name,
        uploadStatus: 'uploading',
        uploadProgress: 0,
      };

      setProductImages(prev => [...prev, newImage]);

      try {
        // Subir archivo a Supabase
        const uploadedUrl = await uploadFileToSupabase(file);
        
        // Actualizar imagen con URL real
        setProductImages(prev => prev.map(img => 
          img.id === id 
            ? { 
                ...img, 
                url: uploadedUrl, 
                isUploaded: true, 
                uploadStatus: 'success',
                uploadProgress: 100
              }
            : img
        ));

        // Liberar blob temporal
        URL.revokeObjectURL(tempUrl);

        toast({
          title: "Imagen subida",
          description: `${file.name} se ha subido correctamente`,
        });

      } catch (error) {
        // Marcar como error
        setProductImages(prev => prev.map(img => 
          img.id === id 
            ? { ...img, uploadStatus: 'error' }
            : img
        ));

        toast({
          title: "Error al subir imagen",
          description: `No se pudo subir ${file.name}: ${error.message}`,
          variant: "destructive",
        });
      }
    }

    setIsProcessingImages(false);
    // Resetear input
    event.target.value = '';
  };

  // ✅ FUNCIÓN MEJORADA: Agregar imagen por URL
  const handleAddImageUrl = async () => {
    const url = prompt("Ingresa la URL de la imagen:");
    if (!url || !url.trim()) return;

    try {
      // Validar URL
      new URL(url.trim());
    } catch {
      toast({
        title: "URL inválida",
        description: "Por favor ingresa una URL válida",
        variant: "destructive",
      });
      return;
    }

    setIsProcessingImages(true);

    const id = `url-${Date.now()}-${Math.random()}`;
    
    // Agregar imagen con estado inicial
    const newImage: ImageData = {
      id,
      url: url.trim(),
      isUploaded: false,
      source: 'url',
      name: 'Imagen externa',
      uploadStatus: 'uploading',
    };

    setProductImages(prev => [...prev, newImage]);

    try {
      // Procesar URL a través del backend
      const processedUrl = await processImageUrl(url.trim());
      
      // Actualizar imagen con URL procesada
      setProductImages(prev => prev.map(img => 
        img.id === id 
          ? { 
              ...img, 
              url: processedUrl, 
              isUploaded: true, 
              uploadStatus: 'success'
            }
          : img
      ));

      toast({
        title: "Imagen agregada",
        description: "La imagen se ha procesado y agregado correctamente",
      });

    } catch (error) {
      // Marcar como error
      setProductImages(prev => prev.map(img => 
        img.id === id 
          ? { ...img, uploadStatus: 'error' }
          : img
      ));

      toast({
        title: "Error al procesar imagen",
        description: `No se pudo procesar la URL: ${error.message}`,
        variant: "destructive",
      });
    }

    setIsProcessingImages(false);
  };

  const removeImage = (id: string) => {
    console.log('🗑️ Removiendo imagen con ID:', id);
    
    setProductImages((prev) => {
      const imageToRemove = prev.find(img => img.id === id);
      if (imageToRemove?.file && imageToRemove.url.startsWith('blob:')) {
        URL.revokeObjectURL(imageToRemove.url);
      }
      const newImages = prev.filter(img => img.id !== id);
      return newImages;
    });
    
    // Ajustar el índice actual si es necesario
    setCurrentImageIndex((prevIndex) => {
      const newLength = productImages.length - 1;
      if (newLength === 0) return 0;
      if (prevIndex >= newLength) return newLength - 1;
      return prevIndex;
    });
  };

  const nextImage = () => {
    if (productImages.length > 0) {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % productImages.length);
    }
  };

  const prevImage = () => {
    if (productImages.length > 0) {
      setCurrentImageIndex((prevIndex) => 
        (prevIndex - 1 + productImages.length) % productImages.length
      );
    }
  };

  // Función para generar SKU automático
  const generateSKU = () => {
    const formValues = watch();
    const category = formValues.category;
    const name = formValues.name;
    const brand = formValues.brand || brandInput;
    
    if (!category || !name) {
      toast({
        title: "Campos requeridos",
        description: "Necesitas completar al menos el nombre y la categoría para generar un SKU",
        variant: "destructive",
      });
      return;
    }
    
    const categoryCode = category.substring(0, 3).toUpperCase();
    const brandCode = brand ? brand.substring(0, 3).toUpperCase() : "GEN";
    const nameCode = name.substring(0, 3).toUpperCase();
    const randomCode = Math.random().toString(36).substring(2, 5).toUpperCase();
    
    const newSKU = `${categoryCode}-${brandCode}-${nameCode}-${randomCode}`;
    setValue("sku", newSKU);
    
    toast({
      title: "SKU generado",
      description: `Nuevo SKU: ${newSKU}`,
    });
  };

  // Función para manejar selección/creación de marca
  const handleBrandSelection = (value: string) => {
    if (value === "new_brand") {
      setShowBrandInput(true);
      setBrandInput("");
      setValue("brand", "");
    } else {
      setShowBrandInput(false);
      setBrandInput("");
      setValue("brand", value);
    }
  };

  // Función para agregar nueva marca
  const handleAddNewBrand = () => {
    if (brandInput.trim()) {
      const newBrand = brandInput.trim();
      setExistingBrands((prev) => [...prev, newBrand].sort());
      setValue("brand", newBrand);
      setShowBrandInput(false);
      setBrandInput("");
      toast({
        title: "Marca agregada",
        description: `La marca "${newBrand}" ha sido agregada a la lista`,
      });
    }
  };

  // ✅ MUTATIONS MEJORADAS con integración real
  const createProductMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      console.log('🔄 Creando producto:', data);
      
      // Esperar a que todas las imágenes se suban
      const pendingUploads = productImages.filter(img => img.uploadStatus === 'uploading');
      if (pendingUploads.length > 0) {
        throw new Error('Espera a que terminen de subirse todas las imágenes');
      }

      // Obtener URLs de imágenes exitosas
      const uploadedImages = productImages
        .filter(img => img.uploadStatus === 'success')
        .map(img => img.url);

      const productData = {
        ...data,
        images: uploadedImages,
      };

      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('No hay token de autenticación disponible');
      }

      const response = await fetch('/api/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(productData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al crear producto');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Producto creado",
        description: "El producto se ha creado correctamente",
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      window.location.href = '/product-management';
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Error al crear el producto",
        variant: "destructive",
      });
    }
  });

  const updateProductMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      console.log('🔄 Actualizando producto:', productId, data);
      
      // Esperar a que todas las imágenes se suban
      const pendingUploads = productImages.filter(img => img.uploadStatus === 'uploading');
      if (pendingUploads.length > 0) {
        throw new Error('Espera a que terminen de subirse todas las imágenes');
      }

      // Obtener URLs de imágenes exitosas
      const uploadedImages = productImages
        .filter(img => img.uploadStatus === 'success')
        .map(img => img.url);

      const productData = {
        ...data,
        images: uploadedImages,
      };

      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('No hay token de autenticación disponible');
      }

      const response = await fetch(`/api/products/${productId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(productData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al actualizar producto');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Producto actualizado",
        description: "El producto se ha actualizado correctamente",
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      window.location.href = '/product-management';
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Error al actualizar el producto",
        variant: "destructive",
      });
    }
  });

  // Función de envío del formulario
  const onSubmit = (data: ProductFormData) => {
    console.log('📋 Enviando formulario:', data);
    
    if (isEditMode) {
      updateProductMutation.mutate(data);
    } else {
      createProductMutation.mutate(data);
    }
  };

  // Estados de carga
  if (loadingCategories || (isEditMode && loadingProductData)) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-600">
              {loadingCategories ? 'Cargando categorías...' : 'Cargando datos del producto...'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Verificar si hay imágenes pendientes o fallidas
  const hasUploadingImages = productImages.some(img => img.uploadStatus === 'uploading');
  const hasFailedImages = productImages.some(img => img.uploadStatus === 'error');

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.href = '/product-management'}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {isEditMode ? 'Editar Producto' : 'Agregar Nuevo Producto'}
            </h1>
            <p className="text-gray-600 mt-1">
              {isEditMode 
                ? 'Modifica la información del producto existente' 
                : 'Completa la información para crear un nuevo producto'}
            </p>
          </div>
        </div>
        
        {isEditMode && (
          <Badge variant="outline" className="text-blue-600 border-blue-600">
            Modo Edición
          </Badge>
        )}
      </div>

      {/* Alerta para imágenes pendientes o fallidas */}
      {(hasUploadingImages || hasFailedImages) && (
        <div className="mb-6">
          {hasUploadingImages && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span className="text-blue-800 font-medium">
                  Subiendo imágenes... Por favor espera antes de guardar.
                </span>
              </div>
            </div>
          )}
          
          {hasFailedImages && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="text-red-800 font-medium">
                  Algunas imágenes fallaron al subirse. Elimina las imágenes con error y vuelve a intentarlo.
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Columna principal: Información básica */}
          <div className="lg:col-span-2 space-y-6">
            {/* Información básica */}
            <Card>
              <CardHeader>
                <CardTitle>Información Básica</CardTitle>
                <CardDescription>
                  Datos principales del producto o servicio
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label htmlFor="name">Nombre del Producto *</Label>
                    <Input
                      id="name"
                      {...register("name")}
                      placeholder="Ej: Cámara de Seguridad IP 4K"
                    />
                    {errors.name && (
                      <p className="text-sm text-red-600 mt-1">{errors.name.message}</p>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="description">Descripción *</Label>
                    <Textarea
                      id="description"
                      {...register("description")}
                      placeholder="Describe las características principales del producto..."
                      rows={3}
                    />
                    {errors.description && (
                      <p className="text-sm text-red-600 mt-1">{errors.description.message}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="category">Categoría *</Label>
                    <Select
                      value={watch("category")}
                      onValueChange={(value) => setValue("category", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar categoría" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.name}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.category && (
                      <p className="text-sm text-red-600 mt-1">{errors.category.message}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="type">Tipo</Label>
                    <Select
                      value={watch("type")}
                      onValueChange={(value) => setValue("type", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="product">Producto</SelectItem>
                        <SelectItem value="service">Servicio</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="price">Precio *</Label>
                    <Input
                      id="price"
                      {...register("price")}
                      placeholder="0.00"
                      type="number"
                      step="0.01"
                    />
                    {errors.price && (
                      <p className="text-sm text-red-600 mt-1">{errors.price.message}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="installationCost">Costo de Instalación</Label>
                    <Input
                      id="installationCost"
                      {...register("installationCost")}
                      placeholder="0.00"
                      type="number"
                      step="0.01"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Marca y SKU */}
            <Card>
              <CardHeader>
                <CardTitle>Marca y Código</CardTitle>
                <CardDescription>
                  Información de marca y código de identificación
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="brand">Marca</Label>
                    {!showBrandInput ? (
                      <Select
                        value={watch("brand") || ""}
                        onValueChange={handleBrandSelection}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar marca" />
                        </SelectTrigger>
                        <SelectContent>
                          {existingBrands.map((brand) => (
                            <SelectItem key={brand} value={brand}>
                              {brand}
                            </SelectItem>
                          ))}
                          <SelectItem value="new_brand">
                            <div className="flex items-center gap-2">
                              <Plus className="w-4 h-4" />
                              Agregar nueva marca
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          value={brandInput}
                          onChange={(e) => setBrandInput(e.target.value)}
                          placeholder="Nombre de la nueva marca"
                        />
                        <Button
                          type="button"
                          onClick={handleAddNewBrand}
                          size="sm"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowBrandInput(false)}
                          size="sm"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="model">Modelo</Label>
                    <Input
                      id="model"
                      {...register("model")}
                      placeholder="Ej: DS-2CD2043G2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="sku">SKU (Código de Producto)</Label>
                    <div className="flex gap-2">
                      <Input
                        id="sku"
                        {...register("sku")}
                        placeholder="Ej: CAM-HIK-4K-001"
                        disabled={isEditMode}
                        className={isEditMode ? "bg-gray-50" : ""}
                      />
                      {!isEditMode && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={generateSKU}
                          size="sm"
                          className="px-3"
                        >
                          <Wand2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    {isEditMode && (
                      <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        El SKU no se puede modificar en modo edición
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="stock">Stock Inicial</Label>
                    <Input
                      id="stock"
                      type="number"
                      {...register("stock", { valueAsNumber: true })}
                      placeholder="0"
                      min="0"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Especificaciones */}
            <Card>
              <CardHeader>
                <CardTitle>Especificaciones y Detalles</CardTitle>
                <CardDescription>
                  Información técnica y características adicionales
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="specifications">Especificaciones Técnicas</Label>
                  <Textarea
                    id="specifications"
                    {...register("specifications")}
                    placeholder="Describe las especificaciones técnicas del producto..."
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="warrantyMonths">Garantía (meses)</Label>
                    <Input
                      id="warrantyMonths"
                      type="number"
                      {...register("warrantyMonths", { valueAsNumber: true })}
                      placeholder="0"
                      min="0"
                    />
                  </div>

                  <div>
                    <Label htmlFor="weight">Peso</Label>
                    <Input
                      id="weight"
                      {...register("weight")}
                      placeholder="Ej: 0.5 kg"
                    />
                  </div>

                  <div>
                    <Label htmlFor="dimensions">Dimensiones</Label>
                    <Input
                      id="dimensions"
                      {...register("dimensions")}
                      placeholder="Ej: 10x8x5 cm"
                    />
                  </div>

                  <div>
                    <Label htmlFor="tags">Etiquetas</Label>
                    <Input
                      id="tags"
                      {...register("tags")}
                      placeholder="seguridad, cámara, ip, 4k"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Columna lateral: Imágenes y configuración */}
          <div className="space-y-6">
            {/* Gestión de imágenes */}
            <Card>
              <CardHeader>
                <CardTitle>Imágenes del Producto</CardTitle>
                <CardDescription>
                  Agrega imágenes para mostrar tu producto
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Galería de imágenes */}
                {productImages.length > 0 ? (
                  <div className="space-y-4">
                    <div className="text-xs text-gray-500 mb-2 flex items-center gap-2">
                      <span>{productImages.length} imagen{productImages.length !== 1 ? 'es' : ''}</span>
                      {hasUploadingImages && (
                        <span className="flex items-center gap-1 text-blue-600">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Subiendo...
                        </span>
                      )}
                      {hasFailedImages && (
                        <span className="flex items-center gap-1 text-red-600">
                          <AlertCircle className="w-3 h-3" />
                          Con errores
                        </span>
                      )}
                    </div>
                    
                    {/* Imagen principal */}
                    <div className="relative w-full h-64 bg-gray-100 rounded-lg overflow-hidden">
                      {productImages[currentImageIndex] && (
                        <>
                          <img
                            src={productImages[currentImageIndex].url}
                            alt={`Imagen ${currentImageIndex + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              console.error('❌ Error cargando imagen:', productImages[currentImageIndex]?.url);
                              e.currentTarget.src = 'https://via.placeholder.com/400x300/f3f4f6/9ca3af?text=Error+al+cargar';
                            }}
                          />

                          {/* Overlay de estado de upload */}
                          {productImages[currentImageIndex].uploadStatus === 'uploading' && (
                            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                              <div className="text-center text-white">
                                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                                <p className="text-sm">Subiendo...</p>
                              </div>
                            </div>
                          )}

                          {productImages[currentImageIndex].uploadStatus === 'error' && (
                            <div className="absolute inset-0 bg-red-500 bg-opacity-50 flex items-center justify-center">
                              <div className="text-center text-white">
                                <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                                <p className="text-sm">Error al subir</p>
                              </div>
                            </div>
                          )}

                          {productImages[currentImageIndex].uploadStatus === 'success' && (
                            <div className="absolute top-2 left-2 bg-green-500 bg-opacity-80 text-white p-1 rounded">
                              <Check className="w-4 h-4" />
                            </div>
                          )}
                        </>
                      )}
                      
                      {/* Controles de navegación */}
                      {productImages.length > 1 && (
                        <>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="absolute left-2 top-1/2 transform -translate-y-1/2 opacity-80 hover:opacity-100"
                            onClick={prevImage}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-80 hover:opacity-100"
                            onClick={nextImage}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </>
                      )}

                      {/* Eliminar imagen actual */}
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2 opacity-80 hover:opacity-100"
                        onClick={() => removeImage(productImages[currentImageIndex]?.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>

                      {/* Indicador de posición */}
                      {productImages.length > 1 && (
                        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
                          {currentImageIndex + 1} / {productImages.length}
                        </div>
                      )}
                    </div>

                    {/* Miniaturas */}
                    {productImages.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {productImages.map((image, index) => (
                          <button
                            key={image.id}
                            type="button"
                            className={`relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                              index === currentImageIndex ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                            }`}
                            onClick={() => setCurrentImageIndex(index)}
                          >
                            <img
                              src={image.url}
                              alt={`Miniatura ${index + 1}`}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.src = 'https://via.placeholder.com/64x64/f3f4f6/9ca3af?text=?';
                              }}
                            />
                            
                            {/* Indicador de estado en miniatura */}
                            {image.uploadStatus === 'uploading' && (
                              <div className="absolute inset-0 bg-blue-500 bg-opacity-70 flex items-center justify-center">
                                <Loader2 className="w-4 h-4 animate-spin text-white" />
                              </div>
                            )}
                            
                            {image.uploadStatus === 'error' && (
                              <div className="absolute inset-0 bg-red-500 bg-opacity-70 flex items-center justify-center">
                                <AlertCircle className="w-4 h-4 text-white" />
                              </div>
                            )}
                            
                            {image.uploadStatus === 'success' && (
                              <div className="absolute top-0 right-0 bg-green-500 text-white p-0.5">
                                <Check className="w-2 h-2" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full h-64 bg-gray-100 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <Package className="w-16 h-16 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500">
                        {isEditMode ? 'No hay imágenes para este producto' : 'Sin imágenes'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {isEditMode ? 'Puedes agregar imágenes usando los botones de abajo' : 'Agrega imágenes para mostrar tu producto'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Controles para agregar imágenes */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('image-upload')?.click()}
                      className="flex items-center gap-2 flex-1"
                      disabled={isProcessingImages}
                    >
                      {isProcessingImages ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                      Subir Imagen
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddImageUrl}
                      className="flex items-center gap-2 flex-1"
                      disabled={isProcessingImages}
                    >
                      <LinkIcon className="w-4 h-4" />
                      Agregar URL
                    </Button>
                  </div>
                  
                  <input
                    id="image-upload"
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  
                  <p className="text-xs text-gray-500">
                    Formatos soportados: JPG, PNG, WEBP. Máximo 5MB por imagen.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Configuración del producto */}
            <Card>
              <CardHeader>
                <CardTitle>Configuración</CardTitle>
                <CardDescription>
                  Opciones de disponibilidad y promoción
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive">Producto Activo</Label>
                    <p className="text-sm text-gray-500">
                      El producto será visible en el catálogo
                    </p>
                  </div>
                  <Switch
                    id="isActive"
                    checked={watch("isActive")}
                    onCheckedChange={(checked) => setValue("isActive", checked)}
                  />
                </div>

                <div>
                  <Label htmlFor="availability">Disponibilidad</Label>
                  <Select
                    value={watch("availability")}
                    onValueChange={(value) => setValue("availability", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar disponibilidad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_stock">En Stock</SelectItem>
                      <SelectItem value="out_of_stock">Agotado</SelectItem>
                      <SelectItem value="on_order">Por Encargo</SelectItem>
                      <SelectItem value="discontinued">Descontinuado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isPromoted">Producto Promocionado</Label>
                    <p className="text-sm text-gray-500">
                      Destacar este producto en el catálogo
                    </p>
                  </div>
                  <Switch
                    id="isPromoted"
                    checked={watch("isPromoted")}
                    onCheckedChange={(checked) => setValue("isPromoted", checked)}
                  />
                </div>

                {watch("isPromoted") && (
                  <div>
                    <Label htmlFor="promotionText">Texto de Promoción</Label>
                    <Input
                      id="promotionText"
                      {...register("promotionText")}
                      placeholder="¡Oferta especial!"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="minQuantity">Cantidad Mínima</Label>
                    <Input
                      id="minQuantity"
                      type="number"
                      {...register("minQuantity", { valueAsNumber: true })}
                      placeholder="1"
                      min="1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="maxQuantity">Cantidad Máxima</Label>
                    <Input
                      id="maxQuantity"
                      type="number"
                      {...register("maxQuantity", { valueAsNumber: true })}
                      placeholder="Sin límite"
                      min="1"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Información adicional en modo edición */}
            {isEditMode && (
              <Card>
                <CardHeader>
                  <CardTitle>Información del Sistema</CardTitle>
                  <CardDescription>
                    Datos internos del producto
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-sm">
                    <span className="text-gray-600">ID del Producto:</span>
                    <span className="ml-2 font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                      #{productId}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-600">SKU:</span>
                    <span className="ml-2 font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                      {watch("sku") || 'Sin SKU'}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-600">Última actualización:</span>
                    <span className="ml-2 text-gray-500">
                      {new Date().toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Footer con botones de acción */}
        <div className="border-t bg-gray-50 -mx-6 -mb-6 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => window.location.href = '/product-management'}
              >
                Cancelar
              </Button>
              
              {isEditMode && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (window.confirm('¿Deseas descartar los cambios?')) {
                      window.location.href = '/product-management';
                    }
                  }}
                  className="text-amber-600 hover:text-amber-700"
                >
                  Descartar Cambios
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {(isProcessingImages || isSubmitting || hasUploadingImages) && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <div className="animate-spin w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full" />
                  {isProcessingImages || hasUploadingImages ? 'Procesando imágenes...' : 'Guardando...'}
                </div>
              )}
              
              <Button
                type="submit"
                disabled={isSubmitting || isProcessingImages || hasUploadingImages || hasFailedImages}
                className="min-w-[120px]"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    {isEditMode ? 'Actualizando...' : 'Creando...'}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {isEditMode ? 'Actualizar Producto' : 'Crear Producto'}
                  </>
                )}
              </Button>
            </div>
          </div>
          
          {/* Mensaje de ayuda para estado del botón */}
          {(hasUploadingImages || hasFailedImages) && (
            <div className="mt-3 text-xs text-gray-500">
              {hasUploadingImages && "⏳ Espera a que terminen de subirse todas las imágenes"}
              {hasFailedImages && "❌ Elimina las imágenes con error antes de continuar"}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}