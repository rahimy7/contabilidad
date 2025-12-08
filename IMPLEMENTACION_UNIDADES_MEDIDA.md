# Implementación de Sistema de Unidades de Medida

## Descripción General

Se ha implementado un sistema de conversión de unidades de medida para el inventario, siguiendo los siguientes principios:

1. **En el inventario (stock)**: Siempre mostrar cantidades en **unidad base**
2. **En los movimientos**: Mostrar cantidades en la **unidad de transacción** original

## Archivos Modificados

### Backend

#### 1. `server/routes/purchase-management-routes.ts`

##### Endpoint `/api/inventory-stock` (líneas 736-945)

**Cambios implementados:**
- ✅ Agregado query para obtener unidades de medida y conversiones
- ✅ Implementada función `convertToBaseUnit()` para convertir cantidades a unidad base
- ✅ Actualizada lógica de cálculo de stock para convertir todas las cantidades a unidad base
- ✅ Agregados campos `baseUnitId` y `baseUnitSymbol` en la respuesta

**Lógica de conversión:**
```typescript
const convertToBaseUnit = (productId, quantity, sourceUnitId, baseUnitId) => {
  if (!sourceUnitId || !baseUnitId || sourceUnitId === baseUnitId) {
    return quantity; // No hay conversión necesaria
  }

  const conversionKey = `${productId}-${sourceUnitId}-${baseUnitId}`;
  const conversionFactor = conversionMap.get(conversionKey);

  if (conversionFactor) {
    return quantity * conversionFactor;
  }

  return quantity; // Sin factor definido, retornar original
};
```

**Respuesta del endpoint:**
```typescript
{
  productId: number,
  productName: string,
  sku: string | null,
  barcode: string | null,
  totalStock: number,              // ✅ En unidad base
  baseUnitId: number | null,       // ✅ NUEVO
  baseUnitSymbol: string | null,   // ✅ NUEVO (ej: "kg", "L")
  lotCount: number,
  nearestExpiration: string | null,
  expiringQuantity: number,        // ✅ En unidad base
  lots: [{
    lotNumber: string | null,
    quantity: number,              // ✅ En unidad base
    expirationDate: string | null
  }]
}
```

##### Endpoint `/api/inventory-movements` (líneas 654-734)

**Cambios implementados:**
- ✅ Agregado JOIN con `measurementUnits` para obtener información de la unidad
- ✅ Agregados campos `unitId`, `unitSymbol`, `unitName` en el query
- ✅ La cantidad se muestra en la **unidad original de la transacción**

**Respuesta del endpoint:**
```typescript
{
  id: number,
  productId: number,
  type: string,
  quantity: string,              // ✅ En unidad de transacción original
  unitId: number | null,         // ✅ NUEVO
  unitSymbol: string | null,     // ✅ NUEVO (ej: "kg", "g")
  unitName: string | null,       // ✅ NUEVO (ej: "Kilogramo")
  productName: string,
  supplierName: string | null,
  // ... otros campos
}
```

##### Endpoint `/api/purchase-orders/:id/receive-items` (línea 607)

**Cambios implementados:**
- ✅ Agregado campo `unitId` al registrar movimientos de inventario
- ✅ Se usa `item.unitId` o `product.baseUnitId` como fallback

```typescript
await db.insert(schema.inventoryMovements).values({
  // ... otros campos
  unitId: item.unitId || product.baseUnitId, // ✅ NUEVO
  quantity: quantityReceived.toString(),
});
```

### Frontend

#### 2. `client/src/pages/inventory-traceability.tsx`

##### Interfaces (líneas 21-70)

**Cambios implementados:**
- ✅ Agregado `unitSymbol` y `unitName` a `InventoryMovement`
- ✅ Agregado `baseUnitId` y `baseUnitSymbol` a `ProductStock`

```typescript
interface InventoryMovement {
  // ... campos existentes
  unitSymbol: string | null;      // ✅ NUEVO
  unitName: string | null;        // ✅ NUEVO
}

interface ProductStock {
  // ... campos existentes
  totalStock: number;             // En unidad base
  baseUnitId: number | null;      // ✅ NUEVO
  baseUnitSymbol: string | null;  // ✅ NUEVO
}
```

##### Tabla de Stock (líneas 468-505)

**Cambios implementados:**
- ✅ Mostrar símbolo de unidad base junto a stock total
- ✅ Mostrar símbolo de unidad base junto a cantidad a vencer

```tsx
<td className="px-4 py-4 text-right">
  <div className="text-sm font-semibold text-gray-900">
    {product.totalStock.toLocaleString("es-DO", { minimumFractionDigits: 2 })}
    {product.baseUnitSymbol && (
      <span className="ml-1 text-xs text-gray-500">{product.baseUnitSymbol}</span>
    )}
  </div>
</td>
```

##### Modal de Detalles (líneas 800-860)

**Cambios implementados:**
- ✅ Mostrar unidad base en el encabezado del stock total
- ✅ Mostrar unidad base junto a cada lote

```tsx
<span className="font-semibold text-blue-600">
  Stock Total: {selectedProductData.totalStock.toLocaleString("es-DO")}
  {selectedProductData.baseUnitSymbol && ` ${selectedProductData.baseUnitSymbol}`}
</span>
```

##### Tabla de Movimientos (líneas 730-743 y 910-923)

**Cambios implementados:**
- ✅ Mostrar símbolo de unidad de transacción junto a la cantidad

```tsx
<td className="px-4 py-4 text-right">
  <div className="text-sm font-semibold text-green-600">
    +{parseFloat(movement.quantity).toLocaleString("es-DO")}
    {movement.unitSymbol && (
      <span className="ml-1 text-xs text-gray-500">{movement.unitSymbol}</span>
    )}
  </div>
</td>
```

## Flujo de Datos

### 1. Recepción de Orden de Compra
```
1. Usuario recibe productos en una unidad específica (ej: 10 cajas)
   └─> Item tiene unitId = ID de "caja"

2. Backend registra movimiento:
   └─> inventoryMovements.unitId = ID de "caja"
   └─> inventoryMovements.quantity = "10"

3. Backend convierte para actualizar stock del producto:
   └─> Busca factor de conversión: caja → unidad base (kg)
   └─> Aplica conversión: 10 cajas * 5 kg/caja = 50 kg
   └─> products.stockQuantity += 50
```

### 2. Visualización de Stock
```
1. Frontend solicita GET /api/inventory-stock

2. Backend:
   └─> Lee todos los movimientos
   └─> Por cada movimiento:
       └─> Convierte cantidad a unidad base usando factor de conversión
       └─> Acumula stock en unidad base
   └─> Retorna stock con baseUnitSymbol

3. Frontend muestra:
   └─> "50 kg" (en unidad base)
```

### 3. Visualización de Movimientos
```
1. Frontend solicita GET /api/inventory-movements

2. Backend:
   └─> Lee movimientos con JOIN a measurementUnits
   └─> Retorna cantidad en unidad original + unitSymbol

3. Frontend muestra:
   └─> "+10 cajas" (en unidad de transacción)
   └─> "-2 cajas" (en unidad de transacción)
```

## Tablas de Base de Datos Utilizadas

### `measurementUnits`
```sql
- id: serial PRIMARY KEY
- storeId: integer NOT NULL
- name: text (ej: "Kilogramo", "Gramo")
- symbol: text (ej: "kg", "g")
- type: text (ej: "weight", "volume", "unit")
```

### `productUnitConversions`
```sql
- id: serial PRIMARY KEY
- productId: integer NOT NULL
- storeId: integer NOT NULL
- sourceUnitId: integer (ej: ID de "caja")
- targetUnitId: integer (ej: ID de "kg")
- conversionFactor: decimal (ej: 5.0 = 1 caja = 5 kg)
```

### `products`
```sql
- baseUnitId: integer (unidad base del producto)
```

### `inventoryMovements`
```sql
- unitId: integer (unidad en que se realizó el movimiento)
```

### `purchaseOrderItems`
```sql
- unitId: integer (unidad en que se solicitó/recibió)
```

## Ejemplos de Uso

### Ejemplo 1: Producto con conversión kg ↔ g

**Configuración:**
```
Producto: Arroz
- baseUnitId: ID de "kg"

Conversiones:
- g → kg: factor = 0.001 (1g = 0.001kg)
- kg → g: factor = 1000  (1kg = 1000g)
```

**Movimientos:**
```
1. Compra: +5000 g
   └─> Stock: 5 kg (convertido)
   └─> Movimiento muestra: "+5000 g"

2. Venta: -500 g
   └─> Stock: 4.5 kg (convertido)
   └─> Movimiento muestra: "-500 g"
```

**Visualización:**
- **Stock**: "4.5 kg" ✅ (unidad base)
- **Movimientos**:
  - "+5000 g" ✅ (unidad original)
  - "-500 g" ✅ (unidad original)

### Ejemplo 2: Producto con conversión caja ↔ unidad

**Configuración:**
```
Producto: Refresco
- baseUnitId: ID de "unidad"

Conversiones:
- caja → unidad: factor = 24 (1 caja = 24 unidades)
- unidad → caja: factor = 0.04167 (1 unidad = 1/24 caja)
```

**Movimientos:**
```
1. Compra: +10 cajas
   └─> Stock: 240 unidades (convertido)
   └─> Movimiento muestra: "+10 cajas"

2. Venta: -12 unidades
   └─> Stock: 228 unidades (ya en base)
   └─> Movimiento muestra: "-12 unidades"
```

**Visualización:**
- **Stock**: "228 unidades" ✅ (unidad base)
- **Movimientos**:
  - "+10 cajas" ✅ (unidad original)
  - "-12 unidades" ✅ (unidad original)

## Ventajas del Sistema

1. ✅ **Consistencia**: Todo el stock se almacena en una unidad base común
2. ✅ **Trazabilidad**: Los movimientos conservan la unidad de transacción original
3. ✅ **Flexibilidad**: Permite comprar en una unidad y vender en otra
4. ✅ **Precisión**: Cálculos exactos usando factores de conversión
5. ✅ **Auditoría**: Historial completo de transacciones en sus unidades originales

## Notas Importantes

- Si no existe un factor de conversión definido, se usa la cantidad original sin convertir
- Si un producto no tiene `baseUnitId`, se asume que no requiere conversión
- Los factores de conversión son específicos por producto (flexibilidad)
- Las conversiones son bidireccionales (ej: kg↔g, caja↔unidad)

## Próximos Pasos Recomendados

1. Crear interfaz de administración de unidades de medida
2. Crear interfaz para configurar conversiones por producto
3. Agregar validaciones para evitar conversiones circulares
4. Implementar conversión automática en ventas (POS)
5. Agregar reportes de inventario con múltiples unidades
