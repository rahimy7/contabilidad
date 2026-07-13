import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/accounting-api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle } from "lucide-react";

/** Formats a decimal string as DOP money, blank for zero to keep the grid quiet. */
const money = (v: string) => {
  const n = Number(v);
  if (!n) return "";
  return n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function TrialBalancePage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/accounting/trial-balance", year],
    queryFn: () => accountingApi.trialBalance(year),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Balance de Comprobación</h1>
          <p className="text-sm text-muted-foreground">Sumas y saldos por cuenta</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Año</label>
          <Input
            type="number"
            className="w-24"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          {data && (
            <Badge variant={data.balanced ? "secondary" : "destructive"} className="gap-1">
              {data.balanced ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5" />
              )}
              {data.balanced ? "Cuadrado" : "Descuadrado"}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-muted-foreground">Cargando…</p>}
          {error && <p className="text-destructive">No se pudo cargar el balance.</p>}
          {data && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Código</th>
                    <th className="py-2 pr-4 font-medium">Cuenta</th>
                    <th className="py-2 pr-4 text-right font-medium">Débito</th>
                    <th className="py-2 pr-4 text-right font-medium">Crédito</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.code} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-1.5 pr-4 font-mono text-xs text-muted-foreground">{r.code}</td>
                      <td className="py-1.5 pr-4">{r.name}</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums">{money(r.debit)}</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums">{money(r.credit)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="py-2 pr-4" colSpan={2}>
                      Totales
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{money(data.totalDebit)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{money(data.totalCredit)}</td>
                  </tr>
                </tfoot>
              </table>
              {data.rows.length === 0 && (
                <p className="py-6 text-center text-muted-foreground">
                  No hay movimientos contables en {year}.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
