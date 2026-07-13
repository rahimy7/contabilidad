import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { subledgerApi } from "@/lib/accounting-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";

const money = (v: string | number) =>
  Number(v ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PayablesPage() {
  const [open, setOpen] = useState(false);
  const items = useQuery({ queryKey: ["/api/subledgers/ap/open-items"], queryFn: () => subledgerApi.apOpenItems() });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cuentas por Pagar</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> Factura de compra</Button></DialogTrigger>
          <SupplierInvoiceDialog onDone={() => setOpen(false)} />
        </Dialog>
      </div>

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
          {(items.data?.items ?? []).length === 0 && <p className="py-4 text-center text-muted-foreground">Sin cuentas por pagar.</p>}
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
        <label className="block text-sm">RNC proveedor<Input value={rnc} onChange={(e) => setRnc(e.target.value.replace(/\D/g, ""))} /></label>
        <label className="block text-sm">NCF del proveedor<Input value={ncf} onChange={(e) => setNcf(e.target.value.toUpperCase())} placeholder="B0100000001" /></label>
        <label className="block text-sm">Monto (sin ITBIS)<Input value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="block text-sm">Tipo de compra
          <select value={purchaseType} onChange={(e) => setPurchaseType(e.target.value)} className="mt-1 block h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm">
            <option value="inventory">Mercancía para la venta</option>
            <option value="supply">Material gastable / suministro</option>
            <option value="fixed_asset">Activo fijo</option>
            <option value="service">Servicio</option>
            <option value="expense">Gasto</option>
          </select>
        </label>
        {purchaseType === "fixed_asset" && (
          <div className="flex gap-2">
            <label className="block flex-1 text-sm">Nombre del activo<Input value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder="Laptop" /></label>
            <label className="block w-32 text-sm">Vida (meses)<Input value={assetLife} onChange={(e) => setAssetLife(e.target.value)} /></label>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button disabled={!rnc || !ncf || !amount || create.isPending} onClick={() => create.mutate()}>Registrar</Button>
      </DialogFooter>
    </DialogContent>
  );
}
