// client/src/components/CurrencySelector.tsx

import React from 'react';
import { useCurrency } from '@/hooks/useCurrency';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DollarSign, TrendingUp } from 'lucide-react';

interface CurrencySelectorProps {
  variant?: 'default' | 'compact' | 'badge';
  showRates?: boolean;
}

export const CurrencySelector: React.FC<CurrencySelectorProps> = ({ 
  variant = 'default',
  showRates = false 
}) => {
  const { 
    selectedCurrency, 
    setSelectedCurrency, 
    supportedCurrencies,
    currentCurrencyInfo,
    exchangeRates,
    getConversionRate
  } = useCurrency();

  if (variant === 'badge') {
    return (
      <Badge variant="outline" className="cursor-pointer">
        <DollarSign className="w-3 h-3 mr-1" />
        {currentCurrencyInfo?.symbol} {selectedCurrency}
      </Badge>
    );
  }

  if (variant === 'compact') {
    return (
      <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
        <SelectTrigger className="w-20 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {supportedCurrencies.map((currency) => (
            <SelectItem key={currency.code} value={currency.code}>
              {currency.code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const usdRate = getConversionRate('USD', 'DOP');
  const dopRate = getConversionRate('DOP', 'USD');

  return (
    <div className="flex items-center gap-3">
      <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
        <SelectTrigger className="w-48">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            <SelectValue placeholder="Seleccionar moneda" />
          </div>
        </SelectTrigger>
        <SelectContent>
          {supportedCurrencies.map((currency) => (
            <SelectItem key={currency.code} value={currency.code}>
              <div className="flex items-center gap-2">
                <span className="font-medium">{currency.symbol}</span>
                <span>{currency.name}</span>
                <span className="text-muted-foreground">({currency.code})</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showRates && exchangeRates.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TrendingUp className="w-4 h-4" />
          <span>
            1 USD = {usdRate.toFixed(2)} DOP | 1 DOP = {dopRate.toFixed(4)} USD
          </span>
        </div>
      )}
    </div>
  );
};