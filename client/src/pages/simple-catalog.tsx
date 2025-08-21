// client/src/pages/simple-catalog.tsx - Actualización multimoneda

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCurrency } from '@/hooks/useCurrency';
import { CurrencySelector } from '@/components/CurrencySelector';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ShoppingCart, Plus, Minus, DollarSign } from 'lucide-react';

interface Product {
  id: number;
  name: string;
  price: string;
  baseCurrency: string;
  description: string;
  category: string;
  imageUrl?: string;
}

interface CartItem extends Product {
  quantity: number;
}

export default function SimpleCatalog() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  
  const { 
    convertProduct, 
    formatCurrency, 
    selectedCurrency, 
    currentCurrencyInfo 
  } = useCurrency();

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['/api/products']
  });

  const { data: storeInfo } = useQuery({
    queryKey: ['/api/store-info']
  }) as { data: any }; // Cast para compatibilidad

  // Convertir productos para mostrar
  const convertedProducts = products.map(product => convertProduct(product));

  const addToCart = (product: Product) => {
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
      return currentCart.reduce((acc: CartItem[], item) => {
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
    return cart.reduce((total, item) => {
      const convertedItem = convertProduct(item);
      return total + (convertedItem.convertedPrice * item.quantity);
    }, 0);
  };

  const getCartItemsCount = () => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  };

  const makeOrder = () => {
    if (cart.length === 0) return;
    
    const storeName = storeInfo?.name || 'TIENDA';
    const orderItems = cart.map((item, index) => {
      const convertedItem = convertProduct(item);
      return `${index + 1}. *${item.name}*[ID:${item.id}]
   Cantidad: ${item.quantity}
   Precio unitario: ${convertedItem.formattedPrice}
   Subtotal: ${formatCurrency(convertedItem.convertedPrice * item.quantity)}`;
    }).join('\n');
    
    const orderMessage = `🛍️ *NUEVO PEDIDO - ${storeName.toUpperCase()}*

${orderItems}

💰 *TOTAL: ${formatCurrency(getCartTotal())}* (${selectedCurrency})

📋 Por favor confirma la disponibilidad y tiempo de entrega.
¡Gracias por tu preferencia! 🙏`;
    
    // Usar any para compatibilidad con versión anterior
    const phoneNumber = (storeInfo as any)?.phone || 
                       (storeInfo as any)?.whatsapp || 
                       (storeInfo as any)?.contact_phone || 
                       '18095551234';
    const cleanPhoneNumber = phoneNumber.replace(/[^\d]/g, '');
    const whatsappUrl = `https://wa.me/${cleanPhoneNumber}?text=${encodeURIComponent(orderMessage)}`;
    
    window.open(whatsappUrl, '_blank');
    setCart([]);
    setShowCart(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Cargando catálogo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {storeInfo?.name || 'Catálogo'}
              </h1>
              <p className="text-sm text-gray-600">
                {convertedProducts.length} productos en {selectedCurrency}
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Selector de moneda */}
              <CurrencySelector variant="compact" />
              
              {/* Carrito */}
              <Button
                variant="outline"
                onClick={() => setShowCart(!showCart)}
                className="relative"
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                Carrito
                {getCartItemsCount() > 0 && (
                  <Badge className="absolute -top-2 -right-2 px-1.5 py-0.5 text-xs">
                    {getCartItemsCount()}
                  </Badge>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Lista de productos */}
          <div className="lg:col-span-2">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
              {convertedProducts.map((product) => (
                <Card key={product.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      {/* Imagen */}
                      <div className="w-16 h-16 bg-gray-200 rounded-lg flex-shrink-0 relative">
                        {product.imageUrl ? (
                          <img 
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-full h-full object-cover rounded-lg"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            📦
                          </div>
                        )}
                        {product.conversionApplied && (
                          <Badge variant="outline" className="absolute -top-1 -right-1 text-xs px-1">
                            <DollarSign className="w-2 h-2" />
                          </Badge>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm leading-tight mb-1">
                          {product.name}
                        </h3>
                        <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                          {product.description}
                        </p>
                        
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-bold text-green-600">
                              {product.formattedPrice}
                            </span>
                            {product.conversionApplied && (
                              <div className="text-xs text-gray-500">
                                Base: {formatCurrency(parseFloat(product.originalPrice), product.originalCurrency)}
                              </div>
                            )}
                          </div>
                          
                          <Button
                            size="sm"
                            onClick={() => addToCart(product)}
                            className="h-8 px-3"
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Agregar
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Carrito lateral */}
          <div className={`lg:block ${showCart ? 'block' : 'hidden'}`}>
            <Card className="sticky top-24">
              <CardContent className="p-4">
                <h3 className="font-bold mb-4 flex items-center">
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Carrito ({getCartItemsCount()})
                </h3>

                {cart.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    Carrito vacío
                  </p>
                ) : (
                  <>
                    <div className="space-y-3 mb-4">
                      {cart.map((item) => {
                        const convertedItem = convertProduct(item);
                        return (
                          <div key={item.id} className="flex items-center gap-2 text-sm">
                            <div className="flex-1">
                              <p className="font-medium leading-tight">{item.name}</p>
                              <p className="text-gray-600">
                                {convertedItem.formattedPrice} × {item.quantity}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => removeFromCart(item.id)}
                                className="h-6 w-6 p-0"
                              >
                                <Minus className="w-3 h-3" />
                              </Button>
                              <span className="w-8 text-center">{item.quantity}</span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => addToCart(item)}
                                className="h-6 w-6 p-0"
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="border-t pt-4">
                      <div className="flex justify-between items-center mb-4">
                        <span className="font-bold">Total:</span>
                        <span className="font-bold text-lg text-green-600">
                          {formatCurrency(getCartTotal())}
                        </span>
                      </div>
                      
                      <Button 
                        onClick={makeOrder}
                        className="w-full"
                        size="lg"
                      >
                        Hacer Pedido por WhatsApp
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}