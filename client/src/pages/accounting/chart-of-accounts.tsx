import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { accountingApi, Account } from "@/lib/accounting-api";
import { Card, CardContent } from "@/components/ui/card";
import { DataGrid, FilterBar, PageHeader, StatusChip, type Column } from "@/components/erp";

/**
 * Plan de cuentas, sólo lectura.
 *
 * El código lleva la jerarquía, así que la sangría sale de su profundidad y no
 * de una consulta anidada. Una cuenta de agrupación va en seminegrita: es la
 * señal de que no admite asientos, y verlo antes de intentar postear ahorra el
 * error.
 */
const TYPE_LABEL: Record<string, string> = {
  asset: "Activo",
  liability: "Pasivo",
  equity: "Patrimonio",
  income: "Ingreso",
  expense: "Gasto",
};

const COLUMNS: Column<Account>[] = [
  {
    key: "code", header: "Código", width: "150px",
    cell: (a) => <span className="font-mono text-[12px] text-muted-foreground">{a.code}</span>,
  },
  {
    key: "name", header: "Cuenta",
    cell: (a) => (
      <span
        className={a.is_postable ? "" : "font-semibold"}
        style={{ paddingLeft: `${(a.code.split(".").length - 1) * 16}px` }}
      >
        {a.name}
      </span>
    ),
  },
  {
    key: "type", header: "Tipo", width: "130px",
    cell: (a) => TYPE_LABEL[a.account_type] ?? a.account_type,
  },
  {
    key: "nature", header: "Naturaleza", width: "130px",
    cell: (a) =>
      a.is_postable
        ? <StatusChip status="ok">Movimiento</StatusChip>
        : <StatusChip status="draft">Agrupación</StatusChip>,
  },
];

export default function ChartOfAccountsPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/accounting/accounts"],
    queryFn: () => accountingApi.accounts(),
  });

  const accounts = (data?.accounts ?? []).filter(
    (a) => a.code.includes(search) || a.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <PageHeader subtitle="Catálogo contable de la empresa" />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Buscar por código o nombre…"
        actions={
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {accounts.length} de {data?.accounts.length ?? 0} cuentas
          </span>
        }
      />

      {error ? (
        <Card>
          <CardContent className="py-8 text-center text-[13px] text-destructive">
            No se pudo cargar el plan de cuentas.
          </CardContent>
        </Card>
      ) : (
        <DataGrid
          columns={COLUMNS}
          rows={accounts}
          rowKey={(a) => a.id}
          isLoading={isLoading}
          emptyMessage={search ? "Ninguna cuenta coincide." : "El plan de cuentas está vacío."}
        />
      )}
    </div>
  );
}
