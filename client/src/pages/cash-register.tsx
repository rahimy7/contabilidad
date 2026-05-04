import { useState } from "react";
import { fmtDateTime, fmtDate as fmtDateDR, fmtDayMonth, nowDR, DR_TZ } from '@/lib/date-utils';
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Landmark, TrendingUp, TrendingDown, Banknote, CreditCard,
  ArrowRightLeft, Clock, History, CheckCircle2, XCircle,
  AlertTriangle, RefreshCw, DollarSign, Printer, FileText,
  ChevronDown, CalendarDays, Users, User,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { CloseWizard } from "@/components/cash-register/close-wizard";

// ─── helpers ────────────────────────────────────────────────────────────────

const DISCREPANCY_THRESHOLD = 100;

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

const fmt = (value: string | number | null | undefined, currency = "DOP") => {
  const num = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  if (isNaN(num)) return `${currency} 0.00`;
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: currency === "USD" ? "USD" : "DOP",
    currencyDisplay: "symbol",
  }).format(num);
};

const fmtDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("es-DO", {
    timeZone: DR_TZ,
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

const diffColor = (diff: number) => {
  if (diff > 0) return "text-green-600 font-semibold";
  if (diff < 0) return "text-red-600 font-semibold";
  return "text-gray-600";
};

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    open:     { label: "Abierta",   variant: "default" },
    closed:   { label: "Pendiente", variant: "secondary" },
    approved: { label: "Aprobada",  variant: "default" },
    rejected: { label: "Rechazada", variant: "destructive" },
  };
  const cfg = map[status] ?? { label: status, variant: "outline" };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
};

const sessionTypeLabel = (t: string) => {
  if (t === "day")   return "Caja General";
  if (t === "shift") return "Turno (Por Cajero)";
  return t;
};

// ─── ESC/POS & print helpers ─────────────────────────────────────────────────

const _ESC = '\x1B', _GS = '\x1D';
const EP = {
  INIT:        _ESC + '@',
  CENTER:      _ESC + 'a\x01',
  LEFT:        _ESC + 'a\x00',
  BOLD_ON:     _ESC + 'E\x01',
  BOLD_OFF:    _ESC + 'E\x00',
  SIZE_DOUBLE: _GS  + '!\x11',
  SIZE_NORMAL: _GS  + '!\x00',
  CUT:         _GS  + 'V\x00',
  LINE:        '-'.repeat(32),
};

function fmtNum(v: number | string | null | undefined): string {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0);
  return isNaN(n) ? '0.00' : n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pad32(left: string, right: string): string {
  return left + ' '.repeat(Math.max(1, 32 - left.length - right.length)) + right;
}

function buildClosingThermalTicket(s: any): string {
  const { INIT, CENTER, LEFT, BOLD_ON, BOLD_OFF, SIZE_DOUBLE, SIZE_NORMAL, CUT, LINE } = EP;
  let t = INIT;
  t += CENTER + SIZE_DOUBLE + BOLD_ON + 'CIERRE DE CAJA\n' + BOLD_OFF + SIZE_NORMAL;
  t += (s.sessionType === 'day' ? 'CIERRE DEL DIA' : 'CIERRE DE TURNO') + '\n';
  t += LINE + '\n';
  t += LEFT;
  t += BOLD_ON + 'Cajera: '    + BOLD_OFF + (s.cashierName ?? '—') + '\n';
  t += BOLD_ON + 'Apertura: '  + BOLD_OFF +
       new Date(s.openedAt).toLocaleString('es-DO', { timeZone: DR_TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + '\n';
  if (s.closedAt) {
    t += BOLD_ON + 'Cierre:   ' + BOLD_OFF +
         new Date(s.closedAt).toLocaleString('es-DO', { timeZone: DR_TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + '\n';
  }
  t += BOLD_ON + 'Fondo: ' + BOLD_OFF + 'RD$ ' + fmtNum(s.openingAmount) + '\n';
  t += LINE + '\n';
  t += CENTER + BOLD_ON + 'CUADRE DE CAJA\n' + BOLD_OFF;
  t += LEFT;
  // Column header (compact): label(10) expected(11) reported(11)
  t += 'Metodo    Esperado   Reportado\n';
  t += LINE + '\n';
  for (const [label, exp, rep] of [
    ['Efectivo',  s.cashExpected,     s.cashReported],
    ['Tarjeta',   s.cardExpected,     s.cardReported],
    ['Transfer.', s.transferExpected, s.transferReported],
    ['Credito',   s.creditExpected,   s.creditReported],
  ] as [string, any, any][]) {
    const expS = fmtNum(exp).padStart(10);
    const repS = fmtNum(rep).padStart(10);
    t += (label + '          ').slice(0, 10) + expS + ' ' + repS + '\n';
  }
  t += LINE + '\n';
  const totExp  = parseFloat(s.totalExpected  ?? '0');
  const totRep  = parseFloat(s.totalReported  ?? '0');
  const totDiff = parseFloat(s.totalDifference ?? '0');
  t += SIZE_DOUBLE + BOLD_ON + pad32('TOTAL:', 'RD$' + fmtNum(totExp)) + '\n' + BOLD_OFF + SIZE_NORMAL;
  t += pad32('Reportado:', 'RD$' + fmtNum(totRep)) + '\n';
  t += pad32('DIFERENCIA:', (totDiff >= 0 ? '+' : '') + 'RD$' + fmtNum(totDiff)) + '\n';
  t += LINE + '\n';
  t += pad32('Ordenes:',      String(s.totalOrders ?? 0)) + '\n';
  t += pad32('Ventas:',       'RD$' + fmtNum(s.totalSalesAmount)) + '\n';
  t += pad32('Descuentos:',   'RD$' + fmtNum(s.totalDiscountsAmount)) + '\n';
  t += pad32('Cancelaciones:', String(s.totalCancellations ?? 0)) + '\n';
  if (s.cashWithdrawalsTotal && parseFloat(s.cashWithdrawalsTotal) > 0) {
    t += LINE + '\n';
    t += CENTER + BOLD_ON + 'RETIROS DE EFECTIVO\n' + BOLD_OFF + LEFT;
    t += pad32('Cantidad:', String(s.cashWithdrawalsCount ?? 0)) + '\n';
    t += pad32('Total retirado:', '-RD$' + fmtNum(s.cashWithdrawalsTotal)) + '\n';
  }
  t += LINE + '\n';
  const stLabels: Record<string, string> = {
    approved: 'APROBADO', closed: 'PENDIENTE APROBACION', rejected: 'RECHAZADO',
  };
  t += CENTER + BOLD_ON + (stLabels[s.status] ?? s.status.toUpperCase()) + '\n' + BOLD_OFF;
  if (s.discrepancyNote) {
    t += LEFT + LINE + '\nNota: ' + s.discrepancyNote + '\n';
  }
  t += '\n\n\n' + CUT;
  return t;
}

function buildClosingNormalHtml(s: any): string {
  const methodRows = [
    { label: 'Efectivo',      exp: s.cashExpected,     rep: s.cashReported,     diff: s.cashDifference     },
    { label: 'Tarjeta',       exp: s.cardExpected,     rep: s.cardReported,     diff: s.cardDifference     },
    { label: 'Transferencia', exp: s.transferExpected, rep: s.transferReported, diff: s.transferDifference },
    { label: 'Crédito',       exp: s.creditExpected,   rep: s.creditReported,   diff: s.creditDifference   },
  ];
  const diffTotal = parseFloat(s.totalDifference ?? '0');
  const dc = (v: number) => v > 0 ? '#16a34a' : v < 0 ? '#dc2626' : '#374151';
  const sign = (v: number) => v >= 0 ? '+' : '';

  const stColor: Record<string, string> = { approved: '#16a34a', closed: '#d97706', rejected: '#dc2626' };
  const stLabel: Record<string, string> = { approved: 'APROBADO', closed: 'PENDIENTE APROBACIÓN', rejected: 'RECHAZADO' };
  const st = s.status ?? 'closed';

  const bodyRows = methodRows.map(r => {
    const d = parseFloat(r.diff ?? '0');
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${r.label}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right">RD$ ${fmtNum(r.exp)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right">RD$ ${fmtNum(r.rep)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:${dc(d)};font-weight:600">${sign(d)}RD$ ${fmtNum(d)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cierre de Caja</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:30px}
  @page{size:A4;margin:20mm}@media print{body{padding:0}}</style></head><body>
  <div style="max-width:700px;margin:0 auto">
    <h1 style="font-size:22px;font-weight:700;text-align:center;margin-bottom:4px">CIERRE DE CAJA</h1>
    <p style="text-align:center;font-size:14px;color:#6b7280;margin-bottom:24px">${s.sessionType === 'day' ? 'Cierre del Día' : 'Cierre de Turno'}</p>
    <table style="width:100%;margin-bottom:20px;font-size:13px">
      <tr>
        <td style="width:50%;padding-bottom:8px"><strong>Cajera:</strong> ${s.cashierName ?? '—'}</td>
        <td style="width:50%;padding-bottom:8px"><strong>Estado:</strong>
          <span style="color:${stColor[st]};font-weight:700">${stLabel[st] ?? st}</span></td>
      </tr><tr>
        <td style="padding-bottom:8px"><strong>Apertura:</strong> ${new Date(s.openedAt).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
        <td style="padding-bottom:8px"><strong>Cierre:</strong> ${s.closedAt ? new Date(s.closedAt).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
      </tr><tr>
        <td><strong>Fondo inicial:</strong> RD$ ${fmtNum(s.openingAmount)}</td><td></td>
      </tr>
    </table>
    <h2 style="font-size:15px;font-weight:700;margin-bottom:10px;border-bottom:2px solid #111;padding-bottom:6px">Cuadre por Método de Pago</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <thead><tr style="background:#f3f4f6">
        <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase">Método</th>
        <th style="padding:10px 12px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase">Sistema (Esperado)</th>
        <th style="padding:10px 12px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase">Cajera Reportó</th>
        <th style="padding:10px 12px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase">Diferencia</th>
      </tr></thead>
      <tbody>${bodyRows}</tbody>
      <tfoot><tr style="background:#f9fafb;font-weight:700;font-size:14px">
        <td style="padding:10px 12px;border-top:2px solid #374151">TOTAL</td>
        <td style="padding:10px 12px;border-top:2px solid #374151;text-align:right">RD$ ${fmtNum(s.totalExpected)}</td>
        <td style="padding:10px 12px;border-top:2px solid #374151;text-align:right">RD$ ${fmtNum(s.totalReported)}</td>
        <td style="padding:10px 12px;border-top:2px solid #374151;text-align:right;color:${dc(diffTotal)}">${sign(diffTotal)}RD$ ${fmtNum(diffTotal)}</td>
      </tr></tfoot>
    </table>
    <h2 style="font-size:15px;font-weight:700;margin-bottom:10px;border-bottom:2px solid #111;padding-bottom:6px">Resumen de Operaciones</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px">
      <tr>
        <td style="padding:8px 0;width:50%"><strong>Total Órdenes:</strong> ${s.totalOrders ?? 0}</td>
        <td style="padding:8px 0;width:50%"><strong>Cancelaciones:</strong> ${s.totalCancellations ?? 0}</td>
      </tr><tr>
        <td style="padding:8px 0"><strong>Ventas Totales:</strong> RD$ ${fmtNum(s.totalSalesAmount)}</td>
        <td style="padding:8px 0"><strong>Descuentos:</strong> RD$ ${fmtNum(s.totalDiscountsAmount)}</td>
      </tr>
    </table>
    ${s.cashWithdrawalsTotal && parseFloat(s.cashWithdrawalsTotal) > 0 ? `
    <h2 style="font-size:15px;font-weight:700;margin-bottom:10px;border-bottom:2px solid #dc2626;padding-bottom:6px;color:#dc2626">Retiros de Efectivo</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px">
      <tr>
        <td style="padding:8px 0;width:50%"><strong>Cantidad de retiros:</strong> ${s.cashWithdrawalsCount ?? 0}</td>
        <td style="padding:8px 0;color:#dc2626;font-weight:700"><strong>Total retirado:</strong> −RD$ ${fmtNum(s.cashWithdrawalsTotal)}</td>
      </tr>
    </table>` : ''}
    ${s.discrepancyNote ? `<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;padding:12px;margin-bottom:16px"><strong>⚠ Nota de discrepancia:</strong><br>${s.discrepancyNote}</div>` : ''}
    ${s.rejectionReason  ? `<div style="background:#fee2e2;border:1px solid #f87171;border-radius:6px;padding:12px;margin-bottom:16px"><strong>Motivo de rechazo:</strong><br>${s.rejectionReason}</div>` : ''}
    <p style="text-align:center;color:#9ca3af;font-size:11px;border-top:1px solid #e5e7eb;padding-top:12px">Impreso el ${new Date().toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' })}</p>
  </div></body></html>`;
}

function buildMonthlyThermalTicket(data: any): string {
  const { INIT, CENTER, LEFT, BOLD_ON, BOLD_OFF, SIZE_DOUBLE, SIZE_NORMAL, CUT, LINE } = EP;
  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  let t = INIT;
  t += CENTER + SIZE_DOUBLE + BOLD_ON + 'REPORTE MENSUAL\n' + BOLD_OFF + SIZE_NORMAL;
  t += (MONTHS[data.month - 1] ?? '') + ' ' + data.year + '\n';
  t += LINE + '\n';
  t += LEFT + 'Fecha  Ords      Ventas\n' + LINE + '\n';
  for (const d of (data.days ?? [])) {
    const dayStr  = new Date(d.date + 'T00:00:00').toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo', day: '2-digit', month: '2-digit' });
    const ordStr  = String(d.totalOrders).padStart(4);
    const saleStr = ('RD$' + fmtNum(d.totalSales)).padStart(15);
    t += dayStr + ordStr + ' ' + saleStr + '\n';
  }
  t += LINE + '\n';
  t += CENTER + BOLD_ON + 'TOTALES DEL MES\n' + BOLD_OFF + LEFT;
  const tt = data.totals;
  t += pad32('Sesiones:',       String(tt?.sessionCount    ?? 0)) + '\n';
  t += pad32('Ordenes:',        String(tt?.totalOrders     ?? 0)) + '\n';
  t += pad32('Ventas:',         'RD$' + fmtNum(tt?.totalSales     ?? 0)) + '\n';
  t += pad32('Descuentos:',     'RD$' + fmtNum(tt?.totalDiscounts ?? 0)) + '\n';
  t += pad32('Cancelaciones:',  String(tt?.totalCancellations ?? 0)) + '\n';
  const td = tt?.totalDifference ?? 0;
  t += pad32('Diferencia:',     (td >= 0 ? '+' : '') + 'RD$' + fmtNum(td)) + '\n';
  t += '\n\n\n' + CUT;
  return t;
}

function buildMonthlyNormalHtml(data: any): string {
  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const monthName = MONTHS[data.month - 1] ?? '';
  const dc = (v: number) => v > 0 ? '#16a34a' : v < 0 ? '#dc2626' : '#374151';
  const sign = (v: number) => v >= 0 ? '+' : '';

  const bodyRows = (data.days ?? []).map((d: any) => `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${new Date(d.date + 'T00:00:00').toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo', day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${d.sessionCount}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${d.totalOrders}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right">RD$ ${fmtNum(d.totalSales)}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right">RD$ ${fmtNum(d.totalExpected)}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right">RD$ ${fmtNum(d.totalReported)}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:${dc(d.totalDifference)};font-weight:600">${sign(d.totalDifference)}RD$ ${fmtNum(d.totalDifference)}</td>
  </tr>`).join('');

  const tt = data.totals;
  const tdv = tt?.totalDifference ?? 0;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Reporte Mensual ${monthName} ${data.year}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:30px}
  @page{size:A4 landscape;margin:15mm}@media print{body{padding:0}}</style></head><body>
  <div style="max-width:960px;margin:0 auto">
    <h1 style="font-size:22px;font-weight:700;text-align:center;margin-bottom:4px">REPORTE MENSUAL DE CAJA</h1>
    <p style="text-align:center;font-size:16px;font-weight:600;color:#374151;margin-bottom:24px">${monthName} ${data.year}</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <thead><tr style="background:#1e3a5f;color:#fff">
        <th style="padding:10px 12px;text-align:left">Fecha</th>
        <th style="padding:10px 12px;text-align:center">Sesiones</th>
        <th style="padding:10px 12px;text-align:center">Órdenes</th>
        <th style="padding:10px 12px;text-align:right">Ventas</th>
        <th style="padding:10px 12px;text-align:right">Esperado</th>
        <th style="padding:10px 12px;text-align:right">Reportado</th>
        <th style="padding:10px 12px;text-align:right">Diferencia</th>
      </tr></thead>
      <tbody>${bodyRows}</tbody>
      <tfoot><tr style="background:#f3f4f6;font-weight:700;font-size:14px">
        <td style="padding:12px;border-top:2px solid #374151">TOTAL DEL MES</td>
        <td style="padding:12px;border-top:2px solid #374151;text-align:center">${tt?.sessionCount ?? 0}</td>
        <td style="padding:12px;border-top:2px solid #374151;text-align:center">${tt?.totalOrders ?? 0}</td>
        <td style="padding:12px;border-top:2px solid #374151;text-align:right">RD$ ${fmtNum(tt?.totalSales ?? 0)}</td>
        <td style="padding:12px;border-top:2px solid #374151;text-align:right">RD$ ${fmtNum(tt?.totalExpected ?? 0)}</td>
        <td style="padding:12px;border-top:2px solid #374151;text-align:right">RD$ ${fmtNum(tt?.totalReported ?? 0)}</td>
        <td style="padding:12px;border-top:2px solid #374151;text-align:right;color:${dc(tdv)}">${sign(tdv)}RD$ ${fmtNum(tdv)}</td>
      </tr></tfoot>
    </table>
    <p style="color:#6b7280;font-size:13px;margin-bottom:4px">
      <strong>Descuentos del mes:</strong> RD$ ${fmtNum(tt?.totalDiscounts ?? 0)} &nbsp;&nbsp;
      <strong>Cancelaciones:</strong> ${tt?.totalCancellations ?? 0}
    </p>
    <p style="text-align:center;color:#9ca3af;font-size:11px;border-top:1px solid #e5e7eb;padding-top:12px;margin-top:16px">Impreso el ${new Date().toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' })}</p>
  </div></body></html>`;
}

// ─── payment row helper ──────────────────────────────────────────────────────

function PaymentRow({
  icon: Icon,
  label,
  expected,
  reported,
  onReportedChange,
  readOnly = false,
  highlight = false,
}: {
  icon: any;
  label: string;
  expected: number;
  reported: number;
  onReportedChange?: (v: number) => void;
  readOnly?: boolean;
  highlight?: boolean;
}) {
  const diff = reported - expected;
  const isEmpty = reported === 0 && !readOnly;
  return (
    <tr className={`border-b last:border-0 transition-colors ${
      highlight ? 'bg-emerald-50 hover:bg-emerald-100' : 'hover:bg-gray-50'
    }`}>
      {/* Columna 1: Método */}
      <td className="py-3 pr-4">
        <div className={`flex items-center gap-2 text-sm font-medium ${
          highlight ? 'text-emerald-800' : 'text-gray-700'
        }`}>
          <Icon className={`h-4 w-4 flex-shrink-0 ${highlight ? 'text-emerald-600' : 'text-gray-500'}`} />
          <span className="whitespace-nowrap">{label}</span>
          {highlight && (
            <span className="ml-1 text-[10px] font-bold text-emerald-600 bg-emerald-200 px-1.5 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap">
              ← ingresa
            </span>
          )}
        </div>
      </td>
      {/* Columna 2: Sistema (esperado) */}
      <td className="py-3 text-right text-sm text-gray-700 whitespace-nowrap px-4">{fmt(expected)}</td>
      {/* Columna 3: Cajera reporta */}
      <td className="py-3 pl-4 text-right">
        {readOnly ? (
          <span className="text-sm text-gray-700 whitespace-nowrap">{fmt(reported)}</span>
        ) : (
          <div className="flex justify-end">
            <Input
              type="number"
              min={0}
              step="0.01"
              className={`w-full max-w-[200px] min-w-[140px] text-right transition-all ${
                highlight && isEmpty
                  ? 'border-emerald-400 ring-2 ring-emerald-300 bg-white animate-pulse focus:animate-none placeholder-emerald-400'
                  : highlight
                  ? 'border-emerald-400 ring-1 ring-emerald-200 bg-white focus:animate-none'
                  : ''
              }`}
              value={reported === 0 ? '' : reported}
              placeholder={highlight ? '💵 Ingresa monto' : '0.00'}
              onChange={(e) => onReportedChange?.(parseFloat(e.target.value) || 0)}
            />
          </div>
        )}
      </td>
      {/* Columna 4: Diferencia */}
      <td className={`py-3 pl-4 text-right text-sm whitespace-nowrap ${diffColor(diff)}`}>
        {diff > 0 ? '+' : ''}{fmt(diff)}
        {diff > 0 && <TrendingUp className="inline h-3 w-3 ml-1" />}
        {diff < 0 && <TrendingDown className="inline h-3 w-3 ml-1" />}
      </td>
    </tr>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function CashRegisterPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  // Form state: cierre
  const [closeForm, setCloseForm] = useState({
    openingAmount: 0,
    cashReported: 0, cardReported: 0, transferReported: 0, creditReported: 0,
    discrepancyNote: "", closingNotes: "",
  });
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showCloseWizard, setShowCloseWizard] = useState(false);
  const [closeMode, setCloseMode] = useState<'wizard' | 'manual'>('wizard');

  // Closure scope: 'general' = caja general (dia), 'user' = por cajero (turno)
  const [closureScope, setClosureScope] = useState<'general' | 'user'>('general');
  const [selectedCashierId, setSelectedCashierId] = useState<string>("");

  // Reject dialog
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<number | null>(null);

  // History filters
  const [histFilters, setHistFilters] = useState({ startDate: "", endDate: "", status: "" });

  // Print state
  const [printingId, setPrintingId] = useState<number | null>(null);

  // Monthly report
  const [monthFilter, setMonthFilter] = useState<string>("");

  // ── queries ──────────────────────────────────────────────────────────────
  // cashierId param for stats when in user/shift mode
  const statsCashierId = closureScope === 'user' && selectedCashierId ? selectedCashierId : null;

  const { data: currentData, isLoading: loadingCurrent, refetch: refetchCurrent } = useQuery({
    queryKey: ["/api/cash-register/sessions/current-stats", statsCashierId],
    queryFn: () => {
      const url = statsCashierId
        ? `/api/cash-register/sessions/current-stats?cashierId=${statsCashierId}`
        : `/api/cash-register/sessions/current-stats`;
      return apiCall(url);
    },
    refetchInterval: 30_000,
  });

  // Store users for cashier selector
  const { data: storeUsersData } = useQuery({
    queryKey: ["/api/tenant-users/assignable"],
    queryFn: () => apiCall("/api/tenant-users/assignable"),
  });
  const storeUsers: any[] = Array.isArray(storeUsersData)
    ? storeUsersData
    : (storeUsersData?.users ?? []);

  const { data: histData, isLoading: loadingHist, refetch: refetchHist } = useQuery({
    queryKey: ["/api/cash-register/sessions", histFilters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (histFilters.startDate) params.set("startDate", histFilters.startDate);
      if (histFilters.endDate) params.set("endDate", histFilters.endDate);
      if (histFilters.status) params.set("status", histFilters.status);
      return apiCall(`/api/cash-register/sessions?${params.toString()}`);
    },
  });

  const { data: monthlyData, isLoading: loadingMonthly } = useQuery({
    queryKey: ["/api/cash-register/monthly-report", monthFilter],
    queryFn: () => {
      const [year, month] = monthFilter.split("-");
      return apiCall(`/api/cash-register/monthly-report?year=${year}&month=${parseInt(month)}`);
    },
    enabled: monthFilter.length === 7,
  });

  // ── mutations ─────────────────────────────────────────────────────────────
  const closeMutation = useMutation({
    mutationFn: (body: any) =>
      apiCall("/api/cash-register/sessions/close", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-register/sessions/current-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash-register/sessions"] });
      setShowCloseConfirm(false);
      setCloseForm({ openingAmount: 0, cashReported: 0, cardReported: 0, transferReported: 0, creditReported: 0, discrepancyNote: "", closingNotes: "" });
      const desc = closureScope === 'user'
        ? "El cierre de turno queda pendiente de aprobación."
        : "El cierre general queda pendiente de aprobación del supervisor.";
      toast({ title: "Cierre registrado", description: desc });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) =>
      apiCall(`/api/cash-register/sessions/${id}/approve`, { method: "PUT" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-register/sessions"] });
      toast({ title: "Aprobado", description: "El cierre de caja fue aprobado." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiCall(`/api/cash-register/sessions/${id}/reject`, {
        method: "PUT", body: JSON.stringify({ rejectionReason: reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-register/sessions"] });
      setRejectOpen(false);
      setRejectReason("");
      toast({ title: "Rechazado", description: "El cierre de caja fue rechazado." });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // ── print handlers ────────────────────────────────────────────────────────

  const handlePrintClosingThermal = async (id: number) => {
    setPrintingId(id);
    try {
      const { session } = await apiCall(`/api/cash-register/sessions/${id}`);
      const ticket = buildClosingThermalTicket(session);
      const res = await fetch("/api/print/thermal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({ ticket }),
      });
      if (!res.ok) throw new Error("Error al enviar a impresora");
      const result = await res.json();
      toast({ title: "✓ Impreso", description: `Enviado por ${result.method ?? "impresora"}` });
    } catch (err: any) {
      toast({ title: "Error de impresión", description: err.message, variant: "destructive" });
    } finally {
      setPrintingId(null);
    }
  };

  const handlePrintClosingNormal = async (id: number) => {
    setPrintingId(id);
    try {
      const { session } = await apiCall(`/api/cash-register/sessions/${id}`);
      const html = buildClosingNormalHtml(session);
      const win = window.open("", "_blank", "height=700,width=800");
      if (!win) {
        toast({ title: "Error", description: "Permite ventanas emergentes para imprimir.", variant: "destructive" });
        return;
      }
      win.document.write(html);
      win.document.close();
      setTimeout(() => { win.print(); }, 300);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setPrintingId(null);
    }
  };

  const handlePrintMonthlyThermal = async () => {
    if (!monthlyData) return;
    try {
      const ticket = buildMonthlyThermalTicket(monthlyData);
      const res = await fetch("/api/print/thermal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
        body: JSON.stringify({ ticket }),
      });
      if (!res.ok) throw new Error("Error al enviar a impresora");
      const result = await res.json();
      toast({ title: "✓ Impreso", description: `Enviado por ${result.method ?? "impresora"}` });
    } catch (err: any) {
      toast({ title: "Error de impresión", description: err.message, variant: "destructive" });
    }
  };

  const handlePrintMonthlyNormal = () => {
    if (!monthlyData) return;
    const html = buildMonthlyNormalHtml(monthlyData);
    const win = window.open("", "_blank", "height=700,width=1000");
    if (!win) {
      toast({ title: "Error", description: "Permite ventanas emergentes para imprimir.", variant: "destructive" });
      return;
    }
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.print(); }, 300);
  };

  // ── derived state ─────────────────────────────────────────────────────────
  const stats        = currentData?.stats ?? null;
  const periodStart  = currentData?.periodStart ?? null;
  const closuresToday: number = currentData?.closuresToday ?? 0;

  // Resolved cashier name for display
  const selectedCashierUser = storeUsers.find((u: any) => String(u.id) === selectedCashierId);
  const sessions: any[] = histData?.sessions ?? [];

  const cashSalesNet     = parseFloat(stats?.cashTotal     ?? "0"); // ventas efectivo - retiros
  const cashExpected     = closeForm.openingAmount + cashSalesNet;  // gaveta = fondo + ventas - retiros
  const cardExpected     = parseFloat(stats?.cardTotal     ?? "0");
  const transferExpected = parseFloat(stats?.transferTotal ?? "0");
  const creditExpected   = parseFloat(stats?.creditTotal   ?? "0");
  const totalExpected    = cashExpected + cardExpected + transferExpected + creditExpected;
  const totalReported    =
    closeForm.cashReported + closeForm.cardReported +
    closeForm.transferReported + closeForm.creditReported;
  const totalDiff  = totalReported - totalExpected;
  const needsNote  = Math.abs(totalDiff) > DISCREPANCY_THRESHOLD;

  // ── views ─────────────────────────────────────────────────────────────────
  if (loadingCurrent) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 w-full">
      <div className="flex items-center gap-3">
        <Landmark className="h-7 w-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cierre de Caja</h1>
          <p className="text-sm text-gray-500">Cuadre y aprobación de cierres de caja</p>
        </div>
      </div>

      <Tabs defaultValue="current">
        <TabsList>
          <TabsTrigger value="current">Nuevo Cierre</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
          <TabsTrigger value="monthly">
            <CalendarDays className="h-4 w-4 mr-1" />
            Reporte Mensual
          </TabsTrigger>
        </TabsList>

        {/* ════════════════ NUEVO CIERRE ════════════════ */}
        <TabsContent value="current" className="space-y-4 mt-4">

          {/* Toggle: modo de cierre */}
          <div className="flex gap-2 p-1 bg-gray-100 rounded-lg w-fit">
            <button
              type="button"
              onClick={() => setCloseMode('wizard')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                closeMode === 'wizard'
                  ? 'bg-white shadow text-blue-700'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              ✨ Asistido
            </button>
            <button
              type="button"
              onClick={() => setCloseMode('manual')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                closeMode === 'manual'
                  ? 'bg-white shadow text-blue-700'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📋 Manual
            </button>
          </div>

          {/* Período del cierre */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${
                    closureScope === 'user' ? 'bg-purple-100'
                    : closuresToday === 0 ? 'bg-blue-100' : 'bg-amber-100'
                  }`}>
                    <Clock className={`h-5 w-5 ${
                      closureScope === 'user' ? 'text-purple-600'
                      : closuresToday === 0 ? 'text-blue-600' : 'text-amber-600'
                    }`} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {closureScope === 'user'
                        ? selectedCashierUser
                          ? `Turno de ${selectedCashierUser.name} (${closuresToday === 0 ? 'primer turno' : `turno #${closuresToday + 1}`})`
                          : 'Selecciona un cajero'
                        : closuresToday === 0 ? "Primer cierre del día" : `Cierre parcial #${closuresToday + 1} del día`
                      }
                    </p>
                    <p className="text-xs text-gray-500">
                      Período: {periodStart ? fmtDate(periodStart) : "desde inicio del día"} → ahora
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchCurrent()}
                  disabled={closureScope === 'user' && !selectedCashierId}>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Actualizar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Stats en vivo */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Órdenes",       value: stats?.totalOrders ?? 0,       icon: CheckCircle2, raw: true  },
              { label: "Ventas Totales",value: stats?.totalSales  ?? "0",     icon: TrendingUp                },
              { label: "Descuentos",    value: stats?.totalDiscounts ?? "0",  icon: TrendingDown              },
              { label: "Cancelaciones", value: stats?.totalCancellations ?? 0,icon: XCircle,     raw: true  },
            ].map(({ label, value, icon: Icon, raw }) => (
              <Card key={label}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">{label}</p>
                    <Icon className="h-4 w-4 text-gray-400" />
                  </div>
                  <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
                    {raw ? value : fmt(value)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Retiros del período */}
          {stats && parseFloat(stats.cashWithdrawalsTotal ?? "0") > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-5 w-5 text-red-500" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">
                        Retiros de Efectivo del Período ({stats.cashWithdrawalsCount ?? 0})
                      </p>
                      <p className="text-xs text-red-600 mt-0.5">
                        Ventas efectivo: {fmt(stats.cashTotalGross ?? "0")} − Retiros: {fmt(stats.cashWithdrawalsTotal)} = Efectivo esperado: {fmt(stats.cashTotal)}
                      </p>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-red-700">−{fmt(stats.cashWithdrawalsTotal)}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {closeMode === 'wizard' ? (
          /* CTA: Iniciar cierre asistido */
          <Card className="border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-600 text-white rounded-full p-3 shadow-lg">
                    <Landmark className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-gray-900">Cierre de Caja Asistido</p>
                    <p className="text-xs text-gray-600">
                      Te guiaré paso a paso por el cierre. Selecciona el tipo, ingresa el fondo inicial y los montos contados.
                    </p>
                  </div>
                </div>
                <Button
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-700 shadow-md"
                  onClick={() => setShowCloseWizard(true)}
                >
                  Iniciar Cierre
                  <CheckCircle2 className="h-5 w-5 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
          ) : (
          /* MODO MANUAL: tipo de cierre + tabla de cuadre tradicional */
          <>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tipo de cierre</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setClosureScope('general'); setSelectedCashierId(''); }}
                  className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                    closureScope === 'general'
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-300'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className={`rounded-full p-2 ${closureScope === 'general' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                    <Landmark className={`h-4 w-4 ${closureScope === 'general' ? 'text-blue-600' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${closureScope === 'general' ? 'text-blue-800' : 'text-gray-700'}`}>Caja General</p>
                    <p className="text-xs text-gray-400">Todas las ventas del día</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setClosureScope('user')}
                  className={`flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${
                    closureScope === 'user'
                      ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-300'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className={`rounded-full p-2 ${closureScope === 'user' ? 'bg-purple-100' : 'bg-gray-100'}`}>
                    <User className={`h-4 w-4 ${closureScope === 'user' ? 'text-purple-600' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${closureScope === 'user' ? 'text-purple-800' : 'text-gray-700'}`}>Por Cajero</p>
                    <p className="text-xs text-gray-400">Cierre de turno individual</p>
                  </div>
                </button>
              </div>

              {closureScope === 'user' && (
                <div className="mt-4 space-y-1">
                  <Label className="text-xs text-gray-500">Cajero / Empleado</Label>
                  <Select value={selectedCashierId} onValueChange={(v) => setSelectedCashierId(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona el cajero..." />
                    </SelectTrigger>
                    <SelectContent>
                      {storeUsers.map((u: any) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          <span className="flex items-center gap-2">
                            <Users className="h-3 w-3" />
                            {u.name}
                            {u.role && (<span className="text-xs text-gray-400 ml-1">({u.role})</span>)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!selectedCashierId && (
                    <p className="text-xs text-amber-600 mt-1">Selecciona un cajero para ver su turno.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tabla de pagos por método */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cuadre por método de pago</CardTitle>
              <CardDescription>
                Ingresa el dinero contado por método. La diferencia se calcula automáticamente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Fondo inicial */}
              <div className="mb-4 p-3 rounded-xl border-2 border-blue-200 bg-blue-50">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Banknote className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="text-sm font-semibold text-blue-900">Fondo inicial de caja</p>
                      <p className="text-xs text-blue-600">Monto en efectivo con que se inició la caja.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-blue-700 font-medium">RD$</span>
                    <Input
                      type="number" step="0.01" min="0"
                      className="w-36 text-right font-bold text-blue-900 bg-white border-blue-300 focus:border-blue-500"
                      value={closeForm.openingAmount || ""}
                      onChange={(e) => setCloseForm((p) => ({ ...p, openingAmount: parseFloat(e.target.value) || 0 }))}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-gray-500 text-xs uppercase">
                      <th className="pb-2 text-left">Método</th>
                      <th className="pb-2 text-right px-4">Sistema (Esperado)</th>
                      <th className="pb-2 text-right pl-4">Cajera reporta</th>
                      <th className="pb-2 text-right pl-4">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    <PaymentRow icon={Banknote} label="Efectivo" highlight
                      expected={cashExpected} reported={closeForm.cashReported}
                      onReportedChange={(v) => setCloseForm((p) => ({ ...p, cashReported: v }))} />
                    <PaymentRow icon={CreditCard} label="Tarjeta"
                      expected={cardExpected} reported={closeForm.cardReported}
                      onReportedChange={(v) => setCloseForm((p) => ({ ...p, cardReported: v }))} />
                    <PaymentRow icon={ArrowRightLeft} label="Transferencia"
                      expected={transferExpected} reported={closeForm.transferReported}
                      onReportedChange={(v) => setCloseForm((p) => ({ ...p, transferReported: v }))} />
                    <PaymentRow icon={Clock} label="Crédito"
                      expected={creditExpected} reported={closeForm.creditReported}
                      onReportedChange={(v) => setCloseForm((p) => ({ ...p, creditReported: v }))} />
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-gray-50 font-bold text-sm">
                      <td className="pt-3 pb-2 pl-1">Total</td>
                      <td className="pt-3 pb-2 text-right px-4 whitespace-nowrap">{fmt(totalExpected)}</td>
                      <td className="pt-3 pb-2 text-right pl-4 whitespace-nowrap">{fmt(totalReported)}</td>
                      <td className={`pt-3 pb-2 text-right pl-4 whitespace-nowrap ${diffColor(totalDiff)}`}>
                        {totalDiff > 0 ? "+" : ""}{fmt(totalDiff)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {needsNote && (
                <div className="mt-4 p-3 rounded-md bg-amber-50 border border-amber-200 flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <p className="text-sm text-amber-800 font-medium">
                      La diferencia supera {fmt(DISCREPANCY_THRESHOLD)}. Debes explicar el motivo.
                    </p>
                    <Textarea
                      placeholder="Explica la diferencia encontrada..."
                      value={closeForm.discrepancyNote}
                      onChange={(e) => setCloseForm((p) => ({ ...p, discrepancyNote: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              <div className="mt-4 space-y-1">
                <Label className="text-xs text-gray-500">Notas de cierre (opcional)</Label>
                <Textarea
                  placeholder="Observaciones del cierre..."
                  value={closeForm.closingNotes}
                  onChange={(e) => setCloseForm((p) => ({ ...p, closingNotes: e.target.value }))}
                  rows={2}
                />
              </div>

              <Button
                className="mt-5 w-full"
                disabled={
                  (needsNote && !closeForm.discrepancyNote.trim()) ||
                  (closureScope === 'user' && !selectedCashierId)
                }
                onClick={() => setShowCloseConfirm(true)}
              >
                {closureScope === 'user' ? 'Registrar Cierre de Turno' : 'Registrar Cierre de Caja'}
              </Button>
            </CardContent>
          </Card>
          </>
          )}
        </TabsContent>

        {/* ════════════════ HISTORIAL ════════════════ */}
        <TabsContent value="history" className="space-y-4 mt-4">
          {/* Filtros */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Desde</Label>
                  <Input type="date" className="w-40"
                    value={histFilters.startDate}
                    onChange={(e) => setHistFilters((p) => ({ ...p, startDate: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Hasta</Label>
                  <Input type="date" className="w-40"
                    value={histFilters.endDate}
                    onChange={(e) => setHistFilters((p) => ({ ...p, endDate: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Estado</Label>
                  <Select
                    value={histFilters.status || "all"}
                    onValueChange={(v) => setHistFilters((p) => ({ ...p, status: v === "all" ? "" : v }))}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="closed">Pendiente</SelectItem>
                      <SelectItem value="approved">Aprobada</SelectItem>
                      <SelectItem value="rejected">Rechazada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchHist()}>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Actualizar
                </Button>
              </div>
            </CardContent>
          </Card>

          {loadingHist ? (
            <div className="flex justify-center py-10">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <History className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No hay registros de cierre de caja.</p>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Fecha apertura</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Cajera</TableHead>
                      <TableHead className="text-right">Esperado</TableHead>
                      <TableHead className="text-right">Reportado</TableHead>
                      <TableHead className="text-right">Diferencia</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Imprimir</TableHead>
                      {isAdmin && <TableHead>Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((s: any) => {
                      const diff = parseFloat(s.totalDifference ?? "0");
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="text-sm">{fmtDate(s.openedAt)}</TableCell>
                          <TableCell className="text-sm">{sessionTypeLabel(s.sessionType)}</TableCell>
                          <TableCell className="text-sm">{s.cashierName ?? "—"}</TableCell>
                          <TableCell className="text-right text-sm">{fmt(s.totalExpected)}</TableCell>
                          <TableCell className="text-right text-sm">{fmt(s.totalReported)}</TableCell>
                          <TableCell className={`text-right text-sm ${diffColor(diff)}`}>
                            {diff > 0 ? "+" : ""}{fmt(diff)}
                          </TableCell>
                          <TableCell>{statusBadge(s.status)}</TableCell>
                          <TableCell>
                            {s.status !== "open" && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={printingId === s.id}
                                    className="h-7 px-2 text-xs"
                                  >
                                    {printingId === s.id ? (
                                      <RefreshCw className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <><Printer className="h-3 w-3 mr-1" />Imprimir<ChevronDown className="h-3 w-3 ml-1" /></>
                                    )}
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handlePrintClosingThermal(s.id)}>
                                    <Printer className="h-4 w-4 mr-2" />
                                    Impresora Térmica
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handlePrintClosingNormal(s.id)}>
                                    <FileText className="h-4 w-4 mr-2" />
                                    PDF / Impresora Normal
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TableCell>
                          {isAdmin && (
                            <TableCell>
                              {s.status === "closed" && (
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-green-700 border-green-300 hover:bg-green-50"
                                    disabled={approveMutation.isPending}
                                    onClick={() => approveMutation.mutate(s.id)}
                                  >
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Aprobar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-700 border-red-300 hover:bg-red-50"
                                    onClick={() => {
                                      setRejectingId(s.id);
                                      setRejectOpen(true);
                                    }}
                                  >
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Rechazar
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ════════════════ REPORTE MENSUAL ════════════════ */}
        <TabsContent value="monthly" className="space-y-4 mt-4">
          {/* Selector de mes + botones de imprimir */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Mes y Año</Label>
                  <input
                    type="month"
                    className="flex h-9 w-44 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={monthFilter}
                    onChange={(e) => setMonthFilter(e.target.value)}
                  />
                </div>
                {monthlyData && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Printer className="h-4 w-4 mr-2" />
                        Imprimir Reporte
                        <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={handlePrintMonthlyThermal}>
                        <Printer className="h-4 w-4 mr-2" />
                        Impresora Térmica
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handlePrintMonthlyNormal}>
                        <FileText className="h-4 w-4 mr-2" />
                        PDF / Impresora Normal
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Contenido del reporte */}
          {!monthFilter && (
            <div className="text-center py-16 text-gray-400">
              <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Selecciona un mes para ver el reporte consolidado.</p>
            </div>
          )}

          {monthFilter && loadingMonthly && (
            <div className="flex justify-center py-10">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
            </div>
          )}

          {monthFilter && !loadingMonthly && monthlyData && (
            <>
              {/* Tarjetas resumen */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Sesiones",       value: monthlyData.totals?.sessionCount ?? 0,   raw: true  },
                  { label: "Órdenes",         value: monthlyData.totals?.totalOrders   ?? 0,   raw: true  },
                  { label: "Ventas Totales",  value: monthlyData.totals?.totalSales    ?? 0,   raw: false },
                  { label: "Diferencia Total",value: monthlyData.totals?.totalDifference ?? 0, raw: false, diff: true },
                ].map(({ label, value, raw, diff }) => {
                  const numVal = typeof value === "number" ? value : parseFloat(value as string);
                  return (
                    <Card key={label}>
                      <CardContent className="pt-4">
                        <p className="text-sm text-gray-500">{label}</p>
                        <p className={`mt-1 text-xl font-bold ${diff ? diffColor(numVal) : "text-gray-900 dark:text-white"}`}>
                          {raw ? numVal : (diff && numVal > 0 ? "+" : "") + fmt(numVal)}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Tabla diaria */}
              {monthlyData.days?.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>No hay cierres aprobados en este mes.</p>
                </div>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Consolidado por Día
                    </CardTitle>
                    <CardDescription>
                      Solo incluye cierres cerrados, aprobados o rechazados.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">Fecha</TableHead>
                          <TableHead className="text-center">Sesiones</TableHead>
                          <TableHead className="text-center">Órdenes</TableHead>
                          <TableHead className="text-right">Ventas</TableHead>
                          <TableHead className="text-right">Esperado</TableHead>
                          <TableHead className="text-right">Reportado</TableHead>
                          <TableHead className="text-right">Diferencia</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {monthlyData.days.map((d: any) => {
                          const diff = d.totalDifference ?? 0;
                          return (
                            <TableRow key={d.date}>
                              <TableCell className="text-sm font-medium">
                                {new Date(d.date + "T00:00:00").toLocaleDateString("es-DO", {
                                  timeZone: 'America/Santo_Domingo',
                                  weekday: "short", day: "2-digit", month: "short",
                                })}
                              </TableCell>
                              <TableCell className="text-center text-sm">{d.sessionCount}</TableCell>
                              <TableCell className="text-center text-sm">{d.totalOrders}</TableCell>
                              <TableCell className="text-right text-sm">{fmt(d.totalSales)}</TableCell>
                              <TableCell className="text-right text-sm">{fmt(d.totalExpected)}</TableCell>
                              <TableCell className="text-right text-sm">{fmt(d.totalReported)}</TableCell>
                              <TableCell className={`text-right text-sm ${diffColor(diff)}`}>
                                {diff > 0 ? "+" : ""}{fmt(diff)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                      <tfoot className="border-t-2 border-gray-300">
                        <tr className="bg-gray-50 font-bold text-sm">
                          <td className="px-4 py-3">Total del Mes</td>
                          <td className="px-4 py-3 text-center">{monthlyData.totals?.sessionCount ?? 0}</td>
                          <td className="px-4 py-3 text-center">{monthlyData.totals?.totalOrders ?? 0}</td>
                          <td className="px-4 py-3 text-right">{fmt(monthlyData.totals?.totalSales ?? 0)}</td>
                          <td className="px-4 py-3 text-right">{fmt(monthlyData.totals?.totalExpected ?? 0)}</td>
                          <td className="px-4 py-3 text-right">{fmt(monthlyData.totals?.totalReported ?? 0)}</td>
                          <td className={`px-4 py-3 text-right ${diffColor(monthlyData.totals?.totalDifference ?? 0)}`}>
                            {(monthlyData.totals?.totalDifference ?? 0) > 0 ? "+" : ""}
                            {fmt(monthlyData.totals?.totalDifference ?? 0)}
                          </td>
                        </tr>
                      </tfoot>
                    </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Wizard de Cierre Asistido ── */}
      <CloseWizard
        open={showCloseWizard}
        onOpenChange={setShowCloseWizard}
        storeUsers={storeUsers}
        stats={stats}
        isLoadingStats={loadingCurrent}
        onCashierChange={(cid) => {
          if (cid) {
            setClosureScope('user');
            setSelectedCashierId(cid);
          } else {
            setClosureScope('general');
            setSelectedCashierId('');
          }
        }}
        onSubmit={(payload) => closeMutation.mutate(payload)}
        isPending={closeMutation.isPending}
      />

      {/* ── Modal confirmar cierre (modo manual) ── */}
      <Dialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {closureScope === 'user' ? 'Confirmar Cierre de Turno' : 'Confirmar Cierre de Caja'}
            </DialogTitle>
            <DialogDescription>
              {closureScope === 'user' && selectedCashierUser
                ? `Se registrará el cierre de turno de ${selectedCashierUser.name}.`
                : 'Se registrará un nuevo cierre general. Los montos no podrán modificarse.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-sm">
            {closureScope === 'user' && selectedCashierUser && (
              <div className="flex justify-between">
                <span className="text-gray-500">Cajero</span>
                <span className="font-medium text-purple-700">{selectedCashierUser.name}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Fondo inicial</span>
              <span className="font-medium text-blue-700">{fmt(closeForm.openingAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Total esperado</span>
              <span className="font-medium">{fmt(totalExpected)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Total reportado</span>
              <span className="font-medium">{fmt(totalReported)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Diferencia</span>
              <span className={diffColor(totalDiff)}>
                {totalDiff > 0 ? "+" : ""}{fmt(totalDiff)}
              </span>
            </div>
            {closeForm.discrepancyNote && (
              <p className="text-gray-500 italic text-xs mt-1">{closeForm.discrepancyNote}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseConfirm(false)}>Cancelar</Button>
            <Button
              disabled={closeMutation.isPending}
              onClick={() =>
                closeMutation.mutate({
                  openingAmount:    closeForm.openingAmount,
                  cashReported:     closeForm.cashReported,
                  cardReported:     closeForm.cardReported,
                  transferReported: closeForm.transferReported,
                  creditReported:   closeForm.creditReported,
                  discrepancyNote:  closeForm.discrepancyNote || undefined,
                  closingNotes:     closeForm.closingNotes    || undefined,
                  sessionType:      closureScope === 'user' ? 'shift' : 'day',
                  targetCashierId:  closureScope === 'user' && selectedCashierId ? parseInt(selectedCashierId) : undefined,
                })
              }
            >
              {closeMutation.isPending ? "Registrando..." : "Confirmar Cierre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal rechazar ── */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar Cierre</DialogTitle>
            <DialogDescription>
              Indica el motivo del rechazo. La cajera deberá revisar y volver a enviar el cierre.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Motivo del rechazo..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              onClick={() => rejectingId && rejectMutation.mutate({ id: rejectingId, reason: rejectReason })}
            >
              {rejectMutation.isPending ? "Rechazando..." : "Rechazar Cierre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
