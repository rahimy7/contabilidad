import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { accountingApi, Account } from "@/lib/accounting-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";

/**
 * Read-only view of the chart of accounts. The code carries the hierarchy, so
 * indentation is derived from its depth rather than from a nested query.
 */
const TYPE_LABEL: Record<string, string> = {
  asset: "Activo",
  liability: "Pasivo",
  equity: "Patrimonio",
  income: "Ingreso",
  expense: "Gasto",
};

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
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Plan de Cuentas</h1>
          <p className="text-sm text-muted-foreground">Catálogo contable de la empresa</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="relative max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por código o nombre…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-muted-foreground">Cargando…</p>}
          {error && <p className="text-destructive">No se pudo cargar el plan de cuentas.</p>}
          {!isLoading && !error && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Código</th>
                    <th className="py-2 pr-4 font-medium">Cuenta</th>
                    <th className="py-2 pr-4 font-medium">Tipo</th>
                    <th className="py-2 pr-4 font-medium">Naturaleza</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a: Account) => {
                    const depth = a.code.split(".").length - 1;
                    return (
                      <tr key={a.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="py-1.5 pr-4 font-mono text-xs text-muted-foreground">{a.code}</td>
                        <td className="py-1.5 pr-4" style={{ paddingLeft: `${depth * 16}px` }}>
                          <span className={a.is_postable ? "" : "font-medium"}>{a.name}</span>
                        </td>
                        <td className="py-1.5 pr-4">{TYPE_LABEL[a.account_type] ?? a.account_type}</td>
                        <td className="py-1.5 pr-4">
                          {a.is_postable ? (
                            <Badge variant="secondary">Movimiento</Badge>
                          ) : (
                            <Badge variant="outline">Agrupación</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {accounts.length === 0 && (
                <p className="py-6 text-center text-muted-foreground">Sin resultados.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
