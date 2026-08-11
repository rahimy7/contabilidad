// client/src/pages/invoicing.tsx
/**
 * Facturación formal (ERP) — la contraparte documental del POS.
 *
 * El POS es una pantalla táctil pensada para vender rápido; esta es la entrada
 * de un comprobante: encabezado fiscal (tipo de NCF, condición de pago,
 * vencimiento, moneda), cliente con RNC/Cédula, y una grilla de líneas con
 * descuento e ITBIS por línea.
 *
 * Al emitir ocurren dos cosas, en este orden:
 *   1. Si "descontar inventario" está activo, se crea el pedido operativo
 *      (`POST /api/orders`) — mueve stock y aparece en el historial de ventas,
 *      igual que una venta del POS.
 *   2. Se emite el comprobante fiscal (`POST /api/fiscal/invoices`) enlazado a
 *      ese pedido: asigna el NCF y contabiliza ingreso, ITBIS y costo de venta.
 *
 * Ese orden es deliberado: el NCF es un recurso legal escaso y numerado, así que
 * se consume de último. Si el paso 2 falla, el pedido queda visible y corregible
 * en Gestión de Pedidos en lugar de quemar un número.
 *
 * Los totales que se muestran son una previsualización calculada con las tasas
 * estándar; el servidor recalcula con `tax_codes`/`tax_rates` de la empresa y es
 * la única fuente autoritativa de los montos que se guardan.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText, Plus, Trash2, Search, X, Printer, Download, AlertTriangle,
  CheckCircle2, Settings2, Loader2, UserRound, Package,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { fiscalApi } from '@/lib/accounting-api';
import { useCompany } from '@/contexts/CompanyContext';
import { useWarehouse } from '@/contexts/WarehouseContext';

// ─── tipos ──────────────────────────────────────────────────────────────────

interface ProductRow {
  id: number;
  name: string;
  price: string;
  sku?: string | null;
  barcode?: string | null;
  category?: string;
  type?: string;
  stockQuantity?: number;
  isActive?: boolean;
  baseCurrency?: string;
  base_currency?: string;
}

interface CustomerRow {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

interface WarehouseRow {
  id: number;
  name: string;
  isDefault?: boolean;
  isActive?: boolean;
}

interface NcfSequenceRow {
  id: number;
  ncf_type: string;
  is_ecf: boolean;
  range_from: number;
  range_to: number;
  next_number: number;
  remaining: number;
  expiry_date: string | null;
  alert_threshold: number;
  is_active: boolean;
}

type TaxCode = 'ITBIS18' | 'ITBIS16' | 'ITBIS0' | 'EXENTO';

interface Line {
  id: string;
  productId?: number;
  code: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  taxCode: TaxCode;
}

interface IssuedInvoice {
  documentId: number;
  ncf: string;
  total: string;
  journalEntryId: number;
  orderNumber?: string;
  snapshot: PrintPayload;
}

// ─── catálogo fiscal ────────────────────────────────────────────────────────

/** Tipos de comprobante que aplican a una factura de venta. */
const NCF_LABELS: Record<string, string> = {
  B01: 'B01 · Crédito Fiscal',
  B02: 'B02 · Consumo',
  B14: 'B14 · Régimen Especial',
  B15: 'B15 · Gubernamental',
  B16: 'B16 · Exportaciones',
  E31: 'E31 · e-CF Crédito Fiscal',
  E32: 'E32 · e-CF Consumo',
  E44: 'E44 · e-CF Régimen Especial',
  E45: 'E45 · e-CF Gubernamental',
  E46: 'E46 · e-CF Exportaciones',
};

/** Comprobantes que sustentan crédito fiscal: la DGII exige RNC del comprador. */
const RNC_REQUIRED_TYPES = ['B01', 'E31', 'B14', 'E44', 'B15', 'E45'];

/**
 * Tasas para la previsualización. Coinciden con `seedTaxConfiguration`; el
 * servidor recalcula contra la configuración vigente de la empresa.
 */
const TAX_RATES: Record<TaxCode, number> = {
  ITBIS18: 0.18,
  ITBIS16: 0.16,
  ITBIS0: 0,
  EXENTO: 0,
};

const TAX_LABELS: Record<TaxCode, string> = {
  ITBIS18: 'ITBIS 18%',
  ITBIS16: 'ITBIS 16%',
  ITBIS0: 'ITBIS 0%',
  EXENTO: 'Exento',
};

const LEGAL_TIP_RATE = 0.1;

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  credit: 'Crédito',
};

// ─── helpers ────────────────────────────────────────────────────────────────

const num = (v: string | number | undefined | null): number => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const money = (v: number | string, currency = 'DOP') => {
  const n = typeof v === 'string' ? num(v) : v;
  const symbol = currency === 'USD' ? 'US$' : 'RD$';
  return `${symbol}${n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const addDaysISO = (iso: string, days: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatDateLong = (iso: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('es-DO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
};

/** RNC (9) o cédula (11). El servidor rechaza cualquier otra longitud. */
const cleanTaxId = (v: string) => v.replace(/\D/g, '');
const isValidTaxId = (v: string) => /^\d{9}$|^\d{11}$/.test(cleanTaxId(v));

const newLine = (patch: Partial<Line> = {}): Line => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  code: '',
  description: '',
  quantity: '1',
  unitPrice: '0',
  discountPct: '0',
  taxCode: 'ITBIS18',
  ...patch,
});

const computeLine = (l: Line) => {
  const gross = num(l.quantity) * num(l.unitPrice);
  const discount = r2((gross * num(l.discountPct)) / 100);
  const lineTotal = r2(gross - discount);
  const exempt = l.taxCode === 'EXENTO';
  const rate = TAX_RATES[l.taxCode] ?? 0;
  const itbis = exempt ? 0 : r2(lineTotal * rate);
  return { gross, discount, lineTotal, itbis, exempt };
};

// ─── página ─────────────────────────────────────────────────────────────────

export default function InvoicingPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { activeCompany } = useCompany();
  const { activeWarehouseId, canViewAll } = useWarehouse();

  // Encabezado
  const [ncfType, setNcfType] = useState('');
  const [date, setDate] = useState(todayISO());
  const [condition, setCondition] = useState<'contado' | 'credito'>('contado');
  const [creditDays, setCreditDays] = useState('30');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [currency, setCurrency] = useState('DOP');
  const [fxRate, setFxRate] = useState('1');
  const [warehouseId, setWarehouseId] = useState<number | null>(activeWarehouseId);
  const [applyLegalTip, setApplyLegalTip] = useState(false);
  const [affectInventory, setAffectInventory] = useState(true);

  // Cliente
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [buyerName, setBuyerName] = useState('');
  const [buyerRnc, setBuyerRnc] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');

  // Detalle
  const [lines, setLines] = useState<Line[]>([]);

  // Diálogos
  const [issued, setIssued] = useState<IssuedInvoice | null>(null);
  const [showSequenceDialog, setShowSequenceDialog] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  // ── datos ────────────────────────────────────────────────────────────────
  const { data: products = [] } = useQuery<ProductRow[]>({
    queryKey: ['products'],
    queryFn: async () => {
      const data = await apiRequest<ProductRow[]>('GET', '/api/products');
      return Array.isArray(data) ? data.filter((p) => p.isActive !== false) : [];
    },
  });

  const { data: customers = [] } = useQuery<CustomerRow[]>({
    queryKey: ['customers'],
    queryFn: async () => {
      const data = await apiRequest<CustomerRow[]>('GET', '/api/customers');
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: warehouses = [] } = useQuery<WarehouseRow[]>({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const data = await apiRequest<WarehouseRow[]>('GET', '/api/warehouses');
      return Array.isArray(data) ? data.filter((w) => w.isActive !== false) : [];
    },
  });

  const { data: storeSettings } = useQuery<any>({
    queryKey: ['store-settings'],
    queryFn: () => apiRequest('GET', '/api/store-settings').catch(() => null),
  });

  const { data: exchangeRates = [] } = useQuery<any[]>({
    queryKey: ['exchange-rates'],
    queryFn: async () => {
      const data = await apiRequest<any[]>('GET', '/api/exchange-rates').catch(() => []);
      return Array.isArray(data) ? data : [];
    },
  });

  const sequencesQuery = useQuery({
    queryKey: ['/api/fiscal/ncf-sequences'],
    queryFn: () => fiscalApi.ncfSequences(),
  });

  /** Secuencias con números disponibles, vigentes y de un tipo facturable. */
  const availableSequences = useMemo<NcfSequenceRow[]>(() => {
    const rows = (sequencesQuery.data?.sequences ?? []) as NcfSequenceRow[];
    const today = todayISO();
    return rows.filter(
      (s) =>
        s.is_active &&
        Number(s.remaining) > 0 &&
        NCF_LABELS[s.ncf_type] &&
        (!s.expiry_date || String(s.expiry_date).slice(0, 10) >= today),
    );
  }, [sequencesQuery.data]);

  // Selecciona la primera secuencia disponible en cuanto se conocen.
  useEffect(() => {
    if (!ncfType && availableSequences.length > 0) {
      setNcfType(availableSequences[0].ncf_type);
    }
  }, [availableSequences, ncfType]);

  const activeSequence = useMemo(
    () => availableSequences.find((s) => s.ncf_type === ncfType) ?? null,
    [availableSequences, ncfType],
  );

  useEffect(() => {
    setWarehouseId((prev) => prev ?? activeWarehouseId ?? warehouses.find((w) => w.isDefault)?.id ?? warehouses[0]?.id ?? null);
  }, [activeWarehouseId, warehouses]);

  /** Tasa de la moneda del documento contra DOP, para convertir precios base. */
  const rateFor = (from: string, to: string): number => {
    if (from === to) return 1;
    const direct = exchangeRates.find(
      (r: any) => r.baseCurrency === from && r.targetCurrency === to && r.isActive,
    );
    if (direct) return num(direct.rate);
    const inverse = exchangeRates.find(
      (r: any) => r.baseCurrency === to && r.targetCurrency === from && r.isActive,
    );
    if (inverse && num(inverse.rate) !== 0) return 1 / num(inverse.rate);
    return 1;
  };

  // Al cambiar de moneda, propone la tasa vigente (DOP por unidad extranjera).
  useEffect(() => {
    if (currency === 'DOP') setFxRate('1');
    else setFxRate(String(r2(rateFor(currency, 'DOP')) || 1));
  }, [currency, exchangeRates]);

  // ── totales (previsualización) ───────────────────────────────────────────
  const totals = useMemo(() => {
    const computed = lines.map((l) => ({ line: l, ...computeLine(l) }));
    const subtotalTaxed = r2(computed.filter((c) => !c.exempt).reduce((s, c) => s + c.lineTotal, 0));
    const subtotalExempt = r2(computed.filter((c) => c.exempt).reduce((s, c) => s + c.lineTotal, 0));
    const discountTotal = r2(computed.reduce((s, c) => s + c.discount, 0));
    const byCode = (code: TaxCode) =>
      r2(computed.filter((c) => c.line.taxCode === code).reduce((s, c) => s + c.itbis, 0));
    const itbis18 = byCode('ITBIS18');
    const itbis16 = byCode('ITBIS16');
    const itbisTotal = r2(itbis18 + itbis16);
    const tipLegal = applyLegalTip ? r2(subtotalTaxed * LEGAL_TIP_RATE) : 0;
    const total = r2(subtotalTaxed + subtotalExempt + itbisTotal + tipLegal);
    return { computed, subtotalTaxed, subtotalExempt, discountTotal, itbis18, itbis16, itbisTotal, tipLegal, total };
  }, [lines, applyLegalTip]);

  const dueDate = condition === 'credito' ? addDaysISO(date, Math.max(0, parseInt(creditDays) || 0)) : null;
  const effectivePaymentMethod: 'cash' | 'card' | 'transfer' | 'credit' =
    condition === 'credito' ? 'credit' : paymentMethod;

  // ── líneas ───────────────────────────────────────────────────────────────
  const addProductLine = (p: ProductRow) => {
    const base = p.baseCurrency || p.base_currency || 'DOP';
    const price = num(p.price) * rateFor(base, currency);
    setLines((prev) => [
      ...prev,
      newLine({
        productId: p.id,
        code: p.sku || String(p.id),
        description: p.name,
        unitPrice: String(r2(price)),
        taxCode: 'ITBIS18',
      }),
    ]);
  };

  const patchLine = (id: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));

  const selectCustomer = (c: CustomerRow | null) => {
    setCustomer(c);
    if (c) {
      setBuyerName(c.name || '');
      setBuyerAddress(c.address || '');
    }
  };

  const resetForm = () => {
    setLines([]);
    setCustomer(null);
    setBuyerName('');
    setBuyerRnc('');
    setBuyerAddress('');
    setCondition('contado');
    setPaymentMethod('cash');
    setCreditDays('30');
    setApplyLegalTip(false);
    setDate(todayISO());
  };

  // ── emisión ──────────────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!ncfType) return 'Selecciona el tipo de comprobante.';
    if (!activeSequence) return `No hay secuencia NCF disponible para ${ncfType}.`;
    if (lines.length === 0) return 'Agrega al menos una línea al detalle.';
    const invalid = lines.find((l) => !l.description.trim() || num(l.quantity) <= 0);
    if (invalid) return 'Cada línea necesita descripción y cantidad mayor que cero.';
    if (lines.some((l) => num(l.unitPrice) < 0)) return 'El precio unitario no puede ser negativo.';
    if (RNC_REQUIRED_TYPES.includes(ncfType) && !isValidTaxId(buyerRnc)) {
      return `El comprobante ${ncfType} exige RNC (9 dígitos) o cédula (11 dígitos) del cliente.`;
    }
    if (buyerRnc && !isValidTaxId(buyerRnc)) return 'El RNC/Cédula debe tener 9 u 11 dígitos.';
    if (condition === 'credito' && !customer) {
      return 'Una venta a crédito necesita un cliente registrado.';
    }
    if (currency !== 'DOP' && num(fxRate) <= 0) return 'Indica una tasa de cambio válida.';
    return null;
  };

  const issueMutation = useMutation({
    mutationFn: async (): Promise<IssuedInvoice> => {
      const productLines = lines.filter((l) => l.productId);
      let orderId: number | undefined;
      let orderNumber: string | undefined;

      // 1) Pedido operativo: mueve inventario y alimenta el historial de ventas.
      if (affectInventory && productLines.length > 0) {
        const orderRes = await apiRequest<any>('POST', '/api/orders', {
          customerId: customer?.id,
          status: condition === 'credito' ? 'pending' : 'completed',
          deliveryCost: 0,
          priority: 'normal',
          notes: `Facturación ERP — ${NCF_LABELS[ncfType] ?? ncfType}`,
          paymentMethod: effectivePaymentMethod,
          paymentStatus: condition === 'credito' ? 'credit' : 'paid',
          receivedAmount: condition === 'credito' ? 0 : totals.total,
          changeAmount: 0,
          totalAmount: totals.total,
          subtotalAmount: r2(totals.subtotalTaxed + totals.subtotalExempt),
          discountAmount: totals.discountTotal > 0 ? totals.discountTotal : undefined,
          orderType: 'sale',
          warehouseId: warehouseId ?? undefined,
          items: productLines.map((l) => {
            const c = computeLine(l);
            return {
              productId: l.productId,
              quantity: num(l.quantity),
              unitPrice: r2(num(l.unitPrice)),
              totalPrice: c.lineTotal,
            };
          }),
        });
        const createdOrder = orderRes?.order ?? orderRes;
        orderId = createdOrder?.id;
        orderNumber = createdOrder?.orderNumber;

        // Deuda operativa del cliente, igual que en el POS.
        if (condition === 'credito' && customer?.id) {
          await apiRequest('POST', '/api/credits/charge', {
            customerId: customer.id,
            amount: totals.total,
            orderId,
            description: `Venta a crédito - Factura ${NCF_LABELS[ncfType] ?? ncfType}`,
          });
        }
      }

      // 2) Comprobante fiscal: asigna NCF y contabiliza.
      const doc = await fiscalApi.issueInvoice({
        ncfType,
        date,
        customerId: customer?.id,
        buyerRnc: buyerRnc ? cleanTaxId(buyerRnc) : undefined,
        buyerName: buyerName.trim() || undefined,
        orderId,
        currency,
        fxRate: currency === 'DOP' ? undefined : String(num(fxRate)),
        paymentMethod: effectivePaymentMethod,
        applyLegalTip,
        dueDate: dueDate ?? undefined,
        bookCogs: true,
        warehouseId: warehouseId ?? undefined,
        lines: lines.map((l) => {
          const c = computeLine(l);
          return {
            description: l.description.trim(),
            quantity: String(num(l.quantity)),
            unitPrice: String(r2(num(l.unitPrice))),
            discount: c.discount > 0 ? String(c.discount) : undefined,
            taxCode: l.taxCode,
            productId: l.productId,
          };
        }),
      });

      return {
        documentId: doc.documentId,
        ncf: doc.ncf,
        total: doc.total,
        journalEntryId: doc.journalEntryId,
        orderNumber,
        snapshot: buildPrintPayload(),
      };
    },
    onSuccess: (result) => {
      setIssued({ ...result, snapshot: { ...result.snapshot, ncf: result.ncf, total: num(result.total) } });
      toast({ title: `Factura ${result.ncf} emitida`, description: `Total ${money(result.total, currency)}` });
      qc.invalidateQueries({ queryKey: ['/api/fiscal/documents'] });
      qc.invalidateQueries({ queryKey: ['/api/fiscal/ncf-sequences'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['credits-pending'] });
      resetForm();
    },
    onError: (e: any) => {
      toast({
        variant: 'destructive',
        title: 'No se pudo emitir la factura',
        description: e?.message || 'Error desconocido',
      });
    },
  });

  const handleIssue = () => {
    const error = validate();
    if (error) {
      toast({ variant: 'destructive', title: 'Revisa el comprobante', description: error });
      return;
    }
    issueMutation.mutate();
  };

  // ── impresión ────────────────────────────────────────────────────────────
  const buildPrintPayload = (): PrintPayload => ({
    ncf: '',
    ncfLabel: NCF_LABELS[ncfType] ?? ncfType,
    date,
    dueDate,
    condition,
    paymentMethod: effectivePaymentMethod,
    currency,
    issuerName: activeCompany?.legal_name || storeSettings?.storeName || 'Empresa',
    issuerTradeName: activeCompany?.trade_name || storeSettings?.storeName || null,
    issuerRnc: activeCompany?.rnc || '',
    issuerAddress: storeSettings?.storeAddress || null,
    issuerPhone: storeSettings?.storePhone || null,
    issuerEmail: storeSettings?.storeEmail || null,
    logoUrl: storeSettings?.logoUrl || null,
    buyerName: buyerName || customer?.name || 'Consumo final',
    buyerRnc: buyerRnc ? cleanTaxId(buyerRnc) : null,
    buyerAddress: buyerAddress || null,
    buyerPhone: customer?.phone || null,
    validUntil: activeSequence?.expiry_date ? String(activeSequence.expiry_date).slice(0, 10) : null,
    lines: lines.map((l) => {
      const c = computeLine(l);
      return {
        code: l.code,
        description: l.description,
        quantity: num(l.quantity),
        unitPrice: num(l.unitPrice),
        discount: c.discount,
        taxLabel: TAX_LABELS[l.taxCode],
        lineTotal: c.lineTotal,
      };
    }),
    subtotalTaxed: totals.subtotalTaxed,
    subtotalExempt: totals.subtotalExempt,
    discountTotal: totals.discountTotal,
    itbis18: totals.itbis18,
    itbis16: totals.itbis16,
    tipLegal: totals.tipLegal,
    total: totals.total,
    footer: storeSettings?.invoiceFooter || null,
  });

  const handlePrint = () => {
    const node = printRef.current;
    if (!node) return;
    const win = window.open('', '_blank', 'height=800,width=900');
    if (!win) return;
    win.document.write(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Factura ${issued?.ncf ?? ''}</title>` +
        `<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#fff;color:#000}` +
        `@page{size:A4;margin:12mm}</style></head><body>${node.innerHTML}</body></html>`,
    );
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  const handleDownloadPdf = async () => {
    const node = printRef.current;
    if (!node) return;
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      html2pdf()
        .set({
          margin: 8,
          filename: `factura-${issued?.ncf ?? 'comprobante'}.pdf`,
          image: { type: 'jpeg' as const, quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { format: 'a4' as const, orientation: 'portrait' as const },
        })
        .from(node)
        .save();
    } catch {
      toast({ variant: 'destructive', title: 'No se pudo generar el PDF' });
    }
  };

  const lineCount = lines.length;
  const sequenceError = sequencesQuery.isError ? (sequencesQuery.error as any)?.message : null;
  const noSequences = !sequencesQuery.isLoading && availableSequences.length === 0;

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Encabezado de la vista */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileText className="h-6 w-6 text-muted-foreground" />
            Facturación
          </h1>
          <p className="text-sm text-muted-foreground">
            Emisión formal de comprobantes fiscales con NCF, ITBIS y condición de pago.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeCompany && (
            <Badge variant="outline" className="hidden sm:inline-flex">
              {activeCompany.trade_name || activeCompany.legal_name} · RNC {activeCompany.rnc}
            </Badge>
          )}
          <Button variant="outline" onClick={resetForm} disabled={issueMutation.isPending}>
            Limpiar
          </Button>
          <Button onClick={handleIssue} disabled={issueMutation.isPending || noSequences} className="gap-2">
            {issueMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Emitir factura
          </Button>
        </div>
      </div>

      {noSequences && (
        <Card className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600" />
              <span>
                {sequenceError
                  ? `No se pudieron leer las secuencias de NCF: ${sequenceError}`
                  : 'No hay secuencias de NCF activas con números disponibles. Registra el rango autorizado por la DGII antes de facturar.'}
              </span>
            </div>
            {!sequenceError && (
              <Button size="sm" variant="outline" onClick={() => setShowSequenceDialog(true)} className="gap-1">
                <Settings2 className="h-3.5 w-3.5" /> Configurar secuencia
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── Documento ──────────────────────────────────────────────────── */}
        <div className="space-y-4 min-w-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Datos del comprobante</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Tipo de comprobante">
                <Select value={ncfType} onValueChange={setNcfType}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {availableSequences.map((s) => (
                      <SelectItem key={s.id} value={s.ncf_type}>
                        {NCF_LABELS[s.ncf_type] ?? s.ncf_type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Fecha de emisión">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>

              <Field label="Condición de pago">
                <Select value={condition} onValueChange={(v) => setCondition(v as 'contado' | 'credito')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contado">Contado</SelectItem>
                    <SelectItem value="credito">Crédito</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {condition === 'contado' ? (
                <Field label="Forma de pago">
                  <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Efectivo</SelectItem>
                      <SelectItem value="card">Tarjeta</SelectItem>
                      <SelectItem value="transfer">Transferencia</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              ) : (
                <Field label="Días de crédito" hint={dueDate ? `Vence el ${formatDateLong(dueDate)}` : undefined}>
                  <Input
                    type="number"
                    min={0}
                    value={creditDays}
                    onChange={(e) => setCreditDays(e.target.value)}
                  />
                </Field>
              )}

              <Field label="Moneda">
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DOP">DOP · Peso Dominicano</SelectItem>
                    <SelectItem value="USD">USD · Dólar</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Tasa de cambio" hint={currency === 'DOP' ? 'Moneda funcional' : 'DOP por unidad'}>
                <Input
                  value={fxRate}
                  onChange={(e) => setFxRate(e.target.value)}
                  disabled={currency === 'DOP'}
                  inputMode="decimal"
                />
              </Field>

              <Field label="Almacén">
                <Select
                  value={warehouseId ? String(warehouseId) : ''}
                  onValueChange={(v) => setWarehouseId(Number(v))}
                  disabled={!canViewAll && !!activeWarehouseId}
                >
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap gap-x-8 gap-y-3 pt-1">
                <ToggleField
                  id="legal-tip"
                  label="Propina legal 10%"
                  hint="Sobre el subtotal gravado, sin ITBIS"
                  checked={applyLegalTip}
                  onChange={setApplyLegalTip}
                />
                <ToggleField
                  id="affect-inventory"
                  label="Descontar inventario"
                  hint="Registra el pedido y mueve el stock"
                  checked={affectInventory}
                  onChange={setAffectInventory}
                />
              </div>
            </CardContent>
          </Card>

          {/* Cliente */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <UserRound className="h-4 w-4 text-muted-foreground" /> Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <CustomerPicker
                customers={customers}
                selected={customer}
                onSelect={selectCustomer}
                onClear={() => selectCustomer(null)}
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <Field
                  label="RNC / Cédula"
                  hint={RNC_REQUIRED_TYPES.includes(ncfType) ? 'Obligatorio para este comprobante' : 'Opcional'}
                >
                  <Input
                    value={buyerRnc}
                    onChange={(e) => setBuyerRnc(e.target.value)}
                    placeholder="000000000"
                    inputMode="numeric"
                    className={
                      buyerRnc && !isValidTaxId(buyerRnc) ? 'border-destructive focus-visible:ring-destructive' : ''
                    }
                  />
                </Field>
                <Field label="Razón social / Nombre">
                  <Input
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    placeholder="Consumo final"
                  />
                </Field>
                <Field label="Dirección">
                  <Input
                    value={buyerAddress}
                    onChange={(e) => setBuyerAddress(e.target.value)}
                    placeholder="Opcional"
                  />
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* Detalle */}
          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" /> Detalle
                {lineCount > 0 && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {lineCount} {lineCount === 1 ? 'línea' : 'líneas'}
                  </span>
                )}
              </CardTitle>
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setLines((p) => [...p, newLine()])}>
                <Plus className="h-3.5 w-3.5" /> Línea libre
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <ProductPicker products={products} currency={currency} onSelect={addProductLine} />

              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[840px]">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-2 font-medium w-8">#</th>
                      <th className="py-2 pr-2 font-medium w-28">Código</th>
                      <th className="py-2 pr-2 font-medium">Descripción</th>
                      <th className="py-2 pr-2 font-medium w-24 text-right">Cant.</th>
                      <th className="py-2 pr-2 font-medium w-32 text-right">Precio</th>
                      <th className="py-2 pr-2 font-medium w-20 text-right">Desc. %</th>
                      <th className="py-2 pr-2 font-medium w-32">ITBIS</th>
                      <th className="py-2 pr-2 font-medium w-32 text-right">Importe</th>
                      <th className="py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const c = computeLine(l);
                      return (
                        <tr key={l.id} className="border-b last:border-0 align-middle">
                          <td className="py-1.5 pr-2 text-muted-foreground tabular-nums">{i + 1}</td>
                          <td className="py-1.5 pr-2">
                            <Input
                              className="h-8 text-xs font-mono"
                              value={l.code}
                              onChange={(e) => patchLine(l.id, { code: e.target.value })}
                              placeholder="—"
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <Input
                              className="h-8"
                              value={l.description}
                              onChange={(e) => patchLine(l.id, { description: e.target.value })}
                              placeholder="Descripción del bien o servicio"
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <Input
                              className="h-8 text-right tabular-nums"
                              value={l.quantity}
                              onChange={(e) => patchLine(l.id, { quantity: e.target.value })}
                              inputMode="decimal"
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <Input
                              className="h-8 text-right tabular-nums"
                              value={l.unitPrice}
                              onChange={(e) => patchLine(l.id, { unitPrice: e.target.value })}
                              inputMode="decimal"
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <Input
                              className="h-8 text-right tabular-nums"
                              value={l.discountPct}
                              onChange={(e) => patchLine(l.id, { discountPct: e.target.value })}
                              inputMode="decimal"
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <Select
                              value={l.taxCode}
                              onValueChange={(v) => patchLine(l.id, { taxCode: v as TaxCode })}
                            >
                              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {(Object.keys(TAX_LABELS) as TaxCode[]).map((code) => (
                                  <SelectItem key={code} value={code}>{TAX_LABELS[code]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums font-medium">
                            {money(c.lineTotal, currency)}
                          </td>
                          <td className="py-1.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => removeLine(l.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {lineCount === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Busca un producto arriba o agrega una línea libre para servicios.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Totales ────────────────────────────────────────────────────── */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <TotalRow label="Subtotal gravado" value={money(totals.subtotalTaxed, currency)} />
              {totals.subtotalExempt > 0 && (
                <TotalRow label="Subtotal exento" value={money(totals.subtotalExempt, currency)} />
              )}
              {totals.discountTotal > 0 && (
                <TotalRow label="Descuentos" value={`- ${money(totals.discountTotal, currency)}`} />
              )}
              {totals.itbis18 > 0 && <TotalRow label="ITBIS 18%" value={money(totals.itbis18, currency)} />}
              {totals.itbis16 > 0 && <TotalRow label="ITBIS 16%" value={money(totals.itbis16, currency)} />}
              {totals.tipLegal > 0 && <TotalRow label="Propina legal 10%" value={money(totals.tipLegal, currency)} />}
              <div className="border-t pt-2 mt-2 flex items-baseline justify-between">
                <span className="font-medium">Total</span>
                <span className="text-xl font-semibold tabular-nums">{money(totals.total, currency)}</span>
              </div>
              {condition === 'credito' && dueDate && (
                <p className="text-xs text-muted-foreground pt-1">
                  Pago a crédito · vence {formatDateLong(dueDate)}
                </p>
              )}
              <Button
                className="w-full mt-3 gap-2"
                onClick={handleIssue}
                disabled={issueMutation.isPending || noSequences}
              >
                {issueMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Emitir factura
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Secuencia NCF</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setShowSequenceDialog(true)}>
                <Settings2 className="h-3.5 w-3.5" /> Nuevo rango
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {activeSequence ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Próximo</span>
                    <span className="font-mono">
                      {activeSequence.ncf_type}
                      {String(activeSequence.next_number).padStart(activeSequence.is_ecf ? 10 : 8, '0')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Disponibles</span>
                    <span
                      className={
                        Number(activeSequence.remaining) <= Number(activeSequence.alert_threshold)
                          ? 'font-medium text-amber-600'
                          : 'tabular-nums'
                      }
                    >
                      {Number(activeSequence.remaining).toLocaleString('es-DO')}
                    </span>
                  </div>
                  {activeSequence.expiry_date && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Vence</span>
                      <span>{formatDateLong(String(activeSequence.expiry_date).slice(0, 10))}</span>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">Sin secuencia activa para el tipo seleccionado.</p>
              )}
              {(sequencesQuery.data?.alerts ?? []).length > 0 && (
                <div className="rounded-md border border-amber-500/40 bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
                  {(sequencesQuery.data?.alerts ?? []).map((a: any, i: number) => (
                    <p key={i}>
                      {a.ncfType}: quedan {a.remaining} comprobantes.
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Documento imprimible fuera de pantalla */}
      <div className="fixed left-[-10000px] top-0" aria-hidden>
        <div ref={printRef}>{issued && <PrintableInvoice data={issued.snapshot} />}</div>
      </div>

      <IssuedDialog
        issued={issued}
        currency={currency}
        onClose={() => setIssued(null)}
        onPrint={handlePrint}
        onDownload={handleDownloadPdf}
      />

      <NcfSequenceDialog
        open={showSequenceDialog}
        onOpenChange={setShowSequenceDialog}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ['/api/fiscal/ncf-sequences'] });
          setShowSequenceDialog(false);
        }}
      />
    </div>
  );
}

// ─── piezas de UI ───────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ToggleField({
  id, label, hint, checked, onChange,
}: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <div>
        <Label htmlFor={id} className="text-sm">{label}</Label>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/** Autocompletado de clientes: escribe, elige con flechas o clic. */
function CustomerPicker({
  customers, selected, onSelect, onClear,
}: {
  customers: CustomerRow[];
  selected: CustomerRow | null;
  onSelect: (c: CustomerRow) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return customers
      .filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [customers, query]);

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
        <div className="text-sm">
          <p className="font-medium">{selected.name}</p>
          <p className="text-xs text-muted-foreground">
            {[selected.phone, selected.email].filter(Boolean).join(' · ') || 'Sin contacto registrado'}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClear}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pl-9"
        placeholder="Buscar cliente por nombre, teléfono o correo — vacío = consumo final"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (results.length === 0) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
          if (e.key === 'Enter') {
            e.preventDefault();
            onSelect(results[highlight]);
            setQuery('');
            setOpen(false);
          }
        }}
      />
      {open && results.length > 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover shadow-lg">
          {results.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent ${
                i === highlight ? 'bg-accent' : ''
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onSelect(c); setQuery(''); setOpen(false); }}
            >
              <span>{c.name}</span>
              <span className="text-xs text-muted-foreground">{c.phone}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Buscador de productos que agrega una línea al detalle. */
function ProductPicker({
  products, currency, onSelect,
}: { products: ProductRow[]; currency: string; onSelect: (p: ProductRow) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.barcode?.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [products, query]);

  const pick = (p: ProductRow) => {
    onSelect(p);
    setQuery('');
    setOpen(false);
    setHighlight(0);
  };

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pl-9"
        placeholder="Agregar producto por nombre, SKU o código de barras…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (results.length === 0) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, results.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
          if (e.key === 'Enter') { e.preventDefault(); pick(results[highlight]); }
        }}
      />
      {open && results.length > 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover shadow-lg">
          {results.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent ${
                i === highlight ? 'bg-accent' : ''
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
            >
              <span className="min-w-0 truncate">
                <span className="font-mono text-xs text-muted-foreground mr-2">{p.sku || p.id}</span>
                {p.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {money(num(p.price), p.baseCurrency || p.base_currency || currency)}
                {typeof p.stockQuantity === 'number' && ` · ${p.stockQuantity} u.`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function IssuedDialog({
  issued, currency, onClose, onPrint, onDownload,
}: {
  issued: IssuedInvoice | null;
  currency: string;
  onClose: () => void;
  onPrint: () => void;
  onDownload: () => void;
}) {
  return (
    <Dialog open={!!issued} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Factura emitida
          </DialogTitle>
          <DialogDescription>El comprobante quedó registrado y contabilizado.</DialogDescription>
        </DialogHeader>
        {issued && (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">NCF</span>
              <span className="font-mono font-medium">{issued.ncf}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold tabular-nums">{money(issued.total, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Asiento contable</span>
              <span className="tabular-nums">#{issued.journalEntryId}</span>
            </div>
            {issued.orderNumber && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pedido</span>
                <span className="font-mono text-xs">{issued.orderNumber}</span>
              </div>
            )}
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" className="gap-1" onClick={onPrint}>
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
            <Button variant="outline" className="gap-1" onClick={onDownload}>
              <Download className="h-4 w-4" /> PDF
            </Button>
          </div>
          <Button onClick={onClose}>Nueva factura</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Alta de un rango NCF autorizado por la DGII. */
function NcfSequenceDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [ncfType, setNcfType] = useState('B02');
  const [rangeFrom, setRangeFrom] = useState('1');
  const [rangeTo, setRangeTo] = useState('1000');
  const [expiryDate, setExpiryDate] = useState('');
  const [alertThreshold, setAlertThreshold] = useState('50');

  const create = useMutation({
    mutationFn: () =>
      apiRequest('POST', '/api/fiscal/ncf-sequences', {
        ncfType,
        isEcf: ncfType.startsWith('E'),
        rangeFrom: parseInt(rangeFrom) || 1,
        rangeTo: parseInt(rangeTo) || 1,
        expiryDate: expiryDate || undefined,
        alertThreshold: parseInt(alertThreshold) || 0,
      }),
    onSuccess: () => {
      toast({ title: 'Secuencia registrada', description: `Rango ${ncfType} disponible para facturar.` });
      onCreated();
    },
    onError: (e: any) =>
      toast({ variant: 'destructive', title: 'No se pudo registrar', description: e?.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Secuencia de NCF</DialogTitle>
          <DialogDescription>
            Registra el rango autorizado por la DGII. Los comprobantes se toman en orden.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo de comprobante">
            <Select value={ncfType} onValueChange={setNcfType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(NCF_LABELS).map(([code, label]) => (
                  <SelectItem key={code} value={code}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Vence" hint="Opcional">
            <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </Field>
          <Field label="Desde">
            <Input type="number" min={1} value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
          </Field>
          <Field label="Hasta">
            <Input type="number" min={1} value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
          </Field>
          <Field label="Alerta al quedar" hint="Comprobantes restantes">
            <Input
              type="number"
              min={0}
              value={alertThreshold}
              onChange={(e) => setAlertThreshold(e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? 'Guardando…' : 'Guardar rango'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── documento imprimible ───────────────────────────────────────────────────

interface PrintLine {
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxLabel: string;
  lineTotal: number;
}

interface PrintPayload {
  ncf: string;
  ncfLabel: string;
  date: string;
  dueDate: string | null;
  condition: 'contado' | 'credito';
  paymentMethod: string;
  currency: string;
  issuerName: string;
  issuerTradeName: string | null;
  issuerRnc: string;
  issuerAddress: string | null;
  issuerPhone: string | null;
  issuerEmail: string | null;
  logoUrl: string | null;
  buyerName: string;
  buyerRnc: string | null;
  buyerAddress: string | null;
  buyerPhone: string | null;
  validUntil: string | null;
  lines: PrintLine[];
  subtotalTaxed: number;
  subtotalExempt: number;
  discountTotal: number;
  itbis18: number;
  itbis16: number;
  tipLegal: number;
  total: number;
  footer: string | null;
}

/**
 * Se imprime abriendo una ventana nueva con este HTML, así que va con estilos
 * en línea: las clases de Tailwind no existen en ese documento.
 */
function PrintableInvoice({ data }: { data: PrintPayload }) {
  const cell: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #e5e7eb' };
  const th: React.CSSProperties = {
    padding: '6px 8px', borderBottom: '2px solid #111827', fontSize: '11px',
    textTransform: 'uppercase', letterSpacing: '0.04em',
  };
  const totalRow = (label: string, value: string, strong = false) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: '24px',
      padding: strong ? '8px 0 0' : '2px 0',
      borderTop: strong ? '2px solid #111827' : undefined,
      marginTop: strong ? '6px' : undefined,
      fontSize: strong ? '15px' : '12px',
      fontWeight: strong ? 700 : 400,
    }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );

  return (
    <div style={{
      width: '190mm', background: '#fff', color: '#111827', padding: '4mm',
      fontFamily: "'Helvetica Neue', Arial, sans-serif", fontSize: '12px',
    }}>
      {/* Emisor + identificación del comprobante */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '24px', marginBottom: '16px' }}>
        <div style={{ maxWidth: '60%' }}>
          {data.logoUrl && (
            <img src={data.logoUrl} alt="" style={{ height: '48px', objectFit: 'contain', marginBottom: '8px' }} />
          )}
          <div style={{ fontSize: '16px', fontWeight: 700 }}>{data.issuerTradeName || data.issuerName}</div>
          {data.issuerTradeName && data.issuerTradeName !== data.issuerName && (
            <div style={{ fontSize: '11px', color: '#4b5563' }}>{data.issuerName}</div>
          )}
          <div style={{ fontSize: '11px', color: '#4b5563' }}>RNC: {data.issuerRnc}</div>
          {data.issuerAddress && <div style={{ fontSize: '11px', color: '#4b5563' }}>{data.issuerAddress}</div>}
          {data.issuerPhone && <div style={{ fontSize: '11px', color: '#4b5563' }}>Tel: {data.issuerPhone}</div>}
          {data.issuerEmail && <div style={{ fontSize: '11px', color: '#4b5563' }}>{data.issuerEmail}</div>}
        </div>
        <div style={{ border: '1px solid #111827', padding: '10px 14px', minWidth: '62mm' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.06em' }}>FACTURA</div>
          <div style={{ fontSize: '10px', color: '#4b5563', marginBottom: '6px' }}>{data.ncfLabel}</div>
          <div style={{ fontSize: '10px', color: '#4b5563' }}>NCF</div>
          <div style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700 }}>{data.ncf}</div>
          <div style={{ marginTop: '6px', fontSize: '11px' }}>Fecha: {formatDateLong(data.date)}</div>
          {data.dueDate && <div style={{ fontSize: '11px' }}>Vence: {formatDateLong(data.dueDate)}</div>}
          {data.validUntil && (
            <div style={{ fontSize: '10px', color: '#4b5563' }}>NCF válido hasta {formatDateLong(data.validUntil)}</div>
          )}
        </div>
      </div>

      {/* Comprador */}
      <div style={{ border: '1px solid #e5e7eb', padding: '10px 12px', marginBottom: '14px' }}>
        <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#6b7280', marginBottom: '4px' }}>
          Facturar a
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <div style={{ fontWeight: 600 }}>{data.buyerName}</div>
            {data.buyerRnc && <div style={{ fontSize: '11px' }}>RNC/Cédula: {data.buyerRnc}</div>}
            {data.buyerAddress && <div style={{ fontSize: '11px', color: '#4b5563' }}>{data.buyerAddress}</div>}
            {data.buyerPhone && <div style={{ fontSize: '11px', color: '#4b5563' }}>Tel: {data.buyerPhone}</div>}
          </div>
          <div style={{ textAlign: 'right', fontSize: '11px' }}>
            <div>Condición: {data.condition === 'credito' ? 'Crédito' : 'Contado'}</div>
            <div>Forma de pago: {PAYMENT_LABELS[data.paymentMethod] ?? data.paymentMethod}</div>
            <div>Moneda: {data.currency}</div>
          </div>
        </div>
      </div>

      {/* Detalle */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left', width: '70px' }}>Código</th>
            <th style={{ ...th, textAlign: 'left' }}>Descripción</th>
            <th style={{ ...th, textAlign: 'right', width: '55px' }}>Cant.</th>
            <th style={{ ...th, textAlign: 'right', width: '80px' }}>Precio</th>
            <th style={{ ...th, textAlign: 'right', width: '70px' }}>Desc.</th>
            <th style={{ ...th, textAlign: 'left', width: '70px' }}>ITBIS</th>
            <th style={{ ...th, textAlign: 'right', width: '90px' }}>Importe</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l, i) => (
            <tr key={i}>
              <td style={{ ...cell, fontFamily: 'monospace', fontSize: '10px' }}>{l.code || '—'}</td>
              <td style={cell}>{l.description}</td>
              <td style={{ ...cell, textAlign: 'right' }}>{l.quantity}</td>
              <td style={{ ...cell, textAlign: 'right' }}>{money(l.unitPrice, data.currency)}</td>
              <td style={{ ...cell, textAlign: 'right' }}>
                {l.discount > 0 ? money(l.discount, data.currency) : '—'}
              </td>
              <td style={{ ...cell, fontSize: '10px' }}>{l.taxLabel}</td>
              <td style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>{money(l.lineTotal, data.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totales */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ minWidth: '75mm' }}>
          {totalRow('Subtotal gravado', money(data.subtotalTaxed, data.currency))}
          {data.subtotalExempt > 0 && totalRow('Subtotal exento', money(data.subtotalExempt, data.currency))}
          {data.discountTotal > 0 && totalRow('Descuentos', `- ${money(data.discountTotal, data.currency)}`)}
          {data.itbis18 > 0 && totalRow('ITBIS 18%', money(data.itbis18, data.currency))}
          {data.itbis16 > 0 && totalRow('ITBIS 16%', money(data.itbis16, data.currency))}
          {data.tipLegal > 0 && totalRow('Propina legal 10%', money(data.tipLegal, data.currency))}
          {totalRow('TOTAL', money(data.total, data.currency), true)}
        </div>
      </div>

      <div style={{ marginTop: '28px', display: 'flex', justifyContent: 'space-between', gap: '32px' }}>
        <div style={{ flex: 1, borderTop: '1px solid #9ca3af', paddingTop: '4px', fontSize: '10px', textAlign: 'center' }}>
          Entregado por
        </div>
        <div style={{ flex: 1, borderTop: '1px solid #9ca3af', paddingTop: '4px', fontSize: '10px', textAlign: 'center' }}>
          Recibido conforme
        </div>
      </div>

      {data.footer && (
        <p style={{ marginTop: '16px', fontSize: '10px', color: '#6b7280', textAlign: 'center' }}>{data.footer}</p>
      )}
    </div>
  );
}
