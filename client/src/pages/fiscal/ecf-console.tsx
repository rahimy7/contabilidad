import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ecfApi, type EcfQueueRow, type EcfReceivedRow, type EcfReadiness } from "@/lib/accounting-api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  FileCheck2, Send, RefreshCw, Inbox, Settings2, ShieldCheck, AlertTriangle,
  Clock, CheckCircle2, XCircle, FileX2, Play, Download, Ban, FileStack,
} from "lucide-react";
import { EcfRepresentationDialog } from "./ecf-representation";

const money = (v: string | number | null) =>
  Number(v ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (v: string | null) => (v ? new Date(v).toLocaleString("es-DO") : "—");
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`;

/**
 * Consola de facturación electrónica.
 *
 * Un e-CF no termina cuando se emite: hay que firmarlo, mandarlo, esperar el
 * veredicto de DGII, reintentar si hubo contingencia, y responder los que nos
 * mandan los proveedores. Esta pantalla es el lugar donde se ve todo eso a la
 * vez, porque el estado que importa —qué está trabado y desde cuándo— no se lee
 * en la lista de facturas.
 */
const ECF_STATUS: Record<string, { label: string; variant: any; icon: any }> = {
  pendiente: { label: "Pendiente", variant: "outline", icon: Clock },
  firmado: { label: "Firmado", variant: "secondary", icon: ShieldCheck },
  enviado: { label: "En proceso", variant: "secondary", icon: RefreshCw },
  aceptado: { label: "Aceptado", variant: "default", icon: CheckCircle2 },
  aceptado_condicional: { label: "Aceptado condicional", variant: "default", icon: AlertTriangle },
  rechazado: { label: "Rechazado", variant: "destructive", icon: XCircle },
  en_contingencia: { label: "En contingencia", variant: "outline", icon: AlertTriangle },
  anulado: { label: "Anulado", variant: "destructive", icon: Ban },
  sin_estado: { label: "Sin transmitir", variant: "outline", icon: Clock },
};

const ENV_LABEL: Record<string, string> = {
  simulated: "Simulado",
  test: "Pruebas (TesteCF)",
  cert: "Certificación (CerteCF)",
  prod: "Producción",
};

export default function EcfConsolePage() {
  const dash = useQuery({ queryKey: ["/api/ecf/dashboard"], queryFn: () => ecfApi.dashboard() });
  const d = dash.data;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileCheck2 className="h-6 w-6" /> Facturación electrónica (e-CF)
          </h1>
          <p className="text-sm text-muted-foreground">
            Firma, transmisión a DGII, contingencia y comprobantes recibidos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {d && (
            <Badge variant={d.settings.environment === "prod" ? "default" : "outline"} className="gap-1">
              {ENV_LABEL[d.settings.environment] ?? d.settings.environment}
            </Badge>
          )}
          {d && !d.settings.isEnabled && <Badge variant="outline">desactivado</Badge>}
        </div>
      </div>

      {d && d.settings.environment !== "prod" && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm">
          <span className="font-medium">Ambiente {ENV_LABEL[d.settings.environment]}.</span>{" "}
          Los comprobantes emitidos aquí no tienen validez fiscal. La representación impresa lo dice
          en su cara para que nadie la confunda con una factura real.
        </div>
      )}

      <Tabs defaultValue="panel">
        <TabsList>
          <TabsTrigger value="panel">Panel</TabsTrigger>
          <TabsTrigger value="queue">Cola de transmisión</TabsTrigger>
          <TabsTrigger value="inbox">
            Recibidos
            {d && d.inbox.pending > 0 && (
              <Badge variant="secondary" className="ml-1">{d.inbox.pending}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="rfce">Resumen consumo</TabsTrigger>
          <TabsTrigger value="config">Configuración</TabsTrigger>
        </TabsList>

        <TabsContent value="panel"><Panel /></TabsContent>
        <TabsContent value="queue"><QueueTab /></TabsContent>
        <TabsContent value="inbox"><InboxTab /></TabsContent>
        <TabsContent value="rfce"><RfceTab /></TabsContent>
        <TabsContent value="config"><ConfigTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ── panel ────────────────────────────────────────────────────────────────────

function Panel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const dash = useQuery({ queryKey: ["/api/ecf/dashboard"], queryFn: () => ecfApi.dashboard() });
  const d = dash.data;

  const process = useMutation({
    mutationFn: () => ecfApi.processQueue(50),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["/api/ecf/dashboard"] });
      qc.invalidateQueries({ queryKey: ["/api/ecf/queue"] });
      toast({
        title: "Cola procesada",
        description: `${r.checked} revisados · ${r.resolved} resueltos · ${r.stillPending} aún en proceso`,
      });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  if (!d) return <p className="py-8 text-muted-foreground">Cargando…</p>;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        {d.byStatus.map((s) => {
          const meta = ECF_STATUS[s.status] ?? { label: s.status, variant: "outline", icon: Clock };
          const Icon = meta.icon;
          return (
            <Card key={s.status}>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Icon className="h-3.5 w-3.5" /> {meta.label}
                </p>
                <p className="text-2xl font-semibold">{s.n}</p>
                <p className="text-xs text-muted-foreground">RD$ {money(s.total)}</p>
              </CardContent>
            </Card>
          );
        })}
        {d.byStatus.length === 0 && (
          <Card className="md:col-span-4">
            <CardContent className="py-8 text-center text-muted-foreground">
              Todavía no se ha emitido ningún e-CF.
            </CardContent>
          </Card>
        )}
      </div>

      {d.sequenceAlerts.length > 0 && (
        <Card className="border-amber-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Secuencias por agotarse
            </CardTitle>
            <CardDescription>
              Quedarse sin eNCF a mitad de una venta detiene la facturación. Solicite el rango nuevo
              antes de llegar a cero.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4 text-sm">
            {d.sequenceAlerts.map((s, i) => (
              <div key={i} className="rounded-md border px-3 py-2">
                <p className="font-medium">{s.ncf_type}</p>
                <p className="text-muted-foreground">
                  {s.remaining} restantes
                  {s.expiry_date ? ` · vence ${s.expiry_date}` : ""}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Cola de transmisión</CardTitle>
            <CardDescription>
              La cola corre sola cada dos minutos. Este botón la adelanta.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => process.mutate()} disabled={process.isPending} className="gap-1">
            <Play className="h-4 w-4" /> Procesar ahora
          </Button>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 text-sm">
          {d.queue.length === 0 && <p className="text-muted-foreground">Nada pendiente.</p>}
          {d.queue.map((q) => (
            <div key={q.state} className="rounded-md border px-3 py-2">
              <p className="font-medium capitalize">{QUEUE_STATE[q.state] ?? q.state}</p>
              <p className="text-muted-foreground">{q.n} documento(s)</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {d.stuck.length > 0 && (
        <Card className="border-red-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileX2 className="h-4 w-4 text-red-600" /> Requieren intervención
            </CardTitle>
            <CardDescription>
              Documentos que la cola ya no va a rescatar sola: o DGII los rechazó, o se agotaron los
              reintentos. Son los únicos que necesitan una persona.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr><th className="py-2">eNCF</th><th>Tipo</th><th className="text-right">Monto</th>
                  <th>Estado</th><th className="text-right">Intentos</th><th>Último error</th><th /></tr>
              </thead>
              <tbody>
                {d.stuck.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-2 font-mono">{s.ncf ?? "—"}</td>
                    <td>{s.ncf_type}</td>
                    <td className="text-right">{money(s.total)}</td>
                    <td><StatusBadge status={s.ecf_status} /></td>
                    <td className="text-right">{s.attempts}</td>
                    <td className="max-w-md truncate text-xs text-muted-foreground" title={s.last_error ?? ""}>
                      {s.last_error ?? "—"}
                    </td>
                    <td className="text-right"><DocumentActions documentId={s.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const QUEUE_STATE: Record<string, string> = {
  queued: "En espera", sending: "Enviando", sent: "Esperando veredicto",
  resolved: "Resueltos", failed: "Con error", abandoned: "Abandonados",
};

function StatusBadge({ status }: { status: string | null }) {
  const meta = ECF_STATUS[status ?? "sin_estado"] ?? { label: status, variant: "outline" };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

// ── cola ─────────────────────────────────────────────────────────────────────

function QueueTab() {
  const q = useQuery({ queryKey: ["/api/ecf/queue"], queryFn: () => ecfApi.queue() });
  const rows = q.data?.queue ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Cola de transmisión</CardTitle>
        <CardDescription>
          Un intento por documento, con su historia. Reintentos con espera creciente: 1, 5, 15, 30
          minutos… para que una caída de DGII no se convierta en un ataque nuestro contra DGII.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="py-2">eNCF</th><th>Estado DGII</th><th>Cola</th>
              <th className="text-right">Intentos</th><th>Próximo intento</th>
              <th>TrackId</th><th>Último error</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((t: EcfQueueRow) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className="py-2 font-mono">{t.ncf ?? `#${t.document_id}`}</td>
                <td><StatusBadge status={t.ecf_status} /></td>
                <td>
                  <Badge variant={t.state === "failed" || t.state === "abandoned" ? "destructive" : "outline"}>
                    {QUEUE_STATE[t.state] ?? t.state}
                  </Badge>
                </td>
                <td className="text-right">{t.attempts}</td>
                <td className="text-xs">{when(t.next_attempt_at)}</td>
                <td className="font-mono text-xs max-w-[10rem] truncate" title={t.track_id ?? ""}>
                  {t.track_id ?? "—"}
                </td>
                <td className="max-w-sm truncate text-xs text-muted-foreground" title={t.last_error ?? ""}>
                  {t.last_error ?? "—"}
                </td>
                <td className="text-right"><DocumentActions documentId={t.document_id} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">
                Nada en cola.
              </td></tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/** Las acciones que se pueden tomar sobre un documento desde cualquier tabla. */
function DocumentActions({ documentId }: { documentId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/ecf/dashboard"] });
    qc.invalidateQueries({ queryKey: ["/api/ecf/queue"] });
  };

  const retry = useMutation({
    mutationFn: () => ecfApi.transmit(documentId),
    onSuccess: (r) => { invalidate(); toast({ title: "Reenviado", description: `Estado: ${r.ecfStatus}` }); },
    onError: (e: any) => toast({ variant: "destructive", title: "No se pudo transmitir", description: e.message }),
  });
  const refresh = useMutation({
    mutationFn: () => ecfApi.refreshStatus(documentId),
    onSuccess: (r) => { invalidate(); toast({ title: `Estado: ${r.ecfStatus}` }); },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <div className="flex justify-end gap-1">
      <EcfRepresentationDialog documentId={documentId} />
      <Button size="icon" variant="ghost" title="Descargar XML firmado" asChild>
        <a href={ecfApi.xmlUrl(documentId)} download><Download className="h-4 w-4" /></a>
      </Button>
      <Button size="icon" variant="ghost" title="Consultar estado" onClick={() => refresh.mutate()}>
        <RefreshCw className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" title="Reintentar transmisión" onClick={() => retry.mutate()}>
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ── recibidos ────────────────────────────────────────────────────────────────

function InboxTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("");
  const inbox = useQuery({
    queryKey: ["/api/ecf/inbox", filter],
    queryFn: () => ecfApi.inbox(filter ? { approvalStatus: filter } : {}),
  });
  const rows = inbox.data?.received ?? [];

  const approve = useMutation({
    mutationFn: (v: { id: number; status: "aceptado" | "rechazado"; reason?: string }) =>
      ecfApi.approve(v.id, v.status, v.reason),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["/api/ecf/inbox"] });
      qc.invalidateQueries({ queryKey: ["/api/ecf/dashboard"] });
      toast({ title: `Comprobante ${r.approvalStatus}`, description: "Se generó la aprobación comercial firmada." });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3 flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Inbox className="h-4 w-4" /> Comprobantes recibidos
            </CardTitle>
            <CardDescription>
              Un emisor electrónico también es receptor. Hay una hora para acusar recibo y tres días
              para la aprobación comercial — y el silencio cuenta como aceptación, así que un
              comprobante que nadie revisó es un comprobante que todos aceptaron.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendiente">Pendientes</SelectItem>
                <SelectItem value="aceptado">Aceptados</SelectItem>
                <SelectItem value="rechazado">Rechazados</SelectItem>
              </SelectContent>
            </Select>
            <ReceiveDialog />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="py-2">eNCF</th><th>Emisor</th><th>Fecha</th>
                <th className="text-right">ITBIS</th><th className="text-right">Total</th>
                <th>Acuse</th><th>Aprobación</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r: EcfReceivedRow) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2 font-mono">
                    {r.encf}
                    <div className="text-xs text-muted-foreground font-sans">{r.ecf_type}</div>
                  </td>
                  <td>
                    {r.supplier_name ?? r.issuer_name ?? "—"}
                    <div className="text-xs text-muted-foreground">{r.issuer_rnc}</div>
                  </td>
                  <td className="text-xs">{r.emitted_at ? new Date(r.emitted_at).toLocaleDateString("es-DO") : "—"}</td>
                  <td className="text-right">{money(r.total_itbis)}</td>
                  <td className="text-right font-medium">{money(r.total)}</td>
                  <td>
                    {r.acknowledged_at
                      ? <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3" /> acusado</Badge>
                      : <Badge variant="destructive">sin acusar</Badge>}
                  </td>
                  <td>
                    <Badge variant={
                      r.approval_status === "aceptado" ? "default"
                        : r.approval_status === "rechazado" ? "destructive" : "outline"
                    }>
                      {r.approval_status}
                    </Badge>
                    {r.approval_overdue && (
                      <div className="text-xs text-amber-600 mt-0.5">plazo vencido</div>
                    )}
                  </td>
                  <td className="text-right">
                    {r.approval_status === "pendiente" && (
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm" variant="outline" className="gap-1"
                          onClick={() => approve.mutate({ id: r.id, status: "aceptado" })}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Aceptar
                        </Button>
                        <RejectDialog onReject={(reason) => approve.mutate({ id: r.id, status: "rechazado", reason })} />
                      </div>
                    )}
                    {r.approval_status !== "pendiente" && r.approval_reason && (
                      <span className="text-xs text-muted-foreground">{r.approval_reason}</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">
                  Sin comprobantes recibidos.
                </td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function RejectDialog({ onReject }: { onReject: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="gap-1 text-destructive">
          <XCircle className="h-3.5 w-3.5" /> Rechazar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rechazo comercial</DialogTitle>
          <DialogDescription>
            El motivo le llega al emisor y es con lo que va a corregir. Un rechazo sin explicación
            es una llamada telefónica, no una solución.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Mercancía no recibida / monto no corresponde a lo pactado…"
        />
        <DialogFooter>
          <Button
            variant="destructive" disabled={!reason.trim()}
            onClick={() => { onReject(reason); setOpen(false); setReason(""); }}
          >
            Rechazar comprobante
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Para pruebas: pegar el XML de un proveedor y ver todo el circuito de recepción. */
function ReceiveDialog() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [xml, setXml] = useState("");

  const receive = useMutation({
    mutationFn: () => ecfApi.receive(xml),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["/api/ecf/inbox"] });
      toast({
        title: r.duplicate ? "Ya estaba recibido" : r.accepted ? "Comprobante recibido" : "Recibido con observaciones",
        description: r.messages?.length ? r.messages.map((m: any) => m.message).join(" · ") : r.encf,
      });
      setXml("");
      setOpen(false);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "No se pudo recibir", description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1"><Inbox className="h-4 w-4" /> Cargar XML</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Recibir un e-CF</DialogTitle>
          <DialogDescription>
            En producción DGII empuja el XML a este mismo endpoint. Aquí se puede pegar uno para
            recorrer el circuito completo: validación, acuse de recibo y aprobación comercial.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={12} className="font-mono text-xs" value={xml}
          onChange={(e) => setXml(e.target.value)} placeholder="<?xml version=&quot;1.0&quot;?><ECF>…"
        />
        <DialogFooter>
          <Button onClick={() => receive.mutate()} disabled={!xml.trim() || receive.isPending}>
            Recibir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── RFCE ─────────────────────────────────────────────────────────────────────

function RfceTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());

  const preview = useQuery({
    queryKey: ["/api/ecf/rfce/preview", from, to],
    queryFn: () => ecfApi.rfcePreview(from, to),
  });

  const file = useMutation({
    mutationFn: () => ecfApi.fileRfce(from, to),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["/api/ecf/rfce/preview"] });
      qc.invalidateQueries({ queryKey: ["/api/ecf/dashboard"] });
      toast({
        title: r.filed ? "Resumen enviado" : "No había nada que resumir",
        description: r.filed ? `${r.documentCount} comprobante(s) · trackId ${r.trackId}` : r.reason,
      });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const p = preview.data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileStack className="h-4 w-4" /> Resumen de facturas de consumo (RFCE)
          </CardTitle>
          <CardDescription>
            Un colmado que factura 400 veces al día no puede hacer 400 llamadas a DGII. Las facturas
            de consumo por debajo del umbral van como un resumen del período; los comprobantes
            individuales quedan con el contribuyente, impresos y disponibles si los piden.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-sm">Desde</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">Hasta</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
            </div>
            <Button onClick={() => file.mutate()} disabled={file.isPending || !p || p.n === 0} className="gap-1">
              <Send className="h-4 w-4" /> Enviar resumen
            </Button>
          </div>

          {p && (
            <div className="rounded-md border p-4 text-sm space-y-1">
              {p.n === 0 ? (
                <p className="text-muted-foreground">
                  No hay facturas de consumo pendientes de resumir en ese período.
                </p>
              ) : (
                <>
                  <Row label="Comprobantes" value={String(p.n)} />
                  <Row label="Rango" value={`${p.encf_from} — ${p.encf_to}`} />
                  <Row label="Monto total" value={`RD$ ${money(p.total)}`} strong />
                  <p className="pt-2 text-xs text-muted-foreground">
                    Sólo entran las facturas por debajo de RD$ {money(p.threshold)} que aún no se
                    enviaron individualmente.
                  </p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <SequenceVoids />
    </div>
  );
}

function SequenceVoids() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ecfType: "E31", rangeFrom: "", rangeTo: "", reason: "" });

  const list = useQuery({ queryKey: ["/api/ecf/sequence-voids"], queryFn: () => ecfApi.sequenceVoids() });

  const create = useMutation({
    mutationFn: () =>
      ecfApi.voidSequence({
        ecfType: form.ecfType,
        rangeFrom: Number(form.rangeFrom),
        rangeTo: Number(form.rangeTo),
        reason: form.reason || undefined,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["/api/ecf/sequence-voids"] });
      toast({ title: "Rango anulado", description: `${r.count} número(s) declarados como no utilizados.` });
      setOpen(false);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "No se pudo anular", description: e.message }),
  });

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Ban className="h-4 w-4" /> Anulación de rangos
          </CardTitle>
          <CardDescription>
            Números autorizados que nunca se van a usar. Distinto del 608, que reporta documentos
            anulados: esto declara números que jamás llegarán a ser documentos, para que no puedan
            reaparecer después como una factura que nadie sabe explicar.
          </CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" variant="outline">Anular rango</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Anular un rango de eNCF</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div className="space-y-1">
                <Label className="text-sm">Tipo</Label>
                <Select value={form.ecfType} onValueChange={(v) => setForm({ ...form, ecfType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["E31", "E32", "E33", "E34", "E41", "E43", "E44", "E45", "E46", "E47"].map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-sm">Desde</Label>
                  <Input value={form.rangeFrom} onChange={(e) => setForm({ ...form, rangeFrom: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">Hasta</Label>
                  <Input value={form.rangeTo} onChange={(e) => setForm({ ...form, rangeTo: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Motivo</Label>
                <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={!form.rangeFrom || !form.rangeTo}>
                Anular
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b">
            <tr><th className="py-2">Tipo</th><th>Rango</th><th className="text-right">Cantidad</th>
              <th>Motivo</th><th>Estado</th><th>Fecha</th></tr>
          </thead>
          <tbody>
            {(list.data?.voids ?? []).map((v: any) => (
              <tr key={v.id} className="border-b last:border-0">
                <td className="py-2">{v.ecf_type}</td>
                <td className="font-mono text-xs">{v.range_from} — {v.range_to}</td>
                <td className="text-right">{v.count}</td>
                <td className="text-xs text-muted-foreground">{v.reason ?? "—"}</td>
                <td><Badge variant="outline">{v.status}</Badge></td>
                <td className="text-xs">{when(v.created_at)}</td>
              </tr>
            ))}
            {(list.data?.voids ?? []).length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Sin rangos anulados.</td></tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ── configuración ────────────────────────────────────────────────────────────

function ConfigTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: ["/api/ecf/config"], queryFn: () => ecfApi.config() });
  const c = cfg.data?.config;

  const save = useMutation({
    mutationFn: (patch: any) => ecfApi.saveConfig(patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/ecf/config"] });
      qc.invalidateQueries({ queryKey: ["/api/ecf/dashboard"] });
      toast({ title: "Configuración guardada" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  if (!c) return <p className="py-8 text-muted-foreground">Cargando…</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-4 w-4" /> Ambiente
          </CardTitle>
          <CardDescription>
            El ambiente es una propiedad de la empresa, no del despliegue: una misma instalación
            puede servir a un contribuyente ya en producción y a otro todavía certificando.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-sm">Ambiente DGII</Label>
            <Select value={c.environment} onValueChange={(v) => save.mutate({ environment: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="simulated">Simulado — DGII local, sin red</SelectItem>
                <SelectItem value="test">Pruebas (TesteCF)</SelectItem>
                <SelectItem value="cert">Certificación (CerteCF)</SelectItem>
                <SelectItem value="prod">Producción</SelectItem>
              </SelectContent>
            </Select>
            {c.environment !== "simulated" && !c.hasCertificate && (
              <p className="text-xs text-destructive">
                Este ambiente exige certificado digital y todavía no hay uno cargado.
              </p>
            )}
          </div>
          <div className="flex items-start justify-between gap-3 rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Facturación electrónica activa</p>
              <p className="text-xs text-muted-foreground">
                Apagado, los comprobantes siguen siendo NCF tradicionales.
              </p>
            </div>
            <Switch checked={c.isEnabled} onCheckedChange={(v) => save.mutate({ isEnabled: v })} />
          </div>
        </CardContent>
      </Card>

      <IssuerForm config={c} onSave={(p) => save.mutate(p)} />
      <CertificateCard config={c} />
      <ReadinessCard />
    </div>
  );
}

function ReadinessCard() {
  const q = useQuery<EcfReadiness>({
    queryKey: ["/api/ecf/readiness"],
    queryFn: () => ecfApi.readiness(),
    refetchOnWindowFocus: false,
  });
  const d = q.data;
  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Preparación e-CF
          </CardTitle>
          <CardDescription>
            Diagnóstico local: qué falta para poder emitir e-CF en el ambiente elegido.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1 ${q.isFetching ? "animate-spin" : ""}`} />
          Volver a revisar
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading && <p className="text-sm text-muted-foreground">Corriendo chequeos…</p>}
        {d && (
          <>
            <div className="flex items-center gap-2">
              {d.ready ? (
                <Badge className="bg-green-600 hover:bg-green-600">Listo para {d.environment.toUpperCase()}</Badge>
              ) : (
                <Badge variant="destructive">Faltan pasos</Badge>
              )}
              <span className="text-xs text-muted-foreground">
                Ambiente actual: {d.environment} · {d.isEnabled ? "activo" : "apagado"}
              </span>
            </div>
            <ul className="space-y-2">
              {d.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-sm">
                  {c.status === "ok" && <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />}
                  {c.status === "warn" && <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />}
                  {c.status === "fail" && <XCircle className="h-4 w-4 text-destructive mt-0.5" />}
                  <div>
                    <div className="font-medium">{c.label}</div>
                    <div className="text-muted-foreground">{c.message}</div>
                  </div>
                </li>
              ))}
            </ul>
            {d.nextSteps.length > 0 && (
              <div className="rounded-md border border-dashed p-3">
                <p className="text-sm font-medium mb-2">Próximos pasos</p>
                <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                  {d.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function IssuerForm({ config, onSave }: { config: any; onSave: (p: any) => void }) {
  const [form, setForm] = useState({
    issuerRnc: config.issuerRnc ?? "", issuerName: config.issuerName ?? "",
    tradeName: config.tradeName ?? "", address: config.address ?? "",
    phone: config.phone ?? "", email: config.email ?? "",
    rfceThreshold: config.rfceThreshold ?? "250000",
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Datos del emisor</CardTitle>
        <CardDescription>
          La razón social debe coincidir exactamente con el registro del RNC en DGII; una diferencia
          aquí es un rechazo que no dice por qué.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <Field label="RNC"><Input value={form.issuerRnc} onChange={(e) => setForm({ ...form, issuerRnc: e.target.value })} /></Field>
        <Field label="Razón social"><Input value={form.issuerName} onChange={(e) => setForm({ ...form, issuerName: e.target.value })} /></Field>
        <Field label="Nombre comercial"><Input value={form.tradeName} onChange={(e) => setForm({ ...form, tradeName: e.target.value })} /></Field>
        <Field label="Teléfono"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field label="Dirección"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
        <Field label="Correo"><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Umbral RFCE (RD$)">
          <Input value={form.rfceThreshold} onChange={(e) => setForm({ ...form, rfceThreshold: e.target.value })} />
        </Field>
        <div className="md:col-span-2">
          <Button onClick={() => onSave(form)}>Guardar datos del emisor</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CertificateCard({ config }: { config: any }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [privateKeyPem, setKey] = useState("");
  const [certificatePem, setCert] = useState("");

  const upload = useMutation({
    mutationFn: () => ecfApi.uploadCertificate(privateKeyPem, certificatePem),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/ecf/config"] });
      toast({ title: "Certificado cargado" });
      setKey(""); setCert(""); setOpen(false);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const expires = config.certificateExpiresAt ? new Date(config.certificateExpiresAt) : null;
  const daysLeft = expires ? Math.ceil((expires.getTime() - Date.now()) / 86400000) : null;

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Certificado digital
          </CardTitle>
          <CardDescription>
            La llave privada entra y no vuelve a salir por ninguna lectura: la columna está revocada
            para el rol de las peticiones y el firmante la lee por una función aparte.
          </CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">{config.hasCertificate ? "Reemplazar" : "Cargar"}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Cargar certificado</DialogTitle>
              <DialogDescription>
                Certificado emitido por una autoridad autorizada por DGII (Avansi, Cámara TC…), en
                formato PEM.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <Field label="Llave privada (PEM)">
                <Textarea rows={6} className="font-mono text-xs" value={privateKeyPem}
                  onChange={(e) => setKey(e.target.value)} placeholder="-----BEGIN PRIVATE KEY-----" />
              </Field>
              <Field label="Certificado (PEM)">
                <Textarea rows={6} className="font-mono text-xs" value={certificatePem}
                  onChange={(e) => setCert(e.target.value)} placeholder="-----BEGIN CERTIFICATE-----" />
              </Field>
            </div>
            <DialogFooter>
              <Button onClick={() => upload.mutate()} disabled={!privateKeyPem || !certificatePem}>
                Cargar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="text-sm space-y-1">
        {!config.hasCertificate ? (
          <p className="text-muted-foreground">
            No hay certificado cargado. En ambiente simulado se firma con una llave efímera: el
            circuito completo funciona y la firma verifica contra sí misma; lo único que falta es
            que DGII confíe en ella.
          </p>
        ) : (
          <>
            <Row label="Huella (SHA-256)" value={config.certificateFingerprint ?? "—"} mono />
            <Row label="Sujeto" value={config.certificateSubject ?? "—"} />
            <Row
              label="Vence"
              value={expires ? `${expires.toLocaleDateString("es-DO")}${daysLeft !== null ? ` (${daysLeft} días)` : ""}` : "—"}
            />
            {daysLeft !== null && daysLeft < 30 && (
              <p className="text-destructive text-xs pt-1">
                El certificado vence en {daysLeft} días. Un certificado vencido detiene toda la
                facturación electrónica.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── piezas ───────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-sm">{label}</Label>{children}</div>;
}

function Row({ label, value, strong, mono }: { label: string; value: string; strong?: boolean; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={`${strong ? "font-semibold" : ""} ${mono ? "font-mono text-xs break-all" : ""} text-right`}>
        {value}
      </span>
    </div>
  );
}
