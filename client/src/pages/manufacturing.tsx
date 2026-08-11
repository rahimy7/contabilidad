import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Factory, Plus, Trash2, Play, CheckCircle2, X, ChefHat, Package } from "lucide-react";

const money = (v: string | number) =>
  Number(v ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2 });

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-gray-500",
  released: "bg-blue-500",
  in_progress: "bg-yellow-500",
  completed: "bg-green-600",
  cancelled: "bg-red-500",
  active: "bg-green-600",
  obsolete: "bg-red-500",
};

/** Manufacturing lite: BOMs (recetas) + órdenes de producción con backflush. */
export default function ManufacturingPage() {
  const [tab, setTab] = useState("boms");

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Factory className="w-8 h-8 text-orange-600" />
          <div>
            <h1 className="text-2xl font-bold">Producción</h1>
            <p className="text-muted-foreground">Recetas (BOM) + órdenes de producción con backflush automático</p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="boms"><ChefHat className="w-4 h-4 mr-2" />Recetas (BOM)</TabsTrigger>
          <TabsTrigger value="mos"><Package className="w-4 h-4 mr-2" />Órdenes de producción</TabsTrigger>
        </TabsList>

        <TabsContent value="boms" className="mt-4"><BomsSection /></TabsContent>
        <TabsContent value="mos" className="mt-4"><MosSection /></TabsContent>
      </Tabs>
    </div>
  );
}

function BomsSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState({
    bomCode: "", name: "", description: "",
    outputProductId: 0, outputQuantity: 1,
    version: "v1",
    lines: [] as Array<{ componentProductId: number; quantityPer: number; unit: string; unitCost: number }>,
  });
  const [newLine, setNewLine] = useState({ componentProductId: 0, quantityPer: 1, unit: "unit", unitCost: 0 });

  const list = useQuery({
    queryKey: ["/api/boms"],
    queryFn: () => apiRequest("GET", "/api/boms"),
  });

  const detail = useQuery({
    queryKey: ["/api/boms", selected],
    queryFn: () => apiRequest("GET", `/api/boms/${selected}`),
    enabled: selected != null,
  });

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/boms", form),
    onSuccess: () => {
      toast({ title: "BOM creado" });
      setOpenNew(false);
      setForm({ bomCode: "", name: "", description: "", outputProductId: 0, outputQuantity: 1, version: "v1", lines: [] });
      qc.invalidateQueries({ queryKey: ["/api/boms"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const totalEstimated = form.lines.reduce((s, l) => s + Number(l.quantityPer) * Number(l.unitCost), 0);

  return (
    <div className="grid grid-cols-3 gap-4">
      <Card className="col-span-1">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-base">Recetas</CardTitle>
            <Button size="sm" onClick={() => setOpenNew(true)}>
              <Plus className="w-4 h-4 mr-1" /> Nueva
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {list.data?.rows?.length ? (
            <div className="space-y-1">
              {list.data.rows.map((b: any) => (
                <button
                  key={b.id}
                  onClick={() => setSelected(b.id)}
                  className={`w-full text-left p-2 rounded hover:bg-muted ${selected === b.id ? "bg-muted" : ""}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="min-w-0">
                      <p className="font-mono text-xs">{b.bomCode}</p>
                      <p className="text-sm truncate">{b.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {b.outputProductName ?? "—"} · {b.lineCount} componentes
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge className={`${STATUS_COLOR[b.status]} text-white text-xs`}>{b.status}</Badge>
                      <p className="text-xs font-mono mt-1">RD$ {money(b.estimatedUnitCost)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-8">Sin recetas</p>
          )}
        </CardContent>
      </Card>

      <div className="col-span-2">
        {!detail.data ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">
            Selecciona una receta a la izquierda o crea una nueva
          </CardContent></Card>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {detail.data.header.bomCode}
                      <Badge className={`${STATUS_COLOR[detail.data.header.status]} text-white`}>
                        {detail.data.header.status}
                      </Badge>
                    </CardTitle>
                    <CardDescription>{detail.data.header.name} · {detail.data.header.version}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Producto terminado</p>
                    <p className="font-medium">{detail.data.header.outputProductName}</p>
                    <p className="text-xs font-mono text-muted-foreground">{detail.data.header.outputProductSku ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Output por corrida</p>
                    <p className="text-xl font-bold">{Number(detail.data.header.outputQuantity)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Costo unitario estimado</p>
                    <p className="text-xl font-bold font-mono">RD$ {money(detail.data.header.estimatedUnitCost)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Componentes ({detail.data.lines.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Componente</TableHead>
                      <TableHead className="text-right">Cantidad/output</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead className="text-right">Scrap %</TableHead>
                      <TableHead className="text-right">Costo unit.</TableHead>
                      <TableHead className="text-right">Costo total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.data.lines.map((l: any) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          <p className="font-medium">{l.componentName}</p>
                          <p className="text-xs font-mono text-muted-foreground">{l.componentSku ?? "—"}</p>
                        </TableCell>
                        <TableCell className="text-right font-mono">{Number(l.quantityPer)}</TableCell>
                        <TableCell>{l.unit}</TableCell>
                        <TableCell className="text-right">{Number(l.scrapPercent)}%</TableCell>
                        <TableCell className="text-right font-mono">{money(l.unitCost)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {money(Number(l.quantityPer) * Number(l.unitCost))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nueva receta (BOM)</DialogTitle>
            <DialogDescription>Define qué componentes se necesitan por unidad de producto terminado</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Código *</Label>
                <Input value={form.bomCode} onChange={(e) => setForm({ ...form, bomCode: e.target.value })} placeholder="BOM-2026-001" />
              </div>
              <div>
                <Label>Producto terminado ID *</Label>
                <Input type="number" value={form.outputProductId || ""} onChange={(e) => setForm({ ...form, outputProductId: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Cantidad output</Label>
                <Input type="number" step="0.01" value={form.outputQuantity} onChange={(e) => setForm({ ...form, outputQuantity: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Bizcocho vainilla" />
            </div>
            <div>
              <Label>Descripción</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>

            <div className="border-t pt-3">
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-semibold">Componentes ({form.lines.length})</p>
                <p className="text-sm font-mono">Costo est.: RD$ {money(totalEstimated)}</p>
              </div>
              {form.lines.length > 0 && (
                <div className="space-y-1 mb-2">
                  {form.lines.map((l, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm bg-muted p-2 rounded">
                      <span className="font-mono text-xs">#{l.componentProductId}</span>
                      <span className="flex-1">Qty: {l.quantityPer} {l.unit}</span>
                      <span className="font-mono">RD$ {money(l.unitCost)}</span>
                      <Button size="icon" variant="ghost" onClick={() => setForm({ ...form, lines: form.lines.filter((_, j) => j !== i) })}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-4 gap-2">
                <Input type="number" placeholder="Producto ID" value={newLine.componentProductId || ""} onChange={(e) => setNewLine({ ...newLine, componentProductId: Number(e.target.value) })} />
                <Input type="number" step="0.01" placeholder="Cantidad" value={newLine.quantityPer} onChange={(e) => setNewLine({ ...newLine, quantityPer: Number(e.target.value) })} />
                <Input placeholder="Unidad" value={newLine.unit} onChange={(e) => setNewLine({ ...newLine, unit: e.target.value })} />
                <div className="flex gap-1">
                  <Input type="number" step="0.01" placeholder="Costo" value={newLine.unitCost} onChange={(e) => setNewLine({ ...newLine, unitCost: Number(e.target.value) })} />
                  <Button
                    size="icon"
                    onClick={() => {
                      if (!newLine.componentProductId || !newLine.quantityPer) return;
                      setForm({ ...form, lines: [...form.lines, newLine] });
                      setNewLine({ componentProductId: 0, quantityPer: 1, unit: "unit", unitCost: 0 });
                    }}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={!form.bomCode || !form.name || !form.outputProductId || !form.lines.length || create.isPending}>
              Crear BOM
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MosSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState({
    moNumber: "", bomId: 0,
    plannedQuantity: 1,
    outputWarehouseId: 1, sourceWarehouseId: 1,
    scheduledStartDate: new Date().toISOString().slice(0, 10),
  });

  const list = useQuery({
    queryKey: ["/api/production-orders"],
    queryFn: () => apiRequest("GET", "/api/production-orders"),
  });

  const detail = useQuery({
    queryKey: ["/api/production-orders", selected],
    queryFn: () => apiRequest("GET", `/api/production-orders/${selected}`),
    enabled: selected != null,
  });

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/production-orders", form),
    onSuccess: (data: any) => {
      toast({ title: "MO creada" });
      setOpenNew(false);
      qc.invalidateQueries({ queryKey: ["/api/production-orders"] });
      setSelected(data.id);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const release = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/production-orders/${id}/release`),
    onSuccess: (data: any) => {
      toast({
        title: "MO liberada",
        description: data.shortComponents > 0 ? `${data.shortComponents} componentes con stock insuficiente` : "OK",
      });
      qc.invalidateQueries({ queryKey: ["/api/production-orders"] });
    },
  });

  const complete = useMutation({
    mutationFn: ({ id, qty }: { id: number; qty?: number }) =>
      apiRequest("POST", `/api/production-orders/${id}/complete`, qty ? { actualQuantity: qty } : {}),
    onSuccess: (data: any) => {
      toast({
        title: "Producción completada",
        description: `${data.actualQuantity} unidades · Costo unitario RD$ ${money(data.unitCost)}`,
      });
      qc.invalidateQueries({ queryKey: ["/api/production-orders"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const cancel = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/production-orders/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/production-orders"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpenNew(true)}>
          <Plus className="w-4 h-4 mr-2" /> Nueva orden de producción
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Órdenes de producción</CardTitle>
          <CardDescription>Backflush automático al completar</CardDescription>
        </CardHeader>
        <CardContent>
          {list.data?.rows?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>MO</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>BOM</TableHead>
                  <TableHead className="text-right">Planeado</TableHead>
                  <TableHead className="text-right">Real</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Costo total</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.rows.map((mo: any) => (
                  <TableRow key={mo.id}>
                    <TableCell className="font-mono text-xs">{mo.moNumber}</TableCell>
                    <TableCell>
                      <p className="font-medium">{mo.outputProductName}</p>
                      <p className="text-xs font-mono text-muted-foreground">{mo.outputProductSku ?? "—"}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{mo.bomCode ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">{Number(mo.plannedQuantity)}</TableCell>
                    <TableCell className="text-right font-mono">{Number(mo.actualQuantity)}</TableCell>
                    <TableCell>
                      <Badge className={`${STATUS_COLOR[mo.status]} text-white`}>{mo.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{money(mo.totalMaterialCost)}</TableCell>
                    <TableCell className="space-x-1">
                      {mo.status === "draft" && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => release.mutate(mo.id)}>
                            <Play className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => cancel.mutate(mo.id)}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                      {mo.status === "released" && (
                        <>
                          <Button size="sm" onClick={() => complete.mutate({ id: mo.id })}>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Completar
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setSelected(mo.id)}>Ver</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">Sin órdenes de producción</p>
          )}
        </CardContent>
      </Card>

      {selected && detail.data && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>Detalle MO {detail.data.header.moNumber}</CardTitle>
                <CardDescription>{detail.data.header.outputProductName}</CardDescription>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Componente</TableHead>
                  <TableHead className="text-right">Planeado</TableHead>
                  <TableHead className="text-right">Consumido</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Costo unit.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.data.components.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <p className="font-medium">{c.componentName}</p>
                      <p className="text-xs font-mono text-muted-foreground">{c.componentSku ?? "—"}</p>
                    </TableCell>
                    <TableCell className="text-right font-mono">{Number(c.plannedQuantity)} {c.unit}</TableCell>
                    <TableCell className="text-right font-mono">{Number(c.consumedQuantity)}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === "short" ? "destructive" : c.status === "consumed" ? "default" : "outline"}>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{money(c.unitCost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva orden de producción</DialogTitle>
            <DialogDescription>Selecciona un BOM y define cantidad a producir</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Número MO *</Label>
              <Input value={form.moNumber} onChange={(e) => setForm({ ...form, moNumber: e.target.value })} placeholder="MO-2026-001" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>BOM ID *</Label>
                <Input type="number" value={form.bomId || ""} onChange={(e) => setForm({ ...form, bomId: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Cantidad *</Label>
                <Input type="number" step="0.01" value={form.plannedQuantity} onChange={(e) => setForm({ ...form, plannedQuantity: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Almacén origen (MPs)</Label>
                <Input type="number" value={form.sourceWarehouseId} onChange={(e) => setForm({ ...form, sourceWarehouseId: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Almacén destino (PT)</Label>
                <Input type="number" value={form.outputWarehouseId} onChange={(e) => setForm({ ...form, outputWarehouseId: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label>Fecha planeada</Label>
              <Input type="date" value={form.scheduledStartDate} onChange={(e) => setForm({ ...form, scheduledStartDate: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={!form.moNumber || !form.bomId || create.isPending}>Crear MO</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
