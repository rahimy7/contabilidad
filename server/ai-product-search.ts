/**
 * AI PRODUCT SEARCH
 *
 * Búsqueda inteligente de productos para IA
 */

import { Router, Request, Response } from 'express';
import { getTenantStorageWithSchema } from './routes';



export async function searchProducts(query: string, storeId: number) {
  const { getTenantStorageWithSchema } = await import('./routes');
  const tenantStorage = await getTenantStorageWithSchema({ storeId } as any);

  // Obtener productos activos
  const allProducts = await tenantStorage.getAllProducts();
  const activeProducts = allProducts.filter((p: any) => p.isActive);

  // Buscar coincidencias por nombre o descripción
  const matches = activeProducts.filter((p: any) =>
    p.name.toLowerCase().includes(query.toLowerCase()) ||
    p.description?.toLowerCase().includes(query.toLowerCase())
  );

  // Formatear respuesta
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

// ========================================
// ENDPOINT: Búsqueda de productos para IA
// ========================================

/**
 * POST /api/ai/search-products
 *
 * Busca productos usando IA basándose en descripción del cliente
 */
router.post('/ai/search-products', async (req: Request, res: Response) => {
  try {
    const { query, storeId } = req.body;

    if (!query || !storeId) {
      return res.status(400).json({
        error: 'Query y storeId son requeridos'
      });
    }

    console.log(`🔍 Búsqueda IA: "${query}" para tienda ${storeId}`);

    // Obtener storage de la tienda
    const tenantStorage = await getTenantStorageWithSchema({ storeId } as any);

    // Obtener todos los productos activos
    const allProducts = await tenantStorage.getAllProducts();
    const activeProducts = allProducts.filter(p => p.isActive);

    // Buscar con IA
    const matches = await searchProducts(query, activeProducts as any);

    // Formatear respuesta
    const formattedMatches = matches.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      category: p.category,
      brand: p.brand,
      imageUrl: p.imageUrl
    }));

    res.json({
      success: true,
      query,
      matchCount: formattedMatches.length,
      products: formattedMatches
    });

  } catch (error: any) {
    console.error('❌ Error en búsqueda de productos:', error);
    res.status(500).json({
      error: 'Error al buscar productos',
      details: error.message
    });
  }
});

// ========================================
// ENDPOINT: Búsqueda simple (texto)
// ========================================

/**
 * GET /api/products/search?q=texto
 *
 * Búsqueda tradicional por texto
 */
router.get('/products/search', async (req: Request, res: Response) => {
  try {
    const { q, storeId } = req.query;

    if (!q || !storeId) {
      return res.status(400).json({
        error: 'Parámetros q y storeId son requeridos'
      });
    }

    const query = q as string;
    const tenantStorage = await getTenantStorageWithSchema({ storeId: parseInt(storeId as string) } as any);

    // Obtener todos los productos
    const allProducts = await tenantStorage.getAllProducts();

    // Filtrar por nombre o descripción
    const matches = allProducts.filter(p =>
      p.isActive &&
      (p.name.toLowerCase().includes(query.toLowerCase()) ||
       p.description?.toLowerCase().includes(query.toLowerCase()))
    );

    res.json({
      success: true,
      query,
      matchCount: matches.length,
      products: matches
    });

  } catch (error: any) {
    console.error('❌ Error en búsqueda simple:', error);
    res.status(500).json({
      error: 'Error al buscar productos',
      details: error.message
    });
  }
});

// ========================================
// ENDPOINT: Obtener productos por categoría
// ========================================

/**
 * GET /api/products/category/:category
 *
 * Obtiene productos de una categoría específica
 */
router.get('/products/category/:category', async (req: Request, res: Response) => {
  try {
    const { category } = req.params;
    const { storeId } = req.query;

    if (!storeId) {
      return res.status(400).json({
        error: 'storeId es requerido'
      });
    }

    const tenantStorage = await getTenantStorageWithSchema({ storeId: parseInt(storeId as string) } as any);

    // Obtener productos de la categoría
    const products = await tenantStorage.getProductsByCategory(category);

    res.json({
      success: true,
      category,
      matchCount: products.length,
      products
    });

  } catch (error: any) {
    console.error('❌ Error obteniendo productos por categoría:', error);
    res.status(500).json({
      error: 'Error al obtener productos',
      details: error.message
    });
  }
});

// ========================================
// ENDPOINT: Categorías disponibles
// ========================================

/**
 * GET /api/products/categories
 *
 * Lista todas las categorías con productos
 */
router.get('/products/categories', async (req: Request, res: Response) => {
  try {
    const { storeId } = req.query;

    if (!storeId) {
      return res.status(400).json({
        error: 'storeId es requerido'
      });
    }

    const tenantStorage = await getTenantStorageWithSchema({ storeId: parseInt(storeId as string) } as any);

    // Obtener todos los productos
    const allProducts = await tenantStorage.getAllProducts();

    // Extraer categorías únicas
    const categories = [...new Set(allProducts.map(p => p.category).filter(Boolean))];

    // Contar productos por categoría
    const categoriesWithCount = categories.map(cat => ({
      name: cat,
      count: allProducts.filter(p => p.category === cat && p.isActive).length
    }));

    res.json({
      success: true,
      categories: categoriesWithCount
    });

  } catch (error: any) {
    console.error('❌ Error obteniendo categorías:', error);
    res.status(500).json({
      error: 'Error al obtener categorías',
      details: error.message
    });
  }
});

export default router;
