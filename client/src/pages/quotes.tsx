import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  FileText, PlusCircle, RotateCw, Trash2, ArrowRight, Send, XCircle,
  CheckCircle2, Eye, ClipboardCopy,
} from 'lucide-react';

interface QuoteRow {
  id: number;
  quoteNumber: string;
  customerName: string | null;
  status: string;
  totalAmount: string;
  currency: string;
  validUntil: string | null;
  createdAt: string;
}
interface QuoteDetail {
  quote: QuoteRow & {
    subtotal: string; discountAmount: string; taxAmount: string;
    customerRnc: string | null; customerEmail: string | null; customerPhone: string | null;
    notes: string | null; internalNotes: string | null;
    convertedTo: string | null; convertedDocumentId: number | null;
  };
  lines: Array<{
    id: number; productName: string; sku: string | null; quantity: string;
    unitPrice: string; discountPercent: string; lineTotal: string; notes: string | null;
  }>;
}

const STATUS_LABEL: Record<string, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline'; className?: string }> = {
  draft: { label: 'Borrador', variant: 'outline' },
  sent: { label: 'Enviada', variant: 'secondary' },
  accepted: { label: 'Aceptada', variant: 'default', className: 'bg-green-600 hover:bg-green-600' },
  rejected: { label: 'Rechazada', variant: 'destructive' },
  expired: { label: 'Expirada', variant: 'destructive' },
  converted: { label: 'Convertida', variant: 'default', className: 'bg-blue-600 hover:bg-blue-600' },
  cancelled: { label: 'Cancelada', variant: 'outline' },
};

const money = (v: string, ccy = 'DOP') =>
  Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + ccy;

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? { label: status, variant: 'outline' as const };
  return <Badge variant={s.variant} className={s.className}>{s.label}</Badge>;
}

export default function QuotesPage() {
  const [status, setStatus] = useState<string>('all');
  const [detail, setDetail] = useState<number | null>(null);
  const [create, setCreate] = useState(false);
  const q = useQuery<{ total: number; rows: QuoteRow[] }>({
    queryKey: ['/api/quotes', status],
    queryFn: () =>
      apiRequest('GET', status === 'all' ? '/api/quotes' : `/api/quotes?status=${status}`) as any,
  });

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <FileText className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">Cotizaciones de venta</h1>
            <p className="text-sm text-muted-foreground">
              Documento previo a factura: mismo shape sin consumir NCF. Se convierte al aceptarse.
            </p>
          </div>
        </div>
        <Button onClick={() => setCreate(true)}>
          <PlusCircle className="h-4 w-4 mr-1" /> Nueva cotización
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Label>Filtro:</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="sent">Enviadas</SelectItem>
            <SelectItem value="accepted">Aceptadas</SelectItem>
            <SelectItem value="rejected">Rechazadas</SelectItem>
            <SelectItem value="expired">Expiradas</SelectItem>
            <SelectItem value="converted">Convertidas</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => q.refetch()}>
          <RotateCw className={`h-4 w-4 mr-1 ${q.isFetching ? 'animate-spin' : ''}`} />
          Refrescar
        </Button>
        <span className="text-sm text-muted-foreground">
          {q.data?.total ?? 0} registros
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Válida hasta</TableHead>
                <TableHead>Creada</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(q.data?.rows ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.quoteNumber}</TableCell>
                  <TableCell>{r.customerName ?? '—'}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell>{money(r.totalAmount, r.currency)}</TableCell>
                  <TableCell>{r.validUntil ?? '—'}</TableCell>
                  <TableCell className="text-xs font-mono">
                    {new Date(r.createdAt).toLocaleDateString('es-DO')}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setDetail(r.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {q.data?.rows?.length === 0 && !q.isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Sin cotizaciones.
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
  const q = useQuery<QuoteDetail>({
    queryKey: ['/api/quotes', id],
    queryFn: () => apiRequest('GET', `/api/quotes/${id}`) as any,
  });

  const status = useMutation({
    mutationFn: (s: string) => apiRequest('POST', `/api/quotes/${id}/status`, { status: s }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/quotes'] });
      toast({ title: 'Estado actualizado' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const convert = useMutation({
    mutationFn: () => apiRequest('POST', `/api/quotes/${id}/convert`),
    onSuccess: (d: any) => {
      toast({ title: 'Convertida en pedido', description: `Orden #${d.orderId}` });
      qc.invalidateQueries({ queryKey: ['/api/quotes'] });
      onClose();
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const d = q.data;
  const canSend = d?.quote.status === 'draft';
  const canAccept = d?.quote.status === 'sent';
  const canReject = d?.quote.status === 'sent';
  const canConvert = d?.quote.status === 'accepted' || d?.quote.status === 'sent';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{d?.quote.quoteNumber ?? '…'}</DialogTitle>
          <DialogDescription>
            {d?.quote.customerName ?? 'Cliente sin nombre'} · <StatusBadge status={d?.quote.status ?? 'draft'} />
          </DialogDescription>
        </DialogHeader>
        {d && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">RNC / Cédula</Label>
                <div>{d.quote.customerRnc ?? '—'}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Válida hasta</Label>
                <div>{d.quote.validUntil ?? '—'}</div>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Cant.</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead>Desc.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.productName}</TableCell>
                    <TableCell>{Number(l.quantity)}</TableCell>
                    <TableCell>{money(l.unitPrice)}</TableCell>
                    <TableCell>{Number(l.discountPercent) > 0 ? `${Number(l.discountPercent)}%` : '—'}</TableCell>
                    <TableCell className="text-right">{money(l.lineTotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="grid grid-cols-2 gap-2 text-sm border-t pt-3">
              <div className="text-muted-foreground">Subtotal</div>
              <div className="text-right font-mono">{money(d.quote.subtotal)}</div>
              <div className="text-muted-foreground">Descuento</div>
              <div className="text-right font-mono">{money(d.quote.discountAmount)}</div>
              <div className="text-muted-foreground">ITBIS</div>
              <div className="text-right font-mono">{money(d.quote.taxAmount)}</div>
              <div className="font-semibold">Total</div>
              <div className="text-right font-mono font-semibold">{money(d.quote.totalAmount, d.quote.currency)}</div>
            </div>

            {d.quote.notes && (
              <div>
                <Label className="text-xs text-muted-foreground">Notas al cliente</Label>
                <div className="text-sm whitespace-pre-wrap">{d.quote.notes}</div>
              </div>
            )}
            {d.quote.convertedTo && d.quote.convertedDocumentId && (
              <div className="text-sm rounded-md border p-2 bg-muted/40">
                Convertida a {d.quote.convertedTo === 'order' ? 'pedido' : 'factura'} #{d.quote.convertedDocumentId}
              </div>
            )}
          </div>
        )}
        <DialogFooter className="flex-wrap gap-2">
          {canSend && (
            <Button variant="outline" onClick={() => status.mutate('sent')} disabled={status.isPending}>
              <Send className="h-4 w-4 mr-1" /> Marcar como enviada
            </Button>
          )}
          {canReject && (
            <Button variant="destructive" onClick={() => status.mutate('rejected')} disabled={status.isPending}>
              <XCircle className="h-4 w-4 mr-1" /> Rechazar
            </Button>
          )}
          {canAccept && (
            <Button onClick={() => status.mutate('accepted')} disabled={status.isPending}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Marcar aceptada
            </Button>
          )}
          {canConvert && (
            <Button onClick={() => convert.mutate()} disabled={convert.isPending}>
              <ArrowRight className="h-4 w-4 mr-1" /> Convertir en pedido
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DraftLine {
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  notes: string;
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    customerName: '',
    customerRnc: '',
    customerEmail: '',
    customerPhone: '',
    validUntil: '',
    notes: '',
    internalNotes: '',
  });
  const [lines, setLines] = useState<DraftLine[]>([
    { productName: '', sku: '', quantity: 1, unitPrice: 0, discountPercent: 0, notes: '' },
  ]);

  const addLine = () => setLines([...lines, { productName: '', sku: '', quantity: 1, unitPrice: 0, discountPercent: 0, notes: '' }]);
  const removeLine = (i: number) => setLines(lines.filter((_, x) => x !== i));
  const patchLine = (i: number, p: Partial<DraftLine>) =>
    setLines(lines.map((l, x) => (x === i ? { ...l, ...p } : l)));

  const subtotal = lines.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
  const discount = lines.reduce((a, l) => a + l.quantity * l.unitPrice * (l.discountPercent / 100), 0);
  const total = subtotal - discount;

  const create = useMutation({
    mutationFn: () =>
      apiRequest('POST', '/api/quotes', {
        ...form,
        customerName: form.customerName || undefined,
        customerRnc: form.customerRnc || undefined,
        customerEmail: form.customerEmail || undefined,
        customerPhone: form.customerPhone || undefined,
        validUntil: form.validUntil || undefined,
        notes: form.notes || undefined,
        internalNotes: form.internalNotes || undefined,
        lines: lines
          .filter((l) => l.productName && l.quantity > 0 && l.unitPrice >= 0)
          .map((l) => ({
            productName: l.productName,
            sku: l.sku || undefined,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discountPercent: l.discountPercent || undefined,
            notes: l.notes || undefined,
          })),
      }),
    onSuccess: () => {
      toast({ title: 'Cotización creada' });
      qc.invalidateQueries({ queryKey: ['/api/quotes'] });
      onClose();
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Nueva cotización</DialogTitle>
          <DialogDescription>Los totales se calculan automáticamente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cliente</Label>
              <Input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
            </div>
            <div>
              <Label>RNC / Cédula</Label>
              <Input value={form.customerRnc} onChange={(e) => setForm({ ...form, customerRnc: e.target.value })} />
            </div>
            <div>
              <Label>Correo</Label>
              <Input value={form.customerEmail} onChange={(e) => setForm({ ...form, customerEmail: e.target.value })} />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input value={form.customerPhone} onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} />
            </div>
            <div>
              <Label>Válida hasta</Label>
              <Input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Líneas</Label>
              <Button size="sm" variant="outline" onClick={addLine}>
                <PlusCircle className="h-4 w-4 mr-1" /> Agregar línea
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto / Descripción</TableHead>
                  <TableHead className="w-[100px]">Cant.</TableHead>
                  <TableHead className="w-[120px]">Precio</TableHead>
                  <TableHead className="w-[90px]">Desc %</TableHead>
                  <TableHead className="text-right w-[110px]">Total</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Input value={l.productName} onChange={(e) => patchLine(i, { productName: e.target.value })} placeholder="Nombre del producto" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={1} value={l.quantity} onChange={(e) => patchLine(i, { quantity: Number(e.target.value) })} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} step="0.01" value={l.unitPrice} onChange={(e) => patchLine(i, { unitPrice: Number(e.target.value) })} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} max={100} value={l.discountPercent} onChange={(e) => patchLine(i, { discountPercent: Number(e.target.value) })} />
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {money(String((l.quantity * l.unitPrice) * (1 - l.discountPercent / 100)))}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => removeLine(i)} disabled={lines.length === 1}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm border-t pt-3">
            <div className="text-muted-foreground">Subtotal</div>
            <div className="text-right font-mono">{money(String(subtotal))}</div>
            <div className="text-muted-foreground">Descuento</div>
            <div className="text-right font-mono">{money(String(discount))}</div>
            <div className="font-semibold">Total</div>
            <div className="text-right font-mono font-semibold">{money(String(total))}</div>
          </div>

          <div>
            <Label>Notas al cliente (aparecen en el documento)</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div>
            <Label>Notas internas (no se envían)</Label>
            <Textarea rows={2} value={form.internalNotes} onChange={(e) => setForm({ ...form, internalNotes: e.target.value })} />
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
