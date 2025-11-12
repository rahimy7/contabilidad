/**
 * AI ORDER ANALYZER V2 🚀
 * ---------------------------------------------------------
 * Analiza mensajes del cliente, recuerda el carrito,
 * muestra imágenes y precios, y confirma pedidos automáticamente.
 */

import OpenAI from "openai";
import { AIQueryGateway } from "./ai-query-gateway";
import { extractProductMatchesFromMessage } from "../utils/fuzzy-product-search";


import { TenantStorage } from "./storage";



export type OrderInterpretation = {
  intent: 'add_to_cart' | 'confirm_order' | 'ask_question' | 'search_product' | 'other';
  items: Array<{ productId: number; quantity: number; productName?: string }>;
  message: string;
  confidence: number;
};


const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function smartProductSearch(query: string, storeId: number) {
  const normalized = query.trim().toLowerCase();
  const baseUrl = process.env.API_BASE_URL || "http://localhost:5000/api";
  let found: any[] = [];

  console.log(`\n🧠 [SMART-SEARCH] Buscando productos relacionados con: "${query}"`);

  // 1️⃣ Búsqueda directa en API
  try {
    const url = `${baseUrl}/products/search?q=${encodeURIComponent(normalized)}&storeId=${storeId}`;
    const resp = await fetch(url);
    found = await resp.json();

    if (found?.length > 0) {
      console.log(`✅ [SMART-SEARCH] ${found.length} resultados encontrados directamente.`);
      return { products: found, strategy: "direct", suggestions: [] };
    }
  } catch (err) {
    console.error("❌ [SMART-SEARCH] Error en búsqueda directa:", err);
  }

  // 2️⃣ Si no hay resultados, intentar con IA (corrección y sinónimos)
  try {
    console.log("🤖 [SMART-SEARCH] Activando modo IA para sugerencias semánticas...");
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Eres un asistente experto en productos 4Life. Corrige errores ortográficos y sugiere nombres similares."
        },
        {
          role: "user",
          content: `Encuentra nombres de productos parecidos o corregidos a: "${query}". Devuelve solo nombres o palabras clave, separados por comas.`
        }
      ],
    });

    const suggestionText = aiResponse.choices[0]?.message?.content || "";
    const suggestions = suggestionText
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    console.log("💡 [SMART-SEARCH] Sugerencias IA:", suggestions);

    // 3️⃣ Reintentar búsqueda con cada sugerencia
    for (const term of suggestions) {
      const url = `${baseUrl}/products/search?q=${encodeURIComponent(term)}&storeId=${storeId}`;
      const retry = await fetch(url);
      const retryData = await retry.json();

      if (retryData?.length > 0) {
        console.log(`✅ [SMART-SEARCH] Coincidencia encontrada con término sugerido: "${term}"`);
        return { products: retryData, strategy: "ai-suggested", suggestions };
      }
    }

    // 4️⃣ Si no encuentra nada, devolver sugerencias
    console.warn("⚠️ [SMART-SEARCH] Sin resultados, devolviendo sugerencias IA.");
    return { products: [], strategy: "none", suggestions };
  } catch (error) {
    console.error("❌ [SMART-SEARCH] Error al usar IA:", error);
    return { products: [], strategy: "error", suggestions: [] };
  }
}

export interface AIOrderInterpretation {
  intent: "order" | "question" | "catalog" | "greeting" | "confirm" | "unknown";
  items: {
    productId?: number;
    productName: string;
    quantity: number;
    suggestedProduct?: any;
  }[];
  message: string;
  confidence: number;
}

export async function interpretOrderMessage(
  text: string,
  tenantStorage: any,
  storeId: number = 6
): Promise<OrderInterpretation> {
  const lower = text.toLowerCase();

  // ==========================================
  // 1️⃣ Búsqueda de productos (híbrida con IA)
  // ==========================================
  const { products, strategy, suggestions } = await smartProductSearch(text, storeId);

  const items: Array<{ productId: number; quantity: number; productName?: string }> = [];

  // ==========================================
  // 2️⃣ Detección de cantidades
  // ==========================================
  for (const p of products) {
    const name = String(p.name ?? "").toLowerCase();
    if (!name) continue;

    // Buscar coincidencia de "N producto"
    const qtyMatch = lower.match(
      new RegExp(`(\\d+)\\s+${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}`)
    );
    const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

    // Solo agregar si el producto aparece o se sugiere semánticamente
    if (lower.includes(name) || strategy === "ai-suggested") {
      items.push({ productId: p.id, quantity, productName: p.name });
    }
  }

  // ==========================================
  // 3️⃣ Determinar intención
  // ==========================================
  let intent: OrderInterpretation["intent"] = "ask_question";
  if (items.length > 0) intent = "add_to_cart";
  else if (suggestions.length > 0) intent = "search_product";


  // ==========================================
  // 4️⃣ Generar mensaje de respuesta
  // ==========================================
  let message = "";
  if (intent === "add_to_cart") {
    message =
      items.length === 1
        ? `Detecté ${items[0].quantity} unidad(es) de ${items[0].productName}.`
        : `Detecté los siguientes productos:\n${items
            .map((i) => `• ${i.quantity} × ${i.productName}`)
            .join("\n")}`;
  } else if (intent === "search_product" && suggestions.length > 0) {
    message = `No encontré coincidencias exactas, pero quizás quisiste decir: ${suggestions.join(
      ", "
    )}.`;
  } else {
    message = "No encontré productos claros en tu mensaje.";
  }

  // ==========================================
  // 5️⃣ Retornar interpretación final
  // ==========================================
  return {
    intent,
    items,
    message,
    confidence:
      intent === "add_to_cart"
        ? 0.9
        : intent === "search_product"
        ? 0.75
        : 0.5,
  };
}
