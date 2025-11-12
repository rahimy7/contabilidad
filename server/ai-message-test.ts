/**
 * AI MESSAGE TEST
 * -----------------------------------------------------
 * Script de prueba para ejecutar la IA de pedidos
 * desde consola sin usar WhatsApp.
 *
 * ✅ Usa interpretOrderMessage() + AIQueryGateway
 * ✅ Obtiene productos reales del tenantStorage
 * ✅ Muestra interpretación y respuesta simulada
 */

import { interpretOrderMessage } from "./ai-order-analyzer";
import { getTenantStorage } from "./storage/index";
import { AICreditsManager } from "./ai-credits-manager";

const STORE_ID = 6; // 🔹 Cambia según la tienda a probar
const CUSTOMER_ID = 1; // 🔹 Cliente de prueba

async function runTest() {
  console.log("\n🚀 === PRUEBA DE INTEGRACIÓN IA DELIVERY ===\n");

  // 1️⃣ Crear tenantStorage
  const tenantStorage = await getTenantStorage(STORE_ID);

  // 2️⃣ Mensaje de prueba
  const messageText = process.argv[2] || "Quiero 2 Renuvo y 1 RioVida";

  console.log(`📩 Mensaje recibido: "${messageText}"`);
  console.log(`🏪 Tienda: ${STORE_ID}`);

  // 3️⃣ Verificar créditos antes de procesar
  const hasCredits = await AICreditsManager.hasCredits(STORE_ID, "message", tenantStorage);
  if (!hasCredits) {
    console.log("⚠️ No hay créditos disponibles para IA.");
    process.exit(0);
  }
const products = await tenantStorage.getAllProducts();
console.log(`🛒 Productos cargados: ${products.length}`);

  // 4️⃣ Analizar mensaje
  const interpretation = await interpretOrderMessage(
  messageText,
  products,         // ✅ lista real de productos
  tenantStorage,    // ✅ conexión tenant
  STORE_ID
);


  // 5️⃣ Mostrar resultado en consola
  console.log("\n🎯 RESULTADO DE INTERPRETACIÓN:");
  console.log(JSON.stringify(interpretation, null, 2));

  // 6️⃣ Simular respuesta al cliente
  console.log("\n💬 RESPUESTA AL CLIENTE:");
  console.log(interpretation.message);

  // 7️⃣ Simular consumo de créditos
  await AICreditsManager.consumeCredits(
    STORE_ID,
    "message",
    {
        operationType: "message_analysis",
        customerPhone: "18095551234",
        creditsCost: 1,
        inputText: messageText,
        outputText: interpretation.message,
        interpretation: JSON.stringify(interpretation),
        confidence: interpretation.confidence,
        wasSuccessful: true,
        storeId: 0
    },
    tenantStorage
  );

  console.log("\n💰 Créditos descontados correctamente ✅");
  console.log("\n🧾 Prueba completada con éxito.\n");
}

// Ejecutar
runTest().catch(err => {
  console.error("❌ Error durante la prueba:", err);
  process.exit(1);
});
