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
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [adjustmentDate, setAdjustmentDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Almacenes: el ajuste es de un almacén concreto, que es donde se contó.
  const { data: warehouses = [] } = useQuery<any[]>({
    queryKey: ["/api/warehouses"],
    queryFn: () => apiCall("/api/warehouses"),
  });
  const activeWarehouseId = warehouseId ?? (warehouses as any[]).find((w: any) => w.isDefault)?.id ?? (warehouses as any[])[0]?.id ?? null;

  // Existencia y costo según el libro valorado, por almacén. El ajuste se
  // compara contra esto y se valora al costo promedio, no al precio de venta.
  const { data: valuation } = useQuery<any>({
    queryKey: ["/api/inventory/valuation"],
    queryFn: () => apiCall("/api/inventory/valuation"),
  });
  const valued = useMemo(() => {
    const m = new Map<number, { qty: number; cost: number }>();
    for (const v of valuation?.items ?? []) {
      if (Number(v.warehouse_id) !== activeWarehouseId) continue;
      m.set(Number(v.product_id), { qty: Number(v.quantity_on_hand), cost: Number(v.average_cost) });
    }
    return m;
  }, [valuation, activeWarehouseId]);

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
      (products as any[]).filter((p: any) => {
        // Los servicios no manejan inventario, excluirlos del ajuste
        if (p.type === 'service') return false;
        return !search || p.name?.toLowerCase().includes(search.toLowerCase());
      }),
    [products, search]
  );

  // Build adjustment line items from edited rows
  const pendingItems: AdjustmentItem[] = useMemo(() => {
    const result: AdjustmentItem[] = [];
    for (const [idStr, val] of Object.entries(realStockMap)) {
      if (val === "" || isNaN(parseInt(val))) continue;
      const product = (products as any[]).find((p: any) => p.id === parseInt(idStr));
      if (!product) continue;
      const previousStock = valued.get(product.id)?.qty ?? 0;
      const realStock = parseInt(val);
      const difference = realStock - previousStock;
      const unitPrice = String(valued.get(product.id)?.cost ?? 0);
      const baseCurrency = "DOP";
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
  }, [realStockMap, products, valued]);

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
    if (!activeWarehouseId) {
      toast({ title: "Seleccione un almacén", variant: "destructive" });
      return;
    }
    applyMutation.mutate({
      warehouseId: activeWarehouseId,
      date: adjustmentDate,
      notes,
      items: pendingItems.map((i) => ({ productId: i.productId, productName: i.productName, realStock: i.realStock })),
    });
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight flex items-center gap-3">
            <ClipboardList className="w-8 h-8 text-primary" />
            Ajuste de Inventario
          </h1>
          <p className="text-muted-foreground mt-1">Corrige el stock real de un almacén; faltantes y sobrantes se contabilizan al costo</p>
        </div>
        <div className="flex items-end gap-3">
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            Almacén
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={activeWarehouseId ?? ""}
              onChange={(e) => { setWarehouseId(Number(e.target.value)); setRealStockMap({}); }}
            >
              {(warehouses as any[]).map((w: any) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground flex flex-col gap-1">
            Fecha
            <Input type="date" className="h-9" value={adjustmentDate} onChange={(e) => setAdjustmentDate(e.target.value)} />
          </label>
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
            <Card className="border-border bg-accent">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-primary font-medium uppercase tracking-wide">Artículos modificados</p>
                <p className="text-2xl font-bold text-primary mt-1">{summary.totalChanged}</p>
              </CardContent>
            </Card>
            <Card className="border-success/40 bg-success/10">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-success" />
                  <p className="text-xs text-success font-medium uppercase tracking-wide">Con sobrante</p>
                </div>
                <p className="text-2xl font-bold text-success mt-1">{summary.surplusItems}</p>
                <p className="text-xs text-success mt-0.5">{formatCurrency(summary.surplusValue)}</p>
              </CardContent>
            </Card>
            <Card className="border-destructive/40 bg-destructive/10">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-destructive" />
                  <p className="text-xs text-destructive font-medium uppercase tracking-wide">Con faltante</p>
                </div>
                <p className="text-2xl font-bold text-destructive mt-1">{summary.deficitItems}</p>
                <p className="text-xs text-destructive mt-0.5">{formatCurrency(summary.deficitValue)}</p>
              </CardContent>
            </Card>
            <Card className="border-warning/40 bg-warning/15">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-warning font-medium uppercase tracking-wide">Valor sobrante</p>
                <p className="text-xl font-bold text-warning mt-1">{formatCurrency(summary.surplusValue)}</p>
              </CardContent>
            </Card>
            <Card className={`${summary.netAdjustmentValue >= 0 ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10"}`}>
              <CardContent className="pt-4 pb-4">
                <p className={`text-xs font-medium uppercase tracking-wide ${summary.netAdjustmentValue >= 0 ? "text-success" : "text-destructive"}`}>
                  Ajuste neto
                </p>
                <p className={`text-xl font-bold mt-1 ${summary.netAdjustmentValue >= 0 ? "text-success" : "text-destructive"}`}>
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
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
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
                <p className="text-center py-10 text-muted-foreground">Cargando productos...</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[13px]">
                    <thead className="bg-subtle border-b">
                      <tr>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Producto</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground w-32">Costo prom.</th>
                        <th className="text-center py-3 px-4 font-medium text-muted-foreground w-28">Stock actual</th>
                        <th className="text-center py-3 px-4 font-medium text-muted-foreground w-32">Stock real</th>
                        <th className="text-center py-3 px-4 font-medium text-muted-foreground w-28">Diferencia</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground w-36">Monto ajuste</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((product: any) => {
                        const currentStock = valued.get(product.id)?.qty ?? 0;
                        const rawVal = realStockMap[product.id];
                        const realStock = rawVal !== undefined && rawVal !== "" ? parseInt(rawVal) : null;
                        const diff = realStock !== null ? realStock - currentStock : null;
                        const unitPrice = valued.get(product.id)?.cost ?? 0;
                        const adjustmentAmt = diff !== null ? Math.abs(diff) * unitPrice : null;
                        const currency = "DOP";

                        const isChanged = realStock !== null && realStock !== currentStock;
                        const rowCls = isChanged
                          ? diff! > 0
                            ? "bg-success/10 border-b"
                            : "bg-destructive/10 border-b"
                          : "border-b hover:bg-subtle";

                        return (
                          <tr key={product.id} className={rowCls}>
                            <td className="h-[34px] px-3 py-1.5 px-4 font-medium">
                              <span className="text-muted-foreground text-xs mr-2">#{product.id}</span>
                              {product.name}
                            </td>
                            <td className="h-[34px] px-3 py-1.5 px-4 text-right text-muted-foreground">{formatCurrency(unitPrice, currency)}</td>
                            <td className="h-[34px] px-3 py-1.5 px-4 text-center text-muted-foreground">{currentStock}</td>
                            <td className="h-[34px] px-3 py-1.5 px-4 text-center">
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
                            <td className="h-[34px] px-3 py-1.5 px-4 text-center">
                              {diff !== null && diff !== 0 ? (
                                <span className={`flex items-center justify-center gap-1 font-semibold ${diff > 0 ? "text-success" : "text-destructive"}`}>
                                  {diff > 0 ? <Plus className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                                  {diff > 0 ? `+${diff}` : diff}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="h-[34px] px-3 py-1.5 px-4 text-right">
                              {adjustmentAmt !== null && diff !== 0 ? (
                                <span className={diff! > 0 ? "text-success font-medium" : "text-destructive font-medium"}>
                                  {diff! > 0 ? "+" : "-"}
                                  {formatCurrency(adjustmentAmt, currency)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredProducts.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center py-10 text-muted-foreground">
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
                <p className="text-center py-10 text-muted-foreground">Cargando historial...</p>
              ) : history.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
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
                          className="flex items-center justify-between p-4 cursor-pointer hover:bg-subtle"
                          onClick={() => setExpandedAdjustmentId(isExpanded ? null : adj.id)}
                        >
                          <div className="flex items-center gap-4 flex-wrap">
                            <div>
                              <p className="font-semibold text-sm">Ajuste #{adj.id}</p>
                              <p className="text-xs text-muted-foreground">{formatDate(adj.createdAt)}</p>
                              {adj.adjustedByName && (
                                <p className="text-xs text-muted-foreground">Por: {adj.adjustedByName}</p>
                              )}
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              <Badge variant="outline" className="text-success border-success/40 bg-success/10">
                                <TrendingUp className="w-3 h-3 mr-1" />
                                {adj.surplusItems} sobrantes
                              </Badge>
                              <Badge variant="outline" className="text-destructive border-destructive/40 bg-destructive/10">
                                <TrendingDown className="w-3 h-3 mr-1" />
                                {adj.deficitItems} faltantes
                              </Badge>
                              <Badge variant="outline" className="text-primary border-border bg-accent">
                                {adj.totalItems} producto(s)
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Ajuste neto</p>
                              <p className={`font-bold ${parseFloat(adj.netAdjustmentValue) >= 0 ? "text-success" : "text-destructive"}`}>
                                {parseFloat(adj.netAdjustmentValue) >= 0 ? "+" : ""}
                                {formatCurrency(adj.netAdjustmentValue)}
                              </p>
                            </div>
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                          </div>
                        </div>

                        {/* Expanded detail */}
                        {isExpanded && (
                          <div className="border-t bg-subtle p-4">
                            {adj.notes && (
                              <p className="text-sm text-muted-foreground mb-3 italic">"{adj.notes}"</p>
                            )}
                            {/* Summary mini-cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                              <div className="bg-success/10 border border-success/40 rounded p-2 text-center">
                                <p className="text-xs text-success">Valor sobrante</p>
                                <p className="font-bold text-success text-sm">{formatCurrency(adj.surplusValue)}</p>
                              </div>
                              <div className="bg-destructive/10 border border-destructive/40 rounded p-2 text-center">
                                <p className="text-xs text-destructive">Valor faltante</p>
                                <p className="font-bold text-destructive text-sm">{formatCurrency(adj.deficitValue)}</p>
                              </div>
                              <div className={`${parseFloat(adj.netAdjustmentValue) >= 0 ? "bg-success/10 border-success/40" : "bg-destructive/10 border-destructive/40"} border rounded p-2 text-center`}>
                                <p className={`text-xs ${parseFloat(adj.netAdjustmentValue) >= 0 ? "text-success" : "text-destructive"}`}>Ajuste neto</p>
                                <p className={`font-bold text-sm ${parseFloat(adj.netAdjustmentValue) >= 0 ? "text-success" : "text-destructive"}`}>
                                  {formatCurrency(adj.netAdjustmentValue)}
                                </p>
                              </div>
                            </div>

                            {/* Line items table */}
                            {expandedDetail && expandedDetail.id === adj.id ? (
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead className="bg-card border-b">
                                    <tr>
                                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Producto</th>
                                      <th className="text-center py-2 px-3 font-medium text-muted-foreground">Stock anterior</th>
                                      <th className="text-center py-2 px-3 font-medium text-muted-foreground">Stock real</th>
                                      <th className="text-center py-2 px-3 font-medium text-muted-foreground">Diferencia</th>
                                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">Monto ajuste</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(expandedDetail.items || []).map((item: any) => (
                                      <tr key={item.id} className="border-b">
                                        <td className="h-[34px] px-3 py-1.5 font-medium">{item.productName}</td>
                                        <td className="h-[34px] px-3 py-1.5 text-center">{item.previousStock}</td>
                                        <td className="h-[34px] px-3 py-1.5 text-center">{item.realStock}</td>
                                        <td className="h-[34px] px-3 py-1.5 text-center">
                                          <span className={item.difference > 0 ? "text-success font-semibold" : item.difference < 0 ? "text-destructive font-semibold" : "text-muted-foreground"}>
                                            {item.difference > 0 ? `+${item.difference}` : item.difference}
                                          </span>
                                        </td>
                                        <td className="h-[34px] px-3 py-1.5 text-right">
                                          <span className={item.difference > 0 ? "text-success" : item.difference < 0 ? "text-destructive" : "text-muted-foreground"}>
                                            {item.difference !== 0 ? formatCurrency(item.adjustmentAmount, item.baseCurrency) : "—"}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground text-center py-2">Cargando líneas...</p>
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
              <AlertTriangle className="w-5 h-5 text-warning" />
              Confirmar Ajuste de Inventario
            </DialogTitle>
            <DialogDescription>
              Esta acción actualizará el stock de {pendingItems.length} producto(s) y no se puede deshacer.
            </DialogDescription>
          </DialogHeader>

          {/* Mini-summary */}
          <div className="grid grid-cols-2 gap-3 my-2">
            <div className="bg-success/10 border border-success/40 rounded-lg p-3 text-center">
              <p className="text-xs text-success font-medium">Sobrantes</p>
              <p className="text-xl font-bold text-success">{summary.surplusItems}</p>
              <p className="text-xs text-success">{formatCurrency(summary.surplusValue)}</p>
            </div>
            <div className="bg-destructive/10 border border-destructive/40 rounded-lg p-3 text-center">
              <p className="text-xs text-destructive font-medium">Faltantes</p>
              <p className="text-xl font-bold text-destructive">{summary.deficitItems}</p>
              <p className="text-xs text-destructive">{formatCurrency(summary.deficitValue)}</p>
            </div>
            <div className={`col-span-2 rounded-lg p-3 text-center border ${summary.netAdjustmentValue >= 0 ? "bg-success/10 border-success/40" : "bg-destructive/10 border-destructive/40"}`}>
              <p className={`text-sm font-medium ${summary.netAdjustmentValue >= 0 ? "text-success" : "text-destructive"}`}>
                Ajuste neto
              </p>
              <p className={`text-2xl font-bold ${summary.netAdjustmentValue >= 0 ? "text-success" : "text-destructive"}`}>
                {summary.netAdjustmentValue >= 0 ? "+" : ""}
                {formatCurrency(summary.netAdjustmentValue)}
              </p>
            </div>
          </div>

          {/* Optional notes */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">
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
