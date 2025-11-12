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
  intent: 'add_to_cart' | 'confirm_order' | 'ask_question' | 'other';
  items: Array<{ productId: number; quantity: number; productName?: string }>;
  message: string;
  confidence: number;
};

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

export async function interpretOrderMessage(text: string, tenantStorage: any): Promise<OrderInterpretation> {
  // 1) Detectar productos mencionados
  const all = await tenantStorage.getAllProducts(); // Debe devolver rows con id, name
  const lower = text.toLowerCase();

  const items: Array<{ productId: number; quantity: number; productName?: string }> = [];

  // regla básica: “N XNombre”
  for (const p of all) {
    const name = String(p.name ?? '').toLowerCase();
    if (!name) continue;
    if (lower.includes(name)) {
      // capturar cantidad simple
      const qtyMatch = lower.match(new RegExp(`(\\d+)\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

      items.push({ productId: p.id, quantity, productName: p.name });
    }
  }

  const intent: OrderInterpretation['intent'] = items.length > 0 ? 'add_to_cart' : 'ask_question';

  return {
    intent,
    items,
    message: intent === 'add_to_cart' ? 'Detecté productos en tu mensaje.' : 'No encontré productos claros.',
    confidence: items.length > 0 ? 0.85 : 0.5
  };
}


