// server/unit-conversion.ts
// Utilities for unit conversion system

import type { DB } from './tenant-storage';
import { eq, and } from 'drizzle-orm';
import {
  measurementUnits,
  productUnitConversions,
  products,
  type MeasurementUnit,
  type ProductUnitConversion,
} from '../shared/schema';

/**
 * Result of a unit conversion operation
 */
export interface ConversionResult {
  success: boolean;
  convertedValue: number;
  sourceUnit: MeasurementUnit | null;
  targetUnit: MeasurementUnit | null;
  conversionFactor: number;
  error?: string;
}

/**
 * Get conversion factor between two units for a specific product
 * @param db - Database connection
 * @param productId - Product ID
 * @param sourceUnitId - Source unit ID
 * @param targetUnitId - Target unit ID (usually base unit)
 * @returns Conversion factor or null if not found
 */
export async function getConversionFactor(
  db: DB,
  productId: number,
  sourceUnitId: number,
  targetUnitId: number,
): Promise<number | null> {
  // If source and target are the same, factor is 1
  if (sourceUnitId === targetUnitId) {
    return 1;
  }

  // Look for direct conversion
  const conversion = await db
    .select()
    .from(productUnitConversions)
    .where(
      and(
        eq(productUnitConversions.productId, productId),
        eq(productUnitConversions.sourceUnitId, sourceUnitId),
        eq(productUnitConversions.targetUnitId, targetUnitId),
        eq(productUnitConversions.isActive, true),
      ),
    )
    .limit(1);

  if (conversion.length > 0) {
    return parseFloat(conversion[0].conversionFactor);
  }

  // Try reverse conversion (if A->B has factor F, then B->A has factor 1/F)
  const reverseConversion = await db
    .select()
    .from(productUnitConversions)
    .where(
      and(
        eq(productUnitConversions.productId, productId),
        eq(productUnitConversions.sourceUnitId, targetUnitId),
        eq(productUnitConversions.targetUnitId, sourceUnitId),
        eq(productUnitConversions.isActive, true),
      ),
    )
    .limit(1);

  if (reverseConversion.length > 0) {
    const factor = parseFloat(reverseConversion[0].conversionFactor);
    return 1 / factor;
  }

  return null;
}

/**
 * Convert a quantity from one unit to another for a specific product
 * @param db - Database connection
 * @param productId - Product ID
 * @param quantity - Quantity to convert
 * @param sourceUnitId - Source unit ID
 * @param targetUnitId - Target unit ID
 * @returns ConversionResult with converted value and metadata
 */
export async function convertQuantity(
  db: DB,
  productId: number,
  quantity: number,
  sourceUnitId: number,
  targetUnitId: number,
): Promise<ConversionResult> {
  // Get unit information
  const [sourceUnit, targetUnit] = await Promise.all([
    db.select().from(measurementUnits).where(eq(measurementUnits.id, sourceUnitId)).limit(1),
    db.select().from(measurementUnits).where(eq(measurementUnits.id, targetUnitId)).limit(1),
  ]);

  if (sourceUnit.length === 0) {
    return {
      success: false,
      convertedValue: 0,
      sourceUnit: null,
      targetUnit: targetUnit[0] || null,
      conversionFactor: 0,
      error: `Source unit with ID ${sourceUnitId} not found`,
    };
  }

  if (targetUnit.length === 0) {
    return {
      success: false,
      convertedValue: 0,
      sourceUnit: sourceUnit[0],
      targetUnit: null,
      conversionFactor: 0,
      error: `Target unit with ID ${targetUnitId} not found`,
    };
  }

  // Check if units are compatible (same type)
  if (sourceUnit[0].type !== targetUnit[0].type) {
    return {
      success: false,
      convertedValue: 0,
      sourceUnit: sourceUnit[0],
      targetUnit: targetUnit[0],
      conversionFactor: 0,
      error: `Cannot convert between different types: ${sourceUnit[0].type} and ${targetUnit[0].type}`,
    };
  }

  // Get conversion factor
  const factor = await getConversionFactor(db, productId, sourceUnitId, targetUnitId);

  if (factor === null) {
    return {
      success: false,
      convertedValue: 0,
      sourceUnit: sourceUnit[0],
      targetUnit: targetUnit[0],
      conversionFactor: 0,
      error: `No conversion factor found between ${sourceUnit[0].symbol} and ${targetUnit[0].symbol}`,
    };
  }

  // Perform conversion
  const convertedValue = quantity * factor;

  return {
    success: true,
    convertedValue,
    sourceUnit: sourceUnit[0],
    targetUnit: targetUnit[0],
    conversionFactor: factor,
  };
}

/**
 * Convert quantity to product's base unit
 * @param db - Database connection
 * @param productId - Product ID
 * @param quantity - Quantity to convert
 * @param unitId - Current unit ID
 * @returns ConversionResult with quantity in base unit
 */
export async function convertToBaseUnit(
  db: DB,
  productId: number,
  quantity: number,
  unitId: number,
): Promise<ConversionResult> {
  // Get product to find base unit
  const product = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (product.length === 0) {
    return {
      success: false,
      convertedValue: 0,
      sourceUnit: null,
      targetUnit: null,
      conversionFactor: 0,
      error: `Product with ID ${productId} not found`,
    };
  }

  if (!product[0].unitConversionEnabled) {
    return {
      success: false,
      convertedValue: 0,
      sourceUnit: null,
      targetUnit: null,
      conversionFactor: 0,
      error: `Unit conversion is not enabled for product ${productId}`,
    };
  }

  if (!product[0].baseUnitId) {
    return {
      success: false,
      convertedValue: 0,
      sourceUnit: null,
      targetUnit: null,
      conversionFactor: 0,
      error: `Product ${productId} has no base unit configured`,
    };
  }

  // Convert to base unit
  return convertQuantity(db, productId, quantity, unitId, product[0].baseUnitId);
}

/**
 * Check if a product has unit conversion enabled
 * @param db - Database connection
 * @param productId - Product ID
 * @returns true if unit conversion is enabled
 */
export async function isUnitConversionEnabled(
  db: DB,
  productId: number,
): Promise<boolean> {
  const product = await db
    .select({ unitConversionEnabled: products.unitConversionEnabled })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  return product.length > 0 && product[0].unitConversionEnabled === true;
}

/**
 * Get all available units for a product (units that have conversions configured)
 * @param db - Database connection
 * @param productId - Product ID
 * @param storeId - Store ID
 * @returns Array of available measurement units
 */
export async function getAvailableUnitsForProduct(
  db: DB,
  productId: number,
  storeId: number,
): Promise<MeasurementUnit[]> {
  // Get product base unit
  const product = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (product.length === 0 || !product[0].unitConversionEnabled || !product[0].baseUnitId) {
    return [];
  }

  // Get all units that have conversions configured for this product
  const conversions = await db
    .select({
      sourceUnitId: productUnitConversions.sourceUnitId,
      targetUnitId: productUnitConversions.targetUnitId,
    })
    .from(productUnitConversions)
    .where(
      and(
        eq(productUnitConversions.productId, productId),
        eq(productUnitConversions.isActive, true),
      ),
    );

  // Collect all unique unit IDs
  const unitIds = new Set<number>();
  unitIds.add(product[0].baseUnitId); // Always include base unit

  conversions.forEach((conv) => {
    unitIds.add(conv.sourceUnitId);
    unitIds.add(conv.targetUnitId);
  });

  // Get unit details
  const units = await db
    .select()
    .from(measurementUnits)
    .where(
      and(
        eq(measurementUnits.storeId, storeId),
        eq(measurementUnits.isActive, true),
      ),
    );

  // Filter to only units that are in our conversion set
  return units.filter((unit) => unitIds.has(unit.id));
}

/**
 * Create a bidirectional conversion between two units for a product
 * This creates two conversion records: A->B and B->A
 * @param db - Database connection
 * @param productId - Product ID
 * @param storeId - Store ID
 * @param unitAId - First unit ID
 * @param unitBId - Second unit ID
 * @param factorAtoB - Factor to convert from A to B (e.g., 1 kg = 1000 g, factor = 1000)
 * @returns Array of created conversion records
 */
export async function createBidirectionalConversion(
  db: DB,
  productId: number,
  storeId: number,
  unitAId: number,
  unitBId: number,
  factorAtoB: number,
): Promise<ProductUnitConversion[]> {
  // Validate factor
  if (factorAtoB <= 0) {
    throw new Error('Conversion factor must be positive');
  }

  // Calculate reverse factor
  const factorBtoA = 1 / factorAtoB;

  // Create both conversions
  const conversions = await db
    .insert(productUnitConversions)
    .values([
      {
        productId,
        storeId,
        sourceUnitId: unitAId,
        targetUnitId: unitBId,
        conversionFactor: factorAtoB.toString(),
        isActive: true,
      },
      {
        productId,
        storeId,
        sourceUnitId: unitBId,
        targetUnitId: unitAId,
        conversionFactor: factorBtoA.toString(),
        isActive: true,
      },
    ])
    .returning();

  return conversions;
}

/**
 * Common conversion factors for quick setup
 */
export const COMMON_CONVERSIONS = {
  // Weight conversions (to grams as base)
  weight: {
    'kg->g': 1000,
    'lb->g': 453.592,
    'oz->g': 28.3495,
  },
  // Volume conversions (to milliliters as base)
  volume: {
    'L->ml': 1000,
    'gal->ml': 3785.41,
  },
  // Length conversions (to centimeters as base)
  length: {
    'm->cm': 100,
  },
};

/**
 * Setup common conversions for a product
 * @param db - Database connection
 * @param productId - Product ID
 * @param storeId - Store ID
 * @param baseUnitSymbol - Base unit symbol (e.g., 'kg', 'L', 'm')
 * @param unitsToConvert - Array of unit symbols to convert to base (e.g., ['g', 'lb'])
 */
export async function setupCommonConversions(
  db: DB,
  productId: number,
  storeId: number,
  baseUnitSymbol: string,
  unitsToConvert: string[],
): Promise<ProductUnitConversion[]> {
  // Get units by symbol
  const allUnits = await db
    .select()
    .from(measurementUnits)
    .where(eq(measurementUnits.storeId, storeId));

  const baseUnit = allUnits.find((u) => u.symbol === baseUnitSymbol);
  if (!baseUnit) {
    throw new Error(`Base unit ${baseUnitSymbol} not found`);
  }

  const conversions: ProductUnitConversion[] = [];

  for (const symbol of unitsToConvert) {
    const unit = allUnits.find((u) => u.symbol === symbol);
    if (!unit) {
      console.warn(`Unit ${symbol} not found, skipping`);
      continue;
    }

    // Find conversion factor in common conversions
    const conversionKey = `${symbol}->${baseUnitSymbol}`;
    let factor = 1;

    // Search in COMMON_CONVERSIONS
    const type = unit.type as 'weight' | 'volume' | 'length';
    const typeConversions = COMMON_CONVERSIONS[type];
    if (typeConversions && conversionKey in typeConversions) {
      factor = typeConversions[conversionKey as keyof typeof typeConversions];
    } else {
      console.warn(`No common conversion found for ${conversionKey}, using factor 1`);
    }

    // Create bidirectional conversion
    const created = await createBidirectionalConversion(
      db,
      productId,
      storeId,
      unit.id,
      baseUnit.id,
      factor,
    );

    conversions.push(...created);
  }

  return conversions;
}
