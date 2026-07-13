import { useQuery } from "@tanstack/react-query";
import { subledgerApi } from "@/lib/accounting-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const money = (v: string | number) =>
  Number(v ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReceivablesPage() {
  const items = useQuery({ queryKey: ["/api/subledgers/ar/open-items"], queryFn: () => subledgerApi.arOpenItems() });
  const aging = useQuery({ queryKey: ["/api/subledgers/ar/aging"], queryFn: () => subledgerApi.arAging() });

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Cuentas por Cobrar</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">Antigüedad de saldos</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1.5">Cliente</th><th className="py-1.5 text-right">Corriente</th>
                <th className="py-1.5 text-right">1-30</th><th className="py-1.5 text-right">31-60</th>
                <th className="py-1.5 text-right">61-90</th><th className="py-1.5 text-right">90+</th>
                <th className="py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {(aging.data?.aging ?? []).map((a, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1.5">{a.customer_id ?? "—"}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(a.current)}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(a.d1_30)}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(a.d31_60)}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(a.d61_90)}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(a.d90_plus)}</td>
                  <td className="py-1.5 text-right font-medium tabular-nums">{money(a.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(aging.data?.aging ?? []).length === 0 && <p className="py-4 text-center text-muted-foreground">Sin saldos pendientes.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Partidas abiertas</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1.5">Vencimiento</th><th className="py-1.5 text-right">Original</th><th className="py-1.5 text-right">Saldo</th><th className="py-1.5">Estado</th></tr></thead>
            <tbody>
              {(items.data?.items ?? []).map((it) => (
                <tr key={it.id} className="border-b last:border-0">
                  <td className="py-1.5">{String(it.due_date).slice(0, 10)}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(it.original_amount)}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(it.balance)}</td>
                  <td className="py-1.5"><Badge variant={it.status === "partial" ? "outline" : "secondary"}>{it.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
