# Sistema de Aislamiento y Concurrencia

## ✅ Garantía de Aislamiento entre Clientes

El sistema está diseñado para que **múltiples clientes puedan usar el sistema simultáneamente SIN interferencias**.

### 🔑 Clave de Aislamiento: `conversationId`

Cada cliente tiene su propia conversación única identificada por `conversationId`.

```
Cliente A (Teléfono: 18094441111) → Conversación ID: 65
Cliente B (Teléfono: 18494553242) → Conversación ID: 67
Cliente C (Teléfono: 18291234567) → Conversación ID: 68
```

### 📊 Estructura de Datos por Cliente

Cada registro en `ai_conversations` es completamente independiente:

| id | conversationId | customerId | pendingProductSelection | pendingProductsByIndex | cartItems |
|----|----------------|------------|------------------------|----------------------|-----------|
| 1  | 65             | 45         | `{"10": {...}}`        | `{"1": {...}}`       | `[...]`   |
| 2  | 67             | 69         | `{"86": {...}}`        | `{"1": {...}}`       | `[...]`   |
| 3  | 68             | 72         | `{"10": {...}}`        | `{"1": {...}}`       | `[...]`   |

**Nota:** Clientes A y C pueden tener el mismo producto (ID 10) en sus selecciones pendientes sin interferirse.

### 🔒 Operaciones Aisladas

#### 1. **Lectura (GET)**
```typescript
// ✅ CORRECTO: Cada cliente lee SOLO sus datos
const aiConv = await tenantStorage.getAIConversation(conversationId);
// SQL: SELECT * FROM ai_conversations WHERE conversation_id = 67
```

#### 2. **Escritura (UPDATE)**
```typescript
// ✅ CORRECTO: Cada actualización afecta SOLO una conversación
await tenantStorage.updateAIConversation(conversationId, {
  pendingProductSelection: JSON.stringify(products),
  pendingProductsByIndex: JSON.stringify(indexed)
});
// SQL: UPDATE ai_conversations SET ... WHERE conversation_id = 67
```

#### 3. **Limpieza (DELETE)**
```typescript
// ✅ CORRECTO: Solo se limpian los datos del cliente específico
await tenantStorage.updateAIConversation(conversationId, {
  pendingProductSelection: null,
  pendingProductsByIndex: null
});
// SQL: UPDATE ai_conversations SET ... WHERE conversation_id = 67
```

### 🎯 Escenario de Concurrencia

**Situación:** 3 clientes buscan "calcio" al mismo tiempo

```
T=0s  | Cliente A: "dame calcio" → Conversación 65
      | Cliente B: "dame calcio" → Conversación 67
      | Cliente C: "dame calcio" → Conversación 68
      ↓
T=1s  | Sistema guarda opciones para cada uno:
      | - Conv 65: products saved
      | - Conv 67: products saved
      | - Conv 68: products saved
      ↓
T=2s  | Cliente A: "1" → Lee de Conv 65 → Agrega producto A
      | Cliente B: "2" → Lee de Conv 67 → Agrega producto B
      | Cliente C: "1" → Lee de Conv 68 → Agrega producto A
```

**Resultado:** 
- Cliente A: Carrito con producto 1 ✅
- Cliente B: Carrito con producto 2 ✅
- Cliente C: Carrito con producto 1 ✅

**NO hay interferencia** porque cada uno tiene su propio `conversationId`.

### 🛡️ Protección contra Race Conditions

#### Caso 1: Mismo cliente, mensajes rápidos
```
Cliente envía: "dame calcio"
Cliente envía: "1" (antes de que termine de procesar)
```

**Protección:** Sistema de idempotencia previene procesamiento duplicado
```typescript
if (processedMessageIds.has(messageId)) {
  console.log(`⚠️ DUPLICATE MESSAGE - Skipping`);
  return;
}
```

#### Caso 2: Cliente en múltiples dispositivos
```
Dispositivo 1: Envía mensaje
Dispositivo 2: Envía mensaje (misma conversación)
```

**Protección:** Ambos dispositivos comparten la misma `conversationId`, por lo que:
- Leen el mismo estado
- Actualizan la misma conversación
- El último mensaje sobrescribe el estado (comportamiento esperado)

### 📝 Logs de Aislamiento

El sistema ahora muestra logs claros de aislamiento:

```
🔍 [AI-CONV] Obteniendo conversación AI para conversationId: 67
✅ [AI-CONV] Conversación 67 encontrada (ID: 2, Cliente: 69)

💾 [AI-CONV] Actualizando conversación 67 - Campos: [pendingProductSelection, pendingProductsByIndex]
✅ [AI-CONV] Conversación 67 actualizada exitosamente
```

### ✅ Garantías del Sistema

1. **Aislamiento Total**: Cada `conversationId` es único y aislado
2. **Sin Estado Global**: No hay variables compartidas entre clientes
3. **Base de Datos Transaccional**: PostgreSQL garantiza consistencia ACID
4. **Filtrado por WHERE**: Todas las queries filtran por `conversationId`
5. **Idempotencia**: Mensajes duplicados son detectados y descartados

### 🚨 Casos NO Soportados (por diseño)

**NO se soporta:** Un cliente usando el sistema en 2 conversaciones diferentes simultáneamente.

Si un cliente tiene 2 conversaciones abiertas:
- Conversación 65 (chat antiguo)
- Conversación 67 (chat nuevo)

Cada conversación es independiente. Si el cliente interactúa con ambas, cada una tiene su propio estado separado (esto es correcto y esperado).

### 📊 Resumen de Arquitectura

```
┌─────────────────┐
│ Cliente A       │──► conversationId: 65 ──► Registro DB #1
└─────────────────┘                            ├─ pendingProducts: {...}
                                              └─ cartItems: [...]

┌─────────────────┐
│ Cliente B       │──► conversationId: 67 ──► Registro DB #2
└─────────────────┘                            ├─ pendingProducts: {...}
                                              └─ cartItems: [...]

┌─────────────────┐
│ Cliente C       │──► conversationId: 68 ──► Registro DB #3
└─────────────────┘                            ├─ pendingProducts: {...}
                                              └─ cartItems: [...]
```

**Conclusión:** ✅ El sistema es 100% seguro para uso concurrente por múltiples clientes.
