/**
 * utils/fuzzy-product-search.ts
 * ------------------------------------
 * Búsqueda difusa inteligente de productos.
 * - Ignora mayúsculas/minúsculas, acentos y espacios.
 * - Devuelve coincidencias ordenadas por similitud.
 * - Ideal para interpretación de pedidos por chat.
 */

import Fuse from "fuse.js";

// 🔹 Normaliza texto eliminando tildes y caracteres especiales
export function normalizeText(text: string): string {
  return text
    ?.normalize("NFD")
    ?.replace(/[\u0300-\u036f]/g, "")
    ?.replace(/[^\w\s]/g, "")
    ?.toLowerCase()
    ?.trim();
}

export interface ProductMatch {
  id: number;
  name: string;
  price?: number | string;
  image?: string | null;
  score: number; // 0 = exacto, 1 = muy diferente
}

/**
 * Realiza una búsqueda difusa sobre la lista de productos
 */
export function searchProductsByName(
  query: string,
  products: any[],
  limit: number = 5
): ProductMatch[] {
  if (!query || !products?.length) return [];

  const fuse = new Fuse(products, {
    includeScore: true,
    threshold: 0.4, // Sensibilidad (más alto = más tolerante)
    ignoreLocation: true,
    keys: [
      { name: "name", weight: 0.7 },
      { name: "description", weight: 0.2 },
      { name: "category", weight: 0.1 },
    ],
  });

  const results = fuse.search(normalizeText(query));

  return results.slice(0, limit).map((r) => ({
    id: r.item.id,
    name: r.item.name,
    price: r.item.price,
    image: r.item.images?.[0] || null,
    score: r.score ?? 1,
  }));
}

/**
 * Encuentra el producto más probable a partir de un mensaje del cliente.
 * Ejemplo: "Quiero 2 Renuvo y 1 RioVida"
 */
export function extractProductMatchesFromMessage(
  message: string,
  products: any[],
  minConfidence = 0.65
): ProductMatch[] {
  const normalized = normalizeText(message);
  if (!normalized) return [];

  const words = normalized.split(/\s+/);
  const matches: ProductMatch[] = [];

  // Buscar coincidencias de productos dentro del texto
  for (const product of products) {
    const name = normalizeText(product.name);
    if (!name) continue;

    // Si alguna palabra clave aparece dentro del nombre o viceversa
    if (words.some((w) => name.includes(w) || w.includes(name))) {
      matches.push({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.images?.[0] || null,
        score: 0.1,
      });
    }
  }

  // Si no hay coincidencias simples, usar búsqueda difusa
  if (matches.length === 0) {
    const fuzzy = searchProductsByName(message, products, 5);
    return fuzzy.filter((p) => 1 - p.score >= minConfidence);
  }

  return matches;
}

/**
 * Devuelve los 3 productos más parecidos al texto proporcionado
 */
export function getTopSuggestions(
  query: string,
  products: any[],
  limit = 3
): ProductMatch[] {
  const results = searchProductsByName(query, products, limit);
  return results.sort((a, b) => a.score - b.score);
}

// Ejemplo rápido de uso
if (process.argv[1]?.includes("fuzzy-product-search.ts")) {
  const sampleProducts = [
    { id: 1, name: "4Life Transfer Factor Renuvo", price: 70 },
    { id: 2, name: "T.F. RioVida (1 botella)", price: 62 },
    { id: 3, name: "Pro-TF Chocolate", price: 92 },
  ];

  const test = "Quiero 2 Renuvó y 1 Riovita";
  const result = extractProductMatchesFromMessage(test, sampleProducts);
  console.log("🧠 Resultado fuzzy:", result);
}
