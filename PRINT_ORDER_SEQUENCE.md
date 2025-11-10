# Secuencia de Acciones al Imprimir una Orden

## Descripción General

Cuando un usuario imprime una orden desde el sistema, se ejecuta una secuencia de acciones que incluye:
1. **Construcción del ticket** (formato ESC/POS)
2. **Envío a impresora** (térmica o PDF)
3. **Asignación automática a viaje** (si cumple condiciones)
4. **Actualización de estado** (pending → processing)
5. **Sincronización con base de datos**

---

## SECUENCIA COMPLETA: Orden SIN usuario asignado

### 1️⃣ Usuario hace clic en "Imprimir"
**Ubicación:** `client/src/pages/orders.tsx` - Línea 353
**Función:** `generateOrderPrint(order)`

```typescript
const generateOrderPrint = async (order: OrderWithDetails) => {
  // order = { id, orderNumber, status: 'pending', assignedUserId: null, tripId: null, ... }
}
```

**Condiciones iniciales:**
- `order.status === 'pending'` ✅
- `order.assignedUserId === null` ✅
- `order.tripId === null` ✅

---

### 2️⃣ Construir Ticket ESC/POS
**Ubicación:** `client/src/pages/orders.tsx` - Línea 356
**Función:** `buildESCPOSTicket(order)`

**Qué genera:**
- Formato ESC/POS para impresoras térmicas
- Contiene: número de orden, cliente, productos, total, código QR

---

### 3️⃣ Enviar al Backend - Imprimir
**Ubicación:** `client/src/pages/orders.tsx` - Línea 359
**Endpoint:** `POST /api/print/thermal`

```json
{
  "ticket": "... datos ESC/POS ..."
}
```

**Toast de éxito:**
```
✓ Impreso
  Enviado por [printer|pdf|email]
```

---

### 4️⃣ Verificar Condiciones para Asignación Automática
**Ubicación:** `client/src/pages/orders.tsx` - Línea 377

```typescript
if (order.status === 'pending' && !order.tripId) {
  // Proceder a asignación automática
}
```

**En este caso:** ✅ Ambas condiciones se cumplen

---

### 5️⃣ Llamar API de Asignación a Viaje
**Ubicación:** `client/src/pages/orders.tsx` - Línea 379
**Endpoint:** `POST /api/trips/assign-order`

```json
{
  "orderId": 123
}
```

---

### 6️⃣ Backend: Validar Orden
**Ubicación:** `server/routes/trip-routes.ts` - Línea ~359

**Validaciones:**
1. ✅ Orden existe
2. ✅ NO está en otro viaje
3. ✅ Si es pending sin usuario → PERMITIDO (viaje compartido)
4. ❌ Si es pending CON usuario → RECHAZA

**Logs:**
```
🔍 [ASSIGN-ORDER] Buscando orden 123 para store 5...
✅ [ASSIGN-ORDER] Orden encontrada: ORD-001, status: pending, assignedUserId: null
```

---

### 7️⃣ Backend: Buscar o Crear Viaje Compartido (SIN usuario)
**Ubicación:** `server/routes/trip-routes.ts` - Línea ~390

**Búsqueda:**
```typescript
const [trip] = await db
  .select()
  .from(schema.trips)
  .where(and(
    eq(schema.trips.storeId, storeId),
    eq(schema.trips.status, 'pending'),
    sql`${schema.trips.assignedUserId} IS NULL`  // ⚠️ SIN USUARIO
  ))
  .limit(1);
```

**Si no existe, crear:**
```typescript
[trip] = await db
  .insert(schema.trips)
  .values({
    tripNumber: 'TRIP-20251110-001',
    assignedUserId: null,        // ⚠️ SIN usuario
    storeId,
    status: 'pending',
    totalOrders: 0,
    completedOrders: 0,
    totalAmount: '0',
    createdAt: new Date()
  })
  .returning();
```

**Logs:**
```
✅ [ASSIGN-ORDER] Usando viaje existente TRIP-20251110-001 (ID: 42)
// o
✅ [ASSIGN-ORDER] Viaje TRIP-20251110-002 creado con ID 43
```

---

### 8️⃣ Backend: Insertar en tabla tripOrders
**Ubicación:** `server/routes/trip-routes.ts` - Línea ~425

```typescript
await db
  .insert(schema.tripOrders)
  .values({
    tripId: 42,
    orderId: 123,
    storeId: 5,
    status: 'pending',
    sequenceNumber: 1,
    createdAt: new Date()
  });
```

**Tabla tripOrders:**
```
tripId: 42, orderId: 123, status: 'pending', sequence: 1
```

---

### 9️⃣ Backend: Actualizar tabla orders
**Ubicación:** `server/routes/trip-routes.ts` - Línea ~440

```typescript
const newOrderStatus = 'processing';  // pending → processing

await db
  .update(schema.orders)
  .set({
    tripId: 42,
    status: 'processing',
    updatedAt: new Date()
  })
  .where(eq(schema.orders.id, 123));
```

**Tabla orders:**
```
id: 123, status: 'processing', tripId: 42
```

**Logs:**
```
✅ [ASSIGN-ORDER] Orden actualizada con tripId 42, nuevo status: processing
```

---

### 🔟 Backend: Actualizar Contadores del Viaje
**Función:** `updateTripProgress()`

```typescript
// Contar órdenes
const [orderCount] = await db.select({
  total: count(),
  completed: count(...)  // status='picked'
}).from(schema.tripOrders).where(...);

// Sumar montos
const [amountSum] = await db.select({
  total: SUM(totalAmount)
}).from(schema.tripOrders).join(schema.orders);

// Actualizar viaje
await db.update(schema.trips).set({
  totalOrders: 1,
  completedOrders: 0,
  totalAmount: '500.00'
});
```

**Tabla trips:**
```
id: 42, totalOrders: 1, completedOrders: 0, totalAmount: '500.00'
```

**Logs:**
```
✅ [UPDATE-TRIP] Viaje 42: 0/1 completadas
```

---

### 1️⃣1️⃣ Backend: Respuesta al Frontend
**Respuesta JSON:**
```json
{
  "success": true,
  "message": "Orden asignada al viaje correctamente",
  "tripId": 42,
  "tripNumber": "TRIP-20251110-001",
  "orderStatus": "processing",
  "info": {
    "wasNewTrip": true,
    "totalOrdersInTrip": 1,
    "tripHasUser": false
  }
}
```

---

### 1️⃣2️⃣ Frontend: Mostrar Confirmación
**Toast:**
```
✓ Orden asignada
  Asignada al viaje TRIP-20251110-001
```

---

### 1️⃣3️⃣ Frontend: Recargar Lista de Órdenes
```typescript
queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
```

**Resultado:** Se vuelve a obtener la lista con la orden actualizada:
- `status: 'processing'`
- `tripId: 42`
- `tripNumber: 'TRIP-20251110-001'`

---

## SECUENCIA CON USUARIO ASIGNADO

### Cambios principales:

**Condiciones iniciales:**
- `order.status === 'pending'` ✅
- `order.assignedUserId === 5` ✅
- `order.tripId === null` ✅

### Problema actual:

El endpoint `POST /api/trips/assign-order` **rechaza** órdenes pending que tienen usuario asignado:

```typescript
if (order.status === 'pending' && order.assignedUserId) {
  return res.status(400).json({
    error: 'La orden debe estar confirmada antes de asignarla a un viaje'
  });
}
```

**Error que recibe el usuario:**
```
❌ No se pudo asignar a viaje automáticamente
```

### Flujo alternativo correcto:

Debería usarse `POST /api/trips/assign-order-with-user`:

```json
{
  "orderId": 123,
  "userId": 5
}
```

**Pasos diferentes:**

1. ✅ Validar que el usuario existe
2. ✅ Buscar viaje pendiente DEL USUARIO ESPECÍFICO:
   ```typescript
   eq(schema.trips.assignedUserId, 5)  // ⚠️ Viaje específico
   ```
3. ✅ Crear viaje ASIGNADO AL USUARIO:
   ```typescript
   assignedUserId: 5  // ⚠️ ASIGNADO
   ```
4. ✅ Actualizar orden con usuario:
   ```typescript
   assignedUserId: 5
   ```

**Resultado:**
```
id: 43, tripNumber: 'TRIP-20251110-002', assignedUserId: 5
```

---

## Tabla Comparativa

| Aspecto | SIN Usuario | CON Usuario |
|---------|-----------|-----------|
| Endpoint | `/api/trips/assign-order` | `/api/trips/assign-order-with-user` |
| Viaje buscado | `assignedUserId IS NULL` | `assignedUserId = 5` |
| Tipo viaje | Compartido | Personal |
| En tripOrders | `tripId: 42, orderId: 123` | `tripId: 43, orderId: 123` |
| En orders | `assignedUserId: null` | `assignedUserId: 5` |
| Estado final | processing | processing |

---

## Servicios y Endpoints

### Frontend (client):
- **Archivo:** `client/src/pages/orders.tsx`
- **Endpoints:**
  1. `POST /api/print/thermal` - Imprimir
  2. `POST /api/trips/assign-order` - Asignar a viaje compartido

### Backend (server):
- **Archivo:** `server/routes/trip-routes.ts`
- **Endpoints:**
  1. `POST /api/trips/assign-order` - Asignar orden (sin usuario)
  2. `POST /api/trips/assign-order-with-user` - Asignar orden (con usuario)

- **Archivo:** `server/routes.ts`
- **Endpoints:**
  1. `POST /api/print/thermal` - Envío a impresora

### Funciones auxiliares:
- `updateTripProgress()` - Actualizar contadores
- `syncOrderStatusInTrip()` - Sincronizar estado
- `buildESCPOSTicket()` - Construir ticket

### Base de datos:
- **Tabla `orders`** - Actualizar: `tripId`, `status`
- **Tabla `trips`** - Crear/buscar, actualizar contadores
- **Tabla `tripOrders`** - Insertar relación

---

## Diagrama de Flujo

```
[1] Usuario imprime orden
        ↓
[2] Construir ticket ESC/POS
        ↓
[3] POST /api/print/thermal
        ↓
[4] Response 200 (impresión exitosa)
        ↓
[5] Mostrar "✓ Impreso"
        ↓
[6] ¿status='pending' && !tripId?
        ├─ NO  → FIN (solo imprime)
        │
        └─ SÍ  → Continuar
                  ↓
             [7] POST /api/trips/assign-order { orderId }
                  ↓
             [8] Backend valida orden
                  ├─ ❌ Orden con usuario pending → Error
                  └─ ✅ Orden sin usuario → Continuar
                      ↓
             [9] Buscar viaje compartido (assignedUserId IS NULL)
                  ├─ Existe  → Usar
                  └─ No existe → Crear nuevo
                      ↓
            [10] Insert tripOrders (tripId, orderId)
                  ↓
            [11] Update orders: tripId=42, status='processing'
                  ↓
            [12] Update trips: totalOrders++, totalAmount+=
                  ↓
            [13] Response 200 { tripNumber, tripId }
                  ↓
            [14] Mostrar "✓ Orden asignada a TRIP-..."
                  ↓
            [15] Invalidar cache (/api/orders)
                  ↓
            [16] Recargar lista con orden actualizada
                  ↓
                 FIN
```

---

## Estados de la Orden

### Antes de imprimir:
```
{
  id: 123,
  orderNumber: 'ORD-001',
  status: 'pending',
  assignedUserId: null,
  tripId: null
}
```

### Después de imprimir (SIN usuario):
```
{
  id: 123,
  orderNumber: 'ORD-001',
  status: 'processing',      // ⬅️ Cambió
  assignedUserId: null,
  tripId: 42                 // ⬅️ Cambió
}
```

### Después de imprimir (CON usuario, si funcionara):
```
{
  id: 123,
  orderNumber: 'ORD-001',
  status: 'processing',      // ⬅️ Cambió
  assignedUserId: 5,         // ⬅️ Se mantiene
  tripId: 43                 // ⬅️ Cambió
}
```

---

## Casos de Error

### Error 1: Orden ya en viaje
```
Status: 400
{
  "error": "Esta orden ya está asignada a un viaje",
  "tripId": 42,
  "suggestion": "La orden ya forma parte de un viaje existente"
}
```

### Error 2: Orden pending con usuario
```
Status: 400
{
  "error": "La orden debe estar confirmada antes de asignarla a un viaje",
  "currentStatus": "pending",
  "suggestion": "Confirma la orden antes de agregarla al viaje"
}
```

### Manejo de errores en frontend:
```typescript
if (assignResponse.ok) {
  // ✅ Éxito - mostrar "✓ Orden asignada"
} else {
  // ❌ Error - pero la impresión fue exitosa
  console.warn('No se pudo asignar a viaje automáticamente');
  // La orden ya fue impresa, usuario puede asignarla manualmente
}
```

**Resultado:** La impresión SIEMPRE es exitosa, la asignación es "best effort"
