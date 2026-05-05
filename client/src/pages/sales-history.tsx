import { useState, useMemo } from 'react';
import { fmtDateTime, fmtDate, fmtTime } from '@/lib/date-utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Receipt, Search, Eye, Ban, Trash2, ChevronDown, ChevronUp,
  Calendar, CreditCard, User, Package, Loader2, AlertTriangle,
  TrendingDown, Printer, FileText, ShieldCheck, BarChart2, FileSpreadsheet, FileDown
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
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
  notes?: string | null;
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

  // Report dialog
  const todayStr = new Date().toISOString().split('T')[0];
  const [reportOpen, setReportOpen]   = useState(false);
  const [reportFrom, setReportFrom]   = useState(todayStr);
  const [reportTo, setReportTo]       = useState(todayStr);

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

  // Report data (filtered by date range, non-cancelled)
  const reportOrders = useMemo(() => {
    return sales.filter((o) => {
      if (o.status === 'cancelled') return false;
      const d = o.createdAt.split('T')[0];
      if (reportFrom && d < reportFrom) return false;
      if (reportTo && d > reportTo) return false;
      return true;
    });
  }, [sales, reportFrom, reportTo]);

  const reportProducts = useMemo(() => {
    const map = new Map<number, { name: string; qty: number; total: number }>();
    reportOrders.forEach((o) => {
      o.items.forEach((item) => {
        const existing = map.get(item.productId);
        const qty = Number(item.quantity);
        const total = parseFloat(item.totalPrice);
        if (existing) {
          existing.qty += qty;
          existing.total += total;
        } else {
          map.set(item.productId, {
            name: item.product?.name || `Producto #${item.productId}`,
            qty,
            total,
          });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [reportOrders]);

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

  const handleReportToday = () => {
    const t = new Date().toISOString().split('T')[0];
    setReportFrom(t);
    setReportTo(t);
  };

  const handlePrintReport = () => {
    const period = reportFrom === reportTo ? reportFrom : `${reportFrom} al ${reportTo}`;
    const generated = new Date().toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' });
    const totalRevenue = reportOrders.reduce((s, o) => s + parseFloat(o.totalAmount || '0'), 0);
    const totalSubtotal = reportOrders.reduce((s, o) => s + parseFloat(o.subtotalAmount || o.totalAmount || '0'), 0);
    const totalDiscount = reportOrders.reduce((s, o) => s + parseFloat(o.discountAmount || '0'), 0);
    const totalQty = reportProducts.reduce((s, p) => s + p.qty, 0);
    const totalProdRevenue = reportProducts.reduce((s, p) => s + p.total, 0);

    const salesRows = reportOrders.map((o) => `
      <tr>
        <td>${o.orderNumber}</td>
        <td>${fmtDateTime(o.createdAt)}</td>
        <td>${o.customer.name}</td>
        <td>${PAYMENT_LABELS[o.paymentMethod || ''] ?? o.paymentMethod ?? '—'}</td>
        <td class="num">${formatCurrency(o.subtotalAmount || o.totalAmount)}</td>
        <td class="num">${parseFloat(o.discountAmount || '0') > 0 ? formatCurrency(o.discountAmount) : '—'}</td>
        <td class="num bold">${formatCurrency(o.totalAmount)}</td>
      </tr>`).join('');

    const productRows = reportProducts.map((p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${p.name}</td>
        <td class="num">${p.qty}</td>
        <td class="num">${formatCurrency(p.total / p.qty)}</td>
        <td class="num bold">${formatCurrency(p.total)}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>Reporte de Ventas — ${period}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 20px; }
      h1 { font-size: 18px; color: #1e3a8a; margin-bottom: 4px; }
      h2 { font-size: 14px; color: #065f46; margin: 24px 0 8px; }
      .meta { color: #555; font-size: 10px; margin-bottom: 16px; }
      .stats { display: flex; gap: 24px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; }
      .stat { text-align: center; }
      .stat .val { font-size: 18px; font-weight: 700; color: #065f46; }
      .stat .lbl { font-size: 9px; color: #6b7280; text-transform: uppercase; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
      th { background: #1e3a8a; color: #fff; padding: 6px 8px; text-align: left; font-size: 10px; }
      td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
      tr:nth-child(even) td { background: #f9fafb; }
      .num { text-align: right; }
      .bold { font-weight: 700; }
      tfoot td { background: #f0fdf4 !important; font-weight: 700; color: #065f46; border-top: 2px solid #bbf7d0; }
      h2.products { color: #1e40af; }
      th.products-h { background: #065f46; }
      .page-break { page-break-before: always; }
      @media print { body { padding: 10px; } button { display: none; } }
    </style></head><body>
    <h1>Reporte de Ventas</h1>
    <p class="meta">Período: <strong>${period}</strong> &nbsp;·&nbsp; Generado: ${generated}</p>
    <div class="stats">
      <div class="stat"><div class="val">${reportOrders.length}</div><div class="lbl">Ventas</div></div>
      <div class="stat"><div class="val">${formatCurrency(totalSubtotal)}</div><div class="lbl">Subtotal</div></div>
      <div class="stat"><div class="val">${formatCurrency(totalDiscount)}</div><div class="lbl">Descuentos</div></div>
      <div class="stat"><div class="val">${formatCurrency(totalRevenue)}</div><div class="lbl">Total ingresos</div></div>
    </div>
    <table>
      <thead><tr><th>Factura</th><th>Fecha y Hora</th><th>Cliente</th><th>Método</th><th>Subtotal</th><th>Descuento</th><th>Total</th></tr></thead>
      <tbody>${salesRows}</tbody>
      <tfoot><tr><td></td><td></td><td></td><td>${reportOrders.length} ventas</td><td class="num">${formatCurrency(totalSubtotal)}</td><td class="num">${formatCurrency(totalDiscount)}</td><td class="num">${formatCurrency(totalRevenue)}</td></tr></tfoot>
    </table>
    <div class="page-break"></div>
    <h2>Productos Vendidos</h2>
    <table>
      <thead><tr><th style="background:#065f46">#</th><th style="background:#065f46">Producto</th><th style="background:#065f46" class="num">Cant.</th><th style="background:#065f46" class="num">Precio Unit. Prom.</th><th style="background:#065f46" class="num">Total Vendido</th></tr></thead>
      <tbody>${productRows}</tbody>
      <tfoot><tr><td></td><td>TOTALES</td><td class="num">${totalQty}</td><td></td><td class="num">${formatCurrency(totalProdRevenue)}</td></tr></tfoot>
    </table>
    </body></html>`;

    const win = window.open('', '_blank', 'width=1000,height=750');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 400);
  };

  const handleExportReportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const period = reportFrom === reportTo ? reportFrom : `${reportFrom} al ${reportTo}`;
    const generated = new Date().toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' });

    // ── Page 1: Sales ───────────────────────────────────────────────────────
    doc.setFontSize(18);
    doc.setTextColor(30, 64, 175);
    doc.text('Reporte de Ventas', 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(`Período: ${period}`, 14, 23);
    doc.text(`Generado: ${generated}`, 14, 29);

    const salesBody = reportOrders.map((o) => [
      o.orderNumber,
      fmtDateTime(o.createdAt),
      o.customer.name,
      PAYMENT_LABELS[o.paymentMethod || ''] ?? o.paymentMethod ?? '—',
      formatCurrency(o.subtotalAmount || o.totalAmount),
      parseFloat(o.discountAmount || '0') > 0 ? `-${formatCurrency(o.discountAmount)}` : '—',
      formatCurrency(o.totalAmount),
    ]);

    const totalRevenue = reportOrders.reduce((s, o) => s + parseFloat(o.totalAmount || '0'), 0);

    autoTable(doc, {
      head: [['# Factura', 'Fecha y Hora', 'Cliente', 'Método de Pago', 'Subtotal', 'Descuento', 'Total']],
      body: salesBody,
      startY: 34,
      foot: [['', '', '', `${reportOrders.length} ventas`, '', 'TOTAL', formatCurrency(totalRevenue)]],
      footStyles: { fontStyle: 'bold', fillColor: [240, 253, 244], textColor: [21, 128, 61] },
      headStyles: { fillColor: [30, 64, 175], textColor: 255 },
      styles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
    });

    // ── Page 2: Products ────────────────────────────────────────────────────
    doc.addPage();
    doc.setFontSize(18);
    doc.setTextColor(5, 150, 105);
    doc.text('Productos Vendidos', 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(`Período: ${period}`, 14, 23);
    doc.text(`Generado: ${generated}`, 14, 29);

    const totalQty = reportProducts.reduce((s, p) => s + p.qty, 0);
    const totalProdRevenue = reportProducts.reduce((s, p) => s + p.total, 0);

    const productsBody = reportProducts.map((p, i) => [
      i + 1,
      p.name,
      p.qty,
      formatCurrency(p.total / p.qty),
      formatCurrency(p.total),
    ]);

    autoTable(doc, {
      head: [['#', 'Producto', 'Cant. Total', 'Precio Unit. Prom.', 'Total Vendido']],
      body: productsBody,
      startY: 34,
      foot: [['', 'TOTALES', totalQty, '', formatCurrency(totalProdRevenue)]],
      footStyles: { fontStyle: 'bold', fillColor: [240, 253, 244], textColor: [21, 128, 61] },
      headStyles: { fillColor: [5, 150, 105], textColor: 255 },
      styles: { fontSize: 8 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
    });

    doc.save(`reporte-ventas_${reportFrom}_${reportTo}.pdf`);
  };

  const handleExportReportExcel = () => {
    const wb = XLSX.utils.book_new();
    const period = reportFrom === reportTo ? reportFrom : `${reportFrom} al ${reportTo}`;

    // ── Sheet 1: Ventas ─────────────────────────────────────────────────────
    const salesHeader = ['# Factura', 'Fecha y Hora', 'Cliente', 'Método de Pago', 'Subtotal (DOP)', 'Descuento (DOP)', 'Total (DOP)'];
    const salesRows: any[][] = reportOrders.map((o) => [
      o.orderNumber,
      fmtDateTime(o.createdAt),
      o.customer.name,
      PAYMENT_LABELS[o.paymentMethod || ''] ?? o.paymentMethod ?? '—',
      parseFloat(o.subtotalAmount || o.totalAmount),
      parseFloat(o.discountAmount || '0'),
      parseFloat(o.totalAmount),
    ]);
    const totalRevenue = reportOrders.reduce((s, o) => s + parseFloat(o.totalAmount || '0'), 0);
    salesRows.push(['', '', '', `${reportOrders.length} ventas`, '', 'TOTAL', Math.round(totalRevenue * 100) / 100]);

    const ws1 = XLSX.utils.aoa_to_sheet([
      [`Reporte de Ventas — ${period}`],
      [],
      salesHeader,
      ...salesRows,
    ]);
    ws1['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 28 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Ventas');

    // ── Sheet 2: Productos ──────────────────────────────────────────────────
    const productsHeader = ['#', 'Producto', 'Cantidad Total', 'Precio Unit. Prom. (DOP)', 'Total Vendido (DOP)'];
    const totalQty = reportProducts.reduce((s, p) => s + p.qty, 0);
    const totalProdRevenue = reportProducts.reduce((s, p) => s + p.total, 0);
    const productsRows: any[][] = reportProducts.map((p, i) => [
      i + 1,
      p.name,
      p.qty,
      Math.round((p.total / p.qty) * 100) / 100,
      Math.round(p.total * 100) / 100,
    ]);
    productsRows.push(['', 'TOTALES', totalQty, '', Math.round(totalProdRevenue * 100) / 100]);

    const ws2 = XLSX.utils.aoa_to_sheet([
      [`Productos Vendidos — ${period}`],
      [],
      productsHeader,
      ...productsRows,
    ]);
    ws2['!cols'] = [{ wch: 6 }, { wch: 40 }, { wch: 16 }, { wch: 24 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Productos');

    XLSX.writeFile(wb, `reporte-ventas_${reportFrom}_${reportTo}.xlsx`);
  };

  const handleViewInvoice = (order: SaleOrder) => {
    const total = parseFloat(order.totalAmount || '0');
    const subtotal = parseFloat(order.subtotalAmount || String(total));
    const discountAmt = parseFloat(order.discountAmount || '0');
    const discountPct = parseFloat(order.discountPercentage || '0');
    const received = parseFloat(order.receivedAmount || String(total));
    const change = parseFloat(order.changeAmount || '0');

    const date = new Date(order.createdAt);

    const displayItems = order.items.length > 0
      ? order.items.map((item) => ({
          productId: item.productId,
          productName: item.product?.name || `Producto #${item.productId}`,
          quantity: item.quantity,
          unitPrice: parseFloat(item.unitPrice),
          totalPrice: parseFloat(item.totalPrice),
        }))
      : [{
          productName: order.notes || `Orden ${order.orderNumber}`,
          quantity: 1,
          unitPrice: total,
          totalPrice: total,
        }];

    setInvoiceData({
      orderNumber: order.orderNumber,
      date: fmtDate(date.toISOString()),
      time: fmtTime(date.toISOString()),
      paymentMethod: order.paymentMethod || 'cash',
      isCredit: order.paymentMethod === 'credit' || order.paymentStatus === 'credit',
      items: displayItems,
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
        <Button
          variant="outline"
          className="flex items-center gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
          onClick={() => setReportOpen(true)}
        >
          <BarChart2 className="h-4 w-4" />
          Reporte de Ventas
        </Button>
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
      <Dialog open={wVoidOpen} onOpenChange={(o) => { if (!o) { setWVoidOpen(false); setWVoidTarget(null); setWVoidReason(''); setWVoidUser(''); setWVoidPass(''); } }}>        <DialogContent className="max-w-sm">
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

      {/* ── Report Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-[95vw] w-full h-[92vh] flex flex-col p-0 gap-0">
          {/* Header bar — two rows */}
          <div className="px-6 pt-4 pb-3 border-b shrink-0 space-y-3">
            {/* Row 1: title */}
            <div className="flex items-center gap-2 pr-10">
              <BarChart2 className="h-5 w-5 text-blue-600 shrink-0" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Reporte de Ventas</h2>
            </div>
            {/* Row 2: date pickers + action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <Label className="text-xs text-gray-500 whitespace-nowrap">Desde</Label>
                <Input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} className="h-8 text-sm w-36" />
              </div>
              <div className="flex items-center gap-1">
                <Label className="text-xs text-gray-500 whitespace-nowrap">Hasta</Label>
                <Input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} className="h-8 text-sm w-36" />
              </div>
              <Button variant="outline" size="sm" onClick={handleReportToday} className="h-8">
                <Calendar className="h-3 w-3 mr-1" />Hoy
              </Button>
              <div className="h-5 w-px bg-gray-200 mx-1" />
              <Button size="sm" variant="outline" className="h-8 border-gray-400 gap-1" disabled={reportOrders.length === 0} onClick={handlePrintReport}>
                <Printer className="h-3 w-3" />Imprimir
              </Button>
              <Button size="sm" className="h-8 bg-red-600 hover:bg-red-700 text-white gap-1" disabled={reportOrders.length === 0} onClick={handleExportReportPDF}>
                <FileDown className="h-3 w-3" />PDF
              </Button>
              <Button size="sm" className="h-8 bg-emerald-700 hover:bg-emerald-800 text-white gap-1" disabled={reportOrders.length === 0} onClick={handleExportReportExcel}>
                <FileSpreadsheet className="h-3 w-3" />Excel
              </Button>
            </div>
          </div>

          {/* Report body — scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {reportOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-gray-400">
                <BarChart2 className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-lg font-medium">Sin ventas en este período</p>
                <p className="text-sm">Selecciona otro rango de fechas.</p>
              </div>
            ) : (
              <>
                {/* ── Summary cards ─────────────────────────────────────── */}
                {(() => {
                  const totalRevenue = reportOrders.reduce((s, o) => s + parseFloat(o.totalAmount || '0'), 0);
                  const totalSubtotal = reportOrders.reduce((s, o) => s + parseFloat(o.subtotalAmount || o.totalAmount || '0'), 0);
                  const totalDiscount = reportOrders.reduce((s, o) => s + parseFloat(o.discountAmount || '0'), 0);
                  const byMethod: Record<string, number> = {};
                  reportOrders.forEach((o) => {
                    const m = PAYMENT_LABELS[o.paymentMethod || ''] ?? o.paymentMethod ?? '—';
                    byMethod[m] = (byMethod[m] || 0) + parseFloat(o.totalAmount || '0');
                  });
                  return (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <Card><CardContent className="p-3 text-center">
                          <p className="text-2xl font-bold text-blue-600">{reportOrders.length}</p>
                          <p className="text-xs text-gray-500">Ventas</p>
                        </CardContent></Card>
                        <Card><CardContent className="p-3 text-center">
                          <p className="text-xl font-bold text-gray-700">{formatCurrency(totalSubtotal)}</p>
                          <p className="text-xs text-gray-500">Subtotal</p>
                        </CardContent></Card>
                        <Card><CardContent className="p-3 text-center">
                          <p className="text-xl font-bold text-orange-500">{formatCurrency(totalDiscount)}</p>
                          <p className="text-xs text-gray-500">Descuentos</p>
                        </CardContent></Card>
                        <Card><CardContent className="p-3 text-center">
                          <p className="text-xl font-bold text-emerald-600">{formatCurrency(totalRevenue)}</p>
                          <p className="text-xs text-gray-500">Total ingresos</p>
                        </CardContent></Card>
                      </div>
                      {/* By payment method */}
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(byMethod).map(([method, amt]) => (
                          <div key={method} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 border rounded-lg px-3 py-2 text-sm">
                            <CreditCard className="h-3 w-3 text-gray-400" />
                            <span className="text-gray-600 dark:text-gray-300">{method}:</span>
                            <span className="font-semibold text-gray-900 dark:text-white">{formatCurrency(amt)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}

                {/* ── Sales table ───────────────────────────────────────── */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide mb-2 flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-blue-500" />
                    Listado de Ventas
                  </h3>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-blue-700 text-white text-xs">
                          <th className="text-left px-3 py-2">Factura</th>
                          <th className="text-left px-3 py-2">Fecha y Hora</th>
                          <th className="text-left px-3 py-2">Cliente</th>
                          <th className="text-left px-3 py-2">Método</th>
                          <th className="text-right px-3 py-2">Subtotal</th>
                          <th className="text-right px-3 py-2">Descuento</th>
                          <th className="text-right px-3 py-2">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportOrders.map((o, i) => (
                          <tr key={o.id} className={i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800'}>
                            <td className="px-3 py-2 font-medium text-blue-700">{o.orderNumber}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">{fmtDateTime(o.createdAt)}</td>
                            <td className="px-3 py-2 text-gray-800 dark:text-gray-100">{o.customer.name}</td>
                            <td className="px-3 py-2 text-gray-500">{PAYMENT_LABELS[o.paymentMethod || ''] ?? o.paymentMethod ?? '—'}</td>
                            <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-200">{formatCurrency(o.subtotalAmount || o.totalAmount)}</td>
                            <td className="px-3 py-2 text-right text-orange-500">
                              {parseFloat(o.discountAmount || '0') > 0 ? `-${formatCurrency(o.discountAmount)}` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-emerald-600">{formatCurrency(o.totalAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-emerald-50 dark:bg-emerald-900/30 font-bold text-emerald-700 dark:text-emerald-300 border-t-2 border-emerald-200">
                          <td className="px-3 py-2" colSpan={4}>{reportOrders.length} ventas</td>
                          <td className="px-3 py-2 text-right">
                            {formatCurrency(reportOrders.reduce((s, o) => s + parseFloat(o.subtotalAmount || o.totalAmount || '0'), 0))}
                          </td>
                          <td className="px-3 py-2 text-right text-orange-600">
                            {formatCurrency(reportOrders.reduce((s, o) => s + parseFloat(o.discountAmount || '0'), 0))}
                          </td>
                          <td className="px-3 py-2 text-right text-emerald-600">
                            {formatCurrency(reportOrders.reduce((s, o) => s + parseFloat(o.totalAmount || '0'), 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* ── Products table ────────────────────────────────────── */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide mb-2 flex items-center gap-2">
                    <Package className="h-4 w-4 text-emerald-600" />
                    Productos Vendidos
                  </h3>
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-emerald-700 text-white text-xs">
                          <th className="text-left px-3 py-2">#</th>
                          <th className="text-left px-3 py-2">Producto</th>
                          <th className="text-right px-3 py-2">Cantidad</th>
                          <th className="text-right px-3 py-2">Precio Unit. Prom.</th>
                          <th className="text-right px-3 py-2">Total Vendido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportProducts.map((p, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800'}>
                            <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                            <td className="px-3 py-2 text-gray-800 dark:text-gray-100 font-medium">{p.name}</td>
                            <td className="px-3 py-2 text-right font-semibold text-blue-600">{p.qty}</td>
                            <td className="px-3 py-2 text-right text-gray-500">{formatCurrency(p.total / p.qty)}</td>
                            <td className="px-3 py-2 text-right font-bold text-emerald-600">{formatCurrency(p.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-emerald-50 dark:bg-emerald-900/30 font-bold text-emerald-700 dark:text-emerald-300 border-t-2 border-emerald-200">
                          <td className="px-3 py-2" colSpan={2}>TOTALES</td>
                          <td className="px-3 py-2 text-right">{reportProducts.reduce((s, p) => s + p.qty, 0)}</td>
                          <td></td>
                          <td className="px-3 py-2 text-right">{formatCurrency(reportProducts.reduce((s, p) => s + p.total, 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
