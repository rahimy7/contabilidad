import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { moduleApi } from "@/lib/accounting-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Play, Plus } from "lucide-react";

const money = (v: string | number) =>
  Number(v).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PayrollPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [salary, setSalary] = useState("");
  const now = new Date();
  const [year] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [lastRun, setLastRun] = useState<number | null>(null);

  const emps = useQuery({ queryKey: ["/api/modules/payroll/employees"], queryFn: () => moduleApi.employees() });
  const payslips = useQuery({
    queryKey: ["payslips", lastRun],
    queryFn: () => moduleApi.payslips(lastRun!),
    enabled: lastRun !== null,
  });

  const addEmp = useMutation({
    mutationFn: () => moduleApi.createEmployee({ code: `E${Date.now()}`, name, baseSalary: salary }),
    onSuccess: () => {
      toast({ title: "Empleado agregado" });
      setName(""); setSalary("");
      qc.invalidateQueries({ queryKey: ["/api/modules/payroll/employees"] });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const run = useMutation({
    mutationFn: () => moduleApi.runPayroll({ year, month, date: `${year}-${String(month).padStart(2, "0")}-28` }),
    onSuccess: (r: any) => {
      toast({ title: `Nómina procesada`, description: `${r.employees} empleados, neto ${money(r.netTotal)}` });
      setLastRun(r.runId);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "No se pudo procesar", description: e.message }),
  });

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Nómina</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">Empleados</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
            <Input placeholder="Salario base" value={salary} onChange={(e) => setSalary(e.target.value)} className="max-w-[160px]" />
            <Button size="sm" className="gap-1" disabled={!name || !salary || addEmp.isPending} onClick={() => addEmp.mutate()}>
              <Plus className="h-4 w-4" /> Agregar
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1.5">Empleado</th><th className="py-1.5 text-right">Salario</th></tr></thead>
            <tbody>
              {(emps.data?.employees ?? []).map((e) => (
                <tr key={e.id} className="border-b last:border-0"><td className="py-1.5">{e.name}</td><td className="py-1.5 text-right tabular-nums">{money(e.base_salary)}</td></tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-end justify-between">
          <CardTitle className="text-base">Procesar nómina</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Mes</span>
            <Input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-20" />
            <Button size="sm" className="gap-1" disabled={run.isPending} onClick={() => run.mutate()}>
              <Play className="h-4 w-4" /> Procesar {month}/{year}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {payslips.data && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5">Empleado</th><th className="py-1.5 text-right">Bruto</th>
                  <th className="py-1.5 text-right">AFP</th><th className="py-1.5 text-right">SFS</th>
                  <th className="py-1.5 text-right">ISR</th><th className="py-1.5 text-right">Neto</th>
                </tr>
              </thead>
              <tbody>
                {payslips.data.payslips.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-1.5">{p.name}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(p.gross_salary)}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(p.afp_employee)}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(p.sfs_employee)}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(p.isr)}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums">{money(p.net_pay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!payslips.data && <p className="text-muted-foreground">Procesa la nómina del mes para ver los recibos.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
