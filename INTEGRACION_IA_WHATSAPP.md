# INTEGRACIÓN DE IA EN WHATSAPP - GUÍA COMPLETA

## 🎯 MODELO DE INTEGRACIÓN

### Flujo General

```
Cliente envía mensaje
     ↓
¿Es respuesta esperada del flujo normal?
     ├─ SÍ → Continuar flujo normal
     └─ NO → Verificar condiciones IA
              ↓
         ¿Hay créditos disponibles?
              ├─ NO → Flujo normal (fallback)
              └─ SÍ → ¿Es después de bienvenida o catálogo?
                       ├─ SÍ → ACTIVAR IA ✓
                       └─ NO → ¿Mensaje complejo?
                                ├─ SÍ → ACTIVAR IA ✓
                                └─ NO → Flujo normal
```

### Ciclo de Pedido con IA

```
Cliente: "Quiero 2 pizzas hawaianas y una coca cola"
    ↓
IA analiza mensaje (consume 1 crédito)
    ↓
IA busca productos en catálogo
    ├─ Pizza Hawaiana ($150)
    └─ Coca Cola 2L ($30)
    ↓
IA crea carrito:
    ├─ Pizza Hawaiana x2 = $300
    └─ Coca Cola 2L x1 = $30
    ├─ Total: $330
    ↓
IA envía confirmación:
    "✅ Agregado al carrito

     Pizza Hawaiana x2 - $300.00
     Coca Cola 2L x1 - $30.00

     💰 Total: $330.00

     ¿Deseas agregar algo más?"
    ↓
Cliente: "Sí, agrega papas fritas"
    ↓
IA busca "papas fritas"
    └─ Papas Fritas Grandes ($40)
    ↓
IA actualiza carrito y responde
    ↓
Cliente: "Confirmar pedido"
    ↓
IA: "Perfecto! Para continuar necesito:
     1. Dirección de entrega
     2. Número de contacto
     3. Método de pago"
    ↓
[Inicia flujo de recolección de datos]
```

---

## 📁 ARCHIVOS CREADOS

### 1. **server/ai-credits-schema.ts**
Esquema de base de datos para créditos y conversaciones de IA

**Tablas:**
- `ai_credits` - Control de créditos por tienda (BD maestra)
- `ai_usage_log` - Log de uso de IA (BD tienda)
- `ai_conversations` - Conversaciones activas con IA (BD tienda)
- `ai_product_matches` - Cache de búsquedas (BD tienda)

### 2. **server/ai-order-assistant.ts**
Asistente inteligente para procesar pedidos

**Funciones principales:**
- `searchProductsWithAI()` - Búsqueda inteligente de productos
- `interpretOrderMessage()` - Interpreta intención del cliente
- `addToCart()` / `removeFromCart()` - Gestión de carrito
- `generateAddedToCartMessage()` - Mensajes personalizados

### 3. **server/ai-credits-manager.ts**
Gestión de créditos y conversaciones

**Clases:**
- `AICreditsManager` - Manejo de créditos
  - `hasCredits()` - Verificar disponibilidad
  - `consumeCredits()` - Consumir créditos
  - `rechargeCredits()` - Recargar créditos

- `AIConversationManager` - Manejo de conversaciones
  - `startConversation()` - Iniciar conversación
  - `updateCart()` - Actualizar carrito
  - `setMode()` - Cambiar modo (assistant/order_taking)
  - `endConversation()` - Finalizar

### 4. **server/ai-product-search.ts**
Endpoints API para búsqueda de productos

**Rutas:**
- `POST /api/ai/search-products` - Búsqueda con IA
- `GET /api/products/search?q=texto` - Búsqueda simple
- `GET /api/products/category/:category` - Por categoría
- `GET /api/products/categories` - Listar categorías

### 5. **server/whatsapp-ai-integration-v2.ts**
Integración principal con WhatsApp

**Funciones:**
- `processMessageWithAI()` - Procesamiento principal
- `tryProcessWithAI()` - Función de integración
- `createOrderFromCart()` - Crear orden desde carrito

---

## 🗄️ MIGRACIONES DE BASE DE DATOS

### Paso 1: Agregar tablas al schema principal

Edita `shared/schema.ts` y agrega:

```typescript
import {
  aiCredits,
  aiUsageLog,
  aiConversations,
  aiProductMatches
} from '../server/ai-credits-schema';

// Exportar tablas
export {
  aiCredits,
  aiUsageLog,
  aiConversations,
  aiProductMatches
};
```

### Paso 2: Crear migración

```bash
npx drizzle-kit generate:pg
```

### Paso 3: Ejecutar migración

```bash
npx drizzle-kit push:pg
```

### Paso 4: Inicializar créditos para tiendas existentes

```sql
-- En base de datos MAESTRA
INSERT INTO ai_credits (
  store_id,
  total_credits,
  available_credits,
  is_enabled,
  cost_per_message,
  cost_per_order,
  cost_per_voice_note
)
SELECT
  id as store_id,
  1000 as total_credits,
  1000 as available_credits,
  true as is_enabled,
  1 as cost_per_message,
  5 as cost_per_order,
  10 as cost_per_voice_note
FROM virtual_stores
WHERE id NOT IN (SELECT store_id FROM ai_credits);
```

---

## 🔧 MÉTODOS A AGREGAR EN tenant-storage.ts

```typescript
// ========================================
// MÉTODOS DE IA
// ========================================

/**
 * Obtener configuración de créditos de IA
 */
async getAICredits(storeId: number) {
  const masterDb = await getMasterDb();
  const [credits] = await masterDb
    .select()
    .from(schema.aiCredits)
    .where(eq(schema.aiCredits.storeId, storeId));
  return credits;
}

/**
 * Actualizar créditos de IA
 */
async updateAICredits(storeId: number, data: any) {
  const masterDb = await getMasterDb();
  await masterDb
    .update(schema.aiCredits)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.aiCredits.storeId, storeId));
}

/**
 * Registrar uso de IA
 */
async logAIUsage(data: any) {
  const tenantDb = await getTenantDb(this.storeId);
  await tenantDb.insert(schema.aiUsageLog).values(data);
}

/**
 * Obtener conversación de IA
 */
async getAIConversation(conversationId: number) {
  const tenantDb = await getTenantDb(this.storeId);
  const [conversation] = await tenantDb
    .select()
    .from(schema.aiConversations)
    .where(eq(schema.aiConversations.conversationId, conversationId));
  return conversation;
}

/**
 * Crear conversación de IA
 */
async createAIConversation(data: any) {
  const tenantDb = await getTenantDb(this.storeId);
  const [conversation] = await tenantDb
    .insert(schema.aiConversations)
    .values(data)
    .returning();
  return conversation;
}

/**
 * Actualizar conversación de IA
 */
async updateAIConversation(conversationId: number, data: any) {
  const tenantDb = await getTenantDb(this.storeId);
  await tenantDb
    .update(schema.aiConversations)
    .set(data)
    .where(eq(schema.aiConversations.conversationId, conversationId));
}

/**
 * Obtener estadísticas de uso de IA
 */
async getAIUsageStats(days: number = 30) {
  const tenantDb = await getTenantDb(this.storeId);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const logs = await tenantDb
    .select()
    .from(schema.aiUsageLog)
    .where(
      and(
        eq(schema.aiUsageLog.storeId, this.storeId),
        gte(schema.aiUsageLog.createdAt, since)
      )
    );

  return {
    totalMessages: logs.filter(l => l.operationType === 'message_analysis').length,
    totalOrders: logs.filter(l => l.operationType === 'order_creation').length,
    totalVoiceNotes: logs.filter(l => l.operationType === 'voice_transcription').length,
    totalCreditsUsed: logs.reduce((sum, l) => sum + l.creditsCost, 0),
    averageConfidence: logs.reduce((sum, l) => sum + (l.confidence || 0), 0) / logs.length
  };
}
```

---

## 📝 INTEGRACIÓN EN whatsapp-simple.ts

### Ubicación: Después de guardar mensaje, antes de auto-respuestas

```typescript
// ========================================
// IMPORTAR AL INICIO DEL ARCHIVO
// ========================================

import { tryProcessWithAI } from './whatsapp-ai-integration-v2';

// ========================================
// DENTRO DE processIncomingUserMessage()
// DESPUÉS DE: await tenantStorage.createMessage(...)
// ANTES DE: const autoResponses = await tenantStorage.getActiveAutoResponses()
// ========================================

// ✨ NUEVO: Intentar procesar con IA
const aiResult = await tryProcessWithAI(
  messageText,
  storeMapping,
  conversation,
  customer,
  tenantStorage,
  {
    isAfterWelcome: justSentWelcome, // Tu variable de control
    isAfterCatalog: justSentCatalog,  // Tu variable de control
    expectedResponses: [
      '1', '2', '3', // Opciones de menú
      'catálogo', 'ayuda', 'estado'
    ]
  }
);

// Si la IA manejó el mensaje
if (aiResult.handled) {
  console.log('🤖 Mensaje procesado por IA');

  // Enviar respuesta de IA
  if (aiResult.responseMessage) {
    await sendWhatsAppMessage(
      phoneNumber,
      aiResult.responseMessage,
      storeMapping.storeId,
      conversation.id,
      tenantStorage
    );
  }

  // Si debe crear orden
  if (aiResult.shouldCreateOrder && aiResult.cart) {
    const { createOrderFromCart } = await import('./whatsapp-ai-integration-v2');

    const order = await createOrderFromCart(
      aiResult.cart,
      customer,
      storeMapping.storeId,
      tenantStorage
    );

    // Iniciar flujo de recolección de datos
    await tenantStorage.createOrUpdateRegistrationFlow({
      phoneNumber,
      customerId: customer.id,
      currentStep: 'collect_address',
      orderId: order.id,
      collectedData: JSON.stringify({}),
      isCompleted: false,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log(`✅ Orden creada por IA - ID: ${order.id}`);
  }

  // No continuar con flujo normal
  res.sendStatus(200);
  return;
}

// Si la IA no manejó el mensaje, continuar con flujo normal
console.log('⏭️ Continuando con flujo normal');
```

---

## 🎛️ CONFIGURACIÓN DE CRÉDITOS

### Panel de administración

Crear interfaz para:

1. **Ver créditos disponibles**
   ```typescript
   GET /api/ai/credits/:storeId
   ```

2. **Recargar créditos**
   ```typescript
   POST /api/ai/credits/:storeId/recharge
   { amount: 1000 }
   ```

3. **Configurar costos**
   ```typescript
   PUT /api/ai/credits/:storeId/config
   {
     costPerMessage: 1,
     costPerOrder: 5,
     costPerVoiceNote: 10,
     isEnabled: true
   }
   ```

4. **Ver estadísticas**
   ```typescript
   GET /api/ai/stats/:storeId?days=30
   ```

---

## 📊 COSTOS RECOMENDADOS

| Operación | Créditos | Justificación |
|-----------|----------|---------------|
| Análisis de mensaje | 1 | Operación rápida, bajo costo |
| Procesamiento de pedido | 5 | Múltiples llamadas a IA |
| Transcripción de voz | 10 | Procesamiento costoso |
| Búsqueda de productos | 2 | Búsqueda simple |

**Ejemplo de uso:**

- Cliente envía 10 mensajes de texto: **10 créditos**
- Cliente hace 2 pedidos: **10 créditos**
- Cliente envía 1 nota de voz: **10 créditos**
- **Total: 30 créditos**

Con 1000 créditos iniciales:
- Aproximadamente **33 pedidos completos**
- O **100 mensajes de texto**
- O **10 notas de voz**

---

## 🧪 PRUEBAS

### Test manual

```bash
npm run ai:test
```

### Test de integración WhatsApp

1. Configurar webhook de prueba
2. Enviar mensajes de prueba:
   - "Hola" → Debe activar IA
   - "Quiero 2 pizzas" → Debe buscar productos
   - "Agregar coca cola" → Debe actualizar carrito
   - "Confirmar" → Debe iniciar recolección de datos

---

## 📈 MONITOREO

### Logs importantes

```typescript
// En producción, agregar:
console.log('🤖 IA activada');
console.log('💳 Créditos consumidos:', cost);
console.log('📦 Carrito actualizado:', cart.length);
console.log('✅ Orden creada:', order.id);
```

### Alertas

Configurar notificaciones cuando:
- Créditos < 50
- Error en procesamiento de IA
- Alta tasa de fallos (>20%)

---

## 🚀 PRÓXIMOS PASOS

1. ✅ Ejecutar migraciones de BD
2. ✅ Agregar métodos en tenant-storage.ts
3. ✅ Integrar en whatsapp-simple.ts
4. ✅ Configurar créditos iniciales
5. ✅ Probar con mensajes reales
6. ✅ Crear panel de administración
7. ✅ Configurar monitoreo

---

## ❓ PREGUNTAS FRECUENTES

**P: ¿Qué pasa si se agotan los créditos?**
R: El sistema cae back al flujo manual automáticamente.

**P: ¿Se puede desactivar la IA?**
R: Sí, configurando `isEnabled: false` en ai_credits.

**P: ¿Cómo se cobran los créditos?**
R: Define tu modelo de negocio: compra única, suscripción, pay-as-you-go, etc.

**P: ¿La IA puede equivocarse?**
R: Sí, por eso valida con `confidence` y permite correcciones del cliente.

---

## 📞 SOPORTE

Para dudas o problemas:
1. Revisa logs en consola
2. Verifica configuración de créditos
3. Prueba con mensajes simples primero
4. Aumenta logging temporal para debugging

---

**VERSIÓN: 2.0**
**FECHA: 2025-11-11**
**ESTADO: LISTO PARA IMPLEMENTAR** ✓
