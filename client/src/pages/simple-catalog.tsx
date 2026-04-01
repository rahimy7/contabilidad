import React, { useState, useEffect } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ShoppingBag, Plus, Minus, ShoppingCart, Package, Eye, X, ChevronLeft, ChevronRight, DollarSign } from 'lucide-react';
import { WebOrderModal } from '../components/WebOrderModal'; // Asumiendo que creates el componente en esta ubicación
import { MessageCircle } from 'lucide-react'; // Si no está importado
import { toast } from '@/hooks/use-toast';

// ✅ CONFIGURACIÓN DE MONEDAS - DOP POR DEFECTO
const SUPPORTED_CURRENCIES = [
  { code: 'DOP', name: 'Peso Dominicano', symbol: 'RD$' },
  { code: 'USD', name: 'Dólar Estadounidense', symbol: '$' },
];

// ✅ TASAS DE CAMBIO FIJAS (En producción vendrían de una API)
const EXCHANGE_RATES = {
  'USD_TO_DOP': 58.5,  // 1 USD = 58.5 DOP
  'DOP_TO_USD': 0.017  // 1 DOP = 0.017 USD
};

// ✅ HOOK ACTUALIZADO PARA USAR TASAS REALES DEL SISTEMA
const useCurrencyConversion = (storeId: string | number | null) => {
  // Consultar tasas de cambio reales de la API
  const { data: exchangeRates = [], isLoading: ratesLoading } = useQuery({
    queryKey: [`/api/public/stores/${storeId}/exchange-rates`],
    queryFn: async () => {
      const response = await fetch(`/api/public/stores/${storeId}/exchange-rates`);
      if (!response.ok) {
        throw new Error('Error loading exchange rates');
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // Cache por 5 minutos
    enabled: !!storeId
  });

  // Función para obtener tasa de conversión
  const getConversionRate = (fromCurrency: string, toCurrency: string): number => {
    if (fromCurrency === toCurrency) return 1;

    // Buscar tasa directa
    const directRate = exchangeRates.find((rate: any) => 
      rate.baseCurrency === fromCurrency && rate.targetCurrency === toCurrency && rate.isActive
    );
    
    if (directRate) return parseFloat(directRate.rate);

    // Buscar tasa inversa
    const inverseRate = exchangeRates.find((rate: any) => 
      rate.baseCurrency === toCurrency && rate.targetCurrency === fromCurrency && rate.isActive
    );
    
    if (inverseRate) return 1 / parseFloat(inverseRate.rate);

    // ⚠️ FALLBACK: Si no hay tasas en BD, usar tasas por defecto
    console.warn(`⚠️ No se encontró tasa para ${fromCurrency} a ${toCurrency}, usando fallback`);
    if (fromCurrency === 'USD' && toCurrency === 'DOP') return 58.5;
    if (fromCurrency === 'DOP' && toCurrency === 'USD') return 0.017;
    
    return 1;
  };

  const convertToTargetCurrency = (price: number, fromCurrency: string, targetCurrency: string = 'DOP') => {
    if (fromCurrency === targetCurrency) return price;
    
    const rate = getConversionRate(fromCurrency, targetCurrency);
    return price * rate;
  };

  const formatCurrency = (amount: number, currency: string = 'DOP') => {
    const currencyConfig = SUPPORTED_CURRENCIES.find(c => c.code === currency);
    
    if (!currencyConfig) return `${amount.toFixed(2)}`;

    if (currency === 'USD') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).format(amount);
    } else if (currency === 'DOP') {
      return new Intl.NumberFormat('es-DO', {
        style: 'currency',
        currency: 'DOP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).format(amount);
    }

    return `${currencyConfig.symbol}${amount.toFixed(2)}`;
  };

  const convertProduct = (product: any) => {
    const originalPrice = parseFloat(product.price || '0');
    const baseCurrency = product.baseCurrency || product.base_currency || 'DOP';

    // ✅ SIEMPRE CONVERTIR A DOP PARA EL CATÁLOGO
    const convertedPrice = convertToTargetCurrency(originalPrice, baseCurrency, 'DOP');

    // 🎁 Debug: Log loyalty points fields
    if (product.loyaltyPointsPropertyName || product.loyaltyPointsValue || product.loyalty_points_property_name || product.loyalty_points_value) {
      console.log(`🎁 Product "${product.name}" has loyalty points:`, {
        loyaltyPointsPropertyName: product.loyaltyPointsPropertyName,
        loyaltyPointsValue: product.loyaltyPointsValue,
        loyalty_points_property_name: product.loyalty_points_property_name,
        loyalty_points_value: product.loyalty_points_value,
      });
    }

    return {
      ...product,
      originalPrice,
      originalCurrency: baseCurrency,
      convertedPrice,
      displayCurrency: 'DOP',
      conversionApplied: baseCurrency !== 'DOP',
      formattedPrice: formatCurrency(convertedPrice, 'DOP'),
      originalFormattedPrice: formatCurrency(originalPrice, baseCurrency)
    };
  };

  // Información sobre las tasas para mostrar en UI
  const getRateInfo = () => {
    const usdToDop = exchangeRates.find((r: any) => r.baseCurrency === 'USD' && r.targetCurrency === 'DOP');
    const dopToUsd = exchangeRates.find((r: any) => r.baseCurrency === 'DOP' && r.targetCurrency === 'USD');
    
    return {
      usdToDop: usdToDop ? parseFloat(usdToDop.rate) : null,
      dopToUsd: dopToUsd ? parseFloat(dopToUsd.rate) : null,
      lastUpdate: usdToDop?.updatedAt || dopToUsd?.updatedAt,
      hasRates: exchangeRates.length > 0
    };
  };

  return {
    convertToTargetCurrency,
    formatCurrency,
    convertProduct,
    displayCurrency: 'DOP',
    ratesLoading,
    getRateInfo
  };
};

// Agregar esta función después de los hooks de conversión
const getProductImages = (product: any): string[] => {
  if (product.image_url) return [product.image_url];
  if (product.images && Array.isArray(product.images)) return product.images;
  if (product.imageUrl) return [product.imageUrl];
  return [];
};

// ✅ FUNCIÓN para hacer requests a endpoints públicos
const fetchPublicData = async (endpoint: string) => {
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
};

// Modal de detalle del producto
const ProductDetailModal = ({ product, isOpen, onClose, onAddToCart, storeId }: { 
  product: any; 
  isOpen: boolean; 
  onClose: () => void;
  onAddToCart: (product: any) => void;
  storeId: string | number | null;
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageError, setImageError] = useState(false);
  const { convertProduct, formatCurrency } = useCurrencyConversion(storeId);

  if (!isOpen || !product) return null;

  const convertedProduct = convertProduct(product);
  const images = product.images || [product.image_url].filter(Boolean);
  const currentImage = images[currentImageIndex];

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
    setImageError(false);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
    setImageError(false);
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border-2 border-primary/20">
        <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">{product.name}</h2>
          <Button variant="ghost" onClick={onClose} className="p-2">
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        <div className="p-6">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Galería de imágenes */}
            <div className="space-y-4">
              <div className="aspect-square bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg relative overflow-hidden">
                {currentImage && !imageError ? (
                  <img
                    src={currentImage}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-20 h-20 text-emerald-400" />
                  </div>
                )}
                
                {/* Controles de navegación */}
                {images.length > 1 && (
                  <>
                    <button
                      onClick={prevImage}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={nextImage}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                      {currentImageIndex + 1} / {images.length}
                    </div>
                  </>
                )}
              </div>
              
              {/* Miniaturas */}
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto">
                  {images.map((img: string, index: number) => (
                    <button
                      key={index}
                      onClick={() => {
                        setCurrentImageIndex(index);
                        setImageError(false);
                      }}
                      className={`flex-shrink-0 w-16 h-16 rounded border-2 overflow-hidden ${
                        index === currentImageIndex ? 'border-emerald-500' : 'border-gray-200'
                      }`}
                    >
                      <img
                        src={img}
                        alt={`${product.name} ${index + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => (e.target as HTMLImageElement).style.display = 'none'}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Información del producto */}
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  {product.brand && (
                    <Badge variant="outline" className="text-xs">
                      {product.brand}
                    </Badge>
                  )}
                  <Badge variant={product.is_service ? 'secondary' : 'default'}>
                    {product.is_service ? '🔧 Servicio' : '📦 Producto'}
                  </Badge>
                  {convertedProduct.conversionApplied && (
                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">
                      <DollarSign className="w-3 h-3 mr-1" />
                      Convertido a DOP
                    </Badge>
                  )}
                </div>
                
                <div className="space-y-2 mb-4">
                  <div className="text-3xl font-bold text-emerald-600">
                    {convertedProduct.formattedPrice}
                  </div>
                  {convertedProduct.conversionApplied && (
                    <div className="text-sm text-gray-500">
                      Precio original: {convertedProduct.originalFormattedPrice}
                    </div>
                  )}
                </div>
                
                <p className="text-gray-700 leading-relaxed">
                  {product.description}
                </p>
              </div>

              {/* Información adicional */}
              <div className="space-y-3 text-sm">
                {product.sku && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">SKU:</span>
                    <span className="font-medium">{product.sku}</span>
                  </div>
                )}
                {product.category && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Categoría:</span>
                    <span className="font-medium capitalize">{product.category}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Disponibilidad:</span>
                  <span className="font-medium text-green-600">En stock</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Moneda del catálogo:</span>
                  <span className="font-medium text-blue-600">Pesos Dominicanos (DOP)</span>
                </div>
                {product.delivery_required && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Entrega:</span>
                    <span className="font-medium">Delivery disponible</span>
                  </div>
                )}
                {/* 🎁 FIDELIZACIÓN - Puntos de lealtad */}
                {product.loyaltyPointsPropertyName && product.loyaltyPointsValue && (
                  <div className="flex justify-between p-3 bg-amber-50 rounded-lg border border-amber-200 mt-2">
                    <span className="text-amber-700 font-medium">Puntos de Lealtad:</span>
                    <span className="font-bold text-amber-600">
                      {product.loyaltyPointsValue} {product.loyaltyPointsPropertyName}
                    </span>
                  </div>
                )}
              </div>

              {/* Botones de acción */}
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={() => {
                    onAddToCart(convertedProduct);
                    onClose();
                  }}
                  className="w-full add-to-cart-btn"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Agregar al carrito
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// SVG placeholder para productos sin imagen
const DEFAULT_PRODUCT_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2U1ZTdlYiIvPgogIDx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IiM5Y2EzYWYiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5TaW4gSW1hZ2VuPC90ZXh0Pgo8L3N2Zz4=';

// Componente para mostrar imágenes
const ProductImage = ({ product, className = "", onClick }: { product: any; className?: string; onClick?: () => void }) => {
  const { images, mainImage } = normalizeProductImages(product);

  return (
    <div className={`relative overflow-hidden flex items-center justify-center bg-gray-50 ${className}`} onClick={onClick}>
      <img
        src={mainImage}
        alt={product.name}
        className="w-full h-full object-contain transition-transform duration-300 hover:scale-105"
        onError={(e) => {
          console.log('Error cargando imagen del producto:', mainImage);
          e.currentTarget.src = DEFAULT_PRODUCT_IMAGE;
        }}
      />
      {images.length > 1 && (
        <div className="absolute bottom-2 right-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded">
          +{images.length - 1}
        </div>
      )}
    </div>
  );
};

   const normalizeProductImages = (product: any) => {
  let images: string[] = [];

  if (Array.isArray(product.image_urls)) {
    images = product.image_urls;
  } else if (Array.isArray(product.images)) {
    images = product.images;
  } else if (typeof product.image_url === 'string') {
    images = [product.image_url];
  } else if (typeof product.imageUrl === 'string') {
    images = [product.imageUrl];
  } else if (typeof product.image === 'string') {
    images = [product.image];
  }

  // Filtrar imágenes inválidas
  images = images.filter((url) => typeof url === 'string' && url.trim() !== '');

  return {
    images,
    mainImage: images.length > 0
      ? images[0]
      : DEFAULT_PRODUCT_IMAGE
  };
};

export default function SimpleCatalog() {
  // Estados
  const [cart, setCart] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showCart, setShowCart] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [showProductDetail, setShowProductDetail] = useState(false);
  // Estados para header compacto
  const [isScrolled, setIsScrolled] = useState(false);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [showWebOrderModal, setShowWebOrderModal] = useState(false);

  // ✅ HOOK DE CONVERSIÓN DE MONEDA
  const { convertProduct, formatCurrency, ratesLoading, getRateInfo } = useCurrencyConversion(storeId);

  // Detectar scroll para header compacto
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 100);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ✅ OBTENER storeId de la URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const storeParam = urlParams.get('store') || urlParams.get('storeId');
    
    if (storeParam) {
      const parsedStoreId = parseInt(storeParam);
      if (!isNaN(parsedStoreId)) {
        setStoreId(parsedStoreId);
      }
    }
  }, []);

  // ✅ CONSULTAS AL BACKEND
  const { data: storeInfo, isLoading: loadingStore, error: storeError } = useQuery({
    queryKey: [`/api/public/stores/${storeId}/info`],
    queryFn: () => fetchPublicData(`/api/public/stores/${storeId}/info`),
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: products = [], isLoading: loadingProducts, error: productsError } = useQuery({
    queryKey: [`/api/public/stores/${storeId}/products`],
    queryFn: () => fetchPublicData(`/api/public/stores/${storeId}/products`),
    enabled: !!storeId,
    staleTime: 2 * 60 * 1000,
  });

  const { data: categories = [], isLoading: loadingCategories, error: categoriesError } = useQuery({
    queryKey: [`/api/public/stores/${storeId}/categories`],
    queryFn: () => fetchPublicData(`/api/public/stores/${storeId}/categories`),
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });




  const handleWebOrderCompleted = () => {
  setCart([]);
  setShowCart(false);
  toast({
    title: "¡Pedido enviado!",
    description: "Tu pedido web ha sido procesado exitosamente.",
    variant: "default",
  });
};

  // ✅ CARGAR carrito desde localStorage
  useEffect(() => {
    if (storeId) {
      const savedCart = localStorage.getItem(`cart_store_${storeId}`);
      if (savedCart) {
        try {
          setCart(JSON.parse(savedCart));
        } catch (error) {
          console.error('Error loading cart from localStorage:', error);
          localStorage.removeItem(`cart_store_${storeId}`);
        }
      }
    }
  }, [storeId]);

  // ✅ GUARDAR carrito en localStorage
  useEffect(() => {
    if (storeId && cart.length > 0) {
      localStorage.setItem(`cart_store_${storeId}`, JSON.stringify(cart));
    } else if (storeId) {
      localStorage.removeItem(`cart_store_${storeId}`);
    }
  }, [cart, storeId]);

  // ✅ CONVERTIR PRODUCTOS PARA MOSTRAR EN DOP
  const convertedProducts = Array.isArray(products) ? products.map(convertProduct) : [];

  // ✅ HOOK PARA BÚSQUEDA AVANZADA (por nombre, SKU, categoría)
  const { data: searchResults = [], isLoading: searchLoading } = useQuery({
    queryKey: [`/api/public/stores/${storeId}/products/search`, searchTerm, selectedCategory],
    queryFn: async () => {
      if (!searchTerm && selectedCategory === "all") {
        // Si no hay búsqueda ni filtro, retornar todos
        return products;
      }

      // Construir parámetros de búsqueda
      const params = new URLSearchParams();

      // Buscar por nombre o SKU
      if (searchTerm) {
        params.append('sku', searchTerm);
        params.append('name', searchTerm);
      }

      // Filtrar por categoría
      if (selectedCategory !== "all") {
        params.append('category', selectedCategory);
      }

      const response = await fetch(
        `/api/public/stores/${storeId}/products/search?${params.toString()}`
      );
      if (!response.ok) {
        throw new Error('Error en búsqueda');
      }
      return response.json();
    },
    enabled: !!storeId && (!!searchTerm || selectedCategory !== "all"),
    staleTime: 30 * 1000, // Cache por 30 segundos
  });

  // Filtrado de productos
  const filteredProducts = (() => {
    // Si hay término de búsqueda o categoría seleccionada Y hay resultados de búsqueda, usarlos
    if ((searchTerm || selectedCategory !== "all") && searchResults.length > 0) {
      return searchResults.map(convertProduct);
    }

    // Si está cargando la búsqueda, mostrar productos actuales filtrados localmente
    if (searchLoading) {
      return convertedProducts.filter((product: any) => {
        if (!product) return false;

        // Filtrar por término de búsqueda (nombre, descripción, SKU)
        const matchesSearch = !searchTerm ||
          product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.sku?.toLowerCase().includes(searchTerm.toLowerCase());

        // Filtrar por categoría
        const matchesCategory = selectedCategory === "all" || product.category === selectedCategory;

        return matchesSearch && matchesCategory;
      });
    }

    // Filtrado local cuando no hay búsqueda del servidor
    return convertedProducts.filter((product: any) => {
      if (!product) return false;

      // Filtrar por término de búsqueda (nombre, descripción, SKU)
      const matchesSearch = !searchTerm ||
        product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.sku?.toLowerCase().includes(searchTerm.toLowerCase());

      // Filtrar por categoría
      const matchesCategory = selectedCategory === "all" || product.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  })();

const getProductImages = (product: any): string[] => {
  if (product.image_urls && Array.isArray(product.image_urls)) {
    return product.image_urls.filter(url => url && url.trim() !== '');
  }
  if (product.images && Array.isArray(product.images)) {
    return product.images.filter(url => url && url.trim() !== '');
  }
  if (product.image && typeof product.image === 'string') {
    return [product.image];
  }
  return [];
};

// 2. Función para obtener la primera imagen
const getProductImage = (product: any): string => {
  const images = getProductImages(product);
  if (images.length > 0) {
    return images[0];
  }
  return DEFAULT_PRODUCT_IMAGE;
};
  
  // ✅ GESTIÓN DEL CARRITO (PRECIOS YA CONVERTIDOS A DOP)
const addToCart = (product: any) => {
  const convertedProduct = convertProduct(product);

  // Preservar imagen explícitamente
  const getProductImage = (product: any): string => {
    if (product.image_url) return product.image_url;
    if (product.images && product.images.length > 0) return product.images[0];
    if (product.imageUrl) return product.imageUrl;
    return DEFAULT_PRODUCT_IMAGE;
  };
  const { images, mainImage } = normalizeProductImages(product);
 setCart(currentCart => {
  const existingItem = currentCart.find(item => item.id === product.id);
  if (existingItem) {
    return currentCart.map(item =>
      item.id === product.id
        ? { ...item, quantity: item.quantity + 1 }
        : item
    );
  }
  return [...currentCart, { 
    ...convertedProduct,
    quantity: 1,
    cartPrice: convertedProduct.convertedPrice,
    imageUrl: mainImage,
    images,
  }];
});
};

  const removeFromCart = (productId: number) => {
    setCart(currentCart => {
      return currentCart.reduce((acc: any[], item) => {
        if (item.id === productId) {
          if (item.quantity > 1) {
            acc.push({ ...item, quantity: item.quantity - 1 });
          }
        } else {
          acc.push(item);
        }
        return acc;
      }, []);
    });
  };

  // ✅ CÁLCULOS DEL CARRITO (TODO EN DOP)
  const getCartTotal = () => {
    return cart.reduce((total, item) => {
      const price = item.cartPrice || item.convertedPrice || parseFloat(item.price);
      return total + (price * item.quantity);
    }, 0);
  };

  const getCartItemsCount = () => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  };

  // 🎁 CÁLCULO DE PUNTOS DE LEALTAD TOTALES
  const getCartTotalLoyaltyPoints = () => {
    return cart.reduce((total, item) => {
      const pointsValue = item.loyaltyPointsValue ? parseFloat(item.loyaltyPointsValue) : 0;
      return total + (pointsValue * item.quantity);
    }, 0);
  };

  const getCartLoyaltyPropertyName = () => {
    // Obtener el nombre de la propiedad del primer item que lo tenga
    const itemWithLoyalty = cart.find(item => item.loyaltyPointsPropertyName);
    return itemWithLoyalty?.loyaltyPointsPropertyName || null;
  };

  // ✅ GENERAR PEDIDO PARA WHATSAPP (EN DOP)
  const makeOrder = () => {
    if (cart.length === 0) return;
    
    // Crear mensaje del pedido con formato específico
    const storeName = storeInfo?.name || 'TIENDA';
    const orderItems = cart.map((item, index) => {
      const price = item.cartPrice || item.convertedPrice || parseFloat(item.price);
      const subtotal = price * item.quantity;
      return `${index + 1}. *${item.name}*[ID:${item.id}]
   Cantidad: ${item.quantity}
   Precio unitario: ${formatCurrency(price, 'DOP')}
   Subtotal: ${formatCurrency(subtotal, 'DOP')}`;
    }).join('\n');
    
    const orderMessage = `🛍️ *NUEVO PEDIDO - ${storeName.toUpperCase()}*

${orderItems}

💰 *TOTAL: ${formatCurrency(getCartTotal(), 'DOP')}*

📋 Por favor confirma la disponibilidad y tiempo de entrega.
💲 Todos los precios están en Pesos Dominicanos (DOP).
¡Gracias por tu preferencia! 🙏`;
    
    // Obtener número de WhatsApp de la tienda
    const phoneNumber = storeInfo?.phone || storeInfo?.whatsapp || storeInfo?.contact_phone || '18095551234';
    const cleanPhoneNumber = phoneNumber.replace(/[^\d]/g, '');
    const whatsappUrl = `https://wa.me/${cleanPhoneNumber}?text=${encodeURIComponent(orderMessage)}`;
    
    window.open(whatsappUrl, '_blank');
    
    // Limpiar carrito
    setCart([]);
    setShowCart(false);
  };

  const openProductDetail = (product: any) => {
    setSelectedProduct(product);
    setShowProductDetail(true);
  };

  const closeProductDetail = () => {
    setShowProductDetail(false);
    setSelectedProduct(null);
  };

  // ✅ MANEJO DE ERRORES
  if (storeError || productsError || categoriesError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-red-100">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error al cargar el catálogo</h2>
          <p className="text-gray-600 mb-4">
            {storeError ? 'Tienda no encontrada o inactiva' : 'Error al cargar productos'}
          </p>
          <Button onClick={() => window.location.reload()} className="bg-red-500 hover:bg-red-600">
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  // ✅ ESTADO DE CARGA
  if (loadingStore || loadingProducts || loadingCategories || !storeId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-blue-100">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600 text-lg">Cargando catálogo de la tienda...</p>
          {storeId && <p className="text-gray-500 text-sm mt-2">Tienda ID: {storeId}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-blue-100 relative">
      {/* Header Responsivo Fijo */}
      <div className="sticky top-0 bg-primary shadow-lg z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Vista móvil */}
          <div className="lg:hidden py-3">
            <div className="flex flex-col space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <img
                    src="/image.png"
                    alt="Metabella Logo"
                    className="h-8 w-auto"
                  />
                  <div>
                    <h1 className="text-lg font-bold text-white truncate">
                      {storeInfo?.name || 'Catálogo'}
                    </h1>
                    <p className="text-xs text-emerald-100">
                      💰 Precios en Pesos Dominicanos
                    </p>
                  </div>
                </div>
                <div className="text-xs text-emerald-100 bg-white/20 px-2 py-1 rounded-full">
                  {filteredProducts.length}
                </div>
              </div>
              
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-emerald-600 w-4 h-4" />
                  <Input
                    placeholder="🔍 Buscar..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 border-white/30 bg-white/90 text-gray-800 placeholder:text-emerald-600/70 focus:bg-white focus:border-emerald-300 rounded-full h-9"
                  />
                </div>
                
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-24 border-white/30 bg-white/90 text-gray-800 focus:bg-white focus:border-emerald-300 rounded-full h-9">
                    <SelectValue placeholder="📂" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">📂 Todas</SelectItem>
                    {categories.map((category: any) => (
                      <SelectItem key={category.id || category.name} value={category.name}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Vista desktop */}
          <div className="hidden lg:block py-6">
            <div className="flex flex-col space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <img
                    src="/image.png"
                    alt="Metabella Logo"
                    className="h-12 w-auto"
                  />
                  <div>
                    <h1 className="text-3xl font-bold text-white">
                      {storeInfo?.name || 'Catálogo'}
                    </h1>
                    <div className="flex items-center gap-3 mt-2">
                      {storeInfo?.description && (
                        <p className="text-emerald-100">{storeInfo.description}</p>
                      )}
                      <div className="flex items-center gap-1 bg-white/20 px-3 py-1 rounded-full">
                        <DollarSign className="w-4 h-4 text-emerald-100" />
                        <span className="text-emerald-100 text-sm font-medium">
                          Todos los precios en Pesos Dominicanos
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-sm text-emerald-100 bg-white/20 px-3 py-1 rounded-full">
                  {filteredProducts.length} productos
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-emerald-600 w-5 h-5" />
                  <Input
                    placeholder="🔍 Buscar productos..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-11 border-white/30 bg-white/90 text-gray-800 placeholder:text-emerald-600/70 focus:bg-white focus:border-emerald-300 rounded-full h-12"
                  />
                </div>
                
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-full sm:w-56 border-white/30 bg-white/90 text-gray-800 focus:bg-white focus:border-emerald-300 rounded-full h-12">
                    <SelectValue placeholder="📂 Todas las categorías" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">📂 Todas las categorías</SelectItem>
                    {categories.map((category: any) => (
                      <SelectItem key={category.id || category.name} value={category.name}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de detalle del producto */}
     <ProductDetailModal
      product={selectedProduct}
      isOpen={showProductDetail}
      onClose={closeProductDetail}
      onAddToCart={addToCart}
      storeId={storeId}
/>

<WebOrderModal
  isOpen={showWebOrderModal}
  onClose={() => setShowWebOrderModal(false)}
  cart={cart}
  cartTotal={getCartTotal()}
  storeInfo={storeInfo}
  onOrderSubmitted={handleWebOrderCompleted}
/>

      {/* Botón flotante del carrito */}
      {getCartItemsCount() > 0 && !showCart && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button
            onClick={() => setShowCart(!showCart)}
            className="bg-primary hover:bg-primary/90 text-white shadow-2xl rounded-full w-16 h-16 p-0 relative animate-bounce"
            size="lg"
          >
            <ShoppingCart className="w-6 h-6" />
            <Badge className="absolute -top-2 -right-2 bg-red-500 text-white min-w-[24px] h-6 rounded-full p-1 text-xs">
              {getCartItemsCount()}
            </Badge>
          </Button>
        </div>
      )}

      {/* Carrito (sidebar) */}
{showCart && (
  <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-end sm:items-center sm:justify-center">
    <div className="bg-white w-full sm:max-w-md sm:rounded-t-lg rounded-t-lg max-h-[80vh] flex flex-col shadow-2xl sm:border-2 sm:border-primary/20">
      {/* Header del carrito */}
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <ShoppingCart className="w-5 h-5" />
          Carrito ({getCartItemsCount()})
        </h3>
        <button
          onClick={() => setShowCart(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Items del carrito */}
      <div className="flex-1 overflow-y-auto p-4">
        {cart.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Tu carrito está vacío
          </div>
        ) : (
          <div className="space-y-3">
            {cart.map((item) => {
              // Obtener imagen del item con fallbacks
              const itemImage = normalizeProductImages(item).mainImage;

              return (
                <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                  <img
                    src={itemImage}
                    alt={item.name}
                    className="w-12 h-12 object-cover rounded flex-shrink-0"
                    onError={(e) => {
                      console.log('Error cargando imagen del carrito:', itemImage);
                      e.currentTarget.src = 'data:image/jpeg;base64,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';
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate">{item.name}</h4>
                    <p className="text-gray-600 text-sm">
                      ${formatCurrency(item.cartPrice || item.convertedPrice || parseFloat(item.price), 'DOP')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-300"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm font-medium">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => addToCart(item)}
                      className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-300"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Botones del carrito */}
      {cart.length > 0 && (
        <div className="border-t p-4 space-y-3">
          <div className="flex items-center justify-between text-lg font-bold">
            <span>Total:</span>
            <span>${formatCurrency(getCartTotal(), 'DOP')}</span>
          </div>

          {/* 🎁 Total de Puntos de Lealtad */}
          {getCartTotalLoyaltyPoints() > 0 && (
            <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
              <span className="text-amber-700 font-medium">Puntos Acumulados:</span>
              <span className="font-bold text-amber-600">
                {getCartTotalLoyaltyPoints().toFixed(2)} {getCartLoyaltyPropertyName()}
              </span>
            </div>
          )}

          {/* Botón WhatsApp existente debe ser verde siempre*/}
          <Button
            onClick={makeOrder}
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            size="lg"
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            Enviar por WhatsApp
          </Button>
          
          {/* Nuevo botón para pedido web */}
          <Button
            onClick={() => setShowWebOrderModal(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            size="lg"
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            Realizar Pedido Web
          </Button>
          
          <Button
            onClick={() => setCart([])}
            variant="outline"
            className="w-full"
          >
            Vaciar el Carrito
          </Button>
        </div>
      )}
    </div>
  </div>
)}

      {/* Grid de productos */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingBag className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-600 mb-2">
              No se encontraron productos
            </h3>
            <p className="text-gray-500">Intenta con otros términos de búsqueda.</p>
          </div>
        ) : (
          <>
            {/* Información de moneda */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2 text-blue-700">
                <DollarSign className="w-5 h-5" />
                <span className="font-medium">Información de precios</span>
              </div>
              <p className="text-sm text-blue-600 mt-1">
                Todos los precios están mostrados en <strong>Pesos Dominicanos (DOP)</strong>. 
                {convertedProducts.some(p => p.conversionApplied) && (
                  <span> Los productos con precios originales en USD han sido convertidos automáticamente.</span>
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredProducts.map((product: any) => (
                <Card key={product.id} className="group hover:shadow-2xl transition-all duration-300 border-2 border-primary/20 hover:border-primary/40 shadow-md bg-white backdrop-blur-sm hover:bg-white flex flex-col">
                  <CardContent className="p-0 flex flex-col h-full">
                    {/* Imagen reducida - aspect-video en lugar de aspect-square */}
                    <div className="aspect-video rounded-t-lg relative overflow-hidden flex-shrink-0">
                      <ProductImage
                        product={product}
                        className="w-full h-full"
                        onClick={() => openProductDetail(product)}
                      />
                      <div className="absolute top-2 left-2 space-y-1">
                        <Badge variant={product.is_service ? 'secondary' : 'default'} className="bg-white/90 text-emerald-700 text-xs">
                          {product.is_service ? '🔧' : '📦'}
                        </Badge>
                        {product.conversionApplied && (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 text-xs hidden sm:inline-block">
                            <DollarSign className="w-2 h-2 mr-0.5" />
                            USD
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Contenido compacto */}
                    <div className="p-3 flex-1 flex flex-col">
                      {/* Nombre reducido a una línea */}
                      <h3 className="font-semibold text-sm text-gray-900 mb-2 line-clamp-1 group-hover:text-emerald-600 transition-colors">
                        {product.name}
                      </h3>

                      {/* Precio y marca juntos */}
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                        <div className="text-xl font-bold text-emerald-600">
                          {product.formattedPrice}
                        </div>
                        {product.brand && (
                          <Badge variant="outline" className="text-xs">
                            {product.brand}
                          </Badge>
                        )}
                      </div>

                      {/* 🎁 FIDELIZACIÓN - Mostrar puntos de lealtad si existen */}
                      {product.loyaltyPointsPropertyName && product.loyaltyPointsValue && (
                        <div className="mb-2 p-1.5 bg-amber-50 rounded border border-amber-200 flex-shrink-0">
                          <span className="text-xs text-amber-700 font-medium">
                            🎁 {product.loyaltyPointsValue} {product.loyaltyPointsPropertyName}
                          </span>
                        </div>
                      )}

                      <div className="flex gap-2 mt-auto">
                        <Button
                          onClick={() => addToCart(product)}
                          className="flex-1 add-to-cart-btn text-xs h-8"
                          size="sm"
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Agregar
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => openProductDetail(product)}
                          className="px-2 h-8"
                          size="sm"
                        >
                          <Eye className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
        </div>

        
  );
}