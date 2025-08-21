// server/middleware/currency.middleware.ts

import { ExchangeRateService } from '../services/exchange-rate.service';
import { getTenantDb } from '../multi-tenant-db';
import type { AuthUser } from '@shared/auth';

/**
 * Middleware para agregar funcionalidades de conversión de moneda a las requests
 */
export const currencyMiddleware = (req: any, res: any, next: any) => {
  // Obtener moneda preferida de query params, headers o default
  const requestedCurrency = (
    req.query.currency || 
    req.headers['x-currency'] || 
    req.body.currency || 
    'DOP'
  ).toString().toUpperCase();

  // Validar moneda soportada
  const supportedCurrencies = ['USD', 'DOP'];
  if (!supportedCurrencies.includes(requestedCurrency)) {
    return res.status(400).json({ 
      error: `Moneda no soportada: ${requestedCurrency}. Soportadas: ${supportedCurrencies.join(', ')}` 
    });
  }

  // Agregar utilidades de conversión a la request
  req.currency = {
    requested: requestedCurrency,
    
    // Función helper para convertir precios
    convertPrice: async (price: number, fromCurrency: string) => {
      try {
        if (!req.user?.storeId) {
          throw new Error('Store ID required for currency conversion');
        }

        const tenantDb = await getTenantDb(req.user.storeId);
        const exchangeService = new ExchangeRateService(tenantDb);
        
        return await exchangeService.convertPrice(
          price, 
          fromCurrency, 
          requestedCurrency, 
          req.user.storeId
        );
      } catch (error) {
        console.error('Currency conversion error:', error);
        return price; // Fallback al precio original
      }
    },

    // Función helper para convertir productos
    convertProduct: async (product: any) => {
      try {
        if (!product.base_currency || product.base_currency === requestedCurrency) {
          return {
            ...product,
            convertedPrice: product.price,
            displayCurrency: product.base_currency || requestedCurrency,
            conversionApplied: false
          };
        }

        const convertedPrice = await req.currency.convertPrice(
          parseFloat(product.price), 
          product.base_currency
        );

        return {
          ...product,
          convertedPrice,
          originalPrice: product.price,
          originalCurrency: product.base_currency,
          displayCurrency: requestedCurrency,
          conversionApplied: true
        };
      } catch (error) {
        console.error('Product conversion error:', error);
        return product;
      }
    },

    // Función helper para convertir arrays de productos
    convertProducts: async (products: any[]) => {
      const conversionPromises = products.map(product => req.currency.convertProduct(product));
      return await Promise.all(conversionPromises);
    }
  };

  next();
};

/**
 * Middleware específico para endpoints de productos que requieren conversión automática
 */
export const productCurrencyMiddleware = [
  currencyMiddleware,
  async (req: any, res: any, next: any) => {
    // Interceptar el response para convertir productos automáticamente
    const originalJson = res.json;
    
    res.json = async function(data: any) {
      try {
        // Si el response contiene productos, convertirlos
        if (Array.isArray(data)) {
          // Array de productos
          data = await req.currency.convertProducts(data);
        } else if (data && typeof data === 'object') {
          if (data.price && data.base_currency) {
            // Producto individual
            data = await req.currency.convertProduct(data);
          } else if (data.products && Array.isArray(data.products)) {
            // Objeto con array de productos
            data.products = await req.currency.convertProducts(data.products);
          } else if (data.items && Array.isArray(data.items)) {
            // Objeto con items (para paginación)
            data.items = await req.currency.convertProducts(data.items);
          }
        }

        return originalJson.call(this, data);
      } catch (error) {
        console.error('Error in product currency conversion:', error);
        return originalJson.call(this, data); // Fallback
      }
    };

    next();
  }
];

/**
 * Helper para formatear moneda en responses
 */
export const formatCurrency = (amount: number, currency: string): string => {
  const currencyConfig = {
    USD: { locale: 'en-US', currency: 'USD' },
    DOP: { locale: 'es-DO', currency: 'DOP' }
  };

  const config = currencyConfig[currency as keyof typeof currencyConfig] || currencyConfig.DOP;
  
  return new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};