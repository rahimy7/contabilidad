/**
 * Fuzzy Product Search (v2 mejorada)
 * ----------------------------------
 * Coincidencias por similitud, tokenización y normalización avanzada.
 */

import levenshtein from "fast-levenshtein";

export interface Product {
  id: number;
  name: string;
  description?: string;
  category?: string;
  brand?: string;
  price?: string;
  image_url?: string;
  is_active?: boolean;
}

function normalize(text: string) {
  return text
    ?.toLowerCase()
    ?.normalize("NFD")
    ?.replace(/[\u0300-\u036f]/g, "") // quitar acentos
    ?.replace(/[^a-z0-9\s]/g, "") // quitar símbolos
    ?.replace(/\b(4life|tf|t f|transfer factor)\b/g, "") // quitar prefijos comunes
    ?.replace(/\s+/g, " ")
    ?.trim();
}

function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  const distance = levenshtein.get(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - distance / maxLen;
}

export function searchSimilarProducts(
  query: string,
  products: Product[],
  threshold: number = 0.55
): Product[] {
  const normalizedQuery = normalize(query);
  const queryTokens = normalizedQuery.split(/\s+/);
  const results: { product: Product; score: number }[] = [];
console.log(`🧠 FuzzySearch recibió ${products.length} productos`);
console.log(`📋 Primeros nombres:`, products.slice(0, 5).map(p => p.name));

  for (const p of products) {
    const textCombined = normalize(
      [p.name, p.description, p.category, p.brand].filter(Boolean).join(" ")
    );
    const productTokens = textCombined.split(/\s+/);

    let maxScore = 0;
    // comparar cada palabra del query con cada palabra del producto
    for (const qt of queryTokens) {
      for (const pt of productTokens) {
        const s = similarity(qt, pt);
        if (s > maxScore) maxScore = s;
      }
    }

    // ajustar el threshold dinámicamente
    const adjustedThreshold = normalizedQuery.length < 6 ? 0.45 : threshold;

    if (maxScore >= adjustedThreshold) {
      results.push({ product: p, score: maxScore });
    }
  }

  // ordenar por score descendente
  results.sort((a, b) => b.score - a.score);

  // 🔍 depuración
  if (results.length === 0) {
    console.log(`⚠️ No se encontró coincidencia fuzzy para "${query}"`);
  } else {
    console.log(`🧩 Coincidencias fuzzy para "${query}":`);
    for (const r of results.slice(0, 5)) {
      console.log(`   → ${r.product.name} (${(r.score * 100).toFixed(1)}%)`);
    }
  }

  return results.map(r => r.product);
}
