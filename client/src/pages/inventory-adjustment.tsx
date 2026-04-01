import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  ClipboardList, Search, Save, TrendingUp, TrendingDown, Package,
  AlertTriangle, ChevronDown, ChevronUp, History, Plus, Minus,
} from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────────────

const apiCall = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Error desconocido" }));
    throw new Error(err.error || "Error en la solicitud");
  }
  return res.json();
};

const formatCurrency = (value: string | number, currency = "DOP") => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return `${currency} 0.00`;
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "DOP",
    currencyDisplay: "symbol",
  }).format(num);
};

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleString("es-DO", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

// ─── main component ──────────────────────────────────────────────────────────

interface AdjustmentItem {
  productId: number;
  productName: string;
  previousStock: number;
  realStock: number;
  difference: number;
  unitPrice: string;
  baseCurrency: string;
  adjustmentAmount: string;
}

export default function InventoryAdjustmentPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // "stock real" values keyed by product id
  const [realStockMap, setRealStockMap] = useState<Record<number, string>>({});
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [expandedAdjustmentId, setExpandedAdjustmentId] = useState<number | null>(null);

  // Fetch products
  const { data: products = [], isLoading: loadingProducts } = useQuery<any[]>({
    queryKey: ["/api/products"],
    queryFn: () => apiCall("/api/products"),
  });

  // Fetch adjustment history
  const { data: history = [], isLoading: loadingHistory } = useQuery<any[]>({
    queryKey: ["/api/inventory-adjustments"],
    queryFn: () => apiCall("/api/inventory-adjustments"),
  });

  // Fetch detail for an expanded adjustment
  const { data: expandedDetail } = useQuery<any>({
    queryKey: ["/api/inventory-adjustments", expandedAdjustmentId],
    queryFn: () => apiCall(`/api/inventory-adjustments/${expandedAdjustmentId}`),
    enabled: expandedAdjustmentId !== null,
  });

  // Apply adjustment mutation
  const applyMutation = useMutation({
    mutationFn: (payload: any) =>
      apiCall("/api/inventory-adjustments", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: (data) => {
      toast({ title: "Ajuste aplicado", description: data.message });
      setRealStockMap({});
      setNotes("");
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-adjustments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error al aplicar ajuste", description: err.message, variant: "destructive" });
      setConfirmOpen(false);
    },
  });

  // ── derived data ──────────────────────────────────────────────────────────

  const filteredProducts = useMemo(
    () =>
      (products as any[]).filter((p: any) =>
        !search || p.name?.toLowerCase().includes(search.toLowerCase())
      ),
    [products, search]
  );

  // Build adjustment line items from edited rows
  const pendingItems: AdjustmentItem[] = useMemo(() => {
    const result: AdjustmentItem[] = [];
    for (const [idStr, val] of Object.entries(realStockMap)) {
      if (val === "" || isNaN(parseInt(val))) continue;
      const product = (products as any[]).find((p: any) => p.id === parseInt(idStr));
      if (!product) continue;
      const previousStock = product.stock_quantity ?? product.stockQuantity ?? 0;
      const realStock = parseInt(val);
      const difference = realStock - previousStock;
      const unitPrice = product.price || "0";
      const baseCurrency = product.baseCurrency || product.currency || "DOP";
      const adjustmentAmount = (Math.abs(difference) * parseFloat(unitPrice)).toFixed(2);
      result.push({
        productId: product.id,
        productName: product.name,
        previousStock,
        realStock,
        difference,
        unitPrice,
        baseCurrency,
        adjustmentAmount,
      });
    }
    return result;
  }, [realStockMap, products]);

  // Summary stats (only pending items — only changed rows)
  const summary = useMemo(() => {
    const surplus = pendingItems.filter(i => i.difference > 0);
    const deficit = pendingItems.filter(i => i.difference < 0);
    const surplusValue = surplus.reduce((a, i) => a + parseFloat(i.adjustmentAmount), 0);
    const deficitValue = deficit.reduce((a, i) => a + parseFloat(i.adjustmentAmount), 0);
    return {
      surplusItems: surplus.length,
      deficitItems: deficit.length,
      surplusValue,
      deficitValue,
      netAdjustmentValue: surplusValue - deficitValue,
      totalChanged: pendingItems.length,
    };
  }, [pendingItems]);

  const handleSave = () => {
    if (pendingItems.length === 0) {
      toast({ title: "Sin cambios", description: "No has modificado ningún stock real.", variant: "destructive" });
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    applyMutation.mutate({
      storeId: 1, // backend uses user.storeId from JWT
      notes,
      items: pendingItems,
    });
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <ClipboardList className="w-8 h-8 text-blue-600" />
            Ajuste de Inventario
          </h1>
          <p className="text-gray-600 mt-1">Corrige el stock real de tus productos y aplica el ajuste masivo</p>
        </div>
      </div>

      <Tabs defaultValue="adjustment" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="adjustment" className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            Nuevo Ajuste
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Historial de Ajustes
          </TabsTrigger>
        </TabsList>

        {/* ───── TAB: NUEVO AJUSTE ───── */}
        <TabsContent value="adjustment">

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <Card className="border-blue-100 bg-blue-50">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">Artículos modificados</p>
                <p className="text-2xl font-bold text-blue-700 mt-1">{summary.totalChanged}</p>
              </CardContent>
            </Card>
            <Card className="border-green-100 bg-green-50">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  <p className="text-xs text-green-600 font-medium uppercase tracking-wide">Con sobrante</p>
                </div>
                <p className="text-2xl font-bold text-green-700 mt-1">{summary.surplusItems}</p>
                <p className="text-xs text-green-600 mt-0.5">{formatCurrency(summary.surplusValue)}</p>
              </CardContent>
            </Card>
            <Card className="border-red-100 bg-red-50">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-red-600" />
                  <p className="text-xs text-red-600 font-medium uppercase tracking-wide">Con faltante</p>
                </div>
                <p className="text-2xl font-bold text-red-700 mt-1">{summary.deficitItems}</p>
                <p className="text-xs text-red-600 mt-0.5">{formatCurrency(summary.deficitValue)}</p>
              </CardContent>
            </Card>
            <Card className="border-yellow-100 bg-yellow-50">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-yellow-700 font-medium uppercase tracking-wide">Valor sobrante</p>
                <p className="text-xl font-bold text-yellow-700 mt-1">{formatCurrency(summary.surplusValue)}</p>
              </CardContent>
            </Card>
            <Card className={`${summary.netAdjustmentValue >= 0 ? "border-green-100 bg-green-50" : "border-red-100 bg-red-50"}`}>
              <CardContent className="pt-4 pb-4">
                <p className={`text-xs font-medium uppercase tracking-wide ${summary.netAdjustmentValue >= 0 ? "text-green-600" : "text-red-600"}`}>
                  Ajuste neto
                </p>
                <p className={`text-xl font-bold mt-1 ${summary.netAdjustmentValue >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {summary.netAdjustmentValue >= 0 ? "+" : ""}
                  {formatCurrency(summary.netAdjustmentValue)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Table card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle>Tabla de Corrección de Stock</CardTitle>
                  <CardDescription>
                    Ingresa el stock real contado. Solo los productos modificados serán guardados.
                  </CardDescription>
                </div>
                <Button onClick={handleSave} className="flex items-center gap-2" disabled={applyMutation.isPending}>
                  <Save className="w-4 h-4" />
                  Aplicar Ajuste {summary.totalChanged > 0 && `(${summary.totalChanged})`}
                </Button>
              </div>
              <div className="mt-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Buscar producto..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingProducts ? (
                <p className="text-center py-10 text-gray-400">Cargando productos...</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Producto</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-600 w-32">Precio</th>
                        <th className="text-center py-3 px-4 font-medium text-gray-600 w-28">Stock actual</th>
                        <th className="text-center py-3 px-4 font-medium text-gray-600 w-32">Stock real</th>
                        <th className="text-center py-3 px-4 font-medium text-gray-600 w-28">Diferencia</th>
                        <th className="text-right py-3 px-4 font-medium text-gray-600 w-36">Monto ajuste</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((product: any) => {
                        const currentStock = product.stock_quantity ?? product.stockQuantity ?? 0;
                        const rawVal = realStockMap[product.id];
                        const realStock = rawVal !== undefined && rawVal !== "" ? parseInt(rawVal) : null;
                        const diff = realStock !== null ? realStock - currentStock : null;
                        const unitPrice = parseFloat(product.price || "0");
                        const adjustmentAmt = diff !== null ? Math.abs(diff) * unitPrice : null;
                        const currency = product.baseCurrency || product.currency || "DOP";

                        const isChanged = realStock !== null && realStock !== currentStock;
                        const rowCls = isChanged
                          ? diff! > 0
                            ? "bg-green-50 border-b"
                            : "bg-red-50 border-b"
                          : "border-b hover:bg-gray-50";

                        return (
                          <tr key={product.id} className={rowCls}>
                            <td className="py-2 px-4 font-medium">
                              <span className="text-gray-400 text-xs mr-2">#{product.id}</span>
                              {product.name}
                            </td>
                            <td className="py-2 px-4 text-right text-gray-600">{formatCurrency(unitPrice, currency)}</td>
                            <td className="py-2 px-4 text-center text-gray-600">{currentStock}</td>
                            <td className="py-2 px-4 text-center">
                              <Input
                                type="number"
                                min={0}
                                placeholder={String(currentStock)}
                                value={realStockMap[product.id] ?? ""}
                                onChange={e =>
                                  setRealStockMap(prev => ({ ...prev, [product.id]: e.target.value }))
                                }
                                className="w-24 mx-auto text-center"
                              />
                            </td>
                            <td className="py-2 px-4 text-center">
                              {diff !== null && diff !== 0 ? (
                                <span className={`flex items-center justify-center gap-1 font-semibold ${diff > 0 ? "text-green-600" : "text-red-600"}`}>
                                  {diff > 0 ? <Plus className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                                  {diff > 0 ? `+${diff}` : diff}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="py-2 px-4 text-right">
                              {adjustmentAmt !== null && diff !== 0 ? (
                                <span className={diff! > 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                                  {diff! > 0 ? "+" : "-"}
                                  {formatCurrency(adjustmentAmt, currency)}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredProducts.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center py-10 text-gray-400">
                            No se encontraron productos
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───── TAB: HISTORIAL ───── */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Historial de Ajustes de Inventario
              </CardTitle>
              <CardDescription>Registro de todos los ajustes aplicados anteriormente</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingHistory ? (
                <p className="text-center py-10 text-gray-400">Cargando historial...</p>
              ) : history.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No hay ajustes registrados todavía</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((adj: any) => {
                    const isExpanded = expandedAdjustmentId === adj.id;
                    return (
                      <div key={adj.id} className="border rounded-lg overflow-hidden">
                        {/* Header row */}
                        <div
                          className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                          onClick={() => setExpandedAdjustmentId(isExpanded ? null : adj.id)}
                        >
                          <div className="flex items-center gap-4 flex-wrap">
                            <div>
                              <p className="font-semibold text-sm">Ajuste #{adj.id}</p>
                              <p className="text-xs text-gray-500">{formatDate(adj.createdAt)}</p>
                              {adj.adjustedByName && (
                                <p className="text-xs text-gray-400">Por: {adj.adjustedByName}</p>
                              )}
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                                <TrendingUp className="w-3 h-3 mr-1" />
                                {adj.surplusItems} sobrantes
                              </Badge>
                              <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
                                <TrendingDown className="w-3 h-3 mr-1" />
                                {adj.deficitItems} faltantes
                              </Badge>
                              <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
                                {adj.totalItems} producto(s)
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-xs text-gray-500">Ajuste neto</p>
                              <p className={`font-bold ${parseFloat(adj.netAdjustmentValue) >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {parseFloat(adj.netAdjustmentValue) >= 0 ? "+" : ""}
                                {formatCurrency(adj.netAdjustmentValue)}
                              </p>
                            </div>
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                          </div>
                        </div>

                        {/* Expanded detail */}
                        {isExpanded && (
                          <div className="border-t bg-gray-50 p-4">
                            {adj.notes && (
                              <p className="text-sm text-gray-600 mb-3 italic">"{adj.notes}"</p>
                            )}
                            {/* Summary mini-cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                              <div className="bg-green-50 border border-green-100 rounded p-2 text-center">
                                <p className="text-xs text-green-600">Valor sobrante</p>
                                <p className="font-bold text-green-700 text-sm">{formatCurrency(adj.surplusValue)}</p>
                              </div>
                              <div className="bg-red-50 border border-red-100 rounded p-2 text-center">
                                <p className="text-xs text-red-600">Valor faltante</p>
                                <p className="font-bold text-red-700 text-sm">{formatCurrency(adj.deficitValue)}</p>
                              </div>
                              <div className={`${parseFloat(adj.netAdjustmentValue) >= 0 ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"} border rounded p-2 text-center`}>
                                <p className={`text-xs ${parseFloat(adj.netAdjustmentValue) >= 0 ? "text-green-600" : "text-red-600"}`}>Ajuste neto</p>
                                <p className={`font-bold text-sm ${parseFloat(adj.netAdjustmentValue) >= 0 ? "text-green-700" : "text-red-700"}`}>
                                  {formatCurrency(adj.netAdjustmentValue)}
                                </p>
                              </div>
                            </div>

                            {/* Line items table */}
                            {expandedDetail && expandedDetail.id === adj.id ? (
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead className="bg-white border-b">
                                    <tr>
                                      <th className="text-left py-2 px-3 font-medium text-gray-600">Producto</th>
                                      <th className="text-center py-2 px-3 font-medium text-gray-600">Stock anterior</th>
                                      <th className="text-center py-2 px-3 font-medium text-gray-600">Stock real</th>
                                      <th className="text-center py-2 px-3 font-medium text-gray-600">Diferencia</th>
                                      <th className="text-right py-2 px-3 font-medium text-gray-600">Monto ajuste</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(expandedDetail.items || []).map((item: any) => (
                                      <tr key={item.id} className="border-b">
                                        <td className="py-1.5 px-3 font-medium">{item.productName}</td>
                                        <td className="py-1.5 px-3 text-center">{item.previousStock}</td>
                                        <td className="py-1.5 px-3 text-center">{item.realStock}</td>
                                        <td className="py-1.5 px-3 text-center">
                                          <span className={item.difference > 0 ? "text-green-600 font-semibold" : item.difference < 0 ? "text-red-600 font-semibold" : "text-gray-400"}>
                                            {item.difference > 0 ? `+${item.difference}` : item.difference}
                                          </span>
                                        </td>
                                        <td className="py-1.5 px-3 text-right">
                                          <span className={item.difference > 0 ? "text-green-600" : item.difference < 0 ? "text-red-600" : "text-gray-400"}>
                                            {item.difference !== 0 ? formatCurrency(item.adjustmentAmount, item.baseCurrency) : "—"}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400 text-center py-2">Cargando líneas...</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ───── CONFIRMATION DIALOG ───── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Confirmar Ajuste de Inventario
            </DialogTitle>
            <DialogDescription>
              Esta acción actualizará el stock de {pendingItems.length} producto(s) y no se puede deshacer.
            </DialogDescription>
          </DialogHeader>

          {/* Mini-summary */}
          <div className="grid grid-cols-2 gap-3 my-2">
            <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-center">
              <p className="text-xs text-green-600 font-medium">Sobrantes</p>
              <p className="text-xl font-bold text-green-700">{summary.surplusItems}</p>
              <p className="text-xs text-green-600">{formatCurrency(summary.surplusValue)}</p>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
              <p className="text-xs text-red-600 font-medium">Faltantes</p>
              <p className="text-xl font-bold text-red-700">{summary.deficitItems}</p>
              <p className="text-xs text-red-600">{formatCurrency(summary.deficitValue)}</p>
            </div>
            <div className={`col-span-2 rounded-lg p-3 text-center border ${summary.netAdjustmentValue >= 0 ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}>
              <p className={`text-sm font-medium ${summary.netAdjustmentValue >= 0 ? "text-green-600" : "text-red-600"}`}>
                Ajuste neto
              </p>
              <p className={`text-2xl font-bold ${summary.netAdjustmentValue >= 0 ? "text-green-700" : "text-red-700"}`}>
                {summary.netAdjustmentValue >= 0 ? "+" : ""}
                {formatCurrency(summary.netAdjustmentValue)}
              </p>
            </div>
          </div>

          {/* Optional notes */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">
              Notas del ajuste (opcional)
            </label>
            <Textarea
              placeholder="Ej: Conteo físico mensual, diciembre 2025..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={applyMutation.isPending}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={applyMutation.isPending}>
              {applyMutation.isPending ? "Aplicando..." : "Confirmar Ajuste"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
