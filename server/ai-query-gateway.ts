/**
 * AI QUERY GATEWAY (Extended)
 * -----------------------------------------------------
 * Capa segura de consultas a la base de datos para la IA,
 * con soporte de búsqueda semántica y coincidencias difusas.
 */
import "dotenv/config";

import OpenAI from "openai";
import { TenantStorage } from "./storage";

// Usa tu misma clave OpenAI ya configurada en variables de entorno
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ==========================================
// 🔧 Utilidades base
// ==========================================

function normalize(text: string): string {
  return text?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";
}

function matchesQuery(name: string, query: string): boolean {
  const n = normalize(name);
  const q = normalize(query);
  return n.includes(q) || q.split(" ").every(w => n.includes(w));
}

// ==========================================
// 🧩 GATEWAY PRINCIPAL
// ==========================================

export const AIQueryGateway = {
  /**
   * 🔹 Obtener todos los productos activos
   */
  async getActiveProducts(tenantStorage: TenantStorage) {
    const products = await tenantStorage.getAllProducts();
    return products.filter((p: any) => p.isActive);
  },

  /**
   * 🔹 Buscar producto por nombre, código o categoría
   */
  async getProductByCodeOrName(tenantStorage: TenantStorage, query: string) {
    const products = await this.getActiveProducts(tenantStorage);
    const q = normalize(query);

    const result = products.find(
      (p: any) =>
        matchesQuery(p.name, q) ||
        matchesQuery(p.code || "", q) ||
        matchesQuery(p.category || "", q)
    );

    return result || null;
  },

  /**
   * 🔍 Búsqueda avanzada (texto libre)
   * Combina: coincidencias directas + búsqueda semántica.
   */
  async smartSearch(tenantStorage: TenantStorage, query: string, storeId: number) {
    const products = await this.getActiveProducts(tenantStorage);

    // Paso 1: coincidencia directa
    const directMatches = products.filter(
      (p: any) =>
        matchesQuery(p.name, query) ||
        matchesQuery(p.description || "", query) ||
        matchesQuery(p.category || "", query)
    );

    if (directMatches.length > 0) return directMatches;

    // Paso 2: búsqueda semántica (usando embeddings)
    try {
      const textList = products.map((p: any) => `${p.name} - ${p.description || ""}`);
      const queryEmbedding = await this.getEmbedding(query);
      const productEmbeddings = await this.getProductEmbeddings(products, textList);

      // Calcular similitud coseno
      const scored = productEmbeddings.map((emb: any, i: number) => ({
        product: products[i],
        score: this.cosineSimilarity(queryEmbedding, emb)
      }));

      const sorted = scored.sort((a, b) => b.score - a.score);
      const best = sorted.filter(p => p.score > 0.80).map(p => p.product);

      if (best.length > 0) return best;

      return [];
    } catch (err) {
      console.error("⚠️ Error en búsqueda semántica:", err);
      return [];
    }
  },

  /**
   * 🧮 Obtener embeddings de productos (solo nombres + descripciones)
   */
  async getProductEmbeddings(products: any[], textList?: string[]) {
    const texts = textList || products.map((p: any) => `${p.name} - ${p.description || ""}`);
    const embeddings = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: texts
    });
    return embeddings.data.map(e => e.embedding);
  },

  /**
   * 🧠 Obtener embedding de una consulta
   */
  async getEmbedding(text: string) {
    const res = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text
    });
    return res.data[0].embedding;
  },

  /**
   * 📏 Calcular similitud coseno entre dos vectores
   */
  cosineSimilarity(a: number[], b: number[]) {
    const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
    const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
    return dot / (magA * magB);
  },

  /**
   * 📜 Obtener resumen del catálogo para la IA
   */
  async getProductSummaryForAI(tenantStorage: TenantStorage, limit = 50) {
    const products = await this.getActiveProducts(tenantStorage);
    return products
      .slice(0, limit)
      .map((p: any) => `${p.name} - ${p.price} DOP (${p.category || "sin categoría"})`)
      .join("\n");
  },

  /**
   * 🧾 Últimos pedidos del cliente
   */
  async getRecentOrders(tenantStorage: TenantStorage, customerId: number, limit = 5) {
    if (!tenantStorage.getOrdersByCustomer) return [];
    const orders = await tenantStorage.getOrdersByCustomer(customerId);
    return orders
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  },

  /**
   * 🔗 Enlace del catálogo público
   */
  getCatalogUrl(storeId: number) {
    return `https://delivery-web-production.up.railway.app/simple-catalog?store=${storeId}`;
  }
};
