import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3, Warehouse, Package, AlertTriangle, TrendingUp, ArrowRightLeft,
  Download,
} from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────────────

const apiCall = async (endpoint: string) => {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(endpoint, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error("Error al obtener datos");
  return res.json();
};

const formatQty = (v: string | number | null | undefined) => {
  if (v == null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return isNaN(n) ? "—" : n.toLocaleString("es-DO", { maximumFractionDigits: 2 });
};

// ─── types ──────────────────────────────────────────────────────────────────

interface WarehouseInfo {
  id: number;
  name: string;
}

interface StockRow {
  warehouseId: number;
  productId: number;
  productName: string;
  productSku: string | null;
  productCategory: string;
  quantity: string;
  minStock: string | null;
}

interface ComparisonData {
  warehouses: WarehouseInfo[];
  stockData: StockRow[];
}

interface SummaryRow {
  productId: number;
  productName: string;
  productSku: string | null;
  productCategory: string;
  totalQuantity: string;
}

interface Transfer {
  id: number;
  transferNumber: string;
  status: string;
  fromWarehouseId: number;
  toWarehouseId: number;
  createdAt: string;
  completedAt: string | null;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function WarehouseReportsPage() {
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // ── queries ──
  const { data: warehouses = [], isLoading: loadingWarehouses } = useQuery<WarehouseInfo[]>({
    queryKey: ["/api/warehouses"],
    queryFn: () => apiCall("/api/warehouses"),
  });

  const { data: comparison, isLoading: loadingComparison } = useQuery<ComparisonData>({
    queryKey: ["/api/warehouses/reports/stock-comparison"],
    queryFn: () => apiCall("/api/warehouses/reports/stock-comparison"),
  });

  const { data: summary = [], isLoading: loadingSummary } = useQuery<SummaryRow[]>({
    queryKey: ["/api/warehouses/stock/summary"],
    queryFn: () => apiCall("/api/warehouses/stock/summary"),
  });

  const { data: transfers = [], isLoading: loadingTransfers } = useQuery<Transfer[]>({
    queryKey: ["/api/warehouse-transfers"],
    queryFn: () => apiCall("/api/warehouse-transfers"),
  });

  // ── derived data ──

  // Categories from comparison data
  const categories = useMemo(() => {
    if (!comparison) return [];
    const cats = new Set(
      comparison.stockData
        .map((s) => s.productCategory)
        .filter((c): c is string => !!c)
    );
    return Array.from(cats).sort();
  }, [comparison]);

  // Per-warehouse stock (filtered)
  const warehouseStockRows = useMemo(() => {
    if (!comparison) return [];
    let rows = comparison.stockData;
    if (selectedWarehouse !== "all") {
      rows = rows.filter((r) => r.warehouseId === parseInt(selectedWarehouse));
    }
    if (categoryFilter !== "all") {
      rows = rows.filter((r) => r.productCategory === categoryFilter);
    }
    return rows;
  }, [comparison, selectedWarehouse, categoryFilter]);

  // Products with low stock (quantity ≤ minStock)
  const lowStockItems = useMemo(() => {
    if (!comparison) return [];
    return comparison.stockData.filter((r) => {
      const qty = parseFloat(r.quantity);
      const min = r.minStock ? parseFloat(r.minStock) : null;
      return min !== null && qty <= min;
    });
  }, [comparison]);

  // Cross-warehouse comparison: pivot by product
  const pivotData = useMemo(() => {
    if (!comparison || comparison.warehouses.length === 0) return [];
    const productMap: Record<number, any> = {};
    for (const row of comparison.stockData) {
      if (!productMap[row.productId]) {
        productMap[row.productId] = {
          productId: row.productId,
          productName: row.productName,
          productSku: row.productSku,
          productCategory: row.productCategory,
          byWarehouse: {} as Record<number, number>,
        };
      }
      productMap[row.productId].byWarehouse[row.warehouseId] = parseFloat(row.quantity);
    }
    return Object.values(productMap);
  }, [comparison]);

  const filteredPivot = useMemo(() => {
    if (categoryFilter === "all") return pivotData;
    return pivotData.filter((r: any) => r.productCategory === categoryFilter);
  }, [pivotData, categoryFilter]);

  // Transfer stats
  const transferStats = useMemo(() => {
    const byStatus: Record<string, number> = {};
    for (const t of transfers) {
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    }
    return byStatus;
  }, [transfers]);

  const isLoading = loadingWarehouses || loadingComparison || loadingSummary;

  const activeWarehouses = warehouses.filter((w: any) => w.isActive);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
          <BarChart3 className="h-6 w-6 text-green-600 dark:text-green-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Reportes de Almacenes
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Comparación de stock y análisis por sucursal
          </p>
        </div>
      </div>

      {/* KPI summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <Warehouse className="h-7 w-7 text-blue-500" />
              <div>
                <p className="text-xs text-gray-400">Almacenes</p>
                <p className="text-2xl font-bold">{activeWarehouses.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <Package className="h-7 w-7 text-purple-500" />
              <div>
                <p className="text-xs text-gray-400">Productos con stock</p>
                <p className="text-2xl font-bold">{summary.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-7 w-7 text-red-500" />
              <div>
                <p className="text-xs text-gray-400">Stock bajo</p>
                <p className="text-2xl font-bold text-red-600">{lowStockItems.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <ArrowRightLeft className="h-7 w-7 text-yellow-500" />
              <div>
                <p className="text-xs text-gray-400">Transferencias</p>
                <p className="text-2xl font-bold">{transfers.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
        </div>
      ) : (
        <Tabs defaultValue="comparison">
          <TabsList className="flex-wrap">
            <TabsTrigger value="comparison">Comparación por Almacén</TabsTrigger>
            <TabsTrigger value="summary">Stock Total (Consolidado)</TabsTrigger>
            <TabsTrigger value="lowstock">Stock Bajo</TabsTrigger>
            <TabsTrigger value="transfers">Resumen Transferencias</TabsTrigger>
          </TabsList>

          {/* ── Tab: Comparación cruzada ── */}
          <TabsContent value="comparison" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-3">
                  <CardTitle>Stock por Almacén</CardTitle>
                  <div className="flex gap-3 ml-auto">
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="w-44">
                        <SelectValue placeholder="Categoría" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas las categorías</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredPivot.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">Sin datos de stock registrados</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Producto</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead>Categoría</TableHead>
                          {(comparison?.warehouses ?? []).map((w) => (
                            <TableHead key={w.id} className="text-right">{w.name}</TableHead>
                          ))}
                          <TableHead className="text-right font-semibold">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPivot.map((row: any) => {
                          const total = Object.values(row.byWarehouse as Record<number, number>)
                            .reduce((a, b) => a + b, 0);
                          return (
                            <TableRow key={row.productId}>
                              <TableCell className="font-medium">{row.productName}</TableCell>
                              <TableCell className="text-sm text-gray-400">
                                {row.productSku ?? "—"}
                              </TableCell>
                              <TableCell className="text-sm text-gray-500">
                                {row.productCategory}
                              </TableCell>
                              {(comparison?.warehouses ?? []).map((w) => (
                                <TableCell key={w.id} className="text-right">
                                  {formatQty(row.byWarehouse[w.id] ?? 0)}
                                </TableCell>
                              ))}
                              <TableCell className="text-right font-semibold">
                                {formatQty(total)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab: Stock consolidado ── */}
          <TabsContent value="summary" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Stock Total Consolidado</CardTitle>
              </CardHeader>
              <CardContent>
                {summary.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">Sin datos</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead className="text-right">Stock Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.map((row) => (
                        <TableRow key={row.productId}>
                          <TableCell className="font-medium">{row.productName}</TableCell>
                          <TableCell className="text-sm text-gray-400">
                            {row.productSku ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {row.productCategory}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatQty(row.totalQuantity)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab: Stock bajo ── */}
          <TabsContent value="lowstock" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                  Productos con Stock Bajo
                </CardTitle>
              </CardHeader>
              <CardContent>
                {lowStockItems.length === 0 ? (
                  <div className="text-center py-8 text-green-600">
                    <TrendingUp className="h-10 w-10 mx-auto mb-2" />
                    <p className="font-medium">Todo el stock está por encima del mínimo.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>Almacén</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead className="text-right">Stock Actual</TableHead>
                        <TableHead className="text-right">Stock Mínimo</TableHead>
                        <TableHead className="text-right">Diferencia</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lowStockItems.map((row, i) => {
                        const qty = parseFloat(row.quantity);
                        const min = parseFloat(row.minStock!);
                        const diff = qty - min;
                        const wName = comparison?.warehouses.find((w) => w.id === row.warehouseId)?.name ?? `#${row.warehouseId}`;
                        return (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{row.productName}</TableCell>
                            <TableCell>{wName}</TableCell>
                            <TableCell className="text-sm text-gray-500">{row.productCategory}</TableCell>
                            <TableCell className="text-right text-red-600 font-semibold">
                              {formatQty(qty)}
                            </TableCell>
                            <TableCell className="text-right">{formatQty(min)}</TableCell>
                            <TableCell className="text-right text-red-500">
                              {formatQty(diff)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tab: Transferencias ── */}
          <TabsContent value="transfers" className="mt-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
              {Object.entries(transferStats).map(([status, count]) => (
                <Card key={status}>
                  <CardContent className="pt-4">
                    <p className="text-xs text-gray-400 capitalize">{status.replace("_", " ")}</p>
                    <p className="text-xl font-bold">{count}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardHeader><CardTitle>Últimas 200 transferencias</CardTitle></CardHeader>
              <CardContent>
                {loadingTransfers ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
                  </div>
                ) : transfers.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">Sin transferencias</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Origen → Destino</TableHead>
                        <TableHead>Fecha</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transfers.slice(0, 50).map((t) => {
                        const fromName = comparison?.warehouses.find((w) => w.id === t.fromWarehouseId)?.name ?? `#${t.fromWarehouseId}`;
                        const toName = comparison?.warehouses.find((w) => w.id === t.toWarehouseId)?.name ?? `#${t.toWarehouseId}`;
                        return (
                          <TableRow key={t.id}>
                            <TableCell className="font-mono text-sm">{t.transferNumber}</TableCell>
                            <TableCell>
                              <Badge variant={t.status === "completed" ? "default" : "secondary"}>
                                {t.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {fromName} → {toName}
                            </TableCell>
                            <TableCell className="text-sm text-gray-500">
                              {new Date(t.createdAt).toLocaleDateString("es-DO")}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
