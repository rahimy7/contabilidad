import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { accountingApi, StatementSection } from "@/lib/accounting-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { DataGrid, PageHeader, type Column } from "@/components/erp";

/**
 * Balance General y Estado de Resultados.
 *
 * Cada sección es una rejilla con su propio pie de totales, alineado bajo la
 * columna de importes: un total que no cae exactamente bajo las cifras que suma
 * obliga a comprobarlo con el dedo.
 */
const money = (v: string) =>
  Number(v).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Line { code: string; name: string; amount: string }

const LINE_COLUMNS: Column<Line>[] = [
  {
    key: "code", header: "Código", width: "110px",
    cell: (l) => <span className="font-mono text-[12px] text-muted-foreground">{l.code}</span>,
  },
  { key: "name", header: "Cuenta", cell: (l) => l.name },
  { key: "amount", header: "Importe", align: "right", width: "150px", cell: (l) => money(l.amount) },
];

function Section({ section }: { section: StatementSection }) {
  return (
    <div className="mb-4">
      <h3 className="erp-label mb-1.5">{section.title}</h3>
      <DataGrid
        columns={LINE_COLUMNS}
        rows={section.lines as Line[]}
        rowKey={(l) => l.code}
        emptyMessage="Sin movimiento."
        totalsLabel={`Total ${section.title.toLowerCase()}`}
        totals={{ amount: money(section.total) }}
      />
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
    <div className="space-y-3">
      <PageHeader
        subtitle="Balance General y Estado de Resultados"
        actions={
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            Ejercicio
            <Input
              type="number"
              className="w-[88px]"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>
        }
      >
        <Tabs value={tab} onValueChange={(v) => setTab(v as "bs" | "is")}>
          <TabsList>
            <TabsTrigger value="bs">Balance General</TabsTrigger>
            <TabsTrigger value="is">Estado de Resultados</TabsTrigger>
          </TabsList>
        </Tabs>
      </PageHeader>

      {tab === "bs" && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Balance General {year}</CardTitle>
            {bs.data && (
              <BalanceChip
                balanced={bs.data.balanced}
                detail={bs.data.balanced ? "Cuadrado" : `Descuadre ${money(bs.data.imbalance)}`}
              />
            )}
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            {bs.isLoading && <p className="text-[13px] text-muted-foreground">Cargando…</p>}
            {bs.data && (
              <>
                <Section section={bs.data.assets} />
                <div>
                  <Section section={bs.data.liabilities} />
                  <Section section={bs.data.equity} />
                  <div className="flex items-center justify-between border-t border-border-strong pt-2 text-[13px] font-semibold">
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
          <CardHeader><CardTitle>Estado de Resultados {year}</CardTitle></CardHeader>
          <CardContent>
            {is.isLoading && <p className="text-[13px] text-muted-foreground">Cargando…</p>}
            {is.data && (
              <div className="max-w-2xl">
                <Section section={is.data.income} />
                <Section section={is.data.expenses} />
                <div className="flex items-baseline justify-between border-t-2 border-border-strong pt-2.5">
                  <span className="text-[13px] font-semibold">
                    {Number(is.data.netIncome) >= 0 ? "Utilidad" : "Pérdida"} del ejercicio
                  </span>
                  <span className="erp-figure-sm">{money(is.data.netIncome)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BalanceChip({ balanced, detail }: { balanced: boolean; detail: string }) {
  return (
    <span
      className={[
        "flex h-7 items-center gap-1.5 rounded-sm border px-2 text-[12px] font-medium tabular-nums",
        balanced
          ? "border-success/40 bg-success/10 text-success"
          : "border-destructive/40 bg-destructive/10 text-destructive",
      ].join(" ")}
    >
      {balanced ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {detail}
    </span>
  );
}
