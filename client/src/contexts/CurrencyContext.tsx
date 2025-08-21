// client/src/contexts/CurrencyContext.tsx

import React, { createContext, useContext, ReactNode } from 'react';
import { useCurrency } from '@/hooks/useCurrency';

type CurrencyContextType = ReturnType<typeof useCurrency>;

const CurrencyContext = createContext<CurrencyContextType | null>(null);

export const CurrencyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const currencyData = useCurrency();
  
  return (
    <CurrencyContext.Provider value={currencyData}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrencyContext = (): CurrencyContextType => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrencyContext must be used within a CurrencyProvider');
  }
  return context;
};