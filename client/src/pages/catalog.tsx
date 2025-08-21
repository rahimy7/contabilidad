// client/src/pages/catalog.tsx - Modificaciones para multimoneda

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCurrency } from '@/hooks/useCurrency';
import { CurrencySelector } from '@/components/CurrencySelector';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Heart, ShoppingCart, DollarSign } from 'lucide-react';

interface Product {
  id: number;
  name: string;
  price: string;
  baseCurrency: string;
  salePrice?: string;
  description: string;
  category: string;
  imageUrl?: string;
  availability: string;
}

// Componente ProductCard actualizado
const ProductCard: React.FC<{ product: Product }> = ({ product }) => {
  const { convertProduct, formatCurrency, selectedCurrency } = useCurrency();
  const convertedProduct = convertProduct(product);

  const hasDiscount = convertedProduct.convertedSalePrice && 
    convertedProduct.convertedSalePrice < convertedProduct.convertedPrice;

  return (
    <Card className="group hover:shadow-lg transition-shadow">
      <CardContent className="p-4">
        {/* Imagen */}
        <div className="relative mb-3">
          <img 
            src={product.imageUrl || '/placeholder-product.jpg'}
            alt={product.name}
            className="w-full h-48 object-cover rounded-lg"
          />
          {hasDiscount && (
            <Badge className="absolute top-2 left-2 bg-red-500">
              OFERTA
            </Badge>
          )}
          {convertedProduct.conversionApplied && (
            <Badge variant="outline" className="absolute top-2 right-2 text-xs">
              <DollarSign className="w-3 h-3 mr-1" />
              {selectedCurrency}
            </Badge>
          )}
        </div>

        {/* Información del producto */}
        <div className="space-y-2">
          <h3 className="font-semibold text-sm line-clamp-2">{product.name}</h3>
          
          {/* Precios */}
          <div className="flex items-center gap-2">
            {hasDiscount ? (
              <>
                <span className="text-lg font-bold text-green-600">
                  {convertedProduct.formattedSalePrice}
                </span>
                <span className="text-sm text-gray-500 line-through">
                  {convertedProduct.formattedPrice}
                </span>
              </>
            ) : (
              <span className="text-lg font-bold">
                {convertedProduct.formattedPrice}
              </span>
            )}
          </div>

          {/* Indicador de moneda base si es diferente */}
          {convertedProduct.conversionApplied && (
            <div className="text-xs text-gray-500">
              Base: {formatCurrency(parseFloat(product.price), product.baseCurrency)}
            </div>
          )}

          <p className="text-sm text-gray-600 line-clamp-2">
            {product.description}
          </p>

          {/* Botones */}
          <div className="flex gap-2 pt-2">
            <Button size="sm" className="flex-1">
              <ShoppingCart className="w-4 h-4 mr-2" />
              Agregar
            </Button>
            <Button size="sm" variant="outline">
              <Heart className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Componente principal del catálogo
export default function Catalog() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [priceRange, setPriceRange] = useState({ min: '', max: '' });
  const { selectedCurrency, convertPrice } = useCurrency();

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['/api/products'],
  });

  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ['/api/categories'],
  });

  // Filtrar productos con conversión de precios para rangos
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      // Filtro por término de búsqueda
      if (searchTerm && !product.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }

      // Filtro por categoría
      if (selectedCategory !== 'all' && product.category !== selectedCategory) {
        return false;
      }

      // Filtro por rango de precio (convertido a moneda actual)
      if (priceRange.min || priceRange.max) {
        const convertedPrice = convertPrice(
          parseFloat(product.price), 
          product.baseCurrency || 'DOP'
        );

        if (priceRange.min && convertedPrice < parseFloat(priceRange.min)) {
          return false;
        }
        if (priceRange.max && convertedPrice > parseFloat(priceRange.max)) {
          return false;
        }
      }

      return true;
    });
  }, [products, searchTerm, selectedCategory, priceRange, convertPrice]);

  if (isLoading) {
    return <div className="flex justify-center p-8">Cargando productos...</div>;
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header con selector de moneda */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Catálogo de Productos</h1>
          <p className="text-gray-600">
            {filteredProducts.length} productos en {selectedCurrency}
          </p>
        </div>
        <CurrencySelector showRates />
      </div>

      {/* Filtros */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        {/* Búsqueda */}
        <input
          type="text"
          placeholder="Buscar productos..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="p-2 border rounded-md"
        />

        {/* Categoría */}
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="p-2 border rounded-md"
        >
          <option value="all">Todas las categorías</option>
          {categories.map(category => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>

        {/* Rango de precio */}
        <input
          type="number"
          placeholder={`Precio mín. (${selectedCurrency})`}
          value={priceRange.min}
          onChange={(e) => setPriceRange(prev => ({ ...prev, min: e.target.value }))}
          className="p-2 border rounded-md"
        />
        <input
          type="number"
          placeholder={`Precio máx. (${selectedCurrency})`}
          value={priceRange.max}
          onChange={(e) => setPriceRange(prev => ({ ...prev, max: e.target.value }))}
          className="p-2 border rounded-md"
        />
      </div>

      {/* Grid de productos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredProducts.map(product => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

      {filteredProducts.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No se encontraron productos con los filtros aplicados</p>
        </div>
      )}
    </div>
  );
}