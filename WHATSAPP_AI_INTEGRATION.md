# 🤖 Integración de IA en WhatsApp - Sistema Inteligente de Pedidos

## 📋 Resumen

Se ha implementado un sistema de IA inteligente que procesa pedidos automáticamente a través de WhatsApp. La IA solo se activa cuando el cliente no responde con las opciones esperadas después de recibir el mensaje de bienvenida o catálogo.

## 🎯 Características Principales

### 1. **Detección Inteligente de Flujo**
- ✅ Se activa solo después de bienvenida o catálogo
- ✅ Requiere respuesta no esperada del cliente
- ✅ Verifica créditos disponibles antes de activarse
- ✅ Fallback automático a flujo manual si no hay créditos

### 2. **Gestión de Créditos**
- 💳 Sistema de créditos por tienda
- 💰 Costos configurables:
  - 1 crédito por mensaje analizado
  - 5 créditos por orden creada
  - 10 créditos por nota de voz transcrita
- 📊 Registro detallado de uso
- ⚠️ Alertas de créditos bajos
- 🔄 Recarga manual de créditos

### 3. **Capacidades de IA**
- 🔍 Búsqueda inteligente de productos (fuzzy matching, sinónimos)
- 🛒 Construcción automática de carrito
- 📝 Interpretación de intenciones del cliente
- ✏️ Edición de pedidos (agregar/quitar items)
- ❓ Respuestas a preguntas generales
- 🎯 Confirmación de pedidos

## 📁 Archivos Creados/Modificados

### Archivos Nuevos

1. **`server/whatsapp-smart-ai.ts`**
   - Lógica principal de integración IA + WhatsApp
   - Gestión de contextos de conversación
   - Procesamiento inteligente de mensajes
   - Creación de órdenes desde carrito IA

2. **`server/ai-credits-manager.ts`**
   - Gestión de créditos por tienda
   - Control de consumo de créditos
   - Gestión de conversaciones AI
   - Estadísticas de uso

3. **`server/ai-order-assistant.ts`**
   - Interpretación de pedidos con OpenAI
   - Búsqueda inteligente de productos
   - Gestión de carrito
   - Generación de mensajes para cliente

4. **`server/ai-credits-schema.ts`**
   - Definición de esquemas TypeScript
   - Interfaces para créditos y logs

5. **`server/migrate-ai-tables.ts`**
   - Script de migración para crear tablas IA
   - Inicializa créditos por tienda

### Archivos Modificados

1. **`shared/schema.ts`**
   - Agregadas tablas: `aiCredits`, `aiUsageLog`, `aiConversations`, `aiProductMatches`

2. **`server/tenant-storage.ts`**
   - Métodos: `getAIConversation`, `createAIConversation`, `updateAIConversation`, `logAIUsage`, `getAIUsageStats`

3. **`server/storage/master-storage.ts`**
   - Métodos: `getAICredits`, `updateAICredits`, `createAICredits`, `rechargeAICredits`, `getAllStores`

4. **`server/whatsapp-simple.ts`**
   - Integración de IA antes de validación de órdenes
   - Marcado de contextos (welcome/catalog)
   - Creación automática de órdenes desde IA

## 🗄️ Estructura de Base de Datos

### Tabla Maestra: `ai_credits`
Ubicación: Base de datos maestra

```sql
CREATE TABLE ai_credits (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL UNIQUE,

  total_credits INTEGER DEFAULT 0,
  used_credits INTEGER DEFAULT 0,
  available_credits INTEGER DEFAULT 0,

  is_enabled BOOLEAN DEFAULT true,
  cost_per_message INTEGER DEFAULT 1,
  cost_per_order INTEGER DEFAULT 5,
  cost_per_voice_note INTEGER DEFAULT 10,

  total_messages_processed INTEGER DEFAULT 0,
  total_orders_created INTEGER DEFAULT 0,

  last_usage TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Tablas por Tienda (Tenant)

#### 1. `ai_usage_log`
Registra cada operación de IA

```sql
CREATE TABLE ai_usage_log (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL,
  conversation_id INTEGER,
  customer_id INTEGER,

  operation_type TEXT NOT NULL, -- 'message_analysis', 'order_creation', etc.
  credits_cost INTEGER NOT NULL,

  input_text TEXT,
  output_text TEXT,
  interpretation TEXT,
  confidence DECIMAL(3,2),

  was_successful BOOLEAN DEFAULT true,
  model_used TEXT DEFAULT 'gpt-4o-mini',

  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 2. `ai_conversations`
Mantiene estado de conversaciones con IA

```sql
CREATE TABLE ai_conversations (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,

  is_active BOOLEAN DEFAULT true,
  mode TEXT DEFAULT 'assistant',

  cart_items TEXT, -- JSON con productos en carrito
  current_intent TEXT,

  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 3. `ai_product_matches`
Caché de búsquedas de productos

```sql
CREATE TABLE ai_product_matches (
  id SERIAL PRIMARY KEY,
  search_query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,

  matched_products TEXT NOT NULL, -- JSON
  confidence DECIMAL(3,2),

  times_used INTEGER DEFAULT 1,
  last_used_at TIMESTAMP DEFAULT NOW()
);
```

## 🔄 Flujo de Trabajo

### Diagrama de Flujo

```
1. Cliente envía mensaje
   ↓
2. ¿Hay flujo de registro activo?
   → Sí: Procesar flujo de registro
   → No: Continuar ↓

3. ¿Es mensaje de pedido obvio? (formato catálogo)
   → Sí: Procesar pedido tradicional
   → No: Continuar ↓

4. 🤖 ¿Debe usar IA?
   - ¿Está después de bienvenida/catálogo?
   - ¿Tiene créditos disponibles?
   - ¿No respondió opciones esperadas?
   → Sí: Procesar con IA ↓
   → No: Auto-respuestas normales

5. IA procesa mensaje:
   - Interpreta intención
   - Busca productos
   - Construye carrito
   - Genera respuesta

6. Envía respuesta al cliente
   ↓
7. ¿Cliente confirma pedido?
   → Sí: Crear orden
   → No: Continuar conversación
```

### Ejemplo de Interacción

```
👤 Cliente: "Hola"
🤖 Sistema: [Envía mensaje de bienvenida con botones]
           [Marca: contexto = después de bienvenida]

👤 Cliente: "Quiero pedir 2 pizzas grandes y una coca cola"
           [No es botón esperado → Activa IA]

🤖 IA:      [Busca productos: "pizza grande", "coca cola"]
           [Encuentra: Pizza Familiar $15, Coca Cola 2L $3]
           [Construye carrito: 2x Pizza + 1x Coca]

🤖 Sistema: "✅ Agregado al carrito:
           • Pizza Familiar x2 = $30.00
           • Coca Cola 2L x1 = $3.00

           💰 Total: $33.00
           📦 3 items

           ¿Deseas agregar algo más o confirmar tu pedido?"

👤 Cliente: "Confirmar"

🤖 Sistema: [Crea orden #123]
           "✅ ¡Orden #123 creada exitosamente!
           Un agente te contactará pronto..."
```

## 🚀 Comandos Disponibles

### 1. Ejecutar Migración
Crea las tablas de IA en todas las tiendas:

```bash
npm run ai:migrate
```

**Resultado esperado:**
```
🚀 MIGRACIÓN DE TABLAS DE IA
✅ Tabla ai_credits creada en BD maestra
✅ Retrieved 3 active stores
🏪 Procesando tienda: Tienda Moda
  ✅ ai_usage_log creada
  ✅ ai_conversations creada
  ✅ ai_product_matches creada
  💳 Créditos inicializados: 1000 créditos
✅ MIGRACIÓN COMPLETADA EXITOSAMENTE
```

### 2. Probar Servicios de IA
Prueba las funciones de IA aisladamente:

```bash
npm run ai:test
```

## 🔐 Variables de Entorno Requeridas

Asegúrate de tener en tu `.env`:

```env
# OpenAI API Key (requerido para IA)
OPENAI_API_KEY=sk-...

# Base de datos maestra
DATABASE_URL=postgres://...

# Base de datos de tiendas (se obtienen de virtual_stores)
# Se cargan dinámicamente
```

## 📊 Gestión de Créditos

### Consultar Créditos Disponibles

```typescript
import { AICreditsManager } from './ai-credits-manager';

// Verificar si tiene créditos
const hasCredits = await AICreditsManager.hasCredits(storeId, 'message');

// Obtener información completa
const masterStorage = await getMasterStorage();
const credits = await masterStorage.getAICredits(storeId);
console.log(`Disponibles: ${credits.availableCredits} créditos`);
```

### Recargar Créditos

```typescript
import { AICreditsManager } from './ai-credits-manager';

// Recargar 1000 créditos
await AICreditsManager.rechargeCredits(storeId, 1000);
```

### Ver Estadísticas de Uso

```typescript
import { AICreditsManager } from './ai-credits-manager';

// Obtener stats de últimos 30 días
const stats = await AICreditsManager.getUsageStats(storeId, 30);
console.log(stats);
```

## 🐛 Debugging

### Logs de IA
Todos los logs de IA incluyen el prefijo `[AI-SMART]`:

```
🤖 [AI-SMART] Intentando procesar con IA...
📋 [AI-SMART] Contexto: { isAfterWelcome: true, isAfterCatalog: false }
✅ [AI-SMART] Marcado: +18091234567 recibió bienvenida
📦 [AI-SMART] 45 productos activos disponibles
🧠 [AI-SMART] Interpretación IA: { intent: 'add_to_cart', itemsCount: 2, confidence: 0.95 }
```

### Verificar Contexto de Conversación

```typescript
import { getContext } from './whatsapp-smart-ai';

const context = getContext(phoneNumber);
console.log('Contexto actual:', context);
```

### Ver Logs de Uso en BD

```sql
-- Ver últimos 10 usos de IA
SELECT
  operation_type,
  credits_cost,
  input_text,
  confidence,
  created_at
FROM ai_usage_log
WHERE store_id = 6
ORDER BY created_at DESC
LIMIT 10;
```

## ⚠️ Limitaciones Conocidas

1. **Contextos en Memoria**: Los contextos (isAfterWelcome, isAfterCatalog) se almacenan en memoria
   - Se pierden al reiniciar el servidor
   - Solución futura: Mover a Redis o base de datos

2. **Limpieza de Contextos**: Se limpian cada 30 minutos
   - Puede causar falsos positivos si el cliente tarda mucho
   - Solución: Implementar TTL por contexto

3. **Caché de Productos**: No implementado aún
   - Cada búsqueda consulta OpenAI
   - Solución futura: Usar tabla `ai_product_matches`

4. **Sin Transcripción de Voz**: Funcionalidad planificada pero no implementada
   - Usar OpenAI Whisper API
   - Ver `server/ai-service.ts` para referencia

## 🔮 Próximas Mejoras

- [ ] Implementar caché de búsquedas de productos
- [ ] Agregar soporte para notas de voz (Whisper API)
- [ ] Dashboard de administración de créditos
- [ ] Recarga automática de créditos
- [ ] Contextos persistentes en Redis
- [ ] Análisis de sentimiento del cliente
- [ ] Sugerencias proactivas basadas en historial

## 📞 Soporte

Para problemas o preguntas:
1. Revisar los logs con prefijo `[AI-SMART]`
2. Verificar créditos disponibles
3. Consultar `ai_usage_log` para ver errores
4. Verificar que `OPENAI_API_KEY` esté configurado

---

**Última actualización:** 2025-01-11
**Versión:** 1.0.0
**Estado:** ✅ Integrado y Funcional
