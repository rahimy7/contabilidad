import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  DataGrid, FilterBar, KpiHeadline, KpiRow, PageHeader, StatusChip, amount, moneyShort, type Column,
} from "@/components/erp";
import { customersApi, customerKeys, type CustomerListRow } from "@/lib/customers-api";
import { CreditChip } from "@/components/customers/fields";
import { CREDIT_LINE_STATUS, TAXPAYER_TYPES, formatTaxId } from "@shared/customer-fiscal";

/**
 * Maestro de clientes.
 *
 * La rejilla responde lo que pregunta quien vende a crédito: quién es el cliente
 * ante la DGII, qué comprobante le toca, cuánto se le fió y cuánto le queda.
 * Abrir una fila lleva a la ficha completa; nada se edita desde aquí.
 */

export default function CustomersPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [credit, setCredit] = useState("all");
  const [typesOpen, setTypesOpen] = useState(false);

  const params = { status: status === "all" ? undefined : status, credit: credit === "all" ? undefined : credit };
  const list = useQuery({
    queryKey: [...customerKeys.list, params],
    queryFn: () => customersApi.list(params),
  });

  const rows = useMemo(() => {
    const all = list.data?.rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    const digits = q.replace(/\D/g, "");
    return all.filter(
      (r) =>
        [r.name, r.legalName, r.tradeName, r.code, r.phone, r.email].some((v) => v?.toLowerCase().includes(q)) ||
        (digits.length > 0 && r.rnc?.includes(digits)),
    );
  }, [list.data, search]);

  const kpis = useMemo(() => {
    const all = list.data?.rows ?? [];
    const sum = (f: (r: CustomerListRow) => string) => all.reduce((s, r) => s + Number(f(r)), 0);
    return {
      count: all.length,
      withCredit: all.filter((r) => r.creditStatus === "active").length,
      balance: sum((r) => r.balance),
      overdue: sum((r) => r.overdue),
      overdueCount: all.filter((r) => Number(r.overdue) > 0).length,
      pending: all.filter((r) => r.pendingApplicationId).length,
    };
  }, [list.data]);

  const columns: Column<CustomerListRow>[] = [
    { key: "code", header: "Código", width: "96px", cell: (r) => <span className="font-mono text-[12px]">{r.code ?? "—"}</span> },
    {
      key: "name", header: "Cliente",
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{r.name}</div>
          {r.legalName && r.legalName !== r.name && (
            <div className="truncate text-[11.5px] text-muted-foreground">{r.legalName}</div>
          )}
        </div>
      ),
    },
    {
      key: "rnc", header: "RNC / Cédula", width: "130px",
      cell: (r) => <span className="tabular-nums">{r.rnc ? formatTaxId(r.rnc) : r.foreignId ?? "—"}</span>,
    },
    {
      key: "regime", header: "Régimen", width: "150px",
      cell: (r) => (
        <div className="text-[12px] leading-tight">
          <div className="truncate">{TAXPAYER_TYPES[r.taxpayerType]?.label.split(" (")[0] ?? r.taxpayerType}</div>
          {r.defaultNcfType && <div className="text-muted-foreground">{r.defaultNcfType}</div>}
        </div>
      ),
    },
    { key: "phone", header: "Teléfono", width: "120px", cell: (r) => r.phone },
    { key: "rep", header: "Vendedor", width: "130px", cell: (r) => <span className="truncate">{r.salesRepName ?? "—"}</span> },
    { key: "limit", header: "Límite", align: "right", width: "110px", cell: (r) => (Number(r.creditLimit) > 0 ? amount(r.creditLimit) : "—") },
    {
      key: "balance", header: "Saldo", align: "right", width: "120px",
      cell: (r) => (
        <div className="leading-tight">
          <div>{Number(r.balance) > 0 ? amount(r.balance) : "—"}</div>
          {Number(r.overdue) > 0 && (
            <div className="text-[11px] text-destructive">Vencido {amount(r.overdue)}</div>
          )}
        </div>
      ),
    },
    {
      key: "available", header: "Disponible", align: "right", width: "110px",
      cell: (r) => (r.creditStatus === "active" ? amount(r.available) : "—"),
    },
    { key: "credit", header: "Crédito", width: "128px", className: "whitespace-nowrap", cell: (r) => <CreditChip status={r.creditStatus} pending={!!r.pendingApplicationId} /> },
    {
      key: "status", header: "Estado", width: "84px",
      cell: (r) => <StatusChip status={r.isActive ? "ok" : "void"}>{r.isActive ? "Activo" : "Inactivo"}</StatusChip>,
    },
  ];

  const exportCsv = () => {
    const header = ["Código", "Nombre", "Razón social", "RNC/Cédula", "Régimen", "NCF", "Teléfono", "Correo", "Provincia", "Vendedor", "Límite", "Plazo", "Saldo", "Vencido", "Disponible", "Crédito", "Estado"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = rows.map((r) => [
      r.code, r.name, r.legalName, r.rnc ?? r.foreignId, TAXPAYER_TYPES[r.taxpayerType]?.label, r.defaultNcfType, r.phone,
      r.email, r.province, r.salesRepName, r.creditLimit, r.creditDays, r.balance, r.overdue, r.available,
      CREDIT_LINE_STATUS[r.creditStatus], r.isActive ? "Activo" : "Inactivo",
    ].map(esc).join(","));
    const blob = new Blob(["\uFEFF" + [header.map(esc).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Clientes"
        subtitle="Identidad fiscal, condiciones comerciales y líneas de crédito"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTypesOpen(true)}>
              <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Tipos de cliente
            </Button>
            <Button size="sm" onClick={() => navigate("/customers/new")}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Nuevo cliente
            </Button>
          </>
        }
      />

      <KpiRow>
        <KpiHeadline label="Clientes en la vista" value={String(kpis.count)} isLoading={list.isLoading} />
        <KpiHeadline label="Con línea de crédito activa" value={String(kpis.withCredit)} tone="neutral" isLoading={list.isLoading} />
        <KpiHeadline label="Saldo por cobrar" value={moneyShort(kpis.balance)} isLoading={list.isLoading} />
        <KpiHeadline
          label="Saldo vencido"
          value={moneyShort(kpis.overdue)}
          tone={kpis.overdue > 0 ? "bad" : "good"}
          hint={kpis.overdueCount > 0 ? `${kpis.overdueCount} cliente(s) con vencidos` : "Sin vencidos"}
          isLoading={list.isLoading}
        />
        <KpiHeadline
          label="Solicitudes de crédito en evaluación"
          value={String(kpis.pending)}
          tone={kpis.pending > 0 ? "watch" : "neutral"}
          href={kpis.pending > 0 ? "/approvals" : undefined}
          hint={kpis.pending > 0 ? "Ir a aprobaciones" : undefined}
          isLoading={list.isLoading}
        />
      </KpiRow>

      <div>
        <FilterBar search={search} onSearchChange={setSearch} placeholder="Nombre, código, RNC o teléfono">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Activos</SelectItem>
              <SelectItem value="inactive">Inactivos</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={credit} onValueChange={setCredit}>
            <SelectTrigger className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Crédito: todos</SelectItem>
              <SelectItem value="active">Línea activa</SelectItem>
              <SelectItem value="pending">En evaluación</SelectItem>
              <SelectItem value="overdue">Con saldo vencido</SelectItem>
              <SelectItem value="suspended">Suspendidos</SelectItem>
              <SelectItem value="blocked">Bloqueados</SelectItem>
              <SelectItem value="none">Sin crédito</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-[12px] text-muted-foreground">{rows.length} cliente(s)</span>
        </FilterBar>

        <div className="overflow-x-auto">
          <DataGrid
            className="min-w-[1100px]"
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            isLoading={list.isLoading}
            onRowClick={(r) => navigate(`/customers/${r.id}`)}
            emptyMessage={search ? "Ningún cliente coincide con la búsqueda." : "No hay clientes en esta vista."}
            totals={
              rows.length > 1
                ? {
                    balance: amount(rows.reduce((s, r) => s + Number(r.balance), 0)),
                    available: amount(rows.filter((r) => r.creditStatus === "active").reduce((s, r) => s + Number(r.available), 0)),
                  }
                : undefined
            }
            totalsLabel="Totales"
          />
        </div>
        {list.isError && (
          <p className="mt-2 text-[12px] text-destructive">No se pudo cargar la lista: {(list.error as Error).message}</p>
        )}
      </div>

      <CustomerTypesDialog open={typesOpen} onOpenChange={setTypesOpen} />
    </div>
  );
}

interface CustomerType {
  id: number;
  name: string;
  description?: string | null;
  discountPercentage: string;
}

/** Clasificación comercial del cliente (el POS aplica su descuento). */
function CustomerTypesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [discount, setDiscount] = useState("0");

  const types = useQuery<CustomerType[]>({
    queryKey: ["customer-types"],
    queryFn: () => apiRequest<CustomerType[]>("GET", "/api/customer-types"),
    enabled: open,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["customer-types"] });
    qc.invalidateQueries({ queryKey: ["/api/customer-master/lookups"] });
  };

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/customer-types", { name: name.trim(), discountPercentage: discount || "0" }),
    onSuccess: () => {
      setName("");
      setDiscount("0");
      refresh();
    },
    onError: (e: Error) => toast({ title: "No se pudo crear el tipo", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/customer-types/${id}`),
    onSuccess: refresh,
    onError: (e: Error) => toast({ title: "No se pudo eliminar", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tipos de cliente</DialogTitle>
          <DialogDescription>Clasificación comercial. El descuento se aplica en el punto de venta.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[260px] overflow-y-auto border border-border">
          {(types.data ?? []).length === 0 ? (
            <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">
              {types.isLoading ? "Cargando…" : "Sin tipos definidos."}
            </p>
          ) : (
            (types.data ?? []).map((t) => (
              <div key={t.id} className="flex items-center justify-between border-b border-border px-3 py-2 text-[13px] last:border-b-0">
                <span>{t.name}</span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums text-muted-foreground">{Number(t.discountPercentage).toFixed(2)}%</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove.mutate(t.id)} aria-label={`Eliminar ${t.name}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </div>
            ))
          )}
        </div>
        <div className="grid grid-cols-[1fr_110px] gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mayorista" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Descuento %</Label>
            <Input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          <Button onClick={() => create.mutate()} disabled={name.trim().length < 2 || create.isPending}>Agregar tipo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
