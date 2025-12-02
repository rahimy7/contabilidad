# Componentes UI - Sistema de Conversión de Unidades

## 📋 Resumen de Implementación Frontend

Este documento describe los componentes UI implementados para el sistema de conversión de unidades.

---

## ✅ Componentes Implementados

### 1. **Gestión de Unidades de Medida** ✅

📁 [client/src/pages/measurement-units.tsx](client/src/pages/measurement-units.tsx)

**Funcionalidades:**
- ✅ Lista completa de unidades de medida con tabla interactiva
- ✅ Búsqueda en tiempo real (nombre, símbolo, abreviación)
- ✅ Filtros por tipo (weight, volume, unit, length) y estado (activo/inactivo)
- ✅ Dialog para crear nueva unidad con validación
- ✅ Dialog para editar unidad existente
- ✅ Dialog de confirmación para eliminar (soft delete)
- ✅ Iconos visuales por tipo de unidad:
  - Scale (⚖️) - Peso
  - Droplet (💧) - Volumen
  - Box (📦) - Unidades contables
  - Ruler (📏) - Longitud
- ✅ Badges para símbolos y estados
- ✅ Integración completa con React Query
- ✅ Toast notifications para feedback

**Navegación:**
- Ruta: `/admin/measurement-units`
- Permiso requerido: `manage_products`
- Ubicación en menú: Sidebar, después de "Gestión de Productos"
- Icono: Scale (⚖️)

---

### 2. **Configuración de Conversiones por Producto** ✅

📁 [client/src/components/product-unit-conversions.tsx](client/src/components/product-unit-conversions.tsx)

**Funcionalidades:**
- ✅ Switch para activar/desactivar conversión de unidades
- ✅ Selector de unidad base del producto
- ✅ Información de stock actual en unidad base
- ✅ **Configuración Rápida:** Setup automático de conversiones comunes
- ✅ Tabla con todas las conversiones configuradas
- ✅ Visualización clara: Unidad Origen → Factor → Unidad Destino
- ✅ Dialog para crear conversión manual
- ✅ Opción de conversión bidireccional automática
- ✅ Dialog para editar conversión existente
- ✅ Dialog de confirmación para eliminar conversión
- ✅ Dialog de configuración rápida con selección múltiple
- ✅ Estadísticas: conversiones configuradas y unidades disponibles
- ✅ Validación completa con Zod schemas

**Características Destacadas:**

#### Configuración Rápida (Quick Setup)
- Permite seleccionar múltiples unidades de un solo paso
- Crea conversiones bidireccionales automáticamente
- Usa factores de conversión predefinidos comunes
- Solo muestra unidades del mismo tipo que la unidad base
- Excluye unidades ya configuradas

#### Gestión de Conversiones
- Creación manual con factor personalizado
- Opción bidireccional: crea A→B y B→A automáticamente
- Edición de factor y notas
- Eliminación con confirmación
- Visualización con badges y formato mono para factores

**Integración:**
- Se muestra en la página de edición de productos
- Ubicación: Después de "Información del Sistema"
- Solo visible en modo edición (cuando el producto ya existe)
- Se actualiza en tiempo real con React Query

---

## 🎨 Componentes UI Utilizados

### shadcn/ui Components:
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`
- `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`
- `Button` (variants: default, outline, destructive, secondary)
- `Input` (con validación)
- `Label`
- `Textarea`
- `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`
- `Switch` (para toggle)
- `Badge` (variants: default, outline, secondary)
- `useToast` hook

### Iconos de Lucide:
- `Scale` - Peso/Balance
- `Droplet` - Volumen
- `Box` - Unidades
- `Ruler` - Longitud
- `Plus` - Agregar
- `Edit` - Editar
- `Trash2` - Eliminar
- `Search` - Buscar
- `ArrowRight` - Flecha conversión
- `Zap` - Configuración rápida
- `AlertCircle` - Alerta
- `CheckCircle` - Confirmación

---

## 📊 Flujo de Usuario Completo

### Configurar Producto con Conversión de Unidades

#### Paso 1: Crear/Editar Producto
1. Ir a "Gestión de Productos"
2. Seleccionar producto existente (o crear uno nuevo)
3. Click en "Editar"

#### Paso 2: Activar Conversión
1. Scroll hasta la sección "Conversión de Unidades"
2. Activar el switch "Conversión de Unidades"
3. Seleccionar la unidad base del producto (ej: kg, L, unidad)

#### Paso 3: Configurar Conversiones

**Opción A: Configuración Rápida (Recomendado)**
1. Click en "Configurar Automáticamente" en el panel amarillo
2. Seleccionar las unidades deseadas (ej: g, lb, oz)
3. Click en "Configurar Conversiones"
4. ✅ Sistema crea automáticamente conversiones bidireccionales

**Opción B: Configuración Manual**
1. Click en "Nueva Conversión"
2. Seleccionar unidad origen
3. Seleccionar unidad destino
4. Ingresar factor de conversión
5. Marcar "Crear conversión bidireccional" (opcional)
6. Click en "Crear Conversión"

#### Paso 4: Verificar y Gestionar
1. Ver tabla con todas las conversiones
2. Editar factores si es necesario
3. Eliminar conversiones no deseadas

---

## 🔍 Gestión de Unidades de Medida

### Acceder al Catálogo de Unidades

1. Desde el sidebar, click en "Unidades de Medida"
2. Ver lista completa de unidades disponibles

### Crear Nueva Unidad

1. Click en "Nueva Unidad"
2. Completar formulario:
   - Nombre (ej: "Mililitro")
   - Símbolo (ej: "ml")
   - Tipo: weight, volume, unit, length
   - Abreviación (opcional)
   - Orden de visualización
3. Click en "Crear Unidad"

### Buscar y Filtrar

1. Usar barra de búsqueda para buscar por nombre/símbolo
2. Filtrar por tipo de unidad
3. Filtrar por estado (activas/inactivas)

### Editar/Eliminar Unidades

1. Click en botón de editar para modificar
2. Click en botón de eliminar para desactivar
3. Las unidades desactivadas no se mostrarán en selectores

---

## 📝 Validaciones Implementadas

### Measurement Units
```typescript
const measurementUnitSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  symbol: z.string().min(1, 'El símbolo es requerido'),
  type: z.enum(['weight', 'volume', 'unit', 'length']),
  abbreviation: z.string().optional(),
  sortOrder: z.number().min(0).default(0),
});
```

### Product Unit Conversions
```typescript
const conversionSchema = z.object({
  sourceUnitId: z.number().min(1, 'Selecciona la unidad origen'),
  targetUnitId: z.number().min(1, 'Selecciona la unidad destino'),
  conversionFactor: z.string().min(1, 'El factor de conversión es requerido'),
  notes: z.string().optional(),
  bidirectional: z.boolean().default(true),
});
```

---

## 🎯 Características de UX

### Feedback Visual
- ✅ Loading spinners durante operaciones
- ✅ Toast notifications para éxito/error
- ✅ Badges de estado (activo/inactivo)
- ✅ Colores semánticos (verde=éxito, rojo=error, amarillo=advertencia, azul=info)

### Confirmaciones
- ✅ Dialog de confirmación para eliminar unidades
- ✅ Dialog de confirmación para eliminar conversiones
- ✅ Validación de formularios en tiempo real

### Ayudas Contextuales
- ✅ Descripciones en dialogs
- ✅ Placeholders informativos
- ✅ Ejemplos de valores (ej: "1000" para kg→g)
- ✅ Texto de ayuda bajo campos

### Estados Vacíos
- ✅ Mensajes cuando no hay unidades
- ✅ Mensajes cuando no hay conversiones
- ✅ Sugerencias de qué hacer

---

## 🔧 Integración con Backend

### Endpoints Utilizados

#### Measurement Units
```typescript
GET    /api/measurement-units           // useQuery
GET    /api/measurement-units/active    // useQuery
GET    /api/measurement-units/:id       // useQuery
POST   /api/measurement-units           // useMutation
PUT    /api/measurement-units/:id       // useMutation
DELETE /api/measurement-units/:id       // useMutation
```

#### Product Unit Conversions
```typescript
GET    /api/products/:id/unit-conversions      // useQuery
GET    /api/products/:id/available-units       // useQuery
POST   /api/products/:id/unit-conversions      // useMutation
PUT    /api/products/:id/unit-conversions/:id  // useMutation
DELETE /api/products/:id/unit-conversions/:id  // useMutation
POST   /api/products/:id/setup-common-conversions // useMutation
```

#### Product Updates
```typescript
PUT    /api/products/:id                // Para actualizar unitConversionEnabled y baseUnitId
```

### React Query Integration
```typescript
// Invalidación automática de queries relacionadas
queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/unit-conversions`] });
queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/available-units`] });
queryClient.invalidateQueries({ queryKey: ["/api/measurement-units"] });
```

---

## 📦 Archivos Modificados/Creados

### Componentes Nuevos
- ✅ `client/src/pages/measurement-units.tsx` - Gestión de unidades
- ✅ `client/src/components/product-unit-conversions.tsx` - Conversiones de productos

### Archivos Modificados
- ✅ `client/src/App.tsx` - Agregada ruta `/admin/measurement-units`
- ✅ `client/src/components/layout/sidebar.tsx` - Agregado link de navegación
- ✅ `client/src/pages/add-product.tsx` - Integrado componente de conversiones

### Interfaces Actualizadas
```typescript
// client/src/pages/add-product.tsx
interface Product {
  // ... campos existentes
  unitConversionEnabled?: boolean;
  baseUnitId?: number;
}
```

---

## 🚀 Características Avanzadas

### Auto-configuración de Conversiones Comunes

El sistema incluye factores de conversión predefinidos para combinaciones comunes:

**Peso (weight):**
- kg ↔ g (1000)
- kg ↔ lb (2.20462)
- kg ↔ oz (35.274)
- lb ↔ oz (16)
- lb ↔ g (453.592)

**Volumen (volume):**
- L ↔ ml (1000)
- L ↔ gal (0.264172)
- gal ↔ ml (3785.41)

**Unidades (unit):**
- unidad ↔ caja (según configuración)
- caja ↔ paquete (según configuración)

**Longitud (length):**
- m ↔ cm (100)
- m ↔ mm (1000)
- cm ↔ mm (10)

### Filtrado Inteligente

- Solo muestra unidades del mismo tipo en configuración rápida
- Excluye unidades ya configuradas
- Excluye la unidad base del selector

### Conversiones Bidireccionales

Cuando se marca "bidireccional":
- Crea A → B con factor F
- Crea automáticamente B → A con factor 1/F

Ejemplo:
- kg → g: factor 1000
- g → kg: factor 0.001 (calculado automáticamente)

---

## 🎨 Paleta de Colores

### Por Tipo de Unidad
- **Weight (Peso):** Azul - `text-blue-600`, `bg-blue-50`, `border-blue-200`
- **Volume (Volumen):** Cyan - `text-cyan-600`, `bg-cyan-50`, `border-cyan-200`
- **Unit (Unidad):** Púrpura - `text-purple-600`, `bg-purple-50`, `border-purple-200`
- **Length (Longitud):** Verde - `text-green-600`, `bg-green-50`, `border-green-200`

### Por Función
- **Info:** Azul - `bg-blue-50`, `border-blue-200`, `text-blue-900`
- **Warning:** Amarillo - `bg-amber-50`, `border-amber-200`, `text-amber-900`
- **Success:** Verde - `bg-green-50`, `border-green-200`, `text-green-900`
- **Error:** Rojo - `bg-red-50`, `border-red-200`, `text-red-900`

---

## 📱 Responsividad

Todos los componentes son completamente responsive:

- ✅ Grids adaptativos (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`)
- ✅ Tablas con scroll horizontal en móviles
- ✅ Dialogs con max-height y scroll vertical
- ✅ Botones apilados en móviles, horizontales en desktop
- ✅ Texto truncado con ellipsis donde sea necesario

---

## ⚡ Performance

### Optimizaciones Implementadas
- ✅ React Query con cache automático
- ✅ useMemo para cálculos pesados (filtrado)
- ✅ Debounce implícito en búsqueda (React Query)
- ✅ Invalidación selectiva de queries
- ✅ Lazy loading de dialogs (solo se renderizan cuando están abiertos)

### Gestión de Estado
- ✅ Server state con React Query
- ✅ Local UI state con useState
- ✅ Form state con React Hook Form
- ✅ Validación con Zod (sin re-renders innecesarios)

---

## ✅ Checklist de Funcionalidad Frontend

### Measurement Units Page
- [x] Lista de unidades con tabla
- [x] Búsqueda por texto
- [x] Filtros por tipo y estado
- [x] Crear nueva unidad
- [x] Editar unidad existente
- [x] Eliminar (desactivar) unidad
- [x] Iconos por tipo de unidad
- [x] Badges de estado
- [x] Toast notifications
- [x] Loading states
- [x] Empty states
- [x] Validación de formularios
- [x] Integración con React Query

### Product Unit Conversions Component
- [x] Switch activar/desactivar conversión
- [x] Selector de unidad base
- [x] Mostrar stock en unidad base
- [x] Tabla de conversiones
- [x] Crear conversión manual
- [x] Conversión bidireccional automática
- [x] Editar conversión
- [x] Eliminar conversión
- [x] Configuración rápida (quick setup)
- [x] Selección múltiple de unidades
- [x] Estadísticas de conversiones
- [x] Validación completa
- [x] Toast notifications
- [x] Loading states
- [x] Empty states
- [x] Dialog confirmations

### Integration
- [x] Ruta agregada en App.tsx
- [x] Navegación en sidebar
- [x] Integrado en add-product.tsx
- [x] Actualización de Product interface
- [x] Invalidación de queries correcta
- [x] Permisos configurados

---

## 📚 Próximos Pasos Opcionales

### Mejoras UI (Futuro)
1. **Selector de unidad en catálogo público**
   - Dropdown en la página de producto
   - Actualización de precio según unidad
   - Mostrar equivalencia (ej: "500g = 0.5kg")

2. **Vista de órdenes con unidades**
   - Mostrar unidad usada en pedido
   - Mostrar cantidad en unidad base
   - Formato: "500 g (0.5 kg)"

3. **Dashboard de conversiones**
   - Métricas: productos con conversión habilitada
   - Unidades más usadas
   - Conversiones más comunes

4. **Import/Export de configuraciones**
   - Exportar configuración de conversiones
   - Importar desde plantilla
   - Copiar configuración entre productos

5. **Historial de cambios**
   - Log de cambios en conversiones
   - Auditoría de modificaciones
   - Revertir cambios

---

## 🆘 Troubleshooting UI

### La sección de conversiones no aparece
**Solución:** Solo aparece en modo edición. Primero guarda el producto, luego edítalo.

### No se muestran unidades para configurar
**Solución:** Verifica que:
- La unidad base esté seleccionada
- Existan unidades del mismo tipo
- No todas las unidades estén ya configuradas

### Error al crear conversión
**Solución:** Verifica que:
- El producto tenga conversión habilitada
- La unidad base esté configurada
- El factor de conversión sea positivo
- No exista ya esa conversión

### No aparece el menú de Unidades de Medida
**Solución:** Verifica que:
- Tengas permiso `manage_products`
- No seas super_admin o technician (excluidos)
- Estés autenticado correctamente

---

## 📞 Documentación Relacionada

- [UNIT_CONVERSION_SYSTEM.md](UNIT_CONVERSION_SYSTEM.md) - Documentación técnica del sistema
- [UNIT_CONVERSION_API.md](UNIT_CONVERSION_API.md) - Referencia de API REST
- [UNIT_CONVERSION_IMPLEMENTATION_SUMMARY.md](UNIT_CONVERSION_IMPLEMENTATION_SUMMARY.md) - Resumen de implementación backend

---

**Estado:** ✅ **Frontend Completo**

**Fecha de Implementación:** Diciembre 2025

**Componentes UI:** 2 principales + integraciones

**Líneas de Código:** ~1,500 líneas (componentes + integraciones)
