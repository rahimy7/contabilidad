import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { accountingApi, StatementSection } from "@/lib/accounting-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle } from "lucide-react";

const money = (v: string) =>
  Number(v).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Section({ section }: { section: StatementSection }) {
  return (
    <div className="mb-4">
      <div className="mb-1 text-sm font-semibold text-muted-foreground">{section.title}</div>
      <table className="w-full text-sm">
        <tbody>
          {section.lines.map((l) => (
            <tr key={l.code} className="border-b last:border-0">
              <td className="py-1 pr-2 font-mono text-xs text-muted-foreground">{l.code}</td>
              <td className="py-1 pr-2">{l.name}</td>
              <td className="py-1 text-right tabular-nums">{money(l.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t font-semibold">
            <td colSpan={2} className="py-1.5">
              Total {section.title}
            </td>
            <td className="py-1.5 text-right tabular-nums">{money(section.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function FinancialStatementsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [tab, setTab] = useState<"bs" | "is">("bs");

  const bs = useQuery({
    queryKey: ["/api/accounting/balance-sheet", year],
    queryFn: () => accountingApi.balanceSheet(year),
    enabled: tab === "bs",
  });
  const is = useQuery({
    queryKey: ["/api/accounting/income-statement", year],
    queryFn: () => accountingApi.incomeStatement(year),
    enabled: tab === "is",
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Estados Financieros</h1>
          <p className="text-sm text-muted-foreground">Balance General y Estado de Resultados</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <Button size="sm" variant={tab === "bs" ? "default" : "outline"} onClick={() => setTab("bs")}>
              Balance General
            </Button>
            <Button size="sm" variant={tab === "is" ? "default" : "outline"} onClick={() => setTab("is")}>
              Estado de Resultados
            </Button>
          </div>
          <Input type="number" className="w-24" value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </div>
      </div>

      {tab === "bs" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Balance General {year}</CardTitle>
            {bs.data && (
              <Badge variant={bs.data.balanced ? "secondary" : "destructive"} className="gap-1">
                {bs.data.balanced ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {bs.data.balanced ? "Cuadrado" : `Descuadre ${money(bs.data.imbalance)}`}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            {bs.isLoading && <p className="text-muted-foreground">Cargando…</p>}
            {bs.data && (
              <>
                <Section section={bs.data.assets} />
                <div>
                  <Section section={bs.data.liabilities} />
                  <Section section={bs.data.equity} />
                  <div className="flex justify-between border-t pt-2 text-sm font-semibold">
                    <span>Resultado del ejercicio</span>
                    <span className="tabular-nums">{money(bs.data.netIncome)}</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "is" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Estado de Resultados {year}</CardTitle>
          </CardHeader>
          <CardContent>
            {is.isLoading && <p className="text-muted-foreground">Cargando…</p>}
            {is.data && (
              <div className="max-w-xl">
                <Section section={is.data.income} />
                <Section section={is.data.expenses} />
                <div className="flex justify-between border-t-2 pt-2 text-base font-bold">
                  <span>{Number(is.data.netIncome) >= 0 ? "Utilidad" : "Pérdida"} del ejercicio</span>
                  <span className="tabular-nums">{money(is.data.netIncome)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
