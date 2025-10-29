// utils/thermal-printer.ts
// Impresión directa a impresora térmica vía ESC/POS

interface PrintData {
  orderNumber: string;
  customer: {
    name: string;
    phone: string;
    address?: string | null;
  };
  status: string;
  items: Array<{
    product: { name: string };
    quantity: number;
    unitPrice: string;
    totalPrice: string;
  }>;
  totalAmount: string;
  deliveryCost?: string;
  notes?: string | null;
  createdAt: string;
  assignedUser?: { name: string } | null;
}

export class ThermalPrinter {
  private encoder = new TextEncoder();
  
  // Comandos ESC/POS
  private ESC = '\x1B';
  private GS = '\x1D';
  
  private commands = {
    INIT: '\x1B\x40',              // Inicializar impresora
    CENTER: '\x1B\x61\x01',        // Centrar texto
    LEFT: '\x1B\x61\x00',          // Alinear izquierda
    RIGHT: '\x1B\x61\x02',         // Alinear derecha
    BOLD_ON: '\x1B\x45\x01',       // Negrita ON
    BOLD_OFF: '\x1B\x45\x00',      // Negrita OFF
    UNDERLINE_ON: '\x1B\x2D\x01',  // Subrayado ON
    UNDERLINE_OFF: '\x1B\x2D\x00', // Subrayado OFF
    SIZE_NORMAL: '\x1D\x21\x00',   // Tamaño normal
    SIZE_DOUBLE: '\x1D\x21\x11',   // Tamaño doble
    SIZE_LARGE: '\x1D\x21\x22',    // Tamaño grande
    CUT: '\x1D\x56\x00',           // Cortar papel
    LINE_FEED: '\x0A',             // Salto de línea
    DASHED_LINE: '-'.repeat(32),   // Línea punteada
  };

  private formatCurrency(amount: string | number): string {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('es-DO', { 
      style: 'currency', 
      currency: 'DOP' 
    }).format(num);
  }

  private formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString('es-DO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Construir contenido del ticket
  private buildTicket(order: PrintData): string {
    let ticket = '';
    
    // Inicializar
    ticket += this.commands.INIT;
    
    // Header centrado
    ticket += this.commands.CENTER;
    ticket += this.commands.SIZE_DOUBLE;
    ticket += this.commands.BOLD_ON;
    ticket += 'ORDEN DE SERVICIO\n';
    ticket += this.commands.BOLD_OFF;
    
    ticket += this.commands.SIZE_LARGE;
    ticket += order.orderNumber + '\n';
    ticket += this.commands.SIZE_NORMAL;
    
    ticket += this.formatDate(order.createdAt) + '\n';
    ticket += this.commands.DASHED_LINE + '\n';
    
    // Cliente
    ticket += this.commands.LEFT;
    ticket += this.commands.BOLD_ON;
    ticket += 'Cliente:\n';
    ticket += this.commands.BOLD_OFF;
    ticket += '  ' + order.customer.name + '\n';
    ticket += this.commands.BOLD_ON + 'Tel: ' + this.commands.BOLD_OFF;
    ticket += order.customer.phone + '\n';
    
    if (order.customer.address) {
      ticket += this.commands.BOLD_ON + 'Dir: ' + this.commands.BOLD_OFF;
      ticket += '\n  ' + order.customer.address + '\n';
    }
    
    ticket += this.commands.DASHED_LINE + '\n';
    
    // Estado y técnico
    const statusText = 
      order.status === 'pending' ? 'PENDIENTE' :
      order.status === 'processing' ? 'EN PROCESO' :
      order.status === 'completed' ? 'COMPLETADO' : 'CANCELADO';
    
    ticket += this.commands.BOLD_ON + 'Estado: ' + this.commands.BOLD_OFF;
    ticket += statusText + '\n';
    
    if (order.assignedUser) {
      ticket += this.commands.BOLD_ON + 'Tecnico: ' + this.commands.BOLD_OFF;
      ticket += order.assignedUser.name + '\n';
    }
    
    ticket += this.commands.DASHED_LINE + '\n';
    
    // Productos
    ticket += this.commands.BOLD_ON;
    ticket += 'PRODUCTOS:\n';
    ticket += this.commands.BOLD_OFF;
    
    order.items.forEach(item => {
      ticket += this.commands.BOLD_ON;
      ticket += item.product.name + '\n';
      ticket += this.commands.BOLD_OFF;
      
      const qty = `${item.quantity} x ${this.formatCurrency(item.unitPrice)}`;
      const total = this.formatCurrency(item.totalPrice);
      
      // Alinear cantidad y total
      const spaces = 32 - qty.length - total.length;
      ticket += '  ' + qty + ' '.repeat(Math.max(1, spaces)) + total + '\n';
      ticket += '................................\n';
    });
    
    ticket += this.commands.DASHED_LINE + '\n';
    
    // Total
    if (order.deliveryCost && parseFloat(order.deliveryCost) > 0) {
      const delivery = 'Entrega:';
      const deliveryAmt = this.formatCurrency(order.deliveryCost);
      const spaces = 32 - delivery.length - deliveryAmt.length;
      ticket += delivery + ' '.repeat(Math.max(1, spaces)) + deliveryAmt + '\n';
    }
    
    ticket += this.commands.SIZE_DOUBLE;
    ticket += this.commands.BOLD_ON;
    const totalLabel = 'TOTAL:';
    const totalAmt = this.formatCurrency(order.totalAmount);
    const totalSpaces = 16 - totalLabel.length - totalAmt.length/2;
    ticket += totalLabel + ' '.repeat(Math.max(1, totalSpaces)) + totalAmt + '\n';
    ticket += this.commands.BOLD_OFF;
    ticket += this.commands.SIZE_NORMAL;
    
    ticket += this.commands.DASHED_LINE + '\n';
    
    // Footer
    ticket += this.commands.CENTER;
    ticket += '\nGracias por su preferencia!\n';
    
    if (order.notes) {
      ticket += '\nNota: ' + order.notes + '\n';
    }
    
    // QR Code (opcional)
    ticket += this.generateQRCode(order.orderNumber);
    
    // Espacios y corte
    ticket += '\n\n\n';
    ticket += this.commands.CUT;
    
    return ticket;
  }

  // Generar comando QR Code ESC/POS
  private generateQRCode(data: string): string {
    // Comando para QR Code (varía según modelo)
    // Este es para impresoras compatibles con ESC/POS QR
    const qrData = `ORD:${data}`;
    return `${this.GS}(k\x04\x00\x31\x41\x32\x00${this.GS}(k${String.fromCharCode(qrData.length + 3)}\x00\x31\x50\x30${qrData}${this.GS}(k\x03\x00\x31\x51\x30`;
  }

  // Método 1: Usar Web Serial API (Chrome/Edge)
  async printViaSerial(order: PrintData): Promise<void> {
    try {
      // @ts-ignore - Web Serial API
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });
      
      const ticket = this.buildTicket(order);
      const writer = port.writable.getWriter();
      
      await writer.write(this.encoder.encode(ticket));
      await writer.close();
      await port.close();
      
      console.log('✅ Impresión exitosa');
    } catch (error) {
      console.error('❌ Error en impresión serial:', error);
      throw error;
    }
  }

  // Método 2: Usar endpoint backend
  async printViaBackend(order: PrintData): Promise<void> {
    try {
      const response = await fetch('/api/print/thermal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket: this.buildTicket(order),
          printerName: 'THERMAL_PRINTER' // Configurar en backend
        })
      });
      
      if (!response.ok) {
        throw new Error('Error en impresión backend');
      }
      
      console.log('✅ Impresión enviada al backend');
    } catch (error) {
      console.error('❌ Error en impresión backend:', error);
      throw error;
    }
  }

  // Método 3: Generar archivo para descarga (fallback)
  downloadTicket(order: PrintData): void {
    const ticket = this.buildTicket(order);
    const blob = new Blob([ticket], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `ticket-${order.orderNumber}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Uso en orders.tsx:
/*
const printer = new ThermalPrinter();

const handlePrint = async (order: OrderWithDetails) => {
  try {
    // Opción 1: Web Serial API (requiere permiso del usuario)
    await printer.printViaSerial(order);
    
    // Opción 2: Backend
    // await printer.printViaBackend(order);
    
    toast({
      title: "Impresión exitosa",
      description: "Ticket enviado a la impresora"
    });
  } catch (error) {
    toast({
      title: "Error de impresión",
      description: "Verifica que la impresora esté conectada",
      variant: "destructive"
    });
  }
};
*/