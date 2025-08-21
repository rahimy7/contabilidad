// client/src/hooks/useCurrency.ts

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

interface ExchangeRate {
  id: number;
  baseCurrency: string;
  targetCurrency: string;
  rate: string;
  updatedAt: string;
}

interface CurrencyConfig {
  code: string;
  name: string;
  symbol: string;
}

const SUPPORTED_CURRENCIES: CurrencyConfig[] = [
  { code: 'DOP', name: 'Peso Dominicano', symbol: 'RD$' },
  { code: 'USD', name: 'Dólar Estadounidense', symbol: '$' }
];

export const useCurrency = () => {
  const [selectedCurrency, setSelectedCurrency] = useState<string>(() => {
    return localStorage.getItem('preferred-currency') || 'DOP';
  });

  // Obtener tasas de cambio
  const { data: exchangeRates = [], isLoading: ratesLoading } = useQuery<ExchangeRate[]>({
    queryKey: ['/api/exchange-rates'],
    staleTime: 5 * 60 * 1000, // 5 minutos
  });

  // Persistir selección
  useEffect(() => {
    localStorage.setItem('preferred-currency', selectedCurrency);
  }, [selectedCurrency]);

  // Obtener tasa de conversión
  const getConversionRate = useCallback((fromCurrency: string, toCurrency: string): number => {
    if (fromCurrency === toCurrency) return 1;

    // Buscar tasa directa
    const directRate = exchangeRates.find(rate => 
      rate.baseCurrency === fromCurrency && rate.targetCurrency === toCurrency
    );
    
    if (directRate) return parseFloat(directRate.rate);

    // Buscar tasa inversa
    const inverseRate = exchangeRates.find(rate => 
      rate.baseCurrency === toCurrency && rate.targetCurrency === fromCurrency
    );
    
    if (inverseRate) return 1 / parseFloat(inverseRate.rate);

    console.warn(`No exchange rate found for ${fromCurrency} to ${toCurrency}`);
    return 1; // Fallback
  }, [exchangeRates]);

  // Convertir precio
  const convertPrice = useCallback((price: number, fromCurrency: string): number => {
    if (!price || fromCurrency === selectedCurrency) return price;
    
    const rate = getConversionRate(fromCurrency, selectedCurrency);
    return price * rate;
  }, [selectedCurrency, getConversionRate]);

  // Formatear moneda
  const formatCurrency = useCallback((amount: number, currency?: string): string => {
    const currencyToUse = currency || selectedCurrency;
    const currencyConfig = SUPPORTED_CURRENCIES.find(c => c.code === currencyToUse);
    
    if (!currencyConfig) return amount.toFixed(2);

    const locale = currencyToUse === 'USD' ? 'en-US' : 'es-DO';
    
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyToUse,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }, [selectedCurrency]);

  // Convertir producto completo
  const convertProduct = useCallback((product: any) => {
    if (!product) return product;

    const convertedPrice = convertPrice(parseFloat(product.price || 0), product.baseCurrency || 'DOP');
    const convertedSalePrice = product.salePrice 
      ? convertPrice(parseFloat(product.salePrice), product.baseCurrency || 'DOP')
      : null;

    return {
      ...product,
      originalPrice: product.price,
      originalCurrency: product.baseCurrency || 'DOP',
      convertedPrice,
      convertedSalePrice,
      displayCurrency: selectedCurrency,
      conversionApplied: (product.baseCurrency || 'DOP') !== selectedCurrency,
      formattedPrice: formatCurrency(convertedPrice),
      formattedSalePrice: convertedSalePrice ? formatCurrency(convertedSalePrice) : null
    };
  }, [convertPrice, selectedCurrency, formatCurrency]);

  // Obtener información de moneda actual
  const currentCurrencyInfo = SUPPORTED_CURRENCIES.find(c => c.code === selectedCurrency);

  return {
    selectedCurrency,
    setSelectedCurrency,
    supportedCurrencies: SUPPORTED_CURRENCIES,
    currentCurrencyInfo,
    exchangeRates,
    ratesLoading,
    convertPrice,
    convertProduct,
    formatCurrency,
    getConversionRate
  };
};