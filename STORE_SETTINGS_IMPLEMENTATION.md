# 🏪 Sistema de Configuración de Tienda - Documentación Completa

## 📋 Resumen General

Se ha implementado un sistema completo de configuración de tienda que permite administrar todos los detalles necesarios para facturación, incluyendo logo, información de contacto, pie de factura personalizado y configuración de impuestos.

## 🎯 Características Implementadas

### 1. **Base de Datos (Schema)**
- ✅ Tabla `storeSettings` actualizada con nuevos campos
- ✅ Campos de factura (logo, pie de factura, número secuencial)
- ✅ Información de contacto (teléfono, dirección, email)
- ✅ Configuración de impuestos y moneda
- ✅ Almacenamiento de rutas de Supabase para logo

### 2. **Backend (Endpoints API)**
- ✅ `GET /api/store-settings` - Obtener configuración de la tienda
- ✅ `PUT /api/store-settings` - Actualizar configuración
- ✅ `POST /api/store-settings/upload-logo` - Subir logo a Supabase
- ✅ `DELETE /api/store-settings/logo` - Eliminar logo

### 3. **Frontend (Interfaz de Usuario)**
- ✅ Página de configuración de tienda (`store-settings.tsx`)
- ✅ Carga de logo desde Supabase
- ✅ Formulario para datos de tienda
- ✅ Configuración de impuestos y moneda
- ✅ Vista previa de logo

### 4. **Integración con Facturas**
- ✅ Logo en encabezado de factura
- ✅ Datos de tienda dinámicos en factura
- ✅ Pie de factura personalizado
- ✅ Cálculo de impuestos configurable
- ✅ Información de contacto en factura

## 📁 Archivos Creados/Modificados

### **Esquema y Base de Datos**
| Archivo | Tipo | Cambios |
|---------|------|---------|
| `shared/schema.ts` | Modificado | Actualización tabla `storeSettings` con nuevos campos |
| `migrations/add-store-invoice-settings.sql` | ✨ Nuevo | Migración para agregar campos |

### **Backend (Servidor)**
| Archivo | Tipo | Descripción |
|---------|------|-------------|
| `server/store-settings.routes.ts` | ✨ Nuevo | Endpoints para configuración de tienda |
| `server/supabase-client.ts` | ✨ Nuevo | Cliente Supabase para uploads |
| `server/index.ts` | Modificado | Registro de rutas store-settings |

### **Frontend (Cliente)**
| Archivo | Tipo | Descripción |
|---------|------|-------------|
| `client/src/pages/store-settings.tsx` | ✨ Nuevo | Página de configuración de tienda |
| `client/src/pages/pos-screen.tsx` | Modificado | Integración con store-settings |
| `client/src/components/invoice-modal.tsx` | Modificado | Soporte para logo y datos dinámicos |

## 🔌 Endpoints API

### **GET /api/store-settings**
Obtiene la configuración actual de la tienda

**Headers:**
```
Authorization: Bearer {token}
```

**Response:**
```json
{
  "id": 1,
  "storeId": 1,
  "storeName": "Mi Tienda",
  "storeAddress": "Calle Principal 123",
  "storePhone": "+1-234-567-8900",
  "storeEmail": "info@mitienda.com",
  "storeWhatsAppNumber": "+1-234-567-8900",
  "logoUrl": "https://...",
  "logoStoragePath": "store-1/logo/...",
  "invoiceFooter": "Gracias por su compra...",
  "invoiceNumber": 1,
  "currency": "DOP",
  "taxPercentage": 18.00,
  "businessHours": "09:00-18:00"
}
```

### **PUT /api/store-settings**
Actualiza la configuración de la tienda

**Request Body:**
```json
{
  "storeName": "Nueva Tienda",
  "storeAddress": "Nueva Dirección",
  "storePhone": "+1-234-567-8900",
  "storeEmail": "nuevo@email.com",
  "invoiceFooter": "Nuevo pie de factura",
  "currency": "DOP",
  "taxPercentage": 18
}
```

### **POST /api/store-settings/upload-logo**
Carga logo a Supabase

**Request Body:**
```json
{
  "file": "base64_encoded_image",
  "filename": "logo.png"
}
```

**Response:**
```json
{
  "success": true,
  "logoUrl": "https://...",
  "storagePath": "store-1/logo/logo.png"
}
```

### **DELETE /api/store-settings/logo**
Elimina el logo

## 🧾 Integración con Facturas

### **Datos Pasados al Modal de Factura**

```typescript
{
  // Información de la tienda
  storeName: storeSettings?.storeName,
  storeAddress: storeSettings?.storeAddress,
  storePhone: storeSettings?.storePhone,
  storeEmail: storeSettings?.storeEmail,
  logoUrl: storeSettings?.logoUrl,
  invoiceFooter: storeSettings?.invoiceFooter,

  // Cálculos
  subtotal: calculateSubtotal(),
  tax: calculateTax(), // Usa taxPercentage de storeSettings
  total: calculateTotal(),

  // Datos de venta
  items: [...],
  orderNumber: "...",
  paymentMethod: "cash|card|transfer"
}
```

### **Factura Generada**
La factura ahora incluye:
- 🖼️ Logo de la tienda (si existe)
- 🏢 Nombre, dirección, teléfono, email de tienda
- 🧾 Pie de factura personalizado
- 💰 Impuestos calculados dinámicamente
- 📋 Toda la información de venta

## 📊 Campos de Store Settings

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `storeName` | text | Nombre de la tienda |
| `storeAddress` | text | Dirección física |
| `storePhone` | text | Teléfono de contacto |
| `storeEmail` | text | Correo electrónico |
| `storeWhatsAppNumber` | text | Número WhatsApp |
| `logoUrl` | text | URL pública del logo |
| `logoStoragePath` | text | Ruta en Supabase storage |
| `invoiceFooter` | text | Pie de factura personalizado |
| `invoiceNumber` | integer | Número secuencial de facturas |
| `currency` | text | Moneda (DOP, USD, EUR) |
| `taxPercentage` | decimal | % de impuesto/ITBIS |
| `businessHours` | text | Horario de negocio |

## 🖼️ Upload de Logo

### **Características**
- ✅ Soporta múltiples formatos (PNG, JPG, WebP)
- ✅ Límite de 5MB
- ✅ Almacenamiento en Supabase (`store-files` bucket)
- ✅ URL pública para factura
- ✅ Eliminación de logo anterior

### **Proceso**
1. Usuario selecciona archivo
2. Se valida tamaño y formato
3. Se convierte a base64
4. Se sube a Supabase Storage
5. Se obtiene URL pública
6. Se guarda en database
7. Se muestra en factura

## 📄 Ejemplo de Factura Generada

```
┌─────────────────────────────────────────┐
│         [LOGO_AQUI]                     │
│           FACTURA                       │
│        Mi Tienda Premium                │
│   Calle Principal 123, Ciudad           │
│   Tel: +1-234-567-8900                  │
│   Email: info@mitienda.com              │
└─────────────────────────────────────────┘

Número: POS-001
Fecha: 16/11/2024
Hora: 14:30
Método: Efectivo

┌──────────────────────────────────────────┐
│ Producto        │ Qty │ Unitario │ Total │
├──────────────────────────────────────────┤
│ Producto 1      │  2  │ 100.00   │ 200.00│
│ Producto 2      │  1  │  50.00   │  50.00│
└──────────────────────────────────────────┘

Subtotal:        RD$250.00
Impuesto (18%):  RD$45.00
TOTAL:           RD$295.00

Monto Recibido:  RD$300.00
Cambio:          RD$5.00

🎁 Puntos Acumulados: 25.00 LP

───────────────────────────────────────────
Gracias por su compra
Términos y condiciones aplicables
───────────────────────────────────────────
```

## 🔒 Seguridad

- ✅ Autenticación requerida (JWT token)
- ✅ Validación de tamaño de archivo (5MB máximo)
- ✅ Validación de tipo MIME
- ✅ Almacenamiento seguro en Supabase
- ✅ URLs públicas con control de acceso

## 📱 Interfaz de Usuario

### **Página de Configuración** (`/store-settings`)

#### Sección 1: Configuración de Facturas
- 🖼️ Upload/eliminación de logo
- 📝 Nombre de tienda
- 📱 Teléfono
- 📍 Dirección
- 📧 Email
- 💬 Pie de factura personalizado
- 💰 Porcentaje de impuesto
- 💱 Moneda predeterminada

#### Sección 2: Información General
- 📱 WhatsApp
- 🕐 Horario de negocio
- 📊 Número secuencial de facturas

## 🚀 Cómo Usar

### **1. Acceder a Configuración**
```
Navegador -> /store-settings
```

### **2. Subir Logo**
1. Hacer clic en "Subir Logo"
2. Seleccionar archivo (PNG, JPG, WebP)
3. Esperar confirmación

### **3. Actualizar Datos**
1. Modificar campos deseados
2. Los cambios se guardan automáticamente
3. Se refleja inmediatamente en facturas

### **4. Generar Factura**
1. Ir al POS
2. Completar venta
3. Se genera factura con datos configurados
4. Descargar o imprimir

## 📝 Migración SQL

La migración automática agrega los campos a la tabla existente sin perder datos:

```sql
ALTER TABLE store_settings
ADD COLUMN IF NOT EXISTS store_phone text,
ADD COLUMN IF NOT EXISTS logo_url text,
ADD COLUMN IF NOT EXISTS logo_storage_path text,
ADD COLUMN IF NOT EXISTS invoice_footer text,
ADD COLUMN IF NOT EXISTS invoice_number integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'DOP',
ADD COLUMN IF NOT EXISTS tax_percentage decimal(5, 2) DEFAULT 0;
```

## ✅ Checklist de Implementación

- ✅ Esquema de base de datos actualizado
- ✅ Migración creada
- ✅ Endpoints API implementados
- ✅ Cliente Supabase configurado
- ✅ Página de configuración creada
- ✅ Integración con POS completada
- ✅ Integración con factura completada
- ✅ Logo en factura funcional
- ✅ Cálculo dinámico de impuestos
- ✅ Compilación sin errores

## 🔄 Próximas Mejoras Potenciales

- [ ] Historial de cambios en configuración
- [ ] Múltiples ubicaciones/sucursales
- [ ] Plantillas de factura personalizables
- [ ] Inserción de QR en factura
- [ ] Correo automático de facturas
- [ ] Firma digital en factura
- [ ] Retención de configuración por sesión

## 📞 Soporte

El sistema está completamente integrado y funcional. La configuración se obtiene dinámicamente cada vez que se abre el POS o se genera una factura.

---

**Fecha de Implementación:** Noviembre 16, 2024
**Versión:** 1.0.0
**Estado:** ✅ Productivo
