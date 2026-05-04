import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Package,
  Search,
  Filter,
  Calendar,
  TrendingUp,
  TrendingDown,
  FileText,
  ShoppingCart,
  Truck,
  BarChart3,
  Download,
  AlertTriangle,
  ChevronRight,
  X,
  Layers,
} from "lucide-react";

interface InventoryMovement {
  id: number;
  storeId: number;
  productId: number | null;
  type: string;
  quantity: string;
  quantityBefore: string | null;
  quantityAfter: string | null;
  unitId: number | null;
  unitSymbol: string | null; // Símbolo de la unidad del movimiento
  unitName: string | null; // Nombre de la unidad del movimiento
  unitCost: string | null;
  totalCost: string | null;
  lotNumber: string | null;
  expirationDate: string | null;
  supplierId: number | null;
  referenceType: string | null;
  referenceId: number | null;
  reason: string | null;
  notes: string | null;
  createdBy: number;
  createdAt: string;
  productName?: string;
  supplierName?: string;
}

interface Product {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  stockQuantity: string;
}

interface ProductStock {
  productId: number;
  productName: string;
  sku: string | null;
  barcode: string | null;
  totalStock: number; // En unidad base
  baseUnitId: number | null;
  baseUnitSymbol: string | null;
  lotCount: number;
  nearestExpiration: string | null;
  expiringQuantity: number; // Cantidad que vence en los próximos 30 días
  lots: {
    lotNumber: string | null;
    quantity: number; // En unidad base
    expirationDate: string | null;
    manufacturingDate: string | null;
  }[];
}

interface ProductDetail {
  product: ProductStock;
  movements: InventoryMovement[];
}

export default function InventoryTraceability() {
  const [activeTab, setActiveTab] = useState<"stock" | "movements">("stock");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);

  // Movement filters
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [productFilter, setProductFilter] = useState<string>("");
  const [lotFilter, setLotFilter] = useState("");

  // Fetch inventory movements
  const { data: movements = [], isLoading } = useQuery<InventoryMovement[]>({
    queryKey: ["/api/inventory-movements", typeFilter, dateFrom, dateTo, productFilter, lotFilter],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.append("type", typeFilter);
      if (dateFrom) params.append("dateFrom", dateFrom);
      if (dateTo) params.append("dateTo", dateTo);
      if (productFilter) params.append("productId", productFilter);
      if (lotFilter) params.append("lotNumber", lotFilter);

      const response = await fetch(`/api/inventory-movements?${params}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!response.ok) throw new Error("Error al cargar movimientos");
      return response.json();
    },
  });

  // Fetch products for filter
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch("/api/products", {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        credentials: "include"
      });
      if (!response.ok) throw new Error("Error al cargar productos");
      return response.json();
    },
  });

  // Fetch inventory stock by lot
  const { data: stockData = [], isLoading: isLoadingStock } = useQuery<ProductStock[]>({
    queryKey: ["/api/inventory-stock"],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch("/api/inventory-stock", {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!response.ok) throw new Error("Error al cargar stock");
      return response.json();
    },
  });

  // Fetch movements for selected product
  const { data: productMovements = [] } = useQuery<InventoryMovement[]>({
    queryKey: ["/api/inventory-movements", "product", selectedProduct],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const params = new URLSearchParams();
      if (selectedProduct) params.append("productId", selectedProduct.toString());

      const response = await fetch(`/api/inventory-movements?${params}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!response.ok) throw new Error("Error al cargar movimientos");
      return response.json();
    },
    enabled: !!selectedProduct,
  });

  // Filter stock by search query — exclude services
  const filteredStock = stockData.filter((product) => {
    const matchesSearch =
      product.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.barcode?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // Products for filter dropdown — exclude services
  const tangibleProducts = (products as any[]).filter((p: any) => p.type !== 'service');

  // Filter movements by search query
  const filteredMovements = movements.filter((movement) => {
    const matchesSearch =
      movement.productName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      movement.supplierName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      movement.lotNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      movement.notes?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // Get selected product details
  const selectedProductData = selectedProduct
    ? stockData.find(p => p.productId === selectedProduct)
    : null;

  // Calculate summary stats
  const stats = {
    totalMovements: filteredMovements.length,
    purchases: filteredMovements.filter((m) => m.type === "purchase").length,
    sales: filteredMovements.filter((m) => m.type === "sale").length,
    adjustments: filteredMovements.filter((m) => m.type === "adjustment").length,
    returns: filteredMovements.filter((m) => m.type === "return").length,
    totalValue: filteredMovements
      .reduce((sum, m) => sum + parseFloat(m.totalCost || "0"), 0)
      .toFixed(2),
  };

  const getMovementIcon = (type: string) => {
    const icons = {
      purchase: { Icon: ShoppingCart, color: "text-green-600", bg: "bg-green-100" },
      sale: { Icon: TrendingDown, color: "text-blue-600", bg: "bg-blue-100" },
      adjustment: { Icon: BarChart3, color: "text-yellow-600", bg: "bg-yellow-100" },
      return: { Icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-100" },
      transfer: { Icon: Truck, color: "text-orange-600", bg: "bg-orange-100" },
    };
    const config = icons[type as keyof typeof icons] || icons.adjustment;
    const { Icon, color, bg } = config;
    return (
      <div className={`p-2 rounded-lg ${bg}`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
    );
  };

  const getMovementLabel = (type: string) => {
    const labels = {
      purchase: "Compra",
      sale: "Venta",
      adjustment: "Ajuste",
      return: "Devolución",
      transfer: "Transferencia",
    };
    return labels[type as keyof typeof labels] || type;
  };

  const getMovementBadge = (type: string) => {
    const badges = {
      purchase: "bg-green-100 text-green-800",
      sale: "bg-blue-100 text-blue-800",
      adjustment: "bg-yellow-100 text-yellow-800",
      return: "bg-purple-100 text-purple-800",
      transfer: "bg-orange-100 text-orange-800",
    };
    const badgeColor = badges[type as keyof typeof badges] || badges.adjustment;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badgeColor}`}>
        {getMovementLabel(type)}
      </span>
    );
  };

  const exportToCSV = () => {
    const headers = [
      "Fecha",
      "Tipo",
      "Producto",
      "Cantidad",
      "Stock Anterior",
      "Stock Nuevo",
      "Costo Unitario",
      "Costo Total",
      "Lote",
      "Vencimiento",
      "Proveedor",
      "Referencia",
      "Notas",
    ];

    const rows = filteredMovements.map((m) => [
      new Date(m.createdAt).toLocaleString("es-DO"),
      getMovementLabel(m.type),
      m.productName || "-",
      m.quantity,
      m.quantityBefore || "-",
      m.quantityAfter || "-",
      m.unitCost || "-",
      m.totalCost || "-",
      m.lotNumber || "-",
      m.expirationDate ? new Date(m.expirationDate).toLocaleDateString("es-DO") : "-",
      m.supplierName || "-",
      m.referenceType ? `${m.referenceType}-${m.referenceId}` : "-",
      m.notes || "-",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `trazabilidad_inventario_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Trazabilidad de Inventario</h1>
          <p className="text-gray-600 mt-1">
            {activeTab === "stock"
              ? "Stock actual de productos por lote"
              : "Historial completo de movimientos de productos"}
          </p>
        </div>
        <button
          onClick={exportToCSV}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
        >
          <Download className="w-5 h-5" />
          Exportar CSV
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab("stock")}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "stock"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Stock de Productos
              </div>
            </button>
            <button
              onClick={() => setActiveTab("movements")}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "movements"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Movimientos
              </div>
            </button>
          </nav>
        </div>
      </div>

      {/* Stock Tab Content */}
      {activeTab === "stock" && (
        <>
          {/* Stock Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Productos</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{filteredStock.length}</p>
                </div>
                <div className="bg-blue-100 p-3 rounded-lg">
                  <Package className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Stock Total</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {filteredStock.reduce((sum, p) => sum + p.totalStock, 0).toLocaleString("es-DO", { minimumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="bg-green-100 p-3 rounded-lg">
                  <Layers className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Stock Próximo a Vencer</p>
                  <p className="text-2xl font-bold text-orange-600 mt-1">
                    {filteredStock.reduce((sum, p) => sum + p.expiringQuantity, 0).toLocaleString("es-DO", { minimumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="bg-orange-100 p-3 rounded-lg">
                  <AlertTriangle className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Productos por Vencer</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">
                    {filteredStock.filter(p => p.expiringQuantity > 0).length}
                  </p>
                </div>
                <div className="bg-red-100 p-3 rounded-lg">
                  <Calendar className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Search Bar */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar producto por nombre, SKU o código de barras..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Stock Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Stock de Productos ({filteredStock.length})
              </h2>

              {isLoadingStock ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="text-gray-600 mt-4">Cargando stock...</p>
                </div>
              ) : filteredStock.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay productos en stock</h3>
                  <p className="text-gray-600">No se encontraron productos con stock disponible</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Producto</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Stock Total</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">Lotes</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Vencimiento Próximo</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Cant. a Vencer</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredStock.map((product) => {
                        const today = new Date();
                        const thirtyDaysFromNow = new Date(today);
                        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

                        const isExpiringSoon = product.nearestExpiration &&
                          new Date(product.nearestExpiration) <= thirtyDaysFromNow;

                        return (
                          <tr
                            key={product.productId}
                            className="hover:bg-gray-50 cursor-pointer"
                            onClick={() => setSelectedProduct(product.productId)}
                          >
                            <td className="px-4 py-4">
                              <div className="text-sm font-medium text-gray-900">{product.productName}</div>
                              {product.sku && (
                                <div className="text-xs text-gray-500">SKU: {product.sku}</div>
                              )}
                              {product.barcode && (
                                <div className="text-xs text-gray-500">Código: {product.barcode}</div>
                              )}
                            </td>
                            <td className="px-4 py-4 text-right">
                              <div className="text-sm font-semibold text-gray-900">
                                {product.totalStock.toLocaleString("es-DO", { minimumFractionDigits: 2 })}
                                {product.baseUnitSymbol && (
                                  <span className="ml-1 text-xs text-gray-500">{product.baseUnitSymbol}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Layers className="w-4 h-4 text-blue-600" />
                                <span className="text-sm font-medium text-blue-600">
                                  {product.lotCount} {product.lotCount === 1 ? "lote" : "lotes"}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              {product.nearestExpiration ? (
                                <div className={`text-sm ${isExpiringSoon ? "text-red-600 font-semibold" : "text-gray-900"}`}>
                                  {isExpiringSoon && <AlertTriangle className="w-4 h-4 inline mr-1" />}
                                  {new Date(product.nearestExpiration).toLocaleDateString("es-DO")}
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-4 text-right">
                              {product.expiringQuantity > 0 ? (
                                <div className="text-sm font-semibold text-orange-600">
                                  {product.expiringQuantity.toLocaleString("es-DO", { minimumFractionDigits: 2 })}
                                  {product.baseUnitSymbol && (
                                    <span className="ml-1 text-xs">{product.baseUnitSymbol}</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-4 text-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedProduct(product.productId);
                                }}
                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                              >
                                Ver detalles
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Movements Tab Content */}
      {activeTab === "movements" && (
        <>
          {/* Stats Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Movimientos</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalMovements}</p>
            </div>
            <div className="bg-gray-100 p-3 rounded-lg">
              <FileText className="w-6 h-6 text-gray-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Compras</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{stats.purchases}</p>
            </div>
            <div className="bg-green-100 p-3 rounded-lg">
              <ShoppingCart className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Ventas</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{stats.sales}</p>
            </div>
            <div className="bg-blue-100 p-3 rounded-lg">
              <TrendingDown className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Ajustes</p>
              <p className="text-2xl font-bold text-yellow-600 mt-1">{stats.adjustments}</p>
            </div>
            <div className="bg-yellow-100 p-3 rounded-lg">
              <BarChart3 className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Valor Total</p>
              <p className="text-xl font-bold text-gray-900 mt-1">
                ${parseFloat(stats.totalValue).toLocaleString("es-DO", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-purple-100 p-3 rounded-lg">
              <Package className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Filtros</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">Todos los Tipos</option>
            <option value="purchase">Compras</option>
            <option value="sale">Ventas</option>
            <option value="adjustment">Ajustes</option>
            <option value="return">Devoluciones</option>
            <option value="transfer">Transferencias</option>
          </select>

          {/* Product Filter */}
          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Todos los Productos</option>
            {tangibleProducts.map((product: any) => (
              <option key={product.id} value={product.id}>
                {product.name} {product.sku ? `(${product.sku})` : ""}
              </option>
            ))}
          </select>

          {/* Date From */}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder="Desde"
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />

          {/* Date To */}
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            placeholder="Hasta"
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Lot Number Filter */}
        <div className="mt-4">
          <input
            type="text"
            placeholder="Filtrar por número de lote..."
            value={lotFilter}
            onChange={(e) => setLotFilter(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Movimientos de Inventario ({filteredMovements.length})
          </h2>

          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-4">Cargando movimientos...</p>
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay movimientos</h3>
              <p className="text-gray-600">No se encontraron movimientos con los filtros seleccionados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Fecha/Hora</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Producto</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Cantidad</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Stock</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Lote/Venc.</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Costo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Referencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredMovements.map((movement) => (
                    <tr key={movement.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-900">
                          {new Date(movement.createdAt).toLocaleDateString("es-DO")}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(movement.createdAt).toLocaleTimeString("es-DO")}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          {getMovementIcon(movement.type)}
                          {getMovementBadge(movement.type)}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm font-medium text-gray-900">{movement.productName || "-"}</div>
                        {movement.supplierName && (
                          <div className="text-xs text-gray-500">Prov: {movement.supplierName}</div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div
                          className={`text-sm font-semibold ${
                            movement.type === "purchase" || movement.type === "return"
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {movement.type === "purchase" || movement.type === "return" ? "+" : "-"}
                          {parseFloat(movement.quantity).toLocaleString("es-DO")}
                          {movement.unitSymbol && (
                            <span className="ml-1 text-xs text-gray-500">{movement.unitSymbol}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="text-xs text-gray-500">
                          {movement.quantityBefore ? parseFloat(movement.quantityBefore).toLocaleString("es-DO") : "-"}{" "}
                          →{" "}
                          {movement.quantityAfter ? parseFloat(movement.quantityAfter).toLocaleString("es-DO") : "-"}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {movement.lotNumber && (
                          <div className="text-xs text-gray-900">
                            <span className="font-medium">Lote:</span> {movement.lotNumber}
                          </div>
                        )}
                        {movement.expirationDate && (
                          <div className="text-xs text-gray-500">
                            Venc: {new Date(movement.expirationDate).toLocaleDateString("es-DO")}
                          </div>
                        )}
                        {!movement.lotNumber && !movement.expirationDate && <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {movement.unitCost && (
                          <div className="text-xs text-gray-900">
                            ${parseFloat(movement.unitCost).toLocaleString("es-DO", { minimumFractionDigits: 2 })}
                          </div>
                        )}
                        {movement.totalCost && (
                          <div className="text-xs font-semibold text-gray-900">
                            ${parseFloat(movement.totalCost).toLocaleString("es-DO", { minimumFractionDigits: 2 })}
                          </div>
                        )}
                        {!movement.unitCost && !movement.totalCost && <span className="text-gray-400">-</span>}
                      </td>
                      <td className="px-4 py-4">
                        {movement.referenceType && (
                          <div className="text-xs text-gray-900">
                            {movement.referenceType}-{movement.referenceId}
                          </div>
                        )}
                        {movement.notes && <div className="text-xs text-gray-500 mt-1">{movement.notes}</div>}
                        {!movement.referenceType && !movement.notes && <span className="text-gray-400">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
        </>
      )}

      {/* Product Detail Modal */}
      {selectedProduct && selectedProductData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    {selectedProductData.productName}
                  </h3>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                    {selectedProductData.sku && <span>SKU: {selectedProductData.sku}</span>}
                    {selectedProductData.barcode && <span>Código: {selectedProductData.barcode}</span>}
                    <span className="font-semibold text-blue-600">
                      Stock Total: {selectedProductData.totalStock.toLocaleString("es-DO", { minimumFractionDigits: 2 })}
                      {selectedProductData.baseUnitSymbol && ` ${selectedProductData.baseUnitSymbol}`}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
              {/* Stock por Lote */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Stock por Lote</h4>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Lote</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Cantidad</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">F. Vencimiento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {selectedProductData.lots.map((lot, index) => {
                        const today = new Date();
                        const thirtyDaysFromNow = new Date(today);
                        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
                        const isExpiringSoon = lot.expirationDate &&
                          new Date(lot.expirationDate) <= thirtyDaysFromNow;

                        return (
                          <tr key={index} className={isExpiringSoon ? "bg-yellow-50" : ""}>
                            <td className="px-4 py-3">
                              <span className="text-sm font-medium text-gray-900">
                                {lot.lotNumber || "Sin lote"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-sm font-semibold text-gray-900">
                                {lot.quantity.toLocaleString("es-DO", { minimumFractionDigits: 2 })}
                                {selectedProductData.baseUnitSymbol && (
                                  <span className="ml-1 text-xs text-gray-500">{selectedProductData.baseUnitSymbol}</span>
                                )}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {lot.expirationDate ? (
                                <div className={`text-sm ${isExpiringSoon ? "text-red-600 font-semibold" : "text-gray-900"}`}>
                                  {isExpiringSoon && <AlertTriangle className="w-4 h-4 inline mr-1" />}
                                  {new Date(lot.expirationDate).toLocaleDateString("es-DO")}
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Últimos Movimientos */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-4">Últimos Movimientos</h4>
                {productMovements.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No hay movimientos registrados para este producto
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Fecha</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Tipo</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Cantidad</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Lote</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Notas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {productMovements.slice(0, 10).map((movement) => (
                          <tr key={movement.id}>
                            <td className="px-4 py-3">
                              <div className="text-sm text-gray-900">
                                {new Date(movement.createdAt).toLocaleDateString("es-DO")}
                              </div>
                              <div className="text-xs text-gray-500">
                                {new Date(movement.createdAt).toLocaleTimeString("es-DO")}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {getMovementBadge(movement.type)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span
                                className={`text-sm font-semibold ${
                                  movement.type === "purchase" || movement.type === "return"
                                    ? "text-green-600"
                                    : "text-red-600"
                                }`}
                              >
                                {movement.type === "purchase" || movement.type === "return" ? "+" : "-"}
                                {parseFloat(movement.quantity).toLocaleString("es-DO")}
                                {movement.unitSymbol && (
                                  <span className="ml-1 text-xs text-gray-500">{movement.unitSymbol}</span>
                                )}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-900">
                                {movement.lotNumber || "-"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-600">
                                {movement.notes || movement.reason || "-"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
