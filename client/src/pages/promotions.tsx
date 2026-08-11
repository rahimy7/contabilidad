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
import { Tag, Plus } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  percent_off: "Descuento %",
  amount_off: "Descuento fijo",
  bogo: "Compra X lleva Y",
  bundle: "Combo",
  gift: "Regalo",
  free_shipping: "Envío gratis",
};

const APPLIES_LABELS: Record<string, string> = {
  product: "Producto", category: "Categoría", order: "Orden",
};

const money = (v: string | number) =>
  Number(v || 0).toLocaleString("es-DO", { minimumFractionDigits: 2 });

export default function PromotionsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [form, setForm] = useState({
    code: "", name: "", description: "",
    promotionType: "percent_off",
    discountPercent: 10,
    discountAmount: 0,
    appliesTo: "order",
    validFrom: new Date().toISOString().slice(0, 10),
    validTo: "",
    couponCode: "",
    requiresCouponCode: false,
    isExclusive: false,
  });

  const { data } = useQuery({
    queryKey: ["/api/promotions", activeOnly],
    queryFn: () => apiRequest("GET", `/api/promotions?active=${activeOnly}`),
  });

  const create = useMutation({
    mutationFn: () => {
      const payload: any = {
        code: form.code, name: form.name, description: form.description,
        promotionType: form.promotionType,
        appliesTo: form.appliesTo,
        validFrom: form.validFrom,
        requiresCouponCode: form.requiresCouponCode,
        isExclusive: form.isExclusive,
      };
      if (form.promotionType === "percent_off") payload.discountPercent = Number(form.discountPercent);
      if (form.promotionType === "amount_off") payload.discountAmount = Number(form.discountAmount);
      if (form.validTo) payload.validTo = form.validTo;
      if (form.couponCode) payload.couponCode = form.couponCode;
      return apiRequest("POST", "/api/promotions", payload);
    },
    onSuccess: () => {
      toast({ title: "Promoción creada" });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["/api/promotions"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Tag className="w-8 h-8 text-purple-500" />
          <div>
            <h1 className="text-2xl font-bold">Promociones</h1>
            <p className="text-muted-foreground">Descuentos, cupones, BOGO, bundles</p>
          </div>
        </div>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            Solo vigentes
          </label>
          <Button onClick={() => setOpen(true)} data-testid="button-new-promo">
            <Plus className="w-4 h-4 mr-2" /> Nueva promoción
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Promociones</CardTitle>
          <CardDescription>El motor de precios las aplica automáticamente sobre la lista + cliente + volumen</CardDescription>
        </CardHeader>
        <CardContent>
          {data?.rows?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Aplica a</TableHead>
                  <TableHead className="text-right">Descuento</TableHead>
                  <TableHead>Vigencia</TableHead>
                  <TableHead>Usos</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.code}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell><Badge variant="outline">{TYPE_LABELS[p.promotionType] ?? p.promotionType}</Badge></TableCell>
                    <TableCell>{APPLIES_LABELS[p.appliesTo] ?? p.appliesTo}</TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(p.discountPercent) > 0 ? `${p.discountPercent}%` : `RD$ ${money(p.discountAmount)}`}
                    </TableCell>
                    <TableCell className="text-xs">{p.validFrom} → {p.validTo ?? "sin fin"}</TableCell>
                    <TableCell className="text-xs">{p.currentUses}{p.maxUses ? ` / ${p.maxUses}` : ""}</TableCell>
                    <TableCell>{p.isActive ? <Badge>Activa</Badge> : <Badge variant="secondary">Inactiva</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">No hay promociones definidas</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva promoción</DialogTitle>
            <DialogDescription>Define descuentos automáticos o con cupón</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Código *</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="BLACKFRIDAY26" />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={form.promotionType} onValueChange={(v) => setForm({ ...form, promotionType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Black Friday 2026" />
            </div>
            <div>
              <Label>Descripción</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {form.promotionType === "percent_off" ? (
                <div>
                  <Label>% descuento</Label>
                  <Input type="number" value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: Number(e.target.value) })} />
                </div>
              ) : (
                <div>
                  <Label>Monto descuento</Label>
                  <Input type="number" value={form.discountAmount} onChange={(e) => setForm({ ...form, discountAmount: Number(e.target.value) })} />
                </div>
              )}
              <div>
                <Label>Aplica a</Label>
                <Select value={form.appliesTo} onValueChange={(v) => setForm({ ...form, appliesTo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(APPLIES_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vigente desde *</Label>
                <Input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
              </div>
              <div>
                <Label>Vigente hasta</Label>
                <Input type="date" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Código de cupón (opcional)</Label>
              <Input value={form.couponCode} onChange={(e) => setForm({ ...form, couponCode: e.target.value })} placeholder="Vacío = descuento automático" />
            </div>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.requiresCouponCode} onChange={(e) => setForm({ ...form, requiresCouponCode: e.target.checked })} />
                Requiere cupón
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.isExclusive} onChange={(e) => setForm({ ...form, isExclusive: e.target.checked })} />
                Exclusiva (no combinable)
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={!form.code || !form.name || create.isPending}>
              Crear promoción
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
