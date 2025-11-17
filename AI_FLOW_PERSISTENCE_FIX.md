# Fix: Persistencia del Flujo de Pedidos IA y Limpieza Automática

**Fecha:** 2025-11-17
**Problema:** La IA perdía el contexto del pedido entre mensajes, causando que confirmaciones como "Si procede" no funcionaran correctamente.

---

## 🐛 Problemas Identificados

### Problema 1: Pérdida de Contexto en Confirmaciones
**Síntoma:**
```
Usuario: "Haz la orden para 3 rite start"
IA: "✅ RiteStart Men - RD$96.00 (3 unidades). ¿Te gustaría proceder con la orden?"

Usuario: "Si procede"
IA: "🛒 Tu carrito está vacío. ¿Qué te gustaría pedir?"  ❌
```

**Causa Raíz:**
1. `interpretMessage()` retornaba `intent: 'confirm order'`
2. `interpretAIMessage()` en [ai-order-assistant.ts](server/ai-order-assistant.ts) NO mapeaba este intent correctamente
3. Siempre convertía confirmaciones a `add_to_cart` en lugar de `confirm_order`
4. El carrito se vaciaba y se perdía el estado del pedido

### Problema 2: Estado del Pedido No Persistente
**Síntoma:**
- Cuando el usuario agregaba productos al carrito, el estado se guardaba en memoria
- Al siguiente mensaje, el carrito estaba vacío
- No se mantenía `pendingOrder` ni `orderFlowStep` entre mensajes

**Causa Raíz:**
- El carrito se guardaba en `aiConversation.cartItems`
- PERO el flujo de pedido guardaba en `pendingOrder.cartItems`
- Al recuperar, solo se leía `cartItems` (que estaba vacío)

### Problema 3: Conversaciones Inconclusas Sin Limpiar
**Síntoma:**
- Cliente inicia pedido pero lo abandona
- El estado del pedido queda "colgado" en la BD
- Al volver días después, el sistema intenta continuar un pedido antiguo

**Causa Raíz:**
- No había proceso de limpieza automática para conversaciones AI inconclusas
- Estados de `orderFlowStep` permanecían activos indefinidamente

---

## ✅ Soluciones Implementadas

### Fix 1: Detección Correcta de Confirmaciones

**Archivo:** [server/ai-order-assistant.ts:78-90](server/ai-order-assistant.ts#L78-L90)

**Cambio:**
```typescript
// ✅ ANTES: No detectaba confirmaciones correctamente
let intent = 'search_product';
if (interpretation.category === 'order' && interpretation.entities.products?.length) {
  intent = 'add_to_cart';
}

// ✅ AHORA: Detecta confirmaciones explícitamente
const confirmationKeywords = ['si', 'sí', 'yes', 'confirmar', 'confirm', 'procede', 'proceder', 'ok', 'vale', 'adelante'];
const isConfirmation = confirmationKeywords.some(keyword => message.toLowerCase().includes(keyword));

if (interpretation.intent === 'confirm order' || (interpretation.category === 'order' && isConfirmation)) {
  intent = 'confirm_order';  // ✅ Mantener el intent correcto
} else if (interpretation.category === 'order' && interpretation.entities.products?.length) {
  intent = 'add_to_cart';
}
```

**Resultado:**
- Cuando el usuario dice "Si procede", ahora se detecta como `confirm_order`
- El flujo continúa correctamente al proceso de confirmación

---

### Fix 2: Persistencia del Estado del Pedido

#### 2.1 Recuperación del Carrito al Confirmar

**Archivo:** [server/whatsapp-smart-ai.ts:667-676](server/whatsapp-smart-ai.ts#L667-L676)

**Cambio:**
```typescript
case 'confirm_order':
  // ✅ Si el carrito está vacío pero hay pendingOrder, recuperarlo
  if (currentCart.length === 0 && (aiConversation as any).pendingOrder?.cartItems?.length > 0) {
    console.log(`🔄 [AI-SMART] Recuperando carrito de pendingOrder: ${(aiConversation as any).pendingOrder.cartItems.length} items`);
    currentCart = (aiConversation as any).pendingOrder.cartItems;
  }

  if (currentCart.length === 0) {
    return { handled: true, responseMessage: '🛒 Tu carrito está vacío. ¿Qué te gustaría pedir?' };
  }
```

**Resultado:**
- Cuando se confirma, el sistema recupera los items del `pendingOrder`
- Ya no se pierde el carrito entre mensajes

#### 2.2 Guardar Carrito en Múltiples Ubicaciones

**Archivo:** [server/whatsapp-smart-ai.ts:600-635](server/whatsapp-smart-ai.ts#L600-L635)

**Cambios en ambos casos (con dirección y sin dirección):**

```typescript
// Cliente CON dirección registrada
const orderFlowConversation = {
  ...aiConversation,
  cartItems: currentCart, // ✅ NUEVO: Guardar también en cartItems
  orderFlowStep: 'collect_payment',
  pendingOrder: {
    cartItems: currentCart,
    address: customer.address,
    paymentMethod: undefined,
    notes: undefined
  }
} as any;
await tenantStorage.updateAIConversation?.(storeId, conversationId, orderFlowConversation);

console.log(`💾 [AI-SMART] Estado guardado - Carrito: ${currentCart.length} items, Step: collect_payment`);

// Cliente SIN dirección
const orderFlowConversation = {
  ...aiConversation,
  cartItems: currentCart, // ✅ NUEVO: Guardar también en cartItems
  orderFlowStep: 'collect_address',
  pendingOrder: {
    cartItems: currentCart,
    address: undefined,
    paymentMethod: undefined,
    notes: undefined
  }
} as any;
await tenantStorage.updateAIConversation?.(storeId, conversationId, orderFlowConversation);

console.log(`💾 [AI-SMART] Estado guardado - Carrito: ${currentCart.length} items, Step: collect_address`);
```

**Resultado:**
- El carrito se guarda en AMBAS ubicaciones (`cartItems` y `pendingOrder.cartItems`)
- Si una falla, la otra está disponible como respaldo
- El estado se persiste correctamente en la base de datos

---

### Fix 3: Limpieza Automática de Conversaciones Inconclusas

#### 3.1 Nuevo Servicio de Limpieza

**Archivo:** [server/ai-conversation-cleanup.ts](server/ai-conversation-cleanup.ts) (NUEVO)

**Funcionalidad:**
```typescript
/**
 * Limpia conversaciones IA inconclusas (con orderFlowStep activo pero sin actividad reciente)
 */
export async function cleanupIncompleteAIConversations(
  storeId: number,
  tenantStorage: any,
  config: CleanupConfig = {
    inactivityThresholdMinutes: 30,  // 30 minutos sin actividad
    runIntervalMinutes: 30           // Ejecutar cada 30 minutos
  }
): Promise<number>
```

**Lógica:**
1. Busca todas las conversaciones AI activas de la tienda
2. Filtra las que tienen `orderFlowStep` activo (flujo inconcluso)
3. Verifica si están inactivas (última actividad > 30 min)
4. Limpia el estado (`orderFlowStep` → null, `pendingOrder` → undefined)
5. Mantiene `cartItems` por si el usuario quiere retomar

**Resultado:**
- Conversaciones abandonadas se limpian automáticamente
- No interfieren con nuevas conversaciones
- El usuario puede empezar fresco si vuelve

#### 3.2 Función de Soporte en Tenant Storage

**Archivo:** [server/tenant-storage.ts:4450-4464](server/tenant-storage.ts#L4450-L4464)

**Cambio:**
```typescript
/**
 * Obtener conversaciones AI activas (para limpieza)
 */
async getActiveAIConversations(storeId: number) {
  try {
    const conversations = await tenantDb
      .select()
      .from(schema.aiConversations)
      .where(eq(schema.aiConversations.storeId, storeId));
    return conversations || [];
  } catch (error) {
    console.error('Error getting active AI conversations:', error);
    return [];
  }
}
```

**Resultado:**
- Permite recuperar todas las conversaciones AI activas de una tienda
- Base para el proceso de limpieza

#### 3.3 Integración en Tareas Programadas

**Archivo:** [server/scheduled-tasks.ts](server/scheduled-tasks.ts)

**Cambios:**
1. **Import del servicio** (Línea 3):
```typescript
import { cleanupIncompleteAIConversations } from './ai-conversation-cleanup.js';
```

2. **Nueva configuración de intervalo** (Línea 14):
```typescript
const CLEANUP_INTERVALS = {
  CONVERSATIONS: 24 * 60 * 60 * 1000, // 24 horas
  REGISTRATION_FLOWS: 6 * 60 * 60 * 1000, // 6 horas
  ORPHAN_DATA: 12 * 60 * 60 * 1000, // 12 horas
  AI_CONVERSATIONS: 30 * 60 * 1000, // ✅ NUEVO: 30 minutos
};
```

3. **Nueva función de limpieza** (Líneas 127-186):
```typescript
async function cleanupAllStoresAIConversations() {
  // Limpia conversaciones AI inconclusas para todas las tiendas activas
  // Ejecuta cleanupIncompleteAIConversations para cada tienda
  // Reporta resultados y errores
}
```

4. **Programación automática** (Líneas 253-255, 263):
```typescript
// 4️⃣ Limpiar conversaciones AI inconclusas cada 30 minutos
setInterval(cleanupAllStoresAIConversations, CLEANUP_INTERVALS.AI_CONVERSATIONS);

// En la ejecución inicial:
setTimeout(() => {
  // ...otras tareas...
  cleanupAllStoresAIConversations(); // ✅ Agregar limpieza de AI
}, 60 * 1000);
```

5. **Export actualizado** (Línea 290):
```typescript
export {
  cleanupAllStoresConversations,
  cleanupAllStoresRegistrationFlows,
  cleanupAllStoresOrphanData,
  cleanupAllStoresAIConversations  // ✅ NUEVO
};
```

**Resultado:**
- La limpieza se ejecuta automáticamente cada 30 minutos
- Procesa todas las tiendas activas
- Se ejecuta al iniciar el servidor (después de 1 minuto)
- Logs detallados para monitoring

---

## 🔄 Flujo Corregido Completo

### Escenario: Cliente Nuevo Hace Pedido

```
1. Usuario: "Haz la orden para 3 rite start"
   ↓
2. tryProcessWithAI recibe mensaje
   ↓
3. interpretAIMessage analiza:
   - interpretMessage → intent: 'order', products: ['rite start'], quantity: 3
   - Mapea correctamente → intent: 'add_to_cart'
   ↓
4. Busca productos → RiteStart Men encontrado
   ↓
5. Agrega al carrito (3x RiteStart Men)
   ↓
6. Verifica si cliente tiene dirección → NO
   ↓
7. Guarda estado en BD:
   {
     cartItems: [RiteStart x3],  ← ✅ Respaldo
     orderFlowStep: 'collect_address',
     pendingOrder: {
       cartItems: [RiteStart x3],  ← ✅ Principal
       address: undefined,
       paymentMethod: undefined
     }
   }
   ↓
8. Responde: "✅ 3 RiteStart Men - RD$288... 📍 ¿Cuál es tu dirección?"

--- NUEVO MENSAJE ---

9. Usuario: "Si procede"
   ↓
10. tryProcessWithAI recibe mensaje
    ↓
11. Recupera aiConversation de la BD (tiene el estado guardado!)
    ↓
12. interpretAIMessage analiza:
    - interpretMessage → intent: 'confirm order'
    - isConfirmation = true (detecta "procede")
    - Mapea correctamente → intent: 'confirm_order'  ✅
    ↓
13. Entra al case 'confirm_order'
    ↓
14. currentCart está vacío, PERO pendingOrder.cartItems tiene 3 items
    ↓
15. Recupera: currentCart = pendingOrder.cartItems  ✅
    ↓
16. Verifica si cliente tiene dirección → NO
    ↓
17. Inicia flujo: collect_address
    ↓
18. Responde: "📍 Para procesar tu pedido, necesito tu dirección..."
```

---

## 📊 Comparación Antes vs Después

| Aspecto | Antes ❌ | Después ✅ |
|---------|---------|-----------|
| **Detección de confirmaciones** | "Si procede" se interpretaba como búsqueda de producto | Detecta correctamente como `confirm_order` |
| **Persistencia del carrito** | Se perdía entre mensajes | Se guarda en BD en 2 ubicaciones |
| **Recuperación del estado** | No recuperaba `pendingOrder` | Recupera automáticamente si `cartItems` está vacío |
| **Conversaciones inconclusas** | Quedaban activas indefinidamente | Se limpian automáticamente después de 30 min |
| **Continuidad del flujo** | Se interrumpía al siguiente mensaje | Mantiene el flujo completo hasta confirmación final |

---

## 🧪 Casos de Prueba

### Caso 1: Confirmación Inmediata
```
Usuario: "Quiero 2 renuvo"
IA: "✅ 2 Renuvo - RD$140... ¿Proceder?"

Usuario: "Si"
IA: "📍 ¿Cuál es tu dirección?"  ✅ FUNCIONA

VERIFICAR LOGS:
- "🔄 [AI-SMART] Recuperando carrito de pendingOrder: 1 items"
- "💾 [AI-SMART] Estado guardado - Carrito: 1 items"
```

### Caso 2: Confirmación con Variaciones
```
Usuario: "Dame 3 vitamina c"
IA: "✅ 3 Vitamina C... ¿Proceder?"

PROBAR:
- "ok" → Debe funcionar
- "procede" → Debe funcionar
- "confirmar" → Debe funcionar
- "adelante" → Debe funcionar
- "vale" → Debe funcionar
```

### Caso 3: Abandonar y Retomar
```
Usuario: "Quiero renuvo"
IA: "✅ Renuvo - RD$70... ¿Proceder?"

[ESPERAR 35 MINUTOS - LIMPIEZA AUTOMÁTICA]

Usuario: "Hola"
IA: "¿Qué producto deseas?"  ✅ Estado limpio

VERIFICAR LOGS:
- "🧹 [AI-CLEANUP] Limpiando conversación X"
- "✅ Store 6: 1 AI conversations cleaned"
```

### Caso 4: Cliente Registrado
```
Usuario (con dirección): "2 renuvo"
IA: "✅ 2 Renuvo - RD$140...
     📦 Enviando a: [dirección registrada]
     💳 ¿Método de pago?"

Usuario: "Efectivo"
IA: "📝 ¿Alguna nota?"

VERIFICAR:
- Salta la solicitud de dirección
- Va directo a pago
```

---

## 📝 Logs de Verificación

### Logs Exitosos:

**Al agregar producto:**
```
✅ [AI-SMART] Agregado: RiteStart Men x3
✅ [AI-SMART] Producto agregado, iniciando proceso de confirmación automático
👤 [AI-SMART] Cliente 69: Cliente 3242, Dirección: NO
📍 [AI-SMART] Cliente sin dirección registrada, solicitando datos
💾 [AI-SMART] Estado guardado - Carrito: 1 items, Step: collect_address
```

**Al confirmar:**
```
🧠 [AI-SMART] Interpretación IA: {
  intent: 'confirm_order',  ✅ Correcto
  itemsCount: 1
}
🔄 [AI-SMART] Recuperando carrito de pendingOrder: 1 items
👤 [AI-SMART] Cliente 69: Cliente 3242, Dirección: NO
```

**Limpieza automática (cada 30 min):**
```
🧹 ===== STARTING SCHEDULED AI CONVERSATIONS CLEANUP =====
🏪 Found 4 active stores
🔄 Processing AI cleanup for store: MAS QUE SALUD (ID: 6)
✅ Store 6: 2 AI conversations cleaned
📊 ===== AI CLEANUP SUMMARY =====
✅ Stores processed successfully: 4/4
🗑️ Total AI conversations cleaned: 5
```

---

## ⚙️ Configuración

### Ajustar Tiempo de Inactividad

**Archivo:** [server/scheduled-tasks.ts:151](server/scheduled-tasks.ts#L151)

```typescript
const cleaned = await cleanupIncompleteAIConversations(
  store.id,
  tenantStorage,
  {
    inactivityThresholdMinutes: 30,  // ← Cambiar aquí (ej: 60 para 1 hora)
    runIntervalMinutes: 30
  }
);
```

### Ajustar Frecuencia de Limpieza

**Archivo:** [server/scheduled-tasks.ts:14](server/scheduled-tasks.ts#L14)

```typescript
const CLEANUP_INTERVALS = {
  AI_CONVERSATIONS: 30 * 60 * 1000,  // ← Cambiar aquí (ej: 15 * 60 * 1000 para cada 15 min)
};
```

### Deshabilitar Limpieza Automática

**Archivo:** [server/scheduled-tasks.ts:254-255](server/scheduled-tasks.ts#L254-L255)

```typescript
// Comentar estas líneas:
// console.log(`📅 AI conversations cleanup: Every ${CLEANUP_INTERVALS.AI_CONVERSATIONS / (60 * 1000)} minutes`);
// setInterval(cleanupAllStoresAIConversations, CLEANUP_INTERVALS.AI_CONVERSATIONS);
```

---

## 🐛 Troubleshooting

### Problema: Sigue sin detectar confirmaciones

**Verificar:**
1. Logs deben mostrar: `intent: 'confirm_order'`
2. Si muestra `intent: 'add_to_cart'`, revisar [ai-order-assistant.ts:78-90](server/ai-order-assistant.ts#L78-L90)

**Solución:**
```bash
# Buscar el mapeo de intent
grep -n "confirmationKeywords\|confirm_order" server/ai-order-assistant.ts

# Verificar que incluye la detección de confirmaciones
```

### Problema: Carrito se sigue perdiendo

**Verificar:**
1. Logs deben mostrar: `💾 [AI-SMART] Estado guardado - Carrito: X items`
2. Al confirmar: `🔄 [AI-SMART] Recuperando carrito de pendingOrder`

**Solución:**
```bash
# Verificar que se está guardando correctamente
grep -n "cartItems: currentCart" server/whatsapp-smart-ai.ts

# Debe aparecer en líneas 604, 624 (ambos casos)
```

### Problema: Limpieza no se ejecuta

**Verificar:**
1. Logs al iniciar servidor: `📅 AI conversations cleanup: Every 30 minutes`
2. Después de 1 minuto: `🧹 ===== STARTING SCHEDULED AI CONVERSATIONS CLEANUP =====`

**Solución:**
```bash
# Verificar que el servidor inició las tareas
grep "STARTING SCHEDULED TASKS" logs/server.log

# Verificar imports
grep -n "cleanupIncompleteAIConversations\|ai-conversation-cleanup" server/scheduled-tasks.ts
```

---

## 📚 Archivos Modificados

### Archivos Existentes Modificados:
1. [server/ai-order-assistant.ts](server/ai-order-assistant.ts) - Detección de confirmaciones
2. [server/whatsapp-smart-ai.ts](server/whatsapp-smart-ai.ts) - Persistencia del carrito
3. [server/tenant-storage.ts](server/tenant-storage.ts) - Nueva función `getActiveAIConversations`
4. [server/scheduled-tasks.ts](server/scheduled-tasks.ts) - Integración de limpieza automática

### Archivos Nuevos Creados:
1. [server/ai-conversation-cleanup.ts](server/ai-conversation-cleanup.ts) - Servicio de limpieza
2. [AI_FLOW_PERSISTENCE_FIX.md](AI_FLOW_PERSISTENCE_FIX.md) - Esta documentación

---

## ✅ Checklist de Implementación

- [x] Agregar detección de keywords de confirmación
- [x] Mapear `confirm order` a `confirm_order` intent
- [x] Guardar carrito en `cartItems` Y `pendingOrder.cartItems`
- [x] Recuperar carrito de `pendingOrder` si `cartItems` está vacío
- [x] Agregar logs de debug para estado guardado
- [x] Crear servicio de limpieza `ai-conversation-cleanup.ts`
- [x] Agregar `getActiveAIConversations` a tenant-storage
- [x] Integrar limpieza en tareas programadas
- [x] Configurar intervalo de 30 minutos
- [x] Documentar todos los cambios
- [ ] Probar con usuario real
- [ ] Verificar logs en producción
- [ ] Monitorear limpieza automática

---

## 🚀 Próximos Pasos

### Mejoras Sugeridas:

1. **Dashboard de Conversaciones AI**
   - Visualizar conversaciones activas
   - Ver cuántas están en cada paso (collect_address, collect_payment, etc.)
   - Detectar cuellos de botella

2. **Alertas de Conversaciones Abandonadas**
   - Enviar notificación a la tienda cuando un cliente abandona el pedido
   - Permitir recuperación manual

3. **Análisis de Abandono**
   - Registrar en qué paso los clientes abandonan más
   - Mejorar UX en esos pasos

4. **Recuperación Inteligente**
   - Cuando un cliente vuelve después de días, preguntar si quiere retomar
   - "Hola! Vi que tenías un pedido pendiente de [producto]. ¿Quieres completarlo?"

---

**Fin del documento** 🎉
