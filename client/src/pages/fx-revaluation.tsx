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
import { Coins, Plus, Play, Eye, TrendingUp, TrendingDown } from "lucide-react";

const money = (v: string | number) =>
  Number(v ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2 });

const rate = (v: string | number) =>
  Number(v ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

/** Gestión de tasas de cambio + revaluación mensual de saldos en moneda extranjera. */
export default function FxRevaluationPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState("rates");
  const [openRate, setOpenRate] = useState(false);
  const [openReval, setOpenReval] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [valuationDate, setValuationDate] = useState(new Date().toISOString().slice(0, 10));

  const [rateForm, setRateForm] = useState({
    rateDate: new Date().toISOString().slice(0, 10),
    fromCurrency: "USD", toCurrency: "DOP",
    rateType: "spot", rate: 60, source: "",
  });

  const rates = useQuery({
    queryKey: ["/api/fx/rates"],
    queryFn: () => apiRequest("GET", "/api/fx/rates?limit=200"),
  });

  const runs = useQuery({
    queryKey: ["/api/fx/revaluations"],
    queryFn: () => apiRequest("GET", "/api/fx/revaluations"),
  });

  const addRate = useMutation({
    mutationFn: () => apiRequest("POST", "/api/fx/rates", { ...rateForm, rate: Number(rateForm.rate) }),
    onSuccess: () => {
      toast({ title: "Tasa guardada" });
      setOpenRate(false);
      qc.invalidateQueries({ queryKey: ["/api/fx/rates"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const previewMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/fx/revaluations/preview", { valuationDate }),
    onSuccess: (data) => setPreview(data),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const runMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/fx/revaluations", { valuationDate }),
    onSuccess: (data: any) => {
      toast({ title: "Revaluación posteada", description: `Impacto neto: RD$ ${money(data.netImpact)}` });
      setPreview(null);
      setOpenReval(false);
      qc.invalidateQueries({ queryKey: ["/api/fx/revaluations"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Coins className="w-8 h-8 text-yellow-600" />
          <div>
            <h1 className="text-2xl font-bold">Multi-Moneda + Revaluación FX</h1>
            <p className="text-muted-foreground">Tasas oficiales por fecha y cierre mensual de saldos en ME</p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="rates">Tasas de cambio</TabsTrigger>
          <TabsTrigger value="revaluation">Revaluación</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="rates" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setOpenRate(true)}>
              <Plus className="w-4 h-4 mr-2" /> Nueva tasa
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Tasas registradas</CardTitle>
              <CardDescription>Spot = día · Closing = cierre mensual · Avg = promedio</CardDescription>
            </CardHeader>
            <CardContent>
              {rates.data?.rows?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Par</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Tasa</TableHead>
                      <TableHead>Fuente</TableHead>
                      <TableHead>Notas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rates.data.rows.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.rateDate}</TableCell>
                        <TableCell className="font-mono">{r.fromCurrency}→{r.toCurrency}</TableCell>
                        <TableCell>
                          <Badge variant={r.rateType === "closing" ? "default" : "outline"}>
                            {r.rateType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">{rate(r.rate)}</TableCell>
                        <TableCell className="text-xs">{r.source ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.notes ?? ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">Sin tasas registradas</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revaluation" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Nueva revaluación</CardTitle>
              <CardDescription>
                Reexpresa saldos AR/AP/bancos en ME con la tasa de cierre.
                Postea Dr/Cr contra ganancia (4.2.01.001) o pérdida (5.3.01.001).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label>Fecha de valuación (cierre)</Label>
                  <Input type="date" value={valuationDate} onChange={(e) => setValuationDate(e.target.value)} />
                </div>
                <Button variant="secondary" onClick={() => previewMut.mutate()} disabled={previewMut.isPending}>
                  <Eye className="w-4 h-4 mr-2" /> Preview
                </Button>
                <Button onClick={() => runMut.mutate()} disabled={runMut.isPending || !preview}>
                  <Play className="w-4 h-4 mr-2" /> Postear asiento
                </Button>
              </div>

              {preview && (
                <div className="space-y-4 pt-4 border-t">
                  <div className="grid grid-cols-3 gap-3">
                    <Card><CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-green-600">
                        <TrendingUp className="w-4 h-4" />
                        <p className="text-xs text-muted-foreground">Ganancia</p>
                      </div>
                      <p className="text-2xl font-bold text-green-600 font-mono">
                        RD$ {money(preview.totalGain)}
                      </p>
                    </CardContent></Card>
                    <Card><CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-red-600">
                        <TrendingDown className="w-4 h-4" />
                        <p className="text-xs text-muted-foreground">Pérdida</p>
                      </div>
                      <p className="text-2xl font-bold text-red-600 font-mono">
                        RD$ {money(preview.totalLoss)}
                      </p>
                    </CardContent></Card>
                    <Card><CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground">Impacto neto</p>
                      <p className={`text-2xl font-bold font-mono ${preview.netImpact >= 0 ? "text-green-600" : "text-red-600"}`}>
                        RD$ {money(preview.netImpact)}
                      </p>
                    </CardContent></Card>
                  </div>

                  <Card>
                    <CardHeader><CardTitle className="text-base">Resumen por moneda y subledger</CardTitle></CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Moneda</TableHead>
                            <TableHead>Subledger</TableHead>
                            <TableHead className="text-right">Tasa cierre</TableHead>
                            <TableHead className="text-right">Ítems</TableHead>
                            <TableHead className="text-right">DOP libros</TableHead>
                            <TableHead className="text-right">DOP revaluado</TableHead>
                            <TableHead className="text-right">Diferencia</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.byCurrency.map((c: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono">{c.currency}</TableCell>
                              <TableCell><Badge variant="outline">{c.subledger.toUpperCase()}</Badge></TableCell>
                              <TableCell className="text-right font-mono">{rate(c.closingRate)}</TableCell>
                              <TableCell className="text-right">{c.itemCount}</TableCell>
                              <TableCell className="text-right font-mono">{money(c.ledgerDop)}</TableCell>
                              <TableCell className="text-right font-mono">{money(c.revaluedDop)}</TableCell>
                              <TableCell className={`text-right font-mono font-bold ${c.difference > 0 ? "text-green-600" : c.difference < 0 ? "text-red-600" : ""}`}>
                                {c.difference > 0 ? "+" : ""}{money(c.difference)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  {preview.items.length > 0 && (
                    <Card>
                      <CardHeader><CardTitle className="text-base">Detalle por partida ({preview.items.length})</CardTitle></CardHeader>
                      <CardContent className="max-h-80 overflow-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Sub</TableHead>
                              <TableHead>Ref</TableHead>
                              <TableHead>Cta</TableHead>
                              <TableHead>Moneda</TableHead>
                              <TableHead className="text-right">Saldo ME</TableHead>
                              <TableHead className="text-right">DOP libro</TableHead>
                              <TableHead className="text-right">DOP nuevo</TableHead>
                              <TableHead className="text-right">Diff</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {preview.items.slice(0, 100).map((it: any, i: number) => (
                              <TableRow key={i}>
                                <TableCell><Badge variant="outline" className="text-xs">{it.subledger}</Badge></TableCell>
                                <TableCell className="font-mono text-xs">#{it.referenceId}</TableCell>
                                <TableCell className="font-mono text-xs">{it.controlAccountCode ?? "—"}</TableCell>
                                <TableCell className="font-mono">{it.currency}</TableCell>
                                <TableCell className="text-right font-mono">{money(it.balanceCcy)}</TableCell>
                                <TableCell className="text-right font-mono">{money(it.ledgerBalanceDop)}</TableCell>
                                <TableCell className="text-right font-mono">{money(it.revaluedDop)}</TableCell>
                                <TableCell className={`text-right font-mono ${it.difference > 0 ? "text-green-600" : it.difference < 0 ? "text-red-600" : ""}`}>
                                  {it.difference > 0 ? "+" : ""}{money(it.difference)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        {preview.items.length > 100 && (
                          <p className="text-xs text-muted-foreground pt-2 text-center">
                            Mostrando 100 de {preview.items.length} partidas
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Corridas históricas</CardTitle>
              <CardDescription>Cada cierre mensual quedó auditable con su asiento</CardDescription>
            </CardHeader>
            <CardContent>
              {runs.data?.rows?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha valuación</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Ganancia</TableHead>
                      <TableHead className="text-right">Pérdida</TableHead>
                      <TableHead className="text-right">Impacto neto</TableHead>
                      <TableHead>Asiento</TableHead>
                      <TableHead>Posteado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.data.rows.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.valuationDate}</TableCell>
                        <TableCell>
                          <Badge className={r.status === "posted" ? "bg-green-600" : "bg-yellow-500"}>
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-green-600">{money(r.totalGain)}</TableCell>
                        <TableCell className="text-right font-mono text-red-600">{money(r.totalLoss)}</TableCell>
                        <TableCell className={`text-right font-mono font-bold ${Number(r.netImpact) >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {money(r.netImpact)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.journalEntryId ? `#${r.journalEntryId}` : "—"}</TableCell>
                        <TableCell className="text-xs">{r.postedAt ? new Date(r.postedAt).toLocaleString("es-DO") : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">Sin corridas históricas</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={openRate} onOpenChange={setOpenRate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva tasa de cambio</DialogTitle>
            <DialogDescription>
              Registra la tasa oficial del banco central o de tu banco preferido
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fecha *</Label>
                <Input type="date" value={rateForm.rateDate} onChange={(e) => setRateForm({ ...rateForm, rateDate: e.target.value })} />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={rateForm.rateType} onValueChange={(v) => setRateForm({ ...rateForm, rateType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spot">Spot (día)</SelectItem>
                    <SelectItem value="closing">Closing (cierre)</SelectItem>
                    <SelectItem value="avg">Avg (promedio)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>De</Label>
                <Input value={rateForm.fromCurrency} onChange={(e) => setRateForm({ ...rateForm, fromCurrency: e.target.value.toUpperCase() })} maxLength={3} />
              </div>
              <div>
                <Label>A</Label>
                <Input value={rateForm.toCurrency} onChange={(e) => setRateForm({ ...rateForm, toCurrency: e.target.value.toUpperCase() })} maxLength={3} />
              </div>
              <div>
                <Label>Tasa</Label>
                <Input type="number" step="0.0001" value={rateForm.rate} onChange={(e) => setRateForm({ ...rateForm, rate: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label>Fuente (opcional)</Label>
              <Input value={rateForm.source} onChange={(e) => setRateForm({ ...rateForm, source: e.target.value })} placeholder="Banco Central, BHD, Popular..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenRate(false)}>Cancelar</Button>
            <Button onClick={() => addRate.mutate()} disabled={!rateForm.rate || addRate.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
