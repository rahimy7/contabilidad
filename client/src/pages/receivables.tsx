import { useQuery } from "@tanstack/react-query";
import { subledgerApi } from "@/lib/accounting-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataGrid, PageHeader, StatusChip, amount, type Column, type Status } from "@/components/erp";

/**
 * Cuentas por cobrar: antigüedad de saldos y partidas abiertas.
 *
 * Las dos rejillas alinean los importes a la derecha y en cifras tabulares —
 * la antigüedad se lee comparando columnas entre sí, y eso sólo funciona si los
 * dígitos ocupan lo mismo.
 */

/** Estado de una partida, en el vocabulario del cobrador y no en el de la tabla. */
const STATUS: Record<string, { label: string; status: Status }> = {
  open: { label: "Abierta", status: "pending" },
  partial: { label: "Abonada", status: "pending" },
  paid: { label: "Saldada", status: "ok" },
  overdue: { label: "Vencida", status: "overdue" },
  void: { label: "Anulada", status: "void" },
};

interface AgingRow {
  customer_id?: number | string | null;
  current: string; d1_30: string; d31_60: string; d61_90: string; d90_plus: string; total: string;
}

interface OpenItem {
  id: number;
  due_date: string;
  original_amount: string;
  balance: string;
  status: string;
}

const bucket = (key: keyof AgingRow, header: string): Column<AgingRow> => ({
  key: String(key),
  header,
  align: "right",
  cell: (r) => amount(r[key] as string),
});

export default function ReceivablesPage() {
  const items = useQuery({
    queryKey: ["/api/subledgers/ar/open-items"],
    queryFn: () => subledgerApi.arOpenItems(),
  });
  const aging = useQuery({
    queryKey: ["/api/subledgers/ar/aging"],
    queryFn: () => subledgerApi.arAging(),
  });

  const agingColumns: Column<AgingRow>[] = [
    { key: "customer", header: "Cliente", cell: (r) => r.customer_id ?? "—" },
    bucket("current", "Corriente"),
    bucket("d1_30", "1–30"),
    bucket("d31_60", "31–60"),
    bucket("d61_90", "61–90"),
    bucket("d90_plus", "90+"),
    {
      key: "total", header: "Total", align: "right",
      cell: (r) => <span className="font-semibold">{amount(r.total)}</span>,
    },
  ];

  const itemColumns: Column<OpenItem>[] = [
    { key: "due", header: "Vencimiento", width: "130px", cell: (r) => String(r.due_date).slice(0, 10) },
    { key: "original", header: "Original", align: "right", cell: (r) => amount(r.original_amount) },
    { key: "balance", header: "Saldo", align: "right", cell: (r) => <span className="font-medium">{amount(r.balance)}</span> },
    {
      key: "status", header: "Estado", width: "110px",
      cell: (r) => {
        const s = STATUS[r.status] ?? { label: r.status, status: "draft" as Status };
        return <StatusChip status={s.status}>{s.label}</StatusChip>;
      },
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader subtitle="Saldos pendientes de cobro, en pesos dominicanos" />

      <Card>
        <CardHeader><CardTitle>Antigüedad de saldos</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataGrid
            className="border-0"
            columns={agingColumns}
            rows={(aging.data?.aging ?? []) as AgingRow[]}
            rowKey={(_, i) => i}
            isLoading={aging.isLoading}
            emptyMessage="Sin saldos pendientes."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Partidas abiertas</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataGrid
            className="border-0"
            columns={itemColumns}
            rows={(items.data?.items ?? []) as OpenItem[]}
            rowKey={(r) => r.id}
            isLoading={items.isLoading}
            emptyMessage="No hay partidas abiertas."
          />
        </CardContent>
      </Card>
    </div>
  );
}
