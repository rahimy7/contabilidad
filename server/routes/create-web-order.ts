// server/routes/create-web-order.ts
import { eq } from 'drizzle-orm';
import { Request, Response } from 'express';
import { z } from 'zod';

// Esquema de validación
const webOrderSchema = z.object({
  customerPhone: z.string().min(8, 'Teléfono debe tener al menos 8 caracteres'),
  customerAddress: z.string().min(10, 'Dirección debe tener al menos 10 caracteres'),
  notes: z.string().optional(),
  items: z.array(z.object({
    productId: z.number(),
    productName: z.string(),
    quantity: z.number().min(1),
    unitPrice: z.number().min(0),
    totalPrice: z.number().min(0)
  })).min(1, 'Debe incluir al menos un producto'),
  totalAmount: z.number().min(0),
  orderSource: z.literal('web_catalog'),
  storeId: z.number()
});

export async function createWebOrder(req: Request, res: Response) {
  try {
    // 🔍 DEBUGGING - Ver qué está llegando exactamente
    console.log('🔍 DEBUG create-web-order:');
    console.log('📦 Raw Body:', JSON.stringify(req.body, null, 2));
    console.log('📋 Content-Type:', req.headers['content-type']);
    console.log('📏 Body type:', typeof req.body);
    console.log('📊 Body keys:', Object.keys(req.body || {}));
    
    // Verificar si req.body existe y no está vacío
    if (!req.body || Object.keys(req.body).length === 0) {
      console.log('❌ Body está vacío o undefined');
      return res.status(400).json({
        success: false,
        message: 'Cuerpo de petición vacío o inválido',
        received: req.body,
        contentType: req.headers['content-type']
      });
    }

    // Verificar tipos de datos específicos antes de validar
    console.log('🔍 Verificando tipos:');
    console.log('- storeId:', req.body.storeId, 'type:', typeof req.body.storeId);
    console.log('- totalAmount:', req.body.totalAmount, 'type:', typeof req.body.totalAmount);
    console.log('- items length:', req.body.items?.length);
    
    if (req.body.items && req.body.items.length > 0) {
      console.log('- first item productId:', req.body.items[0].productId, 'type:', typeof req.body.items[0].productId);
    }

    // Intentar validar con Zod
    console.log('🔄 Iniciando validación con Zod...');
    const validatedData = webOrderSchema.parse(req.body);
    console.log('✅ Validación exitosa:', validatedData);
    
    // Importar storage functions
    const { getMasterStorage, getTenantStorage } = await import('../storage/index.js');
    
    const masterStorage = getMasterStorage();
    const tenantStorage = await getTenantStorage(validatedData.storeId);
    
    // Limpiar número de teléfono
    const cleanPhone = validatedData.customerPhone.replace(/[^\d+]/g, '');
    
    // 1. Buscar o crear cliente
    let customer = await tenantStorage.getCustomerByPhone(cleanPhone);
    
    if (!customer) {
      customer = await tenantStorage.createCustomer({
        phone: cleanPhone,
        name: `Cliente ${cleanPhone}`,
        storeId: validatedData.storeId
      });
    }
    
    // 2. Crear la orden
    const orderData = {
      customerId: customer.id,
      totalAmount: validatedData.totalAmount.toString(),
      status: 'pending',
      orderSource: 'web_catalog',
      customerNotes: validatedData.notes,
      deliveryAddress: validatedData.customerAddress
    };
    
    // Crear orden con items
    const order = await tenantStorage.createOrder(orderData, validatedData.items.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toString(),
      totalPrice: item.totalPrice.toString()
    })));
    
    // 3. Crear log de la orden (validando que el método existe)
    try {
      if (typeof tenantStorage.addOrderHistory === 'function') {
        await tenantStorage.addOrderHistory({
          orderId: order.id,
          action: 'order_created_web',
          statusFrom: null,
          statusTo: 'pending',
          notes: 'Orden creada desde catálogo web'
        });
        console.log('Order history log created successfully');
      } else {
        console.log('addOrderHistory method not available, skipping log creation');
      }
    } catch (logError) {
      console.warn('Warning: Could not create order log:', logError);
    }

    // ===== PASO 1: ASIGNACIÓN AUTOMÁTICA =====
    console.log('🎯 [AUTO-ASSIGN] Iniciando asignación automática para orden desde web');
    
    let assignedUserId: number | null = null;
    
    try {
      const { executeAutoAssignment } = await import('../services/auto-assignment-service.js');
      
      console.log('✅ [AUTO-ASSIGN] Módulo de asignación importado correctamente');
      console.log(`🚀 [AUTO-ASSIGN] Ejecutando asignación automática para orden ${order.id}...`);
      
      const assignmentResult = await executeAutoAssignment(order.id, tenantStorage);
      
      console.log('📊 [AUTO-ASSIGN] Resultado recibido:', assignmentResult);
      
      if (assignmentResult.success) {
        console.log(`✅ [AUTO-ASSIGN Web] ¡Orden asignada exitosamente!`);
        console.log(`👤 [AUTO-ASSIGN Web] Usuario asignado ID: ${assignmentResult.assignedUserId}`);
        console.log(`📝 [AUTO-ASSIGN Web] Mensaje: ${assignmentResult.message}`);
        
        // Guardar el ID del usuario asignado para el siguiente paso
        assignedUserId = assignmentResult.assignedUserId || null;
      } else {
        console.log(`⚠️ [AUTO-ASSIGN Web] No se pudo asignar automáticamente`);
        console.log(`📝 [AUTO-ASSIGN Web] Razón: ${assignmentResult.message}`);
        console.log(`ℹ️ [AUTO-ASSIGN Web] La orden quedó sin asignar y puede asignarse manualmente`);
      }
      
    } catch (autoAssignError: any) {
      console.error('❌ [AUTO-ASSIGN Web] Error crítico en asignación automática:');
      console.error('❌ [AUTO-ASSIGN] Error:', autoAssignError.message);
      console.error('❌ [AUTO-ASSIGN] Stack:', autoAssignError.stack);
      
      console.log('⚠️ [AUTO-ASSIGN Web] La orden fue creada correctamente');
      console.log('⚠️ [AUTO-ASSIGN Web] Pero no se pudo asignar automáticamente');
      console.log('ℹ️ [AUTO-ASSIGN Web] Puede asignarse manualmente desde el panel');
      
      // Registrar error en logs para revisión
      try {
        const storageFactory = await import('../storage/storage-factory.js');
        const masterStorage = storageFactory.StorageFactory.getInstance().getMasterStorage();
        
        await masterStorage.addWhatsAppLog({
          type: 'auto_assign_error',
          messageContent: `Error en auto-asignación para orden ${order.id}: ${autoAssignError.message}`,
          status: 'error',
          errorMessage: autoAssignError.message || 'Error desconocido',
          rawData: JSON.stringify({ 
            orderId: order.id,
            errorStack: autoAssignError.stack
          })
        });
      } catch (logError) {
        console.error('❌ [AUTO-ASSIGN] Error registrando en logs:', logError);
      }
    }

    // ===== PASO 2: INTEGRAR CON SISTEMA DE VIAJES =====
    if (assignedUserId) {
      try {
        console.log('🚚 [TRIPS] Verificando integración con viajes...');
        
        const { getTenantDb } = await import('../multi-tenant-db.js');
        const schema = await import('../../shared/schema.js');
        const { integrateWithAutoAssignment } = await import('../services/trip-service.js');
        
        const db = await getTenantDb(validatedData.storeId);
        const [assignedUser] = await db
          .select({ 
            role: schema.users.role,
            name: schema.users.name 
          })
          .from(schema.users)
          .where(eq(schema.users.id, assignedUserId));
        
        if (assignedUser && (assignedUser.role === 'delivery' || assignedUser.role === 'technician')) {
          console.log(`🚚 [TRIPS] Usuario es ${assignedUser.role}, integrando con viajes...`);
          
          const tripResult = await integrateWithAutoAssignment(
            validatedData.storeId,
            order.id,
            assignedUserId
          );
          
          if (tripResult) {
            console.log(`✅ [TRIPS] Orden ${order.orderNumber || order.id} agregada al viaje ${tripResult.tripNumber}`);
          }
        } else {
          console.log(`ℹ️ [TRIPS] Usuario rol ${assignedUser?.role || 'unknown'}, no requiere viaje`);
        }
      } catch (tripError) {
        console.error('❌ [TRIPS] Error integrando con viajes:', tripError);
        // No fallar la creación de la orden si falla la integración con viajes
      }
    } else {
      console.log('ℹ️ [TRIPS] No hay usuario asignado, saltando integración con viajes');
    }
    
    // 4. Enviar notificación por WhatsApp (si está configurado)
    try {
      await sendOrderNotificationToCustomer(customer, order, validatedData, tenantStorage);
    } catch (whatsappError) {
      console.error('Error enviando notificación WhatsApp:', whatsappError);
      // No falla la creación de orden si falla WhatsApp
    }
    
    // 5. Respuesta exitosa
    res.status(201).json({
      success: true,
      orderId: order.id,
      orderNumber: order.orderNumber || order.id,
      message: 'Pedido creado exitosamente'
    });
    
  } catch (error) {
    console.error('💥 Error creando orden web:', error);
    
    if (error instanceof z.ZodError) {
      console.log('❌ Error de validación Zod:', JSON.stringify(error.errors, null, 2));
      return res.status(400).json({
        success: false,
        message: 'Datos inválidos',
        errors: error.errors,
        receivedData: req.body // Incluir datos recibidos para debug
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
}

// Función para enviar notificación al cliente
async function sendOrderNotificationToCustomer(
  customer: any, 
  order: any, 
  orderData: any, 
  tenantStorage: any
) {
  try {
    // Obtener configuración de WhatsApp usando el método correcto
    let whatsappConfig = null;
    
    if (tenantStorage.getWhatsAppSettings) {
      whatsappConfig = await tenantStorage.getWhatsAppSettings();
    } else if (tenantStorage.getWhatsAppConfig) {
      whatsappConfig = await tenantStorage.getWhatsAppConfig();
    }
    
    if (!whatsappConfig || !whatsappConfig.accessToken) {
      console.log('WhatsApp no configurado para notificaciones');
      return;
    }
    
    // Generar resumen de productos
    const itemsSummary = orderData.items.map((item: any, index: number) => 
      `${index + 1}. ${item.productName} x${item.quantity} - $${item.totalPrice.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`
    ).join('\n');
    
    // Mensaje de confirmación
    const confirmationMessage = `🎉 ¡Tu pedido ha sido recibido exitosamente!

📋 *PEDIDO #${order.orderNumber || order.id}*

📦 *Productos:*
${itemsSummary}

💰 *Total: $${parseFloat(orderData.totalAmount).toLocaleString('es-DO', { minimumFractionDigits: 2 })}*

📍 *Dirección de entrega:*
${orderData.customerAddress}

⏰ *Estado:* En proceso

Tu pedido está siendo procesado. En unos momentos te estaremos informando sobre el estado del mismo.

¡Gracias por tu preferencia!`;

    // Enviar mensaje de WhatsApp
    const whatsappApiUrl = `https://graph.facebook.com/v17.0/${whatsappConfig.phoneNumberId}/messages`;
    
    const messagePayload = {
      messaging_product: "whatsapp",
      to: customer.phone,
      type: "text",
      text: {
        body: confirmationMessage
      }
    };

    const response = await fetch(whatsappApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${whatsappConfig.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messagePayload)
    });

    if (response.ok) {
      console.log('✅ Notificación WhatsApp enviada exitosamente');
    } else {
      const errorData = await response.text();
      console.error('❌ Error enviando WhatsApp:', response.status, errorData);
    }
    
  } catch (error) {
    console.error('Error en sendOrderNotificationToCustomer:', error);
    throw error;
  }
}