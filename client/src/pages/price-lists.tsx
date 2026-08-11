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
import { Tags, Plus } from "lucide-react";

const TIER_LABELS: Record<string, string> = {
  retail: "Retail (B2C)",
  wholesale: "Mayorista (B2B)",
  distributor: "Distribuidor (B2B)",
  institutional: "Institucional",
  vip: "VIP",
  custom: "Personalizada",
};

const TIER_COLOR: Record<string, string> = {
  retail: "bg-blue-500",
  wholesale: "bg-purple-500",
  distributor: "bg-orange-500",
  institutional: "bg-teal-500",
  vip: "bg-yellow-500",
  custom: "bg-gray-500",
};

export default function PriceListsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "", name: "", tier: "wholesale",
    currency: "DOP", defaultDiscountPercent: 0,
    isDefaultForTier: false,
  });

  const { data } = useQuery({
    queryKey: ["/api/price-lists"],
    queryFn: () => apiRequest("GET", "/api/price-lists"),
  });

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/price-lists", form),
    onSuccess: () => {
      toast({ title: "Lista creada" });
      setOpen(false);
      setForm({ code: "", name: "", tier: "wholesale", currency: "DOP", defaultDiscountPercent: 0, isDefaultForTier: false });
      qc.invalidateQueries({ queryKey: ["/api/price-lists"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Tags className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Listas de Precios</h1>
            <p className="text-muted-foreground">Precios diferenciados por segmento B2B/B2C</p>
          </div>
        </div>
        <Button onClick={() => setOpen(true)} data-testid="button-new-price-list">
          <Plus className="w-4 h-4 mr-2" /> Nueva lista
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listas activas</CardTitle>
          <CardDescription>El motor de precios elige la lista según el cliente y aplica descuentos en cascada</CardDescription>
        </CardHeader>
        <CardContent>
          {data?.rows?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Nivel</TableHead>
                  <TableHead className="text-right">Descuento default</TableHead>
                  <TableHead>Vigencia</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.code}</TableCell>
                    <TableCell className="font-medium">{l.name}</TableCell>
                    <TableCell>
                      <Badge className={`${TIER_COLOR[l.tier]} text-white`}>
                        {TIER_LABELS[l.tier] ?? l.tier}
                      </Badge>
                      {l.isDefaultForTier && <Badge variant="outline" className="ml-1 text-xs">default</Badge>}
                    </TableCell>
                    <TableCell className="text-right font-mono">{l.defaultDiscountPct}%</TableCell>
                    <TableCell className="text-xs">{l.validFrom} → {l.validTo ?? "sin fin"}</TableCell>
                    <TableCell>{l.isActive ? <Badge>Activa</Badge> : <Badge variant="secondary">Inactiva</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">No hay listas de precios definidas</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva lista de precios</DialogTitle>
            <DialogDescription>Configura precios por segmento de cliente</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Código *</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="WHOLESALE-01" />
              </div>
              <div>
                <Label>Nivel</Label>
                <Select value={form.tier} onValueChange={(v) => setForm({ ...form, tier: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIER_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mayorista general" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Moneda</Label>
                <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
              </div>
              <div>
                <Label>% descuento default</Label>
                <Input type="number" value={form.defaultDiscountPercent} onChange={(e) => setForm({ ...form, defaultDiscountPercent: Number(e.target.value) })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isDefaultForTier} onChange={(e) => setForm({ ...form, isDefaultForTier: e.target.checked })} />
              Default para este nivel
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={!form.code || !form.name || create.isPending}>
              Crear lista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
