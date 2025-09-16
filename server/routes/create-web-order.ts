// server/routes/create-web-order.ts
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
    // Validar datos de entrada
    const validatedData = webOrderSchema.parse(req.body);
    
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
    console.error('Error creando orden web:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Datos inválidos',
        errors: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
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

¡Gracias por tu preferencia! 🙏`;

    // Enviar mensaje via WhatsApp usando función disponible
    try {
      // Intentar con sendWhatsAppMessageDirect de whatsapp-simple.ts
      const { sendWhatsAppMessageDirect } = await import('../whatsapp-simple.js');
      
      await sendWhatsAppMessageDirect(
        customer.phone,
        confirmationMessage,
        orderData.storeId
      );
      
      console.log(`✅ Notificación enviada al cliente ${customer.phone}`);
      
    } catch (importError) {
      console.log('Warning: Could not import sendWhatsAppMessageDirect, trying alternative...');
      
      // Fallback: crear log de WhatsApp manual si no se puede enviar
      try {
        if (tenantStorage.addWhatsAppLog) {
          await tenantStorage.addWhatsAppLog({
            phoneNumber: customer.phone,
            messageContent: confirmationMessage,
            direction: 'outbound',
            status: 'pending',
            storeId: orderData.storeId,
            type: 'order_confirmation'
          });
        }
      } catch (logError) {
        console.warn('Could not create WhatsApp log:', logError);
      }
    }
    
  } catch (error) {
    console.error('Error enviando notificación WhatsApp:', error);
    // No throw error para no fallar la creación de orden
  }
}