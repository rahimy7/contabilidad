import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Undo2, Search, AlertTriangle, CheckCircle2, PackageCheck, Receipt, X, Loader2,
} from "lucide-react";
import { fiscalApi, returnsApi, type CreditableLine, type FiscalDocument } from "@/lib/accounting-api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const money = (v: string | number) =>
  Number(v ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (v: string) => Number(v ?? 0).toLocaleString("es-DO", { maximumFractionDigits: 4 });
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Devolución de mercancía.
 *
 * Una devolución no es "borrar la venta": la factura ya existe, tiene su NCF y
 * ya se declaró. Lo que corresponde es una **nota de crédito** que la revierte
 * en parte o del todo, con su propio comprobante, y que en el 607 aparece con
 * efecto negativo.
 *
 * Por eso esta pantalla empieza por la factura y no por el producto. Sin la
 * factura original no hay contra qué acreditar, y una nota de crédito suelta es
 * exactamente lo que DGII no acepta.
 *
 * El saldo acreditable lo calcula el servidor —lo vendido menos lo que otras
 * notas ya devolvieron— así que las cantidades máximas que se ven aquí son las
 * mismas que el servidor va a aceptar. No hay forma de capturar algo que
 * termine rechazado al enviar.
 */
export default function SalesReturnsPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Undo2 className="h-6 w-6" /> Devolución de mercancía
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Revierte una venta con una nota de crédito y, si corresponde, devuelve la mercancía al inventario.
        </p>
      </div>

      {selectedId === null ? (
        <InvoicePicker onPick={setSelectedId} />
      ) : (
        <ReturnForm invoiceId={selectedId} onBack={() => setSelectedId(null)} />
      )}
    </div>
  );
}

// ── elegir la factura ────────────────────────────────────────────────────────

function InvoicePicker({ onPick }: { onPick: (id: number) => void }) {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["/api/fiscal/documents", "invoice"],
    queryFn: () => fiscalApi.documents("invoice"),
  });

  const invoices = useMemo(() => {
    const all = (data?.documents ?? []).filter((d: FiscalDocument) => d.status === "issued");
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((d: FiscalDocument) =>
      `${d.ncf ?? ""} ${d.buyer_name ?? ""} ${d.buyer_rnc ?? ""}`.toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">1 · Elija la factura a devolver</CardTitle>
        <CardDescription>
          Sólo facturas emitidas. Una anulada no admite nota de crédito: ya no hay venta que revertir.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por NCF, cliente o RNC…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="py-2">NCF</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th className="text-right">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Cargando…</td></tr>
              )}
              {!isLoading && invoices.map((d: FiscalDocument) => (
                <tr key={d.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="py-2 font-mono">
                    {d.ncf ?? "—"}
                    {d.is_ecf && <Badge variant="outline" className="ml-1.5 text-[10px]">e-CF</Badge>}
                  </td>
                  <td>
                    {d.buyer_name ?? "Consumidor final"}
                    {d.buyer_rnc && <div className="text-xs text-muted-foreground">{d.buyer_rnc}</div>}
                  </td>
                  <td className="text-xs">
                    {d.emitted_at ? new Date(d.emitted_at).toLocaleDateString("es-DO") : "—"}
                  </td>
                  <td className="text-right font-medium tabular-nums">{money(d.total)}</td>
                  <td className="text-right">
                    <Button size="sm" variant="outline" onClick={() => onPick(d.id)}>
                      Devolver
                    </Button>
                  </td>
                </tr>
              ))}
              {!isLoading && invoices.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">
                  No hay facturas que coincidan.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── capturar la devolución ───────────────────────────────────────────────────

function ReturnForm({ invoiceId, onBack }: { invoiceId: number; onBack: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [returnQty, setReturnQty] = useState<Record<number, string>>({});
  const [ncfType, setNcfType] = useState("B04");
  const [date, setDate] = useState(today());
  const [restock, setRestock] = useState(true);
  const [reason, setReason] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["/api/fiscal/invoices", invoiceId, "creditable"],
    queryFn: () => returnsApi.creditable(invoiceId),
  });

  const issue = useMutation({
    mutationFn: () => {
      const lines = (data?.lines ?? [])
        .filter((l) => Number(returnQty[l.lineNo] ?? 0) > 0)
        .map((l) => ({
          description: l.description,
          quantity: returnQty[l.lineNo],
          unitPrice: l.unitPrice,
          taxCode: l.taxCode ?? "ITBIS18",
          productId: l.productId ?? undefined,
        }));
      return returnsApi.issueCreditNote({
        ncfType,
        date,
        modifiesDocId: invoiceId,
        lines,
        restockInventory: restock,
        // Una devolución sí devuelve los mismos productos: el servidor verifica
        // producto y precio contra la factura, no sólo el monto.
        matchInvoiceLines: true,
      });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["/api/fiscal/documents"] });
      qc.invalidateQueries({ queryKey: ["/api/fiscal/invoices", invoiceId, "creditable"] });
      toast({
        title: `Nota de crédito ${r.ncf} emitida`,
        description: `Se acreditaron RD$ ${money(r.total)}${restock ? " y la mercancía volvió al inventario." : "."}`,
      });
      setReturnQty({});
    },
    onError: (e: any) =>
      toast({ variant: "destructive", title: "No se pudo emitir la nota de crédito", description: e.message }),
  });

  const lines = data?.lines ?? [];

  // El total es una previsualización: el servidor recalcula con las tasas de la
  // empresa y es la única fuente autoritativa del monto que se guarda.
  const preview = useMemo(() => {
    let base = 0;
    let itbis = 0;
    for (const l of lines) {
      const q = Number(returnQty[l.lineNo] ?? 0);
      if (q <= 0) continue;
      const lineBase = q * Number(l.unitPrice);
      base += lineBase;
      if (l.taxCode && l.taxCode.toUpperCase().includes("18")) itbis += lineBase * 0.18;
    }
    return { base, itbis, total: base + itbis };
  }, [lines, returnQty]);

  const anySelected = Object.values(returnQty).some((v) => Number(v) > 0);
  const nothingLeft = lines.length > 0 && lines.every((l) => Number(l.remainingQty) <= 0);

  const setQty = (line: CreditableLine, value: string) => {
    // El tope es lo que queda por acreditar. Capturar de más aquí sólo produce
    // un rechazo del servidor tres clics después.
    const max = Number(line.remainingQty);
    const n = Number(value);
    const clamped = value === "" ? "" : String(Math.min(Math.max(n, 0), max));
    setReturnQty({ ...returnQty, [line.lineNo]: clamped });
  };

  if (isLoading) return <Card><CardContent className="py-10 text-center text-muted-foreground">Cargando factura…</CardContent></Card>;
  if (isError) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
          <p className="text-sm">{(error as Error)?.message}</p>
          <Button variant="outline" onClick={onBack}>Elegir otra factura</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4" /> Factura {data?.invoice.ncf}
            </CardTitle>
            <CardDescription>
              {data?.invoice.buyerName ?? "Consumidor final"} ·{" "}
              {data?.invoice.emittedAt ? new Date(data.invoice.emittedAt).toLocaleDateString("es-DO") : "—"} ·
              Total RD$ {money(data?.invoice.total ?? 0)}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
            <X className="h-4 w-4" /> Cambiar
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {nothingLeft && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
              Esta factura ya fue acreditada por completo. No queda nada por devolver.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="py-2">Descripción</th>
                  <th className="text-right">Facturado</th>
                  <th className="text-right">Ya devuelto</th>
                  <th className="text-right">Disponible</th>
                  <th className="text-right">Precio</th>
                  <th className="text-right w-32">A devolver</th>
                  <th className="text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const remaining = Number(l.remainingQty);
                  const q = Number(returnQty[l.lineNo] ?? 0);
                  return (
                    <tr key={l.lineNo} className={`border-b last:border-0 ${remaining <= 0 ? "opacity-50" : ""}`}>
                      <td className="py-2">{l.description}</td>
                      <td className="text-right tabular-nums">{qty(l.invoicedQty)}</td>
                      <td className="text-right tabular-nums text-muted-foreground">
                        {Number(l.creditedQty) > 0 ? qty(l.creditedQty) : "—"}
                      </td>
                      <td className="text-right tabular-nums font-medium">{qty(l.remainingQty)}</td>
                      <td className="text-right tabular-nums">{money(l.unitPrice)}</td>
                      <td className="text-right">
                        <Input
                          className="h-8 text-right tabular-nums"
                          inputMode="decimal"
                          disabled={remaining <= 0}
                          value={returnQty[l.lineNo] ?? ""}
                          placeholder="0"
                          onChange={(e) => setQty(l, e.target.value)}
                        />
                      </td>
                      <td className="text-right tabular-nums">
                        {q > 0 ? money(q * Number(l.unitPrice)) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              disabled={nothingLeft}
              onClick={() =>
                setReturnQty(
                  Object.fromEntries(
                    lines.filter((l) => Number(l.remainingQty) > 0).map((l) => [l.lineNo, l.remainingQty]),
                  ),
                )
              }
            >
              Devolver todo lo disponible
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">2 · Comprobante y destino de la mercancía</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-sm">Tipo de comprobante</Label>
              <Select value={ncfType} onValueChange={setNcfType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="B04">B04 — Nota de crédito</SelectItem>
                  <SelectItem value="E34">E34 — Nota de crédito electrónica</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                E34 si la factura original fue electrónica.
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-sm">Fecha</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div className="sm:col-span-2 flex items-start justify-between gap-3 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <PackageCheck className="h-4 w-4" /> Devolver la mercancía al inventario
                </p>
                <p className="text-xs text-muted-foreground">
                  Entra al costo con que salió, así la devolución neutraliza exactamente el costo de
                  venta de la factura. Apáguelo si la mercancía volvió dañada y no se puede revender.
                </p>
              </div>
              <Switch checked={restock} onCheckedChange={setRestock} />
            </div>

            <div className="sm:col-span-2 space-y-1">
              <Label className="text-sm">Motivo</Label>
              <Textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Producto defectuoso, entrega incorrecta, cliente desistió…"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resumen</CardTitle>
            <CardDescription className="text-xs">
              Previsualización: el servidor recalcula con las tasas de la empresa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Base" value={money(preview.base)} />
            <Row label="ITBIS" value={money(preview.itbis)} />
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>A acreditar</span>
              <span className="tabular-nums">RD$ {money(preview.total)}</span>
            </div>

            <Button
              className="mt-3 w-full gap-1.5"
              disabled={!anySelected || issue.isPending}
              onClick={() => issue.mutate()}
            >
              {issue.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Emitiendo…</>
                : <><CheckCircle2 className="h-4 w-4" /> Emitir nota de crédito</>}
            </Button>

            {!anySelected && !nothingLeft && (
              <p className="text-center text-xs text-muted-foreground">
                Indique cuánto se devuelve de al menos una línea.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
