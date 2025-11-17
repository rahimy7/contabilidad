# Integración de IA con Flujo Automático de Órdenes

## Objetivo

Crear un sistema híbrido donde la IA siga la misma lógica de creación de órdenes que las respuestas automáticas, permitiendo alternancia fluida entre ambos modos.

## Problemática Actual

### Respuestas Automáticas (Actual)
```
Usuario: "Hola"
→ Auto: Bienvenida
Usuario: "Quiero ordenar"
→ Auto: Crea customerRegistrationFlow
→ Auto: Crea orden (draft)
→ Auto: Colecta datos paso a paso
→ Auto: Confirmación
→ Auto: Finaliza orden
```

### IA (Actual - Problemático)
```
Usuario: "Hola"
→ Auto: Bienvenida
Usuario: "un rite start"
→ IA: Procesa sin estructura
→ IA: No crea orden
→ IA: No puede pasar a confirmación automática
```

## Solución: Sistema Híbrido

### Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│          ENTRADA DEL USUARIO                             │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│     ¿Existe customerRegistrationFlow?                    │
│                                                           │
│  flowType: "ai_assisted" | "automatic" | null           │
└────┬─────────────────────────────────┬──────────────────┘
     │ SÍ (flowType existe)            │ NO
     │                                  │
     ▼                                  ▼
┌────────────────────┐         ┌─────────────────┐
│ CONTINUAR FLUJO    │         │ DETECTAR MODO   │
│                    │         │                 │
│ - ai_assisted →    │         │ ¿Mensaje de IA? │
│   Procesar con IA  │         │                 │
│   Actualizar orden │         │ SÍ → Iniciar IA │
│                    │         │ NO → Auto       │
│ - automatic →      │         └─────────────────┘
│   Procesar auto    │
│   Actualizar orden │
└────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              FLUJO DE IA (ai_assisted)                   │
│                                                           │
│ 1. Usuario: "un rite start"                             │
│    → IA: Detecta intención                               │
│    → CREA customerRegistrationFlow:                      │
│       - flowType: "ai_assisted"                          │
│       - currentStep: "add_products"                      │
│    → CREA orden (draft)                                  │
│    → Agrega producto al carrito                          │
│                                                           │
│ 2. Usuario: "2 rite start men"                          │
│    → IA: Actualiza cantidad                              │
│    → ACTUALIZA orden (items)                             │
│                                                           │
│ 3. Usuario: "confirmar"                                  │
│    → CAMBIA flowType: "automatic"                        │
│    → CAMBIA currentStep: "confirm_order"                 │
│    → Pasa a flujo automático                             │
│                                                           │
│ 4. Flujo automático toma el control                     │
│    → Solicita confirmación                               │
│    → Solicita datos faltantes                            │
│    → Finaliza orden                                      │
└─────────────────────────────────────────────────────────┘
```

## Estructura de Datos

### CustomerRegistrationFlow (Extendido)

```typescript
{
  id: number;
  customerId: number;
  phoneNumber: string;
  currentStep: string;  // "add_products", "collect_address", "collect_payment", "confirm_order"
  flowType: "ai_assisted" | "automatic" | null;  // ✅ NUEVO
  orderId: number;  // ✅ Ya existe
  orderNumber: string;
  collectedData: {
    // Datos del cliente
    name?: string;
    address?: string;
    contactNumber?: string;
    paymentMethod?: string;
    notes?: string;

    // ✅ NUEVO: Datos de IA
    cartItems?: Array<{
      productId: number;
      productName: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }>;
    aiContext?: {
      lastIntent: string;
      conversationId: number;
    };
  };
  isCompleted: boolean;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

## Flujos de Trabajo

### 1. Iniciar con IA

```typescript
// Usuario: "quiero 2 rite start"
async function handleAIOrderStart(message, customerId, phoneNumber, storeId) {
  // 1. Interpretar con IA
  const interpretation = await interpretAIMessage(message, ...);

  if (interpretation.intent === 'add_to_cart') {
    // 2. Crear orden en draft
    const order = await tenantStorage.createOrder({
      customerId,
      storeId,
      status: 'draft',
      items: interpretation.cartItems,
      totalAmount: calculateTotal(interpretation.cartItems)
    });

    // 3. Crear registration flow con tipo AI
    const flow = await tenantStorage.createRegistrationFlow({
      customerId,
      phoneNumber,
      currentStep: 'add_products',
      flowType: 'ai_assisted',  // ✅ Marca como IA
      orderId: order.id,
      orderNumber: order.orderNumber,
      collectedData: JSON.stringify({
        cartItems: interpretation.cartItems,
        aiContext: {
          lastIntent: interpretation.intent,
          conversationId: conversationId
        }
      })
    });

    return {
      responseMessage: formatCartSummary(interpretation.cartItems),
      flow,
      order
    };
  }
}
```

### 2. Continuar con IA

```typescript
// Usuario: "agregar 1 transfer factor plus"
async function handleAIContinuation(message, flow, storeId) {
  // 1. Recuperar orden existente
  const order = await tenantStorage.getOrderById(flow.orderId);
  const collectedData = JSON.parse(flow.collectedData);

  // 2. Interpretar nuevo mensaje
  const interpretation = await interpretAIMessage(message, ...);

  if (interpretation.intent === 'add_to_cart') {
    // 3. Actualizar carrito
    const updatedCart = [...collectedData.cartItems, ...interpretation.cartItems];

    // 4. Actualizar orden
    await tenantStorage.updateOrder(order.id, {
      items: updatedCart,
      totalAmount: calculateTotal(updatedCart)
    });

    // 5. Actualizar flow
    await tenantStorage.updateRegistrationFlow(flow.phoneNumber, {
      collectedData: JSON.stringify({
        ...collectedData,
        cartItems: updatedCart
      }),
      updatedAt: new Date()
    });

    return { responseMessage: formatCartSummary(updatedCart) };
  }
}
```

### 3. Transición IA → Automático

```typescript
// Usuario: "confirmar" o "proceder con la orden"
async function handleAIToAutomaticTransition(message, flow, storeId) {
  const confirmationKeywords = ['confirmar', 'proceder', 'si', 'adelante'];
  const isConfirmation = confirmationKeywords.some(kw =>
    message.toLowerCase().includes(kw)
  );

  if (isConfirmation) {
    // 1. Cambiar a modo automático
    await tenantStorage.updateRegistrationFlow(flow.phoneNumber, {
      flowType: 'automatic',  // ✅ Cambio de modo
      currentStep: 'confirm_order',  // ✅ Paso de confirmación
      updatedAt: new Date()
    });

    // 2. Enviar mensaje de confirmación automático
    await sendAutoResponseMessage(
      flow.phoneNumber,
      'confirm_order',  // trigger automático
      storeId,
      tenantStorage
    );

    return { handled: true };
  }
}
```

### 4. Procesar en Modo Automático

```typescript
// Sistema automático toma el control
async function handleRegistrationFlow(customer, messageText, registrationFlow, storeId) {
  // El código existente ya maneja esto
  switch (registrationFlow.currentStep) {
    case 'confirm_order':
      // Procesar confirmación
      // Solicitar datos faltantes (address, payment, etc.)
      // Finalizar orden
      break;

    case 'collect_address':
      // Colectar dirección
      break;

    case 'collect_payment':
      // Colectar pago
      break;
  }
}
```

## Modificaciones Necesarias

### 1. Schema (ya existe `flowType`)

```typescript
// shared/schema.ts - customerRegistrationFlows
flowType: text("flow_type"),  // ✅ Ya existe
```

### 2. WhatsApp Smart AI (whatsapp-smart-ai.ts)

**Cambios:**

```typescript
// ✅ Al agregar productos, crear registration flow
case 'add_to_cart':
  // ... código existente ...

  // NUEVO: Crear o actualizar registration flow
  let registrationFlow = await tenantStorage.getRegistrationFlow(phoneNumber);

  if (!registrationFlow) {
    // Crear orden draft
    const order = await tenantStorage.createOrder({
      customerId,
      storeId,
      status: 'draft',
      items: currentCart,
      totalAmount: cartTotal
    });

    // Crear flow
    registrationFlow = await tenantStorage.createRegistrationFlow({
      customerId,
      phoneNumber,
      currentStep: 'add_products',
      flowType: 'ai_assisted',
      orderId: order.id,
      orderNumber: order.orderNumber,
      collectedData: JSON.stringify({
        cartItems: currentCart,
        aiContext: { conversationId }
      }),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
  } else {
    // Actualizar orden y flow existente
    await tenantStorage.updateOrder(registrationFlow.orderId, {
      items: currentCart,
      totalAmount: cartTotal
    });

    await tenantStorage.updateRegistrationFlow(phoneNumber, {
      collectedData: JSON.stringify({
        ...JSON.parse(registrationFlow.collectedData),
        cartItems: currentCart
      })
    });
  }

  break;

// ✅ Al confirmar, pasar a automático
case 'confirm_order':
  // Cambiar a modo automático
  await tenantStorage.updateRegistrationFlow(phoneNumber, {
    flowType: 'automatic',
    currentStep: 'confirm_order'
  });

  // Enviar confirmación automática
  await sendAutoResponseMessage(phoneNumber, 'confirm_order', storeId, tenantStorage);
  return { handled: true };
```

### 3. WhatsApp Simple (whatsapp-simple.ts)

**Cambios:**

```typescript
// Reconocer flows de tipo AI
async function handleRegistrationFlow(customer, messageText, messageData, registrationFlow, storeId, tenantStorage) {

  // ✅ NUEVO: Si es AI y no está en modo automático, devolver control a IA
  if (registrationFlow.flowType === 'ai_assisted' &&
      registrationFlow.currentStep === 'add_products') {
    console.log(`🤖 [HYBRID] Flow es AI - devolviendo a IA`);
    return false;  // No procesar aquí, dejar que IA maneje
  }

  // ✅ Si cambió a automatic, procesar normalmente
  if (registrationFlow.flowType === 'automatic' ||
      registrationFlow.currentStep !== 'add_products') {
    console.log(`🤖 [HYBRID] Flow es AUTOMATIC - procesando`);
    // Código existente...
  }
}
```

### 4. Detección de Modo (nuevo archivo)

```typescript
// server/hybrid-flow-manager.ts
export async function shouldUseAI(
  phoneNumber: string,
  messageText: string,
  storeId: number,
  tenantStorage: any
): Promise<boolean> {
  // 1. Verificar si existe flow
  const flow = await tenantStorage.getRegistrationFlow(phoneNumber);

  if (!flow || flow.isCompleted) {
    // No hay flow, usar criterios normales de IA
    return shouldUseAINormally(messageText, ...);
  }

  // 2. Si hay flow AI en modo add_products, usar IA
  if (flow.flowType === 'ai_assisted' && flow.currentStep === 'add_products') {
    return true;
  }

  // 3. Si hay flow automatic, NO usar IA
  if (flow.flowType === 'automatic') {
    return false;
  }

  // 4. Default
  return shouldUseAINormally(messageText, ...);
}
```

## Ventajas del Sistema Híbrido

### 1. **Continuidad de Datos**
- La orden se crea desde el inicio
- Los datos persisten entre IA y automático
- No se pierde información al cambiar de modo

### 2. **Flexibilidad**
- IA maneja conversación natural para agregar productos
- Automático maneja confirmación estructurada
- Usuario puede alternar sin perder progreso

### 3. **Trazabilidad**
- Cada orden tiene un `flowType` que indica cómo se creó
- Fácil debugging (saber si fue IA o automático)
- Métricas de uso de cada modo

### 4. **Escalabilidad**
- Fácil agregar más modos (ej: "web_initiated", "app_initiated")
- Cada modo puede tener su propia lógica
- Sin duplicación de código para gestión de órdenes

## Ejemplo Completo de Flujo

### Conversación Real:

```
[INICIO - Sin flow]
Usuario: "Hola"
Sistema AUTO: "¡Bienvenido! ¿En qué puedo ayudarte?"

[Usuario inicia con IA]
Usuario: "quiero 2 rite start men"
Sistema IA:
  → Crea customerRegistrationFlow (flowType: 'ai_assisted', step: 'add_products')
  → Crea orden #1234 (status: 'draft')
  → Responde: "✅ 2 RiteStart Men - RD$192.00. ¿Algo más?"

[Continúa con IA]
Usuario: "agregar 1 transfer factor plus"
Sistema IA:
  → Actualiza orden #1234 (agrega item)
  → Actualiza flow (cartItems)
  → Responde: "✅ Agregado. Total: 3 productos - RD$272.00"

[Usuario confirma → Transición]
Usuario: "confirmar mi orden"
Sistema IA:
  → Detecta confirmación
  → Cambia flow (flowType: 'automatic', step: 'confirm_order')
  → Pasa control a automático

[Sistema automático toma el control]
Sistema AUTO:
  → Lee orden #1234 y flow
  → Envía mensaje de confirmación estructurado
  → Solicita dirección (si falta)
  → Solicita pago (si falta)
  → Finaliza orden

Usuario: "confirmar"
Sistema AUTO:
  → Cambia orden status: 'pending'
  → Marca flow isCompleted: true
  → Notifica a admin
  → Responde: "✅ ¡Orden confirmada! #1234"
```

## Implementación por Fases

### Fase 1: Estructura Base ✅
- [x] Agregar `flowType` a schema (ya existe)
- [x] Crear función de detección de modo

### Fase 2: Integración IA
- [ ] Modificar IA para crear registration flow
- [ ] Modificar IA para crear/actualizar órdenes
- [ ] Implementar transición IA → Automático

### Fase 3: Integración Automático
- [ ] Modificar automático para reconocer flows AI
- [ ] Implementar lectura de datos de IA en automático
- [ ] Testing de transición

### Fase 4: Testing y Refinamiento
- [ ] Tests de flujo completo
- [ ] Tests de edge cases
- [ ] Optimización de UX

## Notas Técnicas

### Seguridad
- Validar que `orderId` en flow corresponde al `customerId`
- Verificar permisos antes de transiciones
- Limpiar flows expirados

### Performance
- Índices en `customerRegistrationFlows.flowType`
- Cache de órdenes activas
- Limpieza automática de flows antiguos

### Monitoring
- Log cada transición de modo
- Métricas: % órdenes por modo
- Alertas si transitions fallan
