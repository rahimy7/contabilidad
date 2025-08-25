import { sendWhatsAppMessageDirect } from './whatsapp-simple.js';

// Función email inline para evitar errores de import
async function sendEmailNotification(to: string, subject: string, text: string): Promise<void> {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log('⚠️ Email notifications disabled - SMTP not configured');
      return;
    }

    const nodemailer = require('nodemailer');
    
    const transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html: text.replace(/\n/g, '<br>')
    });

    console.log(`✅ Email sent to ${to}`);
  } catch (error) {
    console.error('❌ Error sending email:', error);
    throw error;
  }
}

export interface NotificationPayload {
  orderId: number;
  eventType: string;
  recipientId?: number;
  customData?: any;
}

// Tipos para evitar errores de TypeScript
interface HistoryData {
  configId: number;
  orderId: number;
  recipientId: number;
  recipientType: string;
  channel: string;
  title: string;
  message: string;
  status: string;
  sentAt?: Date;
  errorMessage?: string;
}

export class NotificationService {
  private tenantStorage: any;
  private storeId: number;

  constructor(tenantStorage: any, storeId: number) {
    this.tenantStorage = tenantStorage;
    this.storeId = storeId;
  }

  async triggerOrderNotifications(payload: NotificationPayload): Promise<void> {
    try {
      console.log(`📢 Triggering notifications for event: ${payload.eventType}, order: ${payload.orderId}`);

      // Obtener configuraciones activas para este evento
      const configs = await this.tenantStorage.getNotificationConfigs();
      const activeConfigs = configs.filter((config: any) => 
        config.eventName === payload.eventType && config.isEnabled
      );

      if (activeConfigs.length === 0) {
        console.log(`⚠️ No active notification configs found for event: ${payload.eventType}`);
        return;
      }

      // Obtener datos de la orden
      const order = await this.tenantStorage.getOrderById(payload.orderId);
      if (!order) {
        console.error(`❌ Order not found: ${payload.orderId}`);
        return;
      }

      for (const config of activeConfigs) {
        await this.processNotificationConfig(config, order, payload);
      }

    } catch (error) {
      console.error('❌ Error triggering order notifications:', error);
    }
  }

  private async processNotificationConfig(config: any, order: any, payload: NotificationPayload): Promise<void> {
    try {
      // Determinar destinatarios
      const recipients = await this.getRecipients(config, order);
      
      for (const recipient of recipients) {
        // Generar mensaje desde template
        const message = this.generateMessage(config.template, {
          order,
          recipient,
          customData: payload.customData
        });

        // Programar envío (considerar delay)
        if (config.delayMinutes > 0) {
          setTimeout(async () => {
            await this.sendNotification(config, recipient, message, order);
          }, config.delayMinutes * 60 * 1000);
        } else {
          await this.sendNotification(config, recipient, message, order);
        }
      }
    } catch (error) {
      console.error('❌ Error processing notification config:', error);
    }
  }

  private async getRecipients(config: any, order: any): Promise<any[]> {
    const recipients = [];

    try {
      switch (config.recipientType) {
        case 'customer':
          if (order.customer) {
            recipients.push({
              id: order.customer.id,
              name: order.customer.name,
              phone: order.customer.phone,
              email: order.customer.email,
              type: 'customer'
            });
          }
          break;

        case 'technician':
          if (order.assignedUser) {
            recipients.push({
              id: order.assignedUser.id,
              name: order.assignedUser.name,
              phone: order.assignedUser.phone,
              email: order.assignedUser.email,
              type: 'technician'
            });
          }
          break;

        case 'admin':
          // Usar getAllUsers si getUsersByRole no existe
          const allUsers = await this.tenantStorage.getAllUsers();
          const admins = allUsers.filter((u: any) => 
            ['admin', 'manager'].includes(u.role?.toLowerCase())
          );
          recipients.push(...admins.map((admin: any) => ({
            id: admin.id,
            name: admin.name,
            phone: admin.phone,
            email: admin.email,
            type: 'admin'
          })));
          break;

        case 'custom':
          if (config.customRecipients && Array.isArray(config.customRecipients)) {
            // Usar getAllUsers y filtrar por IDs si getUsersByIds no existe
            const allUsers = await this.tenantStorage.getAllUsers();
            const customUsers = allUsers.filter((u: any) => 
              config.customRecipients.includes(u.id)
            );
            recipients.push(...customUsers.map((user: any) => ({
              id: user.id,
              name: user.name,
              phone: user.phone,
              email: user.email,
              type: 'custom'
            })));
          }
          break;
      }
    } catch (error) {
      console.error('❌ Error getting recipients:', error);
    }

    return recipients;
  }

  private generateMessage(template: string, data: any): string {
    let message = template;
    
    // Reemplazar variables en el template con valores seguros
    const replacements = {
      '{order.id}': data.order?.id || 'N/A',
      '{order.status}': data.order?.status || 'N/A',
      '{recipient.name}': data.recipient?.name || 'Cliente',
      '{order.total}': data.order?.totalAmount || '0',
      '{order.address}': data.order?.deliveryAddress || 'No especificada',
      '{technician.name}': data.order?.assignedUser?.name || 'No asignado'
    };

    for (const [variable, value] of Object.entries(replacements)) {
      message = message.replace(new RegExp(variable.replace(/[{}]/g, '\\$&'), 'g'), String(value));
    }
    
    return message;
  }

  private async sendNotification(config: any, recipient: any, message: string, order: any): Promise<void> {
    const historyData: HistoryData = {
      configId: config.id,
      orderId: order.id,
      recipientId: recipient.id,
      recipientType: recipient.type,
      channel: config.channelName,
      title: `Orden #${order.id}`,
      message: message,
      status: 'pending'
    };

    try {
      switch (config.channelName) {
        case 'whatsapp':
          if (recipient.phone) {
            await sendWhatsAppMessageDirect(recipient.phone, message, this.storeId);
            historyData.status = 'sent';
            historyData.sentAt = new Date();
          } else {
            throw new Error('No phone number available');
          }
          break;

        case 'email':
          if (recipient.email) {
            await sendEmailNotification(
              recipient.email,
              `Orden #${order.id}`,
              message
            );
            historyData.status = 'sent';
            historyData.sentAt = new Date();
          } else {
            throw new Error('No email address available');
          }
          break;

        case 'app':
          // Crear notificación en la app
          await this.tenantStorage.createNotification({
            userId: recipient.id,
            type: 'order',
            title: `Orden #${order.id}`,
            message: message
          });
          historyData.status = 'sent';
          historyData.sentAt = new Date();
          break;

        default:
          throw new Error(`Unsupported channel: ${config.channelName}`);
      }

      console.log(`✅ ${config.channelName} notification sent to ${recipient.name}`);

    } catch (error: any) {
      console.error(`❌ Error sending ${config.channelName} notification:`, error);
      historyData.status = 'failed';
      historyData.errorMessage = error.message;
    }

    // Registrar en historial
    try {
      await this.tenantStorage.addNotificationHistory(historyData);
    } catch (error) {
      console.error('❌ Error saving notification history:', error);
    }
  }
}