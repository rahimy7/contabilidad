/**
 * AI PRODUCT SEARCH
 *
 * Búsqueda inteligente de productos para IA
 */
import { Router, Request, Response } from 'express';
import { getTenantStorageWithSchema } from './routes';

// ========================================
// FUNCIÓN REUTILIZABLE PARA IA Y ENDPOINTS
// ========================================

/**
 * Calcula score de similitud entre query y texto
 */
function calculateRelevanceScore(query: string, name: string, description: string = ''): number {
  const q = query.toLowerCase().trim();
  const n = name.toLowerCase();
  const d = description.toLowerCase();
  let score = 0;

  // 1. Coincidencia exacta completa (máxima prioridad)
  if (n === q) return 1000;
  
  // 2. Nombre contiene query completo
  if (n.includes(q)) {
    score += 100;
    // Bonus si está al inicio
    if (n.startsWith(q)) score += 50;
  }
  
  // 3. Descripción contiene query
  if (d.includes(q)) score += 30;
  
  // 4. Coincidencia de palabras individuales
  const queryWords = q.split(/\s+/).filter(w => w.length >= 3);
  const nameWords = n.split(/\s+/);
  const descWords = d.split(/\s+/);
  
  for (const qWord of queryWords) {
    // Palabra completa en nombre
    if (nameWords.some(w => w === qWord)) score += 40;
    // Palabra parcial en nombre
    else if (nameWords.some(w => w.includes(qWord) || qWord.includes(w))) score += 20;
    
    // Palabra en descripción
    if (descWords.some(w => w.includes(qWord) || qWord.includes(w))) score += 10;
  }
  
  // 5. Coincidencia por prefijo (primeras letras)
  if (q.length >= 3) {
    const prefix = q.substring(0, 3);
    if (n.startsWith(prefix)) score += 15;
    
    // Buscar prefijo en cada palabra del nombre
    if (nameWords.some(w => w.startsWith(prefix))) score += 10;
  }
  
  // 6. Similitud fonética (calcio → cal, calcium → cal)
  const phonetics: Record<string, string[]> = {
    'calcio': ['cal', 'calcium', 'ca'],
    'magnesio': ['mag', 'magnesium', 'mg'],
    'vitamina': ['vit', 'vitamin'],
    'proteina': ['prot', 'protein'],
    'omega': ['omg', 'w3', 'w-3']
  };
  
  for (const [key, synonyms] of Object.entries(phonetics)) {
    if (q.includes(key) || synonyms.some(s => q.includes(s))) {
      if (synonyms.some(s => n.includes(s)) || n.includes(key)) {
        score += 35;
      }
    }
  }

  return score;
}

export async function searchProducts(query: string, storeId: number) {
  const tenantStorage = await getTenantStorageWithSchema({ storeId } as any);
  const allProducts = await tenantStorage.getAllProducts();
  const active = allProducts.filter((p: any) => p.isActive);

  const q = String(query || '').toLowerCase().trim();
  
  // Calcular score de relevancia para cada producto
  const productsWithScore = active.map((p: any) => ({
    product: p,
    score: calculateRelevanceScore(q, p.name || '', p.description || '')
  }));
  
  // Filtrar productos con score > 0 y ordenar por score descendente
  const matches = productsWithScore
    .filter(ps => ps.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(ps => ps.product);
  
  console.log(`🔍 Búsqueda inteligente para "${q}": ${matches.length} resultados`);
  if (matches.length > 0) {
    console.log(`   Top 3: ${matches.slice(0, 3).map((p: any) => p.name).join(', ')}`);
  }

  return matches.map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    category: p.category,
    brand: p.brand,
    imageUrl: p.imageUrl,
    isActive: p.isActive
  }));
}

const router = Router();

/**
 * POST /api/ai/search-products
 * Busca productos usando IA basándose en descripción del cliente
 */
router.post('/ai/search-products', async (req: Request, res: Response) => {
  try {
    const { query, storeId } = req.body;

    if (!query || !storeId) {
      return res.status(400).json({ error: 'Query y storeId son requeridos' });
    }

    console.log(`🔍 Búsqueda IA: "${query}" para tienda ${storeId}`);

    const results = await searchProducts(query, Number(storeId));
    res.json({
      success: true,
      query,
      matchCount: results.length,
      products: results
    });
  } catch (error: any) {
    console.error('❌ Error en búsqueda de productos:', error);
    res.status(500).json({ error: 'Error al buscar productos', details: error.message });
  }
});

/**
 * GET /api/products/search?q=texto&storeId=#
 * Búsqueda tradicional por texto
 */
router.get('/products/search', async (req: Request, res: Response) => {
  try {
    const { q, storeId } = req.query;
    if (!q || !storeId) {
      return res.status(400).json({ error: 'Parámetros q y storeId son requeridos' });
    }

    const results = await searchProducts(String(q), parseInt(String(storeId)));
    res.json({ success: true, query: q, matchCount: results.length, products: results });
  } catch (error: any) {
    console.error('❌ Error en búsqueda simple:', error);
    res.status(500).json({ error: 'Error al buscar productos', details: error.message });
  }
});

/**
 * GET /api/products/category/:category?storeId=#
 * Obtiene productos de una categoría específica
 */
router.get('/products/category/:category', async (req: Request, res: Response) => {
  try {
    const { category } = req.params;
    const { storeId } = req.query;
    if (!storeId) {
      return res.status(400).json({ error: 'storeId es requerido' });
    }

    const tenantStorage = await getTenantStorageWithSchema({ storeId: parseInt(String(storeId)) } as any);
    const products = await tenantStorage.getProductsByCategory(category);

    res.json({ success: true, category, matchCount: products.length, products });
  } catch (error: any) {
    console.error('❌ Error obteniendo productos por categoría:', error);
    res.status(500).json({ error: 'Error al obtener productos', details: error.message });
  }
});

/**
 * GET /api/products/categories?storeId=#
 * Lista todas las categorías con productos
 */
router.get('/products/categories', async (req: Request, res: Response) => {
  try {
    const { storeId } = req.query;
    if (!storeId) {
      return res.status(400).json({ error: 'storeId es requerido' });
    }

    const tenantStorage = await getTenantStorageWithSchema({ storeId: parseInt(String(storeId)) } as any);
    const allProducts = await tenantStorage.getAllProducts();

    const categories = [...new Set(allProducts.map((p: any) => p.category).filter(Boolean))];
    const categoriesWithCount = categories.map((cat: string) => ({
      name: cat,
      count: allProducts.filter((p: any) => p.category === cat && p.isActive).length
    }));

    res.json({ success: true, categories: categoriesWithCount });
  } catch (error: any) {
    console.error('❌ Error obteniendo categorías:', error);
    res.status(500).json({ error: 'Error al obtener categorías', details: error.message });
  }
});

export default router;
