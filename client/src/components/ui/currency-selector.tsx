// components/ui/currency-selector.tsx
import React, { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Globe, DollarSign } from 'lucide-react';

// Configuración de monedas soportadas
export const SUPPORTED_CURRENCIES = [
  { 
    code: 'DOP', 
    name: 'Peso Dominicano', 
    symbol: 'RD$',
    flag: '🇩🇴',
    locale: 'es-DO'
  },
  { 
    code: 'USD', 
    name: 'Dólar Estadounidense', 
    symbol: '$',
    flag: '🇺🇸',
    locale: 'en-US'
  },
];

interface CurrencySelectorProps {
  selectedCurrency: string;
  onCurrencyChange: (currency: string) => void;
  disabled?: boolean;
  showFullName?: boolean;
  variant?: 'default' | 'compact';
}

export const CurrencySelector: React.FC<CurrencySelectorProps> = ({
  selectedCurrency,
  onCurrencyChange,
  disabled = false,
  showFullName = true,
  variant = 'default'
}) => {
  const currentCurrency = SUPPORTED_CURRENCIES.find(c => c.code === selectedCurrency);

  if (variant === 'compact') {
    return (
      <Select
        value={selectedCurrency}
        onValueChange={onCurrencyChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-20 h-8 text-xs">
          <SelectValue>
            {currentCurrency?.code || 'DOP'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_CURRENCIES.map((currency) => (
            <SelectItem key={currency.code} value={currency.code}>
              <div className="flex items-center gap-2">
                <span>{currency.flag}</span>
                <span className="font-mono text-xs">{currency.code}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Select
      value={selectedCurrency}
      onValueChange={onCurrencyChange}
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4" />
          <SelectValue>
            {currentCurrency ? (
              <div className="flex items-center gap-2">
                <span>{currentCurrency.flag}</span>
                {showFullName ? (
                  <span>{currentCurrency.name} ({currentCurrency.symbol})</span>
                ) : (
                  <span>{currentCurrency.code}</span>
                )}
              </div>
            ) : (
              'Seleccionar moneda'
            )}
          </SelectValue>
        </div>
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_CURRENCIES.map((currency) => (
          <SelectItem key={currency.code} value={currency.code}>
            <div className="flex items-center gap-3 w-full">
              <span className="text-lg">{currency.flag}</span>
              <div className="flex flex-col">
                <span className="font-medium">{currency.name}</span>
                <span className="text-xs text-gray-500">
                  {currency.symbol} ({currency.code})
                </span>
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

// Hook personalizado para manejar conversión de moneda
export const useCurrencyFormatter = () => {
  const formatCurrency = (
    amount: string | number,
    currency: string = 'DOP'
  ): string => {
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    
    if (isNaN(numericAmount)) return 'N/A';

    const currencyConfig = SUPPORTED_CURRENCIES.find(c => c.code === currency);
    
    if (!currencyConfig) {
      return `${numericAmount.toFixed(2)} ${currency}`;
    }

    try {
      return new Intl.NumberFormat(currencyConfig.locale, {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(numericAmount);
    } catch (error) {
      // Fallback si la moneda no es soportada por Intl
      return `${currencyConfig.symbol}${numericAmount.toFixed(2)}`;
    }
  };

  const getCurrencySymbol = (currency: string): string => {
    const currencyConfig = SUPPORTED_CURRENCIES.find(c => c.code === currency);
    return currencyConfig?.symbol || currency;
  };

  const getCurrencyName = (currency: string): string => {
    const currencyConfig = SUPPORTED_CURRENCIES.find(c => c.code === currency);
    return currencyConfig?.name || currency;
  };

  return {
    formatCurrency,
    getCurrencySymbol,
    getCurrencyName,
    supportedCurrencies: SUPPORTED_CURRENCIES
  };
};

// Contexto para manejar la moneda global de la aplicación
export const CurrencyContext = React.createContext<{
  globalCurrency: string;
  setGlobalCurrency: (currency: string) => void;
  formatCurrency: (amount: string | number, currency?: string) => string;
}>({
  globalCurrency: 'DOP',
  setGlobalCurrency: () => {},
  formatCurrency: () => '',
});

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [globalCurrency, setGlobalCurrency] = useState<string>(() => {
    // Recuperar moneda guardada o usar DOP por defecto
    return localStorage.getItem('preferredCurrency') || 'DOP';
  });

  const { formatCurrency } = useCurrencyFormatter();

  useEffect(() => {
    // Guardar moneda preferida
    localStorage.setItem('preferredCurrency', globalCurrency);
  }, [globalCurrency]);

  const contextValue = {
    globalCurrency,
    setGlobalCurrency,
    formatCurrency: (amount: string | number, currency?: string) => 
      formatCurrency(amount, currency || globalCurrency)
  };

  return (
    <CurrencyContext.Provider value={contextValue}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = React.useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency debe ser usado dentro de CurrencyProvider');
  }
  return context;
};