# API de Conversión de Unidades - Documentación

## 📋 Resumen

Esta documentación describe los endpoints REST disponibles para gestionar unidades de medida y conversiones de unidades en productos.

## 🔐 Autenticación

Todos los endpoints requieren autenticación mediante token JWT en el header:
```
Authorization: Bearer <token>
```

## 📍 Endpoints Disponibles

### **Unidades de Medida**

#### 1. Obtener Todas las Unidades
```http
GET /api/measurement-units
```

**Respuesta:**
```json
[
  {
    "id": 1,
    "storeId": 1,
    "name": "Kilogramo",
    "symbol": "kg",
    "type": "weight",
    "abbreviation": "kilo",
    "isActive": true,
    "sortOrder": 1,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z"
  },
  {
    "id": 2,
    "storeId": 1,
    "name": "Gramo",
    "symbol": "g",
    "type": "weight",
    "abbreviation": "gr",
    "isActive": true,
    "sortOrder": 2,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z"
  }
]
```

---

#### 2. Obtener Unidades Activas
```http
GET /api/measurement-units/active
```

Retorna solo las unidades con `isActive: true`.

---

#### 3. Obtener Unidad por ID
```http
GET /api/measurement-units/:id
```

**Ejemplo:**
```bash
GET /api/measurement-units/1
```

**Respuesta:**
```json
{
  "id": 1,
  "storeId": 1,
  "name": "Kilogramo",
  "symbol": "kg",
  "type": "weight",
  "abbreviation": "kilo",
  "isActive": true,
  "sortOrder": 1,
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```

---

#### 4. Crear Nueva Unidad
```http
POST /api/measurement-units
```

**Roles:** admin, store_admin

**Body:**
```json
{
  "name": "Mililitro",
  "symbol": "ml",
  "type": "volume",
  "abbreviation": "mili",
  "sortOrder": 6
}
```

**Tipos válidos:** `weight`, `volume`, `unit`, `length`

**Respuesta:**
```json
{
  "id": 10,
  "storeId": 1,
  "name": "Mililitro",
  "symbol": "ml",
  "type": "volume",
  "abbreviation": "mili",
  "isActive": true,
  "sortOrder": 6,
  "createdAt": "2025-01-02T00:00:00.000Z",
  "updatedAt": "2025-01-02T00:00:00.000Z"
}
```

---

#### 5. Actualizar Unidad
```http
PUT /api/measurement-units/:id
```

**Roles:** admin, store_admin

**Body:**
```json
{
  "name": "Mililitro (ML)",
  "sortOrder": 7,
  "isActive": true
}
```

**Respuesta:** Unidad actualizada

---

#### 6. Eliminar (Desactivar) Unidad
```http
DELETE /api/measurement-units/:id
```

**Roles:** admin, store_admin

Marca la unidad como inactiva (`isActive: false`).

**Respuesta:**
```json
{
  "message": "Unidad de medida desactivada correctamente"
}
```

---

### **Conversiones de Productos**

#### 7. Obtener Conversiones de un Producto
```http
GET /api/products/:productId/unit-conversions
```

**Ejemplo:**
```bash
GET /api/products/5/unit-conversions
```

**Respuesta:**
```json
[
  {
    "id": 1,
    "productId": 5,
    "sourceUnitId": 1,
    "targetUnitId": 2,
    "conversionFactor": "1000.000000",
    "isActive": true,
    "notes": "1 kg = 1000 g",
    "sourceUnit": {
      "id": 1,
      "name": "Kilogramo",
      "symbol": "kg",
      "type": "weight"
    }
  },
  {
    "id": 2,
    "productId": 5,
    "sourceUnitId": 2,
    "targetUnitId": 1,
    "conversionFactor": "0.001000",
    "isActive": true,
    "notes": "1 g = 0.001 kg",
    "sourceUnit": {
      "id": 2,
      "name": "Gramo",
      "symbol": "g",
      "type": "weight"
    }
  }
]
```

---

#### 8. Obtener Unidades Disponibles para un Producto
```http
GET /api/products/:productId/available-units
```

Retorna solo las unidades que tienen conversiones configuradas para el producto.

**Ejemplo:**
```bash
GET /api/products/5/available-units
```

**Respuesta:**
```json
[
  {
    "id": 1,
    "name": "Kilogramo",
    "symbol": "kg",
    "type": "weight",
    "isActive": true,
    "sortOrder": 1
  },
  {
    "id": 2,
    "name": "Gramo",
    "symbol": "g",
    "type": "weight",
    "isActive": true,
    "sortOrder": 2
  },
  {
    "id": 3,
    "name": "Libra",
    "symbol": "lb",
    "type": "weight",
    "isActive": true,
    "sortOrder": 3
  }
]
```

---

#### 9. Crear Conversión de Unidad
```http
POST /api/products/:productId/unit-conversions
```

**Roles:** admin, store_admin

**Body (Conversión Unidireccional):**
```json
{
  "sourceUnitId": 1,
  "targetUnitId": 2,
  "conversionFactor": "1000",
  "notes": "1 kg = 1000 g"
}
```

**Body (Conversión Bidireccional):**
```json
{
  "sourceUnitId": 1,
  "targetUnitId": 2,
  "conversionFactor": "1000",
  "notes": "1 kg = 1000 g",
  "bidirectional": true
}
```

Cuando `bidirectional: true`, se crean automáticamente dos conversiones:
- `kg -> g` (factor: 1000)
- `g -> kg` (factor: 0.001)

**Respuesta (bidireccional):**
```json
[
  {
    "id": 1,
    "productId": 5,
    "sourceUnitId": 1,
    "targetUnitId": 2,
    "conversionFactor": "1000.000000",
    "isActive": true,
    "notes": "1 kg = 1000 g"
  },
  {
    "id": 2,
    "productId": 5,
    "sourceUnitId": 2,
    "targetUnitId": 1,
    "conversionFactor": "0.001000",
    "isActive": true,
    "notes": "1 kg = 1000 g"
  }
]
```

---

#### 10. Actualizar Conversión
```http
PUT /api/products/:productId/unit-conversions/:conversionId
```

**Roles:** admin, store_admin

**Body:**
```json
{
  "conversionFactor": "1000.5",
  "notes": "Actualizado con nueva precisión",
  "isActive": true
}
```

---

#### 11. Eliminar Conversión
```http
DELETE /api/products/:productId/unit-conversions/:conversionId
```

**Roles:** admin, store_admin

**Respuesta:**
```json
{
  "message": "Conversión eliminada correctamente"
}
```

---

### **Utilidades de Conversión**

#### 12. Convertir Cantidad Entre Unidades
```http
POST /api/unit-conversion/convert
```

Convierte una cantidad de una unidad a otra para un producto específico.

**Body:**
```json
{
  "productId": 5,
  "quantity": 500,
  "sourceUnitId": 2,
  "targetUnitId": 1
}
```

**Respuesta:**
```json
{
  "success": true,
  "convertedValue": 0.5,
  "sourceUnit": {
    "id": 2,
    "symbol": "g",
    "name": "Gramo",
    "type": "weight"
  },
  "targetUnit": {
    "id": 1,
    "symbol": "kg",
    "name": "Kilogramo",
    "type": "weight"
  },
  "conversionFactor": 0.001
}
```

**Respuesta (Error):**
```json
{
  "success": false,
  "convertedValue": 0,
  "sourceUnit": {...},
  "targetUnit": {...},
  "conversionFactor": 0,
  "error": "No conversion factor found between g and kg"
}
```

---

#### 13. Convertir a Unidad Base
```http
POST /api/unit-conversion/convert-to-base
```

Convierte una cantidad a la unidad base configurada del producto.

**Body:**
```json
{
  "productId": 5,
  "quantity": 500,
  "unitId": 2
}
```

**Respuesta:**
```json
{
  "success": true,
  "convertedValue": 0.5,
  "sourceUnit": {
    "id": 2,
    "symbol": "g",
    "name": "Gramo",
    "type": "weight"
  },
  "targetUnit": {
    "id": 1,
    "symbol": "kg",
    "name": "Kilogramo",
    "type": "weight"
  },
  "conversionFactor": 0.001
}
```

---

#### 14. Configurar Conversiones Comunes
```http
POST /api/products/:productId/setup-common-conversions
```

**Roles:** admin, store_admin

Configura conversiones comunes automáticamente basándose en factores predefinidos.

**Body:**
```json
{
  "baseUnitSymbol": "kg",
  "unitsToConvert": ["g", "lb", "oz"]
}
```

Esto creará conversiones bidireccionales para:
- kg ↔ g (factor: 1000)
- kg ↔ lb (factor: 2.20462)
- kg ↔ oz (factor: 35.274)

**Respuesta:**
```json
{
  "message": "Conversiones configuradas correctamente",
  "conversions": [
    { "id": 1, "sourceUnitId": 1, "targetUnitId": 2, "conversionFactor": "1000" },
    { "id": 2, "sourceUnitId": 2, "targetUnitId": 1, "conversionFactor": "0.001" },
    { "id": 3, "sourceUnitId": 1, "targetUnitId": 3, "conversionFactor": "2.20462" },
    { "id": 4, "sourceUnitId": 3, "targetUnitId": 1, "conversionFactor": "0.453592" },
    { "id": 5, "sourceUnitId": 1, "targetUnitId": 4, "conversionFactor": "35.274" },
    { "id": 6, "sourceUnitId": 4, "targetUnitId": 1, "conversionFactor": "0.0283495" }
  ]
}
```

---

## 🚀 Flujo Completo de Configuración

### Ejemplo: Configurar Producto de Café

#### Paso 1: Activar conversión en el producto
```http
PUT /api/products/5
```
```json
{
  "unitConversionEnabled": true,
  "baseUnitId": 1
}
```

#### Paso 2: Configurar conversiones automáticas
```http
POST /api/products/5/setup-common-conversions
```
```json
{
  "baseUnitSymbol": "kg",
  "unitsToConvert": ["g", "lb"]
}
```

#### Paso 3: Verificar unidades disponibles
```http
GET /api/products/5/available-units
```

Respuesta:
```json
[
  { "id": 1, "symbol": "kg", "name": "Kilogramo" },
  { "id": 2, "symbol": "g", "name": "Gramo" },
  { "id": 3, "symbol": "lb", "name": "Libra" }
]
```

#### Paso 4: Probar conversión
```http
POST /api/unit-conversion/convert-to-base
```
```json
{
  "productId": 5,
  "quantity": 500,
  "unitId": 2
}
```

Respuesta:
```json
{
  "success": true,
  "convertedValue": 0.5,
  "sourceUnit": { "symbol": "g" },
  "targetUnit": { "symbol": "kg" },
  "conversionFactor": 0.001
}
```

---

## 🔍 Códigos de Error

### 400 Bad Request
- Campos requeridos faltantes
- Tipo de unidad inválido
- Factor de conversión inválido (debe ser > 0)

### 403 Forbidden
- Usuario no tiene permisos para realizar la acción
- Requiere rol admin o store_admin

### 404 Not Found
- Unidad de medida no encontrada
- Conversión no encontrada
- Producto no encontrado

### 500 Internal Server Error
- Error en la base de datos
- Error en el servidor

---

## 📊 Tipos de Unidades Soportados

| Tipo | Descripción | Ejemplos |
|------|-------------|----------|
| `weight` | Peso/Masa | kg, g, lb, oz |
| `volume` | Volumen | L, ml, gal |
| `unit` | Unidades contables | unid, caja, paq |
| `length` | Longitud | m, cm |

---

## 🔒 Restricciones

1. **Solo conversiones del mismo tipo**: No se puede convertir peso a volumen
2. **Factor de conversión positivo**: Debe ser > 0
3. **Unidad base requerida**: El producto debe tener `baseUnitId` configurado
4. **Conversión habilitada**: El producto debe tener `unitConversionEnabled: true`

---

## 💡 Ejemplos de Uso con cURL

### Crear unidad de medida
```bash
curl -X POST http://localhost:5000/api/measurement-units \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mililitro",
    "symbol": "ml",
    "type": "volume",
    "sortOrder": 6
  }'
```

### Crear conversión bidireccional
```bash
curl -X POST http://localhost:5000/api/products/5/unit-conversions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceUnitId": 1,
    "targetUnitId": 2,
    "conversionFactor": "1000",
    "bidirectional": true
  }'
```

### Convertir cantidad
```bash
curl -X POST http://localhost:5000/api/unit-conversion/convert-to-base \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": 5,
    "quantity": 500,
    "unitId": 2
  }'
```

---

## 📚 Ver También

- [UNIT_CONVERSION_SYSTEM.md](UNIT_CONVERSION_SYSTEM.md) - Documentación completa del sistema
- [server/unit-conversion.ts](server/unit-conversion.ts) - Utilidades de conversión
- [server/routes/unit-conversion-routes.ts](server/routes/unit-conversion-routes.ts) - Implementación de rutas
