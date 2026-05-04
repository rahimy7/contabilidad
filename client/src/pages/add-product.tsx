import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// SVG placeholder para productos sin imagen
const DEFAULT_PRODUCT_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2U1ZTdlYiIvPgogIDx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IiM5Y2EzYWYiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5TaW4gSW1hZ2VuPC90ZXh0Pgo8L3N2Zz4=';
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
import { toast, useToast } from '@/hooks/use-toast';
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
import { Controller } from 'react-hook-form';
import ProductUnitConversions from '@/components/product-unit-conversions';

// Esquema base del formulario (categoría opcional por defecto)
const productFormBaseSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  description: z.string().min(1, 'La descripción es requerida'),
  price: z.string().min(1, 'El precio es requerido'),
  currency: z.enum(['DOP', 'USD'], {
    errorMap: () => ({ message: 'Selecciona una moneda válida (DOP o USD)' })
  }),
  // Categoría opcional en el esquema base; se obliga solo en creación
  category: z.string().optional(),
  type: z.string().default('product'),
  brand: z.string().optional(),
  model: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  isActive: z.boolean().default(true),
  stock: z.number().min(0).default(0),
  specifications: z.string().optional(),
  installationCost: z.union([z.string(), z.null(), z.undefined()]).optional(),
  salePrice: z.union([z.string(), z.null(), z.undefined()]).optional(),
  weight: z.union([z.string(), z.null(), z.undefined()]).optional(),
  warrantyMonths: z.union([
    z.number(),
    z.string().transform(val => val === '' ? 0 : Number(val) || 0),
    z.null().transform(() => 0),
    z.undefined().transform(() => 0)
  ]).default(0),
  images: z.array(z.string()).default([]),
  features: z.union([z.string(), z.array(z.string())]).optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  warranty: z.string().optional(),
  dimensions: z.string().optional(),
  availability: z.string().optional(),
  stockQuantity: z.number().optional(),
  minQuantity: z.number().optional(),
  maxQuantity: z.number().optional(),
  isPromoted: z.boolean().optional(),
  promotionText: z.string().optional(),
  // 🎁 FIDELIZACIÓN - Campos opcionales para plan de puntos
  loyaltyPointsPropertyName: z.string().optional(), // 'LP', 'PUNTOS', 'REWARDS', etc.
  loyaltyPointsValue: z.union([z.string(), z.null(), z.undefined()]).optional(), // Valor numérico de puntos
});

// Esquema para creación: exige categoría
const productSchemaCreate = productFormBaseSchema.extend({
  category: z.string().min(1, 'La categoría es requerida'),
});

// Esquema para edición: deja categoría opcional
const productSchemaEdit = productFormBaseSchema;

const SUPPORTED_CURRENCIES = [
  { code: 'DOP', name: 'Peso Dominicano', symbol: 'RD$' },
  { code: 'USD', name: 'Dólar Estadounidense', symbol: '$' },
];

type ProductFormData = z.infer<typeof productFormBaseSchema>;

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
  currency?: string;
  baseCurrency?: string;
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
  weight?: string;
  dimensions?: string;
  tags?: string;
  salePrice?: string;
  availability?: string;
  stockQuantity?: number;
  minQuantity?: number;
  maxQuantity?: number;
  isPromoted?: boolean;
  promotionText?: string;
  // 🎁 FIDELIZACIÓN - Campos opcionales para plan de puntos
  loyaltyPointsPropertyName?: string;
  loyaltyPointsValue?: string;
  // ⚖️ CONVERSIÓN DE UNIDADES - Campos para sistema de conversión
  unitConversionEnabled?: boolean;
  baseUnitId?: number;
}

interface Brand {
  id: number;
  name: string;
  isActive: boolean;
}

// ✅ FUNCIÓN PARA SANITIZAR DATOS
const sanitizeProductData = (data: ProductFormData) => {
  const sanitized = { ...data };

  // Para precio de venta, si está vacío debe ser null
  if (sanitized.salePrice === '' || sanitized.salePrice === undefined) {
    sanitized.salePrice = null;
  }

  // Para costo de instalación, si está vacío debe ser null  
  if (sanitized.installationCost === '' || sanitized.installationCost === undefined) {
    sanitized.installationCost = null;
  }

  // Para peso, si está vacío debe ser null
  if (sanitized.weight === '' || sanitized.weight === undefined) {
    sanitized.weight = null;
  }

  // Para warrantyMonths - manejar tanto números como strings
  if (sanitized.warrantyMonths === null || 
      sanitized.warrantyMonths === undefined || 
      (typeof sanitized.warrantyMonths === 'string' && sanitized.warrantyMonths === '')) {
    sanitized.warrantyMonths = 0;
  } else if (typeof sanitized.warrantyMonths === 'string') {
    sanitized.warrantyMonths = Number(sanitized.warrantyMonths) || 0;
  }

  return sanitized;
};

export default function EnhancedAddProduct() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Detectar modo e ID desde la URL de forma síncrona para inicializar correctamente el resolver
  const urlParams = new URLSearchParams(window.location.search);
  const initialIsEditMode = urlParams.get('mode') === 'edit' && !!urlParams.get('id');
  const initialProductId = initialIsEditMode ? parseInt(urlParams.get('id') as string) : null;
  const initialStoreId = urlParams.get('storeId') ? parseInt(urlParams.get('storeId') as string) : null;

  // Estados para determinar el modo (crear/editar)
  const [isEditMode, setIsEditMode] = useState(initialIsEditMode);
  const [productId, setProductId] = useState<number | null>(initialProductId);
  
  // Estados para gestión de imágenes
  const [productImages, setProductImages] = useState<ImageData[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  
  // Estados para manejo de marcas
  const [extraBrands, setExtraBrands] = useState<string[]>([]);
  const [brandInput, setBrandInput] = useState("");
  const [showBrandInput, setShowBrandInput] = useState(false);

  // Estados para tracking de cambios
  const [originalData, setOriginalData] = useState<ProductFormData | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // ✅ FUNCIÓN PARA OBTENER IMÁGENES PROCESADAS - DENTRO DEL COMPONENTE
  const getProcessedImages = () => {
    return productImages
      .filter(img => img.isUploaded && img.uploadStatus === 'success')
      .map(img => img.url);
  };

  // ✅ FUNCIÓN PARA OBTENER TOKEN - DENTRO DEL COMPONENTE
  const getAuthToken = () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      throw new Error('No hay token de autenticación disponible');
    }
    return token;
  };

  // Queries para obtener datos reales
  const { data: categories = [], isLoading: loadingCategories } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: brandsData = [] } = useQuery<Brand[]>({
    queryKey: ["/api/brands"],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/brands', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) return [];
      return response.json();
    },
  });

  const existingBrands = [
    ...brandsData.filter(b => b.isActive).map(b => b.name),
    ...extraBrands.filter(b => !brandsData.some(bd => bd.name === b)),
  ];

  const { data: productData, isLoading: loadingProductData, error: productError } = useQuery<Product>({
    queryKey: ["/api/products", productId, initialStoreId],
    queryFn: async () => {
      const token = getAuthToken();

      // ✅ Si hay storeId en URL (super_admin), incluirlo en la query
      const url = initialStoreId
        ? `/api/products/${productId}?storeId=${initialStoreId}`
        : `/api/products/${productId}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Producto no encontrado');
      }

      return response.json();
    },
    enabled: isEditMode && productId !== null,
    retry: 3,
  });

  // Configurar formulario
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormData>({
    // En edición no requerimos categoría; en creación sí
    resolver: zodResolver(productFormBaseSchema),
    defaultValues: {
      type: "product",
      isActive: true,
      stock: 0,
      warrantyMonths: 0,
      images: [],
      currency: "DOP",
      stockQuantity: 0,
      minQuantity: 1,
      isPromoted: false,
      availability: "in_stock",
    },
  });

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

  const validateCurrency = (currency: string | undefined): "DOP" | "USD" => {
    if (currency === "DOP" || currency === "USD") {
      return currency;
    }
    return "DOP";
  };

  // Cargar datos del producto en modo edición
  useEffect(() => {
    if (isEditMode && productData) {
      console.log('📋 Loading existing product data:', productData);
      
      reset({
        name: productData.name,
        description: productData.description || "",
        price: productData.price || "",
        currency: validateCurrency(productData.baseCurrency || productData.currency),
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
        features: productData.features || "",
        warranty: productData.warranty || "",
        weight: productData.weight || "",
        dimensions: productData.dimensions || "",
        tags: productData.tags || "",
        salePrice: productData.salePrice || "",
        availability: productData.availability || "in_stock",
        stockQuantity: productData.stockQuantity || 0,
        minQuantity: productData.minQuantity || 1,
        maxQuantity: productData.maxQuantity || undefined,
        isPromoted: productData.isPromoted ?? false,
        promotionText: productData.promotionText || "",
        // 🎁 FIDELIZACIÓN - Campos de puntos de lealtad
        loyaltyPointsPropertyName: productData.loyaltyPointsPropertyName || "",
        loyaltyPointsValue: productData.loyaltyPointsValue || "",
      });

      console.log('💱 Loaded currency:', productData.baseCurrency || productData.currency || "DOP");

      // Cargar imágenes existentes si las hay
      if (productData.images && productData.images.length > 0) {
        loadExistingImages(productData.images);
      } else if (productData.imageUrl) {
        loadExistingImages([productData.imageUrl]);
      }
    } else if (!isEditMode) {
      // Modo crear - usar valores por defecto
      reset({
        type: "product",
        isActive: true,
        stock: 0,
        warrantyMonths: 0,
        images: [],
        currency: "DOP",
      });
    }
  }, [isEditMode, productData, reset]); 

  // ✅ MUTATIONS CORREGIDAS - SOLO UNA VERSIÓN DE CADA UNA
  const createProductMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      console.log('🔄 Creating product with data:', data);
      const token = getAuthToken();
      const processedImages = getProcessedImages();
      
      // ✅ SANITIZAR DATOS
      const sanitizedData = sanitizeProductData(data);
      
      // Preparar datos para envío
      const productData = {
        ...sanitizedData,
        // ✅ MAPEAR currency A baseCurrency PARA EL BACKEND
        baseCurrency: sanitizedData.currency,
        // Remover el campo currency para evitar confusión
        currency: undefined,
        images: processedImages,
      };

      console.log('💱 Sending product with baseCurrency:', productData.baseCurrency);
      console.log('📤 Complete product data being sent:', productData);

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
      window.location.href = '/product-management';
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
    mutationFn: async (data: ProductFormData) => {
      console.log('🔄 Updating product with data:', data);
      
      // ✅ VERIFICAR QUE TENEMOS EL ID DEL PRODUCTO
      if (!productId) {
        throw new Error('ID del producto no disponible para actualización');
      }
      
      // ✅ SANITIZAR DATOS
      const sanitizedData = sanitizeProductData(data);
      const processedImages = getProcessedImages();
      
      // ✅ PREPARAR DATOS COMPLETOS PARA EL BACKEND
      const updateData = {
        ...sanitizedData,
        // Mapear currency a baseCurrency para el backend
        baseCurrency: sanitizedData.currency,
        // Incluir imágenes procesadas
        images: processedImages,
        // Remover currency del objeto para evitar confusión
        currency: undefined,
      };

      console.log('📤 Sending complete update data:', updateData);
      console.log('💱 Currency being sent as baseCurrency:', updateData.baseCurrency);

      // ✅ ENVIAR COMO JSON
      const response = await fetch(`/api/products/${productId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify(updateData),
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
      // Redireccionar a product management después de actualizar
      window.location.href = '/product-management';
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

  // Manejo de errores para el producto
  useEffect(() => {
    if (productError) {
      console.error('❌ Error cargando producto:', productError);
      toast({
        title: "Error",
        description: "No se pudo cargar el producto para editar",
        variant: "destructive",
      });
    }
  }, [productError, toast]);

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

  const uploadFileToSupabase = async (file: File): Promise<string> => {
    try {
      console.log('🔄 Subiendo archivo a Supabase:', file.name);
      
      const token = getAuthToken();
      
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

  const processImageUrl = async (imageUrl: string): Promise<string> => {
    try {
      console.log('🔄 Procesando URL de imagen:', imageUrl);
      
      const token = getAuthToken();
      
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
        const uploadedUrl = await uploadFileToSupabase(file);
        
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

        URL.revokeObjectURL(tempUrl);

        toast({
          title: "Imagen subida",
          description: `${file.name} se ha subido correctamente`,
        });

      } catch (error) {
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
    event.target.value = '';
  };

  const handleAddImageUrl = async () => {
    const url = prompt("Ingresa la URL de la imagen:");
    if (!url || !url.trim()) return;

    try {
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
      const processedUrl = await processImageUrl(url.trim());
      
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

  // Función de envío del formulario
  const onSubmit = (data: ProductFormData) => {
    console.log('📋 DEBUGGING - Datos del formulario:', data);
    console.log('💱 Currency from form:', data.currency);
    
    // Verificar valores con watch()
    const allValues = watch();
    console.log('👀 VALORES CON WATCH:', allValues);
    
    if (isEditMode) {
      updateProductMutation.mutate(data);
    } else {
      createProductMutation.mutate(data);
    }
  };

  // Actualiza el asterisco visual de la etiqueta de categoría según el modo
  useEffect(() => {
    const label = document.querySelector('label[for="category"]') as HTMLLabelElement | null;
    if (label) {
      const text = label.textContent || '';
      const base = text.replace(/\s*\*$/, '');
      label.textContent = isEditMode ? base : base + ' *';
    }
  }, [isEditMode]);

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

  // Si hay error en modo edición y no se pudo cargar el producto
  if (isEditMode && productError) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="text-red-600 mb-4">
              <AlertCircle className="w-16 h-16 mx-auto mb-2" />
              <h2 className="text-xl font-semibold">Error al cargar producto</h2>
              <p className="text-gray-600 mt-2">No se pudo encontrar el producto solicitado</p>
            </div>
            <Button onClick={() => window.location.href = '/product-management'}>
              Volver a gestión de productos
            </Button>
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
                    <Label htmlFor="category">Categoría </Label>
                    <Controller
                      name="category"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value || ""} onValueChange={field.onChange}>
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
                      )}
                    />
                    {errors.category && (
                      <p className="text-sm text-red-600 mt-1">{errors.category.message}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="type">Tipo</Label>
                    <Controller
                      name="type"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value || "product"} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar tipo" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="product">Producto</SelectItem>
                            <SelectItem value="service">Servicio</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>

                  <div>
                    <Label htmlFor="price">Precio *</Label>
                    <Input
                      id="price"
                      {...register('price')}
                      placeholder="0.00"
                      className={errors.price ? 'border-red-500' : ''}
                    />
                    {errors.price && (
                      <p className="text-sm text-red-500 mt-1">{errors.price.message}</p>
                    )}
                  </div>

                  {/* ✅ CAMPO DE MONEDA */}
                  <div>
                    <Label htmlFor="currency">Moneda *</Label>
                    <Controller
                      name="currency"
                      control={control}
                      render={({ field }) => (
                        <Select
                          value={field.value || "DOP"}
                          onValueChange={(value) => {
                            field.onChange(value);
                            console.log('💱 Currency changed to:', value);
                          }}
                        >
                          <SelectTrigger className={errors.currency ? 'border-red-500' : ''}>
                            <SelectValue placeholder="Selecciona una moneda" />
                          </SelectTrigger>
                          <SelectContent>
                            {SUPPORTED_CURRENCIES.map((currency) => (
                              <SelectItem key={currency.code} value={currency.code}>
                                <div className="flex items-center gap-2">
                                  <span>{currency.symbol}</span>
                                  <span>{currency.name}</span>
                                  <span className="text-xs text-gray-500">({currency.code})</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {errors.currency && (
                      <p className="text-sm text-red-500 mt-1">{errors.currency.message}</p>
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

            {/* 🎁 FIDELIZACIÓN - Plan de Puntos */}
            <Card>
              <CardHeader>
                <CardTitle>Plan de Fidelización</CardTitle>
                <CardDescription>
                  Configurar puntos de lealtad para este producto (OPCIONAL)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="loyaltyPointsPropertyName">Nombre de Propiedad de Puntos</Label>
                    <Input
                      id="loyaltyPointsPropertyName"
                      {...register("loyaltyPointsPropertyName")}
                      placeholder="Ej: LP, PUNTOS, REWARDS"
                      type="text"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Nombre del tipo de puntos (LP, PUNTOS, REWARDS, etc.)
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="loyaltyPointsValue">Valor de Puntos</Label>
                    <Input
                      id="loyaltyPointsValue"
                      {...register("loyaltyPointsValue")}
                      placeholder="0.00"
                      type="number"
                      step="0.01"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Cantidad de puntos a asignar por este producto
                    </p>
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
                    <Controller
                      name="brand"
                      control={control}
                      render={({ field }) => (
                        <>
                          {!showBrandInput ? (
                            <Select
                              value={field.value || ""}
                              onValueChange={(value) => {
                                if (value === "new_brand") {
                                  setShowBrandInput(true);
                                  setBrandInput("");
                                } else {
                                  field.onChange(value);
                                }
                              }}
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
                                onClick={() => {
                                  if (brandInput.trim()) {
                                    const newBrand = brandInput.trim();
                                    setExtraBrands((prev) => [...prev, newBrand].sort());
                                    field.onChange(newBrand);
                                    setBrandInput("");
                                    setShowBrandInput(false);
                                    toast({
                                      title: "Marca agregada",
                                      description: `La marca "${newBrand}" ha sido agregada a la lista`,
                                    });
                                  }
                                }}
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
                        </>
                      )}
                    />
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
                    <Label htmlFor="barcode">Código de Barras</Label>
                    <Input
                      id="barcode"
                      {...register("barcode")}
                      placeholder="Ej: 7501234567890"
                    />
                  </div>

                  {watch('type') !== 'service' && (
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
                  )}
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

                <div>
                  <Label htmlFor="features">Características</Label>
                  <Textarea
                    id="features"
                    {...register("features")}
                    placeholder="Características separadas por comas: Resistente al agua, WiFi integrado, Visión nocturna"
                    rows={3}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Separa cada característica con una coma
                  </p>
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
                    <Label htmlFor="warranty">Descripción de Garantía</Label>
                    <Input
                      id="warranty"
                      {...register("warranty")}
                      placeholder="Ej: Garantía limitada del fabricante"
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
                    <p className="text-xs text-gray-500 mt-1">
                      Separa cada etiqueta con una coma
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="salePrice">Precio de Oferta</Label>
                    <Input
                      id="salePrice"
                      {...register("salePrice")}
                      placeholder="0.00"
                      type="number"
                      step="0.01"
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
                              e.currentTarget.src = DEFAULT_PRODUCT_IMAGE;
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
                                e.currentTarget.src = DEFAULT_PRODUCT_IMAGE;
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
                  <Controller
                    name="isActive"
                    control={control}
                    render={({ field }) => (
                      <Switch
                        id="isActive"
                        checked={field.value ?? true}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                </div>

                {watch('type') === 'service' ? (
                  <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
                    🛠️ Los servicios no manejan inventario. Los campos de stock, lote, vencimiento, peso y dimensiones no aplican.
                  </div>
                ) : (
                  <>
                  <div>
                    <Label htmlFor="availability">Disponibilidad</Label>
                    <Controller
                      name="availability"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value || "in_stock"} onValueChange={field.onChange}>
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
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="stockQuantity">Cantidad en Stock</Label>
                      <Input
                        id="stockQuantity"
                        type="number"
                        {...register("stockQuantity", { valueAsNumber: true })}
                        placeholder="0"
                        min="0"
                      />
                    </div>
                    <div>
                      <Label htmlFor="minQuantity">Cantidad Mínima</Label>
                      <Input
                        id="minQuantity"
                        type="number"
                        {...register("minQuantity", { valueAsNumber: true })}
                        placeholder="1"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="maxQuantity">Cantidad Máxima</Label>
                    <Input
                      id="maxQuantity"
                      type="number"
                      {...register("maxQuantity", { valueAsNumber: true })}
                      placeholder="Sin límite"
                    />
                  </div>
                  </>
                )}

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isPromoted">Producto Promocionado</Label>
                    <p className="text-sm text-gray-500">
                      Destacar este producto en el catálogo
                    </p>
                  </div>
                  <Controller
                    name="isPromoted"
                    control={control}
                    render={({ field }) => (
                      <Switch
                        id="isPromoted"
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                      />
                    )}
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
                    <span className="text-gray-600">Moneda:</span>
                    <span className="ml-2 font-mono text-xs bg-blue-100 px-2 py-1 rounded">
                      {watch("currency") || 'DOP'}
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

            {/* Unit Conversions - Only in edit mode */}
            {isEditMode && productId && (
              <ProductUnitConversions
                productId={productId}
                product={{
                  id: productId,
                  name: watch('name') || '',
                  unitConversionEnabled: productData?.unitConversionEnabled,
                  baseUnitId: productData?.baseUnitId,
                  stockQuantity: watch('stockQuantity'),
                  price: watch('price') || productData?.price || '',
                  currency: watch('currency') || productData?.baseCurrency || productData?.currency || 'DOP',
                  loyaltyPointsValue: watch('loyaltyPointsValue') || productData?.loyaltyPointsValue || '',
                  loyaltyPointsPropertyName: watch('loyaltyPointsPropertyName') || productData?.loyaltyPointsPropertyName || '',
                }}
                onUpdateProduct={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/products", productId] });
                }}
              />
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
              
              {/* DEBUG BUTTON - TEMPORAL */}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  console.log('🔍 DEBUG - Todos los valores actuales:', watch());
                  console.log('🔍 DEBUG - Errores del formulario:', errors);
                  console.log('🔍 DEBUG - Estado de imágenes:', productImages);
                  console.log('🔍 DEBUG - Currency value:', watch('currency'));
                }}
                className="bg-yellow-100 text-yellow-800 text-xs"
                size="sm"
              >
                🐛 Debug
              </Button>
              
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
