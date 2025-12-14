import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ShoppingCart as ShoppingCartIcon, Trash2, Plus, Minus, ArrowLeft, CreditCard, Truck, MapPin, ShoppingBag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ShoppingCart, Product } from "@shared/schema";
import { Link } from "wouter";

type CartItemWithProduct = ShoppingCart & { product: Product };

export default function Cart() {
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Obtener carrito
  const { data: cart = { items: [], subtotal: 0 }, isLoading } = useQuery({
    queryKey: ["/api/cart"],
  });

  // Actualizar cantidad
  const updateQuantityMutation = useMutation({
    mutationFn: async ({ productId, quantity }: { productId: number; quantity: number }) => {
      if (quantity === 0) {
        return apiRequest("DELETE", `/api/cart/remove/${productId}`);
      }
      return apiRequest("PUT", "/api/cart/update", { productId, quantity });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Remover producto
  const removeProductMutation = useMutation({
    mutationFn: async (productId: number) => {
      return apiRequest("DELETE", `/api/cart/remove/${productId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Producto eliminado",
        description: "El producto se eliminó del carrito",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Limpiar carrito
  const clearCartMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/cart/clear");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Carrito vaciado",
        description: "Todos los productos fueron eliminados del carrito",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleQuantityChange = (item: CartItemWithProduct, change: number) => {
    const newQuantity = item.quantity + change;
    if (newQuantity < 0) return;
    
    updateQuantityMutation.mutate({
      productId: item.productId,
      quantity: newQuantity,
    });
  };

  const handleDirectQuantityChange = (item: CartItemWithProduct, quantity: number) => {
    if (quantity < 0) return;
    
    updateQuantityMutation.mutate({
      productId: item.productId,
      quantity,
    });
  };

  const handleRemoveProduct = (productId: number) => {
    removeProductMutation.mutate(productId);
  };

  const handleCheckout = () => {
    setIsCheckingOut(true);
    // Aquí se implementaría la lógica de checkout
    toast({
      title: "Procesando pedido",
      description: "Tu pedido se está procesando...",
    });
    
    // Simular proceso de checkout
    setTimeout(() => {
      setIsCheckingOut(false);
      toast({
        title: "Pedido confirmado",
        description: "Tu pedido ha sido confirmado exitosamente",
      });
    }, 2000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const isEmpty = !cart.items || cart.items.length === 0;

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/catalog">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver al catálogo
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Carrito de Compras</h1>
            <p className="text-gray-600 mt-1">
              {isEmpty ? "Tu carrito está vacío" : `${cart.items.length} producto${cart.items.length !== 1 ? 's' : ''} en tu carrito`}
            </p>
          </div>
        </div>
        
        {!isEmpty && (
          <Button
            variant="outline"
            onClick={() => clearCartMutation.mutate()}
            disabled={clearCartMutation.isPending}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Vaciar carrito
          </Button>
        )}
      </div>

      {isEmpty ? (
        <div className="text-center py-16">
          <ShoppingBag className="w-24 h-24 text-gray-300 mx-auto mb-6" />
          <h3 className="text-xl font-medium text-gray-900 mb-2">Tu carrito está vacío</h3>
          <p className="text-gray-600 mb-6">
            Explora nuestro catálogo y agrega algunos productos a tu carrito
          </p>
          <Link href="/catalog">
            <Button>
              <ShoppingCartIcon className="w-4 h-4 mr-2" />
              Ir al catálogo
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Lista de productos */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">Productos en tu carrito</h2>
            
            {cart.items.map((item: CartItemWithProduct) => (
              <Card key={item.id} className="overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-4">
                    <div className="w-20 h-20 bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      {item.product?.imageUrl ? (
                        <img 
                          src={item.product.imageUrl} 
                          alt={item.product.name}
                          className="w-full h-full object-cover rounded-lg"
                        />
                      ) : (
                        <ShoppingBag className="w-8 h-8 text-blue-400" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1 flex-1">
                          <h3 className="font-semibold text-lg">{item.product?.name}</h3>
                          <p className="text-sm text-gray-600 line-clamp-2">{item.product?.description}</p>
                          <div className="flex items-center space-x-2">
                            {item.product?.brand && (
                              <Badge variant="outline" className="text-xs">{item.product.brand}</Badge>
                            )}
                            {item.product?.category && (
                              <Badge variant="secondary" className="text-xs">{item.product.category}</Badge>
                            )}
                          </div>
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveProduct(item.productId)}
                          disabled={removeProductMutation.isPending}
                          className="text-red-600 hover:text-red-800 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      
                      <div className="flex items-center justify-between mt-4">
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleQuantityChange(item, -1)}
                            disabled={updateQuantityMutation.isPending}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => handleDirectQuantityChange(item, parseInt(e.target.value) || 0)}
                            className="w-16 text-center h-8"
                            min="0"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleQuantityChange(item, 1)}
                            disabled={updateQuantityMutation.isPending}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                        
                        <div className="text-right">
                          <div className="text-sm text-gray-600">
                            ${parseFloat(item.product?.price || "0").toLocaleString()} c/u
                          </div>
                          <div className="text-lg font-bold text-green-600">
                            ${(parseFloat(item.product?.price || "0") * item.quantity).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Resumen del pedido */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Resumen del pedido</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {cart.items.map((item: CartItemWithProduct) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="truncate">
                        {item.product?.name} × {item.quantity}
                      </span>
                      <span className="font-medium">
                        ${(parseFloat(item.product?.price || "0") * item.quantity).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
                
                <Separator />
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal</span>
                    <span>${cart.subtotal?.toLocaleString() || "0"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Envío</span>
                    <span className="text-green-600">Gratis</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Impuestos</span>
                    <span>${Math.round((cart.subtotal || 0) * 0.16).toLocaleString()}</span>
                  </div>
                </div>
                
                <Separator />
                
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span className="text-green-600">
                    ${Math.round((cart.subtotal || 0) * 1.16).toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Información de entrega */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Truck className="w-5 h-5 mr-2" />
                  Información de entrega
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center space-x-2 text-sm">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">Entrega en toda la ciudad</span>
                </div>
                <div className="text-sm text-gray-600">
                  • Envío gratis en pedidos mayores a $1,000
                </div>
                <div className="text-sm text-gray-600">
                  • Tiempo estimado: 1-3 días hábiles
                </div>
                <div className="text-sm text-gray-600">
                  • Instalación profesional incluida
                </div>
              </CardContent>
            </Card>

            {/* Botón de checkout */}
            <Button
              onClick={handleCheckout}
              disabled={isCheckingOut}
              className="w-full h-12 text-lg"
              size="lg"
            >
              {isCheckingOut ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Procesando...
                </>
              ) : (
                <>
                  <CreditCard className="w-5 h-5 mr-2" />
                  Proceder al pago
                </>
              )}
            </Button>

            <div className="text-center text-sm text-gray-500">
              Al proceder al pago, aceptas nuestros términos y condiciones
            </div>
          </div>
        </div>
      )}
    </div>
  );
}