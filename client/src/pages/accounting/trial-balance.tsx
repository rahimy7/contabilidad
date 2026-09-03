import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { accountingApi } from "@/lib/accounting-api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { DataGrid, PageHeader, type Column } from "@/components/erp";

/**
 * Balance de comprobación.
 *
 * El cero se deja en blanco a propósito: en una rejilla de cientos de cuentas,
 * una columna llena de "0.00" es ruido que esconde las cifras que sí hay.
 */
const money = (v: string) => {
  const n = Number(v);
  if (!n) return "";
  return n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

interface Row { code: string; name: string; debit: string; credit: string }

const COLUMNS: Column<Row>[] = [
  {
    key: "code", header: "Código", width: "150px",
    cell: (r) => <span className="font-mono text-[12px] text-muted-foreground">{r.code}</span>,
  },
  { key: "name", header: "Cuenta", cell: (r) => r.name },
  { key: "debit", header: "Débito", align: "right", width: "160px", cell: (r) => money(r.debit) },
  { key: "credit", header: "Crédito", align: "right", width: "160px", cell: (r) => money(r.credit) },
];

export default function TrialBalancePage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/accounting/trial-balance", year],
    queryFn: () => accountingApi.trialBalance(year),
  });

  return (
    <div className="space-y-3">
      <PageHeader
        subtitle="Sumas y saldos por cuenta"
        actions={
          <>
            {data && <BalanceChip balanced={data.balanced} />}
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
              Año
              <Input
                type="number"
                className="w-[88px]"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </label>
          </>
        }
      />

      {error ? (
        <Card>
          <CardContent className="py-8 text-center text-[13px] text-destructive">
            No se pudo cargar el balance.
          </CardContent>
        </Card>
      ) : (
        <DataGrid
          columns={COLUMNS}
          rows={(data?.rows ?? []) as Row[]}
          rowKey={(r) => r.code}
          isLoading={isLoading}
          emptyMessage={`No hay movimientos contables en ${year}.`}
          totalsLabel="Totales"
          totals={{
            debit: money(data?.totalDebit ?? "0"),
            credit: money(data?.totalCredit ?? "0"),
          }}
        />
      )}
    </div>
  );
}

/**
 * Cuadrado o descuadrado.
 *
 * Es lo primero que se mira al abrir la pantalla, así que va arriba y no al pie:
 * si el balance no cuadra, el resto de la rejilla no se lee todavía.
 */
function BalanceChip({ balanced }: { balanced: boolean }) {
  return (
    <span
      className={[
        "flex h-8 items-center gap-1.5 rounded-sm border px-2.5 text-[13px] font-medium",
        balanced
          ? "border-success/40 bg-success/10 text-success"
          : "border-destructive/40 bg-destructive/10 text-destructive",
      ].join(" ")}
    >
      {balanced ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      {balanced ? "Cuadrado" : "Descuadrado"}
    </span>
  );
}
