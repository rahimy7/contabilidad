import React, { useState, useEffect } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ShoppingBag, Plus, Minus, ShoppingCart, Package, Eye, X, ChevronLeft, ChevronRight } from 'lucide-react';

// ✅ FUNCIÓN para hacer requests a endpoints públicos
const fetchPublicData = async (endpoint: string) => {
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
};

// Modal de detalle del producto
const ProductDetailModal = ({ product, isOpen, onClose, onAddToCart }: { 
  product: any; 
  isOpen: boolean; 
  onClose: () => void;
  onAddToCart: (product: any) => void;
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageError, setImageError] = useState(false);

  if (!isOpen || !product) return null;

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

  const formatCurrency = (amount: number | string) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 0
    }).format(numAmount);
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
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
              <div className="aspect-square bg-gradient-to-br from-emerald-100 to-teal-100 rounded-lg relative overflow-hidden">
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
                  <Badge variant="outline" className="text-xs">
                    {product.brand}
                  </Badge>
                  <Badge variant={product.is_service ? 'secondary' : 'default'}>
                    {product.is_service ? '🔧 Servicio' : '📦 Producto'}
                  </Badge>
                </div>
                
                <div className="text-3xl font-bold text-emerald-600 mb-4">
                  {formatCurrency(product.price)}
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
                {product.delivery_required && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Entrega:</span>
                    <span className="font-medium">Delivery disponible</span>
                  </div>
                )}
              </div>

              {/* Botones de acción */}
              <div className="flex gap-3 pt-4">
                <Button 
                  onClick={() => {
                    onAddToCart(product);
                    onClose();
                  }}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
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

// Componente para mostrar imágenes
const ProductImage = ({ product, className = "", onClick }: { product: any; className?: string; onClick?: () => void }) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const getImageUrl = () => {
    if (product.image_url) return product.image_url;
    if (product.images && product.images.length > 0) return product.images[0];
    if (product.imageUrl) return product.imageUrl;
    return null;
  };

  const imageUrl = getImageUrl();

  const handleImageError = () => {
    setImageError(true);
    setImageLoading(false);
  };

  const handleImageLoad = () => {
    setImageLoading(false);
    setImageError(false);
  };

  React.useEffect(() => {
    setImageError(false);
    setImageLoading(true);
  }, [product.id]);

  const ImagePlaceholder = () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-emerald-100 to-teal-100">
      <Package className="w-12 h-12 text-emerald-400 mb-2" />
      <span className="text-xs text-emerald-600 font-medium text-center px-2">
        {product.name?.slice(0, 20)}...
      </span>
    </div>
  );

  if (!imageUrl || imageError) {
    return (
      <div className={`cursor-pointer ${className}`} onClick={onClick}>
        <ImagePlaceholder />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden cursor-pointer ${className}`} onClick={onClick}>
      {imageLoading && (
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center">
          <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
        </div>
      )}
      <img
        src={imageUrl}
        alt={product.name || 'Producto'}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        onError={handleImageError}
        onLoad={handleImageLoad}
        style={{
          display: imageLoading ? 'none' : 'block'
        }}
      />
      {/* Overlay con icono de vista */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center">
        <Eye className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>
      {/* Indicador de múltiples imágenes */}
      {product.images && product.images.length > 1 && (
        <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
          +{product.images.length}
        </div>
      )}
    </div>
  );
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

  // Funciones de utilidad
  const formatCurrency = (amount: number | string) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 0
    }).format(numAmount);
  };

  // Filtrado de productos
  const filteredProducts = Array.isArray(products) ? products.filter((product: any) => {
    if (!product) return false;
    const matchesSearch = product.name && product.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  }) : [];

  // Gestión del carrito
  const addToCart = (product: any) => {
    setCart(currentCart => {
      const existingItem = currentCart.find(item => item.id === product.id);
      if (existingItem) {
        return currentCart.map(item =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...currentCart, { ...product, quantity: 1 }];
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

  const getCartTotal = () => {
    return cart.reduce((total, item) => total + (parseFloat(item.price) * item.quantity), 0);
  };

  const getCartItemsCount = () => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  };

  const makeOrder = () => {
    if (cart.length === 0) return;
    
    // Crear mensaje del pedido con formato específico
    const storeName = storeInfo?.name || 'TIENDA';
    const orderItems = cart.map((item, index) => 
      `${index + 1}. *${item.name}*[ID:${item.id}]
   Cantidad: ${item.quantity}
   Precio unitario: ${formatCurrency(item.price)}
   Subtotal: ${formatCurrency(parseFloat(item.price) * item.quantity)}`
    ).join('\n');
    
    const orderMessage = `🛍️ *NUEVO PEDIDO - ${storeName.toUpperCase()}*

${orderItems}

💰 *TOTAL: ${formatCurrency(getCartTotal())}*

📋 Por favor confirma la disponibilidad y tiempo de entrega.
¡Gracias por tu preferencia! 🙏`;
    
    // Abrir WhatsApp
    const phoneNumber = storeInfo?.whatsapp || '18295551234';
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(orderMessage)}`;
    
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600 text-lg">Cargando catálogo de la tienda...</p>
          {storeId && <p className="text-gray-500 text-sm mt-2">Tienda ID: {storeId}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 relative">
      {/* Header Dinámico */}
      <div className="sticky top-0 bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500 shadow-lg z-30 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {!isScrolled ? (
            /* Header completo */
            <div className="py-6">
              <div className="flex flex-col space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h1 className="text-3xl font-bold text-white">
                      🛍️ {storeInfo?.name || 'Catálogo'}
                    </h1>
                    {storeInfo?.description && (
                      <p className="text-emerald-100 mt-1">{storeInfo.description}</p>
                    )}
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
          ) : (
            /* Header compacto al hacer scroll */
            <div className="py-3">
              <div className="flex items-center gap-4">
                <h1 className="text-lg font-bold text-white whitespace-nowrap">
                  🛍️ {storeInfo?.name || 'Catálogo'}
                </h1>
                
                <div className="flex-1 max-w-md relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-emerald-600 w-4 h-4" />
                  <Input
                    placeholder="🔍 Buscar..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 border-white/30 bg-white/90 text-gray-800 placeholder:text-emerald-600/70 focus:bg-white focus:border-emerald-300 rounded-full h-10"
                  />
                </div>

                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-32 border-white/30 bg-white/90 text-gray-800 focus:bg-white focus:border-emerald-300 rounded-full h-10">
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

                <div className="text-xs text-emerald-100 bg-white/20 px-2 py-1 rounded-full">
                  {filteredProducts.length}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de detalle del producto */}
      <ProductDetailModal
        product={selectedProduct}
        isOpen={showProductDetail}
        onClose={closeProductDetail}
        onAddToCart={addToCart}
      />

      {/* Botón flotante del carrito */}
      {getCartItemsCount() > 0 && !showCart && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button
            onClick={() => setShowCart(!showCart)}
            className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-2xl rounded-full w-16 h-16 p-0 relative animate-bounce"
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
        <div className="fixed inset-0 bg-black/50 z-40">
          <div className="fixed right-0 top-0 h-full w-80 bg-white shadow-xl p-6 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Carrito de Compras</h2>
              <Button
                variant="ghost"
                onClick={() => setShowCart(false)}
                className="p-2"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            
            {cart.length === 0 ? (
              <p className="text-gray-500 text-center mt-8">Tu carrito está vacío</p>
            ) : (
              <>
                <div className="space-y-4 mb-6">
                  {cart.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-3 border rounded-lg">
                      <div className="w-12 h-12 rounded-lg overflow-hidden">
                        <ProductImage product={item} onClick={() => {}} />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-sm">{item.name}</h4>
                        <p className="text-emerald-600 font-bold">{formatCurrency(item.price)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => removeFromCart(item.id)}
                          className="w-8 h-8 p-0"
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <span className="font-medium">{item.quantity}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => addToCart(item)}
                          className="w-8 h-8 p-0"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="border-t pt-4">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-lg font-bold">Total:</span>
                    <span className="text-xl font-bold text-emerald-600">
                      {formatCurrency(getCartTotal())}
                    </span>
                  </div>
                  <Button 
                    onClick={makeOrder}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                  >
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Hacer Pedido
                  </Button>
                </div>
              </>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts.map((product: any) => (
              <Card key={product.id} className="group hover:shadow-xl transition-all duration-300 border-0 bg-white/80 backdrop-blur-sm hover:bg-white/95">
                <CardContent className="p-0">
                  <div className="aspect-square rounded-t-lg relative overflow-hidden">
                    <ProductImage 
                      product={product} 
                      className="w-full h-full" 
                      onClick={() => openProductDetail(product)}
                    />
                    <div className="absolute top-3 right-3">
                      <Badge variant={product.is_service ? 'secondary' : 'default'} className="bg-white/90 text-emerald-700">
                        {product.is_service ? '🔧 Servicio' : '📦 Producto'}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="p-4">
                    <h3 className="font-semibold text-lg text-gray-900 mb-2 line-clamp-2 group-hover:text-emerald-600 transition-colors">
                      {product.name}
                    </h3>
                    
                    <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                      {product.description}
                    </p>

                    <div className="flex items-center justify-between mb-4">
                      <div className="text-2xl font-bold text-emerald-600">
                        {formatCurrency(product.price)}
                      </div>
                      {product.brand && (
                        <Badge variant="outline" className="text-xs">
                          {product.brand}
                        </Badge>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        onClick={() => addToCart(product)}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Agregar
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => openProductDetail(product)}
                        className="px-3"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}