import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Ship, Plus, Play, Trash2, PackagePlus } from "lucide-react";

const money = (v: string | number) =>
  Number(v ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2 });

const METHODS: Record<string, string> = {
  by_value: "Por valor FOB",
  by_quantity: "Por cantidad",
  by_weight: "Por peso",
  by_volume: "Por volumen",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-yellow-500",
  applied: "bg-green-600",
  cancelled: "bg-red-500",
};

/** Landed costs — vouchers de gastos de importación + prorateo sobre POs. */
export default function LandedCostsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [newForm, setNewForm] = useState({
    voucherCode: "", description: "", shipmentReference: "", blAwbNumber: "",
    voucherDate: new Date().toISOString().slice(0, 10),
    defaultAllocationMethod: "by_value",
  });

  const list = useQuery({
    queryKey: ["/api/landed-costs/vouchers"],
    queryFn: () => apiRequest("GET", "/api/landed-costs/vouchers"),
  });

  const detail = useQuery({
    queryKey: ["/api/landed-costs/vouchers", selectedId],
    queryFn: () => apiRequest("GET", `/api/landed-costs/vouchers/${selectedId}`),
    enabled: selectedId != null,
  });

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/landed-costs/vouchers", newForm),
    onSuccess: (data: any) => {
      toast({ title: "Voucher creado" });
      setOpenNew(false);
      qc.invalidateQueries({ queryKey: ["/api/landed-costs/vouchers"] });
      setSelectedId(data.id);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const apply = useMutation({
    mutationFn: () => apiRequest("POST", `/api/landed-costs/vouchers/${selectedId}/apply`),
    onSuccess: (data: any) => {
      toast({
        title: "Voucher aplicado",
        description: `RD$ ${money(data.totalAllocated)} distribuidos entre ${data.allocationsByPo?.length} POs`,
      });
      qc.invalidateQueries({ queryKey: ["/api/landed-costs/vouchers"] });
      qc.invalidateQueries({ queryKey: ["/api/landed-costs/vouchers", selectedId] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const v = detail.data;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Ship className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">Costos de Importación</h1>
            <p className="text-muted-foreground">
              Prorratea flete, aduana, ITBIS de despacho, agente aduanal sobre POs recibidas
            </p>
          </div>
        </div>
        <Button onClick={() => setOpenNew(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nuevo voucher
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle>Vouchers</CardTitle></CardHeader>
          <CardContent>
            {list.data?.rows?.length ? (
              <div className="space-y-1">
                {list.data.rows.map((row: any) => (
                  <button
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    className={`w-full text-left p-2 rounded hover:bg-muted ${selectedId === row.id ? "bg-muted" : ""}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="min-w-0">
                        <p className="font-mono text-xs">{row.voucherCode}</p>
                        <p className="text-sm truncate">{row.description ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{row.voucherDate}</p>
                      </div>
                      <div className="text-right">
                        <Badge className={`${STATUS_COLOR[row.status]} text-white text-xs`}>{row.status}</Badge>
                        <p className="text-xs font-mono mt-1">RD$ {money(row.totalCosts)}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8 text-sm">Sin vouchers</p>
            )}
          </CardContent>
        </Card>

        <div className="col-span-2 space-y-4">
          {!v ? (
            <Card><CardContent className="py-16 text-center text-muted-foreground">
              Selecciona un voucher a la izquierda o crea uno nuevo
            </CardContent></Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {v.voucher.voucherCode}
                        <Badge className={`${STATUS_COLOR[v.voucher.status]} text-white`}>{v.voucher.status}</Badge>
                      </CardTitle>
                      <CardDescription>{v.voucher.description ?? "—"}</CardDescription>
                    </div>
                    {v.voucher.status === "draft" && (
                      <Button
                        onClick={() => apply.mutate()}
                        disabled={apply.isPending || !v.lines?.length || !v.targets?.length}
                      >
                        <Play className="w-4 h-4 mr-2" /> Aplicar prorateo
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <Info label="Fecha" value={v.voucher.voucherDate} />
                    <Info label="Método default" value={METHODS[v.voucher.defaultAllocationMethod] ?? v.voucher.defaultAllocationMethod} />
                    <Info label="B/L o AWB" value={v.voucher.blAwbNumber ?? "—"} mono />
                    <Info label="Embarque" value={v.voucher.shipmentReference ?? "—"} mono />
                    <Info label="Total gastos" value={`RD$ ${money(v.voucher.totalCosts)}`} bold />
                    <Info label="Total asignado" value={`RD$ ${money(v.voucher.totalAllocated)}`} bold />
                    <Info label="POs" value={String(v.targets?.length ?? 0)} />
                    <Info label="Líneas gasto" value={String(v.lines?.length ?? 0)} />
                  </div>
                </CardContent>
              </Card>

              <LinesSection voucher={v.voucher} lines={v.lines} onChange={() => detail.refetch()} />
              <TargetsSection voucher={v.voucher} targets={v.targets} onChange={() => detail.refetch()} />
              {v.allocations?.length > 0 && <AllocationsSection allocations={v.allocations} />}
            </>
          )}
        </div>
      </div>

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo voucher de costos</DialogTitle>
            <DialogDescription>Agrupa los gastos de un embarque para prorratear</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Código *</Label>
                <Input value={newForm.voucherCode} onChange={(e) => setNewForm({ ...newForm, voucherCode: e.target.value })} placeholder="LC-2026-001" />
              </div>
              <div>
                <Label>Fecha</Label>
                <Input type="date" value={newForm.voucherDate} onChange={(e) => setNewForm({ ...newForm, voucherDate: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Descripción</Label>
              <Input value={newForm.description} onChange={(e) => setNewForm({ ...newForm, description: e.target.value })} placeholder="Contenedor MSKU1234567" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Referencia embarque</Label>
                <Input value={newForm.shipmentReference} onChange={(e) => setNewForm({ ...newForm, shipmentReference: e.target.value })} />
              </div>
              <div>
                <Label>B/L o AWB</Label>
                <Input value={newForm.blAwbNumber} onChange={(e) => setNewForm({ ...newForm, blAwbNumber: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Método de prorateo default</Label>
              <Select value={newForm.defaultAllocationMethod} onValueChange={(v) => setNewForm({ ...newForm, defaultAllocationMethod: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(METHODS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={!newForm.voucherCode || create.isPending}>
              Crear voucher
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`${mono ? "font-mono" : ""} ${bold ? "font-bold" : ""}`}>{value}</p>
    </div>
  );
}

const COST_TYPE_LABELS: Record<string, string> = {
  freight_ocean: "Flete marítimo", freight_air: "Flete aéreo", freight_land: "Flete terrestre",
  insurance: "Seguro", customs_duty: "Arancel", customs_itbis: "ITBIS despacho",
  customs_selectivo: "Selectivo", clearing_agent: "Agente aduanal",
  port_handling: "Manejo portuario", warehouse_storage: "Almacenaje",
  inland_transport: "Transporte interno", inspection: "Inspección",
  bank_charges: "Cargos bancarios", other: "Otro",
};

function LinesSection({ voucher, lines, onChange }: { voucher: any; lines: any[]; onChange: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ costType: "freight_ocean", description: "", amount: 0, allocationMethod: "" });
  const readonly = voucher.status !== "draft";

  const add = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/landed-costs/vouchers/${voucher.id}/lines`, {
        costType: form.costType,
        description: form.description || undefined,
        amount: Number(form.amount),
        allocationMethod: form.allocationMethod || undefined,
      }),
    onSuccess: () => {
      toast({ title: "Línea agregada" });
      setOpen(false);
      setForm({ costType: "freight_ocean", description: "", amount: 0, allocationMethod: "" });
      onChange();
    },
  });

  const remove = useMutation({
    mutationFn: (lineId: number) =>
      apiRequest("DELETE", `/api/landed-costs/vouchers/${voucher.id}/lines/${lineId}`),
    onSuccess: () => onChange(),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Líneas de gasto ({lines?.length ?? 0})</CardTitle>
          {!readonly && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Agregar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {lines?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Método</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell><Badge variant="outline">{COST_TYPE_LABELS[l.costType] ?? l.costType}</Badge></TableCell>
                  <TableCell className="text-sm">{l.description ?? "—"}</TableCell>
                  <TableCell className="text-xs">{METHODS[l.allocationMethod] ?? "default"}</TableCell>
                  <TableCell className="text-right font-mono">{money(l.amount)}</TableCell>
                  <TableCell>
                    {!readonly && (
                      <Button size="icon" variant="ghost" onClick={() => remove.mutate(l.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-center text-muted-foreground py-4 text-sm">Sin líneas de gasto</p>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar línea de gasto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={form.costType} onValueChange={(v) => setForm({ ...form, costType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(COST_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Método (opcional)</Label>
                <Select value={form.allocationMethod || "default"} onValueChange={(v) => setForm({ ...form, allocationMethod: v === "default" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Usar default del voucher</SelectItem>
                    {Object.entries(METHODS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Descripción</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label>Monto (RD$) *</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => add.mutate()} disabled={!form.amount || add.isPending}>Agregar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function TargetsSection({ voucher, targets, onChange }: { voucher: any; targets: any[]; onChange: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ purchaseOrderId: 0, totalWeightKg: 0, totalVolumeM3: 0 });
  const readonly = voucher.status !== "draft";

  const add = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/landed-costs/vouchers/${voucher.id}/targets`, {
        purchaseOrderId: Number(form.purchaseOrderId),
        totalWeightKg: form.totalWeightKg || undefined,
        totalVolumeM3: form.totalVolumeM3 || undefined,
      }),
    onSuccess: () => {
      toast({ title: "PO agregada" });
      setOpen(false);
      setForm({ purchaseOrderId: 0, totalWeightKg: 0, totalVolumeM3: 0 });
      onChange();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/landed-costs/vouchers/${voucher.id}/targets/${id}`),
    onSuccess: () => onChange(),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Órdenes de compra ({targets?.length ?? 0})</CardTitle>
          {!readonly && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <PackagePlus className="w-4 h-4 mr-1" /> Asignar PO
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {targets?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO</TableHead>
                <TableHead className="text-right">Peso (kg)</TableHead>
                <TableHead className="text-right">Volumen (m³)</TableHead>
                <TableHead className="text-right">Asignado</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {targets.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono">#{t.purchaseOrderId}</TableCell>
                  <TableCell className="text-right font-mono">{Number(t.totalWeightKg) > 0 ? t.totalWeightKg : "—"}</TableCell>
                  <TableCell className="text-right font-mono">{Number(t.totalVolumeM3) > 0 ? t.totalVolumeM3 : "—"}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">RD$ {money(t.allocatedAmount)}</TableCell>
                  <TableCell>
                    {!readonly && (
                      <Button size="icon" variant="ghost" onClick={() => remove.mutate(t.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-center text-muted-foreground py-4 text-sm">Sin POs asignadas</p>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar PO al voucher</DialogTitle>
            <DialogDescription>Solo POs ya recibidas. Peso/volumen opcionales para prorateo especial.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>ID de PO *</Label>
              <Input type="number" value={form.purchaseOrderId || ""} onChange={(e) => setForm({ ...form, purchaseOrderId: Number(e.target.value) })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Peso total (kg)</Label>
                <Input type="number" step="0.01" value={form.totalWeightKg || ""} onChange={(e) => setForm({ ...form, totalWeightKg: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Volumen (m³)</Label>
                <Input type="number" step="0.01" value={form.totalVolumeM3 || ""} onChange={(e) => setForm({ ...form, totalVolumeM3: Number(e.target.value) })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => add.mutate()} disabled={!form.purchaseOrderId || add.isPending}>Asignar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AllocationsSection({ allocations }: { allocations: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Allocations por item ({allocations.length})</CardTitle>
        <CardDescription>Detalle del ajuste de costo aplicado</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">Costo original</TableHead>
              <TableHead className="text-right">Costo agregado</TableHead>
              <TableHead className="text-right">Costo nuevo</TableHead>
              <TableHead>Base</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allocations.map((a: any, i: number) => (
              <TableRow key={i}>
                <TableCell className="font-mono">#{a.purchaseOrderId}</TableCell>
                <TableCell>#{a.productId}</TableCell>
                <TableCell className="text-right font-mono">{a.quantity}</TableCell>
                <TableCell className="text-right font-mono">{money(a.originalUnitCost)}</TableCell>
                <TableCell className="text-right font-mono text-blue-600">+{money(a.allocatedAmount)}</TableCell>
                <TableCell className="text-right font-mono font-bold">{money(a.newUnitCost)}</TableCell>
                <TableCell className="text-xs">{METHODS[a.allocationBasis] ?? a.allocationBasis}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
