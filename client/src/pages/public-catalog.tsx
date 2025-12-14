import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { 
  Search, 
  MessageCircle, 
  ShoppingBag, 
  Plus, 
  Minus, 
  Trash2, 
  ShoppingCart, 
  X, 
  ChevronLeft, 
  ChevronRight,
  Star
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CartItem {
  id: number;
  productId: number;
  name: string;
  price: number;
  quantity: number;
  category: string;
}

interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  type: string;
  isActive: boolean;
  imageUrl?: string;
  images?: string[];
  stock?: number;
  sku?: string;
  storeId?: number;
  status?: string;
}

interface Category {
  id: number;
  name: string;
  storeId?: number;
}

export default function PublicCatalogFixed() {
  const { toast } = useToast();
  
  // Estados principales
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Obtener storeId desde los parámetros de la URL
  const getStoreIdFromUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const storeParam = urlParams.get('store');
    return storeParam ? parseInt(storeParam, 10) : 1;
  };
  
  const [storeId, setStoreId] = useState(getStoreIdFromUrl());

  // Escuchar cambios en la URL para actualizar el storeId
  useEffect(() => {
    const handleUrlChange = () => {
      const newStoreId = getStoreIdFromUrl();
      if (newStoreId !== storeId) {
        setStoreId(newStoreId);
      }
    };

    window.addEventListener('popstate', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, [storeId]);

  // Obtener productos con filtrado por tienda
  const { data: allProducts = [], isLoading: loadingProducts } = useQuery({
    queryKey: ["/api/products", storeId],
    queryFn: () => fetch('/api/products').then(res => res.json()),
    select: (data: Product[]) => {
      return Array.isArray(data) 
        ? data.filter((product: Product) => {
            const isActive = product.isActive || product.status === "active";
            if (!isActive) return false;
            
            return !product.storeId || product.storeId === storeId;
          })
        : [];
    }
  });

  // Obtener categorías con filtrado por tienda
  const { data: allCategories = [], isLoading: loadingCategories } = useQuery({
    queryKey: ["/api/categories", storeId],
    queryFn: () => fetch('/api/categories').then(res => res.json()),
    select: (data: Category[]) => {
      return Array.isArray(data) 
        ? data.filter((category: Category) => {
            return !category.storeId || category.storeId === storeId;
          })
        : [];
    }
  });

  // Función para formatear precios
  const formatCurrency = (price: number | string) => {
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    return numPrice.toLocaleString('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // Agregar producto al carrito
  const addToCart = (productId: number, quantity: number = 1) => {
    const product = allProducts.find((p: Product) => p.id === productId);
    if (!product) return;

    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.productId === productId);
      if (existingItem) {
        return prevCart.map(item =>
          item.productId === productId
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      } else {
        const newItem: CartItem = {
          id: Date.now(),
          productId: product.id,
          name: product.name,
          price: product.price,
          quantity: quantity,
          category: product.category
        };
        return [...prevCart, newItem];
      }
    });

    // Mostrar notificación con toast
    toast({
      title: "¡Producto agregado!",
      description: `${product.name} se agregó al carrito`,
    });
  };

  // Actualizar cantidad en carrito
  const updateCartQuantity = (productId: number, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(productId);
      return;
    }
    
    setCart(prevCart =>
      prevCart.map(item =>
        item.productId === productId
          ? { ...item, quantity: newQuantity }
          : item
      )
    );
  };

  // Remover del carrito
  const removeFromCart = (productId: number) => {
    setCart(prevCart => prevCart.filter(item => item.productId !== productId));
  };

  // Limpiar carrito
  const clearCart = () => {
    setCart([]);
  };

  // Calcular total del carrito
  const cartTotal = cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  const cartItemsCount = cart.reduce((total, item) => total + item.quantity, 0);

  // Abrir modal de producto
  const openProductModal = (product: Product) => {
    setSelectedProduct(product);
    setCurrentImageIndex(0);
  };

  // Enviar pedido por WhatsApp
  const sendToWhatsApp = () => {
    if (cart.length === 0) {
      toast({
        title: "Carrito vacío",
        description: "Agrega productos antes de hacer el pedido",
        variant: "destructive",
      });
      return;
    }

    const whatsappNumber = '5215512345678';
    
    let message = `🛍️ *NUEVO PEDIDO - Tienda ${storeId}*\n\n`;
    
    cart.forEach((item, index) => {
      message += `${index + 1}. ${item.name}\n`;
       message += `  [*${item.id}*]\n`;
      message += `   Cantidad: ${item.quantity}\n`;
      message += `   Precio unitario: $${formatCurrency(item.price)}\n`;
      message += `   Subtotal: $${formatCurrency(item.price * item.quantity)}\n\n`;
    });
    
    message += `💰 *TOTAL: $${formatCurrency(cartTotal)}*\n\n`;
    message += "Por favor confirma tu pedido y proporciona tu dirección de entrega.";
    
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

    window.open(whatsappUrl, '_blank');
    setShowCart(false);
    
    // Mostrar confirmación usando toast
    toast({
      title: "¡Pedido enviado!",
      description: "Redirigiendo a WhatsApp...",
    });
  };

  // Navegar imágenes
  const nextImage = () => {
    if (selectedProduct && selectedProduct.images) {
      setCurrentImageIndex((prev) => (prev + 1) % selectedProduct.images!.length);
    }
  };

  const prevImage = () => {
    if (selectedProduct && selectedProduct.images) {
      setCurrentImageIndex((prev) => (prev - 1 + selectedProduct.images!.length) % selectedProduct.images!.length);
    }
  };

  // Filtrar productos
  const filteredProducts = allProducts.filter((product: Product) => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (product.description || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Mostrar estado de carga
  if (loadingProducts || loadingCategories) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-white border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-white text-lg font-medium">Cargando catálogo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600">
      {/* Header */}
      <div className="bg-white/10 backdrop-blur-sm border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col space-y-4">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">
                🛍️ Catálogo - Tienda {storeId}
              </h1>
              <div className="flex items-center gap-3">
                <div className="hidden sm:block text-sm text-white/90 bg-white/20 px-3 py-1 rounded-full">
                  {filteredProducts.length} productos disponibles
                </div>
                {/* Botón del carrito */}
                <Button
                  onClick={() => setShowCart(true)}
                  className="relative bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-sm"
                >
                  <ShoppingCart className="w-5 h-5" />
                  {cartItemsCount > 0 && (
                    <Badge className="absolute -top-2 -right-2 bg-orange-500 border-0 text-white rounded-full min-w-[20px] h-5 flex items-center justify-center text-xs px-1">
                      {cartItemsCount}
                    </Badge>
                  )}
                </Button>
              </div>
            </div>

            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 w-5 h-5" />
                <Input
                  placeholder="🔍 Buscar productos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-white/90 backdrop-blur-sm border-white/30 text-gray-800 placeholder:text-gray-500 focus:bg-white h-11 rounded-full"
                />
              </div>
              
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full sm:w-48 bg-white/90 backdrop-blur-sm border-white/30 text-gray-800 focus:bg-white h-11 rounded-full">
                  <SelectValue placeholder="Todas las categorías" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">📁 Todas las categorías</SelectItem>
                  {allCategories.map((category: Category) => (
                    <SelectItem key={category.id} value={category.name}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingBag className="w-20 h-20 text-white/50 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">
              No se encontraron productos
            </h2>
            <p className="text-white/80">
              Intenta cambiar los filtros de búsqueda
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts.map((product: Product) => (
            <Card
  key={product.id}
  className="overflow-hidden hover:shadow-lg transition-shadow"
>
  <div
    onClick={() => openProductModal(product)}
    className="cursor-pointer"
  >
    <CardHeader className="pb-4">
      <div className="w-full h-48 bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg overflow-hidden relative">
        {product.images.length ? (
          <>
            <img
              src={product.images[0]}
              alt={product.name}
              className="w-full h-full object-cover"
              crossOrigin="anonymous"         
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                const stub = (e.target as HTMLElement)
                  .nextElementSibling as HTMLElement;
                if (stub) stub.style.display = "flex";
              }}
            />
            <div
              className="w-full h-full bg-gradient-to-br from-slate-50 to-slate-100
                         flex items-center justify-center absolute inset-0"
              style={{ display: "none" }}           // fallback invisible
            >
              <ShoppingBag className="w-16 h-16 text-primary" />
            </div>

            {product.images.length > 1 && (
              <div className="absolute top-2 right-2 bg-black/60 text-white
                              text-xs px-2 py-1 rounded-full">
                +{product.images.length - 1}
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingBag className="w-16 h-16 text-blue-600" />
          </div>
        )}
      </div>

      <CardTitle className="text-lg line-clamp-2">
        {product.name}
      </CardTitle>
      <CardDescription className="text-sm text-gray-600 line-clamp-3">
        {product.description || "Producto de alta calidad"}
      </CardDescription>
    </CardHeader>

    <CardContent className="pt-0">
      <div className="flex items-center justify-between mb-4">
        <div className="text-2xl font-bold text-green-600">
          ${formatCurrency(product.price)}
        </div>
        <Badge variant="secondary">{product.category}</Badge>
      </div>
    </CardContent>
  </div>

  <CardContent className="pt-0 pb-4">
    <Button
      onClick={(e) => {
        e.stopPropagation();
        addToCart(product.id);
      }}
      className="w-full bg-blue-600 hover:bg-blue-700 text-white"
    >
      <Plus className="w-4 h-4 mr-2" />
      Agregar
    </Button>
  </CardContent>
</Card>

            ))}
          </div>
        )}
      </div>

      {/* Botón flotante del carrito (móvil) */}
      {cartItemsCount > 0 && (
        <div className="fixed bottom-6 right-6 z-40 sm:hidden">
          <Button
            onClick={() => setShowCart(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white shadow-lg rounded-full w-14 h-14 flex items-center justify-center border-0"
          >
            <ShoppingCart className="w-6 h-6" />
            <Badge className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full min-w-[24px] h-6 flex items-center justify-center text-xs border-0">
              {cartItemsCount}
            </Badge>
          </Button>
        </div>
      )}

      {/* Modal del carrito */}
      {showCart && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
            <div className="p-6 border-b flex items-center justify-between bg-gradient-to-r from-primary to-primary/80 text-white">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <ShoppingCart className="w-6 h-6" />
                Carrito de Compras
              </h2>
              <Button 
                variant="ghost" 
                onClick={() => setShowCart(false)}
                className="text-white hover:bg-white/20 rounded-full"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[50vh]">
              {cart.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingCart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">Tu carrito está vacío</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {cart.map((item) => (
                    <div key={item.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{item.name}</h3>
                        <p className="text-sm text-gray-500">{item.category}</p>
                        <p className="font-bold text-primary">${formatCurrency(item.price)}</p>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <div className="flex items-center bg-white rounded-lg border">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateCartQuantity(item.productId, item.quantity - 1)}
                            className="h-8 w-8 p-0 hover:bg-gray-100"
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="px-3 py-1 text-sm font-medium min-w-[2rem] text-center">
                            {item.quantity}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateCartQuantity(item.productId, item.quantity + 1)}
                            className="h-8 w-8 p-0 hover:bg-gray-100"
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFromCart(item.productId)}
                          className="h-8 w-8 p-0 text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {cart.length > 0 && (
              <div className="p-6 border-t bg-gray-50">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-lg font-bold text-gray-900">
                    Total: <span className="text-primary">${formatCurrency(cartTotal)}</span>
                  </span>
                  <Button 
                    variant="outline" 
                    onClick={clearCart}
                    className="text-gray-600 hover:text-red-600 border-gray-300"
                  >
                    Limpiar carrito
                  </Button>
                </div>
                
                <Button
                  onClick={sendToWhatsApp}
                  className="w-full bg-green-600 hover:bg-green-700 text-white h-12 rounded-full text-lg font-medium border-0"
                >
                  <MessageCircle className="w-5 h-5 mr-2" />
                  Enviar por WhatsApp
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de producto */}
      {selectedProduct && (
        <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl">
            <DialogTitle className="text-2xl font-bold text-gray-900">
              {selectedProduct.name}
            </DialogTitle>
            
            <div className="space-y-6 mt-4">
              {/* Galería de imágenes */}
              {selectedProduct.images && selectedProduct.images.length > 0 ? (
                <div className="space-y-4">
                  <div className="relative rounded-xl overflow-hidden bg-gray-100">
                    <img
                      src={selectedProduct.images[currentImageIndex]}
                      alt={selectedProduct.name}
                      className="w-full h-[400px] object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const fallback = target.nextElementSibling as HTMLDivElement;
                        if (fallback) fallback.style.display = 'flex';
                      }}
                    />
                    <div className="w-full h-[400px] bg-gray-100 flex items-center justify-center absolute inset-0" style={{ display: 'none' }}>
                      <ShoppingBag className="w-24 h-24 text-gray-400" />
                    </div>
                    
                    {selectedProduct.images.length > 1 && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 hover:bg-white backdrop-blur-sm"
                          onClick={prevImage}
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 hover:bg-white backdrop-blur-sm"
                          onClick={nextImage}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                        
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-3 py-1 rounded-full text-sm backdrop-blur-sm">
                          {currentImageIndex + 1} / {selectedProduct.images.length}
                        </div>
                      </>
                    )}
                  </div>
                  
                  {/* Miniaturas */}
                  {selectedProduct.images.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {selectedProduct.images.map((image, index) => (
                        <div
                          key={index}
                          className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                            index === currentImageIndex 
                              ? 'border-teal-500 shadow-lg' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          onClick={() => setCurrentImageIndex(index)}
                        >
                          <img
                            src={image}
                            alt={`${selectedProduct.name} ${index + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const fallback = target.nextElementSibling as HTMLDivElement;
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                          <div className="w-full h-full bg-gray-100 flex items-center justify-center absolute inset-0" style={{ display: 'none' }}>
                            <ShoppingBag className="w-6 h-6 text-gray-400" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-[400px] bg-gray-100 flex items-center justify-center rounded-xl">
                  <ShoppingBag className="w-24 h-24 text-gray-400" />
                </div>
              )}
              
              {/* Información del producto */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-3xl font-bold text-primary">
                    ${formatCurrency(selectedProduct.price)}
                  </div>
                  <Badge className="bg-primary/10 text-primary border-0 text-sm px-3 py-1">
                    {selectedProduct.category}
                  </Badge>
                </div>
                
                <p className="text-gray-600 text-lg leading-relaxed">
                  {selectedProduct.description || "Producto de alta calidad"}
                </p>
                
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                  ))}
                  <span className="text-sm text-gray-600 ml-2">(5.0)</span>
                </div>
                
                <Button
                  onClick={() => {
                    addToCart(selectedProduct.id);
                    setSelectedProduct(null);
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-lg rounded-full font-medium border-0"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Agregar al carrito
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}