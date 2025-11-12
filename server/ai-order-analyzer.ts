/**
 * AI ORDER ANALYZER V2 🚀
 * ---------------------------------------------------------
 * Analiza mensajes del cliente, recuerda el carrito,
 * muestra imágenes y precios, y confirma pedidos automáticamente.
 */

import OpenAI from "openai";
import { AIQueryGateway } from "./ai-query-gateway";
import { extractProductMatchesFromMessage } from "../utils/fuzzy-product-search";
import { createOrderFromCart } from "./ai-order-assistant";

import { TenantStorage } from "./storage";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  messageText: string,
  tenantStorage: TenantStorage,
  storeId: number,
  conversation?: any,
  customer?: any
): Promise<AIOrderInterpretation> {
  try {
    const productSummary = await AIQueryGateway.getProductSummaryForAI(tenantStorage, 50);
    const catalogUrl = AIQueryGateway.getCatalogUrl(storeId);

    // 🎯 PROMPT mejorado: reconoce errores y confirmaciones
    const systemPrompt = `
Eres un asistente de pedidos para una tienda llamada "Más Que Salud".
Analiza mensajes de WhatsApp y responde en formato JSON según este esquema:
{
  "intent": "order" | "question" | "catalog" | "greeting" | "confirm" | "unknown",
  "items": [
    { "productName": string, "quantity": number }
  ],
  "message": string
}
Reglas:
- Si el cliente dice "sí", "confirmo", "dale", "ok", "hazlo", "realízalo" → intent: "confirm"
- Si pregunta por productos que no existen → intent: "catalog" y sugiere el link ${catalogUrl}
- Si es un saludo → intent: "greeting"
- Si menciona cantidades o productos → intent: "order"
- Si escribe con errores ortográficos, interpreta inteligentemente (ej. "renubo" = Renuvo, "riovita" = RioVida).
- Sé breve, natural y amable.
- Catálogo (resumen): ${productSummary}
`;

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
    const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
    const parsed = JSON.parse(jsonText);

    // 🔎 Buscar productos reales
    const allProducts = await tenantStorage.getAllProducts();
    const activeProducts = allProducts.filter((p: any) => p.is_active !== false);
    const items: any[] = [];

    for (const it of parsed.items || []) {
      const query = it.productName?.trim();
      let found = await AIQueryGateway.getProductByCodeOrName(tenantStorage, query);
      if (!found) {
        const matches = extractProductMatchesFromMessage(query, activeProducts);
        if (matches.length > 0) found = matches[0];
      }
      items.push({
        productId: found?.id,
        productName: it.productName,
        quantity: it.quantity || 1,
        suggestedProduct: found
      });
    }

    let responseMessage = parsed.message;
    const foundCount = items.filter(i => i.suggestedProduct).length;

    // 💬 Mensajes dinámicos enriquecidos con imágenes
    if (parsed.intent === "catalog" || foundCount === 0) {
      responseMessage = `🛍️ No encontré esos productos. Mira todo nuestro catálogo aquí:\n${catalogUrl}`;
    }
    else if (parsed.intent === "order" && foundCount > 0) {
      const productLines = items.map(i => {
        const p = i.suggestedProduct;
        return `🧾 *${p.name}*\n💲 ${p.price} DOP\n📦 Cantidad: ${i.quantity}\n🖼️ ${p.image || p.images?.[0] || "sin imagen"}`;
      }).join("\n\n");
      responseMessage = `Perfecto 😄, agregué los siguientes productos a tu carrito:\n\n${productLines}\n\n¿Deseas confirmar tu pedido ahora?`;
      if (conversation) conversation.cartItems = items;
    }
    else if (parsed.intent === "confirm") {
      if (conversation?.cartItems?.length > 0 && customer) {
        const order = await createOrderFromCart(conversation.cartItems, customer, storeId, tenantStorage);
        responseMessage = `✅ Tu pedido #${order.orderNumber} ha sido confirmado.\nTotal: ${order.totalAmount} DOP.\nGracias por tu compra 🛍️`;
        conversation.cartItems = [];
      } else {
        responseMessage = `No tienes ningún pedido pendiente por confirmar 😊`;
      }
    }
    else if (parsed.intent === "greeting") {
      responseMessage = "¡Hola! 😊 Bienvenido a *Más Que Salud*. ¿Qué deseas ordenar hoy?";
    }

    return {
      intent: parsed.intent,
      items,
      message: responseMessage,
      confidence: 0.95
    };
  } catch (error) {
    console.error("❌ Error interpretando mensaje:", error);
    return {
      intent: "unknown",
      items: [],
      message: "No entendí tu mensaje 😅. ¿Podrías repetirlo?",
      confidence: 0.2
    };
  }
}


