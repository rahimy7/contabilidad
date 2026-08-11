import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiRequest } from '@/lib/queryClient';
import { PackagePlus, ShoppingBag, RotateCw, AlertTriangle, Clock } from 'lucide-react';

interface Suggestion {
  productId: number;
  productName: string;
  sku: string | null;
  warehouseId: number;
  warehouseName: string;
  onHand: number;
  reserved: number;
  available: number;
  minStock: number;
  maxStock: number | null;
  suggestedQty: number;
  daysCover: number | null;
  urgency: 'critical' | 'warn' | 'info';
}
interface Warehouse { id: number; name: string; }

const urgencyBadge = (u: Suggestion['urgency']) => {
  switch (u) {
    case 'critical': return <Badge variant="destructive">Sin stock</Badge>;
    case 'warn': return <Badge className="bg-amber-600 hover:bg-amber-600">Bajo mínimo</Badge>;
    case 'info': return <Badge variant="secondary">Cerca del mínimo</Badge>;
  }
};

export default function ReplenishmentPage() {
  const [warehouseId, setWarehouseId] = useState<string>('all');
  const [includeYellow, setIncludeYellow] = useState<boolean>(false);
  const [windowDays, setWindowDays] = useState<number>(30);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const wh = useQuery<Warehouse[]>({
    queryKey: ['/api/warehouses'],
    queryFn: () => apiRequest('GET', '/api/warehouses') as any,
  });

  const params = new URLSearchParams({ windowDays: String(windowDays) });
  if (warehouseId !== 'all') params.set('warehouseId', warehouseId);
  if (includeYellow) params.set('includeYellow', 'true');

  const q = useQuery<{ rows: Suggestion[] }>({
    queryKey: ['/api/replenishment/suggestions', params.toString()],
    queryFn: () => apiRequest('GET', `/api/replenishment/suggestions?${params.toString()}`) as any,
  });

  const rows = q.data?.rows ?? [];
  const toggle = (key: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(`${r.warehouseId}:${r.productId}`));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => `${r.warehouseId}:${r.productId}`)));

  const chosen = useMemo(
    () => rows.filter((r) => selected.has(`${r.warehouseId}:${r.productId}`)),
    [rows, selected],
  );
  const totalItems = chosen.reduce((a, r) => a + r.suggestedQty, 0);

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      <div className="flex items-center gap-3">
        <PackagePlus className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Reabastecimiento sugerido</h1>
          <p className="text-sm text-muted-foreground">
            Productos por debajo del mínimo, ordenados por urgencia. Selecciona los que quieras y crea una orden de compra.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div>
          <Label className="text-xs">Almacén</Label>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(wh.data ?? []).map((w) => (
                <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Ventana de consumo (días)</Label>
          <Input type="number" min={1} max={365} value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} className="w-[120px]" />
        </div>
        <div className="flex items-center gap-2 mt-4">
          <Checkbox checked={includeYellow} onCheckedChange={(v) => setIncludeYellow(v === true)} id="yellow" />
          <Label htmlFor="yellow" className="text-sm">Incluir productos cerca del mínimo</Label>
        </div>
        <div className="mt-4">
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>
            <RotateCw className={`h-4 w-4 mr-1 ${q.isFetching ? 'animate-spin' : ''}`} />
            Refrescar
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Almacén</TableHead>
                <TableHead className="text-right">Disponible</TableHead>
                <TableHead className="text-right">Mín / Máx</TableHead>
                <TableHead className="text-right">Sugerido</TableHead>
                <TableHead>Cobertura</TableHead>
                <TableHead>Urgencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const key = `${r.warehouseId}:${r.productId}`;
                return (
                  <TableRow key={key}>
                    <TableCell>
                      <Checkbox checked={selected.has(key)} onCheckedChange={() => toggle(key)} />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{r.productName}</div>
                      {r.sku && <div className="text-xs text-muted-foreground">{r.sku}</div>}
                    </TableCell>
                    <TableCell>{r.warehouseName}</TableCell>
                    <TableCell className="text-right font-mono">
                      {r.available}
                      {r.reserved > 0 && (
                        <div className="text-xs text-muted-foreground">
                          (—{r.reserved} reserv.)
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {r.minStock}
                      {r.maxStock != null && ` / ${r.maxStock}`}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">{r.suggestedQty}</TableCell>
                    <TableCell>
                      {r.daysCover != null ? (
                        <span className="flex items-center gap-1 text-xs">
                          <Clock className="h-3 w-3" />
                          {r.daysCover < 0 ? '0' : r.daysCover} días
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">sin ventas</span>
                      )}
                    </TableCell>
                    <TableCell>{urgencyBadge(r.urgency)}</TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && !q.isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    <div className="flex flex-col items-center gap-2">
                      <PackagePlus className="h-8 w-8 opacity-30" />
                      <div>Ningún producto necesita reabastecimiento con los criterios actuales.</div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {chosen.length > 0 && (
        <div className="sticky bottom-4 bg-background border rounded-lg p-3 flex items-center justify-between shadow-lg">
          <div className="text-sm">
            <span className="font-semibold">{chosen.length}</span> productos seleccionados ·
            {' '}<span className="font-mono">{totalItems}</span> unidades sugeridas
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSelected(new Set())}>Limpiar</Button>
            <Button asChild>
              <a
                href="/purchase-management?prefill=1"
                onClick={() => {
                  // Guardar la selección para que /purchase-management la lea al arrancar.
                  sessionStorage.setItem(
                    'purchase_prefill',
                    JSON.stringify(chosen.map((c) => ({
                      productId: c.productId, productName: c.productName,
                      warehouseId: c.warehouseId, quantity: c.suggestedQty,
                    }))),
                  );
                }}
              >
                <ShoppingBag className="h-4 w-4 mr-1" /> Crear orden de compra
              </a>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
