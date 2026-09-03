import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { subledgerApi } from "@/lib/accounting-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import { DataGrid, PageHeader, StatusChip, amount, type Column, type Status } from "@/components/erp";

/** Estado de una partida, en el vocabulario de quien paga. */
const STATUS: Record<string, { label: string; status: Status }> = {
  open: { label: "Abierta", status: "pending" },
  partial: { label: "Abonada", status: "pending" },
  paid: { label: "Saldada", status: "ok" },
  overdue: { label: "Vencida", status: "overdue" },
  void: { label: "Anulada", status: "void" },
};

interface OpenItem {
  id: number;
  due_date: string;
  original_amount: string;
  balance: string;
  status: string;
}

const COLUMNS: Column<OpenItem>[] = [
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

export default function PayablesPage() {
  const [open, setOpen] = useState(false);
  const items = useQuery({ queryKey: ["/api/subledgers/ap/open-items"], queryFn: () => subledgerApi.apOpenItems() });

  return (
    <div className="space-y-4">
      <PageHeader
        subtitle="Facturas de proveedor pendientes de pago"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Factura de compra</Button>
            </DialogTrigger>
            <SupplierInvoiceDialog onDone={() => setOpen(false)} />
          </Dialog>
        }
      />

      <Card>
        <CardHeader><CardTitle>Partidas abiertas</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataGrid
            className="border-0"
            columns={COLUMNS}
            rows={(items.data?.items ?? []) as OpenItem[]}
            rowKey={(r) => r.id}
            isLoading={items.isLoading}
            emptyMessage="Sin cuentas por pagar."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SupplierInvoiceDialog({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [rnc, setRnc] = useState("");
  const [ncf, setNcf] = useState("");
  const [amount, setAmount] = useState("");
  const [purchaseType, setPurchaseType] = useState("inventory");
  const [assetName, setAssetName] = useState("");
  const [assetLife, setAssetLife] = useState("36");

  const create = useMutation({
    mutationFn: () =>
      subledgerApi.registerSupplierInvoice({
        supplierRnc: rnc, ncf, ncfType: ncf.slice(0, 3) || "B01", date: today, dueDate: today,
        purchaseType,
        fixedAsset: purchaseType === "fixed_asset"
          ? { code: `FA${Date.now()}`, name: assetName || "Activo", usefulLifeMonths: Number(assetLife) || 36 }
          : undefined,
        lines: [{ description: "Compra", quantity: "1", unitPrice: amount, taxCode: "ITBIS18" }],
      }),
    onSuccess: () => {
      toast({ title: "Factura registrada" });
      qc.invalidateQueries({ queryKey: ["/api/subledgers/ap/open-items"] });
      onDone();
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Factura de compra</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <label className="block text-[13px]">RNC proveedor<Input value={rnc} onChange={(e) => setRnc(e.target.value.replace(/\D/g, ""))} /></label>
        <label className="block text-[13px]">NCF del proveedor<Input value={ncf} onChange={(e) => setNcf(e.target.value.toUpperCase())} placeholder="B0100000001" /></label>
        <label className="block text-[13px]">Monto (sin ITBIS)<Input value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="block text-[13px]">Tipo de compra
          <select value={purchaseType} onChange={(e) => setPurchaseType(e.target.value)} className="mt-1 block h-8 w-full rounded-sm border border-input bg-background px-2 text-[13px]">
            <option value="inventory">Mercancía para la venta</option>
            <option value="supply">Material gastable / suministro</option>
            <option value="fixed_asset">Activo fijo</option>
            <option value="service">Servicio</option>
            <option value="expense">Gasto</option>
          </select>
        </label>
        {purchaseType === "fixed_asset" && (
          <div className="flex gap-2">
            <label className="block flex-1 text-[13px]">Nombre del activo<Input value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder="Laptop" /></label>
            <label className="block w-32 text-[13px]">Vida (meses)<Input value={assetLife} onChange={(e) => setAssetLife(e.target.value)} /></label>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button disabled={!rnc || !ncf || !amount || create.isPending} onClick={() => create.mutate()}>Registrar</Button>
      </DialogFooter>
    </DialogContent>
  );
}
