#!/usr/bin/env node

// Script para migrar todas las llamadas sendWhatsAppMessage a sendWhatsAppMessageSmart

const fs = require('fs');
const path = require('path');

const routesFilePath = path.join(__dirname, 'server', 'routes.ts');

// Leer el archivo
let content = fs.readFileSync(routesFilePath, 'utf8');

// Lista de reemplazos a realizar
const replacements = [
  // Funciones críticas con parámetros disponibles
  {
    pattern: /await sendWhatsAppMessage\(phoneNumber,\s*response\.messageText\);/g,
    replacement: 'await sendWhatsAppMessageSmart(phoneNumber, response.messageText, storeId, phoneNumberId);',
    context: 'processAutoResponse'
  },
  {
    pattern: /await sendWhatsAppMessage\(from,\s*response\.messageText,\s*storeId\);/g,
    replacement: 'await sendWhatsAppMessageSmart(from, response.messageText, storeId, phoneNumberId);',
    context: 'processWhatsAppMessage'
  },
  {
    pattern: /await sendWhatsAppMessage\(phoneNumber,\s*welcomeResponse\.messageText\);/g,
    replacement: 'await sendWhatsAppMessageSmart(phoneNumber, welcomeResponse.messageText, storeId, phoneNumberId);',
    context: 'sendWelcomeMessage'
  },
  {
    pattern: /await sendWhatsAppMessage\(phoneNumber,\s*helpResponse\.messageText\);/g,
    replacement: 'await sendWhatsAppMessageSmart(phoneNumber, helpResponse.messageText, storeId, phoneNumberId);',
    context: 'sendHelpMenu'
  }
];

// Aplicar reemplazos
replacements.forEach(({ pattern, replacement, context }) => {
  const before = content;
  content = content.replace(pattern, replacement);
  if (content !== before) {
    console.log(`✓ Actualizado en contexto: ${context}`);
  }
});

// Guardar archivo actualizado
fs.writeFileSync(routesFilePath, content, 'utf8');

console.log('✓ Migración completada');
console.log('Revise los cambios en server/routes.ts');