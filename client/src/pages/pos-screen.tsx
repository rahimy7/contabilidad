// client/src/pages/pos-screen.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Search, Barcode, X, ShoppingCart, DollarSign, Package, ArrowLeft, CalendarDays, Percent, CreditCard, Users, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useLocation } from 'wouter';
import { InvoiceModal } from '@/components/invoice-modal';
import { AppointmentQuickCreateDialog } from '@/components/appointment-quick-create-dialog';

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
  paymentStatus?: string;
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
  subtotalAmount?: number;
  discountPercentage?: number;
  discountAmount?: number;
  orderType?: string;
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
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    } else if (currency === 'DOP') {
      return new Intl.NumberFormat('es-DO', {
        style: 'currency',
        currency: 'DOP',
        minimumFractionDigits: 2,
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
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer' | 'credit'>('cash');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [showAppointmentDialog, setShowAppointmentDialog] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<string>('DOP');
  const [productUnits, setProductUnits] = useState<Record<number, MeasurementUnit[]>>({});
  const [loadingUnits, setLoadingUnits] = useState<Record<number, boolean>>({});

  // Discount state
  const [discountPercentage, setDiscountPercentage] = useState('');

  // Customer & Credit state
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(1);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerSelector, setShowCustomerSelector] = useState(false);

  // Appointment billing state
  const [showAppointmentBilling, setShowAppointmentBilling] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);

  // Debt payment state
  const [showDebtPayment, setShowDebtPayment] = useState(false);
  const [selectedDebtCustomer, setSelectedDebtCustomer] = useState<any>(null);
  const [debtPaymentAmount, setDebtPaymentAmount] = useState('');
  const [debtPaymentMethod, setDebtPaymentMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  // Numeric keypad modal state
  const [showKeypadModal, setShowKeypadModal] = useState(false);
  const [keypadProduct, setKeypadProduct] = useState<Product | null>(null);
  const [keypadMode, setKeypadMode] = useState<'add' | 'edit'>('add');
  const [keypadValue, setKeypadValue] = useState('');

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

  // Fetch customers for credit sales
  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ['customers'],
    queryFn: async () => {
      const token = getAuthToken();
      const response = await fetch('/api/customers', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) return [];
      return response.json();
    },
  });

  // Fetch today's appointments (pending payment)
  const todayStr = new Date().toISOString().split('T')[0];
  const { data: todayAppointments = [] } = useQuery<any[]>({
    queryKey: ['appointments-today', todayStr],
    queryFn: async () => {
      const token = getAuthToken();
      const response = await fetch(`/api/appointments/by-date/${todayStr}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) return [];
      return response.json();
    },
  });

  // Fetch customers with pending credit
  const { data: pendingCredits = [] } = useQuery<any[]>({
    queryKey: ['credits-pending'],
    queryFn: async () => {
      const token = getAuthToken();
      const response = await fetch('/api/credits/pending/list', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) return [];
      return response.json();
    },
  });

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
      queryClient.invalidateQueries({ queryKey: ['products'] });

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
        discountPercentage: parseFloat(discountPercentage) || 0,
        discountAmount: calculateDiscountAmount(),
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
  const addToCart = (product: Product, quantity: number = 1) => {
    const baseUnitId = getBaseUnitId(product);
    const basePrice = getBasePrice(product);
    const baseLoyaltyPoints = product.loyaltyPointsValue ? parseFloat(product.loyaltyPointsValue.toString()) : 0;

    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.product.id === product.id);
      if (existingItem) {
        return prevCart.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }

      return [
        ...prevCart,
        {
          product,
          quantity,
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

  const openKeypadForProduct = (product: Product) => {
    setKeypadProduct(product);
    setKeypadMode('add');
    setKeypadValue('');
    setShowKeypadModal(true);
  };

  const openKeypadForCartEdit = (item: CartItem) => {
    setKeypadProduct(item.product);
    setKeypadMode('edit');
    setKeypadValue(item.quantity.toString());
    setShowKeypadModal(true);
  };

  const handleKeypadConfirm = () => {
    const qty = parseInt(keypadValue);
    if (!keypadProduct || isNaN(qty) || qty <= 0) {
      return;
    }
    if (keypadMode === 'add') {
      addToCart(keypadProduct, qty);
    } else {
      updateQuantity(keypadProduct.id, qty);
    }
    setShowKeypadModal(false);
    setKeypadProduct(null);
    setKeypadValue('');
  };

  const handleKeypadDigit = (digit: string) => {
    setKeypadValue(prev => {
      if (prev === '' || prev === '0') return digit;
      const next = prev + digit;
      return next.length > 6 ? prev : next;
    });
  };

  const handleKeypadBackspace = () => {
    setKeypadValue(prev => (prev.length <= 1 ? '' : prev.slice(0, -1)));
  };

  const handleKeypadClear = () => {
    setKeypadValue('');
  };

  // Soporte de teclado físico cuando el modal está abierto
  useEffect(() => {
    if (!showKeypadModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        setKeypadValue(prev => {
          if (prev === '' || prev === '0') return e.key;
          const next = prev + e.key;
          return next.length > 6 ? prev : next;
        });
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setKeypadValue(prev => (prev.length <= 1 ? '' : prev.slice(0, -1)));
      } else if (e.key === 'Delete') {
        e.preventDefault();
        setKeypadValue('');
      } else if (e.key === 'Escape') {
        setShowKeypadModal(false);
        setKeypadProduct(null);
        setKeypadValue('');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleKeypadConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showKeypadModal, handleKeypadConfirm]);

  // Helper: lee stockQuantity sin importar si viene snake_case o camelCase del API
  const getProductStock = (product: Product | null): number | null => {
    if (!product) return null;
    const raw = product.stockQuantity ?? (product as any).stock_quantity;
    if (raw === undefined || raw === null) return null;
    const n = Number(raw);
    return isNaN(n) ? null : n;
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
    const subtotal = calculateSubtotal();
    const tax = calculateTax();
    const disc = parseFloat(discountPercentage) || 0;
    const discountAmt = disc > 0 ? (subtotal * disc) / 100 : 0;
    return subtotal + tax - discountAmt;
  };

  const calculateDiscountAmount = () => {
    const disc = parseFloat(discountPercentage) || 0;
    return disc > 0 ? (calculateSubtotal() * disc) / 100 : 0;
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

    // Credit sale requires customer selection
    if (paymentMethod === 'credit' && selectedCustomerId === 1) {
      alert('Selecciona un cliente para ventas a crédito');
      return;
    }

    const discPct = parseFloat(discountPercentage) || 0;
    const discAmt = calculateDiscountAmount();

    const payload: Order = {
      customerId: selectedCustomerId,
      status: paymentMethod === 'credit' ? 'pending' : 'completed',
      deliveryCost: 0,
      priority: 'normal',
      notes: 'Venta directa - Punto de Venta',
      paymentMethod,
      paymentStatus: paymentMethod === 'credit' ? 'credit' : 'paid',
      receivedAmount: paymentMethod === 'cash' ? Number(receivedAmount || 0) : Number(calculateTotal().toFixed(2)),
      changeAmount: paymentMethod === 'cash' ? Number(calculateChange().toFixed(2)) : 0,
      totalAmount: calculateTotal(),
      subtotalAmount: calculateSubtotal(),
      discountPercentage: discPct > 0 ? discPct : undefined,
      discountAmount: discAmt > 0 ? Number(discAmt.toFixed(2)) : undefined,
      orderType: 'sale',
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
    } as any;

    // If credit, also create credit charge
    if (paymentMethod === 'credit') {
      try {
        const token = getAuthToken();
        await fetch('/api/credits/charge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            customerId: selectedCustomerId,
            amount: calculateTotal(),
            description: `Venta a crédito - POS`,
          }),
        });
      } catch (e) {
        console.error('Error creating credit charge:', e);
      }
    }

    createSaleMutation.mutate(payload);
  };

  // Process appointment billing
  const processAppointmentBilling = async (appointment: any) => {
    const price = parseFloat(appointment.price || '0');
    if (price <= 0) {
      alert('Esta cita no tiene precio asignado');
      return;
    }

    const token = getAuthToken();
    try {
      // Create order for the appointment
      const orderPayload = {
        customerId: appointment.customerId || appointment.customer_id || 1,
        status: 'completed',
        deliveryCost: 0,
        priority: 'normal',
        notes: `Cobro de cita: ${appointment.title}`,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        receivedAmount: price,
        changeAmount: 0,
        totalAmount: price,
        orderType: 'appointment',
        items: [],
      };

      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(orderPayload),
      });
      if (!orderRes.ok) throw new Error('Error creando orden');
      const orderData = await orderRes.json();

      // Update appointment payment status
      await fetch(`/api/appointments/${appointment.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          paymentStatus: 'paid',
          paymentMethod: 'cash',
          orderId: orderData.id,
        }),
      });

      queryClient.invalidateQueries({ queryKey: ['appointments-today'] });

      // Show invoice
      const now = new Date();
      setInvoiceData({
        orderNumber: orderData.orderNumber || `APT-${now.getTime()}`,
        date: now.toLocaleDateString('es-DO'),
        time: now.toLocaleTimeString('es-DO'),
        paymentMethod: 'cash',
        items: [{
          productName: `Cita: ${appointment.title}`,
          quantity: 1,
          unitPrice: price,
          totalPrice: price,
        }],
        subtotal: price,
        tax: 0,
        total: price,
        receivedAmount: price,
        changeAmount: 0,
        storeName: storeSettings?.storeName || 'Tu Tienda',
        storeAddress: storeSettings?.storeAddress,
        storePhone: storeSettings?.storePhone,
        storeEmail: storeSettings?.storeEmail,
        logoUrl: storeSettings?.logoUrl,
        invoiceFooter: storeSettings?.invoiceFooter,
      });
      setShowInvoiceModal(true);
      setShowAppointmentBilling(false);
      setSelectedAppointment(null);

      alert('✅ Cita cobrada exitosamente');
    } catch (error: any) {
      alert(`Error: ${error?.message || 'No se pudo cobrar la cita'}`);
    }
  };

  // Process debt payment
  const processDebtPayment = async () => {
    if (!selectedDebtCustomer) return;
    const amount = parseFloat(debtPaymentAmount);
    if (!amount || amount <= 0) {
      alert('Ingresa un monto válido');
      return;
    }
    if (amount > parseFloat(selectedDebtCustomer.currentBalance || selectedDebtCustomer.current_balance || '0')) {
      alert('El monto excede la deuda pendiente');
      return;
    }

    const token = getAuthToken();
    try {
      const res = await fetch('/api/credits/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          customerId: selectedDebtCustomer.customerId || selectedDebtCustomer.customer_id,
          amount,
          paymentMethod: debtPaymentMethod,
          description: `Pago de deuda - POS`,
        }),
      });
      if (!res.ok) throw new Error('Error procesando pago');
      const paymentData = await res.json();

      queryClient.invalidateQueries({ queryKey: ['credits-pending'] });

      // Show payment receipt
      const now = new Date();
      setInvoiceData({
        orderNumber: paymentData.order?.orderNumber || `DEBT-${now.getTime()}`,
        date: now.toLocaleDateString('es-DO'),
        time: now.toLocaleTimeString('es-DO'),
        paymentMethod: debtPaymentMethod,
        items: [{
          productName: `Pago de deuda - ${selectedDebtCustomer.customerName || selectedDebtCustomer.customer_name || 'Cliente'}`,
          quantity: 1,
          unitPrice: amount,
          totalPrice: amount,
        }],
        subtotal: amount,
        tax: 0,
        total: amount,
        receivedAmount: amount,
        changeAmount: 0,
        storeName: storeSettings?.storeName || 'Tu Tienda',
        storeAddress: storeSettings?.storeAddress,
        storePhone: storeSettings?.storePhone,
        storeEmail: storeSettings?.storeEmail,
        logoUrl: storeSettings?.logoUrl,
        invoiceFooter: storeSettings?.invoiceFooter,
      });
      setShowInvoiceModal(true);
      setShowDebtPayment(false);
      setSelectedDebtCustomer(null);
      setDebtPaymentAmount('');

      alert('✅ Pago de deuda procesado exitosamente');
    } catch (error: any) {
      alert(`Error: ${error?.message || 'No se pudo procesar el pago'}`);
    }
  };

  const resetPOS = () => {
    setCart([]);
    setReceivedAmount('');
    setPaymentMethod('cash');
    setShowPaymentModal(false);
    setSearchQuery('');
    setSelectedCategory('Todos');
    setDiscountPercentage('');
    setSelectedCustomerId(1);
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
          <Package className="w-16 h-16 text-primary mx-auto mb-4" />
          <p className="text-lg text-gray-600">Cargando productos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header - Full Width */}
      <div className="bg-primary text-white p-4 shadow-lg flex justify-between items-center flex-shrink-0">
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
                    ? 'bg-white/20 text-white border border-white'
                    : 'bg-white text-primary'
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
            className="bg-white text-primary hover:bg-slate-100 border-0 flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Button>
        </div>
      </div>

      {/* Main Content - Full Width */}
      <div className="flex-1 overflow-hidden grid grid-cols-3 gap-4 p-4">
        {/* Products Section - 2/3 width */}
        <div className="col-span-2 flex flex-col bg-slate-50 rounded-lg overflow-hidden shadow">
          {/* Search Bar */}
          <div className="p-4 bg-primary flex gap-2 flex-shrink-0">
            <div className="flex-1 flex items-center gap-2 bg-primary/80 px-3 rounded-lg">
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
          <div className="p-4 bg-white border-b overflow-x-auto flex gap-2 flex-shrink-0 items-center">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-semibold transition-all ${
                  selectedCategory === category
                    ? 'bg-primary text-white'
                    : 'bg-white text-gray-600 border border-gray-300'
                }`}
              >
                {category}
              </button>
            ))}
            {/* Appointment quick-access button */}
            <button
              onClick={() => setShowAppointmentDialog(true)}
              className="ml-auto flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all shadow-md"
            >
              <CalendarDays className="w-4 h-4" />
              Agendar Cita
            </button>
            {/* Appointment billing button */}
            <button
              onClick={() => setShowAppointmentBilling(true)}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap text-sm font-semibold bg-teal-600 text-white hover:bg-teal-700 active:scale-95 transition-all shadow-md"
            >
              <Receipt className="w-4 h-4" />
              Cobrar Cita
            </button>
            {/* Debt payment button */}
            <button
              onClick={() => setShowDebtPayment(true)}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap text-sm font-semibold bg-orange-600 text-white hover:bg-orange-700 active:scale-95 transition-all shadow-md"
            >
              <CreditCard className="w-4 h-4" />
              Pagar Deuda
            </button>
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
                      className="cursor-pointer hover:shadow-lg transition-all border-2 border-primary/30 hover:border-primary"
                      onClick={() => openKeypadForProduct(product)}
                    >
                      <CardContent className="p-3">
                        <div className="aspect-video bg-gradient-to-br from-slate-100 to-slate-50 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={product.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Package className="w-12 h-12 text-primary" />
                          )}
                        </div>
                        <h3 className="font-semibold text-sm text-gray-900 line-clamp-2">{product.name}</h3>
                        <p className="text-xs text-primary my-1">{product.category}</p>
                        <p className="text-lg font-bold text-primary">{formatCurrency(getBasePrice(product))}</p>

                        {/* 🎁 Loyalty Points */}
                        {product.loyaltyPointsPropertyName && product.loyaltyPointsValue && (
                          <p className="text-xs bg-amber-50 text-amber-700 p-1 rounded mt-1 font-medium text-center">
                            🎁 {product.loyaltyPointsValue} {product.loyaltyPointsPropertyName}
                          </p>
                        )}

                        <Button
                          size="sm"
                          className="w-full mt-2 bg-primary hover:bg-primary/90 text-white"
                          onClick={(e) => { e.stopPropagation(); openKeypadForProduct(product); }}
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
                              className="text-[10px] border border-primary/30 rounded px-1 py-0.5 bg-white text-primary"
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
                            <span className="text-[10px] text-primary uppercase">
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
                      <div className="flex items-center bg-primary rounded overflow-hidden flex-shrink-0">
                        <button
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          className="text-white p-0.5 hover:bg-primary/90 h-6 w-6 flex items-center justify-center text-sm"
                        >
                          −
                        </button>
                        <button
                          onClick={() => openKeypadForCartEdit(item)}
                          className="text-white text-xs font-semibold w-10 text-center bg-primary border-none outline-none hover:bg-primary/80 h-6 flex items-center justify-center"
                        >
                          {item.quantity}
                        </button>
                        <button
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          className="text-white p-0.5 hover:bg-primary/90 h-6 w-6 flex items-center justify-center text-sm"
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
              <div className="p-3 bg-slate-50 border-t-2 border-b-2 border-primary space-y-2 flex-shrink-0">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-semibold">{formatCurrency(calculateSubtotal())}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">ITBIS (0%)</span>
                  <span className="font-semibold">{formatCurrency(calculateTax())}</span>
                </div>

                {/* Discount Input */}
                <div className="flex items-center gap-2">
                  <Percent className="w-4 h-4 text-orange-600" />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    placeholder="Desc %"
                    value={discountPercentage}
                    onChange={(e) => setDiscountPercentage(e.target.value)}
                    className="w-20 text-sm border rounded px-2 py-1 text-center"
                  />
                  {calculateDiscountAmount() > 0 && (
                    <span className="text-sm text-orange-600 font-semibold">
                      -{formatCurrency(calculateDiscountAmount())}
                    </span>
                  )}
                </div>

                <div className="flex justify-between border-t pt-2 mb-2">
                  <span className="font-bold text-lg">TOTAL</span>
                  <span className="font-bold text-lg text-primary">{formatCurrency(calculateTotal())}</span>
                </div>

                {/* 🎁 Loyalty Points Total */}
                {calculateTotalLoyaltyPoints() > 0 && (
                  <div className="flex justify-between items-center p-2 bg-amber-50 rounded-lg border border-amber-200">
                    <span className="text-sm font-medium text-amber-700">Puntos Acumulados:</span>
                    <span className="font-bold text-amber-600">
                      {calculateTotalLoyaltyPoints().toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {getLoyaltyPropertyName()}
                    </span>
                  </div>
                )}
              </div>

              {/* Checkout Button */}
              <Button
                onClick={handleCheckout}
                className="m-3 w-[calc(100%-1.5rem)] bg-primary hover:bg-primary/90 text-white font-bold py-6 text-lg flex-shrink-0"
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
            <div className="bg-primary/5 p-6 rounded-lg text-center border-2 border-primary">
              <p className="text-gray-600 mb-2">Total a Pagar</p>
              <p className="text-4xl font-bold text-primary">{formatCurrency(calculateTotal())}</p>
            </div>

            {/* Discount in Payment Modal */}
            {calculateDiscountAmount() > 0 && (
              <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg border border-orange-200">
                <span className="text-sm font-medium text-orange-700">Descuento ({discountPercentage}%)</span>
                <span className="font-bold text-orange-600">-{formatCurrency(calculateDiscountAmount())}</span>
              </div>
            )}

            {/* Payment Method Selection */}
            <div className="space-y-3">
              <p className="font-semibold text-gray-900">Método de Pago</p>
              <div className="grid grid-cols-4 gap-3">
                {(['cash', 'card', 'transfer', 'credit'] as const).map((method) => (
                  <button
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    className={`p-3 rounded-lg font-semibold transition-all border-2 text-sm ${
                      paymentMethod === method
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-gray-300 bg-white text-gray-600'
                    }`}
                  >
                    {method === 'cash' && '💵 Efectivo'}
                    {method === 'card' && '💳 Tarjeta'}
                    {method === 'transfer' && '🏦 Transferencia'}
                    {method === 'credit' && '📋 Crédito'}
                  </button>
                ))}
              </div>
            </div>

            {/* Customer Selection for Credit */}
            {paymentMethod === 'credit' && (
              <div className="space-y-3">
                <p className="font-semibold text-gray-900">Seleccionar Cliente</p>
                <Input
                  placeholder="Buscar cliente por nombre..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
                <div className="max-h-40 overflow-y-auto space-y-1 border rounded-lg p-2">
                  {(customers as any[])
                    .filter((c: any) => c.id !== 1 && (!customerSearch || c.name?.toLowerCase().includes(customerSearch.toLowerCase())))
                    .slice(0, 10)
                    .map((c: any) => (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedCustomerId(c.id); setCustomerSearch(c.name); }}
                        className={`w-full text-left p-2 rounded text-sm transition-colors ${
                          selectedCustomerId === c.id
                            ? 'bg-primary/10 text-primary font-semibold'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <span className="font-medium">{c.name}</span>
                        {c.phone && <span className="text-muted-foreground ml-2 text-xs">{c.phone}</span>}
                      </button>
                    ))}
                </div>
              </div>
            )}

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
                        className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-semibold text-primary transition-all"
                      >
                        {formatCurrency(amount)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Change Display */}
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-300">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-900">Cambio</span>
                    <span className={`text-2xl font-bold ${
                      parseFloat(receivedAmount) < calculateTotal() ? 'text-red-600' : 'text-primary'
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
              className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-6 text-lg"
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
                  className="text-2xl font-bold text-primary tracking-widest"
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
            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-lg">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  onClick={() => setSkuQuery(skuQuery + num.toString())}
                  className="p-3 bg-primary text-white font-bold rounded-lg hover:bg-primary/90 transition-all"
                >
                  {num}
                </button>
              ))}
              <button
                onClick={() => setSkuQuery(skuQuery + '0')}
                className="col-span-2 p-3 bg-primary text-white font-bold rounded-lg hover:bg-primary/90 transition-all"
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
                          className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg border-2 border-primary/30 cursor-pointer hover:bg-primary/10 hover:border-primary transition-all"
                        >
                          <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center overflow-hidden">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={product.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package className="w-8 h-8 text-primary" />
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
                            <p className="text-sm text-primary font-bold mt-1">
                              {formatCurrency(getBasePrice(product))}
                            </p>
                          </div>
                          <Plus className="w-6 h-6 text-primary" />
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

      {/* 🔢 Numeric Keypad Modal */}
      <Dialog open={showKeypadModal} onOpenChange={(open) => { if (!open) { setShowKeypadModal(false); setKeypadProduct(null); setKeypadValue(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {keypadMode === 'add' ? 'Agregar producto' : 'Editar cantidad'}
            </DialogTitle>
            {keypadProduct && (
              <DialogDescription asChild>
                <div className="space-y-1 text-left">
                  <p className="font-semibold text-gray-900 text-sm">{keypadProduct.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-primary font-bold">{formatCurrency(getBasePrice(keypadProduct))}</span>
                    {(() => {
                      const stock = getProductStock(keypadProduct);
                      if (stock === null) return null;
                      return (
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          stock <= 0 ? 'bg-red-100 text-red-700'
                          : stock < 5 ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-green-100 text-green-700'
                        }`}>
                          Stock: {stock}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-4">
            {/* Quantity display */}
            <div className="bg-slate-100 rounded-lg p-4 text-center">
              <p className={`text-4xl font-bold tracking-wider ${keypadValue ? 'text-primary' : 'text-gray-400'}`}>
                {keypadValue || 'Ingresa cantidad...'}
              </p>
              {(() => {
                const stock = getProductStock(keypadProduct);
                const qty = parseInt(keypadValue);
                if (keypadValue === '' || isNaN(qty) || stock === null) return null;
                if (qty > stock) {
                  return (
                    <div className="mt-2 flex items-center justify-center gap-1 bg-red-100 border border-red-400 rounded p-2">
                      <span className="text-red-700 text-sm font-bold">
                        ⚠️ Stock insuficiente — Disponible: {stock} unidades
                      </span>
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            {/* Numeric keypad */}
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  onClick={() => handleKeypadDigit(num.toString())}
                  className="p-4 bg-slate-100 hover:bg-slate-200 text-gray-900 font-bold text-lg rounded-lg transition-all"
                >
                  {num}
                </button>
              ))}
              <button
                onClick={handleKeypadClear}
                className="p-4 bg-slate-200 hover:bg-slate-300 text-gray-700 font-bold rounded-lg transition-all text-sm"
              >
                C
              </button>
              <button
                onClick={() => handleKeypadDigit('0')}
                className="p-4 bg-slate-100 hover:bg-slate-200 text-gray-900 font-bold text-lg rounded-lg transition-all"
              >
                0
              </button>
              <button
                onClick={handleKeypadBackspace}
                className="p-4 bg-slate-200 hover:bg-slate-300 text-gray-700 font-bold rounded-lg transition-all"
              >
                ⌫
              </button>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={() => { setShowKeypadModal(false); setKeypadProduct(null); setKeypadValue(''); }}
                className="py-3"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleKeypadConfirm}
                disabled={keypadValue === '' || parseInt(keypadValue) <= 0}
                className={`py-3 text-white font-bold ${
                  (() => {
                    const stock = getProductStock(keypadProduct);
                    const qty = parseInt(keypadValue);
                    return keypadValue !== '' && !isNaN(qty) && stock !== null && qty > stock;
                  })()
                    ? 'bg-orange-500 hover:bg-orange-600'
                    : 'bg-primary hover:bg-primary/90'
                }`}
              >
                {keypadMode === 'add' ? 'Agregar al carrito' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 🧾 Invoice Modal */}
      <InvoiceModal
        isOpen={showInvoiceModal}
        data={invoiceData}
        onClose={() => setShowInvoiceModal(false)}
      />

      {/* 📅 Appointment Quick Create Dialog */}
      <AppointmentQuickCreateDialog
        open={showAppointmentDialog}
        onOpenChange={setShowAppointmentDialog}
      />

      {/* 📋 Appointment Billing Dialog */}
      <Dialog open={showAppointmentBilling} onOpenChange={setShowAppointmentBilling}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-teal-600" />
              Cobrar Cita
            </DialogTitle>
            <DialogDescription>
              Selecciona una cita del día para cobrar
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {(todayAppointments as any[]).length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <CalendarDays className="w-12 h-12 mx-auto mb-2" />
                <p className="font-semibold">No hay citas para hoy</p>
              </div>
            ) : (
              (todayAppointments as any[]).map((apt: any) => {
                const isPaid = (apt.paymentStatus || apt.payment_status) === 'paid';
                const price = parseFloat(apt.price || '0');
                const time = apt.appointmentDate ? new Date(apt.appointmentDate).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }) : '';
                return (
                  <div
                    key={apt.id}
                    className={`p-3 rounded-lg border ${isPaid ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200 hover:border-teal-400'} transition-colors`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{time}</span>
                          <span className="font-medium">{apt.title}</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {apt.customerName || apt.customer_name || 'Cliente'}
                          {apt.serviceTypeName || apt.service_type_name
                            ? ` • ${apt.serviceTypeName || apt.service_type_name}`
                            : ''}
                        </p>
                        {price > 0 && (
                          <p className="text-sm font-bold text-green-700 mt-0.5">
                            {formatCurrency(price)}
                          </p>
                        )}
                      </div>
                      <div>
                        {isPaid ? (
                          <Badge className="bg-green-100 text-green-800 border-green-200">Pagado</Badge>
                        ) : (
                          <Button
                            size="sm"
                            className="bg-teal-600 hover:bg-teal-700 text-white"
                            onClick={() => processAppointmentBilling(apt)}
                            disabled={price <= 0}
                          >
                            <DollarSign className="w-4 h-4 mr-1" />
                            Cobrar
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 💰 Debt Payment Dialog */}
      <Dialog open={showDebtPayment} onOpenChange={(open) => { setShowDebtPayment(open); if (!open) { setSelectedDebtCustomer(null); setDebtPaymentAmount(''); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-orange-600" />
              Pagar Deuda Pendiente
            </DialogTitle>
            <DialogDescription>
              Selecciona un cliente y registra su pago
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!selectedDebtCustomer ? (
              <div className="space-y-3 max-h-[350px] overflow-y-auto">
                {(pendingCredits as any[]).length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <Users className="w-12 h-12 mx-auto mb-2" />
                    <p className="font-semibold">No hay deudas pendientes</p>
                  </div>
                ) : (
                  (pendingCredits as any[]).map((credit: any) => {
                    const balance = parseFloat(credit.currentBalance || credit.current_balance || '0');
                    return (
                      <button
                        key={credit.customerId || credit.customer_id}
                        onClick={() => setSelectedDebtCustomer(credit)}
                        className="w-full text-left p-3 rounded-lg border hover:border-orange-400 hover:bg-orange-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{credit.customerName || credit.customer_name}</p>
                            <p className="text-sm text-muted-foreground">{credit.customerPhone || credit.customer_phone || ''}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-red-600">{formatCurrency(balance)}</p>
                            <p className="text-xs text-muted-foreground">Deuda pendiente</p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
                  <p className="font-semibold">{selectedDebtCustomer.customerName || selectedDebtCustomer.customer_name}</p>
                  <p className="text-lg font-bold text-red-600 mt-1">
                    Deuda: {formatCurrency(parseFloat(selectedDebtCustomer.currentBalance || selectedDebtCustomer.current_balance || '0'))}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Monto a Pagar (RD$)</label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                    value={debtPaymentAmount}
                    onChange={(e) => setDebtPaymentAmount(e.target.value)}
                    className="text-xl font-bold text-center"
                  />
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDebtPaymentAmount(String(parseFloat(selectedDebtCustomer.currentBalance || selectedDebtCustomer.current_balance || '0')))}
                    >
                      Pagar todo
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold">Método de Pago</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['cash', 'card', 'transfer'] as const).map((method) => (
                      <button
                        key={method}
                        onClick={() => setDebtPaymentMethod(method)}
                        className={`p-2 rounded-lg text-sm font-semibold transition-all border-2 ${
                          debtPaymentMethod === method
                            ? 'border-primary bg-primary/10 text-primary'
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

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setSelectedDebtCustomer(null)}>
                    ← Volver
                  </Button>
                  <Button
                    className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
                    onClick={processDebtPayment}
                    disabled={!debtPaymentAmount || parseFloat(debtPaymentAmount) <= 0}
                  >
                    Procesar Pago
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
