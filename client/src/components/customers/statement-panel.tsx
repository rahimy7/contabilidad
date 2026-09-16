import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { DataGrid, StatusChip, amount, moneyShort, type Column, type Status } from "@/components/erp";
import { Skeleton } from "@/components/ui/skeleton";
import { customersApi, customerKeys, type CustomerStatement } from "@/lib/customers-api";
import { fmtDate } from "./fields";

type OpenItem = CustomerStatement["openItems"][number];
type Doc = CustomerStatement["documents"][number];
type Receipt = CustomerStatement["receipts"][number];

const DOC_TYPE: Record<string, string> = { invoice: "Factura", credit_note: "Nota de crédito", debit_note: "Nota de débito" };
const DOC_STATUS: Record<string, { label: string; status: Status }> = {
  issued: { label: "Emitida", status: "ok" },
  draft: { label: "Borrador", status: "draft" },
  cancelled: { label: "Anulada", status: "void" },
};
const METHOD: Record<string, string> = { cash: "Efectivo", transfer: "Transferencia", card: "Tarjeta", check: "Cheque", credit: "Crédito" };

/** Estado de cuenta del cliente en la empresa activa. */
export function StatementPanel({ customerId }: { customerId: number }) {
  const q = useQuery({
    queryKey: customerKeys.statement(customerId),
    queryFn: () => customersApi.statement(customerId),
  });

  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError || !q.data) {
    return <p className="text-[12px] text-destructive">No se pudo cargar el estado de cuenta.</p>;
  }
  const { aging, openItems, documents, receipts } = q.data;

  const buckets: [string, string, boolean][] = [
    ["Corriente", aging.current, false],
    ["1–30 días", aging.d1_30, true],
    ["31–60 días", aging.d31_60, true],
    ["61–90 días", aging.d61_90, true],
    ["Más de 90", aging.d90_plus, true],
  ];

  const itemColumns: Column<OpenItem>[] = [
    { key: "ncf", header: "Comprobante", cell: (r) => <span className="font-mono text-[12px]">{r.ncf ?? `Partida ${r.id}`}</span> },
    { key: "issue", header: "Emisión", width: "110px", cell: (r) => fmtDate(r.issueDate) },
    { key: "due", header: "Vence", width: "110px", cell: (r) => fmtDate(r.dueDate) },
    {
      key: "days", header: "Atraso", align: "right", width: "80px",
      cell: (r) => (r.daysOverdue > 0 ? <span className="text-destructive">{r.daysOverdue} d</span> : "—"),
    },
    { key: "original", header: "Original", align: "right", cell: (r) => amount(r.originalAmount) },
    { key: "balance", header: "Saldo", align: "right", cell: (r) => <span className="font-medium">{amount(r.balance)}</span> },
    {
      key: "status", header: "Estado", width: "100px",
      cell: (r) => r.daysOverdue > 0
        ? <StatusChip status="overdue">Vencida</StatusChip>
        : <StatusChip status="pending">{r.status === "partial" ? "Abonada" : "Abierta"}</StatusChip>,
    },
  ];

  const docColumns: Column<Doc>[] = [
    { key: "date", header: "Fecha", width: "110px", cell: (d) => fmtDate(d.documentDate) },
    { key: "type", header: "Tipo", width: "120px", cell: (d) => DOC_TYPE[d.docType] ?? d.docType },
    { key: "ncf", header: "NCF", cell: (d) => <span className="font-mono text-[12px]">{d.ncf ?? "—"}</span> },
    { key: "method", header: "Condición", cell: (d) => (d.paymentMethod ? METHOD[d.paymentMethod] ?? d.paymentMethod : "—") },
    { key: "due", header: "Vence", width: "110px", cell: (d) => fmtDate(d.dueDate) ?? "—" },
    {
      key: "total", header: "Total", align: "right",
      cell: (d) => <span className={d.docType === "credit_note" ? "text-destructive" : ""}>{d.docType === "credit_note" ? "−" : ""}{amount(d.total)}</span>,
    },
    { key: "status", header: "Estado", width: "90px", cell: (d) => { const s = DOC_STATUS[d.status] ?? { label: d.status, status: "draft" as Status }; return <StatusChip status={s.status}>{s.label}</StatusChip>; } },
  ];

  const receiptColumns: Column<Receipt>[] = [
    { key: "date", header: "Fecha", width: "110px", cell: (r) => fmtDate(r.receiptDate) },
    { key: "method", header: "Forma de pago", cell: (r) => METHOD[r.method] ?? r.method },
    { key: "ref", header: "Referencia", cell: (r) => r.reference ?? "—" },
    { key: "amount", header: "Monto", align: "right", cell: (r) => amount(r.amount) },
  ];

  return (
    <div className="space-y-4">
      <section className="border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border bg-subtle px-4 py-2">
          <h3 className="text-[13px] font-semibold">Antigüedad del saldo</h3>
          <Link href="/receivables" className="text-[12px] text-primary hover:underline">› Cuentas por cobrar</Link>
        </header>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-3 lg:grid-cols-6">
          {buckets.map(([label, value, late]) => (
            <div key={label}>
              <p className="text-[11.5px] text-muted-foreground">{label}</p>
              <p className={`text-[15px] font-medium tabular-nums ${late && Number(value) > 0 ? "text-destructive" : ""}`}>{moneyShort(value)}</p>
            </div>
          ))}
          <div>
            <p className="text-[11.5px] text-muted-foreground">Total</p>
            <p className="text-[15px] font-semibold tabular-nums">{moneyShort(aging.total)}</p>
          </div>
        </div>
      </section>

      <div>
        <h3 className="mb-1.5 text-[13px] font-semibold">Partidas abiertas</h3>
        <DataGrid
          columns={itemColumns}
          rows={openItems}
          rowKey={(r) => r.id}
          emptyMessage="El cliente no tiene saldos pendientes."
          totals={openItems.length > 0 ? { balance: amount(aging.total) } : undefined}
          totalsLabel="Saldo total"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <div>
          <h3 className="mb-1.5 text-[13px] font-semibold">Comprobantes emitidos</h3>
          <DataGrid columns={docColumns} rows={documents} rowKey={(d) => d.id} emptyMessage="Sin comprobantes." />
        </div>
        <div>
          <h3 className="mb-1.5 text-[13px] font-semibold">Cobros recibidos</h3>
          <DataGrid columns={receiptColumns} rows={receipts} rowKey={(r) => r.id} emptyMessage="Sin cobros registrados." />
        </div>
      </div>
    </div>
  );
}
