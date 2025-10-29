import { ConversationContext, ConversationContextService } from './conversation-context';
// order-tracking.ts
export interface OrderDetails {
  id: number;
  orderNumber: string;
  customerId: number;
  customerName: string;
  status: string;
  totalAmount: string;
  createdAt: Date;
  estimatedDeliveryTime?: string;
  notes?: string;
  items: OrderItem[];
}

export interface OrderItem {
  id: number;
  name: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
}

export interface OrderNote {
  id?: number;
  orderId: number;
  customerId: number;
  noteText: string;
  noteType: 'customer_note' | 'status_update' | 'modification';
  createdBy: string;
  createdAt?: Date;
}

export class OrderTrackingService {
  private storage: any;
  private contextService: ConversationContextService;
  private storeId: number;

  constructor(storage: any, contextService: ConversationContextService, storeId: number) {
    this.storage = storage;
    this.contextService = contextService;
    this.storeId = storeId;
  }

async getCustomerActiveOrders(customerId: number) {
  const orders = await this.storage.getAllOrders(); // usa método existente
  return orders.filter(o =>
    o.customerId === customerId &&
    ['pending', 'processing'].includes(o.status)
  );
}

  async getOrderDetails(orderId: number, customerId: number): Promise<OrderDetails | null> {
    const query = `
      SELECT 
        o.id,
        o.order_number,
        o.customer_id,
        c.name as customer_name,
        o.status,
        o.total_amount,
        o.created_at,
        o.estimated_delivery_time,
        o.notes
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.id = $1 AND o.customer_id = $2
    `;

    const result = await this.storage.query(query, [orderId, customerId]);
    
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    const items = await this.getOrderItems(orderId);

    return {
      id: row.id,
      orderNumber: row.order_number,
      customerId: row.customer_id,
      customerName: row.customer_name,
      status: row.status,
      totalAmount: row.total_amount,
      createdAt: row.created_at,
      estimatedDeliveryTime: row.estimated_delivery_time,
      notes: row.notes,
      items: items
    };
  }

  private async getOrderItems(orderId: number): Promise<OrderItem[]> {
    const query = `
      SELECT 
        oi.id,
        COALESCE(p.name, oi.product_name, 'Producto') as name,
        oi.quantity,
        oi.unit_price,
        (oi.quantity * oi.unit_price) as total_price
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1
      ORDER BY oi.id
    `;

    const result = await this.storage.query(query, [orderId]);
    
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      quantity: row.quantity,
      unitPrice: row.unit_price,
      totalPrice: row.total_price
    }));
  }

  async addOrderNote(note: OrderNote): Promise<OrderNote> {
    const query = `
      INSERT INTO order_notes (order_id, customer_id, note_text, note_type, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [
      note.orderId,
      note.customerId,
      note.noteText,
      note.noteType,
      note.createdBy
    ];

    const result = await this.storage.query(query, values);
    return result.rows[0];
  }

  async getOrderNotes(orderId: number): Promise<OrderNote[]> {
    const query = `
      SELECT * FROM order_notes 
      WHERE order_id = $1 
      ORDER BY created_at DESC
    `;

    const result = await this.storage.query(query, [orderId]);
    return result.rows;
  }

  async updateOrderStatus(orderId: number, newStatus: string, updatedBy: string): Promise<boolean> {
    const query = `
      UPDATE orders 
      SET status = $1, last_status_update = CURRENT_TIMESTAMP 
      WHERE id = $2
    `;

    const result = await this.storage.query(query, [newStatus, orderId]);
    
    // Agregar nota de cambio de estado
    if (result.rowCount > 0) {
      await this.addOrderNote({
        orderId: orderId,
        customerId: 0, // Se puede obtener del order si es necesario
        noteText: `Estado actualizado a: ${newStatus}`,
        noteType: 'status_update',
        createdBy: updatedBy
      });
    }

    return result.rowCount > 0;
  }
}

// intelligent-welcome.ts
export class IntelligentWelcomeService {
  private storage: any;
  private orderTrackingService: OrderTrackingService;
  private contextService: ConversationContextService;
  private storeId: number;

  constructor(storage: any, storeId: number) {
    this.storage = storage;
    this.storeId = storeId;
    this.contextService = new ConversationContextService(storage, storeId);
    this.orderTrackingService = new OrderTrackingService(storage, this.contextService, storeId);
  }

   async getCustomerActiveOrders(customerId: number) {
    return this.orderTrackingService.getCustomerActiveOrders(customerId);
  }

  async generateWelcomeMessage(phoneNumber: string): Promise<{
    messageType: string;
    message: string;
    menuOptions: string;
    hasActiveOrders: boolean;
    orderCount: number;
  }> {
    try {
      // Buscar cliente por teléfono
      const customer = await this.storage.getCustomerByPhone(phoneNumber);
      
      if (!customer) {
        return this.getNewCustomerWelcome();
      }

      // Buscar órdenes activas
      const activeOrders = await this.orderTrackingService.getCustomerActiveOrders(customer.id);
      
      if (activeOrders.length > 0) {
        // Cliente con órdenes activas
        const context: ConversationContext = {
          phoneNumber: phoneNumber,
          customerId: customer.id,
          currentFlow: 'welcome_with_orders',
          contextData: {
            activeOrders: activeOrders.map(order => ({
              id: order.id,
              orderNumber: order.orderNumber,
              status: order.status
            }))
          }
        };

        await this.contextService.saveContext(context);

        return {
          messageType: 'welcome_with_orders',
          message: this.formatWelcomeWithOrders(customer.name, activeOrders.length),
          menuOptions: JSON.stringify([
            { label: "📦 Seguimiento de Pedidos", value: "track_orders", action: "show_order_tracking" },
            { label: "🛍️ Hacer Pedido Nuevo", value: "new_order", action: "show_products" },
            { label: "❓ Obtener Ayuda", value: "show_help", action: "show_help" }
          ]),
          hasActiveOrders: true,
          orderCount: activeOrders.length
        };
      } else {
        // Cliente existente sin órdenes activas
        return this.getExistingCustomerWelcome(customer.name);
      }
    } catch (error) {
      console.error('Error generando mensaje de bienvenida inteligente:', error);
      return this.getNewCustomerWelcome();
    }
  }

  private formatWelcomeWithOrders(customerName: string, orderCount: number): string {
    return `¡Hola ${customerName}! 👋 Bienvenido de nuevo a *MAS QUE SALUD*

📦 Veo que tienes ${orderCount} pedido(s) en proceso.

¿Qué deseas hacer hoy?`;
  }

  private getNewCustomerWelcome() {
    return {
      messageType: 'welcome_new',
      message: `¡Hola! 👋 Bienvenido a *MAS QUE SALUD*

¿En qué podemos ayudarte hoy?`,
      menuOptions: JSON.stringify([
        { label: "🛍️ Ver Productos", value: "show_products", action: "show_products" },
        { label: "⚙️ Ver Servicios", value: "show_services", action: "show_services" },
        { label: "❓ Obtener Ayuda", value: "show_help", action: "show_help" }
      ]),
      hasActiveOrders: false,
      orderCount: 0
    };
  }

  private getExistingCustomerWelcome(customerName: string) {
    return {
      messageType: 'welcome_existing',
      message: `¡Hola ${customerName}! 👋 Bienvenido de nuevo a *MAS QUE SALUD*

¿En qué podemos ayudarte hoy?`,
      menuOptions: JSON.stringify([
        { label: "🛍️ Ver Productos", value: "show_products", action: "show_products" },
        { label: "⚙️ Ver Servicios", value: "show_services", action: "show_services" },
        { label: "❓ Obtener Ayuda", value: "show_help", action: "show_help" }
      ]),
      hasActiveOrders: false,
      orderCount: 0
    };
  }

  async generateOrderTrackingMenu(phoneNumber: string): Promise<{
    message: string;
    menuOptions: string;
  }> {
    const context = await this.contextService.getContext(phoneNumber);
    
    if (!context || !context.customerId) {
      return {
        message: "❌ No se encontraron pedidos en proceso.",
        menuOptions: JSON.stringify([
          { label: "🏠 Menú Principal", value: "welcome", action: "welcome" }
        ])
      };
    }

    const activeOrders = await this.orderTrackingService.getCustomerActiveOrders(context.customerId);
    
    if (activeOrders.length === 0) {
      return {
        message: "📦 No tienes pedidos en proceso en este momento.",
        menuOptions: JSON.stringify([
          { label: "🛍️ Hacer Nuevo Pedido", value: "new_order", action: "show_products" },
          { label: "🏠 Menú Principal", value: "welcome", action: "welcome" }
        ])
      };
    }

    const customer = await this.storage.getCustomerById(context.customerId);
    const customerName = customer ? customer.name : "Cliente";

    const menuOptions = activeOrders.map(order => {
      const statusEmoji = this.getStatusEmoji(order.status);
      const orderDate = new Date(order.createdAt).toLocaleDateString('es-DO');
      
      return {
        label: `${statusEmoji} Pedido #${order.orderNumber} - ${orderDate}`,
        value: `order_${order.id}`,
        action: "show_order_details"
      };
    });

    // Agregar opciones adicionales
    menuOptions.push(
      { label: "🛍️ Hacer Pedido Nuevo", value: "new_order", action: "show_products" },
      { label: "🏠 Menú Principal", value: "welcome", action: "welcome" }
    );

    return {
      message: `📦 *Seguimiento de Pedidos*

${customerName}, aquí están tus pedidos en proceso:`,
      menuOptions: JSON.stringify(menuOptions)
    };
  }

  async generateOrderDetailsMessage(orderId: number, phoneNumber: string): Promise<{
    message: string;
    menuOptions: string;
  } | null> {
    const context = await this.contextService.getContext(phoneNumber);
    
    if (!context || !context.customerId) {
      return null;
    }

    const orderDetails = await this.orderTrackingService.getOrderDetails(orderId, context.customerId);
    
    if (!orderDetails) {
      return null;
    }

    // Actualizar contexto con la orden seleccionada
    context.selectedOrderId = orderId;
    context.currentFlow = 'order_details';
    await this.contextService.saveContext(context);

    const statusEmoji = this.getStatusEmoji(orderDetails.status);
    const statusText = this.getStatusText(orderDetails.status);
    const orderDate = new Date(orderDetails.createdAt).toLocaleDateString('es-DO');
    
    let itemsText = '';
    if (orderDetails.items.length > 0) {
      itemsText = orderDetails.items.map(item => 
        `• ${item.name} (Cantidad: ${item.quantity})`
      ).join('\n');
    } else {
      itemsText = '• Ver detalles en el sistema';
    }

    const message = `📋 *Detalles del Pedido #${orderDetails.orderNumber}*

👤 *Cliente:* ${orderDetails.customerName}
📅 *Fecha:* ${orderDate}
📍 *Estado:* ${statusText} ${statusEmoji}
💰 *Total:* $${parseFloat(orderDetails.totalAmount).toLocaleString('es-DO', { minimumFractionDigits: 2 })}

🛍️ *Productos:*
${itemsText}

📝 *Notas:* ${orderDetails.notes || 'Sin notas adicionales'}

⏱️ *Tiempo estimado:* ${orderDetails.estimatedDeliveryTime || 'Por confirmar'}

¿Qué deseas hacer con este pedido?`;

    const menuOptions = [
      { label: "📝 Agregar Nota", value: "add_note", action: "add_order_note" },
      { label: "✏️ Modificar Pedido", value: "modify_order", action: "modify_order" },
      { label: "🔄 Actualizar Estado", value: "update_status", action: "request_status_update" },
      { label: "📞 Contactar Soporte", value: "contact_support", action: "show_help" },
      { label: "📦 Ver Otros Pedidos", value: "track_orders", action: "show_order_tracking" },
      { label: "🏠 Menú Principal", value: "welcome", action: "welcome" }
    ];

    return {
      message: message,
      menuOptions: JSON.stringify(menuOptions)
    };
  }

  async saveOrderNote(phoneNumber: string, noteText: string): Promise<{
    success: boolean;
    message: string;
    menuOptions: string;
  }> {
    const context = await this.contextService.getContext(phoneNumber);
    
    if (!context || !context.selectedOrderId || !context.customerId) {
      return {
        success: false,
        message: "❌ Error: No se pudo guardar la nota. Contexto de pedido no válido.",
        menuOptions: JSON.stringify([
          { label: "🏠 Menú Principal", value: "welcome", action: "welcome" }
        ])
      };
    }

    try {
      const note: OrderNote = {
        orderId: context.selectedOrderId,
        customerId: context.customerId,
        noteText: noteText.trim(),
        noteType: 'customer_note',
        createdBy: 'customer'
      };

      await this.orderTrackingService.addOrderNote(note);

      const orderDetails = await this.orderTrackingService.getOrderDetails(
        context.selectedOrderId, 
        context.customerId
      );

      const noteDate = new Date().toLocaleDateString('es-DO');

      return {
        success: true,
        message: `✅ *Nota Agregada Exitosamente*

Tu nota ha sido agregada al pedido #${orderDetails?.orderNumber}:

📝 "${noteText}"

📅 Fecha: ${noteDate}

El equipo de soporte revisará tu nota y te contactará si es necesario.`,
        menuOptions: JSON.stringify([
          { label: "📋 Ver Detalles del Pedido", value: "view_details", action: "show_order_details" },
          { label: "📦 Ver Otros Pedidos", value: "track_orders", action: "show_order_tracking" },
          { label: "🏠 Menú Principal", value: "welcome", action: "welcome" }
        ])
      };
    } catch (error) {
      console.error('Error guardando nota de pedido:', error);
      return {
        success: false,
        message: "❌ Error guardando la nota. Por favor intenta de nuevo o contacta soporte.",
        menuOptions: JSON.stringify([
          { label: "🔄 Intentar de Nuevo", value: "add_note", action: "add_order_note" },
          { label: "🏠 Menú Principal", value: "welcome", action: "welcome" }
        ])
      };
    }
  }

  private getStatusEmoji(status: string): string {
    const statusEmojis: { [key: string]: string } = {
      'pending': '⏳',

      'processing': '🔄',
  
   
      'cancelled': '❌',
      'completed': '✅'
    };
    return statusEmojis[status] || '📋';
  }

  private getStatusText(status: string): string {
    const statusTexts: { [key: string]: string } = {
      'pending': 'Pendiente',
 
      'processing': 'En Proceso',


      'cancelled': 'Cancelado',
      'completed': 'Completado'
    };
    return statusTexts[status] || 'Desconocido';
  }
}