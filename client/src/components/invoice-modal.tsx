import React, { useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Printer } from 'lucide-react';

interface InvoiceItem {
  productId?: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  loyaltyPointsValue?: number;
}

interface InvoiceData {
  orderNumber: string;
  date: string;
  time: string;
  paymentMethod: 'cash' | 'card' | 'transfer' | 'credit' | string;
  isCredit?: boolean;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  discountPercentage?: number;
  discountAmount?: number;
  total: number;
  receivedAmount: number;
  changeAmount: number;
  totalLoyaltyPoints?: number;
  loyaltyPointsPropertyName?: string;
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  storeEmail?: string;
  logoUrl?: string;
  invoiceFooter?: string;
  remainingBalance?: number; // Saldo restante tras un pago de deuda
  customerName?: string;
  customerPhone?: string;
}

interface InvoiceModalProps {
  isOpen: boolean;
  data: InvoiceData | null;
  onClose: () => void;
}

const getPaymentMethodLabel = (method: string): string => {
  const labels: Record<string, string> = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    transfer: 'Transferencia Bancaria',
    credit: 'Crédito'
  };
  return labels[method] || method;
};

const InvoiceContent = React.forwardRef<HTMLDivElement, { data: InvoiceData }>(
  ({ data }, ref) => {
    return (
      <div ref={ref} className="bg-white p-8 text-gray-900 font-sans" style={{ width: '210mm', minHeight: '297mm' }}>
        {/* Header */}
        <div className="text-center mb-8 border-b-2 border-gray-300 pb-4">
          {/* Logo */}
          {data.logoUrl && (
            <div className="flex justify-center mb-4">
              <img
                src={data.logoUrl}
                alt="Logo"
                className="h-16 object-contain"
              />
            </div>
          )}
          <h1 className={`text-3xl font-bold mb-2 ${data.isCredit ? 'text-orange-600' : 'text-emerald-600'}`}>
            {data.isCredit ? 'CONSTANCIA DE DEUDA' : 'FACTURA'}
          </h1>
          <p className="text-lg font-semibold">{data.storeName || 'TIENDA'}</p>
          {data.storeAddress && <p className="text-sm text-gray-600">{data.storeAddress}</p>}
          {data.storePhone && <p className="text-sm text-gray-600">Tel: {data.storePhone}</p>}
          {data.storeEmail && <p className="text-sm text-gray-600">Email: {data.storeEmail}</p>}
        </div>

        {/* Credit Note Banner */}
        {data.isCredit && (
          <div className="bg-orange-50 border-2 border-orange-400 rounded-lg p-4 mb-6 text-center">
            <p className="text-orange-700 font-bold text-base">⚠ VENTA A CRÉDITO — PENDIENTE DE PAGO</p>
            <p className="text-orange-600 text-sm mt-1">Este documento es una constancia de deuda. No ha sido cancelado.</p>
          </div>
        )}

        {/* Invoice Info */}
        <div className="flex justify-between mb-6 text-sm">
          <div>
            <p><span className="font-semibold">Número:</span> {data.orderNumber}</p>
            <p><span className="font-semibold">Fecha:</span> {data.date}</p>
            <p><span className="font-semibold">Hora:</span> {data.time}</p>
            {data.customerName && (
              <p><span className="font-semibold">Cliente:</span> {data.customerName}{data.customerPhone ? ` · ${data.customerPhone}` : ''}</p>
            )}
          </div>
          <div className="text-right">
            <p><span className="font-semibold">Método Pago:</span> {getPaymentMethodLabel(data.paymentMethod)}</p>
          </div>
        </div>

        {/* Items Table */}
        <div className="mb-6">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-400">
                <th className="text-left py-2 font-semibold">Producto</th>
                <th className="text-center py-2 font-semibold w-16">Cantidad</th>
                <th className="text-right py-2 font-semibold w-24">Precio Unit.</th>
                <th className="text-right py-2 font-semibold w-24">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, index) => (
                <tr key={index} className="border-b border-gray-200">
                  <td className="py-2">{item.productName}</td>
                  <td className="text-center py-2">{item.quantity}</td>
                  <td className="text-right py-2">RD${item.unitPrice.toFixed(2)}</td>
                  <td className="text-right py-2 font-semibold">RD${item.totalPrice.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end mb-6 w-full">
          <div className="w-64">
            <div className="flex justify-between py-2 border-b border-gray-200 text-sm">
              <span>Subtotal:</span>
              <span>RD${data.subtotal.toFixed(2)}</span>
            </div>
            {data.tax > 0 && (
              <div className="flex justify-between py-2 border-b border-gray-200 text-sm">
                <span>ITBIS (0%):</span>
                <span>RD${data.tax.toFixed(2)}</span>
              </div>
            )}
            {data.discountAmount && data.discountAmount > 0 && (
              <div className="flex justify-between py-2 border-b border-gray-200 text-sm text-orange-600">
                <span>Descuento ({data.discountPercentage || 0}%):</span>
                <span>-RD${data.discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className={`flex justify-between py-3 border-b-2 border-gray-400 font-bold text-lg ${data.isCredit ? 'text-orange-600' : ''}`}>
              <span>{data.isCredit ? 'TOTAL PENDIENTE DE PAGO:' : 'TOTAL:'}</span>
              <span className={data.isCredit ? 'text-orange-600' : 'text-emerald-600'}>RD${data.total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Loyalty Points */}
        {data.totalLoyaltyPoints && data.totalLoyaltyPoints > 0 && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4 mb-6 text-center">
            <p className="text-sm font-semibold text-amber-700">Puntos Acumulados</p>
            <p className="text-2xl font-bold text-amber-600">
              {data.totalLoyaltyPoints.toFixed(2)} {data.loyaltyPointsPropertyName || 'LP'}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-gray-600 pt-4 border-t border-gray-300">
          {data.isCredit ? (
            <>
              <p className="text-orange-600 font-semibold">Este documento NO es un recibo de pago</p>
              <p className="mt-1">El saldo quedará pendiente hasta su cancelación</p>
            </>
          ) : (
            <p>Gracias por su compra</p>
          )}
          {data.invoiceFooter && (
            <p className="mt-2 text-gray-700 font-medium">{data.invoiceFooter}</p>
          )}
          <p className="mt-2">{data.isCredit ? 'Constancia de deuda emitida' : 'Esta es su comprobante de venta'}</p>
          <p className="mt-4 text-gray-400">Impreso: {new Date().toLocaleString('es-DO')}</p>
        </div>
      </div>
    );
  }
);

InvoiceContent.displayName = 'InvoiceContent';

// ============================================================
// THERMAL RECEIPT (80mm) — used for printing
// ============================================================
const ThermalContent = React.forwardRef<HTMLDivElement, { data: InvoiceData }>(
  ({ data }, ref) => {
    const isDebtPayment = data.remainingBalance !== undefined;
    const title = isDebtPayment
      ? 'RECIBO DE PAGO'
      : data.isCredit
      ? 'CONSTANCIA DE DEUDA'
      : 'FACTURA';

    const row = (label: string, value: string, bold = false): React.ReactNode => (
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '2px', fontWeight: bold ? 'bold' : 'normal' }}>
        <span>{label}</span>
        <span>{value}</span>
      </div>
    );

    const dashes = <div style={{ borderTop: '1px dashed #000', margin: '5px 0' }} />;
    const solid  = <div style={{ borderTop: '2px solid #000', margin: '5px 0' }} />;

    const fmt = (n: number) => `RD$${n.toFixed(2)}`;
    const prevBalance = data.total + (data.remainingBalance ?? 0);

    return (
      <div ref={ref} style={{
        width: '76mm',
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: '12px',
        lineHeight: '1.45',
        color: '#000',
        backgroundColor: '#fff',
        padding: '4mm 3mm',
      }}>

        {/* Store header */}
        <div style={{ textAlign: 'center', marginBottom: '6px' }}>
          {data.logoUrl && (
            <img src={data.logoUrl} alt="" style={{ height: '38px', objectFit: 'contain', display: 'block', margin: '0 auto 4px' }} />
          )}
          <div style={{ fontWeight: 'bold', fontSize: '14px', textTransform: 'uppercase' }}>{data.storeName || 'TIENDA'}</div>
          {data.storeAddress && <div style={{ fontSize: '10px' }}>{data.storeAddress}</div>}
          {data.storePhone  && <div style={{ fontSize: '10px' }}>Tel: {data.storePhone}</div>}
          {data.storeEmail  && <div style={{ fontSize: '10px' }}>{data.storeEmail}</div>}
        </div>

        {dashes}

        <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13px', letterSpacing: '1px' }}>
          {title}
        </div>

        {dashes}

        {/* Order info */}
        <div style={{ fontSize: '11px', marginBottom: '4px' }}>
          {row('No:', data.orderNumber)}
          {row('Fecha:', data.date)}
          {row('Hora:', data.time)}
          {row('Metodo:', getPaymentMethodLabel(data.paymentMethod))}
          {data.customerName && row('Cliente:', data.customerName)}
          {data.customerPhone && row('Tel:', data.customerPhone)}
        </div>

        {dashes}

        {/* Items */}
        <div style={{ fontSize: '11px', marginBottom: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', borderBottom: '1px solid #000', paddingBottom: '3px', marginBottom: '5px' }}>
            <span>DESCRIPCION</span>
            <span>TOTAL</span>
          </div>
          {data.items.map((item, i) => (
            <div key={i} style={{ marginBottom: '5px' }}>
              <div style={{ fontWeight: 'bold', wordBreak: 'break-word' }}>{item.productName}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{item.quantity} x {fmt(item.unitPrice)}</span>
                <span style={{ fontWeight: 'bold' }}>{fmt(item.totalPrice)}</span>
              </div>
            </div>
          ))}
        </div>

        {solid}

        {/* Subtotals */}
        {(!isDebtPayment && data.subtotal !== data.total) && row('Subtotal:', fmt(data.subtotal))}
        {data.tax > 0 && row('ITBIS:', fmt(data.tax))}
        {!!data.discountAmount && data.discountAmount > 0 &&
          row(`Descuento (${data.discountPercentage}%):`, `-${fmt(data.discountAmount)}`)}

        {/* Main total */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '15px', margin: '4px 0 6px' }}>
          <span>{isDebtPayment ? 'PAGO RECIBIDO:' : data.isCredit ? 'DEUDA TOTAL:' : 'TOTAL:'}</span>
          <span>{fmt(data.total)}</span>
        </div>

        {/* Cash change */}
        {data.paymentMethod === 'cash' && !isDebtPayment && data.receivedAmount > 0 && (
          <>
            {dashes}
            {row('Efectivo:', fmt(data.receivedAmount))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 'bold', marginBottom: '2px' }}>
              <span>Cambio:</span><span>{fmt(data.changeAmount)}</span>
            </div>
          </>
        )}

        {/* Debt payment: balance breakdown */}
        {isDebtPayment && (
          <>
            {dashes}
            {row('Saldo anterior:', fmt(prevBalance))}
            {row('Pago aplicado:', `-${fmt(data.total)}`)}
            {solid}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '15px', marginBottom: '4px' }}>
              <span>SALDO RESTANTE:</span>
              <span>{fmt(data.remainingBalance ?? 0)}</span>
            </div>
            {(data.remainingBalance ?? 0) <= 0 && (
              <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '12px', border: '2px solid #000', padding: '4px', marginTop: '4px', letterSpacing: '1px' }}>
                *** DEUDA SALDADA COMPLETAMENTE ***
              </div>
            )}
          </>
        )}

        {/* Loyalty points */}
        {!!data.totalLoyaltyPoints && data.totalLoyaltyPoints > 0 && (
          <>
            {dashes}
            <div style={{ textAlign: 'center', fontSize: '11px' }}>
              <div>Puntos acumulados:</div>
              <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                {data.totalLoyaltyPoints.toFixed(2)} {data.loyaltyPointsPropertyName || 'LP'}
              </div>
            </div>
          </>
        )}

        {dashes}

        {/* Footer */}
        <div style={{ textAlign: 'center', fontSize: '10px' }}>
          {data.isCredit && !isDebtPayment && (
            <div style={{ fontWeight: 'bold', marginBottom: '4px', fontSize: '11px' }}>** PENDIENTE DE PAGO **</div>
          )}
          <div style={{ marginBottom: '2px' }}>
            {isDebtPayment ? 'Gracias por su pago' : 'Gracias por su compra'}
          </div>
          {data.invoiceFooter && <div style={{ marginBottom: '2px' }}>{data.invoiceFooter}</div>}
          <div>{new Date().toLocaleString('es-DO')}</div>
        </div>

        <div style={{ marginTop: '20px' }} />
      </div>
    );
  }
);

ThermalContent.displayName = 'ThermalContent';

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ isOpen, data, onClose }) => {
  const invoiceRef = useRef<HTMLDivElement>(null);
  const thermalRef  = useRef<HTMLDivElement>(null);

  // Thermal print (80mm roll paper)
  const handlePrint = () => {
    if (!thermalRef.current) return;

    const printWindow = window.open('', '_blank', 'height=600,width=400');
    if (!printWindow) return;

    printWindow.document.write('<!DOCTYPE html><html><head>');
    printWindow.document.write('<meta charset="UTF-8">');
    printWindow.document.write('<title>Recibo</title>');
    printWindow.document.write('<style>');
    printWindow.document.write(`
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: 'Courier New', Courier, monospace;
        color: #000;
        background: #fff;
        width: 80mm;
      }
      img { max-width: 100%; }
      @page {
        size: 80mm auto;
        margin: 0;
      }
      @media print {
        html, body { width: 80mm; margin: 0; padding: 0; }
      }
    `);
    printWindow.document.write('</style></head><body>');
    printWindow.document.write(thermalRef.current.innerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();

    setTimeout(() => { printWindow.print(); }, 300);
  };

  const handleDownloadPDF = async () => {
    if (!invoiceRef.current) return;

    try {
      // Dinámicamente importar html2pdf
      const html2pdf = (await import('html2pdf.js')).default;

      const element = invoiceRef.current;
      const opt = {
        margin: 0,
        filename: `factura-${data?.orderNumber || 'venta'}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { format: 'a4' as const, orientation: 'portrait' as const }
      };

      html2pdf().set(opt).from(element).save();
    } catch (error) {
      console.error('Error al descargar PDF:', error);
      alert('Error al descargar el PDF. Por favor intente nuevamente.');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[95vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>
            Factura - {data?.orderNumber}
          </DialogTitle>
          <DialogDescription>
            Comprobante de venta - {data?.date} {data?.time}
          </DialogDescription>
        </DialogHeader>

        {/* Hidden thermal content rendered off-screen for print */}
        <div style={{ position: 'absolute', left: '-9999px', top: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          {data && <ThermalContent ref={thermalRef} data={data} />}
        </div>

        {/* Invoice Preview - Scrollable (A4 layout) */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="bg-gray-50 rounded-lg border">
            {data && <InvoiceContent ref={invoiceRef} data={data} />}
          </div>
        </div>

        {/* Actions - Fixed at bottom */}
        <div className="flex gap-3 justify-end pt-4 px-6 pb-6 border-t flex-shrink-0 bg-white">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button
            variant="outline"
            onClick={handlePrint}
            className="flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Imprimir Térmica
          </Button>
          <Button
            onClick={handleDownloadPDF}
            className="bg-emerald-600 hover:bg-emerald-700 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            PDF A4
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InvoiceModal;
