import { useState } from "react";
import { Fragment } from "react";
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
import { TrendingUp, Plus, RefreshCw, Trash2, AlertTriangle } from "lucide-react";

const money = (v: string | number) =>
  Number(v ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2 });

const CATEGORY_LABELS: Record<string, string> = {
  rent: "Alquiler", payroll: "Nómina", utilities: "Servicios",
  subscription: "Suscripciones", loan: "Préstamos", tax: "Impuestos",
  interest: "Intereses", dividends: "Dividendos", capex: "Inversiones",
  income: "Ingresos", other: "Otro",
};

const FREQ_LABELS: Record<string, string> = {
  one_time: "Una vez", weekly: "Semanal", biweekly: "Quincenal",
  monthly: "Mensual", quarterly: "Trimestral", yearly: "Anual",
};

/** Cash flow forecast: proyección 13 semanas + gestión de flujos recurrentes. */
export default function CashFlowPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState("forecast");
  const [forecast, setForecast] = useState<any>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [openEntry, setOpenEntry] = useState(false);
  const [forecastDate, setForecastDate] = useState(new Date().toISOString().slice(0, 10));
  const [horizonWeeks, setHorizonWeeks] = useState(13);

  const [entryForm, setEntryForm] = useState({
    name: "", direction: "outflow", category: "rent",
    amount: 0, frequency: "monthly",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "", intervalCount: 1, confidence: "high",
  });

  const entries = useQuery({
    queryKey: ["/api/cash-flow/entries"],
    queryFn: () => apiRequest("GET", "/api/cash-flow/entries"),
  });

  const history = useQuery({
    queryKey: ["/api/cash-flow/forecast/history"],
    queryFn: () => apiRequest("GET", "/api/cash-flow/forecast/history"),
  });

  const runForecast = useMutation({
    mutationFn: () => apiRequest("POST", "/api/cash-flow/forecast", { forecastDate, horizonWeeks }),
    onSuccess: (data) => setForecast(data),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveForecast = useMutation({
    mutationFn: () => apiRequest("POST", "/api/cash-flow/forecast/save", { forecastDate, horizonWeeks }),
    onSuccess: () => {
      toast({ title: "Snapshot guardado" });
      qc.invalidateQueries({ queryKey: ["/api/cash-flow/forecast/history"] });
    },
  });

  const addEntry = useMutation({
    mutationFn: () => {
      const payload: any = {
        name: entryForm.name,
        direction: entryForm.direction,
        category: entryForm.category,
        amount: Number(entryForm.amount),
        frequency: entryForm.frequency,
        startDate: entryForm.startDate,
        intervalCount: Number(entryForm.intervalCount),
        confidence: entryForm.confidence,
      };
      if (entryForm.endDate) payload.endDate = entryForm.endDate;
      return apiRequest("POST", "/api/cash-flow/entries", payload);
    },
    onSuccess: () => {
      toast({ title: "Flujo agregado" });
      setOpenEntry(false);
      setEntryForm({
        name: "", direction: "outflow", category: "rent",
        amount: 0, frequency: "monthly",
        startDate: new Date().toISOString().slice(0, 10),
        endDate: "", intervalCount: 1, confidence: "high",
      });
      qc.invalidateQueries({ queryKey: ["/api/cash-flow/entries"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const delEntry = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/cash-flow/entries/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/cash-flow/entries"] }),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">Flujo de Caja Proyectado</h1>
            <p className="text-muted-foreground">Bancos + AR + AP + gastos recurrentes en 13 semanas</p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="forecast">Proyección</TabsTrigger>
          <TabsTrigger value="entries">Flujos recurrentes</TabsTrigger>
          <TabsTrigger value="history">Snapshots</TabsTrigger>
        </TabsList>

        <TabsContent value="forecast" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Parámetros</CardTitle>
                  <CardDescription>Selecciona fecha inicial y horizonte</CardDescription>
                </div>
                <div className="flex gap-2 items-end">
                  <div>
                    <Label>Desde</Label>
                    <Input type="date" value={forecastDate} onChange={(e) => setForecastDate(e.target.value)} className="w-40" />
                  </div>
                  <div>
                    <Label>Semanas</Label>
                    <Input type="number" value={horizonWeeks} onChange={(e) => setHorizonWeeks(Number(e.target.value))} className="w-20" min={1} max={52} />
                  </div>
                  <Button onClick={() => runForecast.mutate()} disabled={runForecast.isPending}>
                    <RefreshCw className="w-4 h-4 mr-2" /> Generar
                  </Button>
                  {forecast && (
                    <Button variant="secondary" onClick={() => saveForecast.mutate()} disabled={saveForecast.isPending}>
                      Guardar snapshot
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>

          {forecast && (
            <>
              <div className="grid grid-cols-5 gap-3">
                <StatCard label="Balance inicial" value={money(forecast.startingBalance)} />
                <StatCard label="Total entradas" value={money(forecast.totalInflow)} color="text-green-600" />
                <StatCard label="Total salidas" value={money(forecast.totalOutflow)} color="text-red-600" />
                <StatCard label="Balance final" value={money(forecast.endingBalance)} bold color={Number(forecast.endingBalance) < 0 ? "text-red-600" : "text-green-600"} />
                <StatCard
                  label="Balance mínimo"
                  value={money(forecast.minBalance)}
                  bold
                  color={Number(forecast.minBalance) < 0 ? "text-red-600" : "text-blue-600"}
                  subtitle={`semana del ${forecast.minBalanceWeek}`}
                />
              </div>

              {Number(forecast.minBalance) < 0 && (
                <Card className="border-red-500">
                  <CardContent className="pt-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                    <div>
                      <p className="font-semibold text-red-600">Alerta de liquidez</p>
                      <p className="text-sm text-muted-foreground">
                        El balance proyectado quedará negativo en la semana del {forecast.minBalanceWeek}
                        (RD$ {money(forecast.minBalance)}). Considera adelantar cobros, retrasar pagos o
                        conseguir financiación puente.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Flujo semanal</CardTitle>
                  <CardDescription>Click en cualquier semana para ver el detalle</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Semana</TableHead>
                        <TableHead className="text-right">Saldo inicial</TableHead>
                        <TableHead className="text-right">Cobros AR</TableHead>
                        <TableHead className="text-right">Otras entradas</TableHead>
                        <TableHead className="text-right">Pagos AP</TableHead>
                        <TableHead className="text-right">Otras salidas</TableHead>
                        <TableHead className="text-right">Neto</TableHead>
                        <TableHead className="text-right">Saldo final</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {forecast.buckets.map((b: any, i: number) => (
                        <Fragment key={i}>
                          <TableRow
                            className={`cursor-pointer ${Number(b.closingBalance) < 0 ? "bg-red-50 dark:bg-red-950/20" : ""}`}
                            onClick={() => setExpanded(expanded === i ? null : i)}
                          >
                            <TableCell className="font-mono text-xs">
                              {b.weekStart} → {b.weekEnd}
                            </TableCell>
                            <TableCell className="text-right font-mono">{money(b.openingBalance)}</TableCell>
                            <TableCell className="text-right font-mono text-green-600">{b.inflowAR > 0 ? `+${money(b.inflowAR)}` : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-green-600">{b.inflowOther > 0 ? `+${money(b.inflowOther)}` : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-red-600">{b.outflowAP > 0 ? `-${money(b.outflowAP)}` : "—"}</TableCell>
                            <TableCell className="text-right font-mono text-red-600">{b.outflowOther > 0 ? `-${money(b.outflowOther)}` : "—"}</TableCell>
                            <TableCell className={`text-right font-mono font-bold ${b.netFlow > 0 ? "text-green-600" : b.netFlow < 0 ? "text-red-600" : ""}`}>
                              {b.netFlow > 0 ? "+" : ""}{money(b.netFlow)}
                            </TableCell>
                            <TableCell className={`text-right font-mono font-bold ${Number(b.closingBalance) < 0 ? "text-red-600" : ""}`}>
                              {money(b.closingBalance)}
                            </TableCell>
                          </TableRow>
                          {expanded === i && b.items.length > 0 && (
                            <TableRow>
                              <TableCell colSpan={8} className="bg-muted/50 p-3">
                                <p className="text-xs font-semibold mb-2">Detalle ({b.items.length} movimientos)</p>
                                <div className="space-y-1">
                                  {b.items.map((it: any, j: number) => (
                                    <div key={j} className="flex justify-between text-xs">
                                      <span className="flex gap-2">
                                        <span className="font-mono text-muted-foreground">{it.date}</span>
                                        <Badge variant="outline" className="text-xs h-4">{it.source}</Badge>
                                        <span>{it.label}</span>
                                      </span>
                                      <span className={`font-mono ${it.direction === "inflow" ? "text-green-600" : "text-red-600"}`}>
                                        {it.direction === "inflow" ? "+" : "-"}{money(it.amount)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="entries" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setOpenEntry(true)}>
              <Plus className="w-4 h-4 mr-2" /> Nuevo flujo
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Flujos recurrentes</CardTitle>
              <CardDescription>Alquileres, nóminas, servicios, préstamos programados</CardDescription>
            </CardHeader>
            <CardContent>
              {entries.data?.rows?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Sentido</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Frecuencia</TableHead>
                      <TableHead>Desde</TableHead>
                      <TableHead>Hasta</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Certeza</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.data.rows.map((e: any) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{e.name}</TableCell>
                        <TableCell>
                          <Badge className={e.direction === "inflow" ? "bg-green-600" : "bg-red-500"}>
                            {e.direction === "inflow" ? "Entrada" : "Salida"}
                          </Badge>
                        </TableCell>
                        <TableCell>{CATEGORY_LABELS[e.category] ?? e.category}</TableCell>
                        <TableCell>{FREQ_LABELS[e.frequency] ?? e.frequency}</TableCell>
                        <TableCell className="text-xs">{e.startDate}</TableCell>
                        <TableCell className="text-xs">{e.endDate ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono">{money(e.amount)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            e.confidence === "high" ? "border-green-500 text-green-600" :
                            e.confidence === "medium" ? "border-yellow-500 text-yellow-600" :
                            "border-red-500 text-red-600"
                          }>{e.confidence}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => delEntry.mutate(e.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">Sin flujos recurrentes</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Snapshots guardados</CardTitle>
              <CardDescription>Compara proyecciones anteriores contra la realidad</CardDescription>
            </CardHeader>
            <CardContent>
              {history.data?.rows?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Semanas</TableHead>
                      <TableHead className="text-right">Saldo inicial</TableHead>
                      <TableHead className="text-right">Total in</TableHead>
                      <TableHead className="text-right">Total out</TableHead>
                      <TableHead className="text-right">Saldo final</TableHead>
                      <TableHead>Notas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.data.rows.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.forecastDate}</TableCell>
                        <TableCell className="text-right">{s.horizonWeeks}</TableCell>
                        <TableCell className="text-right font-mono">{money(s.startingBalance)}</TableCell>
                        <TableCell className="text-right font-mono text-green-600">{money(s.totalInflow)}</TableCell>
                        <TableCell className="text-right font-mono text-red-600">{money(s.totalOutflow)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{money(s.endingBalance)}</TableCell>
                        <TableCell className="text-xs">{s.notes ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">Sin snapshots guardados</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={openEntry} onOpenChange={setOpenEntry}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo flujo recurrente</DialogTitle>
            <DialogDescription>Alquileres, nóminas, servicios que no están en AR/AP</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre *</Label>
              <Input value={entryForm.name} onChange={(e) => setEntryForm({ ...entryForm, name: e.target.value })} placeholder="Alquiler local principal" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sentido</Label>
                <Select value={entryForm.direction} onValueChange={(v) => setEntryForm({ ...entryForm, direction: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inflow">Entrada (ingreso)</SelectItem>
                    <SelectItem value="outflow">Salida (gasto)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Categoría</Label>
                <Select value={entryForm.category} onValueChange={(v) => setEntryForm({ ...entryForm, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Monto (DOP) *</Label>
                <Input type="number" value={entryForm.amount} onChange={(e) => setEntryForm({ ...entryForm, amount: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Frecuencia</Label>
                <Select value={entryForm.frequency} onValueChange={(v) => setEntryForm({ ...entryForm, frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(FREQ_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fecha inicial *</Label>
                <Input type="date" value={entryForm.startDate} onChange={(e) => setEntryForm({ ...entryForm, startDate: e.target.value })} />
              </div>
              <div>
                <Label>Fecha final (opcional)</Label>
                <Input type="date" value={entryForm.endDate} onChange={(e) => setEntryForm({ ...entryForm, endDate: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Certeza</Label>
              <Select value={entryForm.confidence} onValueChange={(v) => setEntryForm({ ...entryForm, confidence: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">Alta (seguro)</SelectItem>
                  <SelectItem value="medium">Media (probable)</SelectItem>
                  <SelectItem value="low">Baja (incierto)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenEntry(false)}>Cancelar</Button>
            <Button onClick={() => addEntry.mutate()} disabled={!entryForm.name || !entryForm.amount || addEntry.isPending}>
              Agregar flujo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, color = "", bold = false, subtitle }: { label: string; value: string; color?: string; bold?: boolean; subtitle?: string }) {
  return (
    <Card><CardContent className="pt-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-mono ${bold ? "font-bold" : ""} ${color}`}>RD$ {value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </CardContent></Card>
  );
}
