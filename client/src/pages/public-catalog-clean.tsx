import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Search, MessageCircle, Star, ShoppingBag, Plus, Minus, Trash2, ShoppingCart, Filter, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Product, ProductCategory } from "@shared/schema";

type ProductWithCategory = Product & { category: ProductCategory };

interface CartItem {
  id: number;
  product: any;
  quantity: number;
}

export default function PublicCatalogClean() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Obtener productos
  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ["/api/products"],
  });

  // Obtener categorías
  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: ["/api/categories"],
  });

  // Cargar carrito desde localStorage al iniciar
  useEffect(() => {
    const savedCart = localStorage.getItem("publicCatalogCart");
    if (savedCart) {
      try {
        setCart(JSON.parse(savedCart));
      } catch (error) {
        console.error("Error loading cart:", error);
      }
    }
  }, []);

  // Guardar carrito en localStorage cuando cambie
  useEffect(() => {
    localStorage.setItem("publicCatalogCart", JSON.stringify(cart));
  }, [cart]);

  // Agregar producto al carrito
  const addToCart = (product: any) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.product.id === product.id);
      if (existingItem) {
        return prevCart.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      } else {
        return [...prevCart, { id: Date.now(), product, quantity: 1 }];
      }
    });

    toast({
      title: "Producto agregado",
      description: `${product.name} agregado al carrito`,
    });
  };

  // Actualizar cantidad en carrito
  const updateQuantity = (itemId: number, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(itemId);
      return;
    }
    setCart(prevCart =>
      prevCart.map(item =>
        item.id === itemId ? { ...item, quantity: newQuantity } : item
      )
    );
  };

  // Remover del carrito
  const removeFromCart = (itemId: number) => {
    setCart(prevCart => prevCart.filter(item => item.id !== itemId));
  };

  // Calcular total del carrito
  const getCartTotal = () => {
    return cart.reduce((total, item) => {
      const price = parseFloat(item.product.price) || 0;
      return total + (price * item.quantity);
    }, 0);
  };

  // Obtener cantidad total de items
  const getTotalItems = () => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  };

  // Enviar carrito por WhatsApp
  const sendCartToWhatsApp = () => {
    if (cart.length === 0) {
      toast({
        title: "Carrito vacío",
        description: "Agrega productos al carrito antes de enviar",
        variant: "destructive",
      });
      return;
    }

    const cartMessage = cart.map(item => 
      `• ${item.product.name} - Cantidad: ${item.quantity} - Precio: $${item.product.price} c/u`
    ).join('\n');

    const total = getCartTotal();
    const whatsappMessage = `¡Hola! Me interesa cotizar estos productos:\n\n${cartMessage}\n\nSubtotal: $${total.toFixed(2)}\n\n¿Podrían ayudarme con más información y el costo de instalación?`;
    const whatsappUrl = `https://wa.me/5215512345678?text=${encodeURIComponent(whatsappMessage)}`;

    window.open(whatsappUrl, '_blank');

    toast({
      title: "Redirigiendo a WhatsApp",
      description: "Se abrirá WhatsApp con tu lista de productos",
    });
  };

  // Obtener imágenes de producto (simular múltiples imágenes)
  const getProductImages = (product: any) => {
    // Simular múltiples imágenes por producto
    const baseImages = [
      'https://via.placeholder.com/400x300/3B82F6/FFFFFF?text=Imagen+1',
      'https://via.placeholder.com/400x300/10B981/FFFFFF?text=Imagen+2',
      'https://via.placeholder.com/400x300/F59E0B/FFFFFF?text=Imagen+3',
    ];
    return baseImages;
  };

  // Abrir galería de imágenes
  const openImageGallery = (product: any, imageIndex: number = 0) => {
    setSelectedProduct(product);
    setCurrentImageIndex(imageIndex);
  };

  // Navegar imágenes en galería
  const nextImage = () => {
    if (selectedProduct) {
      const images = getProductImages(selectedProduct);
      setCurrentImageIndex((prev) => (prev + 1) % images.length);
    }
  };

  const prevImage = () => {
    if (selectedProduct) {
      const images = getProductImages(selectedProduct);
      setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
    }
  };

  // Filtrar productos
  const filteredProducts = products.filter((product: any) => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (product.description || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || product.category === selectedCategory;
    const isActive = product.status === "active";
    return matchesSearch && matchesCategory && isActive;
  });

  if (loadingProducts || loadingCategories) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header fijo móvil */}
      <div className="bg-white border-b sticky top-0 z-40 shadow-sm">
        <div className="px-4 py-3">
          {/* Header principal */}
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg md:text-2xl font-bold text-gray-900">Catálogo</h1>
            <div className="flex items-center gap-2">
              {/* Botón filtros móvil */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="md:hidden"
              >
                <Filter className="w-4 h-4" />
              </Button>
              <span className="text-sm text-gray-600 hidden md:block">
                {filteredProducts.length} productos
              </span>
            </div>
          </div>
          
          {/* Barra de búsqueda */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Buscar productos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-10"
              />
            </div>
            
            {/* Selector categoría desktop */}
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="hidden md:flex w-48">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {categories.filter((category: any) => !!category.name).map((category: any) => (
                  <SelectItem key={category.id} value={category.name}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Panel filtros móvil */}
          {showFilters && (
            <div className="mt-3 md:hidden">
              <Select value={selectedCategory} onValueChange={(value) => {
                setSelectedCategory(value);
                setShowFilters(false);
              }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {categories.filter((category: any) => !!category.name).map((category: any) => (
                    <SelectItem key={category.id} value={category.name}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          {/* Contador móvil */}
          <div className="mt-2 text-center text-sm text-gray-600 md:hidden">
            {filteredProducts.length} productos encontrados
          </div>
        </div>
      </div>

      {/* Productos */}
      <div className="px-4 py-4 md:py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
          {filteredProducts.map((product: any) => {
            const images = getProductImages(product);
            return (
              <Card key={product.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <CardHeader className="pb-4">
                  {/* Imagen clickeable */}
                  <div 
                    className="w-full h-48 bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg flex items-center justify-center cursor-pointer relative overflow-hidden group"
                    onClick={() => openImageGallery(product, 0)}
                  >
                    <img 
                      src={images[0]} 
                      alt={product.name}
                      className="w-full h-full object-cover rounded-lg group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white bg-opacity-90 rounded-full p-2">
                        <Search className="w-5 h-5 text-gray-700" />
                      </div>
                    </div>
                    {/* Indicador de múltiples imágenes */}
                    {images.length > 1 && (
                      <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
                        +{images.length - 1} más
                      </div>
                    )}
                  </div>
                  <CardTitle className="text-lg line-clamp-2 mt-3">{product.name}</CardTitle>
                  <CardDescription className="text-sm text-gray-600 line-clamp-2">
                    {product.description || "Producto de alta calidad"}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xl md:text-2xl font-bold text-green-600">
                      ${product.price}
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {product.category}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3 h-3 md:w-4 md:h-4 fill-yellow-400 text-yellow-400" />
                    ))}
                    <span className="text-xs md:text-sm text-gray-600 ml-1">4.5</span>
                  </div>
                  
                  <Button
                    onClick={() => addToCart(product)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white h-9 md:h-10"
                    size="sm"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    <span className="text-sm">Agregar</span>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Modal de galería de imágenes */}
      <Dialog open={!!selectedProduct} onOpenChange={() => setSelectedProduct(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0">
          {selectedProduct && (
            <div className="relative">
              {/* Imagen principal */}
              <div className="relative h-[60vh] md:h-[70vh] bg-black">
                <img 
                  src={getProductImages(selectedProduct)[currentImageIndex]} 
                  alt={selectedProduct.name}
                  className="w-full h-full object-contain"
                />
                
                {/* Botones de navegación */}
                {getProductImages(selectedProduct).length > 1 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 hover:bg-white"
                      onClick={prevImage}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 hover:bg-white"
                      onClick={nextImage}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </>
                )}
                
                {/* Botón cerrar */}
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute top-4 right-4 rounded-full bg-white/90 hover:bg-white"
                  onClick={() => setSelectedProduct(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
                
                {/* Indicador de imagen actual */}
                {getProductImages(selectedProduct).length > 1 && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-3 py-1 rounded-full text-sm">
                    {currentImageIndex + 1} / {getProductImages(selectedProduct).length}
                  </div>
                )}
              </div>
              
              {/* Información del producto */}
              <div className="p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-2">
                      {selectedProduct.name}
                    </h3>
                    <p className="text-gray-600 mb-4">
                      {selectedProduct.description || "Producto de alta calidad"}
                    </p>
                    <div className="flex items-center gap-4">
                      <div className="text-2xl md:text-3xl font-bold text-green-600">
                        ${selectedProduct.price}
                      </div>
                      <Badge variant="secondary">
                        {selectedProduct.category}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="flex-shrink-0">
                    <Button
                      onClick={() => {
                        addToCart(selectedProduct);
                        setSelectedProduct(null);
                      }}
                      className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-8"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Agregar al carrito
                    </Button>
                  </div>
                </div>
                
                {/* Miniaturas de imágenes */}
                {getProductImages(selectedProduct).length > 1 && (
                  <div className="flex gap-2 mt-6 overflow-x-auto pb-2">
                    {getProductImages(selectedProduct).map((image, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentImageIndex(index)}
                        className={`flex-shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-lg overflow-hidden border-2 transition-all ${
                          index === currentImageIndex 
                            ? 'border-blue-500 ring-2 ring-blue-200' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <img 
                          src={image} 
                          alt={`Vista ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <div className="bg-white border-t py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">¿Necesitas ayuda?</h3>
          <p className="text-gray-600 mb-4">Contáctanos directamente por WhatsApp para obtener asesoría personalizada</p>
          <Button
            onClick={() => {
              const whatsappUrl = `https://wa.me/5215512345678?text=${encodeURIComponent('¡Hola! Me gustaría obtener más información sobre sus productos y servicios.')}`;
              window.open(whatsappUrl, '_blank');
            }}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            Hablar con un asesor
          </Button>
        </div>
      </div>

      {/* Botón flotante del carrito */}
      {getTotalItems() > 0 && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button
            onClick={() => setShowCart(!showCart)}
            className="bg-green-600 hover:bg-green-700 text-white rounded-full w-16 h-16 shadow-lg relative"
          >
            <ShoppingCart className="w-6 h-6" />
            <Badge className="absolute -top-2 -right-2 bg-red-500 text-white min-w-[24px] h-6 rounded-full flex items-center justify-center text-xs">
              {getTotalItems()}
            </Badge>
          </Button>

          {/* Panel del carrito */}
          {showCart && (
            <div className="absolute bottom-20 right-0 bg-white rounded-lg shadow-xl border w-96 max-h-96 overflow-y-auto">
              <div className="p-4 border-b">
                <h3 className="font-semibold text-lg flex items-center justify-between">
                  Carrito de compras
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCart(false)}
                  >
                    ×
                  </Button>
                </h3>
              </div>

              <div className="p-4 space-y-4">
                {cart.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-3 border rounded-lg">
                    <div className="w-12 h-12 bg-gradient-to-br from-slate-50 to-slate-100 rounded flex items-center justify-center">
                      <ShoppingBag className="w-6 h-6 text-primary" />
                    </div>
                    
                    <div className="flex-1">
                      <h4 className="font-medium text-sm">{item.product.name}</h4>
                      <p className="text-green-600 font-semibold">${item.product.price}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="w-8 h-8 p-0"
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      
                      <span className="w-8 text-center font-medium">{item.quantity}</span>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="w-8 h-8 p-0"
                      >
                        <Plus className="w-3 h-3" />
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeFromCart(item.id)}
                        className="w-8 h-8 p-0 text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 border-t bg-gray-50 rounded-b-lg">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-semibold">Total:</span>
                  <span className="font-bold text-green-600 text-lg">
                    ${getCartTotal().toFixed(2)}
                  </span>
                </div>
                
                <Button
                  onClick={sendCartToWhatsApp}
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                >
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Solicitar por WhatsApp
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}