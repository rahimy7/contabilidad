/**
 * AI ORDER ANALYZER
 * ---------------------------------------------------------
 * Analiza un mensaje del cliente y determina:
 *  - intención (pedido, pregunta, catálogo, saludo, etc.)
 *  - productos y cantidades
 *  - respuesta contextual personalizada
 *
 * Se apoya en AIQueryGateway y en fuzzy search para productos reales.
 */

import OpenAI from "openai";
import { AIQueryGateway } from "./ai-query-gateway";
import { searchSimilarProducts } from "../utils/fuzzy-product-search"; // ✅ ruta corregida

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Estructura del resultado del análisis
 */
export interface AIOrderInterpretation {
  intent: "order" | "question" | "catalog" | "greeting" | "unknown";
  items: {
    productId?: number;
    productName: string;
    quantity: number;
    suggestedProduct?: any;
  }[];
  message: string;
  confidence: number;
}

/**
 * Analizar mensaje con IA
 */
export async function interpretOrderMessage(
  messageText: string,
  tenantStorage: any,
  storeId: number
): Promise<AIOrderInterpretation> {
  try {
    // 1️⃣ Obtener resumen de productos reales
    const productSummary = await AIQueryGateway.getProductSummaryForAI(tenantStorage, 50);
    const catalogUrl = AIQueryGateway.getCatalogUrl(storeId);

    // 2️⃣ Generar prompt base
    const systemPrompt = `
Eres un asistente de pedidos para una tienda llamada "Más Que Salud".
Tu tarea es interpretar mensajes de WhatsApp y responder en formato JSON.

Catálogo disponible:
${productSummary}

Responde SOLO en formato JSON con el siguiente esquema:
{
  "intent": "order" | "question" | "catalog" | "greeting" | "unknown",
  "items": [
    { "productName": string, "quantity": number }
  ],
  "message": string
}

Reglas:
- Si el cliente pregunta por un producto que no existe → intent: "catalog" y sugiere el link: ${catalogUrl}
- Si es un saludo (ej. hola, bendiciones, buenas) → intent: "greeting"
- Si es una pregunta general (precio, disponibilidad) → intent: "question"
- Si menciona productos o cantidades → intent: "order"
- Sé claro, breve y amable.
`;

    // 3️⃣ Ejecutar modelo IA
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: messageText }
      ]
    });

    const raw = completion.choices[0].message?.content?.trim();
    if (!raw) throw new Error("No response from model");

    // 4️⃣ Parsear JSON
    const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
    const parsed = JSON.parse(jsonText);

    // 5️⃣ Buscar productos reales con fuzzy matching
    const allProducts = await tenantStorage.getAllProducts();
    const activeProducts = allProducts.filter((p: any) => p.isActive);
    const items = [];

    for (const it of parsed.items || []) {
      const query = it.productName?.trim();
      let found = null;

      // Buscar por código o nombre exacto
      found = await AIQueryGateway.getProductByCodeOrName(tenantStorage, query);

      // Si no encuentra, usar fuzzy matching
      if (!found) {
        const matches = searchSimilarProducts(query, activeProducts, 0.55); // 🔍 tolerante
        if (matches.length > 0) found = matches[0];
      }

      items.push({
        productId: found?.id,
        productName: it.productName,
        quantity: it.quantity || 1,
        suggestedProduct: found
      });
    }

    // 6️⃣ Generar mensaje final según los resultados
    let responseMessage = parsed.message;

    const foundCount = items.filter(i => i.suggestedProduct).length;

    if (parsed.intent === "catalog" || foundCount === 0) {
      responseMessage = `No encontré esos productos. Puedes ver nuestro catálogo aquí:\n${catalogUrl}`;
    } else if (parsed.intent === "order" && foundCount > 0) {
      const summary = items
        .filter(i => i.suggestedProduct)
        .map(i => `${i.quantity} ${i.productName}`)
        .join(" y ");
      responseMessage = `Perfecto, agregué ${summary} a tu pedido. ¿Deseas confirmar?`;
    } else if (parsed.intent === "greeting") {
      responseMessage = "¡Hola! 😊 Bienvenido a Más Que Salud. ¿Qué deseas ordenar hoy?";
    }

    return {
      intent: parsed.intent,
      items,
      message: responseMessage,
      confidence: 0.9
    };
  } catch (error) {
    console.error("❌ Error interpretando mensaje:", error);
    return {
      intent: "unknown",
      items: [],
      message: "No entendí tu mensaje. ¿Podrías decirme qué deseas ordenar?",
      confidence: 0.2
    };
  }
}
