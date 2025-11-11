/**
 * TEST SCRIPT - Sistema de IA
 * 
 * Script para probar las funcionalidades de IA sin necesidad de enviar
 * mensajes reales de WhatsApp
 */

import {
  interpretMessage,
  processTextMessage,
  validateAIConfiguration
} from './ai-service';

// ========================================
// MENSAJES DE PRUEBA
// ========================================

const TEST_MESSAGES = {
  // Saludos
  greetings: [
    "Hola",   
    "Buenos días",
    "Qué tal?",
    "Hey, cómo están?"
  ],
  
  // Pedidos
  orders: [
    "Quiero ordenar 2 pizzas grandes",
    "Me das 3 hamburguesas con papas",
    "Necesito un combo familiar",
    "Quiero pedir delivery"
  ],
  
  // Preguntas
  questions: [
    "Cuánto cuesta una pizza?",
    "Tienen delivery?",
    "Cuál es el horario?",
    "Entregan a Los Mina?",
    "Aceptan tarjeta?"
  ],
  
  // Quejas
  complaints: [
    "No me ha llegado mi pedido",
    "La comida llegó fría",
    "Me cobraron de más",
    "Esto no es lo que pedí"
  ],
  
  // Otros
  others: [
    "Gracias",
    "Ok perfecto",
    "Entendido",
    "Dale"
  ]
};

// ========================================
// FUNCIONES DE PRUEBA
// ========================================

/**
 * Probar análisis de intención
 */
async function testIntentAnalysis(): Promise<void> {
  console.log('\n🧪 ==========================================');
  console.log('   TEST: ANÁLISIS DE INTENCIÓN');
  console.log('==========================================\n');
  
  for (const [category, messages] of Object.entries(TEST_MESSAGES)) {
    console.log(`\n📂 Categoría esperada: ${category.toUpperCase()}`);
    console.log('─'.repeat(50));
    
    for (const message of messages) {
      try {
        const interpretation = await interpretMessage(message);
        
        console.log(`\n💬 Mensaje: "${message}"`);
        console.log(`   ├─ Intención detectada: ${interpretation.intent}`);
        console.log(`   ├─ Categoría: ${interpretation.category}`);
        console.log(`   ├─ Sentimiento: ${interpretation.sentiment}`);
        console.log(`   ├─ Confianza: ${(interpretation.confidence * 100).toFixed(0)}%`);
        
        if (interpretation.entities.products?.length) {
          console.log(`   ├─ Productos: ${interpretation.entities.products.join(', ')}`);
        }
        if (interpretation.entities.quantity) {
          console.log(`   ├─ Cantidad: ${interpretation.entities.quantity}`);
        }
        
        const match = interpretation.category === category;
        console.log(`   └─ ${match ? '✅ CORRECTO' : '❌ INCORRECTO'}`);
        
      } catch (error: any) {
        console.error(`   ❌ Error: ${error.message}`);
      }
    }
  }
}

/**
 * Probar generación de respuestas
 */
async function testResponseGeneration(): Promise<void> {
  console.log('\n🧪 ==========================================');
  console.log('   TEST: GENERACIÓN DE RESPUESTAS');
  console.log('==========================================\n');
  
  const testCases = [
    {
      message: "Hola, buenos días",
      context: {
        customerId: 1,
        customerName: "Juan Pérez",
        recentMessages: []
      }
    },
    {
      message: "Quiero 2 pizzas grandes",
      context: {
        customerId: 2,
        customerName: "María García",
        recentMessages: [
          { role: 'user' as const, content: "Hola", timestamp: new Date() }
        ],
        orderHistory: [{ id: 1, total: 500 }]
      }
    },
    {
      message: "No me ha llegado mi pedido",
      context: {
        customerId: 3,
        customerName: "Carlos Rodríguez",
        recentMessages: [
          { role: 'user' as const, content: "Hice un pedido hace 2 horas", timestamp: new Date() }
        ],
        orderHistory: [{ id: 2, total: 750 }]
      }
    }
  ];
  
  for (const testCase of testCases) {
    try {
      console.log(`\n💬 Mensaje: "${testCase.message}"`);
      console.log(`👤 Cliente: ${testCase.context.customerName}`);
      console.log('─'.repeat(50));
      
      const result = await processTextMessage(testCase.message, testCase.context);
      
      console.log(`\n📊 Análisis:`);
      console.log(`   ├─ Categoría: ${result.interpretation.category}`);
      console.log(`   ├─ Intención: ${result.interpretation.intent}`);
      console.log(`   ├─ Sentimiento: ${result.interpretation.sentiment}`);
      console.log(`   └─ Confianza: ${(result.interpretation.confidence * 100).toFixed(0)}%`);
      
      console.log(`\n💡 Respuesta sugerida:`);
      console.log(`   "${result.suggestedResponse}"`);
      
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }
}

/**
 * Probar extracción de entidades
 */
async function testEntityExtraction(): Promise<void> {
  console.log('\n🧪 ==========================================');
  console.log('   TEST: EXTRACCIÓN DE ENTIDADES');
  console.log('==========================================\n');
  
  const testMessages = [
    "Quiero 3 pizzas hawaianas y 2 coca colas",
    "Dame 5 empanadas de pollo por favor",
    "Necesito 1 combo familiar con papas grandes",
    "Envíalo a Calle Principal #25, Los Mina",
    "Mi teléfono es 809-555-1234"
  ];
  
  for (const message of testMessages) {
    try {
      console.log(`\n💬 Mensaje: "${message}"`);
      console.log('─'.repeat(50));
      
      const interpretation = await interpretMessage(message);
      const entities = interpretation.entities;
      
      if (entities.products?.length) {
        console.log(`   🍕 Productos: ${entities.products.join(', ')}`);
      }
      if (entities.quantity) {
        console.log(`   🔢 Cantidad: ${entities.quantity}`);
      }
      if (entities.location) {
        console.log(`   📍 Ubicación: ${entities.location}`);
      }
      if (entities.phoneNumber) {
        console.log(`   📱 Teléfono: ${entities.phoneNumber}`);
      }
      
      if (!entities.products?.length && !entities.quantity && 
          !entities.location && !entities.phoneNumber) {
        console.log(`   ℹ️ No se encontraron entidades`);
      }
      
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }
}

/**
 * Probar análisis de sentimiento
 */
async function testSentimentAnalysis(): Promise<void> {
  console.log('\n🧪 ==========================================');
  console.log('   TEST: ANÁLISIS DE SENTIMIENTO');
  console.log('==========================================\n');
  
  const testCases = [
    { message: "Excelente servicio! Me encantó todo", expected: 'positive' },
    { message: "La comida está horrible y fría", expected: 'negative' },
    { message: "Ok, está bien", expected: 'neutral' },
    { message: "¡Gracias! Todo perfecto 🥰", expected: 'positive' },
    { message: "Esto es una porquería, no vuelvo", expected: 'negative' }
  ];
  
  for (const testCase of testCases) {
    try {
      console.log(`\n💬 Mensaje: "${testCase.message}"`);
      console.log(`📊 Sentimiento esperado: ${testCase.expected}`);
      console.log('─'.repeat(50));
      
      const interpretation = await interpretMessage(testCase.message);
      
      const match = interpretation.sentiment === testCase.expected;
      const icon = interpretation.sentiment === 'positive' ? '😊' : 
                   interpretation.sentiment === 'negative' ? '😞' : '😐';
      
      console.log(`   ${icon} Sentimiento detectado: ${interpretation.sentiment}`);
      console.log(`   ${match ? '✅ CORRECTO' : '⚠️ DIFERENTE'}`);
      
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }
}

/**
 * Benchmark de rendimiento
 */
async function testPerformance(): Promise<void> {
  console.log('\n🧪 ==========================================');
  console.log('   TEST: RENDIMIENTO');
  console.log('==========================================\n');
  
  const iterations = 5;
  const testMessage = "Quiero ordenar 2 pizzas grandes con extra queso";
  
  console.log(`Procesando ${iterations} mensajes...`);
  
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    
    try {
      await interpretMessage(testMessage);
      const duration = Date.now() - start;
      times.push(duration);
      
      console.log(`   Iteración ${i + 1}: ${duration}ms`);
    } catch (error: any) {
      console.error(`   ❌ Error en iteración ${i + 1}: ${error.message}`);
    }
  }
  
  if (times.length > 0) {
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    
    console.log(`\n📊 Resultados:`);
    console.log(`   ├─ Promedio: ${avg.toFixed(0)}ms`);
    console.log(`   ├─ Más rápido: ${min}ms`);
    console.log(`   └─ Más lento: ${max}ms`);
  }
}

// ========================================
// EJECUTAR TODOS LOS TESTS
// ========================================

async function runAllTests(): Promise<void> {
  console.log('\n🚀 ==========================================');
  console.log('   INICIANDO SUITE DE PRUEBAS DE IA');
  console.log('==========================================');
  
  // Verificar configuración
  console.log('\n🔍 Verificando configuración...');
  const isConfigured = validateAIConfiguration();
  
  if (!isConfigured) {
    console.error('\n❌ ERROR: Sistema de IA no está configurado correctamente');
    console.error('Por favor configura OPENAI_API_KEY en tu archivo .env');
    return;
  }
  
  console.log('✅ Configuración válida\n');
  
  try {
    // Ejecutar tests
    await testIntentAnalysis();
    await testEntityExtraction();
    await testResponseGeneration();
    await testSentimentAnalysis();
    await testPerformance();
    
    console.log('\n✅ ==========================================');
    console.log('   TODOS LOS TESTS COMPLETADOS');
    console.log('==========================================\n');
    
  } catch (error: any) {
    console.error('\n❌ ERROR EJECUTANDO TESTS:', error.message);
  }
}

// ========================================
// TESTS INDIVIDUALES
// ========================================

export const aiTests = {
  runAll: runAllTests,
  testIntentAnalysis,
  testEntityExtraction,
  testResponseGeneration,
  testSentimentAnalysis,
  testPerformance
};

// Ejecutar si es el módulo principal
// Compatible con ES modules
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  runAllTests()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Error fatal:', error);
      process.exit(1);
    });
}

export default aiTests;
