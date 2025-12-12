# 🎁 Sistema de Acreditación Automática de Loyalty Points

## 📋 Resumen

Este documento describe el sistema completo de acreditación automática de puntos de lealtad cuando las órdenes se completan, incluyendo soporte para clientes padre/hijo.

---

## 🏗️ Arquitectura del Sistema

### **Componentes Principales**

1. **Esquema de Base de Datos** ([shared/schema.ts](shared/schema.ts:432-437))
   - Nuevos campos en tabla `orders`:
     - `loyaltyPointsCredited` - Boolean que indica si los puntos ya fueron acreditados
     - `loyaltyPointsCreditedAt` - Timestamp de cuándo se acreditaron los puntos

2. **Servicio de Loyalty Points** ([server/services/loyalty-points-service.ts](server/services/loyalty-points-service.ts))
   - `LoyaltyPointsService` - Clase encargada de toda la lógica de acreditación

3. **Métodos en Tenant Storage** ([server/tenant-storage.ts](server/tenant-storage.ts:5457-5495))
   - `creditLoyaltyPointsFromOrder()` - Acredita puntos de una orden
   - `revertLoyaltyPointsFromOrder()` - Revierte puntos si se cancela
   - `getCustomerLoyaltyBalance()` - Obtiene balance actual

4. **Endpoints Modificados** ([server/routes.ts](server/routes.ts))
   - `PATCH /orders/:id` - Actualización parcial de orden
   - `PUT /orders/:id/status` - Actualización solo de estado
   - `PUT /orders/:id` - Actualización completa de orden

---

## 🔄 Flujo de Acreditación de Puntos

### **1. Creación de Orden**
```
Cliente hace pedido
    ↓
Orden creada con loyaltyPointsTotal calculado
    ↓
Estado inicial: "pending"
    ↓
loyaltyPointsCredited = false
```

### **2. Completar Orden**
```
Usuario cambia estado a "completed"
    ↓
Endpoint detecta cambio de estado
    ↓
Llama a tenantStorage.creditLoyaltyPointsFromOrder(orderId)
    ↓
LoyaltyPointsService valida:
    ✓ Orden está completada
    ✓ Puntos no han sido acreditados antes
    ✓ Hay puntos para acreditar (> 0)
    ↓
Acredita puntos al cliente directo:
    - Actualiza customerLoyaltyBalance
    - Crea transacción en loyaltyPointsTransactions
    ↓
Si hay cliente padre:
    - Acredita mismos puntos al padre
    - Crea transacción para el padre
    ↓
Marca orden como loyaltyPointsCredited = true
```

### **3. Cancelar Orden Completada** (OPCIONAL)
```
Orden con estado "completed" cambia a "cancelled"
    ↓
Endpoint detecta cambio
    ↓
Llama a tenantStorage.revertLoyaltyPointsFromOrder(orderId)
    ↓
LoyaltyPointsService:
    - Deduce puntos del cliente directo
    - Deduce puntos del cliente padre (si existe)
    - Crea transacciones de tipo "adjusted" (negativas)
    ↓
Marca orden como loyaltyPointsCredited = false
```

---

## 💾 Estructura de Base de Datos

### **Tabla: orders**
```sql
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'pending',
  total_amount DECIMAL(10,2) DEFAULT 0,

  -- Loyalty Points
  loyalty_points_property_name TEXT,
  loyalty_points_value DECIMAL(10,2),
  loyalty_points_total DECIMAL(12,2) DEFAULT 0,
  loyalty_points_credited BOOLEAN DEFAULT FALSE,      -- ✅ NUEVO
  loyalty_points_credited_at TIMESTAMP,               -- ✅ NUEVO

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### **Tabla: customer_loyalty_balance**
```sql
CREATE TABLE customer_loyalty_balance (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER UNIQUE NOT NULL REFERENCES customers(id),
  store_id INTEGER NOT NULL,

  current_balance DECIMAL(12,2) DEFAULT 0,
  total_points_earned DECIMAL(12,2) DEFAULT 0,
  total_points_redeemed DECIMAL(12,2) DEFAULT 0,

  last_earned_at TIMESTAMP,
  last_redeemed_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### **Tabla: loyalty_points_transactions**
```sql
CREATE TABLE loyalty_points_transactions (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  store_id INTEGER NOT NULL,
  order_id INTEGER REFERENCES orders(id),

  type TEXT NOT NULL, -- 'earned', 'redeemed', 'adjusted'
  points DECIMAL(12,2) NOT NULL,
  balance_before DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  description TEXT NOT NULL,

  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔧 API de LoyaltyPointsService

### **Método: creditLoyaltyPointsFromOrder(orderId)**

**Descripción:** Acredita los puntos de lealtad de una orden al completarse.

**Parámetros:**
- `orderId` (number) - ID de la orden

**Retorna:**
```typescript
{
  success: boolean;
  pointsAwarded: number;
  customersAffected: number[];
  message: string;
}
```

**Validaciones:**
1. ✓ Orden existe
2. ✓ Orden está en estado "completed"
3. ✓ Puntos no han sido acreditados previamente
4. ✓ Hay puntos para acreditar (> 0)
5. ✓ Cliente existe

**Proceso:**
1. Obtiene datos de la orden
2. Valida condiciones
3. Acredita puntos al cliente directo
4. Si existe `parentCustomerId`, acredita al padre
5. Marca orden como `loyaltyPointsCredited = true`
6. Registra todas las transacciones

**Ejemplo de uso:**
```typescript
const result = await tenantStorage.creditLoyaltyPointsFromOrder(123);

if (result.success) {
  console.log(`✅ ${result.message}`);
  // "50 puntos acreditados a 2 cliente(s)"
} else {
  console.warn(`⚠️ ${result.message}`);
  // "Los puntos ya fueron acreditados previamente"
}
```

---

### **Método: revertLoyaltyPointsFromOrder(orderId)**

**Descripción:** Revierte la acreditación de puntos si una orden completada se cancela.

**Parámetros:**
- `orderId` (number) - ID de la orden

**Retorna:**
```typescript
{
  success: boolean;
  pointsReverted: number;
  customersAffected: number[];
  message: string;
}
```

**Validaciones:**
1. ✓ Orden existe
2. ✓ Puntos fueron acreditados previamente

**Proceso:**
1. Obtiene transacciones asociadas a la orden
2. Deduce puntos de cada cliente afectado
3. Crea transacciones de tipo "adjusted" (negativas)
4. Marca orden como `loyaltyPointsCredited = false`

**Ejemplo de uso:**
```typescript
const result = await tenantStorage.revertLoyaltyPointsFromOrder(123);

if (result.success) {
  console.log(`✅ ${result.message}`);
  // "50 puntos revertidos de 2 cliente(s)"
}
```

---

## 📊 Sistema de Cliente Padre/Hijo

### **Relación en Base de Datos**
```sql
-- Tabla customers
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  parent_customer_id INTEGER REFERENCES customers(id), -- ✅ Cliente padre
  ...
);
```

### **Lógica de Acumulación**

Cuando se acreditan puntos:

1. **Cliente Hijo (tiene `parentCustomerId`)**:
   ```
   Cliente Hijo recibe:  +50 puntos
   Cliente Padre recibe: +50 puntos (mismo monto)
   ```

2. **Cliente Regular (sin `parentCustomerId`)**:
   ```
   Cliente recibe: +50 puntos
   (No hay padre, solo se acredita al cliente)
   ```

### **Ejemplo Práctico**

```typescript
// Escenario: Cliente hijo "Juan" (ID: 5) con padre "Empresa ABC" (ID: 2)

// Orden completada con 100 puntos
{
  orderId: 789,
  customerId: 5,          // Juan
  loyaltyPointsTotal: 100
}

// Resultado de acreditación:
{
  success: true,
  pointsAwarded: 100,
  customersAffected: [5, 2], // Juan y Empresa ABC
  message: "100 puntos acreditados a 2 cliente(s)"
}

// Transacciones creadas:
[
  {
    customerId: 5,
    type: "earned",
    points: 100,
    description: "Puntos ganados por orden ORD-789"
  },
  {
    customerId: 2,
    type: "earned",
    points: 100,
    description: "Puntos acumulados de cliente hijo: Juan (Orden ORD-789)"
  }
]
```

---

## 🚀 Instalación y Migración

### **1. Ejecutar Migración de Base de Datos**

```bash
# Ejecutar en todas las tiendas
npm run migrate:loyalty-points

# O manualmente con PostgreSQL
psql -d your_database -f migrations/add-loyalty-points-credited-field.sql
```

### **2. Verificar Instalación**

```bash
# En la consola de PostgreSQL
\d orders

# Debe mostrar las nuevas columnas:
# - loyalty_points_credited (boolean)
# - loyalty_points_credited_at (timestamp)
```

---

## 🧪 Testing

### **Caso de Prueba 1: Acreditación Normal**

```typescript
// 1. Crear orden con puntos
const order = await createOrder({
  customerId: 1,
  loyaltyPointsTotal: 50,
  items: [...]
});

// 2. Completar orden
await updateOrderStatus(order.id, 'completed');

// 3. Verificar acreditación
const balance = await getCustomerLoyaltyBalance(1);
assert.equal(balance.currentBalance, '50.00');

const orderUpdated = await getOrderById(order.id);
assert.equal(orderUpdated.loyaltyPointsCredited, true);
```

### **Caso de Prueba 2: Prevención de Doble Acreditación**

```typescript
// 1. Completar orden (primera vez)
await updateOrderStatus(orderId, 'completed'); // ✅ Acredita

// 2. Intentar completar nuevamente
await updateOrderStatus(orderId, 'pending');
await updateOrderStatus(orderId, 'completed'); // ❌ No acredita

// 3. Verificar que solo se acreditó una vez
const transactions = await getLoyaltyTransactions(customerId);
assert.equal(transactions.length, 1);
```

### **Caso de Prueba 3: Cliente Padre**

```typescript
// 1. Crear cliente padre y hijo
const parent = await createCustomer({ name: 'Empresa' });
const child = await createCustomer({
  name: 'Juan',
  parentCustomerId: parent.id
});

// 2. Crear y completar orden del hijo
const order = await createOrder({
  customerId: child.id,
  loyaltyPointsTotal: 100
});
await updateOrderStatus(order.id, 'completed');

// 3. Verificar ambos balances
const childBalance = await getCustomerLoyaltyBalance(child.id);
const parentBalance = await getCustomerLoyaltyBalance(parent.id);

assert.equal(childBalance.currentBalance, '100.00');
assert.equal(parentBalance.currentBalance, '100.00');
```

---

## 📝 Logs y Debugging

### **Logs de Acreditación Exitosa**

```
🎁 [LOYALTY] Orden 123 completada, acreditando puntos...
🎁 [LOYALTY] Iniciando acreditación de puntos para orden 123
💰 [LOYALTY] Acreditando 50 puntos al cliente 5 (Juan)
   📊 Cliente 5: 0 → 50 puntos
   ✅ Transacción creada para cliente 5
👨‍👦 [LOYALTY] Acreditando 50 puntos al cliente padre 2 (Empresa ABC)
   📊 Cliente 2: 200 → 250 puntos
   ✅ Transacción creada para cliente 2
✅ [LOYALTY] Puntos acreditados exitosamente para orden 123
   - Puntos: 50
   - Clientes afectados: 5, 2
✅ [LOYALTY] 50 puntos acreditados a 2 cliente(s)
```

### **Logs de Validación Fallida**

```
🎁 [LOYALTY] Orden 123 completada, acreditando puntos...
🎁 [LOYALTY] Iniciando acreditación de puntos para orden 123
⚠️ [LOYALTY] Los puntos de la orden 123 ya fueron acreditados
⚠️ [LOYALTY] Los puntos ya fueron acreditados previamente
```

### **Logs de Reversión**

```
↩️ [LOYALTY] Orden 123 cancelada después de completarse, revirtiendo puntos...
🔄 [LOYALTY] Iniciando reversión de puntos para orden 123
↩️ [LOYALTY] Revirtiendo 50 puntos del cliente 5
   📊 Cliente 5: 50 → 0 puntos
   ✅ Transacción de reversión creada para cliente 5
↩️ [LOYALTY] Revirtiendo 50 puntos del cliente 2
   📊 Cliente 2: 250 → 200 puntos
   ✅ Transacción de reversión creada para cliente 2
✅ [LOYALTY] Puntos revertidos exitosamente para orden 123
✅ [LOYALTY] 50 puntos revertidos de 2 cliente(s)
```

---

## ⚠️ Consideraciones Importantes

### **1. Idempotencia**
El sistema es idempotente: llamar múltiples veces a `creditLoyaltyPointsFromOrder()` para la misma orden NO acredita puntos múltiples veces.

### **2. Transacciones Atómicas**
Todas las operaciones son atómicas. Si falla la acreditación al padre, se revierte todo.

### **3. No Bloquea la Actualización de Orden**
Si falla la acreditación de puntos, la orden se actualiza de todas formas. Los errores se logean pero no fallan la operación principal.

### **4. Estados de Orden Soportados**
- `completed` → Acredita puntos
- `cancelled` (desde `completed`) → Revierte puntos
- Otros cambios de estado → No afecta puntos

### **5. Puntos Cero**
Si `loyaltyPointsTotal = 0`, la orden se marca como `loyaltyPointsCredited = true` para evitar reprocesar.

---

## 🔐 Seguridad

1. ✅ Validación de existencia de orden
2. ✅ Validación de existencia de cliente
3. ✅ Prevención de doble acreditación
4. ✅ Validación de puntos positivos
5. ✅ No permite balance negativo en reversiones
6. ✅ Todas las transacciones quedan registradas

---

## 📚 Referencias

- **Schema:** [shared/schema.ts](shared/schema.ts:432-437)
- **Servicio:** [server/services/loyalty-points-service.ts](server/services/loyalty-points-service.ts)
- **Métodos Tenant:** [server/tenant-storage.ts](server/tenant-storage.ts:5457-5495)
- **Endpoints:** [server/routes.ts](server/routes.ts:3542-3580)
- **Migración:** [migrations/add-loyalty-points-credited-field.sql](migrations/add-loyalty-points-credited-field.sql)
- **Script Migración:** [scripts/run-loyalty-points-migration.ts](scripts/run-loyalty-points-migration.ts)

---

## 💡 Preguntas Frecuentes

### **¿Qué pasa si cambio una orden de `completed` a `pending` y luego a `completed` de nuevo?**

La segunda vez que cambie a `completed`, NO se acreditarán puntos porque `loyaltyPointsCredited = true`. Solo se acredita la primera vez.

### **¿Puedo acreditar puntos manualmente?**

Sí, usa el endpoint existente `POST /api/customers/:id/loyalty/adjust` con la lógica de cliente padre ya implementada en [server/routes/customer-management-routes.ts](server/routes/customer-management-routes.ts:300-440).

### **¿Se pueden revertir puntos de una orden vieja?**

Sí, llama a `revertLoyaltyPointsFromOrder(orderId)` en cualquier momento. El sistema validará que los puntos hayan sido acreditados antes de revertir.

### **¿Qué pasa si elimino una orden con puntos acreditados?**

Los puntos NO se revierten automáticamente. Deberías llamar a `revertLoyaltyPointsFromOrder()` antes de eliminar la orden si quieres revertir los puntos.

---

**Última actualización:** 2025-12-11
**Versión:** 1.0.0
**Autor:** Sistema de Acreditación Automática de Loyalty Points
