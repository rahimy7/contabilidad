import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/accounting-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Boxes, ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from "lucide-react";

const money = (v: string | number) =>
  Number(v ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (v: string | number) => Number(v ?? 0).toLocaleString("es-DO", { maximumFractionDigits: 4 });
const today = () => new Date().toISOString().slice(0, 10);

/** The control account a product's stock rolls up into — its accounting warehouse. */
const STOCK_ACCOUNTS: Record<string, string> = {
  "1.1.03.001": "Mercancía",
  "1.1.03.002": "Suministros",
};

/**
 * Moving stock between bodegas writes no journal entry — both roll into the same
 * control account, so only the subledger buckets change. The value that leaves is
 * exactly the value that arrives.
 */
function TransferDialog() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [from, setFrom] = useState("0");
  const [to, setTo] = useState("0");
  const warehouses = useQuery({ queryKey: ["/api/warehouses"], queryFn: () => inventoryApi.warehouses() });
  const options = [{ id: 0, name: "Sin almacén" }, ...(warehouses.data?.warehouses ?? [])];

  const move = useMutation({
    mutationFn: () =>
      inventoryApi.transfer({
        productId: Number(productId), date: today(), quantity,
        fromWarehouseId: Number(from), toWarehouseId: Number(to),
      }),
    onSuccess: (r: any) => {
      toast({ title: "Transferencia registrada", description: `Valor movido: ${money(r?.cost ?? 0)}` });
      qc.invalidateQueries({ queryKey: ["/api/inventory/valuation"] });
      setProductId(""); setQuantity("");
      setOpen(false);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1"><ArrowLeftRight className="h-4 w-4" /> Transferir</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Transferir entre bodegas</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm">Producto (ID)<Input value={productId} onChange={(e) => setProductId(e.target.value.replace(/\D/g, ""))} /></label>
          <div className="flex gap-2">
            <label className="block flex-1 text-sm">Desde
              <select value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm">
                {options.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label className="block flex-1 text-sm">Hacia
              <select value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm">
                {options.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-sm">Cantidad<Input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" /></label>
          <p className="text-xs text-muted-foreground">
            La mercancía viaja con su costo. No genera asiento: el valor cambia de bodega, no de cuenta.
          </p>
        </div>
        <DialogFooter>
          <Button disabled={!productId || !quantity || from === to || move.isPending} onClick={() => move.mutate()}>Transferir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function InventoryCostingPage() {
  const val = useQuery({ queryKey: ["/api/inventory/valuation"], queryFn: () => inventoryApi.valuation() });
  const now = new Date();
  const margin = useQuery({
    queryKey: ["/api/inventory/margin", now.getFullYear(), now.getMonth() + 1],
    queryFn: () => inventoryApi.margin(now.getFullYear(), now.getMonth() + 1),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Boxes className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Costeo de Inventario</h1>
        </div>
        <div className="flex gap-2">
          <MovementDialog kind="receive" />
          <MovementDialog kind="issue" />
          <TransferDialog />
        </div>
      </div>

      {(val.data?.byWarehouse ?? []).length > 1 && (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {(val.data?.byWarehouse ?? []).map((w: any) => (
            <div key={w.warehouse_id} className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">{w.warehouse_name}</div>
              <div className="mt-0.5 font-semibold tabular-nums">{money(w.total_value)}</div>
            </div>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Valuación (promedio ponderado)</CardTitle>
          <span className="text-sm text-muted-foreground">
            Valor total: <span className="font-semibold tabular-nums text-foreground">{money(val.data?.totalValue ?? 0)}</span>
          </span>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1.5">Producto</th><th className="py-1.5">Bodega</th><th className="py-1.5">Tipo</th><th className="py-1.5">Método</th><th className="py-1.5 text-right">Existencia</th><th className="py-1.5 text-right">Costo prom.</th><th className="py-1.5 text-right">Valor</th></tr></thead>
            <tbody>
              {(val.data?.items ?? []).map((it) => (
                <tr key={`${it.product_id}-${it.warehouse_id}`} className="border-b last:border-0">
                  <td className="py-1.5">#{it.product_id}</td>
                  <td className="py-1.5 text-xs">{it.warehouse_name ?? "Sin almacén"}</td>
                  <td className="py-1.5 text-xs text-muted-foreground">{STOCK_ACCOUNTS[it.inventory_account] ?? it.inventory_account}</td>
                  <td className="py-1.5 text-xs text-muted-foreground">{it.costing_method === "fifo" ? "FIFO" : "Promedio"}</td>
                  <td className="py-1.5 text-right tabular-nums">{qty(it.quantity_on_hand)}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(it.average_cost)}</td>
                  <td className="py-1.5 text-right font-medium tabular-nums">{money(it.total_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(val.data?.items ?? []).length === 0 && <p className="py-4 text-center text-muted-foreground">Sin existencias valuadas.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Margen bruto del mes</CardTitle>
          {margin.data && (
            <span className="text-sm text-muted-foreground">
              Margen: <span className="font-semibold tabular-nums text-foreground">{money(margin.data.totalMargin)}</span> ({margin.data.marginPct}%)
            </span>
          )}
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-1.5">Producto</th><th className="py-1.5 text-right">Ingreso</th><th className="py-1.5 text-right">Costo</th><th className="py-1.5 text-right">Margen</th><th className="py-1.5 text-right">%</th></tr></thead>
            <tbody>
              {(margin.data?.lines ?? []).map((l: any) => (
                <tr key={l.product_id} className="border-b last:border-0">
                  <td className="py-1.5">#{l.product_id}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(l.revenue)}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(l.cogs)}</td>
                  <td className={`py-1.5 text-right tabular-nums ${Number(l.margin) < 0 ? "text-destructive" : ""}`}>{money(l.margin)}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">{l.marginPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(margin.data?.lines ?? []).length === 0 && <p className="py-4 text-center text-muted-foreground">Sin ventas costeadas este mes.</p>}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Una recepción actualiza el costo (promedio ponderado o FIFO por lote) y debita Inventario; una salida reconoce
        el costo de ventas. La suma de los valores concilia con la cuenta de Inventario (1.1.03.001) en el mayor.
      </p>
    </div>
  );
}

function MovementDialog({ kind }: { kind: "receive" | "issue" }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [method, setMethod] = useState("average");
  const [account, setAccount] = useState("1.1.03.001");
  const [warehouseId, setWarehouseId] = useState("0");
  const warehouses = useQuery({ queryKey: ["/api/warehouses"], queryFn: () => inventoryApi.warehouses() });
  const isReceive = kind === "receive";

  const mutate = useMutation({
    mutationFn: () =>
      isReceive
        ? inventoryApi.receive({ productId: Number(productId), date: today(), quantity, unitCost, method, inventoryAccountRef: account, warehouseId: Number(warehouseId) })
        : inventoryApi.issue({ productId: Number(productId), date: today(), quantity, warehouseId: Number(warehouseId) }),
    onSuccess: (r: any) => {
      toast({ title: isReceive ? "Recepción registrada" : `Salida registrada`, description: !isReceive && r?.cogs ? `COGS ${money(r.cogs)}` : undefined });
      qc.invalidateQueries({ queryKey: ["/api/inventory/valuation"] });
      setProductId(""); setQuantity(""); setUnitCost("");
      setOpen(false);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={isReceive ? "default" : "outline"} className="gap-1">
          {isReceive ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
          {isReceive ? "Recibir" : "Emitir"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{isReceive ? "Recepción de inventario" : "Salida de inventario"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm">Producto (ID)<Input value={productId} onChange={(e) => setProductId(e.target.value.replace(/\D/g, ""))} placeholder="Ej. 1024" /></label>
          <label className="block text-sm">Bodega
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="mt-1 block h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm">
              <option value="0">Sin almacén</option>
              {(warehouses.data?.warehouses ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">Cantidad<Input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" /></label>
          {isReceive && <label className="block text-sm">Costo unitario<Input value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="0.00" /></label>}
          {isReceive && (
            <div className="flex gap-2">
              <label className="block flex-1 text-sm">Almacén (nuevos productos)
                <select value={account} onChange={(e) => setAccount(e.target.value)} className="mt-1 block h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm">
                  <option value="1.1.03.001">Mercancía para venta</option>
                  <option value="1.1.03.002">Suministros / material gastable</option>
                </select>
              </label>
              <label className="block flex-1 text-sm">Método de costeo
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1 block h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm">
                  <option value="average">Promedio ponderado</option>
                  <option value="fifo">FIFO (por lote)</option>
                </select>
              </label>
            </div>
          )}
          {!isReceive && (
            <p className="text-xs text-muted-foreground">
              La salida se costea según el método del producto. La mercancía reconoce costo de ventas; un suministro se
              consume a gasto.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button disabled={!productId || !quantity || (isReceive && !unitCost) || mutate.isPending} onClick={() => mutate.mutate()}>Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
