// server/print-routes.ts
import { Express } from 'express';

// Configuración de la impresora
const PRINTER_CONFIG = {
  // Cambiar según tu impresora:
  vendorId: 0x0416,  // ID del fabricante (verificar con lsusb en Linux o Device Manager en Windows)
  productId: 0x5011, // ID del producto
  baudRate: 9600,
  // O usar nombre de impresora de Windows:
  windowsPrinterName: 'POS-58'
};

export function setupPrintRoutes(app: Express) {
  
  // POST /api/print/thermal - Imprimir en impresora térmica
  app.post('/api/print/thermal', async (req, res) => {
    try {
      const { ticket } = req.body;
      
      if (!ticket) {
        return res.status(400).json({ error: 'Ticket data required' });
      }

      // Opción 1: USB con escpos (Linux/Mac/Windows)
      try {
        const escpos = require('escpos');
        escpos.USB = require('escpos-usb');
        
        const device = new escpos.USB(
          PRINTER_CONFIG.vendorId,
          PRINTER_CONFIG.productId
        );
        
        const printer = new escpos.Printer(device);
        
        await new Promise((resolve, reject) => {
          device.open((error: any) => {
            if (error) {
              reject(error);
              return;
            }
            
            printer
              .font('a')
              .align('ct')
              .style('bu')
              .size(1, 1)
              .text(ticket)
              .cut()
              .close(() => resolve(true));
          });
        });
        
        res.json({ success: true, method: 'USB' });
        
      } catch (usbError) {
        console.log('USB failed, trying serial port...', usbError);
        
        // Opción 2: Puerto Serial (Bluetooth/USB-Serial)
        const { SerialPort } = require('serialport');
        
        // Detectar puerto automáticamente
        const ports = await SerialPort.list();
        const thermalPort = ports.find((p: any) => 
          p.manufacturer?.includes('USB') || 
          p.path.includes('COM') ||
          p.path.includes('ttyUSB')
        );
        
        if (!thermalPort) {
          throw new Error('No se encontró impresora térmica');
        }
        
        const port = new SerialPort({
          path: thermalPort.path,
          baudRate: PRINTER_CONFIG.baudRate
        });
        
        await new Promise((resolve, reject) => {
          port.write(ticket, (err: any) => {
            if (err) reject(err);
            else {
              port.drain(() => {
                port.close();
                resolve(true);
              });
            }
          });
        });
        
        res.json({ 
          success: true, 
          method: 'Serial',
          port: thermalPort.path 
        });
      }
      
    } catch (error: any) {
      console.error('Print error:', error);
      res.status(500).json({ 
        error: 'Error al imprimir',
        details: error.message 
      });
    }
  });

  // GET /api/print/test - Probar impresora
  app.get('/api/print/test', async (req, res) => {
    try {
      const testTicket = 
        '\x1B\x40' + // Init
        '\x1B\x61\x01' + // Center
        '\x1D\x21\x11' + // Double size
        'TEST TICKET\n' +
        '\x1D\x21\x00' + // Normal size
        'Impresora funcionando\n' +
        '\n\n' +
        '\x1D\x56\x00'; // Cut
      
      await fetch('http://localhost:5000/api/print/thermal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket: testTicket })
      });
      
      res.json({ success: true, message: 'Test enviado' });
      
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/print/list-ports - Listar puertos disponibles
  app.get('/api/print/list-ports', async (req, res) => {
    try {
      const { SerialPort } = require('serialport');
      const ports = await SerialPort.list();
      
      res.json({ 
        ports: ports.map((p: any) => ({
          path: p.path,
          manufacturer: p.manufacturer,
          serialNumber: p.serialNumber,
          productId: p.productId,
          vendorId: p.vendorId
        }))
      });
      
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}