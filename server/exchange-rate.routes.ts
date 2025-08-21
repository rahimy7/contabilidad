// server/exchange-rate.routes.ts

import { Router } from 'express';
import { ExchangeRateService } from './services/exchange-rate.service';
import { authenticateToken } from './authMiddleware';
import { getTenantDb } from './multi-tenant-db';
import type { AuthUser } from '@shared/auth';

const router = Router();

// Middleware para validar acceso a tienda
// Cambiar requireTenantAccess por solo verificar autenticación
const requireTenantAccess = async (req: any, res: any, next: any) => {
  try {
    const user = req.user as AuthUser;
    if (!user.storeId) {
      return res.status(400).json({ error: 'Store ID required' });
    }
    // Quitar validación de permisos aquí - ya se valida en el frontend
    next();
  } catch (error) {
    res.status(500).json({ error: 'Access validation failed' });
  }
};

// Obtener todas las tasas de cambio activas
router.get('/', authenticateToken, requireTenantAccess, async (req: any, res: any) => {
  try {
    const user = req.user as AuthUser;
    const tenantDb = await getTenantDb(user.storeId);
    const exchangeService = new ExchangeRateService(tenantDb);
    
    const rates = await exchangeService.getAllRates(user.storeId);
    res.json(rates);
  } catch (error) {
    console.error('Error getting exchange rates:', error);
    res.status(500).json({ error: 'Error obteniendo tasas de cambio' });
  }
});

// Obtener tasa específica entre dos monedas
router.get('/rate/:from/:to', authenticateToken, requireTenantAccess, async (req: any, res: any) => {
  try {
    const { from, to } = req.params;
    const user = req.user as AuthUser;
    const tenantDb = await getTenantDb(user.storeId);
    const exchangeService = new ExchangeRateService(tenantDb);
    
    const rate = await exchangeService.getCurrentRate(from.toUpperCase(), to.toUpperCase(), user.storeId);
    res.json({ from, to, rate });
  } catch (error) {
    console.error('Error getting specific rate:', error);
    res.status(404).json({ error: 'Tasa de cambio no encontrada' });
  }
});

// Convertir precio entre monedas
router.post('/convert', authenticateToken, requireTenantAccess, async (req: any, res: any) => {
  try {
    const { amount, fromCurrency, toCurrency } = req.body;
    const user = req.user as AuthUser;
    
    if (!amount || !fromCurrency || !toCurrency) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }

    const tenantDb = await getTenantDb(user.storeId);
    const exchangeService = new ExchangeRateService(tenantDb);
    
    const convertedAmount = await exchangeService.convertPrice(
      parseFloat(amount), 
      fromCurrency.toUpperCase(), 
      toCurrency.toUpperCase(), 
      user.storeId
    );
    
    res.json({
      originalAmount: amount,
      fromCurrency,
      toCurrency,
      convertedAmount,
      rate: await exchangeService.getCurrentRate(fromCurrency, toCurrency, user.storeId)
    });
  } catch (error) {
    console.error('Error converting price:', error);
    res.status(500).json({ error: 'Error convirtiendo precio' });
  }
});

// Actualizar tasa de cambio (solo admin)
router.post('/', authenticateToken, requireTenantAccess, async (req: any, res: any) => {
  try {
    const { baseCurrency, targetCurrency, rate } = req.body;
    const user = req.user as AuthUser;
    
    // Verificar permisos de admin
    if (user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'store_admin') {
      return res.status(403).json({ error: 'Permisos insuficientes' });
    }

    if (!baseCurrency || !targetCurrency || !rate) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos' });
    }

    const tenantDb = await getTenantDb(user.storeId);
    const exchangeService = new ExchangeRateService(tenantDb);
    
    // Validar tasa
    const validation = exchangeService.validateRate(
      baseCurrency.toUpperCase(), 
      targetCurrency.toUpperCase(), 
      parseFloat(rate)
    );
    
    if (!validation.valid) {
      return res.status(400).json({ error: validation.message });
    }
    
    const newRate = await exchangeService.updateRate(
      baseCurrency.toUpperCase(),
      targetCurrency.toUpperCase(),
      parseFloat(rate),
      user.storeId,
      user.id
    );
    
    res.json(newRate);
  } catch (error) {
    console.error('Error updating exchange rate:', error);
    res.status(500).json({ error: 'Error actualizando tasa de cambio' });
  }
});

// Obtener historial de tasas
router.get('/history/:from/:to', authenticateToken, requireTenantAccess, async (req: any, res: any) => {
  try {
    const { from, to } = req.params;
    const { limit = 10 } = req.query;
    const user = req.user as AuthUser;
    
    const tenantDb = await getTenantDb(user.storeId);
    const exchangeService = new ExchangeRateService(tenantDb);
    
    const history = await exchangeService.getHistoricalRates(
      from.toUpperCase(), 
      to.toUpperCase(), 
      user.storeId, 
      parseInt(limit as string)
    );
    
    res.json(history);
  } catch (error) {
    console.error('Error getting rate history:', error);
    res.status(500).json({ error: 'Error obteniendo historial' });
  }
});

export { router as exchangeRateRoutes };