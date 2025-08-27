A continuación expongo un análisis del archivo y señalo problemas de seguridad, validaciones, manejo de errores y diseño. Luego propongo una lista numerada con cambios concretos y ejemplos de implementación.

1) Estructura y separación de responsabilidades
- Qué ves ahora: el archivo es un único gran archivo de rutas con muchísimos handlers para productos, categorías, usuarios, conversaciones, pedidos, notificaciones, etc.
- Problema: tamaño y acoplamiento dificultan pruebas, validación consistente y revisión de seguridad. Además aumenta la probabilidad de inconsistencias entre contextos (global/tenant/store).
- Cambio recomendado:
  - dividir en módulos por dominio (por ejemplo: productRoutes.ts, categoryRoutes.ts, userRoutes.ts, conversationRoutes.ts, orderRoutes.ts, notificationRoutes.ts).
  - cada módulo exporta un Router y se monta en registerRoutes.
- Ejemplo de implementación:
  - Crear un directorio routes/ con archivos:
    - routes/productRoutes.ts
    - routes/conversationRoutes.ts
  - En routes/productRoutes.ts:
    - const router = express.Router();
    - router.get('/api/products', ...);
    - export default router;
  - En routes/index.ts:
    - import productRoutes from './productRoutes';
    - app.use('/api', productRoutes);

2) Uso de routeWithSchemaRouting y alcance de esquemas
- Qué ves ahora: hay una función routeWithSchemaRouting que detecta si es super_admin para forzar esquema público, pero no se observa que se aplique a las rutas.
- Problema: el esquema (public vs tenant) podría no aplicarse de forma consistente y podría permitir acceso indebido a datos.
- Cambio recomendado:
  - aplicar el middleware de esquema en todas las rutas relevantes o en el router principal para garantizar consistencia.
- Ejemplo de implementación:
  - Añadir al inicio de cada router: `router.use(routeWithSchemaRouting((req, res, next) => next()));` o refactorizar para que routeWithSchemaRouting envuelva a todas las rutas automáticamente.

3) Validación y saneamiento de entradas (entrada de datos)
- Problema: muchos handlers validan manualmente y no usan esquemas de validación centralizados. Esto puede permitir datos inconsistentes o peligrosos.
- Cambio recomendado:
  - introducir validaciones con Zod (ya hay import de zod) para cada recurso (usuarios, productos, órdenes, etc.) y aplicar parse en cada endpoint.
- Ejemplo de implementación:
  - Definir esquemas en un archivo schemas/product.schemas.ts:
    - `const productCreateSchema = z.object({ name: z.string().min(1), price: z.number().optional(), baseCurrency: z.string().optional(), /* otros campos */ });`
    - En createProductHandler: `const data = productCreateSchema.parse(req.body);`
  - En caso de error: devolver 400 con detalles de validación.

4) Manejo de IDs y parámetros numéricos
- Problema: se usan parseInt sin validación adecuada y sin especificar base.
- Cambio recomendado:
  - usar Number(req.params.id) o parseInt(req.params.id, 10) y verificarisNaN(id) antes de continuar.
- Ejemplo de implementación:
  - `const id = parseInt(req.params.id, 10); if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });`

5) Manejo de archivos (Multer) y almacenamiento de archivos
- Problema: multer usa memoryStorage y hay un comentario que señala que es “CRÍTICO”. Además hay código que crea un objeto File en Node (lo cual no existe en Node.js).
- Cambio recomendado:
  - cambiar a diskStorage o a almacenamiento en memoria con streaming hacia un servicio (Supabase/S3) sin crear objetos tipo File en servidor.
  - evitar depender de File en Node; adaptar la API del storage para aceptar Buffer y metadata.
- Ejemplo de implementación:
  - Cambiar a diskStorage:
    - const upload = multer({ storage: diskStorage({ destination: 'uploads/', filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname) }), limits: { fileSize: 10 * 1024 * 1024 } });
  - En processProductImages, si Supabase está configurado:
    - Reemplazar `new File([...], ...)` por un objeto que permita subir desde Buffer, p. ej. `storageManager.uploadFile(file.buffer, file.originalname, file.mimetype, productId)` o adaptar a la API de SupabaseStorageManager para aceptar Buffer y metadata.

6) Seguridad de JWT y gestión de secretos
- Problema: JWT_SECRET se toma de env o con valor por defecto 'your-secret-key', lo que es inseguro en producción.
- Cambio recomendado:
  - exigir que JWT_SECRET esté definido y no usar un valor por defecto en producción; controlar en arranque que la variable esté presente.
  - considerar rotación de tokens y refresh tokens para mayor seguridad.
- Ejemplo de implementación:
  - `const JWT_SECRET = process.env.JWT_SECRET; if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is not set');`

7) Manejo de errores y formato de respuestas
- Problema: respuestas de error varían y a veces se envían mensajes de error internos en 500, lo que puede exponer detalles.
- Cambio recomendado:
  - crear un helper de respuesta de error estandarizado (por ejemplo, sendError(res, status, code, message, details?)).
  - evitar enviar stack traces o mensajes internos en producción.
- Ejemplo de implementación:
  - function sendError(res, status, code, message, details?) { res.status(status).json({ error: { code, message, details } }); }
  - Usar en catch: `return sendError(res, 500, 'SERVER_ERROR', 'Internal server error');`

8) Logging y seguridad de la información
- Problema: se usan console.log para depuración, incluyendo datos de cuerpos completos y posibles credenciales.
- Cambio recomendado:
  - sustituir por un logger estructurado (p. ej. winston o pino) y evitar imprimir datos sensibles (passwords, tokens).
- Ejemplo de implementación:
  - En lugar de `console.log('📋 Request body received:', req.body);` usar `logger.info('Request body received', { endpoint: req.path, user: user?.id, bodyPreview: Object.keys(req.body).slice(0, 5) });`
  - No imprimir req.body completo en logs.

9) Duplicidad de rutas y diseño errático
- Problema: hay referencias a rutas duplicadas (por ejemplo, dos definiciones para /conversations/:id/mark-read) y comentarios que mencionan correcciones pendientes.
- Cambio recomendado:
  - eliminar duplicados, consolidar rutas en un único archivo/router por recurso.
  - eliminar código muerto o comentarios que confundan.
- Ejemplo de implementación:
  - Buscar y dejar una única definición de:
    - router.post('/conversations/:id/mark-read', ...)
  - Si necesitas dos variantes, renombrarlas claramente y documentarlas.

10) Validación de moneda y consistencia entre campos monetarios
- Problema: hay validación de moneda en create/update, pero la validación está dispersa en varios lugares.
- Cambio recomendado:
  - centralizar la validación de moneda en un helper de validación de monedas y reutilizarlo en createProductHandler y updateProductHandler.
- Ejemplo de implementación:
  - Crear función: `function isSupportedCurrency(code?: string): boolean { const list = ['USD','DOP']; return !!code && list.includes(code.toUpperCase()); }`
  - Usar en: `if (!isSupportedCurrency(req.body.baseCurrency || req.body.currency)) { ... }`

11) Enriquecimiento de datos en órdenes y rendimiento
- Observación: se hacen múltiples llamadas para enriquecer cada orden (cliente, usuario asignado, items, productos) dentro de un map. Esto puede generar muchas consultas n+1.
- Cambio recomendado:
  - implementar batching o caching donde sea posible, o limitar el enriquecimiento a datos ya disponibles en join/preconsulta.
  - si el ORM o la capa de almacenamiento soporta queries con joins, migrar a consultas que traigan todo en una sola operación cuando sea posible.
- Ejemplo de implementación:
  - Revisar si `tenantStorage.getAllOrders()` puede devolver además del pedido los datos de cliente y productos asociados en un único fetch; si no, considerar una serie de consultas paralelas controladas con un lote máximo.

12) Seguridad de endpoints administrativos y permisos
- Problema: hay endpoints que usan requireSuperAdmin para acciones globales, y otros que manipulan usuarios/tokens en distintos contextos. En algunos casos, podría faltar verificación de permisos específica para tenant/global.
- Cambio recomendado:
  - asegurar que cada endpoint aplica el rol/alcance correcto:
    - global: solo super_admin/system_admin
    - store: store-level permisos
    - tenant: permisos dentro del tenant correspondiente
  - añadir validaciones explícitas en cada ruta para evitar que un usuario con rol equivocado ejecute acciones inadecuadas.
- Ejemplo de implementación:
  - En una ruta de actualización de usuario de tenant:
    - si (level === 'tenant' && !storeId) devolver 400; si storeId existe, verificar que el usuario autenticado tiene storeId igual y permisos.
  - Crear middlewares como verifyGlobalAdmin, verifyStoreAdmin para reutilización.

13) Seguridad de operaciones de WhatsApp y capacidad de pruebas
- Problema: hay lógica compleja para enviar mensajes de WhatsApp, con múltiples importaciones dinámicas y rutas de prueba duplicadas.
- Cambio recomendado:
  - mantener una única ruta de envío real y rutas de prueba separadas con controles más estrictos (solo para desarrollo).
  - validar exhaustivamente la configuración de WhatsApp antes de enviar (token, phoneNumberId, isActive).
- Ejemplo de implementación:
  - Añadir un middleware de validación de config antes de realizar el fetch a Graph API y retornar 400 si falta token o phoneNumberId.
  - En rutas de test, exigir permisos de desarrollo o un flag de entorno.

14) Pruebas y documentación de API
- Problema: la gran cantidad de endpoints no tiene pruebas visibles en este fragmento, y la autenticación/autoridad es compleja.
- Cambio recomendado:
  - agregar pruebas unitarias y de integración para endpoints críticos (login, creación de usuario, creación de producto, creación de pedido).
  - documentar contratos de API (qué campos son obligatorios, tipos, valores permitidos) y validar con Zod en lugar de depender únicamente de comentarios.
- Ejemplo de implementación:
  - Crear tests con Jest o Vitest para validar: 
    - login exitoso y fallido,
    - creación de producto con datos válidos e inválidos,
    - actualización de estado de pedido y triggers de notificaciones.

Notas finales y consideraciones rápidas
- El archivo contiene lógica de negocio muy sensible (gestión de usuarios, accesos, almacenamiento y mensajes de WhatsApp). Modularizar y endurecer validaciones es clave para reducir vulnerabilidades y errores de seguridad.
- Donde se detecte uso de memoria para subir archivos (memoryStorage) o uso de objetos que no existen en Node (new File(...)), aplica cambios inmediatos para evitar fugas de memoria o errores en producción.
- Revisa que las respuestas de errores no expongan detalles internos (stack traces, mensajes de base de datos) y utiliza un helper de errores consistente.
- Considera reemplazar console.log por un logger y evitar imprimir datos sensibles en logs.

Si quieres, puedo ayudarte a:
- Esbozar la estructura modular (archivos y tipos) y generar ejemplos de esquemas Zod para los recursos más usados.
- Proporcionar fragmentos de código para las validaciones centralizadas (p. ej., productSchema, userSchema) y ejemplos de integración en los handlers.
- Crear un middleware genérico de manejo de errores y un logger simple para este proyecto.