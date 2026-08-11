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
import { Coins, Plus, CheckCircle2 } from "lucide-react";

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-gray-500",
  approved: "bg-green-500",
  paid: "bg-blue-500",
};

const money = (v: string | number) =>
  Number(v || 0).toLocaleString("es-DO", { minimumFractionDigits: 2 });

export default function CommissionsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [previewUser, setPreviewUser] = useState<number | null>(null);
  const [openRule, setOpenRule] = useState(false);
  const [ruleForm, setRuleForm] = useState({
    code: "", name: "",
    calculationBase: "revenue",
    scopeType: "all_sellers",
    percentRate: 5,
    priority: 100,
  });

  const { data: rules } = useQuery({
    queryKey: ["/api/commissions/rules"],
    queryFn: () => apiRequest("GET", "/api/commissions/rules"),
  });

  const { data: earnings } = useQuery({
    queryKey: ["/api/commissions/earnings"],
    queryFn: () => apiRequest("GET", "/api/commissions/earnings"),
  });

  const { data: preview } = useQuery({
    queryKey: ["/api/commissions/preview", previewUser, year, month],
    queryFn: () => apiRequest("GET", `/api/commissions/preview?userId=${previewUser}&year=${year}&month=${month}`),
    enabled: previewUser != null,
  });

  const createRule = useMutation({
    mutationFn: () => apiRequest("POST", "/api/commissions/rules", {
      ...ruleForm, percentRate: Number(ruleForm.percentRate), priority: Number(ruleForm.priority),
    }),
    onSuccess: () => {
      toast({ title: "Regla creada" });
      setOpenRule(false);
      qc.invalidateQueries({ queryKey: ["/api/commissions/rules"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const approve = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/commissions/earnings/${id}/approve`),
    onSuccess: () => {
      toast({ title: "Comisión aprobada" });
      qc.invalidateQueries({ queryKey: ["/api/commissions/earnings"] });
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Coins className="w-8 h-8 text-yellow-500" />
        <div>
          <h1 className="text-2xl font-bold">Comisiones</h1>
          <p className="text-muted-foreground">Reglas de comisión y cierre mensual por vendedor</p>
        </div>
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Reglas</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="earnings">Ganancias</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setOpenRule(true)}><Plus className="w-4 h-4 mr-2" /> Nueva regla</Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Reglas de comisión</CardTitle>
              <CardDescription>Precedencia: producto → categoría → general</CardDescription>
            </CardHeader>
            <CardContent>
              {rules?.rows?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Base</TableHead>
                      <TableHead>Alcance</TableHead>
                      <TableHead className="text-right">% Tasa</TableHead>
                      <TableHead className="text-right">Meta</TableHead>
                      <TableHead className="text-right">Bonus</TableHead>
                      <TableHead>Prioridad</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.rows.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.code}</TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell><Badge variant="outline">{r.calculationBase}</Badge></TableCell>
                        <TableCell>{r.scopeType}</TableCell>
                        <TableCell className="text-right font-mono">{r.percentRate}%</TableCell>
                        <TableCell className="text-right font-mono">{Number(r.goalAmount) > 0 ? money(r.goalAmount) : "—"}</TableCell>
                        <TableCell className="text-right font-mono">{Number(r.bonusPercent) > 0 ? `${r.bonusPercent}%` : "—"}</TableCell>
                        <TableCell>{r.priority}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">No hay reglas definidas</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Preview de comisión por vendedor</CardTitle>
              <CardDescription>Muestra el cálculo sin cerrar el período (idempotente)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Usuario ID</Label>
                  <Input type="number" placeholder="ID de vendedor" onChange={(e) => setPreviewUser(Number(e.target.value) || null)} />
                </div>
                <div>
                  <Label>Mes</Label>
                  <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }).map((_, i) => (
                        <SelectItem key={i} value={String(i + 1)}>{i + 1}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Año</Label>
                  <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
                </div>
              </div>

              {preview && (
                <div className="grid grid-cols-4 gap-3 pt-4 border-t">
                  <div><p className="text-xs text-muted-foreground">Ingresos</p><p className="text-xl font-mono">RD$ {money(preview.totalRevenue ?? 0)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Comisión</p><p className="text-xl font-mono">RD$ {money(preview.commissionAmount ?? 0)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Bonus</p><p className="text-xl font-mono">RD$ {money(preview.bonusAmount ?? 0)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold font-mono text-green-600">RD$ {money(preview.totalEarned ?? 0)}</p></div>
                  {preview.goalAchieved && (
                    <div className="col-span-4 flex items-center gap-2 text-green-600">
                      <CheckCircle2 className="w-4 h-4" /> Meta alcanzada
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="earnings" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Comisiones cerradas</CardTitle>
              <CardDescription>Períodos cerrados, pendientes de aprobación o pago</CardDescription>
            </CardHeader>
            <CardContent>
              {earnings?.rows?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead className="text-right">Ingresos</TableHead>
                      <TableHead className="text-right">Comisión</TableHead>
                      <TableHead className="text-right">Bonus</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Meta</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {earnings.rows.map((e: any) => (
                      <TableRow key={e.id}>
                        <TableCell>#{e.userId}</TableCell>
                        <TableCell>{String(e.periodMonth).padStart(2, "0")}/{e.periodYear}</TableCell>
                        <TableCell className="text-right font-mono">{money(e.totalRevenue)}</TableCell>
                        <TableCell className="text-right font-mono">{money(e.commissionAmount)}</TableCell>
                        <TableCell className="text-right font-mono">{money(e.bonusAmount)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{money(e.totalEarned)}</TableCell>
                        <TableCell>{e.goalAchieved ? <Badge className="bg-green-600">Sí</Badge> : <Badge variant="secondary">No</Badge>}</TableCell>
                        <TableCell><Badge className={`${STATUS_COLOR[e.status]} text-white`}>{e.status}</Badge></TableCell>
                        <TableCell>
                          {e.status === "draft" && (
                            <Button size="sm" onClick={() => approve.mutate(e.id)}>Aprobar</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">Sin períodos cerrados</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={openRule} onOpenChange={setOpenRule}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva regla de comisión</DialogTitle>
            <DialogDescription>Define % sobre ingreso, margen o unidades</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Código *</Label>
                <Input value={ruleForm.code} onChange={(e) => setRuleForm({ ...ruleForm, code: e.target.value })} placeholder="COM-GEN-5" />
              </div>
              <div>
                <Label>Base de cálculo</Label>
                <Select value={ruleForm.calculationBase} onValueChange={(v) => setRuleForm({ ...ruleForm, calculationBase: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="revenue">Ingresos</SelectItem>
                    <SelectItem value="gross_margin">Margen bruto</SelectItem>
                    <SelectItem value="units">Unidades</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Nombre *</Label>
              <Input value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} placeholder="Comisión general 5%" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Alcance</Label>
                <Select value={ruleForm.scopeType} onValueChange={(v) => setRuleForm({ ...ruleForm, scopeType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_sellers">Todos</SelectItem>
                    <SelectItem value="by_user">Por usuario</SelectItem>
                    <SelectItem value="by_role">Por rol</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>% tasa</Label>
                <Input type="number" value={ruleForm.percentRate} onChange={(e) => setRuleForm({ ...ruleForm, percentRate: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Prioridad</Label>
                <Input type="number" value={ruleForm.priority} onChange={(e) => setRuleForm({ ...ruleForm, priority: Number(e.target.value) })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenRule(false)}>Cancelar</Button>
            <Button onClick={() => createRule.mutate()} disabled={!ruleForm.code || !ruleForm.name || createRule.isPending}>
              Crear regla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
