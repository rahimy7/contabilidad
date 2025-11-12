/**
 * TEST SCRIPT - Sistema de IA Delivery
 *
 * Permite probar las funcionalidades de IA (interpretación, intención, sentimiento, etc.)
 * sin necesidad de enviar mensajes reales por WhatsApp ni levantar el servidor completo.
 */

import dotenv from 'dotenv';
dotenv.config();

import { fileURLToPath } from 'url';
import path from 'path';


import {
  interpretMessage,
  processTextMessage,
  validateAIConfiguration
} from './ai-service';
import { getTenantStorageWithSchema } from './routes';

// ========================================
// INICIALIZACIÓN DE TENANT STORAGE
// ========================================

console.log('\n🏪 Inicializando entorno de pruebas de IA...');
const tenantStorage = await getTenantStorageWithSchema({
  storeId: 6,
  schema: `store_6`
});

console.log('✅ Tenant storage inicializado correctamente.\n');

// ========================================
// MENSAJES DE PRUEBA
// ========================================

const TEST_MESSAGES = {
  greetings: ['Hola', 'Buenos días', 'Qué tal?', 'Hey, cómo están?'],
  orders: ['Quiero 2 Renuvo y 1 RioVida', 'Me das 3 hamburguesas', 'Necesito un combo familiar', 'Quiero pedir delivery'],
  questions: ['Cuánto cuesta un Renuvo?', 'Tienen delivery?', 'Cuál es el horario?', 'Entregan a Los Mina?', 'Aceptan tarjeta?'],
  complaints: ['No me ha llegado mi pedido', 'La comida llegó fría', 'Me cobraron de más', 'Esto no es lo que pedí'],
  others: ['Gracias', 'Ok perfecto', 'Entendido', 'Dale']
};

// ========================================
// FUNCIONES DE PRUEBA
// ========================================

async function testIntentAnalysis(): Promise<void> {
  console.log('\n🧪 TEST: ANÁLISIS DE INTENCIÓN\n');
  for (const [category, messages] of Object.entries(TEST_MESSAGES)) {
    console.log(`\n📂 Categoría esperada: ${category.toUpperCase()}`);
    console.log('─'.repeat(50));
    for (const message of messages) {
      try {
        const interpretation = await interpretMessage(message, tenantStorage);
        console.log(`💬 "${message}" → intención: ${interpretation.intent}, confianza: ${(interpretation.confidence * 100).toFixed(0)}%`);
      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
      }
    }
  }
}

async function testResponseGeneration(): Promise<void> {
  console.log('\n🧪 TEST: GENERACIÓN DE RESPUESTAS\n');
  const testCases = [
    { message: 'Hola, buenos días', context: { customerId: 1, customerName: 'Juan Pérez', recentMessages: [] } },
    { message: 'Quiero 2 Renuvo y 1 RioVida', context: { customerId: 2, customerName: 'María García', recentMessages: [] } },
    { message: 'No me ha llegado mi pedido', context: { customerId: 3, customerName: 'Carlos Rodríguez', recentMessages: [] } }
  ];

  for (const testCase of testCases) {
    console.log(`\n💬 Mensaje: "${testCase.message}"`);
    console.log(`👤 Cliente: ${testCase.context.customerName}`);
    console.log('─'.repeat(50));
    const result = await processTextMessage(testCase.message, { ...testCase.context, tenantStorage });
    console.log(`📊 Intención: ${result.interpretation.intent} (${(result.interpretation.confidence * 100).toFixed(0)}%)`);
    console.log(`💡 Respuesta sugerida: "${result.suggestedResponse}"`);
  }
}

async function testEntityExtraction(): Promise<void> {
  console.log('\n🧪 TEST: EXTRACCIÓN DE ENTIDADES\n');
  const testMessages = [
    'Quiero 3 Renuvo y 2 RioVida',
    'Dame 5 Transfer Factor Plus',
    'Necesito 1 GluCoach por favor'
  ];
  for (const message of testMessages) {
    const interpretation = await interpretMessage(message, tenantStorage);
    console.log(`💬 "${message}"`);
    console.log(`   🧾 Productos: ${interpretation.entities.products?.join(', ') || '—'}`);
    console.log(`   🔢 Cantidad: ${interpretation.entities.quantity || '—'}`);
  }
}

async function testSentimentAnalysis(): Promise<void> {
  console.log('\n🧪 TEST: ANÁLISIS DE SENTIMIENTO\n');
  const cases = [
    { msg: 'Excelente servicio! Me encantó todo', expected: 'positive' },
    { msg: 'La comida está horrible', expected: 'negative' },
    { msg: 'Ok, está bien', expected: 'neutral' }
  ];
  for (const c of cases) {
    const i = await interpretMessage(c.msg, tenantStorage);
    console.log(`💬 "${c.msg}" → ${i.sentiment} (${(i.confidence * 100).toFixed(0)}%) ${i.sentiment === c.expected ? '✅' : '⚠️'}`);
  }
}

async function testPerformance(): Promise<void> {
  console.log('\n🧪 TEST: RENDIMIENTO\n');
  const message = 'Quiero 2 Renuvo y 1 RioVida';
  const runs = 5;
  const times: number[] = [];

  for (let i = 0; i < runs; i++) {
    const t0 = Date.now();
    await interpretMessage(message, tenantStorage);
    const t = Date.now() - t0;
    times.push(t);
    console.log(`   Iteración ${i + 1}: ${t}ms`);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`📊 Promedio: ${avg.toFixed(1)}ms`);
}

// ========================================
// EJECUCIÓN PRINCIPAL
// ========================================

async function runAllTests() {
  console.log('\n🚀 INICIANDO SUITE DE PRUEBAS DE IA DELIVERY\n');

  const isConfigured = validateAIConfiguration();
  if (!isConfigured) {
    console.error('❌ Faltan credenciales de IA. Configura OPENAI_API_KEY en .env');
    return;
  }

  await testIntentAnalysis();
  await testEntityExtraction();
  await testResponseGeneration();
  await testSentimentAnalysis();
  await testPerformance();

  console.log('\n✅ TODOS LOS TESTS COMPLETADOS\n');
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  runAllTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Error fatal:', err);
      process.exit(1);
    });
}

export default {
  runAllTests,
  testIntentAnalysis,
  testEntityExtraction,
  testResponseGeneration,
  testSentimentAnalysis,
  testPerformance
};
