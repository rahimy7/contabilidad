// client/src/pages/share-product.tsx
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertCircle, MessageCircle, ShoppingCart, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Helmet } from 'react-helmet-async';

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
}

interface StoreInfo {
  id: number;
  name: string;
  phone?: string;
  whatsappNumber?: string;
}

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
    return 'https://via.placeholder.com/800x600/25D366/FFFFFF?text=Producto';
  };

  const formatPrice = (price: string | undefined, currency: string = 'DOP') => {
    if (!price) return 'Precio no disponible';
    const numPrice = parseFloat(price);
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: currency === 'USD' ? 'USD' : 'DOP',
    }).format(numPrice);
  };

  const handleWhatsAppOrder = () => {
    if (!product || !storeInfo) return;
    
    const phone = storeInfo.whatsappNumber || storeInfo.phone || '';
    const message = `¡Hola! Me interesa el producto:\n\n*${product.name}*\n${formatPrice(product.price, product.baseCurrency)}\n\n¿Está disponible?`;
    
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
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
                  e.currentTarget.src = 'https://via.placeholder.com/800x600/25D366/FFFFFF?text=Sin+Imagen';
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

              {/* Descripción */}
              {product.description && (
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Descripción</h3>
                  <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                    {product.description}
                  </p>
                </div>
              )}

              {/* Botones de acción */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <Button 
                  onClick={handleWhatsAppOrder}
                  className="w-full bg-green-600 hover:bg-green-700 text-white py-6 text-lg font-semibold rounded-xl shadow-lg flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-5 h-5" />
                  Comprar por WhatsApp
                </Button>
                
                <Button 
                  onClick={handleGoToCatalog}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6 text-lg font-semibold rounded-xl shadow-lg flex items-center justify-center gap-2"
                >
                  <ShoppingCart className="w-5 h-5" />
                  Ver Catálogo Web
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
                        Contacta con nosotros por WhatsApp para más información sobre este producto o realiza tu pedido directamente en nuestro catálogo web.
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