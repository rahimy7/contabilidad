import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { CheckCircle2, XCircle, MessageSquarePlus, ShieldCheck, Trash2, PlusCircle, RotateCw } from 'lucide-react';

interface Approval {
  id: number;
  documentType: string;
  documentId: string;
  documentRef: string | null;
  amount: string;
  currency: string;
  requestedBy: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  requiredApprovals: number;
  receivedApprovals: number;
  approverRole: string | null;
  approverUserId: number | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface ApprovalDetail {
  request: Approval;
  actions: Array<{
    id: number;
    actor_user_id: number;
    action: string;
    comment: string | null;
    created_at: string;
  }>;
}

interface ApprovalRule {
  id: number;
  document_type: string;
  min_amount: string;
  max_amount: string | null;
  approver_role: string | null;
  approver_user_id: number | null;
  required_approvals: number;
  is_active: boolean;
  priority: number;
  notes: string | null;
}

const DOC_TYPE_LABEL: Record<string, string> = {
  purchase_order: 'Orden de compra',
  price_discount: 'Descuento de precio',
  requisition: 'Requisición interna',
  vacation_request: 'Vacaciones y permisos',
  inventory_adjustment: 'Ajuste de inventario',
};

const money = (v: string, ccy = 'DOP') =>
  Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + ccy;

function StatusBadge({ status }: { status: Approval['status'] }) {
  switch (status) {
    case 'approved':
      return <Badge className="bg-green-600 hover:bg-green-600">Aprobada</Badge>;
    case 'rejected':
      return <Badge variant="destructive">Rechazada</Badge>;
    case 'cancelled':
      return <Badge variant="outline">Cancelada</Badge>;
    default:
      return <Badge variant="secondary">Pendiente</Badge>;
  }
}

export default function ApprovalsPage() {
  const [tab, setTab] = useState('inbox');
  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Aprobaciones</h1>
          <p className="text-sm text-muted-foreground">
            Solicitudes que requieren autorización antes de tomar efecto contable u operativo.
          </p>
        </div>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="inbox">Mi bandeja</TabsTrigger>
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="rules">Reglas</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox"><InboxTab /></TabsContent>
        <TabsContent value="all"><AllTab /></TabsContent>
        <TabsContent value="rules"><RulesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function InboxTab() {
  const q = useQuery<{ rows: any[] }>({
    queryKey: ['/api/approvals/inbox'],
    queryFn: () => apiRequest('GET', '/api/approvals/inbox') as any,
  });
  const rows: Approval[] = (q.data?.rows ?? []).map((r: any) => ({
    id: r.id,
    documentType: r.document_type,
    documentId: r.document_id,
    documentRef: r.document_ref,
    amount: r.amount,
    currency: r.currency,
    requestedBy: r.requested_by,
    reason: r.reason,
    status: r.status,
    requiredApprovals: r.required_approvals,
    receivedApprovals: r.received_approvals,
    approverRole: r.approver_role,
    approverUserId: r.approver_user_id,
    createdAt: r.created_at,
    resolvedAt: null,
  }));
  return <RequestsList rows={rows} isLoading={q.isLoading} onRefresh={() => q.refetch()} showActions />;
}

function AllTab() {
  const [status, setStatus] = useState<string>('pending');
  const q = useQuery<{ total: number; rows: Approval[] }>({
    queryKey: ['/api/approvals', status],
    queryFn: () => apiRequest('GET', `/api/approvals?status=${status}`) as any,
  });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Label>Estado:</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pendientes</SelectItem>
            <SelectItem value="approved">Aprobadas</SelectItem>
            <SelectItem value="rejected">Rechazadas</SelectItem>
            <SelectItem value="cancelled">Canceladas</SelectItem>
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
      <RequestsList rows={q.data?.rows ?? []} isLoading={q.isLoading} showActions={status === 'pending'} />
    </div>
  );
}

function RequestsList({ rows, isLoading, showActions, onRefresh }: {
  rows: Approval[]; isLoading: boolean; showActions?: boolean; onRefresh?: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Solicitante</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[110px]">Progreso</TableHead>
                <TableHead className="w-[140px]">Solicitada</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && !isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Sin solicitudes.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{DOC_TYPE_LABEL[r.documentType] ?? r.documentType}</TableCell>
                  <TableCell>
                    <span className="font-mono text-sm">{r.documentRef ?? r.documentId}</span>
                  </TableCell>
                  <TableCell>{money(r.amount, r.currency)}</TableCell>
                  <TableCell className="text-sm">#{r.requestedBy}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-sm">
                    {r.receivedApprovals}/{r.requiredApprovals}
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {new Date(r.createdAt).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => setSelected(r.id)}>
                      Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selected != null && (
        <ApprovalDetailDialog
          id={selected}
          onClose={() => setSelected(null)}
          onResolved={() => { setSelected(null); onRefresh?.(); }}
          showActions={showActions}
        />
      )}
    </>
  );
}

function ApprovalDetailDialog({ id, onClose, onResolved, showActions }: {
  id: number; onClose: () => void; onResolved: () => void; showActions?: boolean;
}) {
  const { toast } = useToast();
  const [comment, setComment] = useState('');
  const qc = useQueryClient();
  const q = useQuery<ApprovalDetail>({
    queryKey: ['/api/approvals', id],
    queryFn: () => apiRequest('GET', `/api/approvals/${id}`) as any,
  });

  const resolve = useMutation({
    mutationFn: (action: 'approve' | 'reject' | 'comment' | 'cancel') =>
      apiRequest('POST', `/api/approvals/${id}/resolve`, { action, comment: comment || undefined }),
    onSuccess: () => {
      toast({ title: 'Actualizada' });
      qc.invalidateQueries({ queryKey: ['/api/approvals'] });
      qc.invalidateQueries({ queryKey: ['/api/approvals/inbox'] });
      onResolved();
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const d = q.data;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Solicitud #{id}</DialogTitle>
          <DialogDescription>
            {d && (DOC_TYPE_LABEL[d.request.documentType] ?? d.request.documentType)}
          </DialogDescription>
        </DialogHeader>
        {q.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {d && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Documento</Label>
                <div className="font-mono">{d.request.documentRef ?? d.request.documentId}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Monto</Label>
                <div>{money(d.request.amount, d.request.currency)}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Estado</Label>
                <div><StatusBadge status={d.request.status} /></div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Aprobaciones</Label>
                <div>{d.request.receivedApprovals} de {d.request.requiredApprovals}</div>
              </div>
              {d.request.reason && (
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">Razón</Label>
                  <div>{d.request.reason}</div>
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Historial</Label>
              <div className="space-y-2">
                {d.actions.length === 0 && (
                  <p className="text-sm text-muted-foreground">Sin acciones aún.</p>
                )}
                {d.actions.map((a) => (
                  <div key={a.id} className="border rounded-md p-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{a.action}</Badge>
                      <span className="text-xs text-muted-foreground">
                        usuario #{a.actor_user_id} · {new Date(a.created_at).toLocaleString('es-DO')}
                      </span>
                    </div>
                    {a.comment && <div className="mt-1 text-muted-foreground">{a.comment}</div>}
                  </div>
                ))}
              </div>
            </div>

            {showActions && d.request.status === 'pending' && (
              <div className="space-y-2">
                <Label>Comentario (opcional)</Label>
                <Textarea
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Explica la decisión…"
                />
              </div>
            )}
          </div>
        )}
        <DialogFooter className="flex gap-2 flex-wrap">
          {showActions && d?.request.status === 'pending' && (
            <>
              <Button variant="outline" onClick={() => resolve.mutate('comment')} disabled={resolve.isPending || !comment}>
                <MessageSquarePlus className="h-4 w-4 mr-1" /> Comentar
              </Button>
              <Button variant="destructive" onClick={() => resolve.mutate('reject')} disabled={resolve.isPending}>
                <XCircle className="h-4 w-4 mr-1" /> Rechazar
              </Button>
              <Button onClick={() => resolve.mutate('approve')} disabled={resolve.isPending}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Aprobar
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RulesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    documentType: 'purchase_order',
    minAmount: 0,
    maxAmount: '' as number | '',
    approverRole: 'admin',
    approverUserId: '' as number | '',
    requiredApprovals: 1,
    priority: 100,
    notes: '',
  });

  const q = useQuery<{ rows: ApprovalRule[] }>({
    queryKey: ['/api/approval-rules'],
    queryFn: () => apiRequest('GET', '/api/approval-rules') as any,
  });

  const create = useMutation({
    mutationFn: () =>
      apiRequest('POST', '/api/approval-rules', {
        documentType: form.documentType,
        minAmount: Number(form.minAmount) || 0,
        maxAmount: form.maxAmount === '' ? undefined : Number(form.maxAmount),
        approverRole: form.approverRole || undefined,
        approverUserId: form.approverUserId === '' ? undefined : Number(form.approverUserId),
        requiredApprovals: form.requiredApprovals,
        priority: form.priority,
        notes: form.notes || undefined,
      }),
    onSuccess: () => {
      toast({ title: 'Regla creada' });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['/api/approval-rules'] });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/approval-rules/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/approval-rules'] });
      toast({ title: 'Regla eliminada' });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          Reglas por tipo de documento. La de mayor prioridad (menor número) dentro del rango de monto gana.
        </div>
        <Button onClick={() => setOpen(true)}>
          <PlusCircle className="h-4 w-4 mr-1" /> Nueva regla
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Monto mínimo</TableHead>
                <TableHead>Monto máximo</TableHead>
                <TableHead>Aprobador</TableHead>
                <TableHead className="w-[100px]">Aprobs.</TableHead>
                <TableHead className="w-[90px]">Prioridad</TableHead>
                <TableHead className="w-[80px]">Activa</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(q.data?.rows ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{DOC_TYPE_LABEL[r.document_type] ?? r.document_type}</TableCell>
                  <TableCell>{money(r.min_amount)}</TableCell>
                  <TableCell>{r.max_amount ? money(r.max_amount) : '—'}</TableCell>
                  <TableCell>
                    {r.approver_role ? `rol: ${r.approver_role}` : `usuario #${r.approver_user_id}`}
                  </TableCell>
                  <TableCell>{r.required_approvals}</TableCell>
                  <TableCell>{r.priority}</TableCell>
                  <TableCell>
                    {r.is_active ? <Badge className="bg-green-600 hover:bg-green-600">Sí</Badge> : <Badge variant="outline">No</Badge>}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => del.mutate(r.id)} disabled={del.isPending}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {q.data?.rows?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Sin reglas configuradas.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva regla de aprobación</DialogTitle>
            <DialogDescription>
              Se aplicará al documento cuyo monto entre en el rango.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tipo de documento</Label>
              <Select value={form.documentType} onValueChange={(v) => setForm({ ...form, documentType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DOC_TYPE_LABEL).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Monto mínimo</Label>
                <Input
                  type="number"
                  value={form.minAmount}
                  onChange={(e) => setForm({ ...form, minAmount: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Monto máximo (vacío = sin tope)</Label>
                <Input
                  type="number"
                  value={form.maxAmount}
                  onChange={(e) => setForm({ ...form, maxAmount: e.target.value === '' ? '' : Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Rol del aprobador</Label>
                <Input
                  value={form.approverRole}
                  onChange={(e) => setForm({ ...form, approverRole: e.target.value })}
                  placeholder="admin, seller…"
                />
              </div>
              <div>
                <Label>o usuario específico (ID)</Label>
                <Input
                  type="number"
                  value={form.approverUserId}
                  onChange={(e) => setForm({ ...form, approverUserId: e.target.value === '' ? '' : Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Aprobaciones requeridas</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.requiredApprovals}
                  onChange={(e) => setForm({ ...form, requiredApprovals: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Prioridad (menor = más específica)</Label>
                <Input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
