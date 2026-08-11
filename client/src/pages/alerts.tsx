import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Bell, Plus, Play, CheckCircle2, X, Trash2, Zap, AlertTriangle } from "lucide-react";

const SEVERITY_COLOR: Record<string, string> = {
  info: "bg-blue-500",
  warning: "bg-yellow-500",
  critical: "bg-red-500",
};

const RULE_TYPE_LABELS: Record<string, string> = {
  cash_low: "Balance bancario bajo",
  ar_overdue: "Cuentas por cobrar vencidas",
  ap_overdue: "Cuentas por pagar vencidas",
  approvals_stale: "Aprobaciones estancadas",
  mo_short: "MO con stock insuficiente",
  low_stock: "Stock bajo",
  fx_stale: "Tasa de cambio desactualizada",
  custom: "Personalizada",
};

const STATUS_COLOR: Record<string, string> = {
  new: "bg-red-500",
  acknowledged: "bg-yellow-500",
  resolved: "bg-green-600",
  dismissed: "bg-gray-500",
};

/** Alertas proactivas: reglas + eventos + evaluación manual. */
export default function AlertsPage() {
  const [tab, setTab] = useState("events");

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Bell className="w-8 h-8 text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold">Alertas y Notificaciones</h1>
            <p className="text-muted-foreground">Reglas configurables + eventos + delivery multi-canal</p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="events"><AlertTriangle className="w-4 h-4 mr-2" />Eventos</TabsTrigger>
          <TabsTrigger value="rules"><Bell className="w-4 h-4 mr-2" />Reglas</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="mt-4"><EventsSection /></TabsContent>
        <TabsContent value="rules" className="mt-4"><RulesSection /></TabsContent>
      </Tabs>
    </div>
  );
}

function EventsSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("new");

  const events = useQuery({
    queryKey: ["/api/alerts/events", statusFilter],
    queryFn: () => apiRequest("GET", `/api/alerts/events${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`),
    refetchInterval: 30_000,
  });

  const runNow = useMutation({
    mutationFn: () => apiRequest("POST", "/api/alerts/run", { deliver: true }),
    onSuccess: (data: any) => {
      toast({
        title: "Evaluación completada",
        description: `${data.rulesEvaluated} reglas · ${data.eventsCreated} eventos nuevos · ${data.deliveriesQueued} deliveries`,
      });
      qc.invalidateQueries({ queryKey: ["/api/alerts/events"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const ack = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/alerts/events/${id}/acknowledge`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/alerts/events"] }),
  });

  const dismiss = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/alerts/events/${id}/dismiss`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/alerts/events"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="new">Nuevos</SelectItem>
            <SelectItem value="acknowledged">Reconocidos</SelectItem>
            <SelectItem value="resolved">Resueltos</SelectItem>
            <SelectItem value="dismissed">Descartados</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => runNow.mutate()} disabled={runNow.isPending}>
          <Zap className="w-4 h-4 mr-2" /> Evaluar ahora
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eventos ({events.data?.rows?.length ?? 0})</CardTitle>
          <CardDescription>Refresco automático cada 30s</CardDescription>
        </CardHeader>
        <CardContent>
          {events.data?.rows?.length ? (
            <div className="space-y-2">
              {events.data.rows.map((e: any) => (
                <Card key={e.id} className={`border-l-4 ${
                  e.severity === "critical" ? "border-l-red-500" :
                  e.severity === "warning" ? "border-l-yellow-500" : "border-l-blue-500"
                }`}>
                  <CardContent className="pt-3 pb-3">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={`${SEVERITY_COLOR[e.severity]} text-white text-xs`}>{e.severity}</Badge>
                          <Badge variant="outline" className="text-xs">{RULE_TYPE_LABELS[e.ruleType] ?? e.ruleType}</Badge>
                          <Badge className={`${STATUS_COLOR[e.status]} text-white text-xs`}>{e.status}</Badge>
                        </div>
                        <p className="font-medium">{e.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {e.ruleName} · {new Date(e.createdAt).toLocaleString("es-DO")}
                        </p>
                      </div>
                      {e.status === "new" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => ack.mutate(e.id)}>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Reconocer
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => dismiss.mutate(e.id)}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">Sin eventos</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RulesSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState({
    name: "", ruleType: "cash_low",
    parameters: { minBalance: 100000 } as Record<string, any>,
    severity: "warning",
    channels: ["in_app"],
    debounceMinutes: 60,
  });

  const rules = useQuery({
    queryKey: ["/api/alerts/rules"],
    queryFn: () => apiRequest("GET", "/api/alerts/rules"),
  });

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/alerts/rules", form),
    onSuccess: () => {
      toast({ title: "Regla creada" });
      setOpenNew(false);
      qc.invalidateQueries({ queryKey: ["/api/alerts/rules"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("POST", `/api/alerts/rules/${id}/toggle`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/alerts/rules"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpenNew(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nueva regla
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reglas configuradas</CardTitle>
        </CardHeader>
        <CardContent>
          {rules.data?.rows?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Severidad</TableHead>
                  <TableHead>Canales</TableHead>
                  <TableHead className="text-right">Debounce</TableHead>
                  <TableHead className="text-right">Triggers</TableHead>
                  <TableHead>Activa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.data.rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>{RULE_TYPE_LABELS[r.ruleType] ?? r.ruleType}</TableCell>
                    <TableCell>
                      <Badge className={`${SEVERITY_COLOR[r.severity]} text-white text-xs`}>{r.severity}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {r.channels?.map((c: string) => (
                          <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs">{r.debounceMinutes} min</TableCell>
                    <TableCell className="text-right font-mono">{r.triggerCount}</TableCell>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={r.isActive}
                        onChange={(e) => toggle.mutate({ id: r.id, isActive: e.target.checked })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">Sin reglas configuradas</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva regla de alerta</DialogTitle>
            <DialogDescription>Selecciona qué evento monitorear y cómo notificar</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Alerta cash bajo" />
            </div>
            <div>
              <Label>Tipo *</Label>
              <Select value={form.ruleType} onValueChange={(v) => setForm({ ...form, ruleType: v, parameters: defaultParams(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(RULE_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ParametersEditor
              type={form.ruleType}
              value={form.parameters}
              onChange={(p) => setForm({ ...form, parameters: p })}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Severidad</Label>
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Debounce (min)</Label>
                <Input type="number" value={form.debounceMinutes} onChange={(e) => setForm({ ...form, debounceMinutes: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label>Canales</Label>
              <div className="flex gap-3 mt-1">
                {["in_app", "email", "whatsapp"].map((c) => (
                  <label key={c} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={form.channels.includes(c)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...form.channels, c]
                          : form.channels.filter((x) => x !== c);
                        setForm({ ...form, channels: next });
                      }}
                    />
                    {c}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={!form.name || create.isPending}>Crear regla</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function defaultParams(type: string): Record<string, any> {
  switch (type) {
    case "cash_low": return { minBalance: 100000 };
    case "ar_overdue": return { days: 30, minAmount: 0 };
    case "ap_overdue": return { days: 15, minAmount: 0 };
    case "approvals_stale": return { hoursThreshold: 24 };
    case "low_stock": return { threshold: 0 };
    case "fx_stale": return { fromCurrency: "USD", toCurrency: "DOP", maxDays: 7 };
    default: return {};
  }
}

function ParametersEditor({ type, value, onChange }: { type: string; value: Record<string, any>; onChange: (v: Record<string, any>) => void }) {
  const set = (key: string, val: any) => onChange({ ...value, [key]: val });
  switch (type) {
    case "cash_low":
      return (
        <div>
          <Label>Umbral mínimo (RD$)</Label>
          <Input type="number" value={value.minBalance ?? 0} onChange={(e) => set("minBalance", Number(e.target.value))} />
        </div>
      );
    case "ar_overdue":
    case "ap_overdue":
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Días vencidos ≥</Label>
            <Input type="number" value={value.days ?? 30} onChange={(e) => set("days", Number(e.target.value))} />
          </div>
          <div>
            <Label>Monto mínimo</Label>
            <Input type="number" value={value.minAmount ?? 0} onChange={(e) => set("minAmount", Number(e.target.value))} />
          </div>
        </div>
      );
    case "approvals_stale":
      return (
        <div>
          <Label>Horas sin decisión ≥</Label>
          <Input type="number" value={value.hoursThreshold ?? 24} onChange={(e) => set("hoursThreshold", Number(e.target.value))} />
        </div>
      );
    case "low_stock":
      return (
        <div>
          <Label>Umbral extra (stock &lt;= min + N)</Label>
          <Input type="number" value={value.threshold ?? 0} onChange={(e) => set("threshold", Number(e.target.value))} />
        </div>
      );
    case "fx_stale":
      return (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label>De</Label>
            <Input value={value.fromCurrency ?? "USD"} onChange={(e) => set("fromCurrency", e.target.value)} maxLength={3} />
          </div>
          <div>
            <Label>A</Label>
            <Input value={value.toCurrency ?? "DOP"} onChange={(e) => set("toCurrency", e.target.value)} maxLength={3} />
          </div>
          <div>
            <Label>Días máx</Label>
            <Input type="number" value={value.maxDays ?? 7} onChange={(e) => set("maxDays", Number(e.target.value))} />
          </div>
        </div>
      );
    default:
      return null;
  }
}
