import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { HeartPulse, Calculator, Send, FileText } from "lucide-react";

const NOVEDAD_LABELS: Record<string, string> = {
  "1": "Alta de empleado",
  "2": "Baja de empleado",
  "3": "Cambio de salario",
  "4": "Licencia con sueldo",
  "5": "Licencia sin sueldo",
  "6": "Suspensión",
  "7": "Vacaciones",
  "8": "Ausencia",
  "9": "Cambio de ARS/AFP",
};

const money = (v: number | string) =>
  Number(v).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Cálculo TSS + gestión de novedades SUIR+ + submissions mensuales. */
export default function HrTssPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [salary, setSalary] = useState("50000");
  const [computed, setComputed] = useState<any>(null);

  const { data: afps } = useQuery({
    queryKey: ["/api/hr/tss/afp-funds"],
    queryFn: () => apiRequest("GET", "/api/hr/tss/afp-funds"),
  });
  const { data: ars } = useQuery({
    queryKey: ["/api/hr/tss/ars-providers"],
    queryFn: () => apiRequest("GET", "/api/hr/tss/ars-providers"),
  });
  const { data: novedades } = useQuery({
    queryKey: ["/api/hr/tss/novedades", year, month],
    queryFn: () => apiRequest("GET", `/api/hr/tss/novedades?year=${year}&month=${month}`),
  });
  const { data: preview } = useQuery({
    queryKey: ["/api/hr/tss/submissions/preview", year, month],
    queryFn: () => apiRequest("GET", `/api/hr/tss/submissions/preview?year=${year}&month=${month}`),
  });

  const computeMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/hr/tss/compute", { grossSalary: Number(salary) }),
    onSuccess: (data) => setComputed(data),
  });

  const submitMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/hr/tss/submissions", { periodYear: year, periodMonth: month }),
    onSuccess: () => {
      toast({ title: "Submission generada", description: `Período ${month}/${year}` });
      qc.invalidateQueries({ queryKey: ["/api/hr/tss/submissions/preview"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <HeartPulse className="w-8 h-8 text-red-500" />
        <div>
          <h1 className="text-2xl font-bold">TSS y Seguridad Social</h1>
          <p className="text-muted-foreground">Aportes AFP/SFS, novedades SUIR+, submissions mensuales</p>
        </div>
      </div>

      <Tabs defaultValue="compute">
        <TabsList>
          <TabsTrigger value="compute"><Calculator className="w-4 h-4 mr-2" />Calculadora</TabsTrigger>
          <TabsTrigger value="novedades"><FileText className="w-4 h-4 mr-2" />Novedades</TabsTrigger>
          <TabsTrigger value="submissions"><Send className="w-4 h-4 mr-2" />Submissions</TabsTrigger>
          <TabsTrigger value="providers">AFP / ARS</TabsTrigger>
        </TabsList>

        <TabsContent value="compute" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Calculadora de aportes TSS</CardTitle>
              <CardDescription>
                Ley 87-01 · AFP 2.87%/7.10% · SFS 3.04%/7.09% · INFOTEP 1% · SRL 1.30%
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label>Salario bruto mensual (DOP)</Label>
                  <Input
                    type="number"
                    value={salary}
                    onChange={(e) => setSalary(e.target.value)}
                    data-testid="input-tss-salary"
                  />
                </div>
                <Button onClick={() => computeMut.mutate()} disabled={computeMut.isPending}>
                  Calcular
                </Button>
              </div>

              {computed && (
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-sm font-medium mb-2">Empleado</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span>AFP (2.87%)</span><span className="font-mono">RD$ {money(computed.afpEmployee)}</span></div>
                      <div className="flex justify-between"><span>SFS (3.04%)</span><span className="font-mono">RD$ {money(computed.sfsEmployee)}</span></div>
                      <div className="flex justify-between font-semibold pt-1 border-t"><span>Total</span><span className="font-mono">RD$ {money(computed.totalEmployee)}</span></div>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Empleador</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span>AFP (7.10%)</span><span className="font-mono">RD$ {money(computed.afpEmployer)}</span></div>
                      <div className="flex justify-between"><span>SFS (7.09%)</span><span className="font-mono">RD$ {money(computed.sfsEmployer)}</span></div>
                      <div className="flex justify-between"><span>INFOTEP (1%)</span><span className="font-mono">RD$ {money(computed.infotep)}</span></div>
                      <div className="flex justify-between"><span>SRL (1.30%)</span><span className="font-mono">RD$ {money(computed.srl)}</span></div>
                      <div className="flex justify-between font-semibold pt-1 border-t"><span>Total</span><span className="font-mono">RD$ {money(computed.totalEmployer)}</span></div>
                    </div>
                  </div>
                  <div className="col-span-2 flex justify-between font-bold text-lg pt-4 border-t">
                    <span>Total a pagar TSS</span>
                    <span className="font-mono">RD$ {money(computed.totalToTss)}</span>
                  </div>
                  {(computed.afpBase !== Number(salary) || computed.sfsBase !== Number(salary)) && (
                    <div className="col-span-2 text-xs text-muted-foreground pt-2">
                      Base capada — AFP: RD$ {money(computed.afpBase)} · SFS: RD$ {money(computed.sfsBase)}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="novedades" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Novedades del período</CardTitle>
                  <CardDescription>Cambios reportables a SUIR+ (códigos 1-9)</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }).map((_, i) => (
                        <SelectItem key={i} value={String(i + 1)}>{i + 1}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    className="w-24"
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {novedades?.rows?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empleado</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Fecha efectiva</TableHead>
                      <TableHead className="text-right">Salario anterior</TableHead>
                      <TableHead className="text-right">Salario nuevo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {novedades.rows.map((n: any) => (
                      <TableRow key={n.id}>
                        <TableCell>#{n.employeeId}</TableCell>
                        <TableCell><Badge variant="outline">{n.novedadCode}</Badge></TableCell>
                        <TableCell>{NOVEDAD_LABELS[n.novedadCode] ?? "—"}</TableCell>
                        <TableCell>{n.effectiveDate}</TableCell>
                        <TableCell className="text-right font-mono">{n.oldSalary ? money(n.oldSalary) : "—"}</TableCell>
                        <TableCell className="text-right font-mono">{n.newSalary ? money(n.newSalary) : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">Sin novedades para este período</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="submissions" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Preview de submission SUIR+</CardTitle>
                  <CardDescription>Período {String(month).padStart(2, "0")}/{year}</CardDescription>
                </div>
                <Button onClick={() => submitMut.mutate()} disabled={submitMut.isPending || !preview?.employees?.length}>
                  <Send className="w-4 h-4 mr-2" /> Generar submission
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {preview?.totals && (
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Empleados</p><p className="text-2xl font-bold">{preview.employees?.length ?? 0}</p></CardContent></Card>
                  <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total empleado</p><p className="text-2xl font-bold font-mono">RD$ {money(preview.totals.totalEmployee ?? 0)}</p></CardContent></Card>
                  <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total empleador</p><p className="text-2xl font-bold font-mono">RD$ {money(preview.totals.totalEmployer ?? 0)}</p></CardContent></Card>
                  <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total TSS</p><p className="text-2xl font-bold font-mono text-red-600">RD$ {money(preview.totals.totalToTss ?? 0)}</p></CardContent></Card>
                </div>
              )}
              {preview?.employees?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empleado</TableHead>
                      <TableHead className="text-right">Salario</TableHead>
                      <TableHead className="text-right">Empleado</TableHead>
                      <TableHead className="text-right">Empleador</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.employees.map((e: any) => (
                      <TableRow key={e.employeeId}>
                        <TableCell>{e.fullName ?? `#${e.employeeId}`}</TableCell>
                        <TableCell className="text-right font-mono">{money(e.grossSalary)}</TableCell>
                        <TableCell className="text-right font-mono">{money(e.totalEmployee)}</TableCell>
                        <TableCell className="text-right font-mono">{money(e.totalEmployer)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{money(e.totalToTss)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">Sin datos para este período</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="providers" className="grid grid-cols-2 gap-4 mt-4">
          <Card>
            <CardHeader><CardTitle>Fondos AFP</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {afps?.rows?.map((f: any) => (
                  <div key={f.id} className="flex justify-between p-2 rounded border">
                    <span>{f.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{f.sipenCode ?? "—"}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Proveedores ARS</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {ars?.rows?.map((a: any) => (
                  <div key={a.id} className="flex justify-between p-2 rounded border">
                    <span className="flex items-center gap-2">
                      {a.name}
                      {a.isPublic && <Badge variant="outline" className="text-xs">Pública</Badge>}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">{a.sisalrilCode ?? "—"}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
