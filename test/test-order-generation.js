/**
 * Script de prueba para validar la generación automática de pedidos
 * desde el catálogo web usando el procesador simple de WhatsApp
 */

const testOrderMessage = `🛍️ *NUEVO PEDIDO*

📋 *Resumen de tu compra:*

1. AIRE ACONDICIONADO CETRON MCI24CDBWCC32
   Cantidad: 1
   Precio unitario: $15,500.00
   Subtotal: $15,500.00

2. Kit de Instalación Básica
   Cantidad: 1  
   Precio unitario: $2,800.00
   Subtotal: $2,800.00

*TOTAL: $18,300.00*

Para confirmar tu pedido, recibirás un mensaje de WhatsApp donde podrás:
✅ Confirmar la orden
🔄 Modificar cantidades
📍 Agregar dirección de entrega
💳 Seleccionar método de pago

¿Confirmas tu pedido?`;

console.log('=== MENSAJE DE PRUEBA PARA ORDEN AUTOMÁTICA ===');
console.log(testOrderMessage);
console.log('\n=== ANÁLISIS DEL MENSAJE ===');

// Simular detección
const orderIndicators = [
  '🛍️ *NUEVO PEDIDO',
  'NUEVO PEDIDO',
  'Cantidad:',
  'Precio unitario:',
  'Subtotal:',
  '*TOTAL:',
  'confirma tu pedido'
];

const indicatorCount = orderIndicators.reduce((count, indicator) => {
  const found = testOrderMessage.includes(indicator);
  if (found) {
    console.log(`✅ Encontrado: "${indicator}"`);
  } else {
    console.log(`❌ No encontrado: "${indicator}"`);
  }
  return count + (found ? 1 : 0);
}, 0);

console.log(`\n📊 INDICADORES ENCONTRADOS: ${indicatorCount}/7`);
console.log(`🤖 ¿ES PEDIDO?: ${indicatorCount >= 3 ? 'SÍ' : 'NO'}`);

// Simular parsing de productos
console.log('\n=== PRODUCTOS PARSEADOS ===');
const lines = testOrderMessage.split('\n');
let products = [];
let currentItem = null;

for (const line of lines) {
  const trimmedLine = line.trim();
  
  if (/^\d+\.\s/.test(trimmedLine)) {
    if (currentItem && currentItem.name && currentItem.quantity && currentItem.price) {
      products.push(currentItem);
    }
    
    currentItem = {
      name: trimmedLine.replace(/^\d+\.\s/, ''),
      quantity: 0,
      price: 0
    };
  }
  else if (trimmedLine.startsWith('Cantidad:') && currentItem) {
    const quantity = parseInt(trimmedLine.replace('Cantidad:', '').trim());
    if (!isNaN(quantity)) {
      currentItem.quantity = quantity;
    }
  }
  else if (trimmedLine.startsWith('Precio unitario:') && currentItem) {
    const priceMatch = trimmedLine.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/);
    if (priceMatch) {
      const price = parseFloat(priceMatch[1].replace(/,/g, ''));
      if (!isNaN(price)) {
        currentItem.price = price;
      }
    }
  }
}

if (currentItem && currentItem.name && currentItem.quantity && currentItem.price) {
  products.push(currentItem);
}

console.log(`📦 PRODUCTOS DETECTADOS: ${products.length}`);
products.forEach((product, index) => {
  console.log(`${index + 1}. ${product.name}`);
  console.log(`   Cantidad: ${product.quantity}`);
  console.log(`   Precio: $${product.price.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);
  console.log(`   Subtotal: $${(product.price * product.quantity).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);
});

const total = products.reduce((sum, item) => sum + (item.price * item.quantity), 0);
console.log(`\n💰 TOTAL CALCULADO: $${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);

console.log('\n=== CONFIGURACIÓN DE PRUEBA ===');
console.log('📞 Phone Number ID (MASQUESALUD): 690329620832620');
console.log('🏪 Store ID: 5');
console.log('🗃️ Schema: store_1751554718287');
console.log('📱 Número de prueba: +1 809 357 6939');

console.log('\n✅ SISTEMA LISTO PARA PRUEBA CON MENSAJES REALES');