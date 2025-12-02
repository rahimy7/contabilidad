# Sistema de Conversión de Unidades para Productos

## 📋 Descripción General

El sistema de conversión de unidades permite a los productos tener una unidad base y factores de conversión para otras unidades. Esto es útil para productos que se venden en diferentes presentaciones (ej: kg, g, libras) y asegura un control coherente del inventario.

## 🏗️ Arquitectura del Sistema

### Tablas de Base de Datos

#### 1. `measurement_units` - Catálogo de Unidades de Medida
Almacena todas las unidades disponibles por tienda.

```sql
CREATE TABLE measurement_units (
    id SERIAL PRIMARY KEY,
    store_id INTEGER NOT NULL,
    name TEXT NOT NULL,          -- "Kilogramo", "Gramo", "Litro"
    symbol TEXT NOT NULL,        -- "kg", "g", "L"
    type TEXT NOT NULL,          -- "weight", "volume", "unit", "length"
    abbreviation TEXT,           -- Abreviación alternativa
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);
```

**Tipos de unidades:**
- `weight`: Peso (kg, g, lb, oz)
- `volume`: Volumen (L, ml, gal)
- `unit`: Unidades contables (unidad, caja, paquete)
- `length`: Longitud (m, cm)

#### 2. `product_unit_conversions` - Factores de Conversión por Producto
Define cómo convertir entre diferentes unidades para un producto específico.

```sql
CREATE TABLE product_unit_conversions (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    store_id INTEGER NOT NULL,
    source_unit_id INTEGER NOT NULL REFERENCES measurement_units(id),
    target_unit_id INTEGER NOT NULL REFERENCES measurement_units(id),
    conversion_factor NUMERIC(15, 6) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    UNIQUE(product_id, source_unit_id, target_unit_id)
);
```

**Ejemplo de conversión:**
```
source_unit: kg
target_unit: g
conversion_factor: 1000
Significa: 1 kg = 1000 g
```

#### 3. Campos Agregados a `products`
```sql
ALTER TABLE products ADD COLUMN:
- unit_conversion_enabled BOOLEAN DEFAULT false  -- Activar/desactivar conversión
- base_unit_id INTEGER                           -- Unidad base del producto
```

#### 4. Campos Agregados a `order_items`
```sql
ALTER TABLE order_items ADD COLUMN:
- unit_id INTEGER                               -- Unidad usada en el pedido
- quantity_in_base_unit NUMERIC(12, 4)          -- Cantidad en unidad base
```

## 🔄 Flujo de Funcionamiento

### 1. Configuración Inicial del Producto

```typescript
// 1. Activar conversión de unidades en el producto
await db.update(products)
  .set({
    unitConversionEnabled: true,
    baseUnitId: kgUnitId, // ID de la unidad "kg"
  })
  .where(eq(products.id, productId));

// 2. Configurar factores de conversión
import { createBidirectionalConversion } from './server/unit-conversion';

// 1 kg = 1000 g
await createBidirectionalConversion(
  db,
  productId,
  storeId,
  kgUnitId,    // Unidad A
  gUnitId,     // Unidad B
  1000         // Factor: 1 kg = 1000 g
);

// 1 kg = 2.20462 lb
await createBidirectionalConversion(
  db,
  productId,
  storeId,
  kgUnitId,    // Unidad A
  lbUnitId,    // Unidad B
  2.20462      // Factor: 1 kg = 2.20462 lb
);
```

### 2. Crear Orden con Conversión

```typescript
import { convertToBaseUnit } from './server/unit-conversion';

// Cliente compra 500 gramos de un producto con base en kg
const quantity = 500;
const unitId = gUnitId; // Gramos

// Convertir a unidad base (kg)
const conversion = await convertToBaseUnit(db, productId, quantity, unitId);

if (conversion.success) {
  // Crear order item
  await db.insert(orderItems).values({
    orderId: orderId,
    productId: productId,
    quantity: quantity,                           // 500 (original)
    unitId: unitId,                               // g (gramos)
    quantityInBaseUnit: conversion.convertedValue, // 0.5 (kg)
    unitPrice: pricePerUnit,
    totalPrice: pricePerUnit * quantity,
  });

  // Reducir inventario en unidad base
  await db.update(products)
    .set({
      stockQuantity: sql`stock_quantity - ${conversion.convertedValue}`
    })
    .where(eq(products.id, productId));
}
```

### 3. Consultar Unidades Disponibles

```typescript
import { getAvailableUnitsForProduct } from './server/unit-conversion';

// Obtener todas las unidades configuradas para un producto
const availableUnits = await getAvailableUnitsForProduct(db, productId, storeId);

// Resultado:
// [
//   { id: 1, symbol: 'kg', name: 'Kilogramo', type: 'weight' },
//   { id: 2, symbol: 'g', name: 'Gramo', type: 'weight' },
//   { id: 3, symbol: 'lb', name: 'Libra', type: 'weight' },
// ]
```

## 📊 Ejemplos de Uso

### Ejemplo 1: Producto de Peso (Café)

```typescript
// Producto: Café Premium
// Unidad base: kg
// Stock actual: 10 kg

// Conversiones configuradas:
// - 1 kg = 1000 g
// - 1 kg = 2.20462 lb

// Escenario 1: Cliente compra 250g
const result1 = await convertToBaseUnit(db, cafeId, 250, gramosId);
// result1.convertedValue = 0.25 kg
// Stock después: 9.75 kg

// Escenario 2: Cliente compra 1 lb
const result2 = await convertToBaseUnit(db, cafeId, 1, librasId);
// result2.convertedValue = 0.453592 kg
// Stock después: 9.296408 kg
```

### Ejemplo 2: Producto de Volumen (Aceite)

```typescript
// Producto: Aceite de Oliva
// Unidad base: L (litros)
// Stock actual: 50 L

// Conversiones configuradas:
// - 1 L = 1000 ml
// - 1 L = 0.264172 gal

// Escenario: Cliente compra 500 ml
const result = await convertToBaseUnit(db, aceiteId, 500, mililitrosId);
// result.convertedValue = 0.5 L
// Stock después: 49.5 L
```

### Ejemplo 3: Producto por Unidades (Cajas)

```typescript
// Producto: Laptop
// Unidad base: unidad
// Stock actual: 100 unidades

// Conversiones configuradas:
// - 1 caja = 10 unidades
// - 1 pallet = 100 unidades

// Escenario: Cliente compra 2 cajas
const result = await convertToBaseUnit(db, laptopId, 2, cajaId);
// result.convertedValue = 20 unidades
// Stock después: 80 unidades
```

## 🛠️ Funciones de Utilidad Disponibles

### `convertQuantity(db, productId, quantity, sourceUnitId, targetUnitId)`
Convierte una cantidad de una unidad a otra.

```typescript
const result = await convertQuantity(db, productId, 1, kgId, gId);
// result: {
//   success: true,
//   convertedValue: 1000,
//   sourceUnit: { symbol: 'kg', ... },
//   targetUnit: { symbol: 'g', ... },
//   conversionFactor: 1000
// }
```

### `convertToBaseUnit(db, productId, quantity, unitId)`
Convierte una cantidad a la unidad base del producto.

```typescript
const result = await convertToBaseUnit(db, productId, 500, gId);
// result: {
//   success: true,
//   convertedValue: 0.5,
//   sourceUnit: { symbol: 'g', ... },
//   targetUnit: { symbol: 'kg', ... },
//   conversionFactor: 0.001
// }
```

### `getConversionFactor(db, productId, sourceUnitId, targetUnitId)`
Obtiene el factor de conversión entre dos unidades.

```typescript
const factor = await getConversionFactor(db, productId, kgId, gId);
// factor: 1000 (1 kg = 1000 g)
```

### `isUnitConversionEnabled(db, productId)`
Verifica si un producto tiene habilitada la conversión de unidades.

```typescript
const enabled = await isUnitConversionEnabled(db, productId);
// enabled: true/false
```

### `getAvailableUnitsForProduct(db, productId, storeId)`
Obtiene todas las unidades configuradas para un producto.

```typescript
const units = await getAvailableUnitsForProduct(db, productId, storeId);
// units: [ { id, name, symbol, type }, ... ]
```

### `createBidirectionalConversion(db, productId, storeId, unitAId, unitBId, factorAtoB)`
Crea conversión bidireccional entre dos unidades.

```typescript
// 1 kg = 1000 g
await createBidirectionalConversion(db, productId, storeId, kgId, gId, 1000);
// Crea:
// - kg -> g (factor: 1000)
// - g -> kg (factor: 0.001)
```

### `setupCommonConversions(db, productId, storeId, baseUnitSymbol, unitsToConvert)`
Configura conversiones comunes automáticamente.

```typescript
// Configurar conversiones de peso para un producto con base en kg
await setupCommonConversions(
  db,
  productId,
  storeId,
  'kg',           // Unidad base
  ['g', 'lb', 'oz'] // Unidades a convertir
);
```

## 🔍 Control de Inventario con Conversiones

### Flujo Recomendado

1. **Al Crear Orden:**
   - Verificar si el producto tiene `unitConversionEnabled = true`
   - Si sí, convertir cantidad a unidad base usando `convertToBaseUnit()`
   - Guardar ambas cantidades en `order_items`:
     - `quantity`: Cantidad original pedida
     - `unitId`: Unidad usada en el pedido
     - `quantityInBaseUnit`: Cantidad en unidad base
   - Reducir inventario usando `quantityInBaseUnit`

2. **Al Completar Orden:**
   - Usar `quantityInBaseUnit` para actualizar stock

3. **Al Cancelar Orden:**
   - Restaurar inventario usando `quantityInBaseUnit`

4. **Al Consultar Stock:**
   - El campo `stockQuantity` siempre está en unidad base
   - Para mostrar en otras unidades, usar `convertQuantity()`

### Ejemplo de Implementación Completa

```typescript
// server/routes.ts - Endpoint para crear orden

app.post('/api/orders', async (req, res) => {
  const { customerId, items } = req.body;
  const storeId = req.user.storeId;

  try {
    // Procesar cada item
    const processedItems = [];

    for (const item of items) {
      const { productId, quantity, unitId } = item;

      // Obtener producto
      const product = await db.select()
        .from(products)
        .where(eq(products.id, productId))
        .limit(1);

      if (!product[0]) {
        throw new Error(`Product ${productId} not found`);
      }

      let quantityInBaseUnit = quantity;
      let finalUnitId = unitId;

      // Si tiene conversión habilitada, convertir a unidad base
      if (product[0].unitConversionEnabled && product[0].baseUnitId) {
        const conversion = await convertToBaseUnit(
          db,
          productId,
          quantity,
          unitId || product[0].baseUnitId
        );

        if (!conversion.success) {
          throw new Error(`Conversion failed: ${conversion.error}`);
        }

        quantityInBaseUnit = conversion.convertedValue;
        finalUnitId = unitId || product[0].baseUnitId;
      }

      // Verificar stock disponible (en unidad base)
      if (product[0].stockQuantity < quantityInBaseUnit) {
        throw new Error(
          `Insufficient stock for product ${productId}. ` +
          `Available: ${product[0].stockQuantity}, Required: ${quantityInBaseUnit}`
        );
      }

      processedItems.push({
        productId,
        quantity,
        unitId: finalUnitId,
        quantityInBaseUnit,
        unitPrice: product[0].price,
        totalPrice: parseFloat(product[0].price) * quantity,
      });

      // Reducir stock
      await db.update(products)
        .set({
          stockQuantity: sql`stock_quantity - ${quantityInBaseUnit}`
        })
        .where(eq(products.id, productId));
    }

    // Crear orden con items procesados
    const order = await db.insert(orders)
      .values({
        customerId,
        storeId,
        // ... otros campos
      })
      .returning();

    // Insertar items
    await db.insert(orderItems).values(
      processedItems.map(item => ({
        orderId: order[0].id,
        ...item,
      }))
    );

    res.json({ success: true, order: order[0] });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(400).json({ error: error.message });
  }
});
```

## 📝 Consideraciones Importantes

### ✅ Mejores Prácticas

1. **Unidad Base Clara:** Siempre defina una unidad base lógica para cada producto
2. **Conversiones Bidireccionales:** Use `createBidirectionalConversion()` para crear ambas direcciones
3. **Validación de Tipos:** Solo permita conversiones entre unidades del mismo tipo (peso con peso, volumen con volumen)
4. **Inventario en Base:** Mantenga el inventario (`stockQuantity`) siempre en la unidad base
5. **Precisión Decimal:** Use `numeric(12, 4)` para evitar pérdidas de precisión en conversiones

### ⚠️ Advertencias

1. **No Mezclar Tipos:** No intente convertir peso a volumen o volumen a unidades
2. **Verificar Conversiones:** Siempre verifique `conversion.success` antes de usar el resultado
3. **Stock Negativo:** Implemente validaciones para evitar stock negativo
4. **Redondeo:** Tenga cuidado con el redondeo en conversiones múltiples

### 🔒 Validaciones Recomendadas

```typescript
// Validar antes de crear conversión
if (sourceUnit.type !== targetUnit.type) {
  throw new Error('Cannot convert between different unit types');
}

// Validar stock suficiente
if (product.stockQuantity < quantityInBaseUnit) {
  throw new Error('Insufficient stock');
}

// Validar factor de conversión positivo
if (conversionFactor <= 0) {
  throw new Error('Conversion factor must be positive');
}
```

## 🚀 Próximos Pasos

1. **Ejecutar Migración:**
   ```bash
   psql -U your_user -d your_database -f migrations/add-unit-conversion-system.sql
   ```

2. **Configurar Unidades por Defecto:**
   - La migración inserta unidades comunes automáticamente
   - Puede agregar más unidades según necesite

3. **Configurar Productos:**
   - Active `unitConversionEnabled` para productos que lo necesiten
   - Defina la unidad base (`baseUnitId`)
   - Configure factores de conversión usando las utilidades

4. **Actualizar UI:**
   - Agregar selector de unidades en formularios de productos
   - Mostrar unidades disponibles en catálogo
   - Permitir selección de unidad al agregar al carrito

5. **Actualizar Lógica de Órdenes:**
   - Integrar conversión en creación de órdenes
   - Actualizar inventario usando unidad base
   - Mostrar cantidad en unidad original y base en detalles de orden

## 📚 Referencias

- Archivo de utilidades: `server/unit-conversion.ts`
- Migración: `migrations/add-unit-conversion-system.sql`
- Schema: `shared/schema.ts` (líneas 307-309, 368-369, 741-768)
