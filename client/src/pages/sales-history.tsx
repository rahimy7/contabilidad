import { useState, useMemo } from 'react';
import { fmtDateTime, fmtDate, fmtTime } from '@/lib/date-utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Receipt, Search, Eye, Ban, Trash2, ChevronDown, ChevronUp,
  Calendar, CreditCard, User, Package, Loader2, AlertTriangle,
  TrendingDown, Printer, FileText, ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { InvoiceModal } from '@/components/invoice-modal';
import { apiRequest } from '@/lib/queryClient';
import { buildWithdrawalThermalTicket, buildWithdrawalNormalHtml } from '@/lib/thermal-print';

// ─── Types ───────────────────────────────────────────────────────────────────

type OrderItem = {
  id: number;
  orderId: number;
  productId: number;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  notes: string | null;
  product: {
    id: number;
    name: string;
    description?: string;
    category?: string;
    price: string;
  };
};

type SaleOrder = {
  id: number;
  orderNumber: string;
  customerId: number;
  status: string;
  priority: string;
  totalAmount: string;
  subtotalAmount?: string;
  discountPercentage?: string;
  discountAmount?: string;
  paymentMethod: string | null;
  paymentStatus: string;
  orderType: string;
  receivedAmount?: string;
  changeAmount?: string;
  loyaltyPointsTotal?: string;
  loyaltyPointsPropertyName?: string;
  createdAt: string;
  updatedAt: string;
  storeId: number;
  customer: {
    id: number;
    name: string;
    phone: string;
    email?: string | null;
    address: string | null;
  };
  items: OrderItem[];
  totalItems: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'destructive' | 'outline' | 'secondary' }> = {
  pending:   { label: 'Pendiente',  variant: 'secondary' },
  completed: { label: 'Completada', variant: 'default' },
  cancelled: { label: 'Anulada',    variant: 'destructive' },
  paid:      { label: 'Pagada',     variant: 'default' },
};

const PAYMENT_LABELS: Record<string, string> = {
  cash:     'Efectivo',
  card:     'Tarjeta',
  transfer: 'Transferencia',
  credit:   'Crédito',
};

function formatCurrency(amount: string | number | undefined) {
  const num = parseFloat(String(amount ?? '0'));
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(num);
}

function formatDate(iso: string) {
  return fmtDateTime(iso);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SalesHistoryPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'ventas' | 'retiros'>('ventas');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Withdrawal filters
  const [wStartDate, setWStartDate]     = useState('');
  const [wEndDate, setWEndDate]         = useState('');
  const [wShowVoided, setWShowVoided]   = useState(false);

  // Invoice modal
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceData, setInvoiceData] = useState<any>(null);

  // Void confirm dialog
  const [voidTarget, setVoidTarget] = useState<SaleOrder | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);

  // Delete confirm dialog
  const [deleteTarget, setDeleteTarget] = useState<SaleOrder | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Withdrawal void dialog
  const [wVoidTarget, setWVoidTarget]   = useState<any>(null);
  const [wVoidOpen, setWVoidOpen]       = useState(false);
  const [wVoidReason, setWVoidReason]   = useState('');
  const [wVoidUser, setWVoidUser]       = useState('');
  const [wVoidPass, setWVoidPass]       = useState('');

  // ── Data ───────────────────────────────────────────────────────────────────
  const { data: storeSettings } = useQuery<any>({
    queryKey: ['store-settings'],
    queryFn: () => apiRequest('GET', '/api/store-settings'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: allOrders = [], isLoading } = useQuery<SaleOrder[]>({
    queryKey: ['/api/orders'],
    staleTime: 30_000,
  });

  // ── Withdrawals data ───────────────────────────────────────────────────────
  const withdrawalsQueryKey = ['/api/cash-withdrawals', wStartDate, wEndDate, wShowVoided];
  const { data: withdrawalsData, isLoading: isLoadingW, refetch: refetchW } = useQuery<any>({
    queryKey: withdrawalsQueryKey,
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const params = new URLSearchParams();
      if (wStartDate) params.set('startDate', wStartDate);
      if (wEndDate)   params.set('endDate', wEndDate);
      if (wShowVoided) params.set('voided', 'true');
      const res = await fetch(`/api/cash-withdrawals?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Error al obtener retiros');
      return res.json();
    },
    enabled: activeTab === 'retiros',
    staleTime: 30_000,
  });
  const withdrawals: any[] = withdrawalsData?.withdrawals ?? [];

  // Filter only POS / sale orders (exclude pure delivery orders without payment)
  const sales = useMemo(() => {
    return allOrders.filter(
      (o) => o.orderType === 'sale' || o.paymentMethod != null
    );
  }, [allOrders]);

  const filtered = useMemo(() => {
    return sales.filter((o) => {
      const matchSearch =
        !search ||
        o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
        o.customer.name.toLowerCase().includes(search.toLowerCase()) ||
        o.customer.phone?.includes(search);

      const matchStatus = statusFilter === 'all' || o.status === statusFilter;
      const matchPayment = paymentFilter === 'all' || o.paymentMethod === paymentFilter;

      return matchSearch && matchStatus && matchPayment;
    });
  }, [sales, search, statusFilter, paymentFilter]);

  // Summary stats
  const stats = useMemo(() => {
    const active = filtered.filter((o) => o.status !== 'cancelled');
    return {
      total: filtered.length,
      revenue: active.reduce((s, o) => s + parseFloat(o.totalAmount || '0'), 0),
      cancelled: filtered.filter((o) => o.status === 'cancelled').length,
    };
  }, [filtered]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const voidMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest('PATCH', `/api/orders/${id}`, { status: 'cancelled' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      toast({ title: 'Venta anulada', description: 'La venta fue anulada exitosamente.' });
      setVoidOpen(false);
      setVoidTarget(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'No se pudo anular la venta.', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest('DELETE', `/api/orders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      toast({ title: 'Venta eliminada', description: 'La venta fue eliminada permanentemente.' });
      setDeleteOpen(false);
      setDeleteTarget(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'No se pudo eliminar la venta.', variant: 'destructive' });
    },
  });

  const voidWithdrawalMutation = useMutation({
    mutationFn: ({ id, voidReason, authorizerUsername, authorizerPassword }: any) => {
      const token = localStorage.getItem('auth_token');
      return fetch(`/api/cash-withdrawals/${id}/void`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ voidReason, authorizerUsername, authorizerPassword }),
      }).then(async (res) => {
        if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Error'); }
        return res.json();
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cash-withdrawals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cash-register/sessions/current-stats'] });
      toast({ title: 'Retiro anulado', description: 'El retiro fue anulado exitosamente.' });
      setWVoidOpen(false); setWVoidTarget(null); setWVoidReason(''); setWVoidUser(''); setWVoidPass('');
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleViewInvoice = (order: SaleOrder) => {
    const total = parseFloat(order.totalAmount || '0');
    const subtotal = parseFloat(order.subtotalAmount || String(total));
    const discountAmt = parseFloat(order.discountAmount || '0');
    const discountPct = parseFloat(order.discountPercentage || '0');
    const received = parseFloat(order.receivedAmount || String(total));
    const change = parseFloat(order.changeAmount || '0');

    const date = new Date(order.createdAt);

    setInvoiceData({
      orderNumber: order.orderNumber,
      date: fmtDate(date.toISOString()),
      time: fmtTime(date.toISOString()),
      paymentMethod: order.paymentMethod || 'cash',
      isCredit: order.paymentMethod === 'credit' || order.paymentStatus === 'credit',
      items: order.items.map((item) => ({
        productId: item.productId,
        productName: item.product?.name || `Producto #${item.productId}`,
        quantity: item.quantity,
        unitPrice: parseFloat(item.unitPrice),
        totalPrice: parseFloat(item.totalPrice),
      })),
      subtotal,
      tax: 0,
      discountPercentage: discountPct,
      discountAmount: discountAmt,
      total,
      receivedAmount: received,
      changeAmount: change,
      totalLoyaltyPoints: parseFloat(order.loyaltyPointsTotal || '0') || undefined,
      loyaltyPointsPropertyName: order.loyaltyPointsPropertyName || undefined,
      storeName: storeSettings?.storeName,
      storeAddress: storeSettings?.storeAddress,
      storePhone: storeSettings?.storeWhatsappNumber,
      storeEmail: storeSettings?.storeEmail,
      logoUrl: storeSettings?.logoUrl,
      invoiceFooter: storeSettings?.invoiceFooter,
    });
    setInvoiceOpen(true);
  };

  const toggleExpand = (id: number) =>
    setExpandedId((prev) => (prev === id ? null : id));

  const handlePrintWithdrawalThermal = (w: any) => {
    const content = buildWithdrawalThermalTicket(w);
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html><head><title>Retiro</title></head><body><pre style="font-family:monospace;white-space:pre">${content}</pre></body></html>`);
    win.document.close();
    win.print();
    win.close();
  };

  const handlePrintWithdrawalHtml = (w: any) => {
    const html = buildWithdrawalNormalHtml(w);
    const win = window.open('', '_blank', 'height=700,width=800');
    if (!win) { toast({ title: 'Error', description: 'Permite ventanas emergentes para imprimir.', variant: 'destructive' }); return; }
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.print(); }, 300);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Receipt className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Historial de Ventas</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Facturas y retiros del punto de venta</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex flex-col">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Total ventas</span>
            <span className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stats.total}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Ingresos</span>
            <span className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(stats.revenue)}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Anuladas</span>
            <span className="text-2xl font-bold text-red-500 mt-1">{stats.cancelled}</span>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="ventas" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Ventas
          </TabsTrigger>
          <TabsTrigger value="retiros" className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />
            Retiros de Caja
          </TabsTrigger>
        </TabsList>

        {/* ══════════════ VENTAS TAB ══════════════ */}
        <TabsContent value="ventas" className="mt-4 space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Buscar por # factura, cliente o teléfono…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="completed">Completada</SelectItem>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="cancelled">Anulada</SelectItem>
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Método de pago" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los pagos</SelectItem>
            <SelectItem value="cash">Efectivo</SelectItem>
            <SelectItem value="card">Tarjeta</SelectItem>
            <SelectItem value="transfer">Transferencia</SelectItem>
            <SelectItem value="credit">Crédito</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Receipt className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-lg font-medium">No hay ventas</p>
          <p className="text-sm">Ajusta los filtros o realiza una venta desde el POS.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((order) => {
            const isExpanded = expandedId === order.id;
            const statusInfo = STATUS_LABELS[order.status] ?? { label: order.status, variant: 'outline' as const };
            const isCancelled = order.status === 'cancelled';

            return (
              <Card key={order.id} className={isCancelled ? 'opacity-60' : ''}>
                {/* Row header */}
                <CardContent className="p-0">
                  <div
                    className="flex flex-col sm:flex-row sm:items-center gap-2 p-4 cursor-pointer select-none"
                    onClick={() => toggleExpand(order.id)}
                  >
                    {/* Left: order info */}
                    <div className="flex-1 min-w-0 grid grid-cols-2 sm:flex sm:items-center sm:gap-6 gap-1">
                      <div className="flex items-center gap-2">
                        <Receipt className="h-4 w-4 text-blue-500 shrink-0" />
                        <span className="font-semibold text-sm truncate">{order.orderNumber}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Calendar className="h-3 w-3 shrink-0" />
                        <span>{formatDate(order.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                        <User className="h-3 w-3 shrink-0" />
                        <span className="truncate">{order.customer.name}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <CreditCard className="h-3 w-3 shrink-0" />
                        <span>{PAYMENT_LABELS[order.paymentMethod || ''] ?? order.paymentMethod ?? '—'}</span>
                      </div>
                    </div>

                    {/* Right: amount + status + actions */}
                    <div className="flex items-center gap-3 sm:ml-auto">
                      <span className="font-bold text-lg text-emerald-600">
                        {formatCurrency(order.totalAmount)}
                      </span>
                      <Badge variant={statusInfo.variant} className="text-xs">
                        {statusInfo.label}
                      </Badge>

                      {/* Action buttons */}
                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* View invoice */}
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Ver factura"
                          onClick={() => handleViewInvoice(order)}
                        >
                          <Eye className="h-4 w-4 text-blue-500" />
                        </Button>

                        {/* Void / Anular */}
                        {!isCancelled && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Anular venta"
                            onClick={() => { setVoidTarget(order); setVoidOpen(true); }}
                          >
                            <Ban className="h-4 w-4 text-orange-500" />
                          </Button>
                        )}

                        {/* Delete — admin only */}
                        {isAdmin && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Eliminar venta (admin)"
                            onClick={() => { setDeleteTarget(order); setDeleteOpen(true); }}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </div>

                      {isExpanded
                        ? <ChevronUp className="h-4 w-4 text-gray-400 shrink-0" />
                        : <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                      }
                    </div>
                  </div>

                  {/* Expanded items */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 dark:border-gray-700 px-4 pb-4 pt-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Artículos ({order.items.length})
                      </p>
                      <div className="space-y-1">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-sm py-1 border-b border-gray-50 dark:border-gray-800 last:border-0">
                            <div className="flex items-center gap-2">
                              <Package className="h-3 w-3 text-gray-400 shrink-0" />
                              <span className="text-gray-800 dark:text-gray-200">
                                {item.product?.name || `Producto #${item.productId}`}
                              </span>
                              <span className="text-gray-400">× {item.quantity}</span>
                            </div>
                            <div className="flex items-center gap-4 text-right">
                              <span className="text-gray-500 text-xs">
                                {formatCurrency(item.unitPrice)} c/u
                              </span>
                              <span className="font-medium w-24">
                                {formatCurrency(item.totalPrice)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Totals summary */}
                      <div className="mt-3 flex justify-end">
                        <div className="text-sm space-y-1 w-56">
                          {parseFloat(order.discountAmount || '0') > 0 && (
                            <>
                              <div className="flex justify-between text-gray-500">
                                <span>Subtotal</span>
                                <span>{formatCurrency(order.subtotalAmount)}</span>
                              </div>
                              <div className="flex justify-between text-orange-500">
                                <span>Descuento ({order.discountPercentage}%)</span>
                                <span>-{formatCurrency(order.discountAmount)}</span>
                              </div>
                            </>
                          )}
                          <div className="flex justify-between font-bold border-t pt-1">
                            <span>Total</span>
                            <span className="text-emerald-600">{formatCurrency(order.totalAmount)}</span>
                          </div>
                          {order.paymentMethod === 'cash' && parseFloat(order.receivedAmount || '0') > 0 && (
                            <>
                              <div className="flex justify-between text-gray-500">
                                <span>Recibido</span>
                                <span>{formatCurrency(order.receivedAmount)}</span>
                              </div>
                              <div className="flex justify-between text-gray-500">
                                <span>Cambio</span>
                                <span>{formatCurrency(order.changeAmount)}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Invoice Modal ─────────────────────────────────────────────────── */}
      <InvoiceModal
        isOpen={invoiceOpen}
        data={invoiceData}
        onClose={() => setInvoiceOpen(false)}
      />

        </TabsContent>

        {/* ══════════════ RETIROS TAB ══════════════ */}
        <TabsContent value="retiros" className="mt-4 space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Desde</Label>
              <Input type="date" value={wStartDate} onChange={(e) => setWStartDate(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Hasta</Label>
              <Input type="date" value={wEndDate} onChange={(e) => setWEndDate(e.target.value)} className="w-40" />
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchW()}>Buscar</Button>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer ml-auto">
              <input type="checkbox" checked={wShowVoided} onChange={(e) => setWShowVoided(e.target.checked)} />
              Mostrar anulados
            </label>
          </div>

          {isLoadingW ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : withdrawals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <TrendingDown className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-lg font-medium">No hay retiros</p>
              <p className="text-sm">Los retiros de efectivo registrados en caja aparecerán aquí.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {withdrawals.map((w: any) => (
                <Card key={w.id} className={w.voided ? 'opacity-60 border-red-200' : ''}>
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 grid grid-cols-2 sm:flex sm:items-center sm:gap-6 gap-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <TrendingDown className="h-4 w-4 text-red-500 shrink-0" />
                          <span className="font-semibold text-sm">#{String(w.id).padStart(6, '0')}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span>{formatDate(w.createdAt)}</span>
                        </div>
                        <div className="text-sm text-gray-700 col-span-2 sm:flex-1 truncate">{w.concept}</div>
                        <div className="text-xs text-gray-500 col-span-2 sm:col-span-1">
                          <span className="font-medium">Cajero:</span> {w.cashierName ?? '—'} &nbsp;·&nbsp;
                          <span className="font-medium">Autorizado:</span> {w.authorizerName ?? '—'}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 sm:ml-auto">
                        <span className="font-bold text-lg text-red-600">−{formatCurrency(w.amount)}</span>
                        {w.voided
                          ? <Badge variant="destructive" className="text-xs">Anulado</Badge>
                          : <Badge variant="default" className="text-xs bg-green-600">Activo</Badge>
                        }
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" title="Imprimir térmico" onClick={() => handlePrintWithdrawalThermal(w)}>
                            <Printer className="h-4 w-4 text-gray-500" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Imprimir A4" onClick={() => handlePrintWithdrawalHtml(w)}>
                            <FileText className="h-4 w-4 text-gray-500" />
                          </Button>
                          {isAdmin && !w.voided && (
                            <Button size="icon" variant="ghost" title="Anular retiro" onClick={() => { setWVoidTarget(w); setWVoidOpen(true); }}>
                              <Ban className="h-4 w-4 text-orange-500" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    {w.voided && w.voidReason && (
                      <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2">
                        <strong>Motivo anulación:</strong> {w.voidReason}
                        {w.voidedByName && <> · <strong>Por:</strong> {w.voidedByName}</>}
                      </div>
                    )}
                    {w.notes && <p className="mt-1 text-xs text-gray-400">{w.notes}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Void Confirmation Dialog ─────────────────────────────────────── */}
      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-orange-500" />
              Anular venta
            </DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas <strong>anular</strong> la venta{' '}
              <strong>{voidTarget?.orderNumber}</strong>?
              <br />
              Esta acción cambiará el estado a "Anulada" pero la venta permanecerá en el sistema.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setVoidOpen(false)} disabled={voidMutation.isPending}>
              Cancelar
            </Button>
            <Button
              variant="default"
              className="bg-orange-500 hover:bg-orange-600"
              disabled={voidMutation.isPending}
              onClick={() => voidTarget && voidMutation.mutate(voidTarget.id)}
            >
              {voidMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Anulando…</>
                : 'Anular venta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog (admin only) ──────────────────────── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Eliminar venta permanentemente
            </DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas <strong>eliminar</strong> la venta{' '}
              <strong>{deleteTarget?.orderNumber}</strong>?
              <br />
              <span className="text-red-500 font-medium">
                Esta acción es irreversible y eliminará la venta del sistema.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleteMutation.isPending}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Eliminando…</>
                : 'Eliminar permanentemente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Withdrawal Void Dialog ─────────────────────────────────────────── */}
      <Dialog open={wVoidOpen} onOpenChange={(o) => { if (!o) { setWVoidOpen(false); setWVoidTarget(null); setWVoidReason(''); setWVoidUser(''); setWVoidPass(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-orange-500" />
              Anular Retiro
            </DialogTitle>
            <DialogDescription>
              Anular el retiro <strong>#{String(wVoidTarget?.id ?? '').padStart(6, '0')}</strong> —{' '}
              <strong>{wVoidTarget?.concept}</strong> por{' '}
              <strong>{formatCurrency(wVoidTarget?.amount)}</strong>.
              Se requiere autorización de administrador.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Motivo de anulación</Label>
              <Input placeholder="Describe el motivo..." value={wVoidReason} onChange={(e) => setWVoidReason(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="flex items-center gap-1 text-xs text-gray-500"><ShieldCheck className="h-3 w-3" /> Usuario administrador</Label>
              <Input placeholder="Username" value={wVoidUser} onChange={(e) => setWVoidUser(e.target.value)} autoComplete="off" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Contraseña</Label>
              <Input type="password" placeholder="••••••••" value={wVoidPass} onChange={(e) => setWVoidPass(e.target.value)} autoComplete="current-password" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setWVoidOpen(false)} disabled={voidWithdrawalMutation.isPending}>
              Cancelar
            </Button>
            <Button
              variant="default"
              className="bg-orange-500 hover:bg-orange-600"
              disabled={voidWithdrawalMutation.isPending || !wVoidReason.trim() || !wVoidUser.trim() || !wVoidPass.trim()}
              onClick={() => wVoidTarget && voidWithdrawalMutation.mutate({ id: wVoidTarget.id, voidReason: wVoidReason, authorizerUsername: wVoidUser, authorizerPassword: wVoidPass })}
            >
              {voidWithdrawalMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Anulando…</>
                : 'Anular Retiro'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
