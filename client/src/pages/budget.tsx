import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { moduleApi } from "@/lib/accounting-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const money = (v: string | number) =>
  Number(v ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Presupuesto</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">Presupuestar una cuenta (año {now.getFullYear()})</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <label className="text-sm">Cuenta<Input value={accountCode} onChange={(e) => setAccountCode(e.target.value)} className="w-40" /></label>
          <label className="text-sm">Monto mensual<Input value={monthly} onChange={(e) => setMonthly(e.target.value)} className="w-40" /></label>
          <Button size="sm" disabled={!monthly || create.isPending} onClick={() => create.mutate()}>Crear</Button>
          {budgetId && <Button size="sm" variant="outline" onClick={() => compare.mutate()}>Comparar vs real</Button>}
        </CardContent>
      </Card>

      {variance && (
        <Card>
          <CardHeader><CardTitle className="text-base">Presupuesto vs Real</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1.5">Cuenta</th><th className="py-1.5 text-right">Presupuesto</th><th className="py-1.5 text-right">Real</th><th className="py-1.5 text-right">Variación</th></tr></thead>
              <tbody>
                {variance.rows.map((r) => (
                  <tr key={r.code} className="border-b last:border-0">
                    <td className="py-1.5">{r.name}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(r.budget)}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(r.actual)}</td>
                    <td className={`py-1.5 text-right tabular-nums ${Number(r.variance) < 0 ? "text-destructive" : ""}`}>{money(r.variance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t-2 font-semibold"><td className="py-1.5">Total</td><td className="py-1.5 text-right tabular-nums">{money(variance.totalBudget)}</td><td className="py-1.5 text-right tabular-nums">{money(variance.totalActual)}</td><td /></tr></tfoot>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
