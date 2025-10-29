// server/print-routes.ts - Versión multi-método para impresoras Bluetooth
import { Express } from 'express';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export function setupPrintRoutes(app: Express) {
  
  // POST /api/print/thermal - Imprimir en impresora térmica
  app.post('/api/print/thermal', async (req, res) => {
    try {
      console.log('📥 Body recibido:', req.body);
      
      const { ticket } = req.body;
      
      if (!ticket) {
        return res.status(400).json({ error: 'Ticket data required' });
      }

      const tempDir = path.join(process.cwd(), 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const timestamp = Date.now();
      const tempFile = path.join(tempDir, `ticket-${timestamp}.txt`);
      
      // Escribir como binario puro
      fs.writeFileSync(tempFile, ticket, 'binary');
      
      console.log(`✅ Ticket guardado en: ${tempFile}`);

      try {
        if (process.platform === 'win32') {
          // Buscar impresora POS58
          const { stdout } = await execAsync(
            'wmic printer where "name like \'%POS58%\'" get name,portname /value'
          );
          
          const nameMatch = stdout.match(/Name=(.+)/);
          const portMatch = stdout.match(/PortName=(.+)/);
          
          const printerName = nameMatch ? nameMatch[1].trim() : 'POS58 Printer(2)';
          const portName = portMatch ? portMatch[1].trim() : null;
          
          console.log(`🖨️ Impresora: ${printerName}`);
          console.log(`🔌 Puerto: ${portName}`);
          
          // Método 1: Si es puerto COM, escribir directamente
          if (portName && portName.startsWith('COM')) {
            console.log(`📡 Intentando escritura directa a ${portName}...`);
            
            try {
              // Leer el contenido binario
              const data = fs.readFileSync(tempFile);
              
              // Escribir directamente al puerto COM
              fs.writeFileSync(portName, data);
              
              console.log(`✅ Impreso directamente en ${portName}`);
              
              setTimeout(() => {
                try { fs.unlinkSync(tempFile); } catch {}
              }, 3000);
              
              return res.json({
                success: true,
                method: 'COM-Direct',
                printer: printerName,
                port: portName
              });
            } catch (comError) {
              console.log(`⚠️ Error en COM directo:`, comError);
            }
          }
          
          // Método 2: Comando print de Windows
          console.log('📝 Intentando con comando print...');
          const printCmd = `print /D:"${printerName}" "${tempFile}"`;
          await execAsync(printCmd);
          
          console.log('✅ Impreso con comando print');
          
          setTimeout(() => {
            try { fs.unlinkSync(tempFile); } catch {}
          }, 3000);
          
          return res.json({
            success: true,
            method: 'Windows-Print',
            printer: printerName,
            port: portName
          });
        }
        
        throw new Error('Solo Windows soportado');
        
      } catch (printError: any) {
        console.error('❌ Error al imprimir:', printError.message);
        
        // Fallback: guardar archivo
        const printsDir = path.join(process.cwd(), 'prints');
        if (!fs.existsSync(printsDir)) {
          fs.mkdirSync(printsDir, { recursive: true });
        }
        
        const printFile = path.join(printsDir, `ticket-${timestamp}.txt`);
        fs.copyFileSync(tempFile, printFile);
        fs.unlinkSync(tempFile);
        
        console.log(`💾 Guardado en: ${printFile}`);
        
        res.json({
          success: true,
          method: 'File',
          file: printFile,
          message: `No se pudo imprimir: ${printError.message}`
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

  // GET /api/print/list-printers - Listar impresoras con puertos
  app.get('/api/print/list-printers', async (req, res) => {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync(
          'wmic printer get name,default,printerstatus,portname /format:csv'
        );
        
        const lines = stdout.split('\n').filter(l => l.trim() && !l.startsWith('Node'));
        const printers = lines.map(line => {
          const [, defaultVal, name, portName, status] = line.split(',');
          return {
            name: name?.trim(),
            isDefault: defaultVal?.trim() === 'TRUE',
            status: parseInt(status?.trim() || '0'),
            port: portName?.trim()
          };
        }).filter(p => p.name);
        
        return res.json({ printers, method: 'wmic' });
      }

      res.json({ printers: [] });
      
    } catch (error: any) {
      res.status(500).json({
        error: 'Error listando impresoras',
        details: error.message
      });
    }
  });

  // GET /api/print/test
  app.get('/api/print/test', async (req, res) => {
    try {
      const testTicket = 
        '\x1B\x40' +
        '\x1B\x61\x01' +
        '\x1D\x21\x11' +
        'TEST TICKET\n' +
        '\x1D\x21\x00' +
        'Impresora funcionando\n' +
        '\n\n' +
        '\x1D\x56\x00';
      
      const response = await fetch('http://localhost:5000/api/print/thermal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket: testTicket })
      });
      
      const result = await response.json();
      res.json({ success: true, message: 'Test enviado', result });
      
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}