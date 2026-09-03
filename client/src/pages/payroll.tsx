import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { moduleApi } from "@/lib/accounting-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Play, Plus } from "lucide-react";
import { DataGrid, PageHeader, amount, money, type Column } from "@/components/erp";

interface Employee { id: number; name: string; base_salary: string }
interface Payslip {
  id: number; name: string; gross_salary: string;
  afp_employee: string; sfs_employee: string; isr: string; net_pay: string;
}

const EMPLOYEE_COLUMNS: Column<Employee>[] = [
  { key: "name", header: "Empleado", cell: (e) => e.name },
  { key: "salary", header: "Salario base", align: "right", width: "180px", cell: (e) => amount(e.base_salary) },
];

/**
 * Las tres retenciones van entre el bruto y el neto, en ese orden: es la
 * secuencia del cálculo, así que la fila se lee de izquierda a derecha como se
 * hizo la cuenta y el neto queda donde termina.
 */
const PAYSLIP_COLUMNS: Column<Payslip>[] = [
  { key: "name", header: "Empleado", cell: (p) => p.name },
  { key: "gross", header: "Bruto", align: "right", cell: (p) => amount(p.gross_salary) },
  { key: "afp", header: "AFP", align: "right", cell: (p) => amount(p.afp_employee) },
  { key: "sfs", header: "SFS", align: "right", cell: (p) => amount(p.sfs_employee) },
  { key: "isr", header: "ISR", align: "right", cell: (p) => amount(p.isr) },
  { key: "net", header: "Neto", align: "right", cell: (p) => <span className="font-semibold">{amount(p.net_pay)}</span> },
];

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
    <div className="space-y-4">
      <PageHeader subtitle="Empleados, retenciones de ley y recibos del mes" />

      <Card>
        <CardHeader><CardTitle>Empleados</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
            <Input placeholder="Salario base" value={salary} onChange={(e) => setSalary(e.target.value)} className="max-w-[160px]" />
            <Button className="gap-1" disabled={!name || !salary || addEmp.isPending} onClick={() => addEmp.mutate()}>
              <Plus className="h-4 w-4" /> Agregar
            </Button>
          </div>
          <DataGrid
            columns={EMPLOYEE_COLUMNS}
            rows={(emps.data?.employees ?? []) as Employee[]}
            rowKey={(e) => e.id}
            isLoading={emps.isLoading}
            emptyMessage="Todavía no hay empleados registrados."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Procesar nómina</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted-foreground">Mes</span>
            <Input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-20" />
            <Button className="gap-1" disabled={run.isPending} onClick={() => run.mutate()}>
              <Play className="h-4 w-4" /> Procesar {month}/{year}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {payslips.data && (
            <DataGrid
              columns={PAYSLIP_COLUMNS}
              rows={payslips.data.payslips as Payslip[]}
              rowKey={(p) => p.id}
              isLoading={payslips.isLoading}
              emptyMessage="La corrida no generó recibos."
            />
          )}
          {!payslips.data && <p className="py-6 text-center text-[13px] text-muted-foreground">Procesa la nómina del mes para ver los recibos.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
