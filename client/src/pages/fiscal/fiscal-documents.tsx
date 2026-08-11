import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ecfApi, fiscalApi, FiscalDocument, IssueInvoiceLine } from "@/lib/accounting-api";
import { EcfRepresentationDialog } from "./ecf-representation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Send } from "lucide-react";

const STATUS_VARIANT: Record<string, "secondary" | "destructive" | "outline"> = {
  issued: "secondary",
  cancelled: "destructive",
  draft: "outline",
};
const ECF_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  firmado: "Firmado",
  enviado: "Enviado",
  aceptado: "Aceptado",
  rechazado: "Rechazado",
  en_contingencia: "Contingencia",
  anulado: "Anulado",
};

const money = (v: string) =>
  Number(v).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FiscalDocumentsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/fiscal/documents"],
    queryFn: () => fiscalApi.documents(),
  });

  const transmit = useMutation({
    mutationFn: (id: number) => ecfApi.transmit(id),
    onSuccess: (res) => {
      toast({
        title: `e-CF ${res.ecfStatus}`,
        description: res.trackId ? `TrackId ${res.trackId}` : undefined,
      });
      qc.invalidateQueries({ queryKey: ["/api/fiscal/documents"] });
    },
    onError: (e: any) =>
      toast({
        variant: "destructive",
        title: "No se pudo transmitir",
        // Un rechazo de validación trae los motivos; mostrarlos evita que el
        // operador tenga que adivinar qué corregir.
        // `apiRequest` cuelga el cuerpo del error en `data`; los motivos de
        // rechazo de DGII vienen ahí.
        description: e.data?.messages?.length
          ? e.data.messages.map((m: any) => m.message).join(" · ")
          : e.message,
      }),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Comprobantes Fiscales</h1>
          <p className="text-sm text-muted-foreground">Facturas y comprobantes con NCF</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> Emitir factura
            </Button>
          </DialogTrigger>
          <IssueInvoiceDialog onDone={() => setOpen(false)} />
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documentos emitidos</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-muted-foreground">Cargando…</p>}
          {!isLoading && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">NCF</th>
                    <th className="py-2 pr-4 font-medium">Cliente</th>
                    <th className="py-2 pr-4 text-right font-medium">Total</th>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                    <th className="py-2 pr-4 font-medium">e-CF</th>
                    <th className="py-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.documents ?? []).map((d: FiscalDocument) => (
                    <tr key={d.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-1.5 pr-4 font-mono text-xs">{d.ncf}</td>
                      <td className="py-1.5 pr-4">{d.buyer_name ?? d.buyer_rnc ?? "Consumo final"}</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums">{money(d.total)}</td>
                      <td className="py-1.5 pr-4">
                        <Badge variant={STATUS_VARIANT[d.status] ?? "outline"}>{d.status}</Badge>
                      </td>
                      <td className="py-1.5 pr-4">
                        {d.is_ecf && d.ecf_status ? ECF_LABEL[d.ecf_status] ?? d.ecf_status : "—"}
                      </td>
                      <td className="py-1.5 pr-4">
                        <div className="flex items-center gap-1">
                          {d.is_ecf && <EcfRepresentationDialog documentId={d.id} />}
                          {d.is_ecf && d.status === "issued" && d.ecf_status !== "aceptado" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1"
                              disabled={transmit.isPending}
                              onClick={() => transmit.mutate(d.id)}
                            >
                              <Send className="h-3.5 w-3.5" /> Transmitir
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(data?.documents ?? []).length === 0 && (
                <p className="py-6 text-center text-muted-foreground">Aún no hay comprobantes.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function IssueInvoiceDialog({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const [ncfType, setNcfType] = useState("B01");
  const [date, setDate] = useState(today);
  const [buyerRnc, setBuyerRnc] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [lines, setLines] = useState<IssueInvoiceLine[]>([
    { description: "", quantity: "1", unitPrice: "0", taxCode: "ITBIS18" },
  ]);

  const setLine = (i: number, patch: Partial<IssueInvoiceLine>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const issue = useMutation({
    mutationFn: () =>
      fiscalApi.issueInvoice({
        ncfType,
        date,
        buyerRnc: buyerRnc || undefined,
        buyerName: buyerName || undefined,
        lines,
      }),
    onSuccess: (res) => {
      toast({ title: "Factura emitida", description: `NCF ${res.ncf} — total ${money(res.total)}` });
      qc.invalidateQueries({ queryKey: ["/api/fiscal/documents"] });
      onDone();
    },
    onError: (e: any) => toast({ variant: "destructive", title: "No se pudo emitir", description: e.message }),
  });

  const subtotal = lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Emitir factura</DialogTitle>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Tipo NCF
          <Input value={ncfType} onChange={(e) => setNcfType(e.target.value.toUpperCase())} maxLength={3} />
        </label>
        <label className="text-sm">
          Fecha
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="text-sm">
          RNC/Cédula cliente
          <Input value={buyerRnc} onChange={(e) => setBuyerRnc(e.target.value)} placeholder="opcional" />
        </label>
        <label className="text-sm">
          Nombre cliente
          <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="opcional" />
        </label>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Líneas</div>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <Input
              className="col-span-5"
              placeholder="Descripción"
              value={l.description}
              onChange={(e) => setLine(i, { description: e.target.value })}
            />
            <Input
              className="col-span-2"
              placeholder="Cant."
              value={l.quantity}
              onChange={(e) => setLine(i, { quantity: e.target.value })}
            />
            <Input
              className="col-span-2"
              placeholder="Precio"
              value={l.unitPrice}
              onChange={(e) => setLine(i, { unitPrice: e.target.value })}
            />
            <select
              className="col-span-2 h-9 rounded-md border bg-background px-2 text-sm"
              value={l.taxCode}
              onChange={(e) => setLine(i, { taxCode: e.target.value })}
            >
              <option value="ITBIS18">18%</option>
              <option value="ITBIS0">0%</option>
              <option value="EXENTO">Exento</option>
            </select>
            <Button
              variant="ghost"
              size="icon"
              className="col-span-1"
              onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
              disabled={lines.length === 1}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() =>
            setLines((ls) => [...ls, { description: "", quantity: "1", unitPrice: "0", taxCode: "ITBIS18" }])
          }
        >
          <Plus className="h-3.5 w-3.5" /> Agregar línea
        </Button>
      </div>

      <DialogFooter className="items-center justify-between sm:justify-between">
        <span className="text-sm text-muted-foreground">
          Subtotal: {money(String(subtotal))} + ITBIS
        </span>
        <Button onClick={() => issue.mutate()} disabled={issue.isPending}>
          {issue.isPending ? "Emitiendo…" : "Emitir"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
