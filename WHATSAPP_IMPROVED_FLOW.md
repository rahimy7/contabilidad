# WhatsApp Order Flow - Flujo Mejorado de Clientes Registrados

## Cambio Principal

**ANTES:** Todos los clientes recibían el mensaje "Pedido recibido" sin importar su estado de registro.

**AHORA:**
- Clientes **NO registrados** → Reciben "Pedido recibido" + aguardan para iniciar registro
- Clientes **REGISTRADOS** → Van directo a confirmación (NO reciben "Pedido recibido")

---

## Flujos Detallados

### FLUJO 1: Cliente NUEVO (No Registrado)

```
1. Cliente envía pedido desde catálogo web
   ↓
2. Backend crea orden y cliente temporal (con nombre = teléfono)
   ↓
3. Verifica: ¿Cliente tiene nombre real AND dirección?
   → NO (isCustomerFullyRegistered = false)
   ↓
4. Envía mensaje "✅ PEDIDO RECIBIDO" con resumen
   ├─ Número de orden
   ├─ Productos pedidos
   ├─ Total
   └─ "Para procesar tu pedido necesitamos algunos datos. ¿Comenzamos?"
   ↓
5. Crea flow con currentStep = 'awaiting_start'
   ↓
6. Cliente responde "comenzar" o similar
   ↓
7. Inicia collect_name → collect_contact → collect_address → etc.
   ↓
8. Después de recolectar todos los datos → CONFIRMACIÓN
   ↓
9. Cliente confirma o modifica campos
```

**Logs del servidor:**
```
🔍 CUSTOMER REGISTRATION CHECK - Fully Registered: false
   Name: +1809123456, Has Address: !!undefined
✅ CUSTOMER NOT REGISTERED - Sending "Order received" message
✅ REGISTRATION FLOW PREPARED - Waiting for user to start data collection
```

---

### FLUJO 2: Cliente REGISTRADO (Ya tiene nombre y dirección)

```
1. Cliente envía pedido desde catálogo web
   ↓
2. Backend obtiene cliente existente
   ├─ Tiene: name = "Juan García"
   ├─ Tiene: address = "Calle Principal 123"
   ↓
3. Verifica: ¿Cliente tiene nombre real AND dirección?
   → SÍ (isCustomerFullyRegistered = true)
   ↓
4. ⏭️ SALTA el mensaje "Pedido recibido"
   ↓
5. Prepara datos recopilados automáticamente:
   {
     customerName: "Juan García",
     address: "Calle Principal 123",
     contactNumber: "+1809123456"
   }
   ↓
6. Crea flow con currentStep = 'confirm_order'
   ↓
7. Envía DIRECTAMENTE la confirmación:
   "📋 Resumen de tu pedido
    ✅ Cliente: Juan García
    ✅ Dirección: Calle Principal 123
    ✅ Teléfono: +1809123456
    [productos]
    [total]

    ¿Confirmar pedido?
    1️⃣ Confirmar
    2️⃣ Modificar
    3️⃣ Cancelar"
   ↓
8. Cliente elige:
   a) Confirmar → Crear orden
   b) Modificar → Ir a menu de campos
   c) Cancelar → Cancelar pedido
```

**Logs del servidor:**
```
🔍 CUSTOMER REGISTRATION CHECK - Fully Registered: true
   Name: Juan García, Has Address: !!true
⏭️ CUSTOMER FULLY REGISTERED - Skipping "Order received", sending confirmation instead
✅ CUSTOMER FULLY REGISTERED - Sending confirmation directly
```

---

## Flujo de Modificación (Opción 2: Modificar)

Cuando un cliente registrado (o nuevas) elige "Modificar" en la confirmación:

```
1. Cliente selecciona "2" (Modificar)
   ↓
2. currentStep = 'modify_data'
   ↓
3. Envía menú de campos:
   "✏️ ¿Qué deseas modificar?

    1️⃣ Nombre
    2️⃣ Dirección
    3️⃣ Contacto
    4️⃣ Método de pago
    5️⃣ Notas

    Escribe el número de la opción:"
   ↓
4. Cliente selecciona un número (ej: "2" para dirección)
   ↓
5. currentStep = 'edit_address'
   ↓
6. Envía prompt específico:
   "📍 Por favor ingresa tu dirección completa:"
   ↓
7. Cliente responde con nueva dirección
   ↓
8. Backend valida (5-200 caracteres)
   ├─ ✅ Válido → Actualiza en collectedData
   └─ ❌ Inválido → Pide otra vez
   ↓
9. currentStep = 'modify_data_menu'
   ↓
10. Envía menú post-edición:
    "✅ Dirección actualizado correctamente.

    ¿Qué deseas hacer?

    1️⃣ Editar otro campo
    2️⃣ Continuar a confirmación
    3️⃣ Cancelar pedido

    Escribe el número de la opción:"
   ↓
11. Cliente elige:
    a) 1 → Vuelve a modify_data (menú de campos)
    b) 2 → Regenera confirmación con datos actualizados
    c) 3 → Cancela pedido
```

**En caso de opción 2 (Continuar):**

```
currentStep = 'confirm_order'
collectedData = {
  customerName: "Juan García",
  address: "Calle 5 de Octubre 456",    ← ACTUALIZADO
  contactNumber: "+1809123456"
}
Envía la confirmación con los datos nuevos
```

---

## Validaciones por Campo

### 1️⃣ Nombre (edit_name)
- ✅ Mínimo 2 caracteres
- ✅ Máximo 50 caracteres
- ✅ Solo letras, espacios, caracteres españoles (áéíóú, ñ)
- ✅ Actualiza `tenantStorage.updateCustomer()`
- ❌ Inválido → Pide nuevamente

### 2️⃣ Dirección (edit_address)
- ✅ Mínimo 5 caracteres
- ✅ Máximo 200 caracteres
- ✅ Actualiza `tenantStorage.updateCustomer()`
- ❌ Inválido → Pide nuevamente

### 3️⃣ Contacto (edit_contact)
- ✅ 7-15 dígitos internacionales
- ✅ Acepta múltiples formatos:
  - `+1 809 123 4567`
  - `8091234567`
  - `809-123-4567`
- ✅ Limpia espacios, guiones, paréntesis
- ❌ Inválido → Pide nuevamente con ejemplos

### 4️⃣ Método de Pago (edit_payment)
- ✅ Selección numérica (1-4)
  - 1 = Efectivo (Contra Entrega)
  - 2 = Tarjeta de Crédito/Débito
  - 3 = Transferencia Bancaria
  - 4 = Financiamiento
- ❌ Inválido → Pide nuevamente

### 5️⃣ Notas (edit_notes)
- ✅ Texto libre
- ✅ Detecta "sin notas" → Convierte a "Sin notas adicionales"
- ✅ Siempre válido

---

## Actualización de Base de Datos

### Cliente existente que edita

**ANTES:**
```
customers:
  id: 5
  name: "Juan García"
  phone: "+1809123456"
  address: "Calle Principal 123"
```

**DESPUÉS de editar dirección:**
```
customers:
  id: 5
  name: "Juan García"        ← Sin cambio
  phone: "+1809123456"       ← Sin cambio
  address: "Calle 5 de Octubre 456"  ← ACTUALIZADO
```

### Cliente nuevo que completa datos

**ANTES:**
```
customers:
  id: 6
  name: "+1809777888"        ← Temporal (es el teléfono)
  phone: "+1809777888"
  address: NULL
```

**DESPUÉS de recolectar datos:**
```
customers:
  id: 6
  name: "María López"        ← ACTUALIZADO
  phone: "+1809777888"
  address: "Avenida Central 789"  ← ACTUALIZADO
```

---

## Comparativa de Flujos

| Punto | Cliente Nuevo | Cliente Registrado |
|-------|---------------|--------------------|
| Paso 1 | Recibe "Pedido recibido" | NO recibe (va directo a confirmación) |
| Paso 2 | Aguarda a que presione "comenzar" | Recibe confirmación inmediata |
| Paso 3 | Recopila: nombre → contacto → dirección → pago → notas | Usa datos existentes |
| Paso 4 | Envía confirmación | La confirmación ya fue enviada |
| Modificar | Puede editar campos | Puede editar campos (mismo menú) |
| Velocidad | Lento (múltiples pasos) | Rápido (solo confirmación) |

---

## Código Clave

### 1. Verificación de cliente registrado

```typescript
const isCustomerFullyRegistered = customer.name &&
                                   customer.name !== phoneNumber && // No es temporal
                                   customer.address;

if (isCustomerFullyRegistered) {
  // Cliente registrado → confirmación directa
  const registrationFlow = await tenantStorage.getRegistrationFlowByPhoneNumber(phoneNumber);
  await generateAndSendOrderConfirmation(customer, registrationFlow, initialCollectedData, storeId, tenantStorage);
} else {
  // Cliente nuevo → aguardar inicio de recopilación
  console.log(`✅ REGISTRATION FLOW PREPARED - Waiting for user to start data collection`);
}
```

### 2. Menú de modificación

```typescript
case 'modify_data':
  // Usuario selecciona qué campo editar (1-5)
  const selectedFieldNum = messageText.trim();

  switch (selectedFieldNum) {
    case '1': fieldToModify = 'edit_name'; break;
    case '2': fieldToModify = 'edit_address'; break;
    case '3': fieldToModify = 'edit_contact'; break;
    case '4': fieldToModify = 'edit_payment'; break;
    case '5': fieldToModify = 'edit_notes'; break;
  }
```

### 3. Actualizar tras edición

```typescript
case 'modify_data_menu':
  const menuChoice = messageText.trim();

  if (menuChoice === '2') {
    // Continuar a confirmación con datos actualizados
    await tenantStorage.updateRegistrationFlowByPhone(customer.phone, {
      currentStep: 'confirm_order',
      collectedData: JSON.stringify(collectedData),
      updatedAt: new Date()
    });

    // Regenerar confirmación con datos nuevos
    await generateAndSendOrderConfirmation(
      customer,
      registrationFlow,
      collectedData,  // ← Datos actualizados
      storeId,
      tenantStorage
    );
  }
```

---

## Beneficios del Nuevo Flujo

### Para clientes registrados:
- ✅ **Más rápido:** Confirmación inmediata (sin "Pedido recibido")
- ✅ **Menos mensajes:** Se omite un mensaje innecesario
- ✅ **Experiencia directa:** Van directo a decisión (confirmar/modificar/cancelar)
- ✅ **Datos pre-llenados:** No necesitan escribir información ya conocida

### Para clientes nuevos:
- ✅ **Claro:** Entienden que deben proporcionar información
- ✅ **Guiado:** Pasos ordenados (nombre → contacto → dirección → etc.)
- ✅ **Flexible:** Pueden editar cualquier campo en cualquier momento

### Para el negocio:
- ✅ **Menos abandono:** Clientes registrados avanzan más rápido
- ✅ **Datos actualizados:** Ediciones en campos se guardan en BD
- ✅ **Mejor UX:** Flujo diferenciado según estado del cliente
- ✅ **Trackeable:** Logs claros de qué sucede en cada paso

---

## Estados del Registration Flow

### Cliente Nuevo:
```
awaiting_start → collect_name → collect_contact →
collect_address → collect_payment → collect_notes →
confirm_order → [modify_data → edit_* → modify_data_menu]* → completed
```

### Cliente Registrado:
```
confirm_order → [modify_data → edit_* → modify_data_menu]* → completed
```

### Edición de campo (en ambos):
```
modify_data_menu → modify_data → edit_address → modify_data_menu → confirm_order
```

---

## Casos de Uso

### Caso 1: Cliente nuevo, sin ediciones
```
Pedido → "Pedido recibido" → Comienza registro → 5 pasos → Confirmación → Completa
```

### Caso 2: Cliente registrado, confirma directo
```
Pedido → Confirmación (datos pre-llenados) → Confirma → Completa
```

### Caso 3: Cliente registrado, quiere cambiar dirección
```
Pedido → Confirmación → "Modificar" → Menu campos → "2 (Dirección)" →
Escribe nueva → Menu post-edición → "2 (Continuar)" → Confirmación actualizada → Confirma → Completa
```

### Caso 4: Cliente nuevo, quiere cambiar antes de confirmar
```
Pedido → "Pedido recibido" → Comienza → Recopila 5 pasos → Confirmación →
"Modificar" → Menu campos → Edita lo que quiera → Vuelve a confirmación → Confirma → Completa
```

---

## Implementación Técnica

**Archivo:** `server/whatsapp-simple.ts`

**Función:** `processWebCatalogOrderSimple()` (línea ~2675)

**Cambios:**
1. Verificación de `isCustomerFullyRegistered` (línea 2969)
2. Lógica diferenciada según estado (línea 3026-3042)
3. NO envía "Pedido recibido" si cliente está registrado
4. ENVÍA confirmación directa si cliente está registrado

**Logs agregados:**
- `🔍 CUSTOMER REGISTRATION CHECK`
- `⏭️ CUSTOMER FULLY REGISTERED - Skipping...`
- `✅ CUSTOMER FULLY REGISTERED - Sending confirmation directly`

---

## Testing Recommendations

### Test 1: Cliente nuevo, flujo completo
1. Nuevo número de teléfono
2. Debe recibir "Pedido recibido"
3. Comienza registro
4. Recopila 5 campos
5. Recibe confirmación
6. Confirma

### Test 2: Cliente registrado, confirmación directa
1. Número ya en BD con nombre y dirección
2. NO debe recibir "Pedido recibido"
3. Debe recibir confirmación inmediatamente
4. Datos pre-llenados correctamente
5. Confirma

### Test 3: Cliente registrado, modifica dirección
1. Número ya en BD
2. Confirmación directa
3. Selecciona "Modificar" → "2 (Dirección)"
4. Escribe nueva dirección
5. Vuelve a menú post-edición
6. Selecciona "2 (Continuar)"
7. Confirmación muestra dirección ACTUALIZADA
8. Confirma

### Test 4: Cliente registrado, modifica múltiples campos
1. Mismo que Test 3
2. Pero desde "Continuar" → "Modificar" → Edita nombre
3. Menú post-edición → "1 (Editar otro)" → Edita contacto
4. Menú post-edición → "2 (Continuar)"
5. Confirmación muestra TODOS los cambios
6. Confirma
