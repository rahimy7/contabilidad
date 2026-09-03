import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { moduleApi } from "@/lib/accounting-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { DataGrid, PageHeader, amount, type Column } from "@/components/erp";

interface VarianceRow { code: string; name: string; budget: string; actual: string; variance: string }

/**
 * La variación negativa va en rojo: gastar por encima de lo presupuestado es
 * la lectura que exige acción, y es la única celda de la rejilla que necesita
 * color para encontrarse sin leer el resto.
 */
const COLUMNS: Column<VarianceRow>[] = [
  { key: "name", header: "Cuenta", cell: (r) => r.name },
  { key: "budget", header: "Presupuesto", align: "right", cell: (r) => amount(r.budget) },
  { key: "actual", header: "Real", align: "right", cell: (r) => amount(r.actual) },
  {
    key: "variance", header: "Variación", align: "right",
    cell: (r) => (
      <span className={Number(r.variance) < 0 ? "font-medium text-destructive" : ""}>
        {amount(r.variance)}
      </span>
    ),
  },
];

/**
 * Minimal budget page: create a one-account annual budget and view the
 * budget-vs-actual variance. A fuller line editor is a follow-up; the API
 * already supports many lines per account and cost centre.
 */
export default function BudgetPage() {
  const { toast } = useToast();
  const now = new Date();
  const [accountCode, setAccountCode] = useState("5.2.02.001");
  const [monthly, setMonthly] = useState("");
  const [budgetId, setBudgetId] = useState<number | null>(null);
  const [variance, setVariance] = useState<{ rows: any[]; totalBudget: string; totalActual: string } | null>(null);

  const create = useMutation({
    mutationFn: () =>
      moduleApi.createBudget({
        name: `Presupuesto ${now.getFullYear()} ${accountCode}`,
        fiscalYear: now.getFullYear(),
        lines: Array.from({ length: 12 }, (_, i) => ({ accountCode, periodNo: i + 1, amount: monthly })),
      }),
    onSuccess: (r) => { setBudgetId(r.id); toast({ title: "Presupuesto creado" }); },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const compare = useMutation({
    mutationFn: () => moduleApi.variance(budgetId!),
    onSuccess: (r) => setVariance(r),
  });

  return (
    <div className="space-y-4">
      <PageHeader subtitle="Presupuesto anual por cuenta y su comparación contra lo real" />

      <Card>
        <CardHeader><CardTitle>Presupuestar una cuenta (año {now.getFullYear()})</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <label className="text-[13px]">Cuenta<Input value={accountCode} onChange={(e) => setAccountCode(e.target.value)} className="w-40" /></label>
          <label className="text-[13px]">Monto mensual<Input value={monthly} onChange={(e) => setMonthly(e.target.value)} className="w-40" /></label>
          <Button disabled={!monthly || create.isPending} onClick={() => create.mutate()}>Crear</Button>
          {budgetId && <Button variant="outline" onClick={() => compare.mutate()}>Comparar vs real</Button>}
        </CardContent>
      </Card>

      {variance && (
        <Card>
          <CardHeader><CardTitle>Presupuesto vs Real</CardTitle></CardHeader>
          <CardContent className="p-0">
            <DataGrid
              className="border-0"
              columns={COLUMNS}
              rows={variance.rows as VarianceRow[]}
              rowKey={(r) => r.code}
              emptyMessage="El presupuesto no tiene líneas."
              totalsLabel="Total"
              totals={{
                budget: amount(variance.totalBudget),
                actual: amount(variance.totalActual),
              }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
