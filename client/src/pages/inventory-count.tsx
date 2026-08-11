import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { wmsApi, type InventoryCountLineRow, type InventoryCountRow } from "@/lib/accounting-api";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardCheck, Plus, EyeOff, ArrowLeft, Save, CheckCircle2, XCircle,
  TrendingDown, TrendingUp, Lock, Search,
} from "lucide-react";

const money = (v: string | number | null) =>
  Number(v ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (v: string | number | null) =>
  v == null ? "—" : Number(v).toLocaleString("es-DO", { maximumFractionDigits: 4 });
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Conteo físico de inventario.
 *
 * El conteo es un documento con vida propia: se abre con un alcance y una foto
 * congelada de lo que el sistema cree, alguien camina las ubicaciones y anota lo
 * que hay, otro revisa las diferencias, y sólo al aplicar cambia algo. Un botón
 * de "arreglar el stock" deja que quien está más cerca del faltante lo haga
 * desaparecer sin que quede rastro; esta pantalla existe para que quede.
 */
const STATUS: Record<string, { label: string; variant: any }> = {
  open: { label: "Abierto", variant: "outline" },
  counting: { label: "En conteo", variant: "secondary" },
  review: { label: "En revisión", variant: "default" },
  applied: { label: "Aplicado", variant: "default" },
  cancelled: { label: "Cancelado", variant: "destructive" },
};

const COUNT_TYPES: Record<string, string> = {
  full: "General", cycle: "Cíclico", spot: "Puntual",
};

export default function InventoryCountPage() {
  const [openCountId, setOpenCountId] = useState<number | null>(null);
  return openCountId
    ? <CountDetail countId={openCountId} onBack={() => setOpenCountId(null)} />
    : <CountList onOpen={setOpenCountId} />;
}

// ── listado ──────────────────────────────────────────────────────────────────

function CountList({ onOpen }: { onOpen: (id: number) => void }) {
  const [warehouseId, setWarehouseId] = useState<string>("");
  const counts = useQuery({
    queryKey: ["/api/wms/counts", warehouseId],
    queryFn: () => wmsApi.counts(warehouseId ? Number(warehouseId) : undefined),
  });
  const warehouses = useQuery({
    queryKey: ["/api/warehouses"],
    queryFn: () => apiRequest<any[]>("GET", "/api/warehouses"),
  });
  const list: any[] = Array.isArray(warehouses.data) ? warehouses.data : (warehouses.data as any)?.warehouses ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6" /> Conteo físico de inventario
          </h1>
          <p className="text-sm text-muted-foreground">
            Auditar lo que hay en los estantes y rectificar los libros dejando constancia.
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Todos los almacenes" /></SelectTrigger>
            <SelectContent>
              {list.map((w) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <NewCountDialog warehouses={list} onCreated={onOpen} />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="py-2">Conteo</th><th>Almacén</th><th>Tipo</th><th>Fecha</th><th>Estado</th>
                <th className="text-right">Líneas</th><th className="text-right">Diferencias</th>
                <th className="text-right">Sobrante</th><th className="text-right">Faltante</th>
                <th className="text-right">Neto</th>
              </tr>
            </thead>
            <tbody>
              {(counts.data?.counts ?? []).map((c: InventoryCountRow) => (
                <tr
                  key={c.id}
                  className="border-b last:border-0 cursor-pointer hover:bg-muted/50"
                  onClick={() => onOpen(c.id)}
                >
                  <td className="py-2 font-medium">
                    {c.count_no}
                    {c.is_blind && (
                      <EyeOff className="inline h-3 w-3 ml-1 text-muted-foreground" aria-label="ciego" />
                    )}
                    {c.name && <div className="text-xs text-muted-foreground">{c.name}</div>}
                  </td>
                  <td>{c.warehouse_name ?? `#${c.warehouse_id}`}</td>
                  <td>{COUNT_TYPES[c.count_type] ?? c.count_type}</td>
                  <td>{c.count_date}</td>
                  <td><Badge variant={STATUS[c.status]?.variant}>{STATUS[c.status]?.label ?? c.status}</Badge></td>
                  <td className="text-right">{c.counted_lines}/{c.total_lines}</td>
                  <td className="text-right">{c.variance_lines}</td>
                  <td className="text-right text-emerald-600">{money(c.surplus_value)}</td>
                  <td className="text-right text-red-600">{money(c.shortage_value)}</td>
                  <td className={`text-right font-medium ${Number(c.net_value) < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {money(c.net_value)}
                  </td>
                </tr>
              ))}
              {(counts.data?.counts ?? []).length === 0 && (
                <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">
                  Todavía no hay conteos. Abra uno para auditar el inventario.
                </td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function NewCountDialog({ warehouses, onCreated }: { warehouses: any[]; onCreated: (id: number) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    warehouseId: "", name: "", countType: "cycle", isBlind: true, countDate: today(), notes: "",
  });
  const [selected, setSelected] = useState<number[]>([]);

  const locations = useQuery({
    queryKey: ["/api/wms/locations", form.warehouseId],
    queryFn: () => wmsApi.locations(Number(form.warehouseId)),
    enabled: open && !!form.warehouseId,
  });

  const create = useMutation({
    mutationFn: () =>
      wmsApi.createCount({
        warehouseId: Number(form.warehouseId),
        countDate: form.countDate,
        name: form.name || undefined,
        countType: form.countType,
        isBlind: form.isBlind,
        // Alcance vacío = todo el almacén. Un conteo cíclico normalmente elige
        // unas cuantas ubicaciones; el general no elige ninguna.
        locationIds: form.countType === "full" ? [] : selected,
        notes: form.notes || undefined,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["/api/wms/counts"] });
      toast({ title: `Conteo ${r.countNo} abierto`, description: `${r.totalLines} líneas para contar.` });
      setOpen(false);
      onCreated(r.id);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "No se pudo abrir el conteo", description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1"><Plus className="h-4 w-4" /> Nuevo conteo</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Abrir conteo físico</DialogTitle>
          <DialogDescription>
            Al abrirlo se congela lo que el sistema cree que hay. Esa foto es contra la que se
            miden las diferencias, así que la mercancía que se mueva durante el conteo no
            cambia el resultado.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Almacén">
              <Select value={form.warehouseId} onValueChange={(v) => { setForm({ ...form, warehouseId: v }); setSelected([]); }}>
                <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Fecha contable">
              <Input type="date" value={form.countDate} onChange={(e) => setForm({ ...form, countDate: e.target.value })} />
            </Field>
          </div>

          <Field label="Tipo de conteo">
            <Select value={form.countType} onValueChange={(v) => setForm({ ...form, countType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full">General — todo el almacén</SelectItem>
                <SelectItem value="cycle">Cíclico — un grupo de ubicaciones que rota</SelectItem>
                <SelectItem value="spot">Puntual — unas pocas ubicaciones</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Nombre (opcional)">
            <Input
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Conteo cíclico zona A — semana 32"
            />
          </Field>

          {form.countType !== "full" && (
            <div className="space-y-2">
              <Label className="text-sm">Ubicaciones a contar</Label>
              <div className="max-h-52 overflow-y-auto rounded-md border p-2 grid grid-cols-3 gap-1">
                {(locations.data?.locations ?? []).map((l) => {
                  const on = selected.includes(l.id);
                  return (
                    <button
                      key={l.id} type="button"
                      onClick={() => setSelected(on ? selected.filter((x) => x !== l.id) : [...selected, l.id])}
                      className={`rounded px-2 py-1 text-left text-xs font-mono border ${
                        on ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
                      }`}
                    >
                      {l.code}
                      <span className="block text-[10px] opacity-70">{qty(l.total_qty)} u.</span>
                    </button>
                  );
                })}
                {!form.warehouseId && (
                  <p className="col-span-3 py-4 text-center text-xs text-muted-foreground">
                    Seleccione un almacén.
                  </p>
                )}
                {form.warehouseId && (locations.data?.locations ?? []).length === 0 && (
                  <p className="col-span-3 py-4 text-center text-xs text-muted-foreground">
                    Este almacén no usa ubicaciones; se contará producto por producto.
                  </p>
                )}
              </div>
              {selected.length > 0 && (
                <p className="text-xs text-muted-foreground">{selected.length} ubicación(es) seleccionada(s).</p>
              )}
            </div>
          )}

          <ToggleRow
            label="Conteo ciego"
            hint="El que cuenta no ve la cantidad esperada. Verla primero convierte el conteo en una confirmación."
            checked={form.isBlind}
            onChange={(v) => setForm({ ...form, isBlind: v })}
          />

          <Field label="Notas">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </Field>
        </div>

        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={!form.warehouseId || create.isPending}>
            Abrir conteo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── detalle: capturar, revisar, aplicar ──────────────────────────────────────

function CountDetail({ countId, onBack }: { countId: number; onBack: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [search, setSearch] = useState("");

  const count = useQuery({
    queryKey: ["/api/wms/counts", countId],
    queryFn: () => wmsApi.count(countId, true),
  });
  const c = count.data;
  const editable = c && ["open", "counting"].includes(c.status);
  const reviewing = c?.status === "review";

  const save = useMutation({
    mutationFn: () => {
      const entries = Object.entries(draft)
        .filter(([, v]) => v !== "")
        .map(([lineId, v]) => ({
          lineId: Number(lineId), countedQty: v, reason: reasons[Number(lineId)] ?? null,
          isRecount: reviewing,
        }));
      return wmsApi.recordCounts(countId, entries);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/wms/counts", countId] });
      setDraft({});
      toast({ title: "Conteo guardado", description: "Nada se ha aplicado todavía." });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const submit = useMutation({
    mutationFn: () => wmsApi.submitCount(countId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/wms/counts", countId] });
      toast({ title: "Enviado a revisión", description: "Ya se pueden ver las diferencias." });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Falta contar", description: e.message }),
  });

  const apply = useMutation({
    mutationFn: () => wmsApi.applyCount(countId),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["/api/wms/counts"] });
      qc.invalidateQueries({ queryKey: ["/api/wms/counts", countId] });
      qc.invalidateQueries({ queryKey: ["/api/inventory/valuation"] });
      toast({
        title: `Conteo ${r.countNo} aplicado`,
        description: `${r.productsAdjusted} producto(s) rectificados. Faltantes ${money(r.shortageValue)}, sobrantes ${money(r.surplusValue)}.`,
      });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "No se pudo aplicar", description: e.message }),
  });

  const cancel = useMutation({
    mutationFn: (reason: string) => wmsApi.cancelCount(countId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/wms/counts", countId] });
      toast({ title: "Conteo cancelado" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const grouped = useMemo(() => {
    const lines = (c?.lines ?? []).filter((l) =>
      `${l.product_name ?? ""} ${l.sku ?? ""} ${l.location_code ?? ""}`.toLowerCase().includes(search.toLowerCase()),
    );
    const map = new Map<string, InventoryCountLineRow[]>();
    for (const l of lines) {
      const key = l.location_code ?? "Sin ubicación";
      map.set(key, [...(map.get(key) ?? []), l]);
    }
    return [...map.entries()];
  }, [c?.lines, search]);

  if (count.isLoading || !c) return <div className="p-6 text-muted-foreground">Cargando…</div>;

  const pending = (c.lines ?? []).filter((l) => l.counted_qty == null).length;

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 -ml-2 mb-1">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            {c.count_no}
            <Badge variant={STATUS[c.status]?.variant}>{STATUS[c.status]?.label ?? c.status}</Badge>
            {c.blindActive && (
              <Badge variant="outline" className="gap-1"><EyeOff className="h-3 w-3" /> ciego</Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            {c.warehouse_name} · {COUNT_TYPES[c.count_type] ?? c.count_type} · {c.count_date}
            {c.name ? ` · ${c.name}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {editable && (
            <>
              <Button variant="outline" onClick={() => save.mutate()} disabled={save.isPending || Object.keys(draft).length === 0} className="gap-1">
                <Save className="h-4 w-4" /> Guardar {Object.keys(draft).length > 0 ? `(${Object.keys(draft).length})` : ""}
              </Button>
              <Button onClick={() => submit.mutate()} disabled={submit.isPending} className="gap-1">
                <CheckCircle2 className="h-4 w-4" /> Enviar a revisión
              </Button>
            </>
          )}
          {reviewing && (
            <>
              {Object.keys(draft).length > 0 && (
                <Button variant="outline" onClick={() => save.mutate()} className="gap-1">
                  <Save className="h-4 w-4" /> Guardar reconteo ({Object.keys(draft).length})
                </Button>
              )}
              <ApplyDialog count={c} onConfirm={() => apply.mutate()} pending={apply.isPending} />
            </>
          )}
          {c.status !== "applied" && c.status !== "cancelled" && (
            <CancelDialog onConfirm={(r) => cancel.mutate(r)} />
          )}
        </div>
      </div>

      {c.status === "applied" && (
        <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardContent className="py-4 flex flex-wrap gap-6 text-sm">
            <Metric icon={<Lock className="h-4 w-4" />} label="Aplicado" value={new Date(c.applied_at!).toLocaleString("es-DO")} />
            <Metric icon={<TrendingUp className="h-4 w-4 text-emerald-600" />} label="Sobrantes" value={money(c.surplus_value)} />
            <Metric icon={<TrendingDown className="h-4 w-4 text-red-600" />} label="Faltantes" value={money(c.shortage_value)} />
            <Metric label="Neto" value={money(c.net_value)} />
          </CardContent>
        </Card>
      )}

      {reviewing && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Diferencias encontradas</CardTitle>
            <CardDescription>
              Revise antes de aplicar. Al aplicar se corrigen las ubicaciones y se lleva el valor de
              la diferencia a resultados: los faltantes a gasto por faltante, los sobrantes a otros
              ingresos. Un solo asiento por conteo.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-6 text-sm">
            <Metric label="Líneas con diferencia" value={String(c.variance_lines)} />
            <Metric icon={<TrendingUp className="h-4 w-4 text-emerald-600" />} label="Sobrantes" value={money(c.surplus_value)} />
            <Metric icon={<TrendingDown className="h-4 w-4 text-red-600" />} label="Faltantes" value={money(c.shortage_value)} />
            <Metric label="Efecto neto" value={money(c.net_value)} />
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8" placeholder="Buscar producto o ubicación…"
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {editable && (
          <p className="text-sm text-muted-foreground">
            {pending} sin contar de {c.total_lines}. Anote 0 en las ubicaciones vacías.
          </p>
        )}
        {editable && <FoundDialog countId={countId} warehouseId={c.warehouse_id} />}
      </div>

      {grouped.map(([location, lines]) => (
        <Card key={location}>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-mono">{location}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="py-2">Producto</th><th>Lote</th><th>Vence</th>
                  {!c.blindActive && <th className="text-right">Esperado</th>}
                  <th className="text-right w-32">Contado</th>
                  {!c.blindActive && <th className="text-right">Diferencia</th>}
                  {!c.blindActive && <th className="text-right">Valor</th>}
                  {(editable || reviewing) && <th className="w-40">Motivo</th>}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const effective = draft[l.id] ?? l.recount_qty ?? l.counted_qty ?? "";
                  const variance = l.variance == null ? null : Number(l.variance);
                  return (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-2">
                        {l.product_name ?? `#${l.product_id}`}
                        <div className="text-xs text-muted-foreground">{l.sku}</div>
                      </td>
                      <td className="font-mono text-xs">{l.lot_no ?? "—"}</td>
                      <td className="text-xs">{l.expiration_date ?? "—"}</td>
                      {!c.blindActive && <td className="text-right">{qty(l.expected_qty)}</td>}
                      <td className="text-right">
                        {editable || reviewing ? (
                          <Input
                            className="h-8 text-right" inputMode="decimal" value={effective}
                            placeholder="—"
                            onChange={(e) => setDraft({ ...draft, [l.id]: e.target.value })}
                          />
                        ) : qty(l.recount_qty ?? l.counted_qty)}
                      </td>
                      {!c.blindActive && (
                        <td className={`text-right font-medium ${
                          variance == null || variance === 0 ? "" : variance < 0 ? "text-red-600" : "text-emerald-600"
                        }`}>
                          {variance == null ? "—" : qty(l.variance)}
                        </td>
                      )}
                      {!c.blindActive && <td className="text-right">{money(l.variance_value)}</td>}
                      {(editable || reviewing) && (
                        <td>
                          <Input
                            className="h-8" placeholder="rotura, robo…"
                            value={reasons[l.id] ?? l.reason ?? ""}
                            onChange={(e) => setReasons({ ...reasons, [l.id]: e.target.value })}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}

      {grouped.length === 0 && (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          Este conteo no tiene líneas en su alcance.
        </CardContent></Card>
      )}
    </div>
  );
}

/** Lo más valioso de una hoja de conteo: mercancía donde el sistema no esperaba nada. */
function FoundDialog({ countId, warehouseId }: { countId: number; warehouseId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ productId: "", locationId: "", countedQty: "", lotNo: "", expirationDate: "", unitCost: "" });

  const products = useQuery({
    queryKey: ["/api/products"],
    queryFn: () => apiRequest<any[]>("GET", "/api/products"),
    enabled: open,
  });
  const locations = useQuery({
    queryKey: ["/api/wms/locations", warehouseId],
    queryFn: () => wmsApi.locations(warehouseId),
    enabled: open,
  });

  const add = useMutation({
    mutationFn: () =>
      wmsApi.addFound(countId, {
        productId: Number(form.productId),
        locationId: form.locationId ? Number(form.locationId) : undefined,
        countedQty: form.countedQty,
        lotNo: form.lotNo || null,
        expirationDate: form.expirationDate || null,
        unitCost: form.unitCost || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/wms/counts", countId] });
      toast({ title: "Hallazgo agregado" });
      setForm({ productId: "", locationId: "", countedQty: "", lotNo: "", expirationDate: "", unitCost: "" });
      setOpen(false);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1"><Plus className="h-4 w-4" /> Encontré algo no listado</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mercancía no esperada</DialogTitle>
          <DialogDescription>
            Una cantidad esperada de cero contra una caja real: o es una recepción que nunca se
            registró, o un almacenaje en la ubicación equivocada.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Producto">
            <Select value={form.productId} onValueChange={(v) => setForm({ ...form, productId: v })}>
              <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {(products.data ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ubicación">
              <Select value={form.locationId} onValueChange={(v) => setForm({ ...form, locationId: v })}>
                <SelectTrigger><SelectValue placeholder="Ninguna" /></SelectTrigger>
                <SelectContent>
                  {(locations.data?.locations ?? []).map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>{l.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Cantidad">
              <Input value={form.countedQty} onChange={(e) => setForm({ ...form, countedQty: e.target.value })} inputMode="decimal" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Lote"><Input value={form.lotNo} onChange={(e) => setForm({ ...form, lotNo: e.target.value })} /></Field>
            <Field label="Vence"><Input type="date" value={form.expirationDate} onChange={(e) => setForm({ ...form, expirationDate: e.target.value })} /></Field>
            <Field label="Costo unit."><Input value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} placeholder="auto" /></Field>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => add.mutate()} disabled={!form.productId || !form.countedQty || add.isPending}>
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApplyDialog({ count, onConfirm, pending }: { count: any; onConfirm: () => void; pending: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1"><CheckCircle2 className="h-4 w-4" /> Aplicar y rectificar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aplicar el conteo {count.count_no}</DialogTitle>
          <DialogDescription>
            Esto corrige las existencias por ubicación y contabiliza la diferencia. Es la única
            acción de todo el proceso que mueve dinero, y no se deshace: para corregirla se hace
            otro conteo.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border p-3 text-sm space-y-1">
          <Row label="Líneas con diferencia" value={String(count.variance_lines)} />
          <Row label="Sobrantes (a otros ingresos)" value={money(count.surplus_value)} />
          <Row label="Faltantes (a gasto por faltante)" value={money(count.shortage_value)} />
          <Row label="Efecto neto en resultados" value={money(count.net_value)} strong />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={() => { onConfirm(); setOpen(false); }} disabled={pending}>
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ onConfirm }: { onConfirm: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="gap-1 text-muted-foreground">
          <XCircle className="h-4 w-4" /> Cancelar conteo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Cancelar el conteo</DialogTitle></DialogHeader>
        <Field label="Motivo">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </Field>
        <DialogFooter>
          <Button
            variant="destructive" disabled={!reason}
            onClick={() => { onConfirm(reason); setOpen(false); }}
          >
            Cancelar conteo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── piezas compartidas ───────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-sm">{label}</Label>{children}</div>;
}

function ToggleRow({
  label, hint, checked, onChange,
}: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Metric({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}
