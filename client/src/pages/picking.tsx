import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { apiRequest } from '@/lib/queryClient';
import { PackageCheck, Printer, MapPin, RotateCw, AlertTriangle } from 'lucide-react';

interface OrderRow {
  id: number;
  order_number: string;
  status: string;
  warehouse_id: number | null;
  warehouse_name: string | null;
  customer_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  total_amount: string;
  priority: string | null;
  item_count: number;
  created_at: string;
}
interface OrderDetail {
  order: {
    id: number; order_number: string; status: string;
    warehouse_name: string | null; customer_name: string | null;
    customer_phone: string | null; delivery_address: string | null;
    total_amount: string; notes: string | null; created_at: string;
  };
  lines: Array<{
    id: number; product_id: number; product_name: string; sku: string | null;
    quantity: number; unit_price: string; total_price: string;
    warehouse_id: number | null; stock_on_hand: string | null; reserved: string | null;
    locations: Array<{ code: string; quantity: string; lotNo: string | null; expirationDate: string | null }>;
  }>;
}
interface Warehouse { id: number; name: string; }

const money = (v: string) => Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const priorityLabel = (p: string | null) => p === 'high' ? 'Alta' : p === 'low' ? 'Baja' : 'Normal';
const priorityClass = (p: string | null) => p === 'high' ? 'bg-red-600 hover:bg-red-600' : p === 'low' ? '' : 'bg-blue-600 hover:bg-blue-600';

export default function PickingPage() {
  const [warehouseId, setWarehouseId] = useState<string>('all');
  const [detail, setDetail] = useState<number | null>(null);

  const wh = useQuery<Warehouse[]>({
    queryKey: ['/api/warehouses'],
    queryFn: () => apiRequest('GET', '/api/warehouses') as any,
  });

  const q = useQuery<{ rows: OrderRow[] }>({
    queryKey: ['/api/picking/orders', warehouseId],
    queryFn: () =>
      apiRequest(
        'GET',
        warehouseId === 'all' ? '/api/picking/orders' : `/api/picking/orders?warehouseId=${warehouseId}`,
      ) as any,
  });

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      <div className="flex items-center gap-3">
        <PackageCheck className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Despacho / Picking</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos listos para sacar del almacén. Cuando el almacén tiene WMS activado se propone la ubicación.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Label>Almacén:</Label>
        <Select value={warehouseId} onValueChange={setWarehouseId}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {(wh.data ?? []).map((w) => (
              <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => q.refetch()}>
          <RotateCw className={`h-4 w-4 mr-1 ${q.isFetching ? 'animate-spin' : ''}`} />
          Refrescar
        </Button>
        <span className="text-sm text-muted-foreground">
          {q.data?.rows?.length ?? 0} pedidos
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prioridad</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Almacén</TableHead>
                <TableHead className="w-[80px]">Ítems</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-[120px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(q.data?.rows ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Badge className={priorityClass(r.priority)}>{priorityLabel(r.priority)}</Badge>
                  </TableCell>
                  <TableCell className="font-mono">{r.order_number}</TableCell>
                  <TableCell>
                    <div>{r.customer_name ?? '—'}</div>
                    {r.customer_phone && <div className="text-xs text-muted-foreground">{r.customer_phone}</div>}
                  </TableCell>
                  <TableCell>{r.warehouse_name ?? '—'}</TableCell>
                  <TableCell>{r.item_count}</TableCell>
                  <TableCell className="text-right font-mono">{money(r.total_amount)}</TableCell>
                  <TableCell>
                    <Button size="sm" onClick={() => setDetail(r.id)}>
                      Ver lista
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {q.data?.rows?.length === 0 && !q.isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Sin pedidos por despachar.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {detail != null && <PickingDialog orderId={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function PickingDialog({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const q = useQuery<OrderDetail>({
    queryKey: ['/api/picking/orders', orderId],
    queryFn: () => apiRequest('GET', `/api/picking/orders/${orderId}`) as any,
  });

  const print = () => {
    window.print();
  };

  const d = q.data;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl print:max-w-none print:shadow-none">
        <DialogHeader>
          <DialogTitle>Lista de picking — {d?.order?.order_number ?? '…'}</DialogTitle>
          <DialogDescription>
            {d?.order?.customer_name ?? '—'} · {d?.order?.warehouse_name ?? '—'}
          </DialogDescription>
        </DialogHeader>
        {d && (
          <div className="space-y-4 text-sm print:text-xs" id="picking-print">
            {d.order.delivery_address && (
              <div className="rounded-md border p-2 bg-muted/40">
                <div className="text-xs text-muted-foreground">Entregar en</div>
                <div>{d.order.delivery_address}</div>
                {d.order.customer_phone && <div className="text-xs">Tel: {d.order.customer_phone}</div>}
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="w-[80px]">Cant.</TableHead>
                  <TableHead>Ubicación sugerida</TableHead>
                  <TableHead className="w-[100px]">Existencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.lines.map((l) => {
                  const onHand = l.stock_on_hand ? Number(l.stock_on_hand) : 0;
                  const shortage = onHand < l.quantity;
                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="font-medium">{l.product_name}</div>
                        {l.sku && <div className="text-xs text-muted-foreground">{l.sku}</div>}
                      </TableCell>
                      <TableCell className="font-mono font-semibold">{l.quantity}</TableCell>
                      <TableCell>
                        {l.locations.length === 0 && (
                          <span className="text-xs text-muted-foreground">
                            Almacén sin WMS — buscar en {d.order.warehouse_name}
                          </span>
                        )}
                        {l.locations.map((loc, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <MapPin className="h-3 w-3" />
                            <span className="font-mono font-medium">{loc.code}</span>
                            <span className="text-muted-foreground">({loc.quantity})</span>
                            {loc.lotNo && <span className="text-muted-foreground">lote {loc.lotNo}</span>}
                            {loc.expirationDate && <span className="text-muted-foreground">vence {loc.expirationDate}</span>}
                          </div>
                        ))}
                      </TableCell>
                      <TableCell className="text-xs">
                        {shortage ? (
                          <span className="text-destructive flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> {onHand} / {l.quantity}
                          </span>
                        ) : (
                          <span>{onHand}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {d.order.notes && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Notas del pedido:</span> {d.order.notes}
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 print:hidden">
          <Button variant="outline" onClick={print}>
            <Printer className="h-4 w-4 mr-1" /> Imprimir
          </Button>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
