import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { ecfApi, type EcfRepresentation } from "@/lib/accounting-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Printer, FileText } from "lucide-react";

const money = (v: string | number | null) =>
  Number(v ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (v: string) => Number(v ?? 0).toLocaleString("es-DO", { maximumFractionDigits: 4 });
const day = (v: string | null) => (v ? new Date(v).toLocaleDateString("es-DO") : "—");

/**
 * La representación impresa de un e-CF.
 *
 * El documento legal es el XML firmado; esto es el papel que se le entrega al
 * cliente. DGII regula qué debe cargar: el eNCF, el código de seguridad, la
 * fecha y hora de la firma, y un QR que apunta a la consulta de DGII para que
 * cualquiera pueda verificarlo sin depender del vendedor.
 *
 * Lo que esta pantalla se niega a hacer: imprimir como comprobante algo que no
 * está firmado. Un borrador sale marcado, porque un papel que aparenta ser
 * fiscal y no verifica es peor que no tener papel.
 */
export function EcfRepresentationDialog({ documentId }: { documentId: number }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["/api/ecf/representation", documentId],
    queryFn: () => ecfApi.representation(documentId),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Representación impresa">
          <FileText className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="print:hidden">
          <DialogTitle className="flex items-center justify-between gap-3">
            Representación impresa
            <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1">
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
          </DialogTitle>
        </DialogHeader>
        {q.data ? <Representation r={q.data.representation} /> : <p className="py-8 text-muted-foreground">Cargando…</p>}
      </DialogContent>
    </Dialog>
  );
}

export function Representation({ r }: { r: EcfRepresentation }) {
  return (
    <div className="ecf-print bg-white text-black p-6 text-sm">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .ecf-print, .ecf-print * { visibility: visible; }
          .ecf-print { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>

      {/* Un documento que no está firmado, o que DGII rechazó, se marca. Un papel
          con apariencia fiscal que no verifica es peor que no tener papel. */}
      {!r.isFiscal && (
        <div className="mb-4 border-2 border-red-600 text-red-700 text-center font-bold py-2 tracking-wide">
          SIN VALOR FISCAL — DOCUMENTO NO FIRMADO O RECHAZADO
        </div>
      )}
      {r.isFiscal && r.environmentNotice && (
        <div className="mb-4 border-2 border-amber-500 text-amber-700 text-center font-bold py-2 tracking-wide text-xs">
          {r.environmentNotice}
        </div>
      )}

      <div className="flex justify-between gap-6 border-b pb-4">
        <div className="flex gap-3">
          {r.issuer.logoUrl && (
            <img src={r.issuer.logoUrl} alt="" className="h-16 w-16 object-contain" />
          )}
          <div>
            <p className="text-lg font-bold">{r.issuer.tradeName || r.issuer.name}</p>
            {r.issuer.tradeName && <p className="text-xs">{r.issuer.name}</p>}
            <p className="text-xs">RNC {r.issuer.rnc}</p>
            {r.issuer.address && <p className="text-xs">{r.issuer.address}</p>}
            <p className="text-xs">
              {[r.issuer.phone, r.issuer.email].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="font-bold uppercase text-xs tracking-wide">{r.ecfTypeName}</p>
          <p className="font-mono text-lg font-bold">{r.encf ?? "SIN NÚMERO"}</p>
          <p className="text-xs">Fecha: {day(r.emittedAt)}</p>
          {r.dueDate && <p className="text-xs">Vence: {day(r.dueDate)}</p>}
          {r.modifiesNcf && <p className="text-xs">Modifica: {r.modifiesNcf}</p>}
          {r.ecfStatus && (
            <Badge variant="outline" className="mt-1 print:hidden">{r.ecfStatus}</Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 py-4 border-b">
        <div>
          <p className="text-xs font-semibold uppercase text-gray-500">Comprador</p>
          <p className="font-medium">{r.buyer.name ?? "Consumidor final"}</p>
          {r.buyer.rnc && <p className="text-xs">RNC/Cédula {r.buyer.rnc}</p>}
        </div>
        <div className="text-right">
          {r.paymentMethodLabel && (
            <>
              <p className="text-xs font-semibold uppercase text-gray-500">Forma de pago</p>
              <p>{r.paymentMethodLabel}</p>
            </>
          )}
          {r.currency !== "DOP" && <p className="text-xs">Moneda: {r.currency}</p>}
        </div>
      </div>

      <table className="w-full text-xs my-4">
        <thead className="border-b">
          <tr className="text-left">
            <th className="py-1">#</th>
            <th>Descripción</th>
            <th className="text-right">Cant.</th>
            <th className="text-right">Precio</th>
            <th className="text-right">Desc.</th>
            <th className="text-right">ITBIS</th>
            <th className="text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {r.lines.map((l) => (
            <tr key={l.lineNo} className="border-b last:border-0">
              <td className="py-1">{l.lineNo}</td>
              <td>
                {l.description}
                {l.isExempt && <span className="ml-1 text-[10px] text-gray-500">(exento)</span>}
              </td>
              <td className="text-right">{qty(l.quantity)}</td>
              <td className="text-right">{money(l.unitPrice)}</td>
              <td className="text-right">{Number(l.discount) > 0 ? money(l.discount) : "—"}</td>
              <td className="text-right">{money(l.itbisAmount)}</td>
              <td className="text-right">{money(l.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-between gap-6 pt-2">
        {/* El QR es lo que permite verificar el comprobante contra DGII sin
            depender de quien lo emitió. Sin firma no hay QR que valga. */}
        <div className="text-xs space-y-1">
          {r.qrUrl && r.isFiscal ? (
            <>
              <QRCodeSVG value={r.qrUrl} size={120} level="M" />
              <p className="pt-1">Código de seguridad: <span className="font-mono">{r.securityCode}</span></p>
              <p>Firma: {r.signedAt ? new Date(r.signedAt).toLocaleString("es-DO") : "—"}</p>
              <p className="text-gray-500 max-w-[16rem]">
                Escanee para verificar este comprobante en la consulta de DGII.
              </p>
            </>
          ) : (
            <p className="text-gray-500 max-w-[16rem]">
              Este documento aún no ha sido firmado, por lo que no tiene código de seguridad ni
              código QR de verificación.
            </p>
          )}
        </div>

        <div className="w-64 text-sm space-y-1">
          <Line label="Subtotal gravado" value={r.totals.subtotalTaxed} />
          {Number(r.totals.subtotalExempt) > 0 && <Line label="Exento" value={r.totals.subtotalExempt} />}
          {Number(r.totals.itbis18) > 0 && <Line label="ITBIS 18%" value={r.totals.itbis18} />}
          {Number(r.totals.itbis16) > 0 && <Line label="ITBIS 16%" value={r.totals.itbis16} />}
          {Number(r.totals.isc) > 0 && <Line label="ISC" value={r.totals.isc} />}
          {Number(r.totals.tipLegal) > 0 && <Line label="Propina legal 10%" value={r.totals.tipLegal} />}
          {Number(r.totals.retentionItbis) > 0 && (
            <Line label="ITBIS retenido" value={`-${money(r.totals.retentionItbis)}`} raw />
          )}
          {Number(r.totals.retentionIsr) > 0 && (
            <Line label="ISR retenido" value={`-${money(r.totals.retentionIsr)}`} raw />
          )}
          <div className="flex justify-between border-t pt-1 font-bold text-base">
            <span>Total</span>
            <span>{r.currency} {money(r.totals.total)}</span>
          </div>
        </div>
      </div>

      {r.trackId && (
        <p className="pt-4 text-[10px] text-gray-400 font-mono">TrackId DGII: {r.trackId}</p>
      )}
    </div>
  );
}

function Line({ label, value, raw }: { label: string; value: string; raw?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{label}</span>
      <span>{raw ? value : money(value)}</span>
    </div>
  );
}
