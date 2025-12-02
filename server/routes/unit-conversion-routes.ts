// server/routes/unit-conversion-routes.ts
// Rutas para gestión de unidades de medida y conversiones

import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { authenticateToken } from '../authMiddleware';
import { getTenantStorage } from '../storage';
import { getTenantDb } from '../multi-tenant-db';
import * as schema from '../../shared/schema';
import {
  convertQuantity,
  convertToBaseUnit,
  getConversionFactor,
  getAvailableUnitsForProduct,
  createBidirectionalConversion,
  setupCommonConversions,
} from '../unit-conversion';

const router = Router();

// Middleware para verificar roles
const requireRole = (allowedRoles: string[]) => {
  return (req: any, res: any, next: any) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    next();
  };
};

// Helper para obtener DB
async function getDb(storeId: string | number) {
  const id = typeof storeId === 'string' ? parseInt(storeId) : storeId;
  return await getTenantDb(id);
}

// ================================
// RUTAS PARA UNIDADES DE MEDIDA
// ================================

/**
 * GET /api/measurement-units
 * Obtener todas las unidades de medida de la tienda
 */
router.get(
  '/measurement-units',
  authenticateToken,
  async (req: any, res: any) => {
    try {
      const storeId = req.user.storeId;
      const storage = await getTenantStorage(storeId);

      const units = await storage.getAllMeasurementUnits();

      res.json(units);
    } catch (error: any) {
      console.error('Error getting measurement units:', error);
      res.status(500).json({ error: error.message || 'Error al obtener unidades de medida' });
    }
  }
);

/**
 * GET /api/measurement-units/active
 * Obtener unidades activas de la tienda
 */
router.get(
  '/measurement-units/active',
  authenticateToken,
  async (req: any, res: any) => {
    try {
      const storeId = req.user.storeId;
      const storage = await getTenantStorage(storeId);

      const units = await storage.getActiveMeasurementUnits();

      res.json(units);
    } catch (error: any) {
      console.error('Error getting active measurement units:', error);
      res.status(500).json({ error: error.message || 'Error al obtener unidades activas' });
    }
  }
);

/**
 * GET /api/measurement-units/:id
 * Obtener una unidad de medida por ID
 */
router.get(
  '/measurement-units/:id',
  authenticateToken,
  async (req: any, res: any) => {
    try {
      const storeId = req.user.storeId;
      const unitId = parseInt(req.params.id);
      const storage = await getTenantStorage(storeId);

      const unit = await storage.getMeasurementUnitById(unitId);

      if (!unit) {
        return res.status(404).json({ error: 'Unidad de medida no encontrada' });
      }

      res.json(unit);
    } catch (error: any) {
      console.error('Error getting measurement unit:', error);
      res.status(500).json({ error: error.message || 'Error al obtener unidad de medida' });
    }
  }
);

/**
 * POST /api/measurement-units
 * Crear nueva unidad de medida
 */
router.post(
  '/measurement-units',
  authenticateToken,
  requireRole(['admin', 'store_admin']),
  async (req: any, res: any) => {
    try {
      const storeId = req.user.storeId;
      const storage = await getTenantStorage(storeId);

      const { name, symbol, type, abbreviation, sortOrder } = req.body;

      // Validación
      if (!name || !symbol || !type) {
        return res.status(400).json({
          error: 'Campos requeridos: name, symbol, type'
        });
      }

      if (!['weight', 'volume', 'unit', 'length'].includes(type)) {
        return res.status(400).json({
          error: 'Tipo debe ser: weight, volume, unit o length'
        });
      }

      const unit = await storage.createMeasurementUnit({
        name,
        symbol,
        type,
        abbreviation,
        sortOrder: sortOrder || 0,
        isActive: true,
      });

      res.status(201).json(unit);
    } catch (error: any) {
      console.error('Error creating measurement unit:', error);
      res.status(500).json({ error: error.message || 'Error al crear unidad de medida' });
    }
  }
);

/**
 * PUT /api/measurement-units/:id
 * Actualizar unidad de medida
 */
router.put(
  '/measurement-units/:id',
  authenticateToken,
  requireRole(['admin', 'store_admin']),
  async (req: any, res: any) => {
    try {
      const storeId = req.user.storeId;
      const unitId = parseInt(req.params.id);
      const storage = await getTenantStorage(storeId);

      const { name, symbol, type, abbreviation, sortOrder, isActive } = req.body;

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (symbol !== undefined) updateData.symbol = symbol;
      if (type !== undefined) {
        if (!['weight', 'volume', 'unit', 'length'].includes(type)) {
          return res.status(400).json({
            error: 'Tipo debe ser: weight, volume, unit o length'
          });
        }
        updateData.type = type;
      }
      if (abbreviation !== undefined) updateData.abbreviation = abbreviation;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
      if (isActive !== undefined) updateData.isActive = isActive;

      const unit = await storage.updateMeasurementUnit(unitId, updateData);

      if (!unit) {
        return res.status(404).json({ error: 'Unidad de medida no encontrada' });
      }

      res.json(unit);
    } catch (error: any) {
      console.error('Error updating measurement unit:', error);
      res.status(500).json({ error: error.message || 'Error al actualizar unidad de medida' });
    }
  }
);

/**
 * DELETE /api/measurement-units/:id
 * Eliminar (desactivar) unidad de medida
 */
router.delete(
  '/measurement-units/:id',
  authenticateToken,
  requireRole(['admin', 'store_admin']),
  async (req: any, res: any) => {
    try {
      const storeId = req.user.storeId;
      const unitId = parseInt(req.params.id);
      const storage = await getTenantStorage(storeId);

      const success = await storage.deleteMeasurementUnit(unitId);

      if (!success) {
        return res.status(404).json({ error: 'Unidad de medida no encontrada' });
      }

      res.json({ message: 'Unidad de medida desactivada correctamente' });
    } catch (error: any) {
      console.error('Error deleting measurement unit:', error);
      res.status(500).json({ error: error.message || 'Error al eliminar unidad de medida' });
    }
  }
);

// ================================
// RUTAS PARA CONVERSIONES DE UNIDADES
// ================================

/**
 * GET /api/products/:productId/unit-conversions
 * Obtener todas las conversiones configuradas para un producto
 */
router.get(
  '/products/:productId/unit-conversions',
  authenticateToken,
  async (req: any, res: any) => {
    try {
      const storeId = req.user.storeId;
      const productId = parseInt(req.params.productId);
      const storage = await getTenantStorage(storeId);

      const conversions = await storage.getProductUnitConversions(productId);

      res.json(conversions);
    } catch (error: any) {
      console.error('Error getting product unit conversions:', error);
      res.status(500).json({ error: error.message || 'Error al obtener conversiones' });
    }
  }
);

/**
 * GET /api/products/:productId/available-units
 * Obtener unidades disponibles para un producto (con conversiones configuradas)
 */
router.get(
  '/products/:productId/available-units',
  authenticateToken,
  async (req: any, res: any) => {
    try {
      const storeId = req.user.storeId;
      const productId = parseInt(req.params.productId);
      const storage = await getTenantStorage(storeId);

      const units = await storage.getAvailableUnitsForProduct(productId);

      res.json(units);
    } catch (error: any) {
      console.error('Error getting available units for product:', error);
      res.status(500).json({ error: error.message || 'Error al obtener unidades disponibles' });
    }
  }
);

/**
 * POST /api/products/:productId/unit-conversions
 * Crear conversión de unidad para un producto
 */
router.post(
  '/products/:productId/unit-conversions',
  authenticateToken,
  requireRole(['admin', 'store_admin']),
  async (req: any, res: any) => {
    try {
      const storeId = req.user.storeId;
      const productId = parseInt(req.params.productId);
      const storage = await getTenantStorage(storeId);

      const { sourceUnitId, targetUnitId, conversionFactor, notes, bidirectional } = req.body;

      // Validación
      if (!sourceUnitId || !targetUnitId || !conversionFactor) {
        return res.status(400).json({
          error: 'Campos requeridos: sourceUnitId, targetUnitId, conversionFactor'
        });
      }

      const factor = parseFloat(conversionFactor);
      if (isNaN(factor) || factor <= 0) {
        return res.status(400).json({
          error: 'El factor de conversión debe ser un número positivo'
        });
      }

      // Si se solicita conversión bidireccional, usar helper
      if (bidirectional) {
        const db = await getDb(storeId);
        const conversions = await createBidirectionalConversion(
          db,
          productId,
          storeId,
          sourceUnitId,
          targetUnitId,
          factor
        );
        return res.status(201).json(conversions);
      }

      // Crear conversión unidireccional
      const conversion = await storage.createProductUnitConversion({
        productId,
        sourceUnitId,
        targetUnitId,
        conversionFactor: conversionFactor.toString(),
        notes,
        isActive: true,
      });

      res.status(201).json(conversion);
    } catch (error: any) {
      console.error('Error creating product unit conversion:', error);
      res.status(500).json({ error: error.message || 'Error al crear conversión' });
    }
  }
);

/**
 * PUT /api/products/:productId/unit-conversions/:conversionId
 * Actualizar conversión de unidad
 */
router.put(
  '/products/:productId/unit-conversions/:conversionId',
  authenticateToken,
  requireRole(['admin', 'store_admin']),
  async (req: any, res: any) => {
    try {
      const storeId = req.user.storeId;
      const conversionId = parseInt(req.params.conversionId);
      const storage = await getTenantStorage(storeId);

      const { conversionFactor, notes, isActive } = req.body;

      const updateData: any = {};
      if (conversionFactor !== undefined) {
        const factor = parseFloat(conversionFactor);
        if (isNaN(factor) || factor <= 0) {
          return res.status(400).json({
            error: 'El factor de conversión debe ser un número positivo'
          });
        }
        updateData.conversionFactor = conversionFactor.toString();
      }
      if (notes !== undefined) updateData.notes = notes;
      if (isActive !== undefined) updateData.isActive = isActive;

      const conversion = await storage.updateProductUnitConversion(conversionId, updateData);

      if (!conversion) {
        return res.status(404).json({ error: 'Conversión no encontrada' });
      }

      res.json(conversion);
    } catch (error: any) {
      console.error('Error updating product unit conversion:', error);
      res.status(500).json({ error: error.message || 'Error al actualizar conversión' });
    }
  }
);

/**
 * DELETE /api/products/:productId/unit-conversions/:conversionId
 * Eliminar conversión de unidad
 */
router.delete(
  '/products/:productId/unit-conversions/:conversionId',
  authenticateToken,
  requireRole(['admin', 'store_admin']),
  async (req: any, res: any) => {
    try {
      const storeId = req.user.storeId;
      const conversionId = parseInt(req.params.conversionId);
      const storage = await getTenantStorage(storeId);

      const success = await storage.deleteProductUnitConversion(conversionId);

      if (!success) {
        return res.status(404).json({ error: 'Conversión no encontrada' });
      }

      res.json({ message: 'Conversión eliminada correctamente' });
    } catch (error: any) {
      console.error('Error deleting product unit conversion:', error);
      res.status(500).json({ error: error.message || 'Error al eliminar conversión' });
    }
  }
);

// ================================
// RUTAS DE UTILIDADES/HERRAMIENTAS
// ================================

/**
 * POST /api/unit-conversion/convert
 * Convertir una cantidad entre dos unidades para un producto
 */
router.post(
  '/unit-conversion/convert',
  authenticateToken,
  async (req: any, res: any) => {
    try {
      const storeId = req.user.storeId;
      const { productId, quantity, sourceUnitId, targetUnitId } = req.body;

      // Validación
      if (!productId || !quantity || !sourceUnitId || !targetUnitId) {
        return res.status(400).json({
          error: 'Campos requeridos: productId, quantity, sourceUnitId, targetUnitId'
        });
      }

      const db = await getDb(storeId);
      const result = await convertQuantity(
        db,
        productId,
        parseFloat(quantity),
        sourceUnitId,
        targetUnitId
      );

      res.json(result);
    } catch (error: any) {
      console.error('Error converting quantity:', error);
      res.status(500).json({ error: error.message || 'Error al convertir cantidad' });
    }
  }
);

/**
 * POST /api/unit-conversion/convert-to-base
 * Convertir una cantidad a la unidad base del producto
 */
router.post(
  '/unit-conversion/convert-to-base',
  authenticateToken,
  async (req: any, res: any) => {
    try {
      const storeId = req.user.storeId;
      const { productId, quantity, unitId } = req.body;

      // Validación
      if (!productId || !quantity || !unitId) {
        return res.status(400).json({
          error: 'Campos requeridos: productId, quantity, unitId'
        });
      }

      const db = await getDb(storeId);
      const result = await convertToBaseUnit(
        db,
        productId,
        parseFloat(quantity),
        unitId
      );

      res.json(result);
    } catch (error: any) {
      console.error('Error converting to base unit:', error);
      res.status(500).json({ error: error.message || 'Error al convertir a unidad base' });
    }
  }
);

/**
 * POST /api/products/:productId/setup-common-conversions
 * Configurar conversiones comunes automáticamente para un producto
 */
router.post(
  '/products/:productId/setup-common-conversions',
  authenticateToken,
  requireRole(['admin', 'store_admin']),
  async (req: any, res: any) => {
    try {
      const storeId = req.user.storeId;
      const productId = parseInt(req.params.productId);
      const { baseUnitSymbol, unitsToConvert } = req.body;

      // Validación
      if (!baseUnitSymbol || !unitsToConvert || !Array.isArray(unitsToConvert)) {
        return res.status(400).json({
          error: 'Campos requeridos: baseUnitSymbol (string), unitsToConvert (array)'
        });
      }

      const db = await getDb(storeId);
      const conversions = await setupCommonConversions(
        db,
        productId,
        storeId,
        baseUnitSymbol,
        unitsToConvert
      );

      res.status(201).json({
        message: 'Conversiones configuradas correctamente',
        conversions,
      });
    } catch (error: any) {
      console.error('Error setting up common conversions:', error);
      res.status(500).json({ error: error.message || 'Error al configurar conversiones' });
    }
  }
);

export default router;
