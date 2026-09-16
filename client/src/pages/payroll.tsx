import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { moduleApi } from "@/lib/accounting-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Play, Plus } from "lucide-react";
import { DataGrid, PageHeader, StatusChip, amount, money, type Column, type Status } from "@/components/erp";

interface Employee { id: number; name: string; base_salary: string }
interface Payslip {
  id: number; name: string; gross_salary: string;
  afp_employee: string; sfs_employee: string; isr: string; other_deductions: string; net_pay: string;
  lines: PayslipLine[] | null;
}
interface PayslipLine { code: string; name: string; kind: string; quantity: string | null; amount: string; account: string }
interface PayrollRun {
  id: number; fiscal_year: number; month: number; status: "draft" | "posted";
  paid_at: string | null; gross_total: string; net_total: string; employer_total: string;
  employees: number; isr_total: string; entry_no: string | null; entry_date: string | null;
  paid_kinds: string[];
}
interface EntryLine { line_no: number; account_code: string; account_name: string; debit: string; credit: string }
interface Ir3Row { code: string; name: string; cedula: string | null; gross_salary: string; isr_base: string; isr: string }

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const period = (r: { fiscal_year: number; month: number }) => `${MONTHS[r.month - 1]} ${r.fiscal_year}`;

/**
 * Una corrida contabilizada todavía le debe el neto a los empleados hasta que
 * tesorería la paga: por eso "por pagar" va en ámbar y sólo "pagada" en verde.
 */
function runState(r: PayrollRun): { status: Status; label: string } {
  if (r.status === "draft") return { status: "draft", label: "Borrador" };
  if (r.paid_at) return { status: "ok", label: "Pagada" };
  return { status: "pending", label: "Por pagar" };
}

const sumOf = <T,>(rows: T[], pick: (r: T) => string | null | undefined) =>
  rows.reduce((s, r) => s + Number(pick(r) ?? 0), 0);

const KIND_LABELS: Record<string, string> = {
  earning: "Ingreso",
  statutory: "Retención de ley",
  deduction: "Descuento",
  employer: "Aporte patronal",
};

const EMPLOYEE_COLUMNS: Column<Employee>[] = [
  { key: "name", header: "Empleado", cell: (e) => e.name },
  { key: "salary", header: "Salario base", align: "right", width: "180px", cell: (e) => amount(e.base_salary) },
];

const RUN_COLUMNS: Column<PayrollRun>[] = [
  { key: "period", header: "Período", cell: (r) => <span className="font-medium">{period(r)}</span> },
  {
    key: "status", header: "Estado", width: "120px",
    cell: (r) => { const s = runState(r); return <StatusChip status={s.status}>{s.label}</StatusChip>; },
  },
  { key: "employees", header: "Empleados", align: "right", width: "100px", cell: (r) => r.employees },
  { key: "gross", header: "Bruto", align: "right", cell: (r) => amount(r.gross_total) },
  { key: "net", header: "Neto", align: "right", cell: (r) => <span className="font-semibold">{amount(r.net_total)}</span> },
  { key: "entry", header: "Asiento", width: "130px", cell: (r) => <span className="font-mono text-[12px]">{r.entry_no ?? "—"}</span> },
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
  { key: "other", header: "Descuentos", align: "right", cell: (p) => amount(p.other_deductions) },
  { key: "net", header: "Neto", align: "right", cell: (p) => <span className="font-semibold">{amount(p.net_pay)}</span> },
];

const LINE_COLUMNS: Column<PayslipLine>[] = [
  { key: "name", header: "Concepto", cell: (l) => l.name },
  { key: "kind", header: "Tipo", width: "150px", cell: (l) => <span className="text-muted-foreground">{KIND_LABELS[l.kind] ?? l.kind}</span> },
  { key: "qty", header: "Cantidad", align: "right", width: "100px", cell: (l) => (l.quantity == null ? "—" : Number(l.quantity)) },
  { key: "amount", header: "Monto", align: "right", width: "140px", cell: (l) => amount(l.amount) },
  { key: "account", header: "Cuenta", width: "120px", cell: (l) => <span className="font-mono text-[12px]">{l.account}</span> },
];

const ENTRY_COLUMNS: Column<EntryLine>[] = [
  { key: "code", header: "Cuenta", width: "130px", cell: (l) => <span className="font-mono text-[12px]">{l.account_code}</span> },
  { key: "name", header: "Descripción", cell: (l) => l.account_name },
  { key: "debit", header: "Débito", align: "right", width: "150px", cell: (l) => (Number(l.debit) ? amount(l.debit) : "") },
  { key: "credit", header: "Crédito", align: "right", width: "150px", cell: (l) => (Number(l.credit) ? amount(l.credit) : "") },
];

const IR3_COLUMNS: Column<Ir3Row>[] = [
  { key: "code", header: "Código", width: "100px", cell: (r) => <span className="font-mono text-[12px]">{r.code}</span> },
  { key: "name", header: "Empleado", cell: (r) => r.name },
  { key: "cedula", header: "Cédula", width: "140px", cell: (r) => r.cedula ?? "—" },
  { key: "gross", header: "Salario", align: "right", cell: (r) => amount(r.gross_salary) },
  { key: "base", header: "Base ISR", align: "right", cell: (r) => amount(r.isr_base) },
  { key: "isr", header: "ISR retenido", align: "right", cell: (r) => amount(r.isr) },
];

export default function PayrollPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [salary, setSalary] = useState("");
  const now = new Date();
  const [year] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [historyYear, setHistoryYear] = useState(now.getFullYear());
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  const emps = useQuery({ queryKey: ["/api/modules/payroll/employees"], queryFn: () => moduleApi.employees() });
  const runs = useQuery({
    queryKey: ["/api/modules/payroll/runs", historyYear],
    queryFn: () => moduleApi.payrollRuns(historyYear),
  });
  const runRows = (runs.data?.runs ?? []) as PayrollRun[];
  const selectedRun = runRows.find((r) => r.id === selectedRunId) ?? null;

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
      qc.invalidateQueries({ queryKey: ["/api/modules/payroll/runs"] });
      setHistoryYear(year);
      setSelectedRunId(r.runId);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "No se pudo procesar", description: e.message }),
  });

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="space-y-4">
      <PageHeader subtitle="Empleados, retenciones de ley y recibos del mes" />

      <Card>
        <CardHeader><CardTitle>Empleados</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
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
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
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
          <p className="text-[13px] text-muted-foreground">
            Calcula los volantes del mes, contabiliza el asiento y la corrida queda en el historial de abajo.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle>Historial de nóminas</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted-foreground">Año</span>
            <Select
              value={String(historyYear)}
              onValueChange={(v) => { setHistoryYear(Number(v)); setSelectedRunId(null); }}
            >
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <DataGrid
            columns={RUN_COLUMNS}
            rows={runRows}
            rowKey={(r) => r.id}
            isLoading={runs.isLoading}
            emptyMessage={`No hay nóminas procesadas en ${historyYear}.`}
            onRowClick={(r) => setSelectedRunId(r.id === selectedRunId ? null : r.id)}
            isRowSelected={(r) => r.id === selectedRunId}
            totals={runRows.length > 1 ? {
              gross: amount(sumOf(runRows, (r) => r.gross_total)),
              net: amount(sumOf(runRows, (r) => r.net_total)),
            } : undefined}
            totalsLabel={`Total ${historyYear}`}
          />
          {selectedRun ? (
            <RunDetail run={selectedRun} />
          ) : (
            runRows.length > 0 && (
              <p className="text-center text-[13px] text-muted-foreground">
                Selecciona una nómina para ver sus volantes, el asiento y las retenciones.
              </p>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── detalle de una corrida ─────────────────────────────────────────────────

function RunDetail({ run }: { run: PayrollRun }) {
  const deductions = Number(run.gross_total) - Number(run.net_total);
  const state = runState(run);
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold">
          Nómina de {period(run)} <StatusChip status={state.status} className="ml-1 align-middle">{state.label}</StatusChip>
        </h3>
        {run.entry_no && (
          <span className="text-[12.5px] text-muted-foreground">
            Asiento <span className="font-mono">{run.entry_no}</span> del {run.entry_date}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="Bruto" value={money(run.gross_total)} />
        <Figure label="Retenciones y descuentos" value={money(deductions)} />
        <Figure label="Neto a pagar" value={money(run.net_total)} strong />
        <Figure label="Aportes patronales" value={money(run.employer_total)} />
      </div>

      <Tabs defaultValue="payslips">
        <TabsList>
          <TabsTrigger value="payslips">Volantes</TabsTrigger>
          <TabsTrigger value="entry">Asiento contable</TabsTrigger>
          <TabsTrigger value="statutory">Retenciones de ley (IR-3)</TabsTrigger>
        </TabsList>
        <TabsContent value="payslips"><PayslipsTab runId={run.id} /></TabsContent>
        <TabsContent value="entry"><EntryTab runId={run.id} /></TabsContent>
        <TabsContent value="statutory"><StatutoryTab run={run} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="border border-border bg-subtle px-3 py-2">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className={`tabular-nums ${strong ? "text-[15px] font-semibold" : "text-[14px]"}`}>{value}</p>
    </div>
  );
}

function PayslipsTab({ runId }: { runId: number }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const q = useQuery({ queryKey: ["payslips", runId], queryFn: () => moduleApi.payslips(runId) });
  const rows = (q.data?.payslips ?? []) as Payslip[];
  const selected = rows.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="space-y-3">
      <DataGrid
        columns={PAYSLIP_COLUMNS}
        rows={rows}
        rowKey={(p) => p.id}
        isLoading={q.isLoading}
        emptyMessage="La corrida no generó volantes."
        onRowClick={(p) => setSelectedId(p.id === selectedId ? null : p.id)}
        isRowSelected={(p) => p.id === selectedId}
        totalsLabel="Total"
        totals={{
          gross: amount(sumOf(rows, (p) => p.gross_salary)),
          afp: amount(sumOf(rows, (p) => p.afp_employee)),
          sfs: amount(sumOf(rows, (p) => p.sfs_employee)),
          isr: amount(sumOf(rows, (p) => p.isr)),
          other: amount(sumOf(rows, (p) => p.other_deductions)),
          net: amount(sumOf(rows, (p) => p.net_pay)),
        }}
      />
      {selected ? (
        <div className="space-y-2">
          <p className="text-[13px] font-medium">Volante de {selected.name}</p>
          <DataGrid
            columns={LINE_COLUMNS}
            rows={selected.lines ?? []}
            rowKey={(l, i) => `${l.code}-${i}`}
            emptyMessage="Este volante no tiene conceptos."
          />
        </div>
      ) : (
        rows.length > 0 && (
          <p className="text-center text-[12.5px] text-muted-foreground">Selecciona un empleado para ver su volante por concepto.</p>
        )
      )}
    </div>
  );
}

function EntryTab({ runId }: { runId: number }) {
  const q = useQuery({
    queryKey: ["/api/modules/payroll/runs", runId, "entry"],
    queryFn: () => moduleApi.payrollRunEntry(runId),
  });
  const entry = q.data?.entry;
  if (!q.isLoading && !entry) {
    return <p className="py-6 text-center text-[13px] text-muted-foreground">Esta nómina está en borrador: todavía no tiene asiento.</p>;
  }
  const lines = (entry?.lines ?? []) as EntryLine[];
  return (
    <div className="space-y-2">
      {entry && (
        <p className="text-[12.5px] text-muted-foreground">
          <span className="font-mono">{entry.entryNo}</span> · {entry.entryDate} · {entry.memo}
        </p>
      )}
      <DataGrid
        columns={ENTRY_COLUMNS}
        rows={lines}
        rowKey={(l) => l.line_no}
        isLoading={q.isLoading}
        totalsLabel="Total"
        totals={{
          debit: amount(sumOf(lines, (l) => l.debit)),
          credit: amount(sumOf(lines, (l) => l.credit)),
        }}
      />
    </div>
  );
}

const STATUTORY: { kind: "tss" | "infotep" | "isr_salaries"; label: string; hint: string }[] = [
  { kind: "tss", label: "TSS", hint: "AFP, SFS y riesgos laborales (empleado + empleador)" },
  { kind: "infotep", label: "INFOTEP", hint: "1% de la nómina" },
  { kind: "isr_salaries", label: "ISR asalariados", hint: "Se declara en el IR-3" },
];

function StatutoryTab({ run }: { run: PayrollRun }) {
  const owed = useQuery({
    queryKey: ["/api/modules/payroll/statutory", run.fiscal_year, run.month],
    queryFn: () => moduleApi.payrollStatutory(run.fiscal_year, run.month),
  });
  const ir3 = useQuery({
    queryKey: ["/api/modules/payroll/ir3", run.fiscal_year, run.month],
    queryFn: () => moduleApi.payrollIr3(run.fiscal_year, run.month),
  });

  if (run.status === "draft") {
    return (
      <p className="py-6 text-center text-[13px] text-muted-foreground">
        Las retenciones se cuentan cuando la nómina se contabiliza. Esta corrida sigue en borrador.
      </p>
    );
  }
  const ir3Rows = (ir3.data?.employees ?? []) as Ir3Row[];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {STATUTORY.map((s) => {
          const paid = run.paid_kinds.includes(s.kind);
          return (
            <div key={s.kind} className="border border-border bg-card px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-medium">{s.label}</p>
                <StatusChip status={paid ? "ok" : "pending"}>{paid ? "Pagado" : "Por pagar"}</StatusChip>
              </div>
              <p className="mt-1 text-[15px] font-semibold tabular-nums">
                {owed.isLoading ? "…" : money(owed.data?.[s.kind])}
              </p>
              <p className="text-[12px] text-muted-foreground">{s.hint}</p>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        <p className="text-[13px] font-medium">
          IR-3 · período {ir3.data?.period ?? `${run.fiscal_year}${String(run.month).padStart(2, "0")}`}
        </p>
        <DataGrid
          columns={IR3_COLUMNS}
          rows={ir3Rows}
          rowKey={(r) => r.code}
          isLoading={ir3.isLoading}
          emptyMessage="No hay retenciones de ISR en este período."
          totalsLabel="Total retenido"
          totals={{
            gross: amount(sumOf(ir3Rows, (r) => r.gross_salary)),
            isr: amount(ir3.data?.totalRetained),
          }}
        />
      </div>
    </div>
  );
}
