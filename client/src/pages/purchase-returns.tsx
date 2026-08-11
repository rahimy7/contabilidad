import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Undo2, PlusCircle, Trash2, Eye, CheckCircle2, XCircle, RotateCw } from 'lucide-react';

interface ReturnRow {
  id: number;
  returnNumber: string;
  supplierName: string | null;
  returnDate: string;
  status: string;
  totalAmount: string;
  currency: string;
  createdAt: string;
}
interface Supplier { id: number; name: string; }
interface Warehouse { id: number; name: string; }
interface Product { id: number; name: string; sku?: string | null; price?: string; }

const money = (v: string, ccy = 'DOP') =>
  Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + ccy;

const STATUS: Record<string, { label: string; className?: string; variant?: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
  draft: { label: 'Borrador', variant: 'outline' },
  sent: { label: 'Enviada', variant: 'secondary' },
  completed: { label: 'Completada', className: 'bg-green-600 hover:bg-green-600' },
  cancelled: { label: 'Cancelada', variant: 'destructive' },
};

function StatusBadge({ s }: { s: string }) {
  const c = STATUS[s] ?? { label: s, variant: 'outline' as const };
  return <Badge variant={c.variant ?? 'default'} className={c.className}>{c.label}</Badge>;
}

export default function PurchaseReturnsPage() {
  const [status, setStatus] = useState<string>('all');
  const [detail, setDetail] = useState<number | null>(null);
  const [create, setCreate] = useState(false);

  const q = useQuery<{ rows: ReturnRow[] }>({
    queryKey: ['/api/purchase-returns', status],
    queryFn: () =>
      apiRequest('GET', status === 'all' ? '/api/purchase-returns' : `/api/purchase-returns?status=${status}`) as any,
  });

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Undo2 className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">Devoluciones a proveedor</h1>
            <p className="text-sm text-muted-foreground">
              Espejo de las devoluciones de venta: mercancía que regresa al proveedor.
            </p>
          </div>
        </div>
        <Button onClick={() => setCreate(true)}>
          <PlusCircle className="h-4 w-4 mr-1" /> Nueva devolución
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Label>Filtro:</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="sent">Enviadas</SelectItem>
            <SelectItem value="completed">Completadas</SelectItem>
            <SelectItem value="cancelled">Canceladas</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => q.refetch()}>
          <RotateCw className={`h-4 w-4 mr-1 ${q.isFetching ? 'animate-spin' : ''}`} />
          Refrescar
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Total</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(q.data?.rows ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.returnNumber}</TableCell>
                  <TableCell>{r.supplierName ?? '—'}</TableCell>
                  <TableCell>{r.returnDate}</TableCell>
                  <TableCell><StatusBadge s={r.status} /></TableCell>
                  <TableCell>{money(r.totalAmount, r.currency)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setDetail(r.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {q.data?.rows?.length === 0 && !q.isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Sin devoluciones.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {detail != null && <DetailDialog id={detail} onClose={() => setDetail(null)} />}
      {create && <CreateDialog onClose={() => setCreate(false)} />}
    </div>
  );
}

function DetailDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery<{ return: any; lines: any[] }>({
    queryKey: ['/api/purchase-returns', id],
    queryFn: () => apiRequest('GET', `/api/purchase-returns/${id}`) as any,
  });
  const complete = useMutation({
    mutationFn: () => apiRequest('POST', `/api/purchase-returns/${id}/complete`),
    onSuccess: () => {
      toast({ title: 'Completada', description: 'Stock descontado y devolución cerrada.' });
      qc.invalidateQueries({ queryKey: ['/api/purchase-returns'] });
      onClose();
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const cancel = useMutation({
    mutationFn: () => apiRequest('POST', `/api/purchase-returns/${id}/cancel`),
    onSuccess: () => {
      toast({ title: 'Cancelada' });
      qc.invalidateQueries({ queryKey: ['/api/purchase-returns'] });
      onClose();
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
  const d = q.data;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{d?.return?.returnNumber ?? '…'}</DialogTitle>
          <DialogDescription>
            {d?.return?.supplierName ?? 'Sin proveedor'} · {d ? <StatusBadge s={d.return.status} /> : null}
          </DialogDescription>
        </DialogHeader>
        {d && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Fecha</Label>
                <div>{d.return.returnDate}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Razón</Label>
                <div>{d.return.reason ?? '—'}</div>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Cant.</TableHead>
                  <TableHead>Costo</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.lines.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.productName}</TableCell>
                    <TableCell>{Number(l.quantity)}</TableCell>
                    <TableCell>{money(l.unitCost)}</TableCell>
                    <TableCell className="text-right">{money(l.lineTotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="border-t pt-3 flex justify-end">
              <div className="font-semibold">Total: {money(d.return.totalAmount, d.return.currency)}</div>
            </div>
          </div>
        )}
        <DialogFooter className="flex-wrap gap-2">
          {d?.return?.status === 'draft' && (
            <>
              <Button variant="destructive" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                <XCircle className="h-4 w-4 mr-1" /> Cancelar
              </Button>
              <Button onClick={() => complete.mutate()} disabled={complete.isPending}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Completar (descontar stock)
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DraftLine {
  productId?: number;
  productName: string;
  sku: string;
  quantity: number;
  unitCost: number;
  warehouseId?: number;
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    supplierId: '' as number | '',
    supplierName: '',
    returnDate: new Date().toISOString().slice(0, 10),
    reason: '',
    notes: '',
  });
  const [lines, setLines] = useState<DraftLine[]>([
    { productName: '', sku: '', quantity: 1, unitCost: 0 },
  ]);

  const suppliers = useQuery<Supplier[]>({
    queryKey: ['/api/suppliers'],
    queryFn: () => apiRequest('GET', '/api/suppliers') as any,
  });
  const warehouses = useQuery<Warehouse[]>({
    queryKey: ['/api/warehouses'],
    queryFn: () => apiRequest('GET', '/api/warehouses') as any,
  });

  const create = useMutation({
    mutationFn: () =>
      apiRequest('POST', '/api/purchase-returns', {
        supplierId: form.supplierId === '' ? undefined : Number(form.supplierId),
        supplierName: form.supplierName || undefined,
        returnDate: form.returnDate,
        reason: form.reason || undefined,
        notes: form.notes || undefined,
        lines: lines
          .filter((l) => l.productName && l.quantity > 0)
          .map((l) => ({
            productId: l.productId,
            productName: l.productName,
            sku: l.sku || undefined,
            quantity: l.quantity,
            unitCost: l.unitCost,
            warehouseId: l.warehouseId,
          })),
      }),
    onSuccess: () => {
      toast({ title: 'Devolución creada' });
      qc.invalidateQueries({ queryKey: ['/api/purchase-returns'] });
      onClose();
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const total = lines.reduce((a, l) => a + l.quantity * l.unitCost, 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Nueva devolución a proveedor</DialogTitle>
          <DialogDescription>El descuento de stock se aplica al completar la devolución.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Proveedor</Label>
              <Select
                value={form.supplierId === '' ? '' : String(form.supplierId)}
                onValueChange={(v) => setForm({ ...form, supplierId: v ? Number(v) : '' })}
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {(suppliers.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={form.returnDate} onChange={(e) => setForm({ ...form, returnDate: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Razón</Label>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Producto defectuoso, exceso de pedido…" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Líneas</Label>
              <Button size="sm" variant="outline" onClick={() => setLines([...lines, { productName: '', sku: '', quantity: 1, unitCost: 0 }])}>
                <PlusCircle className="h-4 w-4 mr-1" /> Agregar
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="w-[130px]">Almacén</TableHead>
                  <TableHead className="w-[90px]">Cant.</TableHead>
                  <TableHead className="w-[120px]">Costo</TableHead>
                  <TableHead className="text-right w-[110px]">Total</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Input value={l.productName} onChange={(e) => {
                        const nx = [...lines]; nx[i] = { ...nx[i], productName: e.target.value }; setLines(nx);
                      }} />
                    </TableCell>
                    <TableCell>
                      <Select value={l.warehouseId ? String(l.warehouseId) : ''} onValueChange={(v) => {
                        const nx = [...lines]; nx[i] = { ...nx[i], warehouseId: v ? Number(v) : undefined }; setLines(nx);
                      }}>
                        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {(warehouses.data ?? []).map((w) => (
                            <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={1} value={l.quantity} onChange={(e) => {
                        const nx = [...lines]; nx[i] = { ...nx[i], quantity: Number(e.target.value) }; setLines(nx);
                      }} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} step="0.01" value={l.unitCost} onChange={(e) => {
                        const nx = [...lines]; nx[i] = { ...nx[i], unitCost: Number(e.target.value) }; setLines(nx);
                      }} />
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {money(String(l.quantity * l.unitCost))}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => setLines(lines.filter((_, x) => x !== i))} disabled={lines.length === 1}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end text-sm border-t pt-3">
            <div className="font-semibold">Total: {money(String(total))}</div>
          </div>

          <div>
            <Label>Notas</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>Crear</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
