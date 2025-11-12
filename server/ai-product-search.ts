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

export async function searchProducts(query: string, storeId: number) {
  const tenantStorage = await getTenantStorageWithSchema({ storeId } as any);
  const allProducts = await tenantStorage.getAllProducts();
  const active = allProducts.filter((p: any) => p.isActive);

  const q = String(query || '').toLowerCase();
  const matches = active.filter(
    (p: any) =>
      p.name?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q)
  );

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
