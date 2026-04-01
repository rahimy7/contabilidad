# 🛡️ Sistema de Roles y Permisos (RBAC) - Guía de Uso

## 📋 Resumen de Implementación

Se ha implementado un sistema completo de control de acceso basado en roles (RBAC) que permite:
- Crear y gestionar roles personalizados
- Asignar permisos específicos a cada rol
- Definir el orden de las vistas en el sidebar mediante drag-and-drop
- Todo parametrizable desde la interfaz de usuario

## ✅ Estado de la Implementación

### Base de Datos
- ✅ 4 tablas creadas: `roles`, `views`, `role_permissions`, `user_roles`
- ✅ 4 índices para optimización de consultas
- ✅ 23 vistas migradas del sidebar actual
- ✅ 4 roles base creados (Administrador, Técnico, Vendedor, Repartidor)
- ✅ 6 usuarios migrados con sus roles asignados
- ✅ Integridad referencial completa

### Backend
- ✅ 8 endpoints REST implementados en `/api/roles/*`
- ✅ Protección con middleware `requireAdmin`
- ✅ Validación con Zod schemas
- ✅ Soporte para actualización masiva de permisos

### Frontend
- ✅ Componente `RolesManager` (vista principal)
- ✅ Componente `RoleModal` (crear/editar roles)
- ✅ Componente `PermissionsEditor` (drag-and-drop de permisos)
- ✅ Integración en página Empleados (3ª pestaña)
- ✅ Sidebar dinámico cargando desde API

## 🚀 Cómo Usar el Sistema

### Acceder a la Gestión de Roles

1. Iniciar sesión con usuario administrador
2. Ir a la página **Empleados**
3. Click en la pestaña **"Roles y Permisos"** (icono de escudo)

### Crear un Nuevo Rol

1. Click en botón **"Crear Rol"**
2. Llenar el formulario:
   - **Nombre interno**: identificador único (solo minúsculas y guiones bajos, ej: `supervisor`)
   - **Nombre para mostrar**: nombre visible (ej: `Supervisor de Tienda`)
   - **Descripción**: opcional, explica el propósito del rol
   - **Activo**: marcar si el rol estará disponible inmediatamente
3. Click en **"Crear"**

### Asignar Permisos a un Rol

1. Seleccionar un rol de la tabla (click en la fila)
2. En el panel derecho **"Permisos del Rol"**:
   - Ver lista de vistas disponibles
   - Marcar checkbox para asignar vista al rol
   - Las vistas seleccionadas aparecen arriba y son ordenables
3. **Ordenar vistas** (define orden en el sidebar):
   - Arrastrar con el icono de puntos (⋮⋮) 
   - El número indica la posición en el sidebar
4. **Buscar vistas**:
   - Usar barra de búsqueda para filtrar por nombre
5. Click en **"Guardar Permisos"** cuando termines

### Editar un Rol Existente

1. Seleccionar rol en la tabla
2. Click en botón **"Editar"** (icono de lápiz)
3. Modificar nombre de visualización o descripción
4. **Nota**: El nombre interno no puede modificarse una vez creado
5. Click en **"Guardar"**

### Eliminar un Rol

1. Click en botón **"Eliminar"** (icono de papelera) en la fila del rol
2. Confirmar en el diálogo
3. **Restricciones**:
   - No se puede eliminar el rol "Administrador" (es rol de sistema)
   - No se puede eliminar roles que tienen usuarios asignados

### Asignar Rol a un Usuario

1. Ir a la pestaña **"Empleados"**
2. Al crear o editar un empleado, seleccionar el rol en el campo **"Role"**
3. El rol asignado determina qué vistas verá en el sidebar

## 📊 Estructura de Datos

### Tabla `roles`
- `id`: UUID identificador único
- `name`: Nombre interno (inmutable)
- `display_name`: Nombre para mostrar
- `description`: Descripción opcional
- `is_system`: Flag que protege roles críticos (ej: admin)
- `is_active`: Estado del rol

### Tabla `views`
- `id`: UUID identificador único
- `name`: Nombre de la vista
- `route_path`: Ruta en la aplicación
- `icon_name`: Icono de Lucide React
- `section`: Sección del sidebar (admin, core, config, etc.)
- `description`: Descripción opcional

### Tabla `role_permissions`
- `id`: UUID identificador único
- `role_id`: Referencia al rol
- `view_id`: Referencia a la vista
- `sort_order`: Orden de visualización (0-N)

### Tabla `user_roles`
- `id`: UUID identificador único
- `user_id`: Referencia al usuario
- `role_id`: Referencia al rol
- `is_primary`: Flag para rol principal (multi-rol futuro)

## 🔒 Seguridad

### Rol Administrador
- Marcado como `is_system = true`
- No puede ser editado ni eliminado
- Tiene acceso total por defecto
- Usuarios con rol admin pueden gestionar otros roles

### Protección de Endpoints
Todos los endpoints de gestión requieren:
1. Autenticación válida (token JWT)
2. Rol de administrador
3. Middleware `requireAdmin` valida permisos

### Validaciones
- Nombres de roles únicos
- No se pueden eliminar roles con usuarios asignados
- Validación de formato en nombre interno (snake_case)
- Transacciones para actualización de permisos

## 🎨 Características del UI

### Vista Principal (RolesManager)
- Tabla con listado de todos los roles
- Badge mostrando cantidad de usuarios por rol
- Indicador visual para roles de sistema
- Panel split para selección y edición

### Editor de Permisos (PermissionsEditor)
- Drag-and-drop con @dnd-kit
- Búsqueda en tiempo real
- Indicadores de orden numérico
- Botón de guardar solo activo si hay cambios
- Protección visual para rol administrador

### Modal de Rol (RoleModal)
- Formulario con validación en tiempo real
- Campo de nombre interno bloqueado al editar
- Toggle para estado activo/inactivo
- Mensajes de error claros

## 📡 API Endpoints

### Gestión de Roles
- `GET /api/roles` - Listar todos los roles
- `POST /api/roles` - Crear nuevo rol
- `PUT /api/roles/:id` - Actualizar rol existente
- `DELETE /api/roles/:id` - Eliminar rol

### Gestión de Vistas
- `GET /api/roles/views` - Listar todas las vistas disponibles

### Gestión de Permisos
- `GET /api/roles/:id/permissions` - Obtener permisos de un rol
- `PUT /api/roles/:id/permissions` - Actualizar permisos de un rol

### Usuario Actual
- `GET /api/roles/me/permissions` - Obtener vistas permitidas para el usuario actual

## 🧪 Testing Manual

### Flujo de Prueba Completo

1. **Crear rol personalizado**:
   ```
   Nombre interno: supervisor
   Nombre para mostrar: Supervisor de Tienda
   Descripción: Gestión de inventario y ventas
   ```

2. **Asignar permisos**:
   - Marcar: Dashboard, Inventario, Ventas, Catálogo
   - Ordenar arrastrando: Dashboard (1), Ventas (2), Inventario (3), Catálogo (4)
   - Guardar permisos

3. **Crear usuario de prueba**:
   - Ir a pestaña Empleados
   - Crear nuevo empleado con rol "Supervisor de Tienda"

4. **Verificar sidebar**:
   - Cerrar sesión e iniciar con el nuevo usuario
   - Verificar que el sidebar muestra solo las 4 vistas asignadas
   - Verificar que aparecen en el orden configurado

5. **Probar restricciones**:
   - Intentar editar rol "Administrador" → debe mostrar protección
   - Intentar eliminar rol con usuarios asignados → debe mostrar error

## 🐛 Troubleshooting

### El sidebar no se actualiza
- Verificar que el token JWT está actualizado
- Limpiar caché del navegador
- Verificar en DevTools: Network → `/api/roles/me/permissions`

### No aparece la pestaña "Roles y Permisos"
- Verificar que el usuario tiene rol de administrador
- Verificar que la tabla `roles` tiene datos
- Revisar consola del navegador por errores

### Error al guardar permisos
- Verificar que hay al menos una vista seleccionada
- Revisar los logs del servidor
- Verificar conexión a base de datos

### Usuario no ve vistas después de asignar rol
- Verificar que el rol tiene permisos configurados
- Verificar que el rol está activo (`is_active = true`)
- Usuario debe cerrar sesión y volver a entrar

## 📈 Mejoras Futuras Sugeridas

1. **Multi-rol por usuario**: Usuario puede tener múltiples roles simultáneos
2. **Permisos granulares**: Acciones específicas (ver/editar/eliminar) por vista
3. **Auditoría**: Log de cambios en roles y permisos
4. **Plantillas de roles**: Roles predefinidos para copiar
5. **Permisos por tenant**: Roles diferentes por tienda
6. **Vista previa**: Simular vista de otro rol sin cambiar usuario
7. **Grupos de vistas**: Agrupar vistas relacionadas para asignación rápida

## 🎉 ¡Listo para Usar!

El sistema está completamente implementado y verificado. Puedes empezar a:
- Crear roles personalizados para tu organización
- Configurar permisos específicos por área
- Controlar el acceso al sistema de forma granular
- Mejorar la seguridad limitando vistas por rol

**¡Disfruta del nuevo sistema de roles y permisos!** 🚀
