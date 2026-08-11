import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { apiRequest } from '@/lib/queryClient';
import { FileClock, Filter, RotateCw, ChevronLeft, ChevronRight, Eye } from 'lucide-react';

interface AuditRow {
  id: number;
  user_id: number | null;
  store_id: number | null;
  action: string;
  resource: string;
  resource_id: string | null;
  details: unknown;
  ip_address: string | null;
  user_agent: string | null;
  method: string | null;
  path: string | null;
  status_code: number | null;
  created_at: string;
}

interface AuditResp {
  total: number;
  limit: number;
  offset: number;
  rows: AuditRow[];
}

const PAGE_SIZE = 100;

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 16);
}

function statusVariant(code: number | null): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (code == null) return 'outline';
  if (code >= 500) return 'destructive';
  if (code >= 400) return 'destructive';
  if (code >= 300) return 'secondary';
  return 'default';
}

function methodColor(method: string | null): string {
  switch ((method ?? '').toUpperCase()) {
    case 'POST': return 'bg-emerald-600 hover:bg-emerald-600';
    case 'PUT': return 'bg-amber-600 hover:bg-amber-600';
    case 'PATCH': return 'bg-blue-600 hover:bg-blue-600';
    case 'DELETE': return 'bg-red-600 hover:bg-red-600';
    default: return 'bg-slate-600 hover:bg-slate-600';
  }
}

export default function AuditLogPage() {
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState({
    userId: '',
    resource: '',
    method: '',
    from: '',
    to: '',
  });
  const [pendingFilters, setPendingFilters] = useState(filters);
  const [detail, setDetail] = useState<AuditRow | null>(null);

  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  if (filters.userId) params.set('userId', filters.userId);
  if (filters.resource) params.set('resource', filters.resource);
  if (filters.method) params.set('method', filters.method);
  if (filters.from) params.set('from', new Date(filters.from).toISOString());
  if (filters.to) params.set('to', new Date(filters.to).toISOString());

  const q = useQuery<AuditResp>({
    queryKey: ['/api/audit-log', params.toString()],
    queryFn: () => apiRequest('GET', `/api/audit-log?${params.toString()}`) as Promise<AuditResp>,
  });

  const apply = () => {
    setOffset(0);
    setFilters(pendingFilters);
  };
  const clear = () => {
    const empty = { userId: '', resource: '', method: '', from: '', to: '' };
    setPendingFilters(empty);
    setFilters(empty);
    setOffset(0);
  };

  const total = q.data?.total ?? 0;
  const rows = q.data?.rows ?? [];
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      <div className="flex items-center gap-3">
        <FileClock className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Bitácora de auditoría</h1>
          <p className="text-sm text-muted-foreground">
            Rastro de escrituras autenticadas: quién hizo qué, cuándo y con qué resultado.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
          <CardDescription>
            Todos son opcionales. Rango de fechas en tu zona horaria local.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Usuario (ID)</Label>
              <Input
                type="number"
                value={pendingFilters.userId}
                onChange={(e) => setPendingFilters({ ...pendingFilters, userId: e.target.value })}
                placeholder="7"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Recurso</Label>
              <Input
                value={pendingFilters.resource}
                onChange={(e) => setPendingFilters({ ...pendingFilters, resource: e.target.value })}
                placeholder="orders"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Método</Label>
              <Select
                value={pendingFilters.method || 'ALL'}
                onValueChange={(v) => setPendingFilters({ ...pendingFilters, method: v === 'ALL' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Cualquiera" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Cualquiera</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Desde</Label>
              <Input
                type="datetime-local"
                value={pendingFilters.from}
                onChange={(e) => setPendingFilters({ ...pendingFilters, from: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hasta</Label>
              <Input
                type="datetime-local"
                value={pendingFilters.to}
                onChange={(e) => setPendingFilters({ ...pendingFilters, to: e.target.value })}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={apply} className="flex-1">Aplicar</Button>
              <Button variant="outline" onClick={clear}>Limpiar</Button>
            </div>
          </div>
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              {q.isLoading ? 'Cargando…' : `${total.toLocaleString('es-DO')} registros`}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => q.refetch()}
                disabled={q.isFetching}
              >
                <RotateCw className={`h-4 w-4 mr-1 ${q.isFetching ? 'animate-spin' : ''}`} />
                Refrescar
              </Button>
              <div className="text-sm text-muted-foreground">
                Página {page} de {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0 || q.isLoading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(offset + PAGE_SIZE)}
                disabled={offset + PAGE_SIZE >= total || q.isLoading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[170px]">Fecha</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Recurso</TableHead>
                <TableHead className="w-[90px]">Usuario</TableHead>
                <TableHead className="w-[80px]">Estado</TableHead>
                <TableHead>Ruta</TableHead>
                <TableHead className="w-[130px]">IP</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && !q.isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Sin registros para estos filtros.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs font-mono">
                    {new Date(r.created_at).toLocaleString('es-DO', {
                      dateStyle: 'short',
                      timeStyle: 'medium',
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge className={methodColor(r.method)}>{r.method ?? '-'}</Badge>
                      <span className="text-sm">{r.action}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-medium">{r.resource}</span>
                    {r.resource_id && (
                      <span className="text-xs text-muted-foreground"> #{r.resource_id}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{r.user_id ?? '-'}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(r.status_code)}>
                      {r.status_code ?? '-'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground truncate max-w-[300px]">
                    {r.path ?? '-'}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {r.ip_address ?? '-'}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setDetail(r)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalle del registro</DialogTitle>
            <DialogDescription>
              {detail && `${detail.action} — ${new Date(detail.created_at).toLocaleString('es-DO')}`}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Usuario</Label>
                  <div>{detail.user_id ?? '-'}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Tienda</Label>
                  <div>{detail.store_id ?? '-'}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Método</Label>
                  <div>{detail.method ?? '-'}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Código</Label>
                  <div>{detail.status_code ?? '-'}</div>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">Ruta</Label>
                  <div className="font-mono">{detail.path ?? '-'}</div>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">User-Agent</Label>
                  <div className="text-xs text-muted-foreground break-all">
                    {detail.user_agent ?? '-'}
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Detalles</Label>
                <pre className="mt-1 rounded-md bg-muted p-3 text-xs overflow-auto max-h-[300px]">
                  {JSON.stringify(detail.details, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
