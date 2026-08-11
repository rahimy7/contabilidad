import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { wmsApi, type WarehouseLocationRow } from "@/lib/accounting-api";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  MapPin, Plus, Grid3x3, Trash2, ArrowLeftRight, AlertTriangle, Clock,
  PackageSearch, Route, ScanBarcode,
} from "lucide-react";

const money = (v: string | number) =>
  Number(v ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (v: string | number) => Number(v ?? 0).toLocaleString("es-DO", { maximumFractionDigits: 4 });

/**
 * Ubicaciones tipo WMS por almacén.
 *
 * El almacén decide si las usa. Apagado, esta pantalla explica qué se gana y
 * ofrece encenderlo; encendido, es el mapa de la bodega: qué hay en cada
 * estante, qué está por vencer y en qué orden se despacha.
 */
const LOCATION_KINDS: { value: string; label: string; hint: string }[] = [
  { value: "picking", label: "Picking", hint: "La cara de donde se despacha" },
  { value: "bulk", label: "Reserva", hint: "Racking / sobrestock que repone al picking" },
  { value: "receiving", label: "Recepción", hint: "Muelle de entrada y devoluciones" },
  { value: "staging", label: "Preparación", hint: "Pedidos armados esperando salida" },
  { value: "quarantine", label: "Cuarentena", hint: "Retenido: nunca se despacha en una venta" },
  { value: "damaged", label: "Averías", hint: "Merma pendiente de dar de baja" },
];

const kindLabel = (k: string) => LOCATION_KINDS.find((x) => x.value === k)?.label ?? k;

export default function WarehouseLocationsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [warehouseId, setWarehouseId] = useState<number | null>(null);

  const warehouses = useQuery({
    queryKey: ["/api/warehouses"],
    queryFn: () => apiRequest<any[]>("GET", "/api/warehouses"),
  });
  const list: any[] = Array.isArray(warehouses.data) ? warehouses.data : (warehouses.data as any)?.warehouses ?? [];
  const active = warehouseId ?? list.find((w) => w.isDefault)?.id ?? list[0]?.id ?? null;
  const activeWarehouse = list.find((w) => w.id === active);

  const config = useQuery({
    queryKey: ["/api/wms/config", active],
    queryFn: () => wmsApi.config(active!),
    enabled: !!active,
  });
  const wmsOn = config.data?.config.wmsEnabled === true;

  const locations = useQuery({
    queryKey: ["/api/wms/locations", active],
    queryFn: () => wmsApi.locations(active!, true),
    enabled: !!active && wmsOn,
  });

  const setConfig = useMutation({
    mutationFn: (body: any) => apiRequest("PUT", `/api/warehouses/${active}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/wms/config", active] });
      qc.invalidateQueries({ queryKey: ["/api/warehouses"] });
      toast({ title: "Configuración guardada" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <MapPin className="h-6 w-6" /> Ubicaciones de almacén
          </h1>
          <p className="text-sm text-muted-foreground">
            Dónde está físicamente cada cosa, y en qué orden sale.
          </p>
        </div>
        <Select value={active ? String(active) : ""} onValueChange={(v) => setWarehouseId(Number(v))}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Seleccione un almacén" /></SelectTrigger>
          <SelectContent>
            {list.map((w) => (
              <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!active && <EmptyCard text="Cree un almacén antes de definir ubicaciones." />}

      {active && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Configuración de {activeWarehouse?.name}</CardTitle>
            <CardDescription>
              Las ubicaciones son opcionales. Un almacén sin ellas sigue funcionando igual que
              siempre: la existencia vive en el almacén y punto.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <ToggleRow
              label="Usar ubicaciones (WMS)"
              hint="Cada unidad queda además en un estante identificado"
              checked={wmsOn}
              onChange={(v) => setConfig.mutate({ wmsEnabled: v })}
            />
            <div className="space-y-1">
              <Label className="text-sm">Orden de despacho</Label>
              <Select
                value={config.data?.config.rotationPolicy ?? "fifo"}
                onValueChange={(v) => setConfig.mutate({ rotationPolicy: v })}
                disabled={!wmsOn}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fifo">FIFO — sale primero lo más viejo</SelectItem>
                  <SelectItem value="fefo">FEFO — sale primero lo que vence antes</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Para perecederos no son lo mismo: lo primero que entró no siempre es lo primero que vence.
              </p>
            </div>
            <ToggleRow
              label="Exigir ubicación al recibir"
              hint="La recepción de compra no cierra sin decir en qué estante quedó"
              checked={config.data?.config.requireLocationOnReceipt === true}
              onChange={(v) => setConfig.mutate({ requireLocationOnReceipt: v })}
              disabled={!wmsOn}
            />
          </CardContent>
        </Card>
      )}

      {active && wmsOn && (
        <Tabs defaultValue="map">
          <TabsList>
            <TabsTrigger value="map">Mapa</TabsTrigger>
            <TabsTrigger value="stock">Existencia por ubicación</TabsTrigger>
            <TabsTrigger value="expiring">Por vencer</TabsTrigger>
            <TabsTrigger value="drift">Diferencias</TabsTrigger>
            <TabsTrigger value="moves">Movimientos</TabsTrigger>
          </TabsList>

          <TabsContent value="map" className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <LocationDialog warehouseId={active} />
              <GenerateDialog warehouseId={active} />
            </div>
            <LocationTable warehouseId={active} rows={locations.data?.locations ?? []} loading={locations.isLoading} />
          </TabsContent>

          <TabsContent value="stock"><LocationStock warehouseId={active} /></TabsContent>
          <TabsContent value="expiring"><ExpiringStock warehouseId={active} /></TabsContent>
          <TabsContent value="drift"><DriftReport warehouseId={active} /></TabsContent>
          <TabsContent value="moves"><MovesLog warehouseId={active} /></TabsContent>
        </Tabs>
      )}

      {active && !wmsOn && config.isFetched && (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <Grid3x3 className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="font-medium">Este almacén no usa ubicaciones</p>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">
              Actívelas para saber en qué estante quedó cada recepción, que la venta despache por
              FIFO o FEFO, y poder auditar el inventario ubicación por ubicación.
            </p>
            <Button onClick={() => setConfig.mutate({ wmsEnabled: true })}>Activar ubicaciones</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── mapa de ubicaciones ──────────────────────────────────────────────────────

function LocationTable({
  warehouseId, rows, loading,
}: { warehouseId: number; rows: WarehouseLocationRow[]; loading: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const remove = useMutation({
    mutationFn: (id: number) => wmsApi.deleteLocation(id),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["/api/wms/locations", warehouseId] });
      toast({
        title: r.deleted ? "Ubicación eliminada" : "Ubicación desactivada",
        description: r.deleted
          ? undefined
          : `Todavía tiene ${qty(r.remainingQty)} unidades; se desactivó para que no reciba más.`,
      });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  const filtered = useMemo(
    () => rows.filter((l) => `${l.code} ${l.name ?? ""}`.toLowerCase().includes(search.toLowerCase())),
    [rows, search],
  );

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">{rows.length} ubicaciones</CardTitle>
        <Input
          placeholder="Buscar código…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {loading ? <p className="text-sm text-muted-foreground">Cargando…</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="py-2">Código</th>
                <th>Tipo</th>
                <th>Ruta</th>
                <th className="text-right">Productos</th>
                <th className="text-right">Unidades</th>
                <th className="text-right">Valor</th>
                <th>Próximo vencimiento</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="py-2 font-mono font-medium">
                    {l.code}
                    {!l.is_active && <Badge variant="outline" className="ml-2">inactiva</Badge>}
                    {l.is_active && !l.is_pickable && <Badge variant="secondary" className="ml-2">no despacha</Badge>}
                    {l.name && <div className="text-xs text-muted-foreground font-sans">{l.name}</div>}
                  </td>
                  <td><Badge variant="outline">{kindLabel(l.kind)}</Badge></td>
                  <td className="text-muted-foreground flex items-center gap-1">
                    <Route className="h-3 w-3" /> {l.pick_priority}
                  </td>
                  <td className="text-right">{l.product_count}</td>
                  <td className="text-right">{qty(l.total_qty)}</td>
                  <td className="text-right">{money(l.total_value)}</td>
                  <td className={l.next_expiration ? "text-amber-600" : "text-muted-foreground"}>
                    {l.next_expiration ?? "—"}
                  </td>
                  <td className="text-right">
                    <Button
                      size="icon" variant="ghost"
                      onClick={() => remove.mutate(l.id)}
                      title={Number(l.total_qty) > 0 ? "Desactivar (tiene existencia)" : "Eliminar"}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">Sin ubicaciones.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function LocationDialog({ warehouseId }: { warehouseId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "", name: "", kind: "picking", barcode: "", pickPriority: "100",
    isPickable: true, allowMixedProducts: true,
  });

  const create = useMutation({
    mutationFn: () =>
      wmsApi.createLocation({
        warehouseId, code: form.code, name: form.name || null, kind: form.kind,
        barcode: form.barcode || null, pickPriority: Number(form.pickPriority) || 100,
        isPickable: form.isPickable, allowMixedProducts: form.allowMixedProducts,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/wms/locations", warehouseId] });
      toast({ title: "Ubicación creada" });
      setForm({ ...form, code: "", name: "", barcode: "" });
      setOpen(false);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Nueva ubicación</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva ubicación</DialogTitle>
          <DialogDescription>
            El código es lo que se imprime en la etiqueta y se escanea. Puede ser tan simple
            como "NEVERA" o tan estructurado como "A-01-02-03".
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Código">
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="A-01-02" />
          </Field>
          <Field label="Nombre (opcional)">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Estante frente a caja" />
          </Field>
          <Field label="Tipo">
            <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LOCATION_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    <span className="font-medium">{k.label}</span>
                    <span className="text-muted-foreground"> — {k.hint}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Orden de ruta">
              <Input
                type="number" value={form.pickPriority}
                onChange={(e) => setForm({ ...form, pickPriority: e.target.value })}
              />
            </Field>
            <Field label="Código de barras">
              <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            </Field>
          </div>
          <ToggleRow
            label="Se despacha desde aquí" hint="Apáguelo para reserva o cuarentena"
            checked={form.isPickable} onChange={(v) => setForm({ ...form, isPickable: v })}
          />
          <ToggleRow
            label="Admite varios productos" hint="Una ubicación de un solo producto se cuenta más rápido"
            checked={form.allowMixedProducts} onChange={(v) => setForm({ ...form, allowMixedProducts: v })}
          />
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={!form.code || create.isPending}>Crear</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Etiquetar una bodega racked a mano son 300 formularios iguales y un error en el medio. */
function GenerateDialog({ warehouseId }: { warehouseId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ zones: "A,B", aisles: "01-04", racks: "", levels: "1-3", positions: "" });

  const preview = useMemo(() => {
    const parts = [expand(form.zones), expand(form.aisles), expand(form.racks), expand(form.levels), expand(form.positions)]
      .filter((p) => p.length > 0);
    const total = parts.reduce((acc, p) => acc * p.length, 1);
    const first = parts.map((p) => p[0]).join("-");
    const last = parts.map((p) => p[p.length - 1]).join("-");
    return { total, first, last };
  }, [form]);

  const generate = useMutation({
    mutationFn: () =>
      wmsApi.generateLocations({
        warehouseId,
        zones: expand(form.zones), aisles: expand(form.aisles),
        racks: expand(form.racks), levels: expand(form.levels), positions: expand(form.positions),
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["/api/wms/locations", warehouseId] });
      toast({
        title: `${r.created} ubicaciones creadas`,
        description: r.skipped > 0 ? `${r.skipped} ya existían y se dejaron como estaban.` : undefined,
      });
      setOpen(false);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1"><Grid3x3 className="h-4 w-4" /> Generar en lote</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generar ubicaciones</DialogTitle>
          <DialogDescription>
            Use listas separadas por coma (A,B,C) o rangos (01-12). Se crean en orden de recorrido,
            así la lista del pickeador ya sale ordenada.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Zonas"><Input value={form.zones} onChange={(e) => setForm({ ...form, zones: e.target.value })} placeholder="A,B" /></Field>
          <Field label="Pasillos"><Input value={form.aisles} onChange={(e) => setForm({ ...form, aisles: e.target.value })} placeholder="01-04" /></Field>
          <Field label="Racks (opcional)"><Input value={form.racks} onChange={(e) => setForm({ ...form, racks: e.target.value })} /></Field>
          <Field label="Niveles (opcional)"><Input value={form.levels} onChange={(e) => setForm({ ...form, levels: e.target.value })} placeholder="1-3" /></Field>
          <Field label="Posiciones (opcional)"><Input value={form.positions} onChange={(e) => setForm({ ...form, positions: e.target.value })} /></Field>
          <div className="rounded-md bg-muted p-3 text-sm">
            Se crearán <span className="font-semibold">{preview.total}</span> ubicaciones,
            desde <span className="font-mono">{preview.first}</span> hasta <span className="font-mono">{preview.last}</span>.
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => generate.mutate()} disabled={generate.isPending || preview.total === 0}>
            Generar {preview.total}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "A,B" → [A,B];  "01-04" → [01,02,03,04];  "" → []. */
function expand(spec: string): string[] {
  const out: string[] = [];
  for (const chunk of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const range = chunk.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])];
      const width = range[1].length;
      for (let i = from; i <= to; i++) out.push(String(i).padStart(width, "0"));
    } else {
      out.push(chunk.toUpperCase());
    }
  }
  return out;
}

// ── existencia por ubicación ─────────────────────────────────────────────────

function LocationStock({ warehouseId }: { warehouseId: number }) {
  const stock = useQuery({
    queryKey: ["/api/wms/stock", warehouseId],
    queryFn: () => wmsApi.stock(warehouseId),
  });
  const rows = stock.data?.stock ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <PackageSearch className="h-4 w-4" /> Existencia por ubicación
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b">
            <tr>
              <th className="py-2">Ubicación</th><th>Producto</th><th>Lote</th><th>Vence</th>
              <th className="text-right">Cantidad</th><th className="text-right">Costo unit.</th>
              <th className="text-right">Valor</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((s: any) => (
              <tr key={s.id} className="border-b last:border-0">
                <td className="py-2 font-mono">{s.location_code}</td>
                <td>{s.product_name ?? `#${s.product_id}`}<div className="text-xs text-muted-foreground">{s.sku}</div></td>
                <td className="font-mono text-xs">{s.lot_no ?? "—"}</td>
                <td className={expiryClass(s.days_to_expire)}>{s.expiration_date ?? "—"}</td>
                <td className="text-right">{qty(s.quantity)}</td>
                <td className="text-right">{money(s.unit_cost)}</td>
                <td className="text-right">{money(s.total_value)}</td>
                <td className="text-right"><MoveDialog warehouseId={warehouseId} placement={s} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">Nada ubicado todavía.</td></tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function MoveDialog({ warehouseId, placement }: { warehouseId: number; placement: any }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [toLocationId, setTo] = useState("");
  const [quantity, setQuantity] = useState(placement.available_qty);

  const locations = useQuery({
    queryKey: ["/api/wms/locations", warehouseId],
    queryFn: () => wmsApi.locations(warehouseId),
    enabled: open,
  });

  const move = useMutation({
    mutationFn: () =>
      wmsApi.move({ placementId: placement.id, toLocationId: Number(toLocationId), quantity: String(quantity) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/wms/stock", warehouseId] });
      qc.invalidateQueries({ queryKey: ["/api/wms/locations", warehouseId] });
      toast({ title: "Movido", description: "El valor no cambia: sólo el estante." });
      setOpen(false);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Error", description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Mover a otra ubicación">
          <ArrowLeftRight className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mover de {placement.location_code}</DialogTitle>
          <DialogDescription>
            Mover entre ubicaciones no genera asiento: la mercancía vale lo mismo en otro estante.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Destino">
            <Select value={toLocationId} onValueChange={setTo}>
              <SelectTrigger><SelectValue placeholder="Ubicación destino" /></SelectTrigger>
              <SelectContent>
                {(locations.data?.locations ?? [])
                  .filter((l) => l.id !== placement.location_id)
                  .map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.code}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label={`Cantidad (disponible ${qty(placement.available_qty)})`}>
            <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={() => move.mutate()} disabled={!toLocationId || move.isPending}>Mover</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── vencimientos, diferencias y bitácora ─────────────────────────────────────

function ExpiringStock({ warehouseId }: { warehouseId: number }) {
  const [days, setDays] = useState(30);
  const q = useQuery({
    queryKey: ["/api/wms/expiring", warehouseId, days],
    queryFn: () => wmsApi.expiring(warehouseId, days),
  });
  const rows = q.data?.items ?? [];

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between gap-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" /> Vencidos y por vencer
        </CardTitle>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[7, 15, 30, 60, 90].map((d) => <SelectItem key={d} value={String(d)}>Próximos {d} días</SelectItem>)}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b">
            <tr><th className="py-2">Vence</th><th>Días</th><th>Ubicación</th><th>Producto</th><th>Lote</th>
              <th className="text-right">Cantidad</th><th className="text-right">Valor</th></tr>
          </thead>
          <tbody>
            {rows.map((r: any, i: number) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-2">{r.expiration_date}</td>
                <td>
                  {r.is_expired
                    ? <Badge variant="destructive">vencido</Badge>
                    : <Badge variant="outline">{r.days_to_expire} d</Badge>}
                </td>
                <td className="font-mono">{r.location_code}</td>
                <td>{r.product_name ?? `#${r.product_id}`}</td>
                <td className="font-mono text-xs">{r.lot_no ?? "—"}</td>
                <td className="text-right">{qty(r.quantity)}</td>
                <td className="text-right">{money(r.total_value)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">Nada vence en ese plazo.</td></tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function DriftReport({ warehouseId }: { warehouseId: number }) {
  const q = useQuery({
    queryKey: ["/api/wms/drift", warehouseId],
    queryFn: () => wmsApi.drift(warehouseId),
  });
  const rows = q.data?.differences ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> Ubicaciones vs. valuación
        </CardTitle>
        <CardDescription>
          Lo que dicen los estantes contra lo que dicen los libros. No se corrige solo a propósito:
          la diferencia se resuelve con un conteo físico, que deja constancia de cuál lado estaba mal.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {q.data?.reconciled ? (
          <p className="py-6 text-center text-muted-foreground">Todo cuadra.</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr><th className="py-2">Producto</th><th className="text-right">Ubicado</th>
                  <th className="text-right">Valuado</th><th className="text-right">Diferencia</th>
                  <th className="text-right">Valor</th></tr>
              </thead>
              <tbody>
                {rows.map((d: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2">{d.product_name ?? `#${d.product_id}`}</td>
                    <td className="text-right">{qty(d.placed_qty)}</td>
                    <td className="text-right">{qty(d.valued_qty)}</td>
                    <td className={`text-right font-medium ${Number(d.difference) < 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {qty(d.difference)}
                    </td>
                    <td className="text-right">{money(d.value_difference)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-sm">
              Diferencia neta: <span className="font-semibold">{money(q.data?.netValueDifference ?? 0)}</span>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MovesLog({ warehouseId }: { warehouseId: number }) {
  const q = useQuery({
    queryKey: ["/api/wms/moves", warehouseId],
    queryFn: () => wmsApi.moves(warehouseId, { limit: 200 }),
  });
  const rows = q.data?.moves ?? [];
  const KIND: Record<string, string> = {
    putaway: "Almacenaje", pick: "Despacho", move: "Traslado interno",
    count_adjust: "Ajuste por conteo", return: "Devolución",
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ScanBarcode className="h-4 w-4" /> Bitácora de ubicaciones
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b">
            <tr><th className="py-2">Fecha</th><th>Tipo</th><th>Producto</th><th>Desde</th><th>Hacia</th>
              <th className="text-right">Cantidad</th><th>Origen</th><th>Usuario</th></tr>
          </thead>
          <tbody>
            {rows.map((m: any) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="py-2">{new Date(m.created_at).toLocaleString("es-DO")}</td>
                <td><Badge variant="outline">{KIND[m.kind] ?? m.kind}</Badge></td>
                <td>{m.product_name ?? `#${m.product_id}`}</td>
                <td className="font-mono">{m.from_location_code ?? "—"}</td>
                <td className="font-mono">{m.to_location_code ?? "—"}</td>
                <td className="text-right">{qty(m.quantity)}</td>
                <td className="text-xs text-muted-foreground">{m.source_type ? `${m.source_type} ${m.source_id ?? ""}` : "—"}</td>
                <td>{m.created_by_name ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">Sin movimientos.</td></tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ── piezas compartidas ───────────────────────────────────────────────────────

const expiryClass = (days: number | null) =>
  days == null ? "text-muted-foreground" : days < 0 ? "text-red-600 font-medium" : days <= 30 ? "text-amber-600" : "";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-sm">{label}</Label>{children}</div>;
}

function ToggleRow({
  label, hint, checked, onChange, disabled,
}: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border p-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return <Card><CardContent className="py-10 text-center text-muted-foreground">{text}</CardContent></Card>;
}
