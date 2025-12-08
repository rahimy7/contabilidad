// client/src/pages/pos-screen.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Search, Barcode, X, ShoppingCart, DollarSign, Package, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useLocation } from 'wouter';
import { InvoiceModal } from '@/components/invoice-modal';

type Product = {
  id: number;
  name: string;
  price: string;
  category: string;
  description: string;
  stockQuantity?: number;
  isActive: boolean;
  imageUrl?: string;
  images?: string | string[];
  sku?: string;
  barcode?: string;
  lotNumber?: string;
  expirationDate?: string | Date;
  brand?: string;
  model?: string;
  baseCurrency?: string;
  base_currency?: string;
  convertedPrice?: number;
  originalPrice?: number;
  displayCurrency?: string;
  conversionApplied?: boolean;
  unitConversionEnabled?: boolean;
  baseUnitId?: number;
  base_unit_id?: number;
  baseUnitSymbol?: string;
  loyaltyPointsPropertyName?: string;
  loyaltyPointsValue?: string | number;
};

type CartItem = {
  product: Product;
  quantity: number;
  selectedUnitId?: number;
  selectedUnit?: MeasurementUnit;
  conversionFactor?: number;
  unitPrice?: number;
  loyaltyPointsPerUnit?: number; // Puntos de lealtad prorrateados por unidad
};

type MeasurementUnit = {
  id: number;
  name: string;
  symbol: string;
  type: 'weight' | 'volume' | 'unit' | 'length';
  abbreviation?: string;
};

type ConversionResult = {
  success: boolean;
  convertedValue: number;
  conversionFactor: number;
  sourceUnit?: MeasurementUnit | null;
  targetUnit?: MeasurementUnit | null;
  error?: string;
};

interface CurrencyData {
  code: string;
  name: string;
  symbol: string;
  rate?: number;
}

interface Order {
  customerId: number;
  status: string;
  deliveryCost: number;
  priority: string;
  notes: string;
  paymentMethod: string;
  receivedAmount: number;
  changeAmount: number;
  items: Array<{
    productId: number;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    unitId?: number;
    quantityInBaseUnit?: number;
  }>;
  totalAmount?: number;
  loyaltyPointsPropertyName?: string | null;
  loyaltyPointsValue?: number | null;
  loyaltyPointsTotal?: number | null;
}

const getAuthToken = () => {
  return localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
};

// ✅ CONVERSIÓN DE DIVISAS - EXCHANGE RATES
const SUPPORTED_CURRENCIES = [
  { code: 'DOP', name: 'Peso Dominicano', symbol: 'RD$' },
  { code: 'USD', name: 'Dólar Estadounidense', symbol: '$' },
];

const EXCHANGE_RATES_FALLBACK = {
  'USD_TO_DOP': 58.5,
  'DOP_TO_USD': 0.017
};

const useCurrencyConversion = (exchangeRates: any[]) => {
  const getConversionRate = (fromCurrency: string, toCurrency: string): number => {
    if (fromCurrency === toCurrency) return 1;

    const directRate = exchangeRates.find((rate: any) =>
      rate.baseCurrency === fromCurrency && rate.targetCurrency === toCurrency && rate.isActive
    );

    if (directRate) return parseFloat(directRate.rate);

    const inverseRate = exchangeRates.find((rate: any) =>
      rate.baseCurrency === toCurrency && rate.targetCurrency === fromCurrency && rate.isActive
    );

    if (inverseRate) return 1 / parseFloat(inverseRate.rate);

    console.warn(`⚠️ No exchange rate found for ${fromCurrency} to ${toCurrency}`);
    if (fromCurrency === 'USD' && toCurrency === 'DOP') return EXCHANGE_RATES_FALLBACK.USD_TO_DOP;
    if (fromCurrency === 'DOP' && toCurrency === 'USD') return EXCHANGE_RATES_FALLBACK.DOP_TO_USD;

    return 1;
  };

  const convertToTargetCurrency = (price: number, fromCurrency: string, targetCurrency: string = 'DOP') => {
    if (fromCurrency === targetCurrency) return price;
    const rate = getConversionRate(fromCurrency, targetCurrency);
    return price * rate;
  };

  const formatCurrency = (amount: number, currency: string = 'DOP') => {
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
    return `${amount.toFixed(2)}`;
  };

  const convertProduct = (product: any) => {
    const originalPrice = parseFloat(product.price || '0');
    const baseCurrency = product.baseCurrency || product.base_currency || 'DOP';

    // ✅ SIEMPRE CONVERTIR A DOP PARA EL POS
    const convertedPrice = convertToTargetCurrency(originalPrice, baseCurrency, 'DOP');

    return {
      ...product,
      originalPrice,
      originalCurrency: baseCurrency,
      convertedPrice,
      displayCurrency: 'DOP',
      conversionApplied: baseCurrency !== 'DOP',
      price: convertedPrice.toString()
    };
  };

  return {
    convertToTargetCurrency,
    formatCurrency,
    convertProduct,
    displayCurrency: 'DOP'
  };
};

export default function POSScreen() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [skuQuery, setSkuQuery] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showSkuModal, setShowSkuModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceData, setInvoiceData] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('DOP');
  const [productUnits, setProductUnits] = useState<Record<number, MeasurementUnit[]>>({});
  const [loadingUnits, setLoadingUnits] = useState<Record<number, boolean>>({});

  const getBaseUnitId = (product: Product) => {
    return product.baseUnitId ?? (product as any).base_unit_id ?? undefined;
  };

  const isUnitConversionEnabled = (product: Product) => {
    return Boolean(product.unitConversionEnabled ?? (product as any).unit_conversion_enabled);
  };

  const getBasePrice = (product: Product) => {
    return product.convertedPrice || parseFloat(product.price || '0');
  };

  const getItemUnitPrice = (item: CartItem) => {
    const basePrice = getBasePrice(item.product);
    const factor = item.conversionFactor || 1;
    return (item.unitPrice ?? basePrice * factor);
  };

  const getUnitSymbol = (productId: number, unitId?: number) => {
    const units = productUnits[productId] || [];
    const unit = units.find(u => u.id === unitId);
    return unit?.symbol;
  };

  const fetchUnitsForProduct = async (productId: number) => {
    if (productUnits[productId] || loadingUnits[productId]) return;

    setLoadingUnits(prev => ({ ...prev, [productId]: true }));
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/products/${productId}/available-units`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('No se pudieron obtener las unidades disponibles');
      const units = await response.json();
      if (Array.isArray(units)) {
        setProductUnits(prev => ({ ...prev, [productId]: units }));
      }
    } catch (error) {
      console.error('Error fetching available units:', error);
    } finally {
      setLoadingUnits(prev => ({ ...prev, [productId]: false }));
    }
  };

  const handleUnitChange = async (product: Product, unitId?: number) => {
    const baseUnitId = getBaseUnitId(product);
    const targetUnitId = unitId || baseUnitId;
    const basePrice = getBasePrice(product);
    const units = productUnits[product.id] || [];
    const selectedUnit = units.find(u => u.id === targetUnitId);

    let conversionFactor = 1;

    if (targetUnitId && baseUnitId && targetUnitId !== baseUnitId && isUnitConversionEnabled(product)) {
      try {
        const token = getAuthToken();
        const response = await fetch('/api/unit-conversion/convert-to-base', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            productId: product.id,
            quantity: 1,
            unitId: targetUnitId
          })
        });

        if (!response.ok) throw new Error('No se pudo convertir la unidad seleccionada');

        const result: ConversionResult = await response.json();
        if (result.success) {
          conversionFactor = result.conversionFactor || result.convertedValue || 1;
        } else if (result.convertedValue) {
          conversionFactor = result.convertedValue;
        } else {
          alert(result.error || 'No se pudo convertir la unidad');
        }
      } catch (error) {
        console.error('Error converting units:', error);
        alert('No se pudo convertir la unidad seleccionada, usando precio base');
      }
    }

    const priceForUnit = basePrice * conversionFactor;

    // 🎁 Prorratear loyalty points según el factor de conversión
    const baseLoyaltyPoints = product.loyaltyPointsValue ? parseFloat(product.loyaltyPointsValue.toString()) : 0;
    const loyaltyPointsForUnit = baseLoyaltyPoints * conversionFactor;

    setCart(prev =>
      prev.map(item =>
        item.product.id === product.id
          ? {
            ...item,
            selectedUnitId: targetUnitId,
            selectedUnit,
            conversionFactor,
            unitPrice: priceForUnit,
            loyaltyPointsPerUnit: loyaltyPointsForUnit
          }
          : item
      )
    );
  };

  useEffect(() => {
    cart.forEach(item => {
      if (isUnitConversionEnabled(item.product)) {
        fetchUnitsForProduct(item.product.id);
      }
    });
  }, [cart]);

  // Fetch exchange rates
  const { data: exchangeRates = [] } = useQuery<any[]>({
    queryKey: ['exchange-rates'],
    queryFn: async () => {
      const token = getAuthToken();
      const response = await fetch('/api/exchange-rates', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch exchange rates');
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
  });

  // Initialize currency conversion hook
  const { formatCurrency, convertProduct } = useCurrencyConversion(exchangeRates);

  // Fetch store settings
  const { data: storeSettings } = useQuery<any>({
    queryKey: ['store-settings'],
    queryFn: async () => {
      const token = getAuthToken();
      const response = await fetch('/api/store-settings', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) return null;
      return response.json();
    },
  });

  // Fetch products
  const { data: rawProducts = [], isLoading } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      const token = getAuthToken();
      const response = await fetch('/api/products', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        console.error('Failed to fetch products:', response.status);
        throw new Error('Failed to fetch products');
      }
      const allProducts = await response.json();
      return Array.isArray(allProducts) ? allProducts.filter((p: Product) => p.isActive !== false) : [];
    },
  });

  // Convert products to DOP prices
  const products = useMemo(() => {
    return rawProducts.map(p => convertProduct(p));
  }, [rawProducts, exchangeRates]);

  // Create sale mutation
  const createSaleMutation = useMutation({
    mutationFn: async (saleData: Order) => {
      const token = getAuthToken();
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(saleData)
      });
      if (!response.ok) throw new Error('Failed to create sale');
      return response.json();
    },
    onSuccess: (orderData) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });

      // ✅ Preparar datos de factura con datos de la tienda
      const now = new Date();
      const invoiceDataPrepared = {
        orderNumber: orderData.orderNumber || `POS-${now.getTime()}`,
        date: now.toLocaleDateString('es-DO'),
        time: now.toLocaleTimeString('es-DO'),
        paymentMethod,
        items: cart.map(item => {
          const unitPrice = getItemUnitPrice(item);
          // Usar los loyalty points prorrateados por unidad
          const loyaltyPointsPerUnit = item.loyaltyPointsPerUnit ??
            (item.product.loyaltyPointsValue ? parseFloat(item.product.loyaltyPointsValue.toString()) : 0);
          return {
            productId: item.product.id,
            productName: item.product.name,
            quantity: item.quantity,
            unitPrice: unitPrice,
            totalPrice: unitPrice * item.quantity,
            loyaltyPointsValue: loyaltyPointsPerUnit
          };
        }),
        subtotal: calculateSubtotal(),
        tax: calculateTax(),
        total: calculateTotal(),
        receivedAmount: parseFloat(receivedAmount) || 0,
        changeAmount: calculateChange(),
        totalLoyaltyPoints: calculateTotalLoyaltyPoints(),
        loyaltyPointsPropertyName: getLoyaltyPropertyName(),
        // 🏪 Datos de la tienda desde configuración
        storeName: storeSettings?.storeName || 'Tu Tienda',
        storeAddress: storeSettings?.storeAddress,
        storePhone: storeSettings?.storePhone,
        storeEmail: storeSettings?.storeEmail,
        logoUrl: storeSettings?.logoUrl,
        invoiceFooter: storeSettings?.invoiceFooter,
      };

      setInvoiceData(invoiceDataPrepared);
      setShowInvoiceModal(true);
      resetPOS();
    },
    onError: (error: any) => {
      alert(`Error: ${error?.message || 'No se pudo procesar la venta'}`);
    },
  });

  // Get unique categories
  const categories = useMemo(() => {
    const cats = ['Todos', ...new Set(products.map(p => p.category))];
    return cats;
  }, [products]);

  // Filter products
  const filteredProducts = useMemo(() => {
    let filtered = products;

    if (selectedCategory !== 'Todos') {
      filtered = filtered.filter(p => p.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query) ||
        (p.sku && p.sku.toLowerCase().includes(query)) ||
        (p.barcode && p.barcode.toLowerCase().includes(query))
      );
    }

    if (skuQuery.trim()) {
      filtered = filtered.filter(p =>
        (p.sku && p.sku.toLowerCase().includes(skuQuery.toLowerCase())) ||
        (p.barcode && p.barcode.toLowerCase().includes(skuQuery.toLowerCase()))
      );
    }

    return filtered;
  }, [products, searchQuery, selectedCategory, skuQuery]);

  // Cart operations
  const addToCart = (product: Product) => {
    const baseUnitId = getBaseUnitId(product);
    const basePrice = getBasePrice(product);
    const baseLoyaltyPoints = product.loyaltyPointsValue ? parseFloat(product.loyaltyPointsValue.toString()) : 0;

    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.product.id === product.id);
      if (existingItem) {
        return prevCart.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [
        ...prevCart,
        {
          product,
          quantity: 1,
          selectedUnitId: baseUnitId,
          conversionFactor: 1,
          unitPrice: basePrice,
          loyaltyPointsPerUnit: baseLoyaltyPoints,
        }
      ];
    });

    if (isUnitConversionEnabled(product)) {
      fetchUnitsForProduct(product.id);
    }
  };

  const updateQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      setCart(prev => prev.filter(item => item.product.id !== productId));
    } else {
      setCart(prev => prev.map(item =>
        item.product.id === productId
          ? { ...item, quantity }
          : item
      ));
    }
  };

  const removeFromCart = (productId: number) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const clearCart = () => {
    if (confirm('¿Estás seguro de eliminar todos los productos?')) {
      setCart([]);
    }
  };

  // Calculations
  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => {
      const price = getItemUnitPrice(item);
      return sum + (price * item.quantity);
    }, 0);
  };

  const calculateTax = () => {
    const taxPercentage = storeSettings?.taxPercentage || 0;
    return (calculateSubtotal() * taxPercentage) / 100;
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateTax();
  };

  // 🎁 Calculate total loyalty points - Considera el factor de conversión
  const calculateTotalLoyaltyPoints = () => {
    return cart.reduce((total, item) => {
      // Usar los loyalty points prorrateados por unidad si están disponibles
      const pointsPerUnit = item.loyaltyPointsPerUnit ??
        (item.product.loyaltyPointsValue ? parseFloat(item.product.loyaltyPointsValue.toString()) : 0);
      return total + (pointsPerUnit * item.quantity);
    }, 0);
  };

  // Get loyalty property name from first item that has it
  const getLoyaltyPropertyName = () => {
    const itemWithLoyalty = cart.find(item => item.product.loyaltyPointsPropertyName);
    return itemWithLoyalty?.product.loyaltyPointsPropertyName || null;
  };

  const calculateChange = () => {
    const received = parseFloat(receivedAmount) || 0;
    const total = calculateTotal();
    return Math.max(0, received - total);
  };

  // Payment processing
  const handleCheckout = () => {
    if (cart.length === 0) {
      alert('Carrito Vacío - Agrega productos para continuar');
      return;
    }
    setShowPaymentModal(true);
  };

  const processSale = async () => {
    if (paymentMethod === 'cash') {
      const raw = (receivedAmount ?? '').toString().trim();
      if (raw) {
        const normalized = raw.replace(',', '.');
        const received = Number(normalized);
        if (!isFinite(received) || received < 0) {
          alert('Monto Inválido - Ingresa un monto válido.');
          return;
        }
        if (received < calculateTotal()) {
          alert('Monto Insuficiente - El monto recibido es menor al total');
          return;
        }
      }
    }

    const payload: Order = {
      customerId: 1,
      status: 'completed',
      deliveryCost: 0,
      priority: 'normal',
      notes: 'Venta directa - Punto de Venta',
      paymentMethod,
      receivedAmount: paymentMethod === 'cash' ? Number(receivedAmount || 0) : Number(calculateTotal().toFixed(2)),
      changeAmount: paymentMethod === 'cash' ? Number(calculateChange().toFixed(2)) : 0,
      totalAmount: calculateTotal(),
      loyaltyPointsPropertyName: getLoyaltyPropertyName() || undefined as any,
      loyaltyPointsValue: (() => {
        const itemWithLoyalty = cart.find(item => item.product.loyaltyPointsValue);
        return itemWithLoyalty?.product.loyaltyPointsValue
          ? Number(itemWithLoyalty.product.loyaltyPointsValue)
          : undefined as any;
      })(),
      loyaltyPointsTotal: calculateTotalLoyaltyPoints(),
      items: cart.map(item => {
        const unitPrice = getItemUnitPrice(item);
        const baseUnitId = getBaseUnitId(item.product);
        const conversionFactor = item.conversionFactor || 1;
        return {
          productId: item.product.id,
          quantity: item.quantity,
          unitId: item.selectedUnitId || baseUnitId,
          quantityInBaseUnit: Number((conversionFactor * item.quantity).toFixed(4)),
          unitPrice: Number(unitPrice.toFixed(2)),
          totalPrice: Number((unitPrice * item.quantity).toFixed(2)),
        };
      })
    };

    createSaleMutation.mutate(payload);
  };

  const resetPOS = () => {
    setCart([]);
    setReceivedAmount('');
    setPaymentMethod('cash');
    setShowPaymentModal(false);
    setSearchQuery('');
    setSelectedCategory('Todos');
  };

  // formatCurrency is provided by useCurrencyConversion hook

  const getProductImageUrl = (product: Product): string | null => {
    if (product.imageUrl && typeof product.imageUrl === 'string' && product.imageUrl.trim()) {
      return product.imageUrl;
    }
    if (product.images) {
      if (Array.isArray(product.images) && product.images.length > 0) {
        return product.images[0];
      }
      if (typeof product.images === 'string') {
        try {
          const parsed = JSON.parse(product.images);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed[0];
          }
        } catch {
          return null;
        }
      }
    }
    if ((product as any).image && typeof (product as any).image === 'string' && (product as any).image.trim()) {
      return (product as any).image;
    }
    return null;
  };

  const quickAmounts = [100, 200, 500, 1000, 2000, 5000];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <Package className="w-16 h-16 text-emerald-600 mx-auto mb-4" />
          <p className="text-lg text-gray-600">Cargando productos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header - Full Width */}
      <div className="bg-emerald-600 text-white p-4 shadow-lg flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-3">
          <ShoppingCart className="w-8 h-8" />
          <h1 className="text-2xl font-bold">Punto de Venta</h1>
        </div>

        <div className="flex items-center gap-4">
          {/* Currency Selector */}
          <div className="flex gap-2">
            {SUPPORTED_CURRENCIES.map((currency: any) => (
              <button
                key={currency.code}
                onClick={() => setSelectedCurrency(currency.code)}
                className={`px-3 py-1 rounded-full text-sm font-semibold transition-all ${
                  selectedCurrency === currency.code
                    ? 'bg-emerald-700 text-white'
                    : 'bg-white text-emerald-600'
                }`}
              >
                {currency.symbol}
              </button>
            ))}
          </div>

          {/* Cart Badge */}
          <div className="relative">
            <ShoppingCart className="w-6 h-6" />
            {cart.length > 0 && (
              <div className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                {cart.length}
              </div>
            )}
          </div>

          {/* Back Button */}
          <Button
            onClick={() => setLocation('/dashboard')}
            variant="outline"
            className="bg-white text-emerald-600 hover:bg-gray-100 border-0 flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Button>
        </div>
      </div>

      {/* Main Content - Full Width */}
      <div className="flex-1 overflow-hidden grid grid-cols-3 gap-4 p-4">
        {/* Products Section - 2/3 width */}
        <div className="col-span-2 flex flex-col bg-blue-50 rounded-lg overflow-hidden shadow">
          {/* Search Bar */}
          <div className="p-4 bg-teal-700 flex gap-2 flex-shrink-0">
            <div className="flex-1 flex items-center gap-2 bg-teal-900 px-3 rounded-lg">
              <Search className="w-5 h-5 text-white" />
              <input
                type="text"
                placeholder="Buscar productos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSkuQuery('')}
                className="flex-1 bg-transparent text-white outline-none placeholder-gray-300"
              />
              {searchQuery.length > 0 && (
                <button onClick={() => setSearchQuery('')}>
                  <X className="w-5 h-5 text-white" />
                </button>
              )}
            </div>

            {/* SKU Search Button */}
            <button
              onClick={() => setShowSkuModal(true)}
              className="bg-gray-800 text-white p-2 rounded-lg hover:bg-gray-700 transition-all"
            >
              <Barcode className="w-5 h-5" />
            </button>
          </div>

          {/* Categories */}
          <div className="p-4 bg-white border-b overflow-x-auto flex gap-2 flex-shrink-0">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-semibold transition-all ${
                  selectedCategory === category
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-300'
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          {/* Products Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <Package className="w-16 h-16 mb-4" />
                <p className="text-lg">No se encontraron productos</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {filteredProducts.map((product) => {
                  const imageUrl = getProductImageUrl(product);
                  return (
                    <Card
                      key={product.id}
                      className="cursor-pointer hover:shadow-lg transition-all border-2 border-emerald-500"
                      onClick={() => addToCart(product)}
                    >
                      <CardContent className="p-3">
                        <div className="aspect-video bg-gradient-to-br from-emerald-100 to-emerald-50 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={product.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Package className="w-12 h-12 text-emerald-600" />
                          )}
                        </div>
                        <h3 className="font-semibold text-sm text-gray-900 line-clamp-2">{product.name}</h3>
                        <p className="text-xs text-emerald-600 my-1">{product.category}</p>
                        <p className="text-lg font-bold text-emerald-600">{formatCurrency(getBasePrice(product))}</p>

                        {/* 🎁 Loyalty Points */}
                        {product.loyaltyPointsPropertyName && product.loyaltyPointsValue && (
                          <p className="text-xs bg-amber-50 text-amber-700 p-1 rounded mt-1 font-medium text-center">
                            🎁 {product.loyaltyPointsValue} {product.loyaltyPointsPropertyName}
                          </p>
                        )}

                        <Button
                          size="sm"
                          className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => addToCart(product)}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Agregar
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Cart Section - 1/3 width */}
        <div className="bg-white rounded-lg shadow-lg flex flex-col overflow-hidden">
          <div className="flex justify-between items-center p-4 border-b flex-shrink-0">
            <h2 className="text-xl font-bold">Carrito</h2>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-red-600 hover:text-red-700 font-semibold text-sm"
              >
                Limpiar
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <ShoppingCart className="w-16 h-16 mb-4" />
              <p className="font-semibold">Carrito vacío</p>
              <p className="text-sm">Agrega productos para comenzar</p>
            </div>
          ) : (
            <>
              {/* Cart Items */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {cart.map((item) => {
                  const itemPrice = getItemUnitPrice(item);
                  const units = productUnits[item.product.id] || [];
                  const baseUnitId = getBaseUnitId(item.product);
                  const currentUnitId = item.selectedUnitId || baseUnitId;
                  const showUnitSelector = units.length > 0 && isUnitConversionEnabled(item.product);
                  return (
                    <div key={item.product.id} className="flex items-center gap-1 p-2 bg-gray-50 rounded-lg border border-gray-200 min-h-[50px]">
                      {/* Nombre del producto */}
                      <div className="flex-1 min-w-0 max-w-[45%]">
                        <p className="text-xs font-semibold text-gray-900 truncate">{item.product.name}</p>
                        <p className="text-xs text-gray-600 flex items-center gap-2">
                          {formatCurrency(itemPrice)}
                          {showUnitSelector && (
                            <select
                              className="text-[10px] border border-emerald-200 rounded px-1 py-0.5 bg-white text-emerald-700"
                              value={currentUnitId || ''}
                              onChange={(e) => {
                                const selectedId = Number(e.target.value);
                                handleUnitChange(
                                  item.product,
                                  Number.isNaN(selectedId) ? undefined : selectedId
                                );
                              }}
                            >
                              {units.map(unit => (
                                <option key={unit.id} value={unit.id}>
                                  {unit.symbol}
                                </option>
                              ))}
                            </select>
                          )}
                          {!showUnitSelector && getUnitSymbol(item.product.id, currentUnitId) && (
                            <span className="text-[10px] text-emerald-700 uppercase">
                              {getUnitSymbol(item.product.id, currentUnitId)}
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Precio total */}
                      <p className="text-xs font-bold text-gray-900 flex-shrink-0 w-20 text-right">
                        {formatCurrency(itemPrice * item.quantity)}
                      </p>

                      {/* Controles de cantidad */}
                      <div className="flex items-center bg-emerald-600 rounded overflow-hidden flex-shrink-0">
                        <button
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          className="text-white p-0.5 hover:bg-emerald-700 h-6 w-6 flex items-center justify-center text-sm"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => {
                            const value = parseInt(e.target.value);
                            if (!isNaN(value) && value >= 0) {
                              updateQuantity(item.product.id, value);
                            }
                          }}
                          onFocus={(e) => e.target.select()}
                          className="text-white text-xs font-semibold w-10 text-center bg-emerald-600 border-none outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          min="1"
                        />
                        <button
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          className="text-white p-0.5 hover:bg-emerald-700 h-6 w-6 flex items-center justify-center text-sm"
                        >
                          +
                        </button>
                      </div>

                      {/* Botón eliminar */}
                      <button
                        onClick={() => removeFromCart(item.product.id)}
                        className="text-red-500 hover:text-red-700 p-1 flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Totals */}
              <div className="p-3 bg-green-50 border-t-2 border-b-2 border-emerald-600 space-y-2 flex-shrink-0">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-semibold">{formatCurrency(calculateSubtotal())}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">ITBIS (18%)</span>
                  <span className="font-semibold">{formatCurrency(calculateTax())}</span>
                </div>
                <div className="flex justify-between border-t pt-2 mb-2">
                  <span className="font-bold text-lg">TOTAL</span>
                  <span className="font-bold text-lg text-emerald-600">{formatCurrency(calculateTotal())}</span>
                </div>

                {/* 🎁 Loyalty Points Total */}
                {calculateTotalLoyaltyPoints() > 0 && (
                  <div className="flex justify-between items-center p-2 bg-amber-50 rounded-lg border border-amber-200">
                    <span className="text-sm font-medium text-amber-700">Puntos Acumulados:</span>
                    <span className="font-bold text-amber-600">
                      {calculateTotalLoyaltyPoints().toFixed(2)} {getLoyaltyPropertyName()}
                    </span>
                  </div>
                )}
              </div>

              {/* Checkout Button */}
              <Button
                onClick={handleCheckout}
                className="m-3 w-[calc(100%-1.5rem)] bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-6 text-lg flex-shrink-0"
              >
                <DollarSign className="w-5 h-5 mr-2" />
                PROCESAR PAGO
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Procesar Pago</DialogTitle>
            <DialogDescription>Completa los detalles del pago</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Total Display */}
            <div className="bg-green-50 p-6 rounded-lg text-center border-2 border-emerald-600">
              <p className="text-gray-600 mb-2">Total a Pagar</p>
              <p className="text-4xl font-bold text-emerald-600">{formatCurrency(calculateTotal())}</p>
            </div>

            {/* Payment Method Selection */}
            <div className="space-y-3">
              <p className="font-semibold text-gray-900">Método de Pago</p>
              <div className="grid grid-cols-3 gap-3">
                {(['cash', 'card', 'transfer'] as const).map((method) => (
                  <button
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className={`p-3 rounded-lg font-semibold transition-all border-2 ${
                      paymentMethod === method
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-600'
                        : 'border-gray-300 bg-white text-gray-600'
                    }`}
                  >
                    {method === 'cash' && '💵 Efectivo'}
                    {method === 'card' && '💳 Tarjeta'}
                    {method === 'transfer' && '🏦 Transferencia'}
                  </button>
                ))}
              </div>
            </div>

            {/* Cash Payment Details */}
            {paymentMethod === 'cash' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Monto Recibido
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={receivedAmount}
                      onChange={(e) => setReceivedAmount(e.target.value)}
                      className="text-2xl font-bold text-center"
                    />
                    <button
                      onClick={() => setReceivedAmount('')}
                      className="px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Quick Amount Buttons */}
                <div>
                  <p className="text-sm font-semibold text-gray-900 mb-2">Sugerencias Rápidas</p>
                  <div className="grid grid-cols-3 gap-2">
                    {quickAmounts.map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setReceivedAmount(amount.toString())}
                        className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-semibold text-emerald-600 transition-all"
                      >
                        {formatCurrency(amount)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Change Display */}
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-300">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-blue-900">Cambio</span>
                    <span className={`text-2xl font-bold ${
                      parseFloat(receivedAmount) < calculateTotal() ? 'text-red-600' : 'text-blue-600'
                    }`}>
                      {parseFloat(receivedAmount) < calculateTotal()
                        ? `Insuficiente (${formatCurrency(calculateTotal() - parseFloat(receivedAmount))})`
                        : formatCurrency(calculateChange())
                      }
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Complete Sale Button */}
            <Button
              onClick={processSale}
              disabled={createSaleMutation.isPending}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-6 text-lg"
            >
              {createSaleMutation.isPending ? 'Procesando...' : 'COMPLETAR VENTA'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* SKU/Barcode Search Modal */}
      <Dialog open={showSkuModal} onOpenChange={setShowSkuModal}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Buscar por SKU o Código de Barras</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* SKU/Barcode Input Field */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Ingresa SKU o Código de Barras</label>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  placeholder="Escribe o usa el teclado numérico"
                  value={skuQuery}
                  onChange={(e) => setSkuQuery(e.target.value)}
                  autoFocus
                  className="text-2xl font-bold text-emerald-600 tracking-widest"
                />
                {skuQuery.length > 0 && (
                  <button
                    onClick={() => setSkuQuery('')}
                    className="p-2 bg-gray-200 hover:bg-gray-300 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Numeric Keyboard */}
            <div className="grid grid-cols-3 gap-2 bg-gray-50 p-3 rounded-lg">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  onClick={() => setSkuQuery(skuQuery + num.toString())}
                  className="p-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-all"
                >
                  {num}
                </button>
              ))}
              <button
                onClick={() => setSkuQuery(skuQuery + '0')}
                className="col-span-2 p-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-all"
              >
                0
              </button>
              <button
                onClick={() => setSkuQuery(skuQuery.slice(0, -1))}
                className="p-3 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600 transition-all"
              >
                ⌫
              </button>
            </div>

            {/* Product Results */}
            {skuQuery.trim().length > 0 && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredProducts.filter(p =>
                  (p.sku && p.sku.toLowerCase().includes(skuQuery.toLowerCase())) ||
                  (p.barcode && p.barcode.toLowerCase().includes(skuQuery.toLowerCase()))
                ).length > 0 ? (
                  filteredProducts
                    .filter(p =>
                      (p.sku && p.sku.toLowerCase().includes(skuQuery.toLowerCase())) ||
                      (p.barcode && p.barcode.toLowerCase().includes(skuQuery.toLowerCase()))
                    )
                    .map((product) => {
                      const imageUrl = getProductImageUrl(product);
                      return (
                        <div
                          key={product.id}
                          onClick={() => {
                            addToCart(product);
                            alert(`✅ ${product.name} agregado al carrito`);
                            setShowSkuModal(false);
                            setSkuQuery('');
                          }}
                          className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border-2 border-emerald-300 cursor-pointer hover:bg-green-100 transition-all"
                        >
                          <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center overflow-hidden">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={product.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package className="w-8 h-8 text-emerald-600" />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-gray-900">{product.name}</p>
                            <div className="flex gap-2 items-center mt-1">
                              {product.sku && (
                                <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                                  SKU: {product.sku}
                                </span>
                              )}
                              {product.barcode && (
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                  📊 {product.barcode}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-emerald-600 font-bold mt-1">
                              {formatCurrency(getBasePrice(product))}
                            </p>
                          </div>
                          <Plus className="w-6 h-6 text-emerald-600" />
                        </div>
                      );
                    })
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-gray-400">
                    <Package className="w-12 h-12 mb-2" />
                    <p className="font-semibold">No encontrado</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 🧾 Invoice Modal */}
      <InvoiceModal
        isOpen={showInvoiceModal}
        data={invoiceData}
        onClose={() => setShowInvoiceModal(false)}
      />
    </div>
  );
}
