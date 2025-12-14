// client/src/pages/share-product.tsx
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertCircle, MessageCircle, ShoppingCart, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Helmet } from 'react-helmet-async';

// SVG placeholder para productos sin imagen
const DEFAULT_PRODUCT_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2U1ZTdlYiIvPgogIDx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IiM5Y2EzYWYiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5TaW4gSW1hZ2VuPC90ZXh0Pgo8L3N2Zz4=';

interface Product {
  id: number;
  name: string;
  description?: string;
  price?: string;
  currency?: string;
  baseCurrency?: string;
  images?: string[];
  imageUrl?: string;
  category?: string;
  brand?: string;
  // 🎁 FIDELIZACIÓN - Campos opcionales para plan de puntos
  loyaltyPointsPropertyName?: string;
  loyaltyPointsValue?: string;
}

interface StoreInfo {
  id: number;
  name: string;
  phone?: string;
  whatsappNumber?: string;
}

// ✅ TASAS DE CAMBIO (mismas que SimpleCatalog)
const EXCHANGE_RATES = {
  'USD_TO_DOP': 58.5,
  'DOP_TO_USD': 0.017
};

export default function ShareProduct() {
  const [, setLocation] = useLocation();
  const [productId, setProductId] = useState<number | null>(null);
  const [storeId, setStoreId] = useState<number | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const prodId = urlParams.get('productId');
    const store = urlParams.get('store') || urlParams.get('storeId');
    
    console.log('🔍 URL Params:', { prodId, store });
    
    if (prodId) setProductId(parseInt(prodId));
    if (store) setStoreId(parseInt(store));
  }, []);

  const { data: product, isLoading, error } = useQuery<Product>({
    queryKey: ['public-product', storeId, productId],
    queryFn: async () => {
      const url = `/api/public/stores/${storeId}/products/${productId}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Producto no encontrado');
      return response.json();
    },
    enabled: !!productId && !!storeId,
  });

  const { data: storeInfo } = useQuery<StoreInfo>({
    queryKey: ['public-store', storeId],
    queryFn: async () => {
      const response = await fetch(`/api/public/stores/${storeId}/info`);
      if (!response.ok) throw new Error('Store not found');
      return response.json();
    },
    enabled: !!storeId,
  });

  const getProductImage = () => {
    if (product?.images && product.images.length > 0) {
      return product.images[0];
    }
    if (product?.imageUrl) {
      return product.imageUrl;
    }
    return DEFAULT_PRODUCT_IMAGE;
  };

  const formatPrice = (price: string | undefined, currency: string = 'DOP') => {
    if (!price) return 'Precio no disponible';
    const numPrice = parseFloat(price);
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: currency === 'USD' ? 'USD' : 'DOP',
    }).format(numPrice);
  };

  // ✅ FUNCIÓN DE CONVERSIÓN DE MONEDA (igual que SimpleCatalog)
  const convertToTargetCurrency = (price: number, fromCurrency: string, targetCurrency: string = 'DOP') => {
    if (fromCurrency === targetCurrency) return price;
    
    if (fromCurrency === 'USD' && targetCurrency === 'DOP') {
      return price * EXCHANGE_RATES.USD_TO_DOP;
    }
    if (fromCurrency === 'DOP' && targetCurrency === 'USD') {
      return price * EXCHANGE_RATES.DOP_TO_USD;
    }
    
    return price;
  };

  const formatCurrency = (amount: number, currency: string = 'DOP') => {
    if (currency === 'USD') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).format(amount);
    } else {
      return new Intl.NumberFormat('es-DO', {
        style: 'currency',
        currency: 'DOP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).format(amount);
    }
  };

  // ✅ NUEVO FORMATO DE MENSAJE WHATSAPP (igual que SimpleCatalog)
  const handleWhatsAppOrder = () => {
    if (!product || !storeInfo) return;
    
    const originalPrice = parseFloat(product.price || '0');
    const baseCurrency = product.baseCurrency || product.currency || 'DOP';
    const convertedPrice = convertToTargetCurrency(originalPrice, baseCurrency, 'DOP');
    
    const storeName = storeInfo.name || 'TIENDA';
    const orderMessage = `🛍️ *NUEVO PEDIDO - ${storeName.toUpperCase()}*

1. *${product.name}*[ID:${product.id}]
   Cantidad: 1
   Precio unitario: ${formatCurrency(convertedPrice, 'DOP')}
   Subtotal: ${formatCurrency(convertedPrice, 'DOP')}

💰 *TOTAL: ${formatCurrency(convertedPrice, 'DOP')}*

📋 Por favor confirma la disponibilidad y tiempo de entrega.
💲 Todos los precios están en Pesos Dominicanos (DOP).
¡Gracias por tu preferencia! 🙏`;
    
    const phone = storeInfo.whatsappNumber || storeInfo.phone || '';
    const cleanPhoneNumber = phone.replace(/[^\d]/g, '');
    const whatsappUrl = `https://wa.me/${cleanPhoneNumber}?text=${encodeURIComponent(orderMessage)}`;
    
    window.open(whatsappUrl, '_blank');
  };

  // ✅ NUEVA FUNCIÓN: Agregar al carrito y redirigir
  const handleAddToCartAndContinue = () => {
    if (!product || !storeId) return;
    
    // Convertir producto a DOP
    const originalPrice = parseFloat(product.price || '0');
    const baseCurrency = product.baseCurrency || product.currency || 'DOP';
    const convertedPrice = convertToTargetCurrency(originalPrice, baseCurrency, 'DOP');
    
    // Preparar producto para el carrito
    const cartProduct = {
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      originalPrice,
      originalCurrency: baseCurrency,
      convertedPrice,
      displayCurrency: 'DOP',
      conversionApplied: baseCurrency !== 'DOP',
      formattedPrice: formatCurrency(convertedPrice, 'DOP'),
      originalFormattedPrice: formatCurrency(originalPrice, baseCurrency),
      cartPrice: convertedPrice,
      quantity: 1,
      imageUrl: getProductImage(),
      images: product.images || [getProductImage()],
      category: product.category,
      brand: product.brand,
    };

    // Obtener carrito actual del localStorage
    const cartKey = `cart_store_${storeId}`;
    let currentCart = [];
    
    try {
      const savedCart = localStorage.getItem(cartKey);
      if (savedCart) {
        currentCart = JSON.parse(savedCart);
      }
    } catch (error) {
      console.error('Error loading cart:', error);
    }

    // Verificar si el producto ya está en el carrito
    const existingItemIndex = currentCart.findIndex((item: any) => item.id === product.id);
    
    if (existingItemIndex >= 0) {
      // Incrementar cantidad
      currentCart[existingItemIndex].quantity += 1;
    } else {
      // Agregar nuevo producto
      currentCart.push(cartProduct);
    }

    // Guardar carrito actualizado
    localStorage.setItem(cartKey, JSON.stringify(currentCart));

    // Redirigir a SimpleCatalog
    setLocation(`/simple-catalog?store=${storeId}`);
  };

  const handleGoToCatalog = () => {
    setLocation(`/simple-catalog?store=${storeId}`);
  };

  const getMetaTags = () => {
    if (!product) return null;

    const productImage = getProductImage();
    const absoluteImageUrl = productImage.startsWith('http') 
      ? productImage 
      : `${window.location.origin}${productImage}`;
    
    const productUrl = `${window.location.origin}/share-product?productId=${productId}&store=${storeId}`;
    const productPrice = formatPrice(product.price, product.baseCurrency);

    return (
      <Helmet>
        <title>{product.name} - Comprar Ahora</title>
        <meta name="description" content={product.description || `${product.name} - ${productPrice}`} />
        
        {/* Open Graph / WhatsApp */}
        <meta property="og:type" content="product" />
        <meta property="og:title" content={product.name} />
        <meta property="og:description" content={`${product.name} - ${productPrice}`} />
        <meta property="og:image" content={absoluteImageUrl} />
        <meta property="og:image:secure_url" content={absoluteImageUrl} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={product.name} />
        <meta property="og:url" content={productUrl} />
        <meta property="og:site_name" content={storeInfo?.name || 'Tienda'} />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={product.name} />
        <meta name="twitter:description" content={`${product.name} - ${productPrice}`} />
        <meta name="twitter:image" content={absoluteImageUrl} />
      </Helmet>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-green-600 mx-auto mb-4" />
          <p className="text-gray-600">Cargando producto...</p>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-100 p-4">
        <div className="text-center bg-white rounded-xl shadow-lg p-8 max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Producto no disponible</h2>
          <p className="text-gray-600 mb-6">El producto que buscas no está disponible</p>
          <Button onClick={handleGoToCatalog} className="w-full bg-green-600 hover:bg-green-700">
            Ver Catálogo Completo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {getMetaTags()}
      
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50">
        {/* Header con botón volver */}
        <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleGoToCatalog}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver al catálogo
            </Button>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-6 md:py-10">
          {/* Card del producto */}
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            {/* Imagen */}
            <div className="relative bg-gradient-to-br from-green-50 to-emerald-100">
              <img
                src={getProductImage()}
                alt={product.name}
                className="w-full h-80 md:h-96 object-contain"
                onError={(e) => {
                  e.currentTarget.src = DEFAULT_PRODUCT_IMAGE;
                }}
              />
              {product.category && (
                <div className="absolute top-4 left-4">
                  <span className="bg-green-600 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg">
                    {product.category}
                  </span>
                </div>
              )}
            </div>

            {/* Contenido */}
            <div className="p-6 md:p-8">
              {/* Nombre y marca */}
              <div className="mb-4">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                  {product.name}
                </h1>
                {product.brand && (
                  <p className="text-gray-500 font-medium">Marca: {product.brand}</p>
                )}
              </div>

              {/* Precio */}
              <div className="mb-6">
                <div className="inline-flex items-baseline gap-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-4 rounded-2xl shadow-lg">
                  <span className="text-sm opacity-90">Precio:</span>
                  <span className="text-3xl md:text-4xl font-bold">
                    {formatPrice(product.price, product.baseCurrency || product.currency)}
                  </span>
                </div>
              </div>

              {/* 🎁 FIDELIZACIÓN - Puntos de lealtad */}
              {product.loyaltyPointsPropertyName && product.loyaltyPointsValue && (
                <div className="mb-6 p-4 bg-amber-50 border-2 border-amber-200 rounded-xl">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🎁</span>
                    <div>
                      <p className="text-sm text-amber-700 font-medium">Puntos de Lealtad</p>
                      <p className="text-lg md:text-xl font-bold text-amber-600">
                        {product.loyaltyPointsValue} {product.loyaltyPointsPropertyName}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Descripción */}
              {product.description && (
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Descripción</h3>
                  <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                    {product.description}
                  </p>
                </div>
              )}

              {/* Botones de acción - ACTUALIZADOS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <Button 
                  onClick={handleWhatsAppOrder}
                  className="w-full bg-green-600 hover:bg-green-700 text-white py-6 text-lg font-semibold rounded-xl shadow-lg flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-5 h-5" />
                  Comprar por WhatsApp
                </Button>
                
                <Button 
                  onClick={handleAddToCartAndContinue}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6 text-lg font-semibold rounded-xl shadow-lg flex items-center justify-center gap-2"
                >
                  <ShoppingCart className="w-5 h-5" />
                  Agregar al Carrito
                </Button>
              </div>

              {/* Info adicional */}
              <div className="border-t pt-6">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <MessageCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-semibold text-green-900 mb-1">¿Necesitas ayuda?</h4>
                      <p className="text-sm text-green-700">
                        Contacta con nosotros por WhatsApp para más información sobre este producto o agrégalo al carrito para seguir comprando en nuestro catálogo web.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer info */}
          <div className="mt-6 text-center text-sm text-gray-500">
            <p>Compartido desde {storeInfo?.name || 'nuestra tienda'}</p>
          </div>
        </div>
      </div>
    </>
  );
}